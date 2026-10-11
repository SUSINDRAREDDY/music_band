export const instruments={b:'bass',k:'keys',d:'drums',p:'piano',g:'pluck',s:'strings',o:'organ',v:'vibes',f:'flute',l:'lead'};
export const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
export function chordFromChroma(c){
 const total=c.reduce((a,b)=>a+b,0); if(total<1e-8)return {name:null,confidence:0,root:null};
 const ranked=[];
 for(let r=0;r<12;r++)for(const [quality,intervals] of [['',[0,4,7]],['m',[0,3,7]]]){
  const inside=intervals.reduce((s,i)=>s+c[(r+i)%12],0);
  const weakest=Math.min(...intervals.map(i=>c[(r+i)%12]));
  ranked.push({name:names[r]+quality,root:r,score:(inside-.55*(total-inside)+.5*weakest)/total});
 }
 ranked.sort((a,b)=>b.score-a.score);
 const confidence=Math.max(0,Math.min(1,(ranked[0].score-ranked[1].score)*3));
 return {...ranked[0],confidence};
}
export function spectrumChroma(db,sampleRate,fftSize){
 const c=Array(12).fill(0);
 for(let k=2;k<db.length-2;k++){
  const f=k*sampleRate/fftSize;
  if(f<75||f>1400||db[k]<-65||db[k]<db[k-1]||db[k]<db[k+1])continue;
  const p=69+12*Math.log2(f/440),n=Math.round(p);
  if(Math.abs(p-n)>.45)continue;
  c[((n%12)+12)%12]+=Math.pow(10,db[k]/20)/Math.sqrt(f/100);
 }
 return c;
}
export function estimateTempo(onsets){
 if(onsets.length<5)return null;
 const candidates=[];
 for(let i=1;i<onsets.length;i++){
  let dt=onsets[i]-onsets[i-1];if(dt<.12||dt>2)continue;
  let bpm=60/dt;while(bpm<45)bpm*=2;while(bpm>200)bpm/=2;candidates.push(bpm);
 }
 if(candidates.length<4)return null;
 candidates.sort((a,b)=>a-b);const median=candidates[Math.floor(candidates.length/2)];
 const good=candidates.filter(x=>Math.abs(x-median)<median*.2);
 return good.length>=candidates.length*.65?Math.round(good.reduce((a,b)=>a+b)/good.length):null;
}
export function validNote(n){return n&&Object.values(instruments).includes(n.instrument)&&Number.isInteger(n.note)&&n.note>=24&&n.note<=96&&Number.isFinite(n.beat)&&n.beat>=0&&n.beat<34&&Number.isFinite(n.duration)&&n.duration>=.05&&n.duration<=4&&Number.isFinite(n.velocity)&&n.velocity>=.05&&n.velocity<=1&&(n.instrument!=='drums'||[36,38,42,46,49].includes(n.note));}
// Parse complete top-level event rows, including nested chord arrays, while streaming.
export function extractNotes(text){
 const notes=[];let depth=0,start=-1;
 for(let i=0;i<text.length;i++){
  if(text[i]==='['){depth++;if(depth===2)start=i;}
  if(text[i]===']'){
   if(depth===2&&start>=0){
    try{
     const row=JSON.parse(text.slice(start,i+1));
     const [beat,code,pitch,duration,velocity,count=1,every=0]=row;
     const pitches=Array.isArray(pitch)?pitch:[pitch];
     if(Number.isFinite(beat)&&row.length>=5&&row.length<=7&&pitches.length<=8&&Number.isInteger(count)&&count>=1&&count<=64&&Number.isFinite(every)&&every>=0&&(count===1||every>=.125)){
      for(let r=0;r<count;r++)for(const note of pitches){
       const n={beat:beat+r*every,instrument:instruments[code],note,duration,velocity};
       if(validNote(n)&&n.beat<32&&notes.length<256)notes.push(n);
      }
     }
    }catch{}
    start=-1;
   }
   depth--;
  }
 }
 if(notes.length)return notes;
 return [...text.matchAll(/\{[^{}]*\}/g)].flatMap(m=>{try{const n=JSON.parse(m[0]);return validNote(n)&&n.beat<32?[n]:[];}catch{return [];}}).slice(0,256);
}
export function phraseAnchor(now,end,bpm){
 if(!end)return now+.15;
 const bar=240/bpm;
 return end+Math.max(0,Math.ceil((now+.15-end)/bar))*bar;
}
export function validateContext(x){
 if(!x||!Number.isFinite(x.bpm)||x.bpm<45||x.bpm>200||!Array.isArray(x.history)||x.history.length>30)throw Error('Invalid musical context');
 const history=x.history.map(h=>{if(!h||typeof h.chord!=='string'||! /^(?:[A-G]#?m?|unknown)$/.test(h.chord)||!Number.isFinite(h.at)||!Number.isFinite(h.energy))throw Error('Invalid analysis frame');return {chord:h.chord,at:h.at,energy:Math.max(0,Math.min(1,h.energy)),...(Number.isFinite(h.confidence)?{confidence:Math.max(0,Math.min(1,h.confidence))}:{})};});
 if(x.audio!==undefined&&(typeof x.audio!=='string'||x.audio.length>11000000||!/^data:audio\/wav;base64,[A-Za-z0-9+/]+={0,2}$/.test(x.audio)))throw Error('Invalid original audio');
 let evidence;
 if(x.evidence){const e=x.evidence;if(!Array.isArray(e.frames)||e.frames.length>40||!Array.isArray(e.onsetTimes)||e.onsetTimes.length>60)throw Error('Invalid evidence');
 evidence={durationSeconds:Math.min(6,Math.max(0,Number(e.durationSeconds)||0)),pitchClassOrder:'C C# D D# E F F# G G# A A# B',onsetTimes:e.onsetTimes.filter(t=>Number.isFinite(t)&&t>=0&&t<=6),frames:e.frames.map(f=>{if(!Number.isFinite(f.seconds)||!Number.isFinite(f.rms)||!Array.isArray(f.pitchClasses)||f.pitchClasses.length!==12||!f.pitchClasses.every(v=>Number.isFinite(v)&&v>=0&&v<=1)||!Array.isArray(f.peaks)||f.peaks.length>5||!f.peaks.every(p=>Array.isArray(p)&&p.length===2&&Number.isInteger(p[0])&&p[0]>=24&&p[0]<=96&&Number.isFinite(p[1])&&p[1]>=0&&p[1]<=1))throw Error('Invalid spectral frame');return {seconds:f.seconds,rms:f.rms,pitchClasses:f.pitchClasses,peaks:f.peaks};})};}
 return {bpm:Math.round(x.bpm),history,...(x.instruments!==undefined?{instruments:selectedInstruments(x.instruments)}:{}),...(evidence?{evidence}:{}),...(x.audio?{audio:x.audio}:{}),
 ...(Number.isInteger(x.phraseIndex)&&x.phraseIndex>=0?{phraseIndex:x.phraseIndex}:{}),
 ...(Array.isArray(x.attacks)?{attacks:x.attacks.filter(t=>Number.isFinite(t)&&t>=0&&t<=5).slice(-40)}:{}),
 ...(Array.isArray(x.attackBeats)?{attackBeats:x.attackBeats.filter(t=>Number.isFinite(t)&&t>=0&&t<=20).slice(-40)}:{}),
 ...(Number.isFinite(x.attacksPerSecond)?{attacksPerSecond:Math.max(0,Math.min(12,x.attacksPerSecond))}:{}),
 previous:Array.isArray(x.previous)?x.previous.filter(validNote).slice(-256).map(({instrument,note,beat,duration,velocity})=>({instrument,note,beat,duration,velocity})):[]};
}

// Preserve the musical position while changing the remaining audio-clock spacing.
export function retimeQueue(queue,end,now,oldTempo,newTempo){
 const pivot=now+.12,ratio=oldTempo/newTempo;
 return {queue:queue.map(n=>n.time<=pivot?n:{...n,time:pivot+(n.time-pivot)*ratio,tempo:newTempo}),end:end>pivot?pivot+(end-pivot)*ratio:end};
}
export function rhythmContext(onsets,now,bpm){
 const attacks=onsets.filter(t=>t>=now-5&&t<=now);
 const interval=60/bpm;
 return {attacks:attacks.map(t=>+(t-(now-5)).toFixed(3)),attackBeats:attacks.map(t=>+((t-(attacks[0]??now))/interval).toFixed(3)),attacksPerSecond:attacks.length/5};
}

export class TempoTracker {
 constructor(){this.samples=[];this.value=null;}
 update(candidate,now){
  if(!Number.isFinite(candidate))return this.value;
  this.samples.push({candidate,now});this.samples=this.samples.filter(s=>now-s.now<4);
  const values=this.samples.map(s=>s.candidate).sort((a,b)=>a-b),median=values[Math.floor(values.length/2)];
  const stable=this.samples.filter(s=>Math.abs(s.candidate-median)/median<.06);
  if(stable.length<6||stable.length<this.samples.length*.8||now-stable[0].now<2.5)return this.value;
  if(this.value===null)this.value=Math.round(median);
  else if(Math.abs(median-this.value)/this.value>.04)this.value=Math.round(this.value+Math.max(-3,Math.min(3,median-this.value)));
  return this.value;
 }
}

export function selectedInstruments(value){
 if(value===undefined)return ['pluck'];
 if(!Array.isArray(value)||!value.length||value.length>10||value.some(n=>!Object.values(instruments).includes(n)))throw Error('Choose at least one valid instrument');
 return [...new Set(value)];
}
export function allowedNotes(text,allowed){return extractNotes(text).filter(n=>allowed.includes(n.instrument));}
// Circular phase estimate: only lock when repeated attacks agree on a pulse.
export function pulseAlignment(onsets,bpm,now){
 const period=60/bpm,recent=onsets.filter(t=>t>=now-5&&t<=now);if(recent.length<6)return null;
 let x=0,y=0;for(const t of recent){const a=t/period*2*Math.PI;x+=Math.cos(a);y+=Math.sin(a);}
 const confidence=Math.hypot(x,y)/recent.length;if(confidence<.65)return null;
 const phase=((Math.atan2(y,x)/(2*Math.PI)*period)%period+period)%period;
 return {phase,period,confidence,next:phase+Math.ceil((now+.15-phase)/period)*period};
}
export function alignBoundary(boundary,pulse,now){
 if(!pulse)return boundary;
 const nearest=pulse.phase+Math.round((boundary-pulse.phase)/pulse.period)*pulse.period;
 return nearest>=now+.12?nearest:nearest+pulse.period;
}
