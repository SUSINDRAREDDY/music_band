import {periodicPitch} from './pitch.mjs';
import {RecordingLookahead,analyseClip} from './lookahead.mjs';
import {wavDataUrl} from './recording.mjs';
import {ScoreView} from './score.mjs';
import {instruments,canContinue,nextBarAnchor} from './music.mjs';
import {Band} from './audio.mjs';
let diagnosticsEnabled=false;
let providerInfo={model:'connecting',reasoning:''};
const $=id=>document.getElementById(id),logs=[],modelTurns=[];
try{$('musicalDirection').value=localStorage.getItem('musical-direction')||'';}catch{}
$('musicalDirection').oninput=()=>{try{localStorage.setItem('musical-direction',$('musicalDirection').value);}catch{}};
function showModelInput(msg){
 $('modelInstructions').textContent=msg.instructions;
 const item={threadId:msg.threadId,input:msg.input,outputABC:''};modelTurns.push(item);
 const box=document.createElement('details'),title=document.createElement('summary'),input=document.createElement('pre'),output=document.createElement('pre');
 title.textContent=`Phrase ${msg.input.phraseIndex??0} · ${msg.threadId}`;input.textContent=JSON.stringify(msg.input,null,2);input.style.whiteSpace=output.style.whiteSpace='pre-wrap';
 box.append(title,document.createTextNode('Exact input sent to GPT'),input,document.createTextNode('Raw ABC received'),output);$('modelTrace').append(box);
 while(modelTurns.length>8){modelTurns.shift();$('modelTrace').firstChild.remove();}
 return {item,output};
}
let inputSink,rhythmAnalyser,capture;
function originalAudio(){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("Audio capture timed out")),2000);capture.port.onmessage=({data})=>{clearTimeout(timer);try{resolve({audio:diagnosticsEnabled?wavDataUrl(data):undefined,recording:data});}catch(e){reject(e);}};capture.port.postMessage("snapshot");});}
let lookahead=null;
let flowId=null,sessionReady=Promise.resolve(),sessionClosing=Promise.resolve();
let ctx,band,analyser,stream,inputNode,frameTimer,scheduleTimer,controller;
let lastDiagnostic=null,diagnosticEvents=[];
function recordDiagnostic(event){if(diagnosticsEnabled&&diagnosticEvents.length<400)diagnosticEvents.push(event);}
function flushDiagnostics(){if(!lastDiagnostic||!diagnosticEvents.length)return;const events=diagnosticEvents.splice(0,400);fetch('/diagnostics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:lastDiagnostic,events}),keepalive:true}).catch(()=>log('Could not save playback diagnostics.'));}
setInterval(flushDiagnostics,2000);

let generationSeconds=6;const recentGeneration=[];
let authBlocked=false,phraseIndex=0,lastPhrase=[];
let auditioning=false,auditionTimer;
let running=false,session=0,startAt=0,lastSound=0,lastRequest=0,busy=false;
let manualBpm=null,bpm=100,queue=[],played=[],version=0,wasSilent=true,phraseEnd=0;
const canvas=$('scope'),paint=canvas.getContext('2d');
const scoreView=new ScoreView($('score'),$('notation'),$('scoreStatus'));
const labels={bass:'Bass',keys:'Electric keys',drums:'Drum kit',piano:'Piano',pluck:'Guitar / pluck',strings:'String pad',organ:'Organ',vibes:'Vibraphone',flute:'Flute',lead:'Synth lead'};
let enabledInstruments=new Set(['pluck','bass','drums','keys']);
try{const saved=JSON.parse(localStorage.getItem('band-instruments'));if(Array.isArray(saved)&&saved.some(n=>Object.values(instruments).includes(n)))enabledInstruments=new Set(saved.filter(n=>Object.values(instruments).includes(n)));}catch{}
function updateBandCount(){$('bandCount').textContent=enabledInstruments.size+' '+(enabledInstruments.size===1?'player':'players');}updateBandCount();
let stage;
import('/stage.mjs').then(({createStage})=>{
 stage=createStage($('stage'),{clock:()=>ctx?.currentTime||performance.now()/1000,onSelect:name=>{const control=$('enable-'+name);control.focus();control.closest('.channel').animate([{borderColor:'#e2ecc1'},{borderColor:'#414834'}],{duration:900});}});
 stage.select([...enabledInstruments]);
 $('view').onclick=()=>stage.view();$('resetView').onclick=()=>stage.resetView();
 $('reduceMotion').onchange=e=>stage.reduce(e.target.checked);
}).catch(e=>{$('stageError').textContent='The 3D studio is unavailable on this device. Instrument controls and audio remain available.';console.error(e);});
for(const name of Object.values(instruments)){
 const row=$('enable-'+name).closest('.channel');
 $('enable-'+name).checked=enabledInstruments.has(name);
 row.classList.toggle('inactive',!enabledInstruments.has(name));
 $('enable-'+name).onchange=()=>{
  if(!$('enable-'+name).checked&&enabledInstruments.size===1){$('enable-'+name).checked=true;log('Keep at least one instrument selected.');return;}
  $('enable-'+name).checked?enabledInstruments.add(name):enabledInstruments.delete(name);
  row.classList.toggle('inactive',!enabledInstruments.has(name));updateBandCount();
  localStorage.setItem('band-instruments',JSON.stringify([...enabledInstruments]));
  if(auditioning||running&&lookahead)stop();else invalidate();lastRequest=0;stage?.select([...enabledInstruments]);
  if(band)void band.preload([...enabledInstruments]).catch(e=>log(e.message));
  log('Selected instruments: '+[...enabledInstruments].map(n=>labels[n]).join(', '));
  if(running)status('Ensemble changed · composing for your selection');
 };
}
function log(message){const at=new Date().toLocaleTimeString([], {hour12:false});logs.push({at,message});if(logs.length>500)logs.shift();const p=document.createElement('p'),t=document.createElement('time');t.textContent=at;p.append(t,document.createTextNode(message));$('log').prepend(p);while($('log').children.length>40)$('log').lastChild.remove();}
function status(s){$('status').textContent=s;}
function invalidate(){stage?.reset();scoreView.cancel();version++;queue=[];phraseEnd=0;phraseIndex=0;lastPhrase=[];band?.hush();controller?.abort();}
async function compose(){
 if(busy||!running||(!lookahead&&wasSilent&&!lastPhrase.length))return;
 const own=session,revision=version;let phraseBpm=bpm,plan=null;const received=[];busy=true;lastRequest=ctx.currentTime;controller=new AbortController();let failed=false,completed=false;const requestStarted=performance.now();let firstBar=true,trace=null;
 log('Analyzing the original input; sending measured pitch/rhythm evidence to the composer.');
 status(queue.length?'Band playing · composing next phrase':'Listening · generating fresh music');

 try{
  let audio,evidence;
  if(lookahead){
   const current=lookahead;plan=await current.plan(manualBpm,phraseIndex?bpm:null);
   if(own!==session||revision!==version||!running)return;
   phraseBpm=plan.bpm;evidence=plan.bars[0].evidence;
   log(`Preparing recording ${plan.startSeconds.toFixed(1)}s onward at ${plan.bpm} BPM.`);
  }else{
   const captured=await originalAudio();audio=captured.audio;evidence=await analyseClip(captured.recording);
  }
  if(own!==session||revision!==version||!running)return;
  await sessionReady;
  if(own!==session||revision!==version||!running)return;
  const res=await fetch('/compose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:flowId,musicalDirection:$('musicalDirection').value,instruments:[...enabledInstruments],audio,evidence,...(plan?{upcoming:plan.bars}:{}),tempoMode:plan?'manual':manualBpm===null?'auto':'manual',bpm:phraseBpm,history:[],continueThroughPause:$('continuous').checked&&wasSilent,phraseIndex}),signal:controller.signal});
  if(!res.ok)throw Error(res.status===429?'Composer finishing the previous request.':res.status===409?'Listening session expired. Press Stop and Start.':'Composer connection failed.');
  const reader=res.body.getReader(),decoder=new TextDecoder();let pending='';
  for(;;){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let i;
   while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);if(!line)continue;const msg=JSON.parse(line);
    if(own!==session||revision!==version||!running)continue;
    if(msg.type==='model-input')trace=showModelInput(msg);
    if(msg.type==='abc-delta'&&trace){trace.item.outputABC+=msg.text;trace.output.textContent=trace.item.outputABC;}
    if(msg.type==='diagnostic'){flushDiagnostics();lastDiagnostic=msg.id;log(`Saved input and composition: ${msg.id}`);}
    if(msg.type==='error'){if(/sign in|access token|authentication|unauthorized|usage limit|rate limit|quota/i.test(msg.message))authBlocked=true;failed=true;scoreView.cancel('Score rejected: '+msg.message);log(msg.message);status('Composer needs attention');}
    if(msg.type==='session')recordDiagnostic({action:'composer-session',threadId:msg.threadId,setupMs:msg.setupMs});
    if(msg.type==='status'){log(msg.message);status(msg.message);}
    if(msg.type==='bar'){
     const sampleStart=performance.now();await band.prepare(msg.notes);
     if(own!==session||revision!==version||!running)return;
     const now=ctx.currentTime,tempo=plan?.bpm??manualBpm??msg.tempo??bpm,step=60/tempo;
     bpm=tempo;
     const anchor=nextBarAnchor(now,phraseEnd);
     const gap=phraseEnd?Math.max(0,anchor-phraseEnd):0;
     if(plan){
      queue.push(...lookahead.playBar(plan,msg.index,msg.notes,inputNode,revision));
      phraseEnd=lookahead.end;
     }else for(const event of msg.notes)queue.push({...event,time:anchor+event.beat*step,tempo,diagnosticId:lastDiagnostic,version:revision});
     if(!plan)phraseEnd=anchor+4*step;
     received.push(...msg.notes.map(n=>({...n,beat:n.beat+msg.index*4})));
     if(firstBar)scoreView.reset();scoreView.appendBar(msg.abc);
     recordDiagnostic({action:'bar-scheduled',index:msg.index,anchor,gap,firstBarMs:performance.now()-requestStarted,sampleMs:performance.now()-sampleStart});
     if(firstBar){firstBar=false;$('latency').textContent=((performance.now()-requestStarted)/1000).toFixed(1)+' s';}
     status(plan&&!lookahead.started?'Preparing recording accompaniment�':'Playing streamed accompaniment');
    }
    if(msg.type==='done'){if(plan&&lookahead.finished){queue.push(...lookahead.startPlayback(inputNode));phraseEnd=lookahead.end;log('Prepared accompaniment complete. Starting continuous recording playback.');}completed=true;recentGeneration.push((performance.now()-requestStarted)/1000);if(recentGeneration.length>8)recentGeneration.shift();generationSeconds=Math.max(6,Math.min(20,Math.max(...recentGeneration)));log(`Four bars generated in ${(msg.elapsedMs/1000).toFixed(1)} s.`);}

   }
  }
  if(own===session&&revision===version){lastPhrase=received; if(completed)phraseIndex++;if(!failed&&!completed)throw Error('Music stream ended before completion');}

 }catch(e){if(e.name!=='AbortError'&&own===session){log(e.message);if(lookahead){authBlocked=true;status('Recording paused · '+e.message);}else status('Composer unavailable');}}
 finally{if(own===session){busy=false;controller=null;}}
}
function analyse(){
 if(!running)return;
 if(lookahead?.started&&!busy&&ctx.currentTime>=lookahead.end){stop();status('Recording and accompaniment finished');return;}
 const now=ctx.currentTime,wave=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(wave);const rhythmWave=new Float32Array(rhythmAnalyser.fftSize);rhythmAnalyser.getFloatTimeDomainData(rhythmWave);
 const rms=Math.sqrt(rhythmWave.reduce((s,x)=>s+x*x,0)/rhythmWave.length),audible=rms>.003;
 const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==Math.round(w*devicePixelRatio)||canvas.height!==Math.round(h*devicePixelRatio)){canvas.width=w*devicePixelRatio;canvas.height=h*devicePixelRatio;paint.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);}
 paint.clearRect(0,0,w,h);paint.strokeStyle=audible?'#d6e5a9':'#586149';paint.lineWidth=1.4;paint.beginPath();for(let i=0;i<w;i++){const y=h/2+wave[Math.floor(i/w*wave.length)]*h*1.7;i?paint.lineTo(i,y):paint.moveTo(i,y);}paint.stroke();
 const out=new Float32Array(band.output.fftSize);band.output.getFloatTimeDomainData(out);const peak=Math.max(...out.map(Math.abs));$('audioHealth').textContent=`Audio: ${ctx.state} · input ${(rms*100).toFixed(1)}% · band output ${(peak*100).toFixed(1)}% · ${played.length} recent notes played`;
 $('elapsed').textContent=new Date((now-startAt)*1000).toISOString().slice(14,19);
 if(audible){lastSound=now;if(wasSilent){wasSilent=false;status('Listening to your playing');}}
 if(!lookahead&&now-lastSound>2&&!wasSilent){wasSilent=true;log($('continuous').checked?'Input quiet. Continuing the band from its previous phrase.':'Input quiet. Letting the generated music finish.');}

 const pitch=periodicPitch(wave,ctx.sampleRate);const detected=audible&&pitch.note!==null&&pitch.confidence>.65;
 $('chord').textContent=detected?['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][pitch.note%12]+(Math.floor(pitch.note/12)-1):'—';$('frequency').textContent=detected?pitch.frequency.toFixed(1)+' Hz':'— Hz';$('confidence').textContent=detected?Math.round(pitch.confidence*100)+'% clarity · '+(pitch.cents>=0?'+':'')+pitch.cents+' cents':'Play a single clear note';$('tuningNeedle').style.left=detected?Math.max(0,Math.min(100,50+pitch.cents))+'%':'50%';$('inputLevel').textContent='INPUT '+(rms>0?Math.max(-96,20*Math.log10(rms)).toFixed(1):'−∞')+' dB';$('tempo').textContent=bpm;$('tempoSource').textContent=manualBpm===null?'Following input':'Manual tempo';$('queue').textContent=`${queue.length} notes queued`;
 // One request at a time; refresh from current input rather than queueing old requests.
 if(!authBlocked&&(lookahead?!lookahead.finished:canContinue(wasSilent,$('continuous').checked,audible?1:0,lastPhrase.length))&&(lookahead||now-startAt>=2)&&!busy&&now-lastRequest>=1&&phraseEnd-now<generationSeconds+4)void compose();
}
function schedule(){if(!running)return;const now=ctx.currentTime;queue.sort((a,b)=>a.time-b.time);while(queue.length&&queue[0].time<now+.09){const n=queue.shift();if(!enabledInstruments.has(n.instrument)||n.version!==version||n.time<now-.2){recordDiagnostic({action:"skipped",at:now,reason:"late-or-invalidated",note:n});continue;}recordDiagnostic({action:"played",at:now,note:n});band.play(n,Math.max(n.time,now+.005),n.tempo||bpm);stage?.note(n,Math.max(n.time,now+.005),n.tempo||bpm);played.push(n);played=played.slice(-24);const own=session;setTimeout(()=>{if(own!==session)return;$(n.instrument+'Activity').classList.add('lit');setTimeout(()=>$(n.instrument+'Activity').classList.remove('lit'),100);},Math.max(0,(n.time-now)*1000));}}
async function start(){
 authBlocked=false;$('start').disabled=true;const own=++session;
 try{
  if(!$('manualTempo').checkValidity())throw Error('Choose a session tempo between 45 and 200 BPM.');
  if(!ctx){ctx=new AudioContext({latencyHint:'interactive'});band=new Band(ctx);}for(const name of Object.values(instruments))band.levels[name]=Number($(name).value)/100;await ctx.resume();$('sampleRate').textContent=(ctx.sampleRate/1000)+' kHz / STEREO';
  void band.preload([...enabledInstruments]).catch(e=>log(e.message));
  analyser=ctx.createAnalyser();analyser.fftSize=8192;analyser.smoothingTimeConstant=.15;rhythmAnalyser=ctx.createAnalyser();rhythmAnalyser.fftSize=1024;
  // Keep microphone analysis in an actively rendered graph without monitoring it.
  inputSink=ctx.createGain();inputSink.gain.value=0;analyser.connect(inputSink).connect(ctx.destination);
  const source=$('source').value;
  if(source==='file'){
   if(!$('file').files[0])throw Error('Choose an audio recording first.');
   status('Decoding recording for lookahead…');
   const buffer=await ctx.decodeAudioData(await $('file').files[0].arrayBuffer());
   if(own!==session)return;
   lookahead=new RecordingLookahead(ctx,buffer);
   $('recording').hidden=true;
   inputNode=ctx.createGain();inputNode.connect(analyser);inputNode.connect(ctx.destination);
   log('Preparing the recording accompaniment before continuous playback. ABC appears as it arrives; audio starts when the recording is ready.');
  }else{
   stream=source==='tab'?await navigator.mediaDevices.getDisplayMedia({video:true,audio:true}):await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
   if(!stream.getAudioTracks().length)throw Error('No audio was shared. Select a browser tab and enable Share tab audio.');
   inputNode=ctx.createMediaStreamSource(stream);inputNode.connect(analyser);stream.getAudioTracks()[0].onended=stop;
  }
  await ctx.audioWorklet.addModule('/capture.mjs');capture=new AudioWorkletNode(ctx,'original-input',{channelCountMode:'max'});inputNode.connect(capture);capture.connect(inputSink);
  inputNode.connect(rhythmAnalyser);rhythmAnalyser.connect(inputSink);
  if(own!==session)return;
  flowId=crypto.randomUUID();const startingFlow=flowId;
  sessionReady=sessionClosing.then(async()=>{const res=await fetch('/session/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:startingFlow})});if(!res.ok)throw Error('Could not start composer session. Stop and try again.');});
  void sessionReady.catch(e=>{if(own===session){authBlocked=true;log(e.message);status('Composer needs attention');}});
  recentGeneration.length=0;generationSeconds=6;
  running=true;startAt=lastSound=ctx.currentTime;phraseEnd=0;phraseIndex=0;lastPhrase=[];queue=[];played=[];lastRequest=0;wasSilent=true;busy=false;manualBpm=$('manualTempo').value.trim()?Number($('manualTempo').value):null;bpm=manualBpm??100;$('manualTempo').disabled=true;version++;scoreView.reset();lastDiagnostic=null;diagnosticEvents=[];
  $('stop').disabled=false;$('source').disabled=true;$('liveDot').classList.add('on');status('Listening · play a few seconds');log('Listening started. GPT receives measured pitch and rhythm evidence. Each generated bar plays as it arrives.');frameTimer=setInterval(analyse,50);scheduleTimer=setInterval(schedule,20);
 }catch(e){log(e.message);stop();status(e.message);}
}
function stop(){clearTimeout(auditionTimer);auditioning=false;$('soundcheck').disabled=false;lookahead?.stop();lookahead=null;const endingFlow=flowId;flowId=null;if(endingFlow)sessionClosing=sessionReady.catch(()=>{}).then(()=>fetch('/session/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:endingFlow}),keepalive:true})).catch(()=>{});recordDiagnostic({action:"stop",at:ctx?.currentTime});flushDiagnostics();session++;running=false;invalidate();clearInterval(frameTimer);clearInterval(scheduleTimer);stream?.getTracks().forEach(t=>t.stop());stream=null;inputNode?.disconnect();analyser?.disconnect();rhythmAnalyser?.disconnect();capture?.disconnect();inputSink?.disconnect();$('recording').pause();busy=false;$('start').disabled=false;$('stop').disabled=true;$('source').disabled=false;$('manualTempo').disabled=false;$('liveDot').classList.remove('on');$('queue').textContent='No notes queued';$('chord').textContent='—';$('frequency').textContent='— Hz';$('confidence').textContent='Play a single clear note';$('inputLevel').textContent='INPUT — dB';$('tuningNeedle').style.left='50%';$('audioHealth').textContent='Audio ready';drawIdleWave();for(const n of Object.values(instruments))$(n+'Activity').classList.remove('lit');status('Session stopped');}
$('start').onclick=()=>{if($('source').value==='file'&&!$('file').files[0])$('file').click();else void start();};$('stop').onclick=stop;
$('file').onchange=()=>{if($('file').files[0]){log('Recording selected. Press Start listening to begin playback.');$('start').textContent='Start listening ↗';}};$('source').onchange=()=>{$('recording').hidden=true;$('hint').textContent=$('source').value==='file'?'Recording lookahead: prepare upcoming music before synchronized playback. Use a clear solo recording for best results.':'Use headphones so the band doesn’t enter your microphone. The band follows measured pitch and rhythm evidence.';};
$('recording').onended=()=>{log('Recording finished. Letting the fresh accompaniment finish.');};$('recording').onseeking=()=>{if(running){invalidate();}};
for(const name of Object.values(instruments))$(name).oninput=()=>{if(band)band.levels[name]=Number($(name).value)/100;};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({...providerInfo,logs,instructions:$('modelInstructions').textContent,modelTurns},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='find-the-beat-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
fetch('/health').then(r=>r.json()).then(d=>{providerInfo=d;diagnosticsEnabled=d.diagnostics===true;$('model').textContent='Studio connected';$('connection').classList.add('on');}).catch(()=>{$('model').textContent='Local composer offline';});
window.addEventListener('pagehide',stop);

$('soundcheck').onclick=async()=>{
 if(running||auditioning)return;
 const own=++session;auditioning=true;$('soundcheck').disabled=true;$('start').disabled=true;$('source').disabled=true;$('stop').disabled=false;status('Loading band audition');
 try{
  if(!ctx){ctx=new AudioContext({latencyHint:'interactive'});band=new Band(ctx);}await ctx.resume();
  for(const name of enabledInstruments)band.levels[name]=Number($(name).value)/100;
  const notes=[];const previewTempo=100;
  for(const instrument of enabledInstruments){
   for(let beat=0;beat<8;beat++){
    if(instrument==='drums'){notes.push({instrument,note:beat%2?38:36,beat,duration:.25,velocity:.65},{instrument,note:42,beat:beat+.5,duration:.2,velocity:.35});}
    else if(instrument==='bass')notes.push({instrument,note:[45,45,52,43,41,41,48,43][beat],beat,duration:.8,velocity:.65});
    else if(['keys','piano','organ','strings'].includes(instrument)){if(beat%2===0)for(const note of (beat<4?[57,60,64]:[53,57,60]))notes.push({instrument,note,beat,duration:1.7,velocity:.4});}
    else notes.push({instrument,note:[64,67,69,72,69,67,64,60][beat],beat,duration:.7,velocity:.5});
   }
  }
  await band.prepare(notes);if(own!==session||!auditioning)return;
  const anchor=ctx.currentTime+.12;for(const note of notes){const at=anchor+note.beat*60/previewTempo;band.play(note,at,previewTempo);stage?.note(note,at,previewTempo);}
  status('Band audition · A minor');$('audioHealth').textContent='Playing selected instruments';$('sampleRate').textContent=(ctx.sampleRate/1000)+' kHz / STEREO';
  auditionTimer=setTimeout(()=>{if(own===session)stop();},5600);
 }catch(e){if(own===session){stop();status(e.message);}}
};

function drawIdleWave(){const w=canvas.clientWidth,h=canvas.clientHeight;canvas.width=Math.round(w*devicePixelRatio);canvas.height=Math.round(h*devicePixelRatio);paint.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);paint.clearRect(0,0,w,h);paint.strokeStyle='#586149';paint.lineWidth=1;paint.beginPath();paint.moveTo(0,h/2);paint.lineTo(w,h/2);paint.stroke();}
new ResizeObserver(()=>{if(!running)drawIdleWave();}).observe(canvas);
$('chooseFile').onclick=()=>{if(running||auditioning)stop();$('source').value='file';$('source').dispatchEvent(new Event('change'));$('file').click();};
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){status('Full screen unavailable');}};
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();if(running||auditioning)stop();else $('start').click();}});
