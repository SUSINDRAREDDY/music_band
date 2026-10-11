import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {saveRequest,saveEvents} from '../diagnostics.mjs';
test('diagnostic input is byte-identical and events retain playback decisions',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'music-diagnostic-test-'));
 try{const bytes=Buffer.from('recorded audio fixture');const saved=await saveRequest(root,{bpm:120,history:[],audio:'data:audio/wav;base64,'+bytes.toString('base64')});
 assert.deepEqual(await readFile(path.join(saved.dir,'input.wav')),bytes);
 await saveEvents(saved.dir,[{type:'note',event:{note:60}},{type:'playback',event:{action:'skipped'}}]);
 const events=(await readFile(path.join(saved.dir,'events.ndjson'),'utf8')).trim().split('\n').map(JSON.parse);assert.equal(events[1].event.action,'skipped');
 assert.equal(JSON.parse(await readFile(path.join(saved.dir,'request.json'),'utf8')).audioBytes,bytes.length);
 }finally{await rm(root,{recursive:true,force:true});}
});
