const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'evidence');
const playwrightCache = path.join(root, '.cache', 'ink-study-playwright');
const bundledFfmpeg = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
process.env.PLAYWRIGHT_BROWSERS_PATH = playwrightCache;
const {chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const targetURL = new URL(process.env.INK_STUDY_URL || 'http://127.0.0.1:8903/ink-study.html?inspect');
targetURL.searchParams.set('inspect', '');
const url = targetURL.href;
const FULL_OPERATION = 'These figures cover the full operation. The downward trend began before the July rollout, so this comparison does not isolate the tool’s effect or measure a genetics-only improvement.';
const specs = [
  {id: 'heading', locator: page => page.getByRole('heading', {level: 1, name: 'What the numbers show.'}), duration: 1.6},
  {id: 'paragraph', locator: page => page.getByText(FULL_OPERATION, {exact: true}), duration: 1.6},
  {id: 'table', locator: page => page.locator('table').first(), duration: 2.2},
];

async function smoothScrollToSpecimen(page, locator) {
  const top = await locator.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
  const y = Math.max(0, top - await page.evaluate(() => innerHeight * 0.2));
  await page.evaluate(async target => {
    if (Math.abs(scrollY - target) < 2) return;
    await new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        removeEventListener('scrollend', finish);
        resolve();
      };
      addEventListener('scrollend', finish, {once: true});
      scrollTo({top: target, behavior: 'smooth'});
      setTimeout(finish, 2600);
    });
  }, y);
}

async function main() {
  await fs.mkdir(evidence, {recursive: true});
  const playwrightFfmpeg = path.join(playwrightCache, 'ffmpeg-1011', 'ffmpeg-win64.exe');
  try {
    await fs.access(playwrightFfmpeg);
  } catch {
    await fs.mkdir(path.dirname(playwrightFfmpeg), {recursive: true});
    await fs.copyFile(bundledFfmpeg, playwrightFfmpeg);
  }
  const tempDir = await fs.mkdtemp(path.join(evidence, 'ink-study-recording-'));
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  let context;
  let page;
  const errors = [];
  const samples = [];
  try {
    context = await browser.newContext({
      viewport: {width: 1600, height: 900},
      deviceScaleFactor: 1,
      recordVideo: {dir: tempDir, size: {width: 1600, height: 900}},
    });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') {
        const location = message.location();
        errors.push(`${message.text()}${location.url ? ` (${location.url}:${location.lineNumber})` : ''}`);
      }
    });
    await page.goto(url, {waitUntil: 'networkidle', timeout: 45000});
    await page.waitForFunction(() => Boolean(window.inkStudy && typeof window.inkStudy.diagnostics === 'function'), {timeout: 30000});
    await page.waitForFunction(() => {
      const state = window.inkStudy?.diagnostics();
      const heading = document.querySelector('[data-study-block="heading"]');
      return Boolean(state && (!state.supported || (document.fonts.status === 'loaded' && heading?.classList.contains('ink-source-hidden'))));
    }, {timeout: 30000});
    assert.equal(await page.getByRole('heading', {level: 1, name: 'What the numbers show.'}).count(), 1);
    assert.equal(await page.getByText(FULL_OPERATION, {exact: true}).count(), 1);
    assert.equal(await page.locator('table tbody tr').count(), 5);
    assert.equal(await page.locator('[data-debug-ui], #debug, #debug-panel, .inspect-overlay').count(), 0, 'The recording should show no debug UI.');

    for (const spec of specs) {
      for (const other of specs.filter(candidate => candidate.id !== spec.id)) {
        await page.evaluate(({id, duration}) => window.inkStudy.seek(id, duration), {id: other.id, duration: other.duration});
      }
      const locator = spec.locator(page);
      await smoothScrollToSpecimen(page, locator);
      await page.evaluate(id => window.inkStudy.seek(id, 0), spec.id);
      await page.evaluate(() => window.inkStudy.play());
      await page.waitForTimeout(180);
      let state = await page.evaluate(id => window.inkStudy.diagnostics().blocks.find(block => block.id === id), spec.id);
      assert.ok(state && state.progress > 0 && state.progress < 0.5, `${spec.id} should begin visible ink growth; got ${JSON.stringify(state)}`);
      samples.push({id: spec.id, phase: 'early', elapsedSeconds: state.elapsedSeconds, progress: state.progress, scrollY: await page.evaluate(() => scrollY)});

      await page.waitForTimeout(spec.duration * 500);
      const middle = await page.evaluate(id => window.inkStudy.diagnostics().blocks.find(block => block.id === id), spec.id);
      assert.ok(middle.progress > state.progress, `${spec.id} must visibly progress while the scroll is stopped.`);
      assert.ok(middle.progress < 1, `${spec.id} should still be forming at the middle sample.`);
      samples.push({id: spec.id, phase: 'middle', elapsedSeconds: middle.elapsedSeconds, progress: middle.progress, scrollY: await page.evaluate(() => scrollY)});

      await page.waitForFunction(id => window.inkStudy.diagnostics().blocks.find(block => block.id === id)?.state === 'complete', spec.id, {timeout: 3000});
      state = await page.evaluate(id => window.inkStudy.diagnostics().blocks.find(block => block.id === id), spec.id);
      assert.equal(state.progress, 1, `${spec.id} should hand off after its timed ink growth.`);
      samples.push({id: spec.id, phase: 'complete', elapsedSeconds: state.elapsedSeconds, progress: state.progress, scrollY: await page.evaluate(() => scrollY)});
      await page.waitForTimeout(450);
    }

    assert.deepEqual(errors, [], `Browser errors occurred during recording: ${errors.join(' | ')}`);
    const video = page.video();
    await context.close();
    context = null;
    const recorded = await video.path();
    const ffmpeg = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
    let output;
    try {
      await fs.access(ffmpeg);
      output = path.join(evidence, 'ink-study-recording.mp4');
      const converted = spawnSync(ffmpeg, [
        '-y', '-i', recorded, '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output,
      ], {encoding: 'utf8', windowsHide: true, timeout: 60000});
      if (converted.error || converted.status !== 0) throw converted.error || new Error(`ffmpeg exited ${converted.status}: ${converted.stderr}`);
      await fs.unlink(recorded);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      output = path.join(evidence, 'ink-study-recording.webm');
      await fs.rename(recorded, output);
    }
    await fs.rmdir(tempDir);
    const stat = await fs.stat(output);
    assert.ok(stat.size > 10000, `Recording is unexpectedly small (${stat.size} bytes).`);
    const report = {url, recordedAt: new Date().toISOString(), viewport: {width: 1600, height: 900}, file: path.basename(output), bytes: stat.size, samples, errors};
    await fs.writeFile(path.join(evidence, 'ink-study-recording.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`Recorded timed heading, paragraph, and table ink to ${path.relative(root, output)} (${stat.size} bytes).`);
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
