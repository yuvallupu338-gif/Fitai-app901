/* src/workout-prescribe.js — prescribing sets, reps, load and rest, and the per-exercise log block
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---------- guided workout session (built only from the skill tree) ---------- */
let WO=null, woTimer=null;
function prescribe(e,p,lvl){
  const g=p.goal; let sets,lo,hi,rest;
  if(g==='fat'){sets=3;lo=12;hi=15;rest=40;}
  else if(g==='muscle'){sets=4;lo=8;hi=12;rest=75;}
  else if(g==='both'){sets=3;lo=10;hi=12;rest=60;}
  else {sets=3;lo=10;hi=12;rest=60;}
  // Loaded work belongs in a lower rep range with longer rests; calisthenics
  // progresses by harder variation instead, so its target is left alone.
  if(showWeights(p)){lo=Math.max(5,lo-2);hi=Math.max(lo+2,hi-2);rest+=10;}
  if(lvl>=7&&g!=='fat'){sets=4;lo=5;hi=8;rest=100;}      // strength bias at high levels
  var _mw=mesoWeek(p);
  if(_mw===2&&g!=='fat')sets+=1;                 // accumulation week — more volume
  if(_mw===3&&g!=='fat'){lo=Math.max(3,lo-2);hi=Math.max(lo+1,hi-2);rest+=15;} // peak week — heavier load, fewer reps
  if(_mw===4){sets=Math.max(2,sets-1);rest+=15;} // deload week — lighter
  var _rp=returnPlan(p);
  if(_rp){sets=Math.max(2,sets+_rp.sets);rest+=_rp.rest;lo=Math.max(6,lo);hi=Math.max(lo+2,hi);} // returning from a layoff: less volume, more rest, moderate reps
  const age=(p.personal&&p.personal.age)||25;
  const meas=e.regMeas||e.meas;
  if(e.cat==='legs'||meas.indexOf('משקל')>=0)rest+=25; else if(e.cat==='core'||meas==='Time')rest-=15;
  rest+=(lvl>=7?15:lvl>=5?8:lvl<=2?-5:0);
  rest+=(age>=45?15:age>=35?8:age<=18?-5:0);
  rest=Math.max(25,Math.min(150,Math.round(rest/5)*5));
  const nm=e.accName||e.regName||exName(p,e);
  const base=e.accBase||e.regBase||ladderBase(p,e,(p.exSwaps||{})[e.id]||0);
  var rir=_rp?(' · 🔄 חזרה מהפסקה · שבוע '+returnWeek(p)+'/4 — קל בכוונה · RIR '+_rp.rir):(_mw===4)?' · שבוע דילוד 🪶 (קל)':(_mw===3&&g!=='fat')?' · שבוע שיא 🔺 (העלה משקל, פחות חזרות)':(_mw===2&&g!=='fat')?' · שבוע נפח 📈 (הוסף סט/משקל)':((g==='fat')?'':(lvl>=7?' · RIR 2-3':' · RIR 1-2'));
  var _rd=readiness(p);
  if(_rd!=null){ if(_rd<55){rir+=' · מוכנות נמוכה 😴 (קל יותר)';rest+=10;} else if(_rd>=85&&_mw!==4){rir+=' · מוכנות גבוהה 🔥';} }
  let target,ricon;
  if(meas==='Time'){const s=20+lvl*4;target=s+'-'+(s+15)+' שניות החזקה';ricon='⏱️';}
  else if(showWeights(p)&&!isBW(base)){var _nl=nextLoad(p,base,lo,hi);var _bw=_nl.w||prWeight(p,base)||((p.exWeights&&parseFloat(p.exWeights[base]))||0);var _add=(_mw===3&&!_nl.top?2.5:0);var _w=_bw>0?Math.round((_bw+_add)*2)/2:0;if(_rp&&_w>0)_w=Math.max(1,Math.round(_w*_rp.load*2)/2);var _wt=_w>0?(' · נסה '+_w+' ק״ג'+(_add?' (+2.5 שיא)':'')):' · משקל מאתגר';target=lo+'-'+hi+' חזרות'+_wt+rir;if(_nl.cue)target+=' · '+_nl.cue;if(_nl.e1rm)target+=' · 1RM≈'+_nl.e1rm+' ק״ג';ricon='🏋️';}
  else {var _nr=nextReps(p,base,lo,hi);target=lo+'-'+hi+' חזרות'+rir;if(_nr.last)target+=' · פעם קודמת '+_nr.last;if(_nr.cue)target+=' · '+_nr.cue;ricon='🔁';}
  return {id:e.id,name:nm,cat:e.cat,base:base,catHe:e.catHe,catCls:e.catCls,meas:meas,sets:sets,target:target,restSec:rest,ricon:ricon,
    yt:'https://www.youtube.com/results?search_query='+encodeURIComponent(nm+' technique'),done:0};
}
const WO_FOCUS={upper:['chest','back','core'],lower:['legs','core'],full:['chest','back','legs','core']};
const WO_COUNT={30:5,45:6,60:8,90:10};
const WO_SETDELTA={30:0,45:0,60:0,90:0};
function estMinutes(list){let s=0;list.forEach(function(e){const work=e.meas==='Time'?40:35;s+=e.sets*(work+e.restSec);});return Math.round(s/60)+5;}
function woPrefs(p){const d=p.woPrefs||{};return {duration:d.duration||45,focus:d.focus||'full'};}
function woSplit(p){var dur=woPrefs(p).duration;var warm=({30:4,45:6,60:7,90:10})[dur]||6,cool=({30:3,45:3,60:4,90:5})[dur]||4;return {dur:dur,warm:warm,cool:cool,strength:Math.max(0,dur-warm-cool)};}
function regressFor(e,fl){var c=e.cat;
  if(fl.knee&&c==='legs')return {regBase:'Bodyweight squat',regName:'סקוואט חלקי לכיסא (ידידותי לברך)',regMeas:'Reps'};
  if(fl.shoulder&&c==='chest')return {regBase:'Incline push-ups',regName:'שכיבות שיפוע בטווח חלקי (עומס כתף מופחת)',regMeas:'Reps'};
  if(fl.shoulder&&c==='back')return {regBase:'Seated cable row',regName:'חתירה בישיבה בטווח נוח',regMeas:'Reps'};
  if(fl.back&&(c==='legs'||c==='back'))return {regBase:'Static plank',regName:'פלאנק לייצוב הגב (חלופה בטוחה)',regMeas:'Time'};
  if((fl.wrist||fl.elbow)&&(c==='chest'||c==='back'))return {regBase:'Crunches',regName:'כפיפות בטן (ללא עומס על שורש/מרפק)',regMeas:'Reps'};
  if((fl.wrist||fl.elbow)&&c==='core')return {regBase:'Crunches',regName:'כפיפות בטן (ללא עומס על שורש/מרפק)',regMeas:'Reps'};
  return null;}
function isBW(n){
  var _mv=(typeof MOVE_BY_BASE!=='undefined')&&MOVE_BY_BASE[n];
  if(_mv)return _mv.m!=='משקל 🏋️';        // the library knows; no guessing from the name
  n=(n||'').toLowerCase();if(/dumbbell|barbell|machine|cable|leg press|lat pulldown|goblet|romanian|deadlift|bench press|yoke|weighted/.test(n))return false;return /push-up|pull-up|squat|plank|crunch|dip|lever|pistol|raise|flag|l-sit|handstand|bridge|archer|dragon|chin/.test(n);}
function showWeights(p){return trainStyle(p)!=='calisthenics'&&studioHasWeights(p);}
/* These two are the only places a raw keystroke becomes state without passing
   through the schema in src/store.js, because they are written and read back
   inside one session, before any reload. `parseFloat(v)` being truthy was
   taken as proof the string was a number — it is not: parseFloat('1"><img …')
   is 1, and the whole string was stored and later interpolated into a value=
   attribute. Both now store the number they claim to store. */
function woSaveWeight(base,v){var n=parseFloat(v);commit(function(pp){pp.exWeights=pp.exWeights||{};if(isFinite(n)&&n>0)pp.exWeights[base]=Math.min(2000,n);else delete pp.exWeights[base];});}
/* The skill-tree field saved and then announced, as two statements in an
   attribute; the announcement moves in here so the markup only names a call. */
function woSaveWeightAndSay(base,v){woSaveWeight(base,v);toast(v?'משקל נשמר 💾':'נמחק');}
function woInput(i,k,v){
  if(!WO||!WO.list[i])return;
  if(k==='rir'&&(v===''||v==null)){WO.list[i][k]='';return;}
  var n=parseFloat(v);
  WO.list[i][k]=isFinite(n)?Math.max(0,Math.min(100000,n)):'';
}
function woUndoSwap(i){if(WO&&WO._undo&&WO._undo[i]){WO.list[i]=WO._undo[i];delete WO._undo[i];if(WO._swap)WO._swap[i]=0;renderWorkout();toast('ההחלפה בוטלה ↩');}}
function lastLog(p,base){var a=p.exLog&&p.exLog[base];return a&&a.length?a[a.length-1]:null;}
function prWeight(p,base){var a=p.exLog&&p.exLog[base];if(!a)return 0;return a.reduce(function(m,e){return Math.max(m,parseFloat(e.w)||0);},0);}
function est1RM(w,reps){w=parseFloat(w)||0;reps=parseInt(reps)||0;if(!w||!reps)return 0;if(reps>=12)reps=12;return Math.round(w*(1+reps/30));}
function muscleOf(base){var n=(base||'').toLowerCase();if(/lateral|shoulder|overhead|delt|military|arnold|upright|press-around|face pull/.test(n))return 'shoulders';if(/curl/.test(n)&&!/leg/.test(n))return 'arms';if(/(triceps|pushdown|push-down|skull|kickback|extension)/.test(n)&&!/leg/.test(n))return 'arms';if(/(bench|chest|fly|push-up|pushup|dip|chest press|incline press|decline press)/.test(n))return 'chest';if(/(row|pulldown|pull-up|pullup|lat |chin|deadlift|hyperext|good morning|pull )/.test(n))return 'back';if(/(squat|lunge|leg press|leg extension|leg curl|calf|hip thrust|glute|quad|hamstring|rdl|romanian|step-up|bulgarian)/.test(n))return 'legs';if(/(plank|crunch|core|sit-up|situp|hollow|leg raise|russian|hanging|ab )/.test(n))return 'core';return null;}
function weeklyVolume(p){var now=Date.now(),wk=7*86400000,acc={chest:0,back:0,shoulders:0,arms:0,legs:0,core:0};Object.keys(p.exLog||{}).forEach(function(base){var byName=muscleOf(base);(p.exLog[base]||[]).forEach(function(e){if(now-e.d>wk)return;var mg=byName||e.cat;if(acc[mg]==null)return;acc[mg]+=(parseInt(e.sets)||1);});});return acc;}
function nextReps(p,base,lo,hi){
  var ll=lastLog(p,base);if(!ll||!ll.reps)return {cue:'',last:0};
  var r=parseInt(ll.reps)||0;if(r<=0)return {cue:'',last:0};
  if(r>=hi)return {cue:'🔼 הגעת לראש הטווח — הוסף חזרות או עבור לגרסה קשה יותר בעץ',last:r};
  if(r<lo)return {cue:'⏸️ בסס את הטווח לפני העלאת קושי',last:r};
  return {cue:'➕ נסה להוסיף חזרה',last:r};
}
function nextLoad(p,base,lo,hi){
  var ll=lastLog(p,base);var pw=prWeight(p,base);
  var cur=(p.exWeights&&parseFloat(p.exWeights[base]))||pw||0;
  if(!ll||!parseFloat(ll.w)){return {w:cur,cue:'',e1rm:0,top:false};}
  var lastReps=parseInt(ll.reps)||0,lastW=parseFloat(ll.w)||cur;
  var rir=(ll.rir===''||ll.rir==null)?null:parseInt(ll.rir);
  var e1rm=est1RM(lastW,lastReps);
  var inc=lastW>=40?2.5:1.25;
  var nw=Math.round((lastW+inc)*2)/2,realInc=Math.round((nw-lastW)*100)/100;
  if(lastReps>=hi){return {w:nw,cue:'🔼 התקדמות כפולה: הגעת ל-'+hi+' — עלה +'+realInc+' ק״ג, התחל מ-'+lo,e1rm:e1rm,top:true};}
  if(rir!=null&&rir>=3&&lastReps>=lo){return {w:nw,cue:'💥 נשארו לך '+rir+' חזרות במאגר — קפוץ +'+realInc+' ק״ג כבר עכשיו',e1rm:e1rm,top:true};}
  if(lastReps>0&&lastReps<lo){return {w:lastW,cue:'⏸️ שמור משקל עד '+lo+' חזרות נקיות',e1rm:e1rm,top:false};}
  var extra=(rir!=null&&rir<=0)?' · הגעת לכשל — התקדם בזהירות':'';
  return {w:lastW,cue:'➕ אותו משקל, הוסף חזרה (עד '+hi+')'+extra,e1rm:e1rm,top:false};
}
function woRecord(i,ex){
  var p=P();
  var weighted=showWeights(p)&&ex.meas!=='Time'&&!isBW(ex.base||ex.name);
  var wEl=document.getElementById('wt_'+i),rEl=document.getElementById('rp_'+i);
  var w=weighted?(parseFloat(ex.w||(wEl&&wEl.value))||0):0,reps=parseInt(ex.reps||(rEl&&rEl.value))||0;
  if(!w&&!reps)return;
  var riEl=document.getElementById('ri_'+i);var _rirRaw=(ex.rir!=null&&ex.rir!=='')?ex.rir:(riEl&&riEl.value);var _rir=(_rirRaw===''||_rirRaw==null)?null:parseInt(_rirRaw);
  var pr=prWeight(p,ex.base);
  commit(function(pp){pp.exLog=pp.exLog||{};var a=pp.exLog[ex.base]=pp.exLog[ex.base]||[];a.push({d:Date.now(),w:w,reps:reps,sets:ex.sets,rir:_rir,cat:ex.cat});if(a.length>40)pp.exLog[ex.base]=a.slice(-40);if(w){pp.exWeights=pp.exWeights||{};pp.exWeights[ex.base]=String(w);}});
  if(weighted&&w&&w>pr)toast('🏆 שיא חדש ב'+ex.name+' — '+w+' ק״ג!');
}
function exLogBlock(p,ex,i){
  var isTime=(ex.meas==='Time'), weighted=showWeights(p)&&!isTime&&!isBW(ex.base||ex.name), unit=isTime?'שנ׳':'חזרות';
  var ll=lastLog(p,ex.base),pr=prWeight(p,ex.base);
  var hiM=(ex.target||'').match(/(\d+)\s*-\s*(\d+)/),hi=hiM?+hiM[2]:0,lo=hiM?+hiM[1]:0;
  var prefW=weighted?(ex.w!==undefined&&ex.w!==''?ex.w:((p.exWeights&&p.exWeights[ex.base])||(ll&&ll.w?ll.w:''))):'';
  var prefR=(ex.reps!==undefined&&ex.reps!==''?ex.reps:(ll&&ll.reps?ll.reps:(lo||'')));
  var hint;
  if(ll){
    hint='פעם קודמת: '+(ll.w?ll.w+' ק״ג × ':'')+(ll.reps||'?')+' '+unit;
    if(weighted&&pr)hint+=' · 🏆 שיא '+pr+' ק״ג';
    if(ll.reps&&hi&&ll.reps>=hi)hint+=weighted?' · נסה הפעם +2.5 ק״ג ⬆️':' · העלה קושי/חזרות ⬆️';
    else if(ll.reps)hint+=' · נסה להוסיף '+(isTime?'שניות':'חזרה')+' ⬆️';
  } else if(hi){hint='🎯 היעד '+lo+'-'+hi+' '+unit+' — מילאנו לך אוטומטית, עדכן לפי מה שעשית בפועל';} else hint=weighted?'תיעוד ראשון — רשום משקל וחזרות לעקוב אחר התקדמות':'תיעוד ראשון — רשום '+unit+' לעקוב אחר התקדמות';
  return '<div style="background:var(--card2);border:1px solid var(--line);border-radius:11px;padding:9px 10px;margin:0 0 10px">'+
    '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">'+
      (weighted?'<span class="sub" style="margin:0">🏋️ משקל</span><input class="inp" id="wt_'+i+'" style="width:72px;padding:6px 9px" inputmode="decimal" value="'+esc(prefW)+'" placeholder="ק״ג" data-call="woInput" data-on="input" data-args="'+esc(JSON.stringify([i,'w','$value']))+'">':'')+
      '<span class="sub" style="margin:0">'+unit+'</span>'+
      '<input class="inp" id="rp_'+i+'" style="width:60px;padding:6px 9px" inputmode="numeric" value="'+esc(prefR)+'" placeholder="'+(hi?lo+'-'+hi:'#')+'" data-call="woInput" data-on="input" data-args="'+esc(JSON.stringify([i,'reps','$value']))+'">'+
      (!isTime?'<span class="sub" style="margin:0" title="RIR — כמה חזרות נשארו לך בסוף הסט לפני כשל">💪 כוח שנשאר</span><input class="inp" id="ri_'+i+'" style="width:50px;padding:6px 9px" inputmode="numeric" value="'+(ex.rir!=null&&ex.rir!==''?ex.rir:'')+'" placeholder="0-4" data-call="woInput" data-on="input" data-args="'+esc(JSON.stringify([i,'rir','$value']))+'"><span class="sub" style="margin:0;font-size:11px;opacity:.75">0=כשל · 2=נשארו 2</span>':'')+
    '</div>'+
    '<div class="sub" style="margin:6px 0 0;font-size:12px">'+esc(hint)+'</div>'+
  '</div>';
}
function flattenMoves(groups){var out=[];groups.forEach(function(g){g.items.forEach(function(it){out.push(it);});});return out;}
function safeMoves(groups,fl){var all=flattenMoves(groups);if(!fl||!fl.has)return all;
  var f=all.filter(function(m){var n=m.n||'';
    if(fl.knee&&/(לאנג|רץ|המתיחה הגדולה|סקוואט)/.test(n))return false;
    if(fl.shoulder&&/(חזה דינמית|כתף)/.test(n))return false;
    return true;});
  return f.length?f:all;}
