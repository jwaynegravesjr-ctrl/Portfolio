import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(join(tmpdir(), 'approved-ink-score-'));
try {
  await build({ root, configFile:false, logLevel:'error', build:{ outDir:temporary, emptyOutDir:true, minify:false,
    lib:{ entry:join(root,'src/approved-timeline.ts'), formats:['es'], fileName:()=> 'timeline.mjs' } } });
  const { CONFIG, JOBS, REFERENCE_MONTHS, nameAmount, titleAmount, birdFormation, remainingDebris } =
    await import(pathToFileURL(join(temporary,'timeline.mjs')).href);
  assert.equal(CONFIG.birdSpeed,.85);
  assert.equal(CONFIG.birdLead,1.6);
  assert.ok(Math.abs(CONFIG.duration-(1.6+11/.85))<1e-9);
  assert.equal(CONFIG.chartSpeed,1.15*1.10);
  assert.equal(CONFIG.chartDuration,7.2/(1.15*1.10));
  assert.equal(CONFIG.heroPaper,'#efe7d7');
  assert.equal(JOBS.length,16);
  assert.deepEqual(new Set(JOBS.map(job=>job.bird)),new Set([0,1,2,3,4,5,6,7]));
  assert.equal(nameAmount(0),0);
  assert.equal(nameAmount(.92),1);
  for(const time of [.92,2.3,5,10.05,11,CONFIG.duration]) assert.equal(nameAmount(time),1,'The formed name persists.');
  for(const time of [1.17,2.2,5,10.05,CONFIG.duration]) assert.equal(titleAmount(time),1,'The formed role line persists.');
  assert.equal(birdFormation(0,0),0);
  assert.ok(birdFormation(0,.5)>0&&birdFormation(0,.5)<1);
  assert.ok(birdFormation(7,1)>0&&birdFormation(7,1)<1);
  assert.equal(birdFormation(7,2.2),1);
  assert.equal(remainingDebris(0),16);
  assert.ok(remainingDebris(6)>0 && remainingDebris(6)<16);
  assert.equal(remainingDebris(CONFIG.duration),0);
  assert.deepEqual(REFERENCE_MONTHS.map(month=>month.name),['April','May','June','July','August']);
  for(const month of REFERENCE_MONTHS) assert.equal(month.rate,1000*month.errors/month.cases);
  const html=await readFile(join(root,'index.html'),'utf8');
  for(const removed of ['A clearer trend, with clear limits.','These figures cover the full operation.',
    'The earlier months stay in view:','Five complete months of full-operation reporting.',
    'Explore the Genetics Support Tool case','My responsibility','My operational content and pseudocode guided'])
    assert.ok(!html.includes(removed),`Removed copy remains: ${removed}`);
  assert.ok(html.includes('Using my operational content and pseudocode, I used AI coding tools to produce an effective software based solution.'));
  assert.equal((html.match(/<tr><th scope="row">/g)||[]).length,5);
  assert.ok(!html.includes('id="replay-hero"')&&!html.includes('id="play"'),'Banner controls were removed at source.');
  assert.ok(!html.includes('data-ink-id="portrait-caption"'),'Portrait caption remains in the homepage');
  console.log('Bird ink formation, permanent title, faster graph, table, copy, and portrait checks passed.');
} finally { await rm(temporary,{recursive:true,force:true}); }
