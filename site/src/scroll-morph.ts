import {branchAt} from './score';
import {ease,progress,lerp} from './numbers';
import {createHeaderInk} from './header-ink';
import {createTopBirds} from './top-birds';

interface MorphHooks {
  getState():{running:boolean;time:number;available:boolean};
  pause():void;
  play():void;
  setProgress(value:number):void;
}

/** The perch travels into navigation while the current drawing is absorbed in place. */
export function initScrollMorph(hooks:MorphHooks){
  const hero=document.getElementById('hero')!;
  const page=document.getElementById('page')!;
  const header=document.getElementById('masthead')!;
  const copy=document.getElementById('masthead-copy')!;
  const play=document.getElementById('play')!;
  const inkHeader=createHeaderInk(header,copy);
  const topBirds=createTopBirds(header);
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');svg.id='perch-morph';svg.setAttribute('aria-hidden','true');
  Object.assign(svg.style,{position:'fixed',inset:'0 auto auto 0',pointerEvents:'none',overflow:'visible',zIndex:'72'});
  const line=document.createElementNS(ns,'path'),echo=document.createElementNS(ns,'path');
  for(const path of [echo,line]){path.setAttribute('fill','none');path.setAttribute('stroke','#211c17');path.setAttribute('stroke-linecap','round');svg.append(path);}
  line.setAttribute('stroke-width','1.55');echo.setAttribute('stroke-width','.65');document.body.append(svg);
  let width=0,height=0,left=0,navHeight=70,span=1,p=0,queued=0,active=false,resume=false,enabled=true;
  function layout(){
    navHeight=innerWidth<650?58:70;
    width=Math.min(innerWidth,Math.max(320,innerHeight)*16/9);height=width*9/16;left=(innerWidth-width)/2;
    span=Math.max(160,Math.min(430,height*.65));
    document.documentElement.style.setProperty('--nav-height',`${navHeight}px`);
    document.documentElement.style.setProperty('--hero-height',`${height}px`);
    hero.style.height=`${height}px`;
    Object.assign(page.style,{position:'fixed',left:`${left}px`,top:'0px',width:`${width}px`,height:`${height}px`,margin:'0',zIndex:'20'});
    svg.setAttribute('viewBox',`0 0 ${innerWidth} ${Math.max(height,navHeight)}`);
    svg.style.width=`${innerWidth}px`;svg.style.height=`${Math.max(height,navHeight)}px`;
    inkHeader.resize();
    topBirds.resize();
    update();
  }
  function update(){
    queued=0;const next=ease(progress(scrollY,0,span));
    if(next>0&&!active){resume=hooks.getState().running;hooks.pause();active=true;}
    p=next;
    if(active&&p===0){active=false;hooks.setProgress(0);if(resume&&enabled)hooks.play();}
    else hooks.setProgress(p);
    inkHeader.setWanted(scrollY>18,enabled);
    const clip=lerp(height,navHeight,p);
    page.style.clipPath=`inset(0 0 ${Math.max(0,height-clip)}px 0)`;
    page.style.visibility=p>.995?'hidden':'visible';
    play.style.opacity=String(1-ease(progress(p,0,.16)));play.style.pointerEvents=p>.05?'none':'auto';
    const fade=ease(progress(p,0,.11));svg.style.opacity=String(fade);
    const blend=ease(progress(p,.07,1));
    topBirds.setProgress(ease(progress(blend,.78,1)),enabled,scrollY>18);
    const wordmark=header.querySelector<HTMLElement>('.wordmark');
    const firstLink=header.querySelector<HTMLElement>('nav a');
    const safeInset=innerWidth<650?4:10;
    const gapStart=Math.min(innerWidth,Math.max(0,(wordmark?.getBoundingClientRect().right??innerWidth*.4)+safeInset));
    const gapEnd=Math.max(gapStart,Math.min(innerWidth,(firstLink?.getBoundingClientRect().left??innerWidth*.6)-safeInset));
    const gapCenter=(gapStart+gapEnd)/2;
    const mobile=innerWidth<650,perchY=mobile?43:52;
    const navScale=mobile?Math.max(.08,Math.min(.138,.1+(innerWidth-320)*.000543)):.28;
    const birdHalf=navScale*(mobile?.65*60:100);
    const perchLength=Math.min(mobile?Math.max(0,gapEnd-gapStart-birdHalf*2):268,Math.max(0,gapEnd-gapStart));
    const perchStart=gapCenter-perchLength/2,perchEnd=gapCenter+perchLength/2;
    let d='',under='';
    for(let i=0;i<=90;i++){
      const u=i/90,x=155+u*1290;
      const sx=left+x*width/1600,sy=branchAt(x)*height/900;
      const targetX=perchStart+u*(perchEnd-perchStart);
      const targetY=perchY+Math.sin(u*Math.PI*2.6)*.35;
      const px=lerp(sx,targetX,blend),py=lerp(sy,targetY,blend);
      d+=`${i?'L':'M'}${px.toFixed(2)} ${py.toFixed(2)} `;
      under+=`${i?'L':'M'}${px.toFixed(2)} ${(py+lerp(3.1,1,blend)*(1-u*.8)).toFixed(2)} `;
    }
    line.setAttribute('d',d);echo.setAttribute('d',under);echo.setAttribute('opacity',String(.3*(1-blend)));
    // A compact static navigation is used when decorative motion is disabled.
    if(!enabled){page.style.visibility=p>0?'hidden':'visible';svg.style.opacity=p>0?'1':'0';line.setAttribute('d',`M${perchStart} ${perchY} H${perchEnd}`);echo.setAttribute('opacity','0');}
  }
  const schedule=()=>{if(!queued)queued=requestAnimationFrame(update);};
  function motion(event:Event){enabled=(event as CustomEvent<{enabled:boolean}>).detail.enabled;if(!enabled){resume=false;hooks.pause();}else if(active)resume=true;schedule();}
  function visibility(){if(document.hidden){if(!active)resume=hooks.getState().running;hooks.pause();}else if(!active&&resume&&enabled)hooks.play();}
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',layout);
  window.addEventListener('perch:motion',motion);document.addEventListener('visibilitychange',visibility);
  layout();
  return {refresh:layout,progress:()=>p,dispose(){cancelAnimationFrame(queued);window.removeEventListener('scroll',schedule);window.removeEventListener('resize',layout);window.removeEventListener('perch:motion',motion);document.removeEventListener('visibilitychange',visibility);topBirds.dispose();inkHeader.dispose();svg.remove();}};
}
