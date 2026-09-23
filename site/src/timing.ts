import {ACCELERATION,OPENING,PLAYBACK,SETTINGS} from './config';
import {limit} from './numbers';

const span=PLAYBACK.slowTo-PLAYBACK.slowFrom;
const duration=span*PLAYBACK.stretch;
const extra=duration-span;
const edge=PLAYBACK.blend;
const rate=(span-edge)/(duration-edge);
const integratedSmooth=(p:number)=>p*p*p-.5*p*p*p*p;
const shoulder=edge*(1+rate)/2;
const openingEaseDuration=OPENING.realSeconds-OPENING.easeStart;
const accelerationEaseDuration=ACCELERATION.realEnd-ACCELERATION.easeStart;
const legacyLength=ACCELERATION.priorPlaybackLength+OPENING.shift;

/** Existing 45-second score mapping, retained as the post-opening timing base. */
function legacyScoreTime(seconds:number):number{
  const t=limit(seconds,0,legacyLength);
  if(t<=PLAYBACK.slowFrom)return t;
  if(t>=PLAYBACK.slowFrom+duration)return t-extra;
  const x=t-PLAYBACK.slowFrom;
  if(x<edge)return PLAYBACK.slowFrom+x-(1-rate)*edge*integratedSmooth(x/edge);
  if(x<=duration-edge)return PLAYBACK.slowFrom+shoulder+(x-edge)*rate;
  const p=(x-duration+edge)/edge;
  return PLAYBACK.slowTo-shoulder+rate*edge*p+(1-rate)*edge*integratedSmooth(p);
}

function legacyPlaybackTime(seconds:number):number{
  const t=limit(seconds,0,PLAYBACK.scoreLength);
  if(t<=PLAYBACK.slowFrom)return t;
  if(t>=PLAYBACK.slowTo)return t+extra;
  let low:number=PLAYBACK.slowFrom,high:number=PLAYBACK.slowFrom+duration;
  for(let n=0;n<44;n++){
    const mid=(low+high)/2;
    if(legacyScoreTime(mid)<t)low=mid;else high=mid;
  }
  return (low+high)/2;
}

function openingScoreTime(seconds:number):number{
  if(seconds<=OPENING.easeStart)return OPENING.rate*seconds;
  const p=(seconds-OPENING.easeStart)/openingEaseDuration;
  return OPENING.rate*seconds-(OPENING.rate-1)*openingEaseDuration*integratedSmooth(p);
}

/** Current forty-two-second map before the additional opening pace warp. */
function priorScoreTime(seconds:number):number{
  const t=limit(seconds,0,ACCELERATION.priorPlaybackLength);
  if(t<OPENING.realSeconds)return openingScoreTime(t);
  return legacyScoreTime(t+OPENING.shift);
}

function priorPlaybackTime(seconds:number):number{
  const t=limit(seconds,0,PLAYBACK.scoreLength);
  if(t>OPENING.authoredSeconds)return legacyPlaybackTime(t)-OPENING.shift;
  let low:number=0,high:number=OPENING.realSeconds;
  for(let n=0;n<44;n++){
    const mid=(low+high)/2;
    if(openingScoreTime(mid)<t)low=mid;else high=mid;
  }
  return (low+high)/2;
}

function accelerationTime(seconds:number):number{
  if(seconds<=ACCELERATION.easeStart)return ACCELERATION.rate*seconds;
  if(seconds<ACCELERATION.realEnd){
    const p=(seconds-ACCELERATION.easeStart)/accelerationEaseDuration;
    return ACCELERATION.rate*seconds-(ACCELERATION.rate-1)*accelerationEaseDuration*integratedSmooth(p);
  }
  return seconds+ACCELERATION.shift;
}

/** Actual player seconds -> authored story seconds. */
export function scoreTime(seconds:number):number{
  const t=limit(seconds,0,SETTINGS.length);
  return priorScoreTime(accelerationTime(t));
}

/** Inverse for chapter seeking across both smooth opening pace maps. */
export function playbackTime(seconds:number):number{
  const priorTime=priorPlaybackTime(limit(seconds,0,PLAYBACK.scoreLength));
  if(priorTime>=ACCELERATION.priorEnd)return priorTime-ACCELERATION.shift;
  let low:number=0,high:number=ACCELERATION.realEnd;
  for(let n=0;n<44;n++){
    const mid=(low+high)/2;
    if(accelerationTime(mid)<priorTime)low=mid;else high=mid;
  }
  return (low+high)/2;
}
