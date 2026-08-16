/* src/demo-media.js — the offline GIF cache and the demo image elements
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ===== offline GIF cache (IndexedDB) — demos work without network after first online view ===== */
var GIFDB=null,_gifObj={},_gifPF=0;
function gifOpen(){return new Promise(function(res){
  if(GIFDB)return res(GIFDB);
  try{if(!('indexedDB' in window))return res(null);var rq=indexedDB.open('fitai_gifs',1);
    rq.onupgradeneeded=function(){try{rq.result.createObjectStore('g');}catch(e){}};
    rq.onsuccess=function(){GIFDB=rq.result;res(GIFDB);};
    rq.onerror=function(){res(null);};rq.onblocked=function(){res(null);}
  }catch(e){res(null);}
});}
function gifGetBlob(url){return gifOpen().then(function(db){return new Promise(function(res){
  if(!db)return res(null);try{var r=db.transaction('g','readonly').objectStore('g').get(url);
    r.onsuccess=function(){res(r.result||null);};r.onerror=function(){res(null);};
  }catch(e){res(null);}});});}
function gifPutBlob(url,blob){gifOpen().then(function(db){if(!db)return;try{db.transaction('g','readwrite').objectStore('g').put(blob,url);}catch(e){}});}
function gifResolve(img){
  var url=img&&img.getAttribute&&img.getAttribute('data-gif');if(!url||img._gh)return;img._gh=1;
  gifGetBlob(url).then(function(blob){
    if(blob){try{var o=_gifObj[url]||(_gifObj[url]=URL.createObjectURL(blob));img.src=o;img.style.display='';return;}catch(e){}}
    img.src=url;                                  // not cached yet → load from network (online)
    img.addEventListener('load',function(){       // cache it for next time / offline
      if(_gifObj[url])return;try{fetch(url).then(function(r){return r.ok?r.blob():null;}).then(function(b){if(b)gifPutBlob(url,b);}).catch(function(){});}catch(e){}
    },{once:true});
  });
}
function hydrateGifs(root){try{(root||document).querySelectorAll('img.exg[data-gif]').forEach(gifResolve);}catch(e){}}
function prefetchGifs(){
  return; /* demos embedded as data URIs */
  var urls=[];for(var k in EXIMG){if(urls.indexOf(EXIMG[k])<0)urls.push(EXIMG[k]);}
  var i=0;function next(){if(i>=urls.length)return;var url=urls[i++];
    gifGetBlob(url).then(function(b){
      if(b){next();return;}
      try{fetch(url).then(function(r){return r.ok?r.blob():null;}).then(function(bl){if(bl)gifPutBlob(url,bl);}).catch(function(){}).then(next);}catch(e){next();}
    });}
  for(var c=0;c<4;c++)next();                      // small concurrency pool
}
function exDemo(frames,name){var a=Array.isArray(frames)?frames:(frames?[frames]:[]);var f0=a[0]||"",f1=a[1]||f0;var head='<div class="exdemo"><div class="exfb"><span class="e">🏋️</span><span class="n">'+esc(name)+'</span></div>';if(!f0)return head+'<div class="exlabel">הדגמה</div></div>';return head+'<img class="exg exanim" data-f0="'+f0+'" data-f1="'+f1+'" src="'+f0+'" loading="lazy" decoding="async" alt="'+esc(name)+'" data-call="hideBrokenImage" data-on="error"><div class="exlabel">הדגמה חיה</div></div>';}
var _exFlip=0;try{setInterval(function(){_exFlip^=1;var ims=document.querySelectorAll("img.exanim");for(var i=0;i<ims.length;i++){var im=ims[i];if(!im._pf){im._pf=1;try{var _pi=new Image();_pi.src=im.getAttribute("data-f1");}catch(e){}}var t=_exFlip?im.getAttribute("data-f1"):im.getAttribute("data-f0");if(t&&im.getAttribute("src")!==t)im.src=t;}},850);}catch(e){}
function coachStage(p,anim,curIdx){
  const fem=p.personal.gender==='נקבה';
  if(anim!=='idle' && curIdx>=0){
    const ex=WO.list[curIdx], gif=EXIMG[ex.base];
    var _p=[ex.mus||guessMus(ex)],_s=ex.sec||[];
    if(gif) return '<div class="coachstage"><div class="demorow">'+exDemo(gif,ex.name)+musFigureHTML(_p,_s)+'</div><div class="sub" style="margin:7px 0 0;text-align:center">'+(fem?'המאמנת מדגימה':'המאמן מדגים')+' · '+esc(ex.name)+'</div></div>';
    return '<div class="coachstage">'+coachSVG(p.personal.gender,anim,_p,_s)+'<div class="sub" style="margin:2px 0 0;text-align:center">'+(fem?'המאמנת שלך מתאמנת איתך':'המאמן שלך מתאמן איתך')+' '+animLabel(anim)+'</div></div>';
  }
  return '<div class="coachstage">'+coachSVG(p.personal.gender,'idle')+'<div class="sub" style="margin:2px 0 0;text-align:center">'+(fem?'המאמנת שלך — מנוחה':'המאמן שלך — מנוחה')+'</div></div>';
}
