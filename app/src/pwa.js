/* src/pwa.js — the runtime manifest and the install prompt
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* paint the header/onboarding mark */
(function(){try{var st=document.createElement('style');st.textContent='.logobox{background-image:url('+LOGO_MARK+')}';document.head.appendChild(st);}catch(e){}})();
/* show the full logo on the splash screen */
(function(){try{var lg=document.querySelector('#splash .lg');if(lg){lg.innerHTML='<img src="'+LOGO_FULL+'" alt="FitAI" style="width:210px;max-width:64vw;height:auto;border-radius:26px">';}var tt=document.querySelector('#splash .t');if(tt)tt.style.display='none';}catch(e){}})();
/* ---- PWA: installable manifest + icon (injected at runtime) ---- */
(function(){try{
  var icon=LOGO_MARK;
  var mani={name:'FitAI — מאמן כושר ותזונה',short_name:'FitAI',start_url:'.',scope:'.',display:'standalone',orientation:'portrait',background_color:'#0B0C0E',theme_color:'#0B0C0E',dir:'rtl',lang:'he',icons:[{src:icon,sizes:'192x192',type:'image/png',purpose:'any'},{src:icon,sizes:'330x330',type:'image/png',purpose:'any'},{src:LOGO_FULL,sizes:'512x512',type:'image/png',purpose:'any maskable'}]};
  var ml=document.createElement('link');ml.rel='manifest';ml.href=URL.createObjectURL(new Blob([JSON.stringify(mani)],{type:'application/manifest+json'}));document.head.appendChild(ml);
  var al=document.createElement('link');al.rel='apple-touch-icon';al.href=icon;document.head.appendChild(al);
  try{if(navigator.storage&&navigator.storage.persist){navigator.storage.persisted().then(function(has){if(!has)navigator.storage.persist();});}}catch(e){}
  // favicon (browser tab icon) — use the embedded brand mark
  try{if('serviceWorker' in navigator && String(location.protocol).indexOf('http')===0){navigator.serviceWorker.register('sw.js').catch(function(){});}}catch(e){}
  try{window.addEventListener('beforeinstallprompt',function(ev){ev.preventDefault();_deferredPrompt=ev;try{if(typeof TAB!=='undefined'&&TAB==='settings')render();}catch(_){}});window.addEventListener('appinstalled',function(){_deferredPrompt=null;try{toast('הותקן בהצלחה ✓ 🎉');}catch(_){}try{render();}catch(_){}});}catch(e){}
  ['icon','shortcut icon'].forEach(function(rel){var fv=document.createElement('link');fv.rel=rel;fv.type='image/png';fv.href=icon;document.head.appendChild(fv);});
}catch(e){}})();


