import test from 'node:test';
import assert from 'node:assert/strict';
import {previewABC,ScoreView} from '../public/score.mjs';
import {BarStream} from '../abc.mjs';
import {Composer} from '../composer.mjs';
test('preview holds incomplete headers and split chord tokens',()=>{
 const header='X:1\nM:4/4\nK:C\nV:piano\n';
 assert.equal(previewABC(header+'[CE'),null);
 assert.equal(previewABC(header+'C8|\n[CE'),header+'C8|');
});
test('composer emits ABC deltas before completion and never premature audio',()=>{
 const c=new Composer('.'),events=[];c.job={threadId:'t',text:'',emit:e=>events.push(e),bars:new BarStream(['piano'],e=>events.push(e))};
 c.message({method:'item/agentMessage/delta',params:{threadId:'t',delta:'X:1\n'}});
 assert.deepEqual(events,[{type:'abc-delta',text:'X:1\n'}]);
 assert.equal(c.job.text,'X:1\n');
});
test('reset cancels stale previews and complete replaces the provisional score',()=>{
 const renders=[];globalThis.ABCJS={renderAbc:(_,abc)=>renders.push(abc)};
 const source={},notation={replaceChildren(){}},status={};const view=new ScoreView(source,notation,status);
 view.append('old');view.reset();view.complete('X:1\nK:C\nC4|');
 assert.equal(view.timer,null);assert.equal(source.textContent,'X:1\nK:C\nC4|');assert.equal(renders.length,1);
 delete globalThis.ABCJS;
});

const bar='X:1\nM:4/4\nL:1/4\nK:C\nV:piano\nC4|\n%endbar\n';
test('new bars render once without redrawing earlier bars',()=>{
 const renders=[],children=[];
 globalThis.document={createElement:()=>({})};globalThis.ABCJS={renderAbc:(node,abc)=>renders.push({node,abc})};
 try{
  const view=new ScoreView({},{append:node=>children.push(node)},{});
  view.appendBar(bar);view.appendBar(bar.replace('C4','D4'));
  assert.equal(renders.length,2);assert.equal(children.length,2);
  assert.equal(renders[0].abc,bar);assert.equal(renders[1].abc,bar.replace('C4','D4'));
  assert.notEqual(renders[0].node,renders[1].node);
 }finally{delete globalThis.document;delete globalThis.ABCJS;}
});
test('split chunks emit each complete bar once before response ends',()=>{
 const events=[],s=new BarStream(['piano'],e=>events.push(e));
 for(const char of bar.repeat(4))s.push(char);
 s.finish();assert.equal(events.length,4);assert.deepEqual(events.map(e=>e.index),[0,1,2,3]);assert.equal(s.notes[3].beat,12);
});
test('short, long, unfinished and excess bars are rejected; rests preserve time',()=>{
 for(const note of ['C2','C8'])assert.throws(()=>new BarStream(['piano'],()=>{}).push(bar.replace('C4',note)));
 assert.throws(()=>new BarStream(['piano'],()=>{}).finish());
 assert.throws(()=>new BarStream(['piano'],()=>{}).push(bar.repeat(5)));
 const events=[];new BarStream(['piano'],e=>events.push(e)).push(bar.replace('C4','z4'));assert.equal(events[0].notes.length,0);
});

test('ready bars join exactly; underruns resume without a whole-bar wait',async()=>{
 const {nextBarAnchor}=await import('../public/music.mjs');
 assert.equal(nextBarAnchor(10,12),12);
 assert.equal(nextBarAnchor(12.2,12),12.35);
});

test('stream preserves GPT tempo and permits a subset of selected instruments',()=>{
 const events=[],stream=new BarStream(['piano','bass','drums'],e=>events.push(e));
 stream.push(bar.replace('K:C','Q:1/4=72\nK:C').repeat(4));stream.finish();
 assert.ok(events.every(e=>e.tempo===72&&e.notes.every(n=>n.instrument==='piano')));
 assert.throws(()=>new BarStream(['piano'],()=>{}).push(bar.replace('K:C','Q:1/4=500\nK:C')),/tempo/);
});
