import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {PLAY_URL} from '../src/lib/links.mjs';
import {GAMES} from '../src/lib/games.mjs';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const BASE='http://127.0.0.1:4321';const ROUTE='/nopas/steal-a-minion/';
const out=process.env.STEAL_SCREENSHOT_DIR || join(tmpdir(),'nopas-steal-review');
await mkdir(out,{recursive:true});
const self=GAMES.find(g=>g.id==='steal-a-minion');assert.ok(self,'steal-a-minion missing from GAMES');assert.equal(self.href,ROUTE);
const others=GAMES.filter(g=>g.id!==self.id);
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const res=await page.goto(BASE+ROUTE,{waitUntil:'networkidle'});assert.equal(res.status(),200,`${ROUTE} status`);await page.evaluate(()=>document.fonts.ready);

// One h1 naming the game; a meta description that says what and where.
const h1=page.locator('main h1');assert.equal(await h1.count(),1,'exactly one main h1');assert.match(await h1.textContent(),/steal a minion/i,'h1 names the game');
const description=await page.locator('meta[name="description"]').getAttribute('content');assert.match(description,/Steal a Minion/);assert.match(description,/open beta on Roblox/i);

// No overflow and no clipped headings at every width.
for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);const clipped=await page.locator('main h1,main h2,main h3').evaluateAll(es=>es.filter(e=>e.clientWidth&&e.scrollWidth>e.clientWidth+1).map(e=>e.textContent.trim()));assert.deepEqual(clipped,[],`clipped headings at ${width}`);}
await page.setViewportSize({width:1440,height:1000});

// Play goes to the Lobby Share Link, in a new tab; the page says how to get from the Lobby to the game.
const play=page.locator('.steal-hero .hero-play a');assert.equal(await play.count(),1,'hero Play button');assert.equal(await play.getAttribute('href'),PLAY_URL);assert.equal(await play.getAttribute('target'),'_blank');assert.match(await play.getAttribute('rel')??'',/noopener/);
const directions=page.locator('.steal-hero .steal-directions');assert.equal(await directions.count(),1,'hero has the how-to-get-there line');const directionsText=(await directions.textContent()).replace(/\s+/g,' ');assert.match(directionsText,/How to get there/i,'directions label');assert.match(directionsText,/Lobby → Steal a Minion door/i,'directions: Lobby → Steal a Minion door');assert.match(directionsText,/PLAY → Steal a Minion/i,'directions: PLAY → Steal a Minion');

// Required sections.
for(const id of ['how-it-works','features','gallery'])assert.equal(await page.locator(`section#${id}`).count(),1,`section #${id}`);

// Features are keyboard-operable disclosures.
const features=page.locator('.steal-feature');const featureCount=await features.count();assert.ok(featureCount>=5,`at least 5 features, got ${featureCount}`);
for(let i=0;i<featureCount;i++){const f=features.nth(i);assert.equal(await f.evaluate(e=>e.tagName),'DETAILS',`feature ${i} is <details>`);const before=await f.evaluate(e=>e.open);await f.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await f.evaluate(e=>e.open),!before,`feature ${i} toggles on Enter`);await page.keyboard.press('Enter');assert.equal(await f.evaluate(e=>e.open),before,`feature ${i} toggles back on Enter`);}

// Gallery: four figures, every image actually loads.
assert.equal(await page.locator('#gallery figure').count(),4,'four gallery figures');
for(const img of await page.locator('main img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(e=>e.complete&&e.naturalWidth?null:new Promise(r=>{e.addEventListener('load',r,{once:true});e.addEventListener('error',r,{once:true});}));}
assert.deepEqual(await page.locator('main img').evaluateAll(es=>es.filter(e=>!e.complete||!e.naturalWidth).map(e=>e.currentSrc||e.src)),[],'broken images');
const popupPromise=page.waitForEvent('popup');await page.locator('#gallery figure a').first().click();const popup=await popupPromise;await popup.waitForLoadState();assert.equal(await popup.locator('img').count(),1,'full-size image opens');await popup.close();

// In-page anchors resolve; local links work, except other game pages a later task builds (href must equal GAMES).
const invalid=await page.locator('main a[href^="#"]').evaluateAll(es=>es.filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));assert.deepEqual(invalid,[],'broken in-page anchors');
const otherHrefs=new Set(others.map(g=>g.href));
const links=await page.locator('main a[href^="/"]').evaluateAll(es=>[...new Set(es.map(a=>a.getAttribute('href')))]);
for(const href of links){const status=(await page.request.get(BASE+href)).status();if(status!==200)assert.ok(otherHrefs.has(href)&&!href.includes('#'),`${href} returned ${status}`);}

// The closing band links to every other game, straight from GAMES.
const band=page.locator('.steal-universe');assert.equal(await band.count(),1,'closing band');
for(const g of others)assert.ok(await band.locator(`a[href="${g.href}"]`).count()>=1,`closing band links to ${g.name} (${g.href})`);
assert.equal(await band.locator(`a[href="${self.href}"]`).count(),0,'closing band does not link to itself');

// Anti-goals: nothing switched off, no promises, no earn rates, no counts, no internal names. Closed <details>
// are not rendered, so read textContent plus alt text, title and description.
const allText=[await page.title(),description,await page.locator('main').textContent(),...await page.locator('main img').evaluateAll(es=>es.map(e=>e.alt))].join('\n');
assert.doesNotMatch(allText,/player battle|stakes|\/sec|per second|friday|weekly|\b42\b|16 trophies|nab a minion/i,'banned phrase');
assert.doesNotMatch(allText,/\bSAM\b|\bPFM\b|NMPA_/,'internal name');
assert.doesNotMatch(allText,/\bthree (ways|modes|games)\b|\ball three\b|\b3 modes\b|\bfive games\b/i,'game count in copy');
assert.equal(await page.locator('main a[href*="roblox.com/games/"]').count(),0,'no plain roblox.com/games links');

// Screenshots for review (desktop + phone, both themes).
for(const theme of ['light','dark'])for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){await page.setViewportSize({width,height});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(150);await page.screenshot({path:join(out,`steal-${name}-${theme}.png`),fullPage:true,style:'astro-dev-toolbar{display:none!important}'});await page.screenshot({path:join(out,`steal-${name}-${theme}-top.png`),style:'astro-dev-toolbar{display:none!important}'});}
await page.setViewportSize({width:1440,height:1000});

// Reduced motion, mobile menu.
await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.steal-page .overview-button').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');assert.equal(await page.locator('#gallery img').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open menu',exact:true}).click();assert.equal(await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded'),'true');await page.getByRole('button',{name:'Close menu',exact:true}).click();
assert.deepEqual(errors,[],'browser errors');

// Invasion has no page: its link is an anchor on /nopas/.
for(const g of others.filter(g=>g.href.includes('#'))){const [path,hash]=g.href.split('#');await page.goto(BASE+path,{waitUntil:'domcontentloaded'});assert.equal(await page.locator(`[id="${hash}"]`).count()>=1,true,`${g.href} anchor exists`);}

console.log(`PASS: one h1 + description, five widths (no overflow, no clipped headings), Play → PLAY_URL in a new tab, Lobby directions, ${featureCount} keyboard disclosures, four loaded gallery images + full-size popup, anchors, local links (other game pages by GAMES href), closing band → ${others.length} other games, banned phrases, reduced motion, mobile menu, no browser errors.`);console.log(out);await browser.close();
