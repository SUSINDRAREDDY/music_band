import {wavDataUrl} from './recording.mjs';
const stageNote=()=>{},resetStage=()=>{};
import {instruments,pulseAlignment,alignBoundary,TempoTracker,phraseAnchor,retimeQueue,rhythmContext,chordFromChroma,spectrumChroma,estimateTempo} from './music.mjs';
import {Band} from './audio.mjs';
const $=id=>document.getElementById(id),logs=[];
let inputSink,rhythmAnalyser,capture;
function originalAudio(){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("Audio capture timed out")),2000);capture.port.onmessage=({data})=>{clearTimeout(timer);try{resolve({audio:wavDataUrl(data),recording:data});}catch(e){reject(e);}};capture.port.postMessage("snapshot");});}
let ctx,band,analyser,stream,inputNode,fileNode,fileUrl,frameTimer,scheduleTimer,controller;
let tempoTracker=new TempoTracker(),lastDiagnostic=null,diagnosticEvents=[],phraseStart=0,bridgeCount=0;
function flushDiagnostics(){if(!lastDiagnostic||!diagnosticEvents.length)return;const events=diagnosticEvents.splice(0,400);fetch('/diagnostics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:lastDiagnostic,events}),keepalive:true}).catch(()=>log('Could not save playback diagnostics.'));}
setInterval(flushDiagnostics,2000);
let previousSpectrum=null,fluxAverage=0,tempoCandidate=null,tempoVotes=0;
let authBlocked=false,phraseIndex=0,lastPhrase=[],bandTempo=null,arrangedChord=null;
let running=false,session=0,startAt=0,history=[],onsets=[],smooth=Array(12).fill(0),lastRms=0,lastOnset=0,lastSound=0,lastHistory=0,lastRequest=0,busy=false;
let chord=null,candidate=null,candidateSince=0,confidence=0,bpm=100,tempoKnown=false,queue=[],played=[],version=0,wasSilent=true,phraseEnd=0;
const canvas=$('scope'),paint=canvas.getContext('2d');
const labels={bass:'Bass',keys:'Electric keys',drums:'Drum kit',piano:'Piano',pluck:'Guitar / pluck',strings:'String pad',organ:'Organ',vibes:'Vibraphone',flute:'Flute',lead:'Synth lead'};
let enabledInstruments=new Set(['pluck']);
try{const saved=JSON.parse(localStorage.getItem('band-instruments'));if(Array.isArray(saved)&&saved.some(n=>Object.values(instruments).includes(n)))enabledInstruments=new Set(saved.filter(n=>Object.values(instruments).includes(n)));}catch{}
for(const name of Object.values(instruments)){
 const row=document.createElement('div');row.className='channel';
 row.innerHTML=`<label class="instrument-toggle"><input type="checkbox" id="enable-${name}" aria-label="Enable ${labels[name]}" ${enabledInstruments.has(name)?'checked':''}><b>${labels[name]}</b></label><div class="activity" id="${name}Activity"></div><input id="${name}" aria-label="${labels[name]} volume" type="range" min="0" max="100" value="${name==='bass'?80:50}">`;
 $('channels').append(row);
 row.classList.toggle('inactive',!enabledInstruments.has(name));
 $('enable-'+name).onchange=()=>{
  if(!$('enable-'+name).checked&&enabledInstruments.size===1){$('enable-'+name).checked=true;log('Keep at least one instrument selected.');return;}
  $('enable-'+name).checked?enabledInstruments.add(name):enabledInstruments.delete(name);
  row.classList.toggle('inactive',!enabledInstruments.has(name));
  localStorage.setItem('band-instruments',JSON.stringify([...enabledInstruments]));
  invalidate();lastRequest=0;
  log('Selected instruments: '+[...enabledInstruments].map(n=>labels[n]).join(', '));
  if(running)status('Ensemble changed · composing for your selection');
 };
}
function log(message){const at=new Date().toLocaleTimeString([], {hour12:false});logs.push({at,message});if(logs.length>500)logs.shift();const p=document.createElement('p'),t=document.createElement('time');t.textContent=at;p.append(t,document.createTextNode(message));$('log').prepend(p);while($('log').children.length>40)$('log').lastChild.remove();}
function status(s){$('status').textContent=s;}
function invalidate(){resetStage();version++;queue=[];phraseEnd=0;phraseStart=0;phraseIndex=0;lastPhrase=[];bandTempo=null;arrangedChord=null;band?.hush();controller?.abort();}
async function compose(){
 if(busy||!running||!history.length)return;
 const own=session,revision=version,requestChord=chord,phraseBpm=bpm;const received=[];busy=true;lastRequest=ctx.currentTime;controller=new AbortController();let failed=false,completed=false;
 log('Analyzing the original input; sending measured pitch/rhythm evidence to Codex.');
 status(queue.length?'Band playing · composing next phrase':'Listening · generating fresh music');

 try{
  const {audio,recording}=await originalAudio();
  const evidence=await new Promise((resolve,reject)=>{const worker=new Worker('/feature-worker.mjs',{type:'module'});const timer=setTimeout(()=>{worker.terminate();reject(Error('Input analysis timed out'));},5000);worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();data.error?reject(Error(data.error)):resolve(data.evidence);};worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(Error('Input analysis failed'));};worker.postMessage({id:1,recording});});
  if(own!==session||revision!==version||!running)return;
  const res=await fetch('/compose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instruments:[...enabledInstruments],audio,evidence,bpm:phraseBpm,history:history.slice(-20),previous:lastPhrase,phraseIndex,...rhythmContext(onsets,ctx.currentTime,phraseBpm)}),signal:controller.signal});
  if(!res.ok)throw Error(res.status===429?'Composer finishing the previous request.':'Composer connection failed.');
  const reader=res.body.getReader(),decoder=new TextDecoder();let pending='';
  for(;;){const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let i;
   while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);if(!line)continue;const msg=JSON.parse(line);
    if(own!==session||revision!==version||!running)continue;
    if(msg.type==='diagnostic'){flushDiagnostics();lastDiagnostic=msg.id;log(`Saved input and composition: ${msg.id}`);}
    if(msg.type==='error'){if(/sign in|access token|authentication|unauthorized|usage limit|rate limit|quota/i.test(msg.message))authBlocked=true;failed=true;log(msg.message);status('Composer needs attention');}
    if(msg.type==='status'){log(msg.message);status(msg.message);}
    if(msg.type==='score'){$('score').textContent=msg.abc;}
    if(msg.type==='done'){completed=true;log(`Complete phrase generated in ${(msg.elapsedMs/1000).toFixed(1)} s.`);}
    if(msg.type==='note'){
     if(!received.length){$('latency').textContent=(msg.elapsedMs/1000).toFixed(1)+' s';log(`Fresh accompaniment received in ${(msg.elapsedMs/1000).toFixed(1)} s for ${requestChord||'unknown harmony'}.`);}
     received.push(msg.event);

    }
   }
  }
  if(own===session&&revision===version&&!failed&&completed&&received.length){
   status('Loading instrument samples');
   await band.prepare(received);
   if(own!==session||revision!==version||!running)return;
   const now=ctx.currentTime,playbackTempo=bpm,step=60/playbackTempo;
   // Only freshly generated events are buffered. A complete response keeps
   // token/network jitter out of the audio clock; a bounded AI ending may bridge delays.
   const bar=240/playbackTempo;
   let anchor=phraseStart?phraseStart+Math.max(1,Math.ceil((now+.15-phraseStart)/bar))*bar:now+.15;
   const alignment=pulseAlignment(onsets,playbackTempo,now);
   anchor=alignBoundary(anchor,alignment,now);
   diagnosticEvents.push({action:'pulse-alignment',at:now,locked:!!alignment,confidence:alignment?.confidence||0,anchor});
   queue=queue.filter(n=>n.time<anchor);
   if(!phraseEnd&&alignment)anchor=alignment.next;
   for(const event of received.filter(n=>n.beat<16))queue.push({...event,time:anchor+event.beat*step,tempo:playbackTempo,harmony:requestChord,diagnosticId:lastDiagnostic,version:revision});
   phraseStart=anchor;phraseEnd=anchor+16*step;bridgeCount=0;diagnosticEvents.push({action:"scheduled",anchor,now,bpm:playbackTempo,notes:received});bandTempo=playbackTempo;lastPhrase=received.filter(n=>n.beat<16);arrangedChord=requestChord;phraseIndex++;
   status('Playing fresh accompaniment');
   log(`Instruments: ${[...new Set(received.map(n=>labels[n.instrument]))].join(', ')}.`);
   log(`Queued ${received.length} new notes · starts in ${(anchor-now).toFixed(1)} s · ${(phraseEnd-anchor).toFixed(1)} s of music.`);
  }else if(own===session&&!failed&&!received.length){log('No playable notes received; no backing track substituted.');}

 }catch(e){if(e.name!=='AbortError'&&own===session){log(e.message);status('Composer unavailable');}}
 finally{if(own===session){busy=false;controller=null;}}
}
function analyse(){
 if(!running)return;
 const now=ctx.currentTime,db=new Float32Array(analyser.frequencyBinCount),wave=new Float32Array(analyser.fftSize);analyser.getFloatFrequencyData(db);analyser.getFloatTimeDomainData(wave);const rhythmWave=new Float32Array(rhythmAnalyser.fftSize);rhythmAnalyser.getFloatTimeDomainData(rhythmWave);
 const rms=Math.sqrt(rhythmWave.reduce((s,x)=>s+x*x,0)/rhythmWave.length),audible=rms>.003;
 const w=canvas.clientWidth,h=canvas.clientHeight;if(canvas.width!==w*devicePixelRatio){canvas.width=w*devicePixelRatio;canvas.height=h*devicePixelRatio;paint.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);}
 paint.clearRect(0,0,w,h);paint.strokeStyle=audible?'#cee7b3':'#3a5140';paint.lineWidth=1.4;paint.beginPath();for(let i=0;i<w;i++){const y=h/2+wave[Math.floor(i/w*wave.length)]*h*1.7;i?paint.lineTo(i,y):paint.moveTo(i,y);}paint.stroke();
 const out=new Float32Array(band.output.fftSize);band.output.getFloatTimeDomainData(out);const peak=Math.max(...out.map(Math.abs));$('audioHealth').textContent=`Audio: ${ctx.state} · input ${(rms*100).toFixed(1)}% · band output ${(peak*100).toFixed(1)}% · ${played.length} recent notes played`;
 $('elapsed').textContent=new Date((now-startAt)*1000).toISOString().slice(14,19);
 if(audible){lastSound=now;if(wasSilent){wasSilent=false;status('Listening to your playing');}}
 // Spectral changes catch strums even when sustained guitar energy stays loud.
 let flux=0;
 const spectrum=Float32Array.from(db,v=>Math.pow(10,v/20));
 if(previousSpectrum)for(let i=2;i<spectrum.length;i++)flux+=Math.max(0,spectrum[i]-previousSpectrum[i]);
 previousSpectrum=spectrum;
 const attack=audible&&now-lastOnset>.13&&(rms>lastRms*1.28||flux>Math.max(.008,fluxAverage*1.65));
 fluxAverage=fluxAverage*.85+flux*.15;
 if(attack){
  onsets.push(now);onsets=onsets.filter(t=>now-t<6);lastOnset=now;
  const detected=estimateTempo(onsets.slice(-10));
  if(detected){const stable=tempoTracker.update(detected,now);if(stable){bpm=stable;tempoKnown=true;}}

 }
 lastRms=lastRms*.7+rms*.3;
 const manual=Number($('manualTempo').value);if(manual>=45&&manual<=200){bpm=manual;tempoKnown=true;}
 if(bandTempo&&Math.abs(bpm-bandTempo)/bandTempo>.035){
  const adjusted=retimeQueue(queue,phraseEnd,now,bandTempo,bpm);queue=adjusted.queue;phraseEnd=adjusted.end;phraseStart=now+.12+(phraseStart-now-.12)*bandTempo/bpm;
  diagnosticEvents.push({action:"tempo",at:now,from:bandTempo,to:bpm});log(`Band tempo follows your pulse: ${bandTempo} → ${bpm} BPM.`);bandTempo=bpm;
 }
 if(audible){const chroma=spectrumChroma(db,ctx.sampleRate,analyser.fftSize);smooth=smooth.map((v,i)=>v*.72+chroma[i]*.28);const detected=chordFromChroma(smooth);confidence=detected.confidence;
  if(detected.name!==candidate){candidate=detected.name;candidateSince=now;}
  if(confidence>.35&&now-candidateSince>1&&candidate!==chord){chord=candidate;log(`Harmony estimate: ${chord}.`);}
 }
 if(now-lastSound>2&&!wasSilent){wasSilent=true;log('Input quiet. Letting the generated music finish; Stop cuts playback immediately.');}

 if(audible&&now-lastHistory>.25){history.push({at:Math.round((now-startAt)*10)/10,chord:confidence>.35?chord||'unknown':'unknown',energy:Math.min(1,rms*8),confidence});history=history.filter(x=>x.at>(now-startAt)-5);lastHistory=now;}
 $('chord').textContent=chord||'—';$('confidence').textContent=chord?`${Math.round(confidence*100)}% separation · estimate`:'Waiting for clear harmony';$('tempo').textContent=tempoKnown?bpm:'—';$('tempoSource').textContent=manual?'Tempo assist enabled':tempoKnown?`Input ${bpm} · band ${bandTempo||bpm} BPM`:'Learning pulse · 100 BPM provisional';$('queue').textContent=`${queue.length} notes queued`;
 history=history.filter(x=>x.at>(now-startAt)-5);
 // One request at a time; refresh from current input rather than queueing old requests.
 if(!authBlocked&&!wasSilent&&history.length&&now-startAt>=5&&!busy&&now-lastRequest>=5&&phraseEnd-now<Math.max(12,16*60/(bandTempo||bpm)))void compose();
}
function schedule(){if(!running)return;const now=ctx.currentTime;queue.sort((a,b)=>a.time-b.time);while(queue.length&&queue[0].time<now+.09){const n=queue.shift();if(!enabledInstruments.has(n.instrument)||n.version!==version||n.time<now-.2){diagnosticEvents.push({action:"skipped",at:now,reason:"late-or-invalidated",note:n});continue;}diagnosticEvents.push({action:"played",at:now,note:n});band.play(n,Math.max(n.time,now+.005),n.tempo||bpm);stageNote(n,Math.max(n.time,now+.005)-now);played.push(n);played=played.slice(-24);const own=session;setTimeout(()=>{if(own!==session)return;$(n.instrument+'Activity').classList.add('lit');setTimeout(()=>$(n.instrument+'Activity').classList.remove('lit'),100);},Math.max(0,(n.time-now)*1000));}}
async function start(){
 authBlocked=false;$('start').disabled=true;const own=++session;
 try{
  if(!ctx){ctx=new AudioContext({latencyHint:'interactive'});band=new Band(ctx);}for(const name of Object.values(instruments))band.levels[name]=Number($(name).value)/100;await ctx.resume();
  analyser=ctx.createAnalyser();analyser.fftSize=8192;analyser.smoothingTimeConstant=.15;rhythmAnalyser=ctx.createAnalyser();rhythmAnalyser.fftSize=1024;
  // Keep microphone analysis in an actively rendered graph without monitoring it.
  inputSink=ctx.createGain();inputSink.gain.value=0;analyser.connect(inputSink).connect(ctx.destination);
  const source=$('source').value;
  if(source==='file'){
   if(!$('file').files[0])throw Error('Choose an audio recording first.');
   if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=URL.createObjectURL($('file').files[0]);$('recording').src=fileUrl;$('recording').hidden=false;
   fileNode ||= ctx.createMediaElementSource($('recording'));inputNode=fileNode;inputNode.connect(analyser);inputNode.connect(ctx.destination);await $('recording').play();
   log('Incoming recording mode. Accompaniment is generated from the current playback, not a prepared score.');
  }else{
   stream=source==='tab'?await navigator.mediaDevices.getDisplayMedia({video:true,audio:true}):await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
   if(!stream.getAudioTracks().length)throw Error('No audio was shared. Select a browser tab and enable Share tab audio.');
   inputNode=ctx.createMediaStreamSource(stream);inputNode.connect(analyser);stream.getAudioTracks()[0].onended=stop;
  }
  await ctx.audioWorklet.addModule('/capture.mjs');capture=new AudioWorkletNode(ctx,'original-input',{channelCountMode:'max'});inputNode.connect(capture);capture.connect(inputSink);
  inputNode.connect(rhythmAnalyser);rhythmAnalyser.connect(inputSink);
  if(own!==session)return;
  tempoTracker=new TempoTracker();phraseStart=0;bridgeCount=0;previousSpectrum=null;fluxAverage=0;tempoCandidate=null;tempoVotes=0;running=true;startAt=lastSound=ctx.currentTime;phraseEnd=0;phraseStart=0;phraseIndex=0;lastPhrase=[];bandTempo=null;arrangedChord=null;history=[];onsets=[];smooth.fill(0);queue=[];played=[];chord=null;candidate=null;lastRequest=0;lastHistory=0;lastOnset=0;lastRms=0;wasSilent=true;busy=false;tempoKnown=false;bpm=100;version++;
  $('stop').disabled=false;$('source').disabled=true;$('liveDot').classList.add('on');status('Listening · play a few seconds');log('Listening started. Original audio is saved locally. Codex composes from measured pitch and rhythm evidence; this model cannot hear audio.');frameTimer=setInterval(analyse,50);scheduleTimer=setInterval(schedule,20);
 }catch(e){log(e.message);stop();status('Input needs attention');}
}
function stop(){diagnosticEvents.push({action:"stop",at:ctx?.currentTime});flushDiagnostics();session++;running=false;invalidate();clearInterval(frameTimer);clearInterval(scheduleTimer);stream?.getTracks().forEach(t=>t.stop());stream=null;inputNode?.disconnect();analyser?.disconnect();rhythmAnalyser?.disconnect();capture?.disconnect();inputSink?.disconnect();$('recording').pause();busy=false;$('start').disabled=false;$('stop').disabled=true;$('source').disabled=false;$('liveDot').classList.remove('on');$('queue').textContent='No notes queued';for(const n of Object.values(instruments))$(n+'Activity').classList.remove('lit');status('Session stopped');}
$('start').onclick=()=>{if($('source').value==='file'&&!$('file').files[0])$('file').click();else void start();};$('stop').onclick=stop;
$('file').onchange=()=>{if($('file').files[0]){log('Recording selected. Press Start listening to begin playback.');$('start').textContent='Start listening ↗';}};$('source').onchange=()=>{$('recording').hidden=$('source').value!=='file';$('hint').textContent=$('source').value==='file'?'Incoming recording mode: the band hears playback in real time. Use headphones.':'Use headphones so the band doesn’t enter your microphone. Input clips and composition diagnostics are saved locally.';};
$('recording').onended=()=>{log('Recording finished. Letting the fresh accompaniment finish.');};$('recording').onseeking=()=>{if(running){invalidate();history=[];}};
for(const name of Object.values(instruments))$(name).oninput=()=>{if(band)band.levels[name]=Number($(name).value)/100;};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({model:'gpt-6.1-sol',reasoning:'low',logs},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='find-the-beat-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
fetch('/health').then(r=>r.json()).then(d=>{$('model').textContent='Codex · GPT‑6.1 Sol / Low';$('connection').classList.add('on');}).catch(()=>{$('model').textContent='Local composer offline';});
window.addEventListener('pagehide',stop);

$('soundcheck').onclick=async()=>{
 try{
  if(!ctx){ctx=new AudioContext({latencyHint:'interactive'});band=new Band(ctx);}await ctx.resume();
  const note={instrument:'piano',note:69,duration:1,velocity:.8};await band.prepare([note]);band.play(note,ctx.currentTime+.08,100);
  $('audioHealth').textContent=`Speaker test · audio ${ctx.state}`;
  log('Speaker test: one reference tone, not AI accompaniment. If inaudible, check tab mute and your selected system output.');
 }catch(e){log(`Audio output error: ${e.message}`);}
};
