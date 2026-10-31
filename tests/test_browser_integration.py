"""Opt-in real Chrome acceptance against a local fixture, with no model stub."""
import asyncio
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from botapp.browser import BrowserController
from botapp.store import Store

pytestmark=pytest.mark.skipif(os.getenv('RUN_BROWSER_TESTS')!='1',reason='set RUN_BROWSER_TESTS=1 for real Chrome tests')


class Fixture(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path=='/file':
            self.send_response(200)
            self.send_header('Content-Disposition','attachment; filename="evidence.txt"')
            self.end_headers();self.wfile.write(b'real browser download evidence');return
        self.send_response(200)
        self.send_header('Content-Type','text/html; charset=utf-8')
        self.end_headers()
        self.wfile.write(b'''<!doctype html><title>Browser Fixture</title><h1>Task evidence</h1>
          <label>Name<input name="name" placeholder="Your name"></label>
          <label>Password<input type="password" name="password"></label>
          <button type="button" onclick="document.querySelector('h1').textContent='Clicked successfully'">Read result</button>
          <form><button>Submit message</button></form><a href="/file">Download evidence</a>''')


@pytest.mark.asyncio
async def test_real_actions_download_and_secret_redaction(tmp_path,monkeypatch):
    server=ThreadingHTTPServer(('127.0.0.1',0),Fixture)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    monkeypatch.setenv('BOT_BROWSER_ALLOW_HOSTS','127.0.0.1')
    browser=BrowserController(tmp_path,store=Store(tmp_path))
    await browser.start()
    try:
        assert (await browser.status())['available']
        page=await browser.action('test','open',{'url':f'http://127.0.0.1:{server.server_port}/'})
        elements=page['elements']
        name=next(x for x in elements if x['name']=='Name')
        secret=next(x for x in elements if x['type']=='password')
        click=next(x for x in elements if x['name']=='Read result')
        submit=next(x for x in elements if x['name']=='Submit message')
        assert not await browser.requires_approval('test','click',{'ref':click['ref']})
        assert await browser.requires_approval('test','click',{'ref':submit['ref']})
        await browser.action('test','fill',{'ref':name['ref'],'text':'student'})
        with pytest.raises(ValueError,match='接管'):
            await browser.action('test','fill',{'ref':secret['ref'],'text':'hidden-value'})
        await browser.action('test','fill',{'ref':secret['ref'],'text':'hidden-value'},manual=True)
        result=await browser.action('test','click',{'ref':click['ref']})
        assert 'Clicked successfully' in result['text']
        assert 'hidden-value' not in json.dumps(result)
        download=next(x for x in result['elements'] if x['name']=='Download evidence')
        await browser.action('test','download',{'ref':download['ref']})
        assert len(browser.store.all('SELECT * FROM files'))==1
        await browser.action('another-task','open',{'url':f'http://127.0.0.1:{server.server_port}/'})
        for _ in range(3):
            assert (await browser.screenshot('test')).startswith(b'\x89PNG')
        monkeypatch.setenv('BOT_BROWSER_ALLOW_HOSTS','')
        for url in ['file:///etc/passwd','http://127.0.0.1:9222','http://169.254.169.254','http://metadata.tencentyun.com']:
            with pytest.raises(ValueError):await browser._valid_url(url)
    finally:
        await browser.close();server.shutdown()


@pytest.mark.asyncio
async def test_persistent_cookie_survives_full_browser_restart(tmp_path):
    browser=BrowserController(tmp_path)
    await browser.start()
    try:
        assert (await browser.status())['available']
        import time
        await browser.context.add_cookies([{'name':'dsbot_acceptance','value':'persistent-probe','domain':'example.com','path':'/','secure':True,'expires':time.time()+3600}])
    finally:
        await browser.close()
    reopened=BrowserController(tmp_path)
    await reopened.start()
    try:
        values=await reopened.context.cookies('https://example.com')
        assert any(c['name']=='dsbot_acceptance' and c['value']=='persistent-probe' for c in values)
    finally:
        await reopened.close()
