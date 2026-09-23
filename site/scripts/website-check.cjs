const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

const targetURL = new URL(process.env.PERCH_URL || 'http://127.0.0.1:8903/?inspect');
targetURL.searchParams.set('inspect', '');
const url = targetURL.href;
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'evidence');
const checks = [], errors = [], warnings = [], captures = [];
let browser, page;
const hash = data => createHash('sha256').update(data).digest('hex');
const inspect = (target = page) => target.evaluate(() => window.sharedPerch.diagnostics());
const seek = (time, target = page) => target.evaluate(t => window.sharedPerch.seek(t), time);
const go = async target => {
  await target.goto(url, {waitUntil:'networkidle', timeout:45000});
  await target.waitForFunction(() => Boolean(window.sharedPerch), {timeout:30000});
};
const scroll = async (y, target = page) => {
  await target.evaluate(top => window.scrollTo({top, behavior:'instant'}), y);
  await target.waitForTimeout(120);
};
const top = async (target = page) => {
  await scroll(0, target);
  await target.waitForFunction(() => window.sharedPerch.diagnostics().morphProgress === 0);
};
const stageHash = async () => hash(await page.locator('#page').screenshot({animations:'disabled'}));
const test = async (name, body) => {
  try { await body(); checks.push({name, pass:true}); }
  catch (error) {
    checks.push({name, pass:false, error:error.message});
    console.error(`FAIL: ${name}\n${error.message}`);
    if (page && !page.isClosed()) await page.screenshot({path:path.join(evidence, `website-failure-${checks.length}.png`)}).catch(() => {});
  }
};
const captureSection = async (id, name, target = page) => {
  const y = await target.locator(id).evaluate(el => el.getBoundingClientRect().top + window.scrollY - 106);
  await scroll(y, target); await target.waitForTimeout(1100);
  await target.screenshot({path:path.join(evidence, name), animations:'disabled'});
  captures.push({file:name, section:id, viewport:target.viewportSize(), scrollY:await target.evaluate(() => scrollY)});
};
const settleFrames = target => target.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const midFormationScrollY = (documentTop, viewportHeight) => {
  const travel=Math.max(280,Math.min(340,viewportHeight*.36));
  return Math.max(0,documentTop-(viewportHeight*.94-travel*.5));
};
const readNavigationBirdBands = target => target.locator('#top-birds').evaluate(canvas => {
  const rect=canvas.getBoundingClientRect(),scale=canvas.width/(rect.width||1),context=canvas.getContext('2d');
  const bounds=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right};};
  const wordmark=bounds(document.querySelector('.wordmark'));
  const firstLink=bounds(document.querySelector('#masthead nav a:first-child'));
  if(!context||!canvas.width||!canvas.height)return {wordmark,firstLink,bands:[]};
  const {data,width,height}=context.getImageData(0,0,canvas.width,canvas.height),columns=[];
  for(let x=0;x<width;x++){
    let ink=0;for(let y=0;y<height;y++){
      const p=(y*width+x)*4;
      if(data[p+3]>16&&data[p]<100&&data[p+1]<100&&data[p+2]<100)ink++;
    }
    if(ink)columns.push(x);
  }
  const bands=[];let start=null,last=null;
  for(const x of columns){
    if(start===null){start=last=x;continue;}
    if(x-last>2){bands.push({left:+(rect.left+start/scale).toFixed(2),right:+(rect.left+(last+1)/scale).toFixed(2)});start=x;}
    last=x;
  }
  if(start!==null)bands.push({left:+(rect.left+start/scale).toFixed(2),right:+(rect.left+(last+1)/scale).toFixed(2)});
  return {wordmark,firstLink,bands};
});

(async () => {
  await fs.mkdir(evidence, {recursive:true});
  try {
    browser = await chromium.launch({channel:'chrome', headless:true});
    page = await browser.newPage({viewport:{width:1600,height:1050}, deviceScaleFactor:1});
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(message.text());
      if (message.type() === 'warning') warnings.push(message.text());
    });
    await go(page); await seek(2);

    await test('The approved narrative, attribution and corrected table replace old claims', async () => {
      const text = await page.locator('main').innerText();
      for (const phrase of ['20-person operations team', '80-person line of business', 'Nurse Supervisor', 'refined and expanded', 'pseudocode', 'AI converted', 'beginning of July', '45.8%', 'full operation', 'downward trend began before', 'does not isolate', 'genetics-only', 'not been independently verified']) assert.ok(text.includes(phrase), phrase);
      const completeCopy = await page.locator('main').textContent();
      assert.ok(completeCopy.includes('Synthetic Genetics Governance Report'));
      for (const removed of ['What the evidence supports', 'Follow-up accounts support continued use beyond distribution.', 'This employment-based case is my first-person account.', 'These report figures do not represent measured workplace results.']) assert.ok(!completeCopy.includes(removed), `Removed passage remains: ${removed}`);
      assert.equal(await page.locator('h1').innerText(), 'I turn recurring quality problems into clearer ways of working.');
      const rows = await page.locator('#impact tbody tr').evaluateAll(rows => rows.map(row => [...row.children].map(c => c.textContent.trim())));
      assert.deepEqual(rows, [
        ['April','37,548','153','4.07'], ['May','38,649','127','3.29'], ['June','40,125','105','2.62'],
        ['July','37,205','78','2.10'], ['August','45,866','65','1.42'],
      ]);
      const adjacent = await page.locator('.result-grid').innerText();
      assert.ok(adjacent.includes('2.62') && adjacent.includes('1.42') && adjacent.includes('does not isolate'));
      assert.ok(!/80\s*%|30\s*%|100\s*%|10\s*[–-]\s*12\s*hours|80 direct reports|May rollout|Agent Orchestration/i.test(text));
    });

    await test('The opening contains the animation and discreet pause without its old outer chrome', async () => {
      assert.equal(await page.locator('#caption,#chapter,#clock,#progress,#restart,#desk').count(), 0);
      assert.equal(await page.locator('#hero h1,#hero h2').count(), 0);
      assert.equal(await page.locator('#play').isVisible(), true);
      const copy = await page.locator('#animation-description').textContent();
      assert.ok(copy.includes('J WAYNE GRAVES JR') && copy.includes('Operation Leader, Automation Expert and Quality Improvement Specialist'));
      assert.equal((await inspect()).available, true);
    });

    await test('All portrait, chart, report and résumé assets respond successfully', async () => {
      const assets = await page.evaluate(() => [...new Set([...document.querySelectorAll('img[src],a[href],button[data-report]')].flatMap(el => ['src','href','data-report'].map(k => el.getAttribute(k))).filter(v => v && v.startsWith('/assets/')))]);
      assert.ok(assets.includes('/assets/documents/J-Wayne-Graves-Jr-Resume.pdf'));
      assert.ok(assets.includes('/assets/portrait.webp'));
      for (const asset of assets) {
        const response = await page.request.get(new URL(asset,url).href);
        assert.equal(response.status(),200,asset);
        if (asset.endsWith('.pdf')) assert.equal((await response.body()).subarray(0,5).toString(),'%PDF-', 'Résumé is an actual PDF.');
      }
    });

    await test('All eight identities settle and the preserved animation loops at 45 seconds', async () => {
      await top(); await seek(39.35); const d = await inspect();
      assert.equal(d.visible,8);
      assert.deepEqual(d.state.birds.map(b => b.id),['B1','B2','B3','B4','B5','B6','B7','B8']);
      assert.ok(d.state.birds.every(b => b.planted && b.formation === 1 && b.dispersal === 0));
      await seek(44.96); await page.evaluate(() => window.sharedPerch.play());
      await page.waitForTimeout(250); const wrapped = await inspect();
      assert.ok(wrapped.time >= 0 && wrapped.time < 1, `Loop wrapped to ${wrapped.time}`);
      await page.evaluate(() => window.sharedPerch.pause());
    });

    await test('Direct seeking reproduces the cinematic ink title and returns to identical clean paper', async () => {
      await top(); await seek(39.4); const direct = await stageHash(); const pose = (await inspect()).state;
      await seek(7); await seek(43); await seek(22); await seek(39.4);
      assert.equal(await stageHash(), direct);
      assert.deepEqual((await inspect()).state,pose);
      await seek(0); const clean = await stageHash(); await seek(44.8);
      assert.equal(await stageHash(),clean);
    });

    await test('Early scrolling freezes the current scene and turns it into usable navigation', async () => {
      await top(); await seek(2); await page.evaluate(() => window.sharedPerch.play());
      await scroll(620); await page.waitForFunction(() => window.sharedPerch.diagnostics().morphProgress > .99);
      const frozen = await inspect(); assert.equal(frozen.running,false);
      assert.equal(await page.locator('#page').evaluate(el => getComputedStyle(el).visibility),'hidden');
      await page.waitForFunction(() => Number(document.querySelector('#masthead').dataset.inkProgress) > .99);
      assert.equal(await page.locator('#masthead-copy').evaluate(el => el.inert),false);
      assert.ok(Number(await page.locator('#masthead-copy').evaluate(el => getComputedStyle(el).opacity)) > .99);
      for (const link of ['.wordmark', '#masthead a[href$=".pdf"]', '#masthead a[href="#contact"]']) assert.equal(await page.locator(link).isVisible(),true,link);
      await page.waitForTimeout(260); assert.equal((await inspect()).time,frozen.time);
      assert.equal(await page.locator('#masthead a[href="#contact"]').getAttribute('href'),'#contact');
      await top(); await page.waitForTimeout(120); assert.equal((await inspect()).running,true);
      await page.evaluate(() => window.sharedPerch.pause());
    });

    await test('A fast scroll inks six navigation birds inside the wordmark-link gap', async () => {
      for(const [width,height] of [[1600,1050],[390,844],[320,720]]){
        const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
        try{
          const target=await context.newPage();await go(target);
          await target.waitForFunction(() => Number(document.querySelector('#masthead').dataset.inkProgress) < .01);
          const span=await target.locator('#hero').evaluate(el=>Math.max(160,Math.min(430,el.clientHeight*.65)));
          await target.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),Math.max(620,span+100));
          await target.waitForFunction(() => window.sharedPerch.diagnostics().morphProgress === 1);
          await target.waitForFunction(() => Number(document.querySelector('#masthead').dataset.inkProgress) > .99);
          await target.waitForFunction(() => document.querySelector('#top-birds')?.style.visibility === 'visible',undefined,{timeout:1500});
          const row=await readNavigationBirdBands(target);
          assert.ok(row.firstLink.left>row.wordmark.right,`No navigation gap at ${width}px`);
          assert.equal(row.bands.length,6,`${width}px gap ${row.wordmark.right}–${row.firstLink.left}; bird bands: ${JSON.stringify(row.bands)}`);
          assert.ok(row.bands.every(b=>b.left>=row.wordmark.right-.75&&b.right<=row.firstLink.left+.75),`${width}px birds leave the wordmark-link gap: ${JSON.stringify(row)}`);
          assert.equal(await target.locator('#masthead-copy').evaluate(el=>el.inert),false);
          for(const link of ['.wordmark','#masthead a[href$=".pdf"]','#masthead a[href="#contact"]'])assert.equal(await target.locator(link).isVisible(),true,`${width}px ${link}`);
        }finally{await context.close();}
      }
    });

    await test('Page text prints through inkblots, reverses deterministically, and is complete for reduced motion', async () => {
      const selector='#genetics .section-heading[data-ink]';
      const bounds=await page.locator(selector).evaluate(el=>({top:el.getBoundingClientRect().top+scrollY,height:el.getBoundingClientRect().height,viewportHeight:innerHeight}));
      const partialY=midFormationScrollY(bounds.top,bounds.viewportHeight);
      await scroll(partialY); await settleFrames(page);
      const readMask=(target,contentSelector)=>target.locator(contentSelector).evaluate(el=>({mask:getComputedStyle(el).maskImage,top:+el.getBoundingClientRect().top.toFixed(3),scrollY}));
      const first=await readMask(page,selector);
      assert.ok(first.mask.startsWith('url(')&&first.mask.includes('data:image/'),`The section should be in a real mid-print state, got ${first.mask.slice(0,90)}`);

      const siblingSelector='#impact .section-heading[data-ink]';
      const siblingTop=await page.locator(siblingSelector).evaluate(el=>el.getBoundingClientRect().top+scrollY);
      await scroll(midFormationScrollY(siblingTop,bounds.viewportHeight)); await settleFrames(page);
      const sibling=await readMask(page,siblingSelector);
      assert.ok(sibling.mask.startsWith('url(')&&sibling.mask.includes('data:image/'),'A second content block should also use an inkblot print.');
      assert.notEqual(sibling.mask,first.mask,'Distinct page headings should receive their own deterministic print shapes.');

      await scroll(partialY+bounds.height+bounds.viewportHeight); await settleFrames(page);
      const completed=await readMask(page,selector);
      assert.equal(completed.mask,'none','The section should become fully readable after passing the ink front.');

      await scroll(partialY); await settleFrames(page);
      const reversed=await readMask(page,selector);
      assert.equal(reversed.mask,first.mask,'Returning to the same scroll geometry should reproduce the exact ink mask.');
      assert.equal(reversed.top,first.top,'The repeated mask comparison must use identical element geometry.');

      const context=await browser.newContext({viewport:{width:1280,height:900},deviceScaleFactor:1,reducedMotion:'reduce'});
      try{
        const target=await context.newPage();await go(target);
        const docTop=await target.locator(selector).evaluate(el=>el.getBoundingClientRect().top+scrollY);
        await scroll(midFormationScrollY(docTop,900),target);await settleFrames(target);
        const state=await target.locator(selector).evaluate(el=>({mask:getComputedStyle(el).maskImage,motion:document.documentElement.dataset.motion}));
        assert.equal(state.motion,'off');
        assert.equal(state.mask,'none','Reduced motion should show the complete text without a scroll mask.');
      }finally{await context.close();}
      console.log(`Ink mask reverses exactly at ${partialY}px; reduced-motion content is complete.`);
    });

    await test('The mobile first-fold entrance settles while later content still inks on scroll', async () => {
      const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
      try{
        const target=await context.newPage();await go(target);await target.waitForTimeout(2100);
        const firstFold=await target.evaluate(()=>({scrollY,headline:getComputedStyle(document.querySelector('#intro-heading')).maskImage,portrait:getComputedStyle(document.querySelector('.portrait-frame')).maskImage}));
        assert.equal(firstFold.scrollY,0,'The mobile entrance should settle at the top of the page.');
        assert.equal(firstFold.headline,'none','The mobile headline should be fully revealed after its timed ink entrance.');
        assert.equal(firstFold.portrait,'none','The mobile portrait should be fully revealed after its timed ink entrance.');

        const laterSelector='#genetics .section-heading[data-ink]';
        const laterTop=await target.locator(laterSelector).evaluate(el=>el.getBoundingClientRect().top+scrollY);
        await scroll(midFormationScrollY(laterTop,844),target);await settleFrames(target);
        const laterMask=await target.locator(laterSelector).evaluate(el=>getComputedStyle(el).maskImage);
        assert.ok(laterMask.startsWith('url(')&&laterMask.includes('data:image/'),'Ordinary scrolling should still print later content through an active ink mask.');
      }finally{await context.close();}
    });

    await test('A visitor’s manual pause survives scrolling down and returning to the top', async () => {
      await top(); await seek(20); const initial = await inspect();
      await scroll(650); await top(); await page.waitForTimeout(220);
      const restored = await inspect(); assert.equal(restored.running,false); assert.equal(restored.time,initial.time);
      await page.locator('#play').focus(); await page.keyboard.press('Enter');
      await page.waitForTimeout(160); assert.equal((await inspect()).running,true);
      await page.keyboard.press('Enter'); assert.equal((await inspect()).running,false);
    });

    await test('The persistent contact link reaches the contact section below the bar', async () => {
      await scroll(650);
      await page.locator('#masthead a[href="#contact"]').click();
      await page.waitForFunction(() => {
        const heading=document.querySelector('#contact-heading').getBoundingClientRect();
        const email=document.querySelector('.contact-email').getBoundingClientRect();
        return location.hash === '#contact' && heading.top >= 65 && heading.bottom < innerHeight && email.top >= 65 && email.bottom < innerHeight;
      });
      assert.equal(await page.locator('.contact-email').getAttribute('href'),'mailto:jwaynegravesjr@gmail.com');
    });

    await test('Keyboard users can open a report, read its image and close it with Escape', async () => {
      const card = page.locator('.report-card').first(); await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(700);
      await card.focus(); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#report-dialog').open);
      assert.equal(await page.locator('#report-title').innerText(),'Publication decision');
      await page.waitForFunction(() => {const img=document.querySelector('#report-image');return img.complete && img.naturalWidth > 500;});
      assert.equal(await page.locator('#close-report').isVisible(),true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#report-dialog').evaluate(el => el.open),false);
      assert.equal(await card.evaluate(el => document.activeElement === el),true);
    });

    await test('Desktop section captures document the actual layout and revealed content', async () => {
      for (const [id,name] of [['#about','website-intro-desktop.png'],['#genetics','website-flagship-desktop.png'],['#impact','website-results-desktop.png'],['#governance','website-reports-desktop.png'],['#contact','website-contact-desktop.png']]) await captureSection(id,name);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    });

    await test('The 390-pixel layout keeps the hero, portrait, navigation and table in bounds', async () => {
      const context = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,reducedMotion:'reduce'});
      try {
        const target = await context.newPage(); await go(target);
        const d = await target.locator('#page').evaluate(el => {const r=el.getBoundingClientRect();return {width:r.width,height:r.height,left:r.left,right:r.right};});
        assert.ok(Math.abs(d.width/d.height-16/9)<.002); assert.ok(d.left>=0&&d.right<=390.5);
        await target.screenshot({path:path.join(evidence,'website-hero-mobile.png')});
        await captureSection('#about','website-intro-mobile.png',target);
        assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1),true);
        const portrait = await target.locator('.portrait-frame').boundingBox(); assert.ok(portrait.width<=390 && portrait.x>=0);
        await captureSection('#impact','website-results-mobile.png',target);
        const table = await target.locator('.table-wrap').boundingBox(); assert.ok(table.x>=0 && table.x+table.width<=391);
        const nav = await target.locator('#masthead-copy').boundingBox(); assert.ok(nav.x>=0 && nav.x+nav.width<=391);
        assert.ok((await inspect(target)).morphProgress>.99);
        assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1),true);
      } finally {await context.close();}
    });

    await test('Reduced motion shows the settled composition without automatic playback', async () => {
      const context = await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
      try {
        const target=await context.newPage(); await go(target); const d=await inspect(target);
        assert.equal(d.running,false); assert.equal(d.visible,8); assert.ok(d.state.birds.every(b=>b.planted));
        await target.waitForTimeout(250); assert.equal((await inspect(target)).time,d.time);
        await captureSection('#about','website-reduced-motion.png',target);
        assert.equal(await target.locator('#intro-heading').isVisible(),true);
        assert.equal(await target.locator('#impact tbody tr').count(),5);
      } finally {await context.close();}
    });

    await test('Without JavaScript, the introduction, exact data and contact remain available', async () => {
      const context=await browser.newContext({viewport:{width:1280,height:900},javaScriptEnabled:false});
      try {
        const target=await context.newPage(); await target.goto(url,{waitUntil:'networkidle'});
        assert.equal(await target.locator('#intro-heading').isVisible(),true);
        assert.equal(await target.locator('#impact tbody tr').count(),5);
        assert.equal(await target.locator('.contact-email').isVisible(),true);
        assert.ok(await target.locator('.no-script-intro').isVisible());
        await target.locator('#about').scrollIntoViewIfNeeded();
        await target.screenshot({path:path.join(evidence,'website-no-javascript.png')});
      } finally {await context.close();}
    });

    await test('Unavailable WebGL preserves the drawn fallback and the usable website', async () => {
      const context=await browser.newContext({viewport:{width:1280,height:900}});
      try {
        await context.addInitScript(() => {
          const original=HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext=function(type,...args){if(['webgl','webgl2','experimental-webgl'].includes(type))return null;return original.call(this,type,...args);};
        });
        const target=await context.newPage(),fallbackErrors=[]; target.on('pageerror',error=>fallbackErrors.push(error.message));
        await go(target); assert.equal((await inspect(target)).available,false);
        assert.equal(await target.locator('#still').evaluate(el=>getComputedStyle(el).visibility),'visible');
        assert.equal(await target.locator('#play').isDisabled(),true);
        const ink=await target.locator('#still').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]<100&&d[i+1]<100&&d[i+2]<100&&d[i+3]>200)n++;return n;});
        assert.ok(ink>200); await scroll(600,target);
        await target.waitForFunction(() => Number(document.querySelector('#masthead').dataset.inkProgress) > .99);
        assert.equal(await target.locator('#masthead-copy').evaluate(el=>el.inert),false);
        assert.deepEqual(fallbackErrors,[]);
      } finally {await context.close();}
    });

    await test('No JavaScript, missing-asset or shader errors occurred in the main browser checks', async () => {assert.deepEqual(errors,[]);});
  } catch (error) {
    checks.push({name:'Browser setup or suite completion',pass:false,error:error.message}); console.error(error.stack||error.message);
  } finally {
    if (browser) await browser.close();
    const passed=checks.filter(c=>c.pass).length,failed=checks.filter(c=>!c.pass).length;
    await fs.writeFile(path.join(evidence,'website-checks.json'),JSON.stringify({url,checkedAt:new Date().toISOString(),passed,failed,checks,captures,errors,warnings},null,2)+'\n');
    console.log(`${passed} website browser checks passed; ${failed} failed.`); if(failed)process.exitCode=1;
  }
})();
