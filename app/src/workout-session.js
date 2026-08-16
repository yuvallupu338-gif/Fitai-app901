/* src/workout-session.js — the guided session: warm-up, main work, cool-down, and the coach view
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
function pickedWorkout(p){var fl=injuryFlags(p),lvl=Math.min(10,Math.max(1,p.fitness.level)),out=[];(p.woPicks||[]).forEach(function(pk){var e=levelExercises(pk.lvl).find(function(x){return x.id===pk.id;});if(!e)return;if(exerciseConflict(e,fl)){var rg=regressFor(e,fl);if(!rg)return;e=Object.assign({},e,rg);}out.push(prescribe(e,p,lvl));});return out;}
function openWorkout(customList,forcedDow){
  markPlanWeek();                                              // stable inside the week, new one next week
  const p=P();
  var sess=(forcedDow!=null)?sessionForDow(p,forcedDow):todaySession(p);
  if(!sess&&!(customList&&customList.length)){var _nx=nextSession(p);sess=_nx&&_nx.s;}
  const list=(customList&&customList.length)?customList:buildSession(p,sess);
  if(!list.length){toast('אין תרגילים זמינים כרגע — בדוק את ימי האימון והציוד שלך');return;}
  const sp=woSplit(p), wmin=sp.warm, cmin=sp.cool;
  WO={phase:'warmup', sess:sess, list:list, warmup:safeMoves(STRETCH.dynamic,injuryFlags(p)), cooldown:safeMoves(STRETCH.static,injuryFlags(p)),
      warmupSec:wmin*60, cooldownSec:cmin*60, phaseLeft:wmin*60, wIdx:0, restIdx:-1, restLeft:0, moveLeft:35, paused:false, _t:Date.now()};
  try{_woLastFocus=document.activeElement;}catch(_){}
  $('modal').classList.add('open');
  try{setTimeout(function(){var b=$('modalSheet').querySelector('button');if(b)b.focus();},60);}catch(_){}
  clearInterval(woTimer);
  woTimer=setInterval(function(){
    if(!WO)return;
    var now=Date.now();
    if(WO._t==null)WO._t=now;
    var dt=Math.floor((now-WO._t)/1000);
    if(dt<=0)return;                       // sub-second tick — nothing has elapsed yet
    WO._t+=dt*1000;                        // keep the remainder so it is not lost
    if(WO.phase==='warmup'||WO.phase==='cooldown'){
      if(WO.paused)return;                 // _t already moved, so a pause banks no time
      var moves=WO.phase==='warmup'?WO.warmup:WO.cooldown, slot=WO.phase==='warmup'?35:40;
      if(WO.moveLeft==null)WO.moveLeft=slot;
      WO.phaseLeft-=dt; WO.moveLeft-=dt;
      var el=document.getElementById('woPhaseNum'); if(el)el.textContent=fmt(Math.max(0,WO.phaseLeft));
      var ml=document.getElementById('woMoveLeft'); if(ml)ml.textContent=Math.max(0,WO.moveLeft);
      if(WO.moveLeft<=0&&moves.length){
        // a long gap can cross several moves at once, so step by however many
        var k=Math.floor(-WO.moveLeft/slot)+1;
        WO.wIdx=(WO.wIdx+k)%moves.length; WO.moveLeft+=k*slot; renderWorkout();
      }
      if(WO.phaseLeft<=0){
        if(WO.phase==='warmup'){
          var over=-WO.phaseLeft;          // time already spent past the warm-up carries on
          WO.phase='building';WO.phaseLeft=30-over;WO.wIdx=0;WO.moveLeft=null;WO.paused=false;
          if(WO.phaseLeft<=0){WO.phase='main';WO.phaseLeft=0;}
          renderWorkout();
        } else {finishSession();}
      }
    } else if(WO.phase==='building'){
      WO.phaseLeft-=dt; var el=document.getElementById('woPhaseNum'); if(el)el.textContent=Math.max(0,WO.phaseLeft);
      if(WO.phaseLeft<=0){WO.phase='main'; renderWorkout();}
    } else if(WO.phase==='main'){
      if(WO.restLeft>0){
        WO.restLeft-=dt;
        var el=document.getElementById('woRestNum'); if(el)el.textContent=Math.max(0,WO.restLeft);
        if(WO.restLeft<=0){WO.restLeft=0;WO.restIdx=-1; try{navigator.vibrate&&navigator.vibrate(200);}catch(e){} woAnnounce('סיום מנוחה — סט הבא'); renderWorkout();}
      }
    }
  },1000);
  renderWorkout();
}
function woNow(){if(WO)WO._t=Date.now();}
function fmt(s){s=Math.max(0,s|0);var m=Math.floor(s/60),x=s%60;return m+':'+(x<10?'0':'')+x;}
function coachStageSimple(p,anim,cap){return '<div class="coachstage">'+coachSVG(p.personal.gender,anim)+'<div class="sub" style="margin:2px 0 0;text-align:center">'+esc(cap)+'</div></div>';}
function notepadStage(cap){
  var reduce=false;try{reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){}
  var W=6;
  // the ink: a bold title line + 4 squiggle rows, written right-to-left (Hebrew style)
  var ink='M156,68 L112,68 M148,92 q-9,-6 -18,0 t-19,0 t-19,0 M148,116 q-9,-6 -18,0 t-19,0 t-19,0 M148,140 q-9,-6 -18,0 t-19,0 t-19,0 M148,164 q-9,-6 -18,0 t-19,0 t-19,0';
  var rows=[92,116,140,164];
  // checkbox + tick per row (tick pops when its line is done being written)
  var boxes=rows.map(function(y,i){
    var t=[0.30,0.47,0.64,0.805][i];
    var tickAnim=reduce?'':'<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;'+(t-0.01).toFixed(3)+';'+t.toFixed(3)+';0.9;0.94;1" dur="'+W+'s" repeatCount="indefinite"/>';
    return '<rect x="156" y="'+(y-8)+'" width="13" height="13" rx="3.5" fill="none" stroke="#c9c2b0" stroke-width="1.6"/>'+
      '<path d="M159,'+(y-1)+' l3.2,3.4 l6,-7.2" stroke="#D9FF3D" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"'+(reduce?'':' opacity="0"')+'>'+tickAnim+'</path>';
  }).join('');
  // sequential writing: one path per line, staggered time windows (pen speed is length-proportional)
  var segs=[
    {d:'M156,68 L112,68',len:44,a:0,b:0.125},
    {d:'M148,92 q-9,-6 -18,0 t-19,0 t-19,0',len:60,a:0.125,b:0.294},
    {d:'M148,116 q-9,-6 -18,0 t-19,0 t-19,0',len:60,a:0.294,b:0.463},
    {d:'M148,140 q-9,-6 -18,0 t-19,0 t-19,0',len:60,a:0.463,b:0.632},
    {d:'M148,164 q-9,-6 -18,0 t-19,0 t-19,0',len:60,a:0.632,b:0.8}
  ];
  var inkLines=segs.map(function(g){
    var an=reduce?'':'<animate attributeName="stroke-dashoffset" values="'+g.len+';'+g.len+';0;0;'+g.len+'" keyTimes="0;'+g.a+';'+g.b+';0.94;1" dur="'+W+'s" repeatCount="indefinite"/>';
    return '<path d="'+g.d+'" fill="none" stroke="#2f3d55" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"'+(reduce?'':' stroke-dasharray="'+g.len+'" stroke-dashoffset="'+g.len+'"')+'>'+an+'</path>';
  }).join('');
  var inkFade=reduce?'':'<animate attributeName="opacity" values="1;1;1;0;0;1" keyTimes="0;0.8;0.9;0.93;0.99;1" dur="'+W+'s" repeatCount="indefinite"/>';
  // the coach's hand holding a pen — its TIP rides exactly along the ink path
  var pen='<g'+(reduce?' transform="translate(74,164)"':'')+'>'+
    (reduce?'':'<animateMotion dur="'+W+'s" repeatCount="indefinite" keyPoints="0;1;1;0" keyTimes="0;0.8;0.97;1" calcMode="linear" path="'+ink+'"/>')+
    '<g transform="rotate(-34)">'+
      '<polygon points="0,0 -3.2,-9 3.2,-9" fill="#1f2733"/>'+
      '<rect x="-3.5" y="-38" width="7" height="30" rx="3.5" fill="#D9FF3D" stroke="#8FA827" stroke-width="1"/>'+
      '<rect x="-3.5" y="-16.5" width="7" height="7" fill="#8FA827"/>'+
      '<ellipse cx="1" cy="-24" rx="9" ry="7.5" fill="#e7b693"/>'+
      '<ellipse cx="-4.5" cy="-17" rx="3.4" ry="4.8" fill="#e7b693" transform="rotate(16 -4.5 -17)"/>'+
      '<path d="M-4,-30 q5,-4 10,0" stroke="#d4a07b" stroke-width="1.4" fill="none" stroke-linecap="round"/>'+
      '<rect x="-9" y="-42" width="20" height="10" rx="5" fill="#D9FF3D"/>'+
    '</g></g>';
  var svg='<svg class="npsvg" viewBox="0 0 240 210" xmlns="http://www.w3.org/2000/svg">'+
    '<ellipse cx="120" cy="201" rx="70" ry="6.5" fill="rgba(0,0,0,.32)"/>'+
    '<g>'+
      '<rect x="54" y="26" width="132" height="170" rx="13" fill="#242c39" stroke="#3b4452" stroke-width="2"/>'+
      '<rect x="62" y="44" width="116" height="144" rx="6" fill="#f7f3e7"/>'+
      '<rect x="97" y="17" width="46" height="18" rx="6" fill="#4b5565"/>'+
      '<rect x="112" y="10" width="16" height="11" rx="5.5" fill="none" stroke="#5d6878" stroke-width="3"/>'+
      '<g stroke="#8f8873" stroke-width="2" stroke-linecap="round"><line x1="72" y1="62" x2="88" y2="62"/><line x1="72" y1="57" x2="72" y2="67"/><line x1="88" y1="57" x2="88" y2="67"/></g>'+
      rows.map(function(y){return '<line x1="70" y1="'+(y+6)+'" x2="170" y2="'+(y+6)+'" stroke="#e6dfcb" stroke-width="1.2"/>';}).join('')+
      boxes+
      '<g>'+inkFade+inkLines+'</g>'+
    '</g>'+pen+'</svg>';
  return '<div class="coachstage">'+svg+'<div class="sub" style="margin:6px 0 0;text-align:center">'+esc(cap)+'</div></div>';
}

function woStepper(ph){var order={warmup:0,building:0,main:1,cooldown:2},cur=(ph in order)?order[ph]:1,labels=['חימום','אימון','מתיחות'];
  return '<div style="display:flex;gap:6px;margin:0 0 10px">'+labels.map(function(s,i){return '<div style="flex:1;text-align:center;font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:9px 2px;border-radius:99px;background:'+(i<=cur?'var(--accent-wash2)':'var(--card2)')+';color:'+(i<=cur?'var(--accent)':'var(--muted2)')+';border:1px solid '+(i===cur?'var(--accent-line2)':'var(--line)')+'">'+(i+1)+'. '+s+'</div>';}).join('')+'</div>';}
function finishSession(){clearInterval(woTimer);var _done=(WO&&WO.list)||[];WO=null;closeModal();commit(function(pp){pp.workouts+=1;pp.xp+=50;pp.history.push(Date.now());markMuscles(pp,_done);if(pp.history.length>365)pp.history=pp.history.slice(-365);markActive(pp);var st=streakDays(pp);if(st>(pp.bestStreak||0))pp.bestStreak=st;});xpBurst('+50 XP');render();toast('כל הכבוד! האימון הושלם 🏆 +50 XP');}
function renderPhase(kind){
  var p=P(),fem=p.personal.gender==='נקבה';
  var moves=kind==='warmup'?WO.warmup:WO.cooldown, m=moves[Math.min(WO.wIdx,moves.length-1)], anim=kind==='warmup'?'core':'idle';
  var slot=kind==='warmup'?35:40, moveLeft=(WO.moveLeft==null?slot:Math.max(0,WO.moveLeft));
  $('modalSheet').innerHTML='<div class="grab"></div>'+woStepper(kind)+
    '<h3>'+(kind==='warmup'?'🔥 חימום עם המאמן':'🧘 מתיחות עם המאמן')+'</h3>'+
    '<div class="desc">'+(fem?'המאמנת מבצעת איתך':'המאמן מבצע איתך')+' · '+(kind==='warmup'?'מכינים את הגוף':'משחררים ומתאוששים')+'</div>'+
    (m.gif?'<div class="coachstage">'+exDemo(m.gif,m.n)+'<div class="sub" style="margin:7px 0 0;text-align:center">'+(kind==='warmup'?(fem?'המאמנת מחממת איתך':'המאמן מחמם איתך'):(fem?'המאמנת מותחת איתך':'המאמן מותח איתך'))+' · '+esc(m.n)+'</div></div>':coachStageSimple(p,anim,(fem?'המאמנת ':'המאמן ')+(kind==='warmup'?(fem?'מחממת':'מחמם'):(fem?'מותחת':'מותח'))+' איתך'))+
    '<div style="text-align:center;margin:6px 0 4px"><div style="font-size:42px;font-weight:900;color:var(--teal2)"><span id="woPhaseNum">'+fmt(WO.phaseLeft)+'</span></div><div class="sub">זמן שנותר</div></div>'+
    '<div class="card glow" style="margin:8px 0"><b style="font-size:16px">▶ '+esc(m.n)+'</b><div style="color:var(--orange2);font-weight:800;margin:3px 0;font-size:13px">'+esc(m.d)+' · ⏱️ מתחלף בעוד <span id="woMoveLeft">'+moveLeft+'</span> שנ׳</div><p style="margin:4px 0 0;color:var(--muted);font-size:13.5px">'+esc(m.t)+'</p></div>'+
    '<div class="row" style="margin:0 0 8px"><button class="btn sm" data-act="woPause">'+(WO.paused?'▶️ המשך':'⏸️ השהה')+'</button><button class="btn sm b" data-act="woExtend">+20 שנ׳</button><button class="btn sm o" data-act="woNextMove">⏭️ הבא</button></div>'+'<div class="sub" style="margin:8px 2px 4px">הרצף המלא:</div>'+
    moves.map(function(x,i){return '<div class="stretch" style="'+(i===WO.wIdx?'border-color:var(--teal);background:rgba(217,255,61,.06)':'')+'"><div class="sh"><b>'+(i+1)+'. '+esc(x.n)+'</b><span class="dur">'+esc(x.d)+'</span></div></div>';}).join('')+
    (kind==='warmup'?'<button class="btn grad" data-act="woNext">✓ סיימתי חימום — בנה לי אימון</button><button class="btn ghost" data-act="woNext">⏭️ דלג על החימום (בנה אימון)</button>':'<button class="btn grad" data-act="woFinish">🏆 סיים אימון (+50 XP)</button>')+
    '<button class="btn ghost" data-act="woClose">סגור</button>';
  bindActs($('modalSheet'));
}
function renderBuilding(){
  var p=P(),fem=p.personal.gender==='נקבה',pr=woPrefs(p);
  $('modalSheet').innerHTML='<div class="grab"></div>'+woStepper('building')+
    '<h3>🔧 '+(fem?'המאמנת מרכיבה':'המאמן מרכיב')+' לך אימון · ~30 שניות</h3>'+
    '<div class="desc">מותאם לרמה '+p.fitness.level+' · '+pr.duration+' דק׳ — שונה מהפעם הקודמת</div>'+
    (function(){var sp=woSplit(p);return '<div class="sub" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:6px 0 2px"><span>🔥 '+sp.warm+' דק׳ חימום</span><span>🏋️ '+sp.strength+' דק׳ כוח</span><span>🧘 '+sp.cool+' דק׳ מתיחות</span></div>';})()+
    notepadStage((fem?'המאמנת בונה':'המאמן בונה')+' תוכנית מותאמת...')+
    '<div class="buildbars"><i></i><i></i><i></i><i></i><i></i></div>'+
    '<div style="text-align:center;font-size:32px;font-weight:900;color:var(--teal2);margin:8px 0"><span id="woPhaseNum">'+WO.phaseLeft+'</span> שנ׳</div>'+
    '<button class="btn p" data-act="woSkipToMain">דלג — אני מוכן 💪</button>';
  bindActs($('modalSheet'));
}
function renderWorkout(){
  if(!WO)return;
  if(WO.phase==='warmup'||WO.phase==='cooldown')renderPhase(WO.phase);
  else if(WO.phase==='building')renderBuilding();
  else renderMain();
  try{translateEl($('modalSheet'));}catch(e){}
}
function renderMain(){
  const p=P();
  const curIdx=WO.list.findIndex(e=>e.done<e.sets);
  const coAnim=(WO.restIdx>=0)?'idle':(curIdx>=0?archetype(WO.list[curIdx]):'idle');
  const fem=(p.personal.gender==='נקבה');
  const total=WO.list.reduce((a,e)=>a+e.sets,0), done=WO.list.reduce((a,e)=>a+e.done,0);
  const pct=total?Math.round(done/total*100):0, allDone=WO.list.every(e=>e.done>=e.sets);
  $('modalSheet').innerHTML='<div class="grab"></div>'+woStepper('main')+
    '<h3>🏋️ האימון שלך</h3>'+
    (WO.sess?('<div class="card" style="margin:6px 0;padding:10px 12px;border-color:rgba(217,255,61,.35);background:rgba(217,255,61,.06)">'+
      '<div style="font-weight:800;font-size:15px">'+WO.sess.emo+' '+esc(sessName(WO.sess))+'</div>'+
      '<div class="sub" style="margin:4px 0 6px">🎯 '+L('השרירים באימון הזה','Muscles in this session','Músculos de esta sesión')+': <b style="color:var(--teal2)">'+musList(sessionMuscles(WO.list))+'</b></div>'+
      '<div class="chips">'+sessionMuscles(WO.list).map(function(k){return '<span class="chip p sm">'+musEmo(k)+' '+musHe(k)+'</span>';}).join('')+'</div>'+
    '</div>'):'')+
    '<div class="desc">'+L('מותאם לרמה','Tuned to level','Ajustado al nivel')+' '+p.fitness.level+' · '+WO.list.length+' '+L('תרגילים','exercises','ejercicios')+' · '+goalLabel(p.goal)+' · 🔁 '+mesoLabel(p)+'</div>'+(injuryNote(p)?'<div class="card" style="border-color:rgba(255,107,61,.4);background:rgba(255,107,61,.06);margin:6px 0;padding:10px 12px"><div class="sub" style="margin:0;color:var(--orange2)">⚠️ '+injuryNote(p)+'</div></div>':'')+coachStage(p,coAnim,curIdx)+
    '<div class="pbar"><i style="width:'+pct+'%"></i></div>'+
    '<div class="gauge" style="margin:6px 2px 12px"><span>'+done+'/'+total+' סטים הושלמו</span><span style="color:var(--teal2);font-weight:800">'+pct+'%</span></div>'+
    WO.list.map(function(ex,i){
      const resting=WO.restIdx===i, exDone=ex.done>=ex.sets;
      return '<div class="card" style="margin:10px 0;'+(exDone?'border-color:rgba(217,255,61,.45)':'')+'">'+
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'+
          '<span class="catbadge '+ex.catCls+'">'+ex.catHe+'</span>'+
          '<b style="flex:1;font-size:15px" data-notr>'+(i+1)+'. '+esc(ex.name)+' '+(exDone?'<span style="color:var(--teal2)">✓</span>':'')+'</b>'+'<button class="btn sm" data-act="coachDemo" data-n="'+esc(ex.name)+'" data-anim="'+(ex.anim||archetype(ex))+'" data-base="'+esc(ex.base||'')+'" style="flex:none;padding:6px 10px">🏋️ הדגמה</button>'+
        '</div>'+
        '<div class="sub" style="margin:4px 0 2px">'+ex.ricon+' <b>'+ex.sets+' סטים</b> × '+esc(ex.target)+' &nbsp;·&nbsp; 😮‍💨 מנוחה '+ex.restSec+' שנ׳</div>'+
        '<div class="sub" style="margin:0 0 8px;font-size:12px">🎯 '+L('עובד על','works','trabaja')+' <b style="color:var(--teal2)">'+musHe(ex.mus||guessMus(ex))+'</b>'+((ex.sec&&ex.sec.length)?(' · '+L('גם','also','también')+' '+musList(ex.sec)):'')+'</div>'+exLogBlock(p,ex,i)+
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'+
          Array.from({length:ex.sets}).map(function(_,s){return '<span style="width:32px;height:32px;border-radius:9px;display:grid;place-items:center;font-weight:800;font-size:13px;border:1px solid '+(s<ex.done?'var(--teal)':'var(--line2)')+';background:'+(s<ex.done?'rgba(217,255,61,.18)':'var(--card2)')+';color:'+(s<ex.done?'var(--teal2)':'var(--muted)')+'">'+(s+1)+'</span>';}).join('')+
        '</div>'+
        (resting?'<div style="text-align:center;background:rgba(217,255,61,.08);border:1px solid rgba(217,255,61,.3);border-radius:14px;padding:12px;margin-bottom:10px"><div role="timer" aria-label="זמן מנוחה" style="font-size:30px;font-weight:900;color:var(--teal2)"><span id="woRestNum">'+WO.restLeft+'</span> שנ׳</div><div class="sub" style="margin:2px 0 8px">מנוחה — התכונן לסט הבא</div><button class="btn sm p" style="width:auto;margin:0" data-act="woSkipRest">⏭ דלג</button></div>':'')+
        '<div class="row">'+
          (!exDone?'<button class="btn g" data-act="woSet" data-i="'+i+'" style="flex:2">✓ סיימתי סט '+Math.min(ex.done+1,ex.sets)+'/'+ex.sets+'</button>':'<button class="btn" data-act="woUndo" data-i="'+i+'" style="flex:2;opacity:.7">↩ בטל סט</button>')+
          '<a class="btn b" style="flex:1;text-decoration:none" href="'+(ex.yt||vidUrl(ex.base,ex.name))+'" target="_blank" rel="noopener">▶ '+L('סרטון','Video','Vídeo')+'</a>'+
          '<button class="btn sm" data-act="woSwap" data-i="'+i+'" style="flex:1">⇄ '+L('החלף תרגיל','Swap exercise','Cambiar ejercicio')+'</button>'+
          ((WO._undo&&WO._undo[i])?'<button class="btn sm ghost" data-act="woUndoSwap" data-i="'+i+'" style="flex:1">↩ בטל החלפה</button>':'')+
        '</div>'+
      '</div>';
    }).join('')+
    (allDone?'<button class="btn grad" data-act="woToCooldown">➡️ המשך למתיחות עם המאמן</button>':'<button class="btn p" data-act="woToCooldown">דלג למתיחות →</button>')+
    '<button class="btn ghost" data-act="woClose">סגור בלי לסיים</button>'+
    '<div class="disclaimer">חמם לפני, שמור על טכניקה נכונה, ועצור אם מרגיש כאב. המידע אינו ייעוץ רפואי.</div>';
  bindActs($('modalSheet'));
}

/* ---------- coach ---------- */
function coachView(){
  const p=P(),sl=strengthLevel(p),t=targets(p),rd=readiness(p);
  const mastered=Object.values(p.skills).filter(s=>s==='done').length;
  openSheet(`
    <h3>💪 מאמן אישי</h3>
    <div class="desc">${L('ניתוח אישי של','Personal analysis for','Analisis personal de')} <span data-notr>${esc(p.name)}</span></div>
    <div class="grid">
      <div class="stat o"><div class="v">${p.workouts}</div><div class="l">אימונים</div></div>
      <div class="stat p"><div class="v">${sl}</div><div class="l">כוח</div></div>
      <div class="stat g"><div class="v">${mastered}</div><div class="l">תרגילים שנשלטו</div></div>
    </div>
    <div class="card" style="margin:12px 0 0">
      <b>📋 ההמלצה של המאמן</b>
      <div class="sub" style="margin-top:6px">
        ${p.workouts<3?'בוא נבנה רצף — נסה להשלים 3 אימונים השבוע כדי לפתוח את מד המוכנות.':
        rd!==null&&rd<60?'המוכנות שלך נמוכה — שקול יום מנוחה או אימון קל היום.':
        'אתה בכיוון מצוין! המשך לסמן תרגילים בעץ הכישורים ולעקוב אחר התזונה.'}
        <br><br>היעד הקלורי שלך: <b>${num(t.cal)} קל׳</b> · חלבון <b>${t.protein} ג׳</b>.
      </div>
    </div>
    <button class="btn ghost" data-act="close">סגור</button>
  `);
}

