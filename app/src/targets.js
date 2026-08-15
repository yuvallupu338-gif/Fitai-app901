/* src/targets.js — BMR, TDEE, calorie and macro targets, water, strength level, streaks, readiness
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* =====================================================================
   AI / LOGIC ENGINE — calories, macros, readiness
   ===================================================================== */
function bmr(p){
  const{gender,weight,height,age}=p.personal;
  const base=10*weight+6.25*height-5*age;
  return Math.round(gender==='נקבה'?base-161:base+5);
}
function tdee(p){
  const days=p.workout.days.length;
  return Math.round(bmr(p)*(1.35+days*0.045));
}
function bmiOf(p){return p.personal.weight/Math.pow((p.personal.height||175)/100,2);}
function isUnderweight(p){return bmiOf(p)<18.5;}
function waterTarget(p){ // personalized: ~33 ml/kg + training-day bonus
  let l=p.personal.weight*0.033;
  if(isTrainingToday(p))l+=0.5;
  return Math.max(1.5,Math.round(l*10)/10);
}
function targets(p){
  const tdeeV=tdee(p),bmi=bmiOf(p);
  let mult=1;
  if(p.goal==='fat')mult=0.80;
  else if(p.goal==='muscle')mult=1.10;
  else if(p.goal==='both')mult=0.95;
  // underweight safeguard: never recommend a deficit — lean to a building surplus
  if(bmi<18.5)mult=Math.max(mult,1.12);
  let cal=Math.round(tdeeV*mult);
  const paceF=(typeof paceFactor==='function')?paceFactor(p):({1:1.0,3:0.6,6:0.35}[p.pace]||1);
  cal=Math.round(tdeeV+(cal-tdeeV)*paceF);
  const calFloor=p.personal.gender==='נקבה'?1200:1500; if(cal<calFloor)cal=calFloor;
  // protein: 1.6 g/kg for underweight (gentler), else goal-based
  var vegan=p.nutrition&&p.nutrition.diet==='vegan';
  var ppk=bmi<18.5?1.6:(p.goal==='fat'?2.2:2.0);
  if(vegan)ppk=Math.min(2.4,ppk+0.2);          // plant protein digests less efficiently → aim a notch higher
  var pw=p.personal.weight;
  if(bmi>27){var hM=(p.personal.height||175)/100,bw=25*hM*hM;pw=Math.round(bw+(p.personal.weight-bw)*0.25);}
  const protein=Math.round(pw*ppk);
  // fat: vegans favour a higher-volume / lower-fat plate (~20%); others ~27%
  var fatPct=vegan?0.20:0.27, fatFloor=0.8;            // never below ~0.8 g/kg (essential fats / hormones)
  const fat=Math.max(Math.round(p.personal.weight*fatFloor),Math.round(cal*fatPct/9));
  let carbs=Math.max(0,Math.round((cal-protein*4-fat*9)/4));
  // keep the headline calories EXACTLY equal to the macro sum (no internal mismatch)
  const calExact=protein*4+carbs*4+fat*9;
  return {cal:calExact,protein,carbs,fat};
}
function goalLabel(g){return{fat:'חיטוב 🔥',muscle:'בניית שריר 💪',both:'שריר + חיטוב ⚡',maintain:'שמירה 🧘'}[g];}
function goalLabelEn(g){return{fat:'Fat loss',muscle:'Muscle gain',both:'Recomposition',maintain:'Maintenance'}[g];}
function paceLabel(pc){return{1:'מהיר (חודש)',3:'מתון (3 חודשים)',6:'רגוע (6 חודשים)'}[pc];}
function strengthLevel(p){
  const mastered=Object.values(p.skills).filter(s=>s==='done').length;
  return Math.min(10,(+p.fitness.level||1)+Math.floor(mastered/9));
}
/* computeLevelFromAssessment used to sit here. It moved to src/store.js,
 * because store.js calls it while it loads to repair every stored profile —
 * and a file cannot call what a later file declares. It is still a global;
 * only the file it is written in changed. */
function isTrainingToday(p){return p.workout.days.includes(new Date().getDay());}
function achievements(p){
  var st=streakDays(p),w=p.workouts||0,sl=strengthLevel(p),mastered=Object.values(p.skills||{}).filter(function(x){return x==='done';}).length;
  var prs=Object.values(p.exLog||{}).filter(function(a){return a&&a.length;}).length;
  return [
    {emo:'🏁',t:'אימון ראשון',got:w>=1},
    {emo:'🔥',t:'רצף 3 ימים',got:st>=3},
    {emo:'⚡',t:'רצף 7 ימים',got:st>=7},
    {emo:'💪',t:'10 אימונים',got:w>=10},
    {emo:'🏆',t:'25 אימונים',got:w>=25},
    {emo:'📈',t:'שיא ראשון',got:prs>=1},
    {emo:'🎯',t:'5 תרגילים נשלטו',got:mastered>=5},
    {emo:'🥇',t:'רמת כוח 7+',got:sl>=7},
    {emo:'🏅',t:'50 אימונים',got:w>=50},
    {emo:'👑',t:'100 אימונים',got:w>=100},
    {emo:'🌟',t:'רצף 14 ימים',got:st>=14},
    {emo:'💎',t:'רצף 30 ימים',got:st>=30},
    {emo:'🎖️',t:'רמה 5',got:xpLevel(p.xp).level>=5},
    {emo:'⭐',t:'רמה 10',got:xpLevel(p.xp).level>=10},
    {emo:'📊',t:'10 שיאים אישיים',got:prs>=10},
    {emo:'🧩',t:'20 תרגילים נשלטו',got:mastered>=20}
  ];
}
function ageFontFactor(p){var a=(p.personal&&p.personal.age)||0;if(a>=90)return 1.32;if(a>=80)return 1.24;if(a>=70)return 1.16;if(a>=60)return 1.08;if(a>=55)return 1.05;return 1;}
function effFont(p){var m=(p&&p.fontScale)||1;return Math.round(Math.min(1.7,m*ageFontFactor(p))*100)/100;}
function fontLevel(p){return Math.max(1,Math.min(10,Math.round(((p&&p.fontScale)||1)*10-7)));} // scale->1..10
function setFontLevel(v){var lv=Math.max(1,Math.min(10,+v||3));commit(function(p){p.fontScale=Math.round((0.7+lv*0.1)*100)/100;});render();}
function xpLevel(xp){xp=Math.max(0,xp||0);var lv=1,need=100,acc=0;while(xp>=acc+need&&lv<99){acc+=need;lv++;need=Math.round(need*1.25);}return {level:lv,into:xp-acc,need:need,pct:Math.round((xp-acc)/need*100)};}
function streakDays(p){
  if(!p.history||!p.history.length)return 0;
  var days={};p.history.forEach(function(ts){var d=new Date(ts);days[d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()]=1;});
  function key(d){return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate();}
  var train=(p.workout&&p.workout.days)||[];
  var today=new Date();today.setHours(0,0,0,0);var tk=key(today);
  var cur=new Date(today);var n=0,guard=0,allow=freezeTokens(p),used=0;
  while(guard++<400){
    if(days[key(cur)]){n++;cur.setDate(cur.getDate()-1);continue;}
    if(key(cur)===tk){cur.setDate(cur.getDate()-1);continue;}        // today not done yet — don't break
    if(train.indexOf(cur.getDay())<0){cur.setDate(cur.getDate()-1);continue;} // planned rest day — freeze
    if(p.activeDays&&p.activeDays[key(cur)]){cur.setDate(cur.getDate()-1);continue;} // logged food/weight that day — keeps streak
    if(used<allow){used++;cur.setDate(cur.getDate()-1);continue;}     // ❄️ freeze token bridges a missed training day
    break;                                                            // missed a planned training day
  }
  return n;
}
function mesoWeek(p){if(!p.history||!p.history.length)return 1;var first=Math.min.apply(null,p.history);var wk={};p.history.forEach(function(t){wk[Math.floor((t-first)/(7*86400000))]=1;});var trained=Object.keys(wk).length;return ((trained-1)%4)+1;} // by weeks actually trained, so a layoff never forces a deload
function mesoLabel(p){var w=mesoWeek(p);return 'שבוע '+w+'/4 · '+({1:'בנייה',2:'נפח מצטבר',3:'שיא',4:'דילוד 🪶'}[w]);}
function rankFor(lv){if(lv>=20)return 'אגדה';if(lv>=15)return 'אלוף';if(lv>=10)return 'אתלט';if(lv>=7)return 'מתקדם';if(lv>=4)return 'מתאמן';if(lv>=2)return 'חובב';return 'מתחיל';}
function freezeTokens(p){return Math.min(3,Math.floor((p.bestStreak||0)/7));}
function trainedToday(p){var k=dayKey(Date.now());return (p.history||[]).some(function(t){return dayKey(t)===k;});}
function effectiveDayMode(p){
  var days=(p.workout&&p.workout.days)||[];
  if(!days.length)return 'rest';
  return days.indexOf(new Date().getDay())>=0?'training':'rest';
}
function readiness(p){
  var w=p.wellness;
  if(w&&w.day===dayKey(Date.now())&&w.sleep&&w.sore&&w.energy){
    var ws=(+w.sleep)+(+w.sore)+(+w.energy);
    return Math.max(25,Math.min(100,Math.round((ws/15)*100)));
  }
  if(p.workouts<3)return null;
  const now=Date.now(),DAY=86400000;
  const recent=new Set(p.history.filter(function(t){return now-t<7*DAY;}).map(function(t){var d=new Date(t);return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate();})).size;
  const score=Math.max(40,Math.min(98,70+(isTrainingToday(p)?-5:12)-recent*4+(p.workouts>10?6:0)));
  return Math.round(score);
}

