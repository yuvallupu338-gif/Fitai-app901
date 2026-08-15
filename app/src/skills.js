/* src/skills.js — the ten-level skill tree: categories, ladders, what each level holds
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* =====================================================================
   STATIC DATA
   ===================================================================== */
const DOW=['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
const DOW_HE=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'];

/* ---- Skill tree progression: 10 levels × 9 exercises ---- */
const CATS=[
  {k:'chest',he:'חזה',cls:'cat-chest'},
  {k:'back',he:'גב',cls:'cat-back'},
  {k:'legs',he:'רגליים',cls:'cat-legs'},
  {k:'core',he:'ליבה',cls:'cat-core'},
];
const PROG={
  chest:['Wall push-ups','Incline push-ups','Knee push-ups','Push-ups','Wide push-ups',
         'Decline push-ups','Pseudo planche push-ups','Archer push-ups','One-arm push-up negative','One-arm push-up !'],
  back:['Prone Y raise','Table row','Ring row','Inverted row','Negative pull-ups',
        'Pull-ups','Wide pull-ups','Archer pull-ups','Muscle-up negative','Muscle-up !'],
  legs:['Chair squat','Bodyweight squat','Split squats','Walking lunge','Jump squat',
        'Bulgarian split squat','Cossack squat','Box pistol squat','Assisted pistol squat','Pistol squat !'],
  core:['Knee plank','Static plank','Crunches','Side plank','Hollow hold',
        'Leg raise','Hanging knee raise','Hanging leg raise','Dragon flag negative','Dragon flag !'],
};
const MEASTYPE={chest:'Reps',back:'Reps',legs:'Reps',core:'Time'};

/* the gym ladder: the same four categories, rung by rung from a machine you
   sit down at to a lift that owns the room. Every name here is a movement in
   the library, so the demo, the muscle marks and the video all resolve. */
const PROG_GYM={
  chest:['Machine chest press','Machine pec deck','Dumbbell floor press','Dumbbell bench press','Cable chest fly',
         'Dumbbell incline press','Barbell bench press','Barbell floor press','Decline barbell press','Weighted dips !'],
  back:['Machine row','Lat pulldown','Seated cable row','Straight-arm pulldown','Dumbbell row',
        'One-arm dumbbell row','T-bar row','Barbell row','Pendlay row','Weighted pull-up !'],
  legs:['Leg extension','Leg press','Lying leg curl','Goblet squat','Hack squat',
        'Dumbbell lunge','Romanian deadlift','Dumbbell Bulgarian split squat','Barbell squat','Conventional deadlift !'],
  core:['Machine crunch','Dumbbell side bend','Cable crunch','Pallof press',"Captain's chair leg raise",
        'Weighted decline sit-up',"Farmer's carry",'Weighted plank','Barbell rollout','Weighted hanging leg raise !']
};
/* which ladder each half of a level climbs: hybrid takes one of each */
function progFor(p){
  var st=trainStyle(p);
  return st==='gym'?{a:PROG_GYM,b:PROG_GYM}
       : st==='hybrid'?{a:PROG,b:PROG_GYM}
       : {a:PROG,b:PROG};
}
/* the gym half of the accessory pool */
const ACCESSORY_GYM={
  chest:[{n:'פרפר בכבלים',b:'Cable chest fly',m:'משקל 🏋️'},{n:'פרפר עם משקולות יד',b:'Dumbbell fly',m:'משקל 🏋️'},{n:'מכונת פק-דק',b:'Machine pec deck',m:'משקל 🏋️'}],
  back:[{n:'משיכת פולי בידיים ישרות',b:'Straight-arm pulldown',m:'משקל 🏋️'},{n:'פרפר הפוך',b:'Reverse fly',m:'משקל 🏋️'},{n:'משיכת פנים בכבל',b:'Face pull',m:'משקל 🏋️'}],
  legs:[{n:'מכונת פשיטת ברך',b:'Leg extension',m:'משקל 🏋️'},{n:'מכונת כפיפת ברך בישיבה',b:'Seated leg curl',m:'משקל 🏋️'},{n:'הרמות עקב בישיבה',b:'Seated calf raise',m:'משקל 🏋️'}],
  core:[{n:'כפיפות בטן בכבל',b:'Cable crunch',m:'משקל 🏋️'},{n:'לחיצת פאלוף',b:'Pallof press',m:'Time'},{n:'הליכת החקלאי',b:"Farmer's carry",m:'משקל 🏋️'}]
};
function accFor(p,cat){
  var st=trainStyle(p);
  var bw=ACCESSORY[cat]||[],gy=ACCESSORY_GYM[cat]||[];
  return st==='gym'?gy:st==='hybrid'?bw.concat(gy):bw;
}
/* Which ladder a given slot climbed. Three places used to reach straight into
   PROG to recover an exercise's base name, which on a gym or hybrid tree
   answered with the bodyweight rung — wrong demo, wrong video, wrong muscles,
   and no kilo field on a movement that takes one. */
function ladderFor(p,e){
  var pr=progFor(p),m=/^L\d+_(\d+)$/.exec((e&&e.id)||'');
  var slot=m?+m[1]:0;
  return (slot>=4&&slot<8)?pr.b:pr.a;
}
function ladderBase(p,e,sw){
  var lad=ladderFor(p,e),arr=lad[e.cat]||PROG[e.cat]||[];
  return (arr[(((e.baseIdx||0)+(sw||0))%10+10)%10]||'').replace(' !','');
}
function levelExercises(lvl){
  const order=['chest','back','legs','core','chest','back','legs','core','core'];
  const idx=lvl-1, pr=progFor(P()), mixed=pr.a!==pr.b;
  return order.map((cat,i)=>{
    const c=CATS.find(x=>x.k===cat);
    const ladder=(i>=4&&i<8)?pr.b:pr.a;
    const name=ladder[cat][Math.min(idx,9)];
    /* on a single-ladder tree the second four are variations of the same rung;
       on a hybrid tree they are the gym ladder, which is not a variation of
       anything and should say its own name */
    const variant=(i>=4&&i<8)?(mixed?'':' (variation)'):(i===8?' — finisher':'');
    const base=name.replace(' !','');
    const mv=(typeof MOVE_BY_BASE!=='undefined')&&MOVE_BY_BASE[base];
    return {id:'L'+lvl+'_'+i, cat, catHe:c.he, catCls:c.cls, name:base+variant,
      meas:(mv&&mv.m)||MEASTYPE[cat], peak:name.includes('!'), baseIdx:Math.min(idx,9)};
  });
}
function levelUnlocked(lvl){
  if(lvl<=1)return true;
  const prev=levelExercises(lvl-1);
  const done=prev.filter(e=>P().skills[e.id]==='done').length;
  return done>=5;
}

/* ---- Nutrition recipe bank ---- */
