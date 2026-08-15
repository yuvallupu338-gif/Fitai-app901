/* src/i18n.js — the language layer: lang(), t(), and the DOM translation walk
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
var I18N_UNITS=[["מ״ג", "mg", "mg"], ["ק״ג", "kg", "kg"], ["קל׳", "cal", "cal"], ["מ״ל", "ml", "ml"], ["ס״מ", "cm", "cm"], ["ג׳", "g", "g"], ["ל׳", "L", "L"]];
var I18N_DAYS=[["רביעי","Wednesday","Miércoles"],["חמישי","Thursday","Jueves"],["שישי","Friday","Viernes"],["שבת","Saturday","Sábado"]];
var APP_BUILD='2026.09.17'
function lang(){return (typeof DB!=='undefined'&&DB&&DB.lang)||'en';}
function t(s){var l=lang();if(l==='he')return s;var d=I18N[l];return (d&&d[s]!=null)?d[s]:s;}
function applyDir(){try{var l=lang();document.documentElement.lang=l;document.documentElement.dir=(l==='he'?'rtl':'ltr');}catch(e){}}
function applyTheme(){try{document.documentElement.classList.toggle('light',(DB&&DB.theme)==='light');}catch(e){}}
try{window._I18NDEBUG=!!(window.localStorage&&localStorage.getItem('fitai_i18ndebug'));}catch(e){}
function translateEl(root){try{var l=lang();if(l==='he'||!root)return;var d=I18N[l];if(!d)return;
  var B='[^֐-׿]';var rx=I18N['_rx_'+l];if(!rx){rx=Object.keys(d).sort(function(a,b){return b.length-a.length;}).map(function(k){var e=k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');return [new RegExp('('+B+'|^)'+e+'('+B+'|$)','g'),(''+d[k]).replace(/\$/g,'$$$$')];});I18N['_rx_'+l]=rx;}
  var wk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null),ns=[];
  while(wk.nextNode()){var _pe=wk.currentNode.parentElement;
    if(_pe&&_pe.closest&&_pe.closest('[data-notr]'))continue;   // names, exercise titles
    ns.push(wk.currentNode);}
  ns.forEach(function(n){var tx=n.nodeValue;if(!/[\u0590-\u05FF]/.test(tx))return;
    var _ex=tx.trim();
    if(_ex&&d[_ex]!=null){var _wo=tx.replace(_ex,(''+d[_ex]).replace(/\$/g,'$$$$'));if(_wo!==tx)n.nodeValue=_wo;return;}
    var out=tx;
    for(var i=0;i<rx.length;i++){out=out.replace(rx[i][0],'$1'+rx[i][1]+'$2');}
    try{var B='[^\\u0590-\\u05FF]';
      (I18N_UNITS||[]).forEach(function(u){var rep=(l==='es'?u[2]:u[1]);out=out.replace(new RegExp('('+B+'|^)'+u[0]+'('+B+'|$)','g'),'$1'+rep+'$2');});
      (I18N_DAYS||[]).forEach(function(u){var rep=(l==='es'?u[2]:u[1]);out=out.replace(new RegExp('('+B+'|^)'+u[0]+'('+B+'|$)','g'),'$1'+rep+'$2');});
    }catch(_e){}
    if(out!==tx)n.nodeValue=out;
    try{if(window._I18NDEBUG&&/[\u0590-\u05FF]/.test(out))console.warn('[i18n] untranslated:',out.trim().slice(0,80));}catch(_e){}});
  root.querySelectorAll&&root.querySelectorAll('[placeholder]').forEach(function(e){var k=e.getAttribute('placeholder');if(d[k]!=null)e.setAttribute('placeholder',d[k]);});
  root.querySelectorAll&&root.querySelectorAll('[aria-label],[title],[alt]').forEach(function(e){['aria-label','title','alt'].forEach(function(a){if(!e.hasAttribute(a))return;var k=e.getAttribute(a);if(k!=null&&d[k]!=null)e.setAttribute(a,d[k]);});});
}catch(e){}}
function translateScreen(){translateEl(document.getElementById('screen'));}
var _NAVHTML=null;
function translateChrome(){try{var nav=document.getElementById('nav');if(!nav)return;if(_NAVHTML===null)_NAVHTML=nav.innerHTML;nav.innerHTML=_NAVHTML;if(lang()!=='he')translateEl(nav);try{[...nav.children].forEach(function(c){var on=c.dataset.tab===TAB;c.classList.toggle('act',on);c.setAttribute('aria-selected',on?'true':'false');});}catch(e){}}catch(e){}}
function setLang(l){if(typeof DB!=='undefined'&&DB){DB.lang=l;try{save();}catch(e){}}applyDir();try{if(typeof OB!=='undefined'&&OB){obRender();}else{render();translateChrome();}}catch(e){}}
function obSetLang(l){if(typeof DB!=='undefined'&&DB){DB.lang=l;try{save();}catch(e){}}applyDir();OB.step=(P()&&P().consent&&P().consent.v===CONSENT_VERSION)?0:-0.5;obRender();}
