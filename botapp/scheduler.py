"""Persistent time-based work dispatch.  Browser/model work lives in Runtime."""
from __future__ import annotations

import asyncio
from datetime import datetime, time as datetime_time, timedelta
import json
import logging
import math
import sqlite3
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .store import Store, dumps, uid


log = logging.getLogger(__name__)
TERMINAL = {"succeeded", "failed", "cancelled"}


def _clock(value, field):
    if not isinstance(value, str):
        raise ValueError(f"{field}必须使用 HH:MM 格式")
    try:
        parsed = datetime.strptime(value, "%H:%M").time()
    except ValueError as exc:
        raise ValueError(f"{field}必须使用 HH:MM 格式") from exc
    if parsed.strftime("%H:%M") != value:
        raise ValueError(f"{field}必须使用 HH:MM 格式")
    return parsed


def _timestamp(value):
    try:
        if isinstance(value, bool):
            raise ValueError()
        if isinstance(value, (float, int)):
            result = float(value)
        elif isinstance(value, str):
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is None:
                raise ValueError("执行时间必须带时区")
            result = parsed.timestamp()
        else:
            raise ValueError()
        if not math.isfinite(result) or result < 0:
            raise ValueError()
        # Reject timestamps the scheduler cannot convert into a date.
        datetime.fromtimestamp(result, ZoneInfo("UTC"))
        return result
    except (ValueError, TypeError, OverflowError, OSError) as exc:
        raise ValueError("执行时间无效，请使用 Unix 秒或带时区的 ISO 时间") from exc


def next_run(routine, after):
    """Next future slot; skip missed recurring slots instead of replaying them."""
    if routine["schedule"] == "once":
        return routine["run_at"]
    if routine["schedule"] == "interval":
        interval = float(routine["interval_seconds"])
        anchor = routine.get("next_run_at")
        if anchor is None:
            return after + interval
        return float(anchor) + max(1, math.floor((after - float(anchor)) / interval) + 1) * interval
    zone = ZoneInfo(routine["timezone"])
    local = datetime.fromtimestamp(after, zone)
    clock = _clock(routine["time_of_day"], "每日时间")
    candidate = datetime.combine(local.date(), clock, zone).replace(fold=0)
    # A repeated DST wall-clock time runs once, at fold=0.
    if candidate.timestamp() <= after:
        candidate = datetime.combine(local.date() + timedelta(days=1), clock, zone).replace(fold=0)
    return candidate.timestamp()


def save_routine(store, values, routine_id=None, now=None):
    """Shared validation for HTTP routes and model tools. Returns a raw DB row."""
    now = time.time() if now is None else now
    existing = store.one("SELECT * FROM routines WHERE id=?", (routine_id,)) if routine_id else None
    if routine_id and not existing:
        raise ValueError("例行任务不存在")
    data = dict(existing or {})
    allowed = {"bot_id", "conversation_id", "name", "prompt", "kind", "schedule", "run_at", "time_of_day", "interval_seconds", "timezone", "enabled", "skill_id", "quiet_start", "quiet_end", "max_daily"}
    for key in allowed.intersection(values):
        data[key] = values[key]
    primary = store.one("SELECT id FROM bots ORDER BY is_primary DESC,created_at LIMIT 1")
    data.setdefault("bot_id", primary["id"] if primary else None)
    if not isinstance(data.get("bot_id"), str):
        raise ValueError("请选择存在的 Bot")
    bot = store.one("SELECT id,name FROM bots WHERE id=?", (data.get("bot_id"),))
    if not bot:
        raise ValueError("请选择存在的 Bot")
    if not data.get("conversation_id"):
        direct = next((c for c in store.all("SELECT * FROM conversations WHERE kind='direct'") if json.loads(c["members"]) == [bot["id"]]), None)
        if not direct:
            raise ValueError("找不到该 Bot 的对话")
        data["conversation_id"] = direct["id"]
    if not isinstance(data["conversation_id"], str):
        raise ValueError("对话无效")
    conversation = store.one("SELECT * FROM conversations WHERE id=?", (data["conversation_id"],))
    if not conversation or bot["id"] not in json.loads(conversation["members"]):
        raise ValueError("Bot 不属于这个对话")
    for key, default, limit in (("name", "提醒", 120), ("prompt", "", 20000)):
        data.setdefault(key, default)
        if not isinstance(data[key], str) or not data[key].strip() or len(data[key]) > limit:
            raise ValueError(f"{'名称' if key == 'name' else '任务内容'}不能为空或过长")
        data[key] = data[key].strip()
    data.setdefault("kind", "reminder")
    data.setdefault("schedule", "once")
    data.setdefault("timezone", "Asia/Shanghai")
    data.setdefault("enabled", True)
    data.setdefault("quiet_start", "23:00")
    data.setdefault("quiet_end", "08:00")
    data.setdefault("max_daily", 1)
    if not isinstance(data["kind"], str) or data["kind"] not in {"reminder", "agent", "checkin"}:
        raise ValueError("任务类型必须是 reminder、agent 或 checkin")
    if not isinstance(data["schedule"], str) or data["schedule"] not in {"once", "daily", "interval"}:
        raise ValueError("时间规则必须是 once、daily 或 interval")
    if not isinstance(data["enabled"], (bool, int)) or data["enabled"] not in (0, 1):
        raise ValueError("启用状态必须为布尔值")
    try:
        ZoneInfo(data["timezone"])
    except (ZoneInfoNotFoundError, ValueError, TypeError) as exc:
        raise ValueError("时区无效，例如 Asia/Shanghai") from exc
    for key, label in (("quiet_start", "安静时段开始"), ("quiet_end", "安静时段结束")):
        if data[key] is not None:
            _clock(data[key], label)
    if (data["quiet_start"] is None) != (data["quiet_end"] is None):
        raise ValueError("安静时段的开始和结束必须一起填写或清空")
    if isinstance(data["max_daily"], bool) or not isinstance(data["max_daily"], int) or not 1 <= data["max_daily"] <= 10:
        raise ValueError("每日主动联系上限应为 1 至 10 次")
    for key in ("run_at", "time_of_day", "interval_seconds", "skill_id"):
        data.setdefault(key, None)
    if data["schedule"] == "once":
        data["run_at"] = _timestamp(data["run_at"])
        if data["run_at"] < now - 60 and (not existing or "run_at" in values):
            raise ValueError("执行时间已经过去，请选择未来时间")
    elif data["schedule"] == "daily":
        _clock(data["time_of_day"], "每日时间")
    else:
        interval = data["interval_seconds"]
        if isinstance(interval, bool) or not isinstance(interval, (float, int)) or not math.isfinite(interval) or interval < 60:
            raise ValueError("重复间隔至少为 60 秒")
    skill_snapshot = data.get("skill_snapshot")
    if data["skill_id"]:
        if not isinstance(data["skill_id"], str):
            raise ValueError("技能无效")
        skill = store.one("SELECT * FROM skills WHERE id=?", (data["skill_id"],))
        if not skill or (skill["bot_id"] is not None and skill["bot_id"] != data["bot_id"]):
            raise ValueError("技能不存在或不属于该 Bot")
        if not existing or "skill_id" in values or skill_snapshot is None:
            skill_snapshot = dumps({"id": skill["id"], "name": skill["name"], "content": skill["content"], "version": skill["version"]})
    elif not existing or "skill_id" in values:
        skill_snapshot = None
    schedule_changed = not existing or bool({"schedule", "run_at", "time_of_day", "interval_seconds", "timezone"}.intersection(values))
    if schedule_changed or (existing and not existing["enabled"] and data["enabled"]):
        data["next_run_at"] = None
        data["next_run_at"] = next_run(data, now)
    data["id"] = routine_id or uid()
    data["created_at"] = existing["created_at"] if existing else now
    data["updated_at"] = now
    data["skill_snapshot"] = skill_snapshot
    columns = ["id", "bot_id", "conversation_id", "name", "prompt", "kind", "schedule", "run_at", "time_of_day", "interval_seconds", "timezone", "enabled", "next_run_at", "skill_id", "skill_snapshot", "created_at", "updated_at", "quiet_start", "quiet_end", "max_daily"]
    with store.transaction() as db:
        if existing:
            keys = [k for k in columns if k not in ("id", "created_at")]
            db.execute("UPDATE routines SET " + ",".join(f"{k}=?" for k in keys) + " WHERE id=?", [data[k] for k in keys] + [data["id"]])
        else:
            db.execute(f"INSERT INTO routines({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})", [data[k] for k in columns])
    return store.one("SELECT * FROM routines WHERE id=?", (data["id"],))


class Scheduler:
    def __init__(self, store):
        self.store = store
        self._worker = None

    async def start(self):
        if self._worker is None:
            self._worker = asyncio.create_task(self._loop())

    async def close(self):
        if self._worker is not None:
            self._worker.cancel()
            try:
                await self._worker
            except asyncio.CancelledError:
                pass
            self._worker = None

    async def _loop(self):
        while True:
            try:
                self.tick()
            except Exception:
                # Do not include prompts or API secrets in logs.
                log.exception("例行任务调度暂时失败")
            await asyncio.sleep(1)

    def tick(self, now=None):
        now = time.time() if now is None else now
        self._finish_runs(now)
        due = self.store.all("SELECT id FROM routines WHERE enabled=1 AND next_run_at<=? ORDER BY next_run_at LIMIT 50", (now,))
        dispatched = []
        for row in due:
            with self.store.transaction() as db:
                routine_row = db.execute("SELECT * FROM routines WHERE id=? AND enabled=1 AND next_run_at<=?", (row["id"], now)).fetchone()
                if not routine_row:
                    continue
                routine = dict(routine_row)
                scheduled = routine["next_run_at"]
                try:
                    run = self._claim_and_dispatch(db, routine, scheduled, now)
                except sqlite3.IntegrityError:
                    # Another scheduler already owns precisely this scheduled slot.
                    run = None
                following = None if routine["schedule"] == "once" else next_run(routine, now)
                db.execute("UPDATE routines SET enabled=?,next_run_at=?,last_run_at=?,updated_at=? WHERE id=?", (0 if following is None else 1, following, now, now, routine["id"]))
                if run:
                    dispatched.append(run)
        return dispatched

    def run_now(self, routine_id, now=None):
        now = time.time() if now is None else now
        with self.store.transaction() as db:
            row = db.execute("SELECT * FROM routines WHERE id=?", (routine_id,)).fetchone()
            if not row:
                raise ValueError("例行任务不存在")
            run = self._claim_and_dispatch(db, dict(row), now, now, manual=True)
            db.execute("UPDATE routines SET last_run_at=?,updated_at=? WHERE id=?", (now, now, routine_id))
        return run

    def _claim_and_dispatch(self, db, routine, scheduled, now, manual=False):
        run_id = uid()
        db.execute("INSERT INTO routine_runs(id,routine_id,status,scheduled_at,created_at) VALUES (?,?,'running',?,?)", (run_id, routine["id"], scheduled, now))
        db.execute("SAVEPOINT dispatch_work")
        try:
            reason = self._checkin_skip(db, routine, now) if routine["kind"] == "checkin" and not manual else None
            if reason:
                db.execute("UPDATE routine_runs SET status='skipped',finished_at=?,error=? WHERE id=?", (now, reason, run_id))
                db.execute("UPDATE routines SET last_result=? WHERE id=?", (reason, routine["id"]))
            elif routine["kind"] == "reminder":
                if not db.execute("SELECT id FROM bots WHERE id=?", (routine["bot_id"],)).fetchone() or not db.execute("SELECT id FROM conversations WHERE id=?", (routine["conversation_id"],)).fetchone():
                    raise ValueError("提醒的 Bot 或对话已经不存在")
                metadata = {"routine_id": routine["id"], "routine_run_id": run_id, "kind": "reminder", "delivery": "stored"}
                db.execute("INSERT INTO messages(id,conversation_id,bot_id,role,content,metadata,created_at) VALUES (?,?,?,'assistant',?,?,?)", (uid(), routine["conversation_id"], routine["bot_id"], routine["prompt"], dumps(metadata), now))
                db.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now, routine["conversation_id"]))
                db.execute("UPDATE routine_runs SET status='succeeded',finished_at=? WHERE id=?", (now, run_id))
                db.execute("UPDATE routines SET last_result=? WHERE id=?", ("提醒消息已保存；系统通知是否送达需由设备确认。", routine["id"]))
            else:
                if not db.execute("SELECT id FROM bots WHERE id=?", (routine["bot_id"],)).fetchone() or not db.execute("SELECT id FROM conversations WHERE id=?", (routine["conversation_id"],)).fetchone():
                    raise ValueError("执行任务的 Bot 或对话已经不存在")
                source = {"routine_id": routine["id"], "routine_run_id": run_id, "scheduled_at": scheduled, "manual": manual}
                if routine.get("skill_snapshot"):
                    source["skill"] = json.loads(routine["skill_snapshot"])
                task = Store.insert_task(db, routine["conversation_id"], routine["bot_id"], routine["prompt"], routine["kind"], source=source, now=now)
                db.execute("UPDATE routine_runs SET task_id=?,status='queued' WHERE id=?", (task["id"], run_id))
                db.execute("UPDATE routines SET last_result=? WHERE id=?", ("已加入后台任务队列", routine["id"]))
            db.execute("RELEASE dispatch_work")
        except Exception as exc:
            db.execute("ROLLBACK TO dispatch_work")
            db.execute("RELEASE dispatch_work")
            error = str(exc)[:500]
            db.execute("UPDATE routine_runs SET status='failed',finished_at=?,error=? WHERE id=?", (now, error, run_id))
            db.execute("UPDATE routines SET last_result=? WHERE id=?", (error, routine["id"]))
        return dict(db.execute("SELECT * FROM routine_runs WHERE id=?", (run_id,)).fetchone())

    @staticmethod
    def _checkin_skip(db, routine, now):
        zone = ZoneInfo(routine["timezone"])
        local = datetime.fromtimestamp(now, zone)
        if routine.get("quiet_start") and routine.get("quiet_end"):
            start = _clock(routine["quiet_start"], "安静开始")
            end = _clock(routine["quiet_end"], "安静结束")
            current = local.time().replace(tzinfo=None)
            quiet = (start <= current < end) if start < end else (current >= start or current < end)
            if start != end and quiet:
                return "处于安静时段，本次主动联系已跳过"
        day_start = datetime.combine(local.date(), datetime_time.min, zone).timestamp()
        day_end = datetime.combine(local.date() + timedelta(days=1), datetime_time.min, zone).timestamp()
        count = db.execute("""SELECT count(*) FROM routine_runs rr JOIN routines r ON r.id=rr.routine_id
            WHERE r.kind='checkin' AND rr.created_at>=? AND rr.created_at<?
              AND rr.status NOT IN ('skipped','failed','cancelled')
              AND (rr.status!='succeeded' OR EXISTS
                (SELECT 1 FROM messages m WHERE m.task_id=rr.task_id AND m.role='assistant'))""", (day_start, day_end)).fetchone()[0]
        # The current claim already exists, so one is the first contact.
        if count > routine.get("max_daily", 1):
            return "已达到今天的主动联系上限，本次已跳过"
        # A successful [SILENT] check did not contact the user.  Only a message
        # actually saved to the conversation can require a subsequent reply.
        last = db.execute("""SELECT m.created_at FROM messages m JOIN tasks t ON t.id=m.task_id
            WHERE t.kind='checkin' AND m.conversation_id=? AND m.role='assistant'
            ORDER BY m.created_at DESC LIMIT 1""", (routine["conversation_id"],)).fetchone()
        if last and not db.execute("SELECT id FROM messages WHERE conversation_id=? AND role='user' AND created_at>? LIMIT 1", (routine["conversation_id"], last["created_at"])).fetchone():
            return "上次主动联系后尚未收到回复，本次已跳过"
        return None

    def _finish_runs(self, now):
        with self.store.transaction() as db:
            rows = db.execute("SELECT rr.id,rr.routine_id,t.status,t.error,t.result FROM routine_runs rr JOIN tasks t ON t.id=rr.task_id WHERE rr.status NOT IN ('succeeded','failed','cancelled','skipped')").fetchall()
            for row in rows:
                finished = now if row["status"] in TERMINAL else None
                db.execute("UPDATE routine_runs SET status=?,error=?,finished_at=? WHERE id=?", (row["status"], row["error"], finished, row["id"]))
                if finished:
                    db.execute("UPDATE routines SET last_result=? WHERE id=?", ((row["result"] or row["error"] or row["status"])[:2000], row["routine_id"]))
