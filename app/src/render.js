/* src/render.js — the render loop, the count-up and bar animations, the day picker
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
function render(){
  try{rolloverDay(P());}catch(e){}
  const fn={home:Home,skills:Skills,nutrition:Nutrition,stretches:Stretches,notif:Notif,settings:Settings}[TAB];
  $('screen').innerHTML=fn();
  try{$('screen').style.zoom=effFont(P());}catch(e){}
  bindScreen();
  renderProfileBtn();
  try{applyDir();translateScreen();}catch(e){}
  animateCounts();
  animateBars();
}
/* count-up animation for numeric stat values */
function animateCounts(){
  document.querySelectorAll('#screen .stat .v').forEach(el=>{
    const m=el.textContent.trim().match(/^([\d,]+)/);if(!m)return;
    const target=parseInt(m[1].replace(/,/g,''));if(!target||target>200000)return;
    const suffix=el.innerHTML.slice(el.innerHTML.indexOf(m[1])+m[1].length);
    const dur=650,start=performance.now();
    (function step(now){
      const t=Math.min(1,(now-start)/dur);
      const v=Math.round(target*(1-Math.pow(1-t,3)));
      el.innerHTML=v.toLocaleString('en-US')+suffix;
      if(t<1)requestAnimationFrame(step);
    })(start);
  });
}
/* grow bars & fill meters from zero on render */
function animateBars(){
  document.querySelectorAll('#screen .bar .col').forEach(c=>{const h=c.style.height;c.style.height='2%';requestAnimationFrame(()=>requestAnimationFrame(()=>c.style.height=h));});
  document.querySelectorAll('#screen .pbar i,#screen .waterbar i').forEach(c=>{const w=c.style.width;c.style.width='0%';requestAnimationFrame(()=>requestAnimationFrame(()=>c.style.width=w));});
}
/* celebratory XP burst */
function xpBurst(txt){
  const e=document.createElement('div');e.className='xpburst';e.textContent=txt;
  document.body.appendChild(e);setTimeout(()=>e.remove(),1100);
}
/* button ripple (delegated) */
document.addEventListener('pointerdown',e=>{
  const b=e.target.closest('.btn');if(!b)return;
  const r=document.createElement('span');r.className='ripple';
  const rect=b.getBoundingClientRect(),size=Math.max(rect.width,rect.height);
  r.style.width=r.style.height=size+'px';
  r.style.left=(e.clientX-rect.left-size/2)+'px';
  r.style.top=(e.clientY-rect.top-size/2)+'px';
  b.appendChild(r);setTimeout(()=>r.remove(),550);
});

function openDayPicker(){
  var p=P();var ds=(p.workout.days||[]).slice().sort(function(a,b){return a-b;});
  var html='<h2 style="margin:0 0 4px;text-align:center">📅 ימי האימון שלך</h2>'+
    '<div class="sub" style="text-align:center;margin:0 0 12px">הקש על הימים שבהם אתה מתאמן. האפליקציה תתעדכן אוטומטית — יום אימון בימים שבחרת, יום מנוחה בשאר.</div>'+
    '<div class="daysel" style="justify-content:center">'+DOW.map(function(dn,i){return '<button type="button" class="'+(ds.indexOf(i)>=0?'act':'')+'" data-act="dayPick" data-v="'+i+'" aria-pressed="'+(ds.indexOf(i)>=0?'true':'false')+'" data-notr>'+dowName(i)+'</button>';}).join('')+'</div>'+
    '<div class="sub" style="text-align:center;margin:12px 0 0;font-weight:700">'+(ds.length?('נבחרו: '+ds.map(function(i){return DOW_HE[i];}).join(', ')):'לא נבחרו ימים — כל השבוע מנוחה')+'</div>'+
    '<button class="btn grad" data-act="close" style="width:100%;margin-top:14px">סיום</button>';
  openSheet(html);
}
