'use strict';

const BASE = String(window.BOT_BASE_PATH || '').replace(/\/$/, '');
function withBase(path) {
  if (typeof path !== 'string') return path;
  return path === '/api' || path.startsWith('/api/') ? BASE + path : path;
}
window.withBase = withBase;
const $ = function (id) { return document.getElementById(id); };
const STATUS = {queued:'排队中',running:'正在执行',waiting_config:'等待连接模型',waiting_user:'等待你补充',waiting_approval:'等待确认',paused:'已暂停',succeeded:'已完成',failed:'执行失败',cancelled:'已停止'};
const TERMINAL = new Set(['succeeded','failed','cancelled']);
const COLORS = ['#2d776b','#aa8a53','#8c78b1','#c97877','#758da8','#9b9e66'];
const PATHS = {
  search:['M21 21l-5-5','M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0'],
  plus:['M12 5v14M5 12h14'], close:['M6 6l12 12M18 6 6 18'],
  menu:['M4 6h16M4 12h16M4 18h16'], more:['M5 12h.01M12 12h.01M19 12h.01'],
  send:['M12 19V5M5 12l7-7 7 7'], browser:['M3 8h18M7 5h.01M10 5h.01','M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2'],
  tasks:['M9 5h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h1','M9 2h6v5H9zM8 12h8M8 17h5'],
  memory:['M9 3H6a3 3 0 0 0-3 3v3M15 3h3a3 3 0 0 1 3 3v3M21 15v3a3 3 0 0 1-3 3h-3M9 21H6a3 3 0 0 1-3-3v-3','M9 8h6v8H9z'],
  skill:['m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3z'],
  clock:['M12 8v5l3 2','M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
  file:['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5'],
  settings:['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8','M20 12l2-2-2-3-3 .5-1-3.5h-4l-1 3-3-.5-2 3 2 2-2 2 2 3 3-.5 1 3h4l1-3 3 .5 2-3z'],
  group:['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.8','M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M18 3a4 4 0 0 1 0 8'],
  edit:['m16 3 5 5M4 20l4-1L21 6a2 2 0 0 0-3-3L5 16z'],
  trash:['M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7'],
  refresh:['M20 8a8 8 0 1 0 0 8M20 3v5h-5'],
  arrow:['M5 12h14M13 6l6 6-6 6'], chevron:['m9 5 7 7-7 7'],
  stop:['M5 5h14v14H5z'], check:['m5 12 4 4L20 5'],
  download:['M12 3v12M7 10l5 5 5-5M4 17v4h16v-4'],
  upload:['M12 16V4M7 9l5-5 5 5M4 17v4h16v-4'],
  star:['m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z'],
  bell:['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4'],
  logout:['M9 3H4v18h5M10 12h11M16 7l5 5-5 5'],
  link:['M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l2-2']
};
function node(tag, className, content) {
  const value = document.createElement(tag);
  if (tag==='form') value.method='post';
  if (className) value.className = className;
  if (content !== undefined && content !== null) value.textContent = String(content);
  return value;
}
function icon(name) {
  const value = document.createElementNS('http://www.w3.org/2000/svg','svg');
  value.setAttribute('viewBox','0 0 24 24'); value.setAttribute('fill','none'); value.setAttribute('stroke','currentColor');
  value.setAttribute('stroke-width','1.65'); value.setAttribute('stroke-linecap','round'); value.setAttribute('stroke-linejoin','round');
  value.setAttribute('aria-hidden','true');
  (PATHS[name] || PATHS.plus).forEach(function (d) { const path = document.createElementNS(value.namespaceURI,'path'); path.setAttribute('d',d); value.append(path); });
  return value;
}
function avatar(bot, group) {
  if (group) { const svg = icon('group'); svg.classList.add('avatar','group-avatar'); return svg; }
  if (bot && bot.avatar === 'dafeiyu') {
    const image = node('img','avatar'); image.src = BASE + '/assets/icon.png'; image.alt = bot.name || '大肥鱼'; return image;
  }
  const color = bot && /^#[0-9a-f]{6}$/i.test(bot.color || '') ? bot.color : COLORS[0];
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 64 64'); svg.setAttribute('role','img'); svg.setAttribute('aria-label',bot && bot.name || 'Bot'); svg.classList.add('avatar');
  [['path',{d:'M34 5c14 0 25 13 25 27S45 59 31 59 6 47 6 33 20 5 34 5Z',fill:color}],
   ['path',{d:bot && bot.avatar === 'diamond' ? 'm20 31 12-12 12 12-12 13Z' : bot && bot.avatar === 'bloom' ? 'M32 19c5 10 3 8 13 13-10 5-8 3-13 13-5-10-3-8-13-13 10-5 8-3 13-13Z' : 'M22 27c7-6 14-6 21 0M22 37c6 5 13 5 19 1',fill:'none',stroke:'#f9fff8','stroke-width':'4','stroke-linecap':'round','stroke-linejoin':'round'}]]
    .forEach(function (item) { const shape = document.createElementNS(svg.namespaceURI,item[0]); Object.entries(item[1]).forEach(function (pair) { shape.setAttribute(pair[0],pair[1]); }); svg.append(shape); });
  return svg;
}
function btn(label, callback, variant, iconName) {
  const b = node('button','button ' + (variant || 'secondary'),label); b.type='button';
  if (iconName) b.prepend(icon(iconName)); if (callback) b.addEventListener('click',callback); return b;
}
function iconBtn(label, name, callback) {
  const b=node('button','icon-button'); b.type='button'; b.title=label; b.setAttribute('aria-label',label); b.append(icon(name)); b.addEventListener('click',callback); return b;
}
function hidden(element, value) { element.classList.toggle('hidden',Boolean(value)); }
function list(value) { if (Array.isArray(value)) return value; try { const parsed=JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; } }
function object(value) { if (value && typeof value === 'object') return value; try { return JSON.parse(value) || {}; } catch (_) { return {}; } }
function stamp(value, options) {
  if (!value) return '尚未运行';
  const date=new Date(Number(value)*1000);
  return Number.isNaN(date.getTime()) ? '时间未知' : new Intl.DateTimeFormat('zh-CN',Object.assign({timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false},options || {})).format(date);
}
function time(value) { return stamp(value,{month:undefined,day:undefined,hour:'2-digit',minute:'2-digit'}); }
function size(value) { const n=Number(value)||0; return n>=1048576 ? (n/1048576).toFixed(1)+' MB' : n>=1024 ? Math.round(n/1024)+' KB' : n+' B'; }
function statusPill(value) { return node('span','pill ' + value,STATUS[value] || value || '未知状态'); }
function toast(message, error, action) {
  const t=node('div','toast' + (error ? ' error' : '')); t.append(node('span','',message));
  if (action) t.append(btn(action.label,action.run,'compact'));
  $('toast-stack').append(t); setTimeout(function () { t.remove(); },error ? 7000 : 4200);
}
function errorText(detail) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map(function (d) { return d.msg || d.message || '提交内容有误'; }).join('；');
  return detail && (detail.message || detail.detail) || '请求未能完成，请稍后重试。';
}
async function api(path, options) {
  const opts=Object.assign({credentials:'same-origin',cache:'no-store'},options || {});
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers=Object.assign({'Content-Type':'application/json'},opts.headers || {});
    if (typeof opts.body !== 'string') opts.body=JSON.stringify(opts.body);
  }
  let response;
  try { response=await fetch(withBase(path),opts); } catch (_) { throw new Error(navigator.onLine ? '连接不到服务器，请检查网络或稍后重试。' : '当前已离线。联网后才能聊天、读取记录和执行操作。'); }
  let data;
  try { data=await response.json(); } catch (_) { throw new Error('服务器返回了无法读取的内容（HTTP '+response.status+'）。'); }
  if (!response.ok) {
    if (response.status===401 && state.authenticated) { state.authenticated=false; showAuth('登录已过期，请重新输入密码。'); }
    throw new Error(errorText(data.detail || data.error || data));
  }
  return data;
}
function mutation(path, method, body) { return api(path,{method:method || 'POST',body:body}); }
async function busy(button, callback) {
  if (button && button.disabled) return;
  if (button) button.disabled=true;
  try { return await callback(); } catch (e) { toast(e.message,true); }
  finally { if (button && button.isConnected) button.disabled=false; }
}
const state={
  authenticated:false,bots:[],conversations:[],tasks:[],files:[],settings:{},messages:[],conversationId:null,selectedTaskId:null,
  pendingFiles:[],messageSignature:'',browserSnapshot:null,browserImageError:false,browserOpen:matchMedia('(min-width:1220px)').matches,
  pollTimer:null,polling:false,pollCount:0,lastInteraction:Date.now(),lastBrowserRefresh:0,browserRefreshing:false,connected:false,
  modalView:null,detailTaskId:null,detailSignature:'',installPrompt:null,swRegistration:null,lastServerSync:0
};
function botById(id) { return state.bots.find(function (b) { return b.id===id; }); }
function botDescription(bot) {
  const summary=String(bot && bot.role || '').split(/\r?\n/).find(function (line) { return line.trim(); }) || '';
  return summary.length>160 ? summary.slice(0,157)+'…' : summary;
}
function conversation() { return state.conversations.find(function (c) { return c.id===state.conversationId; }); }
function currentBot() { const c=conversation(); return c && c.kind!=='group' ? botById(list(c.members)[0]) : null; }
function currentTasks() { return state.tasks.filter(function (t) { return t.conversation_id===state.conversationId; }).sort(function (a,b) { return b.created_at-a.created_at; }); }
function selectedTask() { return state.tasks.find(function (t) { return t.id===state.selectedTaskId; }); }
function primaryBot() { return state.bots.find(function (b) { return b.is_primary; }) || state.bots[0]; }
function connection(value, message) {
  state.connected=value;
  hidden($('connection-banner'),value);
  $('connection-banner').textContent=value ? '' : message || (navigator.onLine ? '连接中断，正在尝试恢复。当前显示的是上次同步的记录。' : '当前已离线 · 服务器上的任务仍由服务器处理，联网后同步结果。');
  $('sync-label').textContent=value ? '记录保存在云端' : '等待重新连接';
}
function showAuth(error) {
  clearTimeout(state.pollTimer); hidden($('app'),true); hidden($('auth-screen'),false);
  $('auth-title').textContent='欢迎回来'; $('auth-description').textContent='输入工作台密码，继续你的对话。';
  hidden($('auth-form'),false); hidden($('auth-retry'),true); $('auth-submit').disabled=false;
  $('auth-error').textContent=error || ''; hidden($('auth-error'),!error);
}
async function checkAuth() {
  try {
    const auth=await api('/api/auth/status');
    if (auth.authenticated) { state.authenticated=true; await loadWorkspace(); return; }
    showAuth();
    if (auth.setup_required) {
      $('auth-title').textContent='工作台正在初始化';
      $('auth-description').textContent='首次启动后，请使用服务器生成的登录密码。初始化完成后，点击重新连接。';
      hidden($('auth-form'),true); hidden($('auth-retry'),false);
    }
  } catch (e) {
    showAuth(e.message); $('auth-title').textContent='连接工作台'; hidden($('auth-retry'),false);
  }
}
async function loadWorkspace() {
  try {
    const data=await Promise.all([api('/api/bots'),api('/api/conversations'),api('/api/tasks'),api('/api/files'),api('/api/settings')]);
    state.bots=list(data[0]); state.conversations=list(data[1]); state.tasks=list(data[2]); state.files=list(data[3]); state.settings=data[4];
    const requested=new URL(location.href).searchParams.get('conversation');
    let remembered;
    try { remembered=localStorage.getItem('deepseek-conversation:'+BASE); } catch (_) {}
    const candidate=requested || state.conversationId || remembered;
    state.conversationId=state.conversations.some(function (c) { return c.id===candidate; }) ? candidate : (state.conversations.find(function (c) { const b=primaryBot(); return b && (c.id===b.conversation_id || list(c.members).includes(b.id)); }) || state.conversations[0] || {}).id;
    hidden($('auth-screen'),true); hidden($('app'),false); applyPanels(); renderContacts(); renderHeading(); renderSettingsBanner();
    connection(true); await loadMessages(true); renderActivity(); renderBrowserTasks();
    if (state.browserOpen && state.selectedTaskId) refreshBrowser();
    schedulePoll(1500);
  } catch (e) { showAuth(e.message); hidden($('auth-retry'),false); }
}
function schedulePoll(delay) { clearTimeout(state.pollTimer); if (state.authenticated) state.pollTimer=setTimeout(poll,delay); }
async function poll() {
  if (!state.authenticated || state.polling) return;
  state.polling=true;
  try {
    const data=await Promise.all([api('/api/tasks'),api('/api/conversations'),loadMessages(false)]);
    state.tasks=list(data[0]); state.conversations=list(data[1]); state.pollCount++;
    if (state.pollCount%5===0) {
      const more=await Promise.all([api('/api/bots'),api('/api/files'),api('/api/settings')]);
      state.bots=list(more[0]); state.files=list(more[1]); state.settings=more[2]; renderSettingsBanner();
    }
    state.lastServerSync=Date.now(); connection(true); renderContacts(); renderMessages(false); renderActivity(); renderBrowserTasks();
    if (state.detailTaskId && state.modalView==='task-detail') refreshTaskDetail();
    if (state.browserOpen && state.selectedTaskId && Date.now()-state.lastBrowserRefresh>5000) refreshBrowser();
  } catch (e) { if (state.authenticated) connection(false,e.message+' 当前显示上次同步的记录。'); }
  finally {
    state.polling=false;
    const active=state.tasks.some(function (t) { return !TERMINAL.has(t.status); });
    schedulePoll(document.hidden ? 15000 : active || Date.now()-state.lastInteraction<40000 ? 2000 : 7500);
  }
}
async function loadMessages(force) {
  const id=state.conversationId; if (!id) { state.messages=[]; renderMessages(true); return; }
  const messages=await api('/api/conversations/'+encodeURIComponent(id)+'/messages');
  if (id!==state.conversationId) return;
  state.messages=list(messages); renderMessages(force);
}
async function selectConversation(id) {
  if (!id) return;
  state.conversationId=id; state.messageSignature=''; state.selectedTaskId=null; state.browserSnapshot=null;
  try { localStorage.setItem('deepseek-conversation:'+BASE,id); } catch (_) {}
  const url=new URL(location.href); url.searchParams.set('conversation',id); history.replaceState(null,'',url);
  $('app').classList.remove('sidebar-open'); hidden($('sidebar-scrim'),true);
  applyPanels();
  renderContacts(); renderHeading(); renderActivity(); renderBrowserTasks(); resetBrowserPreview();
  try { await loadMessages(true); } catch (e) { $('messages').replaceChildren(node('div','load-error',e.message)); toast(e.message,true); }
  state.lastInteraction=Date.now(); schedulePoll(1500);
}
async function selectBot(bot) {
  let direct=state.conversations.find(function (c) { return c.id===bot.conversation_id || c.kind==='direct' && list(c.members).includes(bot.id); });
  if (!direct) { direct=await mutation('/api/conversations','POST',{title:bot.name,kind:'direct',members:[bot.id]}); state.conversations.push(direct); }
  await selectConversation(direct.id);
}
function renderContacts() {
  const query=$('contact-search').value.trim().toLowerCase(); const primary=primaryBot();
  $('primary-contact').replaceChildren();
  if (primary && (!query || (primary.name+' '+primary.role).toLowerCase().includes(query))) {
    const card=node('button','primary-card'+(currentBot() && currentBot().id===primary.id ? ' active' : ''));
    const wrap=node('div','avatar-wrap'); wrap.append(avatar(primary)); const star=node('span','primary-star'); star.append(icon('star')); wrap.append(star);
    card.append(wrap,node('strong','',primary.name),node('span','','主管 · 统筹你的工作')); card.onclick=function () { busy(card,function () { return selectBot(primary); }); }; $('primary-contact').append(card);
  }
  const contacts=$('contact-list'); const scroll=contacts.scrollTop; contacts.replaceChildren();
  const bots=state.bots.filter(function (b) { return (!primary || b.id!==primary.id) && (!query || (b.name+' '+b.role).toLowerCase().includes(query)); });
  const groups=state.conversations.filter(function (c) { return c.kind==='group' && (!query || c.title.toLowerCase().includes(query)); });
  if (bots.length) contacts.append(node('div','list-section-label','联系人'));
  bots.forEach(function (bot) {
    const direct=state.conversations.find(function (c) { return c.id===bot.conversation_id || c.kind==='direct' && list(c.members).includes(bot.id); });
    const active=direct && direct.id===state.conversationId; const b=node('button','contact'+(active?' active':''));
    b.append(avatar(bot)); const text=node('div','contact-text'); const title=node('div','contact-title'); title.append(node('strong','',bot.name));
    if (direct && direct.updated_at) title.append(node('time','',time(direct.updated_at)));
    let preview=bot.role || '发送消息，开始对话';
    if (direct && direct.last_message) preview=typeof direct.last_message==='object' ? direct.last_message.content : direct.last_message;
    else if (active && state.messages.length) preview=state.messages[state.messages.length-1].content;
    text.append(title,node('p','contact-preview',preview)); b.append(text); b.onclick=function () { busy(b,function () { return selectBot(bot); }); }; contacts.append(b);
  });
  if (groups.length) contacts.append(node('div','list-section-label','群聊'));
  groups.forEach(function (c) { const b=node('button','contact'+(c.id===state.conversationId?' active':'')); b.append(avatar(null,true)); const text=node('div','contact-text'); const title=node('div','contact-title'); title.append(node('strong','',c.title)); const members=list(c.members).map(function (id) { return (botById(id)||{}).name; }).filter(Boolean); text.append(title,node('p','contact-preview',members.join('、'))); b.append(text); b.onclick=function () { selectConversation(c.id); }; contacts.append(b); });
  if (!bots.length && !groups.length && query) contacts.append(node('p','contact-loading','没有找到匹配的联系人或群聊。'));
  contacts.scrollTop=scroll;
  const count=state.tasks.filter(function (t) { return !TERMINAL.has(t.status); }).length;
  $('sidebar-work-count').textContent=count ? count+' 项任务' : '';
}
function renderHeading() {
  const c=conversation(), bot=currentBot(), heading=$('conversation-heading'); heading.replaceChildren();
  heading.append(avatar(bot,c && c.kind==='group'));
  const text=node('div','heading-text'); text.append(node('h1','',c && c.kind==='group' ? c.title : bot && bot.name || '你的工作台'));
  text.append(node('p','',c && c.kind==='group' ? list(c.members).map(function (id) { return (botById(id)||{}).name; }).filter(Boolean).join(' · ') : botDescription(bot) || '选择联系人，开始对话')); heading.append(text);
  $('message-input').placeholder=bot ? '给 '+bot.name+' 发消息，或交给它一个任务…' : '发送消息，或交给 Bot 一个任务…';
  const speaker=$('speaker-select'), previous=speaker.value; speaker.replaceChildren(node('option','','由主管协调')); speaker.firstChild.value='';
  if (c && c.kind==='group') list(c.members).forEach(function (id) { const b=botById(id); if (b) { const o=node('option','','@ '+b.name); o.value=id; speaker.append(o); } });
  if (Array.from(speaker.options).some(function (o) { return o.value===previous; })) speaker.value=previous;
  hidden(speaker,!c || c.kind!=='group'); $('send-button').disabled=!c;
}
function renderSettingsBanner() { hidden($('config-banner'),Boolean(state.settings.has_api_key)); }
function appendLinkedText(parent, content) {
  const parts=String(content || '').split(/(https?:\/\/[^\s<>"'）。，；！？]+)/g);
  parts.forEach(function (part) {
    if (/^https?:\/\//i.test(part)) { const a=node('a','',part); a.href=part; a.target='_blank'; a.rel='noopener noreferrer'; parent.append(a); }
    else parent.append(document.createTextNode(part));
  });
}
function renderMessageContent(parent, content) {
  const parts=String(content || '').split(/(\x60\x60\x60[\s\S]*?\x60\x60\x60)/g);
  parts.forEach(function (part) {
    if (part.startsWith('\x60\x60\x60') && part.endsWith('\x60\x60\x60')) {
      let code=part.slice(3,-3).replace(/^[^\n]*\n/,''); const pre=node('pre'); pre.append(node('code','',code)); parent.append(pre);
    } else appendLinkedText(parent,part);
  });
}
function fileLink(file) { const a=node('a','file-chip'); a.href=withBase('/api/files/'+encodeURIComponent(file.id)+'/download'); a.append(icon('file'),node('span','',file.name || '文件')); return a; }
function messageFiles(message) {
  const metadata=object(message.metadata);
  return list(metadata.file_ids || metadata.files).map(function (id) { return typeof id==='object'?id:state.files.find(function (file) { return file.id===id; }); }).filter(Boolean);
}
function renderMessages(force) {
  const attachments=state.messages.map(function (message) { return messageFiles(message).map(function (file) { return [file.id,file.name]; }); });
  const tasks=state.messages.map(function (message) { const task=state.tasks.find(function (item) { return item.id===message.task_id; }); return task ? [task.id,task.status] : null; });
  const signature=JSON.stringify([state.messages,attachments,tasks]);
  if (!force && signature===state.messageSignature) return;
  const holder=$('messages'), bottom=holder.scrollHeight-holder.scrollTop-holder.clientHeight<100;
  state.messageSignature=signature; const oldTop=holder.scrollTop; holder.replaceChildren();
  if (!state.messages.length) {
    const c=conversation(),bot=currentBot(),empty=node('div','empty-chat'); empty.append(avatar(bot,c && c.kind==='group'),node('h2','',bot ? '你好，'+bot.name : c ? c.title : '从一段对话开始'),node('p','',botDescription(bot) || '把想法发到这里，和 Bot 一起往下做。'),node('p','empty-hint','任务在服务器上执行，离开页面后也能继续。')); holder.append(empty); return;
  }
  state.messages.forEach(function (message) {
    const row=node('article','message-row '+message.role); const bot=botById(message.bot_id); if (message.role!=='user') row.append(avatar(bot || primaryBot()));
    const block=node('div','message-block'), meta=node('div','message-meta');
    meta.append(node('strong','',message.role==='user'?'你':message.role==='system'?'工作台':bot && bot.name || 'Bot'),node('time','',time(message.created_at)));
    const content=node('div','message-content'); renderMessageContent(content,message.content); block.append(meta,content);
    const attachments=messageFiles(message);
    if (attachments.length) { const files=node('div','message-files'); attachments.forEach(function (file) { files.append(fileLink(file)); }); block.append(files); }
    if (message.task_id) { const task=state.tasks.find(function (t) { return t.id===message.task_id; }); const b=btn('查看任务',function () { openTaskDetail(message.task_id); },'subtle compact','tasks'); b.style.marginTop='5px'; if (task) b.append(statusPill(task.status)); block.append(b); }
    row.append(block); holder.append(row);
  });
  holder.scrollTop=force || bottom ? holder.scrollHeight : oldTop;
}
function renderActivity() {
  const tasks=currentTasks(),active=tasks.find(function (t) { return !TERMINAL.has(t.status); });
  const bar=$('activity-bar'); hidden(bar,!active); bar.replaceChildren();
  if (active) {
    bar.append(statusPill(active.status),node('span','activity-text',active.error || active.prompt));
    bar.append(btn('查看',function () { openTaskDetail(active.id); },'subtle compact'));
    if (['queued','running','waiting_config','waiting_user','waiting_approval','paused'].includes(active.status)) bar.append(btn('停止',function (e) { busy(e.currentTarget,function () { return taskAction(active.id,'stop'); }); },'subtle compact'));
  }
  const count=tasks.filter(function (t) { return !TERMINAL.has(t.status); }).length; $('tasks-count').textContent=count; hidden($('tasks-count'),!count);
}
function renderPendingFiles() {
  const holder=$('pending-files'); holder.replaceChildren(); hidden(holder,!state.pendingFiles.length);
  state.pendingFiles.forEach(function (file) { const chip=node('div','file-chip'); chip.append(icon('file'),node('span','',file.name)); const remove=node('button','','×'); remove.type='button'; remove.title='从这条消息移除'; remove.setAttribute('aria-label','移除 '+file.name); remove.onclick=function () { state.pendingFiles=state.pendingFiles.filter(function (f) { return f.id!==file.id; }); renderPendingFiles(); }; chip.append(remove); holder.append(chip); });
}
async function uploadFiles(files, attach) {
  const saved=[];
  for (const file of files) { const form=new FormData(); form.append('file',file); const item=await api('/api/files',{method:'POST',body:form}); saved.push(item); state.files.unshift(item); if (attach) state.pendingFiles.push(item); }
  renderPendingFiles(); renderBrowserFileOptions(); return saved;
}
async function sendMessage(event) {
  event.preventDefault(); const text=$('message-input').value.trim(); if ((!text && !state.pendingFiles.length) || !state.conversationId) return;
  const button=$('send-button'); await busy(button,async function () {
    const body={content:text || '请查看我上传的文件。',file_ids:state.pendingFiles.map(function (f) { return f.id; })};
    if ($('speaker-select').value) body.bot_id=$('speaker-select').value;
    const result=await mutation('/api/conversations/'+encodeURIComponent(state.conversationId)+'/messages','POST',body);
    $('message-input').value=''; $('message-input').style.height='auto'; state.pendingFiles=[]; renderPendingFiles();
    if (result.task) { state.tasks.unshift(result.task); state.selectedTaskId=result.task.id; }
    await loadMessages(true); renderActivity(); renderBrowserTasks(); state.lastInteraction=Date.now(); schedulePoll(500);
  });
}
function openModal(title, view, large) {
  state.modalView=view; if (view!=='task-detail') state.detailTaskId=null;
  $('modal-title').textContent=title; $('modal-eyebrow').textContent='WORKSPACE'; $('modal-body').replaceChildren(); $('modal').classList.toggle('large',Boolean(large));
  if (!$('modal').open) $('modal').showModal(); return $('modal-body');
}
function closeModal() { $('modal').close(); }
function formError(form, message) { let box=form.querySelector('.form-error'); if (!box) { box=node('p','form-error'); box.setAttribute('role','alert'); form.append(box); } box.textContent=message; hidden(box,!message); }
function field(label, type, value, options) {
  const wrap=node('label','field'),title=node('span','',label); let input;
  if (type==='textarea') input=node('textarea');
  else if (type==='select') { input=node('select'); (options || []).forEach(function (item) { const option=node('option','',item.label); option.value=item.value; input.append(option); }); }
  else { input=node('input'); input.type=type || 'text'; }
  if (value!==undefined && value!==null) input.value=value;
  wrap.append(title,input); return {wrap:wrap,input:input};
}
function scopeOptions() { return [{value:'',label:'共享 · 所有 Bot'}].concat(state.bots.map(function (b) { return {value:b.id,label:b.name+' · 私有'}; })); }
function emptyState(title, description, symbol) { const box=node('div','empty-state'); box.append(icon(symbol || 'memory'),node('h3','',title),node('p','',description)); return box; }
function toolbar(description, label, callback) { const t=node('div','manager-toolbar'); t.append(node('p','',description)); if (label) t.append(btn(label,callback,'primary compact','plus')); return t; }
function resourceActions(card, edit, remove) { const row=node('div','form-row'); if (edit) row.append(iconBtn('编辑','edit',edit)); if (remove) row.append(iconBtn('删除','trash',remove)); card.append(row); return row; }
function scopeLabel(id) { return id ? (botById(id)||{}).name || '已删除的 Bot' : '共享'; }

async function openSettings() {
  const body=openModal('工作台设置','settings');
  body.append(node('p','muted small-text','正在读取设置…'));
  try { state.settings=await api('/api/settings'); } catch (e) { body.replaceChildren(node('p','form-error',e.message)); return; }
  if (state.modalView!=='settings') return;
  body.replaceChildren();
  const section=node('section','settings-section'); section.append(node('h3','','连接 DeepSeek'));
  const stateLine=node('div','setting-state'); stateLine.append(node('span','',state.settings.has_api_key?'API 密钥已保存':'尚未配置 API 密钥'),node('span','pill',state.settings.has_api_key?'已配置':'待连接')); section.append(stateLine);
  const form=node('form');
  const key=field('API 密钥','password'); key.input.autocomplete='new-password'; key.input.placeholder=state.settings.has_api_key?'留空保留当前密钥':'粘贴你的 DeepSeek API 密钥'; key.wrap.append(node('small','','密钥只提交到你的后台，不会回显到页面或保存在浏览器。'));
  const model=field('模型名称','text',state.settings.model || 'deepseek-flash'); model.input.required=true;
  const base=field('API 地址','url',state.settings.api_base || 'https://api.deepseek.com'); base.input.required=true;
  const grid=node('div','form-grid'); grid.append(model.wrap,base.wrap); form.append(key.wrap,grid);
  const row=node('div','form-row'),result=node('div','settings-test-result hidden');
  async function save() {
    const payload={model:model.input.value.trim(),api_base:base.input.value.trim()};
    if (key.input.value.trim()) payload.api_key=key.input.value.trim();
    await mutation('/api/settings','PUT',payload); key.input.value='';
    state.settings=await api('/api/settings'); renderSettingsBanner();
    stateLine.replaceChildren(node('span','',state.settings.has_api_key?'API 密钥已保存':'尚未配置 API 密钥'),node('span','pill',state.settings.has_api_key?'已配置':'待连接'));
    key.input.placeholder=state.settings.has_api_key?'留空保留当前密钥':'粘贴你的 DeepSeek API 密钥';
  }
  const saveButton=btn('保存设置',null,'secondary');
  const testButton=btn('保存并测试连接',null,'primary','link');
  saveButton.onclick=function () { if (!form.reportValidity()) return; busy(saveButton,async function () { await save(); toast('设置已保存'); }); };
  testButton.onclick=function () {
    if (!form.reportValidity()) return;
    busy(testButton,async function () {
      saveButton.disabled=true; hidden(result,true);
      try {
        await save(); result.textContent='正在向模型发送真实测试请求…'; result.className='settings-test-result';
        const test=await mutation('/api/settings/test','POST',{});
        result.textContent=(test.detail || (test.ok?'连接成功':'连接失败'))+(test.reply?'\n模型回复：'+test.reply:''); result.classList.toggle('error',!test.ok);
        if (test.ok) { toast('模型连接成功'); schedulePoll(300); }
      } catch (e) { result.textContent=e.message; result.className='settings-test-result error'; }
      finally { saveButton.disabled=false; }
    });
  };
  form.onsubmit=function (e) { e.preventDefault(); testButton.click(); };
  row.append(saveButton,testButton); form.append(row,result); section.append(form); body.append(section);

  const notifications=node('section','settings-section'); notifications.append(node('h3','','消息通知'),node('p','','允许通知后，服务器可以向这台设备推送任务结果。是否实际到达仍受浏览器、系统和网络影响。'));
  const pushState=node('div','setting-state'); pushState.append(node('span','','正在检查此设备的通知权限…')); notifications.append(pushState);
  const pushRow=node('div','form-row'),pushButton=btn('开启此设备通知',null,'secondary','bell'),testPush=btn('发送测试通知',null,'subtle');
  pushRow.append(pushButton,testPush); notifications.append(pushRow); body.append(notifications);
  let subscription=null;
  const supported='serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
  async function updatePush() {
    if (!supported) { pushState.textContent='此环境暂不支持网页推送，请使用支持推送的浏览器和 HTTPS。'; pushButton.disabled=true; testPush.disabled=true; return; }
    const registration=await navigator.serviceWorker.ready;
    subscription=await registration.pushManager.getSubscription();
    pushButton.textContent=subscription?'关闭此设备通知':'开启此设备通知'; pushButton.prepend(icon('bell'));
    pushState.textContent=subscription?'此设备已订阅通知':Notification.permission==='denied'?'通知被浏览器阻止，请在网站权限中重新允许。':'此设备尚未订阅通知';
    testPush.disabled=!subscription; pushButton.disabled=Notification.permission==='denied' && !subscription;
  }
  pushButton.onclick=function () { busy(pushButton,async function () {
    const registration=await navigator.serviceWorker.ready;
    if (subscription) {
      await mutation('/api/push/subscribe','DELETE',{endpoint:subscription.endpoint}); await subscription.unsubscribe(); subscription=null; toast('已关闭此设备通知');
    } else {
      const permission=await Notification.requestPermission();
      if (permission!=='granted') { toast('尚未获得通知权限。可以在浏览器的网站设置中调整。',true); return; }
      const keyResult=await api('/api/push/key');
      const applicationKey=String(keyResult.public_key || '').replace(/-/g,'+').replace(/_/g,'/');
      if (!applicationKey) throw new Error('服务器未配置推送密钥。');
      const bytes=Uint8Array.from(atob(applicationKey+'='.repeat((4-applicationKey.length%4)%4)),function (c) { return c.charCodeAt(0); });
      const created=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
      try { await mutation('/api/push/subscribe','POST',{subscription:created.toJSON()}); subscription=created; }
      catch (e) { await created.unsubscribe(); throw e; }
      toast('已订阅此设备通知');
    }
    await updatePush();
  }); };
  testPush.onclick=function () { busy(testPush,async function () { const response=await mutation('/api/push/test','POST',{}); toast(response.detail || '测试通知已提交，请查看这台设备的系统通知。'); }); };
  updatePush().catch(function (e) { pushState.textContent='暂时无法读取通知状态：'+e.message; pushButton.disabled=true; testPush.disabled=true; });

  const account=node('section','settings-section'); account.append(node('h3','','工作台登录密码'),node('p','','这是工作台自己的密码，与服务器和 DeepSeek 密钥无关。修改后需要重新登录。'));
  const passwordForm=node('form'),newPassword=field('新登录密码','password',''),repeatPassword=field('再次输入新密码','password','');
  newPassword.input.required=true; newPassword.input.minLength=12; newPassword.input.autocomplete='new-password';
  repeatPassword.input.required=true; repeatPassword.input.autocomplete='new-password';
  const changePassword=node('button','button secondary','修改登录密码'); changePassword.type='submit';
  passwordForm.append(newPassword.wrap,repeatPassword.wrap,changePassword); account.append(passwordForm); body.append(account);
  submitHandler(passwordForm,changePassword,async function () {
    if(newPassword.input.value!==repeatPassword.input.value) throw new Error('两次输入的密码不同。');
    await mutation('/api/settings','PUT',{password:newPassword.input.value});
    newPassword.input.value='';repeatPassword.input.value='';state.authenticated=false;closeModal();showAuth('密码已修改，请使用新密码登录。');
  });

  const appSection=node('section','settings-section'); appSection.append(node('h3','','安装与运行'));
  const standalone=matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  appSection.append(btn(standalone?'已作为应用打开':'添加到桌面',async function () {
    if (state.installPrompt) { await state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt=null; }
    else toast('在浏览器菜单选择“安装应用”或“添加到主屏幕”。安装入口由当前浏览器提供。');
  },'secondary','download'));
  appSection.append(node('p','','安装后可以从桌面打开。离线时只能显示界面外壳；聊天、历史记录和浏览器操作需要联网。服务器上的后台任务不依赖此页面保持打开。'));
  appSection.append(node('div','about-line','时区：'+(state.settings.timezone || 'Asia/Shanghai')+'（北京时间）'));
  appSection.append(node('div','about-line','云浏览器：'+(state.settings.browser_available?'后台报告可用':'后台尚未报告可用')));
  const logout=btn('退出登录',async function () { await busy(logout,async function () { await mutation('/api/auth/logout','POST',{}); state.authenticated=false; state.pendingFiles=[]; closeModal(); showAuth(); }); },'subtle','logout');
  appSection.append(logout); body.append(appSection);
}

function applyPanels() {
  $('app').classList.toggle('browser-hidden',!state.browserOpen);
  hidden($('browser-scrim'),!state.browserOpen || matchMedia('(min-width:1220px)').matches);
  $('browser-toggle').setAttribute('aria-expanded',String(state.browserOpen));
  const narrow=matchMedia('(max-width:759px)').matches;
  const sidebarVisible=!narrow || $('app').classList.contains('sidebar-open');
  $('sidebar').inert=!sidebarVisible; $('sidebar').setAttribute('aria-hidden',String(!sidebarVisible));
  $('browser-panel').inert=!state.browserOpen; $('browser-panel').setAttribute('aria-hidden',String(!state.browserOpen));
  const overlay=state.browserOpen && !matchMedia('(min-width:1220px)').matches || narrow && sidebarVisible;
  document.querySelector('.chat-panel').inert=Boolean(overlay);
}
function toggleBrowser(force) {
  state.browserOpen=force===undefined ? !state.browserOpen : Boolean(force); applyPanels();
  if (state.browserOpen) {
    if (!state.selectedTaskId) { const t=currentTasks()[0]; if (t) state.selectedTaskId=t.id; }
    renderBrowserTasks(); if (state.selectedTaskId) refreshBrowser(true);
  }
}
function resetBrowserPreview(message) {
  state.browserSnapshot=null; hidden($('browser-image'),true); hidden($('browser-placeholder'),false);
  const placeholder=$('browser-placeholder'); placeholder.replaceChildren(icon('browser'),node('span','',message || '页面将在任务访问浏览器后显示。'));
  $('browser-page-title').textContent='尚未打开页面'; $('browser-page-url').textContent='页面画面来自服务器'; $('browser-page-text').textContent='页面文字会在载入后显示。';
  $('browser-element').replaceChildren(node('option','','先刷新页面结构'));
}
function renderBrowserTasks() {
  const select=$('browser-task-select'),tasks=currentTasks(); const signature=tasks.map(function (t) { return t.id+':'+t.status; }).join('|');
  if (select.dataset.signature!==signature) {
    select.dataset.signature=signature; const empty=node('option','','选择一个任务'); empty.value=''; select.replaceChildren(empty);
    tasks.forEach(function (t) { const option=node('option','',((botById(t.bot_id)||{}).name || 'Bot')+' · '+(STATUS[t.status]||t.status)+' · '+t.prompt.slice(0,24)); option.value=t.id; select.append(option); });
  }
  if (!state.selectedTaskId && tasks.length) state.selectedTaskId=(tasks.find(function (t) { return !TERMINAL.has(t.status); }) || tasks[0]).id;
  select.value=state.selectedTaskId || '';
  const task=selectedTask(),takeover=Boolean(task && task.takeover);
  $('takeover-toggle').disabled=!task || !state.connected || TERMINAL.has(task.status); $('takeover-toggle').textContent=takeover?'交回并继续':'接管浏览器'; $('takeover-toggle').classList.toggle('active',takeover);
  $('takeover-hint').textContent=takeover?'你正在接管。可点击画面或使用下方输入。':'Bot 操作期间，你可以随时接管。';
  $('browser-image-stage').classList.toggle('takeover',takeover);
  document.querySelectorAll('[data-manual]').forEach(function (b) { b.disabled=!takeover; });
  $('browser-address').disabled=!takeover; $('browser-fill').disabled=!takeover; $('browser-key').disabled=!takeover;
  $('browser-status').textContent=task ? (takeover?'由你控制 · ':STATUS[task.status]+' · ')+((botById(task.bot_id)||{}).name || 'Bot') : '选择任务，查看它正在访问的页面。';
  renderBrowserFileOptions();
}
function renderBrowserFileOptions() {
  const select=$('browser-upload-file'),previous=select.value;
  const option=node('option','','选择工作区文件'); option.value=''; select.replaceChildren(option);
  state.files.forEach(function (file) { const o=node('option','',file.name); o.value=file.id; select.append(o); });
  select.value=previous;
}
function applySnapshot(snapshot) {
  if (!snapshot || typeof snapshot!=='object') return;
  state.browserSnapshot=snapshot;
  $('browser-page-title').textContent=snapshot.title || '浏览器页面'; $('browser-page-url').textContent=snapshot.url || 'about:blank';
  if (document.activeElement!==$('browser-address')) $('browser-address').value=/^https?:/.test(snapshot.url || '')?snapshot.url:'';
  $('browser-page-text').textContent=snapshot.text || snapshot.detail || '此页面没有可读取的文字。';
  const select=$('browser-element'),previous=select.value,option=node('option','','选择页面元素'); option.value=''; select.replaceChildren(option);
  list(snapshot.elements).forEach(function (element) {
    const o=node('option','',(element.ref || '')+' · '+(element.role || element.type || '元素')+' · '+(element.name || '未命名').slice(0,60));
    o.value=element.ref; o.dataset.sensitive=String(Boolean(element.sensitive)); select.append(o);
  });
  select.value=previous; updateSensitiveInput();
  if (snapshot.tabs) applyBrowserTabs(snapshot.tabs);
}
async function refreshBrowser(manual) {
  if (!state.selectedTaskId || state.browserRefreshing || !state.authenticated) return;
  const id=state.selectedTaskId; state.browserRefreshing=true; state.lastBrowserRefresh=Date.now();
  try {
    const snapshot=await api('/api/browser/'+encodeURIComponent(id)+'/snapshot');
    if (id!==state.selectedTaskId) return;
    applySnapshot(snapshot);
    const url=withBase(snapshot.image_url || '/api/browser/'+encodeURIComponent(id)+'/screenshot')+(String(snapshot.image_url || '').includes('?')?'&':'?')+'v='+Date.now();
    const preview=await new Promise(function (resolve,reject) {
      const pending=new Image();
      const timeout=setTimeout(function () { cleanup(); pending.src=''; reject(new Error('截图载入超时，请稍后刷新。')); },30000);
      function cleanup() { clearTimeout(timeout); pending.onload=null; pending.onerror=null; }
      pending.onload=function () { cleanup(); resolve(pending); };
      pending.onerror=function () { cleanup(); reject(new Error('当前页面截图暂时不可用，可以重新刷新。')); };
      pending.src=url;
    });
    if (id!==state.selectedTaskId) return;
    const image=$('browser-image'); preview.id=image.id; preview.className=image.className; preview.alt=image.alt; preview.onclick=image.onclick;
    image.replaceWith(preview); hidden(preview,false); hidden($('browser-placeholder'),true);
  } catch (e) {
    if (id===state.selectedTaskId) {
      const image=$('browser-image');
      if (image.complete && image.naturalWidth>0 && !image.classList.contains('hidden')) image.title='截图更新失败，当前保留上次成功画面。';
      else resetBrowserPreview(e.message);
      if (manual) toast(e.message,true);
    }
  } finally {
    state.browserRefreshing=false;
    if (id!==state.selectedTaskId && state.selectedTaskId && state.browserOpen && state.authenticated) refreshBrowser(false);
  }
}
function applyBrowserTabs(tabs) {
  const select=$('browser-tabs'),empty=node('option','','选择标签页'); empty.value=''; select.replaceChildren(empty);
  list(tabs).forEach(function (tab) { const option=node('option','',tab.title || tab.url || tab.tab_id || tab.id); option.value=tab.tab_id || tab.id; select.append(option); });
}
function updateSensitiveInput() {
  const option=$('browser-element').selectedOptions[0],sensitive=option && option.dataset.sensitive==='true';
  $('browser-fill').type=sensitive?'password':'text'; $('browser-fill').value=''; $('browser-fill').placeholder=sensitive?'密码输入 · 提交后会清空':'选择输入框后填写';
}
async function browserAction(action,args,button) {
  const task=selectedTask();
  if (!task || !task.takeover) { toast('请先接管浏览器，再操作页面。',true); return; }
  return busy(button,async function () {
    const result=await mutation('/api/browser/'+encodeURIComponent(task.id)+'/action','POST',{action:action,args:args || {}});
    if (action==='tabs') applyBrowserTabs(result.tabs || result);
    else if (result.title!==undefined || result.elements) applySnapshot(result);
    if (result.file) { state.files.unshift(result.file); renderBrowserFileOptions(); toast('文件已保存到工作区'); }
    await refreshBrowser(false);
  });
}
async function taskAction(id,action,body) {
  await mutation('/api/tasks/'+encodeURIComponent(id)+'/'+action,'POST',body || {});
  const tasks=await api('/api/tasks'); state.tasks=list(tasks); renderActivity(); renderBrowserTasks(); schedulePoll(500);
  if (state.detailTaskId===id) refreshTaskDetail(true);
}
async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    state.swRegistration=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
    const notifyUpdate=function () { if (state.swRegistration.waiting && navigator.serviceWorker.controller) toast('工作台有更新可用',false,{label:'刷新',run:function () { state.swRegistration.waiting.postMessage({type:'SKIP_WAITING'}); }}); };
    notifyUpdate(); state.swRegistration.addEventListener('updatefound',function () { const worker=state.swRegistration.installing; if (worker) worker.addEventListener('statechange',function () { if (worker.state==='installed') notifyUpdate(); }); });
    let refreshing=false; navigator.serviceWorker.addEventListener('controllerchange',function () { if (refreshing) return; refreshing=true; location.reload(); });
  } catch (_) { /* The online app remains usable if shell caching is unavailable. */ }
}
function initialize() {
  const assigned={'search-icon':'search','new-contact':'plus','sidebar-close':'close','sidebar-open':'menu','tasks-icon':'tasks','browser-icon':'browser','conversation-more':'more','attach-icon':'plus','send-button':'send','browser-close':'close','browser-refresh':'refresh','modal-close':'close'};
  Object.entries(assigned).forEach(function (pair) { $(pair[0]).append(icon(pair[1])); });
  document.querySelector('#browser-address-form button').append(icon('arrow'));
  $('browser-placeholder').append(icon('browser'),node('span','','页面将在任务访问浏览器后显示。'));
  const nav=[['记忆','memory',function () { openMemories(); }],['技能','skill',function () { openSkills(); }],['例行','clock',function () { openRoutines(); }],['文件','file',function () { openFiles(); }],['设置','settings',openSettings]];
  nav.forEach(function (item) { const b=node('button'); b.type='button'; b.append(icon(item[1]),node('span','',item[0])); b.onclick=item[2]; $('management-nav').append(b); });
  $('auth-form').onsubmit=async function (e) {
    e.preventDefault(); const button=$('auth-submit'); button.disabled=true; hidden($('auth-error'),true);
    try { await mutation('/api/auth/login','POST',{password:$('auth-password').value}); $('auth-password').value=''; state.authenticated=true; await loadWorkspace(); }
    catch (error) { $('auth-error').textContent=error.message; hidden($('auth-error'),false); }
    finally { button.disabled=false; }
  };
  $('auth-retry').onclick=checkAuth; $('contact-search').oninput=renderContacts; $('composer').onsubmit=sendMessage;
  $('message-input').oninput=function () { this.style.height='auto'; this.style.height=Math.min(this.scrollHeight,160)+'px'; state.lastInteraction=Date.now(); };
  $('message-input').onkeydown=function (event) { if (event.key==='Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('composer').requestSubmit(); } };
  $('composer-files').onchange=async function () { const files=Array.from(this.files); this.value=''; if (!files.length) return; $('send-button').disabled=true; try { await uploadFiles(files,true); toast('文件已上传，将随下一条消息发送'); } catch (e) { toast(e.message,true); } finally { $('send-button').disabled=false; } };
  $('sidebar-open').onclick=function () { $('app').classList.add('sidebar-open'); hidden($('sidebar-scrim'),false); applyPanels(); };
  const closeSidebar=function () { $('app').classList.remove('sidebar-open'); hidden($('sidebar-scrim'),true); applyPanels(); };
  $('sidebar-close').onclick=closeSidebar; $('sidebar-scrim').onclick=closeSidebar;
  $('browser-toggle').onclick=function () { toggleBrowser(); }; $('browser-close').onclick=function () { toggleBrowser(false); }; $('browser-scrim').onclick=function () { toggleBrowser(false); };
  $('browser-refresh').onclick=function () { refreshBrowser(true); };
  $('browser-task-select').onchange=function () { state.selectedTaskId=this.value || null; resetBrowserPreview(); renderBrowserTasks(); refreshBrowser(true); };
  $('takeover-toggle').onclick=function () { const task=selectedTask(); if (task) busy(this,async function () { await taskAction(task.id,'takeover',{enabled:!task.takeover}); if (task.takeover) await taskAction(task.id,'resume',{}); await refreshBrowser(true); }); };
  $('browser-address-form').onsubmit=function (e) { e.preventDefault(); browserAction('open',{url:$('browser-address').value},this.querySelector('button')); };
  document.querySelectorAll('[data-browser-action]').forEach(function (b) { b.onclick=function () { const action=b.dataset.browserAction; if (action==='scroll-up' || action==='scroll-down') browserAction('scroll',{dy:action==='scroll-up'?-500:500},b); else if (action==='new-tab') browserAction('new_tab',{url:$('browser-address').value || 'https://example.com'},b); else browserAction(action,{},b); }; });
  $('browser-element').onchange=updateSensitiveInput;
  const refAction=function (action,extra,button) { const ref=$('browser-element').value; if (!ref) { toast('请先选择一个页面元素。',true); return; } return browserAction(action,Object.assign({ref:ref},extra || {}),button); };
  $('element-click').onclick=function () { refAction('click',{},this); };
  $('element-download').onclick=function () { refAction('download',{},this); };
  $('element-fill').onclick=function () { const value=$('browser-fill').value; $('browser-fill').value=''; refAction('fill',{text:value},this); };
  $('element-key').onclick=function () { browserAction('keypress',{key:$('browser-key').value || 'Enter'},this); };
  $('element-upload').onclick=function () { const id=$('browser-upload-file').value; if (!id) { toast('请先选择工作区文件。',true); return; } refAction('upload',{file_id:id},this); };
  $('browser-tabs-refresh').onclick=function () { browserAction('tabs',{},this); };
  $('browser-tabs').onchange=function () { if (this.value) browserAction('switch_tab',{tab_id:this.value}); };
  $('browser-image').onclick=function (e) { if (!selectedTask() || !selectedTask().takeover) return; const rect=this.getBoundingClientRect(); browserAction('coordinate_click',{x:Math.round((e.clientX-rect.left)*this.naturalWidth/rect.width),y:Math.round((e.clientY-rect.top)*this.naturalHeight/rect.height)}); };
  $('new-contact').onclick=openNewMenu; $('conversation-more').onclick=openConversationMenu; $('tasks-open').onclick=function () { openTasks(); }; $('connect-model').onclick=openSettings;
  $('modal-close').onclick=closeModal; $('modal').addEventListener('click',function (e) { if (e.target===this) { const r=this.getBoundingClientRect(); if (e.clientX<r.left || e.clientX>r.right || e.clientY<r.top || e.clientY>r.bottom) closeModal(); } });
  $('modal').addEventListener('close',function () { state.modalView=null; state.detailTaskId=null; $('modal-body').replaceChildren(); });
  window.addEventListener('online',function () { if (state.authenticated) schedulePoll(200); else checkAuth(); });
  window.addEventListener('offline',function () { connection(false); });
  document.addEventListener('visibilitychange',function () { if (!document.hidden && state.authenticated) schedulePoll(100); });
  window.addEventListener('beforeinstallprompt',function (e) { e.preventDefault(); state.installPrompt=e; });
  window.addEventListener('resize',applyPanels);
  registerServiceWorker(); checkAuth();
}

async function refreshCollections() {
  const result=await Promise.all([api('/api/bots'),api('/api/conversations'),api('/api/tasks'),api('/api/files')]);
  state.bots=list(result[0]); state.conversations=list(result[1]); state.tasks=list(result[2]); state.files=list(result[3]);
  if (!state.conversations.some(function (c) { return c.id===state.conversationId; })) state.conversationId=(state.conversations[0]||{}).id;
  renderContacts(); renderHeading(); renderActivity(); renderBrowserTasks(); await loadMessages(false);
}
function submitHandler(form, button, callback) {
  form.addEventListener('submit',async function (event) {
    event.preventDefault(); if (button.disabled || !form.reportValidity()) return; button.disabled=true; formError(form,'');
    try { await callback(); } catch (e) { formError(form,e.message); }
    finally { if (button.isConnected) button.disabled=false; }
  });
}
function openNewMenu() {
  const body=openModal('新建','new-menu');
  const first=btn('创建 Bot',function () { openBotEditor(); },'secondary wide','plus'); first.style.marginBottom='12px';
  body.append(first,node('p','muted small-text','给它名字、职责和说话风格，让它成为一位长期联系人。'));
  const group=btn('创建群聊',openGroupEditor,'secondary wide','group'); group.style.marginTop='17px';
  body.append(group,node('p','muted small-text','让不同职责的 Bot 在同一段对话里协作。'));
}
function openBotEditor(bot) {
  const body=openModal(bot?'编辑 '+bot.name:'创建 Bot','bot-editor'),form=node('form');
  const name=field('名字','text',bot && bot.name || ''),role=field('职责与说话风格','textarea',bot && bot.role || '');
  name.input.required=true; name.input.maxLength=64; name.input.placeholder='例如：学习搭子';
  role.input.required=true; role.input.rows=5; role.input.placeholder='例如：帮助我学习物理和编程。用直观例子解释问题，先给提示，再和我一起推导。';
  const shape=field('头像图案','select',bot && ['orbit','diamond','bloom','dafeiyu'].includes(bot.avatar) ? bot.avatar : 'orbit',[{value:'orbit',label:'弧线 · 平和'},{value:'diamond',label:'菱形 · 清晰'},{value:'bloom',label:'星花 · 灵感'},{value:'dafeiyu',label:'大肥鱼 · 蓝发头像'}]);
  let color=bot && bot.color || COLORS[state.bots.length%COLORS.length]; const colors=node('div','color-options'),preview=node('div','form-row'); preview.style.marginBottom='18px';
  function drawPreview() { preview.replaceChildren(avatar({name:name.input.value || 'Bot',color:color,avatar:shape.input.value}),node('span','muted small-text',name.input.value || '你的新 Bot')); }
  COLORS.forEach(function (value) { const b=node('button','color-option'+(value===color?' selected':'')); b.type='button'; b.style.background=value; b.setAttribute('aria-label','选择颜色 '+value); b.onclick=function () { color=value; colors.querySelectorAll('button').forEach(function (button) { button.classList.toggle('selected',button===b); }); drawPreview(); }; colors.append(b); });
  name.input.addEventListener('input',drawPreview); shape.input.onchange=drawPreview; drawPreview();
  const save=node('button','button primary',bot?'保存修改':'创建 Bot'); save.type='submit';
  const footer=node('div','form-footer'); footer.append(btn('取消',closeModal,'subtle'),save); form.append(preview,name.wrap,role.wrap,shape.wrap,node('span','muted small-text','头像颜色'),colors,footer); body.append(form);
  submitHandler(form,save,async function () {
    const value=await mutation('/api/bots'+(bot?'/'+encodeURIComponent(bot.id):''),bot?'PATCH':'POST',{name:name.input.value.trim(),role:role.input.value.trim(),avatar:shape.input.value,color:color});
    await refreshCollections(); closeModal(); toast(bot?'Bot 已更新':'Bot 已创建');
    if (!bot) await selectBot(value);
  });
}
function openGroupEditor() {
  const body=openModal('创建群聊','group-editor'),form=node('form'),name=field('群聊名称','text','');
  name.input.required=true; name.input.placeholder='例如：这周的学习计划'; name.input.maxLength=120;
  const members=node('div','member-options');
  state.bots.forEach(function (bot) { const label=node('label','member-option'),check=node('input'); check.type='checkbox'; check.value=bot.id; label.append(avatar(bot),node('span','',bot.name),check); members.append(label); });
  form.append(name.wrap,node('p','muted small-text','选择 2 至 6 个 Bot。群聊内可用 @ 或下方选择器指定回复者。'),members);
  const save=node('button','button primary','创建群聊'); save.type='submit'; const footer=node('div','form-footer'); footer.append(btn('取消',closeModal,'subtle'),save); form.append(footer); body.append(form);
  submitHandler(form,save,async function () {
    const ids=Array.from(members.querySelectorAll('input:checked')).map(function (input) { return input.value; });
    if (ids.length<2 || ids.length>6) throw new Error('请选择 2 至 6 个 Bot。');
    const c=await mutation('/api/conversations','POST',{title:name.input.value.trim(),kind:'group',members:ids});
    state.conversations.unshift(c); closeModal(); await selectConversation(c.id); toast('群聊已创建');
  });
}
function openConversationMenu() {
  const c=conversation(),bot=currentBot(); if (!c) return;
  const body=openModal(c.kind==='group'?'群聊信息':bot && bot.name || '对话设置','conversation-menu');
  if (bot) {
    const intro=node('div','form-row'); intro.style.marginBottom='20px'; intro.append(avatar(bot),node('p','muted small-text',bot.role)); body.append(intro);
    body.append(btn('编辑 Bot',function () { openBotEditor(bot); },'secondary wide','edit'));
    if (!bot.is_primary) { const primary=btn('设为主管',function () { busy(primary,async function () { await mutation('/api/bots/'+encodeURIComponent(bot.id)+'/primary','POST',{}); await refreshCollections(); closeModal(); toast('已将 '+bot.name+' 设为主管'); }); },'subtle wide','star'); primary.style.marginTop='8px'; body.append(primary); }
  } else {
    body.append(node('p','muted small-text','群聊成员'));
    list(c.members).forEach(function (id) { const b=botById(id); if (!b) return; const row=node('div','form-row'); row.style.marginBottom='13px'; row.append(avatar(b),node('strong','',b.name),node('span','muted small-text',b.role)); body.append(row); });
  }
  const clear=btn('清空聊天记录',function () { if (!confirm('确定清空这段聊天记录？记忆和技能会保留。')) return; busy(clear,async function () { await mutation('/api/conversations/'+encodeURIComponent(c.id)+'/messages','DELETE'); state.messageSignature=''; await refreshCollections(); closeModal(); toast('聊天记录已清空'); }); },'danger wide','trash'); clear.style.marginTop='18px'; body.append(clear);
  if (bot) { const remove=btn('删除这个 Bot',function () { if (!confirm('确定删除 '+bot.name+'？')) return; busy(remove,async function () { await mutation('/api/bots/'+encodeURIComponent(bot.id),'DELETE'); await refreshCollections(); closeModal(); toast('Bot 已删除'); }); },'subtle wide'); remove.style.marginTop='8px'; body.append(remove); }
}
async function openTasks(all) {
  const body=openModal('任务记录','tasks',true); body.append(node('p','muted small-text','正在读取任务…'));
  try {
    state.tasks=list(await api('/api/tasks')); if (state.modalView!=='tasks') return; body.replaceChildren();
    const top=node('div','manager-toolbar'),select=node('select'); [{value:'current',label:'当前对话'},{value:'all',label:'所有对话'}].forEach(function (v) { const o=node('option','',v.label); o.value=v.value; select.append(o); }); select.value=all?'all':'current';
    top.append(node('p','','任务与执行记录由服务器保存。'),select); body.append(top);
    const holder=node('div','resource-list'); body.append(holder);
    function draw() {
      holder.replaceChildren(); const rows=state.tasks.filter(function (t) { return select.value==='all' || t.conversation_id===state.conversationId; }).sort(function (a,b) { return b.created_at-a.created_at; });
      if (!rows.length) holder.append(emptyState('还没有任务','发送一条消息后，相关任务会出现在这里。','tasks'));
      rows.forEach(function (task) {
        const b=node('button','resource-card task-card-button'),head=node('div','resource-card-head');
        head.append(node('h3','',((botById(task.bot_id)||{}).name || 'Bot')+' 的任务'),statusPill(task.status));
        b.append(head,node('p','resource-card-content clamped',task.prompt)); const meta=node('div','resource-meta'); meta.append(node('span','',stamp(task.created_at)),node('span','',task.kind==='chat'?'对话任务':task.kind)); b.append(meta); if (task.error) b.append(node('p','form-error',task.error)); b.onclick=function () { openTaskDetail(task.id); }; holder.append(b);
      });
    }
    select.onchange=draw; draw();
  } catch (e) { body.replaceChildren(node('p','form-error',e.message)); }
}
async function openTaskDetail(id) {
  openModal('任务详情','task-detail',true); state.detailTaskId=id; state.selectedTaskId=id; state.detailSignature=''; $('modal-body').append(node('p','muted small-text','正在读取执行记录…')); renderBrowserTasks(); await refreshTaskDetail(true);
}
function safeObject(value) {
  if (!value || typeof value!=='object') return value;
  if (Array.isArray(value)) return value.map(safeObject);
  const clean={}; Object.entries(value).forEach(function (item) { clean[item[0]]=/password|api.?key|authorization|access.?token|secret/i.test(item[0])?'已隐藏':safeObject(item[1]); }); return clean;
}
const EVENT_LABEL={queued:'任务已保存',running:'开始执行',model_request:'请求模型',tool_call:'执行工具',tool_result:'工具返回结果',browser_snapshot:'重新观察页面',browser_action:'浏览器操作',browser_unavailable:'浏览器暂不可用',approval_required:'等待你确认操作',approval_decision:'已记录你的决定',waiting_user:'等待你的补充',waiting_config:'等待连接模型',resumed:'继续任务',paused:'任务已暂停',cancelled:'任务已停止',failed:'任务失败',succeeded:'任务完成',completed:'任务完成',takeover:'人工接管状态改变',handoff:'交给另一位 Bot',handoff_result:'收到交接结果',file:'文件已保存',usage:'模型用量',interrupted_action:'已阻止重放中断的操作'};
async function refreshTaskDetail(force) {
  const id=state.detailTaskId; if (!id || state.modalView!=='task-detail') return;
  try {
    const result=await Promise.all([api('/api/tasks/'+encodeURIComponent(id)),api('/api/tasks/'+encodeURIComponent(id)+'/events?after=0')]);
    if (state.detailTaskId!==id || state.modalView!=='task-detail') return;
    const task=result[0],events=list(result[1]),signature=JSON.stringify([task,events]);
    if (!force && signature===state.detailSignature) return;
    if (!force && $('modal-body').contains(document.activeElement) && ['TEXTAREA','INPUT'].includes(document.activeElement.tagName)) return;
    state.detailSignature=signature; const idx=state.tasks.findIndex(function (t) { return t.id===id; }); if (idx>=0) state.tasks[idx]=task;
    const body=$('modal-body'),scroll=body.scrollTop; body.replaceChildren(); const head=node('div','manager-toolbar'); head.append(statusPill(task.status),node('p','','更新于 '+stamp(task.updated_at))); body.append(head,node('div','task-summary',task.prompt));
    const actions=node('div','task-action-bar'); actions.append(btn('查看云浏览器',function () { state.selectedTaskId=id; closeModal(); toggleBrowser(true); },'secondary','browser'));
    if (!TERMINAL.has(task.status)) actions.append(btn('停止任务',function (e) { busy(e.currentTarget,function () { return taskAction(id,'stop'); }); },'danger','stop'));
    if (['paused','waiting_config','waiting_user','failed','cancelled'].includes(task.status) && !task.takeover) actions.append(btn('继续任务',function (e) { busy(e.currentTarget,function () { return taskAction(id,'resume',{}); }); },'primary','arrow'));
    actions.append(btn('保存为技能',function () { openSkillEditor(null,{name:task.prompt.slice(0,30),bot_id:task.bot_id,content:'任务目标：\n'+task.prompt+'\n\n方法与验证：\n'+(task.result || '请补充可复用的步骤、输入和结果检查方式。')}); },'subtle','skill')); body.append(actions);
    if (task.error) body.append(node('div','task-summary task-error',task.error));
    if (task.result) { const box=node('div','task-summary'); renderMessageContent(box,task.result); body.append(node('h3','content-title','任务结果'),box); }
    if (task.status==='waiting_approval') {
      const approval=node('div','approval-box'),event=events.slice().reverse().find(function (e) { return e.kind==='approval_required'; }),detail=event && object(event.detail);
      approval.append(node('h3','','请确认这一步操作'),node('p','',detail ? JSON.stringify(safeObject(detail),null,2) : '操作内容请查看下方执行记录。'));
      const row=node('div','form-row'); row.append(btn('允许这次操作',function (e) { busy(e.currentTarget,function () { return taskAction(id,'approval',{allow:true}); }); },'primary','check'),btn('拒绝这次操作',function (e) { busy(e.currentTarget,function () { return taskAction(id,'approval',{allow:false}); }); },'subtle')); approval.append(row); body.append(approval);
    }
    if (task.takeover) body.append(node('div','initialization-box','你正在接管浏览器。完成人工操作后，在云浏览器面板选择“交回并继续”。Bot 将重新观察页面。'));
    if (task.status!=='succeeded' && task.status!=='waiting_approval' && !task.takeover) {
      const form=node('form'),follow=field('补充说明或改变方向','textarea',''); follow.input.placeholder='例如：先别提交，整理好内容给我看。'; follow.input.rows=2; follow.input.required=true;
      const submit=node('button','button secondary compact','补充并继续'); submit.type='submit'; form.append(follow.wrap,submit); body.append(form);
      submitHandler(form,submit,async function () { const latest=await api('/api/tasks/'+encodeURIComponent(id)); if (['queued','running'].includes(latest.status)) await mutation('/api/tasks/'+encodeURIComponent(id)+'/stop','POST',{}); await taskAction(id,'resume',{message:follow.input.value.trim()}); toast('补充要求已保存，Bot 将重新规划'); });
    }
    const timeline=node('section','task-timeline'),title=node('div','timeline-title'); title.append(node('span','','执行记录'),node('span','',events.length+' 条')); timeline.append(title);
    if (!events.length) timeline.append(node('p','muted small-text','任务已保存，等待执行记录。'));
    events.forEach(function (event,index) {
      const row=node('div','event-row'),dot=node('span','event-dot',index+1),content=node('div'),head=node('div','event-head'),detail=object(event.detail);
      head.append(node('span','',EVENT_LABEL[event.kind] || event.kind),node('time','',time(event.created_at))); content.append(head);
      const summary=detail.message || detail.question || detail.name || detail.tool || detail.action || detail.url || '';
      if (summary) content.append(node('p','event-detail',summary));
      const details=node('details','event-detail'); details.append(node('summary','','查看记录内容')); const pre=node('pre','',JSON.stringify(safeObject(detail),null,2)); details.append(pre); content.append(details); row.append(dot,content); timeline.append(row);
    });
    body.append(timeline); body.scrollTop=scroll; renderActivity(); renderBrowserTasks();
  } catch (e) { if (force) $('modal-body').replaceChildren(node('p','form-error',e.message)); }
}
async function openMemories(filter) {
  const body=openModal('记忆','memories'); body.append(node('p','muted small-text','正在读取记忆…'));
  try {
    const memories=list(await api('/api/memories')); if (state.modalView!=='memories') return; body.replaceChildren();
    body.append(toolbar('共享资料供所有 Bot 使用，私有记忆只属于对应 Bot。','添加记忆',function () { openMemoryEditor(); }));
    const scope=field('查看范围','select',filter || 'all',[{value:'all',label:'全部记忆'}].concat(scopeOptions())); body.append(scope.wrap);
    const holder=node('div','resource-list'); body.append(holder);
    function draw() {
      holder.replaceChildren(); const rows=memories.filter(function (m) { return scope.input.value==='all' || (m.bot_id || '')===scope.input.value; });
      if (!rows.length) holder.append(emptyState('这里还没有记忆','你可以手动添加，也可以在聊天中让 Bot 记住。','memory'));
      rows.forEach(function (memory) {
        const card=node('article','resource-card'),head=node('div','resource-card-head'); head.append(node('h3','',scopeLabel(memory.bot_id)));
        resourceActions(head,function () { openMemoryEditor(memory); },function () { if (!confirm('确定删除这条记忆？')) return; busy(null,async function () { await mutation('/api/memories/'+encodeURIComponent(memory.id),'DELETE'); toast('记忆已删除'); openMemories(scope.input.value); }); });
        card.append(head,node('p','resource-card-content',memory.content),node('div','resource-meta','更新于 '+stamp(memory.updated_at))); holder.append(card);
      });
    }
    scope.input.onchange=draw; draw();
  } catch (e) { body.replaceChildren(node('p','form-error',e.message)); }
}
function openMemoryEditor(memory) {
  const body=openModal(memory?'编辑记忆':'添加记忆','memory-editor'),form=node('form'),scope=field('记忆归属','select',memory && memory.bot_id || '',scopeOptions()),content=field('要记住的内容','textarea',memory && memory.content || '');
  content.input.required=true; content.input.rows=5; content.input.placeholder='例如：我更喜欢先看直观例子，再理解公式。';
  const save=node('button','button primary','保存记忆'); save.type='submit'; const footer=node('div','form-footer'); footer.append(btn('返回',function () { openMemories(); },'subtle'),save); form.append(scope.wrap,content.wrap,footer); body.append(form);
  submitHandler(form,save,async function () { await mutation('/api/memories'+(memory?'/'+encodeURIComponent(memory.id):''),memory?'PATCH':'POST',{bot_id:scope.input.value || null,content:content.input.value.trim()}); toast('记忆已保存'); openMemories(); });
}
async function openSkills() {
  const body=openModal('技能','skills'); body.append(node('p','muted small-text','正在读取技能…'));
  try {
    const skills=list(await api('/api/skills')); if (state.modalView!=='skills') return; body.replaceChildren(); body.append(toolbar('保存可复用的方法、输入和结果检查方式。','新建技能',function () { openSkillEditor(); }));
    const holder=node('div','resource-list'); body.append(holder); if (!skills.length) holder.append(emptyState('把好用的方法留下来','可以手动添加，或在任务详情中保存为技能。','skill'));
    skills.forEach(function (skill) {
      const card=node('article','resource-card'),head=node('div','resource-card-head'); head.append(node('h3','',skill.name));
      resourceActions(head,function () { openSkillEditor(skill); },function () { if (!confirm('确定删除技能“'+skill.name+'”？')) return; busy(null,async function () { await mutation('/api/skills/'+encodeURIComponent(skill.id),'DELETE'); toast('技能已删除'); openSkills(); }); });
      card.append(head,node('p','resource-card-content clamped',skill.content)); const meta=node('div','resource-meta'); meta.append(node('span','chip-scope',scopeLabel(skill.bot_id)),node('span','',stamp(skill.updated_at))); card.append(meta); holder.append(card);
    });
  } catch (e) { body.replaceChildren(node('p','form-error',e.message)); }
}
function openSkillEditor(skill,defaults) {
  const value=skill || defaults || {},body=openModal(skill?'编辑技能':'新建技能','skill-editor'),form=node('form'),name=field('技能名称','text',value.name || ''),scope=field('技能归属','select',value.bot_id || '',scopeOptions()),content=field('步骤、输入与验证','textarea',value.content || '');
  name.input.required=true; content.input.required=true; content.input.rows=8; content.input.placeholder='说明使用场景、所需输入、操作步骤，以及怎样检查结果。';
  const save=node('button','button primary','保存技能'); save.type='submit'; const footer=node('div','form-footer'); footer.append(btn('返回',openSkills,'subtle'),save); form.append(name.wrap,scope.wrap,content.wrap,footer); body.append(form);
  submitHandler(form,save,async function () { await mutation('/api/skills'+(skill?'/'+encodeURIComponent(skill.id):''),skill?'PATCH':'POST',{name:name.input.value.trim(),bot_id:scope.input.value || null,content:content.input.value.trim()}); toast('技能已保存'); openSkills(); });
}

function scheduleDescription(routine) {
  if (routine.schedule==='daily') return '每天 '+routine.time_of_day+' · 北京时间';
  if (routine.schedule==='interval') return '每 '+Math.round(Number(routine.interval_seconds)/60)+' 分钟';
  return '一次 · '+stamp(routine.run_at);
}
async function openRoutines() {
  const body=openModal('提醒与例行任务','routines',true); body.append(node('p','muted small-text','正在读取例行任务…'));
  try {
    const routines=list(await api('/api/routines')); if (state.modalView!=='routines') return; body.replaceChildren();
    body.append(toolbar('由服务器按时触发，关闭网页后仍会执行。','新建例行任务',function () { openRoutineEditor(); }));
    const holder=node('div','resource-list'); body.append(holder); if (!routines.length) holder.append(emptyState('把需要惦记的事交给 Bot','定时提醒、检查网页，或按约定主动联系你。','clock'));
    routines.forEach(function (routine) {
      const card=node('article','resource-card'),head=node('div','resource-card-head'); head.append(node('h3','',routine.name));
      resourceActions(head,function () { openRoutineEditor(routine); },function () { if (!confirm('确定删除例行任务“'+routine.name+'”？其运行历史也会删除。')) return; busy(null,async function () { await mutation('/api/routines/'+encodeURIComponent(routine.id),'DELETE'); toast('例行任务已删除'); openRoutines(); }); });
      card.append(head,node('p','resource-card-content clamped',routine.prompt)); const meta=node('div','resource-meta');
      meta.append(node('span','pill',routine.enabled?'已启用':'已暂停'),node('span','',scopeLabel(routine.bot_id)),node('span','',scheduleDescription(routine))); card.append(meta);
      if (routine.enabled && routine.next_run_at) card.append(node('div','resource-meta','下次运行：'+stamp(routine.next_run_at)));
      if (routine.last_result) card.append(node('p','resource-card-content clamped','最近结果：'+routine.last_result));
      const actions=node('div','resource-actions');
      const toggle=btn(routine.enabled?'暂停':'启用',function () { busy(toggle,async function () { await mutation('/api/routines/'+encodeURIComponent(routine.id),'PATCH',{enabled:!routine.enabled}); openRoutines(); }); },'secondary compact');
      const run=btn('立即运行',function () { busy(run,async function () { const record=await mutation('/api/routines/'+encodeURIComponent(routine.id)+'/run','POST',{}); await refreshCollections(); toast(record.status==='succeeded'?'已执行并保存提醒':'已加入执行队列'); if (record.task_id) { state.selectedTaskId=record.task_id; openTaskDetail(record.task_id); } else openRoutineRuns(routine); }); },'subtle compact','arrow');
      actions.append(toggle,run,btn('运行历史',function () { openRoutineRuns(routine); },'subtle compact','clock')); card.append(actions); holder.append(card);
    });
  } catch (e) { body.replaceChildren(node('p','form-error',e.message)); }
}
function localDateTime(unix) {
  const date=new Date((unix || Date.now()/1000+600)*1000);
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const values={}; parts.forEach(function (p) { values[p.type]=p.value; });
  return values.year+'-'+values.month+'-'+values.day+'T'+values.hour+':'+values.minute;
}
async function openRoutineEditor(routine) {
  const body=openModal(routine?'编辑例行任务':'新建例行任务','routine-editor',true),form=node('form');
  const primary=primaryBot(),bot=field('执行的 Bot','select',routine && routine.bot_id || primary && primary.id,state.bots.map(function (b) { return {value:b.id,label:b.name}; }));
  const title=field('名称','text',routine && routine.name || ''); title.input.required=true; title.input.placeholder='例如：晚间作业提醒';
  const kind=field('任务方式','select',routine && routine.kind || 'reminder',[{value:'reminder',label:'直接提醒 · 不调用模型'},{value:'agent',label:'执行任务 · 调用模型和工具'},{value:'checkin',label:'主动联系 · 按频率和安静时段判断'}]);
  const prompt=field('提醒内容或执行要求','textarea',routine && routine.prompt || ''); prompt.input.required=true; prompt.input.rows=4;
  const conversationField=field('结果发送到','select',routine && routine.conversation_id || '',state.conversations.map(function (c) { return {value:c.id,label:(c.kind==='group'?'群聊 · ':'')+c.title}; }));
  function selectDirect() { const b=botById(bot.input.value); const c=state.conversations.find(function (c) { return c.id===(b && b.conversation_id) || c.kind==='direct' && list(c.members).includes(bot.input.value); }); if (c) conversationField.input.value=c.id; }
  if (!routine) selectDirect(); bot.input.onchange=selectDirect;
  const schedule=field('触发方式','select',routine && routine.schedule || 'once',[{value:'once',label:'只执行一次'},{value:'daily',label:'每天固定时间'},{value:'interval',label:'固定时间间隔'}]);
  const runAt=field('执行时间（北京时间）','datetime-local',localDateTime(routine && routine.run_at)),daily=field('每天的时间（北京时间）','time',routine && routine.time_of_day || '20:00'),interval=field('间隔分钟数','number',routine && routine.interval_seconds ? routine.interval_seconds/60 : 60);
  interval.input.min='1'; interval.input.step='1'; interval.wrap.append(node('small','','至少间隔 1 分钟。'));
  const skill=field('引用技能（可选）','select',routine && routine.skill_id || '',[{value:'',label:'不引用技能'}]);
  const enabled=node('label','check-label'),check=node('input'); check.type='checkbox'; check.checked=routine?routine.enabled:true; enabled.append(check,node('span','','保存后启用'));
  const quietBox=node('div'),quietTitle=node('p','muted small-text','主动联系遵守安静时段和每日上限；普通提醒和执行任务不使用这些限制。');
  const quietStart=field('安静时段开始','time',routine && routine.quiet_start || '23:00'),quietEnd=field('安静时段结束','time',routine && routine.quiet_end || '08:00'),maxDaily=field('每天最多主动联系次数','number',routine && routine.max_daily || 1);
  maxDaily.input.min='1'; maxDaily.input.max='10'; const quietGrid=node('div','form-grid'); quietGrid.append(quietStart.wrap,quietEnd.wrap); quietBox.append(quietTitle,quietGrid,maxDaily.wrap);
  const grid=node('div','form-grid'); grid.append(bot.wrap,kind.wrap); const scheduleGrid=node('div','form-grid'); scheduleGrid.append(schedule.wrap,runAt.wrap,daily.wrap,interval.wrap);
  form.append(title.wrap,grid,prompt.wrap,conversationField.wrap,scheduleGrid,skill.wrap,quietBox,enabled);
  function update() { hidden(runAt.wrap,schedule.input.value!=='once'); hidden(daily.wrap,schedule.input.value!=='daily'); hidden(interval.wrap,schedule.input.value!=='interval'); runAt.input.required=schedule.input.value==='once'; daily.input.required=schedule.input.value==='daily'; interval.input.required=schedule.input.value==='interval'; hidden(quietBox,kind.input.value!=='checkin'); }
  schedule.input.onchange=update; kind.input.onchange=update; update();
  const save=node('button','button primary','保存例行任务'); save.type='submit'; const footer=node('div','form-footer'); footer.append(btn('返回',openRoutines,'subtle'),save); form.append(footer); body.append(form);
  api('/api/skills').then(function (skills) { if (!skill.input.isConnected) return; list(skills).forEach(function (s) { const option=node('option','',s.name+' · '+scopeLabel(s.bot_id)); option.value=s.id; skill.input.append(option); }); skill.input.value=routine && routine.skill_id || ''; }).catch(function (e) { formError(form,'技能列表暂不可用：'+e.message); });
  submitHandler(form,save,async function () {
    const payload={name:title.input.value.trim(),bot_id:bot.input.value,conversation_id:conversationField.input.value,prompt:prompt.input.value.trim(),kind:kind.input.value,schedule:schedule.input.value,timezone:'Asia/Shanghai',enabled:check.checked,skill_id:skill.input.value || null};
    if (schedule.input.value==='once') { const parsed=new Date(runAt.input.value+':00+08:00').getTime()/1000; if (!Number.isFinite(parsed)) throw new Error('请选择有效的执行时间。'); payload.run_at=parsed; }
    if (schedule.input.value==='daily') payload.time_of_day=daily.input.value;
    if (schedule.input.value==='interval') payload.interval_seconds=Math.round(Number(interval.input.value)*60);
    if (kind.input.value==='checkin') { payload.quiet_start=quietStart.input.value || null; payload.quiet_end=quietEnd.input.value || null; payload.max_daily=Number(maxDaily.input.value); }
    await mutation('/api/routines'+(routine?'/'+encodeURIComponent(routine.id):''),routine?'PATCH':'POST',payload); toast('例行任务已保存'); openRoutines();
  });
}
async function openRoutineRuns(routine) {
  const body=openModal(routine.name+' · 运行历史','routine-runs'); body.append(node('p','muted small-text','正在读取运行历史…'));
  try {
    const runs=list(await api('/api/routines/'+encodeURIComponent(routine.id)+'/runs')); if (state.modalView!=='routine-runs') return; body.replaceChildren();
    body.append(btn('返回例行任务',openRoutines,'subtle compact')); const holder=node('div','resource-list'); holder.style.marginTop='15px'; body.append(holder);
    if (!runs.length) holder.append(emptyState('还没有运行记录','任务实际触发后会在这里留下一条记录。','clock'));
    runs.forEach(function (run) {
      const row=node('article','resource-card'),head=node('div','resource-card-head'); head.append(node('h3','',stamp(run.scheduled_at || run.created_at)),statusPill(run.status)); row.append(head);
      const details=node('div','resource-meta'); details.append(node('span','','开始：'+stamp(run.created_at))); if (run.finished_at) details.append(node('span','','结束：'+stamp(run.finished_at))); row.append(details);
      if (run.error) row.append(node('p','form-error',run.error));
      if (run.task_id) row.append(btn('查看执行过程',function () { openTaskDetail(run.task_id); },'subtle compact','tasks')); holder.append(row);
    });
  } catch (e) { body.replaceChildren(node('p','form-error',e.message)); }
}
async function openFiles() {
  const body=openModal('工作区文件','files'); body.append(node('p','muted small-text','正在读取文件…'));
  try {
    state.files=list(await api('/api/files')); if (state.modalView!=='files') return; body.replaceChildren();
    const input=node('input','sr-only'); input.type='file'; input.multiple=true;
    const upload=btn('上传文件',function () { input.click(); },'primary compact','upload');
    input.onchange=async function () { const files=Array.from(input.files); input.value=''; if (!files.length) return; await busy(upload,async function () { await uploadFiles(files,false); toast('文件已上传到工作区'); openFiles(); }); };
    const top=node('div','manager-toolbar'); top.append(node('p','','上传的文件和 Bot 保存的成果集中在这里。'),upload,input); body.append(top);
    const holder=node('div','resource-list'); body.append(holder); if (!state.files.length) holder.append(emptyState('工作区还没有文件','从聊天输入框或这里上传文件。','file'));
    state.files.forEach(function (file) {
      const card=node('article','resource-card'),head=node('div','resource-card-head'); head.append(node('h3','',file.name));
      const download=node('a','button secondary compact','下载'); download.href=withBase('/api/files/'+encodeURIComponent(file.id)+'/download'); download.append(icon('download')); head.append(download); card.append(head);
      const meta=node('div','resource-meta'); meta.append(node('span','',size(file.size)),node('span','',stamp(file.created_at))); card.append(meta);
      if (file.task_id) card.append(btn('来源任务',function () { openTaskDetail(file.task_id); },'subtle compact','tasks')); holder.append(card);
    });
  } catch (e) { body.replaceChildren(node('p','form-error',e.message)); }
}

initialize();
