import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {PLAY_URL} from '../src/lib/links.mjs';
import {GAMES} from '../src/lib/games.mjs';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const BASE='http://127.0.0.1:4321';const ROUTE='/nopas/pants-rush/';const STATS_LINK='/nopas/stats/#rush';
const out=process.env.RUSH_SCREENSHOT_DIR || join(tmpdir(),'nopas-rush-review');
await mkdir(out,{recursive:true});
const self=GAMES.find(g=>g.id==='pants-rush');assert.ok(self,'pants-rush missing from GAMES');assert.equal(self.href,ROUTE);
const others=GAMES.filter(g=>g.id!==self.id);
// Phase and boss names, in campaign order (the game's PantsRushConfig.luau, title-cased).
const PHASES=[['High School','The Hall Monitor'],['Garage Alley','The Seam Ripper'],['Playground Plaza','The Recess Menace'],['Gas & Go','Dr. Peepers'],['Water Tower','Needle Eye'],['Pants Factory','Golden Pants']];
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const res=await page.goto(BASE+ROUTE,{waitUntil:'networkidle'});assert.equal(res.status(),200,`${ROUTE} status`);await page.evaluate(()=>document.fonts.ready);

// One h1 naming the game; a meta description that says what and where.
const h1=page.locator('main h1');assert.equal(await h1.count(),1,'exactly one main h1');assert.match(await h1.textContent(),/pants rush/i,'h1 names the game');
const description=await page.locator('meta[name="description"]').getAttribute('content');assert.match(description,/Pants Rush/);assert.match(description,/open beta on Roblox/i);

// No overflow and no clipped headings at every width.
for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);const clipped=await page.locator('main h1,main h2,main h3').evaluateAll(es=>es.filter(e=>e.clientWidth&&e.scrollWidth>e.clientWidth+1).map(e=>e.textContent.trim()));assert.deepEqual(clipped,[],`clipped headings at ${width}`);}
await page.setViewportSize({width:1440,height:1000});

// Play goes to the Lobby Share Link, in a new tab; the hero says how to get from the Lobby to the game.
const play=page.locator('.rush-hero .hero-play a');assert.equal(await play.count(),1,'hero Play button');assert.equal(await play.getAttribute('href'),PLAY_URL);assert.equal(await play.getAttribute('target'),'_blank');assert.match(await play.getAttribute('rel')??'',/noopener/);
const directions=page.locator('.rush-hero .rush-directions');assert.equal(await directions.count(),1,'hero has the how-to-get-there line');const directionsText=(await directions.textContent()).replace(/\s+/g,' ');assert.match(directionsText,/How to get there/i,'directions label');assert.match(directionsText,/PLAY.*Invasion.*Pants Rush/,'directions: PLAY → Invasion → Pants Rush');
const status=(await page.locator('.rush-hero .overview-status').textContent()).replace(/\s+/g,' ');assert.match(status,/Open Beta · Live now on Roblox/,'hero status line');

// Required sections.
for(const id of ['how-it-works','phases','features','gallery'])assert.equal(await page.locator(`section#${id}`).count(),1,`section #${id}`);

// The six phases, in order, each naming its place and its boss.
const phases=page.locator('#phases .rush-phase');assert.equal(await phases.count(),PHASES.length,'six .rush-phase items');
const phaseTexts=(await phases.allTextContents()).map(t=>t.replace(/\s+/g,' '));
PHASES.forEach(([place,boss],i)=>assert.match(phaseTexts[i],new RegExp(`${esc(place)}.*${esc(boss)}`),`phase ${i+1}: ${place} / ${boss}`));

// Features are keyboard-operable disclosures.
const features=page.locator('.rush-feature');const featureCount=await features.count();assert.ok(featureCount>=4,`at least 4 features, got ${featureCount}`);
for(let i=0;i<featureCount;i++){const f=features.nth(i);assert.equal(await f.evaluate(e=>e.tagName),'DETAILS',`feature ${i} is <details>`);const before=await f.evaluate(e=>e.open);await f.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await f.evaluate(e=>e.open),!before,`feature ${i} toggles on Enter`);await page.keyboard.press('Enter');assert.equal(await f.evaluate(e=>e.open),before,`feature ${i} toggles back on Enter`);}

// The facts the spec asks for, each in its own place.
const featuresText=(await page.locator('#features').textContent()).replace(/\s+/g,' ');
assert.match(featuresText,/main NOPAS account/,'rewards go to the main NOPAS account');
assert.match(featuresText,/No purchases needed/,'no purchases needed');

// The stats link goes to the Pants Rush board, and that anchor exists.
const statsLink=page.locator(`main a[href="${STATS_LINK}"]`);assert.ok(await statsLink.count()>=1,`a link to ${STATS_LINK}`);

// Gallery: at least four figures, every image actually loads.
const figureCount=await page.locator('#gallery figure').count();assert.ok(figureCount>=4,`at least four gallery figures, got ${figureCount}`);
for(const img of await page.locator('main img').all()){await img.scrollIntoViewIfNeeded();await img.evaluate(e=>e.complete&&e.naturalWidth?null:new Promise(r=>{e.addEventListener('load',r,{once:true});e.addEventListener('error',r,{once:true});}));}
assert.deepEqual(await page.locator('main img').evaluateAll(es=>es.filter(e=>!e.complete||!e.naturalWidth).map(e=>e.currentSrc||e.src)),[],'broken images');
const popupPromise=page.waitForEvent('popup');await page.locator('#gallery figure a').first().click();const popup=await popupPromise;await popup.waitForLoadState();assert.equal(await popup.locator('img').count(),1,'full-size image opens');await popup.close();

// "↗" marks a link that opens a new tab, and nothing else.
const arrows=await page.locator('main').evaluate(m=>{const bad=[];const walk=document.createTreeWalker(m,NodeFilter.SHOW_TEXT);while(walk.nextNode()){const n=walk.currentNode;if(!n.textContent.includes('↗'))continue;const a=n.parentElement.closest('a');if(!a||a.target!=='_blank')bad.push(n.parentElement.textContent.trim());}return bad;});
assert.deepEqual(arrows,[],'↗ only on new-tab links');

// In-page anchors resolve; every local link returns 200.
const invalid=await page.locator('main a[href^="#"]').evaluateAll(es=>es.filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));assert.deepEqual(invalid,[],'broken in-page anchors');
const links=await page.locator('main a[href^="/"]').evaluateAll(es=>[...new Set(es.map(a=>a.getAttribute('href')))]);
for(const href of links){const s=(await page.request.get(BASE+href)).status();assert.equal(s,200,`${href} returned ${s}`);}

// The closing band links to every other game, straight from GAMES.
const band=page.locator('.rush-universe');assert.equal(await band.count(),1,'closing band');
for(const g of others)assert.ok(await band.locator(`a[href="${g.href}"]`).count()>=1,`closing band links to ${g.name} (${g.href})`);
assert.equal(await band.locator(`a[href="${self.href}"]`).count(),0,'closing band does not link to itself');

// Anti-goals: nothing switched off, no promises, no earn rates or caps, no counts, no internal names. Closed <details>
// are not rendered, so read textContent plus alt text, title attributes, page title and description.
const allText=[await page.title(),description,await page.locator('main').textContent(),...await page.locator('main [alt], main [title], main [aria-label]').evaluateAll(es=>es.flatMap(e=>[e.getAttribute('alt'),e.getAttribute('title'),e.getAttribute('aria-label')].filter(Boolean)))].join('\n');
assert.doesNotMatch(allText,/badge|shrinkinator|ballooninator|next map|daily|\bcaps?\b|NMPA/i,'banned phrase');
assert.doesNotMatch(allText,/\/hr\b|per hour|\/sec|per second|coming soon/i,'earn rate or promise');
assert.doesNotMatch(allText,/\bSAM\b|\bPFM\b|NMPA_/,'internal name');
assert.doesNotMatch(allText,/\bthree (ways|modes|games)\b|\ball three\b|\b3 modes\b|\bfive games\b/i,'game count in copy');
assert.equal(await page.locator('main a[href*="roblox.com/games/"]').count(),0,'no plain roblox.com/games links');

// Screenshots for review (desktop + phone, both themes).
for(const theme of ['light','dark'])for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){await page.setViewportSize({width,height});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(150);await page.screenshot({path:join(out,`rush-${name}-${theme}.png`),fullPage:true,style:'astro-dev-toolbar{display:none!important}'});await page.screenshot({path:join(out,`rush-${name}-${theme}-top.png`),style:'astro-dev-toolbar{display:none!important}'});}
await page.setViewportSize({width:1440,height:1000});

// Reduced motion, mobile menu.
await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.rush-page .overview-button').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');assert.equal(await page.locator('#gallery img').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Open menu',exact:true}).click();assert.equal(await page.locator('#mobile-menu-toggle').getAttribute('aria-expanded'),'true');await page.getByRole('button',{name:'Close menu',exact:true}).click();
assert.deepEqual(errors,[],'browser errors');

// The stats page has the #rush anchor the link points at, on the Pants Rush section.
await page.goto(BASE+'/nopas/stats/',{waitUntil:'domcontentloaded'});const rush=page.locator('#rush');assert.equal(await rush.count(),1,'/nopas/stats/ has #rush');assert.equal(await rush.evaluate(e=>e.tagName),'SECTION','#rush is the Pants Rush section');assert.equal(await rush.locator('#rush-heading').count(),1,'#rush holds the Pants Rush heading');

// Invasion has no page: its link is an anchor on /nopas/.
for(const g of others.filter(g=>g.href.includes('#'))){const [path,hash]=g.href.split('#');await page.goto(BASE+path,{waitUntil:'domcontentloaded'});assert.equal(await page.locator(`[id="${hash}"]`).count()>=1,true,`${g.href} anchor exists`);}

console.log(`PASS: one h1 + description, five widths (no overflow, no clipped headings), Play → PLAY_URL in a new tab, PLAY → Invasion → Pants Rush directions, six phases in order, ${featureCount} keyboard disclosures, rewards + no purchases, ${figureCount} loaded gallery images + full-size popup, ↗ only on new-tab links, anchors, local links all 200, stats link → #rush (exists), closing band → ${others.length} other games, banned phrases, reduced motion, mobile menu, no browser errors.`);console.log(out);await browser.close();
