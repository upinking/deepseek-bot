import json
import os
from fastapi.testclient import TestClient
from botapp.main import create_app


def session(tmp_path):
    app=create_app(tmp_path,runtime_enabled=False)
    client=TestClient(app)
    password=(tmp_path/'bootstrap-password.txt').read_text().strip()
    assert client.post('/api/auth/login',json={'password':password}).status_code==200
    return app,client


def test_auth_secret_and_csrf(tmp_path):
    app=create_app(tmp_path,runtime_enabled=False)
    client=TestClient(app)
    assert client.get('/api/bots').status_code==401
    assert client.post('/api/auth/login',json={'password':'wrong'}).status_code==401
    password=(tmp_path/'bootstrap-password.txt').read_text().strip()
    response=client.post('/api/auth/login',json={'password':password})
    assert response.status_code==200
    assert 'HttpOnly' in response.headers['set-cookie']
    assert client.post('/api/bots',json={'name':'X'},headers={'Origin':'https://evil.invalid'}).status_code==403
    key='sk-test-private-credentials-123456'
    assert client.put('/api/settings',json={'api_key':key}).status_code==200
    assert key not in client.get('/api/settings').text
    assert key not in app.state.store.db_path.read_bytes().decode(errors='ignore')
    assert (tmp_path/'secrets.json').stat().st_mode & 0o777==0o600
    client.post('/api/auth/logout')
    assert client.get('/api/bots').status_code==401


def test_files_authenticated_and_opaque(tmp_path):
    app,client=session(tmp_path)
    r=client.post('/api/files',files={'file':('../../payload.html',b'<script>alert(1)</script>','text/html')})
    assert r.status_code==200
    item=r.json()
    assert item['name']=='payload.html'
    fetched=client.get('/api/files/'+item['id']+'/download')
    assert fetched.status_code==200
    assert fetched.headers['content-type']=='application/octet-stream'
    assert 'attachment' in fetched.headers['content-disposition']
    assert 'path' not in client.get('/api/files').json()[0]
    assert client.get('/api/files/nonexistent/download').status_code==404


def test_prefix_and_push_key(tmp_path,monkeypatch):
    monkeypatch.setenv('BOT_BASE_PATH','/deepseek')
    from fastapi import FastAPI
    app=create_app(tmp_path,runtime_enabled=False)
    proxy=FastAPI();proxy.mount('/deepseek',app)
    client=TestClient(proxy)
    assert client.get('/deepseek/api/bots').status_code==401
    password=(tmp_path/'bootstrap-password.txt').read_text().strip()
    assert client.post('/deepseek/api/auth/login',json={'password':password}).status_code==200
    assert client.post('/deepseek/api/bots',json={'name':'bad-origin'},headers={'Origin':'https://evil.invalid'}).status_code==403
    status=client.get('/deepseek/api/push/key')
    assert status.status_code==200
    assert len(status.json()['public_key'])>60
    response=client.get('/deepseek/')
    assert 'window.BOT_BASE_PATH="/deepseek"' in response.text


def test_password_change_rejects_old_sessions(tmp_path):
    app,client=session(tmp_path)
    assert client.put('/api/settings',json={'password':'a-new-long-password-23456'}).status_code==200
    assert client.get('/api/settings').status_code==401
    assert client.post('/api/auth/login',json={'password':'a-new-long-password-23456'}).status_code==200
    assert not (tmp_path/'bootstrap-password.txt').exists()
