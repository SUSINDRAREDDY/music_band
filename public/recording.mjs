export function wavDataUrl({channels,sampleRate}){
 if(!channels.length||!channels[0].length)throw Error('No original audio captured yet');
 const frames=channels[0].length,count=channels.length,bytes=frames*count*4;
 const buffer=new ArrayBuffer(44+bytes),v=new DataView(buffer);
 const text=(offset,s)=>[...s].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
 text(0,'RIFF');v.setUint32(4,36+bytes,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,3,true);v.setUint16(22,count,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*count*4,true);v.setUint16(32,count*4,true);v.setUint16(34,32,true);text(36,'data');v.setUint32(40,bytes,true);
 for(let i=0;i<frames;i++)for(let ch=0;ch<count;ch++)v.setFloat32(44+(i*count+ch)*4,channels[ch][i],true);
 const a=new Uint8Array(buffer);let binary='';for(let i=0;i<a.length;i+=8192)binary+=String.fromCharCode(...a.subarray(i,i+8192));return 'data:audio/wav;base64,'+btoa(binary);
}
