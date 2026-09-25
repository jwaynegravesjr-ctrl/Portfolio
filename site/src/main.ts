import * as T from 'three';
import { CONFIG, nameAmount, titleAmount, remainingDebris, useTableObservations } from './approved-timeline';
import { inspectArtwork, renderChart, renderHero, setupHero } from './approved-art';
import { initScrollMorph } from './scroll-morph';
import { initSiteEffects } from './site-effects';

type State = 'unstarted' | 'playing' | 'paused' | 'completed';
type Draw = (context: CanvasRenderingContext2D, width: number, height: number, time: number) => void;

/** One drawing surface per component; WebGL adds a fixed-page grain to the Canvas artwork. */
class InkSurface {
  readonly source = document.createElement('canvas');
  readonly fallback = document.createElement('canvas');
  readonly context = this.source.getContext('2d', { alpha:false })!;
  readonly fallbackContext = this.fallback.getContext('2d', { alpha:false })!;
  renderer?: T.WebGLRenderer;
  texture?: T.CanvasTexture;
  material?: T.ShaderMaterial;
  mesh?: T.Mesh;
  scene?: T.Scene;
  camera?: T.OrthographicCamera;
  lost = false;
  width = 0; height = 0; ratio = 1; time = 0;
  private lostHandler?: (event: Event) => void;
  private restoredHandler?: (event: Event) => void;
  constructor(readonly element: HTMLElement, readonly draw: Draw, readonly resized?: (width:number,height:number,ratio:number)=>void) {
    this.fallback.setAttribute('aria-hidden','true');
    this.element.dataset.renderer='canvas';
    this.element.append(this.fallback);
    this.resize();
    if (!new URLSearchParams(location.search).has('canvas')) this.upgrade();
  }
  resize() {
    const rect = this.element.getBoundingClientRect();
    const width = Math.round(rect.width), height = Math.round(rect.height);
    const ratio = Math.min(devicePixelRatio || 1, CONFIG.maxDpr);
    if (!width || !height || (width === this.width && height === this.height && ratio === this.ratio)) return false;
    this.width = width; this.height = height; this.ratio = ratio;
    this.source.width = this.fallback.width = Math.round(width * ratio);
    this.source.height = this.fallback.height = Math.round(height * ratio);
    this.resized?.(width,height,ratio);
    if (this.renderer && this.material && this.texture) {
      this.renderer.setPixelRatio(ratio); this.renderer.setSize(width,height,false);
      (this.material.uniforms.uResolution.value as T.Vector2).set(this.source.width,this.source.height);
      this.texture.needsUpdate = true;
    }
    return true;
  }
  render(time:number) {
    this.time = time;
    const context = this.context;
    context.setTransform(this.ratio,0,0,this.ratio,0,0);
    context.globalAlpha = 1; context.globalCompositeOperation = 'source-over';
    context.fillStyle = this.element.id === 'hero-stage' ? CONFIG.heroPaper : CONFIG.paper;
    context.fillRect(0,0,this.width,this.height);
    context.lineCap = 'round'; context.lineJoin = 'round';
    this.draw(context,this.width,this.height,time);
    if (this.renderer && !this.lost && this.texture) {
      try {
        this.texture.needsUpdate = true;
        this.renderer.render(this.scene!,this.camera!);
      } catch (error) { this.disable(error); }
    }
    if (!this.renderer || this.lost) {
      this.fallbackContext.setTransform(1,0,0,1,0,0);
      this.fallbackContext.drawImage(this.source,0,0);
    }
  }
  private disable(error:unknown) {
    this.lost = true;
    if (this.renderer) this.renderer.domElement.style.display = 'none';
    this.fallback.style.visibility = 'visible';
    this.fallbackContext.drawImage(this.source,0,0);
    this.element.dataset.renderer = 'canvas';
    console.warn('Ink illustration is using Canvas rendering.', error);
  }
  private upgrade() {
    let renderer:T.WebGLRenderer|undefined;
    try {
      renderer = new T.WebGLRenderer({ alpha:false, antialias:false, powerPreference:'low-power' });
      renderer.outputColorSpace = T.LinearSRGBColorSpace; renderer.toneMapping = T.NoToneMapping;
      renderer.setPixelRatio(this.ratio); renderer.setSize(this.width,this.height,false);
      renderer.debug.checkShaderErrors = true;
      renderer.debug.onShaderError = (gl,program,vertex,fragment) => {
        console.error('Ink shader error', gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment));
        this.disable('shader error');
      };
      const texture = new T.CanvasTexture(this.source);
      texture.minFilter = texture.magFilter = T.LinearFilter;
      texture.generateMipmaps = false; texture.colorSpace = T.NoColorSpace;
      const material = new T.ShaderMaterial({
        depthTest:false, depthWrite:false,
        uniforms:{ uTex:{value:texture}, uResolution:{value:new T.Vector2(this.source.width,this.source.height)} },
        vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
        fragmentShader:`precision highp float;varying vec2 vUv;uniform sampler2D uTex;uniform vec2 uResolution;
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          void main(){vec2 px=1./uResolution;vec3 c=texture2D(uTex,vUv).rgb;
            float lum=dot(c,vec3(.299,.587,.114));float grain=hash(floor(vUv*uResolution));
            float edge=abs(lum-dot(texture2D(uTex,vUv+px*vec2(.65,.4)).rgb,vec3(.299,.587,.114)));
            c-=vec3(edge*.075*(.3+grain));c+=vec3((grain-.5)*.009*(.35+lum));
            gl_FragColor=vec4(clamp(c,0.,1.),1.);}`,
      });
      const scene = new T.Scene(), camera = new T.OrthographicCamera(-1,1,1,-1,0,1);
      const mesh = new T.Mesh(new T.PlaneGeometry(2,2),material); scene.add(mesh);
      renderer.domElement.setAttribute('aria-hidden','true'); this.element.append(renderer.domElement);
      this.renderer=renderer; this.texture=texture; this.material=material; this.mesh=mesh; this.scene=scene; this.camera=camera;
      this.fallback.style.visibility='hidden'; this.element.dataset.renderer='webgl';
      this.lostHandler=(event:Event)=>{ event.preventDefault(); this.disable('WebGL context lost'); };
      renderer.domElement.addEventListener('webglcontextlost',this.lostHandler);
      this.restoredHandler=()=>{this.lost=false;renderer!.domElement.style.display='block';this.fallback.style.visibility='hidden';this.render(this.time);};
      renderer.domElement.addEventListener('webglcontextrestored',this.restoredHandler);
    } catch(error) { renderer?.dispose(); this.disable(error); }
  }
  dispose() {
    if(this.lostHandler) this.renderer?.domElement.removeEventListener('webglcontextlost',this.lostHandler);
    if(this.restoredHandler) this.renderer?.domElement.removeEventListener('webglcontextrestored',this.restoredHandler);
    this.mesh?.geometry.dispose(); this.material?.dispose(); this.texture?.dispose(); this.renderer?.dispose();
    this.renderer?.domElement.remove(); this.fallback.remove();
  }
}

type Clock = { name:'hero'|'chart'; surface:InkSurface; duration:number; time:number; state:State; held:boolean; threshold:number };
const heroElement=document.getElementById('hero')!;
const chartElement=document.getElementById('chart-panel')!;
const heroSurface=new InkSurface(document.getElementById('hero-stage')!,renderHero,setupHero);
const chartSurface=new InkSurface(document.getElementById('chart-stage')!,
  (context,width,height,time)=>renderChart(context,width,height,time*CONFIG.chartSpeed));
const hero:Clock={name:'hero',surface:heroSurface,duration:CONFIG.duration,time:0,state:'unstarted',held:false,threshold:.1};
const chart:Clock={name:'chart',surface:chartSurface,duration:CONFIG.chartDuration,time:0,state:'unstarted',held:false,threshold:.28};
const clocks=[hero,chart];
const effects=initSiteEffects();
const morph=initScrollMorph();
const table=document.querySelector<HTMLTableElement>('#impact-table table')!;
const discrepancy=useTableObservations(table);
if(discrepancy.length) console.warn('Monthly chart/table mismatch with approved reference:',discrepancy);
let raf=0,last=0,globalPaused=false,tableHeld=false,disposed=false;
const listeners:Array<()=>void>=[];
function on(target:EventTarget,type:string,handler:EventListener,options?:AddEventListenerOptions){
  target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options));
}
const button=(id:string)=>document.getElementById(id) as HTMLButtonElement;
const chartButton=button('graph-pause'), tableButton=button('table-pause');

function visible(clock:Clock) {
  const rect=(clock.name==='hero'?heroElement:chartElement).getBoundingClientRect();
  return rect.bottom>innerHeight*clock.threshold && rect.top<innerHeight*(1-clock.threshold);
}
function setLabels() {
  chartButton.textContent=chart.held?'Resume graph':'Pause graph';
  chartButton.setAttribute('aria-label',chartButton.textContent+' animation');
  tableButton.textContent=tableHeld?'Resume table':'Pause table';
  tableButton.setAttribute('aria-label',tableButton.textContent+' animation');
}
function paint(clock:Clock) {
  clock.surface.render(clock.time);
  (clock.name==='hero'?heroElement:chartElement).classList.add('approved-ink-ready');
  setLabels();
}
function syncClock(clock:Clock,delta:number) {
  if(clock.state==='completed')return false;
  if(!effects.motionEnabled()) {
    clock.time=clock.duration;clock.state='completed';paint(clock);return false;
  }
  if(globalPaused||clock.held||document.hidden||!visible(clock)) {
    if(clock.state==='playing')clock.state='paused';
    return false;
  }
  if(clock.state==='unstarted'||clock.state==='paused') clock.state='playing';
  if(delta>0) {
    clock.time=Math.min(clock.duration,clock.time+delta);
    if(clock.time>=clock.duration)clock.state='completed';
    paint(clock);
  }
  return clock.state==='playing';
}
function frame(now:number) {
  raf=0;if(disposed||document.hidden){last=0;return;}
  const delta=last?Math.min(.08,Math.max(0,(now-last)/1000)):0;last=now;
  const active=clocks.map(clock=>syncClock(clock,delta)).some(Boolean);
  if(active)raf=requestAnimationFrame(frame);else last=0;
}
function schedule() {if(!raf&&!document.hidden&&!disposed){last=0;raf=requestAnimationFrame(frame);}}
function seek(target:'hero'|'chart',seconds:number) {
  const clock=target==='hero'?hero:chart;
  clock.time=Math.max(0,Math.min(clock.duration,seconds));
  clock.state=clock.time===clock.duration?'completed':'paused';
  clock.held=true;paint(clock);setLabels();
}
function replay(target:'hero'|'chart'|'table'='hero') {
  if(target==='table'){tableHeld=false;effects.ink.replay('impact-table');setLabels();return;}
  const clock=target==='hero'?hero:chart;
  clock.time=0;clock.state='unstarted';clock.held=false;paint(clock);schedule();
}
function pause(){globalPaused=true;effects.ink.pause();last=0;setLabels();}
function resume(){globalPaused=false;effects.ink.play();last=0;setLabels();schedule();}
function inspect() {return {hero:{state:hero.state,time:hero.time,duration:hero.duration,nameInk:nameAmount(hero.time),titleInk:titleAmount(hero.time),
  nameVisible:nameAmount(hero.time)>.001,nameFullyFormed:nameAmount(hero.time)>.997,titleVisible:titleAmount(hero.time)>.001,
  remainingDebris:remainingDebris(hero.time),artwork:inspectArtwork(hero.time),renderer:heroSurface.element.dataset.renderer},
  chart:{state:chart.state,time:chart.time,duration:chart.duration,renderer:chartSurface.element.dataset.renderer},
  table:effects.ink.diagnostics().blocks.find(block=>block.id==='impact-table'),discrepancy,globalPaused};}
declare global {interface Window {PortfolioInk?:{seek:(target:'hero'|'chart',seconds:number)=>void;replay:(target?:'hero'|'chart'|'table')=>void;pause:()=>void;resume:()=>void;inspect:typeof inspect}}}
window.PortfolioInk={seek,replay,pause,resume,inspect};
on(chartButton,'click',()=>{if(chart.state==='completed')return;chart.held=!chart.held;if(chart.held&&chart.state==='playing')chart.state='paused';setLabels();schedule();});
on(button('replay-chart'),'click',()=>replay('chart'));
on(tableButton,'click',()=>{tableHeld=!tableHeld;if(tableHeld)effects.ink.pause('impact-table');else effects.ink.play('impact-table');setLabels();});
on(button('replay-table'),'click',()=>replay('table'));
const resizeObserver=new ResizeObserver(()=>{for(const clock of clocks)if(clock.surface.resize())paint(clock);morph.refresh();schedule();});
resizeObserver.observe(heroSurface.element);resizeObserver.observe(chartSurface.element);
on(window,'scroll',schedule,{passive:true});
on(document,'visibilitychange',()=>{last=0;if(!document.hidden)schedule();});
on(window,'perch:motion',()=>{last=0;for(const clock of clocks){if(!effects.motionEnabled()){clock.time=clock.duration;clock.state='completed';paint(clock);}}schedule();});
on(window,'beforeprint',()=>{for(const clock of clocks){clock.time=clock.duration;clock.state='completed';paint(clock);}});
for(const clock of clocks)paint(clock);
schedule();
export function dispose(){disposed=true;cancelAnimationFrame(raf);resizeObserver.disconnect();listeners.forEach(remove=>remove());morph.dispose();effects.dispose();clocks.forEach(clock=>clock.surface.dispose());delete window.PortfolioInk;}
