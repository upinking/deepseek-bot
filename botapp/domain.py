"""HTTP resource routes; authorization is installed by main.py."""
from __future__ import annotations

import inspect
import json
import re
import time

from fastapi import HTTPException, Query

from .scheduler import Scheduler, save_routine
from .store import decode_row, dumps, uid


def _text(value, label, maximum=20000, allow_empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not allow_empty and not value.strip()):
        raise HTTPException(422, f"{label}不能为空或超过 {maximum} 个字符")
    return value.strip()


def _require(store, table, resource_id, label):
    # Table names are literals supplied by this module, never request inputs.
    row = store.one(f"SELECT * FROM {table} WHERE id=?", (resource_id,))
    if not row:
        raise HTTPException(404, f"{label}不存在")
    return row


def _boolean(value, label):
    if not isinstance(value, bool):
        raise HTTPException(422, f"{label}必须为布尔值")
    return value


async def _call(runtime, method, *args):
    try:
        result = getattr(runtime, method)(*args)
        return await result if inspect.isawaitable(result) else result
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc


def install_routes(app, store, runtime):
    """Register resource routes; all API output decodes persisted JSON fields."""
    scheduler = Scheduler(store)

    def bot_output(row):
        bot = decode_row(row)
        direct = next((c for c in store.all("SELECT id,members FROM conversations WHERE kind='direct'") if json.loads(c["members"]) == [row["id"]]), None)
        bot["conversation_id"] = direct["id"] if direct else None
        return bot

    def bot_scope(bot_id):
        if bot_id is not None:
            if not isinstance(bot_id, str):
                raise HTTPException(422, "Bot 标识无效")
            _require(store, "bots", bot_id, "Bot")
        return bot_id

    @app.get("/api/bots")
    async def list_bots():
        return [bot_output(row) for row in store.all("SELECT * FROM bots ORDER BY is_primary DESC,created_at,id")]

    @app.post("/api/bots", status_code=201)
    async def create_bot(payload: dict):
        name = _text(payload.get("name"), "Bot 名字", 64)
        role = _text(payload.get("role", ""), "职责", 12000, allow_empty=True)
        avatar = _text(payload.get("avatar", "echo"), "头像", 512)
        color = payload.get("color", "#5959df")
        if not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise HTTPException(422, "颜色应为 #RRGGBB")
        primary = _boolean(payload.get("is_primary", False), "主 Bot")
        now, bot_id, conversation_id = time.time(), uid(), uid()
        with store.transaction() as db:
            primary = primary or not db.execute("SELECT 1 FROM bots LIMIT 1").fetchone()
            if primary:
                db.execute("UPDATE bots SET is_primary=0")
            db.execute("INSERT INTO bots(id,name,role,avatar,color,is_primary,created_at) VALUES (?,?,?,?,?,?,?)", (bot_id, name, role, avatar, color, int(primary), now))
            db.execute("INSERT INTO conversations(id,title,kind,members,created_at,updated_at) VALUES (?,?,'direct',?,?,?)", (conversation_id, name, dumps([bot_id]), now, now))
        return bot_output(_require(store, "bots", bot_id, "Bot"))

    @app.patch("/api/bots/{bot_id}")
    async def update_bot(bot_id: str, payload: dict):
        current = _require(store, "bots", bot_id, "Bot")
        changes = {}
        for field, label, limit in (("name", "Bot 名字", 64), ("role", "职责", 12000), ("avatar", "头像", 512)):
            if field in payload:
                changes[field] = _text(payload[field], label, limit, allow_empty=field == "role")
        if "color" in payload:
            if not isinstance(payload["color"], str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", payload["color"]):
                raise HTTPException(422, "颜色应为 #RRGGBB")
            changes["color"] = payload["color"]
        if "is_primary" in payload:
            primary = _boolean(payload["is_primary"], "主 Bot")
            if current["is_primary"] and not primary:
                raise HTTPException(422, "请选择另一个 Bot 设为主 Bot")
            changes["is_primary"] = int(primary)
        with store.transaction() as db:
            if changes.get("is_primary"):
                db.execute("UPDATE bots SET is_primary=0")
            if changes:
                db.execute("UPDATE bots SET " + ",".join(f"{key}=?" for key in changes) + " WHERE id=?", [*changes.values(), bot_id])
            if "name" in changes:
                db.execute("UPDATE conversations SET title=?,updated_at=? WHERE kind='direct' AND members=?", (changes["name"], time.time(), dumps([bot_id])))
        return bot_output(_require(store, "bots", bot_id, "Bot"))

    @app.post("/api/bots/{bot_id}/primary")
    async def make_primary(bot_id: str):
        _require(store, "bots", bot_id, "Bot")
        with store.transaction() as db:
            db.execute("UPDATE bots SET is_primary=0")
            db.execute("UPDATE bots SET is_primary=1 WHERE id=?", (bot_id,))
        return bot_output(_require(store, "bots", bot_id, "Bot"))

    @app.delete("/api/bots/{bot_id}")
    async def delete_bot(bot_id: str):
        _require(store, "bots", bot_id, "Bot")
        with store.transaction() as db:
            if db.execute("SELECT count(*) FROM bots").fetchone()[0] <= 1:
                raise HTTPException(409, "请至少保留一个 Bot")
            if db.execute("SELECT 1 FROM tasks WHERE bot_id=? AND status NOT IN ('succeeded','failed','cancelled') LIMIT 1", (bot_id,)).fetchone():
                raise HTTPException(409, "这个 Bot 还有未结束的任务，请先停止任务再删除")
            task_ids = [r[0] for r in db.execute("SELECT id FROM tasks WHERE bot_id=?", (bot_id,))]
            active_id, seen = getattr(runtime, "_active_id", None), set()
            while active_id and active_id not in seen:
                if active_id in task_ids:
                    raise HTTPException(409, "任务正在收尾，请稍后再删除")
                seen.add(active_id)
                active = db.execute("SELECT parent_id FROM tasks WHERE id=?", (active_id,)).fetchone()
                active_id = active["parent_id"] if active else None
            for task_id in task_ids:
                db.execute("DELETE FROM events WHERE task_id=?", (task_id,))
                db.execute("DELETE FROM routine_runs WHERE task_id=?", (task_id,))
            db.execute("DELETE FROM tasks WHERE bot_id=?", (bot_id,))
            db.execute("DELETE FROM memories WHERE bot_id=?", (bot_id,))
            db.execute("UPDATE routines SET skill_id=NULL WHERE skill_id IN (SELECT id FROM skills WHERE bot_id=?)", (bot_id,))
            db.execute("DELETE FROM skills WHERE bot_id=?", (bot_id,))
            db.execute("DELETE FROM routine_runs WHERE routine_id IN (SELECT id FROM routines WHERE bot_id=?)", (bot_id,))
            db.execute("DELETE FROM routines WHERE bot_id=?", (bot_id,))
            for conversation in db.execute("SELECT * FROM conversations").fetchall():
                members = json.loads(conversation["members"])
                if bot_id not in members:
                    continue
                if conversation["kind"] == "direct":
                    db.execute("DELETE FROM messages WHERE conversation_id=?", (conversation["id"],))
                    db.execute("DELETE FROM conversations WHERE id=?", (conversation["id"],))
                else:
                    db.execute("UPDATE conversations SET members=?,updated_at=? WHERE id=?", (dumps([m for m in members if m != bot_id]), time.time(), conversation["id"]))
            db.execute("DELETE FROM bots WHERE id=?", (bot_id,))
            if not db.execute("SELECT 1 FROM bots WHERE is_primary=1").fetchone():
                db.execute("UPDATE bots SET is_primary=1 WHERE id=(SELECT id FROM bots ORDER BY created_at,id LIMIT 1)")
        return {"ok": True}

    @app.get("/api/conversations")
    async def list_conversations():
        result = []
        for row in store.all("SELECT * FROM conversations ORDER BY updated_at DESC,id"):
            conversation = decode_row(row)
            last = store.one("SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at DESC,id DESC LIMIT 1", (row["id"],))
            conversation["last_message"] = decode_row(last)
            result.append(conversation)
        return result

    @app.post("/api/conversations", status_code=201)
    async def create_conversation(payload: dict):
        kind = payload.get("kind", "group")
        if kind not in ("direct", "group"):
            raise HTTPException(422, "对话类型必须为 direct 或 group")
        members = payload.get("members")
        if not isinstance(members, list) or not all(isinstance(m, str) for m in members):
            raise HTTPException(422, "请选择 Bot 成员")
        members = list(dict.fromkeys(members))
        if not members or (kind == "group" and not 2 <= len(members) <= 6) or (kind == "direct" and len(members) != 1):
            raise HTTPException(422, "单聊需要 1 个 Bot，群聊需要 2 至 6 个 Bot")
        bots = [_require(store, "bots", member, "Bot") for member in members]
        if kind == "direct":
            for conversation in store.all("SELECT * FROM conversations WHERE kind='direct'"):
                if json.loads(conversation["members"]) == members:
                    return decode_row(conversation)
        title = _text(payload.get("title") or (bots[0]["name"] if kind == "direct" else "、".join(b["name"] for b in bots)), "对话名称", 200)
        conversation_id, now = uid(), time.time()
        store.execute("INSERT INTO conversations(id,title,kind,members,created_at,updated_at) VALUES (?,?,?,?,?,?)", (conversation_id, title, kind, dumps(members), now, now))
        return decode_row(_require(store, "conversations", conversation_id, "对话"))

    @app.get("/api/conversations/{conversation_id}/messages")
    async def list_messages(conversation_id: str):
        _require(store, "conversations", conversation_id, "对话")
        return [decode_row(row) for row in store.all("SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at,id", (conversation_id,))]

    @app.post("/api/conversations/{conversation_id}/messages", status_code=201)
    async def send_message(conversation_id: str, payload: dict):
        conversation = _require(store, "conversations", conversation_id, "对话")
        members = json.loads(conversation["members"])
        file_ids = payload.get("file_ids", [])
        if not isinstance(file_ids, list) or len(file_ids) > 10 or not all(isinstance(f, str) for f in file_ids):
            raise HTTPException(422, "附件列表无效，最多 10 个文件")
        file_ids = list(dict.fromkeys(file_ids))
        for file_id in file_ids:
            _require(store, "files", file_id, "附件")
        content = _text(payload.get("content", ""), "消息", 30000, allow_empty=bool(file_ids))
        bot_id = payload.get("bot_id")
        if bot_id is not None and not isinstance(bot_id, str):
            raise HTTPException(422, "Bot 标识无效")
        if bot_id is not None and bot_id not in members:
            raise HTTPException(422, "指定的 Bot 不属于这个对话")
        bots = [_require(store, "bots", b, "Bot") for b in members]
        if not bots:
            raise HTTPException(409, "群里已没有 Bot，请重新创建群聊")
        mentioned = [b for b in bots if f"@{b['name']}" in content]
        chosen = next((b for b in bots if b["id"] == bot_id), None) if bot_id else (mentioned[0] if mentioned else next((b for b in bots if b["is_primary"]), bots[0]))
        now, message_id = time.time(), uid()
        active = store.one("SELECT * FROM tasks WHERE conversation_id=? AND bot_id=? AND parent_id IS NULL AND status IN ('running','waiting_user','waiting_approval','paused') ORDER BY created_at DESC LIMIT 1", (conversation_id,chosen["id"])) if hasattr(runtime,"steer_task") else None
        with store.transaction() as db:
            db.execute("INSERT INTO messages(id,conversation_id,bot_id,role,content,metadata,created_at) VALUES (?,?,NULL,'user',?,?,?)", (message_id, conversation_id, content, dumps({"file_ids": file_ids}), now))
            source = {"message_id": message_id, "file_ids": file_ids, "group": conversation["kind"] == "group", "mentioned_bot_ids": [b["id"] for b in mentioned]}
            task = active or store.insert_task(db, conversation_id, chosen["id"], content or "请查看本条消息附带的文件。", source=source, now=now)
        if active:
            try:
                task = await _call(runtime,"steer_task",active["id"],content,file_ids)
            except HTTPException:
                current=store.one("SELECT status FROM tasks WHERE id=?",(active["id"],))
                if current and current["status"] in {"succeeded","failed","cancelled"}:
                    task=store.create_task(conversation_id,chosen["id"],content or "请查看附件",source=source)
                else:
                    raise
            store.execute("UPDATE messages SET task_id=? WHERE id=?",(task["id"],message_id))
        await _call(runtime, "notify")
        return {"message": decode_row(_require(store, "messages", message_id, "消息")), "task": decode_row(task)}

    @app.delete("/api/conversations/{conversation_id}/messages")
    async def clear_messages(conversation_id: str):
        _require(store, "conversations", conversation_id, "对话")
        now = time.time()
        with store.transaction() as db:
            if db.execute("SELECT 1 FROM tasks WHERE conversation_id=? AND status='running' LIMIT 1", (conversation_id,)).fetchone():
                raise HTTPException(409, "请先停止执行中的任务，再清空聊天")
            rows = db.execute("SELECT id,source FROM tasks WHERE conversation_id=? AND status NOT IN ('succeeded','failed')", (conversation_id,)).fetchall()
            for row in rows:
                source = json.loads(row["source"] or "{}")
                source["conversation_reset"] = True
                db.execute("UPDATE tasks SET status='cancelled',stop_requested=1,takeover=0,source=?,updated_at=? WHERE id=?", (dumps(source), now, row["id"]))
                db.execute("INSERT INTO events(task_id,kind,detail,created_at) VALUES (?,'cancelled',?,?)", (row["id"], dumps({"reason": "用户清空聊天"}), now))
            db.execute("DELETE FROM messages WHERE conversation_id=?", (conversation_id,))
            db.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now, conversation_id))
        return {"ok": True}

    @app.get("/api/tasks")
    async def list_tasks(conversation_id: str | None = None):
        if conversation_id is not None:
            _require(store, "conversations", conversation_id, "对话")
            rows = store.all("SELECT * FROM tasks WHERE conversation_id=? ORDER BY created_at DESC,id LIMIT 200", (conversation_id,))
        else:
            rows = store.all("SELECT * FROM tasks ORDER BY created_at DESC,id LIMIT 200")
        return [{k:v for k,v in decode_row(row).items() if k!="context"} for row in rows]

    @app.get("/api/tasks/{task_id}")
    async def get_task(task_id: str):
        return decode_row(_require(store, "tasks", task_id, "任务"))

    @app.get("/api/tasks/{task_id}/events")
    async def task_events(task_id: str, after: int = Query(0, ge=0)):
        _require(store, "tasks", task_id, "任务")
        return [decode_row(row) for row in store.all("SELECT * FROM events WHERE task_id=? AND id>? ORDER BY id LIMIT 1000", (task_id, after))]

    @app.post("/api/tasks/{task_id}/stop")
    async def stop_task(task_id: str):
        _require(store, "tasks", task_id, "任务")
        result = await _call(runtime, "stop_task", task_id)
        return decode_row(result or _require(store, "tasks", task_id, "任务"))

    @app.post("/api/tasks/{task_id}/resume")
    async def resume_task(task_id: str, payload: dict | None = None):
        task = _require(store, "tasks", task_id, "任务")
        if task["status"] == "succeeded":
            raise HTTPException(409, "任务已经结束，请发送新消息")
        if json.loads(task["source"] or "{}").get("conversation_reset"):
            raise HTTPException(409, "聊天已清空，请发送新消息开始任务")
        if task["status"] == "waiting_approval":
            raise HTTPException(409, "请先允许或拒绝等待审批的动作")
        if task["status"] in ("running", "queued"):
            raise HTTPException(409, "任务仍在执行或排队，请通过新消息补充指令")
        message = (payload or {}).get("message")
        if message is not None:
            message = _text(message, "补充指令", 20000)
        result = await _call(runtime, "resume_task", task_id, message)
        return decode_row(result or _require(store, "tasks", task_id, "任务"))

    @app.post("/api/tasks/{task_id}/approval")
    async def approve_task(task_id: str, payload: dict):
        task = _require(store, "tasks", task_id, "任务")
        if task["status"] != "waiting_approval":
            raise HTTPException(409, "这个任务目前没有等待审批的动作")
        allowed = _boolean(payload.get("allow"), "审批结果")
        result = await _call(runtime, "approve_task", task_id, allowed)
        return decode_row(result or _require(store, "tasks", task_id, "任务"))

    @app.post("/api/tasks/{task_id}/takeover")
    async def takeover(task_id: str, payload: dict):
        task = _require(store, "tasks", task_id, "任务")
        if task["status"] in ("succeeded", "failed", "cancelled"):
            raise HTTPException(409, "任务已经结束，不能接管")
        enabled = _boolean(payload.get("enabled"), "接管状态")
        result = await _call(runtime, "set_takeover", task_id, enabled)
        return decode_row(result or _require(store, "tasks", task_id, "任务"))

    @app.get("/api/memories")
    async def list_memories(bot_id: str | None = None):
        if bot_id in ("shared", "null"):
            rows = store.all("SELECT * FROM memories WHERE bot_id IS NULL ORDER BY updated_at DESC,id")
        elif bot_id is not None:
            bot_scope(bot_id)
            rows = store.all("SELECT * FROM memories WHERE bot_id=? OR bot_id IS NULL ORDER BY updated_at DESC,id", (bot_id,))
        else:
            rows = store.all("SELECT * FROM memories ORDER BY updated_at DESC,id")
        return [decode_row(row) for row in rows]

    @app.post("/api/memories", status_code=201)
    async def create_memory(payload: dict):
        content = _text(payload.get("content"), "记忆内容", 12000)
        bot_id = bot_scope(payload.get("bot_id"))
        memory_id, now = uid(), time.time()
        store.execute("INSERT INTO memories(id,bot_id,content,created_at,updated_at) VALUES (?,?,?,?,?)", (memory_id, bot_id, content, now, now))
        return decode_row(_require(store, "memories", memory_id, "记忆"))

    @app.patch("/api/memories/{memory_id}")
    async def update_memory(memory_id: str, payload: dict):
        current = _require(store, "memories", memory_id, "记忆")
        content = _text(payload.get("content", current["content"]), "记忆内容", 12000)
        bot_id = bot_scope(payload.get("bot_id", current["bot_id"]))
        with store.transaction() as db:
            db.execute("UPDATE memories SET bot_id=?,content=?,updated_at=? WHERE id=?", (bot_id, content, time.time(), memory_id))
            store.bump_memory_epoch(current["bot_id"], connection=db)
            if bot_id != current["bot_id"]:
                store.bump_memory_epoch(bot_id, connection=db)
        return decode_row(_require(store, "memories", memory_id, "记忆"))

    @app.delete("/api/memories/{memory_id}")
    async def delete_memory(memory_id: str):
        current = _require(store, "memories", memory_id, "记忆")
        with store.transaction() as db:
            db.execute("DELETE FROM memories WHERE id=?", (memory_id,))
            store.bump_memory_epoch(current["bot_id"], connection=db)
        return {"ok": True}

    @app.get("/api/skills")
    async def list_skills(bot_id: str | None = None):
        if bot_id is not None:
            bot_scope(bot_id)
            rows = store.all("SELECT * FROM skills WHERE bot_id=? OR bot_id IS NULL ORDER BY updated_at DESC,id", (bot_id,))
        else:
            rows = store.all("SELECT * FROM skills ORDER BY updated_at DESC,id")
        return [decode_row(row) for row in rows]

    @app.post("/api/skills", status_code=201)
    async def create_skill(payload: dict):
        name = _text(payload.get("name"), "技能名称", 120)
        content = _text(payload.get("content"), "技能内容", 30000)
        bot_id = bot_scope(payload.get("bot_id"))
        skill_id, now = uid(), time.time()
        store.execute("INSERT INTO skills(id,name,content,bot_id,version,created_at,updated_at) VALUES (?,?,?,?,1,?,?)", (skill_id, name, content, bot_id, now, now))
        return decode_row(_require(store, "skills", skill_id, "技能"))

    @app.patch("/api/skills/{skill_id}")
    async def update_skill(skill_id: str, payload: dict):
        current = _require(store, "skills", skill_id, "技能")
        name = _text(payload.get("name", current["name"]), "技能名称", 120)
        content = _text(payload.get("content", current["content"]), "技能内容", 30000)
        bot_id = bot_scope(payload.get("bot_id", current["bot_id"]))
        store.execute("UPDATE skills SET name=?,content=?,bot_id=?,version=version+1,updated_at=? WHERE id=?", (name, content, bot_id, time.time(), skill_id))
        return decode_row(_require(store, "skills", skill_id, "技能"))

    @app.delete("/api/skills/{skill_id}")
    async def delete_skill(skill_id: str):
        _require(store, "skills", skill_id, "技能")
        with store.transaction() as db:
            # Existing routines retain their reviewed version snapshot.
            db.execute("UPDATE routines SET skill_id=NULL WHERE skill_id=?", (skill_id,))
            db.execute("DELETE FROM skills WHERE id=?", (skill_id,))
        return {"ok": True}

    @app.get("/api/routines")
    async def list_routines():
        return [decode_row(row) for row in store.all("SELECT * FROM routines ORDER BY created_at DESC,id")]

    @app.post("/api/routines", status_code=201)
    async def create_routine(payload: dict):
        try:
            return decode_row(save_routine(store, payload))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.patch("/api/routines/{routine_id}")
    async def update_routine(routine_id: str, payload: dict):
        _require(store, "routines", routine_id, "例行任务")
        try:
            return decode_row(save_routine(store, payload, routine_id))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.delete("/api/routines/{routine_id}")
    async def delete_routine(routine_id: str):
        _require(store, "routines", routine_id, "例行任务")
        with store.transaction() as db:
            db.execute("DELETE FROM routine_runs WHERE routine_id=?", (routine_id,))
            db.execute("DELETE FROM routines WHERE id=?", (routine_id,))
        return {"ok": True}

    @app.post("/api/routines/{routine_id}/run")
    async def run_routine(routine_id: str):
        _require(store, "routines", routine_id, "例行任务")
        try:
            run = scheduler.run_now(routine_id)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        await _call(runtime, "notify")
        return decode_row(run)

    @app.get("/api/routines/{routine_id}/runs")
    async def routine_runs(routine_id: str):
        _require(store, "routines", routine_id, "例行任务")
        scheduler._finish_runs(time.time())
        return [decode_row(row) for row in store.all("SELECT * FROM routine_runs WHERE routine_id=? ORDER BY created_at DESC,id LIMIT 100", (routine_id,))]
