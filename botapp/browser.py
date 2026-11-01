"""受控的持久 Chrome：只暴露页面动作，不执行模型提供的代码。"""
from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import mimetypes
import os
import re
import socket
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse


def _browser_crashed(exc):
    text = str(exc).lower()
    return any(token in text for token in ("target crashed", "target closed", "page crashed", "browser has been closed"))


class BrowserController:
    def __init__(self, data_dir, cdp_url=None, store=None):
        self.data_dir = Path(data_dir)
        self.cdp_url = cdp_url or os.getenv("BOT_CDP_URL")
        self.store = store
        self.lock = asyncio.Lock()
        self.context = self.browser = self.playwright = None
        self.pages = {}
        self.refs = {}
        self.tab_ids = {}
        self.error = None
        self._dns_cache = {}
        self._configured = set()
        self._downloads = {}
        self._download_jobs = {}
        self._recovering = False
        if store:
            store.execute("CREATE TABLE IF NOT EXISTS browser_tabs(target_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, tab_id TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0, updated_at REAL NOT NULL)")

    async def start(self):
        try:
            from playwright.async_api import async_playwright
            self.playwright = await async_playwright().start()
            if self.cdp_url:
                self.browser = await self.playwright.chromium.connect_over_cdp(self.cdp_url, timeout=12000)
                self.context = self.browser.contexts[0]
            else:
                profile = self.data_dir / "browser-profile"
                profile.mkdir(parents=True, exist_ok=True)
                executable = os.getenv("BOT_CHROME_EXECUTABLE")
                kw = {"executable_path": executable} if executable else {"channel": "chrome"}
                self.context = await self.playwright.chromium.launch_persistent_context(
                    str(profile), headless=True, viewport={"width": 1280, "height": 800},
                    accept_downloads=True, args=["--disable-dev-shm-usage"], **kw)
                self.browser = self.context.browser
            self.context.set_default_timeout(12000)
            await self.context.route("**/*", self._route)
            await self.context.route_web_socket("**/*", self._websocket)
            if self.cdp_url and self.store:
                records={r["target_id"]:r for r in self.store.all("SELECT * FROM browser_tabs")}
                for p in self.context.pages:
                    target=await self._target_id(p)
                    old=records.get(target)
                    if old:
                        task_id=old["task_id"]
                        p._bot_task_id=task_id
                        self.tab_ids.setdefault(task_id,{})[old["tab_id"]]=p
                        if old["active"] or task_id not in self.pages:
                            self.pages[task_id]=p
            self.error = None
        except Exception as exc:
            self.error = f"浏览器暂不可用：{type(exc).__name__}。请检查 Chrome 服务。"

    async def close(self):
        if self.context and not self.cdp_url:
            await self.context.close()
        if self.playwright:
            await self.playwright.stop()
        self.context = None

    async def status(self):
        connected=self.context is not None and (self.browser is None or self.browser.is_connected())
        return {"available": connected, "detail": self.error or ("云浏览器已连接" if connected else "浏览器尚未连接；下次操作将尝试重连")}

    async def _valid_url(self, url):
        p = urlparse(url)
        if p.scheme not in ("http", "https") or not p.hostname or p.username or p.password:
            raise ValueError("只允许有效的 HTTP/HTTPS 网页地址")
        host = p.hostname.lower().rstrip(".")
        if host in {"metadata.tencentyun.com", "metadata.google.internal"}:
            raise ValueError("不允许访问服务器内部地址")
        allow = {x.strip() for x in os.getenv("BOT_BROWSER_ALLOW_HOSTS", "").split(",") if x.strip()}
        if host in allow:
            return
        cached = self._dns_cache.get(host)
        if not cached or cached[0] < time.time():
            try:
                entries = await asyncio.to_thread(socket.getaddrinfo, host, p.port or (443 if p.scheme == "https" else 80), 0, socket.SOCK_STREAM)
            except OSError:
                raise ValueError("网页域名无法解析")
            ips = {e[4][0] for e in entries}
            if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
                raise ValueError("不允许访问本机、内网或云平台元数据地址")
            self._dns_cache[host] = (time.time() + 10, ips)

    async def _route(self, route):
        try:
            if route.request.url.startswith(("data:", "blob:")):
                await route.continue_()
                return
            await self._valid_url(route.request.url)
            await route.continue_()
        except Exception:
            await route.abort()

    async def _websocket(self, route):
        try:
            url = route.url
            await self._valid_url(url.replace("wss://", "https://", 1).replace("ws://", "http://", 1))
            route.connect_to_server()
        except Exception:
            await route.close()

    async def _disconnect(self):
        playwright = self.playwright
        self.context = self.browser = self.playwright = None
        self.pages.clear()
        self.refs.clear()
        self.tab_ids.clear()
        self._configured.clear()
        if playwright:
            try:
                await playwright.stop()
            except Exception:
                pass

    async def _recover(self, operation):
        try:
            return await operation()
        except Exception as exc:
            if self._recovering or not _browser_crashed(exc):
                raise
            self._recovering = True
            try:
                await self._disconnect()
                await self.start()
                if self.context is None:
                    raise ValueError(self.error or "云浏览器暂不可用") from exc
                return await operation()
            except Exception as again:
                if _browser_crashed(again):
                    raise ValueError("云浏览器的页面进程已崩溃，新页面暂时打不开。请稍后重试；查阅公开网页可改用网页搜索。") from again
                raise
            finally:
                self._recovering = False

    async def _page(self, task_id):
        return await self._recover(lambda: self._acquire_page(task_id))

    async def _acquire_page(self, task_id):
        if self.context is None or (self.browser and not self.browser.is_connected()):
            if self.playwright:
                await self.playwright.stop()
            self.context=self.browser=self.playwright=None
            self.pages.clear();self.refs.clear();self.tab_ids.clear();self._configured.clear()
            await self.start()
        if self.context is None:
            raise ValueError(self.error or "浏览器尚未连接")
        p = self.pages.get(task_id)
        if p is None or p.is_closed():
            # 恢复同一专用配置中的任务标签；不接管其他任务页面。
            p = next((x for x in self.context.pages if getattr(x, "_bot_task_id", None) == task_id and not x.is_closed()), None)
            if p is None:
                # 结束任务的标签最多保留六个，避免2GB机器长期积累渲染进程。
                for owner, old in list(self.pages.items()):
                    if len([x for x in self.pages.values() if not x.is_closed()])<6:
                        break
                    state=self.store.one("SELECT status FROM tasks WHERE id=?",(owner,)) if self.store else None
                    if owner!=task_id and (not state or state["status"] in {"succeeded","failed","cancelled"}):
                        for tab in self.tab_ids.pop(owner,{}).values():
                            if not tab.is_closed():await tab.close()
                        self.pages.pop(owner,None);self.refs.pop(owner,None)
                p = await self.context.new_page()
                p._bot_task_id = task_id
            self.pages[task_id] = p
            self.tab_ids.setdefault(task_id, {})[uuid.uuid4().hex[:8]] = p
        if id(p) not in self._configured:
            self._configured.add(id(p))
            p.on("dialog", lambda d: asyncio.create_task(d.dismiss()))
            p.on("download", lambda d: asyncio.create_task(self._save_download(task_id, d)))
            await self._remember_page(task_id,p)
        return p

    async def _target_id(self,page):
        cdp=await self.context.new_cdp_session(page)
        try:
            data=await cdp.send("Target.getTargetInfo")
            return data["targetInfo"]["targetId"]
        finally:
            await cdp.detach()

    async def _remember_page(self,task_id,page):
        if not self.store:return
        target=await self._target_id(page)
        tab_id=next((k for k,v in self.tab_ids.get(task_id,{}).items() if v is page),uuid.uuid4().hex[:8])
        with self.store.transaction() as db:
            db.execute("UPDATE browser_tabs SET active=0 WHERE task_id=?",(task_id,))
            db.execute("INSERT OR REPLACE INTO browser_tabs VALUES(?,?,?,?,?)",(target,task_id,tab_id,1,time.time()))

    async def _save_download(self, task_id, download):
        if not self.store:
            return
        marker = id(download)
        job = self._download_jobs.get(marker)
        if job is None:
            job = asyncio.create_task(self._save_download_once(task_id, download))
            self._download_jobs[marker] = job
        await job

    async def _save_download_once(self, task_id, download):
        fid = uuid.uuid4().hex
        name = Path(download.suggested_filename).name[:150] or "download"
        dest = self.data_dir / "files" / fid
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            await download.save_as(str(dest))
            if dest.stat().st_size > 30 * 1024 * 1024:
                dest.unlink(missing_ok=True)
                self.store.event(task_id, "download_error", {"message": "下载文件超过30MB限制"})
                return
            self.store.execute("INSERT INTO files(id,name,path,mime,size,task_id,created_at) VALUES(?,?,?,?,?,?,?)", (fid,name,str(dest),mimetypes.guess_type(name)[0] or "application/octet-stream",dest.stat().st_size,task_id,time.time()))
            self._downloads.setdefault(task_id, []).append({"id": fid,"name":name,"url":f"/api/files/{fid}/download"})
            self.store.event(task_id,"file",{"id":fid,"name":name})
        except Exception:
            self.store.event(task_id,"download_error",{"message":"下载失败，请检查文件来源"})

    async def _snapshot(self, task_id):
        return await self._recover(lambda: self._read_snapshot(task_id))

    async def _read_snapshot(self, task_id):
        p = await self._acquire_page(task_id)
        # 序号只绑定这次观察；从不向模型返回输入框的现有值。
        data = await p.evaluate("""() => {
          const els=[...document.querySelectorAll('a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]')]
            .filter(e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden').slice(0,180);
          if(!window.__dsbotDoc) { window.__dsbotDoc=Math.random().toString(36).slice(2,8); window.__dsbotCounter=0; }
          const items=els.map((e,i)=>{
            const ref=e.getAttribute('data-dsbot-ref') || 'e'+window.__dsbotDoc+'_'+window.__dsbotCounter++;e.setAttribute('data-dsbot-ref',ref);
            const label=e.getAttribute('aria-label') || e.labels?.[0]?.innerText || e.getAttribute('placeholder') || e.innerText || e.getAttribute('title') || (['submit','button'].includes(e.type)?e.value:'') || e.name || '';
            return {ref,role:e.getAttribute('role')||e.tagName.toLowerCase(),name:label.trim().slice(0,180),type:e.type||'',sensitive:e.type==='password',submit:['BUTTON','INPUT'].includes(e.tagName)&&e.type==='submit',form_method:e.form?.method?.toUpperCase()||''};
          });
          return {title:document.title,url:location.href,text:(document.body?.innerText||'').slice(0,22000),elements:items};
        }""")
        self.refs[task_id] = {x["ref"]: x for x in data["elements"]}
        data["downloads"] = self._downloads.get(task_id, [])[-10:]
        data["image_url"] = f"/api/browser/{task_id}/screenshot?t={int(time.time())}"
        return data

    async def task_snapshot(self, task_id):
        async with self.lock:
            return await self._snapshot(task_id)

    async def screenshot(self, task_id):
        async with self.lock:
            async def once():
                p = await self._acquire_page(task_id)
                # CDP can retain this task as an inactive tab after another task
                # runs. Focus it so headless Chrome actually paints the frame.
                await p.bring_to_front()
                return await p.screenshot(type="png", timeout=12000)
            return await self._recover(once)

    async def requires_approval(self, task_id, action, args):
        if action in ("upload",):
            return True
        if action == "keypress" and str(args.get("key", "")).lower() in {"enter", "return"}:
            return True
        if action not in ("click", "download"):
            return False
        item = self.refs.get(task_id, {}).get(args.get("ref"), {})
        label = item.get("name", "")
        return bool(item.get("sensitive") or (item.get("submit") and item.get("form_method")!="GET") or re.search(r"发送|发布|购买|付款|支付|删除|提交|确认订单|send|publish|purchase|pay\b|delete|submit|checkout", label, re.I))

    async def action(self, task_id, action, args=None, manual=False):
        args = args or {}
        async with self.lock:
            p = await self._page(task_id)
            if action in {"open", "new_tab"}:
                url = str(args.get("url", ""))
                await self._valid_url(url)
                if action == "new_tab":
                    p = await self.context.new_page()
                    p._bot_task_id = task_id
                    self.pages[task_id] = p
                    self.tab_ids.setdefault(task_id,{})[uuid.uuid4().hex[:8]]=p
                    await self._page(task_id)
                async def open_page():
                    nonlocal p
                    await p.goto(url, wait_until="domcontentloaded", timeout=25000)
                    return p
                async def reopen():
                    nonlocal p
                    p = await self._acquire_page(task_id)
                    await p.goto(url, wait_until="domcontentloaded", timeout=25000)
                    return p
                try:
                    await open_page()
                except Exception as exc:
                    if not _browser_crashed(exc):
                        raise
                    await self._recover(reopen)
            elif action == "snapshot":
                pass
            elif action in {"click", "fill", "download", "upload"}:
                ref = str(args.get("ref", ""))
                if ref not in self.refs.get(task_id, {}):
                    raise ValueError("页面引用已过期，请先重新读取页面")
                info = self.refs[task_id][ref]
                locator = p.locator(f'[data-dsbot-ref="{ref}"]')
                if info.get("sensitive") and not manual:
                    raise ValueError("密码输入需要你在接管模式中完成")
                if action == "fill":
                    await locator.fill(str(args.get("text", ""))[:12000])
                elif action == "upload":
                    f = self.store.one("SELECT * FROM files WHERE id=?",(args.get("file_id"),)) if self.store else None
                    if not f or not any(Path(f["path"]).resolve().is_relative_to((self.data_dir / folder).resolve()) for folder in ("files", "workspace")):
                        raise ValueError("只能上传本项目中为任务提供的文件")
                    await locator.set_input_files(f["path"])
                elif action == "download":
                    async with p.expect_download(timeout=20000) as info_d:
                        await locator.click()
                    await self._save_download(task_id, await info_d.value)
                else:
                    await locator.click(timeout=12000)
            elif action == "scroll":
                await p.mouse.wheel(0,max(-3000,min(3000,int(args.get("dy",600)))))
            elif action == "back":
                await p.go_back(wait_until="domcontentloaded")
            elif action == "keypress":
                key = str(args.get("key",""))
                if key not in {"Enter","Tab","Escape","ArrowDown","ArrowUp","Backspace","Control+A","Meta+A"}:
                    raise ValueError("不支持此按键")
                await p.keyboard.press(key)
            elif action == "coordinate_click" and manual:
                await p.mouse.click(max(0,min(1280,float(args.get("x",0)))),max(0,min(800,float(args.get("y",0)))))
            elif action == "switch_tab":
                tab = self.tab_ids.get(task_id,{}).get(args.get("tab_id"))
                if tab is None or tab.is_closed():
                    raise ValueError("标签页不存在")
                self.pages[task_id] = p = tab
                await self._remember_page(task_id,p)
            elif action == "tabs":
                return {"tabs":[{"tab_id":k,"url":v.url,"active":v is p} for k,v in self.tab_ids.get(task_id,{}).items() if not v.is_closed()]}
            else:
                raise ValueError("不支持此浏览器动作")
            try:
                await p.wait_for_load_state("domcontentloaded", timeout=1500)
            except Exception:
                pass
            return await self._snapshot(task_id)
