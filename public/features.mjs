// Instrument-independent spectral evidence. Never rewrites the captured audio.
function fft(real,imag){const n=real.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];}}
 for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len;for(let i=0;i<n;i+=len){for(let j=0;j<len/2;j++){const c=Math.cos(angle*j),s=Math.sin(angle*j),k=i+j,l=k+len/2,tr=real[l]*c-imag[l]*s,ti=real[l]*s+imag[l]*c;real[l]=real[k]-tr;imag[l]=imag[k]-ti;real[k]+=tr;imag[k]+=ti;}}}}
export function analyseRecording({channels,sampleRate}){
 const n=8192,hop=Math.round(sampleRate*.1),length=channels[0]?.length||0,frames=[],envelope=[];let previous=null;
 for(let center=n/2;center+n/2<=length;center+=hop){const re=new Float64Array(n),im=new Float64Array(n);let energy=0;
  for(let i=0;i<n;i++){let x=0;for(const channel of channels)x+=channel[center-n/2+i]||0;x/=channels.length;energy+=x*x;re[i]=x*(.5-.5*Math.cos(2*Math.PI*i/(n-1)));}
  fft(re,im);const magnitude=Float64Array.from(re.slice(0,n/2),(_,i)=>Math.hypot(re[i],im[i]));
  let flux=0;if(previous)for(let k=1;k<magnitude.length;k++)flux+=Math.max(0,magnitude[k]-previous[k]);previous=magnitude;
  const salience=[];
  for(let midi=36;midi<=88;midi++){const f=440*2**((midi-69)/12);let score=0;
   for(let h=1;h<=4;h++){const k=Math.round(f*h*n/sampleRate);if(k+1>=magnitude.length)break;const peak=Math.max(magnitude[k-1]||0,magnitude[k],magnitude[k+1]);score+=peak/(h*h);}
   salience.push({midi,score});
  }
  // Pitch-class energy is evidence, not a forced major/minor chord label.
  const chroma=Array(12).fill(0);for(const p of salience)chroma[p.midi%12]+=p.score;const max=Math.max(...chroma,.00001);
  salience.sort((a,b)=>b.score-a.score);const strongest=salience[0].score||1;
  frames.push({seconds:+(center/sampleRate).toFixed(2),rms:+Math.sqrt(energy/n).toFixed(4),pitchClasses:chroma.map(v=>+ (v/max).toFixed(2)),peaks:salience.slice(0,5).map(p=>[p.midi,+(p.score/strongest).toFixed(2)])});envelope.push(flux);
 }
 const onsetTimes=[];
 for(let i=1;i<envelope.length-1;i++){const start=Math.max(0,i-5),local=envelope.slice(start,i+1).reduce((a,b)=>a+b,0)/(i+1-start);if(envelope[i]>local*1.4&&envelope[i]>envelope[i-1]&&envelope[i]>=envelope[i+1]&&frames[i].rms>.002)onsetTimes.push(frames[i].seconds);}
 return {durationSeconds:+(length/sampleRate).toFixed(3),source:'measured audio spectrum; peaks may include harmonics, not a transcription',pitchClassOrder:'C C# D D# E F F# G G# A A# B',onsetTimes,frames:frames.filter((_,i)=>i%2===0)};
}
