import {CAST,SETTINGS} from './config';
import {paintBird} from './birds';
import {birdAt} from './score';
import {ease,progress} from './numbers';

const ART_WIDTH=240,ART_HEIGHT=160,ORIGIN_X=120,ORIGIN_Y=160;
const NAV_CAST=CAST.slice(0,6);

/** Six of the original birds settle between the wordmark and navigation links. */
export function createTopBirds(header:HTMLElement){
  const canvas=document.createElement('canvas');canvas.id='top-birds';canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'fixed',top:'0',left:'0',pointerEvents:'none',overflow:'visible',zIndex:'73'});
  document.body.append(canvas);
  const ctx=canvas.getContext('2d')!;
  const ratio=Math.min(devicePixelRatio||1,2);
  let width=1,height=70,scale=.28,scaleX=.28,perchY=52,gapStart=0,gapEnd=1,lineProgress=0,enabled=true,frame=0,lastPaint=0;
  const art=NAV_CAST.map(()=>document.createElement('canvas'));
  const shapeMasks=NAV_CAST.map(()=>document.createElement('canvas'));
  const revealMasks=NAV_CAST.map(()=>document.createElement('canvas'));
  const artContexts=art.map(c=>c.getContext('2d')!);
  const shapeContexts=shapeMasks.map(c=>c.getContext('2d')!);
  const revealContexts=revealMasks.map(c=>c.getContext('2d')!);
  function blot(c:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,seed:number){
    if(rx<.2||ry<.2)return;
    c.beginPath();
    for(let i=0;i<=64;i++){
      const a=i/64*Math.PI*2;
      const edge=1+.12*Math.sin(a*5+seed)+.06*Math.sin(a*9-seed*.8)+.035*Math.sin(a*15+seed*1.7);
      const px=x+Math.cos(a)*rx*edge,py=y+Math.sin(a)*ry*edge;
      if(i)c.lineTo(px,py);else c.moveTo(px,py);
    }
    c.closePath();c.fill();
  }

  function layout(){
    width=innerWidth;height=width<650?58:70;
    const wordmark=header.querySelector<HTMLElement>('.wordmark');
    const firstLink=header.querySelector<HTMLElement>('nav a');
    const safeInset=width<650?4:10;
    gapStart=Math.min(width,Math.max(0,(wordmark?.getBoundingClientRect().right??width*.4)+safeInset));
    gapEnd=Math.max(gapStart,Math.min(width,(firstLink?.getBoundingClientRect().left??width*.6)-safeInset));
    perchY=width<650?43:52;
    scale=width<650?Math.max(.08,Math.min(.138,.1+(width-320)*.000543)):.28;
    scaleX=width<650?scale*.65:scale;
    canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio);
    canvas.style.width=`${width}px`;canvas.style.height=`${height}px`;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    for(let i=0;i<NAV_CAST.length;i++){
      for(const c of [art[i],shapeMasks[i],revealMasks[i]]){
        c.width=Math.ceil(ART_WIDTH*ratio);c.height=Math.ceil(ART_HEIGHT*ratio);
      }
      artContexts[i].setTransform(ratio,0,0,ratio,0,0);
      shapeContexts[i].setTransform(ratio,0,0,ratio,0,0);
      revealContexts[i].setTransform(ratio,0,0,ratio,0,0);
    }
    paint(readHeaderProgress());
  }

  function drawBird(i:number,reveal:number){
    const ac=artContexts[i],sc=shapeContexts[i],rc=revealContexts[i],b=NAV_CAST[i];
    ac.clearRect(0,0,ART_WIDTH,ART_HEIGHT);sc.clearRect(0,0,ART_WIDTH,ART_HEIGHT);rc.clearRect(0,0,ART_WIDTH,ART_HEIGHT);
    if(reveal<=0)return;

    if(width<650){
      paintCompactBird(ac,b.face);paintCompactBird(sc,b.face);
    }else{
      const authored=birdAt(i,34.35);
      const pose={...authored,spread:0,flap:0,pitch:0,facing:b.face,
        feet:[[-11,0],[12,0]] as [number,number][]};
      ac.save();sc.save();
      for(const c of [ac,sc]){c.translate(ORIGIN_X,ORIGIN_Y);c.scale(scale,scale);}
      paintBird(ac,sc,b,pose);ac.restore();sc.restore();
    }
    ac.save();ac.globalCompositeOperation='source-in';ac.fillStyle=SETTINGS.ink;ac.fillRect(0,0,ART_WIDTH,ART_HEIGHT);ac.restore();

    rc.fillStyle='#000';
    // Toe pools appear first; overlapping irregular fronts spread into the body and wings.
    const toe=ease(progress(reveal,0,.35));
    blot(rc,ORIGIN_X,ORIGIN_Y-1,(4+18*scaleX)*toe,(1.8+5*scale)*toe,b.seed*.71);
    const body=ease(progress(reveal,0,.94));
    blot(rc,ORIGIN_X,ORIGIN_Y-13*scale,108*scaleX*body,48*scale*body,b.seed*1.13);
    const wing=ease(progress(reveal,.1,.96));
    blot(rc,ORIGIN_X-13*scaleX,ORIGIN_Y-24*scale,68*scaleX*wing,31*scale*wing,b.seed*1.71);
    const head=ease(progress(reveal,.2,.88));
    blot(rc,ORIGIN_X+24*scaleX*b.face,ORIGIN_Y-62*scale,47*scaleX*head,52*scale*head,b.seed*2.19);

    ac.save();ac.globalCompositeOperation='destination-in';ac.drawImage(revealMasks[i],0,0,ART_WIDTH*ratio,ART_HEIGHT*ratio,0,0,ART_WIDTH,ART_HEIGHT);ac.restore();
    const halfBird=scaleX*(width<650?60:100);
    const gapWidth=Math.max(0,gapEnd-gapStart);
    const availableSpan=Math.max(0,gapWidth-halfBird*2);
    const centerSpan=width<650?availableSpan:Math.min(268,availableSpan);
    const center=(gapStart+gapEnd)/2;
    const x=center+(i/(NAV_CAST.length-1)-.5)*centerSpan;
    const y=perchY-ART_HEIGHT;
    const target=[x-ORIGIN_X,y,ART_WIDTH,ART_HEIGHT] as const;
    ctx.drawImage(art[i],0,0,ART_WIDTH*ratio,ART_HEIGHT*ratio,...target);
    // Re-pass the same transparent ink to strengthen subpixel strokes without a halo.
    ctx.save();ctx.globalAlpha=.72;
    ctx.drawImage(art[i],0,0,ART_WIDTH*ratio,ART_HEIGHT*ratio,...target);
    ctx.restore();
  }

  function paintCompactBird(c:CanvasRenderingContext2D,facing:number){
    c.save();c.translate(ORIGIN_X,ORIGIN_Y);c.scale(scaleX,scale);
    c.fillStyle=SETTINGS.ink;c.strokeStyle=SETTINGS.ink;c.lineCap='round';c.lineJoin='round';
    c.beginPath();c.ellipse(0,-52,43,27,-.08,0,Math.PI*2);c.fill();
    c.beginPath();c.moveTo(-30*facing,-49);c.lineTo(-59*facing,-65);c.lineTo(-53*facing,-39);c.closePath();c.fill();
    c.beginPath();c.ellipse(28*facing,-90,18,16,-.08*facing,0,Math.PI*2);c.fill();
    c.beginPath();c.moveTo(42*facing,-92);c.lineTo(59*facing,-87);c.lineTo(42*facing,-83);c.closePath();c.fill();
    c.beginPath();c.ellipse(4,-56,27,13,-.2,0,Math.PI*2);c.strokeStyle='#efe7d7';c.lineWidth=5.5;c.stroke();
    c.beginPath();c.arc(34*facing,-94,3,0,Math.PI*2);c.fillStyle='#efe7d7';c.fill();
    c.beginPath();c.moveTo(-8,-28);c.lineTo(-11,-1);c.moveTo(9,-28);c.lineTo(12,-1);c.strokeStyle=SETTINGS.ink;c.lineWidth=5;c.stroke();
    c.beginPath();c.moveTo(-16,0);c.lineTo(-5,0);c.moveTo(7,0);c.lineTo(18,0);c.stroke();
    c.restore();
  }

  function readHeaderProgress(){
    const parsed=Number(header.dataset.inkProgress||0);
    return Math.max(0,Math.min(1,Number.isFinite(parsed)?parsed:0));
  }

  function paint(headerProgress:number){
    ctx.clearRect(0,0,width,height);
    const reveal=Math.min(lineProgress,headerProgress);
    canvas.style.visibility=reveal>0?'visible':'hidden';
    if(reveal<=0)return;
    for(let i=0;i<NAV_CAST.length;i++){
      const delay=i*.022;
      const birdProgress=Math.max(0,Math.min(1,(reveal-delay)/(1-delay)));
      drawBird(i,birdProgress);
    }
  }

  function animate(now:number){
    frame=0;
    if(now-lastPaint>=1000/30||lineProgress===0){paint(readHeaderProgress());lastPaint=now;}
    const ink=readHeaderProgress();
    if(enabled&&((lineProgress>0&&(lineProgress<1||ink<1))||(ink>0&&ink<1)))frame=requestAnimationFrame(animate);
  }
  function setProgress(value:number,motion:boolean,scrolled:boolean){
    enabled=motion;
    lineProgress=motion?Math.max(0,Math.min(1,value)):(scrolled?1:0);
    if(!motion){cancelAnimationFrame(frame);frame=0;paint(readHeaderProgress());return;}
    if(!frame){frame=requestAnimationFrame(animate);}
  }

  layout();
  return {resize:layout,setProgress,dispose(){cancelAnimationFrame(frame);canvas.remove();}};
}
