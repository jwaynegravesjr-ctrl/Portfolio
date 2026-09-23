import {CAST,CHAPTERS,CLEARING_CAPTION,ORCHESTRATOR,SETTINGS,PLAYBACK} from './config';
import {scoreTime} from './timing';
export {scoreTime,playbackTime} from './timing';
import {type Point,type Bezier,bezier,ease,glide,lerp,limit,progress,pulse} from './numbers';
import type {BirdPose} from './birds';
import {clearingPose} from './clearing';
export {CLEARS,twigAt,beakPoint} from './clearing';
export interface BirdState extends BirdPose {id:string;x:number;y:number;formation:number;dispersal:number;planted:boolean;action:string;pool:number;imprint:number}
export interface SceneState {time:number;scoreTime:number;chapter:number;caption:string;birds:BirdState[];branchInk:number;branchLoss:number;registration:number;annotations:number}
export const EVENTS=[{time:18.04,x:1360,weight:.5},{time:23.96,x:655,weight:.45},{time:29.36,x:285,weight:1},{time:31.14,x:1360,weight:1},{time:33.25,x:560,weight:.7}];
export function branchAt(x:number,t=0){
  const s=(x-155)/1290;let y=558-14*Math.sin(s*Math.PI)+7*Math.sin(s*5.3)+1.2*Math.sin(s*23);
  for(const e of EVENTS){const d=t-e.time;if(d>=0&&d<1.6)y+=e.weight*1.65*Math.sin(d*14)*Math.exp(-d*4.5)*Math.exp(-(((x-e.x)/150)**2));}
  return y;
}
const ground=(x:number):Point=>[x,branchAt(x)];
export const HOLD:Point[]=[[220,325],[1390,309]];
export const IMPACT:Point=[794,502];
export const COLLISION_LEG:Bezier=[[677,391],[728,395],[778,437],IMPACT];
export const LEFT_ENTRY:Bezier=[HOLD[0],[181,336],[195,405],[220,432]];
export const LEFT_LAND:Bezier=[[220,432],[235,463],[263,503],ground(285)];
export const RIGHT_ENTRY:Bezier=[HOLD[1],[1454,340],[1448,397],[1431,432]];
export const RIGHT_LAND:Bezier=[[1431,432],[1410,472],[1373,506],ground(1360)];
// The demonstrator's useful final scoop is the same right-hand landing curve used later by B8.
export const DEMO_POSITION:Bezier=[ground(931),[925,299],[1210,255],HOLD[1]];
export const RESIDENT_RETURN:Bezier=[[220,432],[307,456],[510,454],ground(560)];
export const LEADER_HOVER={bird:ORCHESTRATOR,depart:18.14,at:18.64,until:23.12,land:23.96,position:[800,330] as Point};
export const LEADER_TWEETS=[
  {at:18.68,until:19.52,text:'Clear the right twig.',face:1},
  {at:20.08,until:20.94,text:'Now the left.',face:-1},
  {at:21.10,until:22.58,text:'Leave room to land.',face:0},
] as const;
export interface Flight {bird:number;at:number;until:number;curve:Bezier;mode:'depart'|'travel'|'brake'|'squeeze'|'land'|'hover';face:number;label:string}
const flights:Flight[]=[];
function fly(bird:number,at:number,until:number,curve:Bezier,mode:Flight['mode'],face:number,label:string){flights.push({bird,at,until,curve,mode,face,label});}
fly(6,3.25,4.8,[[-190,390],[-65,260],[117,292],HOLD[0]],'travel',1,'enter from the left edge');
fly(7,3.7,4.98,[[1790,355],[1670,218],[1495,254],HOLD[1]],'travel',-1,'enter from the right edge');
fly(6,5.1,5.82,[HOLD[0],[330,289],[510,331],COLLISION_LEG[0]],'travel',1,'first approach');
fly(6,5.82,6.48,COLLISION_LEG,'brake',1,'blocked by fork');
fly(6,6.48,6.98,[IMPACT,[794,498],[792,491],[786,492]],'squeeze',1,'recognize obstruction');
fly(6,6.98,7.7,[[786,492],[660,383],[390,289],HOLD[0]],'travel',-1,'retreat');
fly(7,8.1,8.82,[HOLD[1],[1170,245],[770,270],COLLISION_LEG[0]],'travel',-1,'second approach');
fly(7,8.82,9.48,COLLISION_LEG,'brake',1,'same obstruction');
fly(7,9.48,9.98,[IMPACT,[794,498],[792,491],[786,492]],'squeeze',1,'same correction');
fly(7,9.98,10.7,[[786,492],[959,328],[1230,259],HOLD[1]],'travel',1,'retreat');
fly(6,14.05,14.61,[HOLD[0],[350,284],[548,333],COLLISION_LEG[0]],'travel',1,'test wider gap');
fly(6,14.61,15.18,COLLISION_LEG,'brake',1,'fork remains');
fly(6,15.18,15.82,[IMPACT,[677,380],[409,289],HOLD[0]],'travel',-1,'proposal incomplete');
fly(3,16.48,17.16,DEMO_POSITION,'depart',1,'position beside the fork');
fly(3,17.16,17.5,RIGHT_ENTRY,'travel',-1,'show the side route');
fly(3,17.5,18.04,RIGHT_LAND,'land',-1,'demonstrate a successful landing');
fly(ORCHESTRATOR,LEADER_HOVER.depart,LEADER_HOVER.at,[ground(565),[577,380],[708,304],LEADER_HOVER.position],'depart',1,'rise to guide the group');
fly(ORCHESTRATOR,LEADER_HOVER.at,LEADER_HOVER.until,Array.from({length:4},()=>[...LEADER_HOVER.position]) as Bezier,'hover',1,'hover above the middle');
fly(ORCHESTRATOR,23.12,23.46,[LEADER_HOVER.position,[723,302],[652,335],[655,418]],'travel',-1,'finish guiding the cleanup');
fly(ORCHESTRATOR,23.46,LEADER_HOVER.land,[[655,418],[655,456],[655,500],ground(655)],'land',1,'rejoin the shared perch');
fly(3,19.65,20.21,[ground(1360),[1250,315],[947,344],ground(925)],'land',-1,'make the end pocket available');
fly(6,28.03,28.58,LEFT_ENTRY,'travel',1,'follow left guidance');
fly(6,28.58,29.36,LEFT_LAND,'land',1,'first comfortable landing');
fly(7,29.8,30.36,RIGHT_ENTRY,'travel',-1,'follow right guidance');
fly(7,30.36,31.14,RIGHT_LAND,'land',-1,'second comfortable landing');
fly(0,31.56,32.08,[ground(560),[491,379],[301,293],HOLD[0]],'depart',-1,'resident tries the route');
fly(0,32.08,32.56,LEFT_ENTRY,'travel',1,'repeat established entry');
fly(0,32.56,33.25,RESIDENT_RETURN,'land',1,'return to original perch');
export const FLIGHTS=flights;
export interface Shift {bird:number;at:number;until:number;from:number;to:number;lift:number;label:string}
export const SHIFTS:Shift[]=[
  {bird:1,at:12.0,until:12.4,from:627,to:565,lift:21,label:'make room for the first proposal'},
  {bird:2,at:12.62,until:13.03,from:702,to:657,lift:17,label:'widen the central gap'},
  {bird:0,at:13.23,until:13.62,from:420,to:392,lift:12,label:'complete the outward shift'},
  {bird:2,at:19.0,until:19.43,from:657,to:748,lift:26,label:'first reconsidered move'},
  {bird:4,at:20.44,until:20.8,from:1004,to:1038,lift:0,label:'right neighbour responds'},
  {bird:5,at:21.66,until:22.1,from:1230,to:1136,lift:23,label:'open the right landing pocket'},
  {bird:0,at:22.32,until:22.79,from:392,to:560,lift:32,label:'open the left landing pocket'},
];
export const endInk=(i:number)=>35.2+i*.13;
export const INK_RESTS=[{bird:6,at:7.88,release:11.4},{bird:7,at:10.88,release:23.4},{bird:6,at:16.0,release:22.95}];
// The coordinator listens to the demonstration, then invites each group in turn.
// Cues precede the helpers' attention and grasp; they do not replace their contributions.
export const COORDINATION=[
  {at:18.58,cueAt:18.68,cueUntil:19.12,releaseAt:19.18,until:19.38,face:1,recipient:5,responseAt:19.18,responseUntil:19.4},
  {at:19.85,cueAt:20.08,cueUntil:20.63,releaseAt:20.70,until:20.98,face:-1,recipient:0,responseAt:20.59,responseUntil:20.86},
] as const;
export function birdAt(i:number,raw:number):BirdState{
  const b=CAST[i],t=i<6&&raw<4.4?0:Math.min(raw,endInk(i));
  let x=b.initial as number,y=branchAt(x,t),facing=b.face as number,spread=0,flap=0,pitch=0,planted=i<6,action='rest',footReach=1;
  let currentFlight:Flight|undefined,currentShift:Shift|undefined,lastFlight:Flight|undefined;
  // Every event is absolute. Choosing the latest begun action avoids competing completed events.
  const events=[...FLIGHTS.filter(f=>f.bird===i).map(f=>({at:f.at,f})),...SHIFTS.filter(s=>s.bird===i).map(s=>({at:s.at,s}))].sort((a,b)=>a.at-b.at);
  if(i>=6){[x,y]=FLIGHTS.find(f=>f.bird===i)!.curve[0];planted=false;spread=.68;action='off page';}
  for(const e of events){if(e.at>t)break;if('f' in e){lastFlight=e.f;currentFlight=e.f;currentShift=undefined;}else{currentShift=e.s;currentFlight=undefined;}}
  if(currentFlight){
    const f=currentFlight,p=progress(t,f.at,f.until),atEnd=p===1;
    const travel=f.mode==='travel'||f.mode==='depart'?ease(p):glide(p);
    const earlier=FLIGHTS.filter(a=>a.bird===i&&a.at<f.at).at(-1);
    const startingFace=earlier&&f.at-earlier.until<.2?earlier.face:b.face;
    [x,y]=bezier(f.curve,travel);facing=lerp(startingFace,f.face,ease(progress(t,f.at,f.at+.16)));action=atEnd?'rest':f.label;
    const lands=Math.abs(f.curve[3][1]-branchAt(f.curve[3][0]))<.05;
    planted=atEnd&&lands;
    if(planted){y=branchAt(x,t);facing=b.face;spread=0;flap=0;footReach=1;}
    else{
      const leaving=Math.abs(f.curve[0][1]-branchAt(f.curve[0][0]))<.05;
      const opening=leaving?ease(progress(p,0,.18)):1;
      const folding=lands?1-ease(progress(p,.78,1)):1;
      const priorSpread=earlier&&f.at-earlier.until<.2?(earlier.mode==='squeeze'?.38:earlier.mode==='brake'?1:earlier.mode==='land'?0:.79):(leaving?0:.59);
      const targetSpread=f.mode==='squeeze'?lerp(1,.38,ease(p)):f.mode==='brake'?1:.79;
      spread=lerp(priorSpread,targetSpread,ease(progress(t,f.at,f.at+.14)))*opening*folding;
      const flapStrength=f.mode==='brake'?.22:f.mode==='squeeze'?.48:.62;
      const beats=(f.mode==='land'?1-ease(progress(p,.42,.8)):1);
      flap=Math.sin(t*Math.PI*2*5.7+b.seed)*flapStrength*beats*opening*folding;
      pitch=facing*(f.mode==='brake'?-.14:f.mode==='land'?-.09:.12*Math.sin(p*Math.PI));
      footReach=lands?ease(progress(p,.55,.87)):0;
    }
    if(atEnd&&!lands){action='waiting';facing=lerp(f.face,i===7?-1:1,ease(progress(t,f.until,f.until+.16)));spread=.63;flap=0;}
  }
  if(currentShift){
    const s=currentShift,p=progress(t,s.at,s.until);x=lerp(s.from,s.to,glide(p));y=branchAt(x,t)-Math.sin(p*Math.PI)*s.lift;
    planted=p===1||s.lift===0;action=p===1?'rest':s.label;pitch=.09*Math.sin(p*Math.PI*2);facing=b.face;
  }
  // Waiting is intentionally quieter than the active demonstration: shallow glides, isolated beats.
  if(!planted&&(!currentFlight||t>=currentFlight.until)){
    const quiet=pulse(t,11,27.9,.5),wingBeatWindow=pulse((t+i*.31)%3.4,0,.6,.12);
    flap=Math.sin(t*Math.PI*2*5.7)*.26*wingBeatWindow*(1-quiet*.7);spread=.59;
    const next=FLIGHTS.find(f=>f.bird===i&&f.at>t);
    const settle=currentFlight?ease(progress(t,currentFlight.until,currentFlight.until+.25)):1;
    const prepare=next?1-ease(progress(t,next.at-.22,next.at)):1;
    x+=Math.sin(t*.85+i)*7*settle*prepare;y+=Math.sin(t*1.15+i)*3.5*settle*prepare;
  }
  if(currentFlight?.mode==='hover'&&t<currentFlight.until){
    const f=currentFlight,settled=ease(progress(t,f.at,f.at+.18))*(1-ease(progress(t,f.until-.16,f.until)));
    x+=Math.sin((t-f.at)*1.55)*4.5*settled;y+=Math.sin((t-f.at)*2.25)*2.8*settled;
    spread=.79;flap=Math.sin(t*Math.PI*2*5.7+b.seed)*lerp(.62,.33,settled);
    pitch=.022*Math.sin((t-f.at)*1.6)*settled;footReach=0;planted=false;
  }
  let head=Math.sin(t*.68+b.seed)*.035,tail=Math.sin(t*1.4+b.seed)*.026,breath=Math.sin(t*1.6+b.seed)*.7,ruffle=0,signal=0,tweet=0;
  if(i<6){head-=.18*pulse(t,11.03+i*.025,11.52,.13);head+=.14*pulse(t,11.58+i*.025,11.96,.1);}
  if(i===2)head+=.18*pulse(t,11.87,12.52,.18);
  // Delayed nearby reactions to the two identical points of failure.
  if(i===2||i===3){const r=pulse(t,6.68,7.48)+pulse(t,9.68,10.45);pitch-=r*.09;head-=r*.24;}
  if(i<3){head-=.3*pulse(t,17.8+i*.07,18.28,.16);head+=.17*pulse(t,18.32+i*.025,18.69,.1);head-=.28*pulse(t,18.77+i*.025,19.27,.14);}
  if(i===4)head-=.23*pulse(t,20.01,20.58,.16);
  if(i===1)head-=.19*pulse(t,20.65,21.12,.16);
  if(i===5)head-=.26*pulse(t,21.31,21.83,.14);
  if(i===0)head-=.23*pulse(t,21.96,22.4,.13);
  // The resident anticipates each arrival instead of reacting after a collision.
  if(i===0){pitch-=.085*pulse(t,28.96,29.7,.18);head-=.2*pulse(t,28.75,29.55,.15);}
  if(i===5){pitch-=.085*pulse(t,30.7,31.45,.18);head-=.22*pulse(t,30.53,31.36,.15);}
  if(i===1)head-=.24*pulse(t,33.3,33.8,.15);
  if(i===4)head+=.36*pulse(t,33.85,34.4,.18);
  if(i===2)ruffle=Math.sin(t*34)*pulse(t,34.5,34.95,.12);
  const clearing=clearingPose(i,t);pitch+=clearing.pitch;head+=clearing.head;tail+=clearing.tail;ruffle+=clearing.ruffle;
  for(const cue of COORDINATION){
    if(i===ORCHESTRATOR&&t>=cue.at&&t<cue.until){
      const turn=ease(progress(t,cue.at,cue.cueAt))*(1-ease(progress(t,cue.releaseAt,cue.until)));
      facing=lerp(b.face,cue.face,turn);signal=pulse(t,cue.cueAt,cue.cueUntil,.14);
      head+=.16*Math.sin(progress(t,cue.cueAt,cue.cueUntil)*Math.PI*2)*signal;
      pitch+=facing*.055*signal;tail-=.05*signal;action=cue.face===1?'invite the right helper':'invite the left helper';
    }
    if(i===cue.recipient)head-=.22*pulse(t,cue.responseAt,cue.responseUntil,.07);
  }
  if(i===ORCHESTRATOR){
    const addressBoth=pulse(t,21.02,22.8,.24);facing=lerp(facing,0,addressBoth);
    for(const call of LEADER_TWEETS){
      const voice=pulse(t,call.at,call.until,.12);
      tweet=Math.max(tweet,voice*Math.pow(Math.max(0,Math.sin((t-call.at)*Math.PI*2*5.4)),.7));
      if(voice>0){head+=tweet*.045;action=`tweet: ${call.text}`;}
    }
  }
  const feet:[number,number][]=[-11,12].map((hip,j)=>{
    // The orchestrator turns on its planted feet; the toe positions do not slide.
    const footX=hip*(i===ORCHESTRATOR&&planted?b.face:facing);
    if(!planted)return [footX,lerp(-22,0,footReach)];
    let fx=x+footX,fy=0;
    if(currentShift&&currentShift.lift===0&&t<currentShift.until){const p=progress(t,currentShift.at,currentShift.until),q=progress(p,j*.5,j*.5+.5);fx=lerp(currentShift.from,currentShift.to,glide(q))+footX;fy=-4*Math.sin(q*Math.PI);}
    return [fx-x,branchAt(fx,t)-y+fy];
  });
  void lastFlight;
  const loss=progress(raw,endInk(i),endInk(i)+1.9);
  const formation=ease(progress(raw,.9+i*.29,1.8+i*.29));
  const birth=pulse(raw,.68+i*.29,1.5+i*.29,.16)*(1-formation);
  return {id:b.id,x,y,facing,spread,flap,pitch,head,tail,breath,feet,ruffle,signal,tweet,planted,action,formation,dispersal:loss,pool:Math.max(birth,pulse(loss,.24,.95,.2)*.65),imprint:raw>=endInk(i)?100+i:-1};
}
export function performedBird(i:number,t:number):BirdState{
  const base=birdAt(i,t);
  for(let k=0;k<INK_RESTS.length;k++){
    const d=INK_RESTS[k];if(d.bird!==i||t<d.at||t>d.release+.78)continue;
    const frozen=birdAt(i,d.at),out=ease(progress(t,d.release,d.release+.46));
    if(t<d.at+.48)return {...frozen,dispersal:progress(t,d.at,d.at+.48),pool:ease(progress(t,d.at+.07,d.at+.4)),imprint:k,action:'tuck into ink'};
    if(t<d.release)return {...frozen,formation:0,dispersal:0,pool:1,imprint:k,action:'waiting as ink'};
    if(t<d.release+.46)return {...frozen,formation:out,dispersal:0,pool:1-out,imprint:k,head:frozen.head-.12*out,action:'pop out of ink'};
    const p=ease(progress(t,d.release+.46,d.release+.78));
    return {...base,x:lerp(frozen.x,base.x,p),y:lerp(frozen.y,base.y,p),spread:lerp(frozen.spread,base.spread,p),flap:lerp(frozen.flap,base.flap,p),head:lerp(frozen.head-.12,base.head,p)};
  }
  return base;
}
export function evaluateScore(time:number):SceneState{
  time=limit(time,0,PLAYBACK.scoreLength);let chapter=0;CHAPTERS.forEach((c,i)=>{if(time>=c[0])chapter=i;});
  return {time,scoreTime:time,chapter,caption:time>=19.4&&time<24?CLEARING_CAPTION:CHAPTERS[chapter][2],birds:CAST.map((_,i)=>performedBird(i,time)),branchInk:ease(progress(time,.5,3.6)),branchLoss:progress(time,37.65,39.65),registration:12*pulse(time,25.05,27.75,.4),annotations:1-ease(progress(time,34.5,35.7))};
}
export function evaluateScene(time:number):SceneState{
  const elapsed=limit(time,0,SETTINGS.length);
  return {...evaluateScore(scoreTime(elapsed)),time:elapsed};
}
