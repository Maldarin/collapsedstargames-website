// Flat CSS text/background contrast. Image/gradient-backed text requires visual review.
export function inspectContrast() {
 const rgb=s=>{const a=s.match(/[\d.]+/g)?.map(Number);return a?.length>=3?[...a.slice(0,3),a[3]??1]:null;};
 const over=(a,b)=>{const o=a[3]+b[3]*(1-a[3]);return [...a.slice(0,3).map((v,i)=>(v*a[3]+b[i]*b[3]*(1-a[3]))/(o||1)),o];};
 const lum=c=>c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const fails=[];let checked=0,skipped=0;
 for(const el of document.querySelectorAll('main *,body > footer *,header *')){
  if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())||['SCRIPT','STYLE','OPTION'].includes(el.tagName))continue;
  if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
  const c=getComputedStyle(el);let bg=[0,0,0,0],unknown=false;
  for(let p=el;p&&bg[3]<.999;p=p.parentElement){const s=getComputedStyle(p);if(s.backgroundImage!=='none'){unknown=true;break;}const color=rgb(s.backgroundColor);if(!color){unknown=true;break;}bg=over(bg,color);}
  const fg=rgb(c.color);if(unknown||!fg||bg[3]<.999){skipped++;continue;}
  const f=lum(over(fg,bg)),b=lum(bg),ratio=(Math.max(f,b)+.05)/(Math.min(f,b)+.05);
  const large=parseFloat(c.fontSize)>=24 || (parseFloat(c.fontSize)>=18.66&&parseInt(c.fontWeight)>=700);
  checked++;if(ratio<(large?3:4.5)-.02)fails.push({text:el.textContent.trim().replace(/\s+/g,' ').slice(0,65),class:el.className,ratio:+ratio.toFixed(2),color:c.color,bg:bg.slice(0,3),size:c.fontSize});
 }
 return {checked,skipped,fails};
}
