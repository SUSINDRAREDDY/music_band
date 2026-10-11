import {readFile,writeFile} from 'node:fs/promises';import {analyseRecording} from '../public/features.mjs';
const report=[];
for(const name of ['AcousticGuitarSample-0','AcousticGuitarSample-15','Blue-0','Piano-0']){
 const wav=await readFile(new URL(`samples/${name}.wav`,import.meta.url)),count=wav.readUInt16LE(22),sampleRate=wav.readUInt32LE(24),length=(wav.length-44)/4/count;const channels=Array.from({length:count},(_,ch)=>Float32Array.from({length},(_,i)=>wav.readFloatLE(44+(i*count+ch)*4)));const evidence=analyseRecording({channels,sampleRate});const energy=Array(12).fill(0);evidence.frames.forEach(f=>f.pitchClasses.forEach((v,i)=>energy[i]+=v));const maximum=Math.max(...energy);
 for(const variant of ['baseline','evidence-v1','evidence-v2']){
  let rows;try{rows=(await readFile(new URL(`results/${variant}-${name}.ndjson`,import.meta.url),'utf8')).trim().split('\n').map(JSON.parse);}catch{continue;}
  const notes=rows.filter(r=>r.type==='note').map(r=>r.event),pitched=notes.filter(n=>n.instrument!=='drums');const pitchEvidenceSupport=pitched.length?pitched.reduce((s,n)=>s+energy[n.note%12]/maximum,0)/pitched.length:null;
  report.push({name,variant,notes:notes.length,pitched:pitched.length,instruments:[...new Set(notes.map(n=>n.instrument))],status:rows.some(r=>r.type==='done')?'complete':'failed',error:rows.find(r=>r.type==='error')?.message,seconds:rows.some(r=>r.type==='done')?rows.find(r=>r.type==='done').elapsedMs/1000:null,pitchEvidenceSupport});
 }
}
await writeFile(new URL('results/metrics.json',import.meta.url),JSON.stringify(report,null,2));console.log(report);
