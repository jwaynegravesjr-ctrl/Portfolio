import * as T from 'three';

type BlockId = 'heading' | 'paragraph' | 'table';
type BlockState = 'waiting' | 'active' | 'paused' | 'complete' | 'fallback';
type TextRun = {text:string; x:number; top:number; font:string; fontSize:number; lineHeight:number; color:string; direction:CanvasDirection; letterSpacing:string};
type Segment = {x1:number; y1:number; x2:number; y2:number; width:number; alpha:number};
type LayerPlan = {sources:HTMLElement[]; start:number; duration:number; poolDiameter:number; opacity:number; segments?:Segment[]};
type InkLayer = {
  mesh:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>;
  anchor:HTMLElement;
  offsetX:number;
  offsetY:number;
  pageX:number;
  pageY:number;
  width:number;
  height:number;
  start:number;
  duration:number;
  disposed:boolean;
};
type Block = {id:BlockId; element:HTMLElement; duration:number; state:BlockState; elapsed:number; lastTick:number; layers:InkLayer[]; hidden:boolean};

declare global { interface Window { inkStudy?:InkStudyApi } }
type InkStudyApi = {
  replay():void;
  pause():void;
  play():void;
  seek(id:string,seconds:number):void;
  diagnostics():{
    supported:boolean;
    fallback:string|null;
    pixelRatio:number;
    blocks:Array<{id:BlockId;state:BlockState;progress:number;elapsedSeconds:number;durationSeconds:number}>;
    activeRenderingCount:number;
    canvasPresent:boolean;
  };
  dispose():void;
};

const paper = '#efe7d7';
const ink = new T.Color('#211c17');
const fallbackMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const reducePreference = fallbackMotion.matches;
const sourceElements = {
  heading: document.querySelector<HTMLElement>('[data-study-block="heading"]')!,
  paragraph: document.querySelector<HTMLElement>('[data-study-block="paragraph"]')!,
  table: document.querySelector<HTMLElement>('[data-study-block="table"]')!,
};
const replayButton = document.querySelector<HTMLButtonElement>('#study-replay')!;
const pauseButton = document.querySelector<HTMLButtonElement>('#study-pause')!;
const blocks:Block[] = [
  {id:'heading',element:sourceElements.heading,duration:1.6,state:'waiting',elapsed:0,lastTick:0,layers:[],hidden:false},
  {id:'paragraph',element:sourceElements.paragraph,duration:1.6,state:'waiting',elapsed:0,lastTick:0,layers:[],hidden:false},
  {id:'table',element:sourceElements.table,duration:2.2,state:'waiting',elapsed:0,lastTick:0,layers:[],hidden:false},
];

const shaderFragment = `
  uniform sampler2D uMask;
  uniform sampler2D uField;
  uniform vec2 uSize;
  uniform vec2 uPageOrigin;
  uniform float uProgress;
  uniform float uSdfRange;
  uniform float uSeedRange;
  uniform float uPoolRadius;
  uniform float uPixelRatio;
  uniform vec3 uInk;
  varying vec2 vUv;

  float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
  float noise(vec2 p){
    vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
  }
  void main(){
    vec4 field=texture2D(uField,vUv);
    float cover=texture2D(uMask,vUv).a;
    float sd=(field.r-.5)*uSdfRange*2.;
    float arrival=field.g;
    float grain=noise((uPageOrigin+vUv*uSize)*.21);
    float ragged=(grain-.5)*.065;
    float front=smoothstep(arrival-.035+ragged,arrival+.04+ragged,uProgress);
    if(uProgress>.998)front=1.;
    float density=mix(.76,1.,smoothstep(.10,.74,uProgress));
    float core=cover*front*density;
    float resolved=smoothstep(arrival+.035,arrival+.21,uProgress);
    float wet=front*(1.-resolved);

    float poolAge=uProgress-field.a;
    float poolIn=smoothstep(0.,.025,poolAge);
    float poolOut=1.-smoothstep(.105,.235,poolAge);
    float seedDistance=field.b*uSeedRange;
    float poolRadius=uPoolRadius*poolIn;
    float poolDistance=seedDistance+(grain-.5)*1.35;
    float poolShape=1.-smoothstep(max(0.,poolRadius-.72)+(grain-.5)*.45,poolRadius+.7+(grain-.5)*.45,poolDistance);
    float pools=poolShape*poolIn*poolOut*(1.-smoothstep(.69,.94,uProgress))*.88;

    float outside=smoothstep(-.25,1.05,sd)*(1.-smoothstep(2.4+(grain-.5)*.9,5.05+(grain-.5)*.9,sd));
    float halo=outside*wet*(.12+grain*.08);

    float alpha=core+pools*(1.-core)+halo*(1.-core)*(1.-pools);
    if(uProgress>=.999)alpha=cover;
    gl_FragColor=vec4(uInk,clamp(alpha,0.,1.));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const shaderVertex = `
  varying vec2 vUv;
  void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`;

function supportsWebgl(){
  try {
    const canvas=document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2')||canvas.getContext('webgl')||canvas.getContext('experimental-webgl'));
  } catch { return false; }
}

function canvasFont(style:CSSStyleDeclaration){
  return `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
}

function collectRuns(sources:HTMLElement[]):TextRun[]{
  const runs:TextRun[]=[];
  const range=document.createRange();
  for(const source of sources){
    const walker=document.createTreeWalker(source,NodeFilter.SHOW_TEXT);
    let node:Node|null;
    while((node=walker.nextNode())){
      const value=node.textContent||'';
      if(!value.trim())continue;
      const owner=node.parentElement||source;
      const style=getComputedStyle(owner);
      const byLine=new Map<number,TextRun>();
      let offset=0;
      for(const character of Array.from(value)){
        const end=offset+character.length;
        range.setStart(node,offset);range.setEnd(node,end);
        const rect=range.getBoundingClientRect();
        offset=end;
        if(!rect.height||(!rect.width&&!character.trim()))continue;
        if(!rect.width)continue;
        const key=Math.round(rect.top*2);
        let run=byLine.get(key);
        if(!run){
          run={text:'',x:rect.left,top:rect.top,font:canvasFont(style),fontSize:parseFloat(style.fontSize)||16,
            lineHeight:Number.isFinite(parseFloat(style.lineHeight))?parseFloat(style.lineHeight):parseFloat(style.fontSize)*1.25,
            color:style.color,direction:style.direction==='rtl'?'rtl':'ltr',letterSpacing:style.letterSpacing};
          byLine.set(key,run);
        }
        run.text+=character;
      }
      runs.push(...[...byLine.values()].sort((a,b)=>a.top-b.top));
    }
  }
  return runs;
}

function collectSegments(table:HTMLElement):Segment[]{
  const head=table.querySelector('thead');
  const body=table.querySelector('tbody');
  if(!head||!body)return [];
  const result:Segment[]=[];
  const width=table.getBoundingClientRect().width;
  const left=table.getBoundingClientRect().left;
  const headRect=head.getBoundingClientRect();
  if(width>0){
    result.push({x1:left,y1:headRect.top+.5,x2:left+width,y2:headRect.top+.5,width:1,alpha:.48});
    // The browser's native 1px border occupies [bottom, bottom + 1); the
    // segment coordinate is its center because makeLayer expands by width/2.
    result.push({x1:left,y1:headRect.bottom+.5,x2:left+width,y2:headRect.bottom+.5,width:1,alpha:.48});
  }
  for(const row of [...body.rows]){
    const rect=row.getBoundingClientRect();
    result.push({x1:left,y1:rect.bottom+.5,x2:left+width,y2:rect.bottom+.5,width:1,alpha:.27});
  }
  return result;
}

function distances(bits:Uint8Array,width:number,height:number,target:0|1){
  const count=width*height;
  const distance=new Float32Array(count);
  const nearest=new Int32Array(count);
  for(let i=0;i<count;i++){
    const source=bits[i]===target;
    distance[i]=source?0:1e8;
    nearest[i]=source?i:-1;
  }
  const relax=(at:number,from:number,cost:number)=>{
    if(from<0||from>=count)return;
    const d=distance[from]+cost;
    if(d<distance[at]){distance[at]=d;nearest[at]=nearest[from];}
  };
  const diagonal=Math.SQRT2;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=y*width+x;
    if(x>0)relax(at,at-1,1);
    if(y>0){relax(at,at-width,1);if(x>0)relax(at,at-width-1,diagonal);if(x+1<width)relax(at,at-width+1,diagonal);}
  }
  for(let y=height-1;y>=0;y--)for(let x=width-1;x>=0;x--){
    const at=y*width+x;
    if(x+1<width)relax(at,at+1,1);
    if(y+1<height){relax(at,at+width,1);if(x+1<width)relax(at,at+width+1,diagonal);if(x>0)relax(at,at+width-1,diagonal);}
  }
  return {distance,nearest};
}

function createField(canvas:HTMLCanvasElement,pixelRatio:number){
  const width=canvas.width,height=canvas.height,count=width*height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('2D canvas is unavailable');
  const pixels=context.getImageData(0,0,width,height).data;
  const bits=new Uint8Array(count),seen=new Uint8Array(count),seeds=new Uint8Array(count);
  const arrival=new Float32Array(count),seedTimes=new Float32Array(count),steps=new Int32Array(count);
  steps.fill(-1);
  for(let i=0;i<count;i++)bits[i]=pixels[i*4+3]>34?1:0;
  const queue=new Int32Array(count);
  const around=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]] as const;
  const random=(n:number)=>{const v=Math.sin(n*127.1+91.7)*43758.5453123;return v-Math.floor(v);};

  for(let first=0;first<count;first++){
    if(!bits[first]||seen[first])continue;
    let head=0,tail=1,minX=width,maxX=0,minY=height,maxY=0;
    queue[0]=first;seen[first]=1;
    while(head<tail){
      const at=queue[head++],y=Math.floor(at/width),x=at-y*width;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const [dx,dy] of around){
        const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
        const next=ny*width+nx;if(bits[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}
      }
    }
    let sx=(minX+maxX)/2,sy=(minY+maxY)/2,seed=first,closest=Infinity;
    for(let j=0;j<tail;j++){
      const at=queue[j],y=Math.floor(at/width),x=at-y*width,d=(x-sx)**2+(y-sy)**2;
      if(d<closest){closest=d;seed=at;}
    }
    const delay=.012+random(first+tail*13.1)*.105;
    seeds[seed]=1;seedTimes[seed]=delay;
    head=0;tail=1;queue[0]=seed;steps[seed]=0;let longest=1;
    while(head<tail){
      const at=queue[head++],y=Math.floor(at/width),x=at-y*width;
      for(const [dx,dy] of around){
        const nx=x+dx,ny=y+dy;if(nx<0||nx>=width||ny<0||ny>=height)continue;
        const next=ny*width+nx;
        if(bits[next]&&steps[next]<0){steps[next]=steps[at]+1;longest=Math.max(longest,steps[next]);queue[tail++]=next;}
      }
    }
    for(let j=0;j<tail;j++){
      const at=queue[j];arrival[at]=delay+.075+(steps[at]/longest)*.60;
    }
  }

  const toInk=distances(bits,width,height,1);
  const toPaper=distances(bits,width,height,0);
  const toSeed=distances(seeds,width,height,1);
  const rgba=new Uint8Array(count*4);
  const byte=(v:number)=>Math.round(Math.max(0,Math.min(1,v))*255);
  const sdfRange=24,seedRange=18;
  for(let i=0;i<count;i++){
    const signed=(toInk.distance[i]-toPaper.distance[i])/pixelRatio;
    const near=toInk.nearest[i],seed=toSeed.nearest[i];
    rgba[i*4]=byte(.5+signed/(2*sdfRange));
    rgba[i*4+1]=byte(near<0?1:arrival[near]+(toInk.distance[i]/pixelRatio)*.0022);
    rgba[i*4+2]=byte(seed<0?1:toSeed.distance[i]/pixelRatio/seedRange);
    rgba[i*4+3]=byte(seed<0?1:seedTimes[seed]);
  }
  const texture=new T.DataTexture(rgba,width,height,T.RGBAFormat,T.UnsignedByteType);
  texture.flipY=true;
  texture.minFilter=texture.magFilter=T.LinearFilter;
  texture.generateMipmaps=false;texture.colorSpace=T.NoColorSpace;texture.needsUpdate=true;
  return {texture,sdfRange,seedRange};
}

let renderer:T.WebGLRenderer|null=null;
let camera:T.OrthographicCamera|null=null;
let scene:T.Scene|null=null;
let canvas:HTMLCanvasElement|null=null;
let fallbackReason:string|null=null;
let pixelRatio=Math.min(1.5,window.devicePixelRatio||1);
let raf=0;
let isDisposed=false;
let isPaused=false;
let fontsReady=false;
let webglError:string|null=null;
let lastNow=performance.now();

function setState(block:Block,state:BlockState){
  block.state=state;
  block.element.dataset.state=state;
}

function showNative(block:Block){
  if(!block.hidden)return;
  block.element.classList.remove('ink-source-hidden');
  block.hidden=false;
}

function hideNative(block:Block){
  if(block.hidden)return;
  block.element.classList.add('ink-source-hidden');
  block.hidden=true;
}

function releaseLayer(layer:InkLayer){
  if(layer.disposed)return;
  layer.disposed=true;
  scene?.remove(layer.mesh);
  layer.mesh.material.uniforms.uMask.value.dispose();
  layer.mesh.material.uniforms.uField.value.dispose();
  layer.mesh.material.dispose();
  layer.mesh.geometry.dispose();
}

function clearBlockLayers(block:Block){
  for(const layer of block.layers)releaseLayer(layer);
  block.layers=[];
  showNative(block);
}

function fallback(reason:string){
  if(fallbackReason||isDisposed)return;
  fallbackReason=reason;
  for(const block of blocks){
    clearBlockLayers(block);
    block.elapsed=0;
    setState(block,'fallback');
  }
  if(renderer){renderer.dispose();renderer=null;}
  if(canvas?.isConnected)canvas.remove();
  canvas=null;
  scene=null;camera=null;
  if(raf){cancelAnimationFrame(raf);raf=0;}
  pauseButton.disabled=true;
  replayButton.disabled=true;
  pauseButton.textContent='Motion reduced';
  pauseButton.setAttribute('aria-pressed','true');
}

function boundsFor(runs:TextRun[],segments:Segment[]){
  const ctx=document.createElement('canvas').getContext('2d');
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const run of runs){
    if(!ctx)continue;
    ctx.font=run.font;
    const metrics=ctx.measureText(run.text);
    const width=metrics.width;
    const ascent=metrics.fontBoundingBoxAscent||run.fontSize*.82;
    const descent=metrics.fontBoundingBoxDescent||run.fontSize*.22;
    const lineHeight=run.lineHeight||run.fontSize*1.25;
    const baseline=run.top+ascent;
    run.top=baseline;
    left=Math.min(left,run.x);right=Math.max(right,run.x+width);
    top=Math.min(top,baseline-ascent);bottom=Math.max(bottom,baseline+descent);
  }
  for(const line of segments){
    left=Math.min(left,line.x1,line.x2);right=Math.max(right,line.x1,line.x2);
    top=Math.min(top,line.y1,line.y2);bottom=Math.max(bottom,line.y1,line.y2);
  }
  if(!Number.isFinite(left)||!Number.isFinite(top)||right<=left||bottom<=top)throw new Error('A study layer has no measurable content');
  return {left,top,right,bottom};
}

function makeLayer(block:Block,plan:LayerPlan,order:number){
  if(!renderer||!scene)throw new Error('Renderer is unavailable');
  const runs=collectRuns(plan.sources);
  const segments=plan.segments||[];
  const bounds=boundsFor(runs,segments);
  const pad=24;
  const ratio=pixelRatio;
  const originX=Math.floor((bounds.left-pad)*ratio)/ratio;
  const originY=Math.floor((bounds.top-pad)*ratio)/ratio;
  const endX=Math.ceil((bounds.right+pad)*ratio)/ratio;
  const endY=Math.ceil((bounds.bottom+pad)*ratio)/ratio;
  const width=Math.max(1,Math.ceil((endX-originX)*ratio));
  const height=Math.max(1,Math.ceil((endY-originY)*ratio));
  const localWidth=width/ratio,localHeight=height/ratio;
  const maskCanvas=document.createElement('canvas');maskCanvas.width=width;maskCanvas.height=height;
  const ctx=maskCanvas.getContext('2d',{willReadFrequently:true});
  if(!ctx)throw new Error('2D canvas is unavailable');
  ctx.scale(ratio,ratio);
  if(runs.length){ctx.fillStyle=paper;ctx.fillRect(0,0,localWidth,localHeight);}
  ctx.textBaseline='alphabetic';ctx.textAlign='left';
  const fontContext=ctx as CanvasRenderingContext2D & {fontKerning?:string;letterSpacing?:string};
  for(const run of runs){
    ctx.font=run.font;
    ctx.direction=run.direction;
    if(fontContext.fontKerning!==undefined)fontContext.fontKerning='normal';
    if(fontContext.letterSpacing!==undefined)fontContext.letterSpacing=run.letterSpacing;
    ctx.fillStyle=run.color;
    ctx.fillText(run.text,run.x-originX,run.top-originY);
  }
  if(runs.length){
    // Recover glyph coverage from the same warm-paper/dark-ink blend used by
    // the native page text. Drawing white onto transparency has a visibly
    // different antialias edge on some browser/GPU combinations.
    const channelValues=(color:string)=>{
      const values=color.match(/[\d.]+/g);
      if(!values||values.length<3)throw new Error(`Unsupported study text color: ${color}`);
      return values.slice(0,3).map(Number);
    };
    const paperRgb=[239,231,215];
    const inkRgb=channelValues(runs[0].color);
    const image=ctx.getImageData(0,0,width,height);
    const pixels=image.data;
    for(let i=0;i<pixels.length;i+=4){
      let coverage=0;
      for(let channel=0;channel<3;channel++){
        const span=paperRgb[channel]-inkRgb[channel];
        coverage+=span>0?(paperRgb[channel]-pixels[i+channel])/span:0;
      }
      const alpha=Math.round(Math.max(0,Math.min(1,coverage/3))*255);
      pixels[i]=pixels[i+1]=pixels[i+2]=255;
      pixels[i+3]=alpha;
    }
    ctx.putImageData(image,0,0);
  }
  ctx.fillStyle='#fff';
  for(const segment of segments){
    ctx.globalAlpha=segment.alpha;
    const snap=(value:number)=>Math.round(value*ratio)/ratio;
    const left=snap(Math.min(segment.x1,segment.x2));
    const right=snap(Math.max(segment.x1,segment.x2));
    const top=snap(Math.min(segment.y1,segment.y2)-segment.width/2);
    ctx.fillRect(left-originX,top-originY,right-left,segment.width);
  }
  ctx.globalAlpha=1;
  const {texture:field,sdfRange,seedRange}=createField(maskCanvas,ratio);
  const mask=new T.CanvasTexture(maskCanvas);
  mask.colorSpace=T.NoColorSpace;mask.minFilter=mask.magFilter=T.LinearFilter;mask.generateMipmaps=false;mask.needsUpdate=true;
  const uniforms={
    uMask:{value:mask},uField:{value:field},uSize:{value:new T.Vector2(localWidth,localHeight)},
    uPageOrigin:{value:new T.Vector2(window.scrollX+originX,window.scrollY+originY)},
    uProgress:{value:0},uSdfRange:{value:sdfRange},uSeedRange:{value:seedRange},
    uPoolRadius:{value:plan.poolDiameter/2},uPixelRatio:{value:ratio},uInk:{value:ink},
  };
  const material=new T.ShaderMaterial({vertexShader:shaderVertex,fragmentShader:shaderFragment,uniforms,
    transparent:true,depthTest:false,depthWrite:false,toneMapped:false,premultipliedAlpha:false});
  const geometry=new T.PlaneGeometry(localWidth,localHeight);
  const mesh=new T.Mesh(geometry,material);
  mesh.renderOrder=order;mesh.position.z=0;mesh.frustumCulled=false;scene.add(mesh);
  const anchor=block.id==='table'?block.element:plan.sources[0];
  const anchorRect=anchor.getBoundingClientRect();
  const layer:InkLayer={mesh,anchor,offsetX:originX-anchorRect.left,offsetY:originY-anchorRect.top,
    pageX:window.scrollX+originX,pageY:window.scrollY+originY,width:localWidth,height:localHeight,
    start:plan.start,duration:plan.duration,disposed:false};
  positionLayer(layer);
  return layer;
}

function positionLayer(layer:InkLayer){
  const rect=layer.anchor.getBoundingClientRect();
  layer.mesh.position.x=rect.left+layer.offsetX+layer.width/2;
  layer.mesh.position.y=window.innerHeight-(rect.top+layer.offsetY+layer.height/2);
}

function layerPlans(block:Block):LayerPlan[]{
  if(block.id==='heading')return [{sources:[block.element],start:0,duration:block.duration,poolDiameter:11,opacity:1}];
  if(block.id==='paragraph')return [{sources:[block.element],start:0,duration:block.duration,poolDiameter:6.4,opacity:1}];
  const table=block.element;
  const caption=table.querySelector<HTMLElement>('caption')!;
  const headings=table.querySelector<HTMLElement>('thead tr')!;
  const rows=[...table.querySelectorAll<HTMLElement>('tbody tr')];
  const segments=collectSegments(table);
  const plan:LayerPlan[]=[{sources:[],segments,start:0,duration:.78,poolDiameter:7.6,opacity:1}];
  plan.push({sources:[caption],start:.18,duration:.67,poolDiameter:6.8,opacity:1});
  plan.push({sources:[headings],start:.39,duration:.62,poolDiameter:6.8,opacity:1});
  rows.forEach((row,index)=>plan.push({sources:[row],start:.72+index*.215,duration:.62,poolDiameter:5.8,opacity:1}));
  return plan;
}

function buildBlock(block:Block){
  clearBlockLayers(block);
  block.elapsed=0;
  const plans=layerPlans(block);
  block.layers=[];
  plans.forEach((plan,index)=>block.layers.push(makeLayer(block,plan,index+1)));
  hideNative(block);
}

function setLayerProgress(block:Block){
  for(const layer of block.layers){
    const progress=Math.max(0,Math.min(1,(block.elapsed-layer.start)/layer.duration));
    layer.mesh.material.uniforms.uProgress.value=progress;
    positionLayer(layer);
  }
}

function completeBlock(block:Block){
  clearBlockLayers(block);
  block.elapsed=block.duration;
  setState(block,'complete');
}

function beginBlock(block:Block){
  if(block.state!=='waiting'||fallbackReason)return false;
  try {
    buildBlock(block);
    block.elapsed=0;block.lastTick=0;setState(block,isPaused?'paused':'active');
    return true;
  } catch(error) {
    console.warn('Ink study layer setup failed',error);
    fallback('setup-failed');
    return false;
  }
}

function currentVisibility(block:Block){
  const rect=block.element.getBoundingClientRect();
  return rect.bottom>0&&rect.top<window.innerHeight;
}

function scanTriggers(_now:number,replay=false){
  if(!fontsReady||fallbackReason)return;
  const started:Block[]=[];
  for(const block of blocks){
    if(block.state!=='waiting')continue;
    const rect=block.element.getBoundingClientRect();
    if(rect.top<=window.innerHeight*.8&&rect.bottom>0&&beginBlock(block))started.push(block);
  }
  if(replay)for(const block of blocks){
    if(block.state==='waiting'&&currentVisibility(block)&&block.element.getBoundingClientRect().top<=window.innerHeight*.8&&beginBlock(block))started.push(block);
  }
  const startTime=performance.now();
  for(const block of started)block.lastTick=startTime;
}

function render(){
  if(!renderer||!scene||!camera)return;
  renderer.render(scene,camera);
}

function frame(now:number){
  raf=0;
  if(isDisposed||fallbackReason||!renderer||!scene||!camera)return;
  let active=false;
  for(const block of blocks){
    if(block.state!=='active')continue;
    active=true;
    block.elapsed+=Math.max(0,(now-block.lastTick)/1000);
    block.lastTick=now;
    if(block.elapsed>=block.duration){completeBlock(block);continue;}
    setLayerProgress(block);
  }
  render();
  if(active&&blocks.some(block=>block.state==='active'))raf=requestAnimationFrame(frame);
}

function requestRender(){
  if(fallbackReason||isDisposed||raf)return;
  raf=requestAnimationFrame(frame);
}

function pause(){
  isPaused=true;
  const now=performance.now();
  for(const block of blocks){
    if(block.state!=='active')continue;
    block.elapsed+=Math.max(0,(now-block.lastTick)/1000);
    block.lastTick=now;
    if(block.elapsed>=block.duration){completeBlock(block);continue;}
    setLayerProgress(block);setState(block,'paused');
  }
  if(raf){cancelAnimationFrame(raf);raf=0;}
  pauseButton.textContent='Resume';pauseButton.setAttribute('aria-pressed','true');
  render();
}

function play(){
  if(fallbackReason||isDisposed)return;
  isPaused=false;
  let any=false;const resumed:Block[]=[];
  for(const block of blocks){
    if(block.state==='paused'){setState(block,'active');resumed.push(block);any=true;}
  }
  scanTriggers(performance.now());
  const now=performance.now();for(const block of resumed)block.lastTick=now;
  pauseButton.textContent='Pause';pauseButton.setAttribute('aria-pressed','false');
  if(any||blocks.some(block=>block.state==='active')){pauseButton.textContent='Pause';pauseButton.setAttribute('aria-pressed','false');requestRender();}
}

function replay(){
  if(!fontsReady||fallbackReason||isDisposed)return;
  isPaused=false;
  for(const block of blocks){
    clearBlockLayers(block);block.elapsed=0;block.lastTick=0;setState(block,'waiting');
  }
  pauseButton.textContent='Pause';pauseButton.setAttribute('aria-pressed','false');
  const now=performance.now();scanTriggers(now,true);requestRender();
}

function seek(id:string,seconds:number){
  const block=blocks.find(candidate=>candidate.id===id);
  if(!block||!fontsReady||fallbackReason||isDisposed||!Number.isFinite(seconds))return;
  pause();
  if(seconds>=block.duration){
    completeBlock(block);render();return;
  }
  if(block.state==='complete'||block.state==='waiting')buildBlock(block);
  block.elapsed=Math.max(0,seconds);
  block.lastTick=performance.now();setLayerProgress(block);setState(block,'paused');
  pauseButton.textContent='Resume';pauseButton.setAttribute('aria-pressed','true');
  render();
}

function onScroll(){
  if(fallbackReason||isDisposed)return;
  const now=performance.now();scanTriggers(now);requestRender();
}

function onResize(){
  if(fallbackReason||isDisposed)return;
  if(blocks.some(block=>block.state==='active'||block.state==='paused')){
    for(const block of blocks)if(block.state==='active'||block.state==='paused')completeBlock(block);
  }
  pixelRatio=Math.min(1.5,window.devicePixelRatio||1);
  if(renderer&&camera){
    camera.right=window.innerWidth;camera.top=window.innerHeight;camera.bottom=0;camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio);renderer.setSize(window.innerWidth,window.innerHeight,false);render();
  }
  scanTriggers(performance.now());
}

function diagnostics():InkStudyApi['diagnostics'] extends ()=>infer R?R:never{
  return {supported:!fallbackReason,fallback:fallbackReason,pixelRatio,
    blocks:blocks.map(block=>({id:block.id,state:block.state,progress:block.duration?Math.min(1,block.elapsed/block.duration):0,
      elapsedSeconds:block.elapsed,durationSeconds:block.duration})),
    activeRenderingCount:blocks.reduce((count,block)=>count+block.layers.filter(layer=>!layer.disposed).length,0),
    canvasPresent:Boolean(canvas?.isConnected)};
}

function dispose(){
  if(isDisposed)return;
  isDisposed=true;
  if(raf)cancelAnimationFrame(raf);raf=0;
  for(const block of blocks)clearBlockLayers(block);
  window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',onResize);
  replayButton.removeEventListener('click',replay);pauseButton.removeEventListener('click',togglePlayback);
  if(renderer){renderer.dispose();renderer=null;}
  if(canvas?.isConnected)canvas.remove();canvas=null;
}

function togglePlayback(){
  if(blocks.some(block=>block.state==='active'))pause();
  else play();
}

const api:InkStudyApi={replay,pause,play,seek,diagnostics,dispose};
if(new URLSearchParams(window.location.search).has('inspect'))window.inkStudy=api;

function initialize(){
  if(reducePreference){fallback('reduced-motion');return;}
  if(!supportsWebgl()){fallback('missing-webgl');return;}
  try {
    renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power',premultipliedAlpha:true});
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.NoToneMapping;
    renderer.setClearColor(paper,0);
    renderer.setPixelRatio(pixelRatio);renderer.setSize(window.innerWidth,window.innerHeight,false);
    renderer.debug.checkShaderErrors=true;
    renderer.debug.onShaderError=()=>{webglError='shader-error';fallback('setup-failed');};
    renderer.domElement.id='ink-study-canvas';renderer.domElement.setAttribute('aria-hidden','true');
    canvas=renderer.domElement;document.body.append(canvas);
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();fallback('context-lost');});
    camera=new T.OrthographicCamera(0,window.innerWidth,window.innerHeight,0,-10,10);
    scene=new T.Scene();
    const testMaterial=new T.ShaderMaterial({vertexShader:shaderVertex,fragmentShader:shaderFragment,uniforms:{
      uMask:{value:new T.Texture()},uField:{value:new T.Texture()},uSize:{value:new T.Vector2(1,1)},uPageOrigin:{value:new T.Vector2()},
      uProgress:{value:0},uSdfRange:{value:24},uSeedRange:{value:18},uPoolRadius:{value:4},uPixelRatio:{value:pixelRatio},uInk:{value:ink},
    },transparent:true,toneMapped:false});
    const testMesh=new T.Mesh(new T.PlaneGeometry(1,1),testMaterial);scene.add(testMesh);
    render();scene.remove(testMesh);testMesh.geometry.dispose();testMaterial.dispose();
    window.addEventListener('scroll',onScroll,{passive:true});window.addEventListener('resize',onResize,{passive:true});
    replayButton.addEventListener('click',replay);pauseButton.addEventListener('click',togglePlayback);
    fallbackMotion.addEventListener('change',event=>{if(event.matches)fallback('reduced-motion');});
    document.fonts.ready.then(()=>{
      if(isDisposed||fallbackReason)return;
      try {
        fontsReady=true;
        for(const block of blocks)hideNative(block);
        onScroll();
      } catch(error) {
        console.warn('Ink study font setup failed',error);
        fallback('setup-failed');
      }
    });
  } catch(error) {
    console.warn('Ink study renderer unavailable',error,webglError);
    fallback('setup-failed');
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});
else initialize();
