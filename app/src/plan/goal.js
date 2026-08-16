/* src/plan/goal.js — accessory work, localisation helpers, training styles, the target date maths
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
const ACCESSORY={
  chest:[{n:'שכיבות יהלום',b:'Diamond push-ups',m:'Reps'},{n:'שכיבות סמיכה רחבות',b:'Wide push-ups',m:'Reps'},{n:'מקבילים על ספסל/כיסא',b:'Bench dips',m:'Reps'}],
  back:[{n:'חתירה הפוכה',b:'Inverted row',m:'Reps'},{n:'סופרמן',b:'Superman',m:'Reps'},{n:'מלאך שלג הפוך',b:'Reverse snow angel',m:'Reps'}],
  legs:[{n:'הרמות עקב לשוקיים',b:'Calf raise',m:'Reps'},{n:'סקוואט מפוצל',b:'Split squats',m:'Reps'},{n:'עליות מדרגה',b:'Step-up',m:'Reps'}],
  core:[{n:'הרים מטפסים',b:'Mountain climber',m:'Time'},{n:'אופני אוויר',b:'Bicycle crunch',m:'Reps'},{n:'סיבובים רוסיים',b:'Russian twist',m:'Reps'}]
};
/* =====================================================================
   MUSCLE-AWARE WEEKLY PLANNING
   The week's split comes from how many days you picked, every session is
   announced by the muscles it trains, the exercises are chosen for you
   under your equipment and injury constraints, the selection rotates once
   a week on its own, and any single exercise can be traded for another
   that trains the same muscle.
   ===================================================================== */

/* ---- localisation -----------------------------------------------------
   The app-wide translator rewrites known Hebrew words wherever they appear,
   which garbles any phrase it only half knows ("ירך קדמית" came out as
   "Thigh קדמית"). Everything below picks its own wording per language and
   never goes through that substitution. */
function L(he,en,es){var l=(typeof lang==='function')?lang():'he';return l==='en'?en:(l==='es'?(es==null?en:es):he);}
const DOW_L={
  he:['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'],
  en:['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  es:['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
};
function dowName(i){var l=(typeof lang==='function')?lang():'he';return (DOW_L[l]||DOW_L.he)[i]||'';}
/* Where seven days have to sit across one row — the little week strip — the
   name has to be short. Not DOW, whose third entry is 'ג׳', the same string
   the app uses to abbreviate grams: the word-by-word translator turned Tuesday
   into "g". Two or three letters of the day's own name collide with nothing. */
function dowShort(i){var n=dowName(i);return (typeof lang==='function'&&lang()==='he')?n.slice(0,2):n.slice(0,3);}
/* ---- how you train ----
   Three products out of one library: bodyweight only, gym only, or both mixed
   into the same session. Every movement carries env='bw' or env='gym' and the
   style is the only thing that decides which pool a session may draw from. */
const STYLES=['calisthenics','gym','hybrid'];
function trainStyle(p){
  var s=(p&&p.workout&&p.workout.style)||'';
  if(STYLES.indexOf(s)>=0)return s;
  // profiles written before the split: the old names map onto the new ones
  if(s==='gym')return 'gym';
  if(s==='combination'||s==='mixed')return 'hybrid';
  return 'calisthenics';
}
function styleName(st){return st==='gym'?L('חדר כושר','Gym','Gimnasio')
  :st==='hybrid'?L('משולב','Gym + calisthenics','Gimnasio + calistenia')
  :L('קליסטניקס','Calisthenics','Calistenia');}
/* one line saying what the choice actually changes, shown wherever it is made */
function styleBlurb(st){
  return st==='gym'
    ?L('תרגילי חדר כושר בלבד — מוט, משקולות, מכונות וכבלים.','Gym movements only — barbells, dumbbells, machines and cables.','Solo ejercicios de gimnasio — barras, mancuernas, máquinas y poleas.')
    :st==='hybrid'
    ?L('שילוב — כל אימון מורכב גם מתרגילי משקל גוף וגם מתרגילי חדר כושר.','Both — each session is built from bodyweight and gym movements together.','Ambos — cada sesión combina ejercicios de peso corporal y de gimnasio.')
    :L('משקל גוף בלבד — בלי משקולות ובלי מכונות.','Bodyweight only — no weights and no machines.','Solo peso corporal — sin pesas ni máquinas.');
}
/* ---- the date you want to be there by -------------------------------------
   The app already treated its pace setting as a number of months — one, three
   or six — and turned that into how much of the calorie change to actually
   apply. A date is the same statement made precisely, so it feeds the same
   curve, and the three old settings still land on exactly the numbers they
   always did: 1 → 1.0, 3 → 0.6, 6 → 0.35. */
const MS_D=86400000;
function goalDateOf(p){var t=p&&p.goalDate;return (t&&+t>Date.now())?+t:0;}
function goalWeeks(p){var t=goalDateOf(p);return t?Math.max(1,Math.round((t-Date.now())/(7*MS_D))):0;}
function goalMonths(p){var t=goalDateOf(p);return t?Math.max(0.25,(t-Date.now())/(30.44*MS_D)):0;}
function paceCurve(m){
  if(m<=1)return 1;
  if(m<=3)return 1-(m-1)*0.2;
  if(m<=6)return 0.6-(m-3)*(0.25/3);
  return Math.max(0.2,0.35-(m-6)*0.02);
}
function paceFactor(p){
  var m=goalMonths(p);
  if(m)return Math.round(paceCurve(m)*100)/100;
  return {1:1.0,3:0.6,6:0.35}[p&&p.pace]||1;
}
/* What a week can honestly move. Fat comes off at up to about three quarters
   of a percent of bodyweight a week before it starts costing muscle; muscle
   goes on far slower than that, and slower still the longer you have trained. */
function safeRate(p){
  var w=(p&&p.personal&&+p.personal.weight)||70,
      lv=(p&&p.fitness&&+p.fitness.level)||1,g=(p&&p.goal)||'both';
  if(g==='fat')return Math.round(Math.max(.3,Math.min(1,w*.0075))*100)/100;
  if(g==='muscle')return Math.round(Math.max(.15,.45-lv*.03)*100)/100;
  if(g==='both')return Math.round(Math.max(.15,Math.min(.5,w*.004))*100)/100;
  return 0;
}
/* The date, what it asks for per week, and whether that is a thing bodies do */
function goalPlan(p){
  p=p||(typeof P==='function'?P():null)||{};
  var t=goalDateOf(p),weeks=goalWeeks(p),months=goalMonths(p);
  var cur=(p.personal&&+p.personal.weight)||0,tgt=+p.goalWeight||0;
  var need=(tgt&&cur)?Math.round(Math.abs(cur-tgt)*10)/10:0;
  var rate=(need&&weeks)?Math.round(need/weeks*100)/100:0;
  var safe=safeRate(p);
  var verdict=!t?'none'
    :(!need||!safe)?'nogoalweight'
    :rate<=safe*.55?'easy'
    :rate<=safe?'ok'
    :rate<=safe*1.4?'tight':'unrealistic';
  var earliest=(need&&safe)?Math.ceil(need/safe):0;
  return {set:!!t,date:t,weeks:weeks,months:Math.round(months*10)/10,
    need:need,rate:rate,safe:safe,verdict:verdict,
    earliestWeeks:earliest,earliestDate:earliest?Date.now()+earliest*7*MS_D:0,
    factor:paceFactor(p),down:(tgt&&cur)?tgt<cur:null};
}
function fmtDate(ts){
  try{var d=new Date(+ts);
    return d.toLocaleDateString({he:'he-IL',en:'en-GB',es:'es-ES'}[lang()]||'en-GB',
      {day:'numeric',month:'short',year:'numeric'});
  }catch(e){return '';}
}
function goalVerdictText(pl){
  return pl.verdict==='easy'?L('יש לך יותר זמן ממה שצריך — אפשר לקחת את זה ברוגע.',
      'You have more time than this needs — you can take it gently.','Tienes más tiempo del necesario — puedes ir con calma.')
    :pl.verdict==='ok'?L('התאריך הזה בהישג יד בקצב בריא.','That date is within reach at a healthy rate.','Esa fecha está a tu alcance a un ritmo sano.')
    :pl.verdict==='tight'?L('צפוף — אפשרי, אבל בלי שבועות מבוזבזים.','Tight — possible, but with no weeks to spare.','Ajustado — posible, pero sin semanas de sobra.')
    :pl.verdict==='unrealistic'?L('זה מהר מדי בשביל גוף. נמשיך לכיוון הזה, אבל התאריך לא יחזיק.',
      'That is faster than a body goes. We will head that way, but the date will not hold.',
      'Eso es más rápido de lo que va un cuerpo. Iremos en esa dirección, pero la fecha no se sostendrá.')
    :L('בלי משקל יעד נשתמש בתאריך רק כדי לקבוע את הקצב.','Without a target weight the date only sets the pace.',
      'Sin peso objetivo la fecha solo marca el ritmo.');
}
