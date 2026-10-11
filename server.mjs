import {saveRequest,saveEvents} from './diagnostics.mjs';
import http from 'node:http';
import {Composer} from './composer.mjs';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateContext} from './public/music.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
try{process.loadEnvFile(path.join(root,'.env.local'));}catch(e){if(e.code!=='ENOENT')throw e;}
const diagnosticsEnabled=process.env.BEAT_DIAGNOSTICS==='1';
const cwd=await mkdtemp(path.join(tmpdir(),'find-the-beat-'));
const port=Number(process.env.BEAT_PORT||4318),model='gpt-6.1-sol';
let active=null,saving=false;
const composer=new Composer(cwd);
composer.connect().catch(()=>{});
const server=http.createServer(async(req,res)=>{
 try{
  if(!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host)){res.writeHead(403).end();return;}
  if(req.headers.origin&&!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(req.headers.origin)){res.writeHead(403).end();return;}
  if(process.env.BEAT_TEST==='1'&&req.url==='/test-artifact'&&req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>30000000){res.writeHead(413).end();return;}}
   const {name,data}=JSON.parse(body);if(!['test-input.wav','test-mix.webm','test-trace.json'].includes(name))throw Error('Invalid artifact');
   await mkdir(path.join(root,'evaluation','one-minute'),{recursive:true});await writeFile(path.join(root,'evaluation','one-minute',name),Buffer.from(data,'base64'));res.writeHead(204).end();return;
  }
  if(process.env.BEAT_TEST==='1'&&req.url==='/one-minute-test'){res.setHeader('Content-Type','text/html');res.end(await readFile(path.join(root,'evaluation','one-minute-test.html')));return;}
  if(req.url==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({model,provider:'Codex',diagnostics:diagnosticsEnabled,reasoning:'low',serviceTier:'fast',busy:!!active}));return;}
  if(['/session/start','/session/stop'].includes(req.url)&&req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>200){res.writeHead(413).end();return;}}
   const {sessionId}=JSON.parse(body);if(typeof sessionId!=='string'||!/^[a-f0-9-]{36}$/.test(sessionId))throw Error('Invalid session');
   if(req.url==='/session/stop'){if(composer.flow?.id===sessionId){active?.abort();composer.endSession(sessionId);}res.writeHead(204).end();return;}
   if(composer.flow&&composer.flow.id!==sessionId){res.writeHead(409).end('Another listening session is active');return;}
   await composer.startSession(sessionId);res.writeHead(204).end();return;
  }
  if(req.url==='/compose'&&req.method==='POST'){
   if(active||saving){res.writeHead(429).end('Composer busy');return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>12000000){res.writeHead(413).end();return;}}
   if(active||saving){res.writeHead(429).end();return;}
   const context=validateContext(JSON.parse(body));
   if(!context.sessionId||composer.flow?.id!==context.sessionId){res.writeHead(409).end('Listening session expired');return;}
   saving=true;let saved;try{if(diagnosticsEnabled)saved=await saveRequest(path.join(root,"diagnostics"),context);}finally{saving=false;}const events=[];
   res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   const emit=o=>{if(saved)events.push({...o,at:new Date().toISOString()});if(!res.destroyed)res.write(JSON.stringify(o)+'\n');};
   if(saved)emit({type:'diagnostic',id:saved.id});
   const abort=new AbortController();active=abort;let done=false;
   res.on('close',()=>{if(!done)abort.abort();});
   try{await composer.compose(context,emit,abort.signal);}catch(e){if(!abort.signal.aborted)emit({type:'error',message:e.message});}
   finally{done=true;if(active===abort)active=null;res.end();if(saved){events.push({type:'requestEnd',aborted:abort.signal.aborted});await saveEvents(saved.dir,events);}}
   return;
  }
  if(req.url==='/diagnostics'&&req.method==='POST'){
   if(!diagnosticsEnabled){res.writeHead(204).end();return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>250000){res.writeHead(413).end();return;}}
   const data=JSON.parse(body);if(!/^[a-f0-9-]{36}$/.test(data.id)||!Array.isArray(data.events)||data.events.length>500)throw Error('Invalid diagnostics');
   const dir=path.join(root,'diagnostics',data.id);await readFile(path.join(dir,'request.json'));
   await saveEvents(dir,data.events.map(event=>({type:'playback',event})));res.writeHead(204).end();return;
  }
  if(['/three/three.module.js','/three/three.core.js'].includes(req.url)){res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.join(root,'node_modules/three/build',path.basename(req.url))));return;}
  if(req.url==='/abcjs.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.join(root,'node_modules/abcjs/dist/abcjs-basic-min.js')));return;}
  if(req.url.startsWith('/assets/')||req.url.startsWith('/vendor/')){
   const relative=decodeURIComponent(req.url.split('?')[0]).slice(1),asset=path.resolve(root,'public',relative),allowed=path.resolve(root,'public',relative.startsWith('assets/')?'assets':'vendor')+path.sep;
   if(!asset.startsWith(allowed)){res.writeHead(403).end();return;}
   const types={'.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mjs':'text/javascript','.json':'application/json','.txt':'text/plain'};
   if(!types[path.extname(asset)]){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(asset)]);res.setHeader('Cache-Control','no-cache');res.end(await readFile(asset));return;
  }
  const files={'/sustain.mjs':'sustain.mjs','/transcribe.mjs':'transcribe.mjs','/pitch.mjs':'pitch.mjs','/lookahead.mjs':'lookahead.mjs','/stage.mjs':'stage.mjs','/boot.mjs':'boot.mjs','/features.mjs':'features.mjs','/feature-worker.mjs':'feature-worker.mjs','/capture.mjs':'capture.mjs','/recording.mjs':'recording.mjs','/score.mjs':'score.mjs','/':'index.html','/app.mjs':'app.mjs','/music.mjs':'music.mjs','/audio.mjs':'audio.mjs','/style.css':'style.css'};
  res.setHeader('Cache-Control','no-store');
  const file=files[req.url];if(!file){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(await readFile(path.join(root,'public',file)));
 }catch{if(!res.headersSent)res.writeHead(400);res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(`Find the Beat: http://localhost:${port} — ${model}, low reasoning`));
const shutdown=()=>{active?.abort();composer.close();server.close();rm(cwd,{recursive:true,force:true}).finally(()=>process.exit());};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
