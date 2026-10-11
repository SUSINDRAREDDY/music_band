import test from 'node:test';import assert from 'node:assert/strict';import {analyseRecording} from '../public/features.mjs';import {validateContext} from '../public/music.mjs';
test('spectral evidence follows source pitches without changing input samples',()=>{
 const rate=24000;
 for(const midi of [48,57,64,72]){
  const input=Float32Array.from({length:rate},(_,i)=>.3*Math.sin(2*Math.PI*440*2**((midi-69)/12)*i/rate)),original=input.slice();const e=analyseRecording({channels:[input],sampleRate:rate});
  assert.deepEqual(input,original);const f=e.frames[1];assert.equal(f.pitchClasses.indexOf(Math.max(...f.pitchClasses)),midi%12);assert.equal(f.peaks[0][0],midi);
  assert.ok(validateContext({bpm:100,history:[],evidence:e}).evidence.frames.length);
 }
});
test('silence carries no invented pitch energy',()=>{const e=analyseRecording({channels:[new Float32Array(24000)],sampleRate:24000});assert.ok(e.frames.every(f=>f.rms===0&&f.pitchClasses.every(v=>v===0)));assert.deepEqual(e.onsetTimes,[]);});
test('compact model evidence excludes audio bytes and retains measured pitch ordering',async()=>{
 const {composerContext}=await import('../context.mjs');const frames=Array.from({length:6},(_,i)=>({seconds:i*.2,rms:.3,pitchClasses:[1,0,.2,0,.5,0,0,.6,0,.1,0,0],peaks:[]}));
 const out=composerContext({bpm:120,audio:'private-bytes',history:[],previous:[],evidence:{frames,onsetTimes:[.1,.6],pitchClassOrder:'C C# D D# E F F# G G# A A# B'}});
 assert.equal(out.audio,undefined);assert.equal(out.evidence.frames.length,2);assert.equal(out.evidence.frames[0][1],10);assert.deepEqual(out.evidence.onsetTimes,[.1,.6]);
});

test('live input carries provisional ABC without silently assigning C major or tempo',async()=>{
 const {composerContext}=await import('../context.mjs');
 const evidence={transcription:{events:[{kind:"note",note:60,startSeconds:0,endSeconds:.5,confidence:.98},{kind:"silence",note:null,startSeconds:.5,endSeconds:2,confidence:0}]},durationSeconds:2,onsetTimes:[0,.5,1,1.5],frames:[{seconds:.1,rms:.2,note:60,confidence:.98,pitchClasses:[1,0,0,0,0,0,0,0,0,0,0,0],peaks:[[60,1]]}]};
 const sent=composerContext({bpm:120,tempoMode:'manual',evidence});
 assert.match(sent.inputABC[0].abc,/=C/);assert.equal(sent.evidence.recentDetail[0].note,60);
 const uncertain=composerContext({bpm:100,tempoMode:'auto',evidence:{...evidence,onsetTimes:[]}});
 assert.equal(uncertain.inputABC,undefined);assert.equal(uncertain.bpm,undefined);
});
