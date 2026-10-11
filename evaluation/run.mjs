import {analyseRecording} from '../public/features.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const variant=process.argv[2]||'baseline';
for(const name of ['AcousticGuitarSample-0','AcousticGuitarSample-15','Blue-0','Piano-0']){
 const wav=await readFile(new URL(`samples/${name}.wav`,import.meta.url));const audio='data:audio/wav;base64,'+wav.toString('base64');const count=wav.readUInt16LE(22),rate=wav.readUInt32LE(24),length=(wav.length-44)/4/count;const channels=Array.from({length:count},(_,ch)=>Float32Array.from({length},(_,i)=>wav.readFloatLE(44+(i*count+ch)*4)));const evidence=analyseRecording({channels,sampleRate:rate});
 const response=await fetch('http://localhost:4318/compose',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bpm:100,history:[{at:5,chord:'unknown',energy:.3,confidence:0}],audio,...(variant==='baseline'?{}:{evidence})})});
 const text=await response.text();await writeFile(new URL(`results/${variant}-${name}.ndjson`,import.meta.url),text);
 const events=text.trim().split('\n').map(JSON.parse),notes=events.filter(n=>n.type==='note').map(n=>n.event);
 console.log(JSON.stringify({variant,name,notes:notes.length,instruments:[...new Set(notes.map(n=>n.instrument))],done:events.at(-1)}));
}
