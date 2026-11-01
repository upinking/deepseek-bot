import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import json
import time

import httpx
import pytest

from botapp.runtime import MAX_STEPS, Runtime
from botapp.store import Store, dumps, uid


def tool(name, args, call_id="call-1"):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)}}


def answer(content=None, calls=None, usage=None):
    msg = {"role": "assistant", "content": content}
    if calls:
        msg["tool_calls"] = calls
    return {"message": msg, "usage": usage or {}, "finish_reason": "tool_calls" if calls else "stop"}


class Provider:
    def __init__(self, replies):
        self.replies = list(replies)
        self.requests = []

    async def complete(self, **kwargs):
        self.requests.append(deepcopy(kwargs))
        if not self.replies:
            raise AssertionError("unexpected model request")
        item = self.replies.pop(0)
        if isinstance(item, Exception):
            raise item
        if callable(item):
            return await item(**kwargs)
        return item


class Browser:
    def __init__(self):
        self.actions = []
        self.snapshots = 0
        self.label = "发送"

    async def task_snapshot(self, task_id):
        self.snapshots += 1
        return {"url": "https://example.com/", "title": "示例", "text": "网页正文",
                "elements": [{"ref": "p1-e1", "role": "button", "name": self.label,
                              "type": "submit", "sensitive": False}]}

    async def requires_approval(self, task_id, action, args):
        return action in {"click", "upload", "keypress"}

    async def action(self, task_id, action, args, manual=False):
        self.actions.append((task_id, action, deepcopy(args)))
        return await self.task_snapshot(task_id)


def setup(tmp_path, prompt="你好", *, key=True, kind="chat"):
    store = Store(tmp_path)
    store.api_key = "test-model-secret-123" if key else ""
    bot = store.one("SELECT * FROM bots WHERE is_primary=1")
    conv = store.one("SELECT * FROM conversations WHERE kind='direct' ORDER BY created_at LIMIT 1")
    task = store.create_task(conv["id"], bot["id"], prompt, kind=kind)
    return store, bot, conv, task


async def wait_for(store, task_id, states, timeout=4):
    stop = time.monotonic() + timeout
    while time.monotonic() < stop:
        task = store.one("SELECT * FROM tasks WHERE id=?", (task_id,))
        if task["status"] in states:
            return task
        await asyncio.sleep(0.01)
    raise AssertionError(store.one("SELECT * FROM tasks WHERE id=?", (task_id,)))


@pytest.mark.asyncio
async def test_missing_key_waits_without_fabricated_answer(tmp_path, monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    store, _, _, task = setup(tmp_path, key=False)
    provider = Provider([answer("不应执行")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"waiting_config"})
        assert "API Key" in row["error"]
        assert not provider.requests
        assert not store.all("SELECT * FROM messages WHERE role='assistant'")
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_http_provider_real_protocol_and_usage(tmp_path):
    store, _, _, task = setup(tmp_path)
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": "你好"}, "finish_reason": "stop"}],
                                         "usage": {"prompt_tokens": 31, "completion_tokens": 4, "total_tokens": 35}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    runtime = Runtime(store, Browser(), client=client)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded"
        request = requests[0]
        assert str(request.url) == "https://api.deepseek.com/chat/completions"
        assert request.headers["Authorization"] == "Bearer test-model-secret-123"
        body = json.loads(request.content)
        assert body["thinking"] == {"type": "disabled"}
        assert body["stream"] is False
        assert body["model"] == "deepseek-flash"
        assert body["tools"]
        assert json.loads(row["context"])["usage"]["total_tokens"] == 35
        assert "test-model-secret" not in json.dumps(store.all("SELECT * FROM events"))
        assert len(store.all("SELECT * FROM messages WHERE task_id=?", (task["id"],))) == 1
    finally:
        await runtime.close()
        await client.aclose()


@pytest.mark.asyncio
async def test_http_error_is_visible_and_redacts_key(tmp_path):
    store, _, _, task = setup(tmp_path)
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(401, json={"error": {"message": "bad key test-model-secret-123"}})))
    runtime = Runtime(store, Browser(), client=client)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"failed"})
        assert "HTTP 401" in row["error"]
        assert "test-model-secret-123" not in row["error"]
        assert "test-model-secret-123" not in json.dumps(store.all("SELECT * FROM events"))
        assert not store.all("SELECT * FROM messages WHERE role='assistant'")
    finally:
        await runtime.close()
        await client.aclose()


@pytest.mark.asyncio
async def test_memory_isolation_and_real_tools(tmp_path):
    store, bot, _, task = setup(tmp_path, prompt="我喜欢用中文；以后你负责学习辅导")
    other = store.one("SELECT * FROM bots WHERE id<>? LIMIT 1", (bot["id"],))
    now = time.time()
    store.execute("INSERT INTO memories VALUES(?,?,?,?,?)", ("shared", None, "共享事实", now, now))
    store.execute("INSERT INTO memories VALUES(?,?,?,?,?)", ("own", bot["id"], "本Bot事实", now, now))
    store.execute("INSERT INTO memories VALUES(?,?,?,?,?)", ("other", other["id"], "不应泄漏的其他Bot秘密", now, now))
    provider = Provider([
        answer(calls=[tool("memory_save", {"content": "喜欢中文", "scope": "shared"}, "save"),
                      tool("memory_save", {"content": "越权", "memory_id": "other"}, "foreign"),
                      tool("bot_update", {"role": "学习辅导", "user_request": "以后你负责学习辅导"}, "role")]),
        answer("已记录你的偏好，并更新职责。")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        system = provider.requests[0]["messages"][0]["content"]
        assert "共享事实" in system and "本Bot事实" in system
        assert "不应泄漏的其他Bot秘密" not in system
        assert store.one("SELECT content FROM memories WHERE id='other'")["content"] == "不应泄漏的其他Bot秘密"
        assert store.one("SELECT role FROM bots WHERE id=?", (bot["id"],))["role"] == "学习辅导"
        results = [json.loads(m["content"]) for m in provider.requests[1]["messages"] if m["role"] == "tool"]
        assert results[0]["ok"] is True and results[1]["ok"] is False and results[2]["ok"] is True
        assert "学习辅导" in provider.requests[1]["messages"][0]["content"]
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_approval_resumes_without_replaying_completed_navigation(tmp_path):
    store, _, _, task = setup(tmp_path)
    browser = Browser()
    provider = Provider([answer(calls=[tool("browser_action", {"action": "open", "args": {"url": "https://example.com"}}, "open"),
                                       tool("browser_action", {"action": "click", "args": {"ref": "p1-e1"}}, "click")]), answer("提交步骤完成。")])
    runtime = Runtime(store, browser, provider=provider)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"waiting_approval", "failed"})
        assert row["status"] == "waiting_approval", row["error"]
        assert [x[1] for x in browser.actions] == ["open"]
        context = json.loads(row["context"])
        assert context["pending_approval"]["args"] == {"ref": "p1-e1"}
        await runtime.approve_task(task["id"], True)
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        assert [x[1] for x in browser.actions] == ["open", "click"]
        results = [m for m in provider.requests[1]["messages"] if m["role"] == "tool"]
        assert [m["tool_call_id"] for m in results] == ["open", "click"]
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_changed_approval_target_does_not_execute(tmp_path):
    store, _, _, task = setup(tmp_path)
    browser = Browser()
    provider = Provider([answer(calls=[tool("browser_action", {"action": "open", "args": {"url": "https://example.com"}}, "open"),
                                       tool("browser_action", {"action": "click", "args": {"ref": "p1-e1"}}, "click")]), answer("目标发生变化，已停止提交。")])
    runtime = Runtime(store, browser, provider=provider)
    try:
        await runtime.start()
        await wait_for(store, task["id"], {"waiting_approval"})
        browser.label = "删除全部数据"
        await runtime.approve_task(task["id"], True)
        await wait_for(store, task["id"], {"succeeded"})
        assert [x[1] for x in browser.actions] == ["open"]
        result = json.loads([m for m in provider.requests[1]["messages"] if m["role"] == "tool"][-1]["content"])
        assert result["ok"] is False and "变化" in result["error"]
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_denial_does_not_repeatedly_ask_for_same_action(tmp_path):
    store, _, _, task = setup(tmp_path)
    browser = Browser()
    args = {"action": "click", "args": {"ref": "p1-e1"}}
    provider = Provider([answer(calls=[tool("browser_action", args, "first")]),
                         answer(calls=[tool("browser_action", args, "retry")]), answer("没有执行被拒绝的操作。")])
    runtime = Runtime(store, browser, provider=provider)
    try:
        await runtime.start()
        await wait_for(store, task["id"], {"waiting_approval"})
        await runtime.approve_task(task["id"], False)
        await wait_for(store, task["id"], {"succeeded"})
        assert not browser.actions
        assert len(store.all("SELECT * FROM events WHERE kind='approval_required'")) == 1
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_stop_cancels_active_model_and_worker_keeps_running(tmp_path):
    store, bot, conv, task = setup(tmp_path)
    entered = asyncio.Event()
    cancelled = asyncio.Event()

    async def blocking(**kwargs):
        entered.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    provider = Provider([blocking, answer("第二个任务正常完成")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        await asyncio.wait_for(entered.wait(), 2)
        await runtime.stop_task(task["id"])
        await asyncio.wait_for(cancelled.wait(), 1)
        assert store.one("SELECT status FROM tasks WHERE id=?", (task["id"],))["status"] == "cancelled"
        assert not store.all("SELECT * FROM messages WHERE task_id=?", (task["id"],))
        next_task = store.create_task(conv["id"], bot["id"], "继续其他任务")
        await runtime.notify()
        await wait_for(store, next_task["id"], {"succeeded"})
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_takeover_waits_for_explicit_continue(tmp_path):
    store, _, _, task = setup(tmp_path)
    entered = asyncio.Event()

    async def blocking(**kwargs):
        entered.set()
        await asyncio.Event().wait()

    browser = Browser()
    provider = Provider([blocking, answer("已根据接管后的页面继续")])
    runtime = Runtime(store, browser, provider=provider)
    try:
        await runtime.start()
        await asyncio.wait_for(entered.wait(), 2)
        await runtime.set_takeover(task["id"], True)
        with pytest.raises(ValueError, match="接管"):
            await runtime.resume_task(task["id"])
        await runtime.set_takeover(task["id"], False)
        await asyncio.sleep(.05)
        assert store.one("SELECT status FROM tasks WHERE id=?", (task["id"],))["status"] == "waiting_user"
        assert len(provider.requests) == 1
        await runtime.resume_task(task["id"], "登录完成，请继续")
        await wait_for(store, task["id"], {"succeeded"})
        assert browser.snapshots >= 1
        assert "登录完成" in json.dumps(provider.requests[-1]["messages"], ensure_ascii=False)
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_question_resume_closes_old_tools_before_human_message(tmp_path):
    store, _, _, task = setup(tmp_path)
    provider = Provider([answer(calls=[tool("ask_user", {"question": "请问地址是什么？"}, "question"),
                                       tool("memory_save", {"content": "不应执行的旧计划"}, "old")]), answer("收到新地址")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        await wait_for(store, task["id"], {"waiting_user"})
        await runtime.resume_task(task["id"], "地址是学校")
        await wait_for(store, task["id"], {"succeeded"})
        messages = provider.requests[1]["messages"]
        call_index = next(i for i, m in enumerate(messages) if m.get("tool_calls"))
        assert [m["role"] for m in messages[call_index:call_index + 4]] == ["assistant", "tool", "tool", "user"]
        assert not store.all("SELECT * FROM memories WHERE content='不应执行的旧计划'")
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_restart_does_not_replay_ambiguous_action(tmp_path):
    store, _, _, task = setup(tmp_path)
    call = tool("browser_action", {"action": "click", "args": {"ref": "p1-e1"}}, "ambiguous")
    context = {"version": 1, "messages": [{"role": "system", "content": ""}, {"role": "user", "content": "提交"},
                                            {"role": "assistant", "content": "", "tool_calls": [call]}],
               "pending_calls": [call], "pending_index": 0, "inflight": call,
               "steps": 1, "actions": 1, "usage": {}, "root_task_id": task["id"]}
    store.execute("UPDATE tasks SET status='running',context=? WHERE id=?", (dumps(context), task["id"]))
    restarted_store = Store(tmp_path)
    restarted_store.api_key = "test-model-secret-123"
    assert restarted_store.one("SELECT status FROM tasks WHERE id=?", (task["id"],))["status"] == "paused"
    browser = Browser()
    provider = Provider([answer("已重新核实页面，未重复提交。")])
    runtime = Runtime(restarted_store, browser, provider=provider)
    try:
        await runtime.start()
        await asyncio.sleep(.05)
        assert not provider.requests
        await runtime.resume_task(task["id"], "请先检查状态")
        await wait_for(restarted_store, task["id"], {"succeeded"})
        assert not browser.actions
        result = next(m for m in provider.requests[0]["messages"] if m["role"] == "tool")
        assert json.loads(result["content"])["interrupted"] is True
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_handoff_separate_private_context_and_real_result(tmp_path):
    store, bot, conv, task = setup(tmp_path, prompt="请让研究助手核查网站")
    other = store.one("SELECT * FROM bots WHERE id<>? LIMIT 1", (bot["id"],))
    store.add_message(conv["id"], None, "user", "这是只告诉Echo的历史内容")
    provider = Provider([answer(calls=[tool("handoff", {"bot_id": other["id"], "prompt": "核查指定网站的公开信息"})]),
                         answer("研究结果：已核对来源。"), answer("研究助手已返回，我来汇总。")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        child = store.one("SELECT * FROM tasks WHERE parent_id=?", (task["id"],))
        assert child and child["status"] == "succeeded"
        child_messages = json.dumps(provider.requests[1]["messages"], ensure_ascii=False)
        assert "只告诉Echo的历史内容" not in child_messages
        assert "研究结果：已核对来源" in json.dumps(provider.requests[2]["messages"], ensure_ascii=False)
        assert store.one("SELECT * FROM events WHERE task_id=? AND kind='handoff_result'", (task["id"],))
        assert len(store.all("SELECT * FROM messages WHERE task_id IN (?,?) AND role='assistant'", (task["id"], child["id"]))) == 2
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_tools_persist_skills_routines_files_and_reject_path_escape(tmp_path):
    store, _, _, task = setup(tmp_path)
    store.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)", ("unrelated", "旧成果.md", str(tmp_path / "workspace" / "旧成果.md"), "text/plain", 0, "other-task", time.time()))
    future = time.time() + 3600
    provider = Provider([answer(calls=[
        tool("skill_save", {"name": "每周复习", "content": "读取学习进度，生成复习清单并核实来源。"}, "skill"),
        tool("routine_create", {"name": "作业提醒", "prompt": "交作业", "kind": "reminder", "schedule": "once", "run_at": datetime.fromtimestamp(future, timezone.utc).isoformat()}, "routine"),
        tool("file_write", {"path": "成果/报告.md", "content": "# 已核查\n来源：https://example.com"}, "file"),
        tool("file_write", {"path": "../escaped.txt", "content": "禁止"}, "escape")]), answer("已保存技能、提醒和报告。")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        assert store.one("SELECT * FROM skills WHERE name='每周复习'")
        assert store.one("SELECT * FROM routines WHERE name='作业提醒'")
        file = store.one("SELECT * FROM files WHERE name='报告.md'")
        assert file and (tmp_path / "workspace" / "成果" / "报告.md").exists()
        message = store.one("SELECT metadata FROM messages WHERE task_id=? AND role='assistant'", (task["id"],))
        assert json.loads(message["metadata"])["file_ids"] == [file["id"]]
        assert not (tmp_path / "escaped.txt").exists()
        results = [json.loads(m["content"]) for m in provider.requests[1]["messages"] if m["role"] == "tool"]
        assert [x["ok"] for x in results] == [True, True, True, False]
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_group_child_receives_own_identity_and_explicit_subtask(tmp_path):
    store, bot, _, task = setup(tmp_path, prompt="请把计算交给另一位Bot，收到结果后汇总")
    other = store.one("SELECT * FROM bots WHERE id<>? LIMIT 1", (bot["id"],))
    cid, now = uid(), time.time()
    store.execute("INSERT INTO conversations VALUES(?,?,?,?,?,?)", (cid, "协作验收", "group", dumps([bot["id"], other["id"]]), now, now))
    store.execute("UPDATE tasks SET conversation_id=? WHERE id=?", (cid, task["id"]))
    store.add_message(cid, None, "user", f"@{bot['name']} 请把计算交给 {other['name']}，收到结果后汇总")
    brief = "独立计算237乘19，只返回算式和结果"
    provider = Provider([
        answer(calls=[tool("handoff", {"bot_id": other["id"], "prompt": brief})]),
        answer("237×19=4503"), answer("已核对，结果为4503。")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        child = store.one("SELECT * FROM tasks WHERE parent_id=?", (task["id"],))
        assert child["status"] == "succeeded" and child["bot_id"] == other["id"]
        messages = provider.requests[1]["messages"]
        assert f"当前Bot ID：{other['id']}" in messages[0]["content"]
        assert "群历史仅作背景" in messages[0]["content"]
        assert messages[-1] == {"role": "user", "content": "【本次分派给你的子任务】\n" + brief}
        assert f"@{bot['name']}" not in json.dumps(messages[1:], ensure_ascii=False)
        assert len(messages) == 2
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_unselected_upload_rejected_after_approval(tmp_path):
    store, _, _, task = setup(tmp_path)
    browser = Browser()
    file = tmp_path / "files" / "old"
    file.write_text("历史附件")
    store.execute("INSERT INTO files VALUES(?,?,?,?,?,?,?)", ("old", "old.txt", str(file), "text/plain", 12, None, time.time()))
    provider = Provider([answer(calls=[tool("browser_action", {"action": "open", "args": {"url": "https://example.com"}}, "open"),
                                       tool("browser_action", {"action": "upload", "args": {"ref": "p1-e1", "file_id": "old"}}, "upload")]), answer("没有上传未选择的历史附件。")])
    runtime = Runtime(store, browser, provider=provider)
    try:
        await runtime.start()
        await wait_for(store, task["id"], {"waiting_approval"})
        await runtime.approve_task(task["id"], True)
        await wait_for(store, task["id"], {"succeeded"})
        assert [x[1] for x in browser.actions] == ["open"]
        assert "本任务选择" in [json.loads(m["content"]) for m in provider.requests[1]["messages"] if m["role"] == "tool"][-1]["error"]
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_step_budget_and_silent_checkin(tmp_path):
    store, bot, conv, task = setup(tmp_path)
    provider = Provider([answer(calls=[tool("memory_list", {}, f"call-{i}")]) for i in range(MAX_STEPS + 1)])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"failed"})
        assert "24" in row["error"]
        assert len(provider.requests) == MAX_STEPS
        provider.replies = [answer("[SILENT]")]
        checkin = store.create_task(conv["id"], bot["id"], "看看是否需要联系", kind="checkin")
        await runtime.notify()
        await wait_for(store, checkin["id"], {"succeeded"})
        assert not store.all("SELECT * FROM messages WHERE task_id=?", (checkin["id"],))
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_memory_revision_excludes_old_chat_and_tool_payloads(tmp_path):
    old_fact = "我最喜欢的颜色是钴蓝色"
    store, bot, conv, task = setup(tmp_path, prompt="请忘记之前的颜色偏好")
    now = time.time()
    store.execute("INSERT INTO memories VALUES(?,?,?,?,?)", ("color", bot["id"], old_fact, now, now))
    store.add_message(conv["id"], None, "user", old_fact)
    provider = Provider([
        answer(calls=[tool("memory_list", {}, "list"), tool("memory_delete", {"memory_id": "color", "user_request": "忘记之前的颜色偏好"}, "delete")]),
        answer("已忘记之前的偏好。")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        assert old_fact in json.dumps(provider.requests[0]["messages"], ensure_ascii=False)
        assert "钴蓝色" not in json.dumps(provider.requests[1]["messages"], ensure_ascii=False)
        assert not store.one("SELECT * FROM memories WHERE id='color'")
        assert store.one("SELECT * FROM events WHERE task_id=? AND kind='memory_context_reset'", (task["id"],))
        next_task = store.create_task(conv["id"], bot["id"], "我喜欢什么颜色？")
        provider.replies.append(answer("没有保存你的颜色偏好。"))
        await runtime.notify()
        await wait_for(store, next_task["id"], {"succeeded"})
        assert "钴蓝色" not in json.dumps(provider.requests[-1]["messages"], ensure_ascii=False)
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_memory_edit_during_model_request_discards_stale_actions(tmp_path):
    store, bot, _, task = setup(tmp_path, prompt="根据保存的地址处理后续工作")
    now = time.time()
    store.execute("INSERT INTO memories VALUES(?,?,?,?,?)", ("address", bot["id"], "旧地址是金星街17号", now, now))
    entered, release = asyncio.Event(), asyncio.Event()

    async def stale(**kwargs):
        entered.set()
        await release.wait()
        return answer(calls=[tool("browser_action", {"action": "open", "args": {"url": "https://example.com/old"}})], usage={"total_tokens": 22})

    provider = Provider([stale, answer("当前地址已更新，请重新说明后续工作。")])
    browser = Browser()
    runtime = Runtime(store, browser, provider=provider)
    try:
        await runtime.start()
        await asyncio.wait_for(entered.wait(), 2)
        with store.transaction() as db:
            db.execute("UPDATE memories SET content='新地址是地球街8号' WHERE id='address'")
            store.bump_memory_epoch(bot["id"], connection=db)
        release.set()
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        second = json.dumps(provider.requests[1]["messages"], ensure_ascii=False)
        assert "金星街17号" not in second and "地球街8号" in second
        assert not browser.actions
        assert json.loads(row["context"])["usage"]["total_tokens"] == 22
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_group_handoff_rejects_outside_bot(tmp_path):
    store, bot, _, _ = setup(tmp_path)
    others = store.all("SELECT * FROM bots WHERE id<>?", (bot["id"],))
    now, cid = time.time(), uid()
    store.execute("INSERT INTO conversations VALUES(?,?,'group',?,?,?)", (cid, "学习群", dumps([bot["id"], others[0]["id"]]), now, now))
    task = store.create_task(cid, bot["id"], "群内讨论")
    # The default queued setup task is irrelevant to this scenario.
    store.execute("UPDATE tasks SET status='cancelled' WHERE id<>?", (task["id"],))
    provider = Provider([answer(calls=[tool("handoff", {"bot_id": others[1]["id"], "prompt": "不应传出群聊"})]), answer("仅在群内讨论。")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        await wait_for(store, task["id"], {"succeeded"})
        assert not store.all("SELECT * FROM tasks WHERE parent_id=?", (task["id"],))
        result = next(json.loads(m["content"]) for m in provider.requests[1]["messages"] if m["role"] == "tool")
        assert result["ok"] is False and "群外" in result["error"]
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_handoff_tree_is_bounded_and_stop_cancels_child(tmp_path):
    store, bot, _, task = setup(tmp_path)
    other = store.one("SELECT * FROM bots WHERE id<>? LIMIT 1", (bot["id"],))
    entered, cancelled = asyncio.Event(), asyncio.Event()

    async def child_wait(**kwargs):
        entered.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    provider = Provider([answer(calls=[tool("handoff", {"bot_id": other["id"], "prompt": "帮忙研究"})]), child_wait])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        await asyncio.wait_for(entered.wait(), 2)
        await runtime.stop_task(task["id"])
        await asyncio.wait_for(cancelled.wait(), 1)
        family = runtime._family(task["id"])
        assert len(family) == 2 and all(t["status"] == "cancelled" for t in family)
        assert not store.all("SELECT * FROM messages WHERE role='assistant'")
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_handoff_allows_at_most_two_transfers(tmp_path):
    store, bot, _, task = setup(tmp_path)
    others = store.all("SELECT * FROM bots WHERE id<>?", (bot["id"],))
    provider = Provider([
        answer(calls=[tool("handoff", {"bot_id": others[0]["id"], "prompt": "第一项子任务"}, "one")]),
        answer(calls=[tool("handoff", {"bot_id": others[1]["id"], "prompt": "第二项子任务"}, "two")]),
        answer(calls=[tool("handoff", {"bot_id": bot["id"], "prompt": "第三项不应建立"}, "three")]),
        answer("已完成第二项。"), answer("已完成第一项。"), answer("已汇总全部结果。")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        family = runtime._family(task["id"])
        assert len(family) == 3 and len({t["bot_id"] for t in family}) == 3
        result = next(json.loads(m["content"]) for m in provider.requests[3]["messages"] if m["role"] == "tool")
        assert result["ok"] is False and "两次" in result["error"]
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_steering_cancels_and_awaits_active_model_before_resuming(tmp_path):
    store, _, _, task = setup(tmp_path, prompt="做原来的任务")
    entered, cancelled = asyncio.Event(), asyncio.Event()

    async def old_work(**kwargs):
        entered.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            await asyncio.sleep(.02)  # A real transport may need cancellation cleanup.
            cancelled.set()
            raise

    provider = Provider([old_work, answer("已按新指令调整")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        await asyncio.wait_for(entered.wait(), 2)
        result = await runtime.steer_task(task["id"], "先不要原任务，改为检查新地址")
        assert cancelled.is_set()
        assert result["status"] == "queued"
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        assert "改为检查新地址" in json.dumps(provider.requests[1]["messages"], ensure_ascii=False)
        assert len(store.all("SELECT * FROM tasks")) == 1
        assert len(store.all("SELECT * FROM messages WHERE task_id=? AND role='assistant'", (task["id"],))) == 1
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_steering_closes_old_approval_without_executing_it(tmp_path):
    store, _, _, task = setup(tmp_path)
    browser = Browser()
    provider = Provider([answer(calls=[tool("browser_action", {"action": "open", "args": {"url": "https://example.com"}}, "open"),
                                       tool("browser_action", {"action": "click", "args": {"ref": "p1-e1"}}, "click")]), answer("已取消提交，转为只查看。")])
    runtime = Runtime(store, browser, provider=provider)
    try:
        await runtime.start()
        await wait_for(store, task["id"], {"waiting_approval"})
        await runtime.steer_task(task["id"], "不要发送，改为只查看")
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        assert [x[1] for x in browser.actions] == ["open"]
        messages = provider.requests[1]["messages"]
        call_index = next(i for i, m in enumerate(messages) if m.get("tool_calls"))
        assert [m["role"] for m in messages[call_index:call_index + 4]] == ["assistant", "tool", "tool", "user"]
        assert "pending_approval" not in json.loads(row["context"])
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_steering_while_takeover_does_not_resume_bot(tmp_path):
    store, _, _, task = setup(tmp_path)
    runtime = Runtime(store, Browser(), provider=Provider([answer("接管结束后继续")]))
    try:
        await runtime.set_takeover(task["id"], True)
        await runtime.start()
        row = await runtime.steer_task(task["id"], "我还在处理登录，之后再继续")
        assert row["status"] == "waiting_user" and row["takeover"] == 1
        await asyncio.sleep(.05)
        assert not runtime.provider.requests
        await runtime.set_takeover(task["id"], False)
        await runtime.resume_task(task["id"], "处理完了")
        await wait_for(store, task["id"], {"succeeded"})
    finally:
        await runtime.close()


@pytest.mark.asyncio
async def test_web_search_and_fetch_call_deepseek_and_reject_credentials(tmp_path):
    store, _, _, task = setup(tmp_path, prompt="今年有哪些国语新专辑")
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path == "/chat/completions":
            body = json.loads(request.content)
            if any(item.get("role") == "tool" for item in body["messages"]):
                return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": "根据搜索结果，来源是示例文章。"}, "finish_reason": "stop"}], "usage": {}})
            calls = [
                tool("web_search", {"query": "国语 新专辑 2026", "count": 3}, "search"),
                tool("web_fetch", {"url": "https://example.com/album"}, "fetch"),
                tool("web_fetch", {"url": "http://user:secret@example.com/album"}, "bad"),
            ]
            return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": "", "tool_calls": calls}, "finish_reason": "tool_calls"}], "usage": {}})
        if request.url.path == "/v1/tools/search":
            assert request.headers["Authorization"] == "Bearer test-model-secret-123"
            body = json.loads(request.content)
            assert body["query"] == "国语 新专辑 2026" and body["count"] == 3 and body["need_content"] is False
            assert body["ori_question"] == "今年有哪些国语新专辑"
            return httpx.Response(200, json={"results": [{"title": "新专辑", "url": "https://example.com/album", "snippet": "短摘", "summary": "长摘要", "content": "不应返回", "site_name": "示例", "date": "2026-06-01T00:00:00+00:00", "authority": 3, "rerank_score": 2.2}]})
        if request.url.path == "/v1/tools/fetch":
            assert json.loads(request.content)["url"] == "https://example.com/album"
            return httpx.Response(200, json={"title": "专辑文", "content": "正文" * 7000})
        return httpx.Response(404, json={"error": {"message": request.url.path}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    runtime = Runtime(store, Browser(), client=client)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        tool_names = [request.url.path for request in requests]
        assert tool_names.count("/v1/tools/search") == 1
        assert tool_names.count("/v1/tools/fetch") == 1
        chats = [json.loads(request.content) for request in requests if request.url.path == "/chat/completions"]
        results = [json.loads(item["content"]) for item in chats[1]["messages"] if item["role"] == "tool"]
        assert results[0]["ok"] is True and results[0]["results"][0]["summary"] == "长摘要" and "content" not in results[0]["results"][0]
        assert results[1]["ok"] is True and results[1]["truncated"] is True and len(results[1]["content"]) == 12000
        assert results[2]["ok"] is False and "账号密码" in results[2]["error"]
        assert "web_search" in chats[0]["messages"][0]["content"]
    finally:
        await runtime.close()
        await client.aclose()


@pytest.mark.asyncio
async def test_direct_reply_omits_speaker_prefix(tmp_path):
    store, bot, conv, task = setup(tmp_path, "继续说")
    store.add_message(conv["id"], bot["id"], "assistant", f"[{bot['name']}] 上一句")
    provider = Provider([answer(f"[{bot['name']}]：这是正文")])
    runtime = Runtime(store, Browser(), provider=provider)
    try:
        await runtime.start()
        row = await wait_for(store, task["id"], {"succeeded", "failed"})
        assert row["status"] == "succeeded", row["error"]
        history = provider.requests[0]["messages"]
        assert history[1] == {"role": "assistant", "content": "上一句"}
        assert "不要以 [你的名字] 开头" in history[0]["content"]
        saved = store.one("SELECT content FROM messages WHERE task_id=? AND role='assistant'", (task["id"],))
        assert saved["content"] == "这是正文"
        assert row["result"] == "这是正文"
    finally:
        await runtime.close()
