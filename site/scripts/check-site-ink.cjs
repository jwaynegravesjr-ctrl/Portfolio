const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {spawnSync} = require('node:child_process');
const {chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

const root = path.resolve(__dirname, '..');
const evidence = process.env.SITE_INK_EVIDENCE_DIR || path.join(root, 'evidence');
const baselinePath = path.join(root, 'evidence', 'site-ink-baseline.json');
const configuredURL = new URL(process.env.SITE_INK_URL || 'http://127.0.0.1:8903/?inspect');
configuredURL.searchParams.set('inspect', '');
const url = configuredURL.href;
const expectedRows = [
  ['April', '37,548', '153', '4.07'],
  ['May', '38,649', '127', '3.29'],
  ['June', '40,125', '105', '2.62'],
  ['July', '37,205', '78', '2.10'],
  ['August', '45,866', '65', '1.42'],
];
const viewports = [[1600, 900], [390, 844], [320, 720]];
const checks = [];
const captures = [];
const pixelComparisons = [];
const browserErrors = [];
let browser;
let baseline;
let sourceHTML;

function hash(data) {
  return createHash('sha256').update(data).digest('hex').toUpperCase();
}

function watch(page, label) {
  page.on('pageerror', error => browserErrors.push(`${label}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') {
      const expectedWebglFallback = label === 'no-webgl' && message.text().includes('THREE.WebGLRenderer: Error creating WebGL context.');
      if (!expectedWebglFallback) browserErrors.push(`${label}: ${message.text()}`);
    }
  });
}

async function open(page, targetURL = url) {
  await page.goto(targetURL, {waitUntil: 'domcontentloaded', timeout: 45000});
  await page.waitForFunction(() => Boolean(window.siteInk && typeof window.siteInk.diagnostics === 'function'), null, {timeout: 30000});
  await page.waitForFunction(() => document.readyState !== 'loading' && document.fonts.status === 'loaded', null, {timeout: 30000});
}

async function diagnostics(page) {
  return page.evaluate(() => window.siteInk.diagnostics());
}

function resolveBlock(diag, {id, selector, text}) {
  const blocks = diag?.blocks || [];
  return blocks.find(block => id && block.id === id)
    || blocks.find(block => selector && block.selector === selector)
    || blocks.find(block => selector && String(block.selector || '').includes(selector))
    || blocks.find(block => text && String(block.text || '').includes(text))
    || null;
}

async function blockFor(page, match) {
  const diag = await diagnostics(page);
  const block = resolveBlock(diag, match);
  assert.ok(block, `Ink diagnostics do not include ${JSON.stringify(match)}. Available blocks: ${JSON.stringify(diag.blocks?.map(({id, selector, text}) => ({id, selector, text: String(text || '').slice(0, 70)})))}`);
  assert.ok(block.id, `The inspected block has no ID: ${JSON.stringify(block)}`);
  assert.ok(block.selector, `The inspected block has no selector: ${JSON.stringify(block)}`);
  return block;
}

async function waitForBlock(page, id, predicate, timeout = 4000) {
  await page.waitForFunction(({id, predicateName}) => {
    const block = window.siteInk.diagnostics().blocks.find(item => item.id === id);
    if (!block) return false;
    if (predicateName === 'active') return block.state === 'active' || block.state === 'complete';
    if (predicateName === 'complete') return block.state === 'complete' && block.progress >= 0.999;
    if (predicateName === 'progress') return block.progress >= 0.95;
    return false;
  }, {id, predicateName: predicate}, {timeout});
  return (await diagnostics(page)).blocks.find(item => item.id === id);
}

async function positionAt(page, locator, fraction = 0.2, behavior = 'instant') {
  const top = await locator.evaluate(element => element.getBoundingClientRect().top + scrollY);
  await page.evaluate(({top, fraction, behavior}) => scrollTo({top: Math.max(0, top - innerHeight * fraction), behavior}), {top, fraction, behavior});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function seekBlock(page, block, seconds) {
  await page.evaluate(({id, seconds}) => window.siteInk.seek(id, seconds), {id: block.id, seconds});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return (await diagnostics(page)).blocks.find(item => item.id === block.id);
}

async function isolateBlock(page, block) {
  await page.evaluate(targetId => {
    for (const item of window.siteInk.diagnostics().blocks) {
      if (item.id !== targetId && ['active', 'paused'].includes(item.state)) window.siteInk.seek(item.id, item.duration);
    }
  }, block.id);
}

async function isolatedSeek(page, block, seconds) {
  await isolateBlock(page, block);
  return seekBlock(page, block, seconds);
}

async function test(name, run) {
  try {
    const detail = await run();
    checks.push({name, pass: true, ...(detail && typeof detail === 'object' ? {detail} : {})});
    console.log(`PASS: ${name}`);
  } catch (error) {
    checks.push({name, pass: false, error: error.stack || error.message});
    console.error(`FAIL: ${name}\n${error.message}`);
  }
}

async function pngMetrics(page, overlay, native, width, height) {
  return page.evaluate(async ({overlayPNG, nativePNG, width, height}) => {
    async function decode(base64) {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(image, 0, 0);
      return {width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data};
    }
    const [a, b] = await Promise.all([decode(overlayPNG), decode(nativePNG)]);
    if (a.width !== b.width || a.height !== b.height) throw new Error(`Screenshot sizes differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
    const n = a.width * a.height;
    const paper = [239, 231, 215];
    const ink = [33, 28, 23];
    let error = 0;
    let coverageA = 0;
    let coverageB = 0;
    let nativeInkRecall = 0;
    let nativeInkCoverageDenominator = 0;
    let overlayInkPrecisionDenominator = 0;
    let overlayInkPrecisionNumerator = 0;
    let nativeInkError = 0;
    let nativeInkPixels = 0;
    for (let pixel = 0; pixel < n; pixel++) {
      const index = pixel * 4;
      let overlayCoverage = 0;
      let nativeCoverage = 0;
      let pixelError = 0;
      for (let channel = 0; channel < 3; channel++) {
        pixelError += Math.abs(a.data[index + channel] - b.data[index + channel]) / 3;
        overlayCoverage += Math.max(0, Math.min(1, (paper[channel] - a.data[index + channel]) / (paper[channel] - ink[channel]))) / 3;
        nativeCoverage += Math.max(0, Math.min(1, (paper[channel] - b.data[index + channel]) / (paper[channel] - ink[channel]))) / 3;
      }
      error += pixelError;
      const inkOverlap = Math.min(overlayCoverage, nativeCoverage);
      if (overlayCoverage > 0.035) {
        overlayInkPrecisionNumerator += inkOverlap;
        overlayInkPrecisionDenominator += overlayCoverage;
      }
      for (const [data, which] of [[a.data, 0], [b.data, 1]]) {
        let coverage = 0;
        for (let channel = 0; channel < 3; channel++) {
          coverage += Math.max(0, Math.min(1, (paper[channel] - data[index + channel]) / (paper[channel] - ink[channel])));
        }
        if (which === 0) coverageA += coverage / 3;
        else coverageB += coverage / 3;
      }
      if (nativeCoverage > 0.035) {
        nativeInkRecall += inkOverlap;
        nativeInkCoverageDenominator += nativeCoverage;
        nativeInkError += pixelError;
        nativeInkPixels++;
      }
    }
    return {
      width: a.width,
      height: a.height,
      rgbMAE: error / n,
      inkCoverageRatio: coverageB > 0 ? coverageA / coverageB : null,
      nativeInkRecall: nativeInkCoverageDenominator > 0 ? nativeInkRecall / nativeInkCoverageDenominator : null,
      overlayInkPrecision: overlayInkPrecisionDenominator > 0 ? overlayInkPrecisionNumerator / overlayInkPrecisionDenominator : null,
      nativeInkRgbMAE: nativeInkPixels > 0 ? nativeInkError / nativeInkPixels : null,
    };
  }, {overlayPNG: overlay.toString('base64'), nativePNG: native.toString('base64'), width, height});
}

async function lightInkPixelCount(page, png) {
  return page.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 205 && data[i + 1] > 195 && data[i + 2] > 180) count++;
    return count;
  }, png.toString('base64'));
}

async function textRangeBounds(locator) {
  const bounds = await locator.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    return {x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom};
  });
  const x = Math.floor(bounds.x);
  const y = Math.floor(bounds.y);
  return {x, y, width: Math.max(1, Math.ceil(bounds.right) - x), height: Math.max(1, Math.ceil(bounds.bottom) - y)};
}

async function captureStage(page, block, seconds, label, width, height) {
  const state = await isolatedSeek(page, block, seconds);
  if (seconds >= block.duration - 0.001) assert.equal(state.state, 'complete', `${block.id} should hand off at its full duration.`);
  const filename = `site-ink-${label}-${width}x${height}.png`;
  const bytes = await page.screenshot({path: path.join(evidence, filename)});
  captures.push({file: filename, blockId: block.id, seconds, viewport: {width, height}, sha256: hash(bytes)});
  return state;
}

async function main() {
  await fs.mkdir(evidence, {recursive: true});
  baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
  sourceHTML = await fs.readFile(path.join(root, 'index.html'), 'utf8');
  browser = await chromium.launch({channel: 'chrome', headless: true});

  await test('Core website text and asset references match the pre-rollout baseline', async () => {
    const page = await browser.newPage({viewport: {width: 1600, height: 900}});
    watch(page, 'baseline');
    await open(page);
    const protectedOpeningHashes = [];
    let authorizedConfigHash = null;
    for (const item of baseline.files || []) {
      const absolute = path.resolve(item.Path);
      const relative = path.relative(root, absolute).replaceAll('\\', '/');
      assert.ok(relative && !relative.startsWith('../') && relative !== '..', `Baseline source must stay inside this website: ${item.Path}`);
      const currentHash = hash(await fs.readFile(absolute));
      if (relative.toLowerCase() === 'src/config.ts') authorizedConfigHash = currentHash;
      else {
        assert.equal(currentHash, item.Hash, `Preserved opening/navigation source changed: ${relative}`);
        protectedOpeningHashes.push(relative);
      }
    }
    assert.ok(authorizedConfigHash, 'The sole user-authorized opening timing source src/config.ts is present in the historical baseline.');
    const comparison = await page.evaluate(({before, after}) => {
      const getContent = html => {
        html = html.replaceAll('%BASE_URL%', '/');
        const cleaned = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, '');
        const doc = new DOMParser().parseFromString(cleaned, 'text/html');
        const main = doc.querySelector('main');
        const assets = [...doc.querySelectorAll('img[src],a[href],button[data-report]')]
          .filter(element => !element.closest('#resume-dialog'))
          .flatMap(element => ['src', 'href', 'data-report'].map(attribute => element.getAttribute(attribute)))
          .filter(value => value?.startsWith('/assets/')).sort();
        return {text: (main?.textContent || '').replace(/\s+/g, ' ').trim(), assets};
      };
      return {before: getContent(before), after: getContent(after)};
    }, {before: baseline.html, after: sourceHTML});
    assert.equal(comparison.after.text, comparison.before.text, 'Normalized visible-site source text changed during the visual rollout.');
    assert.deepEqual(comparison.after.assets, comparison.before.assets, 'Existing image, report, and Résumé asset references changed.');
    assert.ok(await page.locator('#hero #play').isVisible(), 'The preserved opening animation and pause control remain on the page.');
    assert.ok((await page.locator('#animation-description').textContent()).includes('The Shared Perch is a silent ink-on-paper animation.'));
    const pageAssets = await page.evaluate(() => {
      const refs = [...document.querySelectorAll('img[src],a[href],button[data-report]')]
        .flatMap(element => ['src', 'href', 'data-report'].map(attribute => element.getAttribute(attribute)))
        .filter(value => value?.startsWith('/assets/'));
      return [...new Set(refs)];
    });
    for (const asset of pageAssets) {
      const response = await page.request.get(new URL(asset, url).href);
      assert.equal(response.status(), 200, asset);
      if (asset.endsWith('.pdf')) assert.equal((await response.body()).subarray(0, 5).toString(), '%PDF-', 'Résumé asset is not a PDF.');
    }
    await page.close();
    return {matchedAssetReferences: comparison.after.assets.length, liveAssets: pageAssets.length, openingPauseButton: true, protectedOpeningHashes, authorizedConfigHash};
  });

  await test('The native four-column table is exact and mobile overflow stays inside its scroll region', async () => {
    for (const [width, height] of viewports) {
      const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1});
      try {
        const page = await context.newPage();
        watch(page, `table-${width}`);
        await open(page);
        const table = page.locator('#impact table');
        assert.equal(await table.count(), 1);
        assert.deepEqual(await table.locator('thead th[scope="col"]').allTextContents().then(values => values.map(value => value.trim())), ['Month', 'Cases', 'Reported errors', 'Errors per 1,000 cases']);
        assert.deepEqual(await table.locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.children].map(cell => cell.textContent.trim()))), expectedRows);
        assert.equal(await table.locator('tbody th[scope="row"]').count(), 5);
        const layout = await page.evaluate(() => {
          const root = document.documentElement;
          const wrap = document.querySelector('#impact .table-wrap');
          const table = wrap.querySelector('table');
          return {viewport: innerWidth, root: root.scrollWidth, wrapClient: wrap.clientWidth, wrapScroll: wrap.scrollWidth, tableWidth: table.getBoundingClientRect().width, wrapRole: wrap.getAttribute('role'), tabIndex: wrap.tabIndex};
        });
        assert.ok(layout.root <= width + 1, `Page overflows at ${width}px: ${JSON.stringify(layout)}`);
        assert.equal(layout.wrapRole, 'region');
        assert.ok(layout.tabIndex >= 0, 'The mobile table scroll region must be keyboard reachable.');
        if (layout.wrapScroll > layout.wrapClient + 1) {
          const wrap = page.locator('#impact .table-wrap');
          const moved = await wrap.evaluate(element => {element.scrollLeft = element.scrollWidth; return element.scrollLeft;});
          assert.ok(moved > 0, 'The fourth column should be reachable by horizontal scroll.');
          const lastCell = await table.locator('tbody tr:last-child td:last-child').boundingBox();
          const wrapBounds = await wrap.boundingBox();
          assert.ok(lastCell.x < wrapBounds.x + wrapBounds.width + 1, 'Last column should enter the scroller viewport.');
        }
        await page.close();
      } finally { await context.close(); }
    }
    return {viewports};
  });

  await test('The inspect route exposes a real shared ink overlay and stable specimen metadata', async () => {
    const page = await browser.newPage({viewport: {width: 1600, height: 900}});
    watch(page, 'api');
    await open(page);
    const d = await diagnostics(page);
    assert.equal(d.supported, true, `Desktop must support WebGL: ${JSON.stringify(d)}`);
    assert.equal(d.fallback, null);
    assert.equal(d.canvasPresent, true);
    assert.ok(d.pixelRatio <= 1.5);
    assert.ok(d.activeRenderingCount >= 0);
    assert.ok(d.blocks.length >= 12, `Expected multiple content blocks, received ${d.blocks.length}.`);
    for (const [match, duration] of [
      [{id: 'intro-heading', selector: '#intro-heading', text: 'I turn recurring quality problems'}, 1.6],
      [{id: 'impact-heading', selector: '#impact-heading', text: 'What the numbers show.'}, 1.6],
      [{id: 'impact-table', selector: '#impact .table-wrap', text: 'Full-operation monthly figures'}, 2.2],
    ]) {
      const block = await blockFor(page, match);
      assert.ok(Math.abs(Number(block.duration) - duration) < 0.03, `${block.id} duration should be ${duration}s, got ${block.duration}.`);
      if (block.id === 'impact-table') {
        assert.equal(block.triggerLineViewportHeights, 0.8, 'The table keeps its existing 80% trigger.');
        assert.equal(block.finishLineViewportHeights, null, 'The table has no text-only finish line.');
      } else {
        assert.equal(block.triggerLineViewportHeights, 1.04, `${block.id} should trigger at 1.04 viewport heights.`);
        assert.equal(block.finishLineViewportHeights, 0.75, `${block.id} should be native at 0.75 viewport heights.`);
      }
    }
    assert.equal(await page.locator('#site-ink-canvas').count(), 1);
    await page.close();
    return {blocks: d.blocks.length, pixelRatio: d.pixelRatio, canvas: 'shared #site-ink-canvas'};
  });

  await test('Text triggers at 1.04H, forms while scrolling stops, finishes by 0.75H, and the table timing stays unchanged', async () => {
    const page = await browser.newPage({viewport: {width: 1600, height: 900}});
    watch(page, 'elapsed');
    await open(page);
    const timings = [];

    const text = await blockFor(page, {id: 'impact-heading', selector: '#impact-heading', text: 'What the numbers show.'});
    const textLocator = page.locator(text.selector);
    assert.equal(await textLocator.count(), 1);
    const textTop = await textLocator.evaluate(element => element.getBoundingClientRect().top + scrollY);
    await page.evaluate(top => scrollTo({top: Math.max(0, top - innerHeight * 1.04 - 2), behavior: 'instant'}), textTop);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const waitingText = (await diagnostics(page)).blocks.find(item => item.id === text.id);
    assert.equal(waitingText.state, 'waiting', 'Text should remain native until its top crosses 1.04H.');
    assert.ok((await textLocator.evaluate(element => element.getBoundingClientRect().top)) > 1.04 * 900);
    const textTriggerAt = await page.evaluate(() => {window.__siteInkTextTriggerAt = performance.now(); scrollBy(0, 5); return window.__siteInkTextTriggerAt;});
    await waitForBlock(page, text.id, 'active', 1200);
    const stationaryScrollY = await page.evaluate(() => scrollY);
    await page.waitForTimeout(500);
    const textMiddle = (await diagnostics(page)).blocks.find(item => item.id === text.id);
    assert.ok(textMiddle.progress > 0.12 && textMiddle.progress < 0.92, `Text should keep forming while scrolling stops; progress=${textMiddle.progress}.`);
    assert.equal(await page.evaluate(() => scrollY), stationaryScrollY, 'The page must not scroll during the stationary formation check.');
    await waitForBlock(page, text.id, 'complete', 2800);
    const textFinishedAt = await page.evaluate(() => performance.now());
    const textElapsed = (textFinishedAt - textTriggerAt) / 1000;
    assert.ok(Math.abs(textElapsed - 1.6) <= 0.32, `Stationary text formation should take about 1.6s; measured ${textElapsed.toFixed(3)}s.`);
    const textSettled = (await diagnostics(page)).blocks.find(item => item.id === text.id);
    assert.equal(textSettled.state, 'complete');
    assert.ok(textSettled.progress >= 0.999);
    const textOpacity = await textLocator.evaluate(element => getComputedStyle(element).opacity);
    assert.equal(textOpacity, '1', 'Completed text should be handed back to native HTML.');
    await page.evaluate(top => scrollTo({top: Math.max(0, top - innerHeight * 1.10), behavior: 'instant'}), textTop);
    await page.waitForTimeout(120);
    const reversedText = (await diagnostics(page)).blocks.find(item => item.id === text.id);
    assert.equal(reversedText.state, 'complete', 'Reverse scrolling must not erase completed text.');
    assert.equal(await textLocator.evaluate(element => getComputedStyle(element).opacity), '1');
    timings.push({id: text.id, duration: 1.6, elapsedSeconds: Number(textElapsed.toFixed(3)), progress: textSettled.progress, reverseState: reversedText.state});

    const quickPage = await browser.newPage({viewport: {width: 1600, height: 900}});
    watch(quickPage, 'finish-line');
    await open(quickPage);
    const quickText = await blockFor(quickPage, {id: 'genetics-heading', selector: '#genetics-heading'});
    const quickLocator = quickPage.locator(quickText.selector);
    const quickTop = await quickLocator.evaluate(element => element.getBoundingClientRect().top + scrollY);
    await positionAt(quickPage, quickLocator, 1.06);
    assert.equal((await diagnostics(quickPage)).blocks.find(item => item.id === quickText.id).state, 'waiting');
    await positionAt(quickPage, quickLocator, 0.99);
    await waitForBlock(quickPage, quickText.id, 'active', 1200);
    const quickStarted = await quickPage.evaluate(() => performance.now());
    await positionAt(quickPage, quickLocator, 0.749);
    await waitForBlock(quickPage, quickText.id, 'complete', 900);
    const quickFinished = await quickPage.evaluate(() => performance.now());
    const quickElapsed = (quickFinished - quickStarted) / 1000;
    const finishPosition = await quickLocator.evaluate(element => element.getBoundingClientRect().top / innerHeight);
    assert.ok(finishPosition <= 0.75, `Text should be fully native by 0.75H; current top=${finishPosition}.`);
    assert.ok(quickElapsed < 0.9, `A quick scroll through the text finish line should finish promptly; measured ${quickElapsed.toFixed(3)}s.`);
    assert.equal(await quickLocator.evaluate(element => getComputedStyle(element).opacity), '1');
    await quickPage.evaluate(top => scrollTo({top: Math.max(0, top - innerHeight * 1.10), behavior: 'instant'}), quickTop);
    await quickPage.waitForTimeout(120);
    const quickReversed = (await diagnostics(quickPage)).blocks.find(item => item.id === quickText.id);
    assert.equal(quickReversed.state, 'complete', 'Reverse scrolling after the finish line must not erase text.');
    assert.equal(await quickLocator.evaluate(element => getComputedStyle(element).opacity), '1');
    timings.push({id: quickText.id, trigger: 1.04, finish: 0.75, quickElapsedSeconds: Number(quickElapsed.toFixed(3)), finishPosition, reverseState: quickReversed.state});
    await quickPage.close();

    const table = await blockFor(page, {id: 'impact-table', selector: '#impact .table-wrap', text: 'Full-operation monthly figures'});
    const tableLocator = page.locator(table.selector);
    assert.equal(await tableLocator.count(), 1, `The table selector should resolve uniquely: ${table.selector}`);
    const tableTop = await tableLocator.evaluate(element => element.getBoundingClientRect().top + scrollY);
    await page.evaluate(top => scrollTo({top: Math.max(0, top - innerHeight * 0.8 - 2), behavior: 'instant'}), tableTop);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const waitingTable = (await diagnostics(page)).blocks.find(item => item.id === table.id);
    assert.equal(waitingTable.state, 'waiting', 'The native table keeps its existing 80% trigger.');
    const tableTriggerAt = await page.evaluate(() => {window.__siteInkTableTriggerAt = performance.now(); scrollBy(0, 5); return window.__siteInkTableTriggerAt;});
    await waitForBlock(page, table.id, 'active', 1200);
    const tableStoppedScrollY = await page.evaluate(() => scrollY);
    await page.waitForTimeout(500);
    const tableMiddle = (await diagnostics(page)).blocks.find(item => item.id === table.id);
    assert.ok(tableMiddle.progress > 0.12 && tableMiddle.progress < 0.92, `The table should keep its 2.2s elapsed formation; progress=${tableMiddle.progress}.`);
    assert.equal(await page.evaluate(() => scrollY), tableStoppedScrollY);
    await waitForBlock(page, table.id, 'complete', 3400);
    const tableFinishedAt = await page.evaluate(() => performance.now());
    const tableElapsed = (tableFinishedAt - tableTriggerAt) / 1000;
    assert.ok(Math.abs(tableElapsed - 2.2) <= 0.32, `The existing table animation should take about 2.2s; measured ${tableElapsed.toFixed(3)}s.`);
    await page.waitForTimeout(260);
    const settledTable = (await diagnostics(page)).blocks.find(item => item.id === table.id);
    assert.equal(settledTable.state, 'complete');
    assert.ok(settledTable.progress >= 0.999);
    timings.push({id: table.id, trigger: 0.8, duration: 2.2, elapsedSeconds: Number(tableElapsed.toFixed(3)), progress: settledTable.progress});
    await page.close();
    return {timings};
  });

  await test('Table stages and real text-band/finish-line frames are captured at desktop and both mobile widths', async () => {
    for (const [width, height] of viewports) {
      const context = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1});
      try {
        const page = await context.newPage();
        watch(page, `stages-${width}`);
        await open(page);
        const block = await blockFor(page, {id: 'impact-table', selector: '#impact .table-wrap', text: 'Full-operation monthly figures'});
        const locator = page.locator(block.selector);
        await positionAt(page, locator, 0.18);
        for (const [phase, seconds] of [['early', 0.24], ['mid', 1.1], ['final', 2.2]]) {
          const state = await captureStage(page, block, seconds, `${phase}-${width}`, width, height);
          if (phase === 'final') assert.equal(state.state, 'complete');
          else assert.ok(state.progress > 0 && state.progress < 1, `${phase} should capture partial formation.`);
        }
        await page.close();
      } finally { await context.close(); }

      const textContext = await browser.newContext({viewport: {width, height}, deviceScaleFactor: 1});
      try {
        const textPage = await textContext.newPage();
        watch(textPage, `text-band-${width}`);
        await open(textPage);
        const textBlock = await blockFor(textPage, {id: 'impact-heading', selector: '#impact-heading'});
        const textLocator = textPage.locator(textBlock.selector);
        await positionAt(textPage, textLocator, 1.06);
        assert.equal((await diagnostics(textPage)).blocks.find(item => item.id === textBlock.id).state, 'waiting', `${width}px text should wait above the 1.04H trigger.`);
        await isolateBlock(textPage, textBlock);
        await textPage.evaluate(() => window.siteInk.play());
        await positionAt(textPage, textLocator, 0.95);
        await waitForBlock(textPage, textBlock.id, 'active', 1200);
        await textPage.waitForTimeout(80);
        const band = (await diagnostics(textPage)).blocks.find(item => item.id === textBlock.id);
        assert.ok(band.progress > 0.12 && band.progress < 1, `${width}px text should visibly form in the 1.04H→0.75H band; progress=${band.progress}.`);
        const bandName = `site-ink-text-band-mid-${width}x${height}.png`;
        const bandBytes = await textPage.screenshot({path: path.join(evidence, bandName)});
        captures.push({file: bandName, blockId: textBlock.id, viewportTop: 0.95, progress: band.progress, viewport: {width, height}, sha256: hash(bandBytes)});
        await positionAt(textPage, textLocator, 0.749);
        await waitForBlock(textPage, textBlock.id, 'complete', 1200);
        assert.equal(await textLocator.evaluate(element => getComputedStyle(element).opacity), '1', 'The finish-line frame should show native text.');
        const finishName = `site-ink-text-band-finish-075-${width}x${height}.png`;
        const finishBytes = await textPage.screenshot({path: path.join(evidence, finishName)});
        captures.push({file: finishName, blockId: textBlock.id, viewportTop: 0.75, progress: 1, viewport: {width, height}, sha256: hash(finishBytes)});
        await textPage.close();
      } finally { await textContext.close(); }
    }
    const desktop = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
    watch(desktop, 'overview');
    await open(desktop);
    for (const [id, selector, phase, seconds] of [
      ['intro-heading', '#intro-heading', 'intro-mid', 0.8],
      ['intro-heading', '#intro-heading', 'intro-complete', 1.6],
      ['genetics-heading', '#genetics-heading', 'genetics-mid', 0.8],
    ]) {
      const block = await blockFor(desktop, {id, selector});
      await positionAt(desktop, desktop.locator(block.selector), 0.2);
      const state = await isolatedSeek(desktop, block, seconds);
      if (phase.endsWith('complete')) assert.equal(state.state, 'complete');
      const filename = `site-ink-overview-${phase}-1600x900.png`;
      const bytes = await desktop.screenshot({path: path.join(evidence, filename)});
      captures.push({file: filename, blockId: id, seconds, viewport: {width: 1600, height: 900}, sha256: hash(bytes)});
    }
    await desktop.close();
    return {screenshots: captures.filter(item => item.file.includes('site-ink-') && /early|mid|final|overview/.test(item.file)).length};
  });

  await test('Near-final text and four-column table overlays hand off to native pixels without weight drift', async () => {
    const page = await browser.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1});
    watch(page, 'handoff');
    await open(page);
    for (const [match, duration, prefix] of [
      [{id: 'impact-heading', selector: '#impact-heading', text: 'What the numbers show.'}, 1.6, 'impact-heading'],
      [{selector: '#impact .result-context', text: 'These figures cover the full operation.'}, 1.6, 'impact-context'],
      [{id: 'impact-table', selector: '#impact .table-wrap', text: 'Full-operation monthly figures'}, 2.2, 'impact-table'],
    ]) {
      const block = await blockFor(page, match);
      const locator = page.locator(block.selector);
      await positionAt(page, locator, 0.18);
      const bounds = await locator.boundingBox();
      assert.ok(bounds && bounds.width > 0 && bounds.height > 0, `${block.id} needs visible screenshot bounds.`);
      const overlayState = await isolatedSeek(page, block, duration - 0.01);
      assert.ok(overlayState.progress > 0.98 && overlayState.progress < 1, `${block.id} should be just before HTML handoff.`);
      const tableTextRegions = block.id === 'impact-table' ? [
        ['caption', '#impact-table caption'],
        ['month-header', '#impact-table thead th:first-child'],
        ['april-cases', '#impact-table tbody tr:first-child td:nth-child(2)'],
        ['august-rate', '#impact-table tbody tr:last-child td:last-child'],
      ].map(([name, selector]) => ({name, selector, bounds: null, overlay: null})) : [];
      for (const region of tableTextRegions) {
        const text = page.locator(region.selector);
        region.bounds = await textRangeBounds(text);
        region.overlay = await page.screenshot({path: path.join(evidence, `site-ink-handoff-table-${region.name}-overlay.png`), clip: region.bounds});
      }
      const overlayName = `site-ink-handoff-${prefix}-overlay.png`;
      const overlay = await page.screenshot({path: path.join(evidence, overlayName), clip: bounds});
      const settled = await seekBlock(page, block, duration);
      assert.equal(settled.state, 'complete');
      const nativeBounds = await locator.boundingBox();
      assert.ok(Math.abs(nativeBounds.x - bounds.x) < 0.5 && Math.abs(nativeBounds.y - bounds.y) < 0.5 && Math.abs(nativeBounds.width - bounds.width) < 0.5 && Math.abs(nativeBounds.height - bounds.height) < 0.5, `${block.id} geometry shifted during handoff.`);
      const nativeName = `site-ink-handoff-${prefix}-native.png`;
      const native = await page.screenshot({path: path.join(evidence, nativeName), clip: nativeBounds});
      const metrics = await pngMetrics(page, overlay, native, Math.round(bounds.width), Math.round(bounds.height));
      assert.ok(metrics.nativeInkRecall > 0.94 && metrics.nativeInkRecall < 1.08, `${block.id} native-ink coverage recall is ${metrics.nativeInkRecall}.`);
      assert.ok(metrics.overlayInkPrecision > 0.93, `${block.id} overlay ink precision is ${metrics.overlayInkPrecision}.`);
      assert.ok(metrics.rgbMAE < 3, `${block.id} overlay/native mean RGB error is ${metrics.rgbMAE}.`);
      assert.ok(metrics.nativeInkRgbMAE < 12, `${block.id} native-ink mean RGB error is ${metrics.nativeInkRgbMAE}.`);
      pixelComparisons.push({id: block.id, overlay: overlayName, native: nativeName, ...metrics});
      captures.push({file: overlayName, blockId: block.id, seconds: duration - 0.01, sha256: hash(overlay)});
      captures.push({file: nativeName, blockId: block.id, seconds: duration, sha256: hash(native)});
      for (const region of tableTextRegions) {
        const nativeText = await page.screenshot({path: path.join(evidence, `site-ink-handoff-table-${region.name}-native.png`), clip: region.bounds});
        const overlayFile = `site-ink-handoff-table-${region.name}-overlay.png`;
        const nativeFile = `site-ink-handoff-table-${region.name}-native.png`;
        const regionMetrics = await pngMetrics(page, region.overlay, nativeText, region.bounds.width, region.bounds.height);
        assert.ok(regionMetrics.nativeInkRecall > 0.91 && regionMetrics.nativeInkRecall < 1.10, `${region.name} native-ink recall is ${regionMetrics.nativeInkRecall}.`);
        assert.ok(regionMetrics.overlayInkPrecision > 0.92, `${region.name} overlay ink precision is ${regionMetrics.overlayInkPrecision}.`);
        assert.ok(regionMetrics.nativeInkRgbMAE < 16, `${region.name} native-ink RGB error is ${regionMetrics.nativeInkRgbMAE}.`);
        pixelComparisons.push({id: `impact-table:${region.name}`, overlay: `site-ink-handoff-table-${region.name}-overlay.png`, native: nativeFile, ...regionMetrics});
        captures.push({file: `site-ink-handoff-table-${region.name}-overlay.png`, blockId: block.id, seconds: duration - 0.01, sha256: hash(region.overlay)});
        captures.push({file: nativeFile, blockId: block.id, seconds: duration, sha256: hash(nativeText)});
      }
    }
    const eyebrowStyle = await page.locator('#impact .eyebrow').evaluate(element => ({transform: getComputedStyle(element).textTransform, letterSpacing: getComputedStyle(element).letterSpacing}));
    assert.equal(eyebrowStyle.transform, 'uppercase');
    assert.ok(parseFloat(eyebrowStyle.letterSpacing) >= 1, `Section eyebrow lost its letter spacing: ${JSON.stringify(eyebrowStyle)}`);
    const buttonBlock = await blockFor(page, {selector: '#about .button-link', text: 'View Résumé'});
    const button = page.locator('#about .button-link').first();
    assert.equal(await button.count(), 1, `The Resume CTA should be unique within the introduction: ${buttonBlock.selector}`);
    await positionAt(page, button, 0.35);
    await seekBlock(page, buttonBlock, buttonBlock.duration);
    const buttonStyle = await button.evaluate(element => ({color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor}));
    assert.equal(buttonStyle.color, 'rgb(239, 231, 215)', 'The CTA label should retain its contrasting paper-white color.');
    const buttonBounds = await button.boundingBox();
    const buttonPNG = await page.screenshot({path: path.join(evidence, 'site-ink-white-resume-button.png'), clip: buttonBounds});
    const lightPixels = await lightInkPixelCount(page, buttonPNG);
    assert.ok(lightPixels > 40, 'The white CTA label should render visible light glyph pixels.');
    captures.push({file: 'site-ink-white-resume-button.png', blockId: buttonBlock.id, viewport: {width: 1600, height: 900}, sha256: hash(buttonPNG), lightPixels});
    await page.close();
    return {pixelComparisons, eyebrowStyle, buttonStyle};
  });

  await test('Resize, fast scroll, and a direct section deep link leave usable formed content', async () => {
    const page = await browser.newPage({viewport: {width: 1280, height: 800}});
    watch(page, 'navigation');
    await open(page);
    const heading = await blockFor(page, {id: 'impact-heading', selector: '#impact-heading', text: 'What the numbers show.'});
    await seekBlock(page, heading, 0.7);
    await page.setViewportSize({width: 390, height: 844});
    const resized = await waitForBlock(page, heading.id, 'complete', 2500);
    assert.equal(resized.progress >= 0.999, true, 'Resizing an active pass should finish it.');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.evaluate(() => scrollTo({top: document.documentElement.scrollHeight, behavior: 'instant'}));
    await page.waitForFunction(() => document.querySelector('#contact-heading')?.getBoundingClientRect().bottom > 0, null, {timeout: 3000});
    assert.ok(await page.locator('#contact-heading').isVisible());
    const direct = await browser.newPage({viewport: {width: 1280, height: 800}});
    watch(direct, 'deep-link');
    try {
      const deepURL = new URL(url);
      deepURL.hash = 'impact';
      await open(direct, deepURL.href);
      assert.equal(await direct.evaluate(() => location.hash), '#impact');
      await direct.waitForFunction(() => {
        const rect = document.querySelector('#impact-heading')?.getBoundingClientRect();
        return Boolean(rect && rect.bottom > 0 && rect.top < innerHeight);
      }, null, {timeout: 4000});
      const headingBox = await direct.locator('#impact-heading').boundingBox();
      assert.ok(headingBox && headingBox.y >= 0 && headingBox.y < 820, `The deep-linked heading should be in view: ${JSON.stringify(headingBox)}.`);
      const block = await blockFor(direct, {id: 'impact-heading', selector: '#impact-heading', text: 'What the numbers show.'});
      assert.notEqual(block.state, 'waiting', 'The deep-link target should enter its ink state.');
    } finally { await direct.close(); await page.close(); }
    return {resizeState: resized.state, deepLink: '#impact'};
  });

  await test('Skip navigation, résumé, contact, motion toggle, and report dialog remain keyboard usable', async () => {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    watch(page, 'interactions');
    await open(page);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('skip-link')), true, 'The first tab stop should be the skip link.');
    assert.ok(await page.locator('.skip-link').evaluate(element => getComputedStyle(element).top === '14px'));
    const resume = page.locator('#masthead a[href="/assets/documents/J-Wayne-Graves-Jr-Resume.pdf"]').first();
    assert.equal(await resume.count(), 1);
    const pdf = await page.request.get(new URL('/assets/documents/J-Wayne-Graves-Jr-Resume.pdf', url).href);
    assert.equal(pdf.status(), 200);
    assert.equal((await pdf.body()).subarray(0, 5).toString(), '%PDF-');
    await page.evaluate(() => scrollTo({top: 500, behavior: 'instant'}));
    await page.locator('#masthead a[href="#contact"]').click();
    await page.waitForFunction(() => location.hash === '#contact' && document.querySelector('#contact-heading').getBoundingClientRect().top < innerHeight, null, {timeout: 4000});
    const motion = page.locator('#motion-toggle');
    await motion.click();
    assert.equal(await motion.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('html').getAttribute('data-motion'), 'off');
    await motion.click();
    assert.equal(await motion.getAttribute('aria-pressed'), 'true');
    const card = page.locator('.report-card').first();
    await card.scrollIntoViewIfNeeded();
    await card.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('#report-dialog')?.open, null, {timeout: 2000});
    assert.equal(await page.locator('#report-title').innerText(), 'Publication decision');
    await page.waitForFunction(() => {const image = document.querySelector('#report-image'); return image.complete && image.naturalWidth > 500;}, null, {timeout: 8000});
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#report-dialog').evaluate(element => element.open), false);
    assert.equal(await card.evaluate(element => document.activeElement === element), true, 'Closing the report should restore focus to its button.');
    await page.close();
    return {resumeStatus: pdf.status(), reportImageLoaded: true, motionToggle: 'on/off'};
  });

  await test('Reduced motion, unavailable WebGL, context loss, and no JavaScript keep all text readable', async () => {
    const fallbackResults = [];
    const reduced = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce'});
    try {
      const page = await reduced.newPage(); watch(page, 'reduced'); await open(page);
      const d = await diagnostics(page);
      assert.ok(['reduced-motion', 'motion-off'].includes(d.fallback), `Reduced motion should leave the native page active: ${d.fallback}.`);
      assert.ok(d.blocks.every(block => block.state === 'fallback'));
      assert.equal(d.activeRenderingCount, 0);
      assert.equal(d.canvasPresent, false);
      assert.ok(await page.locator('#intro-heading').isVisible());
      assert.equal(await page.locator('#impact tbody tr').count(), 5);
      fallbackResults.push({kind: 'reduced-motion', fallback: d.fallback});
    } finally { await reduced.close(); }

    const noWebgl = await browser.newContext({viewport: {width: 1280, height: 900}});
    try {
      await noWebgl.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
          if (['webgl', 'webgl2', 'experimental-webgl'].includes(String(type).toLowerCase())) return null;
          return original.call(this, type, ...args);
        };
      });
      const page = await noWebgl.newPage(); watch(page, 'no-webgl'); await open(page);
      const d = await diagnostics(page);
      assert.equal(d.fallback, 'missing-webgl');
      assert.equal(d.activeRenderingCount, 0);
      assert.ok(await page.locator('#impact-heading').isVisible());
      assert.equal(await page.locator('#impact tbody tr').count(), 5);
      fallbackResults.push({kind: 'missing-webgl', fallback: d.fallback});
    } finally { await noWebgl.close(); }

    const contextLoss = await browser.newContext({viewport: {width: 1280, height: 900}});
    try {
      const page = await contextLoss.newPage(); watch(page, 'context-loss'); await open(page);
      await page.locator('#site-ink-canvas').dispatchEvent('webglcontextlost', {cancelable: true, bubbles: true});
      await page.waitForFunction(() => window.siteInk.diagnostics().fallback === 'context-lost', null, {timeout: 2500});
      const d = await diagnostics(page);
      assert.equal(d.activeRenderingCount, 0);
      assert.ok(d.blocks.every(block => block.state === 'fallback'));
      assert.ok(await page.locator('#impact-heading').isVisible());
      fallbackResults.push({kind: 'context-lost', fallback: d.fallback});
    } finally { await contextLoss.close(); }

    const noScript = await browser.newContext({viewport: {width: 1280, height: 900}, javaScriptEnabled: false});
    try {
      const page = await noScript.newPage(); watch(page, 'no-js'); await page.goto('http://127.0.0.1:8903/', {waitUntil: 'domcontentloaded'});
      assert.equal(await page.locator('#intro-heading').isVisible(), true);
      assert.equal(await page.locator('#impact tbody tr').count(), 5);
      assert.equal(await page.locator('.contact-email').isVisible(), true);
      assert.ok(await page.locator('.no-script-intro').isVisible());
      assert.ok(await page.locator('a[href^="/assets/documents/"]').count() > 0);
      fallbackResults.push({kind: 'no-javascript', readable: true});
    } finally { await noScript.close(); }
    return {fallbackResults};
  });

  await test('No unexpected browser errors occurred during the rollout checks', async () => {
    assert.deepEqual(browserErrors, []);
    return {browserErrors: 0};
  });

  const passed = checks.filter(item => item.pass).length;
  const failed = checks.length - passed;
  const report = {url, checkedAt: new Date().toISOString(), passed, failed, checks, captures, pixelComparisons, browserErrors};
  await fs.writeFile(path.join(evidence, 'site-ink-checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${passed} site ink checks passed; ${failed} failed.`);
  console.log(`Evidence: ${path.relative(root, evidence)} (site-ink-*)`);
  if (failed || browserErrors.length) process.exitCode = 1;
}

main().catch(async error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
  try {
    await fs.writeFile(path.join(evidence, 'site-ink-checks.json'), JSON.stringify({url, checkedAt: new Date().toISOString(), passed: checks.filter(item => item.pass).length, failed: checks.filter(item => !item.pass).length + 1, checks, captures, pixelComparisons, browserErrors, fatal: error.stack || error.message}, null, 2) + '\n');
  } catch { /* Best-effort evidence report. */ }
}).finally(async () => { if (browser) await browser.close().catch(() => {}); });
