import {Composer} from '../composer.mjs';import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
class Listener extends Composer {
 async rpc(method,params){if(method==='thread/start')params={...params,baseInstructions:'Listen to the attached recording. Do not compose. Report JSON with audible instruments, whether the audio is actually accessible, approximate tempo with uncertainty, meter if identifiable, pitch classes or chords ONLY if confidently audible, rhythm description, and two time-local observations. Do not use filename or context guesses; explicitly say unable if audio unavailable. No tools.'};return super.rpc(method,params);}
 message(m){if(m.method==='item/agentMessage/delta')this.answer=(this.answer||'')+m.params.delta;super.message(m);}
}
const cwd=await mkdtemp(path.join(tmpdir(),'beat-listening-')),c=new Listener(cwd);
try{for(const name of ['AcousticGuitarSample-0','AcousticGuitarSample-15','Blue-0','Piano-0']){c.answer='';const audio='data:audio/wav;base64,'+(await readFile(new URL(`samples/${name}.wav`,import.meta.url))).toString('base64');await c.compose({audio,bpm:100,history:[]},()=>{},new AbortController().signal);await writeFile(new URL(`results/listen-${name}.json`,import.meta.url),c.answer);console.log(name,c.answer);}}finally{c.close();await rm(cwd,{recursive:true,force:true});}
