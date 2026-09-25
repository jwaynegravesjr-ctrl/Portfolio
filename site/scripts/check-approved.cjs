const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

const url = process.env.SITE_URL || 'http://127.0.0.1:8905/';
const captures = path.join(__dirname, '..', 'tmp', 'approved-review');
const heroEnd = 1.6 + 11 / .85;
const graphEnd = 7.2 / (1.15 * 1.10);
const near = (a,b,tolerance=.09) => assert.ok(Math.abs(a-b)<=tolerance,`${a} differed from ${b}`);
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));

async function main() {
  await fs.mkdir(captures,{recursive:true});
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const errors=[];
  try {
    for(const [size,width,height] of [['desktop',1600,900],['mobile',390,844]]) {
      const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
      page.on('pageerror',error=>errors.push(`${size}: ${error.message}`));
      await page.goto(url+'?inspect',{waitUntil:'networkidle'});
      const inspect=()=>page.evaluate(()=>window.PortfolioInk.inspect());
      const beginning=await inspect();
      assert.equal(beginning.hero.renderer,'webgl','Chrome should exercise the real WebGL compositor');
      assert.equal(beginning.discrepancy.length,0,'The reference and authoritative table must agree');
      assert.deepEqual(await page.locator('main section.section').evaluateAll(sections=>sections.map(section=>section.id)),
        ['about','genetics','impact','governance','contact']);
      assert.equal(await page.locator('.report-card').count(),4);
      assert.equal(await page.locator('.portrait-frame figcaption').count(),0,'The name beneath the portrait is removed');
      assert.equal(await page.locator('.contact-email').getAttribute('href'),'mailto:jwaynegravesjr@gmail.com');
      const resumeURL=await page.locator('[data-resume-view]').first().getAttribute('href');
      assert.ok(resumeURL.endsWith('/assets/documents/J-Wayne-Graves-Jr-Resume.pdf'));
      assert.equal((await page.request.get(new URL(resumeURL,page.url()).href)).status(),200);
      assert.equal(await page.locator('.portrait-window img').evaluate(image=>image.complete&&image.naturalWidth>0),true);
      const heroHeight=await page.locator('#hero').evaluate(element=>element.getBoundingClientRect().height);
      assert.ok(heroHeight>= (size==='mobile'?205:190) && heroHeight<=320);
      const paperColors=await page.evaluate(()=>({site:getComputedStyle(document.documentElement).backgroundColor,
        hero:getComputedStyle(document.getElementById('hero')).backgroundColor}));
      assert.equal(paperColors.hero,paperColors.site,'Hero and website paper colors match');
      assert.equal(await page.locator('#hero button').count(),0,'The banner has no Pause or Replay buttons');
      near(beginning.hero.duration,heroEnd,.001);
      near(beginning.chart.duration,graphEnd,.001);
      for(const time of [.18,.5,1,1.5,2.3,6,12,heroEnd]) {
        await page.evaluate(time=>window.PortfolioInk.seek('hero',time),time);
        const state=(await inspect()).hero;
        near(state.time,time,.001);
        if(time===.5)assert.ok(state.nameInk>0&&state.nameInk<1,'Name is forming from ink');
        if(time>=1.5){assert.equal(state.titleInk,1);assert.equal(state.nameFullyFormed,true);}
        if(time===.5){assert.ok(state.artwork.birds[0].ink>0&&state.artwork.birds[0].ink<1);assert.equal(state.artwork.birds[7].ink,0);}
        if(time===1){assert.ok(state.artwork.birds[7].ink>0&&state.artwork.birds[7].ink<1);}
        if(time===2.3)assert.ok(state.artwork.birds.every(bird=>bird.ink===1));
        if(time===heroEnd)assert.equal(state.titleInk,1);
        if(time===.5)assert.equal(state.remainingDebris,16);
        if(time===heroEnd)assert.equal(state.remainingDebris,0);
        assert.equal(state.artwork.birds.length,8);
        await page.locator('#hero').screenshot({path:path.join(captures,`${size}-hero-${time===heroEnd?'final':time}.png`)});
      }
      const held=(await inspect()).hero;
      assert.equal(held.nameVisible,true);
      assert.equal(held.remainingDebris,0);
      await page.locator('#chart-panel').scrollIntoViewIfNeeded();
      await page.evaluate(time=>window.PortfolioInk.seek('chart',time),graphEnd/2);
      await page.locator('#chart-panel').screenshot({path:path.join(captures,`${size}-graph-mid.png`)});
      await page.evaluate(time=>window.PortfolioInk.seek('chart',time),graphEnd+.01);
      await page.locator('#chart-panel').screenshot({path:path.join(captures,`${size}-graph-final.png`)});
      const graph=(await inspect()).chart;
      assert.equal(graph.state,'completed');
      assert.equal(graph.renderer,'webgl');
      near((await inspect()).hero.time,heroEnd,.001);
      await page.locator('#impact-table').scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      let table=(await inspect()).table;
      assert.ok(table.elapsedSeconds>0 && table.elapsedSeconds<2.2,'Table plays in visible time');
      await page.locator('#impact-table').screenshot({path:path.join(captures,`${size}-table-forming.png`)});
      const before=(await inspect()).table.elapsedSeconds;
      await page.evaluate(()=>scrollTo(0,0));
      await page.waitForTimeout(350);
      table=(await inspect()).table;
      assert.equal(table.state,'paused');
      near(table.elapsedSeconds,before,.12);
      await page.locator('#impact-table').scrollIntoViewIfNeeded();
      await page.waitForTimeout(180);
      table=(await inspect()).table;
      assert.ok(table.elapsedSeconds>before && table.elapsedSeconds<2.2,'Table resumes from its saved position');
      const preserved=table.elapsedSeconds;
      await page.setViewportSize({width:width-25,height});
      await page.waitForTimeout(50);
      table=(await inspect()).table;
      assert.ok(table.elapsedSeconds>=preserved-.03 && table.elapsedSeconds<2.2,'Resize preserves unfinished table formation');
      await page.waitForTimeout(2300);
      assert.equal((await inspect()).table.state,'complete');
      await page.locator('#impact-table').screenshot({path:path.join(captures,`${size}-table-complete.png`)});
      await page.locator('#replay-table').click();
      await page.waitForTimeout(120);
      assert.ok((await inspect()).table.progress<1,'Table-only Replay works');
      await page.close();
    }
    const skip=await browser.newPage({viewport:{width:1200,height:800}});
    await skip.goto(url+'?inspect',{waitUntil:'networkidle'});
    await skip.evaluate(()=>scrollTo(0,document.body.scrollHeight));
    await sleep(180);
    assert.equal((await skip.evaluate(()=>window.PortfolioInk.inspect())).table.state,'waiting','A skipped table stays ready');
    await skip.locator('#impact-table').scrollIntoViewIfNeeded();
    await skip.waitForTimeout(220);
    await skip.locator('#table-pause').click();
    const frozen=(await skip.evaluate(()=>window.PortfolioInk.inspect())).table.elapsedSeconds;
    await skip.waitForTimeout(250);
    near((await skip.evaluate(()=>window.PortfolioInk.inspect())).table.elapsedSeconds,frozen,.03);
    await skip.locator('#table-pause').click();
    await skip.waitForTimeout(220);
    assert.ok((await skip.evaluate(()=>window.PortfolioInk.inspect())).table.elapsedSeconds>frozen);
    await skip.locator('#chart-panel').scrollIntoViewIfNeeded();
    await skip.locator('#replay-chart').click();
    await skip.waitForTimeout(260);
    let chartTime=(await skip.evaluate(()=>window.PortfolioInk.inspect())).chart.time;
    assert.ok(chartTime>0 && chartTime<graphEnd,'The graph has an independent visible clock');
    await skip.locator('#graph-pause').focus();await skip.keyboard.press('Enter');
    const keyboardPause=(await skip.evaluate(()=>window.PortfolioInk.inspect())).chart.time;
    await skip.waitForTimeout(220);
    near((await skip.evaluate(()=>window.PortfolioInk.inspect())).chart.time,keyboardPause,.03);
    await skip.keyboard.press('Enter');await skip.waitForTimeout(130);
    assert.ok((await skip.evaluate(()=>window.PortfolioInk.inspect())).chart.time>keyboardPause);
    await skip.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    const hiddenTime=(await skip.evaluate(()=>window.PortfolioInk.inspect())).chart.time;
    await skip.waitForTimeout(300);
    near((await skip.evaluate(()=>window.PortfolioInk.inspect())).chart.time,hiddenTime,.02);
    await skip.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
    await skip.waitForTimeout(140);
    const resumedTime=(await skip.evaluate(()=>window.PortfolioInk.inspect())).chart.time;
    assert.ok(resumedTime>hiddenTime && resumedTime<hiddenTime+.3,'Hidden-tab return resumes without a large delta');
    await skip.evaluate(()=>scrollTo(0,0));
    await skip.waitForTimeout(300);
    near((await skip.evaluate(()=>window.PortfolioInk.inspect())).chart.time,resumedTime,.07);
    await skip.close();

    const reduced=await browser.newContext({reducedMotion:'reduce'});
    const reducedPage=await reduced.newPage(); await reducedPage.goto(url+'?inspect',{waitUntil:'networkidle'});
    const reducedState=await reducedPage.evaluate(()=>window.PortfolioInk.inspect());
    assert.equal(reducedState.hero.state,'completed'); assert.equal(reducedState.chart.state,'completed');
    assert.equal(reducedState.table.state,'fallback'); await reduced.close();
    const canvas=await browser.newPage();await canvas.goto(url+'?canvas&inspect',{waitUntil:'networkidle'});
    assert.equal((await canvas.evaluate(()=>window.PortfolioInk.inspect())).hero.renderer,'canvas');await canvas.close();
    const contextLoss=await browser.newPage();await contextLoss.goto(url+'?inspect',{waitUntil:'networkidle'});
    const lost=await contextLoss.evaluate(()=>{
      const canvas=document.querySelector('#hero-stage canvas:last-child');
      const extension=canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context');
      if(!extension)return false;extension.loseContext();return true;
    });
    assert.equal(lost,true,'Chrome should expose a testable WebGL context-loss extension');
    await contextLoss.waitForTimeout(70);
    assert.equal((await contextLoss.evaluate(()=>window.PortfolioInk.inspect())).hero.renderer,'canvas');
    await contextLoss.close();
    const noScript=await browser.newContext({javaScriptEnabled:false});
    const staticPage=await noScript.newPage();await staticPage.goto(url,{waitUntil:'networkidle'});
    assert.ok(await staticPage.locator('.hero-static img').isVisible());
    assert.equal(await staticPage.locator('#impact-table tbody tr').count(),5);
    assert.ok(await staticPage.locator('.chart-static').isVisible()); await noScript.close();
    const narrow=await browser.newPage({viewport:{width:320,height:720}});
    await narrow.goto(url+'?inspect',{waitUntil:'networkidle'});
    assert.ok(await narrow.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await narrow.evaluate(time=>window.PortfolioInk.seek('hero',time),heroEnd);
    assert.equal((await narrow.evaluate(()=>window.PortfolioInk.inspect())).hero.remainingDebris,0);
    await narrow.close();
    assert.deepEqual(errors,[]);
    console.log('Approved hero, graph, original table, viewport, controls, reduced-motion and fallback checks passed.');
    console.log('Captures:',captures);
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
