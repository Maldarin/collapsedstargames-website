import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {inspectContrast} from './theme-contrast.mjs';
const b=await chromium.launch({args:['--mute-audio']});const p=await b.newPage({viewport:{width:1440,height:1000}});
const routes=['/','/nopas/','/nopas/bowling/','/nopas/survivors/','/nopas/defenders/',...['security-officer','tailor-engineer','dr-peepers','athlete','needle-eye','citizen'].map(n=>`/nopas/defenders/${n}/`),'/nopas/collectors/',...['overlord','commander','minions'].map(n=>`/nopas/collectors/${n}/`),'/lore/','/nopas/stats/','/shop/'];
const out=process.env.THEME_SCREENSHOT_DIR||join(tmpdir(),'nopas-theme-review');await mkdir(out,{recursive:true});
const report=[];
for(const route of routes){await p.goto('http://127.0.0.1:4321'+route,{waitUntil:'networkidle'});await p.evaluate(()=>{document.querySelectorAll('details').forEach(e=>e.open=true)});
for(const theme of ['light','dark']){await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);await p.waitForTimeout(250);const r=await p.evaluate(inspectContrast);report.push({route,theme,...r});if(r.fails.length)console.log(route+' '+theme+' '+JSON.stringify(r.fails.slice(0,12)));}}
await writeFile(join(out,'contrast.json'),JSON.stringify(report,null,2));
console.log('Checked',report.reduce((n,r)=>n+r.checked,0),'failures',report.reduce((n,r)=>n+r.fails.length,0));await b.close();
if(report.some(r=>r.fails.length))process.exitCode=1;
