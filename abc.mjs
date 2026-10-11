import ABC from 'abcjs';
export const programs={piano:0,keys:4,pluck:24,bass:33,strings:48,organ:16,vibes:11,flute:73,lead:80,drums:128};
export function parseComposition(text,allowed){
 const abc=text.trim().replace(/^```(?:abc)?\s*\n/i,'').replace(/\n```\s*$/,'');
 if(abc.length>24000||!/^X:\s*1\s*$/m.test(abc)||!/^K:/m.test(abc))throw Error('Incomplete ABC score');
 if(/%%|\[V:|\[I:|\[K:|\[M:|\[Q:/.test(abc))throw Error('Use standalone voices and plain ABC only');
 const voices=[...abc.matchAll(/^V:\s*([a-z]+)(?:\s.*)?$/gm)].map(m=>m[1]);
 if(!voices.length||voices.some(v=>!allowed.includes(v)||!(v in programs)))throw Error('ABC contains an unselected or missing instrument voice');
 const prepared=abc.replace(/^V:\s*([a-z]+).*$/gm,(_,id)=>`V:${id}\n%%MIDI program ${programs[id]}`);
 const tunes=ABC.parseOnly(prepared,{});
 if(tunes.length!==1||tunes[0].warnings?.length)throw Error('ABC score has notation errors');
 const sequence=tunes[0].setUpAudio({chordsOff:true});
 const notes=sequence.tracks.flatMap(track=>track.filter(e=>e.cmd==='note').map(e=>({beat:e.start*4,instrument:Object.keys(programs).find(k=>programs[k]===e.instrument),note:e.pitch,duration:e.duration*4,velocity:Math.min(.85,e.volume/127*.8)})));
 if(!notes.length||notes.length>512||notes.some(n=>!allowed.includes(n.instrument)||!Number.isFinite(n.beat)||n.beat<0||n.beat>=16||n.note<0||n.note>127||n.duration<=0||n.duration>16))throw Error('ABC score is outside the playable four-bar phrase');
 return {abc,notes};
}
