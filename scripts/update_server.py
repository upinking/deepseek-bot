"""Update application code through the user's SSH alias, retaining private data."""
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile

ROOT=Path(__file__).resolve().parent.parent
host=sys.argv[1] if len(sys.argv)>1 else 'your-server'
if not re.fullmatch(r'[A-Za-z0-9_.@-]+',host) or host.startswith('-'):
    raise SystemExit('SSH 别名格式无效')
with tempfile.TemporaryDirectory(prefix='deepseek-update-') as temp:
    archive=Path(temp)/'app.tgz'
    with tarfile.open(archive,'w:gz') as tar:
        for item in ['botapp','web','deploy','docs','scripts','tests','run.py','README.md','THIRD_PARTY_NOTICES.md','requirements.txt','requirements.lock.txt','Dockerfile','pytest.ini']:
            source=ROOT/item
            tar.add(source,arcname=item,filter=lambda info: None if '__pycache__' in Path(info.name).parts or info.name.endswith('.pyc') else info)
    subprocess.run(['scp','-q',str(archive),host+':/tmp/deepseek-bot-update.tgz'],check=True)
    remote='''from pathlib import Path
import subprocess, shutil, time, urllib.request
base=Path('/opt/deepseek-bot/app')
subprocess.run(['systemctl','stop','deepseek-bot'],check=True)
backup=Path('/opt/deepseek-bot')/('source-backup-'+str(time.time_ns()))
shutil.copytree(base,backup)
subprocess.run(['tar','-xzf','/tmp/deepseek-bot-update.tgz','-C',str(base)],check=True)
subprocess.run(['systemctl','start','deepseek-bot'],check=True)
for _ in range(20):
 try:
  if urllib.request.urlopen('http://127.0.0.1:8765/health',timeout=2).status==200:
   print('更新成功，原有数据、密钥和浏览器配置均保留。');break
 except Exception:time.sleep(1)
else:
 subprocess.run(['systemctl','stop','deepseek-bot'],check=True)
 shutil.rmtree(base);shutil.copytree(backup,base)
 subprocess.run(['systemctl','start','deepseek-bot'],check=True)
 raise SystemExit('新版本健康检查失败，已恢复更新前源码。')
'''
    subprocess.run(['ssh','-T',host,'sudo -n python3 -'],input=remote,text=True,check=True)
