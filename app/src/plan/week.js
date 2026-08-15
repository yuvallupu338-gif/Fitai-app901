/* src/plan/week.js — the week, written out
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---- the week, written out ----
   One line per day: the day, what it is, and the muscles it trains. Everything
   else — the exercises, the counts, the start button — waits behind the fold.
   It used to be a card per day, each repeating the same counts and carrying its
   own legend, which made the week the tallest thing on the screen. */
function weekPlanHTML(p){
  var days=trainingDays(p),sp=splitFor(p),today=new Date().getDay();
  if(!days.length)return '<div class="card"><h2>'+L('התוכנית השבועית','Your weekly plan','Tu plan semanal')+'</h2>'+
    '<div class="empty">'+L('עוד לא בחרת ימי אימון — בחר ימים והתוכנית תיבנה מיד.',
      'You have not picked training days yet — pick them and the plan builds itself.',
      'Aún no has elegido días de entreno — elígelos y el plan se construye solo.')+'</div>'+
    '<button class="btn p" data-act="dayPicker" style="width:100%">'+L('בחר ימי אימון','Pick training days','Elegir días')+'</button></div>';
  return '<div class="card">'+
    '<h2>'+L('התוכנית השבועית שלך','Your weekly plan','Tu plan semanal')+'</h2>'+
    '<div class="sub" style="margin:0 0 4px">'+days.map(dowName).join(' · ')+' · '+
      L('מתחדשת כל שבוע','refreshes every week','se renueva cada semana')+
      (planRefreshed(p)?' · <b style="color:var(--teal2)">'+L('התחדשה השבוע','refreshed this week','renovado esta semana')+'</b>':'')+'</div>'+
    (function(){var w=weekRecoveryWarn(p);if(!w.length)return '';
      return '<div class="sub" style="margin:0 0 6px;color:var(--orange2)">⏳ '+
        L('הימים שבחרת חוזרים לשרירים האלה מוקדם מדי','The days you picked come back to these muscles too soon',
          'Los días que elegiste vuelven a estos músculos demasiado pronto')+': <b>'+
        w.map(function(r){return musHe(r.k)+' ('+hoursTxt(r.short)+')';}).join(' · ')+'</b></div>';})()+
    days.map(function(dow,i){
      var sess=Object.assign({},sp[i%sp.length],{dow:dow,idx:i});
      var list=buildSession(p,sess),mus=sessionMuscles(list);
      var isToday=dow===today;
      return '<details class="dayrow'+(isToday?' now':'')+'">'+
        '<summary>'+
          '<span class="dayhead">'+dowName(dow)+' — '+sessName(sess)+
            (isToday?' <span class="daynow">'+L('היום','today','hoy')+'</span>':'')+'</span>'+
          '<span class="daymus">'+musList(mus)+'</span>'+
        '</summary>'+
        '<div class="daybody">'+
          list.map(function(e){
            return '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 0;border-top:1px solid var(--line)">'+
              musBadge(e.mus)+'<span style="flex:1;min-width:0;overflow-wrap:anywhere;font-size:13px" data-notr>'+esc(e.name)+'</span>'+
              '<span class="sub" style="margin:0;font-size:12px">'+e.sets+'×</span>'+
              '<button class="btn sm" data-act="exVideo" data-b="'+esc(e.base)+'" style="flex:none;padding:8px 9px">'+L('סרטון','Video','Vídeo')+'</button>'+
            '</div>';
          }).join('')+
          '<div class="sub" style="margin:8px 0 0">'+list.length+' '+L('תרגילים','exercises','ejercicios')+' · '+sessionSets(list)+' '+L('סטים','sets','series')+' · '+woPrefs(p).duration+' '+L('דק׳','min','min')+'</div>'+
          (isToday?'<button class="btn grad" style="margin-top:8px" data-act="startWorkout">'+L('התחל את האימון הזה','Start this session','Empezar esta sesión')+'</button>'
                  :'<button class="btn p" style="margin-top:8px" data-act="startDay" data-d="'+dow+'">'+L('אימון '+dowName(dow),dowName(dow)+' session','Sesión del '+dowName(dow).toLowerCase())+'</button>')+
        '</div>'+
      '</details>';
    }).join('')+
    '<div class="row" style="margin-top:12px">'+
      '<button class="btn b" data-act="dayPicker" style="flex:1">'+L('שנה ימים','Change days','Cambiar días')+'</button>'+
      '<button class="btn ghost" data-act="refreshPlan" style="flex:1">'+L('החלף אימונים','Swap the workouts','Cambiar los entrenos')+'</button>'+
    '</div>'+
  '</div>';
}

