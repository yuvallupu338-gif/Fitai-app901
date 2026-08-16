/* src/store.js — localStorage with a backup copy, the profile factory, schema migration
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* =====================================================================
   FitAI — application logic (vanilla JS, no dependencies, local-only)
   ===================================================================== */

/* ---------- storage with dual-layer backup ---------- */
const KEY='fitai_v1';
const store={
  read(){
    function _p(k){try{var r=localStorage.getItem(k);return r?JSON.parse(r):null;}catch(e){return null;}}
    var d=_p(KEY); if(d&&typeof d==='object'&&d.profiles)return d;
    var b=_p(KEY+'_bk'); if(b&&typeof b==='object'&&b.profiles)return b;   // corrupt primary -> backup
    return d||b||null;
  },
  write(data){
    try{
      const s=JSON.stringify(data);
      localStorage.setItem(KEY,s);
      localStorage.setItem(KEY+'_bk',s);            // dual layer auto-backup
    }catch(e){
      if(e&&(e.name==='QuotaExceededError'||/quota/i.test(e.message||''))){
        try{
          // first, only clear the bulky restore-points of the ACTIVE profile (most likely culprit)
          var act=data.profiles&&data.active&&data.profiles[data.active];
          if(act)act.restorePoints=[];
          var s2=JSON.stringify(data);
          try{localStorage.setItem(KEY,s2);}catch(_q){
            // still too big — trim long arrays everywhere but PRESERVE restore points of other profiles
            Object.values(data.profiles||{}).forEach(function(p){
              if(p.history&&p.history.length>180)p.history=p.history.slice(-180);
              if(p.measurements&&p.measurements.length>180)p.measurements=p.measurements.slice(-180);
              if(p.weights&&p.weights.length>180)p.weights=p.weights.slice(-180);});
            s2=JSON.stringify(data);localStorage.setItem(KEY,s2);
          }
          localStorage.setItem(KEY+'_bk',s2);
          try{if(typeof toast==='function')toast('האחסון התמלא — נוקו גיבויים ישנים');}catch(_e){}
        }catch(e2){try{if(typeof toast==='function')toast('⚠️ האחסון מלא — ייצא פרופיל לקובץ');}catch(_e){}}
      } else console.error('storage',e);
    }
  }
};

/* ---------- default profile factory ---------- */
function newProfile(name){
  return {
    id:'p_'+Math.random().toString(36).slice(2,9),
    name:name||'אני',
    personal:{name:name||'אני',age:25,gender:'זכר',height:175,weight:70},
    goal:'both', pace:1,
    workout:{style:'gym',location:'gym',days:[0,1,3,4,5]}, // Su,Mo,We,Th,Fr
    fitness:{level:4,pushups:'16-30',pullups:'5-10',squats:'51-100',pistol:false},
    nutrition:{diet:'regular',allergies:'',injuries:'',dislikes:''},
    dayMode:'auto', nutriMode:'training', stretchMode:'static',
    skills:{}, exSwaps:{}, xp:0, workouts:0,
    exPick:{}, planShuffle:0, planWeekSeen:'', splitOverride:null,
    measurements:[], weights:[{d:Date.now(),v:70}],
    water:0, todayEaten:{cal:0,p:0,c:0,f:0,fib:0,na:0,sug:0}, foodLog:[], myFoods:[], foodQty:{}, woPicks:[], mealsEaten:{}, eatenDay:'', mealSeed:0, mealSeeds:{},
    notif:{enabled:false}, reminders:{morning:'07:00',workout:'18:00',sleep:'22:00',water:true,waterEvery:3}, woPrefs:{duration:45,focus:'full'}, exWeights:{}, exLog:{},
    restorePoints:[], history:[], onboarded:false
  };
}

/* ---------- root state ---------- */
/* Level is DERIVED from the strength test — not a manual pick. Higher real
 * capacity => higher level. It lives here rather than with the rest of the
 * numbers in src/targets.js because the self-heal below calls it while this
 * file is still loading, and hoisting no longer crosses file boundaries. */
function computeLevelFromAssessment(pu,pl,sq,pistol){
  var PU={'0-5':0,'6-15':1,'16-30':2,'30+':3},PL={'0':0,'1-4':1,'5-10':2,'10+':3},SQ={'0-20':0,'21-50':1,'51-100':2};
  var score=(PU[pu]||0)+(PL[pl]||0)+(SQ[sq]||0)+(pistol?1:0); // 0..9
  return Math.max(1,Math.min(8,1+score)); // cap at 8; levels 9-10 are elite skill-tree goals, not auto-prescribed
}
var SCHEMA_VERSION=2;
let DB=store.read();
if(!DB||typeof DB!=='object'||!DB.profiles||typeof DB.profiles!=='object'||!Object.keys(DB.profiles).length){
  const p=newProfile('יובל');
  DB={profiles:{[p.id]:p},active:p.id,lang:'en',schema:SCHEMA_VERSION};
  store.write(DB);
}
// self-heal: make sure the active pointer references a real profile, and core fields exist
if(!DB.active||!DB.profiles[DB.active])DB.active=Object.keys(DB.profiles)[0];
if(!DB.lang)DB.lang='en';
Object.values(DB.profiles).forEach(p=>{
  if(!p.nutrition)p.nutrition={diet:'regular',allergies:'',injuries:'',dislikes:''};
  if(!p.weights||!p.weights.length)p.weights=[{d:Date.now(),v:(p.personal&&p.personal.weight)||46}];
  if(!Array.isArray(p.history))p.history=[];
  if(!Array.isArray(p.restorePoints))p.restorePoints=[];
  if(!Array.isArray(p.measurements))p.measurements=[];
  if(!p.skills)p.skills={};
  if(!p.woPrefs)p.woPrefs={duration:45,focus:'full'};
  if(!p.exWeights)p.exWeights={};
  if(!p.musLast)p.musLast={};
  if(p.goalDate==null)p.goalDate=0;
  if(!p.exPick)p.exPick={};
  if(p.planShuffle==null)p.planShuffle=0;
  if(p.planWeekSeen==null)p.planWeekSeen='';
  if(!p.exLog)p.exLog={};
  if(p.onboarded===undefined)p.onboarded=true;
  if(!p.reminders)p.reminders={morning:'07:00',workout:'18:00',sleep:'22:00',water:true,waterEvery:3};
  if(!p.mealsEaten)p.mealsEaten={};
  if(!p.notif)p.notif={enabled:false};
  if(!p.fitness)p.fitness={level:4,pushups:'16-30',pullups:'5-10',squats:'51-100',pistol:false};
  if(p.workout&&!Array.isArray(p.workout.equipment))p.workout.equipment=[];
  p.fitness.level=computeLevelFromAssessment(p.fitness.pushups,p.fitness.pullups,p.fitness.squats,p.fitness.pistol);
});
function migrateDB(db){
  var v=db.schema||1;
  // forward-compat guard: a DB written by a NEWER build (schema > ours) — don't
  // silently down-migrate; snapshot the raw copy and warn, then load as-is.
  if(v>SCHEMA_VERSION){
    try{db._fwdBackup=db._fwdBackup||JSON.stringify(db);}catch(_){}
    try{setTimeout(function(){try{toast('נטען מגרסה חדשה יותר — נשמר גיבוי ליתר ביטחון');}catch(_){}} ,1500);}catch(_){}
    return db;
  }
  if(v<2){ // v1->v2: food-logging fields (fiber, sodium, sugar, diary)
    Object.values(db.profiles||{}).forEach(function(p){
      p.todayEaten=p.todayEaten||{cal:0,p:0,c:0,f:0};
      ['fib','na','sug'].forEach(function(k){if(p.todayEaten[k]==null)p.todayEaten[k]=0;});
      if(!Array.isArray(p.foodLog))p.foodLog=[];
    });
    v=2;
  }
  db.schema=v;return db;
}
try{var _sv=DB.schema||1;DB=migrateDB(DB);if(DB.schema!==_sv)store.write(DB);}catch(e){try{console.error('migrate',e);}catch(_){}try{setTimeout(function(){try{toast('שגיאת מיגרציית נתונים — ייתכן שחלק מהנתונים לא עודכנו');}catch(_){}} ,1500);}catch(_){}}
function P(){return DB.profiles[DB.active];}
let _saveT=null;
function save(){if(_saveT)clearTimeout(_saveT);_saveT=setTimeout(function(){_saveT=null;try{store.write(DB);}catch(e){}},180);}
function flushSave(){if(_saveT){clearTimeout(_saveT);_saveT=null;}try{store.write(DB);}catch(e){}}
try{window.addEventListener('pagehide',flushSave);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden')flushSave();});}catch(e){}
function commit(fn){fn(P());save();}

