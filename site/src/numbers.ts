export type Point=[number,number];export type Bezier=[Point,Point,Point,Point];
export const limit=(n:number,min=0,max=1)=>Math.min(max,Math.max(min,n));
export const progress=(t:number,a:number,b:number)=>limit((t-a)/(b-a));
export const ease=(p:number)=>{p=limit(p);return p*p*(3-2*p);};
export const glide=(p:number)=>{p=limit(p);return p*p*p*(10+p*(-15+6*p));};
export const lerp=(a:number,b:number,p:number)=>a+(b-a)*p;
export function pulse(t:number,a:number,b:number,edge=.2){return ease(progress(t,a,a+edge))*(1-ease(progress(t,b-edge,b)));}
export function bezier(c:Bezier,p:number):Point{const q=1-p;return [q*q*q*c[0][0]+3*q*q*p*c[1][0]+3*q*p*p*c[2][0]+p*p*p*c[3][0],q*q*q*c[0][1]+3*q*q*p*c[1][1]+3*q*p*p*c[2][1]+p*p*p*c[3][1]];}
export function rng(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
