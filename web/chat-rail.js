/* Message navigation stays outside the log, so polling never replaces its controls. */
(function () {
  'use strict';
  let options, entries=[], rows=[], buttons=[], positions=[], frame=0, observer, active=-1, previewed=-1, hideTimer=0, spectrum=null;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  function text(value) {
    return String(value || '').replace(/```[^\n]*\n?/g,' ').replace(/[*#>`_~|]/g,'').replace(/\s+/g,' ').trim();
  }
  function hidePreview() {
    clearTimeout(hideTimer); previewed=-1;
    options.preview.hidden=true;
    buttons.forEach(function (b) { b.removeAttribute('aria-describedby'); });
  }
  function preview(index) {
    if (!entries[index]) return;
    previewed=index;
    const entry=entries[index], panel=options.preview;
    panel.replaceChildren();
    const head=document.createElement('div'); head.className='rail-preview-meta';
    const name=document.createElement('strong'); name.textContent=entry.author;
    const count=document.createElement('span'); count.textContent=(index+1)+' / '+entries.length+' · '+entry.time;
    head.append(name,count);
    const body=document.createElement('p'); body.textContent=entry.summary || '附件消息';
    panel.append(head,body); panel.hidden=false;
    buttons.forEach(function (b,i) { if (i===index) b.setAttribute('aria-describedby',panel.id); else b.removeAttribute('aria-describedby'); });
    const box=buttons[index].getBoundingClientRect(), stage=options.stage.getBoundingClientRect();
    panel.style.top=Math.max(8,Math.min(stage.height-panel.offsetHeight-8,box.top-stage.top-panel.offsetHeight/2+box.height/2))+'px';
  }
  function navigate(index) {
    if (!rows[index]) return;
    clearTimeout(hideTimer);
    options.onNavigate();
    const log=options.log, box=log.getBoundingClientRect(), row=rows[index];
    log.scrollTo({top:Math.max(0,log.scrollTop+row.getBoundingClientRect().top-box.top-12),behavior:reduced.matches?'instant':'smooth'});
    rows.forEach(function (r) { r.classList.remove('rail-destination'); });
    row.classList.add('rail-destination');
    setTimeout(function () { row.classList.remove('rail-destination'); },1300);
    preview(index); hideTimer=setTimeout(hidePreview,2400);
  }
  function paintSpectrum(levels) {
    spectrum=levels;
    const moving=levels && !reduced.matches;
    options.rail.classList.toggle('music-reactive',Boolean(moving));
    const bars=entries.length ? buttons : Array.from(options.rail.querySelectorAll('.rail-idle-mark'));
    bars.forEach(function (b,i) {
      const level=moving ? Math.max(0,Math.min(1,Number(levels[i%levels.length]) || 0)) : 0;
      b.style.setProperty('--music-width',(level*22).toFixed(1)+'px');
    });
    options.rail.hidden=!entries.length && !moving;
  }
  function refresh() {
    frame=0;
    const log=options.log, box=log.getBoundingClientRect();
    positions=rows.map(function (r) { return r.getBoundingClientRect().top-box.top+log.scrollTop; });
    // A long reply remains current until the next message reaches the reading line.
    const line=log.scrollTop+20;
    let next=positions.length ? 0 : -1;
    positions.forEach(function (top,i) { if (top<=line) next=i; });
    if (log.scrollTop+log.clientHeight>=log.scrollHeight-10) next=positions.length-1;
    if (next!==active) {
      active=next;
      buttons.forEach(function (b,i) { b.classList.toggle('current',i===active); b.tabIndex=i===active?0:-1; if (i===active) b.setAttribute('aria-current','true'); else b.removeAttribute('aria-current'); });
      const b=buttons[active];
      if (b && !options.rail.contains(document.activeElement) && !options.rail.matches(':hover')) {
        const list=options.list;
        if (b.offsetTop<list.scrollTop || b.offsetTop+b.offsetHeight>list.scrollTop+list.clientHeight) list.scrollTop=b.offsetTop-list.clientHeight/2+b.offsetHeight/2;
      }
    }
    const height=Math.max(6,Math.min(20,(options.rail.clientHeight-8)/Math.max(entries.length,1)));
    options.list.style.setProperty('--rail-step',height+'px');
    if (previewed>=0) preview(previewed);
  }
  function schedule() { if (!frame) frame=requestAnimationFrame(refresh); }
  function render(messages) {
    if (!options) return;
    hidePreview(); active=-1;
    if (observer) observer.disconnect();
    const byId=new Map(messages.map(function (m) { return [String(m.id),m]; }));
    rows=Array.from(options.log.querySelectorAll('.message-row[data-message-id]')).filter(function (row) { return byId.has(row.dataset.messageId); });
    entries=rows.map(function (row) {
      const message=byId.get(row.dataset.messageId) || {};
      return {summary:text(message.content).slice(0,600),author:options.author(message),time:options.time(message.created_at)};
    });
    options.list.replaceChildren();
    buttons=entries.map(function (entry,index) {
      const b=document.createElement('button'); b.type='button'; b.className='rail-mark'; b.tabIndex=-1;
      b.dataset.messageIndex=String(index);
      b.setAttribute('aria-label','第 '+(index+1)+' 条，'+entry.author+'：'+(entry.summary.slice(0,64) || '附件消息'));
      b.style.setProperty('--mark-width',Math.min(26,8+Math.sqrt(entry.summary.length)*.9).toFixed(1)+'px');
      const line=document.createElement('span'); line.setAttribute('aria-hidden','true'); b.append(line);
      b.addEventListener('pointerenter',function (e) { if (e.pointerType!=='touch') { clearTimeout(hideTimer); preview(index); } });
      b.addEventListener('focus',function () { clearTimeout(hideTimer); preview(index); });
      b.addEventListener('click',function () { navigate(index); });
      b.addEventListener('keydown',function (event) {
        if (event.key==='Escape') { hidePreview(); return; }
        if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,index+(event.key==='ArrowDown'?1:-1)));
        buttons[next].focus();
        buttons[next].scrollIntoView({block:'nearest',inline:'nearest'});
      });
      options.list.append(b); return b;
    });
    if (!entries.length) {
      for (let i=0;i<24;i++) { const bar=document.createElement('span'); bar.className='rail-idle-mark'; bar.setAttribute('aria-hidden','true'); options.list.append(bar); }
    }
    if (observer) { observer.observe(options.log); rows.forEach(function (r) { observer.observe(r); }); }
    paintSpectrum(spectrum); schedule();
  }
  window.ChatRail={
    initialize:function (config) {
      options=config;
      options.rail.addEventListener('pointerleave',function () { if (!options.rail.contains(document.activeElement)) hidePreview(); });
      options.rail.addEventListener('focusout',function (e) { if (!options.rail.contains(e.relatedTarget)) hidePreview(); });
      options.log.addEventListener('scroll',schedule,{passive:true});
      options.log.addEventListener('load',schedule,true);
      window.addEventListener('resize',function () { hidePreview(); schedule(); });
      document.addEventListener('pointerdown',function (e) { if (!options.rail.contains(e.target)) hidePreview(); });
      reduced.addEventListener('change',function () { paintSpectrum(spectrum); });
      if ('ResizeObserver' in window) observer=new ResizeObserver(schedule);
      render([]);
    },
    render:render,
    spectrum:paintSpectrum,
    closePreview:hidePreview
  };
}());
