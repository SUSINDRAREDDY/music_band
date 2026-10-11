import test from 'node:test';import assert from 'node:assert/strict';
import {chordFromChroma,estimateTempo,validateContext,spectrumChroma} from '../public/music.mjs';
test('major and minor triads, and silence',()=>{for(let r=0;r<12;r++)for(const third of [3,4]){const c=Array(12).fill(0);[0,third,7].forEach(i=>c[(r+i)%12]=1);const x=chordFromChroma(c);assert.equal(x.root,r);assert.equal(x.name.endsWith('m'),third===3);assert.ok(x.confidence>.15);}assert.equal(chordFromChroma(Array(12).fill(0)).name,null);});
test('tempo requires consistent evidence',()=>{assert.equal(estimateTempo([0,.5,1,1.5,2,2.5]),120);assert.equal(estimateTempo([0]),null);});
test('context strips extra text and rejects invalid inputs',()=>{assert.throws(()=>validateContext({bpm:Infinity,history:[]}));assert.throws(()=>validateContext({bpm:100,history:[{chord:'run a command',at:1,energy:.2}]}));assert.deepEqual(validateContext({bpm:100,history:[],secret:'x'}),{bpm:100,history:[],previous:[]});});
test('spectral peaks identify an E minor triad',()=>{const db=new Float32Array(4096).fill(-100);for(const midi of [52,55,59]){const k=Math.round(440*2**((midi-69)/12)*8192/48000);db[k]=-15;}assert.equal(chordFromChroma(spectrumChroma(db,48000,8192)).name,'Em');});
test('preserves complete preceding phrase and bounded rhythmic context',()=>{
 const notes=Array.from({length:32},(_,i)=>({instrument:'drums',note:42,beat:i*.5,duration:.1,velocity:.3}));
 const c=validateContext({bpm:100,history:[],previous:notes,phraseIndex:2,attacks:[-1,0,1,5,6]});
 assert.equal(c.previous.length,32);assert.equal(c.phraseIndex,2);assert.deepEqual(c.attacks,[0,1,5]);
});
test('fast pulses stay fast instead of being folded to half speed',()=>{
 for(const bpm of [90,120,150,180,195])assert.equal(estimateTempo(Array.from({length:10},(_,i)=>i*60/bpm)),bpm);
});
test('queued music speeds up without moving imminent notes or reversing event order',async()=>{
 const {retimeQueue,rhythmContext}=await import('../public/music.mjs');
 const result=retimeQueue([{time:10.05,tempo:100},{time:11.12,tempo:100},{time:12.12,tempo:100}],14.12,10,100,200);
 assert.equal(result.queue[0].time,10.05);assert.equal(result.queue[1].time,10.62);assert.equal(result.queue[2].time,11.12);assert.equal(result.end,12.12);assert.equal(result.queue[1].tempo,200);
 assert.deepEqual(rhythmContext([0,1,2,3],3,120).attackBeats,[0,2,4,6]);
});
test('original audio WAV preserves captured samples and channel order',async()=>{
 const {wavDataUrl}=await import('../public/recording.mjs');
 const channels=[new Float32Array([.125,-.75,0]),new Float32Array([.25,.5,-.125])];
 const url=wavDataUrl({channels,sampleRate:48000}),bytes=Buffer.from(url.split(',')[1],'base64');
 assert.equal(bytes.readUInt16LE(20),3);assert.equal(bytes.readUInt16LE(22),2);assert.equal(bytes.readUInt32LE(24),48000);
 for(let i=0;i<3;i++)for(let ch=0;ch<2;ch++)assert.equal(bytes.readFloatLE(44+(i*2+ch)*4),channels[ch][i]);
 assert.equal(validateContext({bpm:120,history:[],audio:url}).audio,url);
 assert.throws(()=>validateContext({bpm:120,history:[],audio:'https://example.com/a.wav'}));
});
test('tempo tracker rejects brief jumps and adapts only to sustained evidence',async()=>{
 const {TempoTracker}=await import('../public/music.mjs');const t=new TempoTracker();
 for(let i=0;i<8;i++)t.update(112,i*.5);assert.equal(t.value,112);
 for(let i=0;i<3;i++)t.update(153,4+i*.4);assert.equal(t.value,112);
 for(let i=0;i<14;i++)t.update(150,6+i*.5);assert.ok(t.value>112&&t.value<150);
});
test('pulse phase aligns delayed phrases to the performer, not response arrival',async()=>{
 const {pulseAlignment,alignBoundary}=await import('../public/music.mjs');
 const attacks=Array.from({length:10},(_,i)=>.23+i*.5),pulse=pulseAlignment(attacks,120,4.9);
 assert.ok(pulse.confidence>.99);assert.ok(Math.abs(pulse.next-5.23)<1e-8);assert.ok(Math.abs(alignBoundary(6.1,pulse,5)-6.23)<1e-8);
 assert.equal(pulseAlignment([0,.08,.17,.26,.34,.43,.51,.6,.69,.77,.86,.94],120,1),null);
 assert.equal(alignBoundary(6.1,null,5),6.1);
});

test('continuous mode bridges input pauses only after an actual generated phrase',async()=>{
 const {canContinue}=await import('../public/music.mjs');
 assert.equal(canContinue(true,true,0,16),true);
 assert.equal(canContinue(true,false,0,16),false);
 assert.equal(canContinue(true,true,0,0),false);
 assert.equal(canContinue(false,false,3,0),true);
 assert.equal(validateContext({bpm:100,history:[],continueThroughPause:true}).continueThroughPause,true);
});
