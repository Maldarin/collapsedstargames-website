import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {inspectContrast} from './theme-contrast.mjs';
const out=process.env.THEME_SCREENSHOT_DIR||join(tmpdir(),'nopas-theme-review');
await mkdir(out,{recursive:true});
const b=await chromium.launch({args:['--mute-audio']});
const p=await b.newPage({colorScheme:'light',reducedMotion:'reduce'});
const base=process.env.SITE_URL||'http://127.0.0.1:4321';
await p.goto(base);
assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
await p.locator('#theme-toggle').focus();await p.keyboard.press('Enter');
assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
assert.equal(await p.locator('#theme-toggle').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
await p.reload();assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
await p.goto(base+'/lore/');assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
await p.locator('#theme-toggle').click();await p.reload();assert.equal(await p.locator('html').getAttribute('data-theme'),'light');
await p.evaluate(()=>localStorage.removeItem('csg-theme'));await p.emulateMedia({colorScheme:'dark'});await p.reload();assert.equal(await p.locator('html').getAttribute('data-theme'),'dark');
await p.setViewportSize({width:390,height:844});await p.locator('#mobile-menu-toggle').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#mobile-menu-toggle').getAttribute('aria-expanded'),'true');await p.keyboard.press('Enter');
const sections=[['home-modes','/','.mode-grid'],['overview-match','/nopas/','.overview-phase-grid'],['bowling-features','/nopas/bowling/','.bowling-feature-grid'],['survivors-squad','/nopas/survivors/','.survivors-squad'],['defenders-roster','/nopas/defenders/','.character-roster'],['commander-reading','/nopas/collectors/commander/','.character-section'],['lore-document','/lore/','#origin'],['lore-glossary','/lore/','#glossary'],['shop-sign','/shop/','.shop-sign']];
for(const [name,route,selector] of sections){
 await p.goto(base+route,{waitUntil:'networkidle'});await p.evaluate(()=>{document.querySelectorAll('details').forEach(e=>e.open=true)});
 const art=await p.locator('main img').evaluateAll(es=>es.map(e=>({src:e.getAttribute('src'),filter:getComputedStyle(e).filter,opacity:getComputedStyle(e).opacity})));
 for(const theme of ['light','dark']){
  await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.deepEqual(await p.locator('main img').evaluateAll(es=>es.map(e=>({src:e.getAttribute('src'),filter:getComputedStyle(e).filter,opacity:getComputedStyle(e).opacity}))),art,'art unchanged by theme');
  for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
   await p.setViewportSize({width,height});
   await p.locator(selector).first().evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+window.scrollY-90));
   await p.screenshot({path:`${out}/${name}-${theme}-${size}-detail.png`,style:'astro-dev-toolbar{display:none!important}'});
   assert.deepEqual((await p.evaluate(inspectContrast)).fails,[],`${name} ${theme} ${size} contrast`);
  }
 }
}
// Test fixtures are intercepted in the browser only; no production data changes.
let mode='populated',releases=[];const release=()=>releases.splice(0).forEach(r=>r());
const rushFixture={robloxUserId:1,username:'Theme_Test_Player',stats:{runs:5,attempts:12,clears:9,medals:{Gold:3,Silver:2,Bronze:1},pants:160,defenderKOs:230,bossKOs:9,deaths:4,highestStage:4,fullClears:1,playtimeSeconds:2710,lastPlayed:'2026-11-08',bestTimes:[{stageIndex:1,stageId:'HighSchool',difficulty:'Normal',party:'solo',seconds:89.25,medal:'Gold'},{stageIndex:2,stageId:'GarageAlley',difficulty:'Hard',party:'coop',seconds:131.5,medal:'Silver'},{stageIndex:3,stageId:'Playground',difficulty:'Easy',party:'solo',seconds:150,medal:'Bronze'}]}};
const rushRows=[{robloxUserId:1,username:'Theme_Test_Player',seconds:89.25,medal:'Gold'},{robloxUserId:2,username:null,seconds:95.5,medal:'Silver'},{robloxUserId:3,username:'Third',seconds:101,medal:'Bronze'}];
const fixture={robloxUserId:1,username:'Theme_Test_Player',stats:{matchesPlayed:37,wins:20,losses:17,kills:148,deaths:96,npcKills:812,objectivesCapped:22,pantsStolen:4,pantsLost:61,xpEarned:29600,coinsEarned:2450,playtimeSeconds:26640,mainClass:{classId:'Overlord',matches:14,wins:8},xpBySource:[{source:'_challenge_weekly_test',xp:5120},{source:'npcDefeated',xp:3097}],lastPlayed:'2026-09-11'}};
await p.route('**/nmpa/public/**',async r=>{
 const url=r.request().url();
 if(mode==='loading')await new Promise(resolve=>releases.push(resolve));
 if(mode==='offline')return r.abort();
 if(mode==='missing'&&url.includes('/player'))return r.fulfill({status:404,json:{}});
 if(url.includes('/rush/summary'))return r.fulfill({json:{totals:{runs:41,attempts:97,clears:63,players:30},stages:[{stageIndex:1,stageId:'HighSchool',attempts:40,clears:31}]}});
 if(url.includes('/rush/player'))return r.fulfill({json:rushFixture});
 if(url.includes('/rush/leaderboard'))return r.fulfill({json:{rows:mode==='empty'?[]:rushRows}});
 return r.fulfill({json:url.includes('/player')?fixture:{rows:mode==='empty'?[]:[{robloxUserId:1,username:'Theme_Test_Player',value:29600},{robloxUserId:2,username:null,value:12000}]}});
});
const rushTabs=p.locator('#rush-stage-tabs').getByRole('tab'),invasionTabs=p.locator('#invasion-tabs').getByRole('tab');
for(const theme of ['light','dark'])for(const [size,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
 await p.setViewportSize({width,height});mode='populated';await p.goto(base+'/nopas/stats/',{waitUntil:'networkidle'});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
 await p.locator('#lookup-name').fill('Theme_Test_Player');await p.locator('#lookup-form button').click();await p.waitForFunction(()=>document.querySelector('#lookup-result h3'));
 assert.match(await p.locator('#lookup-result').innerText(),/1.54/);assert.match(await p.locator('#lookup-result').innerText(),/9 \/ 12/);assert.match(await p.locator('#board').innerText(),/Roblox 2/);assert.match(await p.locator('#rush-board').innerText(),/1:29\.25/);assert.equal(await p.locator('#rush-summary').isVisible(),true);
 for(const state of ['populated','empty','missing','offline','loading']){
  mode=state;
  if(state==='missing'){await p.locator('#lookup-form button').click();await p.waitForFunction(()=>document.querySelector('#lookup-result').textContent.includes('No player found'));}
  else if(state!=='populated'){await invasionTabs.nth(1).click();await rushTabs.nth(1).click();await p.waitForFunction(s=>{const t=document.querySelector('#board').textContent,u=document.querySelector('#rush-board').textContent;return s==='empty'?t.includes("Nobody's")&&u.includes('No clears'):s==='offline'?t.includes("taking a breather")&&u.includes("taking a breather"):t==='Loading…'&&u==='Loading…';},state);}
  assert.deepEqual((await p.evaluate(inspectContrast)).fails,[],`stats ${theme} ${size} ${state} contrast`);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await p.locator('.stats-panels').evaluate(e=>scrollTo(0,e.offsetTop-90));
  await p.screenshot({path:`${out}/stats-fixture-${state}-${theme}-${size}.png`,style:'astro-dev-toolbar{display:none!important}'});
  if(state==='loading'){mode='empty';release();await p.waitForFunction(()=>document.querySelector('#board').textContent.includes("Nobody's")&&document.querySelector('#rush-board').textContent.includes('No clears'));}
 }
 for(const tabs of [rushTabs,invasionTabs]){await tabs.first().focus();await p.keyboard.press('ArrowRight');assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');
 assert.equal(await tabs.nth(1).evaluate(e=>getComputedStyle(e).outlineStyle),'solid');}
}
await b.close();console.log('PASS: system preference; keyboard toggle/menu; reload/navigation persistence; unchanged artwork; open documents; representative mobile/desktop contrast; Stats (Pants Rush + Invasion) populated, empty,404,offline,loading and keyboard tabs in both themes.');
