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
  user:['M20 21v-2a7 7 0 0 0-14 0v2','M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0'],
  smile:['M8 14s1.5 3 4 3 4-3 4-3M8 9h.01M16 9h.01','M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
  help:['M12 16h.01M9.5 8.5a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 4','M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'],
  pin:['m16 3 5 5-4 1-3 6-5-5 6-3zM9 15l-6 6'],
  folder:['M3 7V4h6l2 3h10v13H3zM3 7h18'],
  copy:['M9 9h12v12H9zM15 9V3H3v12h6'],
  hide:['m3 3 18 18M10.5 10.5a2 2 0 0 0 3 3M9 5.5c1-.3 2-.5 3-.5 6 0 10 7 10 7a22 22 0 0 1-4 4M6 6a25 25 0 0 0-4 6s4 7 10 7c2 0 4-.8 5-1.5'],
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
    const image = node('img','avatar bot-portrait'); image.src = BASE + '/assets/dafeiyu-avatar.png'; image.alt = bot.name || '大肥鱼'; return image;
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
  authenticated:false,bots:[],conversations:[],tasks:[],files:[],settings:{},profile:{display_name:'我',avatar_data:''},messages:[],conversationId:null,selectedTaskId:null,
  pendingFiles:[],messageSignature:'',browserSnapshot:null,browserImageError:false,browserOpen:false,
  pollTimer:null,polling:false,pollCount:0,lastInteraction:Date.now(),lastBrowserRefresh:0,browserRefreshing:false,connected:false,pinBottom:true,scrollingProgrammatically:false,
  modalView:null,detailTaskId:null,detailSignature:'',installPrompt:null,swRegistration:null,lastServerSync:0,accountMenuOpen:false,sidebar:{bots:{},groups:[]}
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
  closeBotContext(false);
  closeAccountMenu(false);
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
    const data=await Promise.all([api('/api/bots'),api('/api/conversations'),api('/api/tasks'),api('/api/files'),api('/api/settings'),api('/api/profile'),api('/api/sidebar')]);
    state.bots=list(data[0]); state.conversations=list(data[1]); state.tasks=list(data[2]); state.files=list(data[3]); state.settings=data[4]; state.profile=data[5]; state.sidebar=data[6]; renderAccount();
    const requested=new URL(location.href).searchParams.get('conversation');
    let remembered;
    try { remembered=localStorage.getItem('deepseek-conversation:'+BASE); } catch (_) {}
    const candidate=requested || state.conversationId || remembered;
    state.conversationId=state.conversations.some(function (c) { return c.id===candidate; }) ? candidate : (state.conversations.find(function (c) { const b=primaryBot(); return b && (c.id===b.conversation_id || list(c.members).includes(b.id)); }) || state.conversations[0] || {}).id;
    hidden($('auth-screen'),true); hidden($('app'),false); applyPanels(); renderContacts(); renderHeading(); renderSettingsBanner();
    connection(true); await loadMessages(true); renderActivity(); renderBrowserTasks();
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
      const more=await Promise.all([api('/api/bots'),api('/api/files'),api('/api/settings'),api('/api/profile'),api('/api/sidebar')]);
      state.bots=list(more[0]); state.files=list(more[1]); state.settings=more[2];
      if (JSON.stringify(state.profile)!==JSON.stringify(more[3])) { state.profile=more[3]; renderAccount(); }
      state.sidebar=more[4];
      renderSettingsBanner();
    }
    state.lastServerSync=Date.now(); connection(true); renderContacts(); renderMessages(false); renderActivity(); renderBrowserTasks();
    if (state.detailTaskId && state.modalView==='task-detail') refreshTaskDetail();
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
  closeBotContext(false);
  closeAccountMenu(false);
  state.conversationId=id; state.messageSignature=''; state.selectedTaskId=null; state.browserSnapshot=null; state.pinBottom=true;
  try { localStorage.setItem('deepseek-conversation:'+BASE,id); } catch (_) {}
  const url=new URL(location.href); url.searchParams.set('conversation',id); history.replaceState(null,'',url);
  $('app').classList.remove('sidebar-open'); hidden($('sidebar-scrim'),true);
  applyPanels();
  renderContacts(); renderHeading(); renderActivity(); renderBrowserTasks(); resetBrowserPreview();
  try { await loadMessages(true); } catch (e) { $('messages').replaceChildren(node('div','load-error',e.message)); toast(e.message,true); }
  state.lastInteraction=Date.now(); schedulePoll(1500);
}
async function selectBot(bot) {
  if (botSidebar(bot.id).unread) await updateBotSidebar(bot.id,{unread:false});
  let direct=state.conversations.find(function (c) { return c.id===bot.conversation_id || c.kind==='direct' && list(c.members).includes(bot.id); });
  if (!direct) { direct=await mutation('/api/conversations','POST',{title:bot.name,kind:'direct',members:[bot.id]}); state.conversations.push(direct); }
  await selectConversation(direct.id);
}
const botContext={id:null,main:null,sub:null,groupButton:null,compact:false,press:null,suppressed:null};
function cancelBotPress() {
  const press=botContext.press; if (press) clearTimeout(press.timer);
  if (press && botContext.suppressed && botContext.suppressed.id===press.id && botContext.suppressed.until===Infinity) botContext.suppressed.until=Date.now()+1000;
  botContext.press=null;
}
function botTrigger(id) { return id && document.querySelector('[data-bot-id="'+CSS.escape(id)+'"]'); }
function contextItems(panel) { return panel ? Array.from(panel.querySelectorAll('[role="menuitem"]:not(:disabled)')) : []; }
function botSubmenuNeedsCompact() {
  if (!botContext.main) return true;
  const box=botContext.main.getBoundingClientRect(),width=matchMedia('(max-width:759px)').matches?238:218;
  return Math.max(box.left-12,innerWidth-box.right-12)<width;
}
function closeBotSubmenu(focus) {
  if (botContext.sub) botContext.sub.remove(); botContext.sub=null;
  if (botContext.main) { botContext.main.style.visibility=''; botContext.main.inert=false; botContext.main.removeAttribute('aria-hidden'); }
  if (botContext.groupButton) { botContext.groupButton.setAttribute('aria-expanded','false'); if (focus) botContext.groupButton.focus(); }
  botContext.compact=false;
}
function closeBotContext(restoreFocus) {
  const id=botContext.id; closeBotSubmenu(false);
  if (botContext.main) botContext.main.remove(); botContext.main=null; botContext.id=null; botContext.groupButton=null;
  const trigger=botTrigger(id); if (trigger) { trigger.setAttribute('aria-expanded','false'); if (restoreFocus) trigger.focus({preventScroll:true}); }
}
function attachBotContext(button,bot) {
  button.dataset.botId=bot.id; button.classList.add('bot-context-target'); button.setAttribute('aria-haspopup','menu'); button.setAttribute('aria-expanded',String(botContext.id===bot.id));
  button.addEventListener('contextmenu',function (event) {
    event.preventDefault(); const press=botContext.press;
    if (press && press.id===bot.id) { clearTimeout(press.timer); press.fired=true; botContext.suppressed={id:bot.id,until:Infinity}; if (botContext.id===bot.id) return; }
    else cancelBotPress();
    openBotContext(bot.id,event.clientX,event.clientY,false);
  });
  button.addEventListener('keydown',function (event) { if (event.key==='ContextMenu' || event.shiftKey && event.key==='F10') { event.preventDefault(); const r=this.getBoundingClientRect(); openBotContext(bot.id,r.left+Math.min(r.width,180),r.top+Math.min(r.height,40),true); } });
  button.addEventListener('pointerdown',function (event) {
    if (event.pointerType!=='touch' && event.pointerType!=='pen' || event.button!==0) return;
    cancelBotPress(); const press={id:bot.id,x:event.clientX,y:event.clientY,pointerId:event.pointerId,fired:false}; botContext.press=press;
    press.timer=setTimeout(function () { if (botContext.press!==press) return; press.fired=true; botContext.suppressed={id:bot.id,until:Infinity}; openBotContext(bot.id,press.x,press.y,false); },550);
  });
  button.addEventListener('click',function (event) { if (botContext.suppressed && botContext.suppressed.id===bot.id && Date.now()<botContext.suppressed.until) { event.preventDefault(); event.stopImmediatePropagation(); } },true);
}
function contextItem(panel,label,symbol,action,options) {
  const opts=options || {},item=node('button','bot-context-item'+(opts.danger?' danger':'')+(opts.selected?' selected':'')); item.type='button'; item.tabIndex=-1; item.setAttribute('role','menuitem');
  item.append(icon(symbol),node('span','',label)); item.disabled=Boolean(opts.disabled); if (opts.description) { item.title=opts.description; item.setAttribute('aria-description',opts.description); }
  if (opts.selected) item.append(icon('check'));
  if (action) item.onclick=function () { closeBotContext(true); busy(null,function () { return action(); }); };
  item.addEventListener('pointerenter',function (event) { if (panel===botContext.main && event.pointerType!=='touch' && item!==botContext.groupButton) closeBotSubmenu(false); });
  panel.append(item); return item;
}
function contextSeparator(panel) { const line=node('div','bot-context-separator'); line.setAttribute('role','separator'); panel.append(line); }
function contextKeyboard(event,panel,isSub) {
  if (event.key==='Escape' || event.key==='ArrowLeft' && isSub) { event.preventDefault(); event.stopPropagation(); if (botContext.sub) closeBotSubmenu(true); else closeBotContext(true); return; }
  if (event.key==='Tab') { closeBotContext(true); return; }
  if (event.key==='ArrowRight' && document.activeElement===botContext.groupButton) { event.preventDefault(); showBotGroupSubmenu(true); return; }
  if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
  event.preventDefault(); const items=contextItems(panel),index=items.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length; if (items[next]) items[next].focus();
}
function openBotContext(id,x,y,keyboard) {
  const bot=botById(id); if (!bot) return; closeAccountMenu(false); closeBotContext(false);
  botContext.id=id; const pref=botSidebar(id),main=node('div','bot-context-menu'); botContext.main=main; main.setAttribute('role','menu'); main.setAttribute('aria-label',bot.name+'的菜单');
  main.append(node('div','bot-context-caption',bot.name));
  contextItem(main,bot.is_primary?'主管固定置顶':pref.pinned?'取消置顶':'置顶','pin',function () { return updateBotSidebar(id,{pinned:!pref.pinned}); },{disabled:bot.is_primary,description:bot.is_primary?'主管始终显示在侧栏顶部':''});
  const groups=contextItem(main,'移动到分组','folder',null,{disabled:bot.is_primary,description:bot.is_primary?'主管固定显示，不参与联系人分组':''}); botContext.groupButton=groups; groups.setAttribute('aria-haspopup','menu'); groups.setAttribute('aria-expanded','false'); groups.append(icon('chevron'));
  groups.onclick=function () { showBotGroupSubmenu(true); };
  groups.addEventListener('pointerenter',function (event) { if (event.pointerType==='mouse' && !groups.disabled && !botSubmenuNeedsCompact()) showBotGroupSubmenu(false); });
  contextItem(main,pref.unread?'标为已读':'标为未读','bell',function () { return updateBotSidebar(id,{unread:!pref.unread}); });
  contextSeparator(main);
  contextItem(main,'重命名 Bot','edit',function () { openBotRename(bot); });
  contextItem(main,'职责与头像','user',function () { openBotEditor(bot); });
  if (!bot.is_primary) contextItem(main,'设为主管','star',async function () { await mutation('/api/bots/'+encodeURIComponent(id)+'/primary','POST',{}); await refreshCollections(); await refreshSidebar(); toast('已将 '+bot.name+' 设为主管'); });
  contextSeparator(main);
  contextItem(main,'复制对话 ID','copy',function () { return copyBotConversation(bot); });
  contextItem(main,'从侧边栏隐藏','hide',async function () { await updateBotSidebar(id,{hidden:true}); toast('已隐藏 '+bot.name,false,{label:'撤销',run:function () { busy(null,function () { return updateBotSidebar(id,{hidden:false}); }); }}); },{disabled:bot.is_primary,description:bot.is_primary?'请先将其他 Bot 设为主管':'可从账户菜单的“隐藏的 Bot”恢复'});
  contextSeparator(main);
  const running=state.tasks.some(function (task) { return task.bot_id===id && !TERMINAL.has(task.status); });
  contextItem(main,'删除 Bot','trash',function () { openBotDelete(bot); },{danger:true,disabled:bot.is_primary || running,description:bot.is_primary?'请先将其他 Bot 设为主管':running?'请先停止这个 Bot 尚未结束的任务':'永久删除 Bot 及其私有记录'});
  main.onkeydown=function (event) { contextKeyboard(event,main,false); }; main.style.visibility='hidden'; document.body.append(main);
  const r=main.getBoundingClientRect(),left=Math.max(8,Math.min(x,innerWidth-r.width-8)),top=Math.max(8,Math.min(y,innerHeight-r.height-8)); main.style.left=left+'px'; main.style.top=top+'px'; main.style.visibility='';
  const trigger=botTrigger(id); if (trigger) trigger.setAttribute('aria-expanded','true'); const first=contextItems(main)[0]; if (first) first.focus({preventScroll:true});
}
function showBotGroupSubmenu(focus) {
  if (!botContext.id || !botContext.groupButton || botContext.groupButton.disabled) return;
  if (botContext.sub) { if (focus) contextItems(botContext.sub)[0].focus(); return; }
  const id=botContext.id,pref=botSidebar(id),main=botContext.main,anchor=botContext.groupButton.getBoundingClientRect(),box=main.getBoundingClientRect(),sub=node('div','bot-context-menu bot-context-submenu');
  sub.setAttribute('role','menu'); sub.setAttribute('aria-label','移动到分组'); botContext.sub=sub; botContext.groupButton.setAttribute('aria-expanded','true');
  const compact=botSubmenuNeedsCompact(); botContext.compact=compact;
  if (compact) { const back=contextItem(sub,'返回','chevron',null); back.classList.add('submenu-back'); back.onclick=function () { closeBotSubmenu(true); }; contextSeparator(sub); }
  contextItem(sub,'未分组','folder',function () { return updateBotSidebar(id,{group_id:null}); },{selected:!pref.group_id});
  list(state.sidebar.groups).forEach(function (group) { contextItem(sub,group.name,'folder',function () { return updateBotSidebar(id,{group_id:group.id}); },{selected:pref.group_id===group.id}); });
  contextSeparator(sub); contextItem(sub,'新建分组…','plus',function () { openBotGroupEditor(null,id); }); contextItem(sub,'管理分组…','settings',openBotGroups);
  sub.onkeydown=function (event) { contextKeyboard(event,sub,true); }; sub.style.visibility='hidden'; document.body.append(sub); const size=sub.getBoundingClientRect();
  let left=box.right+4; if (left+size.width>innerWidth-8) left=box.left-size.width-4;
  if (compact) { left=box.left; main.style.visibility='hidden'; main.inert=true; main.setAttribute('aria-hidden','true'); }
  sub.style.left=Math.max(8,Math.min(left,innerWidth-size.width-8))+'px'; sub.style.top=Math.max(8,Math.min(compact?box.top:anchor.top,innerHeight-size.height-8))+'px'; sub.style.visibility='';
  if (focus) contextItems(sub)[0].focus();
}
function initializeBotContext() {
  document.addEventListener('pointerdown',function (event) { if (botContext.id && !(botContext.main && botContext.main.contains(event.target)) && !(botContext.sub && botContext.sub.contains(event.target))) closeBotContext(false); });
  document.addEventListener('pointermove',function (event) { const press=botContext.press; if (press && press.pointerId===event.pointerId && !press.fired && Math.hypot(event.clientX-press.x,event.clientY-press.y)>10) cancelBotPress(); });
  document.addEventListener('pointerup',function () { const press=botContext.press; if (press && (press.fired || botContext.suppressed && botContext.suppressed.id===press.id && botContext.suppressed.until===Infinity)) botContext.suppressed={id:press.id,until:Date.now()+1000}; cancelBotPress(); });
  document.addEventListener('pointercancel',cancelBotPress); window.addEventListener('blur',function () { cancelBotPress(); closeBotContext(false); });
  document.addEventListener('scroll',function (event) { cancelBotPress(); if (botContext.id && !(botContext.main && botContext.main.contains(event.target)) && !(botContext.sub && botContext.sub.contains(event.target))) closeBotContext(false); },true);
  document.addEventListener('keydown',function (event) { if (event.key==='Escape' && botContext.id && !(botContext.main && botContext.main.contains(event.target)) && !(botContext.sub && botContext.sub.contains(event.target))) { event.preventDefault(); closeBotContext(true); } });
  window.addEventListener('resize',function () { closeBotContext(false); cancelBotPress(); });
}
function openBotRename(bot) {
  const body=openModal('重命名 '+bot.name,'bot-rename'),form=node('form'),name=field('Bot 名字','text',bot.name); name.input.required=true; name.input.maxLength=64;
  const save=node('button','button primary','保存名字'); save.type='submit'; const footer=node('div','form-footer'); footer.append(btn('取消',closeModal,'subtle'),save); form.append(name.wrap,footer); body.append(form);
  submitHandler(form,save,async function () { await mutation('/api/bots/'+encodeURIComponent(bot.id),'PATCH',{name:name.input.value.trim()}); await refreshCollections(); closeModal(); toast('名字已更新'); });
}
async function copyBotConversation(bot) {
  let direct=botDirect(bot); if (!direct) { direct=await mutation('/api/conversations','POST',{title:bot.name,kind:'direct',members:[bot.id]}); state.conversations.push(direct); }
  try { if (!navigator.clipboard) throw new Error('clipboard'); await navigator.clipboard.writeText(direct.id); toast('对话 ID 已复制'); }
  catch (_) { const body=openModal('复制对话 ID','copy-conversation'),id=field('对话 ID','text',direct.id); id.input.readOnly=true; body.append(node('p','muted small-text','当前浏览器未允许直接复制，可以选中后复制。'),id.wrap,btn('选中对话 ID',function () { id.input.focus(); id.input.select(); },'secondary')); id.input.focus(); id.input.select(); }
}
function openBotDelete(bot) {
  if (bot.is_primary) { toast('请先将其他 Bot 设为主管。',true); return; }
  const body=openModal('删除 '+bot.name,'bot-delete'),form=node('form');
  body.append(node('p','delete-warning','将永久删除这个 Bot、它的单聊消息、任务记录、私有记忆、私有技能和例行安排，并从群聊成员中移除。此操作无法撤销。'));
  const name=field('输入 Bot 名字以确认','text',''); name.input.required=true; name.input.autocomplete='off'; name.input.placeholder=bot.name;
  const remove=node('button','button danger','永久删除 '+bot.name); remove.type='submit'; remove.disabled=true; name.input.oninput=function () { remove.disabled=name.input.value!==bot.name; };
  const footer=node('div','form-footer'); footer.append(btn('取消',closeModal,'subtle'),remove); form.append(name.wrap,footer); body.append(form);
  submitHandler(form,remove,async function () { if (name.input.value!==bot.name) throw new Error('请输入完整的 Bot 名字。'); await mutation('/api/bots/'+encodeURIComponent(bot.id),'DELETE'); await refreshCollections(); await refreshSidebar(); closeModal(); toast('Bot 已删除'); });
}
function openBotGroupEditor(group,moveBotId) {
  const body=openModal(group?'重命名分组':'新建分组','bot-group-editor'),form=node('form'),name=field('分组名称','text',group?group.name:''); name.input.required=true; name.input.maxLength=40;
  const save=node('button','button primary',group?'保存分组':'创建分组'); save.type='submit'; const footer=node('div','form-footer'); footer.append(btn('取消',closeModal,'subtle'),save); form.append(name.wrap,footer); body.append(form);
  submitHandler(form,save,async function () { const result=await mutation('/api/bot-groups'+(group?'/'+encodeURIComponent(group.id):''),group?'PATCH':'POST',{name:name.input.value.trim()}); await refreshSidebar(); if (moveBotId) await updateBotSidebar(moveBotId,{group_id:result.id}); closeModal(); toast(group?'分组已更新':'分组已创建'); });
}
async function openBotGroups() {
  const body=openModal('管理分组','bot-groups'); body.append(node('p','muted small-text','正在读取分组…')); try { await refreshSidebar(); } catch (error) { body.replaceChildren(node('p','form-error',error.message)); return; } if (state.modalView!=='bot-groups') return;
  body.replaceChildren(); body.append(toolbar('分组只整理侧栏中的联系人。','新建分组',function () { openBotGroupEditor(); })); const holder=node('div','resource-list'); body.append(holder);
  if (!state.sidebar.groups.length) holder.append(emptyState('还没有分组','可以将研究、学习或生活相关的 Bot 放在一起。','folder'));
  state.sidebar.groups.forEach(function (group) { const card=node('article','resource-card'),head=node('div','resource-card-head'),actions=node('div','form-row'); head.append(node('h3','',group.name)); actions.append(btn('重命名',function () { openBotGroupEditor(group); },'subtle compact'),btn('删除分组',function () { openBotGroupDelete(group); },'subtle compact')); head.append(actions); const count=state.bots.filter(function (b) { return botSidebar(b.id).group_id===group.id; }).length; card.append(head,node('p','muted small-text',count+' 个 Bot')); holder.append(card); });
}
function openBotGroupDelete(group) {
  const body=openModal('删除分组','bot-group-delete'); body.append(node('p','', '删除“'+group.name+'”后，其中的 Bot 会回到未分组，聊天和其他记录会保留。'));
  const footer=node('div','form-footer'),remove=btn('删除分组',function () { busy(remove,async function () { await mutation('/api/bot-groups/'+encodeURIComponent(group.id),'DELETE'); await refreshSidebar(); openBotGroups(); }); },'danger'); footer.append(btn('取消',openBotGroups,'subtle'),remove); body.append(footer);
}
async function openHiddenBots() {
  const body=openModal('隐藏的 Bot','hidden-bots'); body.append(node('p','muted small-text','正在读取隐藏的 Bot…')); try { await refreshSidebar(); } catch (error) { body.replaceChildren(node('p','form-error',error.message)); return; } if (state.modalView!=='hidden-bots') return;
  body.replaceChildren(); body.append(node('p','muted small-text','隐藏只收起侧栏入口，原有聊天、任务和记忆仍在。恢复后可继续使用同一个 Bot。')); const holder=node('div','resource-list'); body.append(holder);
  const bots=state.bots.filter(function (b) { return !b.is_primary && botSidebar(b.id).hidden; }); if (!bots.length) holder.append(emptyState('没有隐藏的 Bot','右键联系人可将暂时不用的 Bot 从侧栏收起。','hide'));
  bots.forEach(function (bot) { const card=node('article','resource-card'),head=node('div','resource-card-head'),intro=node('div','form-row'); intro.append(avatar(bot),node('h3','',bot.name)); const restore=btn('恢复到侧栏',function () { busy(restore,async function () { await updateBotSidebar(bot.id,{hidden:false}); toast('已恢复 '+bot.name); openHiddenBots(); }); },'secondary compact'); head.append(intro,restore); card.append(head); holder.append(card); });
}

function botSidebar(id) {
  return Object.assign({pinned:false,hidden:false,unread:false,group_id:null},(state.sidebar.bots || {})[id] || {});
}
function botDirect(bot) { return state.conversations.find(function (c) { return c.id===bot.conversation_id || c.kind==='direct' && list(c.members).includes(bot.id); }); }
async function refreshSidebar() { state.sidebar=await api('/api/sidebar'); renderContacts(); }
async function updateBotSidebar(id,values) {
  const result=await mutation('/api/bots/'+encodeURIComponent(id)+'/sidebar','PATCH',values);
  state.sidebar.bots=state.sidebar.bots || {}; state.sidebar.bots[id]=result; renderContacts(); return result;
}
function unreadDot() { const dot=node('span','unread-dot'); dot.setAttribute('aria-label','未读'); return dot; }
function renderContacts() {
  const query=$('contact-search').value.trim().toLowerCase(),primary=primaryBot();
  const focused=document.activeElement && document.activeElement.dataset.botId;
  $('primary-contact').replaceChildren();
  if (primary && (!query || (primary.name+' '+primary.role).toLowerCase().includes(query))) {
    const card=node('button','primary-card'+(currentBot() && currentBot().id===primary.id ? ' active' : ''));
    const wrap=node('div','avatar-wrap'); wrap.append(avatar(primary)); const star=node('span','primary-star'); star.append(icon('star')); wrap.append(star);
    card.append(wrap,node('strong','',primary.name),node('span','','主管 · 统筹你的工作')); if (botSidebar(primary.id).unread) card.append(unreadDot());
    card.onclick=function () { busy(card,function () { return selectBot(primary); }); }; attachBotContext(card,primary); $('primary-contact').append(card);
  }
  const contacts=$('contact-list'),scroll=contacts.scrollTop; contacts.replaceChildren();
  const bots=state.bots.filter(function (b) { return (!primary || b.id!==primary.id) && !botSidebar(b.id).hidden && (!query || (b.name+' '+b.role).toLowerCase().includes(query)); });
  const chats=state.conversations.filter(function (c) { return c.kind==='group' && (!query || c.title.toLowerCase().includes(query)); });
  function addBot(bot) {
    const direct=botDirect(bot),pref=botSidebar(bot.id),active=direct && direct.id===state.conversationId;
    const b=node('button','contact'+(active?' active':'')+(pref.unread?' unread':'')); b.append(avatar(bot));
    const text=node('div','contact-text'),title=node('div','contact-title'),name=node('strong','',bot.name); title.append(name);
    if (pref.unread) title.append(unreadDot());
    if (pref.pinned) { const marker=icon('pin'); marker.classList.add('contact-pin'); title.append(marker); }
    if (direct && direct.updated_at) title.append(node('time','',time(direct.updated_at)));
    let preview=bot.role || '发送消息，开始对话';
    if (direct && direct.last_message) preview=typeof direct.last_message==='object' ? direct.last_message.content : direct.last_message;
    else if (active && state.messages.length) preview=state.messages[state.messages.length-1].content;
    text.append(title,node('p','contact-preview',preview)); b.append(text); b.onclick=function () { busy(b,function () { return selectBot(bot); }); }; attachBotContext(b,bot); contacts.append(b);
  }
  function section(name,items) { if (!items.length) return; contacts.append(node('div','list-section-label',name)); items.forEach(addBot); }
  section('置顶',bots.filter(function (b) { return botSidebar(b.id).pinned; }));
  const regular=bots.filter(function (b) { return !botSidebar(b.id).pinned; });
  section('联系人',regular.filter(function (b) { return !botSidebar(b.id).group_id; }));
  list(state.sidebar.groups).forEach(function (group) { section(group.name,regular.filter(function (b) { return botSidebar(b.id).group_id===group.id; })); });
  if (chats.length) contacts.append(node('div','list-section-label','群聊'));
  chats.forEach(function (c) { const b=node('button','contact'+(c.id===state.conversationId?' active':'')); b.append(avatar(null,true)); const text=node('div','contact-text'),title=node('div','contact-title'); title.append(node('strong','',c.title)); const members=list(c.members).map(function (id) { return (botById(id)||{}).name; }).filter(Boolean); text.append(title,node('p','contact-preview',members.join('、'))); b.append(text); b.onclick=function () { selectConversation(c.id); }; contacts.append(b); });
  if (!bots.length && !chats.length && query) contacts.append(node('p','contact-loading','没有找到匹配的联系人或群聊。'));
  contacts.scrollTop=scroll;
  if (focused && !botContext.id) { const replacement=document.querySelector('[data-bot-id="'+CSS.escape(focused)+'"]'); if (replacement) replacement.focus({preventScroll:true}); }
  if (botContext.id && !botById(botContext.id)) closeBotContext(false);
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
    if (/^https?:\/\//i.test(part)) parent.append(safeAnchor(part, part) || document.createTextNode(part));
    else parent.append(document.createTextNode(part));
  });
}
function safeAnchor(label, href) {
  let url;
  try { url=new URL(href); } catch (_) { return null; }
  if (url.protocol!=='http:' && url.protocol!=='https:') return null;
  const link=node('a','',label); link.href=url.href; link.target='_blank'; link.rel='noopener noreferrer'; return link;
}
function appendInline(parent, text) {
  const pattern=/(!?\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(https?:\/\/[^\s<>"'）。，；！？]+)/g;
  let last=0, match;
  while ((match=pattern.exec(text))) {
    if (match.index>last) parent.append(document.createTextNode(text.slice(last, match.index)));
    if (match[1]) {
      const linked=/^!?\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(match[1]);
      parent.append(linked && safeAnchor(linked[1], linked[2]) || document.createTextNode(match[1]));
    } else if (match[2]) parent.append(node('code','',match[2].slice(1,-1)));
    else if (match[3]) { const strong=node('strong'); appendInline(strong, match[3].slice(2,-2)); parent.append(strong); }
    else if (match[4]) { const em=node('em'); appendInline(em, match[4].slice(1,-1)); parent.append(em); }
    else parent.append(safeAnchor(match[5], match[5]) || document.createTextNode(match[5]));
    last=match.index+match[0].length;
  }
  if (last<text.length) parent.append(document.createTextNode(text.slice(last)));
}
function splitCells(line) {
  let value=line.trim();
  if (value.charAt(0)==='|') value=value.slice(1);
  if (value.charAt(value.length-1)==='|') value=value.slice(0,-1);
  const cells=[]; let current='', escaped=false;
  for (let index=0; index<value.length; index++) {
    const ch=value.charAt(index);
    if (escaped) { current+=ch; escaped=false; continue; }
    if (ch==='\\') { escaped=true; continue; }
    if (ch==='|') { cells.push(current.trim()); current=''; continue; }
    current+=ch;
  }
  cells.push(current.trim()); return cells;
}
function isSeparator(line) {
  const cells=splitCells(line);
  return cells.length>=2 && cells.every(function (cell) { return /^:?-{3,}:?$/.test(cell); });
}
function columnAlign(spec) {
  const left=spec.charAt(0)===':', right=spec.charAt(spec.length-1)===':';
  return left && right ? 'center' : right ? 'right' : 'left';
}
function listMarker(line) {
  const match=/^\s*(?:[-*]|(\d+)\.)\s+(\S.*)$/.exec(line);
  return match ? {ordered:Boolean(match[1]), text:match[2]} : null;
}
function blockKind(lines, index) {
  const line=lines[index];
  if (!line || !line.trim()) return '';
  if (/^\s*```/.test(line)) return 'code';
  if (/^#{1,6}\s+\S/.test(line)) return 'heading';
  if (listMarker(line)) return 'list';
  if (/^>\s?/.test(line)) return 'quote';
  if (/^(\*\s*\*\s*\*|-{3,}|_{3,})\s*$/.test(line.trim())) return 'rule';
  if (index+1<lines.length && line.includes('|') && isSeparator(lines[index+1])) return 'table';
  return '';
}
function renderMarkdown(parent, content) {
  const lines=String(content || '').replace(/\r\n/g,'\n').split('\n');
  let index=0;
  while (index<lines.length) {
    const kind=blockKind(lines, index), line=lines[index];
    if (!kind) {
      if (!line.trim()) { index++; continue; }
      const paragraph=node('p');
      while (index<lines.length && lines[index].trim() && !blockKind(lines, index)) {
        if (paragraph.childNodes.length) paragraph.append(node('br'));
        appendInline(paragraph, lines[index]); index++;
      }
      parent.append(paragraph); continue;
    }
    if (kind==='code') {
      const body=[]; index++;
      while (index<lines.length && !/^\s*```/.test(lines[index])) { body.push(lines[index]); index++; }
      if (index<lines.length) index++;
      const pre=node('pre'); pre.append(node('code','',body.join('\n'))); parent.append(pre); continue;
    }
    if (kind==='heading') {
      const match=/^(#{1,6})\s+(\S.*)$/.exec(line), heading=node('h'+match[1].length);
      appendInline(heading, match[2]); parent.append(heading); index++; continue;
    }
    if (kind==='rule') { parent.append(node('hr')); index++; continue; }
    if (kind==='quote') {
      const quote=node('blockquote');
      while (index<lines.length && /^>\s?/.test(lines[index])) {
        if (quote.childNodes.length) quote.append(node('br'));
        appendInline(quote, lines[index].replace(/^>\s?/, '')); index++;
      }
      parent.append(quote); continue;
    }
    if (kind==='list') {
      const ordered=listMarker(line).ordered, list=node(ordered?'ol':'ul');
      while (index<lines.length) {
        const item=listMarker(lines[index]);
        if (!item || item.ordered!==ordered) break;
        const entry=node('li'); appendInline(entry, item.text); list.append(entry); index++;
      }
      parent.append(list); continue;
    }
    const rows=[line], aligns=splitCells(lines[index+1]).map(columnAlign);
    index+=2;
    while (index<lines.length && lines[index].trim() && lines[index].includes('|')) { rows.push(lines[index]); index++; }
    const wrap=node('div','md-table'), table=node('table'), head=node('tr'), body=node('tbody');
    splitCells(rows[0]).forEach(function (cell, cellIndex) {
      const cellNode=node('th'); cellNode.style.textAlign=aligns[cellIndex] || 'left'; appendInline(cellNode, cell); head.append(cellNode);
    });
    rows.slice(1).forEach(function (row) {
      const rowNode=node('tr');
      splitCells(row).forEach(function (cell, cellIndex) {
        const cellNode=node('td'); cellNode.style.textAlign=aligns[cellIndex] || 'left'; appendInline(cellNode, cell); rowNode.append(cellNode);
      });
      body.append(rowNode);
    });
    const headRow=node('thead'); headRow.append(head); table.append(headRow, body); wrap.append(table); parent.append(wrap);
  }
}
function withoutSpeaker(content, name) {
  const text=String(content || '');
  if (!name) return text;
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=text.match(new RegExp('^\\s*\\['+escaped+'\\]\\s*[:：]?\\s*'));
  return match ? text.slice(match[0].length) : text;
}
function renderMessageContent(parent, content, rich) {
  if (rich) { parent.classList.add('rich'); renderMarkdown(parent, content); return; }
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
function nearBottom(holder) { return holder.scrollHeight-holder.scrollTop-holder.clientHeight<80; }
function pendingReply() {
  const active=currentTasks().find(function (task) { return task.status==='queued' || task.status==='running'; });
  if (!active) return null;
  const last=state.messages[state.messages.length-1];
  if (last && last.role==='assistant' && last.task_id===active.id) return null;
  return active;
}
function stickMessages() {
  const holder=$('messages');
  if (!holder || !state.pinBottom) return;
  state.scrollingProgrammatically=true;
  holder.style.scrollBehavior='auto';
  const go=function () { holder.scrollTop=holder.scrollHeight; };
  go();
  requestAnimationFrame(function () { go(); requestAnimationFrame(function () { holder.style.scrollBehavior=''; state.scrollingProgrammatically=false; }); });
}
function renderMessages(force) {
  const attachments=state.messages.map(function (message) { return messageFiles(message).map(function (file) { return [file.id,file.name]; }); });
  const tasks=state.messages.map(function (message) { const task=state.tasks.find(function (item) { return item.id===message.task_id; }); return task ? [task.id,task.status] : null; });
  const pending=pendingReply();
  const signature=JSON.stringify([state.messages,attachments,tasks,pending && [pending.id,pending.status]]);
  if (!force && signature===state.messageSignature) return;
  const holder=$('messages'), bottom=nearBottom(holder);
  state.messageSignature=signature; const oldTop=holder.scrollTop; holder.replaceChildren();
  if (!state.messages.length && !pending) {
    const c=conversation(),bot=currentBot(),empty=node('div','empty-chat'); empty.append(avatar(bot,c && c.kind==='group'),node('h2','',bot ? '你好，'+bot.name : c ? c.title : '从一段对话开始'),node('p','',botDescription(bot) || '把想法发到这里，和 Bot 一起往下做。'),node('p','empty-hint','任务在服务器上执行，离开页面后也能继续。')); holder.append(empty); return;
  }
  state.messages.forEach(function (message) {
    const row=node('article','message-row '+message.role); const bot=botById(message.bot_id); if (message.role!=='user') row.append(avatar(bot || primaryBot()));
    const block=node('div','message-block'), meta=node('div','message-meta');
    meta.append(node('strong','',message.role==='user'?'你':message.role==='system'?'工作台':bot && bot.name || 'Bot'),node('time','',time(message.created_at)));
    const content=node('div','message-content'); renderMessageContent(content,message.role==='assistant' ? withoutSpeaker(message.content, bot && bot.name) : message.content, message.role==='assistant'); block.append(meta,content);
    const attachments=messageFiles(message);
    if (attachments.length) { const files=node('div','message-files'); attachments.forEach(function (file) { files.append(fileLink(file)); }); block.append(files); }
    if (message.task_id) { const task=state.tasks.find(function (t) { return t.id===message.task_id; }); const b=btn('查看任务',function () { openTaskDetail(message.task_id); },'subtle compact','tasks'); b.style.marginTop='5px'; if (task) b.append(statusPill(task.status)); block.append(b); }
    row.append(block); holder.append(row);
  });
  if (pending) {
    const thinking=node('div','thinking-row'); thinking.setAttribute('role','status'); thinking.setAttribute('aria-label','正在思考');
    const orb=node('span','thinking-orb'); orb.setAttribute('aria-hidden','true');
    thinking.append(orb,node('span','thinking-label','正在思考')); holder.append(thinking);
  }
  if (force || state.pinBottom || bottom) { state.pinBottom=true; stickMessages(); }
  else { state.scrollingProgrammatically=true; holder.style.scrollBehavior='auto'; holder.scrollTop=oldTop; requestAnimationFrame(function () { holder.style.scrollBehavior=''; state.scrollingProgrammatically=false; }); }
}
function renderActivity() {
  const tasks=currentTasks(),active=tasks.find(function (t) { return !TERMINAL.has(t.status); });
  const bar=$('activity-bar'); hidden(bar,!active); bar.replaceChildren();
  if (active) {
    bar.append(statusPill(active.status),node('span','activity-text',active.error || active.prompt));
    bar.append(btn('查看',function () { openTaskDetail(active.id); },'subtle compact'));
    if (['queued','running','waiting_config','waiting_user','waiting_approval','paused'].includes(active.status)) bar.append(btn('停止',function (e) { busy(e.currentTarget,function () { return taskAction(active.id,'stop'); }); },'subtle compact'));
    if (state.pinBottom) requestAnimationFrame(stickMessages);
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
    state.pinBottom=true;
    await loadMessages(true); renderActivity(); renderBrowserTasks(); stickMessages(); state.lastInteraction=Date.now(); schedulePoll(500);
  });
}
function openModal(title, view, large) {
  closeBotContext(false);
  closeAccountMenu(true);
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

function userAvatar(profile) {
  const value=profile || state.profile;
  if (/^data:image\/(png|jpeg|webp);base64,/.test(value.avatar_data || '')) {
    const image=node('img','user-avatar'); image.src=value.avatar_data; image.alt=''; return image;
  }
  const initial=Array.from(String(value.display_name || '我').trim())[0] || '我';
  const circle=node('span','user-avatar user-initial',initial.toLocaleUpperCase()); circle.setAttribute('aria-hidden','true'); return circle;
}
function userIdentity(profile) {
  const text=node('span','account-identity'); text.append(node('span','account-name',profile.display_name || '我')); return text;
}
function closeAccountMenu(restoreFocus) {
  const wasOpen=state.accountMenuOpen; state.accountMenuOpen=false;
  hidden($('account-menu'),true); $('account-button').setAttribute('aria-expanded','false');
  if (wasOpen && restoreFocus) $('account-button').focus();
}
function openAccountMenu(last) {
  closeBotContext(false);
  state.accountMenuOpen=true; hidden($('account-menu'),false); $('account-button').setAttribute('aria-expanded','true');
  const items=Array.from($('account-menu').querySelectorAll('[role="menuitem"]'));
  if (items.length) items[last ? items.length-1 : 0].focus();
}
function renderAccount() {
  const account=$('account-button'),menu=$('account-menu'),focused=Array.from(menu.querySelectorAll('[role="menuitem"]')).indexOf(document.activeElement);
  account.replaceChildren(userAvatar(),userIdentity(state.profile)); account.setAttribute('aria-label',(state.profile.display_name || '我')+'，打开账户菜单');
  menu.replaceChildren();
  function item(label,symbol,action,className) {
    const button=node('button','account-menu-item'+(className?' '+className:'')); button.type='button'; button.setAttribute('role','menuitem'); button.tabIndex=-1;
    button.append(icon(symbol),node('span','',label)); button.onclick=function () { closeAccountMenu(true); action(button); }; return button;
  }
  function separator() { const line=node('div','account-menu-separator'); line.setAttribute('role','separator'); menu.append(line); }
  const header=node('button','account-menu-profile'); header.type='button'; header.setAttribute('role','menuitem'); header.tabIndex=-1;
  header.append(userAvatar(),userIdentity(state.profile),icon('chevron')); header.onclick=function () { closeAccountMenu(true); openProfile(); }; menu.append(header);
  separator();
  menu.append(item('个性化','smile',openPersonalization),item('个人资料','user',openProfile),item('设置','settings',openSettings));
  separator();
  const resources=node('div','account-resources'); resources.setAttribute('role','group'); resources.setAttribute('aria-label','工作台工具');
  [['记忆','memory',openMemories],['技能','skill',openSkills],['例行','clock',openRoutines],['文件','file',openFiles]].forEach(function (entry) { resources.append(item(entry[0],entry[1],entry[2])); }); menu.append(resources);
  menu.append(item('隐藏的 Bot','hide',openHiddenBots));
  separator();
  const help=item('帮助','help',openHelp); help.append(icon('chevron')); menu.append(help,item('退出登录','logout',function (button) { busy(button,logoutWorkspace); }));
  if (state.accountMenuOpen && focused>=0) { const next=menu.querySelectorAll('[role="menuitem"]')[focused]; if (next) next.focus(); }
}
async function logoutWorkspace() {
  await mutation('/api/auth/logout','POST',{}); state.authenticated=false; state.pendingFiles=[]; renderPendingFiles(); state.profile={display_name:'我',avatar_data:''}; renderAccount(); closeModal(); showAuth();
}
function readAvatar(file) {
  return new Promise(function (resolve,reject) {
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { reject(new Error('请选择 PNG、JPG 或 WebP 图片。')); return; }
    if (file.size>10*1024*1024) { reject(new Error('图片不能超过 10 MB。')); return; }
    const url=URL.createObjectURL(file),image=new Image();
    image.onload=function () {
      try {
        const factor=Math.min(1,256/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(image.naturalWidth*factor)); canvas.height=Math.max(1,Math.round(image.naturalHeight*factor));
        const context=canvas.getContext('2d'); if (!context) throw new Error('当前设备无法处理这张图片。'); context.drawImage(image,0,0,canvas.width,canvas.height);
        let data=canvas.toDataURL('image/png');
        if (data.length>340000) { context.globalCompositeOperation='destination-over'; context.fillStyle='#ffffff'; context.fillRect(0,0,canvas.width,canvas.height); data=canvas.toDataURL('image/jpeg',.9); }
        resolve(data);
      } catch (error) { reject(error); }
      finally { URL.revokeObjectURL(url); }
    };
    image.onerror=function () { URL.revokeObjectURL(url); reject(new Error('图片无法读取，请换一张图片。')); }; image.src=url;
  });
}
async function openProfile() {
  const body=openModal('个人资料','profile'); body.append(node('p','muted small-text','正在读取个人资料…'));
  try { state.profile=await api('/api/profile'); } catch (error) { body.replaceChildren(node('p','form-error',error.message)); return; }
  if (state.modalView!=='profile') return;
  renderAccount(); body.replaceChildren();
  const form=node('form'),name=field('名字','text',state.profile.display_name || '我'); name.input.required=true; name.input.maxLength=64; name.input.autocomplete='nickname';
  let avatarData=state.profile.avatar_data || ''; const preview=node('div','profile-avatar-preview'),upload=node('input','sr-only'); upload.type='file'; upload.accept='image/png,image/jpeg,image/webp'; upload.setAttribute('aria-label','上传个人头像');
  function draw() { preview.replaceChildren(userAvatar({display_name:name.input.value,avatar_data:avatarData})); }
  const change=btn('更换头像',function () { upload.click(); },'secondary compact','upload'),remove=btn('移除头像',function () { avatarData=''; draw(); },'subtle compact');
  upload.onchange=async function () {
    const file=this.files[0]; this.value=''; if (!file) return; save.disabled=true; remove.disabled=true;
    try { await busy(change,async function () { const data=await readAvatar(file); if (state.modalView!=='profile') return; avatarData=data; draw(); }); }
    finally { if (save.isConnected) save.disabled=false; if (remove.isConnected) remove.disabled=false; }
  };
  name.input.oninput=draw; draw();
  const avatarRow=node('div','profile-avatar-row'),actions=node('div'); actions.append(change,remove,node('p','muted small-text','PNG、JPG 或 WebP，最多 10 MB。')); avatarRow.append(preview,actions,upload);
  const save=node('button','button primary','保存资料'); save.type='submit'; const footer=node('div','form-footer'); footer.append(btn('取消',closeModal,'subtle'),save);
  form.append(avatarRow,name.wrap,node('p','muted small-text','资料会保存在你的工作台，在电脑和手机上同步。'),footer); body.append(form);
  submitHandler(form,save,async function () { state.profile=await mutation('/api/profile','PUT',{display_name:name.input.value.trim(),avatar_data:avatarData}); renderAccount(); closeModal(); toast('个人资料已保存'); });
}
function openPersonalization() {
  const body=openModal('个性化','personalization'); body.append(node('p','muted small-text','让 Bot 按你习惯的方式与你合作。'));
  const choices=node('div','personalization-options'),primary=primaryBot();
  if (primary) choices.append(btn('调整'+primary.name+'的职责与说话风格',function () { openBotEditor(primary); },'secondary wide','smile'));
  choices.append(btn('管理偏好与记忆',openMemories,'secondary wide','memory'),btn('管理可复用的技能',openSkills,'secondary wide','skill')); body.append(choices);
}
function openHelp() {
  const body=openModal('帮助','help');
  [['与主管合作','直接发消息或交代任务。大肥鱼可以安排其他 Bot 协作，并向你汇总结果。'],['查看任务','右上角“任务”可以查看进度、补充要求或停止。'],['记忆、技能与例行','从左下角账户菜单进入。记忆保存偏好，技能保存方法，例行负责提醒和定时任务。'],['电脑和手机同步','使用同一个工作台地址登录。任务在服务器运行，离开页面后也能继续；聊天和同步需要联网。']].forEach(function (entry) { const section=node('section','help-section'); section.append(node('h3','',entry[0]),node('p','',entry[1])); body.append(section); });
  const link=node('a','button secondary compact','项目说明'); link.href='https://github.com/upinking/deepseek-bot#readme'; link.target='_blank'; link.rel='noopener noreferrer'; link.append(icon('link')); body.append(link);
}

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
  appSection.append(node('p','','安装后可以从桌面打开。离线时只能显示界面外壳；聊天和历史记录需要联网。服务器上的后台任务不依赖此页面保持打开。'));
  appSection.append(node('div','about-line','时区：'+(state.settings.timezone || 'Asia/Shanghai')+'（北京时间）'));
  const logout=btn('退出登录',function () { busy(logout,logoutWorkspace); },'subtle','logout');
  appSection.append(logout); body.append(appSection);
}

function applyPanels() {
  const narrow=matchMedia('(max-width:759px)').matches;
  if (!narrow) { $('app').classList.remove('sidebar-open'); hidden($('sidebar-scrim'),true); }
  const sidebarVisible=!narrow || $('app').classList.contains('sidebar-open');
  if (!sidebarVisible) closeAccountMenu(false);
  $('sidebar').inert=!sidebarVisible; $('sidebar').setAttribute('aria-hidden',String(!sidebarVisible));
  document.querySelector('.chat-panel').inert=Boolean(narrow && sidebarVisible);
}
function toggleBrowser(force) {
  state.browserOpen=force===undefined ? !state.browserOpen : Boolean(force); applyPanels();
  if (state.browserOpen) {
    if (!state.selectedTaskId) { const t=currentTasks()[0]; if (t) state.selectedTaskId=t.id; }
    renderBrowserTasks(); if (state.selectedTaskId) refreshBrowser(true);
  }
}
function resetBrowserPreview(message) {
  if (!$('browser-placeholder')) return;
  state.browserSnapshot=null; hidden($('browser-image'),true); hidden($('browser-placeholder'),false);
  const placeholder=$('browser-placeholder'); placeholder.replaceChildren(icon('browser'),node('span','',message || '页面将在任务访问浏览器后显示。'));
  $('browser-page-title').textContent='尚未打开页面'; $('browser-page-url').textContent='页面画面来自服务器'; $('browser-page-text').textContent='页面文字会在载入后显示。';
  $('browser-element').replaceChildren(node('option','','先刷新页面结构'));
}
function renderBrowserTasks() {
  if (!$('browser-task-select')) return;
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
  if (!$('browser-upload-file')) return;
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
  if (!$('browser-image') || !state.selectedTaskId || state.browserRefreshing || !state.authenticated) return;
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
  const assigned={'search-icon':'search','new-contact':'plus','sidebar-close':'close','sidebar-open':'menu','tasks-icon':'tasks','conversation-more':'more','attach-icon':'plus','send-button':'send','modal-close':'close'};
  Object.entries(assigned).forEach(function (pair) { $(pair[0]).append(icon(pair[1])); });
  initializeBotContext(); renderAccount();
  $('account-button').onclick=function () { if (state.accountMenuOpen) closeAccountMenu(true); else openAccountMenu(); };
  $('account-button').onkeydown=function (event) { if (event.key==='ArrowDown' || event.key==='ArrowUp') { event.preventDefault(); openAccountMenu(event.key==='ArrowUp'); } };
  $('account-menu').onkeydown=function (event) {
    if (event.key==='Escape') { event.preventDefault(); event.stopPropagation(); closeAccountMenu(true); return; }
    if (event.key==='Tab') { closeAccountMenu(true); return; }
    const keys=['ArrowDown','ArrowUp','Home','End']; if (!keys.includes(event.key)) return;
    event.preventDefault(); const items=Array.from(this.querySelectorAll('[role="menuitem"]')),index=items.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    if (items[next]) items[next].focus();
  };
  document.addEventListener('pointerdown',function (event) { if (state.accountMenuOpen && !$('account-area').contains(event.target)) closeAccountMenu(false); });
  document.addEventListener('focusin',function (event) { if (state.accountMenuOpen && !$('account-area').contains(event.target)) closeAccountMenu(false); });
  $('auth-form').onsubmit=async function (e) {
    e.preventDefault(); const button=$('auth-submit'); button.disabled=true; hidden($('auth-error'),true);
    try { await mutation('/api/auth/login','POST',{password:$('auth-password').value}); $('auth-password').value=''; state.authenticated=true; await loadWorkspace(); }
    catch (error) { $('auth-error').textContent=error.message; hidden($('auth-error'),false); }
    finally { button.disabled=false; }
  };
  $('auth-retry').onclick=checkAuth; $('contact-search').oninput=renderContacts; $('composer').onsubmit=sendMessage;
  $('messages').addEventListener('scroll',function () { if (!state.scrollingProgrammatically) state.pinBottom=nearBottom(this); });
  $('message-input').oninput=function () { this.style.height='auto'; this.style.height=Math.min(this.scrollHeight,160)+'px'; state.lastInteraction=Date.now(); };
  $('message-input').onkeydown=function (event) { if (event.key==='Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('composer').requestSubmit(); } };
  $('composer-files').onchange=async function () { const files=Array.from(this.files); this.value=''; if (!files.length) return; $('send-button').disabled=true; try { await uploadFiles(files,true); toast('文件已上传，将随下一条消息发送'); } catch (e) { toast(e.message,true); } finally { $('send-button').disabled=false; } };
  $('sidebar-open').onclick=function () { $('app').classList.add('sidebar-open'); hidden($('sidebar-scrim'),false); applyPanels(); };
  const closeSidebar=function () { closeBotContext(false); closeAccountMenu(false); $('app').classList.remove('sidebar-open'); hidden($('sidebar-scrim'),true); applyPanels(); };
  $('sidebar-close').onclick=closeSidebar; $('sidebar-scrim').onclick=closeSidebar;
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
  const tools=node('div','contact-management'); tools.append(btn('管理分组',openBotGroups,'subtle compact','folder'),btn('隐藏的 Bot',openHiddenBots,'subtle compact','hide')); body.append(tools);
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
    const actions=node('div','task-action-bar');
    if (!TERMINAL.has(task.status)) actions.append(btn('停止任务',function (e) { busy(e.currentTarget,function () { return taskAction(id,'stop'); }); },'danger','stop'));
    if (['paused','waiting_config','waiting_user','failed','cancelled'].includes(task.status) && !task.takeover) actions.append(btn('继续任务',function (e) { busy(e.currentTarget,function () { return taskAction(id,'resume',{}); }); },'primary','arrow'));
    actions.append(btn('保存为技能',function () { openSkillEditor(null,{name:task.prompt.slice(0,30),bot_id:task.bot_id,content:'任务目标：\n'+task.prompt+'\n\n方法与验证：\n'+(task.result || '请补充可复用的步骤、输入和结果检查方式。')}); },'subtle','skill')); body.append(actions);
    if (task.error) body.append(node('div','task-summary task-error',task.error));
    if (task.result) { const box=node('div','task-summary'); const speaker=botById(task.bot_id); renderMessageContent(box,withoutSpeaker(task.result, speaker && speaker.name),true); body.append(node('h3','content-title','任务结果'),box); }
    if (task.status==='waiting_approval') {
      const approval=node('div','approval-box'),event=events.slice().reverse().find(function (e) { return e.kind==='approval_required'; }),detail=event && object(event.detail);
      approval.append(node('h3','','请确认这一步操作'),node('p','',detail ? JSON.stringify(safeObject(detail),null,2) : '操作内容请查看下方执行记录。'));
      const row=node('div','form-row'); row.append(btn('允许这次操作',function (e) { busy(e.currentTarget,function () { return taskAction(id,'approval',{allow:true}); }); },'primary','check'),btn('拒绝这次操作',function (e) { busy(e.currentTarget,function () { return taskAction(id,'approval',{allow:false}); }); },'subtle')); approval.append(row); body.append(approval);
    }
    if (task.takeover) { const note=node('div','initialization-box','Bot 暂停在页面操作上。交回后它会自己继续。'); note.append(btn('交回并继续',function (e) { busy(e.currentTarget,async function () { await taskAction(id,'takeover',{enabled:false}); await taskAction(id,'resume',{}); }); },'primary','arrow')); body.append(note); }
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
