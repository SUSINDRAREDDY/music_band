import {estimateTempo} from './public/music.mjs';
import {describeInputBar} from './input-score.mjs';
// Compress measured evidence for model latency; full evidence stays in diagnostics.
export function composerContext(context){
 const {audio,evidence,upcoming,previous=[],...rest}=context;
 if(upcoming)return {musicalDirection:context.musicalDirection,bpm:context.bpm,tempoMode:"manual",instruments:context.instruments,phraseIndex:context.phraseIndex,recordingLookahead:true,upcoming:upcoming.map(bar=>describeInputBar(bar,context.bpm))};
 if(!evidence)return {...rest,previous};
 const inputTempo=context.tempoMode==='auto'?estimateTempo(evidence.onsetTimes):context.bpm;
 const inputBars=[];
 if(inputTempo){
  const length=240/inputTempo;
  for(let start=0;start<(evidence.durationSeconds||0)&&inputBars.length<4;start+=length){
   const local={...evidence,transcription:{events:(evidence.transcription?.events||[]).filter(e=>e.endSeconds>start&&e.startSeconds<start+length).map(e=>({...e,startSeconds:Math.max(0,e.startSeconds-start),endSeconds:Math.min(length,e.endSeconds-start)}))},frames:evidence.frames.filter(f=>f.seconds>=start&&f.seconds<start+length).map(f=>({...f,seconds:f.seconds-start})),onsetTimes:evidence.onsetTimes.filter(t=>t>=start&&t<start+length).map(t=>t-start)};
   inputBars.push(describeInputBar({index:inputBars.length,startSeconds:start,evidence:local},inputTempo));
  }
 }
 const frames=[];
 for(let i=0;i<evidence.frames.length;i+=3){
  const group=evidence.frames.slice(i,i+3),energy=Array(12).fill(0);for(const f of group)f.pitchClasses.forEach((v,k)=>energy[k]+=v);
  const max=Math.max(...energy,.00001);frames.push([group[0].seconds,...energy.map(v=>Math.round(v/max*10))]);
 }
 const parts={};for(const n of previous){const p=parts[n.instrument]||={pitches:new Set(),attacks:[],ending:[]};p.pitches.add(n.note);if(!p.attacks.includes(n.beat))p.attacks.push(n.beat);if(n.beat>=12)p.ending.push([n.beat,n.note,n.duration,n.velocity]);}
 return {...rest,inputABC:inputBars.length?inputBars.map(b=>({startSeconds:b.startSeconds,abc:b.pitchCandidatesABC,caveat:b.caveat,noteEvents:b.noteEvents})):undefined,inputWindow:'Recent past; seconds are relative to the captured window, not future playback. Final ABC bar may be padded with uncertain rests.',...(rest.tempoMode==='auto'?{bpm:undefined}:{}),history:rest.history?.filter(h=>h.confidence>.35).slice(-6),evidence:{durationSeconds:evidence.durationSeconds,noteEvents:evidence.transcription?.events,recentDetail:evidence.frames.slice(-5).map(f=>({seconds:f.seconds,rms:f.rms,note:f.note,pitchConfidence:f.confidence,peaks:f.peaks})),pitchClassOrder:evidence.pitchClassOrder,framesFormat:'[seconds,C,C#,D,D#,E,F,F#,G,G#,A,A#,B] strengths 0-10; harmonics may be present',frames,onsetTimes:evidence.onsetTimes},previous:Object.fromEntries(Object.entries(parts).map(([k,p])=>[k,{pitches:[...p.pitches],attacks:p.attacks.slice(-16),ending:p.ending.slice(-8)}]))};
}
