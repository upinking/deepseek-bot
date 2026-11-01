from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager
import hashlib
import hmac
import json
import mimetypes
import os
from pathlib import Path
import secrets
import time
import uuid

import httpx
from fastapi import FastAPI, Request, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, HTMLResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles
from playwright.async_api import Error as BrowserError

from .browser import BrowserController
from .store import Store
from .runtime import Runtime
from .scheduler import Scheduler
from .domain import install_routes
from .profile import MAX_PROFILE_BODY_BYTES, read_profile, update_profile

ROOT = Path(__file__).resolve().parent.parent


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    value = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 260000).hex()
    return f"{salt}:{value}"


def password_valid(password, encoded):
    try:
        return hmac.compare_digest(password_hash(password, encoded.split(":")[0]), encoded)
    except Exception:
        return False


def create_app(data_dir=None, runtime_enabled=True):
    directory = Path(data_dir or os.getenv("BOT_DATA_DIR", str(ROOT / "data")))
    directory.mkdir(parents=True, exist_ok=True)
    directory.chmod(0o700)
    store = Store(directory)
    store.execute("CREATE TABLE IF NOT EXISTS push_subscriptions(endpoint TEXT PRIMARY KEY, subscription TEXT NOT NULL, created_at REAL NOT NULL)")
    if not store.get_setting("password_hash"):
        password = os.getenv("BOT_INITIAL_PASSWORD") or secrets.token_urlsafe(18)
        store.set_setting("password_hash", password_hash(password))
        password_file = directory / "bootstrap-password.txt"
        password_file.write_text(password + "\n")
        password_file.chmod(0o600)
    secrets_file = directory / "secrets.json"
    secret_data = {}
    if secrets_file.exists():
        secret_data = json.loads(secrets_file.read_text())
    env_key = os.getenv("DEEPSEEK_API_KEY")
    if env_key:
        secret_data["api_key"] = env_key
    # runtime读取同一进程中的私有配置，不在settings返回密钥。
    store.secrets = secret_data
    store.api_key = secret_data.get("api_key", "")
    browser = BrowserController(directory, store=store)
    runtime = Runtime(store, browser)
    scheduler = Scheduler(store)
    base_path = os.getenv("BOT_BASE_PATH", "").rstrip("/")
    auth_failures = {}

    @asynccontextmanager
    async def lifespan(app):
        if runtime_enabled:
            await browser.start()
            await runtime.start()
            await scheduler.start()
            notifications = asyncio.create_task(notification_loop(store, base_path))
        yield
        if runtime_enabled:
            notifications.cancel()
            await asyncio.gather(notifications, return_exceptions=True)
            await scheduler.close()
            await runtime.close()
            await browser.close()

    app = FastAPI(title="DeepSeek Bot", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.store, app.state.runtime, app.state.browser = store, runtime, browser

    @app.middleware("http")
    async def access(request, call_next):
        path = request.scope.get("path", request.url.path)
        mounted = request.scope.get("root_path", "")
        if mounted and (path == mounted or path.startswith(mounted + "/")):
            path = path[len(mounted):] or "/"
        public = path in {"/api/auth/status", "/api/auth/login", "/api/auth/setup", "/health"}
        if path.startswith("/api/") and not public:
            token = request.cookies.get("dsbot_session", "")
            row = store.one("SELECT expires_at FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),)) if token else None
            if not row or row["expires_at"] < time.time():
                return JSONResponse({"detail": "请先登录"}, status_code=401)
        if path.startswith("/api/") and request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            if origin:
                from urllib.parse import urlparse
                if urlparse(origin).netloc != request.headers.get("host"):
                    return JSONResponse({"detail":"请求来源不匹配"},status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(ValueError)
    async def value_error(request, exc):
        return JSONResponse({"detail":str(exc)},status_code=400)

    @app.exception_handler(BrowserError)
    async def browser_error(request, exc):
        return JSONResponse({"detail":"浏览器操作未完成。请刷新页面或重新接管后重试；网站可能超时或浏览器刚刚重启。"},status_code=503)

    @app.get("/health")
    async def health():
        return {"ok":True,"version":"0.1.0"}

    @app.get("/api/auth/status")
    async def auth_status(request: Request):
        token = request.cookies.get("dsbot_session", "")
        row = store.one("SELECT expires_at FROM sessions WHERE token_hash=?",(hashlib.sha256(token.encode()).hexdigest(),)) if token else None
        return {"authenticated":bool(row and row["expires_at"] > time.time()),"setup_required":False}

    @app.post("/api/auth/setup")
    async def auth_setup():
        raise HTTPException(409,"初始密码已在服务器私有文件中生成，请使用密码登录")

    @app.post("/api/auth/login")
    async def login(request: Request):
        ip = request.client.host if request.client else "unknown"
        failures = [x for x in auth_failures.get(ip,[]) if x > time.time()-300]
        if len(failures) >= 12:
            raise HTTPException(429,"尝试过于频繁，请五分钟后再试")
        body = await request.json()
        if not password_valid(str(body.get("password", "")), store.get_setting("password_hash")):
            auth_failures[ip] = failures + [time.time()]
            raise HTTPException(401,"密码不正确")
        auth_failures.pop(ip,None)
        token = secrets.token_urlsafe(32)
        store.execute("DELETE FROM sessions WHERE expires_at<?",(time.time(),))
        store.execute("INSERT INTO sessions(token_hash,expires_at) VALUES(?,?)",(hashlib.sha256(token.encode()).hexdigest(),time.time()+7*86400))
        response = JSONResponse({"ok":True})
        response.set_cookie("dsbot_session", token, max_age=7*86400, httponly=True, samesite="strict", secure=request.url.scheme=="https", path=base_path+"/")
        return response

    @app.post("/api/auth/logout")
    async def logout(request: Request):
        token = request.cookies.get("dsbot_session","")
        store.execute("DELETE FROM sessions WHERE token_hash=?",(hashlib.sha256(token.encode()).hexdigest(),))
        r=JSONResponse({"ok":True})
        r.delete_cookie("dsbot_session",path=base_path+"/")
        return r

    @app.get("/api/settings")
    async def settings():
        status=await browser.status()
        return {"model":store.get_setting("model","deepseek-flash"),"api_base":store.get_setting("api_base","https://api.deepseek.com"),"has_api_key":bool(store.api_key),"browser_available":status["available"],"browser_detail":status["detail"],"timezone":"Asia/Shanghai","push_configured":bool(store.one("SELECT endpoint FROM push_subscriptions LIMIT 1"))}

    @app.get("/api/profile")
    async def profile():
        return read_profile(store)

    @app.put("/api/profile")
    async def save_profile(request: Request):
        raw = await request.body()
        if len(raw) > MAX_PROFILE_BODY_BYTES:
            raise ValueError("个人资料超过大小限制，请缩小头像后重试")
        try:
            body = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            raise ValueError("个人资料格式无效") from None
        return update_profile(store, body)

    @app.put("/api/settings")
    async def update_settings(request: Request):
        body=await request.json()
        if "api_base" in body:
            value=str(body["api_base"]).rstrip("/")
            if value!="https://api.deepseek.com":
                raise ValueError("第一版使用 DeepSeek 官方地址 https://api.deepseek.com")
            store.set_setting("api_base",value)
        if "model" in body:
            model=str(body["model"]).strip()
            if model not in {"deepseek-flash","deepseek-v4-pro"}:
                raise ValueError("请选择 deepseek-flash 或 deepseek-v4-pro")
            store.set_setting("model",model)
        if body.get("api_key"):
            key=str(body["api_key"]).strip()
            if not 10 <= len(key) <= 300 or any(c.isspace() for c in key):
                raise ValueError("API 密钥格式不正确")
            store.api_key=key
            store.secrets["api_key"]=key
            temp=secrets_file.with_suffix(".tmp")
            fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
            with os.fdopen(fd,"w") as f:
                json.dump(store.secrets,f)
            os.replace(temp,secrets_file)
            secrets_file.chmod(0o600)
            # 显式配置后恢复此前因缺少配置等待的请求。
            store.execute("UPDATE tasks SET status='queued',error=NULL,updated_at=? WHERE status='waiting_config'",(time.time(),))
            await runtime.notify()
        if body.get("password"):
            value=str(body["password"])
            if len(value)<12:
                raise ValueError("登录密码至少12位")
            store.set_setting("password_hash",password_hash(value))
            store.execute("DELETE FROM sessions")
            (directory/"bootstrap-password.txt").unlink(missing_ok=True)
        return await settings()

    @app.post("/api/settings/test")
    async def test_provider():
        if not store.api_key:
            raise ValueError("请先保存 DeepSeek API 密钥")
        try:
            async with httpx.AsyncClient(timeout=45) as client:
                r=await client.post("https://api.deepseek.com/chat/completions",headers={"Authorization":"Bearer "+store.api_key},json={"model":store.get_setting("model","deepseek-flash"),"messages":[{"role":"user","content":"请只回复：连接成功"}],"max_tokens":30,"thinking":{"type":"disabled"}})
            if r.status_code!=200:
                return {"ok":False,"detail":f"DeepSeek 返回 HTTP {r.status_code}，请检查密钥、余额和模型"}
            result=r.json()
            return {"ok":True,"detail":"DeepSeek 实际调用成功","reply":result["choices"][0]["message"]["content"]}
        except Exception:
            return {"ok":False,"detail":"连接 DeepSeek 失败，请检查服务器网络后重试"}

    @app.get("/api/browser/{task_id}/snapshot")
    async def browser_snapshot(task_id: str):
        require_task(task_id)
        return await browser.task_snapshot(task_id)

    @app.get("/api/browser/{task_id}/screenshot")
    async def browser_screenshot(task_id: str):
        require_task(task_id)
        return Response(await browser.screenshot(task_id),media_type="image/png",headers={"Cache-Control":"no-store"})

    @app.post("/api/browser/{task_id}/action")
    async def browser_action(task_id: str, request: Request):
        task=require_task(task_id)
        if not task["takeover"]:
            raise HTTPException(409,"请先接管浏览器，再进行人工操作")
        body=await request.json()
        result=await browser.action(task_id,body.get("action"),body.get("args",{}),manual=True)
        store.event(task_id,"manual_action",{"action":body.get("action"),"url":result.get("url")})
        return result

    def require_task(task_id):
        task=store.one("SELECT * FROM tasks WHERE id=?",(task_id,))
        if not task:
            raise HTTPException(404,"任务不存在")
        return task

    @app.post("/api/files")
    async def upload_file(file: UploadFile=File(...)):
        fid=uuid.uuid4().hex
        dest=directory/"files"/fid
        dest.parent.mkdir(parents=True,exist_ok=True)
        size=0
        with dest.open("wb") as output:
            while chunk:=await file.read(1024*1024):
                size+=len(chunk)
                if size>30*1024*1024:
                    output.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(413,"文件超过30MB限制")
                output.write(chunk)
        name=Path(file.filename or "file").name[:150]
        mime=file.content_type or "application/octet-stream"
        store.execute("INSERT INTO files(id,name,path,mime,size,task_id,created_at) VALUES(?,?,?,?,?,NULL,?)",(fid,name,str(dest),mime,size,time.time()))
        return {"id":fid,"name":name,"size":size,"mime":mime,"url":f"/api/files/{fid}/download"}

    @app.get("/api/files")
    async def files():
        return [{k:v for k,v in f.items() if k!="path"} for f in store.all("SELECT * FROM files ORDER BY created_at DESC LIMIT 200")]

    @app.get("/api/files/{fid}/download")
    async def download_file(fid: str):
        f=store.one("SELECT * FROM files WHERE id=?",(fid,))
        if not f or not Path(f["path"]).is_file() or not any(Path(f["path"]).resolve().is_relative_to((directory/folder).resolve()) for folder in ("files", "workspace")):
            raise HTTPException(404,"文件不存在")
        return FileResponse(f["path"],filename=f["name"],media_type="application/octet-stream",headers={"Content-Security-Policy":"sandbox"})

    @app.get("/api/push/key")
    async def push_key():
        _,pub=ensure_vapid(directory)
        return {"public_key":pub}

    @app.post("/api/push/subscribe")
    async def push_subscribe(request: Request):
        body=await request.json()
        subscription=body.get("subscription",body)
        endpoint=subscription.get("endpoint","")
        await browser._valid_url(endpoint)
        if not endpoint.startswith("https://") or not subscription.get("keys",{}).get("p256dh") or not subscription.get("keys",{}).get("auth"):
            raise ValueError("推送订阅信息不完整")
        store.execute("INSERT OR REPLACE INTO push_subscriptions VALUES(?,?,?)",(endpoint,json.dumps(subscription),time.time()))
        return {"ok":True}

    @app.delete("/api/push/subscribe")
    async def push_unsubscribe(request: Request):
        body=await request.json()
        store.execute("DELETE FROM push_subscriptions WHERE endpoint=?",(body.get("endpoint"),))
        return {"ok":True}

    @app.post("/api/push/test")
    async def push_test():
        sent=await send_push(store,{"title":"DeepSeek Bot","body":"测试通知：云端消息已到达推送服务","url":base_path+"/"})
        return {"ok":sent>0,"detail":f"已向 {sent} 个订阅提交测试通知；请检查手机是否显示"}

    install_routes(app,store,runtime)

    @app.get("/")
    async def index():
        p=ROOT/"web"/"index.html"
        if not p.exists():
            return HTMLResponse("<h1>DeepSeek Bot</h1><p>界面正在准备中</p>")
        source=p.read_text()
        injection=f'<script>window.BOT_BASE_PATH={json.dumps(base_path)};</script>'
        return HTMLResponse(source.replace("<head>","<head>"+injection,1),headers={"Cache-Control":"no-cache"})

    (ROOT/"web").mkdir(exist_ok=True)
    app.mount("/",StaticFiles(directory=ROOT/"web"),name="static")
    return app


def ensure_vapid(directory):
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    path=directory/"vapid.pem"
    if path.exists():
        key=serialization.load_pem_private_key(path.read_bytes(),password=None)
    else:
        key=ec.generate_private_key(ec.SECP256R1())
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,"wb") as f:
            f.write(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    pub=key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
    return str(path),base64.urlsafe_b64encode(pub).rstrip(b"=").decode()


async def send_push(store,payload):
    from pywebpush import webpush, WebPushException
    private,_=ensure_vapid(store.data_dir)
    sent=0
    for row in store.all("SELECT * FROM push_subscriptions"):
        try:
            await asyncio.to_thread(webpush,subscription_info=json.loads(row["subscription"]),data=json.dumps(payload,ensure_ascii=False),vapid_private_key=private,vapid_claims={"sub":os.getenv("BOT_VAPID_SUBJECT","mailto:admin@example.com")},timeout=12)
            sent+=1
        except WebPushException as exc:
            if exc.response is not None and exc.response.status_code in {404,410}:
                store.execute("DELETE FROM push_subscriptions WHERE endpoint=?",(row["endpoint"],))
        except Exception:
            pass
    return sent


async def notification_loop(store,base_path):
    last=store.get_setting("push_cursor",time.time())
    while True:
        await asyncio.sleep(3)
        messages=store.all("SELECT m.*,b.name bot_name FROM messages m LEFT JOIN bots b ON m.bot_id=b.id WHERE m.created_at>? AND m.role='assistant' ORDER BY m.created_at LIMIT 100",(last,))
        for message in messages:
            await send_push(store,{"title":message.get("bot_name") or "DeepSeek Bot","body":message["content"][:140],"url":f"{base_path}/?conversation={message['conversation_id']}"})
            last=message["created_at"]
            store.set_setting("push_cursor",last)
