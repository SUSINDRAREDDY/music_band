import {parseComposition} from './abc.mjs';
import {composerContext} from './context.mjs';
import {spawn} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {allowedNotes,selectedInstruments,instruments} from './public/music.mjs';
export class Composer {
 constructor(cwd){this.cwd=cwd;this.pending=new Map();this.sequence=0;this.job=null;this.ready=null;}
 async connect(){
  if(this.ready)return this.ready;
  this.ready=this.initialize().catch(e=>{this.ready=null;throw e;});return this.ready;
 }
 async initialize(){
  const env=Object.fromEntries(['PATH','HOME','CODEX_HOME','USER','TMPDIR','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  const args=['app-server'];
  for(const key of ['shell_tool','unified_exec','apps','plugins','multi_agent','hooks','browser_use','computer_use','image_generation','view_image'])args.push('-c',`features.${key}=false`);
  args.push('-c','features.skip_host_skill_discovery=true');
  try{const s=readFileSync(path.join(process.env.CODEX_HOME||path.join(homedir(),'.codex'),'config.toml'),'utf8');for(const m of s.matchAll(/^\[mcp_servers\.(?:"([^"]+)"|([A-Za-z0-9_-]+))\]/gm))args.push('-c',`mcp_servers.${(m[1]||m[2])}.enabled=false`);}catch{}
  this.proc=spawn(process.env.CODEX_PATH||'codex',args,{cwd:this.cwd,env,stdio:['pipe','pipe','pipe']});
  const processInstance=this.proc;
  this.proc.stderr.resume();let buffer='';
  this.proc.stdout.on('data',data=>{buffer+=data;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{this.message(JSON.parse(line));}catch{}}});
  const fail=()=>{if(this.proc!==processInstance)return;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Codex disconnected'));}this.pending.clear();this.job?.finish(Error('Codex disconnected'));this.ready=null;};
  this.proc.on('error',fail);this.proc.on('exit',fail);
  await this.rpc('initialize',{clientInfo:{name:'find_the_beat',version:'0.1.0'},capabilities:{experimentalApi:true}});
  this.send({method:'initialized',params:{}});
 }
 send(msg){this.proc.stdin.write(JSON.stringify(msg)+'\n');}
 rpc(method,params){const id=++this.sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Codex connection timed out'));},15000);this.pending.set(id,{resolve,reject,timer});this.send({id,method,params});});}
 message(m){
  if(m.id!==undefined&&this.pending.has(m.id)){const p=this.pending.get(m.id);this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);return;}
  if(m.id!==undefined&&m.method){this.send({id:m.id,error:{code:-32601,message:'Tools and approvals are disabled for the music composer'}});return;}
  const j=this.job;if(!j||m.params?.threadId!==j.threadId)return;
  if(m.method==='item/agentMessage/delta'){j.text+=m.params.delta;}
  if(m.method==='turn/completed')j.finish(m.params.turn.status==='completed'?null:Error(m.params.turn.error?.message||'Composition interrupted'));
 }
 credentialStamp(){
  // Metadata only: never read, copy, log, or manage OAuth tokens ourselves.
  try{const s=statSync(path.join(process.env.CODEX_HOME||path.join(homedir(),'.codex'),'auth.json'));return `${s.ino}:${s.mtimeMs}:${s.size}`;}catch{return 'keychain-or-unavailable';}
 }
 async restart(){
  const old=this.proc;this.proc=null;this.ready=null;
  if(old&&old.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{old.kill('SIGKILL');resolve();},2000);old.once('exit',()=>{clearTimeout(timer);resolve();});old.kill('SIGTERM');});
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Codex connection restarted'));}this.pending.clear();
 }
 async compose(context,emit,signal){
  const stamp=this.credentialStamp();
  if(this.authStamp!==undefined&&stamp!==this.authStamp)await this.restart();
  this.authStamp=stamp;
  for(let attempt=0;attempt<2;attempt++){
   let delivered=0;
   try{
    await this.connect();
    const account=await this.rpc('account/read',{refreshToken:false});
    if(!account.account&&account.requiresOpenaiAuth)throw Error('Codex sign in required. Run codex login.');
    await this.composeOnce(context,event=>{if(event.type==='note')delivered++;emit(event);},signal);
    this.authStamp=this.credentialStamp();return;
   }catch(error){
    const authError=/access token|refresh token|sign in|logged out|unauthorized|401/i.test(error.message);
    if(!authError||attempt||delivered||signal.aborted)throw error;
    emit({type:'status',message:'Reconnecting Codex to reload the current login…'});
    await this.restart();this.authStamp=this.credentialStamp();
   }
  }
 }
 async composeOnce(context,emit,signal){
  await this.connect();if(signal.aborted)return;if(this.job)throw Error('Composer busy');
  const analysis=composerContext(context);
  const allowed=selectedInstruments(context.instruments);
  const instructions=`Compose responsive original accompaniment to a LIVE instrumental performance. You cannot hear audio in this model. The evidence field contains measured spectral pitch-class strengths, onset times from the actual unchanged recording. Peaks can be overtones: infer harmonic support across multiple frames rather than copying the loudest peak. Do not claim you listened. Ignore low-confidence chord labels and stale previous notes. Treat onset timing as rhythmic evidence, not a guarantee of meter. Any source instrument is possible; never assume guitar.
Return only a complete ABC score, no Markdown. Headers X:1, M:4/4, L:1/8, Q:1/4=the supplied BPM, K:your inferred key. Compose exactly four bars (16 quarter-note beats) per voice, including rests. Use standalone V:instrument lines with the exact selected instrument names; never inline [V:] or MIDI directives or other %% directives. Each voice must contain its complete four bars before the next V: line. Use standard ABC notes, chords, rests, ties and dynamics. Do not use repeats. Give the phrase an intentional melodic shape, harmonic movement supported by the evidence, and an ending that can lead into the next phrase. For drums use GM MIDI pitches encoded as ABC pitches (kick C,, =36, snare D,, =38, closed hat ^F,, =42).
First infer the performance's harmonic center, changes, activity and rhythmic spacing from evidence. Compose a compatible supporting phrase, not a generic independent song. When measured pitch content is clear, include appropriate pitched accompaniment even if the chord label says unknown. If no pitched evidence is reliable, do not fabricate harmony. Select the ensemble to complement the input; drums are optional. Avoid defaulting every input to kick-on-bar, backbeat and closed hats. Sparse or rubato input should not be forced into an unrelated busy groove. For active rhythmic input, establish a complementary groove with accents reflecting measured attacks. Use musical voice leading, tasteful dynamics, space and a short memorable answering idea where suitable; don't double all the player's activity. Do not simply transpose the previous phrase: change rhythm, contour or register when the evidence changes. Previous notes are optional continuity context, never stronger evidence than current input. All notes, patterns and instrument choices are generated by you for this session. The user selected ONLY these instruments: ${allowed.join(', ')}. Use no other voices. Arrange for this selected ensemble; let selected voices take turns or rest rather than forcing all to play constantly. No prose, explanations or tools.`;
  const t=await this.rpc('thread/start',{model:'gpt-6.1-sol',cwd:this.cwd,ephemeral:true,sandbox:'read-only',approvalPolicy:'never',baseInstructions:instructions,config:{model_reasoning_effort:'low'}});
  if(signal.aborted){void this.rpc('thread/unsubscribe',{threadId:t.thread.id}).catch(()=>{});return;}
  await new Promise((resolve,reject)=>{
   let turnId,finished=false;
   const finish=error=>{if(finished)return;finished=true;clearTimeout(timeout);signal.removeEventListener('abort',abort);let count=0;if(!error){try{const score=parseComposition(this.job.text,allowed);emit({type:'score',abc:score.abc});for(const event of score.notes)emit({type:'note',event,elapsedMs:Math.round(performance.now()-start)});count=score.notes.length;}catch(e){error=e;}}this.job=null;void this.rpc('thread/unsubscribe',{threadId:t.thread.id}).catch(()=>{});if(error)reject(error);else{emit({type:'done',count,elapsedMs:Math.round(performance.now()-start)});resolve();}};
   const abort=()=>{if(turnId)void this.rpc('turn/interrupt',{threadId:t.thread.id,turnId}).catch(()=>{});finish(Error('Cancelled'));};
   const start=performance.now(),timeout=setTimeout(()=>{abort();},45000);
   this.job={allowed,threadId:t.thread.id,text:'',sent:0,emit,start,finish};signal.addEventListener('abort',abort,{once:true});
   this.rpc('turn/start',{threadId:t.thread.id,effort:'low',input:[{type:'text',text:JSON.stringify(analysis)}]}).then(r=>{turnId=r.turn.id;if(finished)void this.rpc('turn/interrupt',{threadId:t.thread.id,turnId}).catch(()=>{});}).catch(finish);
  });
 }
 close(){this.proc?.kill();}
}
