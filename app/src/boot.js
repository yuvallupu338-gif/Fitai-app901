/* src/boot.js — start the app
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* =====================================================================
   INIT
   ===================================================================== */
try{
  try{applyDir();}catch(e){}
  try{applyTheme();}catch(e){}
  if(P()&&!P().onboarded){startOnboarding();}else{render();}
  try{translateChrome();}catch(e){}
}catch(e){
  console.error('render',e);
  try{ DB=null; const p=newProfile('אני'); DB={profiles:{[p.id]:p},active:p.id,lang:'en',schema:(typeof SCHEMA_VERSION!=='undefined'?SCHEMA_VERSION:2)}; store.write(DB); render(); }
  catch(e2){
    document.getElementById('screen').innerHTML='<div style="padding:40px 16px;text-align:center;color:#F4F5F6"><h2 style="font-size:18px">אופס — משהו השתבש בטעינה</h2><p style="color:rgba(244,245,246,.55);font-size:14px;margin-top:8px">נסה לרענן את הדף. אם זה לא עוזר, ייתכן שנתונים שמורים פגומים — אפשר לאפס דרך ההגדרות.</p></div>';
  }
}
/* hydrate exercise demo GIFs from the offline cache as they appear */
try{hydrateGifs();var _gifMO=new MutationObserver(function(muts){for(var i=0;i<muts.length;i++){var an=muts[i].addedNodes;for(var j=0;j<an.length;j++){var n=an[j];if(n.nodeType!==1)continue;if(n.matches&&n.matches('img.exg[data-gif]'))gifResolve(n);else hydrateGifs(n);}}});_gifMO.observe(document.body,{childList:true,subtree:true});}catch(e){}
/* pre-cache all demo GIFs while online so they work offline later */
try{var _pf=function(){prefetchGifs();};if('requestIdleCallback' in window)requestIdleCallback(_pf,{timeout:4000});else setTimeout(_pf,2500);window.addEventListener('online',function(){_gifPF=0;prefetchGifs();});}catch(e){}
/* cross-tab sync: if another tab saves the DB, refresh ours (avoid clobbering) */
try{window.addEventListener('storage',function(e){if(e.key===KEY&&e.newValue){try{var nd=JSON.parse(e.newValue);if(nd&&nd.profiles){if(_saveT){flushSave();return;}DB=nd;if(typeof OB==='undefined'||!OB)render();if(typeof toast==='function')toast('סונכרן מחלון אחר ↻');}}catch(_e){}}});}catch(e){}
/* a permission revoked in site settings must not leave the switch claiming on */
try{syncNotifPerm();}catch(e){}
/* and a gym profile from an older build must not arrive with nothing to lift */
try{migrateKit();}catch(e){}
/* dismiss the loading splash once the app is on screen */
setTimeout(function(){try{hideSplash();}catch(e){}},80);
