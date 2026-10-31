import time
from fastapi import FastAPI
from fastapi.testclient import TestClient
from botapp.domain import install_routes
from botapp.store import Store


def test_new_message_steers_existing_active_task(tmp_path):
    store=Store(tmp_path)
    class Runtime:
        async def notify(self):pass
        async def steer_task(self,task_id,message,file_ids=None):
            store.event(task_id,'steered',{'message':message})
            store.execute("UPDATE tasks SET status='queued' WHERE id=?",(task_id,))
            return store.one('SELECT * FROM tasks WHERE id=?',(task_id,))
    app=FastAPI();install_routes(app,store,Runtime())
    with TestClient(app) as client:
        bot=client.get('/api/bots').json()[0]
        conv=bot['conversation_id']
        task=client.post(f'/api/conversations/{conv}/messages',json={'content':'原任务'}).json()['task']
        store.execute("UPDATE tasks SET status='running' WHERE id=?",(task['id'],))
        result=client.post(f'/api/conversations/{conv}/messages',json={'content':'请改为只读取第一页'})
        assert result.status_code==201
        assert result.json()['task']['id']==task['id']
        assert store.one('SELECT count(*) n FROM tasks')['n']==1
        assert store.one("SELECT * FROM events WHERE task_id=? AND kind='steered'",(task['id'],))
        assert client.get(f'/api/conversations/{conv}/messages').json()[-1]['content']=='请改为只读取第一页'
