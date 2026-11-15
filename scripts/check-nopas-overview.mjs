import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PLAY_URL } from '../src/lib/links.mjs';
import { GAMES, SPOTLIGHT_ID, gridGames, EXTRAS, COMING_SOON } from '../src/lib/games.mjs';
const BASE = 'http://127.0.0.1:4321';
const output = process.env.NOPAS_SCREENSHOT_DIR || join(tmpdir(), 'nopas-overview-review');
await mkdir(output, {recursive:true});
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.goto(`${BASE}/nopas/`,{waitUntil:'networkidle'});
await page.evaluate(()=>document.fonts.ready);

// New headline, count-free title, description and copy.
assert.equal(await page.locator('main h1').count(),1,'exactly one main h1');
assert.match(await page.locator('main h1').innerText(),/One ridiculous universe\.\s*Every kind of chaos\./);
const countWords=/\b(three|five) (ways|modes|games)\b|all three|\b3 modes\b/i;
const description=await page.locator('meta[name="description"]').getAttribute('content');
assert.doesNotMatch(await page.title(),countWords,'title is count-free');
assert.doesNotMatch(description,countWords,'description is count-free');
assert.doesNotMatch(await page.locator('body').innerText(),countWords,'body copy is count-free');
for(const g of GAMES) assert.ok(description.includes(g.name),`description names ${g.name}`);
const lede=await page.locator('.overview-lede').innerText();
for(const g of GAMES) assert.ok(lede.includes(g.name),`lede names ${g.name}`);

// The latest-patch teaser still renders.
assert.equal(await page.locator('.patch-teaser').count(),1,'latest-patch teaser');
assert.equal((await page.request.get(BASE+await page.locator('.patch-teaser a').getAttribute('href'))).status(),200,'teaser link');

// Spotlight + grid, read from the games list (never a hard-coded count).
const spotlight=GAMES.find(g=>g.id===SPOTLIGHT_ID);
assert.equal(await page.locator('.game-spotlight').count(),1,'one spotlight');
assert.equal(await page.locator('.game-spotlight').getAttribute('data-game-id'),SPOTLIGHT_ID);
assert.equal(await page.locator('.game-spotlight .game-spotlight-play').getAttribute('href'),PLAY_URL);
assert.equal(await page.locator('.game-spotlight .game-spotlight-play').getAttribute('target'),'_blank');
assert.equal(await page.locator('.game-spotlight .game-spotlight-more').getAttribute('href'),spotlight.href);
assert.equal(await page.locator('#games').count(),1,'#games grid');
const readCards=()=>page.locator('#games .game-card').evaluateAll(es=>es.map(e=>({id:e.id,gameId:e.dataset.gameId,href:e.getAttribute('href'),width:e.clientWidth,height:e.clientHeight})));
const cards=await readCards();
assert.deepEqual(cards.map(c=>c.gameId),gridGames().map(g=>g.id),'cards follow the games list');
assert.deepEqual(cards.map(c=>c.href),gridGames().map(g=>g.href),'each card links to its game');
// section#match owns the match id on this page, so its card carries none.
assert.deepEqual(cards.map(c=>c.id),gridGames().map(g=>g.id==='match'?'':g.id),'card ids (match skipped)');
const extras=await page.locator('#games .game-extras').innerText();
for(const x of EXTRAS) assert.ok(extras.includes(x.name),`extras name ${x.name}`);
assert.ok(extras.includes(COMING_SOON.line),'coming-soon line verbatim');

// The Invasion section is unchanged; the old Bowling/Survivors detail sections are gone but their anchors land on the cards.
assert.equal(await page.locator('section#match').count(),1,'section#match');
assert.equal(await page.locator('section#match .overview-phase').count(),2,'two phase cards');
assert.doesNotMatch(await page.locator('section#match .overview-heading .overview-eyebrow').innerText(),/\b0\d \//,'no 01 / numbering');
assert.equal(await page.locator('section#match a[href="#games"]').count(),1,'Invasion links back to all games');
for(const id of ['match','bowling','survivors']) assert.equal(await page.locator(`[id="${id}"]`).count(),1,`#${id} resolves to one element`);
for(const id of ['bowling','survivors']) assert.equal(await page.locator(`#games .game-card[id="${id}"]`).count(),1,`#${id} is its card`);
assert.equal(await page.locator('.overview-extra-modes,.overview-mode,.overview-detail').count(),0,'old mode/detail blocks removed');
for(const id of ['gameplay','factions']) assert.equal(await page.locator(`section#${id}`).count(),1,`section#${id}`);
assert.equal(await page.locator('.overview-contact').count(),1,'contact band');

// The components look the same here as on the homepage (page heading rules must not leak in).
const componentStyles=p=>p.evaluate(()=>{
  const pick=(sel,props)=>{const e=document.querySelector(sel);const s=getComputedStyle(e);return Object.fromEntries(props.map(k=>[k,s[k]]));};
  const type=['fontSize','lineHeight','fontFamily','letterSpacing','marginTop','marginBottom'];
  return {
    cardName:pick('#games .game-card-name',type),cardTag:pick('#games .game-card-tag',type),cardBlurb:pick('#games .game-card-blurb',type),
    spotTitle:{...pick('.game-spotlight-title',type),height:document.querySelector('.game-spotlight-title').getBoundingClientRect().height},
    spotTag:pick('.game-spotlight-tag',type),spotPitch:pick('.game-spotlight-pitch',type),
    panel:document.querySelector('.game-spotlight-panel').getBoundingClientRect().height,
  };
});
const home=await browser.newPage({viewport:{width:1440,height:1000}});
for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:1000});await home.setViewportSize({width,height:1000});
  if(width===1440){await home.goto(BASE+'/',{waitUntil:'networkidle'});await home.evaluate(()=>document.fonts.ready);}
  await page.evaluate(()=>document.fonts.ready);
  assert.deepEqual(await componentStyles(page),await componentStyles(home),`spotlight/card styles match the homepage at ${width}`);
}
await home.close();

for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]) {
  await page.setViewportSize({width,height});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:join(output,`overview-${name}.png`),fullPage:true,style:'astro-dev-toolbar{display:none!important}'});
  await page.screenshot({path:join(output,`overview-${name}-top.png`),style:'astro-dev-toolbar{display:none!important}'});
  await page.locator('#games').screenshot({path:join(output,`overview-${name}-games.png`),style:'header,astro-dev-toolbar{visibility:hidden!important}'});
  const sized=await readCards();
  if(name==='desktop') assert.ok(sized.every(c=>c.width===sized[0].width && c.height===sized[0].height),'cards share one size');
  console.log(name,sized.map(({gameId,width,height})=>({gameId,width,height})));
}
for(const width of [320,390,768,1024,1440]) {
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);
  const clipped=await page.locator('main h1,main h2,main h3').evaluateAll(es=>es.filter(e=>e.clientWidth&&e.scrollWidth>e.clientWidth+1).map(e=>e.textContent.trim()));
  assert.deepEqual(clipped,[],`clipped headings at ${width}`);
}
await page.setViewportSize({width:1440,height:1000});
for(const id of ['games','match']) {
  await page.locator(`.nopas-overview a[href$="#${id}"]`).first().click();
  assert.equal(new URL(page.url()).hash,`#${id}`);
}
const missingAnchors=await page.locator('.nopas-overview a[href^="#"]').evaluateAll(links=>links.filter(a=>!document.getElementById(a.hash.slice(1))).map(a=>a.hash));
assert.deepEqual(missingAnchors,[]);
const routes=await page.locator('.nopas-overview a[href^="/"]').evaluateAll(links=>[...new Set(links.map(a=>a.getAttribute('href').split('#')[0]))]);
for(const route of routes) assert.equal((await page.request.get(`${BASE}${route}`)).status(),200,route);
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
console.log('PASS: headline, count-free copy, patch teaser, spotlight + grid from GAMES, #match/#bowling/#survivors, components match homepage, card equality, five widths, anchors, local links, video, mobile menu, theme, no page errors.');
console.log('Screenshots:',output);
await browser.close();
