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

/* =====================================================================
   The boundary: nothing becomes a profile without being coerced first.

   Every screen in this app builds HTML by concatenation, and most of it
   assumes a field holds the type the app itself would have written there —
   a number for a weight, "07:00" for a reminder, a short key for a piece of
   kit. Anything that can put a *string* into one of those fields turns an
   assumption into an injection, and there are two things that can: a profile
   .json handed to the user to import, and any code that can write
   localStorage on this origin.

   So the profile has a schema now, and it is enforced on the way in. A number
   field comes out a number; an enum comes out one of its members or the
   default; a lookup key comes out free of the characters that end an attribute
   or open a tag; free text comes out a string (and is escaped at the sink,
   which is the other half of the fix).
   Keys the schema does not name are dropped — that is what closes the class
   rather than the individual holes.
   ===================================================================== */
function _num(v, d, lo, hi){
  var n = (typeof v === 'number') ? v : parseFloat(v);
  if (!isFinite(n)) return d;
  if (lo != null && n < lo) n = lo;
  if (hi != null && n > hi) n = hi;
  return n;
}
function _str(v, d, max){
  if (typeof v === 'string') return max ? v.slice(0, max) : v;
  if (typeof v === 'number' && isFinite(v)) return String(v);
  return d;
}
function _enum(v, allowed, d){ return allowed.indexOf(v) >= 0 ? v : d; }
function _bool(v){ return !!v; }
/* A key the app looks up by, never prose. Exercise names, week keys and muscle
 * names are all legitimate here and they contain spaces, pipes and brackets —
 * so rather than an allowlist that would quietly drop real data, this rejects
 * exactly the characters that can end an attribute or open a tag. */
function _key(v, d){
  var s = (typeof v === 'string') ? v : '';
  if (!s || s.length > 96) return d;
  // Spaces stay legal — "Machine chest press" is a real key, and every
  // attribute in this app is double-quoted, so a space cannot end one.
  return /[<>"'`&=\\\r\n]/.test(s) ? d : s;
}
function _time(v, d){ return (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v)) ? v : d; }
function _arr(v, n){ return Array.isArray(v) ? v.slice(0, n || 400) : []; }
/* a plain object with no inherited surprises, keys filtered to safe lookups */
function _map(v, coerce, maxKeys){
  var out = Object.create(null), n = 0;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return Object.assign({}, out);
  for (var k of Object.keys(v)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (!_key(k, null)) continue;
    if (++n > (maxKeys || 600)) break;
    var c = coerce(v[k]);
    if (c !== undefined) out[k] = c;
  }
  return Object.assign({}, out);
}

var GENDERS = ['זכר', 'נקבה'];
var GOALS = ['fat', 'muscle', 'both', 'maintain'];
var STYLES_OK = ['calisthenics', 'gym', 'hybrid'];
var DIETS = ['regular', 'vegetarian', 'vegan', 'pescatarian'];
var MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'];

function sanitizeProfile(raw, keepId){
  var r = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  var t = newProfile('אני');
  var p = t;                                   // start from the template, fill in what validates
  if (keepId || _key(r.id, null)) p.id = keepId || _key(r.id, t.id);

  p.name = _str(r.name, 'אני', 60) || 'אני';
  var rp = (r.personal && typeof r.personal === 'object') ? r.personal : {};
  p.personal = {
    name: _str(rp.name, p.name, 60) || p.name,
    age: _num(rp.age, 25, 5, 120),
    gender: _enum(rp.gender, GENDERS, 'זכר'),
    height: _num(rp.height, 175, 80, 260),
    weight: _num(rp.weight, 70, 20, 400),
  };
  p.name = p.personal.name;

  p.goal = _enum(r.goal, GOALS, 'both');
  p.pace = _enum(_num(r.pace, 1), [1, 3, 6], 1);
  p.goalWeight = r.goalWeight === '' || r.goalWeight == null ? '' : _num(r.goalWeight, '', 20, 400);
  p.goalDate = _num(r.goalDate, 0, 0);

  var rw = (r.workout && typeof r.workout === 'object') ? r.workout : {};
  p.workout = {
    style: _enum(rw.style, STYLES_OK, 'gym'),
    location: _enum(rw.location, ['home', 'gym'], 'gym'),
    days: _arr(rw.days, 7).map(function(d){ return _num(d, -1, 0, 6); })
      .filter(function(d){ return d >= 0 && d === Math.round(d); }),
    equipment: _arr(rw.equipment, 40).map(function(k){ return _key(k, null); }).filter(Boolean),
  };
  if (!p.workout.days.length) p.workout.days = t.workout.days;

  var rf = (r.fitness && typeof r.fitness === 'object') ? r.fitness : {};
  p.fitness = {
    level: _num(rf.level, 4, 1, 10),
    pushups: _enum(rf.pushups, ['0-5', '6-15', '16-30', '30+'], '16-30'),
    pullups: _enum(rf.pullups, ['0', '1-4', '5-10', '10+'], '5-10'),
    squats: _enum(rf.squats, ['0-20', '21-50', '51-100'], '51-100'),
    pistol: _bool(rf.pistol),
  };

  var rn = (r.nutrition && typeof r.nutrition === 'object') ? r.nutrition : {};
  p.nutrition = {                              // free text: escaped at the sink, not here
    diet: _enum(rn.diet, DIETS, 'regular'),
    allergies: _str(rn.allergies, '', 400),
    injuries: _str(rn.injuries, '', 400),
    dislikes: _str(rn.dislikes, '', 400),
  };

  p.dayMode = _enum(r.dayMode, ['auto', 'training', 'rest', 'sick'], 'auto');
  p.nutriMode = _enum(r.nutriMode, ['training', 'rest'], 'training');
  p.stretchMode = _enum(r.stretchMode, ['static', 'dynamic'], 'static');
  p.onboarded = (r.onboarded === undefined) ? true : _bool(r.onboarded);
  p.xp = _num(r.xp, 0, 0);
  p.workouts = _num(r.workouts, 0, 0);
  p.water = _num(r.water, 0, 0);
  p.planShuffle = _num(r.planShuffle, 0, 0);
  p.planWeekSeen = _str(r.planWeekSeen, '', 20);
  p.eatenDay = _str(r.eatenDay, '', 20);
  p.mealSeed = _num(r.mealSeed, 0, 0);
  p.bestStreak = _num(r.bestStreak, 0, 0);
  p.fontScale = _num(r.fontScale, 1, 0.7, 1.7);
  p.naTarget = _num(r.naTarget, 2300, 0, 20000);
  p.sugTarget = _num(r.sugTarget, 50, 0, 2000);
  p._foodId = _num(r._foodId, 0, 0);

  p.skills = _map(r.skills, function(v){ return _enum(v, ['done', 'doing', ''], ''); });
  p.exSwaps = _map(r.exSwaps, function(v){ return _num(v, 0, 0, 99); });
  p.exPick = _map(r.exPick, function(v){ return _key(v, undefined); });
  p.exWeights = _map(r.exWeights, function(v){ return _num(v, undefined, 0, 2000); });
  p.mealSeeds = _map(r.mealSeeds, function(v){ return _num(v, 0, 0); });
  p.mealsEaten = _map(r.mealsEaten, function(v){ return _bool(v); });
  p.foodQty = _map(r.foodQty, function(v){ return _num(v, undefined, 0, 100000); });
  p.musLast = _map(r.musLast, function(v){ return _num(v, undefined, 0); });
  p.activeDays = _map(r.activeDays, function(v){ return _num(v, 1, 0, 1); });

  p.exLog = _map(r.exLog, function(v){
    return _arr(v, 200).map(function(e){
      e = (e && typeof e === 'object') ? e : {};
      return { d: _num(e.d, 0, 0), w: _num(e.w, 0, 0, 2000), reps: _num(e.reps, 0, 0, 10000),
               rir: e.rir === '' || e.rir == null ? '' : _num(e.rir, '', 0, 10),
               sets: _num(e.sets, 0, 0, 99), cat: _key(e.cat, '') };
    });
  });

  p.history = _arr(r.history, 365).map(function(v){ return _num(v, 0, 0); }).filter(Boolean);
  p.weights = _arr(r.weights, 365).map(function(w){
    w = (w && typeof w === 'object') ? w : {};
    return { d: _num(w.d, Date.now(), 0), v: _num(w.v, 0, 0, 400) };
  }).filter(function(w){ return w.v > 0; });
  if (!p.weights.length) p.weights = [{ d: Date.now(), v: p.personal.weight }];

  p.measurements = _arr(r.measurements, 365).map(function(m){
    m = (m && typeof m === 'object') ? m : {};
    var o = { d: _num(m.d, Date.now(), 0) };
    ['waist', 'chest', 'hips', 'arm', 'thigh'].forEach(function(k){
      o[k] = m[k] === '' || m[k] == null ? '' : String(_num(m[k], '', 0, 400));
    });
    return o;
  });

  function food(e){
    e = (e && typeof e === 'object') ? e : {};
    return { id: _num(e.id, 0, 0), n: _str(e.n, '', 120), e: _str(e.e, '', 8),
             u: _str(e.u, '', 12), base: _num(e.base, 100, 0), qty: _num(e.qty, 0, 0, 100000),
             cal: _num(e.cal, 0, 0), p: _num(e.p, 0, 0), c: _num(e.c, 0, 0), f: _num(e.f, 0, 0),
             fib: _num(e.fib, 0, 0), na: _num(e.na, 0, 0), sug: _num(e.sug, 0, 0),
             mealKey: _enum(e.mealKey, MEAL_KEYS, 'breakfast'), fi: _num(e.fi, -1, -1) };
  }
  p.foodLog = _arr(r.foodLog, 200).map(food);
  p.myFoods = _arr(r.myFoods, 200).map(food);
  p.woPicks = _arr(r.woPicks, 40).map(function(x){
    x = (x && typeof x === 'object') ? x : {};
    return { id: _key(x.id, ''), lvl: _num(x.lvl, 1, 1, 10) };
  }).filter(function(x){ return x.id; });

  var te = (r.todayEaten && typeof r.todayEaten === 'object') ? r.todayEaten : {};
  p.todayEaten = { cal: _num(te.cal, 0, 0), p: _num(te.p, 0, 0), c: _num(te.c, 0, 0),
                   f: _num(te.f, 0, 0), fib: _num(te.fib, 0, 0), na: _num(te.na, 0, 0), sug: _num(te.sug, 0, 0) };

  var rr = (r.reminders && typeof r.reminders === 'object') ? r.reminders : {};
  p.reminders = { morning: _time(rr.morning, '07:00'), workout: _time(rr.workout, '18:00'),
                  sleep: _time(rr.sleep, '22:00'), water: _bool(rr.water), waterEvery: _num(rr.waterEvery, 3, 1, 12) };

  var rnf = (r.notif && typeof r.notif === 'object') ? r.notif : {};
  p.notif = { enabled: _bool(rnf.enabled), fired: _map(rnf.fired, function(v){ return _num(v, 1, 0, 1); }) };
  if (typeof rnf.fired === 'object' && rnf.fired && rnf.fired.d) p.notif.fired.d = _str(rnf.fired.d, '', 20);

  var wp = (r.woPrefs && typeof r.woPrefs === 'object') ? r.woPrefs : {};
  p.woPrefs = { duration: _enum(_num(wp.duration, 45), [30, 45, 60, 90], 45),
                focus: _enum(wp.focus, ['upper', 'lower', 'full'], 'full') };

  var rm = (r.returnMode && typeof r.returnMode === 'object') ? r.returnMode : {};
  p.returnMode = { on: _bool(rm.on), since: _num(rm.since, 0, 0) };

  if (r.consent && typeof r.consent === 'object') {
    p.consent = { v: _str(r.consent.v, '', 16), at: _num(r.consent.at, 0, 0), lang: _key(r.consent.lang, 'he') };
  }

  p.splitOverride = Array.isArray(r.splitOverride)
    ? r.splitOverride.slice(0, 7).map(function(s){
        s = (s && typeof s === 'object') ? s : {};
        return { k: _key(s.k, ''), he: _str(s.he, '', 60),
                 mus: _arr(s.mus, 8).map(function(m){ return _key(m, null); }).filter(Boolean) };
      }).filter(function(s){ return s.k; })
    : null;

  var wl = (r.wellness && typeof r.wellness === 'object') ? r.wellness : null;
  if (wl) p.wellness = { day: _str(wl.day, '', 20), sleep: _num(wl.sleep, 3, 1, 5),
                         sore: _num(wl.sore, 3, 1, 5), energy: _num(wl.energy, 3, 1, 5) };

  p.restorePoints = _arr(r.restorePoints, 4).map(function(s){
    s = (s && typeof s === 'object') ? s : {};
    return { d: _num(s.d, 0, 0), data: _str(s.data, '', 4000000) };
  }).filter(function(s){ return s.data; });

  return p;
}

/* Whole-DB version, used everywhere a store arrives from outside this tab. */
function sanitizeDB(raw){
  if (!raw || typeof raw !== 'object' || !raw.profiles || typeof raw.profiles !== 'object') return null;
  var out = { profiles: {}, active: '', lang: _enum(raw.lang, ['he', 'en', 'es'], 'en'),
              theme: _enum(raw.theme, ['dark', 'light'], 'dark'), schema: _num(raw.schema, 1, 1, 99) };
  var ids = Object.keys(raw.profiles).filter(function(k){ return _key(k, null); }).slice(0, 20);
  ids.forEach(function(id){ out.profiles[id] = sanitizeProfile(raw.profiles[id], id); });
  if (!ids.length) return null;
  out.active = _key(raw.active, null) && out.profiles[raw.active] ? raw.active : ids[0];
  return out;
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
/* Everything that was on disk goes through the schema before it is a DB. That
   replaces the hand-written self-heal that used to sit here: it filled in
   fields that were *missing* but accepted whatever was present, which is the
   hole an imported profile walked through. */
let DB=sanitizeDB(store.read());
if(!DB){
  const p=newProfile('יובל');
  DB={profiles:{[p.id]:p},active:p.id,lang:'en',schema:SCHEMA_VERSION};
  store.write(DB);
}
Object.values(DB.profiles).forEach(p=>{
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

