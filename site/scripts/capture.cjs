// Capture the current production build. Optional arguments are player seconds.
const path=require('node:path'),os=require('node:os'),fs=require('node:fs/promises');
const {chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1600,height:1050},deviceScaleFactor:1});
    const url=new URL(process.env.PERCH_URL||'http://127.0.0.1:8903/');url.searchParams.set('inspect','');
    await page.goto(url.href,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.sharedPerch);
    await fs.mkdir('evidence',{recursive:true});
    const requested=process.argv.slice(2).map(Number);
    for(const t of requested.length?requested:[2,20,30.6,39.4,44.8]){
      if(!Number.isFinite(t)||t<0||t>45)throw Error('Use player times from 0 to 45 seconds.');
      await page.evaluate(t=>window.sharedPerch.seek(t),t);
      await page.screenshot({path:`evidence/frame-${t}.png`});
    }
    await page.evaluate(()=>window.sharedPerch.seek(20));
    const samples=[];
    for(const y of [0,40,90,170,430]){
      await page.evaluate(top=>window.scrollTo({top,behavior:'instant'}),y);
      await page.waitForTimeout(120);
      await page.screenshot({path:`evidence/website-morph-${y}.png`});
      samples.push(await page.evaluate(()=>{const d=window.sharedPerch.diagnostics();return {scrollY,time:d.time,morph:d.morphProgress,calls:d.calls,textures:d.textures};}));
    }
    await fs.writeFile('evidence/morph-captures.json',JSON.stringify(samples,null,2));
    console.log('Animation frames and five morph positions saved in evidence.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
