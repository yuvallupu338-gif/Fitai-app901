/* src/bindings.js — tab navigation, the data-act delegation, equipment and field setters
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* =====================================================================
   EVENT BINDING
   ===================================================================== */
$('nav').addEventListener('click',e=>{
  const b=e.target.closest('button[data-tab]');if(!b)return;
  gotoTab(b.dataset.tab);
});
function gotoTab(tab){TAB=tab;[...$('nav').children].forEach(c=>{var on=c.dataset.tab===tab;c.classList.toggle('act',on);c.setAttribute('aria-selected',on?'true':'false');});window.scrollTo(0,0);render();}

/* =====================================================================
   data-call — inline handlers, without 'unsafe-inline'

   Every onclick="…" this app generated was a string the browser compiled, and
   that is precisely the capability an injected <img onerror=…> needs. The CSP
   could not tell the two apart: the one directive that kept obGo() working
   kept the payload working too.

   So the markup names a function and its arguments instead of carrying code,
   and this dispatcher resolves the name against the fixed list below. Nothing
   outside that list can be called, whatever ends up in the DOM.

     <button data-call="obStep" data-args="[1]">
     <input  data-call="obSet" data-on="input" data-args="[&quot;age&quot;,&quot;$value&quot;]">

   "$value" is replaced with the element's own value at dispatch time, which is
   what `this.value` used to do.
   ===================================================================== */
var CALLABLE = [
  'obPick','obSet','obStep','obGo','obFinish','cancelOb','obRender',
  'obConsentAccept','obToggleConsent','obSetLang','obToggleDay','obBackToLang',
  'obSetDate','obSetDateFromInput','obUseRecDays',
  'setLang','setTrainEnv','setFontLevel','skillFilter',
  'woSaveWeight','woInput','foodPortionCalc','foodSearchRender','fpSetQty',
  'algToggle','toggleEquip','obToggleEquip','woSaveWeightAndSay','hideBrokenImage'
];
function _callFn(name){
  return (CALLABLE.indexOf(name) >= 0 && typeof window[name] === 'function') ? window[name] : null;
}
function _callArgs(el){
  var raw = el.getAttribute('data-args');
  if (!raw) return [];
  var a; try { a = JSON.parse(raw); } catch (e) { return []; }
  if (!Array.isArray(a)) return [];
  return a.map(function(v){ return v === '$value' ? el.value : v; });
}
function _dispatchCall(e, type){
  var el = e.target && e.target.closest ? e.target.closest('[data-call]') : null;
  if (!el) return;
  if ((el.getAttribute('data-on') || 'click') !== type) return;
  var fn = _callFn(el.getAttribute('data-call'));
  if (fn) fn.apply(el, _callArgs(el));
}
/* All four are captured rather than bubbled: bindActs() calls stopPropagation()
   on the elements it binds, so a data-call inside one would never be reached on
   the way up — and `error` does not bubble at all, so capture is the only way
   to hear it. */
document.addEventListener('click',  function(e){ _dispatchCall(e, 'click'); },  true);
document.addEventListener('input',  function(e){ _dispatchCall(e, 'input'); },  true);
document.addEventListener('change', function(e){ _dispatchCall(e, 'change'); }, true);
document.addEventListener('error',  function(e){ _dispatchCall(e, 'error'); },  true);

/* the three handlers that were statements rather than calls */
function obBackToLang(){ OB.step = -1; obRender(); }
function obSetDateFromInput(v){ obSetDate(v ? Date.parse(v) : 0); }
function fpSetQty(v){ var el = document.getElementById('fp_qty'); if (el) { el.value = v; foodPortionCalc(); } }
function hideBrokenImage(){ this.style.display = 'none'; }

function bindActs(root){
  root.querySelectorAll('[data-act]').forEach(x=>{
    if(x._b)return;x._b=1;
    if(x.matches('input,select,textarea')){
      x.addEventListener('change',ev=>{ev.stopPropagation();handleAct(x.dataset.act,x);});
      return;
    }
    x.addEventListener('click',ev=>{ev.stopPropagation();handleAct(x.dataset.act,x);});
    if(x.getAttribute('role')==='switch'){x.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();handleAct(x.dataset.act,x);}});}
  });
}
function bindScreen(){
  const s=$('screen');
  s.querySelectorAll('[data-goto]').forEach(x=>x.onclick=()=>gotoTab(x.dataset.goto));
  bindActs(s);
  s.querySelectorAll('.lvlh[data-lvl]').forEach(x=>x.onclick=()=>{const l=+x.dataset.lvl;openLevel=openLevel===l?0:l;render();});
  s.querySelectorAll('.ex[data-ex]').forEach(x=>x.onclick=()=>exercisePopover(x.dataset.ex,+x.dataset.lvl));
  s.querySelectorAll('.pills[data-field]').forEach(grp=>grp.querySelectorAll('.pill').forEach(b=>b.onclick=()=>setPill(grp.dataset.field,b.dataset.v,grp)));
  s.querySelectorAll('.daysel[data-field]').forEach(grp=>grp.querySelectorAll('button').forEach(b=>b.onclick=()=>toggleDay(+b.dataset.v)));
  s.querySelectorAll('[data-set]').forEach(inp=>inp.onchange=()=>setField(inp.dataset.set,inp.value));
  s.querySelectorAll('[data-smode]').forEach(b=>b.onclick=()=>{commit(p=>p.stretchMode=b.dataset.smode);render();});
}

var EQUIP_LIST=[['bar','מוט מתח'],['dip','מקבילים'],['rings','טבעות'],['bands','גומיות התנגדות'],['abwheel','גלגל בטן'],['barbell','מוט ופלטות'],['dumbbells','משקולות יד'],['bench','ספסל'],['machines','מכונות'],['cables','כבלים'],['kettlebell','קטלבל'],['weight','משקל נוסף']];
var EQUIP_HE={};EQUIP_LIST.forEach(function(o){EQUIP_HE[o[0]]=o[1];});
// which equipment an exercise actually needs; each group = acceptable alternatives (any one suffices)
function exNeeds(n){
  var mv=(typeof MOVE_BY_BASE!=='undefined')&&MOVE_BY_BASE[n];
  if(mv)return mv.need||[];                       // the library is authoritative
  n=(n||'').toLowerCase();
  if(/ab wheel/.test(n))return [['abwheel']];
  if(/ring/.test(n))return [['rings']];
  if(/korean|^dips|parallel bar/.test(n))return [['dip']];
  if(/pull-up|pullup|chin|hanging|front lever|muscle-up|toes to bar|windshield|skin the cat|scapular/.test(n))return [['bar']];
  if(/inverted row/.test(n))return [['bar']];
  if(/band/.test(n))return [['bands']];
  return [];}
function studioEquip(p){var e=(p&&p.workout&&p.workout.equipment);return Array.isArray(e)?e:[];}

// Returning after a long layoff: a real 4-week ramp (volume, load, rest, RIR), then auto-off.
var RETURN_WEEKS=4;
var RETURN_PLAN={1:{sets:-2,load:0.65,rest:20,rir:4,cut:2},2:{sets:-1,load:0.75,rest:15,rir:4,cut:1},3:{sets:-1,load:0.85,rest:10,rir:3,cut:0},4:{sets:0,load:0.92,rest:5,rir:3,cut:0}};
function returnWeek(p){var r=p&&p.returnMode;if(!r||!r.on||!r.since)return 0;
  var w=Math.floor((Date.now()-r.since)/(7*86400000))+1;
  if(w>RETURN_WEEKS)return 0;                       // ramp finished
  return Math.max(1,Math.min(RETURN_WEEKS,w));}
function returnPlan(p){var w=returnWeek(p);return w?RETURN_PLAN[w]:null;}
function returnExpireCheck(){try{var p=P();if(p&&p.returnMode&&p.returnMode.on&&!returnWeek(p)){commit(function(pp){pp.returnMode.on=false;});toast('סיימת את החזרה ההדרגתית — חזרת לתוכנית המלאה 💪');}}catch(e){}}
function toggleReturnMode(){commit(function(p){var on=!(p.returnMode&&p.returnMode.on);p.returnMode={on:on,since:on?Date.now():0};});
  render();toast(P().returnMode.on?'מצב חזרה מהפסקה הופעל — נתחיל בעדינות 🔄':'מצב חזרה מהפסקה בוטל');}
function weighedToday(p){var ws=(p&&p.weights)||[];var l=ws[ws.length-1];return (l&&dayKey(l.d)===dayKey(Date.now()))?l:null;}
function isStudio(p){return true;}   // every profile is kit-based now
// true if the exercise is doable with what the user actually has (studio only; others unchanged)
function equipOK(p,name){var have=studioEquip(p);var need=exNeeds(name);
  for(var i=0;i<need.length;i++){var grp=need[i],ok=false;
    for(var j=0;j<grp.length;j++){if(have.indexOf(grp[j])>=0){ok=true;break;}}
    if(!ok)return false;}
  return true;}
function studioHasWeights(p){var h=studioEquip(p);return ['dumbbells','barbell','kettlebell','machines','cables','weight'].some(function(k){return h.indexOf(k)>=0;});}
function toggleEquip(k){commit(function(p){var a=p.workout.equipment=Array.isArray(p.workout.equipment)?p.workout.equipment:[];var i=a.indexOf(k);if(i>=0)a.splice(i,1);else a.push(k);});render();}
function equipPills(sel,act,list){return '<div class="pills">'+(list||EQUIP_LIST).map(function(o){var k=o[0]||o;var nm=(typeof equipName==='function')?equipName(k):(EQUIP_HE[k]||k);return '<button class="pill '+(sel.indexOf(k)>=0?'act':'')+'" data-call="'+esc(act)+'" data-args="'+esc(JSON.stringify([k]))+'">'+nm+'</button>';}).join('')+'</div>';}
function trainEnv(p){return trainStyle(p);}
/* Switching style re-points the kit at the one that style asks about, keeping
   anything that is meaningful in both. Otherwise a gym profile that tried
   calisthenics for a day would come back to an empty gym. */
function setTrainEnv(v){commit(function(p){
  var w=p.workout,prev=trainStyle(p);
  if(STYLES.indexOf(v)<0)v='calisthenics';
  w.style=v; w.location=(v==='gym')?'gym':'home';
  if(v!==prev){
    var allowed=kitFor(v).map(function(k){return k[0];});
    var kept=(Array.isArray(w.equipment)?w.equipment:[]).filter(function(k){return allowed.indexOf(k)>=0;});
    /* Picking hybrid from a calisthenics profile keeps the pull-up bar and
       nothing else, which would be hybrid in name only — so a half of the kit
       the new style needs and the old one never asked about gets seeded. */
    var gymKeys=KIT_GYM.map(function(k){return k[0];});
    if(v!=='calisthenics'&&!kept.some(function(k){return gymKeys.indexOf(k)>=0;}))
      kept=kept.concat(gymKeys);
    w.equipment=kept.length?kept:kitDefault(v);
  }
});render();}
function setPill(field,val,grp){
  commit(p=>{
    if(field==='style')p.workout.style=val;
    else if(field==='location')p.workout.location=val;
    else if(field==='fontScale')p.fontScale=+val;
    else if(field==='goal')p.goal=val;
    else if(field==='pace')p.pace=+val;
    else if(field.startsWith('fitness.')){p.fitness[field.split('.')[1]]=val;p.fitness.level=computeLevelFromAssessment(p.fitness.pushups,p.fitness.pullups,p.fitness.squats,p.fitness.pistol);}
    else if(field.startsWith('nutrition.'))p.nutrition[field.split('.')[1]]=val;
  });
  if(['goal','pace','style','location','fontScale'].includes(field)||field.startsWith('nutrition.')||field.startsWith('fitness.'))render();
  else grp.querySelectorAll('.pill').forEach(b=>b.classList.toggle('act',b.dataset.v==val));
}
function toggleDay(i){
  commit(p=>{
    const idx=p.workout.days.indexOf(i);
    if(idx>=0)p.workout.days.splice(idx,1);else p.workout.days.push(i);
    p.workout.days.sort((a,b)=>a-b);
  });
  render();
}
function setField(path,v){
  commit(p=>{
    var parts=path.split('.'),o=p;
    for(var i=0;i<parts.length-1;i++){if(!o[parts[i]]||typeof o[parts[i]]!=='object')o[parts[i]]={};o=o[parts[i]];}
    var leaf=parts[parts.length-1];
    o[leaf]=['age','height','weight','naTarget','sugTarget','level'].includes(leaf)?(parseFloat(v)||0):v;
    if(path==='personal.name')p.name=v;
  });
  renderProfileBtn();
}
function val(id){const e=$(id);return e?e.value.trim():'';}

