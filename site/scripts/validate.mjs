import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

// Bundle only the pure score. No browser, WebGL context, or testing framework.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tempBase = resolve(tmpdir());
const temporary = await mkdtemp(join(tempBase, 'shared-perch-score-'));
const checks = [];
const test = (name, body) => { body(); checks.push(name); };
const near = (actual, expected, message, epsilon = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} vs ${expected}`);
const samePoint = (a, b, message) => {
  near(a[0], b[0], `${message}, x`); near(a[1], b[1], `${message}, y`);
};

try {
  await build({
    root, configFile: false, logLevel: 'error',
    build: {outDir: temporary, emptyOutDir: true, minify: false,
      lib: {entry: join(root, 'src/score.ts'), formats: ['es'], fileName: () => 'score.mjs'}},
  });
  const {
    evaluateScore:evaluateScene, evaluateScene:evaluatePlayback, scoreTime, playbackTime,
    birdAt, performedBird, branchAt, FLIGHTS, SHIFTS, EVENTS,
    COLLISION_LEG, RIGHT_ENTRY, RIGHT_LAND, INK_RESTS, endInk,
    CLEARS,twigAt,beakPoint,COORDINATION,LEADER_HOVER,LEADER_TWEETS,
  } = await import(pathToFileURL(join(temporary, 'score.mjs')).href);

  test('The faster opening composes continuously with the forty-second score and slower collaboration', () => {
    near(scoreTime(3),65/9,'The old five-second point maps to new second three');
    near(scoreTime(4.5),169/18,'New second 4.5 joins the old eased boundary at 6.5');
    near(scoreTime(5),10,'The opening maps authored second ten to new real second five');
    near(playbackTime(65/9),3,'Inverse restores the old five-second point');
    near(playbackTime(169/18),4.5,'Inverse restores the old 6.5-second point');
    near(playbackTime(10),5,'Inverse restores authored second ten');
    near(playbackTime(17),12,'The slower passage begins at new second twelve');
    near(playbackTime(22),22,'The slower passage ends at new second twenty-two');
    near(playbackTime(22)-playbackTime(17),10,'The full five authored seconds still receive ten playback seconds');
    near(playbackTime(40),40,'Later scenes retain their full durations after the two-second shift');
    near(scoreTime(40),40,'The complete score fits the forty-second loop');
    const middleRate=(scoreTime(17.001)-scoreTime(16.999))/.002;
    assert.ok(middleRate>.47&&middleRate<.5,'Middle playback runs just below half speed to allow smooth shoulders.');
    const boundaries=[2,3,4.5,5,12,12.5,21.5,22];
    for(const t of boundaries){
      const h=.0001,left=(scoreTime(t)-scoreTime(t-h))/h,right=(scoreTime(t+h)-scoreTime(t))/h;
      assert.ok(Math.abs(left-right)<.002,`Playback speed joins continuously at ${t} seconds.`);
    }
    for(let tick=0;tick<=1000;tick++){
      const t=tick/25,score=scoreTime(t),state=evaluatePlayback(t),authored=evaluateScene(score);
      near(playbackTime(score),t,'Timeline mapping round-trip',1e-6);
      near(state.time,t,'Public scene retains playback time');near(state.scoreTime,score,'Public scene reports authored time');
      assert.deepEqual(state.birds.map(b=>b.id),['B1','B2','B3','B4','B5','B6','B7','B8']);
      assert.deepEqual(state.birds,authored.birds,'Slower playback preserves every articulated bird and held twig pose.');
      for(const key of ['branchInk','branchLoss','registration','annotations','chapter'])assert.equal(state[key],authored[key]);
    }
    const at17=evaluatePlayback(17),atScore=evaluateScene(scoreTime(17));
    assert.deepEqual(at17.birds,atScore.birds);assert.ok(at17.scoreTime>17&&at17.scoreTime<22);
    assert.equal(evaluatePlayback(-1).time,0);assert.equal(evaluatePlayback(41).time,40);
  });

  test('The same eight identities persist throughout all forty seconds', () => {
    for (let tick = 0; tick <= 1000; tick++) {
      const birds = evaluateScene(tick / 25).birds;
      assert.deepEqual(birds.map(b => b.id), ['B1','B2','B3','B4','B5','B6','B7','B8']);
      for (const b of birds) assert.ok([b.x,b.y,b.head,b.spread,b.formation,b.dispersal].every(Number.isFinite));
    }
  });

  test('Both failed approaches and the wider-gap retry reach one physical obstruction', () => {
    const attempts = FLIGHTS.filter(f => ['blocked by fork','same obstruction','fork remains'].includes(f.label));
    assert.equal(attempts.length, 3);
    for (const f of attempts) assert.deepEqual(f.curve, COLLISION_LEG);
    for (const fraction of [0.2,0.5,0.85,1]) {
      const positions = attempts.map(f => birdAt(f.bird, f.at + (f.until - f.at) * fraction));
      for (const b of positions.slice(1)) samePoint([b.x,b.y], [positions[0].x,positions[0].y], 'common constrained corridor');
    }
    assert.ok(attempts[1].at > attempts[0].until + 1.5, 'The second attempt needs a readable pause.');
  });

  test('The two newcomers begin fully off the page and fly through its edges', () => {
    const incoming=FLIGHTS.filter(f=>f.label.startsWith('enter from'));
    assert.equal(incoming.length,2);
    assert.deepEqual(incoming.map(f=>f.bird),[6,7]);
    assert.ok(birdAt(6,0).x+160<0, 'B7 and its whole padded drawing begin off the left edge.');
    assert.ok(birdAt(7,0).x-160>1600, 'B8 and its whole padded drawing begin off the right edge.');
    for(const flight of incoming){
      const middle=birdAt(flight.bird,(flight.at+flight.until)/2),end=birdAt(flight.bird,flight.until);
      assert.ok(middle.x>flight.curve[0][0]&&middle.x<end.x || middle.x<flight.curve[0][0]&&middle.x>end.x);
      assert.equal(middle.formation,1, 'A recognizable complete bird crosses into view.');
      assert.equal(end.planted,false);samePoint([end.x,end.y],flight.curve[3],'The entrance joins the existing waiting position');
    }
    assert.ok(evaluateScene(5).birds.every(b=>b.x>0&&b.x<1600));
  });

  test('The right-group demonstration supplies the actual route later used by B8', () => {
    for (const [bird, labels] of [[3,['show the side route','demonstrate a successful landing']],
      [7,['follow right guidance','second comfortable landing']]]) {
      const entry = FLIGHTS.find(f => f.bird === bird && f.label === labels[0]);
      const landing = FLIGHTS.find(f => f.bird === bird && f.label === labels[1]);
      assert.ok(entry && landing);
      assert.deepEqual(entry.curve, RIGHT_ENTRY); assert.deepEqual(landing.curve, RIGHT_LAND);
      samePoint(entry.curve[3], landing.curve[0], 'continuous demonstrated route');
      assert.ok(birdAt(bird, landing.until).planted, 'The demonstrated route must visibly land.');
    }
  });

  test('Attention and reconsideration precede a sequential contribution by both groups', () => {
    const revisions = SHIFTS.filter(s => s.at >= 19);
    assert.equal(revisions[0].at, 19);
    const demo = FLIGHTS.find(f => f.label === 'demonstrate a successful landing');
    assert.ok(demo.until < 18.1 && revisions[0].at - demo.until > .9);
    const heads = [0,1,2].map(i => [birdAt(i,17.99).head,birdAt(i,18.55).head]);
    heads.forEach(([attention,reconsideration]) => assert.ok(reconsideration - attention > 0.17,
      'The left group should visibly attend and reconsider before moving.'));
    assert.ok(revisions.some(s => s.bird < 3) && revisions.some(s => s.bird >= 3));
    for (let i = 1; i < revisions.length; i++) assert.ok(revisions[i].at > revisions[i-1].until);
  });

  test('Planted toes meet the exact branch geometry outside the active sidestep', () => {
    for (let tick = 0; tick <= 1408; tick++) {
      const t = tick / 40;
      for (const [i,b] of evaluateScene(t).birds.entries()) {
        if (!b.planted || SHIFTS.some(s => s.bird === i && s.lift === 0 && t >= s.at && t < s.until)) continue;
        for (const [dx,dy] of b.feet) near(b.y + dy, branchAt(b.x + dx, Math.min(t,endInk(i))), `${b.id} planted toe at ${t}`);
      }
    }
  });

  test('The operational leader hovers centrally, tweets to both helpers and returns', () => {
    assert.equal(COORDINATION.length,2);
    assert.deepEqual(COORDINATION.map(c=>c.recipient),[5,0]);
    for(const cue of COORDINATION){
      assert.ok(cue.at>18.04,'The demonstrated route comes before the coordinating cues.');
      const middle=(cue.cueAt+cue.cueUntil)/2,lead=birdAt(1,middle);
      assert.equal(lead.signal,1);assert.equal(lead.facing,cue.face);
      assert.equal(lead.planted,false);assert.ok(lead.spread>.7);
      assert.ok(evaluateScene(middle).birds.filter(b=>b.signal>0).length===1);
      assert.ok(cue.responseAt< CLEARS.find(c=>c.bird===cue.recipient).grip);
      assert.ok(cue.cueUntil<LEADER_HOVER.until);
    }
    for(const t of [19.86,20.0,20.3,20.8,20.97]){
      const lead=birdAt(1,t);assert.equal(lead.planted,false);
      assert.ok(Math.abs(lead.x-800)<5&&Math.abs(lead.y-330)<3,'Hover remains in the middle with only a small drift.');
      assert.ok(lead.feet.every(f=>f[1]===-22),'Hovering feet stay tucked.');
    }
    assert.ok(birdAt(5,19.28).head<birdAt(5,19.12).head-.15,'right helper attends to the cue');
    assert.ok(birdAt(0,20.73).head<birdAt(0,20.48).head-.15,'left helper attends to the cue');
    assert.equal(LEADER_TWEETS.length,3);
    for(const call of LEADER_TWEETS){
      assert.ok(call.at>=LEADER_HOVER.at&&call.until<=LEADER_HOVER.until);
      const mouths=Array.from({length:40},(_,n)=>birdAt(1,call.at+n*(call.until-call.at)/40).tweet);
      assert.ok(Math.max(...mouths)>.8&&Math.min(...mouths)===0,'Beak opens and closes within every instruction.');
    }
    for(const boundary of [LEADER_HOVER.depart,LEADER_HOVER.at,LEADER_HOVER.until,23.46,LEADER_HOVER.land]){
      const a=birdAt(1,boundary-.00001),b=birdAt(1,boundary);
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<.04,'Takeoff, hover and return join without a position jump.');
    }
    const landed=birdAt(1,LEADER_HOVER.land);assert.equal(landed.planted,true);near(landed.x,655,'Leader returns to its planned perch');
    for(const t of [0,17,24,34.8,39.8])assert.ok(evaluateScene(t).birds.every(b=>b.signal===0&&b.tweet===0));
  });

  test('The branch keeps its geometry between small, damped landing responses', () => {
    for (const x of [155,285,420,655,748,835,925,1136,1360,1445]) {
      for (const t of [0,4,11,16,21,27,35,39.7]) near(branchAt(x,t), branchAt(x,0), `unchanged branch at ${x}, ${t}`);
      for (const e of EVENTS) {
        near(branchAt(x,e.time + 1.61), branchAt(x,0), 'landing response settles');
        assert.ok(Math.abs(branchAt(x,e.time + 0.15) - branchAt(x,0)) < 2.5);
      }
    }
    for (const b of evaluateScene(34).birds) assert.ok(b.x >= 155 && b.x <= 1445);
  });

  test('Both groups grasp, free and discard their loose twigs before hopping', () => {
    assert.equal(CLEARS.length,2);
    assert.ok(CLEARS.some(a=>a.bird<3)&&CLEARS.some(a=>a.bird>=3));
    const releases=CLEARS.map(a=>birdAt(a.bird,a.toss));
    CLEARS.forEach((a,index)=>{
      const at=t=>twigAt(index,t,evaluateScene(t).birds,releases);
      assert.ok(a.at>18.04,'Clearing follows the demonstrated alternative.');
      assert.ok(a.until<SHIFTS.find(s=>s.bird===a.bird&&s.at>a.at).at);
      for(const t of [a.grip,a.tugs[0][0]+.06,a.release+.04,a.toss-.001]){
        const state=at(t),bird=birdAt(a.bird,t);
        assert.equal(state.held,true);assert.equal(bird.planted,true);
        samePoint(state.grip,beakPoint(a.bird,bird),'twig end exactly meets evaluated beak');
        assert.equal(state.released,t>=a.release);
      }
      const before=at(a.toss-.00001),launched=at(a.toss);
      assert.ok(Math.hypot(before.grip[0]-launched.grip[0],before.grip[1]-launched.grip[1])<.03,'No jump at beak release.');
      assert.ok(Math.hypot(before.base[0]-launched.base[0],before.base[1]-launched.base[1])<.03,'No jump at free end.');
      const early=at(a.until+.1),late=at(a.fadeUntil-.1);
      samePoint(early.grip,late.grip,'discarded twig stain stays in the paper');
      assert.ok(late.breakup>early.breakup&&late.opacity<early.opacity);
      assert.equal(at(0).opacity,0);assert.equal(at(24).opacity,0);
      assert.equal(at(34.35).phase,'gone');assert.equal(at(39.8).opacity,0);
      assert.deepEqual(at(a.grip),at(a.grip),'seeking restores the twig without persistent state');
    });
  });

  test('Waiting ink captures B7/B8 in fixed page positions without adding identities', () => {
    assert.deepEqual(INK_RESTS.map(d => d.bird), [6,7,6]);
    INK_RESTS.forEach((d,k) => {
      const frozen = birdAt(d.bird,d.at);
      for (const t of [d.at + 0.1,d.at + 0.6,d.release - 0.1]) {
        const b = performedBird(d.bird,t);
        assert.equal(b.id,frozen.id); assert.equal(b.imprint,k);
        for (const key of ['x','y','facing','spread','flap','pitch','head','tail','breath']) near(b[key],frozen[key], `fixed waiting imprint ${key}`);
        assert.deepEqual(b.feet,frozen.feet);
      }
    });
    for (const b of evaluateScene(24).birds) {
      assert.equal(b.formation,1); assert.equal(b.dispersal,0); assert.equal(b.pool,0);
    }
  });

  test('Guidance separates before successful arrivals and returns to alignment', () => {
    near(evaluateScene(25.5).registration,12,'registration separation');
    near(evaluateScene(28).registration,0,'guidance alignment before implementation');
    assert.ok(FLIGHTS.find(f => f.label === 'follow left guidance').at >= 28);
    assert.ok(FLIGHTS.find(f => f.label === 'follow right guidance').at >= 28);
  });

  test('All eight settle together, then freeze for dispersal before clean paper', () => {
    const settled = evaluateScene(34.8).birds;
    assert.ok(settled.every(b => b.planted && b.formation === 1 && b.dispersal === 0));
    assert.ok(settled.every(b => b.spread === 0 && b.flap === 0), 'Every landed bird folds its wings.');
    assert.ok(settled.every(b => Math.sign(b.feet[1][0]-b.feet[0][0]) === b.facing), 'Feet must follow the facing direction without crossed shins.');
    assert.deepEqual(settled.map(b => b.x), [560,655,748,925,1038,1136,285,1360]);
    settled.forEach((_,i) => {
      const first = birdAt(i,endInk(i)); const late = birdAt(i,endInk(i) + 1.4);
      samePoint([first.x,first.y], [late.x,late.y], 'final page-fixed silhouette');
      for (const key of ['pitch','head','spread','flap','tail','breath']) near(first[key],late[key], `frozen final ${key}`);
      assert.equal(late.imprint,100+i);
    });
    const clean = evaluateScene(39.7);
    assert.equal(clean.branchLoss,1); assert.equal(clean.annotations,0);
    assert.ok(clean.birds.every(b => b.dispersal === 1 && b.pool === 0));
  });

  test('Seeking in any order produces identical score, annotation, and ink state', () => {
    const times = [0,6.25,9.2,12.8,17.5,18.6,22,24,25.5,30.8,34.8,36.1,39.7,40];
    const reference = new Map(times.map(t => [t,JSON.stringify(evaluateScene(t))]));
    for (const t of [...times].reverse().concat([22,7,35,22,0,40,22])) {
      const state = JSON.stringify(evaluateScene(t));
      if (reference.has(t)) assert.equal(state,reference.get(t), `deterministic seek ${t}`);
    }
    assert.equal(evaluateScene(-1).time,0); assert.equal(evaluateScene(41).time,40);
  });

  console.log(`${checks.length} critical timeline checks passed.`);
  for (const name of checks) console.log(`  ✓ ${name}`);
} finally {
  // This target comes from mkdtemp; verify its absolute parent before removal.
  const resolved = resolve(temporary);
  if (dirname(resolved) !== tempBase || !resolved.startsWith(join(tempBase,'shared-perch-score-')) || resolved === tempBase + sep) {
    throw new Error(`Refusing to remove unexpected validation output directory: ${resolved}`);
  }
  await rm(resolved,{recursive:true,force:true});
}
