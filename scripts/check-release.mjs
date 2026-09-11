import {chromium} from 'playwright';
import {readdir,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const base=process.env.SITE_URL||'http://127.0.0.1:4321';
async function files(dir){return (await Promise.all((await readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?files(join(dir,e.name)):join(dir,e.name)))).flat();}
const built=await files('dist');
const routes=built.filter(f=>f.endsWith('index.html')).map(f=>'/'+f.replaceAll('\\','/').replace(/^dist\//,'').replace(/index\.html$/,''));
assert.equal(routes.length,18);
for(const f of built)assert.ok((await stat(f)).size<25*1024*1024,`Cloudflare asset size: ${f}`);
const b=await chromium.launch({args:['--mute-audio']});
const p=await b.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await p.route(/youtube(-nocookie)?\.com/,r=>r.abort());
const errors=[],links=[],media=new Set();p.on('pageerror',e=>errors.push(e.message));
const ids=new Map();
for(const route of routes){
 const response=await p.goto(base+route,{waitUntil:'networkidle'});assert.equal(response.status(),200,route);
 assert.equal(await p.locator('main h1').count(),1,route+' single page title');
 assert.equal(await p.locator('html').getAttribute('lang'),'en');
 assert.ok(await p.locator('meta[name="description"]').getAttribute('content'));
 const idList=await p.evaluate(()=>[...document.querySelectorAll('[id]')].map(e=>e.id));assert.equal(new Set(idList).size,idList.length,route+' duplicate ids');ids.set(route,new Set(idList));
 const data=await p.evaluate(()=>({links:[...document.querySelectorAll('a')].map(a=>({href:a.getAttribute('href'),label:(a.textContent.trim()||a.getAttribute('aria-label')||a.querySelector('img')?.alt||'').trim(),target:a.target,rel:a.rel})),media:[...document.images].map(e=>({src:e.currentSrc||e.src,alt:e.getAttribute('alt')})),text:document.querySelector('main').textContent}));
 for(const l of data.links){assert.ok(l.href&&l.href!=='#',route+' empty link');assert.ok(l.label,route+' unnamed link '+l.href);if(l.target==='_blank')assert.match(l.rel,/noopener|noreferrer/);links.push({from:route,...l});}
 for(const m of data.media){assert.notEqual(m.alt,null,route+' missing image alt');media.add(m.src);}
 assert.doesNotMatch(data.text,/Definitely a swine|The pants aren't going to save themselves|Beta (?:launches|starts) (?:September|August)|TODO|Lorem ipsum/i);
 assert.equal(await p.locator('video,iframe').count(),0,'No unsolicited media playback');
 if(['/', '/nopas/'].includes(route)){assert.deepEqual(await p.locator('[data-video-id]').evaluateAll(es=>es.map(e=>e.dataset.videoId)),['kSqdf0DlD8s','-fuITOqPR1Q','CQkpU3rfi1E']);}
 await p.locator('img').evaluateAll(es=>{es.forEach(e=>e.loading='eager');return Promise.all(es.map(e=>e.decode()));});
 console.log('PAGE',route);
}
const external=new Set();let anchors=0;
const reached=new Set(['/']);
for(let previous=-1;previous!==reached.size;){previous=reached.size;for(const l of links){if(reached.has(l.from)){const u=new URL(l.href,base+l.from);if(u.origin===new URL(base).origin&&ids.has(u.pathname))reached.add(u.pathname);}}}
assert.deepEqual(routes.filter(r=>!reached.has(r)),[],'Every page is reachable from the homepage');
for(const l of links){
 const u=new URL(l.href,base+l.from);
 if(u.protocol==='mailto:'){assert.equal(u.pathname,'info@collapsedstargames.com');continue;}
 assert.ok(['http:','https:'].includes(u.protocol),'Unexpected link protocol');
 if(u.origin!==new URL(base).origin){external.add(u.href);continue;}
 if(ids.has(u.pathname)){if(u.hash){assert.ok(ids.get(u.pathname).has(decodeURIComponent(u.hash.slice(1))),`Broken anchor ${l.from} -> ${l.href}`);anchors++;}}
 else{const r=await p.request.get(u.href);assert.equal(r.status(),200,`Broken local asset link ${l.href}`);}
}
for(const src of media){const r=await p.request.get(src);assert.equal(r.status(),200,`Media ${src}`);}
for(const url of external){const r=await p.request.get(url,{timeout:20000});console.log('EXTERNAL',r.status(),url);assert.ok(r.ok(),`External link inaccessible: ${url} (${r.status()})`);}
assert.deepEqual(errors,[]);
console.log(`PASS ${routes.length} routes, ${links.length} links, ${anchors} anchors, ${media.size} media URLs, ${external.size} external links; accessible names, metadata, clip removal, approved videos, Cloudflare file sizes.`);
await b.close();
