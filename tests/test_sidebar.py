from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from fastapi.testclient import TestClient

from botapp.main import create_app
from botapp.sidebar import DEFAULT_PREFERENCE, update_bot_sidebar


def session(directory):
    app = create_app(directory, runtime_enabled=False)
    client = TestClient(app)
    password = (directory / "bootstrap-password.txt").read_text().strip()
    assert client.post("/api/auth/login", json={"password": password}).status_code == 200
    return app, client


def test_sidebar_is_private_and_survives_reopening(tmp_path):
    app = create_app(tmp_path, runtime_enabled=False)
    public = TestClient(app)
    assert public.get("/api/sidebar").status_code == 401
    assert public.post("/api/bot-groups", json={"name": "私有"}).status_code == 401
    app, client = session(tmp_path)
    bots = client.get("/api/bots").json()
    primary, other = bots[0], bots[1]
    initial = client.get("/api/sidebar")
    assert initial.headers["cache-control"] == "no-store"
    assert initial.json() == {"bots": {b["id"]: DEFAULT_PREFERENCE for b in bots}, "groups": []}
    group = client.post("/api/bot-groups", json={"name": "  学习  "}).json()
    changes = {"pinned": True, "hidden": True, "unread": True, "group_id": group["id"]}
    response = client.patch(f'/api/bots/{other["id"]}/sidebar', json=changes)
    assert response.status_code == 200 and response.json() == {"bot_id": other["id"], **changes}
    assert client.patch(f'/api/bots/{primary["id"]}/sidebar', json={"hidden": True}).status_code == 409
    assert client.patch(f'/api/bots/{other["id"]}/sidebar', json={"hidden": False}, headers={"Origin": "https://evil.invalid"}).status_code == 403
    _, reopened = session(tmp_path)
    assert reopened.get("/api/sidebar").json()["bots"][other["id"]] == changes
    assert reopened.get("/api/sidebar").json()["groups"] == [group]
    assert reopened.patch(f'/api/bots/{other["id"]}/sidebar', json={"unread": False}).json()["pinned"] is True


def test_invalid_sidebar_updates_do_not_change_saved_preferences(tmp_path):
    _, client = session(tmp_path)
    bot_id = client.get("/api/bots").json()[1]["id"]
    path = f"/api/bots/{bot_id}/sidebar"
    client.patch(path, json={"pinned": True})
    old = client.get("/api/sidebar").json()
    invalid = [{"pinned": 1}, {"unread": "yes"}, {"hidden": None}, {"group_id": 12},
               {"group_id": "missing", "pinned": False}, {"name": "unsupported"}]
    for payload in invalid:
        assert client.patch(path, json=payload).status_code in (404, 422)
        assert client.get("/api/sidebar").json() == old
    assert client.patch("/api/bots/missing/sidebar", json={"pinned": True}).status_code == 404


def test_groups_can_be_renamed_and_removed_without_deleting_bot_data(tmp_path):
    app, client = session(tmp_path)
    bot = client.get("/api/bots").json()[1]
    created = client.post("/api/bot-groups", json={"name": "Study"})
    assert created.status_code == 201
    group = created.json()
    path = f'/api/bot-groups/{group["id"]}'
    assert client.post("/api/bot-groups", json={"name": " study "}).status_code == 409
    for payload in ({"name": " "}, {"name": "组" * 41}, {"name": "新组", "extra": True}):
        assert client.post("/api/bot-groups", json=payload).status_code == 422
    client.patch(f'/api/bots/{bot["id"]}/sidebar', json={"pinned": True, "group_id": group["id"]})
    app.state.store.add_message(bot["conversation_id"], bot["id"], "assistant", "需要保留的对话")
    assert client.patch(path, json={"name": "课程"}).json() == {"id": group["id"], "name": "课程"}
    assert client.delete(path).json() == {"ok": True}
    state = client.get("/api/sidebar").json()
    assert state["groups"] == []
    assert state["bots"][bot["id"]] == {**DEFAULT_PREFERENCE, "pinned": True}
    assert client.get(f'/api/conversations/{bot["conversation_id"]}/messages').json()[0]["content"] == "需要保留的对话"
    assert any(b["id"] == bot["id"] for b in client.get("/api/bots").json())
    assert client.delete(path).status_code == 404
    assert client.patch(path, json={"name": "不存在"}).status_code == 404
    assert client.delete(f'/api/bots/{bot["id"]}').status_code == 200
    assert bot["id"] not in client.get("/api/sidebar").json()["bots"]


def test_simultaneous_updates_preserve_independent_fields(tmp_path):
    app, client = session(tmp_path)
    bot_id = client.get("/api/bots").json()[1]["id"]
    barrier = Barrier(2)

    def write(payload):
        barrier.wait()
        return update_bot_sidebar(app.state.store, bot_id, payload)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(write, {"pinned": True})
        second = pool.submit(write, {"unread": True})
        first.result()
        second.result()
    preference = client.get("/api/sidebar").json()["bots"][bot_id]
    assert preference == {**DEFAULT_PREFERENCE, "pinned": True, "unread": True}


def test_group_limit_and_new_primary_visibility(tmp_path):
    _, client = session(tmp_path)
    bot_id = client.get("/api/bots").json()[1]["id"]
    assert client.patch(f"/api/bots/{bot_id}/sidebar", json={"hidden": True}).status_code == 200
    assert client.post(f"/api/bots/{bot_id}/primary").status_code == 200
    assert client.get("/api/sidebar").json()["bots"][bot_id]["hidden"] is False
    assert client.patch(f"/api/bots/{bot_id}/sidebar", json={"hidden": True}).status_code == 409
    for number in range(30):
        assert client.post("/api/bot-groups", json={"name": f"分组 {number}"}).status_code == 201
    assert client.post("/api/bot-groups", json={"name": "超过上限"}).status_code == 409
    assert len(client.get("/api/sidebar").json()["groups"]) == 30
