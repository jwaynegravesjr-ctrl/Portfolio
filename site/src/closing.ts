import * as T from 'three';
import {CLOSING, SETTINGS, inkRGB} from './config';
import {ease, progress} from './numbers';
import {vertex} from './pigment';

/** A final impression on the same sheet. Absolute time makes every seek repeatable. */
export function closingAt(time:number){
  return {
    name:progress(time,CLOSING.enter,CLOSING.resolved-.18),
    role:progress(time,CLOSING.enter+.3,CLOSING.resolved),
    loss:progress(time,CLOSING.leave,CLOSING.clear),
    quiet:ease(progress(time,CLOSING.enter-.3,CLOSING.resolved)),
    visible:time>CLOSING.enter&&time<CLOSING.clear,
  };
}

const fragment=`precision highp float;
uniform sampler2D lettering,field;
uniform float nameGrowth,roleGrowth,loss;
uniform vec3 inkColor;
varying vec2 uvInk;varying vec2 page;
float hash(vec2 p){return fract(sin(dot(p,vec2(117.13,293.71)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
void main(){
  float growth=page.y<275.?nameGrowth:roleGrowth;
  if(growth<=0.||loss>=.999)discard;
  // All grain and seep directions belong to the stationary sheet.
  float fiber=.7*noise(page*vec2(.18,1.2))+.3*noise(page*vec2(.6,2.6));
  vec4 f=texture2D(field,uvInk);
  float sd=(f.r-.5)*96.;
  float ragged=(noise(page*.115)-.5)*.036;
  // G is travel time along a connected letter, not horizontal page position.
  float front=smoothstep(f.g-.035+ragged,f.g+.055+ragged,growth);
  float resolved=smoothstep(f.g+.05,f.g+.21,growth);
  if(growth>.998){front=1.;resolved=1.;}
  float coverage=texture2D(lettering,uvInk).a;
  float wet=front*(1.-resolved);
  float impression=coverage*front*mix(.57,1.,resolved);
  float halo=(1.-smoothstep(-.6,3.+fiber*3.5,sd))*wet*.22;
  // B measures distance to a seeded concentration. A staggers its collection.
  // Each little pool arrives first, then is absorbed into its growing letter.
  float age=growth-f.a;
  float radius=mix(4.,8.5,step(page.y,275.))*smoothstep(0.,.045,age)
    *(1.-smoothstep(.10,.34,age));
  float poolDistance=f.b*96.+(noise(page*.17)-.5)*2.;
  float pool=(1.-smoothstep(max(0.,radius-1.4),radius+1.,poolDistance))
    *smoothstep(0.,.018,age)*(1.-smoothstep(.20,.35,age))*(.7+.12*fiber);
  // The dry-back starts as broad, connected holes in the lettering. These
  // page-locked fields keep every seek identical while their uneven threshold
  // makes the surviving ink break apart instead of dimming as one flat layer.
  float blotField=.68*noise(page*vec2(.022,.052))
    +.24*noise(page*vec2(.075,.18))+.08*fiber;
  float holeEdge=.05;
  float holeThreshold=mix(.30,.90,loss);
  float dryMask=smoothstep(holeThreshold-holeEdge,holeThreshold+holeEdge,blotField);
  float carving=smoothstep(.01,.18,loss);
  float dryImpression=impression*mix(1.,dryMask,carving);
  float dryHalo=halo*mix(1.,dryMask*.78,carving*.72);
  float dryPool=pool*mix(1.,dryMask*.52,carving*.54);
  float original=1.-(1.-dryImpression)*(1.-dryHalo)*(1.-dryPool);

  // Remaining pigment feathers along the paper grain and gathers in pale,
  // uneven pools around the broken letter edges before the final lift.
  float bleedStart=smoothstep(.10,.43,loss);
  vec2 seep=vec2((noise(page*vec2(.045,.25))-.5)*2.,(fiber-.5)*.22);
  vec2 sampleAt=uvInk+seep*7.*smoothstep(.10,.68,loss)*vec2(1.,-1.)/vec2(1600.,900.);
  float stainDistance=(texture2D(field,sampleAt).r-.5)*96.;
  float bleed=8.*smoothstep(.1,.72,loss)*(.4+fiber*.8);
  float stain=(1.-smoothstep(0.,bleed+1.,stainDistance))
    *smoothstep(.23,.7,noise(page*.075)+fiber*.22)
    *smoothstep(0.,1.5,stainDistance)*.15
    *bleedStart*(1.-smoothstep(.78,.99,loss));
  float bodyLift=1.-smoothstep(.78,.98,loss);
  float alpha=(original*(.91+.09*fiber)*bodyLift+stain)
    *(1.-smoothstep(.985,1.,loss));
  if(alpha<.001)discard;
  gl_FragColor=vec4(inkColor,clamp(alpha,0.,1.));
}`;

const FIELD_W=1600,FIELD_H=900;

/** Two chamfer sweeps also carry the nearest source pixel into the padding. */
function distances(bits:Uint8Array,target:0|1){
  const distance=new Float32Array(bits.length),nearest=new Int32Array(bits.length);
  for(let i=0;i<bits.length;i++){
    const source=bits[i]===target;distance[i]=source?0:1e6;nearest[i]=source?i:-1;
  }
  function relax(k:number,n:number,cost:number){
    const d=distance[n]+cost;
    if(d<distance[k]){distance[k]=d;nearest[k]=nearest[n];}
  }
  for(let pass=0;pass<2;pass++){
    const step=pass?-1:1;
    for(let y=pass?FIELD_H-1:0;y>=0&&y<FIELD_H;y+=step){
      for(let x=pass?FIELD_W-1:0;x>=0&&x<FIELD_W;x+=step){
        const k=y*FIELD_W+x,px=x-step,py=y-step;
        if(px>=0&&px<FIELD_W)relax(k,k-step,1);
        if(py>=0&&py<FIELD_H){
          relax(k,k-step*FIELD_W,1);
          if(px>=0&&px<FIELD_W)relax(k,k-step*FIELD_W-step,Math.SQRT2);
          const nx=x+step;
          if(nx>=0&&nx<FIELD_W)relax(k,k-step*FIELD_W+step,Math.SQRT2);
        }
      }
    }
  }
  return {distance,nearest};
}

/** Seeded component growth is calculated once for each responsive text layout. */
function letterFields(lettering:HTMLCanvasElement){
  const canvas=document.createElement('canvas');canvas.width=FIELD_W;canvas.height=FIELD_H;
  const c=canvas.getContext('2d',{willReadFrequently:true})!;
  c.drawImage(lettering,0,0,FIELD_W,FIELD_H);
  const pixels=c.getImageData(0,0,FIELD_W,FIELD_H).data,n=FIELD_W*FIELD_H;
  const bits=new Uint8Array(n),seen=new Uint8Array(n),seeds=new Uint8Array(n);
  const arrival=new Float32Array(n),seedTimes=new Float32Array(n),steps=new Int32Array(n);
  const queue=new Int32Array(n);steps.fill(-1);
  for(let i=0;i<n;i++)bits[i]=pixels[i*4+3]>38?1:0;
  // Eight-neighbor flood fill respects holes and the actual connected strokes.
  const offsets=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
  const random=(v:number)=>{const r=Math.sin(v*127.1+SETTINGS.seed*19.3)*43758.5453;return r-Math.floor(r);};
  for(let first=0;first<n;first++){
    if(!bits[first]||seen[first])continue;
    let head=0,tail=1,minX=FIELD_W,maxX=0,minY=FIELD_H,maxY=0;
    queue[0]=first;seen[first]=1;
    while(head<tail){
      const k=queue[head++],y=Math.floor(k/FIELD_W),x=k-y*FIELD_W;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const [dx,dy] of offsets){
        const nx=x+dx,ny=y+dy;if(nx<0||nx>=FIELD_W||ny<0||ny>=FIELD_H)continue;
        const next=ny*FIELD_W+nx;if(bits[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}
      }
    }
    const component=queue.slice(0,tail),r=random(first+tail*7.3);
    const sx=minX+(maxX-minX)*(.3+random(first+19)*.4);
    const sy=minY+(maxY-minY)*(.53+random(first+31)*.23);
    let seed=first,closest=Infinity;
    for(const k of component){
      const y=Math.floor(k/FIELD_W),x=k-y*FIELD_W,d=(x-sx)**2+(y-sy)**2;
      if(d<closest){closest=d;seed=k;}
    }
    const delay=.015+r*.18;seeds[seed]=1;seedTimes[seed]=delay;
    head=0;tail=1;queue[0]=seed;steps[seed]=0;let longest=1;
    while(head<tail){
      const k=queue[head++],y=Math.floor(k/FIELD_W),x=k-y*FIELD_W;
      for(const [dx,dy] of offsets){
        const nx=x+dx,ny=y+dy;if(nx<0||nx>=FIELD_W||ny<0||ny>=FIELD_H)continue;
        const next=ny*FIELD_W+nx;
        if(bits[next]&&steps[next]<0){
          steps[next]=steps[k]+1;longest=Math.max(longest,steps[next]);queue[tail++]=next;
        }
      }
    }
    for(const k of component)arrival[k]=delay+.075+(steps[k]/longest)*.56;
  }
  const outside=distances(bits,1),inside=distances(bits,0),pools=distances(seeds,1);
  const rgba=new Uint8Array(n*4),byte=(v:number)=>Math.round(Math.max(0,Math.min(1,v))*255);
  for(let y=0;y<FIELD_H;y++)for(let x=0;x<FIELD_W;x++){
    const i=y*FIELD_W+x,j=((FIELD_H-y-1)*FIELD_W+x)*4;
    const nearest=outside.nearest[i],poolSeed=pools.nearest[i];
    rgba[j]=byte(.5+(outside.distance[i]-inside.distance[i])/96);
    // Extrapolate the nearest stroke's arrival into a broad, unclipped margin.
    rgba[j+1]=byte(nearest<0?1:arrival[nearest]+outside.distance[i]*.006);
    rgba[j+2]=byte(pools.distance[i]/96);
    rgba[j+3]=byte(poolSeed<0?1:seedTimes[poolSeed]);
  }
  const texture=new T.DataTexture(rgba,FIELD_W,FIELD_H);
  texture.minFilter=texture.magFilter=T.LinearFilter;
  texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
}

export function paintClosing(c:CanvasRenderingContext2D,small:boolean,color='#000'){
    c.save();c.fillStyle=color;c.textAlign='center';c.textBaseline='alphabetic';
    let size:number=CLOSING.nameSize;
    c.font=`bold ${size}px Georgia, 'Times New Roman', serif`;
    size*=Math.min(1,CLOSING.width/c.measureText(CLOSING.name).width);
    c.font=`bold ${size}px Georgia, 'Times New Roman', serif`;
    c.fillText(CLOSING.name,800,CLOSING.nameY);
    if(small){
      c.font="49px Georgia, 'Times New Roman', serif";
      c.fillText('Operation Leader, Automation Expert',800,320);
      c.fillText('and Quality Improvement Specialist',800,385);
    }else{
      c.font=`${CLOSING.roleSize}px Georgia, 'Times New Roman', serif`;
      c.fillText(CLOSING.role,800,CLOSING.roleY);
    }
    c.globalAlpha=.68;c.beginPath();c.moveTo(698,101);c.bezierCurveTo(761,100,841,102,902,101);c.lineWidth=2;c.strokeStyle=color;c.stroke();c.restore();
}

export function closingTitle(){
  const canvas=document.createElement('canvas');canvas.width=3200;canvas.height=1800;
  const c=canvas.getContext('2d')!;
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.NoColorSpace;
  const material=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,
    transparent:true,depthTest:false,depthWrite:false,
    uniforms:{lettering:{value:texture},field:{value:null as T.DataTexture|null},nameGrowth:{value:0},roleGrowth:{value:0},loss:{value:0},inkColor:{value:new T.Vector3(...inkRGB(SETTINGS.ink))}}});
  const mesh=new T.Mesh(new T.PlaneGeometry(1600,900),material);mesh.renderOrder=60;mesh.visible=false;
  let compact:boolean|undefined;
  function layout(small:boolean){
    if(compact===small)return;compact=small;
    c.setTransform(2,0,0,2,0,0);c.clearRect(0,0,1600,900);
    paintClosing(c,small);
    material.uniforms.field.value?.dispose();
    material.uniforms.field.value=letterFields(canvas);
    texture.needsUpdate=true;
  }
  layout(false);
  return {mesh,
    update(time:number,width:number){layout(width<600);const s=closingAt(time);mesh.visible=s.visible;
      material.uniforms.nameGrowth.value=s.name;material.uniforms.roleGrowth.value=s.role;material.uniforms.loss.value=s.loss;return s;},
    dispose(){texture.dispose();material.uniforms.field.value?.dispose();material.dispose();mesh.geometry.dispose();}
  };
}
