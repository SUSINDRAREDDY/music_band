// Compress measured evidence for model latency; full evidence stays in diagnostics.
export function composerContext(context){
 const {audio,evidence,previous=[],...rest}=context;
 if(!evidence)return {...rest,previous};
 const frames=[];
 for(let i=0;i<evidence.frames.length;i+=3){
  const group=evidence.frames.slice(i,i+3),energy=Array(12).fill(0);for(const f of group)f.pitchClasses.forEach((v,k)=>energy[k]+=v);
  const max=Math.max(...energy,.00001);frames.push([group[0].seconds,...energy.map(v=>Math.round(v/max*10))]);
 }
 const parts={};for(const n of previous){const p=parts[n.instrument]||={pitches:new Set(),attacks:[],ending:[]};p.pitches.add(n.note);if(!p.attacks.includes(n.beat))p.attacks.push(n.beat);if(n.beat>=12)p.ending.push([n.beat,n.note,n.duration,n.velocity]);}
 return {...rest,history:rest.history?.filter(h=>h.confidence>.35).slice(-6),evidence:{pitchClassOrder:evidence.pitchClassOrder,framesFormat:'[seconds,C,C#,D,D#,E,F,F#,G,G#,A,A#,B] strengths 0-10; harmonics may be present',frames,onsetTimes:evidence.onsetTimes},previous:Object.fromEntries(Object.entries(parts).map(([k,p])=>[k,{pitches:[...p.pitches],attacks:p.attacks.slice(-16),ending:p.ending.slice(-8)}]))};
}
