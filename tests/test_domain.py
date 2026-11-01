import json
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from botapp.domain import install_routes
from botapp.store import Store, decode_row


class FakeRuntime:
    """Control-plane double only: no generated chat replies or browser actions."""
    def __init__(self, store):
        self.store = store
        self.notifications = 0
        self.calls = []

    async def notify(self):
        self.notifications += 1

    def change(self, task_id, **changes):
        self.store.execute("UPDATE tasks SET " + ",".join(k + "=?" for k in changes) + " WHERE id=?", (*changes.values(), task_id))
        return self.store.one("SELECT * FROM tasks WHERE id=?", (task_id,))

    async def stop_task(self, task_id):
        self.calls.append(("stop", task_id))
        return self.change(task_id, status="paused", stop_requested=1)

    async def resume_task(self, task_id, message=None):
        self.calls.append(("resume", task_id, message))
        return self.change(task_id, status="queued", stop_requested=0)

    async def approve_task(self, task_id, allow):
        self.calls.append(("approval", task_id, allow))
        return self.change(task_id, status="queued" if allow else "paused")

    async def set_takeover(self, task_id, enabled):
        self.calls.append(("takeover", task_id, enabled))
        return self.change(task_id, takeover=int(enabled))


@pytest.fixture
def api(tmp_path):
    store = Store(tmp_path)
    runtime = FakeRuntime(store)
    app = FastAPI()
    install_routes(app, store, runtime)
    with TestClient(app) as client:
        yield client, store, runtime


def test_store_defaults_and_restart_do_not_replay_running_work(tmp_path):
    store = Store(tmp_path)
    bot = store.one("SELECT * FROM bots WHERE is_primary=1")
    conversation = store.one("SELECT * FROM conversations WHERE kind='direct' AND members=?", (json.dumps([bot["id"]], separators=(",", ":")),))
    task = store.create_task(conversation["id"], bot["id"], "操作已到中途", source={"file_ids": []})
    queued = store.create_task(conversation["id"], bot["id"], "尚未开始")
    store.execute("UPDATE tasks SET status='running',context=? WHERE id=?", ('{"pending_action":{"name":"click"}}', task["id"]))
    ids = {b["id"] for b in store.all("SELECT * FROM bots")}
    reopened = Store(tmp_path)
    assert ids == {b["id"] for b in reopened.all("SELECT * FROM bots")}
    restored = decode_row(reopened.one("SELECT * FROM tasks WHERE id=?", (task["id"],)))
    assert restored["status"] == "paused" and restored["stop_requested"]
    assert restored["context"]["pending_action"]["name"] == "click"
    assert reopened.one("SELECT status FROM tasks WHERE id=?", (queued["id"],))["status"] == "queued"
    assert reopened.one("SELECT * FROM events WHERE task_id=? AND kind='recovered_paused'", (task["id"],))


def test_bot_crud_primary_and_direct_conversation(api):
    client, store, _ = api
    bots = client.get("/api/bots").json()
    assert len(bots) == 3 and sum(b["is_primary"] for b in bots) == 1
    new = client.post("/api/bots", json={"name": "小助理", "role": "整理资料", "color": "#8844ff"})
    assert new.status_code == 201
    bot = new.json()
    assert bot["conversation_id"]
    assert client.post(f"/api/bots/{bot['id']}/primary").json()["is_primary"] is True
    assert sum(b["is_primary"] for b in client.get("/api/bots").json()) == 1
    renamed = client.patch(f"/api/bots/{bot['id']}", json={"name": "资料员"}).json()
    conversation = next(c for c in client.get("/api/conversations").json() if c["id"] == renamed["conversation_id"])
    assert conversation["title"] == "资料员"
    assert client.patch(f"/api/bots/{bot['id']}", json={"color": "red"}).status_code == 422
    assert client.delete(f"/api/bots/{bot['id']}").json() == {"ok": True}
    assert store.one("SELECT count(*) AS n FROM bots WHERE is_primary=1")["n"] == 1
    remaining = client.get("/api/bots").json()
    for row in remaining[:-1]:
        assert client.delete(f"/api/bots/{row['id']}").status_code == 200
    assert client.delete(f"/api/bots/{remaining[-1]['id']}").status_code == 409


@pytest.mark.parametrize("status", ["queued", "paused", "running", "waiting_config", "waiting_user", "waiting_approval"])
def test_delete_bot_preserves_unfinished_work(api, status):
    client, store, _ = api
    bot = client.get("/api/bots").json()[1]
    task = store.create_task(bot["conversation_id"], bot["id"], "尚未完成的任务")
    store.execute("UPDATE tasks SET status=? WHERE id=?", (status, task["id"]))
    store.add_message(bot["conversation_id"], bot["id"], "user", "需要保留的消息", task_id=task["id"])
    response = client.delete(f"/api/bots/{bot['id']}")
    assert response.status_code == 409
    assert response.json()["detail"] == "这个 Bot 还有未结束的任务，请先停止任务再删除"
    assert store.one("SELECT status FROM tasks WHERE id=?", (task["id"],))["status"] == status
    assert any(b["id"] == bot["id"] for b in client.get("/api/bots").json())
    assert client.get(f"/api/conversations/{bot['conversation_id']}/messages").json()[0]["content"] == "需要保留的消息"


@pytest.mark.parametrize("status", ["succeeded", "failed", "cancelled"])
def test_delete_primary_bot_with_finished_work_keeps_primary_fallback(api, status):
    client, store, _ = api
    primary = client.get("/api/bots").json()[0]
    assert primary["is_primary"]
    task = store.create_task(primary["conversation_id"], primary["id"], "已经结束的任务")
    store.execute("UPDATE tasks SET status=? WHERE id=?", (status, task["id"]))
    assert client.delete(f"/api/bots/{primary['id']}").json() == {"ok": True}
    assert store.one("SELECT * FROM tasks WHERE id=?", (task["id"],)) is None
    assert store.one("SELECT * FROM conversations WHERE id=?", (primary["conversation_id"],)) is None
    remaining = client.get("/api/bots").json()
    assert len(remaining) == 2 and sum(bot["is_primary"] for bot in remaining) == 1


@pytest.mark.parametrize("status", ["cancelled", "succeeded"])
def test_delete_bot_waits_for_terminal_task_worker_cleanup(api, status):
    client, store, runtime = api
    bot = client.get("/api/bots").json()[1]
    task = store.create_task(bot["conversation_id"], bot["id"], "已结束但仍在收尾")
    store.execute("UPDATE tasks SET status=? WHERE id=?", (status, task["id"]))
    runtime._active_id = task["id"]
    response = client.delete(f"/api/bots/{bot['id']}")
    assert response.status_code == 409
    assert response.json()["detail"] == "任务正在收尾，请稍后再删除"
    assert store.one("SELECT id FROM tasks WHERE id=?", (task["id"],))
    runtime._active_id = None
    assert client.delete(f"/api/bots/{bot['id']}").json() == {"ok": True}
    assert store.one("SELECT id FROM tasks WHERE id=?", (task["id"],)) is None


def test_delete_parent_bot_waits_for_active_child_cleanup_on_another_bot(api):
    client, store, runtime = api
    parent_bot, child_bot, unrelated_bot = client.get("/api/bots").json()
    parent = store.create_task(parent_bot["conversation_id"], parent_bot["id"], "主管的任务")
    child = store.create_task(parent_bot["conversation_id"], child_bot["id"], "其他 Bot 的子任务", parent_id=parent["id"])
    store.execute("UPDATE tasks SET status='cancelled' WHERE id IN (?,?)", (parent["id"], child["id"]))
    runtime._active_id = child["id"]
    response = client.delete(f"/api/bots/{parent_bot['id']}")
    assert response.status_code == 409
    assert response.json()["detail"] == "任务正在收尾，请稍后再删除"
    assert store.one("SELECT id FROM tasks WHERE id=?", (parent["id"],))
    assert store.one("SELECT parent_id FROM tasks WHERE id=?", (child["id"],))["parent_id"] == parent["id"]
    # Cleanup on an independent Bot must not block unrelated contact deletion.
    assert client.delete(f"/api/bots/{unrelated_bot['id']}").status_code == 200
    runtime._active_id = None
    assert client.delete(f"/api/bots/{parent_bot['id']}").json() == {"ok": True}
    assert store.one("SELECT id FROM tasks WHERE id=?", (parent["id"],)) is None


def test_group_send_persists_message_and_queued_task_atomically(api):
    client, store, runtime = api
    bots = client.get("/api/bots").json()
    members = [b["id"] for b in bots[:2]]
    group = client.post("/api/conversations", json={"kind": "group", "members": members, "title": "一起研究"}).json()
    assert group["members"] == members
    result = client.post(f"/api/conversations/{group['id']}/messages", json={"content": f"@{bots[1]['name']} 查资料"})
    assert result.status_code == 201
    data = result.json()
    assert data["message"]["role"] == "user"
    assert data["message"]["metadata"] == {"file_ids": []}
    assert data["task"]["status"] == "queued" and data["task"]["bot_id"] == bots[1]["id"]
    assert data["task"]["source"]["group"] is True and data["task"]["context"] == {}
    assert runtime.notifications == 1
    bad = client.post(f"/api/conversations/{group['id']}/messages", json={"content": "附件不存在", "file_ids": ["missing"]})
    assert bad.status_code == 404
    assert len(client.get(f"/api/conversations/{group['id']}/messages").json()) == 1
    assert client.post("/api/conversations", json={"kind": "group", "members": members[:1]}).status_code == 422


def test_memory_scopes_and_clear_history_preserve_memory(api):
    client, store, _ = api
    first, second = client.get("/api/bots").json()[:2]
    shared = client.post("/api/memories", json={"content": "时区：上海", "bot_id": None}).json()
    own = client.post("/api/memories", json={"content": "研究偏好", "bot_id": first["id"]}).json()
    client.post("/api/memories", json={"content": "别的角色的记录", "bot_id": second["id"]})
    visible = client.get("/api/memories", params={"bot_id": first["id"]}).json()
    assert {m["id"] for m in visible} == {shared["id"], own["id"]}
    assert client.patch(f"/api/memories/{own['id']}", json={"content": "更新偏好"}).json()["content"] == "更新偏好"
    sent = client.post(f"/api/conversations/{first['conversation_id']}/messages", json={"content": "暂未执行"}).json()
    assert client.delete(f"/api/conversations/{first['conversation_id']}/messages").status_code == 200
    assert client.get(f"/api/conversations/{first['conversation_id']}/messages").json() == []
    assert len(client.get("/api/memories").json()) == 3
    assert store.one("SELECT status FROM tasks WHERE id=?", (sent["task"]["id"],))["status"] == "cancelled"
    assert client.post(f"/api/tasks/{sent['task']['id']}/resume", json={}).status_code == 409
    assert client.delete(f"/api/memories/{own['id']}").status_code == 200


def test_correction_and_forget_invalidate_old_context_in_the_right_scope(api):
    client, store, _ = api
    first, second = client.get("/api/bots").json()[:2]
    private = client.post("/api/memories", json={"content": "旧事实", "bot_id": first["id"]}).json()
    before = time.time()
    assert store.get_memory_epoch(first["id"]) == 0
    assert client.patch(f"/api/memories/{private['id']}", json={"content": "纠正后的事实"}).status_code == 200
    corrected = store.get_memory_epoch(first["id"])
    assert corrected >= before
    assert store.get_memory_epoch(second["id"]) == 0
    assert client.delete(f"/api/memories/{private['id']}").status_code == 200
    assert store.get_memory_epoch(first["id"]) > corrected
    shared = client.post("/api/memories", json={"content": "共享旧事实"}).json()
    assert client.delete(f"/api/memories/{shared['id']}").status_code == 200
    assert store.get_memory_epoch(second["id"]) > 0
    # Moving a fact out of a private scope also invalidates the receiving scope.
    moved = client.post("/api/memories", json={"content": "调整可见范围", "bot_id": first["id"]}).json()
    previous_shared = store.get_memory_epoch(None)
    assert client.patch(f"/api/memories/{moved['id']}", json={"bot_id": None}).status_code == 200
    assert store.get_memory_epoch(None) > previous_shared


def test_task_controls_use_runtime_and_decode_events(api):
    client, store, runtime = api
    bot = client.get("/api/bots").json()[0]
    task = client.post(f"/api/conversations/{bot['conversation_id']}/messages", json={"content": "执行"}).json()["task"]
    task_id = task["id"]
    assert client.post(f"/api/tasks/{task_id}/stop").json()["stop_requested"] is True
    assert client.post(f"/api/tasks/{task_id}/resume", json={"message": "改为先读取"}).json()["status"] == "queued"
    store.execute("UPDATE tasks SET status='waiting_approval' WHERE id=?", (task_id,))
    assert client.post(f"/api/tasks/{task_id}/resume", json={}).status_code == 409
    assert client.post(f"/api/tasks/{task_id}/approval", json={"allow": "yes"}).status_code == 422
    assert client.post(f"/api/tasks/{task_id}/approval", json={"allow": True}).status_code == 200
    assert client.post(f"/api/tasks/{task_id}/takeover", json={"enabled": True}).json()["takeover"] is True
    events = client.get(f"/api/tasks/{task_id}/events").json()
    assert isinstance(events[0]["detail"], dict)
    assert client.get(f"/api/tasks/{task_id}/events", params={"after": events[-1]["id"]}).json() == []
    assert ("resume", task_id, "改为先读取") in runtime.calls


def test_skill_versions_routine_validation_and_run_history(api):
    client, store, _ = api
    skill = client.post("/api/skills", json={"name": "检查网页", "content": "读取后核对来源"}).json()
    response = client.post("/api/routines", json={"name": "检查", "prompt": "运行检查", "kind": "agent", "schedule": "interval", "interval_seconds": 60, "skill_id": skill["id"]})
    assert response.status_code == 201
    routine = response.json()
    assert routine["enabled"] is True and routine["skill_snapshot"]["version"] == 1
    edited = client.patch(f"/api/skills/{skill['id']}", json={"content": "新方法"}).json()
    assert edited["version"] == 2
    # Updating the skill does not silently change a routine's reviewed recipe.
    assert client.get("/api/routines").json()[0]["skill_snapshot"]["content"] == "读取后核对来源"
    run = client.post(f"/api/routines/{routine['id']}/run").json()
    assert run["task_id"] and run["status"] == "queued"
    store.execute("UPDATE tasks SET status='failed',error='网站不可用' WHERE id=?", (run["task_id"],))
    history = client.get(f"/api/routines/{routine['id']}/runs").json()
    assert history[0]["status"] == "failed" and history[0]["error"] == "网站不可用"
    assert client.delete(f"/api/skills/{skill['id']}").status_code == 200
    paused = client.patch(f"/api/routines/{routine['id']}", json={"enabled": False}).json()
    assert paused["skill_snapshot"]["version"] == 1
    assert client.post("/api/routines", json={"prompt": "无效", "schedule": "interval", "interval_seconds": 59}).status_code == 422
    assert client.post("/api/routines", json={"prompt": "无效", "schedule": "daily", "time_of_day": "08:00", "timezone": "not-a-zone"}).status_code == 422
    assert client.post("/api/routines", json={"prompt": "无效", "kind": []}).status_code == 422


def test_mounted_prefix_keeps_authentication_and_origin_checks(tmp_path, monkeypatch):
    from botapp.main import create_app
    monkeypatch.setenv("BOT_BASE_PATH", "/deepseek")
    app = create_app(tmp_path, runtime_enabled=False)
    parent = FastAPI()
    parent.mount("/deepseek", app)
    with TestClient(parent) as client:
        assert client.get("/deepseek/api/bots").status_code == 401
        password = (tmp_path / "bootstrap-password.txt").read_text().strip()
        assert client.post("/deepseek/api/auth/login", json={"password": password}).status_code == 200
        assert client.post("/deepseek/api/bots", json={"name": "不能创建"}, headers={"Origin": "https://evil.invalid"}).status_code == 403
        assert client.get("/deepseek/api/bots").status_code == 200


def test_generated_workspace_outputs_download_but_private_files_do_not(tmp_path):
    from botapp.main import create_app
    app = create_app(tmp_path, runtime_enabled=False)
    store = app.state.store
    with TestClient(app) as client:
        password = (tmp_path / "bootstrap-password.txt").read_text().strip()
        assert client.post("/api/auth/login", json={"password": password}).status_code == 200
        bot = client.get("/api/bots").json()[0]
        task = store.create_task(bot["conversation_id"], bot["id"], "制作报告")
        result = app.state.runtime._write_file(task, {"path": "reports/result.txt", "content": "真实工作区成果"})
        downloaded = client.get(result["url"])
        assert downloaded.status_code == 200 and downloaded.text == "真实工作区成果"
        private = tmp_path / "private-placeholder.txt"
        private.write_text("不属于成果目录")
        store.execute("INSERT INTO files(id,name,path,mime,size,created_at) VALUES (?,?,?,?,?,?)", ("outside", "private-placeholder.txt", str(private), "text/plain", private.stat().st_size, time.time()))
        assert client.get("/api/files/outside/download").status_code == 404
