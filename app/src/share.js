/* src/share.js — the shopping list, the shareable progress card, the modal, the day rollover
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
function _rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function shareCard(){
  var p=P();var x=xpLevel(p.xp);var st=streakDays(p),sl=strengthLevel(p),w=p.workouts||0;
  var C=document.createElement('canvas');C.width=1080;C.height=1350;var g=C.getContext('2d');
  var grd=g.createLinearGradient(0,0,1080,1350);grd.addColorStop(0,'#0B0C0E');grd.addColorStop(1,'#111214');g.fillStyle=grd;g.fillRect(0,0,1080,1350);
  var rg=g.createRadialGradient(860,140,60,860,140,760);rg.addColorStop(0,'rgba(217,255,61,.20)');rg.addColorStop(1,'rgba(217,255,61,0)');g.fillStyle=rg;g.fillRect(0,0,1080,1350);
  g.strokeStyle='rgba(217,255,61,.55)';g.lineWidth=6;_rr(g,40,40,1000,1270,44);g.stroke();
  g.textAlign='center';g.textBaseline='alphabetic';
  function paint(){
    g.fillStyle='#F4F5F6';g.font='800 68px Archivo,Rubik,Arial,sans-serif';g.fillText('FitAI',540,430);
    g.fillStyle='rgba(244,245,246,.55)';g.font='600 34px Archivo,Rubik,Arial,sans-serif';g.fillText(String(p.name||''),540,486);
    // hero streak
    g.fillStyle='#FF9166';g.font='800 210px Archivo,Rubik,Arial,sans-serif';g.fillText('🔥'+st,540,720);
    g.fillStyle='rgba(244,245,246,.62)';g.font='600 40px Archivo,Rubik,Arial,sans-serif';g.fillText('ימים ברצף',540,780);
    // three stats
    var cols=[[300,String(x.level),'רמה'],[540,String(w),'אימונים'],[780,String(sl),'רמת כוח']];
    cols.forEach(function(c){
      g.fillStyle='#D9FF3D';g.font='800 92px Archivo,Rubik,Arial,sans-serif';g.fillText(c[1],c[0],960);
      g.fillStyle='rgba(244,245,246,.55)';g.font='600 32px Archivo,Rubik,Arial,sans-serif';g.fillText(c[2],c[0],1010);
    });
    // rank pill
    g.fillStyle='rgba(217,255,61,.12)';_rr(g,300,1060,480,90,45);g.fill();
    g.fillStyle='#D9FF3D';g.font='700 44px Archivo,Rubik,Arial,sans-serif';g.fillText(rankFor(x.level),540,1120);
    g.fillStyle='rgba(244,245,246,.5)';g.font='600 30px Archivo,Rubik,Arial,sans-serif';g.fillText('FitAI · האימון האישי שלי 💪',540,1250);
    finalize();
  }
  function finalize(){
    C.toBlob(function(blob){
      if(!blob){toast('שגיאה ביצירת התמונה');return;}
      try{
        var file=new File([blob],'fitai-card.png',{type:'image/png'});
        if(navigator.canShare&&navigator.canShare({files:[file]})){navigator.share({files:[file],title:'FitAI',text:'ההתקדמות שלי ב-FitAI 💪'}).catch(function(){});return;}
      }catch(e){}
      var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='fitai-card.png';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},4000);
      toast('כרטיס ההתקדמות הורד 📸');
    },'image/png');
  }
  // The mark, stamped on the card. Same-origin, so it does not taint the
  // canvas and toBlob below still works. LOGO_MARK comes from src/pwa.js —
  // fine, because nothing here runs until the user asks to share.
  var img=new Image();
  img.onload=function(){try{g.drawImage(img,440,150,200,200);}catch(e){}paint();};
  img.onerror=function(){paint();};
  try{img.src=LOGO_MARK;}catch(e){paint();}
}
function openModal(html){$('modalSheet').innerHTML='<div class="grab"></div>'+html;$('modal').classList.add('open');bindActs($('modalSheet'));try{translateEl($('modalSheet'));}catch(e){}}
function woAnnounce(msg){try{var e=document.getElementById('woAnnounce');if(e)e.textContent=msg;}catch(_){}}
var _woLastFocus=null;
function closeModal(){$('modal').classList.remove('open');if(woTimer){clearInterval(woTimer);woTimer=null;}WO=null;try{if(_woLastFocus&&_woLastFocus.focus)_woLastFocus.focus();}catch(_){}_woLastFocus=null;}
document.addEventListener('keydown',function(e){if(e.key!=='Tab')return;var md=$('modal');if(!md||!md.classList.contains('open'))return;var f=[].slice.call(md.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(function(x){return x.offsetParent!==null&&!x.disabled;});if(!f.length)return;var first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
function _dayRefresh(){try{if(typeof DB==='undefined'||!DB)return;var p=P();if(!p||!p.onboarded)return;rolloverDay(p);weekRollover(p);returnExpireCheck();var md=document.getElementById('modal'),ov=document.getElementById('overlay');var busy=(md&&md.classList.contains('open'))||(ov&&ov.classList.contains('open'));if(!busy)render();}catch(e){}}
document.addEventListener('visibilitychange',function(){if(!document.hidden)_dayRefresh();});
window.addEventListener('pageshow',function(){_dayRefresh();});
window.addEventListener('focus',function(){_dayRefresh();});
document.addEventListener('keydown',function(e){if(e.key!=='Escape')return;if($('overlay').classList.contains('open')){if(_confirmCb!==null){_confirmClose();}else{closeSheet();}return;}var pm=document.getElementById('profMenu');if(pm&&pm.classList.contains('open')){pm.classList.remove('open');return;}var _md=document.getElementById('modal');if(_md&&_md.classList.contains('open')){if(WO&&WO.phase&&WO.phase!=='done'){askConfirm('לצאת מהאימון? ההתקדמות לא תישמר.',function(){closeModal();},'צא מהאימון',true);}else{closeModal();}return;}});
$('overlay').addEventListener('click',e=>{if(e.target===$('overlay'))closeSheet();});
$('modal').addEventListener('click',e=>{if(e.target===$('modal')){if(WO&&WO.phase&&WO.phase!=='done'){askConfirm('לצאת מהאימון? ההתקדמות לא תישמר.',function(){closeModal();},'צא מהאימון',true);}else{closeModal();}}});

let TAB='home', openLevel=1;

/* =====================================================================
   SCREENS
   ===================================================================== */
function rolloverDay(p){if(!p)return;var k=dayKey(Date.now());if(p.eatenDay!==k){p.eatenDay=k;p.todayEaten={cal:0,p:0,c:0,f:0,fib:0,na:0,sug:0};p.mealsEaten={};p.foodLog=[];p.water=0;save();}}
