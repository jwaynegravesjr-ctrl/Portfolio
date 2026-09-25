// @ts-nocheck
/** Exact procedural artwork from the approved two-component reference. The typed clock and DOM integration live elsewhere. */
import {CONFIG, MONTHS, JOBS, HOMES as homes, WIRES as wires, clamp, mix, phase, rand, smooth, titleAmount, birdScoreTime, birdFormation} from './approved-timeline';
const TAU=Math.PI*2;

function canvas(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c}
function line(ctx,points,width=1,alpha=1){ctx.save();ctx.globalAlpha*=alpha;ctx.lineWidth=width;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();ctx.restore()}
function ellipse(ctx,x,y,rx,ry,rot=0,fill=true){ctx.beginPath();ctx.ellipse(x,y,rx,ry,rot,0,TAU);fill?ctx.fill():ctx.stroke()}
function blob(ctx,x,y,r,seed=1){ctx.beginPath();for(let k=0;k<23;k++){const a=k*TAU/22,rr=r*(.82+.15*rand(seed+k*.917)+.07*Math.sin(a*3+seed));const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;k?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath();ctx.fill()}
function path(ctx,d,fill=false,stroke=true){const p=new Path2D(d);if(fill)ctx.fill(p);if(stroke)ctx.stroke(p)}
function fittedText(ctx,text,maxWidth,fontSize,font='Georgia',tracking=0){let s=fontSize;ctx.font=`${s}px ${font}`;while(s>7&&ctx.measureText(text).width+tracking*(text.length-1)>maxWidth){s-=.4;ctx.font=`${s}px ${font}`}return s}
function trackText(ctx,text,x,y,space=0){if(!space){ctx.fillText(text,x,y);return}for(const ch of text){ctx.fillText(ch,x,y);x+=ctx.measureText(ch).width+space}}

// A seeded many-origin wet-ink mask, shared by lettering, worksheet and chart.
// It is not scroll-scrubbed. The growth field does not change when paused.
const maskBuffer=canvas(1,1), maskCtx=maskBuffer.getContext('2d');
function inkComposite(dst,src,x,y,w,h,p,seed=4){
 p=clamp(p);if(p<=0)return;if(p>.997){dst.drawImage(src,x,y,w,h);return}
 const mw=Math.max(1,Math.round(w*1.2)),mh=Math.max(1,Math.round(h*1.2));
 if(maskBuffer.width!==mw||maskBuffer.height!==mh){maskBuffer.width=mw;maskBuffer.height=mh}
 const g=maskCtx;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,mw,mh);g.globalCompositeOperation='source-over';g.drawImage(src,0,0,mw,mh);
 g.globalCompositeOperation='destination-in';g.fillStyle='#000';g.beginPath();
 const cols=Math.max(6,Math.ceil(mw/52)),rows=Math.max(2,Math.ceil(mh/48));
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
  const k=j*cols+i,delay=rand(k+seed)*.22;const growth=clamp((p-delay)/.78);if(!growth)continue;
  const xx=(i+.17+.65*rand(k*3+seed))*mw/cols,yy=(j+.2+.6*rand(k*7+seed))*mh/rows;
  const r=Math.max(mw/cols,mh/rows)*1.35*Math.pow(growth,.82);
  for(let n=0;n<17;n++){const a=n*TAU/16,rr=r*(.81+.18*rand(n+k*27+seed));const bx=xx+Math.cos(a)*rr,by=yy+Math.sin(a)*rr;n?g.lineTo(bx,by):g.moveTo(bx,by)}g.closePath();
 }
 g.fill();g.globalCompositeOperation='source-over';dst.drawImage(maskBuffer,x,y,w,h);
}


// ---------- Responsive scene geometry ----------
let heroLayout,artLayer=canvas(1,1),debrisLayer=canvas(1,1),nameLayer=canvas(1,1),roleLayer=canvas(1,1),sheetLayer=canvas(1,1);
const birthStamps=Array.from({length:8},()=>({ink:canvas(1,1),mask:canvas(1,1),size:1,dpr:1}));
function layout(w,h){const mobile=w<581;const left=mobile?w*.055:w*.46,right=mobile?w*.97:w*1.012;const top=mobile?h*.59:h*.395;const gap=mobile?h*.13:h*.21;return {w,h,mobile,left,right,span:right-left,top,gap,birdScale:mobile?clamp(w/450,.68,.92):clamp(h/225,.8,1.4),poleL:left+(mobile?-7:1),poleR:right-8}}
function wireY(x,l,k,t=0){const u=(x-l.left)/l.span;const sag=l.h*(l.mobile?.045:.085)*4*u*(1-u);const baseline=l.top+k*l.gap;const wave=t<10.65?.34*Math.sin(u*24-t*6)*Math.sin(Math.PI*clamp(u)):0;return baseline+sag-l.h*.043*u+wave}
function wireStroke(g,l,k,t,alpha=1){g.save();g.strokeStyle=CONFIG.ink;g.globalAlpha*=alpha;g.lineWidth=k===2?1.3:1.05;g.beginPath();for(let i=0;i<=100;i++){const x=l.left-18+(l.span+42)*i/100,y=wireY(x,l,k,t);i?g.lineTo(x,y):g.moveTo(x,y)}g.stroke();g.globalAlpha*=.35;g.lineWidth=.4;g.beginPath();for(let i=0;i<=100;i++){const x=l.left-18+(l.span+42)*i/100,y=wireY(x,l,k,t)+1.7+.32*Math.sin(i*.77);i?g.lineTo(x,y):g.moveTo(x,y)}g.stroke();g.restore()}
function utilityPole(g,x,l,right=false){g.save();g.strokeStyle=CONFIG.ink;g.fillStyle='#dddccf';g.lineWidth=1.2;const y=l.top-l.h*.055,scale=l.mobile?.72:1;
 g.beginPath();g.moveTo(x-3*scale,y+4);g.lineTo(x-5*scale,l.h+20);g.lineTo(x+4*scale,l.h+20);g.lineTo(x+3*scale,y+4);g.closePath();g.fill();g.stroke();
 for(let i=0;i<3;i++){const yy=wireY(x,l,i,0)+3;g.fillStyle='#e2e2d4';g.fillRect(x-16*scale,yy+3,32*scale,4*scale);g.strokeRect(x-16*scale,yy+3,32*scale,4*scale);for(const dx of[-10,10]){g.fillStyle='#e4e6da';g.beginPath();g.moveTo(x+dx*scale-3,yy+3);g.lineTo(x+dx*scale-2,yy-6);g.quadraticCurveTo(x+dx*scale,yy-10,x+dx*scale+2,yy-6);g.lineTo(x+dx*scale+3,yy+3);g.closePath();g.fill();g.stroke();g.lineWidth=.6;for(let j=0;j<3;j++)line(g,[[x+dx*scale-3,yy-j*2],[x+dx*scale+3,yy-j*2]],.6,.8);g.lineWidth=1.2}}
 g.globalAlpha=.5;line(g,[[x-13*scale,y+12],[x,y+39],[x+13*scale,y+12]],.6);for(let i=0;i<9;i++)line(g,[[x-1.7,y+25+i*15],[x+1,y+37+i*15]],.4);g.restore()}


const birdColors=['#696d60','#343c32','#9c9b88','#565d4f','#80816f','#555f53','#90947e','#424c41'];
function jobPosition(job,l,t=0){const x=l.left+l.span*job.u;return {x,y:wireY(x,l,job.wire,t)}}
function homePosition(b,l,t=0){const x=l.left+l.span*homes[b];return {x,y:wireY(x,l,wires[b],t)}}
function flight(a,b,p,arch){const u=smooth(p);return {x:mix(a.x,b.x,u),y:mix(a.y,b.y,u)-Math.sin(Math.PI*u)*arch}}
function localBeak(nod){const c=Math.cos(nod),s=Math.sin(nod);return {x:18*c+22*s,y:-6+18*s-22*c}}
function beakPoint(p,l){const a=localBeak(p.nod);return {x:p.x+p.dir*a.x*l.birdScale,y:p.y+a.y*l.birdScale}}
function poseForJob(job,l,t){const s=l.birdScale,rel=t-job.start,d=job.duration,extra=job.cooperative?.48:0;const spot=jobPosition(job,l,t),home=homePosition(job.bird,l,t),dir=job.dir;
 const work={x:spot.x-dir*localBeak(1.1).x*s,y:wireY(spot.x-dir*localBeak(1.1).x*s,l,job.wire,t)};
 const grip=.6,loose=1.01+extra,out=1.24+extra,clear=1.88+extra;
 let p={...home,nod:0,dir,flap:0,air:false,job:job.id,phase:'waiting',rel,grip,loose,out,clear};
 if(rel<0)return p;
 if(rel<.35){const a=flight(home,work,rel/.35,l.h*.10);p={...p,...a,flap:Math.sin(rel*26),air:true,phase:'approach'}}
 else if(rel<grip){p={...p,...work,nod:1.1*phase(rel,.35,grip),phase:'reach'}}
 else if(rel<loose){const pull=Math.sin((rel-grip)/(loose-grip)*Math.PI*4);p={...p,...work,nod:1.1-.12*Math.abs(pull),phase:'tug'}}
 else if(rel<out){p={...p,...work,nod:mix(1.02,.12,phase(rel,loose,out)),phase:'lift'}}
 else if(rel<clear){const exit={x:l.right+l.w*.05+(job.bird%3)*12,y:mix(l.top,l.h*.28,job.bird/7)};const u=(rel-out)/(clear-out);const a=flight(work,exit,u,l.h*.16);p={...p,...a,nod:-.10,dir:1,flap:Math.sin(t*31+job.bird),air:true,phase:'carry'}}
 else if(rel<d){const exit={x:l.right+l.w*.07,y:l.top-l.h*.08},a=flight(exit,home,(rel-clear)/(d-clear),l.h*.12);p={...p,...a,dir:-1,flap:Math.sin(t*31+job.bird),air:true,phase:'return'}}
 else p={...p,...home,dir:job.bird%2?-1:1,phase:'rest'};
 return p;
}
function birdPose(b,l,t){let active=null;for(const j of JOBS)if(j.bird===b&&t>=j.start&&t<=j.start+j.duration)active=j;
 let p=active?poseForJob(active,l,t):{...homePosition(b,l,t),dir:b%2?-1:1,nod:t<10.7?.035*Math.sin(t*3+b):0,flap:0,air:false,phase:'rest',job:null};
 // Bird 1 lends a beak to the final snag, then settles back on its own wire.
 if(b===0&&t>8.1&&t<10.25){const j=JOBS[15],q=jobPosition(j,l,t),work={x:q.x+localBeak(1.1).x*l.birdScale,y:wireY(q.x+localBeak(1.1).x*l.birdScale,l,j.wire,t)},home=homePosition(0,l,t);
  if(t<8.48){p={...p,...flight(home,work,(t-8.1)/.38,l.h*.11),dir:-1,air:true,flap:Math.sin(t*31),nod:0,phase:'assist-approach'}}
  else if(t<9.18)p={...p,...work,dir:-1,air:false,nod:1.05-.09*Math.abs(Math.sin((t-8.48)*17)),phase:'assist'};
  else p={...p,...flight(work,home,(t-9.18)/1.07,l.h*.11),dir:-1,air:true,flap:Math.sin(t*29),nod:0,phase:'assist-return'};
 }
 return p;
}
function drawBird(g,p,l,b,t){const s=l.birdScale;g.save();g.translate(p.x,p.y);g.scale(s*p.dir,s);g.strokeStyle=CONFIG.ink;g.fillStyle=birdColors[b];g.lineWidth=.85;
 // Gripping feet remain registered to the wire while the torso leans.
 if(!p.air){line(g,[[-4,-9],[-5,-1],[-9,1]],.75);line(g,[[3,-8],[5,0],[9,1]],.75);line(g,[[-5,-1],[-2,1]],.6);line(g,[[5,0],[3,2]],.6)}else{line(g,[[-3,-9],[-6,-5],[-3,-3]],.65);line(g,[[4,-8],[1,-4],[4,-2]],.65)}
 g.translate(0,-6);g.rotate(p.nod);g.translate(0,6);
 // Layered narrow tail feathers, not a generic winged dot.
 path(g,'M-9 -17 Q-17 -13 -25 -7 L-20 -18 L-14 -24Z',true,true);line(g,[[-21,-11],[-13,-21]],.48,.7);line(g,[[-18,-11],[-10,-21]],.45,.65);
 if(p.air){g.save();g.translate(-3,-19);g.rotate(-.25+p.flap*1.05);g.fillStyle=birdColors[b];path(g,'M0 2 Q-15 -6 -17 -26 Q-10 -25 -6 -20 Q-7 -24 -2 -28 Q2 -14 6 -4Z',true,true);for(let i=0;i<4;i++)line(g,[[-12+i*3,-22],[0+i*.3,-4]],.45,.72);g.restore()}
 // Body contour and pale paper breast.
 g.fillStyle=birdColors[b];path(g,'M-13 -24 C-20 -15 -10 -5 2 -6 C13 -6 16 -18 11 -26 C5 -34 -6 -32 -13 -24Z',true,true);
 g.save();g.globalAlpha=.64;g.fillStyle='#e7e5d5';path(g,'M9 -25 C14 -17 10 -8 2 -7 C-2 -7 -5 -11 -4 -16 Q3 -17 9 -25Z',true,false);g.restore();
 // Folded wing with etched feather groups.
 g.fillStyle=birdColors[b];path(g,'M-8 -26 Q2 -29 4 -19 Q0 -13 -12 -10 Q-8 -15 -10 -19 Q-13 -20 -8 -26Z',true,true);
 for(let i=0;i<5;i++){g.globalAlpha=.7;line(g,[[-8+i*1.8,-24],[-5+i*1.4,-20],[-10+i*2.1,-13]],.43)}g.globalAlpha=1;
 // Head, cheek patch, quizzical brows, beak, crest.
 g.fillStyle=birdColors[b];path(g,'M2 -27 C-1 -35 4 -39 10 -37 C17 -36 18 -28 13 -23 Q6 -22 2 -27Z',true,true);
 g.fillStyle='#dddccc';path(g,'M9 -30 Q15 -32 15 -27 Q11 -23 8 -25Z',true,false);
 g.fillStyle=CONFIG.ink;path(g,'M14 -30 L18 -28 L14 -26Z',true,false);ellipse(g,11.6,-32.2,1.03,1.08);g.fillStyle=CONFIG.heroPaper;ellipse(g,11.9,-32.5,.24,.24);
 line(g,[[9,-34.5],[12.7,-34.2]],.53);for(let i=0;i<(b%3)+2;i++)line(g,[[5+i*2,-36],[3+i*3,-40-rand(b*5+i)*3]],.6);
 // Fine irregular pen marks along the breast and back.
 for(let i=0;i<9;i++){const xx=-11+rand(b*31+i)*16,yy=-23+rand(b*61+i)*13;g.globalAlpha=.36;line(g,[[xx,yy],[xx+.7,yy+2]],.42)}g.globalAlpha=1;
 if(p.air){g.save();g.translate(-3,-20);g.rotate(.12-p.flap*.9);g.fillStyle=birdColors[b];path(g,'M0 1 Q-11 -3 -23 -18 L-18 -21 L-14 -17 L-11 -21 Q-3 -14 5 -2Z',true,true);for(let i=0;i<4;i++)line(g,[[-18+i*3,-17],[0,-1-i*.6]],.43,.8);g.restore()}
 g.restore();
}
function drawDebris(g,x,y,kind,seed,scale,rotation=0){g.save();g.translate(x,y);g.rotate(rotation);g.scale(scale,scale);g.strokeStyle='#575b4c';g.fillStyle='#e0dbc8';g.lineWidth=.8;
 if(kind==='paper'){path(g,'M-6 -1 L4 -3 L8 5 L4 12 L-5 9Z',true,true);path(g,'M4 -3 L2 4 L8 5',false,true);line(g,[[-3,4],[1,5]],.6,.7);line(g,[[-3,7],[2,8]],.5,.6)}
 else if(kind==='leaf'){g.fillStyle='#b2b69a';path(g,'M0 0 C-11 0 -10 10 -3 13 C6 12 5 5 0 0Z',true,true);line(g,[[0,0],[-3,10]],.7);line(g,[[-1,4],[-5,4]],.5);line(g,[[-2,7],[2,6]],.5)}
 else if(kind==='twig'){line(g,[[-8,4],[1,2],[9,8],[13,8]],1.3);line(g,[[0,2],[-2,-4]],1.0);line(g,[[6,6],[5,0]],.8);line(g,[[-5,4],[-8,9]],.7)}
 else if(kind==='thread'){g.beginPath();g.moveTo(0,0);g.bezierCurveTo(-10,8,12,7,3,17);g.bezierCurveTo(-2,22,-7,15,1,12);g.stroke();g.lineWidth=.45;g.beginPath();g.moveTo(-1,-2);g.bezierCurveTo(-8,2,7,10,5,19);g.stroke()}
 else if(kind==='ribbon'){g.fillStyle='#c4bcaa';path(g,'M-3 -1 Q4 4 0 10 Q-5 13 3 19 L8 18 Q0 13 6 8 Q8 3 2 -2Z',true,true);line(g,[[1,2],[3,7],[0,12],[5,16]],.4,.65)}
 else {g.fillStyle='#c7c6b1';path(g,'M-8 2 L-4 -3 L1 -1 L5 -4 L10 3 L7 8 L11 12 L3 15 L-2 11 L-8 13 L-11 7Z',true,true);for(let i=0;i<7;i++){const xx=-7+rand(seed+i)*14,yy=rand(seed*3+i)*11;g.beginPath();g.moveTo(xx,yy);g.bezierCurveTo(xx+6,yy-8,xx+7,yy+6,xx-1,yy+4);g.stroke()}line(g,[[-7,6],[-17,12],[-18,8]],.6);line(g,[[8,6],[15,4],[18,9]],.6)}g.restore()}
function drawLooseDebris(g,l,t){for(const job of JOBS){const pos=jobPosition(job,l,t),p=poseForJob(job,l,t),r=t-job.start;const ds=l.birdScale*(job.cooperative?1.15:1);if(r<.6){g.save();g.strokeStyle='#77796a';g.lineWidth=.55;ellipse(g,pos.x,pos.y-.2,2.4,2.6,0,false);g.restore();drawDebris(g,pos.x,pos.y+1,job.kind,job.id,ds,.08*Math.sin(t*2+job.id));}
 else if(r<p.clear){const beak=beakPoint(p,l);if(r<p.loose){g.save();g.strokeStyle='#77796a';g.lineWidth=.6;g.beginPath();g.moveTo(pos.x,pos.y);g.quadraticCurveTo((beak.x+pos.x)/2,pos.y-3,beak.x,beak.y);g.stroke();g.restore()}
  drawDebris(g,beak.x,beak.y,job.kind,job.id,ds,(p.air?.4:.12)*Math.sin(t*8+job.id));
 }} }

// A real worksheet structure: name box, formula bar, column letters, row numbers,
// source observations and a selected rate cell. Deliberately visible behind ink.
function buildSheet(l){const sw=l.mobile?440:720,sh=240;sheetLayer.width=sw;sheetLayer.height=sh;const g=sheetLayer.getContext('2d');g.clearRect(0,0,sw,sh);g.fillStyle='#dde2d2';g.strokeStyle='#919b85';g.lineWidth=.75;g.fillRect(0,0,sw,sh);g.strokeRect(.5,.5,sw-1,sh-1);g.fillStyle='#c6d0ba';g.fillRect(0,0,sw,19);g.fillStyle='#536348';g.font='9px Arial';g.fillText('QUALITY OPERATIONS / MONTHLY FIGURES',12,13);g.fillStyle='#f0f0e5';g.fillRect(1,20,sw-2,24);g.strokeRect(1,20,42,24);g.fillStyle='#546149';g.font='11px Courier New';g.fillText('D6',12,36);g.fillText('ƒx',56,36);g.font='10px Courier New';g.fillText('= C6 / B6 * 1000',81,36);
 const row0=64,rh=28,nw=25,cw=(sw-nw)/5;g.fillStyle='#d1dac5';g.fillRect(0,45,sw,19);g.fillRect(0,64,nw,sh-64);g.fillStyle='#617152';g.font='10px Courier New';g.textAlign='center';for(let i=0;i<5;i++)g.fillText('ABCDE'[i],nw+cw*(i+.5),58);g.textAlign='left';
 for(let i=0;i<=5;i++){const x=nw+i*cw;line(g,[[x,44],[x,sh]],.7,.7)}for(let j=0;j<=6;j++){const y=row0+j*rh;line(g,[[0,y],[sw,y]],.7,.7);g.fillText(String(j+1),8,y+19)}
 const labels=['MONTH','CASES','ERRORS','PER 1,000','STATUS'];g.font='9px Arial';for(let i=0;i<5;i++)g.fillText(labels[i],nw+i*cw+8,row0+19);
 g.font='11px Courier New';MONTHS.forEach((d,j)=>{const v=[d.name.toUpperCase(),d.cases.toLocaleString('en-US'),String(d.errors),d.rate.toFixed(2),'REPORTED'];v.forEach((txt,i)=>g.fillText(txt,nw+i*cw+8,row0+(j+1)*rh+19))});
 const x=nw+3*cw,y=row0+5*rh;g.fillStyle='#c1d0b5';g.globalAlpha=.55;g.fillRect(x,y,cw,rh);g.globalAlpha=1;g.strokeStyle='#668356';g.lineWidth=1.4;g.strokeRect(x,y,cw,rh);g.fillStyle='#496039';g.fillRect(x+cw-2,y+rh-2,4,4);
}
function drawWorkbook(g,l,t){const p=phase(t,1.95,3.5);if(p===0)return;g.save();let x,y,w,h,rotation;
 if(l.mobile){x=l.w*.12;y=l.h*.395;w=l.w*.80;h=l.h*.58;rotation=-.025}
 else{x=l.w*.525;y=l.h*.055;w=l.w*.46;h=l.h*.825;rotation=-.022}
 g.translate(x,y);g.rotate(rotation);g.globalAlpha=l.mobile?.43:.46;
 // The worksheet develops behind the birds along one uneven wet front. Masking
 // its opaque paper fill with many isolated pools made distracting round spots.
 if(p<.999){g.beginPath();g.moveTo(0,0);for(let y=0;y<=h+8;y+=8){const edge=w*(p*1.1-.06)+5*Math.sin(y*.10+1.9)+2.5*Math.sin(y*.31+.4);g.lineTo(edge,y)}g.lineTo(0,h);g.closePath();g.clip()}
 g.drawImage(sheetLayer,0,0,w,h);g.restore()}
function buildLettering(l){const dpr=1.7;let nw=l.mobile?l.w*.90:l.w*.407,nh=l.mobile?37:68;nameLayer.width=Math.round(nw*dpr);nameLayer.height=Math.round(nh*dpr);let g=nameLayer.getContext('2d');g.scale(dpr,dpr);g.fillStyle=CONFIG.ink;const fs=fittedText(g,'J WAYNE GRAVES JR',nw-2,l.mobile?29:Math.min(47,l.w*.032),'Georgia',l.mobile?.3:.45);g.textBaseline='alphabetic';trackText(g,'J WAYNE GRAVES JR',0,nh*.75,l.mobile?.3:.45);
 const rw=l.mobile?l.w*.89:l.w*.42,rh=l.mobile?42:54;roleLayer.width=Math.round(rw*dpr);roleLayer.height=Math.round(rh*dpr);g=roleLayer.getContext('2d');g.scale(dpr,dpr);g.fillStyle='#555e4e';const size=l.mobile?12.4:Math.max(13,Math.min(16.4,l.w*.0118));g.font=`${size}px Arial`;const lines=['Operation Leader, Automation Expert','and Quality Improvement Specialist'];g.fillText(lines[0],0,size+2);g.fillText(lines[1],0,size*2.55+2);
 l.name={x:l.w*(l.mobile?.055:.042),y:l.h*(l.mobile?.055:.185),w:nw,h:nh};l.role={x:l.name.x,y:l.name.y+nh+(l.mobile?-1:1),w:rw,h:rh};}

function prepareBirdStamps(l,dpr){const size=94*l.birdScale;
 for(let b=0;b<8;b++){const stamp=birthStamps[b],home=homePosition(b,l,0);stamp.size=size;stamp.dpr=dpr;
  stamp.ink.width=stamp.mask.width=Math.ceil(size*dpr);stamp.ink.height=stamp.mask.height=Math.ceil(size*dpr);
  const c=stamp.ink.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,size,size);c.translate(size/2-home.x,size/2-home.y);
  drawBird(c,{...home,dir:b%2?-1:1,nod:0,air:false,flap:0},l,b,0);
 }
}
function drawInkBirth(g,l,b,t){const p=birdFormation(b,t);if(!p)return;
 const home=homePosition(b,l,0),s=l.birdScale,stamp=birthStamps[b],size=stamp.size;
 if(p>=.999){const scoreTime=birdScoreTime(t);drawBird(g,birdPose(b,l,scoreTime),l,b,scoreTime);return;}
 const x=home.x-4*s,y=home.y-20*s,seed=17+b*23;
 // The small, irregular pool feeds the body, then the farther head, feet and feather strokes.
 g.save();g.fillStyle=birdColors[b];g.globalAlpha=.62*(1-phase(p,.56,1));
 blob(g,x,y,(4+14*phase(p,0,.68))*s,seed);
 g.globalAlpha*=.52;blob(g,x-7*s,y+3*s,(2+9*phase(p,.12,.74))*s,seed+5);
 g.globalAlpha*=.7;blob(g,x+5*s,y-5*s,(2+7*phase(p,.2,.8))*s,seed+11);g.restore();
 const m=stamp.mask.getContext('2d');m.setTransform(1,0,0,1,0,0);m.clearRect(0,0,stamp.mask.width,stamp.mask.height);
 m.globalCompositeOperation='source-over';m.drawImage(stamp.ink,0,0);m.setTransform(stamp.dpr,0,0,stamp.dpr,0,0);
 m.globalCompositeOperation='destination-in';m.fillStyle='#000';m.beginPath();
 const radius=(5+60*phase(p,.04,1))*s,centerX=size/2-4*s,centerY=size/2-20*s;
 for(let k=0;k<=36;k++){const a=k*Math.PI*2/36,rr=radius*(.84+.12*rand(seed+k*.77)+.055*Math.sin(a*3+seed));
  const px=centerX+Math.cos(a)*rr,py=centerY+Math.sin(a)*rr;k?m.lineTo(px,py):m.moveTo(px,py);
 }m.closePath();m.fill();m.globalCompositeOperation='source-over';
 g.drawImage(stamp.mask,home.x-size/2,home.y-size/2,size,size);
}
function renderHero(g,w,h,t){const l=heroLayout;if(!l)return;drawWorkbook(g,l,t);const birdTime=birdScoreTime(t);
 const dpr=Math.min(devicePixelRatio||1,CONFIG.maxDpr),ag=artLayer.getContext('2d');ag.setTransform(dpr,0,0,dpr,0,0);ag.clearRect(0,0,w,h);ag.lineCap='round';ag.lineJoin='round';
 ag.save();ag.beginPath();if(l.mobile)ag.rect(0,l.h*.40,w,h);else ag.rect(l.w*.445,0,l.w*.555,h);ag.clip();
 for(let k=0;k<3;k++)wireStroke(ag,l,k,birdTime,.88);utilityPole(ag,l.poleL,l);utilityPole(ag,l.poleR,l,true);ag.restore();
 inkComposite(g,artLayer,0,0,w,h,phase(t,.02,1.25),13);
 g.save();g.beginPath();if(l.mobile)g.rect(0,l.h*.40,w,h);else g.rect(l.w*.445,0,l.w*.555,h);g.clip();
 for(let b=0;b<8;b++)if(t<2.2)drawInkBirth(g,l,b,t);else drawBird(g,birdPose(b,l,birdTime),l,b,birdTime);
 g.restore();
 const dg=debrisLayer.getContext('2d');dg.setTransform(dpr,0,0,dpr,0,0);dg.clearRect(0,0,w,h);dg.lineCap='round';dg.lineJoin='round';
 dg.save();dg.beginPath();if(l.mobile)dg.rect(0,l.h*.40,w,h);else dg.rect(l.w*.445,0,l.w*.555,h);dg.clip();drawLooseDebris(dg,l,birdTime);dg.restore();
 inkComposite(g,debrisLayer,0,0,w,h,phase(t,1.6,2.25),43);
 const n=l.name,r=l.role;inkComposite(g,nameLayer,n.x,n.y,n.w,n.h,phase(t,.03,.92),7);inkComposite(g,roleLayer,r.x,r.y,r.w,r.h,titleAmount(t),23);
}

// ---------- Actual observations, drawn as a slow descending ink stroke ----------
function cubic(a,b,c,d,t){const s=1-t;return {x:s*s*s*a.x+3*s*s*t*b.x+3*s*t*t*c.x+t*t*t*d.x,y:s*s*s*a.y+3*s*s*t*b.y+3*s*t*t*c.y+t*t*t*d.y}}
function graphPoints(w,h){const L=w<430?34:43,R=24,T=40,B=36,ph=h-T-B;return MONTHS.map((d,i)=>({x:L+(w-L-R)*i/4,y:T+(1-d.rate/4.6)*ph,base:h-B,rate:d.rate,name:d.short}))}
function renderChart(g,w,h,t){const points=graphPoints(w,h),base=points[0].base,axisP=phase(t,0,.8);g.strokeStyle='#a4a994';g.fillStyle=CONFIG.muted;g.font='10px Courier New';g.save();g.globalAlpha=axisP;
 g.fillStyle='#78826f';g.font='9px Courier New';trackText(g,'ERRORS / 1,000',points[0].x,17,.9);g.textAlign='right';g.fillText('APR — AUG',w-22,17);g.textAlign='left';
 for(let tick=0;tick<=4;tick++){const yy=40+(1-tick/4.6)*(h-40-36);g.fillStyle='#828775';g.fillText(String(tick),14,yy+3);g.strokeStyle='#c6caba';g.setLineDash(tick?[2,5]:[]);line(g,[[points[0].x-7,yy],[w-17,yy]],tick?.55:.9,.8)}g.setLineDash([]);
 points.forEach(pt=>{g.fillStyle='#6c7563';g.font='10px Courier New';g.textAlign='center';g.fillText(pt.name,pt.x,base+23)});g.textAlign='left';g.restore();
 const p=clamp((t-.8)/5.95)*4;
 if(p<=0)return;const traced=[points[0]];
 for(let i=0;i<4;i++){const u=clamp(p-i);if(!u)break;const a=points[i],d=points[i+1],b={x:mix(a.x,d.x,.45),y:a.y},c={x:mix(a.x,d.x,.56),y:d.y};const count=Math.max(2,Math.ceil(u*35));for(let j=1;j<=count;j++)traced.push(cubic(a,b,c,d,u*j/count));}
 // A restrained capillary wash beneath the line, not an exaggerated area metric.
 g.save();g.beginPath();traced.forEach((pt,i)=>i?g.lineTo(pt.x,pt.y):g.moveTo(pt.x,pt.y));const end=traced[traced.length-1];g.lineTo(end.x,base);g.lineTo(traced[0].x,base);g.closePath();g.clip();g.fillStyle='#859676';g.globalAlpha=.035;g.fillRect(0,0,w,h);g.globalAlpha=.09;g.strokeStyle='#829273';for(let i=-h;i<w;i+=10)line(g,[[i,base],[i+h*.4,0]],.45);g.restore();
 g.strokeStyle=CONFIG.ink;g.lineWidth=2.0;g.beginPath();traced.forEach((pt,i)=>i?g.lineTo(pt.x,pt.y):g.moveTo(pt.x,pt.y));g.stroke();g.strokeStyle='#7b8970';g.globalAlpha=.35;g.lineWidth=.6;g.beginPath();traced.forEach((pt,i)=>{const yy=pt.y+1.35+Math.sin(i*1.5)*.3;i?g.lineTo(pt.x+.15,yy):g.moveTo(pt.x+.15,yy)});g.stroke();g.globalAlpha=1;
 // Points and their measured values form at arrival; future values do not slide.
 points.forEach((pt,i)=>{const a=i===4?phase(t,6.75,7.15):phase(p,i-.045,i+.13);if(a<=0)return;g.save();g.globalAlpha=a;g.fillStyle='#a4af96';blob(g,pt.x,pt.y,6.7*a,i+30);g.fillStyle=CONFIG.ink;blob(g,pt.x,pt.y,3.1*a,i+5);g.fillStyle=CONFIG.paper;ellipse(g,pt.x-.4,pt.y-.55,.65,.65);
  g.fillStyle=CONFIG.ink;g.font='18px Georgia';g.textAlign=i===0?'left':(i===4?'right':'center');g.fillText(pt.rate.toFixed(2),pt.x+(i===0?0:0),pt.y-14);g.restore()});
 if(p<4){g.fillStyle=CONFIG.ink;blob(g,end.x,end.y,2.7,44);g.save();g.globalAlpha=.16;for(let j=0;j<4;j++)blob(g,end.x+rand(j+1)*7,end.y+rand(j+3)*5,rand(j+22)*1.5,30+j);g.restore()}
 if(p>2.96){const a=phase(p,2.96,3.25),pt=points[3];g.save();g.globalAlpha=a*.5;g.strokeStyle='#819071';g.setLineDash([2,4]);line(g,[[pt.x,30],[pt.x,pt.y-30]],.7);g.setLineDash([]);g.font='8px Courier New';g.fillStyle='#546649';g.textAlign='center';g.fillText('JULY ROLLOUT',pt.x,27);g.restore()}
}

export function setupHero(w:number,h:number,dpr:number){
  heroLayout=layout(w,h);
  artLayer.width=Math.max(1,Math.round(w*dpr));
  artLayer.height=Math.max(1,Math.round(h*dpr));
  debrisLayer.width=artLayer.width;debrisLayer.height=artLayer.height;
  buildSheet(heroLayout);
  buildLettering(heroLayout);
  prepareBirdStamps(heroLayout,dpr);
}
export function inspectArtwork(t:number){
  const birdTime=birdScoreTime(t);
  return {birds:Array.from({length:8},(_,bird)=>({id:bird,phase:birdPose(bird,heroLayout,birdTime).phase,ink:birdFormation(bird,t)})),
    jobs:JOBS.map(job=>({id:job.id,bird:job.bird,phase:poseForJob(job,heroLayout,birdTime).phase}))};
}
export {renderHero,renderChart};
