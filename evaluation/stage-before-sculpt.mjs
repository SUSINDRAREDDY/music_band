import * as T from '/three/three.module.js';
const colors=[0xb17d4c,0x637968,0x9c7056,0x63747b,0x8d786b];
export function createStage(host,{clock,onSelect}){
 const renderer=new T.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;host.append(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color(0x171c18);scene.fog=new T.Fog(0x171c18,15,32);const camera=new T.PerspectiveCamera(36,1,.1,100);camera.position.set(0,3.8,10);camera.lookAt(0,1,0);
 scene.add(new T.HemisphereLight(0xd9debf,0x24271e,1.1));const light=new T.DirectionalLight(0xffdfac,3);light.position.set(-3,7,5);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-9,right:9,top:8,bottom:-8});light.shadow.bias=-.0003;light.shadow.normalBias=.025;scene.add(light);
 const fill=new T.DirectionalLight(0xa9c2b4,1.3);fill.position.set(5,3,0);scene.add(fill);const rim=new T.DirectionalLight(0xf5be76,2);rim.position.set(-2,5,-4);scene.add(rim);
 const materials=new Map();function mat(c){if(!materials.has(c))materials.set(c,new T.MeshStandardMaterial({color:c,roughness:[0xc6c4af,0xb9beb4,0xc9c9bd,0x7a8580].includes(c)?.27:.72,metalness:[0xc6c4af,0xb9beb4,0xc9c9bd,0xcba652,0x7a8580].includes(c)?.7:.05}));return materials.get(c);}
 function mesh(parent,geometry,color,x=0,y=0,z=0){const m=new T.Mesh(geometry,mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 function ball(p,c,x,y,z,sx,sy=sx,sz=sx){const m=mesh(p,new T.SphereGeometry(1,20,14),c,x,y,z);m.scale.set(sx,sy,sz);return m;}
 function box(p,c,x,y,z,w,h,d){return mesh(p,new T.BoxGeometry(w,h,d),c,x,y,z);}
 function rod(p,c,a,b,r=.05){const v=new T.Vector3(...a),w=new T.Vector3(...b);const m=mesh(p,new T.CylinderGeometry(r,r,v.distanceTo(w),12),c);m.position.copy(v).add(w).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),w.sub(v).normalize());return m;}
 // A real stage: timber, velvet folds, brass hardware and practical lighting.
 const floorCanvas=document.createElement('canvas');floorCanvas.width=1024;floorCanvas.height=1024;const fp=floorCanvas.getContext('2d');fp.fillStyle='#59432e';fp.fillRect(0,0,1024,1024);let seed=142;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
 for(let i=0;i<24;i++){fp.fillStyle=`hsl(26 20% ${20+random()*8}%)`;fp.fillRect(i*43,0,42,1024);for(let j=0;j<30;j++){fp.strokeStyle=`rgba(17,12,6,${random()*.18})`;fp.beginPath();fp.moveTo(i*43+random()*42,0);fp.bezierCurveTo(i*43+random()*42,300,i*43+random()*42,700,i*43+random()*42,1024);fp.stroke();}for(let z=0;z<3;z++){fp.fillStyle='#2a231b';fp.fillRect(i*43,random()*1024,42,1);}}
 const floorTexture=new T.CanvasTexture(floorCanvas);floorTexture.colorSpace=T.SRGBColorSpace;
 const platform=mesh(scene,new T.CylinderGeometry(6.7,6.9,.28,96),0x2a3026,0,-.17,0);platform.scale.z=.65;
 const floor=mesh(scene,new T.CylinderGeometry(6.68,6.68,.035,96),0x62482f,0,-.01,0);floor.scale.z=.65;floor.material=new T.MeshStandardMaterial({map:floorTexture,roughness:.72});
 const trim=mesh(scene,new T.TorusGeometry(6.76,.025,8,128),0x85734f,0,-.17,0);trim.rotation.x=Math.PI/2;trim.scale.y=.65;
 box(scene,0x191f19,0,-.43,0,80,.15,80);
 box(scene,0x202a21,0,2.9,-4.2,20,7,.2);
 for(let i=0;i<83;i++){const fold=mesh(scene,new T.CylinderGeometry(.17,.19,6.5,12),i%2?0x253125:0x2c3829,-10+i*.245,2.9,-4.0);fold.scale.z=.65;}
 for(const x of [-6.1,6.1]){box(scene,0x171d17,x,2,-3.4,.75,4.3,.3);for(let j=0;j<7;j++)box(scene,0x384333,x-.27+j*.09,2,-3.2,.025,4,.04);}
 const signCanvas=document.createElement('canvas');signCanvas.width=1024;signCanvas.height=256;const sp=signCanvas.getContext('2d');sp.textAlign='center';sp.fillStyle='#b0b79b';sp.font='28px Arial';sp.fillText('T H E   L I S T E N I N G   R O O M',512,115);sp.fillStyle='#75816a';sp.font='13px Arial';sp.fillText('F I N D   T H E   B E A T     /     S T U D I O   0 1',512,159);const signTexture=new T.CanvasTexture(signCanvas);signTexture.colorSpace=T.SRGBColorSpace;const sign=new T.Mesh(new T.PlaneGeometry(5.2,1.3),new T.MeshBasicMaterial({map:signTexture,transparent:true,opacity:.8}));sign.position.set(0,3.4,-3.78);scene.add(sign);
 for(const x of [-4.8,-2.4,2.4,4.8]){rod(scene,0x414638,[x,5,-3],[x,4.7,-2.8],.04);const fixture=mesh(scene,new T.CylinderGeometry(.17,.22,.4,20),0x171a16,x,4.65,-2.7);fixture.rotation.x=.5;const glow=mesh(scene,new T.CircleGeometry(.16,24),0xf9db9b,x,4.46,-2.6);glow.material=new T.MeshBasicMaterial({color:0xffe4ac});glow.rotation.x=-Math.PI/2+.5;const spot=new T.SpotLight(0xffd49a,22,12,.46,.7,1.5);spot.position.set(x,4.5,-2.5);spot.target.position.set(x*.65,0,.3);scene.add(spot,spot.target);}
 for(const x of [-5.15,5.15]){box(scene,0x242921,x,.65,-1.1,.85,1.3,.55);box(scene,0x3a4033,x,.65,-.805,.74,1.16,.025);for(const y of [.4,.9]){ball(scene,0x111710,x,y,-.77,.23,.23,.025);const rim=mesh(scene,new T.TorusGeometry(.23,.012,8,32),0x6c745d,x,y,-.74);}for(let j=0;j<5;j++)ball(scene,0xb0ac84,x-.25+j*.12,1.23,-.79,.016);box(scene,0x9e9877,x,1.08,-.77,.2,.045,.01);}
 for(const x of [-3.6,3.6]){const monitor=box(scene,0x252c23,x,.16,2.15,.75,.32,.45);monitor.rotation.x=-.2;box(scene,0x434c39,x,.34,2.16,.6,.02,.31);}
 for(let i=0;i<4;i++){const points=[];for(let j=0;j<30;j++)points.push(new T.Vector3(-3+i*1.9+Math.sin(j*.3+i)*.25,.026,-.2+j*.085));const cable=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),48,.012,6,false),mat(0x161b14));scene.add(cable);}
 function segment(m,a,b){m.position.copy(a).add(b).multiplyScalar(.5);m.scale.y=a.distanceTo(b);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.clone().sub(a).normalize());}
 const actors=new Map(),events=[];let viewMode=0,orbit=0,elevation=0,zoom=1,dragStart=null,dragged=false,selectedName=null;const aim=new T.Vector3(0,1,0);let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const names=['pluck','keys','drums','bass','piano','strings','organ','vibes','flute','lead'];
 for(const [index,name] of names.entries()){
  const root=new T.Group();scene.add(root);root.userData.instrument=name;
  const body=new T.Group();root.add(body);const skin=[0xdca57c,0x946343,0xe3b490,0x664b39][index%4],shirt=colors[index%5];
  ball(body,shirt,0,.99,0,.29,.43,.21);rod(body,skin,[0,1.28,0],[0,1.5,0],.09);for(const x of [-.17,.17]){rod(body,0x536275,[x,.7,0],[x,.2,.06],.105);ball(body,0xeee4ce,x,.12,.14,.14,.09,.23);}
  const head=new T.Group();head.position.y=1.65;body.add(head);ball(head,skin,0,0,0,.265,.32,.255);ball(head,0x302820,0,.18,-.07,.27,.19,.24);
  for(const x of [-.105,.105]){ball(head,0x343534,x,.025,.239,.026,.034,.018);ball(head,0xf8efe2,x+.008,.036,.253,.007);ball(head,0xd79482,x,-.085,.225,.048,.018,.012);ball(head,skin,x*2.7,0,0,.05,.075,.055);}
  ball(head,skin,0,-.035,.26,.042,.055,.04);const mouth=box(head,0x86564c,0,-.145,.233,.065,.012,.012);mouth.rotation.z=.08;
  // Sculpted hair, eyebrows, jacket seams, pockets, buttons and shoe soles.
  for(let h=0;h<9;h++){const angle=h/9*Math.PI*2;ball(head,index%2?0x493c35:0x684a32,Math.cos(angle)*.20,.23+Math.sin(h*2)*.035,Math.sin(angle)*.16-.035,.09,.085,.09);}
  for(const x of [-.105,.105]){const brow=box(head,0x544238,x,.11,.239,.065,.013,.012);brow.rotation.z=x>0?-.1:.1;}
  if(index%3===0){for(const x of [-.105,.105]){const lens=mesh(head,new T.TorusGeometry(.066,.009,8,24),0x514e45,x,.03,.271);}rod(head,0x514e45,[-.039,.04,.27],[.039,.04,.27],.008);}
  if(index===0){const brim=mesh(head,new T.CylinderGeometry(.28,.28,.025,32),0x9a8156,0,.22,.015);const crown=mesh(head,new T.CylinderGeometry(.19,.22,.16,32),0xa38a5d,0,.3,-.025);mesh(head,new T.CylinderGeometry(.221,.221,.035,32),0x4d4934,0,.24,-.025);}
  if(index===1||index===3){for(let h=0;h<25;h++){const a=h*2.4;ball(head,0x302b23,Math.cos(a)*(.17+(h%3)*.025),.19+(h%4)*.03,Math.sin(a)*.18-.04,.065);}}
  if(index===2){const cap=ball(head,0x797655,0,.22,-.015,.28,.14,.25);const brim=box(head,0x797655,0,.21,.24,.33,.035,.22);brim.rotation.x=.05;}
  if(index===4||index===8){ball(head,0x463a28,0,.25,-.20,.14);for(const x of [-.23,.23])rod(head,0x463a28,[x,.12,-.04],[x,-.18,-.03],.07);}
  if(index===1||index===2){const arch=mesh(head,new T.TorusGeometry(.3,.024,10,32,Math.PI),0x252a24);arch.position.y=.04;for(const x of [-.29,.29])ball(head,0x252a24,x,.025,0,.065,.09,.07);}
  for(const x of [-.19,.19]){rod(body,index%2?0x495f51:0x8b6546,[x,1.24,.17],[x,.73,.18],.022);box(body,shirt,x,1.08,.20,.105,.09,.02);box(body,0x8b8b71,x,1.13,.215,.1,.008,.008);}
  for(let j=0;j<3;j++)ball(body,0xeee1c5,0,1.16-j*.12,.235,.018);
  box(body,0xe9d4b0,-.16,1.07,.219,.1,.1,.018);rod(body,0xe2c4a4,[-.12,1.29,.13],[0,1.18,.24],.025);rod(body,0xe2c4a4,[.12,1.29,.13],[0,1.18,.24],.025);
  const feet=[];for(const x of [-.17,.17]){feet.push(box(body,0xd8cfbb,x,.065,.14,.26,.04,.38));for(let j=0;j<3;j++)box(body,0x726e64,x,.185,.14+j*.035,.09,.008,.01);}
  const hands=[ball(body,skin,-.35,.95,.37,.085),ball(body,skin,.35,.95,.37,.085)];const arms=[rod(body,shirt,[-.27,1.15,0],[-.35,.95,.37],.095),rod(body,shirt,[.27,1.15,0],[.35,.95,.37],.095)];
  const instrument=new T.Group();body.add(instrument);const keys=[],cymbals=[],fingerTips=[];const forearms=[rod(body,skin,[0,0,0],[0,1,0],.055),rod(body,skin,[0,0,0],[0,1,0],.055)];for(const hand of hands){const fingers=[];for(let f=0;f<4;f++)fingers.push(ball(body,skin,0,0,0,.019,.045,.02));fingerTips.push(fingers);}const targets=[new T.Vector3(-.35,.95,.37),new T.Vector3(.35,.95,.37)],sticks=[];
  if(['pluck','bass'].includes(name)){
   if(name==='bass'){ball(instrument,0x6b8170,.08,.82,.35,.24,.28,.08);ball(instrument,0x6b8170,-.06,1.02,.35,.12,.20,.075);ball(instrument,0x6b8170,.23,.96,.35,.11,.16,.075);box(instrument,0x303b30,.08,.88,.44,.17,.045,.025);box(instrument,0x303b30,.08,.78,.44,.17,.035,.025);for(const x of [.22,.26])ball(instrument,0xc6c4af,x,.71,.44,.018);}else{ball(instrument,0xb77343,.08,.85,.35,.29,.36,.095);ball(instrument,0x503e30,.04,.94,.455,.085,.085,.01);}rod(instrument,0x8b603f,[-.05,.98,.38],[-.57,1.48,.38],.058);
   for(let i=0;i<4;i++)rod(instrument,0xe7d7ad,[.13+i*.009,.64,.46],[-.58+i*.009,1.49,.445],.003);
   box(instrument,0x46372d,.12,.68,.46,.16,.045,.025);
   for(let f=1;f<=12;f++){const t=1-2**(-f/12),x=-.57+t*.52,y=1.48-t*.5;rod(instrument,0xc7bfa7,[x-.025,y-.025,.449],[x+.035,y+.035,.449],.005);if([3,5,7,9,12].includes(f))ball(instrument,0xf4e6c5,x,y,.457,.008);}
   for(let peg=0;peg<6;peg++){const y=1.47+peg*.026;ball(instrument,0xc6c4af,-.61+(peg%2)*.1,y,.4,.026,.013,.017);}
   rod(body,0x574739,[-.22,1.28,-.08],[.28,.72,.2],.035);
   targets[0].set(-.43,1.33,.45);targets[1].set(.12,.91,.48);
   if(name==='strings')sticks.push(rod(body,0xe1c395,[-.3,.8,.55],[.5,1.25,.55],.016));
  }else if(name==='strings'){
   ball(instrument,0x9b5e31,-.07,1.30,.32,.14,.19,.055);ball(instrument,0x9b5e31,-.07,1.48,.32,.115,.14,.055);box(instrument,0x332b20,-.07,1.35,.386,.06,.23,.015);rod(instrument,0x4b3826,[-.07,1.52,.33],[-.38,1.77,.33],.035);for(let j=0;j<4;j++)rod(instrument,0xd0c8a9,[-.09+j*.012,1.17,.387],[-.39+j*.012,1.78,.37],.002);targets[0].set(-.28,1.69,.39);targets[1].set(.28,1.35,.48);sticks.push(rod(body,0xe1c395,[-.3,1.35,.44],[.5,1.45,.44],.012));
  }else if(name==='drums'){
   for(const [x,y,z,r] of [[0,.4,.65,.38],[-.47,.8,.35,.23],[.47,.9,.35,.22]]){mesh(instrument,new T.CylinderGeometry(r,r,.3,24),0x9b6354,x,y,z);mesh(instrument,new T.CylinderGeometry(r*.95,r*.95,.025,24),0xe8ddc7,x,y+.16,z);}
   for(const x of [-.7,.7]){rod(instrument,0x7a8580,[x,0,.25],[x,1.3,.25],.025);cymbals.push(mesh(instrument,new T.CylinderGeometry(.3,.3,.025,32),0xcba652,x,1.3,.25));ball(instrument,0xb08b43,x,1.32,.25,.065,.035,.065);for(let leg=0;leg<3;leg++){const a=leg*Math.PI*2/3;rod(instrument,0x7a8580,[x,.25,.25],[x+Math.cos(a)*.22,0,.25+Math.sin(a)*.22],.016);}}
   for(const [x,y,z,r] of [[0,.4,.65,.38],[-.47,.8,.35,.23],[.47,.9,.35,.22]]){for(const dy of [-.15,.15]){const rim=mesh(instrument,new T.TorusGeometry(r,.018,8,32),0xb9beb4,x,y+dy,z);rim.rotation.x=Math.PI/2;}for(let lug=0;lug<6;lug++){const a=lug*Math.PI/3;rod(instrument,0xb9beb4,[x+Math.cos(a)*r,y-.12,z+Math.sin(a)*r],[x+Math.cos(a)*r,y+.12,z+Math.sin(a)*r],.013);}}
   targets[0].set(-.4,1.08,.5);targets[1].set(.4,1.17,.5);
   for(let i=0;i<2;i++)sticks.push(rod(body,0xdac39a,[0,0,0],[0,0,-.32],.018));
  }else if(name==='vibes'){
   box(instrument,0x4b5947,0,.83,.53,1.3,.12,.48);for(const x of [-.52,.52]){rod(instrument,0x7a8580,[x,.06,.5],[x,.85,.5],.035);ball(instrument,0x22291f,x,.055,.5,.06);}targets[0].set(-.3,1.1,.55);targets[1].set(.3,1.1,.55);
  }else if(name==='flute'){
   for(let f=0;f<7;f++)ball(instrument,0xf0e8d5,.15+f*.075,1.465,.345,.027,.008,.025);
   rod(instrument,0xc9c9bd,[0,1.43,.34],[.78,1.43,.34],.035);targets[0].set(.18,1.4,.35);targets[1].set(.55,1.4,.35);
  }else{
   box(instrument,0x485c58,0,.82,.5,1.2,.16,.5);for(let midi=48;midi<=72;midi++){const black=[1,3,6,8,10].includes(midi%12);const whites=[0,2,4,5,7,9,11];const octave=Math.floor((midi-48)/12),rank=whites.filter(pc=>pc<midi%12).length;const x=-.55+(octave*7+rank-(black?.5:0))*.072;const key=box(instrument,black?0x35433f:0xf2ecdc,x,black?.97:.925,black?.48:.58,black?.035:.065,.06,black?.15:.28);keys.push({mesh:key,midi,y:key.position.y});}
   for(let knob=0;knob<5;knob++)ball(instrument,0xd3c7a8,-.4+knob*.1,.93,.3,.023,.025,.023);
   for(const x of [-.48,.48])rod(instrument,0x556760,[x,0,.5],[x,.8,.5],.035);targets[0].set(-.27,1,.57);targets[1].set(.27,1,.57);
  }
  if(name==='drums'){
   // Front-facing kick drum, pedal, throne, and a separate snare.
   const kick=mesh(instrument,new T.CylinderGeometry(.39,.39,.46,40),0x67432e,0,.4,.83);kick.rotation.x=Math.PI/2;
   const skin=mesh(instrument,new T.CircleGeometry(.365,40),0xd2cdb6,0,.4,1.065);const kr=mesh(instrument,new T.TorusGeometry(.385,.025,10,40),0xb9beb4,0,.4,1.07);ball(instrument,0x292e24,.16,.3,1.075,.065,.065,.006);
   box(instrument,0x656b59,.12,.055,.45,.12,.045,.25);rod(instrument,0xb9beb4,[.12,.08,.47],[.12,.3,.72],.016);
   mesh(body,new T.CylinderGeometry(.22,.22,.09,24),0x282c24,0,.64,-.15);rod(body,0x7a8580,[0,0,-.15],[0,.6,-.15],.035);
  }
  if(['keys','piano','organ','lead'].includes(name)){
   box(instrument,name==='piano'?0x292c25:0x6b5137,0,.85,.27,1.25,.22,.12);
   if(name==='piano'){const lid=box(instrument,0x292c25,0,1.05,.03,1.3,.045,.65);lid.rotation.x=-.28;rod(instrument,0x9b9673,[.5,.86,.05],[.5,1.12,-.15],.012);}
   if(name==='organ'){box(instrument,0x6b5137,0,.65,.4,1.3,.4,.5);for(let j=0;j<8;j++)box(instrument,0xd4c6a0,-.42+j*.12,1.03,.27,.04,.06,.04);}
  }
  if(name==='vibes'){for(let k=0;k<14;k++){box(instrument,0xc2b88b,-.53+k*.08,1.01,.57,.065,.035,.35-k*.012);mesh(instrument,new T.CylinderGeometry(.025,.025,.42-k*.017,12),0x9b9273,-.53+k*.08,.68,.6);}for(let i=0;i<2;i++){const mallet=ball(body,0xd8ceac,0,0,0,.04);sticks.push(mallet);}}
  const rug=box(root,index%2?0x4d5140:0x625341,0,.025,.15,1.6,.012,1.5);for(let j=0;j<5;j++)box(root,0x89816a,0,.034,-.52+j*.035,1.5,.003,.008);
  const tag=document.createElement('div');tag.className='actor-label';tag.innerHTML=({pluck:'NOAH · GUITAR',bass:'MILES · BASS',drums:'JUNE · DRUMS',keys:'ELI · RHODES',piano:'AVA · PIANO',strings:'LIV · STRINGS',organ:'REMY · ORGAN',vibes:'KAI · VIBES',flute:'SORA · FLUTE',lead:'THEO · SYNTH'})[name];host.append(tag);
  actors.set(name,{root,body,head,hands,arms,targets,sticks,index,forearms,fingerTips,keys,cymbals,feet,tag,enabled:false});
 }
 let activeCount=4;
 function select(selected){const active=names.filter(n=>selected.includes(n));activeCount=active.length;let i=0;for(const [name,a] of actors){a.root.visible=active.includes(name);a.tag.hidden=!a.root.visible;if(a.root.visible){const count=active.length,cols=Math.min(count,5),row=Math.floor(i/cols);a.root.position.set((i%cols-(cols-1)/2)*1.85,0,row?-1.5:.7);a.root.rotation.y=-(i%cols-(cols-1)/2)*.08;i++;}}}
 function setCamera(){const aspect=host.clientWidth/host.clientHeight;const narrow=aspect<1.4;const distance=Math.max((Math.min(activeCount,5)*1.85+1)/(2*Math.tan(Math.PI/10)*aspect),(activeCount<=2?7.3:activeCount>5?12.8:9.4))*zoom*(viewMode?.82:1);const focus=selectedName&&viewMode?actors.get(selectedName).root.position:new T.Vector3();aim.set(focus.x*.65,activeCount>5?.9:1.05,focus.z*.3);camera.position.set(Math.sin(orbit)*distance+aim.x,2.95+elevation+(activeCount>5?1.8:0),Math.cos(orbit)*distance+aim.z);camera.lookAt(aim);}
 renderer.domElement.addEventListener('pointerdown',e=>{dragStart={x:e.clientX,y:e.clientY,orbit,elevation};dragged=false;renderer.domElement.setPointerCapture(e.pointerId);});
 renderer.domElement.addEventListener('pointermove',e=>{if(!dragStart)return;const dx=e.clientX-dragStart.x,dy=e.clientY-dragStart.y;if(Math.abs(dx)+Math.abs(dy)>5)dragged=true;orbit=Math.max(-.65,Math.min(.65,dragStart.orbit-dx*.003));elevation=Math.max(-1,Math.min(3,dragStart.elevation+dy*.008));});
 renderer.domElement.addEventListener('pointerup',()=>{dragStart=null;});renderer.domElement.addEventListener('pointercancel',()=>{dragStart=null;});
 renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.65,Math.min(1.6,zoom+e.deltaY*.0006));},{passive:false});
 const ray=new T.Raycaster(),pointer=new T.Vector2();renderer.domElement.addEventListener('click',e=>{if(dragged)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects([...actors.values()].filter(a=>a.root.visible).map(a=>a.root),true)[0];if(hit){let o=hit.object;while(o&&!o.userData.instrument)o=o.parent;if(o){selectedName=o.userData.instrument;onSelect(selectedName);}}});
 const resize=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();});resize.observe(host);
 function frame(){requestAnimationFrame(frame);if(document.hidden)return;const now=clock();setCamera();for(let j=events.length-1;j>=0;j--)if(events[j].time+Math.max(.6,events[j].duration*60/events[j].tempo)<now)events.splice(j,1);for(const [name,a] of actors){if(!a.root.visible)continue;const active=events.filter(e=>e.instrument===name&&now>=e.time-.09&&now<e.time+Math.max(.45,e.duration*60/e.tempo));a.tag.classList.toggle('playing',active.length>0);a.tag.classList.toggle('focused',selectedName===name);const labelPosition=new T.Vector3(0,.04,1.08);a.root.localToWorld(labelPosition);labelPosition.project(camera);a.tag.style.left=(labelPosition.x*.5+.5)*host.clientWidth+'px';a.tag.style.top=(-labelPosition.y*.5+.5)*host.clientHeight+'px';const e=active.at(-1),phase=e?now-e.time:0,hit=e&&phase>=0?Math.exp(-phase*10)*e.velocity:0;
  a.body.rotation.z=reduced?0:Math.sin(now*1.5+a.index)*.008+hit*.018;a.head.rotation.x=reduced?0:hit*.08;a.head.rotation.y=reduced?0:Math.sin(now*.35+a.index)*.035;
  for(const key of a.keys){const down=active.some(n=>n.note===key.midi&&now>=n.time&&now<n.time+n.duration*60/n.tempo);key.mesh.position.y=key.y-(down?.025:0);}
  for(let c=0;c<a.cymbals.length;c++){const strike=active.filter(n=>(c===0?[42,44,46]:[49,51]).includes(n.note)&&now>=n.time).at(-1);a.cymbals[c].rotation.z=strike&&!reduced?Math.sin((now-strike.time)*35)*Math.exp(-(now-strike.time)*7)*strike.velocity*.12:0;}
  for(let i=0;i<2;i++){
   const target=a.targets[i].clone();let note=e;
   if(name==='drums')note=active.filter(n=>i===0?[38,40,45,47,50].includes(n.note):[42,44,46,49,51].includes(n.note)).at(-1);
   else if(a.keys.length)note=active.filter(n=>i===0?n.note<60:n.note>=60).at(-1);
   const dt=note?now-note.time:0;
   if(note&&!reduced){
    if(name==='drums'){const cymbal=[42,44,46,49,51].includes(note.note);target.set(cymbal?(note.note>=49?.7:-.7):(i===0?-.47:.47),cymbal?1.3:1.0,cymbal?.25:.35);const lift=dt<0?Math.min(1,-dt/.09):Math.sin(Math.min(1,dt/.22)*Math.PI);target.y+=.08+lift*.27*note.velocity;target.z+=.25;}
    else if(['pluck','bass'].includes(name)){
     if(i===0){const tuning=name==='bass'?[28,33,38,43]:[40,45,50,55,59,64];const choices=tuning.map((open,string)=>({fret:note.note-open,string})).filter(p=>p.fret>=0&&p.fret<=20);const fingering=choices.sort((a,b)=>Math.abs(a.fret-5)-Math.abs(b.fret-5))[0];if(fingering){const t=1-2**(-fingering.fret/12);target.set(-.57+t*.52,1.48-t*.5,.465);}}
     else{const stroke=Math.max(0,Math.min(1,(dt+.08)/.2));target.y=.98-stroke*.15;target.z=.49;if(name==='strings'){target.x=.08+Math.sin(Math.max(0,dt)*3)*.22;if(a.sticks[0])a.sticks[0].position.x=target.x-.1;}}
    }else if(a.keys.length){const key=a.keys.find(k=>k.midi===note.note);if(key){target.x=key.mesh.position.x;target.y=key.y+.075-(dt>=0?.035:0);target.z=key.mesh.position.z;}}
    else if(name==='flute')target.y-=dt>=0?.012:0;
   }
   a.hands[i].position.copy(target);
   // Two articulated segments keep elbows bent while wrists remain at instrument targets.
   const shoulder=new T.Vector3(i?.27:-.27,1.15,0),elbow=shoulder.clone().lerp(target,.48);elbow.x+=(i?1:-1)*.12;elbow.y-=.1;
   if(!a.arms[i].userData.unit){a.arms[i].geometry.dispose();a.arms[i].geometry=new T.CylinderGeometry(.08,.065,1,12);a.arms[i].userData.unit=true;}
   segment(a.arms[i],shoulder,elbow);segment(a.forearms[i],elbow,target);
   for(let f=0;f<4;f++){a.fingerTips[i][f].position.copy(target).add(new T.Vector3((f-1.5)*.027,-.045,.035));a.fingerTips[i][f].rotation.x=note&&!reduced&&dt>=0?.35:0;}
   if(name==='vibes'&&a.sticks[i])a.sticks[i].position.copy(target).add(new T.Vector3(0,-.02,-.12));
   if(name==='drums'){if(!a.sticks[i].userData.unit){a.sticks[i].geometry.dispose();a.sticks[i].geometry=new T.CylinderGeometry(.018,.018,1,12);a.sticks[i].userData.unit=true;}const tip=target.clone().add(new T.Vector3(0,-.08,-.25));segment(a.sticks[i],target,tip);}
  }
  if(name==='drums'){const kick=active.find(n=>n.note===36&&now>=n.time);a.feet[1].rotation.x=kick&&!reduced?Math.exp(-(now-kick.time)*15)*.25:0;}

 }renderer.render(scene,camera);}
 frame();return {select,view(){viewMode=1-viewMode;},resetView(){orbit=0;elevation=0;zoom=1;viewMode=0;selectedName=null;},note(n,time,tempo){events.push({...n,time,tempo});},reset(){events.length=0;},reduce(value){reduced=value;}};
}
