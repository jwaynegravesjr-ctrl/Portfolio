const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'evidence');
const out = name => path.join(evidence, name.startsWith('ink-study-') ? name : `ink-study-${name}`);
const targetURL = new URL(process.env.INK_STUDY_URL || 'http://127.0.0.1:8903/ink-study.html?inspect');
targetURL.searchParams.set('inspect', '');
const url = targetURL.href;
const FULL_OPERATION = 'These figures cover the full operation. The downward trend began before the July rollout, so this comparison does not isolate the tool’s effect or measure a genetics-only improvement.';
const SOURCE_NOTE = 'Source: my reported totals for complete calendar months. There was no reported change in auditing or error reporting. These figures have not been independently verified.';
const specs = {
  heading: {duration: 1.6, selector: 'h1'},
  paragraph: {duration: 1.6, selector: 'p'},
  table: {duration: 2.2, selector: 'table'},
};
const viewports = [[1600, 900], [390, 844], [320, 720]];
const checks = [], captures = [], errors = [];
let browser;
const hash = data => createHash('sha256').update(data).digest('hex');

function watch(page, label) {
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') {
      const location = message.location();
      errors.push(`${label}: ${message.text()}${location.url ? ` (${location.url}:${location.lineNumber})` : ''}`);
    }
  });
}

async function open(page) {
  await page.goto(url, {waitUntil: 'networkidle', timeout: 45000});
  await page.waitForFunction(() => Boolean(window.inkStudy && typeof window.inkStudy.diagnostics === 'function'), {timeout: 30000});
  await page.waitForFunction(() => {
    const state = window.inkStudy?.diagnostics();
    const heading = document.querySelector('[data-study-block="heading"]');
    return Boolean(state && (!state.supported || (document.fonts.status === 'loaded' && heading?.classList.contains('ink-source-hidden'))));
  }, {timeout: 30000});
}

async function diagnostic(page) {
  return page.evaluate(() => window.inkStudy.diagnostics());
}

async function finishSpecimen(page, id, duration) {
  await page.evaluate(({id, duration}) => window.inkStudy.seek(id, duration), {id, duration});
  await page.waitForFunction(id => window.inkStudy.diagnostics().blocks.find(item => item.id === id)?.state === 'complete', id, {timeout: 1500});
}

async function locate(page, id) {
  if (id === 'heading') return page.getByRole('heading', {level: 1, name: 'What the numbers show.'});
  if (id === 'paragraph') return page.getByText(FULL_OPERATION, {exact: true});
  return page.locator('table').first();
}

async function specimenGeometry(page, id) {
  return page.locator(`[data-study-block="${id}"]`).evaluate(root => {
    const rect = element => {
      const r = element.getBoundingClientRect();
      return [r.left, r.top, r.width, r.height].map(value => Number(value.toFixed(3)));
    };
    if (root.tagName === 'TABLE') {
      return [...root.querySelectorAll('caption, thead tr, tbody tr, th, td')].map(element => ({
        label: element.matches('caption') ? 'caption' : element.matches('thead tr') ? 'header row' : element.closest('tbody') && element.matches('tr') ? element.innerText.trim() : element.innerText.trim(),
        rect: rect(element),
      }));
    }
    const range = document.createRange();
    range.selectNodeContents(root);
    return [...range.getClientRects()].map((_, index) => {
      const line = document.createRange();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode();
      if (!node) return [];
      line.selectNodeContents(node);
      const fragments = [...line.getClientRects()];
      const r = fragments[index];
      return r ? [r.left, r.top, r.width, r.height].map(value => Number(value.toFixed(3))) : [];
    });
  });
}

function blockFor(d, id) {
  const block = d.blocks?.find(item => item.id === id);
  assert.ok(block, `diagnostics() must include ${id}; got ${JSON.stringify(d.blocks)}`);
  return block;
}

async function position(page, locator, fraction = 0.2, behavior = 'instant') {
  const top = await locator.evaluate(el => el.getBoundingClientRect().top + window.scrollY);
  await page.evaluate(({top, fraction, behavior}) => {
    window.scrollTo({top: Math.max(0, top - innerHeight * fraction), behavior});
  }, {top, fraction, behavior});
  await page.waitForTimeout(80);
}

async function test(name, body) {
  try {
    await body();
    checks.push({name, pass: true});
    console.log(`PASS: ${name}`);
  } catch (error) {
    checks.push({name, pass: false, error: error.stack || error.message});
    console.error(`FAIL: ${name}\n${error.message}`);
  }
}

async function captureSpecimens() {
  for (const [width, height] of viewports) {
    const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1});
    try {
      const page = await context.newPage();
      watch(page, `capture-${width}x${height}`);
      await open(page);
      for (const [id, spec] of Object.entries(specs)) {
        const locator = await locate(page, id);
        assert.equal(await locator.count(), 1, `Unique ${id} specimen must exist at ${width}x${height}`);
        await position(page, locator);
        const states = [
          ['early', Math.min(0.32, spec.duration * 0.2)],
          ['mid', spec.duration * 0.5],
          ['complete', spec.duration],
        ];
        for (const [stage, seconds] of states) {
          if (stage === 'complete') await finishSpecimen(page, id, spec.duration);
          else await page.evaluate(({id, seconds}) => window.inkStudy.seek(id, seconds), {id, seconds});
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const d = await diagnostic(page);
          const block = blockFor(d, id);
          assert.ok(Math.abs(block.elapsedSeconds - seconds) < 0.025, `${id} ${stage}: expected ${seconds}s, got ${block.elapsedSeconds}s`);
          if (stage === 'complete') {
            assert.equal(block.state, 'complete', `${id} should hand off to native HTML when complete`);
            const opacity = await locator.evaluate(el => Number(getComputedStyle(el).opacity));
            assert.ok(opacity >= 0.99, `${id} native HTML should be fully visible at completion; opacity=${opacity}`);
          } else {
            assert.ok(block.progress > 0 && block.progress < 1, `${id} ${stage} should show partial ink; progress=${block.progress}`);
          }
          const file = `ink-study-${id}-${stage}-${width}x${height}.png`;
          const bytes = await page.screenshot({path: out(file)});
          captures.push({file, id, stage, seconds, viewport: {width, height}, sha256: hash(bytes)});
        }
      }
    } finally {
      await context.close();
    }
  }
}

(async () => {
  await fs.mkdir(evidence, {recursive: true});
  try {
    browser = await chromium.launch({channel: 'chrome', headless: true});

    await test('Approved copy, accessible native table, and source note are exact', async () => {
      const page = await browser.newPage({viewport: {width: 1600, height: 900}});
      watch(page, 'content');
      await open(page);
      assert.equal((await page.getByRole('heading', {level: 1}).textContent()).trim(), 'What the numbers show.');
      assert.equal(await page.getByText(FULL_OPERATION, {exact: true}).count(), 1);
      assert.equal(await page.getByText(SOURCE_NOTE, {exact: true}).count(), 1);
      const table = page.locator('table');
      assert.equal(await table.count(), 1);
      assert.equal((await table.locator('caption').textContent()).trim(), 'Full-operation monthly figures.');
      assert.deepEqual(await table.locator('tr').evaluateAll(rows => rows.map(row => [...row.children].map(cell => cell.textContent.trim()))), [
        ['Month', 'Reported errors per 1,000 cases'],
        ['April', '4.07'], ['May', '3.29'], ['June', '2.62'], ['July', '2.10'], ['August', '1.42'],
      ]);
      assert.equal(await table.locator('thead th[scope="col"]').count(), 2, 'Table must use two native column headers.');
      assert.equal(await table.locator('tbody th[scope="row"]').count(), 5, 'Month names must be native row headers.');
      assert.equal(await table.locator('tbody tr').count(), 5, 'Table must contain all five months.');
      await page.close();
    });

    await test('A real WebGL overlay hands each specimen back to readable HTML', async () => {
      const page = await browser.newPage({viewport: {width: 1600, height: 900}});
      watch(page, 'webgl');
      await open(page);
      const d = await diagnostic(page);
      assert.equal(d.supported, true);
      assert.equal(d.fallback, null);
      assert.equal(d.canvasPresent, true);
      assert.ok(d.pixelRatio > 0 && d.pixelRatio <= 1.5, `Unexpected drawing pixel ratio ${d.pixelRatio}`);
      const webgl = await page.locator('#ink-study-canvas').evaluate(canvas => {
        return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      });
      assert.equal(webgl, true, 'The overlay canvas must have a real WebGL context.');
      for (const [id, spec] of Object.entries(specs)) {
        await finishSpecimen(page, id, spec.duration);
        const block = blockFor(await diagnostic(page), id);
        assert.equal(block.state, 'complete');
        const locator = await locate(page, id);
        assert.ok(Number(await locator.evaluate(el => getComputedStyle(el).opacity)) >= 0.99, `${id} is readable after handoff`);
      }
      await page.close();
    });

    await test('No horizontal overflow at desktop, tablet, and narrow mobile sizes', async () => {
      for (const [width, height] of viewports) {
        const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1});
        try {
          const page = await context.newPage();
          watch(page, `overflow-${width}x${height}`);
          await open(page);
          const d = await page.evaluate(() => ({
            viewport: innerWidth,
            document: document.documentElement.scrollWidth,
            body: document.body.scrollWidth,
          }));
          assert.ok(d.document <= d.viewport + 1, `${width}x${height}: document width ${d.document} exceeds viewport ${d.viewport}`);
          assert.ok(d.body <= d.viewport + 1, `${width}x${height}: body width ${d.body} exceeds viewport ${d.viewport}`);
        } finally {
          await context.close();
        }
      }
    });

    await test('Timed ink keeps advancing after scrolling stops and never erases in reverse', async () => {
      const context = await browser.newContext({viewport: {width: 1280, height: 640}, deviceScaleFactor: 1});
      try {
        const page = await context.newPage();
        watch(page, 'timed-scroll');
        await open(page);
        await page.evaluate(() => window.inkStudy.pause());
        const table = await locate(page, 'table');
        const docTop = await table.evaluate(el => el.getBoundingClientRect().top + scrollY);
        await page.evaluate(top => scrollTo({top: Math.max(0, top - innerHeight * 0.81), behavior: 'instant'}), docTop);
        await page.waitForTimeout(80);
        let block = blockFor(await diagnostic(page), 'table');
        assert.equal(block.state, 'waiting', `At 81% viewport height the table should still wait; got ${block.state}`);
        const hiddenBeforeTrigger = await table.evaluate(el => Number(getComputedStyle(el).opacity) < 0.01);
        assert.equal(hiddenBeforeTrigger, true, 'A waiting table within the viewport must stay in its native ink-hidden state until its 80% trigger.');
        await page.evaluate(top => scrollTo({top: Math.max(0, top - innerHeight * 0.79), behavior: 'instant'}), docTop);
        await page.waitForFunction(() => window.inkStudy.diagnostics().blocks.find(item => item.id === 'table')?.state === 'paused', {timeout: 3000});
        const frozen = blockFor(await diagnostic(page), 'table');
        await page.waitForTimeout(250);
        assert.equal(blockFor(await diagnostic(page), 'table').elapsedSeconds, frozen.elapsedSeconds, 'A new specimen should remain frozen while playback is paused.');
        await page.evaluate(() => window.inkStudy.play());
        await page.waitForFunction(() => window.inkStudy.diagnostics().blocks.find(item => item.id === 'table')?.state === 'active', {timeout: 3000});
        const scrollY = await page.evaluate(() => window.scrollY);
        const start = blockFor(await diagnostic(page), 'table').elapsedSeconds;
        await page.waitForTimeout(320);
        const advancing = blockFor(await diagnostic(page), 'table');
        assert.ok(advancing.elapsedSeconds > start + 0.12, `Table should continue after scrolling stops; ${start} -> ${advancing.elapsedSeconds}`);
        assert.equal(await page.evaluate(() => window.scrollY), scrollY, 'No more scroll input should be needed for ink to continue.');
        await page.waitForFunction(() => window.inkStudy.diagnostics().blocks.find(item => item.id === 'table')?.state === 'complete', {timeout: 3000});
        const finished = blockFor(await diagnostic(page), 'table');
        const finishedText = await table.innerText();
        await page.evaluate(() => scrollTo({top: 0, behavior: 'instant'}));
        await page.waitForTimeout(250);
        block = blockFor(await diagnostic(page), 'table');
        assert.equal(block.state, 'complete', 'Reverse scrolling should not erase completed ink.');
        assert.equal(block.elapsedSeconds, finished.elapsedSeconds);
        assert.equal(await table.innerText(), finishedText);
      } finally {
        await context.close();
      }
    });

    await test('Pause freezes the ink clock and play resumes it', async () => {
      const context = await browser.newContext({viewport: {width: 1280, height: 900}});
      try {
        const page = await context.newPage();
        watch(page, 'pause-resume');
        await open(page);
        const heading = await locate(page, 'heading');
        await position(page, heading, 0.2);
        await page.evaluate(() => window.inkStudy.seek('heading', 0.35));
        await page.evaluate(() => window.inkStudy.play());
        await page.waitForTimeout(220);
        const before = blockFor(await diagnostic(page), 'heading').elapsedSeconds;
        await page.evaluate(() => window.inkStudy.pause());
        const frozen = blockFor(await diagnostic(page), 'heading').elapsedSeconds;
        await page.waitForTimeout(350);
        const after = blockFor(await diagnostic(page), 'heading').elapsedSeconds;
        assert.ok(frozen >= before, 'The clock should include elapsed time before pause.');
        assert.ok(Math.abs(after - frozen) < 0.03, `Paused clock changed from ${frozen} to ${after}.`);
        await page.evaluate(() => window.inkStudy.play());
        await page.waitForTimeout(220);
        const resumed = blockFor(await diagnostic(page), 'heading').elapsedSeconds;
        assert.ok(resumed > after + 0.12, `Play should resume the clock; ${after} -> ${resumed}.`);
      } finally {
        await context.close();
      }
    });

    await test('Replay remeasures after a viewport change, and resize finishes the active pass', async () => {
      const context = await browser.newContext({viewport: {width: 1280, height: 900}, deviceScaleFactor: 1});
      try {
        const page = await context.newPage();
        watch(page, 'replay-resize');
        await open(page);
        await page.evaluate(() => window.inkStudy.seek('heading', 0.5));
        await page.setViewportSize({width: 1024, height: 768});
        await page.waitForFunction(() => window.inkStudy.diagnostics().blocks.find(block => block.id === 'heading')?.state === 'complete', {timeout: 1500});
        await page.evaluate(() => window.inkStudy.replay());
        await page.waitForFunction(() => window.inkStudy.diagnostics().blocks.find(block => block.id === 'heading')?.state === 'active', {timeout: 1500});
        const replayed = await diagnostic(page);
        assert.equal(replayed.pixelRatio, 1, 'Replay should measure the new viewport at the current DPR.');
        assert.ok(replayed.activeRenderingCount > 0, 'Replay should rebuild ink layers after the viewport change.');
        assert.equal(await page.locator('#ink-study-canvas').evaluate(canvas => canvas.width), 1024, 'Replay should measure the resized drawing surface.');
        await page.evaluate(() => window.inkStudy.pause());
        await page.setViewportSize({width: 1000, height: 760});
        await page.waitForFunction(() => window.inkStudy.diagnostics().blocks.find(block => block.id === 'heading')?.state === 'complete', {timeout: 1500});
        const resized = await diagnostic(page);
        assert.equal(blockFor(resized, 'heading').state, 'complete');
        assert.ok(Number(await (await locate(page, 'heading')).evaluate(el => getComputedStyle(el).opacity)) >= 0.99, 'The resized specimen returns to readable native HTML.');
      } finally {
        await context.close();
      }
    });

    await test('Reduced motion, missing WebGL, context loss, and no JavaScript keep complete HTML readable', async () => {
      const reduced = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
      try {
        const page = await reduced.newPage();
        watch(page, 'reduced-motion');
        await open(page);
        const d = await diagnostic(page);
        assert.equal(d.fallback, 'reduced-motion');
        assert.ok(d.blocks.every(block => block.state === 'fallback' || block.state === 'complete'));
        assert.equal(await page.locator('table tbody tr').count(), 5);
      } finally {
        await reduced.close();
      }

      const noWebGL = await browser.newContext({viewport: {width: 1280, height: 900}});
      try {
        await noWebGL.addInitScript(() => {
          const original = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(type, ...args) {
            if (['webgl', 'webgl2', 'experimental-webgl'].includes(String(type).toLowerCase())) return null;
            return original.call(this, type, ...args);
          };
        });
        const page = await noWebGL.newPage();
        watch(page, 'missing-webgl');
        await open(page);
        const d = await diagnostic(page);
        assert.equal(d.fallback, 'missing-webgl');
        assert.equal(d.canvasPresent, false);
        assert.equal(await page.locator('h1').innerText(), 'What the numbers show.');
        assert.equal(await page.locator('table tbody tr').count(), 5);
      } finally {
        await noWebGL.close();
      }

      const lost = await browser.newContext({viewport: {width: 1280, height: 900}});
      try {
        const page = await lost.newPage();
        watch(page, 'context-loss');
        await open(page);
        assert.equal((await diagnostic(page)).supported, true);
        await page.locator('#ink-study-canvas').dispatchEvent('webglcontextlost');
        await page.waitForFunction(() => window.inkStudy.diagnostics().fallback === 'context-lost', {timeout: 3000});
        const d = await diagnostic(page);
        assert.equal(d.canvasPresent, false);
        assert.equal(await page.locator('h1').innerText(), 'What the numbers show.');
        assert.equal(await page.locator('table tbody tr').count(), 5);
      } finally {
        await lost.close();
      }

      const noJS = await browser.newContext({viewport: {width: 1280, height: 900}, javaScriptEnabled: false});
      try {
        const page = await noJS.newPage();
        await page.goto(url, {waitUntil: 'networkidle', timeout: 45000});
        assert.equal(await page.getByRole('heading', {level: 1, name: 'What the numbers show.'}).isVisible(), true);
        assert.equal(await page.getByText(FULL_OPERATION, {exact: true}).isVisible(), true);
        assert.equal(await page.getByText(SOURCE_NOTE, {exact: true}).isVisible(), true);
        assert.equal(await page.locator('table tbody tr').count(), 5);
        for (const selector of ['h1', 'p', 'table']) {
          const visible = await page.locator(selector).first().evaluate(el => {
            const style = getComputedStyle(el);
            return style.visibility !== 'hidden' && Number(style.opacity) >= 0.99;
          });
          assert.equal(visible, true, `${selector} must be readable with JavaScript disabled.`);
        }
      } finally {
        await noJS.close();
      }
    });

    await test('DPR 2 devices cap the WebGL drawing scale at 1.5', async () => {
      const context = await browser.newContext({viewport: {width: 1200, height: 800}, deviceScaleFactor: 2});
      try {
        const page = await context.newPage();
        watch(page, 'dpr-cap');
        await open(page);
        const d = await diagnostic(page);
        assert.ok(d.pixelRatio <= 1.5 && d.pixelRatio > 0, `Pixel ratio must be capped at 1.5; got ${d.pixelRatio}`);
        assert.equal(d.supported, true);
        assert.equal(d.canvasPresent, true);
      } finally {
        await context.close();
      }
    });

    await test('Early, middle, and complete specimen captures exist at all three viewports', async () => {
      await captureSpecimens();
      assert.equal(captures.length, 27, `Expected 27 reproducible screenshots, got ${captures.length}`);
    });

    await test('Near-complete overlay and native HTML pairs document every specimen handoff', async () => {
      for (const [id, spec] of Object.entries(specs)) {
        const context = await browser.newContext({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
        try {
          const page = await context.newPage();
          watch(page, `handoff-${id}`);
          await open(page);
          for (const other of Object.keys(specs).filter(candidate => candidate !== id)) {
            await finishSpecimen(page, other, specs[other].duration);
          }
          await position(page, await locate(page, id));
          const overlaySeconds = Number((spec.duration - 0.01).toFixed(2));
          await page.evaluate(({id, seconds}) => window.inkStudy.seek(id, seconds), {id, seconds: overlaySeconds});
          const overlay = blockFor(await diagnostic(page), id);
          assert.equal(overlay.state, 'paused');
          assert.ok(overlay.progress < 1 && overlay.progress > 0.98, `${id} should be captured just before handoff.`);
          const overlayGeometry = await specimenGeometry(page, id);
          const overlayFile = `ink-study-handoff-${id}-overlay-${overlaySeconds.toFixed(2)}.png`;
          const overlayBytes = await page.screenshot({path: out(overlayFile)});
          captures.push({file: overlayFile, id, seconds: overlaySeconds, viewport: {width: 1600, height: 900}, sha256: hash(overlayBytes), geometry: overlayGeometry});

          await finishSpecimen(page, id, spec.duration);
          assert.equal(blockFor(await diagnostic(page), id).state, 'complete');
          const htmlGeometry = await specimenGeometry(page, id);
          assert.deepEqual(overlayGeometry, htmlGeometry, `${id} layout must not shift during WebGL-to-HTML handoff.`);
          const htmlFile = `ink-study-handoff-${id}-html-${spec.duration.toFixed(2)}.png`;
          const htmlBytes = await page.screenshot({path: out(htmlFile)});
          captures.push({file: htmlFile, id, seconds: spec.duration, viewport: {width: 1600, height: 900}, sha256: hash(htmlBytes), geometry: htmlGeometry});
        } finally {
          await context.close();
        }
      }
    });

  } catch (error) {
    checks.push({name: 'Browser setup or suite completion', pass: false, error: error.stack || error.message});
    console.error(error.stack || error.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
    const recording = spawnSync(process.execPath, [path.join(__dirname, 'record-ink-study.cjs')], {
      cwd: root, encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    if (recording.stdout) process.stdout.write(recording.stdout);
    if (recording.stderr) process.stderr.write(recording.stderr);
    if (recording.error || recording.status !== 0) {
      checks.push({name: 'Desktop timed ink recording', pass: false, error: recording.error?.message || `recording process exited ${recording.status}`});
    } else {
      try {
        const videoName = await fs.access(out('recording.mp4')).then(() => 'ink-study-recording.mp4').catch(() => 'ink-study-recording.webm');
        const stat = await fs.stat(out(videoName));
        assert.ok(stat.size > 10000, `Recording is unexpectedly small (${stat.size} bytes).`);
        captures.push({file: videoName, bytes: stat.size});
      } catch (error) {
        checks.push({name: 'Desktop timed ink recording exists', pass: false, error: error.message});
      }
    }
    const passed = checks.filter(item => item.pass).length;
    const failed = checks.length - passed;
    const report = {
      url,
      checkedAt: new Date().toISOString(),
      passed,
      failed,
      checks,
      captures,
      errors,
    };
    await fs.writeFile(out('checks.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`${passed} ink study browser checks passed; ${failed} failed.`);
    console.log(`Evidence: ${path.relative(root, evidence)} (ink-study-*)`);
    if (errors.length) {
      console.error(`Browser errors: ${errors.join(' | ')}`);
      process.exitCode = 1;
    }
    if (failed) process.exitCode = 1;
  }
})();
