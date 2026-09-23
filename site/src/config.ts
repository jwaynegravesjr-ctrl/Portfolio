export const BEATS={titleForm:1.3,titleHold:3,titleClear:4.05,arrivals:4.2,failuresEnd:7.7,proposalEnd:10.2,collaborationEnd:14.5,guidanceEnd:15.6,successEnd:21,dispersalEnd:22.25,tableauFormed:23.4,end:24} as const;
export const SETTINGS={ width:1600,height:900,length:BEATS.end,paper:'#efe7d7',ink:'#211c17',note:'#6e6051',pixelRatio:2,bleed:11,roughness:.55,density:1.12,fiberScale:1,seed:303 };
export const WINGBEATS_PER_SECOND=4.2;
export const STYLE={contour:1.24,wash:1.18,branch:1.22};
export const CLOSING={
  name:'J WAYNE GRAVES JR',
  role:'Operation Leader, Automation Expert and Quality Improvement Specialist',
  enter:0,resolved:BEATS.titleForm,leave:BEATS.titleHold,clear:BEATS.titleClear,
  nameSize:142,roleSize:33,nameY:237,roleY:322,width:1450,
} as const;
// Shader ink colors are page color values; no light simulation or tone mapping.
export const inkRGB=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
export const CHAPTERS=[
  [0,'An uneven arrangement','Six birds wait beneath an ink-formed name. Two more arrive from beyond the page.'],
  [BEATS.arrivals,'The same obstacle','Two arrivals. The same flowering fork in the way.'],
  [BEATS.failuresEnd,'A reasonable first idea','My first proposal makes more room to perch. The landing still needs more room.'],
  [BEATS.proposalEnd,'A different question','The Nurse Supervisor’s input changes the approach. The group watches, then revises.'],
  [BEATS.collaborationEnd,'Guidance, then implementation','We design the operational guidance. AI produces the movement that follows it.'],
  [BEATS.guidanceEnd,'A rhythm that holds','A small accommodation. A safe arrival. Then it works again.'],
  [BEATS.successEnd,'Absorbed into the paper','The arrangement rests, and the ink returns to the paper.'],
] as const;
export const CLEARING_CAPTION='The operational leader tweets a little guidance. Both sides clear the way.';
export const ORCHESTRATOR=1;
export const CAST=[
  {id:'B1',initial:420,revised:560,face:1,seed:41,width:1.02,height:.98,tuft:3},
  {id:'B2',initial:627,revised:655,face:1,seed:73,width:.95,height:1.04,tuft:2},
  {id:'B3',initial:702,revised:748,face:1,seed:101,width:1.04,height:.94,tuft:4},
  {id:'B4',initial:931,revised:925,face:-1,seed:127,width:.98,height:1.04,tuft:2},
  {id:'B5',initial:1004,revised:1038,face:-1,seed:157,width:1,height:1,tuft:3},
  {id:'B6',initial:1230,revised:1136,face:-1,seed:191,width:1.02,height:.94,tuft:4},
  {id:'B7',initial:220,revised:285,face:1,seed:223,width:.97,height:1,tuft:2},
  {id:'B8',initial:1390,revised:1360,face:-1,seed:251,width:1.04,height:.98,tuft:3},
] as const;
