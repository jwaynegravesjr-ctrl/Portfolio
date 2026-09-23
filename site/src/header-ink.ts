import {ease,progress,lerp} from './numbers';

/** Real HTML lettering emerges through seeded wet shapes; it is never opacity-faded. */
export function createHeaderInk(header:HTMLElement,copy:HTMLElement){
  const canvas=document.createElement('canvas');canvas.id='header-ink';canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{position:'absolute',inset:'0',pointerEvents:'none',width:'100%',height:'100%'});
  header.prepend(canvas);header.dataset.inkHeader='true';
  const c=canvas.getContext('2d')!;
  const mask=document.createElement('canvas'),m=mask.getContext('2d')!;
  let width=1,height=76,copyLeft=0,copyTop=0,copyWidth=1,copyHeight=1;
  let value=0,target=0,from=0,started=0,duration=1650,frame=0,lastPaint=0;
  let seeds:{x:number;y:number;rx:number;ry:number;delay:number;seed:number}[]=[];
  const random=(n:number)=>{const v=Math.sin(n*127.1+83.9)*43758.5453;return v-Math.floor(v);};

  function patch(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,seed:number){
    ctx.beginPath();
    for(let i=0;i<=64;i++){
      const angle=i/64*Math.PI*2;
      const edge=1+.09*Math.sin(angle*5+seed)+.045*Math.sin(angle*11-seed)+.023*Math.sin(angle*19+seed*2);
      const px=x+Math.cos(angle)*rx*edge,py=y+Math.sin(angle)*ry*edge;
      if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);
    }
    ctx.closePath();ctx.fill();
  }

  function paint(){
    c.clearRect(0,0,width,height);m.clearRect(0,0,copyWidth,copyHeight);
    header.dataset.inkProgress=value.toFixed(3);
    document.documentElement.style.setProperty('--nav-progress',String(value));
    header.style.backgroundColor='transparent';
    copy.style.opacity='1';copy.style.visibility=value>0?'visible':'hidden';
    copy.inert=value<.58;copy.setAttribute('aria-hidden',value<.58?'true':'false');
    header.style.pointerEvents=value>=.58?'auto':'none';
    canvas.style.visibility=value>0?'visible':'hidden';
    if(value===0){copy.style.maskImage='none';copy.style.webkitMaskImage='none';return;}

    // The paper backing collects in broad irregular patches before the lettering.
    const paper=ease(progress(value,0,.36));c.fillStyle='#efe7d7';
    if(paper>.995)c.fillRect(0,0,width,height);
    else for(let i=0;i<7;i++)patch(c,width*(i+.35)/6.5,height*.5,width*.21*paper,height*1.8*paper,i*1.71);

    m.fillStyle='#000';
    for(const s of seeds){
      const age=progress(value,s.delay,.93),growth=ease(age);
      // Overlapping fronts spread across letters, including their full cap height.
      patch(m,s.x,s.y,s.rx*growth,s.ry*growth,s.seed);
      const pool=ease(progress(age,0,.08))*(1-ease(progress(age,.19,.54)));
      if(pool>.001){
        const x=copyLeft+s.x,y=copyTop+s.y,r=5.8*pool;
        c.fillStyle='rgba(86,66,44,.15)';patch(c,x+1.5,y,r*1.65,r*.76,s.seed);
        c.fillStyle='rgba(33,28,23,.82)';patch(c,x,y,r,r*.8,s.seed);
      }
    }
    const image=value>.985?'none':`url("${mask.toDataURL('image/png')}")`;
    copy.style.maskImage=image;copy.style.webkitMaskImage=image;
    copy.style.maskSize='100% 100%';copy.style.maskRepeat='no-repeat';
  }

  function resize(){
    const bounds=header.getBoundingClientRect(),box=copy.getBoundingClientRect();
    width=bounds.width;height=bounds.height;copyWidth=Math.max(1,box.width);copyHeight=Math.max(1,box.height);
    copyLeft=box.left-bounds.left;copyTop=box.top-bounds.top;
    const ratio=Math.min(devicePixelRatio||1,1.5);
    canvas.width=Math.ceil(width*ratio);canvas.height=Math.ceil(height*ratio);c.setTransform(ratio,0,0,ratio,0,0);
    mask.width=Math.ceil(copyWidth);mask.height=Math.ceil(copyHeight);
    seeds=[];
    [...copy.querySelectorAll('a')].forEach((link,group)=>{
      const range=document.createRange();range.selectNodeContents(link);const rect=range.getBoundingClientRect();
      const count=Math.max(2,Math.round(rect.width/52));
      for(let i=0;i<count;i++)seeds.push({
        x:rect.left-box.left+rect.width*(i+.5)/count,y:rect.top-box.top+rect.height*.54,
        rx:rect.width/count*.95+8,ry:Math.max(16,rect.height*1.1),
        delay:group*.065+random(group*11+i)*.075,seed:group*1.91+i*2.31,
      });
      range.detach();
    });
    paint();
  }

  function animate(now:number){
    frame=0;const t=progress(now,started,started+duration);value=lerp(from,target,t);
    if(now-lastPaint>1000/30||t===1){paint();lastPaint=now;}
    if(t<1)frame=requestAnimationFrame(animate);
  }
  function setWanted(wanted:boolean,motion:boolean){
    const next=wanted?1:0;
    if(!motion){cancelAnimationFrame(frame);frame=0;target=next;value=next;paint();return;}
    if(next===target)return;
    cancelAnimationFrame(frame);from=value;target=next;started=performance.now();
    duration=(next?1650:700)*Math.abs(target-from);lastPaint=0;frame=requestAnimationFrame(animate);
  }
  // A keyboard focus request can never leave an actionable link masked.
  function focus(){if(target){cancelAnimationFrame(frame);frame=0;value=1;paint();}}
  copy.addEventListener('focusin',focus);resize();
  return {resize,setWanted,dispose(){cancelAnimationFrame(frame);copy.removeEventListener('focusin',focus);canvas.remove();}};
}
