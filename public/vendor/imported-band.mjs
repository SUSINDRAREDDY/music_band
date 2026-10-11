import * as T from '/three/three.module.js';
import {GLTFLoader} from '/vendor/GLTFLoader.mjs';
import {clone} from '/vendor/SkeletonUtils.mjs';
const v=(x=0,y=0,z=0)=>new T.Vector3(x,y,z), norm=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const characters=['Casual_Hoodie','Casual_2','Female_Punk','Punk','Female_Casual','Suit'];
const instruments=['electric-guitar','keyboard-synth','drum-kit','bass-guitar','grand-piano','violin','keyboard-synth','xylophone','flute','keyboard-synth'];
export async function loadBand(){const loader=new GLTFLoader();const paths=[...characters.map(n=>`/assets/characters/quaternius/${n}.gltf`),...new Set(instruments.map(n=>`/assets/instruments/${n}.glb`))];const data=await Promise.all(paths.map(p=>loader.loadAsync(p)));return new Map(paths.map((p,i)=>[p,data[i]]));}
function swing(bone,child,target){const from=child.position.clone().normalize(),parentQ=bone.parent.getWorldQuaternion(new T.Quaternion()),desired=target.clone().sub(bone.getWorldPosition(v())).normalize().applyQuaternion(parentQ.invert()),current=from.clone().applyQuaternion(bone.quaternion);bone.quaternion.premultiply(new T.Quaternion().setFromUnitVectors(current,desired));bone.updateWorldMatrix(false,true);}
export function buildImported(name,index,scene,host,assets){
 const root=new T.Group();root.userData.instrument=name;scene.add(root);
 const source=assets.get(`/assets/characters/quaternius/${characters[index%characters.length]}.gltf`),model=clone(source.scene);root.add(model);const bones=new Map();model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.pose();if(o.isBone)bones.set(norm(o.name),o);if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});model.updateMatrixWorld(true);let bounds=new T.Box3().setFromObject(model);const scale=2.5/(bounds.max.y-bounds.min.y);model.scale.setScalar(scale);model.position.y=-bounds.min.y*scale;root.updateMatrixWorld(true);
 const rest=new Map([...bones].map(([n,b])=>[n,b.quaternion.clone()]));const mixer=new T.AnimationMixer(model),clip=source.animations.find(c=>c.name==='Idle_Neutral');if(clip)mixer.clipAction(clip).play();
 const prop=new T.Group();root.add(prop);const asset=assets.get(`/assets/instruments/${instruments[index]}.glb`).scene.clone(true);prop.add(asset);asset.traverse(o=>{if(o.name.includes('stand')&&['pluck','bass'].includes(name))o.visible=false;if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
 let targets=[v(-.3,1.65,.35),v(.3,1.65,.35)];
 if(name==='pluck'){asset.position.set(0,-.28,-.176);prop.scale.setScalar(1.2);prop.position.set(.12,1.48,.28);prop.rotation.z=.8;targets=[v(-.32,1.91,.32),v(.21,1.59,.38)];}
 else if(name==='bass'){asset.rotation.set(Math.PI/2,0,0);prop.rotation.z=-.5;prop.position.set(0,1.54,.28);targets=[v(-.40,1.76,.35),v(.2,1.53,.38)];}
 else if(name==='drums'){prop.scale.setScalar(1.1);prop.position.z=.66;model.position.y-=.23;targets=[v(-.28,1.50,.38),v(.33,1.62,.40)];}
 else if(name==='strings'){asset.rotation.z=Math.PI/2;prop.position.set(-.15,2.05,.26);prop.scale.setScalar(.9);targets=[v(-.37,2.02,.30),v(.3,1.95,.36)];}
 else if(name==='flute'){prop.scale.setScalar(1.25);prop.position.set(.1,2.15,.25);targets=[v(-.1,2.12,.3),v(.4,2.05,.25)];}
 else if(name==='vibes'){prop.scale.setScalar(.5);bounds=new T.Box3().setFromObject(asset);asset.position.sub(bounds.getCenter(v()));prop.position.set(0,1.4,.55);targets=[v(-.27,1.73,.38),v(.27,1.73,.38)];}
 else {const grand=name==='piano';prop.scale.setScalar(grand?1.35:1.9);prop.rotation.y=grand?Math.PI:0;prop.position.set(0,0,grand?1.1:.47);targets=[v(-.23,1.72,.38),v(.23,1.72,.38)];}
 const sticks=[];if(name==='drums'||name==='vibes')for(let i=0;i<2;i++){const stick=new T.Mesh(new T.CylinderGeometry(.012,.012,.36,12),new T.MeshStandardMaterial({color:0xd8bb87}));root.add(stick);sticks.push(stick);}
 const tag=document.createElement('div');tag.className='actor-label';tag.textContent=['Noah / Guitar','Eli / Keys','June / Drums','Miles / Bass','Ava / Piano','Liv / Violin','Remy / Organ','Kai / Xylophone','Sora / Flute','Theo / Synth'][index];host.append(tag);
 return {root,model,bones,rest,mixer,targets,sticks,prop,tag,name,index,energy:0};
}
export function animateImported(a,events,now,dt,reduced){
 a.mixer.update(dt);const e=events.filter(e=>now>=e.time-.12&&now<e.time+Math.max(.5,e.duration*60/e.tempo)).at(-1),t=e?now-e.time:99,pulse=t>=0?Math.exp(-t*12):Math.max(0,1+t/.12)*.5;a.energy=T.MathUtils.damp(a.energy,e?.7:0,7,dt);
 const head=a.bones.get('head');if(head){head.quaternion.copy(a.rest.get('head'));head.rotateX(.08+(reduced?0:Math.sin(now*1.4+a.index)*.025));}
 a.root.updateWorldMatrix(true,true);
 for(let i=0;i<2;i++){const suffix=i?'r':'l',upper=a.bones.get('upperarm'+suffix),lower=a.bones.get('lowerarm'+suffix),wrist=a.bones.get('wrist'+suffix);if(!upper||!lower||!wrist)continue;
 const target=a.targets[i].clone();if(!reduced&&e){if(a.name==='drums'||a.name==='vibes')target.y+=.11*(1-pulse);else if(['pluck','bass','strings'].includes(a.name))target.y-=pulse*.035;else target.x+=((e.note%12)-6)*.012;}
 const world=a.root.localToWorld(target.clone()),shoulder=upper.getWorldPosition(v()),l1=shoulder.distanceTo(lower.getWorldPosition(v())),l2=lower.getWorldPosition(v()).distanceTo(wrist.getWorldPosition(v())),dir=world.clone().sub(shoulder),d=T.MathUtils.clamp(dir.length(),Math.abs(l1-l2)+.001,l1+l2-.001);dir.normalize();const pole=a.root.localToWorld(v(i?.65:-.65,1.35,-.15)).sub(shoulder),perp=pole.addScaledVector(dir,-pole.dot(dir)).normalize(),along=(l1*l1-l2*l2+d*d)/(2*d),elbow=shoulder.clone().addScaledVector(dir,along).addScaledVector(perp,Math.sqrt(Math.max(0,l1*l1-along*along)));swing(upper,lower,elbow);swing(lower,wrist,shoulder.clone().addScaledVector(dir,d));
 const handQ=a.root.getWorldQuaternion(new T.Quaternion()).multiply(new T.Quaternion().setFromEuler(new T.Euler(-Math.PI/2,0,Math.PI)));wrist.quaternion.copy(wrist.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(handQ));
 for(const finger of ['index','middle','ring','pinky'])for(let j=1;j<4;j++){const key=finger+j+suffix,b=a.bones.get(key);if(b){b.quaternion.copy(a.rest.get(key));b.rotateX(-.35-(e&&e.note%4===['index','middle','ring','pinky'].indexOf(finger)?pulse*.35:0));}}
 if(a.sticks[i]){a.root.updateWorldMatrix(true,true);a.sticks[i].position.copy(a.root.worldToLocal(wrist.getWorldPosition(v()))).add(v(0,.03,.13));a.sticks[i].rotation.x=1.15-pulse*.4;}
 }
 a.tag.classList.toggle('playing',a.energy>.02);
}
