const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

const baseURL = new URL(process.env.PERCH_URL || 'http://127.0.0.1:8903/');
baseURL.searchParams.set('inspect', '');
const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'evidence');
const errors = [];
const captures = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function openPage(browser, viewport) {
  const context = await browser.newContext({viewport, deviceScaleFactor:1, reducedMotion:'no-preference'});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({viewport, source:'pageerror', message:error.message}));
  page.on('console', message => { if (message.type() === 'error') errors.push({viewport, source:'console', message:message.text()}); });
  await page.goto(baseURL.href, {waitUntil:'networkidle', timeout:45000});
  await page.waitForFunction(() => Boolean(window.sharedPerch), {timeout:30000});
  return {context,page};
}

async function scroll(page, y, wait=90) {
  await page.evaluate(top => window.scrollTo({top,behavior:'instant'}), y);
  await pause(wait);
}

async function capture(page, viewportName, state) {
  const file = `visual-sweep-${viewportName}-${state}.png`;
  await page.screenshot({path:path.join(evidence,file),animations:'disabled'});
  const telemetry = await page.evaluate(() => ({
    scrollY, morphProgress:window.sharedPerch.diagnostics().morphProgress,
    headerInkProgress:Number(document.querySelector('#masthead').dataset.inkProgress||0),
  }));
  captures.push({file,viewport:page.viewportSize(),state,...telemetry});
  return file;
}

function maskState(maskImage) {
  if (maskImage === 'none') return 'revealed';
  if (maskImage.startsWith('url(')) return 'ink-print';
  if (maskImage.startsWith('linear-gradient')) return 'hidden';
  return 'masked';
}

async function captureInkMilestones(page, viewportName) {
  const milestones = [
    ['portrait', '#about .portrait-frame'],
    ['introduction', '#about .intro-copy h1[data-ink]'],
    ['branch-divider', '.perch-divider'],
    ['collaboration-story', '#genetics .story-copy > div:nth-child(2)'],
    ['results-data', '#impact .big-result[data-ink]'],
    ['report-card', '#governance .report-card:first-child'],
    ['contact-link', '#contact .contact-email[data-ink]'],
    ['footer', '.site-footer p[data-ink]'],
  ];
  const results = [];
  for (const [name, selector] of milestones) {
    const target = page.locator(selector).first();
    const exists = await target.count();
    if (!exists) throw new Error(`Missing ink milestone ${name}: ${selector}`);
    const position = await target.evaluate(el => ({
      documentTop: el.getBoundingClientRect().top + scrollY,
      height: el.getBoundingClientRect().height,
      viewportHeight: innerHeight,
    }));
    const travel = Math.max(280, Math.min(340, position.viewportHeight * .36));
    const formationTop = position.viewportHeight * .94 - travel * .5;
    const initialEntrance = await page.evaluate(() => scrollY === 0) && position.documentTop < formationTop;
    const y = initialEntrance ? 0 : Math.max(0, position.documentTop - formationTop);
    if (!initialEntrance) await scroll(page, y, 125);
    else await pause(125);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const state = await target.evaluate(el => {
      const style = getComputedStyle(el), bounds = el.getBoundingClientRect();
      return {maskImage:style.maskImage,top:+bounds.top.toFixed(2),height:+bounds.height.toFixed(2),scrollY};
    });
    const status = maskState(state.maskImage);
    const expected = initialEntrance ? ['ink-print', 'revealed'] : ['ink-print'];
    if (!expected.includes(status)) throw new Error(`${name} did not show its expected ink state at ${viewportName}: ${status} (${state.maskImage.slice(0,80)})`);
    const file = `visual-sweep-${viewportName}-ink-${name}.png`;
    await page.screenshot({path:path.join(evidence,file),animations:'disabled'});
    captures.push({file,viewport:page.viewportSize(),state:`ink-${name}`,...state,maskState:status});
    results.push({name,selector,maskState:status,scrollY:y,formationProgress:initialEntrance?(status==='revealed'?'settled-firstfold':'timed-entrance'):.5,formationTop,elementTop:state.top,elementHeight:state.height});
  }
  return results;
}

async function geometry(page) {
  return page.evaluate(() => {
    const classifyMask = image => image === 'none' ? 'revealed' : image.startsWith('url(') ? 'ink-print' : image.startsWith('linear-gradient') ? 'hidden' : 'masked';
  const rect = el => {
      if (!el) return null;
      const r=el.getBoundingClientRect();
      return {x:+r.x.toFixed(2),y:+r.y.toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2),left:+r.left.toFixed(2),right:+r.right.toFixed(2),top:+r.top.toFixed(2),bottom:+r.bottom.toFixed(2)};
    };
    const wordmark=rect(document.querySelector('.wordmark'));
    const firstLink=rect(document.querySelector('#masthead nav a:first-child'));
    const navigationGap=wordmark&&firstLink?{left:wordmark.right,right:firstLink.left,width:+(firstLink.left-wordmark.right).toFixed(2)}:null;
    const frame=document.querySelector('.portrait-frame'),caption=frame?.querySelector('figcaption');
    let portrait=null;
    if(frame&&caption){
      const fr=frame.getBoundingClientRect(),pseudo=getComputedStyle(frame,'::after');
      const range=document.createRange();range.selectNodeContents(caption);const textRect=range.getBoundingClientRect();range.detach();
      const n=value=>Number.parseFloat(value)||0;
      const decoration={left:fr.left+n(pseudo.left),top:fr.top+n(pseudo.top),right:fr.right-n(pseudo.right),bottom:fr.bottom-n(pseudo.bottom)};
      decoration.width=decoration.right-decoration.left;decoration.height=decoration.bottom-decoration.top;
      const matrix=new DOMMatrixReadOnly(pseudo.transform);
      portrait={captionBox:rect(caption),captionText:rect({getBoundingClientRect:()=>textRect}),decorativeFrameApprox:decoration,decorativeFrameTransform:pseudo.transform,
        rotationDegrees:+(Math.atan2(matrix.b,matrix.a)*180/Math.PI).toFixed(2),
        captionTextFitsUnrotatedApprox:textRect.left>=decoration.left&&textRect.right<=decoration.right&&textRect.top>=decoration.top&&textRect.bottom<=decoration.bottom,
        captionTextOutsideBy:{left:+Math.max(0,decoration.left-textRect.left).toFixed(2),right:+Math.max(0,textRect.right-decoration.right).toFixed(2),top:+Math.max(0,decoration.top-textRect.top).toFixed(2),bottom:+Math.max(0,textRect.bottom-decoration.bottom).toFixed(2)}};
    }

    const birds=document.querySelector('#top-birds');let birdInfo=null;
    if(birds){
      const r=rect(birds),c=birds.getContext('2d');let bands=[];
      if(c&&birds.width&&birds.height){
        const pixels=c.getImageData(0,0,birds.width,birds.height).data,cols=[];
        for(let x=0;x<birds.width;x++){
          let count=0;for(let y=0;y<birds.height;y++)if(pixels[(y*birds.width+x)*4+3]>12)count++;
          if(count>0)cols.push(x);
        }
        let start=null,last=null;
        for(const x of cols){if(start===null){start=last=x;continue;}if(x-last>2){bands.push({start,end:last,width:last-start+1});start=x;}last=x;}
        if(start!==null)bands.push({start,end:last,width:last-start+1});
        const scale=birds.width/(r.width||1);
        bands.forEach(b=>{b.left=+(r.left+b.start/scale).toFixed(2);b.right=+(r.left+(b.end+1)/scale).toFixed(2);});
      }
      birdInfo={exists:true,ariaHidden:birds.getAttribute('aria-hidden'),pointerEvents:getComputedStyle(birds).pointerEvents,
        visibility:getComputedStyle(birds).visibility,bounds:r,bandCount:bands.length,birdBands:bands,nonTransparentColumnBands:bands};
    }

    const svg=document.querySelector('#perch-morph');let perch=null;
    if(svg){
      const svgBox=rect(svg),paths=[...svg.querySelectorAll('path')].map((p,index)=>{
        const values=(p.getAttribute('d')||'').match(/-?\d+(?:\.\d+)?/g)||[],nums=values.map(Number),b=p.getBBox();
        return {role:index===0?'echo':'line',start:nums.length>=2?{x:nums[0],y:nums[1]}:null,
          end:nums.length>=2?{x:nums.at(-2),y:nums.at(-1)}:null,opacity:p.getAttribute('opacity')||'1',
          computedOpacity:getComputedStyle(p).opacity,bounds:{x:+b.x.toFixed(2),y:+b.y.toFixed(2),width:+b.width.toFixed(2),height:+b.height.toFixed(2)}};
      });
      const line=paths.find(p=>p.role==='line');
      const shortPerchEndpoints=line?{start:line.start,end:line.end,width:+Math.abs(line.end.x-line.start.x).toFixed(2)}:null;
      perch={svgBounds:svgBox,svgOpacity:getComputedStyle(svg).opacity,paths,shortPerchEndpoints};
    }

    const edgeY=innerHeight-8,blocks=[...document.querySelectorAll('[data-ink],.perch-divider,.site-footer')].map(el=>{
      const r=el.getBoundingClientRect();if(r.bottom<0||r.top>innerHeight)return null;
      const style=getComputedStyle(el),edge=edgeY-r.top;
      return {selector:el.id?`#${el.id}`:el.className&&typeof el.className==='string'?`.${el.className.trim().split(/\s+/).join('.')}`:el.tagName.toLowerCase(),
        bounds:rect(el),elementEdgeY:+Math.max(0,Math.min(r.height,edge)).toFixed(2),
        edgeWithinElement:edge>0&&edge<r.height,maskActive:style.maskImage!=='none',maskState:classifyMask(style.maskImage),maskKind:style.maskImage.startsWith('linear-gradient')?'linear-gradient':style.maskImage==='none'?'none':style.maskImage.startsWith('url(')?'url':'other'};
    }).filter(Boolean);
    const doc=document.documentElement,body=document.body;
    return {viewport:{width:innerWidth,height:innerHeight},scrollY,
      portraitCaptionVsDecoration:portrait,birdCanvas:birdInfo,perch,
      navigationRow:{wordmarkBounds:wordmark,firstLinkBounds:firstLink,gapBounds:navigationGap,birdBands:birdInfo?.birdBands||[],shortPerchEndpoints:perch?.shortPerchEndpoints||null},
      contentMaskEdge:{viewportY:edgeY,documentY:scrollY+edgeY,visibleBlocks:blocks},
      overflow:{documentScrollWidth:doc.scrollWidth,bodyScrollWidth:body.scrollWidth,clientWidth:doc.clientWidth,horizontal:doc.scrollWidth>innerWidth}};
  });
}

(async()=>{
  await fs.mkdir(evidence,{recursive:true});
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const viewports=[['desktop',{width:1600,height:900}],['mobile-390',{width:390,height:844}],['mobile-320',{width:320,height:720}]];
  const report={url:baseURL.href,checkedAt:new Date().toISOString(),captures,viewports:{},errors};
  try {
    for(const [name,viewport] of viewports){
      const {context,page}=await openPage(browser,viewport);
      try {
        await pause(220);
        const viewportReport={geometryAtTop:await geometry(page)};
        await capture(page,name,'top');
        viewportReport.inkMilestones=await captureInkMilestones(page,name);
        await scroll(page,0,180);

        const span=await page.locator('#hero').evaluate(el=>Math.max(160,Math.min(430,el.clientHeight*.65)));
        await scroll(page,span*.76,460);
        await capture(page,name,'partial-convergence');

        await scroll(page,0,850);
        await page.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),Math.max(620,span+100));
        await pause(55);await capture(page,name,'fast-immediate');
        await pause(395);await capture(page,name,'fast-045s');
        await pause(1350);await capture(page,name,'fast-18s');
        await capture(page,name,'final-row');
        viewportReport.geometryAtFinalRow=await geometry(page);

        const printY=await page.locator('#genetics .section-heading .section-intro').evaluate(el=>{
          const range=document.createRange();range.selectNodeContents(el);
          const lines=[...range.getClientRects()].filter(r=>r.width>0);range.detach();
          const line=lines[Math.floor((lines.length-1)/2)]||el.getBoundingClientRect();
          const textLineCenter=line.top+scrollY+line.height/2;
          return Math.max(0,textLineCenter-(innerHeight-8));
        });
        await scroll(page,printY,180);
        await capture(page,name,'bottom-edge-print-active');
        viewportReport.geometryAtBottomEdgePrint=await geometry(page);

        await scroll(page,0,1800);
        await capture(page,name,'reverse-top');
        viewportReport.geometryAtReverseTop=await geometry(page);
        report.viewports[name]=viewportReport;
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
  report.errors=[...errors];
  const output=path.join(evidence,'visual-sweep.json');
  await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(`Saved ${captures.length} screenshots and ${path.relative(root,output)}; ${errors.length} page or console errors.`);
  if(errors.length)process.exitCode=1;
})().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
