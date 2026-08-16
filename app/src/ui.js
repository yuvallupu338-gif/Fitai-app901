/* src/ui.js — the DOM helpers every screen uses: $, esc, toast, bottom sheets, confirm
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* =====================================================================
   UI HELPERS
   ===================================================================== */
const $=id=>document.getElementById(id);
function esc(s){return (s+'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function num(n){return (n||0).toLocaleString('en-US');}
function hideSplash(){var el=document.getElementById('splash');if(el){el.classList.add('hide');setTimeout(function(){if(el&&el.parentNode)el.parentNode.removeChild(el);},520);}}
function toast(msg){const t=$('toast');t.textContent=msg;try{translateEl(t);}catch(e){}t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2000);}
function openSheet(html){$('sheet').innerHTML='<div class="grab"></div>'+html;
  var _ov=$('overlay');try{_ov.style.zIndex=$('modal').classList.contains('open')?'200':'';}catch(e){}
  _ov.classList.add('open');bindActs($('sheet'));try{translateEl($('sheet'));}catch(e){}}
function closeSheet(){var _ov=$('overlay');_ov.classList.remove('open');try{_ov.style.zIndex='';}catch(e){}}
var _deferredPrompt=null;
function _pwaInstalled(){try{return (window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone===true;}catch(e){return false;}}
function installGuide(){
  if(_pwaInstalled()){openSheet('<h3>📲 התקנה כאפליקציה</h3><div class="sub">✓ כבר מותקן! פתח את FitAI מהאייקון במסך הבית.</div><button class="btn ghost" data-act="close" style="width:100%;margin-top:10px">סגור</button>');return;}
  var ios='<div class="card" style="margin:8px 0"><b>🍎 אייפון (Safari)</b><ol style="margin:6px 0 0;padding-inline-start:20px;line-height:1.95">'+
    '<li>פתחו את דפדפן <b>Safari</b>.</li>'+
    '<li>היכנסו לאתר <b>FitAI</b>.</li>'+
    '<li>לחצו על <b>שלוש הנקודות (•••)</b> בפינה השמאלית התחתונה של המסך.</li>'+
    '<li>בתפריט שנפתח, לחצו על <b>שיתוף</b>.</li>'+
    '<li>גללו בתפריט השיתוף ולחצו על <b>"הוסף למסך הבית"</b>.</li>'+
    '<li>בחרו שם לאייקון (מומלץ להשאיר <b>FitAI</b>).</li>'+
    '<li>לחצו על <b>הוסף</b> בפינה העליונה.</li></ol>'+
    '<div class="sub" style="margin:8px 2px 0">🎉 עכשיו FitAI יופיע במסך הבית כמו אפליקציה אמיתית.</div></div>';
  var andr='<div class="card" style="margin:8px 0"><b>🤖 אנדרואיד (Google Chrome)</b><ol style="margin:6px 0 0;padding-inline-start:20px;line-height:1.95">'+
    '<li>פתחו את דפדפן <b>Google Chrome</b>.</li>'+
    '<li>היכנסו לאתר <b>FitAI</b>.</li>'+
    '<li>לחצו על <b>שלוש הנקודות (⋮)</b> בפינה העליונה של המסך.</li>'+
    '<li>בתפריט שנפתח: אם מופיע <b>"התקן אפליקציה"</b> (Install app) — לחצו עליו. אם לא מופיע, לחצו על <b>"הוסף למסך הבית"</b> (Add to Home screen).</li>'+
    '<li>אשרו: אם בחרתם התקנה → לחצו <b>התקן</b> · אם בחרתם קיצור דרך → לחצו <b>הוסף</b>.</li></ol>'+
    '<div class="sub" style="margin:8px 2px 0">🎉 עכשיו FitAI יופיע במסך הבית וייפתח בלחיצה אחת כמו אפליקציה!</div></div>';
  openSheet('<h3>📲 התקנה כאפליקציה</h3><div class="sub" style="margin:0 0 10px">בחר לפי המכשיר שלך:</div>'+ios+andr+'<div class="sub" style="margin:10px 2px 0">💡 ההתקנה עובדת כשפותחים את FitAI מכתובת אינטרנט (https) — למשל GitHub Pages — ולא מקובץ מקומי.</div>'+'<button class="btn ghost" data-act="close" style="width:100%;margin-top:10px">סגור</button>');
}
var _confirmCb=null;
function askConfirm(msg,onYes,yesLabel,danger){
  _confirmCb=onYes||null;
  var y=yesLabel||'אישור';
  $('sheet').innerHTML='<div class="grab"></div>'+
    '<div style="padding:4px 4px 2px"><div style="font-size:16px;font-weight:800;line-height:1.55;margin:0 0 16px">'+esc(msg)+'</div>'+
    '<div class="row"><button class="btn ghost" data-act="cfNo" style="flex:1">ביטול</button>'+
    '<button class="btn '+(danger?'o':'b')+'" data-act="cfYes" style="flex:1">'+esc(y)+'</button></div></div>';
  var ov=$('overlay');ov.style.zIndex='200';ov.classList.add('open');
  bindActs($('sheet'));try{translateEl($('sheet'));}catch(e){}
}
function _confirmClose(){_confirmCb=null;var ov=$('overlay');ov.classList.remove('open');ov.style.zIndex='';}
function dayMeals(p){
  var pool=MEALPOOL[p.nutrition.diet]||MEALPOOL.regular;
  var banned=bannedWords(p.nutrition.allergies),dis=dislikeWords(p.nutrition.dislikes);
  var baseSeed=p.mealSeed||0,seeds=p.mealSeeds||{};
  var dist=dayDist(p).dist;
  var metas=[{key:'breakfast',he:'ארוחת בוקר',emo:'🍳',pl:pool.breakfast},{key:'lunch',he:'ארוחת צהריים',emo:'🍗',pl:pool.lunch},{key:'dinner',he:'ארוחת ערב',emo:'🐟',pl:pool.dinner},{key:'snack',he:'נשנוש',emo:'🥤',pl:pool.snack}];
  return metas.map(function(mt,i){var pk=pickSafeMeal(mt.pl,(seeds[mt.key]||0)+baseSeed,banned,dis);return {key:mt.key,he:mt.he,emo:mt.emo,m:pk.m,mc:dist[i]};});
}
function openShoppingList(){
  var p=P();var meals=dayMeals(p);
  var html='<h3>🛒 רשימת קניות · תפריט היום</h3><div class="sub" style="margin:0 0 8px">כל המצרכים לארוחות היום, בכמויות המותאמות ליעד. סמן מה שכבר יש לך.</div>';
  meals.forEach(function(mm){
    var m=mm.m;var _bc=m.p*4+m.c*4+m.f*9;var f=_bc?mm.mc.cal/_bc:1;
    html+='<div class="sub" style="font-weight:800;margin:12px 2px 4px">'+mm.emo+' '+esc(m.name)+'</div>';
    html+=(m.ing||[]).map(function(i){return '<label class="row" style="align-items:center;gap:9px;padding:7px 4px;border-bottom:1px solid var(--line);cursor:pointer;margin:0"><input type="checkbox" style="width:18px;height:18px;flex:none;accent-color:var(--teal2)"><span style="flex:1">'+esc(scaleQty(i,f))+'</span></label>';}).join('');
  });
  html+='<button class="btn ghost" style="width:100%;margin-top:14px" data-act="close">סגור</button>';
  openSheet(html);
}
