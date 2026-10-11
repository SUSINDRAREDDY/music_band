import {saveRequest,saveEvents} from './diagnostics.mjs';
import http from 'node:http';
import {Composer} from './composer.mjs';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateContext} from './public/music.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const cwd=await mkdtemp(path.join(tmpdir(),'find-the-beat-'));
const port=Number(process.env.BEAT_PORT||4318),model='gpt-6.1-sol';
let active=null,saving=false;
const composer=new Composer(cwd);
composer.connect().catch(()=>{});
const env=Object.fromEntries(['PATH','HOME','CODEX_HOME','USER','TMPDIR','LANG'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const server=http.createServer(async(req,res)=>{
 try{
  if(!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host)){res.writeHead(403).end();return;}
  if(req.headers.origin&&!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(req.headers.origin)){res.writeHead(403).end();return;}
  if(req.url==='/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({model,reasoning:'low',busy:!!active}));return;}
  if(req.url==='/compose'&&req.method==='POST'){
   if(active||saving){res.writeHead(429).end('Composer busy');return;}
   let body='';for await(const chunk of req){body+=chunk;if(body.length>12000000){res.writeHead(413).end();return;}}
   if(active||saving){res.writeHead(429).end();return;}
   const context=validateContext(JSON.parse(body));
   saving=true;let saved;try{saved=await saveRequest(path.join(root,"diagnostics"),context);}finally{saving=false;}const events=[];
   res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   const emit=o=>{events.push({...o,at:new Date().toISOString()});if(!res.destroyed)res.write(JSON.stringify(o)+'\n');};
   emit({type:'diagnostic',id:saved.id});
   const abort=new AbortController();active=abort;let done=false;
   res.on('close',()=>{if(!done)abort.abort();});
   try{await composer.compose(context,emit,abort.signal);}catch(e){if(!abort.signal.aborted)emit({type:'error',message:e.message});}
   finally{events.push({type:'requestEnd',aborted:abort.signal.aborted});await saveEvents(saved.dir,events);done=true;if(active===abort)active=null;res.end();}
   return;
  }
  if(req.url==='/diagnostics'&&req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>250000){res.writeHead(413).end();return;}}
   const data=JSON.parse(body);if(!/^[a-f0-9-]{36}$/.test(data.id)||!Array.isArray(data.events)||data.events.length>500)throw Error('Invalid diagnostics');
   const dir=path.join(root,'diagnostics',data.id);await readFile(path.join(dir,'request.json'));
   await saveEvents(dir,data.events.map(event=>({type:'playback',event})));res.writeHead(204).end();return;
  }
  if(['/three/three.module.js','/three/three.core.js'].includes(req.url)){res.setHeader('Content-Type','text/javascript');res.end(await readFile(path.join(root,'node_modules/three/build',path.basename(req.url))));return;}
  const files={'/features.mjs':'features.mjs','/feature-worker.mjs':'feature-worker.mjs','/capture.mjs':'capture.mjs','/recording.mjs':'recording.mjs','/stage.mjs':'stage.mjs','/':'index.html','/app.mjs':'app.mjs','/music.mjs':'music.mjs','/audio.mjs':'audio.mjs','/style.css':'style.css'};
  const file=files[req.url];if(!file){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
  res.end(await readFile(path.join(root,'public',file)));
 }catch{if(!res.headersSent)res.writeHead(400);res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(`Find the Beat: http://localhost:${port} — ${model}, low reasoning`));
const shutdown=()=>{active?.abort();composer.close();server.close();rm(cwd,{recursive:true,force:true}).finally(()=>process.exit());};
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
