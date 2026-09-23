import {CAST} from './config';
import {bezier,ease,glide,lerp,limit,progress,pulse,type Point} from './numbers';
import type {BirdState} from './score';

export interface ClearAction {
  bird:number; perch:number; side:number;
  at:number; grip:number; tugs:readonly [number,number][];
  release:number; toss:number; until:number; fadeUntil:number;
  landing:Point;
}

/** release = the snag lets go of the perch; toss = the beak lets go.
 * Both birds finish their small task before making their existing inward hop.
 */
export const CLEARS:readonly ClearAction[]=[
  {bird:5,perch:1230,side:1,at:12.35,grip:12.53,tugs:[[12.58,12.70],[12.75,12.86]],
    release:12.9,toss:13.03,until:13.3,fadeUntil:14.15,landing:[1404,640]},
  {bird:0,perch:392,side:-1,at:12.95,grip:13.12,tugs:[[13.16,13.26],[13.3,13.4]],
    release:13.43,toss:13.55,until:13.75,fadeUntil:14.35,landing:[234,641]},
];

export interface ClearingPose {pitch:number;head:number;tail:number;ruffle:number}
const zero=():ClearingPose=>({pitch:0,head:0,tail:0,ruffle:0});
function tug(action:ClearAction,t:number):number {
  return action.tugs.reduce((value,[a,b])=>value+pulse(t,a,b,(b-a)*.35),0);
}

export function clearingPose(i:number,t:number):ClearingPose {
  const action=CLEARS.find(a=>a.bird===i);
  if(!action||t<action.at||t>=action.until)return zero();
  const reach=ease(progress(t,action.at,action.grip));
  const recover=1-ease(progress(t,action.toss,action.until));
  const effort=tug(action,t);
  const flick=pulse(t,action.release,action.toss+.09,.075);
  const face=CAST[i].face;
  return {
    pitch:face*(.10*reach-.075*effort-.13*flick)*recover,
    head:(.32*reach-.16*effort-.43*flick)*recover,
    tail:(-.075*reach+.14*effort+.11*flick)*recover,
    ruffle:.17*effort*recover,
  };
}

type BeakPose=Pick<BirdState,'x'|'y'|'facing'|'head'|'pitch'|'breath'>;

/** Matches birds.ts exactly: head pivot, body pivot, aspect/breath scaling,
 * and finally the page translation. Fractional facing uses its front-view beak.
 */
export function beakPoint(i:number,p:BeakPose):Point {
  const spec=CAST[i],a=Math.abs(limit(p.facing,-1,1));
  const tipX=43*a,tipY=lerp(-80.5,-86,a),pivotX=8*a;
  const headAngle=p.head*a,hs=Math.sin(headAngle),hc=Math.cos(headAngle);
  const hx=pivotX+(tipX-pivotX)*hc-(tipY+71)*hs;
  const hy=-71+(tipX-pivotX)*hs+(tipY+71)*hc;
  const x=hx*spec.width*(p.facing<0?-1:1);
  const y=(hy+18)*spec.height*(1+p.breath*.012);
  const cs=Math.cos(p.pitch),sn=Math.sin(p.pitch);
  return [p.x+x*cs-y*sn,p.y-18+x*sn+y*cs];
}

// The same permanent, unloaded perch equation as score.ts. Grasp/release times
// are after its first landing response; neither loose twig changes that curve.
function perchY(x:number):number {
  const s=(x-155)/1290;
  return 558-14*Math.sin(s*Math.PI)+7*Math.sin(s*5.3)+1.2*Math.sin(s*23);
}

/** Reconstruct the two stationary participants when capturing a thrown twig.
 * There is no cached previous frame, and later hops cannot drag the stain.
 */
function referenceBird(action:ClearAction,t:number):BeakPose {
  const b=CAST[action.bird],offset=clearingPose(action.bird,t);
  let head=Math.sin(t*.68+b.seed)*.035;
  // B1's already-authored attention gesture begins just before its final flick.
  if(action.bird===0)head-=.23*pulse(t,13.55,13.84,.09);
  return {x:action.perch,y:perchY(action.perch),facing:b.face,
    head:head+offset.head,pitch:offset.pitch,breath:Math.sin(t*1.6+b.seed)*.7};
}

export interface TwigState {
  bird:number; phase:'hidden'|'forming'|'snagged'|'grasp'|'tug'|'freed'|'toss'|'stain'|'gone';
  grip:Point; base:Point; contact:Point; released:boolean;held:boolean;
  opacity:number;formation:number;breakup:number;bleed:number;
  side:number;
}

const offset=(p:Point,x:number,y:number):Point=>[p[0]+x,p[1]+y];
const blend=(a:Point,b:Point,p:number):Point=>[lerp(a[0],b[0],p),lerp(a[1],b[1],p)];

export function twigAt(index:number,t:number,birds:readonly BirdState[],releasePoses?:readonly BirdState[]):TwigState {
  const d=CLEARS[index];
  if(!d)throw new RangeError(`Unknown loose twig ${index}`);
  const face=CAST[d.bird].face;
  const contactX=d.perch+face*104;
  const contact:Point=[contactX,perchY(contactX)];
  const startingGrip=beakPoint(d.bird,referenceBird(d,d.grip));
  const formation=ease(progress(t,2.55+index*.12,3.5+index*.12));
  const state:TwigState={bird:d.bird,phase:t<2.55+index*.12?'hidden':formation<1?'forming':'snagged',
    grip:startingGrip,base:contact,contact,released:t>=d.release,held:t>=d.grip&&t<d.toss,
    opacity:formation>0?1:0,formation,breakup:0,bleed:0,side:d.side};
  if(t<d.grip)return state;
  const actual=birds.find(b=>b.id===CAST[d.bird].id);
  if(!actual)throw new Error(`The clearing action requires ${CAST[d.bird].id}.`);
  if(t<d.toss){
    state.grip=beakPoint(d.bird,actual);
    if(t<d.release){
      state.phase=t<d.tugs[0][0]?'grasp':'tug';
      const flex=tug(d,t);
      state.base=offset(contact,-face*1.8*flex,-2.2*flex);
    }else{
      state.phase='freed';
      const lift=ease(progress(t,d.release,d.toss));
      state.base=blend(contact,offset(state.grip,face*52,35),lift);
    }
    return state;
  }
  const launch=beakPoint(d.bird,releasePoses?.[index]??referenceBird(d,d.toss));
  const p=glide(progress(t,d.toss,d.until));
  // Drop clear of the breast before curling outward; never sweep a branch through a face.
  state.grip=bezier([launch,offset(launch,0,130),
    [d.landing[0]-d.side*45,d.landing[1]+14],d.landing],p);
  const angle=d.side*p*.88,cs=Math.cos(angle),sn=Math.sin(angle);
  const vx=face*52,vy=35;
  state.base=offset(state.grip,vx*cs-vy*sn,vx*sn+vy*cs);
  state.phase=t<d.until?'toss':'stain';
  state.breakup=ease(progress(t,d.until+.10,d.fadeUntil-.32));
  state.bleed=ease(progress(t,d.until+.26,d.fadeUntil-.12));
  state.opacity=1-ease(progress(t,d.until+.36,d.fadeUntil));
  if(t>=d.fadeUntil){state.opacity=0;state.phase='gone';}
  return state;
}

type Stroke={points:Point[];width:number;delay:number};
function sampled(a:Point,b:Point,c:Point):Point[] {
  return Array.from({length:33},(_,i)=>{const p=i/32,q=1-p;
    return [q*q*a[0]+2*q*p*b[0]+p*p*c[0],q*q*a[1]+2*q*p*b[1]+p*p*c[1]] as Point;});
}

function twigStrokes(s:TwigState):Stroke[] {
  const dx=s.base[0]-s.grip[0],dy=s.base[1]-s.grip[1],length=Math.hypot(dx,dy)||1;
  const tx=dx/length,ty=dy/length;
  // Always bow away from the bird; the two twigs have opposite silhouettes.
  const nx=-ty*s.side,ny=tx*s.side;
  const stem=sampled(s.grip,offset(blend(s.grip,s.base,.48),nx*7,ny*7),s.base);
  const result:Stroke[]=[{points:stem,width:1.85,delay:0}];
  for(const [j,p] of [.28,.53,.77].entries()){
    const origin=stem[Math.round(p*32)],forkSide=j===1?-.63:1;
    const tip=offset(origin,nx*(28+j*3)*forkSide-tx*(15-j*3),ny*(28+j*3)*forkSide-ty*(15-j*3));
    const bend=offset(blend(origin,tip,.55),tx*3,ty*3);
    result.push({points:sampled(origin,bend,tip),width:1.32-j*.08,delay:.30+j*.12});
    if(j!==1){
      const split=blend(bend,tip,.43),end=offset(tip,-nx*8*forkSide-tx*7,-ny*8*forkSide-ty*7);
      result.push({points:sampled(split,blend(split,end,.6),end),width:.95,delay:.41+j*.12});
    }
  }
  return result;
}

function stroke(c:CanvasRenderingContext2D,points:Point[],amount:number,offsetX=0,offsetY=0):void {
  const last=Math.min(points.length-1,Math.floor(amount*(points.length-1)));
  if(last<1)return;
  c.beginPath();c.moveTo(points[0][0]+offsetX,points[0][1]+offsetY);
  for(let j=1;j<=last;j++)c.lineTo(points[j][0]+offsetX,points[j][1]+offsetY);
  const extra=amount*(points.length-1)-last;
  if(last<points.length-1&&extra>0)c.lineTo(lerp(points[last][0],points[last+1][0],extra)+offsetX,
    lerp(points[last][1],points[last+1][1],extra)+offsetY);
  c.stroke();
}

/** Black alpha only; the renderer supplies the shared brown ink color.
 * Each frame reconstructs the same strokes and page-fixed residual stain.
 */
export function drawTwigs(c:CanvasRenderingContext2D,t:number,birds:readonly BirdState[],releasePoses?:readonly BirdState[]):void {
  c.save();c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,c.canvas.width,c.canvas.height);
  c.scale(c.canvas.width/1600,c.canvas.height/900);c.lineCap='round';c.lineJoin='round';
  for(let i=0;i<CLEARS.length;i++){
    const s=twigAt(i,t,birds,releasePoses),d=CLEARS[i];
    if(s.opacity<=0)continue;
    for(const [j,line] of twigStrokes(s).entries()){
      const amount=ease(progress(t,2.55+i*.12+line.delay*.65,3.22+i*.12+line.delay*.65));
      // Thin shape breaks first; absorbed ink widens only a few pixels along fibers.
      c.setLineDash([lerp(45,2.5,s.breakup),lerp(.7,12,s.breakup)]);
      c.lineDashOffset=j*7+i*13;
      if(s.bleed>0){
        c.lineWidth=line.width+1.5+s.bleed*2.2;
        c.strokeStyle=`rgba(0,0,0,${.043*s.opacity*s.bleed})`;
        stroke(c,line.points,amount,s.bleed*4.5,Math.sin(s.grip[0]*.013+j)*s.bleed*.8);
        stroke(c,line.points,amount,-s.bleed*3.5,Math.cos(s.grip[1]*.017+j)*s.bleed*.65);
      }
      c.strokeStyle=`rgba(0,0,0,${.82*s.opacity*(1-s.breakup*.68)})`;
      c.lineWidth=line.width;stroke(c,line.points,amount);
      if(j===0){
        c.lineWidth=.55;c.strokeStyle=`rgba(0,0,0,${.24*s.opacity*(1-s.breakup)})`;
        stroke(c,line.points,amount,1.2,.5);
      }
    }
    // A short empty interval visibly separates the twig from its old snag point.
    if(t>=d.release&&t<d.release+.25){
      const a=(1-progress(t,d.release,d.release+.25))*.55;
      c.setLineDash([]);c.lineWidth=.8;c.strokeStyle=`rgba(0,0,0,${a})`;
      c.beginPath();c.moveTo(s.contact[0]-3,s.contact[1]+1.8);c.lineTo(s.contact[0]-1,s.contact[1]+.8);
      c.moveTo(s.contact[0]+2,s.contact[1]+1.4);c.lineTo(s.contact[0]+4,s.contact[1]+2.3);c.stroke();
    }
  }
  c.restore();
}
