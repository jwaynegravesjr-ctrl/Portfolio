const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

const root = path.resolve(__dirname, '..');
const evidence = process.env.RESUME_EMBED_EVIDENCE_DIR || path.join(root, 'evidence');
const base = 'http://127.0.0.1:8903';
const pdfPath = '/assets/documents/J-Wayne-Graves-Jr-Resume.pdf';
const failures = [];

(async () => {
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
      const page = await browser.newPage({viewport});
      page.on('pageerror', error => failures.push(`${viewport.width}px: ${error.message}`));
      await page.goto(base, {waitUntil: 'domcontentloaded'});
      assert.equal(await page.locator('a[data-resume-view][href="' + pdfPath + '"]').count(), 3);
      const view = page.locator('.intro-copy [data-resume-view]');
      await view.click();
      const dialog = page.locator('#resume-dialog');
      await dialog.waitFor({state: 'visible'});
      assert.equal(await page.locator('#resume-frame').getAttribute('src'), `${base}${pdfPath}`);
      assert.equal(await page.locator('#resume-dialog a[download]').getAttribute('href'), pdfPath);
      assert.equal(await page.locator('#resume-dialog a[target="_blank"]').getAttribute('href'), pdfPath);
      assert.equal(await page.locator('#resume-title').textContent(), 'J Wayne Graves Jr · Résumé');
      await page.waitForTimeout(2300);
      await page.screenshot({path: path.join(evidence, `resume-embed-${viewport.width}.png`)});
      if (viewport.width === 1440) {
        const download = await Promise.all([
          page.waitForEvent('download'),
          page.locator('#resume-dialog a[download]').click(),
        ]).then(([item]) => item);
        assert.equal(download.suggestedFilename(), 'J-Wayne-Graves-Jr-Resume.pdf');
      }
      await page.keyboard.press('Escape');
      assert.equal(await dialog.evaluate(element => element.open), false);
      assert.equal(await page.locator('#resume-frame').getAttribute('src'), 'about:blank');
      assert.equal(await view.evaluate(element => document.activeElement === element), true);
      await page.close();
    }
    const response = await browser.newPage().then(async page => {
      try { return await page.request.get(`${base}${pdfPath}`); }
      finally { await page.close(); }
    });
    assert.equal(response.status(), 200);
    assert.match(response.headers()['content-type'] || '', /application\/pdf/);
    assert.equal(failures.length, 0, failures.join('\n'));
    await fs.writeFile(path.join(evidence, 'resume-embed-checks.json'), JSON.stringify({desktop: true, mobile: true, focusRestored: true, downloadLink: true, directPdfFallback: true, browserErrors: failures}, null, 2));
    console.log('Résumé reader passed desktop/mobile, keyboard, fallback and download checks.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
