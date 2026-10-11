import test from 'node:test';
import assert from 'node:assert/strict';
import {GeminiComposer,readSSE} from '../gemini.mjs';
const header='X:1\nM:4/4\nL:1/8\nK:C\n';
const bar='V:piano\nC2 E2 G2 z2|\n%endbar\n';
test('SSE survives single-byte chunks and CRLF',async()=>{
 const data=new TextEncoder().encode('data: {"text":"café"}\r\n\r\n');
 const body=new ReadableStream({start(c){for(const b of data)c.enqueue(Uint8Array.of(b));c.close();}});
 const events=[];await readSSE(body,e=>events.push(e));assert.deepEqual(events,[{text:'café'}]);
});
test('Gemini compact headers stream four validated bars with timing',async()=>{
 const events=[];let request;
 const composer=new GeminiComposer({apiKey:'test-only',fetchImpl:async(url,options)=>{request=JSON.parse(options.body);assert(url.includes('/models/gemini-3.8-flash:streamGenerateContent'));assert.equal(request.generationConfig.temperature,undefined);return new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:header+bar.repeat(4)}]},finishReason:'STOP'}]})+'\n\n');}});
 await composer.compose({bpm:100,instruments:['piano'],history:[]},e=>events.push(e),new AbortController().signal);
 assert.equal(events.filter(e=>e.type==='bar').length,4);assert.equal(events.at(-1).type,'done');assert.equal(request.generationConfig.thinkingConfig.thinkingLevel,'low');assert(!JSON.stringify(request).includes('test-only'));
});
test('provider errors are sanitized and failed streams release busy state',async()=>{
 const composer=new GeminiComposer({apiKey:'test-secret',fetchImpl:async()=>new Response('test-secret',{status:403})});
 await assert.rejects(composer.compose({bpm:100,instruments:['piano'],history:[]},()=>{},new AbortController().signal),e=>e.message.includes('403')&&!e.message.includes('test-secret'));
 assert.equal(composer.abort,null);
});
test('truncated completion does not emit done',async()=>{
 const composer=new GeminiComposer({apiKey:'test-only',fetchImpl:async()=>new Response('data: '+JSON.stringify({candidates:[{content:{parts:[{text:header+bar}]},finishReason:'MAX_TOKENS'}]})+'\n\n')});const events=[];
 await assert.rejects(composer.compose({bpm:100,instruments:['piano'],history:[]},e=>events.push(e),new AbortController().signal));assert.equal(events.length,1);assert.equal(events[0].type,'bar');
});
