'use strict';

// Run: node --test tests/test_music_capture.cjs
// Resource/async regression checks use minimal DOM and Web Audio stand-ins.
// They do not claim that an operating system granted screen/audio capture.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../web/music-player.js'),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

class Element {
  constructor(tag){
    this.tagName=tag;this.children=[];this.handlers=new Map();this.attrs={};this.classes=new Set();
    this.classList={
      add:name=>this.classes.add(name),
      toggle:(name,enabled)=>enabled?this.classes.add(name):this.classes.delete(name)
    };
  }
  set className(value){this.classes=new Set(value.split(' '));}
  append(...items){this.children.push(...items);}
  prepend(item){this.children.unshift(item);}
  setAttribute(name,value){this.attrs[name]=value;}
  addEventListener(name,callback){
    if(!this.handlers.has(name))this.handlers.set(name,[]);
    this.handlers.get(name).push(callback);
  }
  click(){if(!this.disabled)(this.handlers.get('click')||[]).forEach(callback=>callback({}));}
}
class Track {
  constructor(kind){this.kind=kind;this.readyState='live';this.stopCalls=0;this.handlers=new Map();}
  stop(){this.stopCalls++;this.readyState='ended';}
  addEventListener(name,callback){this.handlers.set(name,callback);}
  end(){this.readyState='ended';this.handlers.get('ended')?.();}
}
function makeStream({audio=true}={}){
  const tracks=[new Track('video')];if(audio)tracks.push(new Track('audio'));
  return {tracks,getTracks:()=>tracks,getAudioTracks:()=>tracks.filter(track=>track.kind==='audio')};
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function allElements(element){return [element,...element.children.flatMap(allElements)];}

function setup(capture,options={}){
  const body=new Element('body'),header=new Element('button'),levels=[],frames=new Map(),contexts=[],requests=[];
  let nextFrame=0,clock=100;
  class AudioNode {
    constructor(){this.outputs=[];this.disconnectCalls=0;}
    connect(output){this.outputs.push(output);return output;}
    disconnect(){this.disconnectCalls++;this.outputs=[];}
  }
  class AudioEngine {
    constructor(){
      this.state=options.resumeGate?'suspended':'running';this.sampleRate=48000;this.destination={};this.closeCalls=0;
      this.events=new Map();contexts.push(this);
    }
    createAnalyser(){
      this.analyser=new AudioNode();
      Object.assign(this.analyser,{frequencyBinCount:1024,reading:128,getByteFrequencyData(array){array.fill(this.reading);}});
      return this.analyser;
    }
    createMediaStreamSource(stream){this.source=new AudioNode();this.source.stream=stream;return this.source;}
    createGain(){this.gain=new AudioNode();this.gain.gain={value:1};return this.gain;}
    addEventListener(name,callback){this.events.set(name,callback);}
    async resume(){if(options.resumeGate)await options.resumeGate.promise;if(this.state!=='closed')this.state='running';}
    async close(){this.closeCalls++;this.state='closed';}
  }
  const window={
    AudioContext:AudioEngine,isSecureContext:options.secure!==false,
    matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){}
  };
  const navigator={userAgent:options.mobile?'Android':'Desktop Chrome'};
  if(!options.unavailable)navigator.mediaDevices={getDisplayMedia:request=>{requests.push(request);return capture(request);}};
  const sandbox={
    window,navigator,Uint8Array,
    document:{createElement:tag=>new Element(tag),body,hidden:false,addEventListener(){}},
    requestAnimationFrame:callback=>{const id=++nextFrame;frames.set(id,callback);return id;},
    cancelAnimationFrame:id=>frames.delete(id)
  };
  vm.runInNewContext(script,sandbox,{filename:'music-player.js'});
  const api=window.ChatMusic.initialize({button:header,onSpectrum:value=>levels.push(value)});
  const panel=body.children[0],elements=allElements(panel);
  const findText=text=>elements.find(element=>element.textContent===text);
  return {
    api,header,panel,contexts,requests,levels,frames,
    connect:findText(options.mobile||options.unavailable||options.secure===false?'此设备暂不支持':'连接电脑音频'),
    pause:findText('暂停律动'),disconnect:findText('断开音频'),status:elements.find(element=>element.attrs.role==='status'),
    nextSample(){const entry=frames.entries().next().value;assert.ok(entry,'analyser scheduled a frame');frames.delete(entry[0]);entry[1](clock);clock+=40;}
  };
}

function assertReleased(stream,engine){
  assert.ok(stream.tracks.every(track=>track.stopCalls>=1),'all audio/video tracks stopped');
  assert.equal(engine.closeCalls,1,'AudioContext closed once');
  for(const node of [engine.source,engine.analyser,engine.gain])assert.equal(node.disconnectCalls,1,'audio node disconnected');
}

test('frequency callbacks use measured samples; pause clears the rail and resume continues',async()=>{
  const stream=makeStream(),app=setup(()=>Promise.resolve(stream));app.connect.click();await settle();
  const engine=app.contexts[0];assert.equal(app.requests[0].video,true);assert.equal(app.requests[0].systemAudio,'include');
  assert.equal(app.requests[0].audio.suppressLocalAudioPlayback,false);
  engine.analyser.reading=0;app.nextSample();assert.ok(app.levels.at(-1).every(value=>value===0),'silence does not produce a fake spectrum');
  engine.analyser.reading=180;app.nextSample();const measured=app.levels.at(-1);
  assert.equal(measured.length,32);assert.ok(measured.every(value=>value>=0&&value<=1));assert.ok(measured.some(value=>value>0));
  app.pause.click();assert.equal(app.levels.at(-1),null);assert.equal(app.frames.size,0);assert.ok(stream.tracks.every(track=>track.stopCalls===0),'pausing the visualizer keeps capture connected');
  app.pause.click();await settle();app.nextSample();assert.ok(app.levels.at(-1).some(value=>value>0));app.api.stop();
});

test('stop releases both tracks, every audio node and context; gain prevents duplicate playback',async()=>{
  const stream=makeStream(),app=setup(()=>Promise.resolve(stream));app.connect.click();await settle();
  const engine=app.contexts[0];assert.equal(engine.gain.gain.value,0);assert.equal(engine.source.outputs[0],engine.analyser);
  assert.equal(engine.analyser.outputs[0],engine.gain);assert.equal(engine.gain.outputs[0],engine.destination);
  app.api.stop();assertReleased(stream,engine);assert.equal(app.frames.size,0);assert.equal(app.levels.at(-1),null);
  assert.equal(app.header.classes.has('music-playing'),false);assert.equal(app.panel.classes.has('hidden'),true);
  app.api.stop();assert.equal(engine.closeCalls,1,'repeated stop is safe');
});

test('capture without an audio track is immediately released and can be retried',async()=>{
  const stream=makeStream({audio:false}),app=setup(()=>Promise.resolve(stream));app.connect.click();await settle();
  assert.ok(stream.tracks.every(track=>track.stopCalls===1));assert.equal(app.contexts.length,0);assert.equal(app.frames.size,0);
  assert.match(app.status.textContent,/没有收到音轨/);assert.equal(app.connect.disabled,false);assert.equal(app.levels.at(-1),null);
});

test('denied capture leaves no resources and a subsequent connection can succeed',async()=>{
  const stream=makeStream();let calls=0;
  const app=setup(()=>++calls===1?Promise.reject(Object.assign(new Error('denied'),{name:'NotAllowedError'})):Promise.resolve(stream));
  app.connect.click();await settle();assert.equal(app.contexts.length,0);assert.equal(app.connect.disabled,false);assert.match(app.status.textContent,/共享已取消或未获允许/);
  app.connect.click();await settle();assert.equal(calls,2);assert.equal(app.contexts.length,1);assert.equal(app.header.classes.has('music-playing'),true);app.api.stop();
});

test('stop during the browser picker releases a late stream without reviving capture',async()=>{
  const picker=deferred(),stream=makeStream(),app=setup(()=>picker.promise);app.connect.click();assert.equal(app.connect.disabled,true);
  app.api.stop();picker.resolve(stream);await settle();assert.ok(stream.tracks.every(track=>track.stopCalls===1));
  assert.equal(app.contexts.length,0);assert.equal(app.frames.size,0);assert.equal(app.header.classes.has('music-playing'),false);assert.equal(app.levels.at(-1),null);
});

test('stop while AudioContext is resuming also prevents a late connection',async()=>{
  const resumeGate=deferred(),stream=makeStream(),app=setup(()=>Promise.resolve(stream),{resumeGate});app.connect.click();await settle();
  assert.equal(app.contexts.length,1);app.api.stop();assertReleased(stream,app.contexts[0]);resumeGate.resolve();await settle();
  assert.equal(app.frames.size,0);assert.equal(app.header.classes.has('music-playing'),false);assert.equal(app.levels.at(-1),null);
});

test('ending either audio or video sharing releases the complete session',async(t)=>{
  for(const kind of ['audio','video'])await t.test(kind,async()=>{
    const stream=makeStream(),app=setup(()=>Promise.resolve(stream));app.connect.click();await settle();stream.tracks.find(track=>track.kind===kind).end();
    assertReleased(stream,app.contexts[0]);assert.equal(app.frames.size,0);assert.equal(app.header.classes.has('music-playing'),false);assert.match(app.status.textContent,/共享已结束/);
  });
});

test('stop preserves the explicit unsupported or HTTPS guidance',()=>{
  for(const options of [{unavailable:true},{mobile:true},{secure:false}]){
    const app=setup(()=>{throw new Error('unsupported browser must not request capture');},options),original=app.status.textContent;
    assert.match(original,options.secure===false?/HTTPS/:/不支持/);app.api.stop();assert.equal(app.status.textContent,original);assert.equal(app.connect.disabled,true);assert.equal(app.requests.length,0);
  }
});
