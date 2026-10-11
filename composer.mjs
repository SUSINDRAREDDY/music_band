import {BarStream} from './abc.mjs';
import {composerContext} from './context.mjs';
import {spawn} from 'node:child_process';
import {readFileSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {selectedInstruments} from './public/music.mjs';
export {MUSIC_INSTRUCTIONS} from './music-prompt.mjs';
import {MUSIC_INSTRUCTIONS} from './music-prompt.mjs';
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
  const fail=()=>{if(this.proc!==processInstance)return;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Codex disconnected'));}this.pending.clear();this.job?.finish(Error('Codex disconnected'));this.flow=null;this.ready=null;};
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
  const incomingTurn=m.params?.turnId||m.params?.turn?.id;
  if(this.flow?.ignoredTurns?.has(incomingTurn)||(j.turnId&&incomingTurn&&incomingTurn!==j.turnId))return;
  if(m.method==='item/agentMessage/delta'){j.emit({type:'abc-delta',text:m.params.delta});j.text+=m.params.delta;if(j.text.length>24000){j.finish(Error('ABC score exceeds size limit'));return;}try{j.bars?.push(m.params.delta);}catch(e){j.finish(e);}}
  if(m.method==='turn/completed')j.finish(m.params.turn.status==='completed'?null:Error(m.params.turn.error?.message||'Composition interrupted'));
 }
 credentialStamp(){
  // Metadata only: never read, copy, log, or manage OAuth tokens ourselves.
  try{const s=statSync(path.join(process.env.CODEX_HOME||path.join(homedir(),'.codex'),'auth.json'));return `${s.ino}:${s.mtimeMs}:${s.size}`;}catch{return 'keychain-or-unavailable';}
 }
 async restart(){
  const flowId=this.flow?.id;this.flow=null;
  const old=this.proc;this.proc=null;this.ready=null;
  if(old&&old.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{old.kill('SIGKILL');resolve();},2000);old.once('exit',()=>{clearTimeout(timer);resolve();});old.kill('SIGTERM');});
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Codex connection restarted'));}this.pending.clear();
  if(flowId)await this.startSession(flowId);
 }
 async compose(context,emit,signal){
  const stamp=this.credentialStamp();
  if(this.authStamp!==undefined&&stamp!==this.authStamp)await this.restart();
  this.authStamp=stamp;
  for(let attempt=0;attempt<2;attempt++){
   let delivered=0;
   try{
    await this.connect();
    if(context.sessionId&&!this.flow)throw Error('Listening session expired. Press Stop and Start.');
    await this.composeOnce(context,event=>{if(event.type==='note'||event.type==='bar')delivered++;emit(event);},signal);
    this.authStamp=this.credentialStamp();return;
   }catch(error){
    const authError=/access token|refresh token|sign in|logged out|unauthorized|401/i.test(error.message);
    if(!authError||attempt||delivered||signal.aborted)throw error;
    emit({type:'status',message:'Reconnecting Codex to reload the current login…'});
    await this.restart();this.authStamp=this.credentialStamp();
   }
  }
 }
 async startSession(id){
  if(this.flow?.id===id)return this.flow.ready;
  if(this.flow)throw Error('Another listening session is active');
  const flow={id,ignoredTurns:new Set()};this.flow=flow;
  flow.ready=(async()=>{
   await this.connect();
   const account=await this.rpc('account/read',{refreshToken:false});
   if(!account.account&&account.requiresOpenaiAuth)throw Error('Codex sign in required. Run codex login.');
   this.authStamp=this.credentialStamp();
   const t=await this.rpc('thread/start',{model:'gpt-6.1-sol',serviceTier:'fast',cwd:this.cwd,ephemeral:true,sandbox:'read-only',approvalPolicy:'never',baseInstructions:MUSIC_INSTRUCTIONS,config:{model_reasoning_effort:'low'}});
   if(this.flow!==flow){await this.rpc('thread/unsubscribe',{threadId:t.thread.id});throw Error('Listening session stopped');}
   flow.threadId=t.thread.id;return t;
  })().catch(e=>{if(this.flow===flow)this.flow=null;throw e;});
  return flow.ready;
 }
 endSession(id){
  if(!this.flow||this.flow.id!==id)return;
  const flow=this.flow;this.flow=null;
  if(this.job&&this.job.threadId===flow.threadId)this.job.finish(Error('Cancelled'));
  if(flow.threadId)void this.rpc('thread/unsubscribe',{threadId:flow.threadId}).catch(()=>{});
 }
 async composeOnce(context,emit,signal){
  await this.connect();if(signal.aborted)return;if(this.job)throw Error('Composer busy');
  const {sessionId,...analysis}=composerContext(context);
  const allowed=selectedInstruments(context.instruments);
  const setupStart=performance.now();
  const flow=this.flow;
  if(!flow||flow.id!==context.sessionId)throw Error('Listening session expired. Press Stop and Start.');
  const t=await flow.ready;await flow.idle;
  if(signal.aborted||this.flow!==flow)return;
  emit({type:'session',threadId:t.thread.id,setupMs:Math.round(performance.now()-setupStart)});
  await new Promise((resolve,reject)=>{
   let turnId,finished=false;
   const finish=error=>{if(finished)return;finished=true;clearTimeout(timeout);signal.removeEventListener('abort',abort);let count=0;if(!error){try{this.job.bars.finish();count=this.job.bars.notes.length;}catch(e){error=e;}}this.job=null;if(error){flow.idle=turnStarted.then(r=>{flow.ignoredTurns.add(r.turn.id);return this.rpc('turn/interrupt',{threadId:t.thread.id,turnId:r.turn.id});}).catch(()=>{});flow.lastError=error.message;reject(error);}else{emit({type:'done',count,elapsedMs:Math.round(performance.now()-start)});resolve();}};
   const abort=()=>finish(Error('Cancelled'));
   const start=performance.now(),timeout=setTimeout(()=>{abort();},45000);
   const bars=new BarStream(allowed,event=>{flow.deliveredBars=(flow.deliveredBars||0)+1;flow.recentABC=[...(flow.recentABC||[]),event.abc].slice(-4);if(!flow.motifABC&&event.notes.some(n=>n.instrument!=='drums'))flow.motifABC=event.abc;emit({...event,elapsedMs:Math.round(performance.now()-start)});});
   const correction=flow.lastError;flow.lastError=null;this.job={bars,allowed,threadId:t.thread.id,text:'',emit,start,finish};signal.addEventListener('abort',abort,{once:true});
   const payload={...analysis,continuity:{deliveredBars:flow.deliveredBars||0,phrasePosition:(flow.deliveredBars||0)%8,recentABC:flow.recentABC||[],motifABC:flow.motifABC||null},previous:undefined,notationCorrection:correction||undefined};
   emit({type:'model-input',threadId:t.thread.id,instructions:MUSIC_INSTRUCTIONS,input:payload});
   const turnStarted=this.rpc('turn/start',{threadId:t.thread.id,effort:'low',serviceTier:'fast',input:[{type:'text',text:JSON.stringify(payload)}]});
   turnStarted.then(r=>{turnId=r.turn.id;if(!finished)this.job.turnId=turnId;}).catch(finish);
  });
 }
 close(){this.endSession(this.flow?.id);this.proc?.kill();}
}
