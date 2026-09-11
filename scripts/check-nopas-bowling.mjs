import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const out=process.env.BOWLING_SCREENSHOT_DIR || join(tmpdir(),'nopas-bowling-review');
await mkdir(out,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4321/nopas/bowling/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,`bowling-${name}.png`),fullPage:true,style:'astro-dev-toolbar{display:none!important}'});await page.screenshot({path:join(out,`bowling-${name}-top.png`),style:'astro-dev-toolbar{display:none!important}'});}
for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);}
assert.equal(await page.locator('.bowling-feature').count(),6);assert.equal(await page.locator('.bowling-gallery-grid figure').count(),6);
const second=page.locator('.bowling-feature').nth(1);await second.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await second.evaluate(e=>e.open),true);await page.keyboard.press('Enter');assert.equal(await second.evaluate(e=>e.open),false);
await page.locator('.bowling-actions a[href="#basics"]').click();assert.equal(new URL(page.url()).hash,'#basics');
const invalid=await page.locator('.bowling-page a[href^="#"]').evaluateAll(es=>es.filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));assert.deepEqual(invalid,[]);
const links=await page.locator('.bowling-page a[href^="/"]').evaluateAll(es=>[...new Set(es.map(a=>a.getAttribute('href')))]);for(const href of links)assert.equal((await page.request.get('http://127.0.0.1:4321'+href)).status(),200,href);
const popupPromise=page.waitForEvent('popup');await page.locator('.bowling-gallery-grid a').first().click();const popup=await popupPromise;await popup.waitForLoadState();assert.equal(await popup.locator('img').count(),1);await popup.close();
await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.bowling-gallery-grid img').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open menu',exact:true}).click();assert.equal(await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded'),'true');await page.getByRole('button',{name:'Close menu',exact:true}).click();
assert.deepEqual(errors,[]);console.log('PASS: five widths, six expandable features (keyboard), six gallery images, full-size image popup, all local links/anchors, reduced motion, mobile menu, no browser errors.');console.log(out);await browser.close();
