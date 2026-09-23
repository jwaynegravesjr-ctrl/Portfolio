import * as T from 'three';import {SETTINGS,CAST,CLOSING,inkRGB} from './config';
import {paintBird} from './birds';import {surface,wipe,branchDrawing,paperDrawing} from './sheet';import {layer,fields,vertex} from './pigment';
import {evaluateScene,evaluateScore,birdAt,endInk,INK_RESTS,EVENTS,CLEARS,type BirdState} from './score';import {annotations,type ViewFlags} from './notes';
import {scoreTime,playbackTime} from './timing';
import {drawDataPaper,DATA_HEADINGS,dataHeadingOpacity} from './data-paper';
import {drawTwigs} from './clearing';
import {closingTitle,closingAt,paintClosing} from './closing';
import {ease,progress} from './numbers';
import {initScrollMorph} from './scroll-morph';
import {initSiteEffects} from './site-effects';
const el=<E extends HTMLElement>(id:string)=>document.getElementById(id) as E;
const host=el('page'),still=el<HTMLCanvasElement>('still'),flags:ViewFlags={identities:false,clearance:false,paths:false,guidance:true};
const stage=new T.Scene(),camera=new T.OrthographicCamera(-800,800,450,-450,.1,50);camera.position.z=10;
let renderer:T.WebGLRenderer|undefined,running=false,time=0,request=0,previous=0,frameCount=0,destroyed=false,morphProgress=0;const intervals:number[]=[];
const morphFields=new Map<number,T.DataTexture>();
const paper=paperDrawing(),paperMap=new T.CanvasTexture(paper);paperMap.colorSpace=T.SRGBColorSpace;
const paperPlane=new T.Mesh(new T.PlaneGeometry(1600,900),new T.MeshBasicMaterial({map:paperMap,depthTest:false,depthWrite:false}));stage.add(paperPlane);
const dataPaper=document.createElement('canvas');dataPaper.width=1600;dataPaper.height=900;const dc=dataPaper.getContext('2d')!;
const dataOriginal=document.createElement('canvas');dataOriginal.width=1600;dataOriginal.height=900;const originalData=dataOriginal.getContext('2d')!;
const dataMap=new T.CanvasTexture(dataPaper);dataMap.colorSpace=T.NoColorSpace;
const dataMaterial=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:'uniform sampler2D marks;uniform vec3 inkColor;uniform float strength;varying vec2 uvInk;void main(){gl_FragColor=vec4(inkColor,texture2D(marks,uvInk).a*strength);}',uniforms:{marks:{value:dataMap},inkColor:{value:new T.Vector3(...inkRGB(SETTINGS.note))},strength:{value:1.1}},transparent:true,depthTest:false,depthWrite:false});
const dataPlane=new T.Mesh(new T.PlaneGeometry(1600,900),dataMaterial);dataPlane.renderOrder=5;stage.add(dataPlane);let dataStamp=-1;
const snagPaper=document.createElement('canvas');snagPaper.width=1600;snagPaper.height=900;const sc=snagPaper.getContext('2d')!;
const snagMap=new T.CanvasTexture(snagPaper);snagMap.colorSpace=T.NoColorSpace;
const snagMaterial=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:'uniform sampler2D marks;uniform vec3 inkColor;uniform float strength;varying vec2 uvInk;void main(){gl_FragColor=vec4(inkColor,texture2D(marks,uvInk).a*strength);}',uniforms:{marks:{value:snagMap},inkColor:{value:new T.Vector3(...inkRGB(SETTINGS.ink))},strength:{value:1}},transparent:true,depthTest:false,depthWrite:false});
const snagPlane=new T.Mesh(new T.PlaneGeometry(1600,900),snagMaterial);snagPlane.renderOrder=41;stage.add(snagPlane);let snagStamp=-1;
const twig=surface(1600,290),bloom=surface(1600,290);branchDrawing(twig,0);branchDrawing(bloom,0,true);
const branch=layer(twig,20,23,'branch'),flowers=layer(bloom,40,39,'flower');branch.place(0,360);flowers.place(0,360);stage.add(branch.mesh,flowers.mesh);
function draw(i:number,s:ReturnType<typeof surface>,p:BirdState){wipe(s);for(const c of [s.c,s.m]){c.save();c.translate(160,216);}paintBird(s.c,s.m,CAST[i],p);s.c.restore();s.m.restore();}
const birds=CAST.map((b,i)=>{
  const s=surface(320,288);draw(i,s,birdAt(i,0));const ink=layer(s,30+i*.01,b.seed);const imprints=new Map<number,T.DataTexture>([[-1,ink.initialField]]);
  draw(i,s,birdAt(i,endInk(i)));imprints.set(100+i,fields(s,b.seed));
  INK_RESTS.forEach((d,k)=>{if(d.bird===i){draw(i,s,birdAt(i,d.at));imprints.set(k,fields(s,b.seed));}});
  stage.add(ink.mesh);return {ink,imprints,key:''};
});
const notes=document.createElement('canvas');notes.width=1600;notes.height=900;const nc=notes.getContext('2d')!;
const notesMap=new T.CanvasTexture(notes);notesMap.colorSpace=T.NoColorSpace;
const noteMaterial=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:'uniform sampler2D marks;uniform vec3 inkColor;uniform float strength;varying vec2 uvInk;void main(){gl_FragColor=vec4(inkColor,texture2D(marks,uvInk).a*strength);}',uniforms:{marks:{value:notesMap},inkColor:{value:new T.Vector3(...inkRGB(SETTINGS.note))},strength:{value:1.1}},transparent:true,depthTest:false,depthWrite:false});
const notePlane=new T.Mesh(new T.PlaneGeometry(1600,900),noteMaterial);notePlane.renderOrder=50;stage.add(notePlane);
const ending=closingTitle();stage.add(ending.mesh);
const reduced=matchMedia('(prefers-reduced-motion:reduce)');let branchStamp='';
const motionDisabled=()=>document.documentElement.dataset.motion?document.documentElement.dataset.motion==='off':reduced.matches;
const clearingReleasePoses=CLEARS.map(action=>birdAt(action.bird,action.toss));
function prepareDataPaper(t:number,poses:BirdState[]){
  const dataTime=Math.floor(t*24)/24;if(dataTime!==dataStamp){drawDataPaper(originalData,dataTime);dataStamp=dataTime;}
  dc.clearRect(0,0,1600,900);dc.drawImage(dataOriginal,0,0);
  // The ink birds shelter the worksheet, while the underlying paper fibers remain fixed.
  dc.save();dc.globalCompositeOperation='destination-out';
  poses.forEach((p,i)=>{if(p.formation>.9&&p.dispersal<.1)dc.drawImage(birds[i].ink.s.mask,p.x-160,p.y-216);});dc.restore();
}
function ui(){const s=evaluateScene(time);el('labels').style.opacity=String(Math.min(1,s.registration/10)*(1-ease(progress(morphProgress,0,.12))));el('labels').setAttribute('aria-hidden',s.registration>8&&morphProgress<.02?'false':'true');el('play').setAttribute('aria-label',running?'Pause animation':'Play animation');}
export function renderAt(seconds:number){
  if(!renderer||destroyed)return;time=Math.max(0,Math.min(SETTINGS.length,seconds));const s=evaluateScene(time),authored=s.scoreTime;
  const staticMotion=motionDisabled();
  const closing=ending.update(staticMotion&&Math.abs(authored-34.35)<.0001?CLOSING.resolved:authored,host.clientWidth);
  const absorption=ease(progress(morphProgress,.015,.5)),fade=1-ease(progress(morphProgress,0,.27));
  ending.mesh.material.uniforms.loss.value=Math.max(closing.loss,absorption);
  dataMaterial.uniforms.strength.value=1.1*(1-closing.quiet*.94)*fade;
  noteMaterial.uniforms.strength.value=1.1*fade;snagMaterial.uniforms.strength.value=fade;
  const snagTime=Math.min(authored,24);if(snagTime!==snagStamp){drawTwigs(sc,snagTime,s.birds,clearingReleasePoses);snagMap.needsUpdate=true;snagStamp=snagTime;}snagPlane.visible=authored>.5&&authored<24;
  for(let i=0;i<8;i++){const p=s.birds[i],b=birds[i],key=JSON.stringify([p.spread,p.flap,p.pitch,p.head,p.breath,p.tail,p.facing,p.feet,p.ruffle,p.signal,p.tweet]);if(key!==b.key){draw(i,b.ink.s,p);b.ink.art.needsUpdate=true;b.key=key;}
    const u=b.ink.material.uniforms;u.grow.value=p.formation;u.loss.value=Math.max(p.dispersal,absorption);u.pool.value=p.pool*(1-absorption);u.field.value=morphFields.get(i)||b.imprints.get(p.imprint)||b.ink.initialField;
    b.ink.place(p.x-160,p.y-216);b.ink.mesh.visible=(p.formation>0&&p.dispersal<1)||p.pool>0;b.ink.mesh.renderOrder=p.dispersal>0?10+i*.01:30+i*.01;
  }
  prepareDataPaper(authored,s.birds);dataMap.needsUpdate=true;
  const stamp=EVENTS.some(e=>authored>=e.time&&authored<e.time+1.6)?String(authored):'rest';
  if(stamp!==branchStamp){branchDrawing(twig,stamp==='rest'?0:authored);branch.art.needsUpdate=true;branchStamp=stamp;}
  for(const ink of [branch,flowers]){ink.material.uniforms.grow.value=s.branchInk;ink.material.uniforms.loss.value=Math.max(s.branchLoss,ease(progress(morphProgress,0,ink===branch?.14:.32)));ink.mesh.visible=s.branchInk>0&&s.branchLoss<1;}
  annotations(nc,s,flags);
  // Guidance is last in the layer stack, with actual silhouettes spared for visual clarity.
  nc.save();nc.globalCompositeOperation='destination-out';s.birds.forEach((p,i)=>{if(p.formation>.9&&p.dispersal<.1)nc.drawImage(birds[i].ink.s.mask,p.x-160,p.y-216+s.registration);});nc.restore();
  notesMap.needsUpdate=true;notePlane.position.y=s.registration;renderer.render(stage,camera);frameCount++;ui();
}
function frame(now:number){if(!running||destroyed)return;if(previous){const dt=(now-previous)/1000;time=(time+dt)%SETTINGS.length;intervals.push(dt*1000);if(intervals.length>300)intervals.shift();}previous=now;renderAt(time);request=requestAnimationFrame(frame);}
export function play(){if(!renderer||destroyed||morphProgress>0)return;running=true;previous=0;el('play').textContent='Pause';el('play').setAttribute('aria-label','Pause animation');cancelAnimationFrame(request);request=requestAnimationFrame(frame);}
export function pause(){running=false;cancelAnimationFrame(request);el('play').textContent='Play';el('play').setAttribute('aria-label','Play animation');}
export function seek(t:number){pause();renderAt(t);}
function fallback(){
  still.width=1600;still.height=900;still.classList.add('visible');const c=still.getContext('2d')!;c.drawImage(paper,0,0);const s=evaluateScore(34.35);
  function imprint(source:HTMLCanvasElement,x:number,y:number,w:number,h:number,color=SETTINGS.ink){const temp=document.createElement('canvas');temp.width=source.width;temp.height=source.height;const tc=temp.getContext('2d')!;tc.drawImage(source,0,0);tc.globalCompositeOperation='source-in';tc.fillStyle=color;tc.fillRect(0,0,temp.width,temp.height);c.drawImage(temp,x,y,w,h);}
  s.birds.forEach((p,i)=>draw(i,birds[i].ink.s,p));prepareDataPaper(34.35,s.birds);c.globalAlpha=.066;imprint(dataPaper,0,0,1600,900,SETTINGS.note);c.globalAlpha=1;branchDrawing(twig,34.35);imprint(twig.ink,0,360,1600,290);s.birds.forEach((p,i)=>imprint(birds[i].ink.s.ink,p.x-160,p.y-216,320,288));imprint(bloom.ink,0,360,1600,290);paintClosing(c,host.clientWidth<600,SETTINGS.ink);
  el('play').textContent='Still drawing';el<HTMLButtonElement>('play').disabled=true;
}
function fit(){if(!renderer)return;renderer.setPixelRatio(Math.min(devicePixelRatio||1,SETTINGS.pixelRatio));renderer.setSize(host.clientWidth,host.clientHeight,false);renderAt(time);}
const observer=new ResizeObserver(fit);
function preference(){if(motionDisabled())seek(playbackTime(34.35));else play();}
export function dispose(){pause();destroyed=true;observer.disconnect();reduced.removeEventListener('change',preference);morph.dispose();site.dispose();window.removeEventListener('perch:motion',motionPreference);for(const f of morphFields.values())f.dispose();for(const b of birds){for(const f of b.imprints.values())if(f!==b.ink.initialField)f.dispose();b.ink.dispose();}ending.dispose();branch.dispose();flowers.dispose();snagMap.dispose();snagMaterial.dispose();snagPlane.geometry.dispose();dataMap.dispose();dataMaterial.dispose();dataPlane.geometry.dispose();notesMap.dispose();noteMaterial.dispose();notePlane.geometry.dispose();paperMap.dispose();paperPlane.geometry.dispose();paperPlane.material.dispose();renderer?.dispose();renderer?.domElement.remove();}
try{renderer=new T.WebGLRenderer({antialias:true,powerPreference:'low-power'});renderer.debug.checkShaderErrors=true;renderer.debug.onShaderError=(gl,p,v,f)=>{console.error('Ink shader failed',gl.getProgramInfoLog(p),gl.getShaderInfoLog(v),gl.getShaderInfoLog(f));pause();renderer!.domElement.style.display='none';fallback();};renderer.outputColorSpace=T.SRGBColorSpace;renderer.setClearColor(SETTINGS.paper);renderer.domElement.setAttribute('aria-hidden','true');host.prepend(renderer.domElement);renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();pause();renderer!.domElement.style.display='none';fallback();});observer.observe(host);fit();preference();}catch(e){console.info('Using the static ink drawing',e);fallback();}
el('play').addEventListener('click',()=>running?pause():play());
function setMorph(value:number){
  if(value===morphProgress)return;
  if(value>0&&morphProgress===0&&renderer){
    const s=evaluateScene(time);s.birds.forEach((p,i)=>{if(p.formation>.1&&p.dispersal===0)morphFields.set(i,fields(birds[i].ink.s,CAST[i].seed));});
  }
  morphProgress=value;
  if(value===0){for(const f of morphFields.values())f.dispose();morphFields.clear();}
  if(!renderer)still.style.opacity=String(1-ease(progress(value,0,.4)));
  renderAt(time);
}
const morph=initScrollMorph({getState:()=>({time,running,available:!!renderer}),pause,play,setProgress:setMorph});
function motionPreference(event:Event){const enabled=(event as CustomEvent<{enabled:boolean}>).detail.enabled;if(!enabled){pause();renderAt(playbackTime(34.35));}else if(morphProgress===0)play();}
window.addEventListener('perch:motion',motionPreference);
const site=initSiteEffects();
if(import.meta.env.DEV||new URLSearchParams(location.search).has('inspect'))(window as unknown as Record<string,unknown>).sharedPerch={evaluateScene,renderAt,play,pause,seek,scoreTime,playbackTime,dispose,setFlags(f:Partial<ViewFlags>){Object.assign(flags,f);renderAt(time);},diagnostics(){const authored=scoreTime(time);return {time,running,frameCount,morphProgress,state:evaluateScene(time),closing:closingAt(reduced.matches&&Math.abs(authored-34.35)<.0001?CLOSING.resolved:authored),headingAlphas:DATA_HEADINGS.map(h=>dataHeadingOpacity(Math.floor(authored*24)/24,h)),intervals:[...intervals],calls:renderer?.info.render.calls,textures:renderer?.info.memory.textures,available:!!renderer,positions:birds.map(b=>[b.ink.mesh.position.x,b.ink.mesh.position.y]),visible:birds.filter(b=>b.ink.mesh.visible).length};}};
