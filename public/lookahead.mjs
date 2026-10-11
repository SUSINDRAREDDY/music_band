import {joinSustains} from './sustain.mjs';
import {estimateTempo} from './music.mjs';
export function analyseClip(recording){return new Promise((resolve,reject)=>{
 const worker=new Worker('/feature-worker.mjs',{type:'module'});
 const timer=setTimeout(()=>{worker.terminate();reject(Error('Recording analysis timed out'));},15000);
 worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();data.error?reject(Error(data.error)):resolve(data.evidence);};
 worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(Error('Recording analysis failed'));};
 worker.postMessage({recording});
});}
export function sliceRecording(buffer,start,duration){
 const from=Math.round(start*buffer.sampleRate),to=Math.min(buffer.length,Math.round((start+duration)*buffer.sampleRate));
 return {sampleRate:buffer.sampleRate,channels:Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i).slice(from,to))};
}
export function recordingTempo(onsets){
 const candidate=estimateTempo(onsets);if(!candidate)return null;
 const gaps=onsets.slice(1).map((t,i)=>t-onsets[i]).filter(x=>x>.12&&x<2);
 const folded=gaps.map(g=>{let value=60/g;while(value<45)value*=2;while(value>200)value/=2;return value;});
 const periods=folded.filter(v=>Math.abs(v-candidate)/candidate<.2).map(v=>60/v);
 return periods.length?Math.round(60/(periods.reduce((a,b)=>a+b,0)/periods.length)):candidate;
}
export class RecordingLookahead {
 constructor(ctx,buffer){this.ctx=ctx;this.buffer=buffer;this.offset=0;this.end=0;this.sources=new Set();this.cancelled=false;this.prepared=[];this.started=false;}
 async plan(override,previousTempo){
  const probe=await analyseClip(sliceRecording(this.buffer,this.offset,5));
  const bpm=override??recordingTempo(probe.onsetTimes)??previousTempo;
  if(!bpm)throw Error('The recording pulse is unclear. Set Tempo override and restart.');
  const secondsPerBar=240/bpm,start=this.offset;
  const bars=await Promise.all(Array.from({length:4},async(_,index)=>({index,startSeconds:start+index*secondsPerBar,evidence:await analyseClip(sliceRecording(this.buffer,start+index*secondsPerBar,secondsPerBar))})));
  return {bpm,startSeconds:start,secondsPerBar,bars};
 }
 playBar(plan,index,notes,band,revision){
  if(this.cancelled)return [];
  const offset=plan.startSeconds+index*plan.secondsPerBar;
  if(offset>=this.buffer.duration)return [];
  const duration=Math.min(plan.secondsPerBar,this.buffer.duration-offset);
  this.prepared.push(...notes.filter(n=>n.beat*60/plan.bpm<duration).map(n=>({...n,duration:Math.min(n.duration,(duration-n.beat*60/plan.bpm)*plan.bpm/60),time:offset+n.beat*60/plan.bpm,tempo:plan.bpm,version:revision})));
  this.offset=offset+duration;
  return [];
 }
 startPlayback(destination){
  if(this.cancelled||this.started||!this.finished)return [];
  this.started=true;const anchor=this.ctx.currentTime+.3;
  const source=this.ctx.createBufferSource();source.buffer=this.buffer;source.connect(destination);this.sources.add(source);
  source.onended=()=>{this.sources.delete(source);source.disconnect();};source.start(anchor);this.end=anchor+this.buffer.duration;
  return joinSustains(this.prepared).map(n=>({...n,time:anchor+n.time}));
 }
 stop(){this.cancelled=true;for(const s of this.sources)try{s.stop();}catch{}this.sources.clear();}
 get finished(){return this.offset>=this.buffer.duration;}
}
