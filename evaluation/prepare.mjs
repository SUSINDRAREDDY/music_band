import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '/Users/sunny/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();await page.goto('http://localhost:4318/');
for(const [name,start] of [['AcousticGuitarSample',0],['AcousticGuitarSample',15],['Blue',0],['Piano',0]]){
 const bytes=await readFile(new URL(`samples/${name}.ogg`,import.meta.url));
 const result=await page.evaluate(async({bytes,start})=>{const {wavDataUrl}=await import('/recording.mjs');const c=new AudioContext();const b=await c.decodeAudioData(Uint8Array.from(bytes).buffer);const channels=Array.from({length:b.numberOfChannels},(_,i)=>b.getChannelData(i).slice(start*b.sampleRate,(start+5)*b.sampleRate));const wav=wavDataUrl({channels,sampleRate:b.sampleRate});await c.close();return {wav,sampleRate:b.sampleRate,duration:b.duration};},{bytes:[...bytes],start});
 await writeFile(new URL(`samples/${name}-${start}.wav`,import.meta.url),Buffer.from(result.wav.split(',')[1],'base64'));console.log(name,start,result.duration);
}
await browser.close();
