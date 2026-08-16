/* src/plan/session.js — building one session out of the library, honouring kit and injuries
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";

/* ---- what the user actually has to train with ---- */
function haveEquip(p){
  var e=p&&p.workout&&p.workout.equipment;
  var have=Array.isArray(e)?e.slice():[];
  // Saying "gym" is the answer to the equipment question, so nothing in a gym
  // has to be ticked: the bar, the dip station and the whole gym kit come with
  // the choice. Only calisthenics builds from what was actually ticked.
  if(trainStyle(p)!=='calisthenics'){
    ['bar','dip'].concat(KIT_GYM.map(function(k){return k[0];}))
      .forEach(function(k){if(have.indexOf(k)<0)have.push(k);});
  }
  return have;
}
/* the kit gate on its own — the style gate is separate so the safety net below
   can relax one without relaxing the other */
function kitOK(p,mv){
  var have=haveEquip(p),need=mv.need||[];
  for(var i=0;i<need.length;i++){
    var grp=need[i],ok=false;
    for(var j=0;j<grp.length;j++)if(have.indexOf(grp[j])>=0){ok=true;break;}
    if(!ok)return false;
  }
  return true;
}
function moveOK(p,mv){
  return styleEnvs(trainStyle(p)).indexOf(moveEnv(mv))>=0&&kitOK(p,mv);
}
/* injury screening speaks the same language as the rest of the app */
function moveConflict(mv,fl){
  return exerciseConflict({name:mv.b,cat:MUS_CAT[mv.pri]||'core'},fl);
}
/* every candidate for one muscle, hardest-appropriate first */
function movesFor(p,mus,opts){
  opts=opts||{};
  var lvl=Math.min(10,Math.max(1,(p.fitness&&p.fitness.level)||3)),fl=injuryFlags(p);
  var out=MOVES.filter(function(mv){
    if(mv.pri!==mus)return false;
    if(mv.lvl>lvl+1)return false;
    if(!moveOK(p,mv))return false;
    if(!opts.allowInjured&&moveConflict(mv,fl))return false;
    return true;
  });
  if(!out.length){                                    // nothing legal — fall back to the gentlest option
    out=MOVES.filter(function(mv){return mv.pri===mus&&moveOK(p,mv)&&mv.lvl<=2;});
  }
  /* Last resort: a gym whose kit is a bench and nothing else has no barbell
     row in it, and an empty screen is a worse answer than a bodyweight one.
     Only the style gate is relaxed here — the kit and the injuries still hold,
     so what comes back is something the user can actually do. */
  if(!out.length&&trainStyle(p)==='gym'){
    out=MOVES.filter(function(mv){
      return mv.pri===mus&&moveEnv(mv)==='bw'&&kitOK(p,mv)&&mv.lvl<=Math.max(2,lvl)&&
             (opts.allowInjured||!moveConflict(mv,fl));});
  }
  return out.sort(function(a,b){return (b.w-a.w)||(b.lvl-a.lvl);});
}
/* 2 = compound, 1 = accessory. Picking tier by tier is what keeps a wall sit
   from opening a leg day. There is no load, so there is no third tier. */
function moveTier(p,mv){return (mv.w||1)<2?1:2;}

/* ---- turn a library entry into a prescribed exercise ---- */
function prescribeMove(mv,p,lvl){
  var cat=MUS_CAT[mv.pri]||'core';
  var shape={id:'MV_'+mv.b,cat:cat,catHe:musHe(mv.pri),catCls:musCls(mv.pri),
             meas:mv.m,accName:moveName(mv),accBase:mv.b,baseIdx:0,name:mv.b};
  var ex=prescribe(shape,p,lvl);
  ex.mus=mv.pri; ex.sec=mv.sec||[]; ex.anim=mv.anim||archetype({name:mv.b,cat:cat});
  ex.catHe=musHe(mv.pri); ex.catCls=musCls(mv.pri); ex.mach=mv.mach||'';
  ex.yt=vidUrl(mv.b,mv.n);
  return ex;
}

/* ---- build one session ---- */
function slotKey(p,sess,slot){return weekKey()+'|'+sess.k+'|'+slot;}
function buildSession(p,sess){
  if(!sess)return [];
  var lvl=Math.min(10,Math.max(1,(p.fitness&&p.fitness.level)||3));
  var pr=woPrefs(p), count=WO_COUNT[pr.duration]||6;
  var rp=returnPlan(p); if(rp)count=Math.max(3,count-rp.cut);
  var seed=planSeed(p), picks=[], used={};
  /* rotate through the day's muscles so nothing is starved, and rotate the
     entry point into each muscle's list once a week */
  var pools=sess.mus.map(function(mus,mi){
    var tiers={2:[],1:[]};
    movesFor(p,mus).forEach(function(mv){tiers[moveTier(p,mv)].push(mv);});
    var list=[];
    [2,1].forEach(function(tk,ti){
      var arr=tiers[tk];
      if(arr.length>1){var r=(seed+mi*31+ti*7)%arr.length;arr=arr.slice(r).concat(arr.slice(0,r));}
      list=list.concat(arr);                    // heaviest tier first, rotated within its own tier
    });
    return {mus:mus,list:list};
  });
  var round=0;
  while(picks.length<count&&round<12){
    var added=false;
    for(var i=0;i<pools.length&&picks.length<count;i++){
      var pool=pools[i].list,mv=null;
      for(var j=0;j<pool.length;j++){if(!used[pool[j].b]){mv=pool[j];break;}}
      if(!mv)continue;
      used[mv.b]=1; picks.push(mv); added=true;
    }
    if(!added)break; round++;
  }
  /* A day can come up short for two different reasons: a strict injury filter
     (a hurt shoulder removes every press from a push day) or a thin kit (a gym
     with dumbbells and nothing else has one core movement at level 1). Rather
     than hand over a two-exercise session, top it up by widening in steps —
     each step gives up the least it can, and the kit and the injuries are never
     given up at all. */
  var fl2=injuryFlags(p);
  function topUp(pool){
    for(var k=0;k<pool.length&&picks.length<count;k++){
      if(!used[pool[k].b]){used[pool[k].b]=1;picks.push(pool[k]);}
    }
  }
  // 1. core work is safe and needs nothing
  if(picks.length<count&&sess.mus.indexOf('core')<0)topUp(movesFor(p,'core'));
  // 2. the same muscles and core, above the level cap — core is included here
  //    so a gym crunch is reached before step 3 borrows a bodyweight plank
  if(picks.length<count){
    var over=[];
    sess.mus.concat(['core']).forEach(function(mus){
      MOVES.forEach(function(mv){
        if(mv.pri===mus&&!used[mv.b]&&moveOK(p,mv)&&!moveConflict(mv,fl2))over.push(mv);});});
    topUp(over.sort(function(a,b){return a.lvl-b.lvl;}));
  }
  // 3. a gym profile borrows from the bodyweight pool its kit already allows
  if(picks.length<count&&trainStyle(p)==='gym'){
    var bw=[];
    sess.mus.concat(['core']).forEach(function(mus){
      MOVES.forEach(function(mv){
        if(mv.pri===mus&&moveEnv(mv)==='bw'&&!used[mv.b]&&kitOK(p,mv)&&!moveConflict(mv,fl2))bw.push(mv);});});
    topUp(bw.sort(function(a,b){return a.lvl-b.lvl;}));
  }
  // 4. anything left for these muscles that the kit allows, injuries flagged
  if(picks.length<count){
    var last=[];
    sess.mus.concat(['core']).forEach(function(mus){
      MOVES.forEach(function(mv){
        if(mv.pri===mus&&!used[mv.b]&&moveOK(p,mv))last.push(mv);});});
    topUp(last.sort(function(a,b){return a.lvl-b.lvl;}));
  }
  /* "Both" says every session is built from bodyweight and gym movements
     together, and picking purely by tier then level made that true about nine
     times in ten — a hybrid leg day at level 10 came out all bodyweight. If a
     session ends up one-sided, the lowest-priority pick gives way to the best
     candidate from the missing side. */
  if(trainStyle(p)==='hybrid'&&picks.length){
    var envsIn={};picks.forEach(function(mv){envsIn[moveEnv(mv)]=1;});
    var missing=envsIn.bw?(envsIn.gym?null:'gym'):'bw';
    if(missing){
      var want=null;
      sess.mus.forEach(function(mus){
        if(want)return;
        movesFor(p,mus).forEach(function(mv){
          if(want||used[mv.b]||moveEnv(mv)!==missing)return;
          want=mv;
        });
      });
      if(want){
        var drop=picks.pop();delete used[drop.b];
        used[want.b]=1;picks.push(want);
      }
    }
  }

  /* whatever the user swapped in this week wins over the generated pick */
  var out=picks.map(function(mv,slot){
    var chosen=(p.exPick||{})[slotKey(p,sess,slot)];
    if(chosen&&MOVE_BY_BASE[chosen]&&MOVE_BY_BASE[chosen].pri===mv.pri&&moveOK(p,MOVE_BY_BASE[chosen]))mv=MOVE_BY_BASE[chosen];
    var ex=prescribeMove(mv,p,lvl); ex.slot=slot; ex.sessKey=sess.k; return ex;
  });
  return out;
}
/* the muscles a built session really covers, in the app's canonical order */
function sessionMuscles(list){
  var seen={},out=[];
  (list||[]).forEach(function(e){if(!seen[e.mus]){seen[e.mus]=1;out.push(e.mus);}});
  return out;
}
function sessionSets(list){return (list||[]).reduce(function(a,e){return a+e.sets;},0);}
/* what a session hits indirectly: every exercise's secondary muscles, minus
   anything already trained directly */
function sessionSecondary(list){
  var pri={},seen={},out=[];
  (list||[]).forEach(function(e){pri[e.mus]=1;});
  (list||[]).forEach(function(e){(e.sec||[]).forEach(function(k){
    if(pri[k]||seen[k]||!MUS[k])return; seen[k]=1; out.push(k);});});
  return out;
}
/* the marked figure plus a legend that decodes its two shades of red.
   Exactly one of these is on the home screen — the weekly list names its
   muscles in words, because one figure reads and four is wallpaper. */
function musBreakdownHTML(pri,sec){
  return '<div class="musrow">'+
    musFigureHTML(pri,sec,'')+
    '<div class="musleg">'+
      '<div class="musleg-row"><i class="musdot pri"></i><span>'+
        '<b>'+L('עיקריים','Primary','Principales')+'</b> · '+musList(pri)+'</span></div>'+
      (sec.length?('<div class="musleg-row"><i class="musdot sec"></i><span>'+
        '<b>'+L('משניים','Secondary','Secundarios')+'</b> · '+musList(sec)+
        ' <span class="sub" style="margin:0">('+L('נעזרים באימון','assisting','asisten')+')</span></span></div>'):'')+
    '</div></div>';
}

/* ---- marking the worked muscles on the coach ------------------------
   The figure is a simple front-facing cartoon, so these marks are
   indicative rather than anatomical — the badge beside it carries the
   precise name. Limb marks are emitted inside the animated <g> for that
   limb so they move with it; torso marks sit in the body group.
   Coordinates follow coachSVG's 200x250 viewBox.                        */
const MUS_MARK={
  chest     :{fig:'<path d="M80,97 Q90,93 99,96 L99,116 Q88,119 81,112 Z"/><path d="M120,97 Q110,93 101,96 L101,116 Q112,119 119,112 Z"/>'},
  back      :{fig:'<path d="M77,96 L84,99 L86,133 Q79,126 77,112 Z"/><path d="M123,96 L116,99 L114,133 Q121,126 123,112 Z"/>'},
  core      :{fig:'<rect x="88" y="118" width="24" height="31" rx="7"/>'},
  glutes    :{fig:'<path d="M82,143 Q100,137 118,143 L118,157 Q100,164 82,157 Z"/>'},
  shoulders :{armL:'<circle cx="75" cy="99" r="8.5"/>',            armR:'<circle cx="125" cy="99" r="8.5"/>'},
  biceps    :{armL:'<rect x="69" y="104" width="11" height="19" rx="5.5"/>', armR:'<rect x="120" y="104" width="11" height="19" rx="5.5"/>'},
  triceps   :{armL:'<rect x="69" y="124" width="11" height="19" rx="5.5"/>', armR:'<rect x="120" y="124" width="11" height="19" rx="5.5"/>'},
  quads     :{legL:'<rect x="84" y="152" width="14" height="25" rx="7"/>',   legR:'<rect x="102" y="152" width="14" height="25" rx="7"/>'},
  hamstrings:{legL:'<rect x="84" y="176" width="14" height="15" rx="7"/>',   legR:'<rect x="102" y="176" width="14" height="15" rx="7"/>'},
  calves    :{legL:'<rect x="84" y="190" width="14" height="18" rx="7"/>',   legR:'<rect x="102" y="190" width="14" height="18" rx="7"/>'}
};
/* the marks for one slot of the figure: primary muscles solid, the rest faint */
function musMarks(slot,pri,sec){
  var out='',seen={};
  (pri||[]).forEach(function(k){var m=MUS_MARK[k];if(!m||!m[slot]||seen[k])return;seen[k]=1;out+='<g class="mus pri">'+m[slot]+'</g>';});
  (sec||[]).forEach(function(k){var m=MUS_MARK[k];if(!m||!m[slot]||seen[k])return;seen[k]=1;out+='<g class="mus sec">'+m[slot]+'</g>';});
  return out;
}
/* a small marked figure to stand next to a photo or clip, which cannot be marked.
   cap==='' drops the caption: beside a written-out legend the picture needs no
   label, and the label was wide enough to stretch the column it sits in. */
function musFigureHTML(pri,sec,cap){
  var p=P();
  return '<div class="musmap">'+coachSVG(p.personal.gender,'idle',pri,sec)+
    (cap===''?'':'<div class="exlabel">'+(cap||L('שרירים בעבודה','Muscles worked','Músculos trabajados'))+'</div>')+
    '</div>';
}

/* ---- demos and videos: every exercise gets both ---- */
function vidUrl(base,he){
  var q=(base||he||'')+' proper form technique';
  return 'https://www.youtube.com/results?search_query='+encodeURIComponent(q);
}
