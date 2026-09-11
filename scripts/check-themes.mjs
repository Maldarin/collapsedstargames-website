import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.THEME_SCREENSHOT_DIR || join(tmpdir(),'nopas-theme-review');
await mkdir(out,{recursive:true});
const routes=['/','/nopas/','/nopas/bowling/','/nopas/survivors/','/nopas/defenders/',...['security-officer','tailor-engineer','dr-peepers','athlete','needle-eye','citizen'].map(n=>`/nopas/defenders/${n}/`),'/nopas/collectors/',...['overlord','commander','minions'].map(n=>`/nopas/collectors/${n}/`),'/lore/','/nopas/stats/','/shop/'];
const browser=await chromium.launch({args:['--mute-audio']});
const page=await browser.newPage({colorScheme:'light'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/youtube.com/**',r=>r.abort());
await page.route('**/youtube-nocookie.com/**',r=>r.abort());
const results=[];
for(const route of routes){
 const name=route==='/'?'home':route.split('/').filter(Boolean).join('-');
 await page.goto((process.env.SITE_URL||'http://127.0.0.1:4321')+route,{waitUntil:'networkidle'});
 await page.evaluate(()=>document.fonts.ready);
 const backgrounds=[];
 let accents;
 for(const theme of ['light','dark']){
  if(await page.locator('html').getAttribute('data-theme')!==theme) await page.locator('#theme-toggle').click();
  backgrounds.push(await page.locator('main > div').first().evaluate(e=>getComputedStyle(e).backgroundColor));
  const currentAccents=await page.locator('.mode-card,.overview-mode,.character-abilities .surface,.character-quotes blockquote,.stats-panels .surface').evaluateAll(es=>es.map(e=>({background:e.closest('.stats-panels')?null:getComputedStyle(e).backgroundColor,top:e.closest('.stats-panels')?getComputedStyle(e).borderTopColor:null})));
  if(theme==='light')accents=currentAccents;else assert.deepEqual(currentAccents,accents,`${route} vivid accents preserved`);
  for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
   await page.setViewportSize({width,height});
   await page.locator('main img').evaluateAll(es=>{es.forEach(e=>e.loading='eager');return Promise.all(es.map(e=>e.decode().catch(()=>{})));});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} ${theme} ${size} overflow`);
   assert.deepEqual(await page.locator('main h1,main h2,main h3').evaluateAll(es=>es.filter(e=>e.clientWidth&&e.scrollWidth>e.clientWidth+1).map(e=>e.textContent.trim())),[],`${route} ${theme} ${size} heading clipping`);
   assert.equal(await page.locator('iframe,video').count(),0,'No autoplay media');
   await page.screenshot({path:`${out}/${name}-${theme}-${size}.png`,fullPage:true,style:'astro-dev-toolbar{display:none!important}'});
  }
  await page.setViewportSize({width:320,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} ${theme} 320px overflow`);
 }
 results.push({route,backgrounds});
 assert.notEqual(backgrounds[0],backgrounds[1],`${route}: content background must respond to theme`);
 console.log('PASS both themes desktop/mobile: '+route);
}
assert.deepEqual(errors,[]);
await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));
await browser.close();
