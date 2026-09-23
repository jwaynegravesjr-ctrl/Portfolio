import {SETTINGS,STYLE} from './config';import {rng} from './numbers';import {branchAt} from './score';
export interface Surface {ink:HTMLCanvasElement;mask:HTMLCanvasElement;c:CanvasRenderingContext2D;m:CanvasRenderingContext2D;width:number;height:number}
export function surface(w:number,h:number):Surface{const ink=document.createElement('canvas'),mask=document.createElement('canvas');ink.width=w*2;ink.height=h*2;mask.width=w;mask.height=h;const c=ink.getContext('2d')!,m=mask.getContext('2d')!;c.scale(2,2);return {ink,mask,c,m,width:w,height:h};}
export function wipe(s:Surface){s.c.clearRect(0,0,s.width,s.height);s.m.clearRect(0,0,s.width,s.height);}
function stroke(c:CanvasRenderingContext2D,path:Path2D,width:number,alpha:number){c.strokeStyle=`rgba(0,0,0,${alpha})`;c.lineWidth=width;c.lineJoin='round';c.lineCap='round';c.stroke(path);}
export function branchDrawing(s:Surface,t:number,flowers=false){
  wipe(s);const {c,m}=s;for(const ctx of [c,m]){ctx.save();ctx.translate(0,-360);}
  if(!flowers){
    const contour=new Path2D(),lower=new Path2D();contour.moveTo(155,branchAt(155,t));lower.moveTo(157,branchAt(157,t)+4.5);
    for(let x=159;x<=1445;x+=4){contour.lineTo(x,branchAt(x,t));lower.lineTo(x,branchAt(x,t)+4.6*Math.pow((1448-x)/1293,.7));}
    stroke(c,contour,1.7*STYLE.branch,.85);stroke(c,lower,.65*STYLE.branch,.5);stroke(m,contour,5,1);
    const fork=['M 831 547 Q 826 516 840 489 C 854 464 850 438 845 411','M 839 491 Q 823 468 808 444','M 851 455 Q 868 438 881 432','M 198 559 Q 192 580 176 586','M 1280 543 Q 1290 559 1306 565'];
    fork.forEach((p,i)=>{stroke(c,new Path2D(p),(i?1.05:1.65)*STYLE.branch,.73);stroke(m,new Path2D(p),i?2:3,1);});
    const rand=rng(712);for(let i=0;i<95;i++){const x=165+rand()*1256,y=branchAt(x,t),p=new Path2D();p.moveTo(x,y+1);p.quadraticCurveTo(x+5,y+.2,x+7+rand()*13,y+1+rand());stroke(c,p,.4+rand()*.3,.16+rand()*.34);}
    for(const [x,y,a] of [[819,465,-.7],[862,445,.6],[190,576,2.4],[1290,555,1.2]]){
      for(const ctx of [c,m]){ctx.save();ctx.translate(x,y);ctx.rotate(a);}
      const leaf=new Path2D('M 0 0 Q -6 -5 -13 -15 Q 3 -14 0 0 Z');c.fillStyle=`rgba(0,0,0,${.04*STYLE.wash})`;c.fill(leaf);stroke(c,leaf,.78*Math.sqrt(STYLE.branch),.55);m.fill(leaf);stroke(c,new Path2D('M 0 0 L -10 -12'),.4,.45);c.restore();m.restore();
    }
  }else{
    [[845,411],[808,444],[881,432]].forEach(([x,y],i)=>{
      for(let j=0;j<5;j++){const a=j*Math.PI*.4+i*.21,dx=Math.cos(a),dy=Math.sin(a);const p=new Path2D();p.moveTo(x,y);p.bezierCurveTo(x+dx*6-dy*5,y+dy*6+dx*5,x+dx*13+dy*4,y+dy*13-dx*4,x+dx*9,y+dy*9);p.quadraticCurveTo(x+dx*3+dy*4,y+dy*3-dx*4,x,y);c.fillStyle='rgba(0,0,0,.025)';c.fill(p);stroke(c,p,.82,.61);m.fill(p);}
      for(let j=0;j<6;j++){c.beginPath();c.arc(x+Math.cos(j*2.4)*2.5,y+Math.sin(j*2.4)*2.5,.65,0,7);c.fillStyle='rgba(0,0,0,.72)';c.fill();}
    });
  }
  c.restore();m.restore();
}
export function paperDrawing(){const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;const c=canvas.getContext('2d')!,r=rng(83);c.fillStyle=SETTINGS.paper;c.fillRect(0,0,1600,900);const pixels=c.getImageData(0,0,1600,900);for(let k=0;k<pixels.data.length;k+=4){const n=(r()-.5)*4.5;pixels.data[k]+=n;pixels.data[k+1]+=n;pixels.data[k+2]+=n;}c.putImageData(pixels,0,0);for(let i=0;i<12500;i++){const x=r()*1600,y=r()*900;c.lineWidth=.3+r()*.4;c.strokeStyle=i%3?'rgba(98,78,54,.032)':'rgba(255,255,253,.17)';c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+2,y-.3,x+4+r()*6,y+(r()-.5)*1.5);c.stroke();}return canvas;}
