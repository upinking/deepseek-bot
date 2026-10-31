from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
from zoneinfo import ZoneInfo

import pytest

from botapp.scheduler import Scheduler, next_run, save_routine
from botapp.store import Store


def utc(text):
    return datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp()


def test_once_reminder_survives_restart_and_dispatches_without_api_key(tmp_path):
    now = utc("2026-11-01T00:00:00Z")
    first = Store(tmp_path)
    routine = save_routine(first, {"name": "喝水", "prompt": "到喝水时间了", "run_at": now + 60}, now=now)
    del first
    reopened = Store(tmp_path)
    assert not reopened.get_setting("api_key")
    scheduler = Scheduler(reopened)
    assert scheduler.tick(now + 59) == []
    assert scheduler.tick(now + 60)[0]["status"] == "succeeded"
    assert scheduler.tick(now + 61) == []
    assert len(reopened.all("SELECT * FROM messages")) == 1
    saved = reopened.one("SELECT * FROM routines WHERE id=?", (routine["id"],))
    assert saved["enabled"] == 0 and saved["next_run_at"] is None
    assert len(reopened.all("SELECT * FROM routine_runs")) == 1


def test_two_schedulers_claim_a_slot_only_once(tmp_path):
    store = Store(tmp_path)
    now = utc("2026-11-01T00:00:00Z")
    save_routine(store, {"prompt": "只发一次", "run_at": now + 60}, now=now)
    schedulers = [Scheduler(store), Scheduler(store)]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda scheduler: scheduler.tick(now + 60), schedulers))
    assert sum(len(r) for r in results) == 1
    assert len(store.all("SELECT * FROM routine_runs")) == 1
    assert len(store.all("SELECT * FROM messages")) == 1


def test_daily_timezone_and_interval_skip_missed_slots(tmp_path):
    store = Store(tmp_path)
    now = utc("2026-11-01T11:59:00Z")  # Shanghai 19:59
    routine = save_routine(store, {"prompt": "晚八点", "schedule": "daily", "time_of_day": "20:00", "timezone": "Asia/Shanghai"}, now=now)
    assert routine["next_run_at"] == utc("2026-11-01T12:00:00Z")
    scheduler = Scheduler(store)
    scheduler.tick(utc("2026-11-03T12:30:00Z"))
    updated = store.one("SELECT * FROM routines WHERE id=?", (routine["id"],))
    assert updated["next_run_at"] == utc("2026-11-04T12:00:00Z")
    assert len(store.all("SELECT * FROM messages")) == 1
    interval = save_routine(store, {"prompt": "间隔", "schedule": "interval", "interval_seconds": 60}, now=now)
    scheduler.tick(now + 601)
    updated = store.one("SELECT * FROM routines WHERE id=?", (interval["id"],))
    assert updated["next_run_at"] == now + 660


def test_daily_dst_repeated_wall_time_runs_once():
    routine = {"schedule": "daily", "time_of_day": "01:30", "timezone": "America/New_York"}
    first = datetime(2026, 11, 1, 1, 30, tzinfo=ZoneInfo("America/New_York"), fold=0).timestamp()
    following = next_run(routine, first)
    assert datetime.fromtimestamp(following, ZoneInfo("America/New_York")).strftime("%Y-%m-%d %H:%M") == "2026-11-02 01:30"


def test_agent_run_failure_retains_history_and_no_replay(tmp_path):
    now = utc("2026-11-01T00:00:00Z")
    store = Store(tmp_path)
    routine = save_routine(store, {"name": "查通知", "prompt": "打开指定网页", "kind": "agent", "run_at": now + 60}, now=now)
    scheduler = Scheduler(store)
    run = scheduler.tick(now + 60)[0]
    task = store.one("SELECT * FROM tasks WHERE id=?", (run["task_id"],))
    assert json.loads(task["source"])["routine_run_id"] == run["id"]
    store.execute("UPDATE tasks SET status='running' WHERE id=?", (task["id"],))
    recovered = Store(tmp_path)
    assert recovered.one("SELECT status FROM tasks WHERE id=?", (task["id"],))["status"] == "paused"
    resumed_scheduler = Scheduler(recovered)
    resumed_scheduler.tick(now + 120)
    assert len(recovered.all("SELECT * FROM tasks")) == 1
    assert recovered.one("SELECT status FROM routine_runs WHERE id=?", (run["id"],))["status"] == "paused"
    recovered.execute("UPDATE tasks SET status='failed',error='登录已失效' WHERE id=?", (task["id"],))
    resumed_scheduler.tick(now + 180)
    historical = recovered.one("SELECT * FROM routine_runs WHERE id=?", (run["id"],))
    assert historical["status"] == "failed" and historical["error"] == "登录已失效" and historical["finished_at"]
    assert recovered.one("SELECT * FROM routines WHERE id=?", (routine["id"],))


def test_dispatch_failure_is_not_deleted_or_retried(tmp_path):
    now = utc("2026-11-01T00:00:00Z")
    store = Store(tmp_path)
    routine = save_routine(store, {"prompt": "提醒", "run_at": now + 60}, now=now)
    store.execute("DELETE FROM bots WHERE id=?", (routine["bot_id"],))
    scheduler = Scheduler(store)
    result = scheduler.tick(now + 60)[0]
    assert result["status"] == "failed" and "不存在" in result["error"]
    assert scheduler.tick(now + 61) == []
    assert len(store.all("SELECT * FROM routine_runs")) == 1
    assert store.all("SELECT * FROM messages") == []


def test_checkin_respects_quiet_hours_and_global_daily_budget(tmp_path):
    store = Store(tmp_path)
    now = utc("2026-11-01T14:59:00Z")  # Shanghai 22:59
    quiet = save_routine(store, {"prompt": "主动关心", "kind": "checkin", "run_at": now + 60}, now=now)
    scheduler = Scheduler(store)
    run = scheduler.tick(now + 60)[0]
    assert run["status"] == "skipped" and "安静" in run["error"]
    assert not store.all("SELECT * FROM tasks")
    tomorrow = utc("2026-11-02T01:00:00Z")
    bots = store.all("SELECT * FROM bots ORDER BY created_at,id")
    for bot in bots[:2]:
        save_routine(store, {"prompt": "主动关心", "kind": "checkin", "run_at": tomorrow + 60, "bot_id": bot["id"]}, now=tomorrow)
    runs = scheduler.tick(tomorrow + 60)
    assert sorted(r["status"] for r in runs) == ["queued", "skipped"]
    assert len(store.all("SELECT * FROM tasks")) == 1


def test_silent_check_is_not_an_unanswered_message(tmp_path):
    store = Store(tmp_path)
    first_day = utc("2026-11-01T01:00:00Z")
    save_routine(store, {"prompt": "有变化再联系", "kind": "checkin", "schedule": "daily", "time_of_day": "09:01"}, now=first_day)
    scheduler = Scheduler(store)
    first = scheduler.tick(first_day + 60)[0]
    store.execute("UPDATE tasks SET status='succeeded',result='本次保持安静' WHERE id=?", (first["task_id"],))
    second = scheduler.tick(first_day + 86400 + 60)[0]
    assert second["status"] == "queued"  # Yesterday's silence is not an unanswered check-in.
    task = store.one("SELECT * FROM tasks WHERE id=?", (second["task_id"],))
    store.execute("UPDATE tasks SET status='succeeded' WHERE id=?", (task["id"],))
    # Save an actual outbound message at its real send time, then verify the
    # next day's check waits for a reply rather than sending another greeting.
    sent_at = first_day + 86400 + 61
    store.execute("INSERT INTO messages(id,conversation_id,bot_id,role,content,task_id,metadata,created_at) VALUES ('checkin-message',?,?,'assistant','出现了新通知',?,'{}',?)", (task["conversation_id"], task["bot_id"], task["id"], sent_at))
    third = scheduler.tick(first_day + 2 * 86400 + 60)[0]
    assert third["status"] == "skipped" and "回复" in third["error"]


def test_scheduler_validation_and_manual_test_does_not_change_schedule(tmp_path):
    store = Store(tmp_path)
    now = utc("2026-11-01T00:00:00Z")
    with pytest.raises(ValueError, match="60"):
        save_routine(store, {"prompt": "x", "schedule": "interval", "interval_seconds": 0}, now=now)
    with pytest.raises(ValueError, match="时区"):
        save_routine(store, {"prompt": "x", "schedule": "daily", "time_of_day": "08:00", "timezone": "bad"}, now=now)
    routine = save_routine(store, {"prompt": "测试", "run_at": now + 3600, "enabled": False}, now=now)
    run = Scheduler(store).run_now(routine["id"], now=now)
    assert run["status"] == "succeeded"
    unchanged = store.one("SELECT * FROM routines WHERE id=?", (routine["id"],))
    assert unchanged["next_run_at"] == routine["next_run_at"] and not unchanged["enabled"]
