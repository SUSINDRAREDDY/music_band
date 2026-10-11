// Rolling original input samples; no pitch correction, quantization or effects.
class Capture extends AudioWorkletProcessor {
 constructor(){super();this.channels=[];this.offset=0;this.filled=0;this.size=sampleRate*5;this.port.onmessage=({data})=>{if(data!=='snapshot')return;const count=this.filled;const result=this.channels.map(channel=>{const out=new Float32Array(count);const start=(this.offset-count+this.size)%this.size;for(let i=0;i<count;i++)out[i]=channel[(start+i)%this.size];return out;});this.port.postMessage({channels:result,sampleRate},result.map(x=>x.buffer));};}
 process(inputs){const input=inputs[0];if(!input?.length)return true;while(this.channels.length<input.length)this.channels.push(new Float32Array(this.size));for(let i=0;i<input[0].length;i++){for(let ch=0;ch<input.length;ch++)this.channels[ch][this.offset]=input[ch][i];this.offset=(this.offset+1)%this.size;this.filled=Math.min(this.size,this.filled+1);}return true;}
}
registerProcessor('original-input',Capture);
