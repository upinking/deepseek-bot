"""Private sidebar organization; Bot identity and conversations stay unchanged."""

import json

from fastapi import HTTPException

from .store import dumps, uid


DEFAULT_PREFERENCE = {"pinned": False, "hidden": False, "unread": False, "group_id": None}
MAX_GROUPS = 30


def _state(db):
    row = db.execute("SELECT value FROM settings WHERE key='sidebar_state'").fetchone()
    try:
        value = json.loads(row[0]) if row else {}
    except (ValueError, TypeError):
        value = {}
    if not isinstance(value, dict):
        value = {}
    groups = value.get("groups", [])
    groups = [dict(id=g["id"], name=g["name"]) for g in groups
              if isinstance(g, dict) and isinstance(g.get("id"), str) and isinstance(g.get("name"), str)] if isinstance(groups, list) else []
    valid_groups = {g["id"] for g in groups}
    stored = value.get("bots", {})
    stored = stored if isinstance(stored, dict) else {}
    bots = {}
    for bot in db.execute("SELECT id,is_primary FROM bots"):
        old = stored.get(bot["id"], {})
        old = old if isinstance(old, dict) else {}
        preference = dict(DEFAULT_PREFERENCE)
        for key in ("pinned", "hidden", "unread"):
            preference[key] = old.get(key) is True
        if isinstance(old.get("group_id"), str) and old["group_id"] in valid_groups:
            preference["group_id"] = old["group_id"]
        if bot["is_primary"]:
            preference["hidden"] = False
        bots[bot["id"]] = preference
    return {"bots": bots, "groups": groups}


def _save(db, value):
    db.execute("INSERT INTO settings(key,value) VALUES('sidebar_state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (dumps(value),))


def _payload(value, allowed):
    if not isinstance(value, dict) or set(value) - set(allowed):
        raise HTTPException(422, "提交的侧栏设置字段无效")


def _name(value):
    if not isinstance(value, str) or not 1 <= len(value.strip()) <= 40:
        raise HTTPException(422, "分组名称需要 1 到 40 个字符")
    return value.strip()


def _group(state, group_id):
    group = next((g for g in state["groups"] if g["id"] == group_id), None)
    if group is None:
        raise HTTPException(404, "分组不存在")
    return group


def update_bot_sidebar(store, bot_id, payload):
    _payload(payload, DEFAULT_PREFERENCE)
    for key in ("pinned", "hidden", "unread"):
        if key in payload and not isinstance(payload[key], bool):
            raise HTTPException(422, "置顶、隐藏和未读状态必须是布尔值")
    if "group_id" in payload and payload["group_id"] is not None and not isinstance(payload["group_id"], str):
        raise HTTPException(422, "分组标识无效")
    with store.transaction() as db:
        bot = db.execute("SELECT is_primary FROM bots WHERE id=?", (bot_id,)).fetchone()
        if bot is None:
            raise HTTPException(404, "Bot 不存在")
        state = _state(db)
        if payload.get("hidden") and bot["is_primary"]:
            raise HTTPException(409, "主管需要保留在侧栏，请先更换主管再隐藏")
        if payload.get("group_id") is not None:
            _group(state, payload["group_id"])
        state["bots"][bot_id].update(payload)
        _save(db, state)
        return {"bot_id": bot_id, **state["bots"][bot_id]}


def install_sidebar_routes(app, store):
    @app.get("/api/sidebar")
    async def sidebar():
        with store.transaction() as db:
            return _state(db)

    @app.patch("/api/bots/{bot_id}/sidebar")
    async def update_sidebar(bot_id: str, payload: dict):
        return update_bot_sidebar(store, bot_id, payload)

    @app.post("/api/bot-groups", status_code=201)
    async def create_group(payload: dict):
        _payload(payload, {"name"})
        name = _name(payload.get("name"))
        with store.transaction() as db:
            state = _state(db)
            if len(state["groups"]) >= MAX_GROUPS:
                raise HTTPException(409, "最多创建 30 个分组")
            if any(g["name"].casefold() == name.casefold() for g in state["groups"]):
                raise HTTPException(409, "已有同名分组")
            group = {"id": uid(), "name": name}
            state["groups"].append(group)
            _save(db, state)
            return group

    @app.patch("/api/bot-groups/{group_id}")
    async def rename_group(group_id: str, payload: dict):
        _payload(payload, {"name"})
        name = _name(payload.get("name"))
        with store.transaction() as db:
            state = _state(db)
            group = _group(state, group_id)
            if any(g["id"] != group_id and g["name"].casefold() == name.casefold() for g in state["groups"]):
                raise HTTPException(409, "已有同名分组")
            group["name"] = name
            _save(db, state)
            return group

    @app.delete("/api/bot-groups/{group_id}")
    async def delete_group(group_id: str):
        with store.transaction() as db:
            state = _state(db)
            _group(state, group_id)
            state["groups"] = [g for g in state["groups"] if g["id"] != group_id]
            for preference in state["bots"].values():
                if preference["group_id"] == group_id:
                    preference["group_id"] = None
            _save(db, state)
            return {"ok": True}
