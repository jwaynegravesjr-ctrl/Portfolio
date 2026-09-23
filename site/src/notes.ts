import {type SceneState,FLIGHTS,LEADER_TWEETS,COLLISION_LEG,LEFT_ENTRY,LEFT_LAND,RIGHT_ENTRY,RIGHT_LAND,RESIDENT_RETURN,branchAt,beakPoint} from './score';
import {type Bezier,bezier,progress,ease,pulse} from './numbers';
import {ORCHESTRATOR} from './config';
export interface ViewFlags {identities:boolean;clearance:boolean;paths:boolean;guidance:boolean}
function curve(c:CanvasRenderingContext2D,b:Bezier,amount:number,alpha:number,broken=false){if(amount<=0||alpha<=0)return;c.strokeStyle=`rgba(0,0,0,${alpha})`;c.lineWidth=.95;c.setLineDash(broken?[3,7]:[]);c.beginPath();for(let n=0;n<=120*amount;n++){const p=bezier(b,n/120);if(n)c.lineTo(...p);else c.moveTo(...p);}c.stroke();c.setLineDash([]);}
function leaderWords(c:CanvasRenderingContext2D,text:string,x:number,y:number,t:number,at:number,until:number,size:number,alpha:number,center=false){
  if(t<=at||t>=until+.12)return;
  c.font=`italic ${size}px Georgia`;
  const spacing=.16,width=c.measureText(text).width+(text.length-1)*spacing;
  let cursor=center?x-width/2:x;
  const reveal=progress(t,at,at+.24)*(text.length+2),dissolve=progress(t,until-.15,until+.12);
  for(let i=0;i<text.length;i++){
    const seed=(Math.sin(i*13.17+text.length)*43758.5453)%1,variation=Math.abs(seed);
    const ink=ease(Math.min(1,Math.max(0,reveal-i)))*(1-ease(progress(dissolve,.03+variation*.28,.63+variation*.3)));
    c.fillStyle=`rgba(0,0,0,${ink*alpha})`;
    c.fillText(text[i],cursor,y+Math.sin(i*.87+text.length)*.24);
    cursor+=c.measureText(text[i]).width+spacing;
  }
}
function leaderAnnotations(c:CanvasRenderingContext2D,s:SceneState){
  const t=s.scoreTime;if(t<18.64||t>=23.12)return;
  const lead=s.birds[ORCHESTRATOR],presence=pulse(t,18.64,23.12,.2);
  leaderWords(c,'operational leader',800,183,t,18.64,23,19,.74,true);
  // A short pen stroke joins the label to the hovering bird without enclosing it.
  c.strokeStyle=`rgba(0,0,0,${presence*.38})`;c.lineWidth=.8;c.beginPath();
  c.moveTo(792,193);c.quadraticCurveTo(800,194,805,201);c.stroke();
  for(let i=0;i<LEADER_TWEETS.length;i++){
    const cue=LEADER_TWEETS[i];
    // Side instructions sit beyond the wings. The final shared instruction rests below them.
    const x=i===0?959:i===1?423:800,y=i===0?259:i===1?262:371;
    leaderWords(c,cue.text,x,y,t,cue.at,cue.until,22,.84,i===2);
    if(t<cue.at||t>cue.until)continue;
    const strength=(lead.tweet??0)*presence;
    if(strength<=.015)continue;
    const [bx,by]=beakPoint(ORCHESTRATOR,lead);
    // Two soft arcs breathe with each opening of the painted beak. A frontal cue reaches both sides.
    const directions=cue.face===0?[-1,1]:[cue.face];
    for(const direction of directions){
      for(let j=0;j<3;j++){
        // Start visible rings beyond the wing fan, so the silhouette mask cannot hide the tweet.
        const distance=(cue.face===0?94:62)+j*9+strength*2;
        c.strokeStyle=`rgba(0,0,0,${strength*(.68-j*.115)})`;c.lineWidth=1.05-j*.12;c.beginPath();
        c.moveTo(bx+direction*distance,by-7-j*3.6);
        c.quadraticCurveTo(bx+direction*(distance+5),by-1,bx+direction*(distance+1),by+4+j*3);
        c.stroke();
      }
    }
  }
}
export function annotations(c:CanvasRenderingContext2D,s:SceneState,flags:ViewFlags){
  c.clearRect(0,0,1600,900);c.lineCap='round';const t=s.scoreTime,a=s.annotations;
  if(flags.guidance){
    leaderAnnotations(c,s);
    // Each completed attempt independently deposits a trace; the shared final leg darkens twice.
    for(const [start,end] of [[5.82,6.48],[8.82,9.48]])curve(c,COLLISION_LEG,progress(t,start,end),.15*a);
    const first=FLIGHTS.find(f=>f.label==='first approach')!;curve(c,first.curve,progress(t,first.at,first.until),.11*a);
    const second=FLIGHTS.find(f=>f.label==='second approach')!;curve(c,second.curve,progress(t,second.at,second.until),.08*a);
    const proposal=FLIGHTS.find(f=>f.label==='test wider gap')!;curve(c,proposal.curve,progress(t,12.7,14.6),(.23-.19*ease(progress(t,19,22)))*a,t>19);
    const left=progress(t,20.95,23.05),right=progress(t,17.5,18.04);
    curve(c,RIGHT_LAND,right,(t<20?.32:.37)*a);curve(c,RIGHT_ENTRY,progress(t,20,22),.3*a);
    curve(c,LEFT_ENTRY,left,.32*a);curve(c,LEFT_LAND,progress(t,21.4,23.4),.37*a);
    curve(c,RESIDENT_RETURN,progress(t,22.7,23.7),.13*a,true);
    const inspect=ease(progress(t,11.15,11.8))*(1-.85*ease(progress(t,19,22)))*a;
    const edge=748-45*ease(progress(t,12.62,13.03));
    c.strokeStyle=`rgba(0,0,0,${inspect*.5})`;c.lineWidth=.9;c.beginPath();c.moveTo(edge,584);c.quadraticCurveTo((edge+885)/2,588,885,584);c.moveTo(edge,579);c.lineTo(edge,589);c.moveTo(885,579);c.lineTo(885,589);c.stroke();
    c.beginPath();c.ellipse(794,451,111,68,-.05,3.65,6.19);c.stroke();
    c.font='italic 12px Georgia';c.fillStyle=`rgba(0,0,0,${inspect*.7})`;c.fillText('room to perch',(edge+885)/2-37,610);
    // The spoken instruction occupies this caption's place briefly; keep their ink from crossing.
    const sharedCue=LEADER_TWEETS[2],roomCaption=1-pulse(t,sharedCue.at-.12,sharedCue.until+.25,.12);
    c.fillStyle=`rgba(0,0,0,${inspect*.7*roomCaption})`;c.fillText('room to land',713,370);
    const revised=ease(progress(t,22.4,23.5))*a;c.strokeStyle=`rgba(0,0,0,${revised*.32})`;
    for(const x of [285,1360]){const y=branchAt(x)+20;c.beginPath();c.moveTo(x-48,y);c.quadraticCurveTo(x,y+4,x+48,y);c.stroke();}
  }
  if(flags.paths)for(const f of FLIGHTS)curve(c,f.curve,1,.22,true);
  if(flags.clearance){c.strokeStyle='rgba(0,0,0,.55)';c.setLineDash([4,4]);c.strokeRect(745,366,155,184);for(const x of [285,1360])c.strokeRect(x-105,branchAt(x)-176,210,190);c.setLineDash([]);}
  if(flags.identities){c.font='13px monospace';c.fillStyle='#29241f';s.birds.forEach(b=>c.fillText(b.id,b.x-8,b.y+34));}
}
