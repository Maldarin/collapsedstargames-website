// Header "Games" disclosure: keyboard, outside click, focus leaving, no wrap at md widths,
// mobile menu list, both themes. Needs `npx astro dev --host 127.0.0.1 --port 4321`.
import {chromium} from 'playwright';import assert from 'node:assert/strict';import {mkdir} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {GAMES} from '../src/lib/games.mjs';
const BASE='http://127.0.0.1:4321';const out=process.env.NAV_SCREENSHOT_DIR||join(tmpdir(),'nopas-nav-review');await mkdir(out,{recursive:true});
const expected=[...GAMES.map(g=>g.href),'/nopas/'];const labels=[...GAMES.map(g=>g.navLabel),'All games'];
const b=await chromium.launch();const p=await b.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
const shot=name=>p.screenshot({path:join(out,name+'.png'),animations:'disabled',style:'astro-dev-toolbar{display:none!important}'});
const go=async(route='/')=>{assert.equal((await p.goto(BASE+route,{waitUntil:'networkidle'})).status(),200,route);await p.evaluate(()=>document.fonts.ready);};
// Load the page in a theme the way a visitor's saved choice does (pre-paint init script).
const themed=async theme=>{await p.evaluate(t=>localStorage.setItem('csg-theme',t),theme);await go('/');assert.equal(await p.evaluate(()=>document.documentElement.dataset.theme),theme);};
const toggle=p.locator('#games-menu-toggle');const menu=p.locator('#games-menu');
const expanded=async()=>(await toggle.getAttribute('aria-expanded'))==='true';
const closed=async msg=>{assert.equal(await expanded(),false,msg+': aria-expanded');assert.equal(await menu.isVisible(),false,msg+': menu hidden');};

// 1440: disclosure behaviour.
await p.setViewportSize({width:1440,height:900});await go('/');
assert.equal(await toggle.evaluate(e=>e.tagName),'BUTTON');assert.equal(await toggle.getAttribute('aria-controls'),'games-menu');
assert.equal(await toggle.getAttribute('type'),'button');await closed('initial');
assert.deepEqual(await p.locator('header nav > div > ul > li > a').evaluateAll(es=>es.map(e=>e.textContent.trim())),['Studio','Defenders','Collectors','Stats','Patch Notes','Lore'],'other nav links kept');
await toggle.focus();await p.keyboard.press('Enter');assert.equal(await expanded(),true,'Enter opens');assert.equal(await menu.isVisible(),true);
assert.deepEqual(await menu.locator('a').evaluateAll(es=>es.map(e=>e.getAttribute('href'))),expected,'menu hrefs');
assert.deepEqual(await menu.locator('a').evaluateAll(es=>es.map(e=>e.textContent.trim())),labels,'menu labels');
await p.keyboard.press('Escape');await closed('Escape');assert.equal(await p.evaluate(()=>document.activeElement?.id),'games-menu-toggle','focus back on toggle');
await p.keyboard.press('Space');assert.equal(await expanded(),true,'Space opens');await p.keyboard.press('Space');await closed('Space closes');
await p.keyboard.press('Enter');await p.keyboard.press('Tab');assert.deepEqual(await p.evaluate(()=>{const s=getComputedStyle(document.activeElement);return [s.outlineStyle,s.outlineOffset]}),['solid','-3px'],'focus ring inside the panel');await p.keyboard.press('Escape');await closed('Escape from a link');assert.equal(await p.evaluate(()=>document.activeElement?.id),'games-menu-toggle','focus back on toggle from link');
await p.keyboard.press('Enter');for(let i=0;i<expected.length;i++){await p.keyboard.press('Tab');assert.equal(await expanded(),true,'still open on item '+i);}
await p.keyboard.press('Tab');await closed('Tab past last item');
await toggle.click();assert.equal(await expanded(),true,'click opens');await p.locator('main').click({position:{x:4,y:4}});await closed('outside click');assert.equal(new URL(p.url()).pathname,'/');
await toggle.click();await menu.getByRole('link',{name:'Pants Rush',exact:true}).click();await p.waitForURL('**/nopas/pants-rush/');assert.equal(new URL(p.url()).pathname,'/nopas/pants-rush/');

// Header height and fit at md widths; screenshot every width open in both themes.
await go('/');const h1440=await p.locator('body > header').evaluate(e=>e.offsetHeight);
const contrast=(a,c)=>{const L=s=>{const m=s.match(/[\d.]+/g).map(Number);const [r,g,bl]=m.slice(0,3).map(v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4});return 0.2126*r+0.7152*g+0.0722*bl};const x=L(a),y=L(c);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
for(const theme of ['light','dark'])for(const width of [1440,1024,768]){
 await p.setViewportSize({width,height:900});await themed(theme);
 assert.equal(await p.locator('body > header').evaluate(e=>e.offsetHeight),h1440,`header height ${width} ${theme}`);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);
 const fit=await p.evaluate(()=>{const n=document.querySelector('header nav');const [logo,right]=[...n.children].map(c=>c.getBoundingClientRect());const ul=n.querySelector(':scope > div > ul');return {gap:right.left-logo.right,rightEdge:right.right,inner:n.getBoundingClientRect().right-parseFloat(getComputedStyle(n).paddingRight),ulOverflow:ul.scrollWidth>ul.clientWidth+1};});
 assert.ok(fit.gap>=8,`logo/nav gap ${width}: ${fit.gap}`);assert.ok(fit.rightEdge<=fit.inner+0.5,`nav fits inside header padding ${width}: ${fit.rightEdge} > ${fit.inner}`);assert.equal(fit.ulOverflow,false,`ul overflow ${width}`);
 await toggle.click();assert.equal(await menu.isVisible(),true,`visible ${width} ${theme}`);
 const box=await menu.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width,`menu inside viewport ${width}`);
 const c=await menu.evaluate(m=>{const a=m.querySelector('a');return {fg:getComputedStyle(a).color,bg:getComputedStyle(m).backgroundColor};});
 assert.notEqual(c.fg,c.bg,`${theme} fg!=bg`);const alpha=c.bg.match(/[\d.]+/g).map(Number)[3];assert.ok(alpha===undefined||alpha===1,`${theme} opaque menu bg ${c.bg}`);
 assert.ok(contrast(c.fg,c.bg)>=4.5,`${theme} ${width} contrast ${c.fg} on ${c.bg}`);
 await shot(`games-${width}-${theme}`);
}

// 390: mobile menu.
for(const theme of ['light','dark']){await p.setViewportSize({width:390,height:844});await themed(theme);
 assert.equal(await toggle.isVisible(),false,'desktop toggle hidden on mobile');
 await p.getByRole('button',{name:'Open menu',exact:true}).click();
 assert.deepEqual(await p.locator('#mobile-menu #mobile-games a').evaluateAll(es=>es.map(e=>e.getAttribute('href'))),expected,'mobile hrefs');
 assert.equal(await p.locator('#mobile-menu').getByText('Games',{exact:true}).isVisible(),true,'Games label');
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'overflow 390');await shot(`mobile-390-${theme}`);}
await p.locator('#mobile-games').getByRole('link',{name:'Steal a Minion',exact:true}).click();await p.waitForURL('**/nopas/steal-a-minion/');

assert.deepEqual(errors,[]);console.log('PASS: Games disclosure (Enter/Space/Escape/Tab-out/outside click/link), hrefs = GAMES + All games, no header wrap at 768/1024, both themes legible, mobile Games list, no page errors. '+out);await b.close();
