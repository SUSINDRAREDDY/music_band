import test from 'node:test';
import assert from 'node:assert/strict';
import {transcribeNotes} from '../public/transcribe.mjs';
test('tracks separate attacks, durations and silence without modifying samples',()=>{
 const sampleRate=24000,x=new Float32Array(sampleRate*2);
 for(const [start,end,note] of [[.1,.5,60],[.65,1.05,60],[1.2,1.8,67]])for(let i=start*sampleRate;i<end*sampleRate;i++)x[i]=.2*Math.sin(2*Math.PI*440*2**((note-69)/12)*i/sampleRate);
 const original=x.slice(),result=transcribeNotes({channels:[x],sampleRate});
 assert.deepEqual(x,original);
 const notes=result.events.filter(e=>e.kind==='note'&&e.endSeconds-e.startSeconds>.1);
 assert.deepEqual(notes.map(e=>e.note),[60,60,67]);
 assert.ok(Math.abs(notes[0].startSeconds-.1)<.04);
 assert.ok(Math.abs(notes[0].endSeconds-.5)<.04);
 assert.ok(result.events.some(e=>e.kind==='silence'&&e.startSeconds>=.5&&e.endSeconds<=.65));
 assert.ok(result.onsets.length>=3);
});
test('nonperiodic sound is unknown, not a rest',()=>{
 let seed=42;const samples=Float32Array.from({length:24000},()=>{seed=(seed*1664525+1013904223)>>>0;return (seed/4294967296-.5)*.2;});
 const result=transcribeNotes({channels:[samples],sampleRate:24000});
 assert.ok(result.events.some(e=>e.kind==='unknown'));assert.ok(!result.events.some(e=>e.kind==='silence'));
});
