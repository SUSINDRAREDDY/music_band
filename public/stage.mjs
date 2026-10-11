import * as T from '/three/three.module.js';
const host=document.getElementById('stage'),state=document.getElementById('stageState');
let clearVisual=()=>{};
let incoming=[],preview=false,enabled=true,visible=true,frame=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
export function stageNote(note,delay=0){if(preview){preview=false;const button=document.getElementById('stagePreview');button.setAttribute('aria-pressed','false');button.textContent='Preview characters';}incoming.push({...note,at:performance.now()+Math.max(0,delay)*1000});if(incoming.length>300)incoming.shift();}
export function resetStage(){incoming=[];preview=false;document.getElementById('stagePreview').setAttribute('aria-pressed','false');document.getElementById('stagePreview').textContent='Preview characters';clearVisual();}
try {init();}catch(error){state.textContent='3D unavailable · audio still works';host.classList.add('unavailable');console.warn('Stage unavailable',error);}
function init(){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
 host.prepend(renderer.domElement);renderer.domElement.setAttribute('aria-label','Interactive 3D studio with a ceramic robot drummer and keyboard player');renderer.domElement.setAttribute('role','img');
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(35,1,.1,80);scene.fog=new T.FogExp2('#151b20',.023);
 const mat=(color,metalness=0,roughness=.5)=>new T.MeshStandardMaterial({color,metalness,roughness});
 const cream=mat('#dfd4b5',.12,.32),dark=mat('#20272d',.45,.34),chrome=mat('#b5c5ce',.8,.24),gold=mat('#c59a53',.7,.3),teal=mat('#639b96',.25,.38),coral=mat('#c4775e',.25,.38),wood=mat('#764d38',.1,.5),black=mat('#101b22',.15,.4);
 const glow=new T.MeshStandardMaterial({color:'#adf9df',emissive:'#7af3ce',emissiveIntensity:2});
 const mesh=(g,m,parent,x=0,y=0,z=0)=>{const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
 const box=(w,h,d,m,p,x=0,y=0,z=0)=>mesh(new T.BoxGeometry(w,h,d),m,p,x,y,z);
 const ball=(r,m,p,x=0,y=0,z=0)=>mesh(new T.SphereGeometry(r,24,16),m,p,x,y,z);
 const cyl=(r,h,m,p,x=0,y=0,z=0,r2=r)=>mesh(new T.CylinderGeometry(r,r2,h,40),m,p,x,y,z);
 const rod=(a,b,r,m,p)=>{const va=new T.Vector3(...a),vb=new T.Vector3(...b),o=cyl(r,va.distanceTo(vb),m,p);o.position.copy(va.clone().add(vb).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),vb.sub(va).normalize());return o;};
 function ring(r,m,p,y){const o=mesh(new T.TorusGeometry(r,.015,8,100),m,p,0,y,0);o.rotation.x=Math.PI/2;return o;}
 const world=new T.Group();scene.add(world);
 // Raised, turned-wood listening-room plinth, with concentric brass inlay.
 cyl(4.9,.22,wood,world,0,-.2,0);cyl(4.86,.035,mat('#303937',.12,.7),world,0,-.07,0);ring(4.75,gold,world,-.044);ring(4.62,gold,world,-.044);
 for(let i=-7;i<=7;i++){const z=i*.58,len=2*Math.sqrt(Math.max(0,4.55**2-z*z));box(len,.004,.012,dark,world,0,-.048,z);}
 const floor=mesh(new T.PlaneGeometry(200,200),mat('#171e22',.05,.9),scene,0,-.34,0);floor.rotation.x=-Math.PI/2;
 const arch=new T.Group();world.add(arch);arch.position.set(0,0,-2.5);
 const archMat=mat('#3c514f',.5,.4);
 for(const r of [4.1,3.86]){const o=mesh(new T.TorusGeometry(r,.035,10,100,Math.PI),archMat,arch,0,.12,0);}
 for(let i=0;i<19;i++){const x=(i-9)*.37;box(.12,.65+Math.cos(i*.7)*.25,.12,wood,arch,x,.55,-.25);}
 function label(text,parent,x,y,z,size=.75){const c=document.createElement('canvas');c.width=512;c.height=128;const q=c.getContext('2d');q.fillStyle='#dce9de';q.font='500 42px sans-serif';q.textAlign='center';q.fillText(text,256,76);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const o=mesh(new T.PlaneGeometry(size*3,size*.75),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false}),parent,x,y,z);return o;}
 label('THE LISTENING ROOM',arch,0,3.22,0,1.1);
 function robot(parent,color){
  const r=new T.Group();parent.add(r);
  // Rounded ceramic shell, luminous visor, headphones and articulated limbs.
  const torso=ball(.39,color,r,0,1.18,0);torso.scale.set(.9,1.05,.68);
  cyl(.105,.19,chrome,r,0,1.59,0);
  const head=new T.Group();head.position.set(0,1.9,0);r.add(head);const shell=ball(.38,cream,head);shell.scale.set(1,.91,.87);
  const face=ball(.31,black,head,0,-.015,.17);face.scale.set(1,.7,.6);
  for(const x of [-.115,.115]){const eye=box(.067,.025,.018,glow,head,x,.015,.357);eye.rotation.z=x<0?-.08:.08;}
  const smile=mesh(new T.TorusGeometry(.065,.009,6,20,Math.PI),gold,head,0,-.075,.351);smile.rotation.z=Math.PI;
  for(const x of [-.38,.38]){const ear=cyl(.12,.11,dark,head,x,0,0);ear.rotation.z=Math.PI/2;}
  const phones=mesh(new T.TorusGeometry(.4,.035,10,40,Math.PI),dark,head);phones.rotation.z=0;
  const arms=[];
  for(const x of [-.36,.36]){ball(.09,chrome,r,x,1.38,0);const arm=new T.Group();arm.position.set(x,1.38,0);r.add(arm);rod([0,0,0],[x*.22,-.27,.22],.072,color,arm);ball(.08,chrome,arm,x*.22,-.27,.22);rod([x*.22,-.27,.22],[x*.35,-.28,.52],.06,cream,arm);ball(.085,cream,arm,x*.35,-.28,.52);arms.push(arm);
   rod([x*.6,.95,0],[x*.8,.59,.23],.095,dark,r);rod([x*.8,.59,.23],[x*.8,.2,.31],.08,color,r);const shoe=ball(.13,black,r,x*.8,.17,.4);shoe.scale.set(1,.65,1.6);
  }
  cyl(.31,.12,dark,r,0,.85,-.05);cyl(.045,.7,chrome,r,0,.43,-.05);cyl(.27,.04,dark,r,0,.08,-.05);
  box(.14,.07,.03,gold,r,0,1.28,.27);
  return {root:r,head,arms,pulse:0,last:0};
 }
 const drumGroup=new T.Group();world.add(drumGroup);drumGroup.position.set(-1.9,0,.15);drumGroup.rotation.y=.12;
 const drummer=robot(drumGroup,teal);drummer.root.position.z=-.48;
 drumGroup.scale.setScalar(1.16);
 const keyboardGroup=new T.Group();world.add(keyboardGroup);keyboardGroup.position.set(1.7,0,.1);keyboardGroup.rotation.y=-.22;
 keyboardGroup.scale.setScalar(1.16);
 const pianist=robot(keyboardGroup,coral);pianist.root.position.z=-.35;
 const kick=new T.Group();drumGroup.add(kick);kick.position.set(0,.48,.74);kick.rotation.x=Math.PI/2;
 cyl(.45,.52,teal,kick);cyl(.465,.035,chrome,kick,0,.28,0);cyl(.42,.012,cream,kick,0,.302,0);cyl(.465,.035,chrome,kick,0,-.28,0);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;rod([Math.sin(a)*.44,-.26,Math.cos(a)*.44],[Math.sin(a)*.44,.26,Math.cos(a)*.44],.016,chrome,kick);}
 label('f / b',drumGroup,0,.48,1.052,.22);
 const drumParts=new Map();
 function drum(x,y,z,r){const group=new T.Group();group.position.set(x,y,z);drumGroup.add(group);cyl(r,.22,teal,group);cyl(r+.018,.027,chrome,group,0,.12);const skin=cyl(r-.016,.012,cream,group,0,.137);cyl(.018,y-.13,chrome,group,0,-y/2-.06);return group;}
 drumParts.set(38,drum(-.54,.81,.48,.25));drum(.05,1.02,.39,.235);drum(.58,.56,.55,.3);
 function cymbal(x,y,z,r){cyl(.018,y,chrome,drumGroup,x,y/2,z);for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rod([x,.22,z],[x+Math.cos(a)*.26,.05,z+Math.sin(a)*.26],.014,chrome,drumGroup);}const pivot=new T.Group();pivot.position.set(x,y,z);drumGroup.add(pivot);cyl(r,.022,gold,pivot,0,0,0,r*.97);const dome=ball(r*.2,gold,pivot,0,.012,0);dome.scale.y=.25;cyl(.027,.09,dark,pivot,0,.04,0);return pivot;}
 drumParts.set(42,cymbal(-.87,1.1,.5,.29));drumParts.set(46,drumParts.get(42));drumParts.set(49,cymbal(.78,1.5,.16,.39));
 drummer.arms.forEach((arm,i)=>{rod([i? .126:-.126,-.28,.52],[i?.07:-.07,-.18,.99],.013,wood,arm);});
 const keyboard=box(1.88,.19,.64,dark,keyboardGroup,0,1.02,.53);box(1.9,.09,.68,wood,keyboardGroup,0,1.11,.53);
 for(const x of [-.72,.72]){rod([x,.95,.4],[-x,.08,.6],.028,chrome,keyboardGroup);}
 const keys=[];
 for(let i=0;i<21;i++){const x=(i-10)*.081;const key=box(.077,.055,.36,cream,keyboardGroup,x,1.175,.67);keys.push(key);if(![2,6].includes(i%7)&&i<20)box(.044,.045,.21,black,keyboardGroup,x+.041,1.217,.57);}
 for(let i=0;i<5;i++)cyl(.025,.026,i===0?glow:chrome,keyboardGroup,-.68+i*.13,1.19,.3);
 label('M O O N  /  7 3',keyboardGroup,0,1.025,.858,.19);
 for(const [x,z] of [[-3.3,-1],[3.35,-1]]){box(.46,.78,.43,black,world,x,.36,z);for(const y of [.2,.53]){const cone=cyl(.145,.02,dark,world,x,y,z+.23);cone.rotation.x=Math.PI/2;}}
 scene.add(new T.HemisphereLight('#cceae6','#463429',2.1));
 const light=(color,intensity,x,y,z)=>{const l=new T.SpotLight(color,intensity,35,.6,.8,1.2);l.position.set(x,y,z);l.target.position.set(x*.3,.4,0);scene.add(l,l.target);return l;};
 const keyLight=light('#ffddad',95,-3,7,4);keyLight.castShadow=true;keyLight.shadow.mapSize.set(1024,1024);keyLight.shadow.bias=-.001;
 light('#99dacc',70,4,5,-2);light('#e8a483',45,-4,3,-2);
 const dust=new T.BufferGeometry(),points=new Float32Array(150*3);for(let i=0;i<150;i++){points[i*3]=(Math.random()-.5)*12;points[i*3+1]=Math.random()*5;points[i*3+2]=(Math.random()-.5)*7;}dust.setAttribute('position',new T.BufferAttribute(points,3));const motes=new T.Points(dust,new T.PointsMaterial({color:'#e3c8a0',size:.018,transparent:true,opacity:.45}));scene.add(motes);
 let pointer=0,lastTime=0,lastPreview=0,previewIndex=0,activeUntil=0;
 clearVisual=()=>{activeUntil=0;for(const player of [drummer,pianist]){player.last=-10000;player.pulse=0;player.arms.forEach(a=>{a.userData.hit=-10000;a.rotation.x=0;});}for(const k of keys){k.userData.hit=-10000;k.position.y=1.175;}};
 const resize=()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();camera.position.set(0,w<600?7.8:5.5,w<600?15.5:12);camera.lookAt(0,1.05,0);};new ResizeObserver(resize).observe(host);resize();
 host.addEventListener('pointermove',e=>{pointer=(e.clientX-host.getBoundingClientRect().left)/host.clientWidth-.5;});host.addEventListener('pointerleave',()=>pointer=0);
 new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;}).observe(host);
 const previewButton=document.getElementById('stagePreview'),motionButton=document.getElementById('stageMotion');
 previewButton.onclick=()=>{preview=!preview;previewButton.setAttribute('aria-pressed',String(preview));previewButton.textContent=preview?'Stop preview':'Preview characters';if(!preview)clearVisual();};
 motionButton.onclick=()=>{enabled=!enabled;motionButton.setAttribute('aria-pressed',String(!enabled));motionButton.textContent=enabled?'Pause motion':'Resume motion';};
 function strike(n,now){
  const isDrum=n.instrument==='drums',isKeys=['piano','keys','organ'].includes(n.instrument);if(!isDrum&&!isKeys)return;
  const player=isDrum?drummer:pianist;player.pulse=Math.max(player.pulse,n.velocity);player.last=now;activeUntil=now+1800;
  if(isDrum){const part=drumParts.get(n.note);if(part)part.userData.hit=now;drummer.arms[n.note===38?0:1].userData.hit=now;if(n.note===36)kick.userData.hit=now;}
  else {keys[((n.note-48)%21+21)%21].userData.hit=now;pianist.arms[n.note<64?0:1].userData.hit=now;}
 }
 function render(now){frame=requestAnimationFrame(render);if(now-lastTime<1000/30||!visible||document.hidden)return;const dt=Math.min(.1,(now-lastTime)/1000);lastTime=now;
  if(preview&&now-lastPreview>330){lastPreview=now;const i=previewIndex++;strike({instrument:i%2?'keys':'drums',note:i%2?48+(i*7)%28:[36,42,38,49][Math.floor(i/2)%4],velocity:.65},now);}
  incoming=incoming.filter(n=>{if(n.at<=now){if(now-n.at<500)strike(n,now);return false;}return true;});
  state.textContent=preview?'VISUAL PREVIEW · SILENT':now<activeUntil?'FOLLOWING LIVE NOTES':'THE BAND IS READY';
  for(const [player,id] of [[drummer,'drummerState'],[pianist,'pianistState']]){
   const active=now-player.last<1400;document.getElementById(id).textContent=active?'Playing':'Standing by';
   player.pulse*=Math.exp(-dt*7);
   if(enabled&&!reduced.matches){player.head.rotation.z=Math.sin(now*.0018)*(active?.06:.022);player.head.position.y=1.9+Math.sin(now*.002)*.012+player.pulse*.025;player.root.rotation.z=Math.sin(now*.0022)*player.pulse*.025;
    player.arms.forEach(arm=>{const age=(now-(arm.userData.hit||-10000))/1000;arm.rotation.x=age<.3?-.38*Math.sin(age/.3*Math.PI):0;});
   }
  }
  if(enabled&&!reduced.matches){for(const part of new Set(drumParts.values())){const age=(now-(part.userData.hit||-10000))/1000;part.rotation.z=age<.8?Math.sin(age*45)*.045*Math.exp(-age*5):0;}const age=(now-(kick.userData.hit||-10000))/1000;kick.scale.setScalar(1+(age<.2?.025*Math.sin(age/.2*Math.PI):0));for(const k of keys){const a=now-(k.userData.hit||-10000);k.position.y=1.175-(a<220?.022*Math.sin(a/220*Math.PI):0);}world.rotation.y+=(pointer*.11-world.rotation.y)*.035;motes.rotation.y=now*.000008;}
  renderer.render(scene,camera);
 }
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);state.textContent='3D paused · refresh to restore';});
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);renderer.dispose();});requestAnimationFrame(render);
}
