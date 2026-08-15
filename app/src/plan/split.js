/* src/plan/split.js — the weekly split, one plan per calendar week
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---- the weekly split, decided by how many days you picked ---- */
const SPLITS={
  1:[{k:'full', he:'גוף מלא', en:'Full body', es:'Cuerpo completo',            emo:'⚡', mus:['chest','back','quads','core']}],
  2:[{k:'upper',he:'פלג גוף עליון', en:'Upper body', es:'Tren superior',      emo:'💪', mus:['chest','back','shoulders','biceps','triceps']},
     {k:'lower',he:'פלג גוף תחתון + בטן', en:'Lower body + core', es:'Tren inferior + core', emo:'🦵', mus:['quads','hamstrings','glutes','calves','core']}],
  3:[{k:'push', he:'דחיפה', en:'Push', es:'Empuje',              emo:'🫁', mus:['chest','shoulders','triceps']},
     {k:'pull', he:'משיכה', en:'Pull', es:'Tirón',              emo:'🪶', mus:['back','biceps']},
     {k:'legs', he:'רגליים + בטן', en:'Legs + core', es:'Piernas + core',       emo:'🦵', mus:['quads','hamstrings','glutes','calves','core']}],
  4:[{k:'chest_tri',he:'חזה + יד אחורית', en:'Chest + triceps', es:'Pecho + tríceps', emo:'🫁', mus:['chest','triceps']},
     {k:'back_bi',  he:'גב + יד קדמית', en:'Back + biceps', es:'Espalda + bíceps',   emo:'🪶', mus:['back','biceps']},
     {k:'legs',     he:'רגליים', en:'Legs', es:'Piernas',          emo:'🦵', mus:['quads','hamstrings','glutes','calves']},
     {k:'sh_core',  he:'כתפיים + בטן', en:'Shoulders + core', es:'Hombros + core',    emo:'🏔️', mus:['shoulders','core']}],
  5:[{k:'chest_tri',he:'חזה + יד אחורית', en:'Chest + triceps', es:'Pecho + tríceps', emo:'🫁', mus:['chest','triceps']},
     {k:'back_bi',  he:'גב + יד קדמית', en:'Back + biceps', es:'Espalda + bíceps',   emo:'🪶', mus:['back','biceps']},
     {k:'legs',     he:'רגליים', en:'Legs', es:'Piernas',          emo:'🦵', mus:['quads','hamstrings','glutes','calves']},
     {k:'shoulders',he:'כתפיים + בטן', en:'Shoulders + core', es:'Hombros + core',    emo:'🏔️', mus:['shoulders','core']},
     /* core here would land the day after the shoulders day, inside its 24h
        window — and past 40, or below level 5, that window is longer than 24h,
        so the week warned about itself. Calves were last touched on leg day. */
     {k:'arms_calf',he:'ידיים + שוקיים', en:'Arms + calves', es:'Brazos + gemelos',    emo:'💪', mus:['biceps','triceps','calves']}],
  6:[{k:'push', he:'דחיפה', en:'Push', es:'Empuje',              emo:'🫁', mus:['chest','shoulders','triceps']},
     {k:'pull', he:'משיכה', en:'Pull', es:'Tirón',              emo:'🪶', mus:['back','biceps']},
     {k:'legs', he:'רגליים', en:'Legs', es:'Piernas',             emo:'🦵', mus:['quads','hamstrings','glutes','calves']},
     {k:'push2',he:'דחיפה — נפח', en:'Push — volume', es:'Empuje — volumen',        emo:'🫁', mus:['chest','shoulders','triceps']},
     {k:'pull2',he:'משיכה — נפח', en:'Pull — volume', es:'Tirón — volumen',        emo:'🪶', mus:['back','biceps']},
     {k:'legs2',he:'רגליים + בטן', en:'Legs + core', es:'Piernas + core',       emo:'🦵', mus:['quads','glutes','hamstrings','core']}],
  7:[{k:'push', he:'דחיפה', en:'Push', es:'Empuje',              emo:'🫁', mus:['chest','shoulders','triceps']},
     {k:'pull', he:'משיכה', en:'Pull', es:'Tirón',              emo:'🪶', mus:['back','biceps']},
     {k:'legs', he:'רגליים', en:'Legs', es:'Piernas',             emo:'🦵', mus:['quads','hamstrings','glutes','calves']},
     {k:'push2',he:'דחיפה — נפח', en:'Push — volume', es:'Empuje — volumen',        emo:'🫁', mus:['chest','shoulders','triceps']},
     {k:'pull2',he:'משיכה — נפח', en:'Pull — volume', es:'Tirón — volumen',        emo:'🪶', mus:['back','biceps']},
     /* Core came out of this day: with seven training days there is no spacing
        left to arrange, so a muscle on two days running is the split's doing
        and not the user's. Core lives on the last day alone now, and glutes
        stay off it — they were worked here, one day earlier. */
     {k:'legs2',he:'רגליים — נפח', en:'Legs — volume', es:'Piernas — volumen',       emo:'🦵', mus:['quads','glutes','hamstrings']},
     {k:'core', he:'ליבה וניידות', en:'Core & mobility', es:'Core y movilidad',       emo:'🧱', mus:['core','calves']}]
};
function trainingDays(p){
  var d=(p&&p.workout&&p.workout.days)||[];
  return d.slice().sort(function(a,b){return a-b;});
}
/* the split the user is actually on — their own edit wins over the default */
function splitFor(p){
  var n=Math.max(1,Math.min(7,trainingDays(p).length||3));
  var custom=p&&p.splitOverride;
  if(custom&&custom.n===n&&Array.isArray(custom.days)&&custom.days.length===n)return custom.days;
  return SPLITS[n];
}
/* Does the week itself ask for a muscle again before it has recovered? The
   splits are laid out so it does not, but the days are the user's to pick and
   a clustered week can still collide. Two passes, so the wrap from the last
   training day of one week back to the first of the next counts too. */
function weekRecoveryWarn(p){
  var days=trainingDays(p),sp=splitFor(p);
  if(days.length<2)return [];
  var last={},warn={};
  for(var w=0;w<2;w++)for(var i=0;i<days.length;i++){
    var t=(w*7+days[i])*24;
    ((sp[i%sp.length]||{}).mus||[]).forEach(function(k){
      if(w>0&&last[k]!=null){
        var gap=t-last[k],lo=musWindow(p,k).lo;
        if(gap<lo)warn[k]=Math.max(warn[k]||0,Math.round(lo-gap));
      }
      last[k]=t;
    });
  }
  return Object.keys(warn).map(function(k){return {k:k,short:warn[k]};});
}
/* calendar weekday -> that day's session, or null on a rest day */
function sessionForDow(p,dow){
  var days=trainingDays(p),i=days.indexOf(dow);
  if(i<0)return null;
  var sp=splitFor(p);
  return Object.assign({},sp[i%sp.length],{dow:dow,idx:i});
}
function todaySession(p){return sessionForDow(p,new Date().getDay());}
/* the next session due, so a rest day still knows what is coming */
function nextSession(p){
  var today=new Date().getDay();
  for(var k=0;k<7;k++){var s=sessionForDow(p,(today+k)%7);if(s)return {s:s,inDays:k};}
  return null;
}

/* ---- one plan per calendar week, refreshed on its own ---- */
function isoWeekKey(ts){
  var d=new Date(ts);d.setHours(0,0,0,0);
  d.setDate(d.getDate()+4-(d.getDay()||7));                 // Thursday of this ISO week
  var y=d.getFullYear(), jan1=new Date(y,0,1);
  var wk=Math.ceil(((d-jan1)/86400000+1)/7);
  return y+'-W'+(wk<10?'0':'')+wk;
}
function weekKey(){return isoWeekKey(Date.now());}
function hashStr(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=(h*16777619)>>>0;}return h>>>0;}
/* changes once a week on its own; the refresh button nudges it in between */
function planSeed(p){return (hashStr(weekKey())+((p&&p.planShuffle)||0)*7919)>>>0;}
/* the badge stays up for the whole week the plan turned over in */
function planRefreshed(p){return !!(p&&p.planRolledAt&&isoWeekKey(p.planRolledAt)===weekKey());}
function markPlanWeek(){var p=P();if(p&&!p.planWeekSeen)commit(function(pp){pp.planWeekSeen=weekKey();});}

/* an exercise that did not come from the library still has to name a muscle */
function guessMus(ex){
  if(ex&&ex.mus)return ex.mus;
  var mv=MOVE_BY_BASE[(ex&&ex.base)||''];if(mv)return mv.pri;
  var m=(typeof muscleOf==='function')&&muscleOf((ex&&ex.base)||(ex&&ex.name)||'');
  if(m==='arms')return 'biceps';
  if(m==='legs')return 'quads';
  if(m&&MUS[m])return m;
  return {chest:'chest',back:'back',legs:'quads',core:'core'}[(ex&&ex.cat)||'core']||'core';
}
/* once a week, on the first visit of the new week, say the plan turned over */
function weekRollover(p){
  if(!p)return;
  var wk=weekKey();
  if(!p.planWeekSeen){commit(function(pp){pp.planWeekSeen=wk;});return;}   // first ever run — nothing to announce
  if(p.planWeekSeen===wk)return;
  commit(function(pp){pp.planWeekSeen=wk;pp.planShuffle=0;pp.exPick={};pp.planRolledAt=Date.now();});
  try{toast(L('🔄 שבוע חדש — האימונים שלך התחדשו','🔄 New week — your workouts have been refreshed','🔄 Semana nueva — tus entrenos se han renovado'));}catch(e){}
  try{render();}catch(e){}
}
