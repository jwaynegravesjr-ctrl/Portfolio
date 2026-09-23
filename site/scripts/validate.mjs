import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const temporary=await mkdtemp(join(resolve(tmpdir()),'shared-perch-score-'));
const checks=[];
const test=(name,fn)=>{fn();checks.push(name);};
const near=(a,b,message,epsilon=1e-6)=>assert.ok(Math.abs(a-b)<=epsilon,`${message}: ${a} vs ${b}`);
const point=(a,b,message,epsilon=1e-6)=>{near(a[0],b[0],message+' x',epsilon);near(a[1],b[1],message+' y',epsilon);};

try{
  await build({root,configFile:false,logLevel:'error',build:{outDir:temporary,emptyOutDir:true,minify:false,
    lib:{entry:join(root,'src/score.ts'),formats:['es'],fileName:()=> 'score.mjs'}}});
  const {evaluateScene,scoreTime,playbackTime,birdAt,performedBird,branchAt,
    FLIGHTS,SHIFTS,EVENTS,COLLISION_LEG,RIGHT_ENTRY,RIGHT_LAND,INK_RESTS,
    CLEARS,twigAt,beakPoint,COORDINATION,LEADER_HOVER,LEADER_TWEETS,endInk}=await import(pathToFileURL(join(temporary,'score.mjs')).href);

  test('One direct 24-second clock has no fast-forward mapping',()=>{
    for(const t of [0,1,2.5,5,9,12,15,18,21.5,24]){
      near(scoreTime(t),t,'score time');near(playbackTime(t),t,'playback time');
      near(evaluateScene(t).scoreTime,t,'scene time');
    }
    near(scoreTime(25),24,'end clamp');
  });

  test('Opening and loop seam share one six-bird tableau',()=>{
    const first=evaluateScene(0),last=evaluateScene(24);
    assert.deepEqual(first.birds.map(b=>b.id),['B1','B2','B3','B4','B5','B6','B7','B8']);
    for(let i=0;i<6;i++){
      const a=first.birds[i],b=last.birds[i];
      assert.equal(a.formation,1);assert.equal(b.formation,1);
      assert.equal(a.dispersal,0);assert.equal(b.dispersal,0);
      for(const key of ['x','y','facing','spread','flap','pitch','head','tail','breath'])near(a[key],b[key],`seam ${a.id} ${key}`);
      assert.deepEqual(a.feet,b.feet);
    }
    for(const i of [6,7]){
      assert.equal(first.birds[i].formation,0);assert.equal(last.birds[i].formation,0);
      assert.equal(first.birds[i].pool,0);assert.equal(last.birds[i].pool,0);
    }
    near(first.branchInk,1,'opening branch');near(last.branchInk,1,'loop branch');
    near(first.branchLoss,0,'opening branch loss');near(last.branchLoss,0,'loop branch loss');
    assert.equal(last.annotations,0);
  });

  test('Two original newcomers form near opposite edges and keep their identity',()=>{
    const incoming=FLIGHTS.filter(f=>f.label.startsWith('enter from'));
    assert.deepEqual(incoming.map(f=>f.bird),[6,7]);
    assert.ok(birdAt(6,0).x+160<0);assert.ok(birdAt(7,0).x-160>1600);
    for(const f of incoming){
      assert.ok(f.at>=2.6&&f.until<=4.1);
      assert.ok(birdAt(f.bird,f.at).formation<.6);
      assert.ok(birdAt(f.bird,f.until).formation>.95);
      point([birdAt(f.bird,f.until).x,birdAt(f.bird,f.until).y],f.curve[3],'flight reaches waiting point');
    }
    for(let k=0;k<=240;k++)assert.deepEqual(evaluateScene(k/10).birds.map(b=>b.id),['B1','B2','B3','B4','B5','B6','B7','B8']);
  });

  test('Two failures and the incomplete retry reach one real fork',()=>{
    const attempts=FLIGHTS.filter(f=>['blocked by fork','same obstruction','fork remains'].includes(f.label));
    assert.equal(attempts.length,3);
    for(const f of attempts)assert.deepEqual(f.curve,COLLISION_LEG);
    assert.ok(attempts[1].at>attempts[0].until+.8,'Repeated failure remains distinct');
    for(const p of [.25,.5,.85,1]){
      const positions=attempts.map(f=>birdAt(f.bird,f.at+(f.until-f.at)*p));
      for(const b of positions.slice(1))point([b.x,b.y],[positions[0].x,positions[0].y],'same constrained corridor');
    }
  });

  test('Demonstration precedes changed guidance and the successful route',()=>{
    const demo=FLIGHTS.find(f=>f.label==='demonstrate a successful landing');
    const guided=FLIGHTS.find(f=>f.label==='second comfortable landing');
    assert.deepEqual(demo.curve,RIGHT_LAND);assert.deepEqual(guided.curve,RIGHT_LAND);
    assert.ok(demo.until<guided.at-5);
    const entries=FLIGHTS.filter(f=>['show the side route','follow right guidance'].includes(f.label));
    entries.forEach(f=>assert.deepEqual(f.curve,RIGHT_ENTRY));
    const revised=SHIFTS.filter(s=>s.at>=12);
    assert.ok(revised.some(s=>s.bird<3)&&revised.some(s=>s.bird>=3));
    assert.ok(revised[0].at>demo.until);
    for(let i=1;i<revised.length;i++)assert.ok(revised[i].at>revised[i-1].at);
  });

  test('Leader cues and both twig removals lead the chain of adjustments',()=>{
    assert.deepEqual(COORDINATION.map(c=>c.recipient),[5,0]);
    assert.equal(LEADER_TWEETS.length,3);
    for(const cue of COORDINATION){
      assert.ok(cue.at>11.62&&cue.cueUntil<LEADER_HOVER.until);
      const lead=birdAt(1,(cue.cueAt+cue.cueUntil)/2);
      assert.equal(lead.planted,false);assert.ok(lead.signal>.7);
    }
    assert.equal(CLEARS.length,2);
    for(const [index,a] of CLEARS.entries()){
      assert.ok(a.at>11.62);
      const next=SHIFTS.find(s=>s.bird===a.bird&&s.at>a.at);
      assert.ok(next&&a.toss<next.at);
      const birds=evaluateScene(a.grip).birds;
      const twig=twigAt(index,a.grip,birds,CLEARS.map(c=>birdAt(c.bird,c.toss)));
      point(twig.grip,beakPoint(a.bird,birds[a.bird]),'twig meets beak');
    }
  });

  test('Flights and hops retain readable durations and planted toes meet the branch',()=>{
    for(const f of FLIGHTS)assert.ok(f.until-f.at>=.19,`${f.label} is too abrupt`);
    for(const s of SHIFTS)assert.ok(s.until-s.at>=.27,`${s.label} is too abrupt`);
    for(const f of FLIGHTS)for(const boundary of [f.at,f.until]){
      const a=performedBird(f.bird,boundary-.001),b=performedBird(f.bird,boundary+.001);
      if(a.formation>.1&&b.formation>.1&&a.dispersal<.8&&b.dispersal<.8)
        assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<5,`${f.label} jumps at ${boundary}`);
    }
    for(let tick=0;tick<=840;tick++){
      const t=tick/40;
      for(const [i,b] of evaluateScene(t).birds.entries()){
        if(!b.planted||SHIFTS.some(s=>s.bird===i&&s.lift===0&&t>=s.at&&t<s.until))continue;
        for(const [dx,dy] of b.feet)near(b.y+dy,branchAt(b.x+dx,Math.min(t,endInk(i))),`toe at ${t}`,1e-5);
      }
    }
    for(const e of EVENTS)near(branchAt(e.x,e.time+1.61),branchAt(e.x,0),'branch settles');
  });

  test('Waiting ink remains page-fixed and resolves before the next flight',()=>{
    assert.deepEqual(INK_RESTS.map(d=>d.bird),[6,7,6]);
    for(const [k,d] of INK_RESTS.entries()){
      const held=birdAt(d.bird,d.at);
      for(const t of [d.at+.1,(d.at+d.release)/2,d.release-.05]){
        const b=performedBird(d.bird,t);assert.equal(b.imprint,k);
        point([b.x,b.y],[held.x,held.y],'fixed ink position');
      }
      const next=FLIGHTS.find(f=>f.bird===d.bird&&f.at>d.release);
      if(next)assert.ok(d.release+.78<=next.at+.01,'Bird re-forms before its next flight');
    }
  });

  test('All eight settle before dispersal, then the original six reform',()=>{
    const settled=evaluateScene(20.4).birds;
    assert.ok(settled.every(b=>b.planted&&b.formation===1&&b.dispersal===0));
    assert.deepEqual(settled.map(b=>b.x),[560,655,748,925,1038,1136,285,1360]);
    const fading=evaluateScene(21.6);
    assert.ok(fading.birds.every(b=>b.dispersal>0));
    assert.ok(evaluateScene(22.2).birds.every(b=>b.dispersal>.95));
    const reborn=evaluateScene(23.4);
    assert.ok(reborn.birds.slice(0,6).every(b=>b.formation===1));
    assert.ok(reborn.birds.slice(6).every(b=>b.formation===0));
  });

  test('Seeking in any order reconstructs the same state',()=>{
    const times=[0,1,2.5,5,9,12,15,18,20.4,21.5,22.7,23.7,24];
    const reference=new Map(times.map(t=>[t,JSON.stringify(evaluateScene(t))]));
    for(const t of [...times].reverse().concat([9,0,24,1,15]))assert.equal(JSON.stringify(evaluateScene(t)),reference.get(t));
    assert.equal(evaluateScene(-1).time,0);assert.equal(evaluateScene(25).time,24);
  });

  console.log(`${checks.length} critical timeline checks passed.`);
  for(const name of checks)console.log(`  ✓ ${name}`);
}finally{
  const resolved=resolve(temporary),base=resolve(tmpdir());
  if(dirname(resolved)!==base||!resolved.startsWith(join(base,'shared-perch-score-'))||resolved===base+sep)
    throw new Error(`Refusing to remove unexpected validation output directory: ${resolved}`);
  await rm(resolved,{recursive:true,force:true});
}
