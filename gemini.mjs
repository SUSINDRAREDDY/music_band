import {BarStream} from './abc.mjs';
import {composerContext} from './context.mjs';
import {selectedInstruments} from './public/music.mjs';

export const GEMINI_MODEL='gemini-3.8-flash';
export function musicPrompt(allowed){return `Compose original supportive live accompaniment from measured spectral evidence, not audio. Peaks may be harmonics. When continueThroughPause is true and current evidence is quiet, develop the previous accompaniment smoothly through the pause; do not treat old notes as new input. Otherwise respect current evidence over previous notes; use space, voice leading and developing motifs. Only these instrument voices: ${allowed.join(', ')}.
Output ABC only. Write headers ONCE: X:1, M:4/4, L:1/8, Q:1/4=supplied BPM, K:inferred key. Then output exactly FOUR ensemble bars. For each bar, write standalone V:instrument followed by its notes for each active voice; every voice must total 8 eighth-note units including rests. End each ensemble bar with a separate %endbar line and newline. After %endbar begin the next bar with V:instrument; do not repeat headers. No prose, Markdown, blank lines, repeats, inline fields, MIDI directives, ornaments, tuplets or cross-bar ties. Chords and dynamics allowed. ABC accidentals go BEFORE notes: ^D for D-sharp, _E for E-flat, =F for F-natural. NEVER write D#, Eb, or spaces inside chords. Prefer K:C with explicit accidentals for chromatic input. Example duration patterns: C2 E2 G2 z2| or [CEG]4 z4|. Drums use explicit natural pitches =C,, (36), =D,, (38), ^F,, (42), ^A,, (46), ^C, (49). All bars are committed immediately and cannot be revised. Keep arrangement concise and musical.
The delimiter MUST be on its own line, once AFTER ALL voices in each ensemble bar, NEVER at the end of a note line or after individual voices. Here is the exact structure (replace these rest notes with your composition):
X:1
M:4/4
L:1/8
Q:1/4=100
K:C
${allowed.map(v=>`V:${v}\nz8|`).join('\n')}
%endbar
${allowed.map(v=>`V:${v}\nz8|`).join('\n')}
%endbar
Continue with two more ensemble bars, each ending in its own %endbar line.`;}

// SSE may split at any byte, line, or event boundary.
export async function readSSE(body,onEvent){
 const reader=body.getReader(),decoder=new TextDecoder();let pending='',data=[];
 function line(value){if(value===''){if(data.length){onEvent(JSON.parse(data.join('\n')));data=[];}}else if(value.startsWith('data:'))data.push(value.slice(5).trimStart());}
 try{for(;;){const {done,value}=await reader.read();pending+=done?decoder.decode():decoder.decode(value,{stream:true});let i;while((i=pending.indexOf('\n'))>=0){line(pending.slice(0,i).replace(/\r$/,''));pending=pending.slice(i+1);}if(done)break;}if(pending)line(pending.replace(/\r$/,''));line('');}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export class GeminiComposer {
 constructor({apiKey=process.env.GEMINI_API_KEY,fetchImpl=fetch}={}){this.apiKey=apiKey;this.fetch=fetchImpl;}
 async connect(){}
 close(){this.abort?.abort();}
 async compose(context,emit,signal){
  if(!this.apiKey)throw Error('Set GEMINI_API_KEY in the server environment or .env.local');
  if(this.abort)throw Error('Composer busy');
  this.abort=new AbortController();const combined=AbortSignal.any([signal,this.abort.signal,AbortSignal.timeout(45000)]),start=performance.now();
  const allowed=selectedInstruments(context.instruments);let chars=0,firstTokenMs=null,firstBarMs=null,finishReason;
  const bars=new BarStream(allowed,event=>{const elapsedMs=Math.round(performance.now()-start);firstBarMs??=elapsedMs;emit({...event,elapsedMs});});
  try{
   const response=await this.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':this.apiKey},signal:combined,body:JSON.stringify({systemInstruction:{parts:[{text:musicPrompt(allowed)}]},contents:[{role:'user',parts:[{text:JSON.stringify(composerContext(context))}]}],generationConfig:{maxOutputTokens:4096,thinkingConfig:{thinkingLevel:'low'}}})});
   // Never echo provider bodies or request headers: these can contain credentials.
   if(!response.ok){await response.body?.cancel();throw Error(`Gemini API HTTP ${response.status}${response.status===429?' — quota or rate limit':response.status===400||response.status===401||response.status===403?' — check API key, model access and request configuration':''}`);}
   await readSSE(response.body,message=>{
    if(message.error)throw Error('Gemini returned a stream error');
    if(message.promptFeedback?.blockReason)throw Error('Gemini blocked this request');
    const candidate=message.candidates?.[0];if(candidate?.finishReason)finishReason=candidate.finishReason;
    for(const part of candidate?.content?.parts||[]){if(part.thought||!part.text)continue;firstTokenMs??=Math.round(performance.now()-start);chars+=part.text.length;if(chars>24000)throw Error('ABC exceeds size limit');bars.push(part.text);}
   });
   combined.throwIfAborted();if(finishReason!=='STOP')throw Error(`Gemini response incomplete (${finishReason||'disconnected'})`);
   bars.finish();emit({type:'done',count:bars.notes.length,elapsedMs:Math.round(performance.now()-start),firstTokenMs,firstBarMs,model:GEMINI_MODEL});
  }finally{this.abort=null;}
 }
}
