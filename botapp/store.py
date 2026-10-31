"""SQLite persistence shared by the API, task worker and scheduler.

Each operation owns a short-lived connection.  A transaction holds a write lock
only while changing state; model and browser work must happen outside it.
"""
from __future__ import annotations

from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3
import time
import uuid


JSON_COLUMNS = {"members", "metadata", "source", "context", "detail", "skill_snapshot"}
BOOL_COLUMNS = {"is_primary", "enabled", "stop_requested", "takeover"}


def uid() -> str:
    return uuid.uuid4().hex


def dumps(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def decode_row(row):
    if row is None:
        return None
    result = dict(row)
    for key in JSON_COLUMNS.intersection(result):
        if isinstance(result[key], str):
            try:
                result[key] = json.loads(result[key])
            except (ValueError, TypeError):
                result[key] = None
    for key in BOOL_COLUMNS.intersection(result):
        result[key] = bool(result[key])
    return result


SCHEMA = """
CREATE TABLE IF NOT EXISTS bots (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT '',
 avatar TEXT NOT NULL DEFAULT 'echo', color TEXT NOT NULL DEFAULT '#5959df',
 is_primary INTEGER NOT NULL DEFAULT 0, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS conversations (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'direct',
 members TEXT NOT NULL DEFAULT '[]', created_at REAL NOT NULL, updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, bot_id TEXT,
 role TEXT NOT NULL, content TEXT NOT NULL, task_id TEXT,
 metadata TEXT NOT NULL DEFAULT '{}', created_at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id,created_at,id);
CREATE TABLE IF NOT EXISTS memories (
 id TEXT PRIMARY KEY, bot_id TEXT, content TEXT NOT NULL,
 created_at REAL NOT NULL, updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, bot_id TEXT NOT NULL,
 prompt TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'chat', status TEXT NOT NULL DEFAULT 'queued',
 parent_id TEXT, source TEXT NOT NULL DEFAULT '{}', context TEXT NOT NULL DEFAULT '{}',
 error TEXT, result TEXT, stop_requested INTEGER NOT NULL DEFAULT 0,
 takeover INTEGER NOT NULL DEFAULT 0, created_at REAL NOT NULL, updated_at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS tasks_status ON tasks(status,created_at);
CREATE INDEX IF NOT EXISTS tasks_conversation ON tasks(conversation_id,created_at);
CREATE TABLE IF NOT EXISTS events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, kind TEXT NOT NULL,
 detail TEXT NOT NULL DEFAULT '{}', created_at REAL NOT NULL);
CREATE INDEX IF NOT EXISTS events_task ON events(task_id,id);
CREATE TABLE IF NOT EXISTS skills (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, content TEXT NOT NULL, bot_id TEXT,
 version INTEGER NOT NULL DEFAULT 1, created_at REAL NOT NULL, updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS routines (
 id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
 name TEXT NOT NULL, prompt TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'reminder',
 schedule TEXT NOT NULL DEFAULT 'once', run_at REAL, time_of_day TEXT,
 interval_seconds REAL, timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
 enabled INTEGER NOT NULL DEFAULT 1, next_run_at REAL, last_run_at REAL,
 skill_id TEXT, skill_snapshot TEXT, last_result TEXT, created_at REAL NOT NULL,
 updated_at REAL, quiet_start TEXT DEFAULT '23:00', quiet_end TEXT DEFAULT '08:00',
 max_daily INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS routines_due ON routines(enabled,next_run_at);
CREATE TABLE IF NOT EXISTS routine_runs (
 id TEXT PRIMARY KEY, routine_id TEXT NOT NULL, task_id TEXT,
 status TEXT NOT NULL, scheduled_at REAL NOT NULL, created_at REAL NOT NULL,
 finished_at REAL, error TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS routine_run_claim ON routine_runs(routine_id,scheduled_at);
CREATE TABLE IF NOT EXISTS files (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, mime TEXT,
 size INTEGER NOT NULL, task_id TEXT, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, expires_at REAL NOT NULL);
"""


class Store:
    def __init__(self, data_dir):
        self.data_dir = Path(data_dir).expanduser().resolve()
        self.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        for folder in ("files", "workspace"):
            (self.data_dir / folder).mkdir(exist_ok=True, mode=0o700)
        self.db_path = self.data_dir / "bot.sqlite3"
        db = self._connect()
        try:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript(SCHEMA)
            self._migrate(db)
        finally:
            db.close()
        try:
            self.db_path.chmod(0o600)
        except OSError:
            pass
        self._defaults()
        self.recover_interrupted_tasks()

    def _connect(self):
        db = sqlite3.connect(self.db_path, timeout=10, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA busy_timeout=10000")
        db.execute("PRAGMA foreign_keys=ON")
        return db

    @staticmethod
    def _migrate(db):
        # Additive, repeatable migrations for databases created by earlier v1 runs.
        additions = {
            "skills": {"version": "INTEGER NOT NULL DEFAULT 1"},
            "routines": {
                "updated_at": "REAL", "skill_snapshot": "TEXT",
                "quiet_start": "TEXT DEFAULT '23:00'", "quiet_end": "TEXT DEFAULT '08:00'",
                "max_daily": "INTEGER NOT NULL DEFAULT 1",
            },
        }
        for table, columns in additions.items():
            existing = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
            for column, definition in columns.items():
                if column not in existing:
                    db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    @contextmanager
    def transaction(self):
        db = self._connect()
        try:
            db.execute("BEGIN IMMEDIATE")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def all(self, sql, params=()):
        db = self._connect()
        try:
            return [dict(row) for row in db.execute(sql, params).fetchall()]
        finally:
            db.close()

    def one(self, sql, params=()):
        db = self._connect()
        try:
            row = db.execute(sql, params).fetchone()
            return dict(row) if row else None
        finally:
            db.close()

    def execute(self, sql, params=()):
        with self.transaction() as db:
            cursor = db.execute(sql, params)
            return cursor.lastrowid

    def get_setting(self, key, default=None):
        row = self.one("SELECT value FROM settings WHERE key=?", (key,))
        if not row:
            return default
        try:
            return json.loads(row["value"])
        except (ValueError, TypeError):
            return default

    def set_setting(self, key, value):
        self.execute("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, dumps(value)))

    def get_memory_epoch(self, bot_id=None):
        """History older than a correction/forget boundary must not be replayed."""
        shared = self.get_setting("memory_epoch:shared", 0)
        private = self.get_setting("memory_epoch:" + str(bot_id), 0) if bot_id is not None else 0
        return max(float(shared or 0), float(private or 0))

    def bump_memory_epoch(self, bot_id=None, connection=None):
        """Atomically invalidate prior remembered context for one scope.

        Passing an existing write connection lets a memory edit and its epoch
        commit together, so a worker cannot observe only half of the change.
        """
        key = "memory_epoch:shared" if bot_id is None else "memory_epoch:" + str(bot_id)

        def bump(db):
            row = db.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
            old = float(json.loads(row["value"])) if row else 0
            epoch = max(time.time(), old + 0.000001)
            db.execute("INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, dumps(epoch)))
            return epoch

        if connection is not None:
            return bump(connection)
        with self.transaction() as db:
            return bump(db)

    def event(self, task_id, kind, detail):
        return self.execute("INSERT INTO events(task_id,kind,detail,created_at) VALUES (?,?,?,?)", (task_id, kind, dumps(detail), time.time()))

    def add_message(self, conversation_id, bot_id, role, content, task_id=None, metadata=None):
        now, message_id = time.time(), uid()
        with self.transaction() as db:
            db.execute("INSERT INTO messages(id,conversation_id,bot_id,role,content,task_id,metadata,created_at) VALUES (?,?,?,?,?,?,?,?)", (message_id, conversation_id, bot_id, role, content, task_id, dumps(metadata or {}), now))
            db.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now, conversation_id))
        return self.one("SELECT * FROM messages WHERE id=?", (message_id,))

    def create_task(self, conversation_id, bot_id, prompt, kind="chat", parent_id=None, source=None):
        now, task_id = time.time(), uid()
        with self.transaction() as db:
            task = self.insert_task(db, conversation_id, bot_id, prompt, kind, parent_id, source, now, task_id)
        return task

    @staticmethod
    def insert_task(db, conversation_id, bot_id, prompt, kind="chat", parent_id=None, source=None, now=None, task_id=None):
        now = time.time() if now is None else now
        task_id = task_id or uid()
        db.execute("INSERT INTO tasks(id,conversation_id,bot_id,prompt,kind,status,parent_id,source,context,created_at,updated_at) VALUES (?,?,?,?,?,'queued',?,?,'{}',?,?)", (task_id, conversation_id, bot_id, prompt, kind, parent_id, dumps(source or {}), now, now))
        db.execute("INSERT INTO events(task_id,kind,detail,created_at) VALUES (?,'queued',?,?)", (task_id, dumps({"kind": kind}), now))
        db.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now, conversation_id))
        return dict(db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone())

    def recover_interrupted_tasks(self):
        now = time.time()
        with self.transaction() as db:
            rows = db.execute("SELECT id FROM tasks WHERE status='running'").fetchall()
            for row in rows:
                db.execute("UPDATE tasks SET status='paused',stop_requested=1,error=?,updated_at=? WHERE id=?", ("服务重启使任务中断；请查看最后一步后手动恢复，外部动作不会自动重放。", now, row["id"]))
                db.execute("INSERT INTO events(task_id,kind,detail,created_at) VALUES (?,'recovered_paused',?,?)", (row["id"], dumps({"reason": "服务重启，已暂停以避免重复外部动作"}), now))
            # A claim without a durable task is an interrupted dispatch, not a reason
            # to repeat a reminder or potentially repeat an external action.
            db.execute("UPDATE routine_runs SET status='failed',error=?,finished_at=? WHERE status='running' AND task_id IS NULL", ("服务在投递时中断；未自动重试，请检查后手动运行。", now))

    def _defaults(self):
        now = time.time()
        with self.transaction() as db:
            if db.execute("SELECT 1 FROM bots LIMIT 1").fetchone():
                return
            entries = [
                ("Echo", "你的主要助手，负责协调任务、清楚解释进展，并在需要时联系你。", "echo", "#5454d4", 1),
                ("Scout", "研究助手。查找当前来源、区分事实和推断，并返回可核查的链接。", "scout", "#f0a11b", 0),
                ("Momo", "生活助手。帮助整理日常安排、建立提醒，尊重安静时段。", "momo", "#e34b9a", 0),
            ]
            for name, role, avatar, color, primary in entries:
                bot_id, conversation_id = uid(), uid()
                db.execute("INSERT INTO bots VALUES (?,?,?,?,?,?,?)", (bot_id, name, role, avatar, color, primary, now))
                db.execute("INSERT INTO conversations VALUES (?,?,?,?,?,?)", (conversation_id, name, "direct", dumps([bot_id]), now, now))
