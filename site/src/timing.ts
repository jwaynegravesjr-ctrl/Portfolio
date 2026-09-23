import {SETTINGS} from './config';
import {limit,lerp} from './numbers';

/** Playback and choreography share one clock. No global motion acceleration. */
export const scoreTime=(seconds:number)=>limit(seconds,0,SETTINGS.length);
export const playbackTime=scoreTime;

/** Only stationary worksheet ink and legacy guidance marks use this map.
 * Bird flights, hops, title, clearing, and branch response use direct seconds.
 */
const PAPER_BEATS:readonly [number,number][]=[
  [0,0],[2.9,3.25],[4.2,5.1],[7.5,10.7],[7.7,11],
  [8.55,14.05],[9.95,15.82],[10.25,16.48],[11.62,18.04],
  [12.15,18.64],[14.5,24],[15.6,28.03],[19.9,33.25],
  [21,35],[22.25,39.65],[24,40],
];
export function paperTime(seconds:number):number{
  const t=scoreTime(seconds);
  for(let i=1;i<PAPER_BEATS.length;i++){
    const [end,oldEnd]=PAPER_BEATS[i];
    if(t<=end){const [start,oldStart]=PAPER_BEATS[i-1];return lerp(oldStart,oldEnd,(t-start)/(end-start));}
  }
  return 40;
}
