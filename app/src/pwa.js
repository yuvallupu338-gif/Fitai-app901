/* src/pwa.js — the runtime manifest and the install prompt
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---- the brand marks ----
   The mark on the top bar and the onboarding screens is painted by the
   stylesheet, and the splash lock-up and the tab icon sit in index.html, so
   all three are on screen before this file has even been fetched. What is left
   here is the installed app's icons, which only the manifest can name. */
var LOGO_MARK='assets/logo-mark.png';        // 256², the mark
var LOGO_ICON='assets/logo-icon-512.png';    // 512², the PWA icon
var LOGO_MASKABLE='assets/logo-maskable.png';// 512², inside Android's safe zone
/* ---- PWA: installable manifest + icon (injected at runtime) ---- */
(function(){try{
  // The manifest is served from a blob: URL, and a relative icon path would
  // resolve against the blob rather than the page — so they go in absolute.
  function abs(p){try{return new URL(p,location.href).href;}catch(e){return p;}}
  var mani={name:'FitAI — מאמן כושר ותזונה',short_name:'FitAI',start_url:'.',scope:'.',display:'standalone',orientation:'portrait',background_color:'#0B0C0E',theme_color:'#0B0C0E',dir:'rtl',lang:'he',icons:[{src:abs(LOGO_MARK),sizes:'256x256',type:'image/png',purpose:'any'},{src:abs(LOGO_ICON),sizes:'512x512',type:'image/png',purpose:'any'},{src:abs(LOGO_MASKABLE),sizes:'512x512',type:'image/png',purpose:'maskable'}]};
  var ml=document.createElement('link');ml.rel='manifest';ml.href=URL.createObjectURL(new Blob([JSON.stringify(mani)],{type:'application/manifest+json'}));document.head.appendChild(ml);
  try{if(navigator.storage&&navigator.storage.persist){navigator.storage.persisted().then(function(has){if(!has)navigator.storage.persist();});}}catch(e){}
  try{if('serviceWorker' in navigator && String(location.protocol).indexOf('http')===0){navigator.serviceWorker.register('sw.js').catch(function(){});}}catch(e){}
  try{window.addEventListener('beforeinstallprompt',function(ev){ev.preventDefault();_deferredPrompt=ev;try{if(typeof TAB!=='undefined'&&TAB==='settings')render();}catch(_){}});window.addEventListener('appinstalled',function(){_deferredPrompt=null;try{toast('הותקן בהצלחה ✓ 🎉');}catch(_){}try{render();}catch(_){}});}catch(e){}
}catch(e){}})();


