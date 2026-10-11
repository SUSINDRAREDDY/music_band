// YIN difference function for a dominant periodic pitch. This is not source separation.
export function periodicPitch(samples,sampleRate){
 const stride=Math.max(1,Math.floor(sampleRate/11025)),rate=sampleRate/stride;
 const x=Float64Array.from({length:Math.floor(samples.length/stride)},(_,i)=>samples[i*stride]);
 const max=Math.min(Math.floor(rate/65),Math.floor(x.length/2)),min=Math.max(2,Math.floor(rate/1200));
 const size=x.length-max;if(size<100)return {note:null,confidence:0};
 const rms=Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length);if(rms<.002)return {note:null,confidence:0};
 const diff=new Float64Array(max+1);let sum=0,chosen=0;
 for(let tau=1;tau<=max;tau++){
  let d=0;for(let i=0;i<size;i++)d+=(x[i]-x[i+tau])**2;
  sum+=d;diff[tau]=sum?d*tau/sum:1;
 }
 for(let tau=min;tau<max-1;tau++)if(diff[tau]<.15){while(tau+1<max&&diff[tau+1]<diff[tau])tau++;chosen=tau;break;}
 if(!chosen)return {note:null,confidence:0};
 const a=diff[chosen-1],b=diff[chosen],c=diff[chosen+1],den=a-2*b+c;
 const period=chosen+(den?(a-c)/(2*den):0),midi=69+12*Math.log2(rate/period/440);
 return {frequency:rate/period,cents:Math.round((midi-Math.round(midi))*100),note:Math.round(midi),confidence:+Math.max(0,1-b).toFixed(3)};
}
