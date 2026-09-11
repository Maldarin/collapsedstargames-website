import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const out=process.env.SURVIVORS_SCREENSHOT_DIR || join(tmpdir(),'nopas-survivors-review');
await mkdir(out,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4321/nopas/survivors/',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);const clipped=await page.locator('.survivors-page h1,.survivors-page h2,.survivors-page h3').evaluateAll(es=>es.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent));assert.deepEqual(clipped,[],`headings at ${width}`);}
for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,`survivors-${name}.png`),fullPage:true,style:'astro-dev-toolbar{display:none!important}'});await page.screenshot({path:join(out,`survivors-${name}-top.png`),style:'astro-dev-toolbar{display:none!important}'});}
await page.setViewportSize({width:1440,height:1000});await page.locator('#events').screenshot({path:join(out,'survivors-events.png'),style:'header,astro-dev-toolbar{visibility:hidden!important}'});
assert.equal(await page.locator('.survivors-event-grid article').count(),3);assert.equal(await page.locator('.survivors-roles dt').count(),5);
assert.doesNotMatch(await page.locator('.survivors-page').innerText(),/five waves|final.wave|wave five|waves two and four/i);
const invalid=await page.locator('.survivors-page a[href^="#"]').evaluateAll(es=>es.filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));assert.deepEqual(invalid,[]);
await page.locator('.survivors-actions a').first().click();assert.equal(new URL(page.url()).hash,'#the-run');
const links=await page.locator('.survivors-page a[href^="/"]').evaluateAll(es=>[...new Set(es.map(a=>a.getAttribute('href')))]);for(const href of links)assert.equal((await page.request.get('http://127.0.0.1:4321'+href)).status(),200,href);
assert.deepEqual(await page.locator('.survivors-page img').evaluateAll(es=>es.filter(e=>!e.complete||!e.naturalWidth).map(e=>e.src)),[]);
await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.overview-button').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open menu',exact:true}).click();assert.equal(await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded'),'true');await page.getByRole('button',{name:'Close menu',exact:true}).click();
for(const route of ['/','/nopas/']){await page.goto('http://127.0.0.1:4321'+route);await page.locator('a[href="/nopas/survivors/"]').click();assert.equal(new URL(page.url()).pathname,'/nopas/survivors/');}
assert.deepEqual(errors,[]);console.log('PASS: five responsive widths, headings, three beta events, five class roles, no test-wave limits, loaded images, anchors, local links, discovery from both pages, mobile menu, reduced motion, no browser errors.');console.log(out);await browser.close();
