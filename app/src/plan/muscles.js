/* src/plan/muscles.js — the muscle vocabulary, recovery windows and the recovery card
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---- the muscle vocabulary the rest of the app speaks ---- */
/* rec = how many hours that muscle wants before it is worth training hard
   again, as a range. The big movers ask for two to three days, the small ones
   for one to two. It is a range and not a number because recovery moves with
   how hard the session was, and with sleep, food, age and training age —
   recAdj() below is where those move it. */
const MUS={
  chest     :{he:'חזה',        en:'Chest',      es:'Pecho',       emo:'🫁', cls:'cat-chest', rec:[48,72]},
  back      :{he:'גב',         en:'Back',       es:'Espalda',     emo:'🪶', cls:'cat-back',  rec:[48,72]},
  shoulders :{he:'כתפיים',     en:'Shoulders',  es:'Hombros',     emo:'🏔️', cls:'cat-sh',   rec:[24,48]},
  biceps    :{he:'יד קדמית',   en:'Biceps',     es:'Bíceps',      emo:'💪', cls:'cat-arm',  rec:[24,48]},
  triceps   :{he:'יד אחורית',  en:'Triceps',    es:'Tríceps',     emo:'🦾', cls:'cat-arm',  rec:[24,48]},
  quads     :{he:'ירך קדמית',  en:'Quads',      es:'Cuádriceps',  emo:'🦵', cls:'cat-legs', rec:[48,72]},
  hamstrings:{he:'ירך אחורית', en:'Hamstrings', es:'Isquiotibiales', emo:'🦿', cls:'cat-legs', rec:[48,72]},
  glutes    :{he:'ישבן',       en:'Glutes',     es:'Glúteos',     emo:'🍑', cls:'cat-legs', rec:[48,72]},
  calves    :{he:'שוקיים',     en:'Calves',     es:'Gemelos',     emo:'🦶', cls:'cat-legs', rec:[24,48]},
  core      :{he:'בטן וליבה',  en:'Core',       es:'Core',        emo:'🧱', cls:'cat-core', rec:[24,48]}
};
function musHe(k){var m=MUS[k];return m?L(m.he,m.en,m.es):k;}
/* split names are stored in all three languages and resolved on render, so
   switching language re-labels the week without a reload */
function sessName(s){return s?L(s.he,s.en,s.es):'';}
function musCls(k){return (MUS[k]&&MUS[k].cls)||'cat-core';}
function musEmo(k){return (MUS[k]&&MUS[k].emo)||'•';}
function musBadge(k){return '<span class="catbadge '+musCls(k)+'" data-notr>'+musHe(k)+'</span>';}
function musList(arr){return (arr||[]).map(musHe).join(' · ');}

/* ---- recovery ---------------------------------------------------------
   A muscle that was worked hard yesterday is not ready to be worked hard
   today, and how long it needs depends on which muscle it is. MUS.rec holds
   that window; the profile remembers when each muscle was last trained; and
   the two together decide whether a muscle is sore, usable or fully back. */
const MS_H=3600000;
function musRec(k){var m=MUS[k];return (m&&m.rec)||[24,48];}
/* The chart's own footnote: the window moves with training intensity, sleep,
   food, age and training age. Age and training age are the two the app
   actually knows about, so those are the two that move it. */
function recAdj(p){
  var a=(p&&p.personal&&p.personal.age)||0,f=1;
  if(a>=60)f+=.25;else if(a>=50)f+=.18;else if(a>=40)f+=.10;
  var lv=(p&&p.fitness&&p.fitness.level)||1;
  f-=Math.min(.15,(lv-1)*.02);                 // a trained body clears a session faster
  return Math.round(Math.max(.8,Math.min(1.45,f))*100)/100;
}
function musWindow(p,k){var r=musRec(k),f=recAdj(p);return {lo:Math.round(r[0]*f),hi:Math.round(r[1]*f)};}
/* hours since that muscle was last trained, or null if it never has been */
function musSince(p,k){
  var t=p&&p.musLast&&p.musLast[k];
  if(!t||t>Date.now())return null;
  return (Date.now()-t)/MS_H;
}
/* sore  — inside the minimum, do not load it hard again yet
   ready — past the minimum, still inside the range: fine to train
   fresh — past the maximum, fully recovered                          */
function musState(p,k){
  var h=musSince(p,k),w=musWindow(p,k);
  if(h==null)return {state:'fresh',h:null,lo:w.lo,hi:w.hi,left:0,pct:100};
  return {state:h<w.lo?'sore':h<w.hi?'ready':'fresh',h:h,lo:w.lo,hi:w.hi,
    left:Math.max(1,Math.ceil(w.lo-h)),pct:Math.max(0,Math.min(100,Math.round(h/w.hi*100)))};
}
function recLabel(st){return st==='sore'?L('בהתאוששות','Recovering','Recuperando')
  :st==='ready'?L('אפשר להתאמן','Good to train','Listo para entrenar')
  :L('התאושש','Recovered','Recuperado');}
function recColor(st){return st==='sore'?'var(--orange2)':st==='ready'?'var(--blue2)':'var(--green2)';}
function hoursTxt(n){return L(n+' ש׳',n+'h',n+' h');}
/* stamp what a finished session touched. What the session was built around
   takes the full hit; what it only assisted starts half-way recovered, and a
   muscle's clock only ever moves forward. */
function markMuscles(pp,list){
  if(!pp.musLast)pp.musLast={};
  var now=Date.now();
  sessionMuscles(list).forEach(function(k){pp.musLast[k]=now;});
  sessionSecondary(list).forEach(function(k){
    // half of *this profile's* window, not half of the baseline — everything
    // else in the model scales with age and training age, and an assisting
    // muscle that starts at 24h of a 59h window is being credited 41%, not the
    // half the rule says.
    var soft=now-musWindow(pp,k).lo*MS_H/2;
    if(!pp.musLast[k]||pp.musLast[k]<soft)pp.musLast[k]=soft;
  });
}
/* the muscles in this session that have not served their minimum yet */
function soreInSession(p,list){
  return sessionMuscles(list).map(function(k){return {k:k,s:musState(p,k)};})
    .filter(function(r){return r.s.state==='sore';});
}
function soreWarnHTML(p,list){
  var sore=soreInSession(p,list);
  if(!sore.length)return '';
  return '<div class="sub" style="margin:6px 0 0;color:var(--orange2)">⏳ '+
    L('עדיין בהתאוששות','Still recovering','Aún en recuperación')+': <b>'+
    sore.map(function(r){return musHe(r.k)+' ('+L('עוד ','','')+hoursTxt(r.s.left)+')';}).join(' · ')+
    '</b> — '+L('לך קל יותר על השריר הזה היום, או החלף את התרגילים שלו.',
      'go easier on it today, or swap its exercises.',
      've más suave hoy o cambia sus ejercicios.')+'</div>';
}
/* ---- the recovery card ----
   Nothing at all while everything has cleared; one chip per muscle that is
   still inside its window; and the whole table behind the fold, because it is
   reference material and not something you need on every visit. */
function recoveryHTML(p){
  var order=Object.keys(MUS);
  var known=order.map(function(k){return {k:k,s:musState(p,k)};}).filter(function(r){return r.s.h!=null;});
  var sore=known.filter(function(r){return r.s.state==='sore';}).sort(function(a,b){return b.s.left-a.s.left;});
  var body;
  if(!known.length){
    body='<div class="sub">'+L('אחרי האימון הראשון יופיע כאן כמה זמן כל שריר צריך לפני שכדאי לעבוד עליו שוב.',
      'After your first session this shows how long each muscle needs before it is worth working it again.',
      'Tras tu primera sesión aquí verás cuánto necesita cada músculo antes de volver a trabajarlo.')+'</div>';
  }else if(!sore.length){
    body='<div class="sub" style="color:var(--green2);font-weight:700">✅ '+
      L('כל השרירים התאוששו — אפשר להתאמן על הכל.','Every muscle has recovered — anything is fair game.',
        'Todos los músculos se han recuperado: puedes entrenar cualquiera.')+'</div>';
  }else{
    body='<div class="chips">'+sore.map(function(r){
      return '<span class="chip" style="border-color:'+recColor('sore')+';color:'+recColor('sore')+'">'+
        musEmo(r.k)+' '+musHe(r.k)+' · '+hoursTxt(r.s.left)+'</span>';}).join('')+'</div>'+
      '<div class="sub" style="margin:6px 0 0">'+L('שאר השרירים מוכנים.','The rest are ready.','El resto están listos.')+'</div>';
  }
  return '<div class="card">'+
    '<h2>🕒 '+L('התאוששות שרירים','Muscle recovery','Recuperación muscular')+'</h2>'+body+
    '<details style="margin-top:8px"><summary class="recsum">'+
      L('כמה זמן צריך כל שריר','How long each muscle needs','Cuánto necesita cada músculo')+'</summary>'+
      '<div style="margin-top:4px">'+order.map(function(k){
        var w=musWindow(p,k),st=musState(p,k);
        return '<div class="recrow">'+musBadge(k)+
          '<span class="sub" style="margin:0;flex:1;text-align:end">'+w.lo+'–'+w.hi+' '+L('שעות','hours','horas')+'</span>'+
          (st.h==null?'':'<span class="sub" style="margin:0;color:'+recColor(st.state)+';font-weight:700">'+recLabel(st.state)+'</span>')+
        '</div>';}).join('')+'</div>'+
      '<div class="sub" style="margin-top:8px;line-height:1.6">'+
        L('זמן ההתאוששות משתנה לפי עצימות האימון, שינה, תזונה, גיל ורמת הכושר. אם השריר עדיין כואב מאוד או חלש — תן לו עוד זמן להתאושש.',
          'Recovery time moves with how hard you trained, and with sleep, nutrition, age and fitness level. If a muscle is still very sore or weak, give it more time.',
          'El tiempo de recuperación varía según la intensidad, el sueño, la nutrición, la edad y el nivel de forma. Si el músculo sigue muy dolorido o débil, dale más tiempo.')+
        (recAdj(p)!==1?' <b style="color:var(--teal2)">'+L('החלון שלמעלה כבר מותאם לגיל ולרמה שלך.',
          'The window above is already tuned to your age and level.',
          'La ventana de arriba ya está ajustada a tu edad y nivel.')+'</b>':'')+'</div>'+
    '</details>'+
  '</div>';
}
/* the exercise's own name per language; the English base doubles as the
   English name, and Spanish falls back to it rather than leaking Hebrew */
function moveName(mv){return mv?L(mv.n,mv.ne||mv.b,mv.ns||mv.b):'';}
/* the coarse bucket prescribe() still uses for its sets/rest arithmetic */
const MUS_CAT={chest:'chest',shoulders:'chest',triceps:'chest',back:'back',biceps:'back',
  quads:'legs',hamstrings:'legs',glutes:'legs',calves:'legs',core:'core'};

