import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const output = process.env.NOPAS_SCREENSHOT_DIR || join(tmpdir(), 'nopas-overview-review');
await mkdir(output, {recursive:true});
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.goto('http://127.0.0.1:4321/nopas/',{waitUntil:'networkidle'});
await page.evaluate(()=>document.fonts.ready);
for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
  await page.setViewportSize({width,height});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:join(output,`overview-${name}.png`),fullPage:true,style:'astro-dev-toolbar{display:none!important}'});
  await page.screenshot({path:join(output,`overview-${name}-top.png`),style:'astro-dev-toolbar{display:none!important}'});
  await page.locator('.overview-mode-grid').screenshot({path:join(output,`overview-${name}-modes.png`),style:'header,astro-dev-toolbar{visibility:hidden!important}'});
  const cards = await page.locator('.overview-mode').evaluateAll(elements=>elements.map(e=>({width:e.clientWidth,height:e.clientHeight})));
  assert.equal(cards.length,3);
  if(name==='desktop') assert.ok(cards.every(c=>c.width===cards[0].width && c.height===cards[0].height));
  console.log(name,cards);
}
for(const width of [320,390,768,1024,1440]) {
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
}
for(const id of ['match','bowling','survivors']) {
  await page.locator(`.overview-mode a[href="#${id}"]`).click();
  assert.equal(new URL(page.url()).hash,`#${id}`);
  assert.equal(await page.locator(`section#${id}`).count(),1);
}
assert.equal(await page.locator('.overview-mode .overview-beta').count(),3);
assert.equal(await page.locator('.overview-phase').count(),3);
const missingAnchors=await page.locator('.nopas-overview a[href^="#"]').evaluateAll(links=>links.filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));
assert.deepEqual(missingAnchors,[]);
const routes=await page.locator('.nopas-overview a[href^="/"]').evaluateAll(links=>[...new Set(links.map(a=>a.getAttribute('href')))]);
for(const route of routes) assert.equal((await page.request.get(`http://127.0.0.1:4321${route}`)).status(),200,route);
await page.route('**/www.youtube-nocookie.com/**',r=>r.fulfill({body:'verified embed'}));
await page.locator('.video-facade').first().click();
assert.match(await page.locator('iframe').getAttribute('src'),/youtube-nocookie.com\/embed\/kSqdf0DlD8s/);
await page.setViewportSize({width:390,height:844});
await page.getByRole('button',{name:'Open menu',exact:true}).click();
assert.equal(await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded'),'true');
await page.getByRole('button',{name:'Close menu',exact:true}).click();
await page.locator('#theme-toggle').click();
assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
assert.deepEqual(errors,[]);
console.log('PASS: mode equality, five widths, section anchors, all local links, phases, video, mobile menu, theme, no page errors.');
console.log('Screenshots:',output);
await browser.close();
