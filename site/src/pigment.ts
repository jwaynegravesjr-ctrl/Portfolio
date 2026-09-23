import * as T from 'three';import {SETTINGS,inkRGB} from './config';import type {Surface} from './sheet';
export const vertex=`varying vec2 uvInk;varying vec2 page;
void main(){uvInk=uv;vec4 world=modelMatrix*vec4(position,1.);page=vec2(world.x+800.,450.-world.y);gl_Position=projectionMatrix*viewMatrix*world;}`;
export const fragment=`precision highp float;
uniform sampler2D art,field;uniform vec2 dimensions;uniform vec3 inkColor;uniform float grow,loss,bleed,roughness,density,fiberScale,seed,pool;
varying vec2 uvInk;varying vec2 page;
float h(vec2 p){return fract(sin(dot(p,vec2(113.7,287.3)))*34751.973);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+1.),f.x),f.y);}
void main(){
  vec2 p=page*fiberScale;float fiber=.7*n(p*vec2(.18,1.2))+.3*n(p*vec2(.6,2.6));
  vec4 f=texture2D(field,uvInk);float local=n(uvInk*dimensions*.15+seed);
  float front=grow>=.998?1.:smoothstep(f.g-.06+(local-.5)*.09*roughness,f.g+.04+(local-.5)*.09*roughness,grow*1.05);
  float resolved=smoothstep(f.g+.01,f.g+.21,grow*1.2);
  float coverage=texture2D(art,uvInk).a;
  float collect=f.b*front*(1.-resolved)*.12;
  float original=(coverage*mix(.45,1.,resolved)+collect)*front;
  float fracture=.6*n(p*vec2(.29,1.5))+.4*n(p*.19+seed);
  float broken=smoothstep(loss*.88-.12,loss*.88+.16,fracture);
  original*=mix(1.,broken,smoothstep(.01,.22,loss))*(1.-smoothstep(.24,.72,loss));
  vec2 seep=vec2((n(p*vec2(.04,.24))-.5)*2.,(n(p*.085)-.5)*.3);
  vec2 sampleAt=uvInk+seep*vec2(1.,-1.)*bleed*smoothstep(.12,.72,loss)/dimensions;
  float sd=(texture2D(field,sampleAt).r-.5)*112.;
  float distance=bleed*smoothstep(.13,.76,loss)*(.35+fiber*.85);
  float softened=1.-smoothstep(-2.,distance+1.,sd);
  float pools=smoothstep(.25,.68,n(p*.072+seed)+fiber*.22);
  float residual=softened*pools*.15*smoothstep(.1,.43,loss)*(1.-smoothstep(.6,1.,loss));
  float tide=exp(-abs(sd-distance*.5))*.035*smoothstep(.22,.46,loss)*(1.-smoothstep(.5,.82,loss));
  float alpha=(original*(.88+.12*fiber)+residual+tide)*density;
  alpha*=smoothstep(0.,.025,grow)*(1.-smoothstep(.95,1.,loss));
  vec2 bud=(uvInk-vec2(.5,.40625))*dimensions;
  float budShape=length(bud*vec2(.85,1.15))+(n(p*.18)-.5)*2.5;
  float inkBud=(1.-smoothstep(5.8,10.,budShape))*(.64+.15*fiber)*pool;
  alpha=1.-(1.-alpha)*(1.-inkBud);
  if(alpha<.001)discard;
  gl_FragColor=vec4(inkColor,clamp(alpha,0.,1.));
}`;
function chamfer(bits:Uint8Array,w:number,h:number,target:number){const d=new Float32Array(bits.length);for(let i=0;i<d.length;i++)d[i]=bits[i]===target?0:1e4;
  for(let pass=0;pass<2;pass++){const direction=pass?-1:1;for(let y=pass?h-1:0;y>=0&&y<h;y+=direction)for(let x=pass?w-1:0;x>=0&&x<w;x+=direction){const k=y*w+x;for(const [dx,dy,cost] of [[-direction,0,1],[0,-direction,1],[-direction,-direction,1.414],[direction,-direction,1.414]]){const nx=x+dx,ny=y+dy;if(nx>=0&&nx<w&&ny>=0&&ny<h)d[k]=Math.min(d[k],d[ny*w+nx]+cost);}}}return d;}
export function fields(s:Surface,seed:number,kind:'bird'|'branch'|'flower'='bird'){
  const w=s.width,h=s.height,data=s.m.getImageData(0,0,w,h).data,bits=new Uint8Array(w*h);
  const mini=document.createElement('canvas');mini.width=w;mini.height=h;const c=mini.getContext('2d')!;c.drawImage(s.ink,0,0,w,h);const marks=c.getImageData(0,0,w,h).data;
  for(let i=0;i<bits.length;i++)bits[i]=(data[i*4+3]>80||marks[i*4+3]>70)?1:0;
  const outside=chamfer(bits,w,h,1),inside=chamfer(bits,w,h,0),arrival=new Float32Array(w*h);arrival.fill(1e6);
  if(kind==='bird'){
    // Four paired raster relaxations approximate connected geodesic travel through the silhouette.
    for(const [sx,sy] of [[156,173],[163,169],[151,176]])if(bits[sy*w+sx])arrival[sy*w+sx]=0;
    for(let pass=0;pass<8;pass++){const dir=pass%2?-1:1;for(let y=dir<0?h-1:0;y>=0&&y<h;y+=dir)for(let x=dir<0?w-1:0;x>=0&&x<w;x+=dir){const k=y*w+x;if(!bits[k])continue;for(const [dx,dy,length] of [[-dir,0,1],[0,-dir,1],[-dir,-dir,1.414],[dir,-dir,1.414]]){const nx=x+dx,ny=y+dy;if(nx<0||nx>=w||ny<0||ny>=h||!bits[ny*w+nx])continue;const cost=length*(1+.22*Math.sin(x*.13+seed)*Math.cos(y*.09));arrival[k]=Math.min(arrival[k],arrival[ny*w+nx]+cost);}}}
    let longest=1;for(let i=0;i<arrival.length;i++)if(arrival[i]<1e6)longest=Math.max(longest,arrival[i]);for(let i=0;i<arrival.length;i++)arrival[i]=arrival[i]>=1e6?.94:arrival[i]/longest*.87;
  }else for(let y=0;y<h;y++)for(let x=0;x<w;x++)arrival[y*w+x]=kind==='branch'?(x/1600*.83+Math.max(0,190-y)/900):.69+(190-y)/1200;
  const rgba=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=((h-y-1)*w+x)*4;rgba[j]=Math.round(Math.min(1,Math.max(0,.5+(outside[i]-inside[i])/112))*255);rgba[j+1]=Math.round(arrival[i]*255);rgba[j+2]=bits[i]*255;rgba[j+3]=255;}
  const texture=new T.DataTexture(rgba,w,h);texture.minFilter=texture.magFilter=T.LinearFilter;texture.needsUpdate=true;return texture;
}
export function layer(s:Surface,order:number,seed:number,kind:'bird'|'branch'|'flower'='bird'){
  const art=new T.CanvasTexture(s.ink);art.colorSpace=T.NoColorSpace;const initialField=fields(s,seed,kind);
  const material=new T.ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,depthTest:false,depthWrite:false,transparent:true,uniforms:{art:{value:art},field:{value:initialField},dimensions:{value:new T.Vector2(s.width,s.height)},inkColor:{value:new T.Vector3(...inkRGB(SETTINGS.ink))},grow:{value:1},loss:{value:0},pool:{value:0},bleed:{value:SETTINGS.bleed},roughness:{value:SETTINGS.roughness},density:{value:SETTINGS.density},fiberScale:{value:SETTINGS.fiberScale},seed:{value:seed}}});
  const mesh=new T.Mesh(new T.PlaneGeometry(s.width,s.height),material);mesh.renderOrder=order;
  return {s,mesh,material,art,initialField,place(x:number,y:number){mesh.position.set(x+s.width/2-800,450-y-s.height/2,0);},dispose(){art.dispose();initialField.dispose();material.dispose();mesh.geometry.dispose();}};
}
