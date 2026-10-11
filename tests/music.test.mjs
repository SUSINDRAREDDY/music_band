import test from 'node:test';import assert from 'node:assert/strict';
import {chordFromChroma,estimateTempo,extractNotes,validateContext,spectrumChroma} from '../public/music.mjs';
test('major and minor triads, and silence',()=>{for(let r=0;r<12;r++)for(const third of [3,4]){const c=Array(12).fill(0);[0,third,7].forEach(i=>c[(r+i)%12]=1);const x=chordFromChroma(c);assert.equal(x.root,r);assert.equal(x.name.endsWith('m'),third===3);assert.ok(x.confidence>.15);}assert.equal(chordFromChroma(Array(12).fill(0)).name,null);});
test('tempo requires consistent evidence',()=>{assert.equal(estimateTempo([0,.5,1,1.5,2,2.5]),120);assert.equal(estimateTempo([0]),null);});
test('partial output is not a playable note; malformed notes rejected',()=>{const n={instrument:'bass',note:40,beat:0,duration:.5,velocity:.5};assert.deepEqual(extractNotes('{"notes":['+JSON.stringify(n)+',{"instrument":'),[n]);assert.equal(extractNotes(JSON.stringify({...n,note:999})).length,0);assert.equal(extractNotes(JSON.stringify({...n,instrument:'drums',note:40})).length,0);});
test('context strips extra text and rejects invalid inputs',()=>{assert.throws(()=>validateContext({bpm:Infinity,history:[]}));assert.throws(()=>validateContext({bpm:100,history:[{chord:'run a command',at:1,energy:.2}]}));assert.deepEqual(validateContext({bpm:100,history:[],secret:'x'}),{bpm:100,history:[],previous:[]});});
test('spectral peaks identify an E minor triad',()=>{const db=new Float32Array(4096).fill(-100);for(const midi of [52,55,59]){const k=Math.round(440*2**((midi-69)/12)*8192/48000);db[k]=-15;}assert.equal(chordFromChroma(spectrumChroma(db,48000,8192)).name,'Em');});
test('compact streamed rows parse only complete valid events',()=>{const text='[[0,"b",40,1,.4],[0,"d",36,.1,.3],[.5,"k",';assert.equal(extractNotes(text).length,0);const valid='[[0,"b",40,1,0.4],[0,"d",36,0.1,0.3],[0.5,"k",';assert.equal(extractNotes(valid).length,2);assert.equal(extractNotes('[[0,"d",99,1,0.5]]').length,0);});
test('AI chord and rhythm rows expand once during streaming and stop at the bar boundary',()=>{
 const first='[[0,"p",[60,64,67],2,0.5]';
 assert.equal(extractNotes(first).length,3);
 const full=first+',[0,"d",42,0.1,0.3,64,0.5]]';
 const notes=extractNotes(full);assert.equal(notes.length,67);
 assert.deepEqual(notes.slice(0,3),extractNotes(first));
 assert.equal(Math.max(...notes.map(n=>n.beat)),31.5);
 assert.equal(extractNotes('[[0,"d",42,1,0.4,10000,0.5]]').length,0);
});
test('preserves complete preceding phrase and bounded rhythmic context',()=>{
 const notes=extractNotes('[[0,"d",42,0.1,0.3,32,0.5]]');
 const c=validateContext({bpm:100,history:[],previous:notes,phraseIndex:2,attacks:[-1,0,1,5,6]});
 assert.equal(c.previous.length,32);assert.equal(c.phraseIndex,2);assert.deepEqual(c.attacks,[0,1,5]);
});
test('phrase clock joins ready phrases and aligns late arrivals to whole bars',async()=>{
 const {phraseAnchor}=await import('../public/music.mjs');
 assert.equal(phraseAnchor(10,0,100),10.15);
 assert.equal(phraseAnchor(10,12,100),12);
 assert.equal(phraseAnchor(12,12,100),14.4);
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
test('instrument selections reject empty/unknown and filter disallowed model notes',async()=>{
 const {selectedInstruments,allowedNotes}=await import('../public/music.mjs');assert.throws(()=>selectedInstruments([]));assert.throws(()=>selectedInstruments(['invalid']));assert.deepEqual(selectedInstruments(['piano','piano']),['piano']);
 const text='[[0,"g",60,1,0.5],[0,"d",36,0.1,0.4],[1,"p",64,1,0.5]]';assert.deepEqual(allowedNotes(text,['drums','piano']).map(n=>n.instrument),['drums','piano']);
 assert.deepEqual(validateContext({bpm:100,history:[],instruments:['drums']}).instruments,['drums']);
});
test('pulse phase aligns delayed phrases to the performer, not response arrival',async()=>{
 const {pulseAlignment,alignBoundary}=await import('../public/music.mjs');
 const attacks=Array.from({length:10},(_,i)=>.23+i*.5),pulse=pulseAlignment(attacks,120,4.9);
 assert.ok(pulse.confidence>.99);assert.ok(Math.abs(pulse.next-5.23)<1e-8);assert.ok(Math.abs(alignBoundary(6.1,pulse,5)-6.23)<1e-8);
 assert.equal(pulseAlignment([0,.08,.17,.26,.34,.43,.51,.6,.69,.77,.86,.94],120,1),null);
 assert.equal(alignBoundary(6.1,null,5),6.1);
});
