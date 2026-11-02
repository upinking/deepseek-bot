'use strict';

// Only live audio from the browser's user-selected display stream is analysed.
// Video is required by getDisplayMedia and kept only to maintain that session.
// No track is rendered, recorded, sent to the server, or played back.
(function () {
  let instance;
  function initialize(options) {
    if (instance) return instance;
    const config=options || {}, make=function(tag,cls,text) {
      const item=document.createElement(tag); if(cls)item.className=cls; if(text!==undefined)item.textContent=text; return item;
    };
    const button=function(label,cls,action,iconName) {
      const b=make('button',cls,label);b.type='button';if(iconName && config.icon)b.prepend(config.icon(iconName));b.addEventListener('click',action);return b;
    };
    const panel=make('section','chat-music hidden');panel.setAttribute('aria-label','音乐律动');panel.id='chat-music-player';
    const head=make('div','chat-music-heading'), heading=make('strong','','音乐律动');
    const collapse=button('收起','chat-music-text',function(){setCompact(!compact);});
    const hide=button('','chat-music-hide',function(){setVisible(false);},'close');
    hide.title='隐藏面板，音频连接保持';hide.setAttribute('aria-label','隐藏面板，音频连接保持');head.append(heading,collapse,hide);
    const title=make('div','chat-music-title','让横条跟着电脑里的音乐变化');
    const status=make('div','chat-music-status','尚未连接电脑音频');status.setAttribute('role','status');
    const details=make('div','chat-music-details');
    details.append(make('p','chat-music-guide','在浏览器共享弹窗中，选择屏幕或音乐窗口，并勾选“共享音频”。'));
    details.append(make('p','chat-music-privacy','浏览器会请求共享屏幕或窗口。这里只在本机分析音轨，不展示、录制或上传画面与声音。'));
    details.append(make('p','chat-music-compatibility','能否共享其他软件的声音取决于系统和浏览器；没有音频选项时，无法读取音乐。'));
    const controls=make('div','chat-music-controls');
    const connect=button('连接电脑音频','chat-music-connect',connectAudio);
    const pause=button('暂停律动','chat-music-text',toggleAnalysis);pause.classList.add('hidden');
    const disconnect=button('断开音频','chat-music-disconnect',function(){
      const wasPending=pending;release(false,wasPending?'已取消连接，可关闭浏览器共享弹窗。':'已断开电脑音频');
    });disconnect.classList.add('hidden');
    controls.append(connect,pause,disconnect);panel.append(head,title,status,details,controls);(config.host || document.body).append(panel);
    let stream=null, context=null, source=null, analyser=null, gain=null, spectrum=null, frame=0, lastFrame=0;
    let compact=false,visible=false,pending=false,connected=false,analysisPaused=false,generation=0;
    const bands=32,levels=new Array(bands).fill(0), reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile=!!(navigator.userAgentData && navigator.userAgentData.mobile) || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const unsupported='当前设备或浏览器不支持电脑音频共享。请在电脑 Chrome 或 Edge 中打开；手机和当前 APK 暂不支持。';
    const supported=window.isSecureContext!==false && !mobile && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !!(window.AudioContext || window.webkitAudioContext);
    const unsupportedMessage=window.isSecureContext===false?'请通过 HTTPS 打开工作台后再连接电脑音频。':unsupported;
    if(!supported){status.textContent=unsupportedMessage;connect.disabled=true;connect.textContent='此设备暂不支持';}
    function emit(value){if(config.onSpectrum)config.onSpectrum(value);}
    function setStatus(message,error){status.textContent=message;status.classList.toggle('is-error',!!error);}
    function update(){
      connect.disabled=!supported || pending;connect.textContent=!supported?'此设备暂不支持':pending?'等待选择共享音频…':'连接电脑音频';
      connect.classList.toggle('hidden',connected);pause.classList.toggle('hidden',!connected);disconnect.classList.toggle('hidden',!connected && !pending);
      disconnect.textContent=pending?'取消连接':'断开音频';pause.textContent=analysisPaused?'继续律动':'暂停律动';
      if(config.button){
        config.button.classList.toggle('music-playing',connected);
        const label=connected?'已连接电脑音频，点击管理':pending?'正在连接电脑音频，点击查看':'音乐律动';
        config.button.title=label;config.button.setAttribute('aria-label',label);
      }
      panel.classList.toggle('is-connected',connected);
    }
    function setVisible(value){visible=value;panel.classList.toggle('hidden',!value);if(config.button)config.button.setAttribute('aria-expanded',String(value));}
    function setCompact(value){compact=value;panel.classList.toggle('is-compact',value);collapse.textContent=value?'展开':'收起';collapse.setAttribute('aria-expanded',String(!value));}
    function stopFrames(){cancelAnimationFrame(frame);frame=0;lastFrame=0;levels.fill(0);emit(null);}
    function stopTracks(value){if(value)value.getTracks().forEach(function(track){track.stop();});}
    function release(hidePanel,message){
      generation++;pending=false;connected=false;analysisPaused=false;
      const oldStream=stream,oldContext=context;stream=null;context=null;stopFrames();
      [source,analyser,gain].forEach(function(item){if(item){try{item.disconnect();}catch(_) {}}});source=null;analyser=null;gain=null;spectrum=null;
      stopTracks(oldStream);if(oldContext && oldContext.state!=='closed')oldContext.close().catch(function(){});
      title.textContent='让横条跟着电脑里的音乐变化';setStatus(!supported?unsupportedMessage:(message || '已断开电脑音频'));update();if(hidePanel)setVisible(false);
    }
    function sample(timestamp){
      frame=0;if(!connected || !analyser || !context || context.state!=='running' || analysisPaused || document.hidden || reduced.matches){stopFrames();return;}
      if(timestamp-lastFrame>=1000/30){
        lastFrame=timestamp;analyser.getByteFrequencyData(spectrum);
        const binHz=context.sampleRate/analyser.fftSize,ceiling=Math.min(16000,context.sampleRate/2);
        for(let i=0;i<bands;i++){
          const lo=Math.max(1,Math.floor(45*Math.pow(ceiling/45,i/bands)/binHz));
          const hi=Math.min(spectrum.length,Math.max(lo+1,Math.ceil(45*Math.pow(ceiling/45,(i+1)/bands)/binHz)));
          let energy=0;for(let j=lo;j<hi;j++)energy+=(spectrum[j]/255)*(spectrum[j]/255);
          const value=hi>lo?Math.sqrt(energy/(hi-lo)):0,mix=value>levels[i] ? .7 : .24;
          levels[i]+=mix*(value-levels[i]);
        }
        emit(levels.slice());
      }
      frame=requestAnimationFrame(sample);
    }
    function startFrames(){if(!frame && connected && analyser && context && context.state==='running' && !analysisPaused && !document.hidden && !reduced.matches)frame=requestAnimationFrame(sample);}
    function connectedStatus(){
      if(analysisPaused)return'已连接 · 律动已暂停，音频共享仍保持';
      if(reduced.matches)return'已连接 · 已按系统设置减少动态效果';
      if(context && context.state!=='running')return'已连接 · 律动被系统暂停，可点击继续律动';
      return'已连接 · 横条随实际音乐变化，无声时保持静止';
    }
    async function connectAudio(){
      if(!supported || pending || connected)return;
      const ticket=++generation;pending=true;analysisPaused=false;setStatus('请在浏览器弹窗选择屏幕或音乐窗口，并勾选共享音频。');update();
      let captured;
      try{
        // This call is made directly inside the user's click, before any await.
        captured=await navigator.mediaDevices.getDisplayMedia({
          video:true,
          audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,suppressLocalAudioPlayback:false},
          systemAudio:'include',windowAudio:'system',selfBrowserSurface:'exclude',surfaceSwitching:'exclude'
        });
        if(ticket!==generation){stopTracks(captured);return;}
        const audioTracks=captured.getAudioTracks().filter(function(track){return track.readyState!=='ended';});
        if(!audioTracks.length){
          stopTracks(captured);pending=false;setStatus('没有收到音轨。请重新连接，勾选“共享音频”；若弹窗没有此选项，当前系统或浏览器无法共享该软件的声音。',true);update();emit(null);return;
        }
        stream=captured;
        const Engine=window.AudioContext || window.webkitAudioContext;context=new Engine();
        analyser=context.createAnalyser();analyser.fftSize=2048;analyser.minDecibels=-90;analyser.maxDecibels=-15;analyser.smoothingTimeConstant=.65;
        source=context.createMediaStreamSource(stream);gain=context.createGain();gain.gain.value=0;
        source.connect(analyser);analyser.connect(gain);gain.connect(context.destination);spectrum=new Uint8Array(analyser.frequencyBinCount);
        stream.getTracks().forEach(function(track){track.addEventListener('ended',function(){if(ticket===generation)release(false,'共享已结束，电脑音频已断开');});});
        const activeContext=context;
        activeContext.addEventListener('statechange',function(){
          if(ticket!==generation || !connected)return;
          if(activeContext.state!=='running'){analysisPaused=true;stopFrames();}
          setStatus(connectedStatus());update();startFrames();
        });
        if(activeContext.state==='suspended')await activeContext.resume();
        if(ticket!==generation)return;
        if(activeContext.state!=='running')throw new Error('audio-context-unavailable');
        pending=false;connected=true;title.textContent='已连接这台电脑的声音';setStatus(connectedStatus());update();startFrames();
      }catch(error){
        if(ticket!==generation){stopTracks(captured);return;}
        const name=error && error.name;
        let message='当前浏览器无法读取电脑音频，请在电脑 Chrome 或 Edge 中重试。';
        if(name==='NotAllowedError' || name==='AbortError')message='未连接：共享已取消或未获允许，可以重新连接。';
        else if(name==='NotReadableError')message='系统暂时无法共享声音，请检查系统录屏或音频共享权限后重试。';
        else if(name==='InvalidStateError')message='请保持工作台在前台，再点击“连接电脑音频”重试。';
        release(false,message);setStatus(message,true);stopTracks(captured);
      }
    }
    async function toggleAnalysis(){
      if(!connected)return;
      analysisPaused=!analysisPaused;
      const ticket=generation,activeContext=context;
      if(analysisPaused)stopFrames();
      else if(activeContext && activeContext.state==='suspended'){
        try{await activeContext.resume();}catch(_){if(ticket!==generation)return;}
      }
      if(ticket!==generation)return;
      if(!analysisPaused && activeContext && activeContext.state!=='running')analysisPaused=true;
      setStatus(connectedStatus());update();startFrames();
    }
    document.addEventListener('visibilitychange',function(){if(document.hidden)stopFrames();else startFrames();});
    const motionChange=function(){if(reduced.matches)stopFrames();else startFrames();if(connected)setStatus(connectedStatus());};
    if(reduced.addEventListener)reduced.addEventListener('change',motionChange);else reduced.addListener(motionChange);
    if(config.button){config.button.setAttribute('aria-expanded','false');config.button.setAttribute('aria-controls',panel.id);config.button.addEventListener('click',function(){setVisible(!visible);});}
    window.addEventListener('pagehide',function(){release(true);});
    update();
    instance={stop:function(){release(true);},open:function(){setVisible(true);},toggle:function(){setVisible(!visible);}};
    return instance;
  }
  window.ChatMusic={initialize:initialize,stop:function(){if(instance)instance.stop();}};
}());
