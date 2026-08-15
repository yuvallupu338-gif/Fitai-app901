/* src/exercise-demos.js — the demo block, the video link, and swapping an exercise for another
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* the clip if one is bundled, otherwise the animated coach doing the pattern */
function demoHTML(ex){
  var base=ex.base||ex.b||'', he=ex.name||ex.n||base;
  var frames=(typeof EXIMG!=='undefined'&&EXIMG[base])||null;
  var pri=[ex.mus||guessMus(ex)],sec=ex.sec||[];
  /* a bundled clip cannot be marked, so the marked figure stands beside it */
  if(frames)return '<div class="demorow">'+exDemo(frames,he)+musFigureHTML(pri,sec)+'</div>';
  var p=P();
  return '<div class="coachstage">'+coachSVG(p.personal.gender,ex.anim||archetype({name:base,cat:MUS_CAT[ex.mus]||'core'}),pri,sec)+
    '<div class="exlabel">'+L('הדגמה מונפשת','Animated demo','Demostración animada')+' · '+esc(he)+'</div></div>';
}
function videoBtn(ex,cls){
  return '<a class="btn b '+(cls||'')+'" style="text-decoration:none" href="'+vidUrl(ex.base||ex.b,ex.name||ex.n)+'" target="_blank" rel="noopener">▶ '+L('סרטון','Video','Vídeo')+'</a>';
}
/* the demo + video sheet any exercise can open */
function openExVideo(base){
  var mv=MOVE_BY_BASE[base];
  var ex=mv?{base:mv.b,name:moveName(mv),mus:mv.pri,sec:mv.sec,anim:mv.anim,mach:mv.mach}:{base:base,name:base,mus:'core'};
  openSheet('<h3>'+musEmo(ex.mus)+' '+esc(ex.name)+'</h3>'+
    '<div class="desc">'+musBadge(ex.mus)+((ex.sec&&ex.sec.length)?'<span class="sub">'+L('גם','also','también')+': '+musList(ex.sec)+'</span>':'')+'</div>'+
    demoHTML(ex)+
    '<div class="row" style="margin-top:10px">'+videoBtn(ex)+'<button class="btn ghost" data-act="close">'+L('סגור','Close','Cerrar')+'</button></div>');
}

/* ---- swapping: same muscle, other options ---- */
function swapCandidates(p,ex){
  var mus=guessMus(ex);
  var used={};(WO&&WO.list||[]).forEach(function(e){if(e.base!==ex.base)used[e.base]=1;});
  var strict=movesFor(p,mus).filter(function(mv){return mv.b!==ex.base&&!used[mv.b];});
  if(strict.length)return {mus:mus,list:strict,relaxed:false};
  /* with a tight kit and a declared injury a muscle can legitimately have no
     clean alternative left. Offering nothing is a dead end, so show what the
     filters removed and label why — the user decides, not us. */
  var fl=injuryFlags(p);
  var wide=MOVES.filter(function(mv){return mv.pri===mus&&mv.b!==ex.base&&!used[mv.b]&&moveOK(p,mv);})
    .map(function(mv){return Object.assign({},mv,{warn:moveConflict(mv,fl)});})
    .sort(function(a,b){return (a.warn?1:0)-(b.warn?1:0)||(b.w-a.w);});
  if(wide.length)return {mus:mus,list:wide,relaxed:true};
  /* A gym with one machine per muscle has no second option at all, and neither
     does a bare floor. Rather than a dead end, show what exists for the muscle
     and name the kit that is missing — as information, without a button that
     would quietly do nothing, since buildSession re-checks the kit anyway. */
  var envs=styleEnvs(trainStyle(p));
  var bound=MOVES.filter(function(mv){
      return mv.pri===mus&&mv.b!==ex.base&&!used[mv.b]&&envs.indexOf(moveEnv(mv))>=0;})
    .map(function(mv){return Object.assign({},mv,{lacks:missingKit(p,mv)});})
    .sort(function(a,b){return a.lacks.length-b.lacks.length||(b.w-a.w);})
    .slice(0,6);
  return {mus:mus,list:bound,relaxed:true,kitBound:true};
}
/* which pieces of kit stand between the user and this movement */
function missingKit(p,mv){
  var have=haveEquip(p),out=[];
  (mv.need||[]).forEach(function(grp){
    if(!grp.some(function(k){return have.indexOf(k)>=0;}))out.push(grp[0]);
  });
  return out;
}
function openSwapSheet(i){
  if(!WO||!WO.list[i])return;
  var p=P(),ex=WO.list[i],res=swapCandidates(p,ex),cands=res.list;
  if(!cands.length){toast(L('אין כרגע חלופה זמינה ל'+musHe(res.mus)+' עם הציוד שלך',
    'No alternative for '+musHe(res.mus)+' with your equipment right now',
    'No hay alternativa para '+musHe(res.mus)+' con tu equipo ahora mismo'));return;}
  openSheet('<h3>⇄ '+L('החלפת תרגיל','Swap exercise','Cambiar ejercicio')+'</h3>'+
    '<div class="desc">'+L('התרגיל הנוכחי','Current exercise','Ejercicio actual')+' — <b data-notr>'+esc(ex.name)+'</b> — '+
    L('עובד על','works','trabaja')+' '+musBadge(res.mus)+
    '<br>'+L('אלה תרגילים אחרים שעובדים על אותו שריר:','Other exercises that train the same muscle:','Otros ejercicios que trabajan el mismo músculo:')+'</div>'+
    (res.kitBound?'<div class="card" style="margin:0 0 10px;padding:10px 12px;border-color:rgba(255,107,61,.4);background:rgba(255,107,61,.06)"><div class="sub" style="margin:0;color:var(--orange2)">'+
      L('עם הציוד שסימנת אין תרגיל אחר ל'+musHe(res.mus)+'. אלה התרגילים שקיימים — ולידם מה שחסר כדי לפתוח אותם. אפשר להוסיף ציוד בהגדרות.',
        'With the kit you ticked there is no other exercise for '+musHe(res.mus)+'. These exist — with what is missing to unlock each. You can add kit in Settings.',
        'Con el equipo que marcaste no hay otro ejercicio para '+musHe(res.mus)+'. Estos existen — con lo que falta para desbloquearlos. Puedes añadir equipo en Ajustes.')+'</div></div>'
    :res.relaxed?'<div class="card" style="margin:0 0 10px;padding:10px 12px;border-color:rgba(255,107,61,.4);background:rgba(255,107,61,.06)"><div class="sub" style="margin:0;color:var(--orange2)">⚠️ '+
      L('אין חלופה שעומדת בכל האילוצים שלך ל'+musHe(res.mus)+'. אלה האפשרויות הקרובות ביותר — בדוק שהן מתאימות לך לפני שאתה בוחר.',
        'Nothing clears every one of your constraints for '+musHe(res.mus)+'. These are the closest options — check they suit you before picking.',
        'Nada cumple todas tus restricciones para '+musHe(res.mus)+'. Estas son las opciones más cercanas — comprueba que te convienen antes de elegir.')+'</div></div>':'')+
    cands.map(function(mv){
      return '<div class="card" style="margin:8px 0">'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          musBadge(mv.pri)+'<b style="flex:1" data-notr>'+esc(moveName(mv))+'</b>'+
        '</div>'+
        (mv.warn?'<div class="sub" style="margin:4px 0 0;color:var(--orange2)">⚠️ '+
          L('עלול להעמיס על ה'+injuryName(mv.warn)+' שציינת',
            'may load the '+injuryName(mv.warn)+' you told us about',
            'puede cargar el/la '+injuryName(mv.warn)+' que indicaste')+'</div>':'')+
        '<div class="sub" style="margin:4px 0 8px">'+(mv.m==='Time'?('⏱️ '+L('החזקה','hold','isométrico')):mv.m==='Reps'?('🔁 '+L('חזרות','reps','reps')):('🏋️ '+L('עם משקל','weighted','con peso')))+
          (mv.sec&&mv.sec.length?(' · '+L('גם','also','también')+' '+musList(mv.sec)):'')+
          (mv.need&&mv.need.length?(' · '+L('דורש','needs','necesita')+' '+mv.need.map(function(g){return g.map(equipName).join('/');}).join(' + ')):(' · '+L('בלי ציוד','no equipment','sin equipo')))+'</div>'+
        ((mv.lacks&&mv.lacks.length)?'<div class="sub" style="margin:0 0 8px;color:var(--orange2)">'+
          L('חסר לך','You are missing','Te falta')+': '+mv.lacks.map(equipName).join(' + ')+'</div>':'')+
        '<div class="row">'+
          ((mv.lacks&&mv.lacks.length)?''
            :'<button class="btn g" data-act="swapPick" data-i="'+i+'" data-b="'+esc(mv.b)+'" style="flex:2">✓ '+L('החלף לזה','Use this one','Usar este')+'</button>')+
          videoBtn({base:mv.b,name:moveName(mv)},'sm')+
          '<button class="btn sm" data-act="exVideo" data-b="'+esc(mv.b)+'" style="flex:1">👁️ '+L('הדגמה','Demo','Demo')+'</button>'+
        '</div>'+
      '</div>';
    }).join('')+
    '<button class="btn ghost" data-act="close">'+L('בטל','Cancel','Cancelar')+'</button>');
}
function applySwap(i,base){
  if(!WO||!WO.list[i])return;
  var p=P(),mv=MOVE_BY_BASE[base];if(!mv)return;
  var old=WO.list[i];
  var lvl=Math.min(10,Math.max(1,(p.fitness&&p.fitness.level)||3));
  var ex=prescribeMove(mv,p,lvl);ex.slot=old.slot;ex.sessKey=old.sessKey;ex.done=0;
  WO._undo=WO._undo||{};if(!WO._undo[i])WO._undo[i]=old;
  WO.list[i]=ex;
  /* remember it for the rest of the week so the same swap is not needed twice */
  if(old.sessKey!=null&&old.slot!=null)commit(function(pp){pp.exPick=pp.exPick||{};pp.exPick[weekKey()+'|'+old.sessKey+'|'+old.slot]=base;});
  closeSheet();renderWorkout();toast(L('הוחלף ל','Swapped to ','Cambiado a ')+moveName(mv)+' ⇄');
}

