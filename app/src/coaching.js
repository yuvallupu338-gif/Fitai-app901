/* src/coaching.js — tips, greetings, allergy and dislike filtering, injury rules, today’s workout
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---- Daily tips — personalized by goal ---- */
const TIPS_BY_GOAL={
  fat:[
    'גירעון קלורי מתון (15-20%) שומר על השריר תוך כדי שריפת שומן — בלי הרעבה.',
    'חלבון גבוה (2.2 ג׳/ק״ג) מגביר שובע ומגן על מסת השריר בדיאטה.',
    'הוסף 8,000-10,000 צעדים ביום — שריפת קלוריות בלי לפגוע בהתאוששות.',
    'שתיית מים לפני ארוחה מפחיתה רעב ומשפרת בקרת קלוריות.'
  ],
  muscle:[
    'עודף קלורי קטן (10%) מספיק לבניית שריר — יותר מזה רק מצטבר כשומן.',
    'אכול 25-40 ג׳ חלבון עד שעה אחרי האימון כדי למקסם בניית שריר.',
    'הוספת חזרה או משקל מאימון לאימון (overload) היא מנוע הצמיחה.',
    'פחמימות סביב האימון ממלאות גליקוגן ונותנות דחיפה לביצועים.'
  ],
  both:[
    'ריקומפוזיציה אפשרית: חלבון גבוה + עומס מתגבר = שריר עולה ושומן יורד יחד.',
    'שמור קלוריות סביב התחזוקה ותן לאימון להוביל את השינוי בהרכב הגוף.',
    'תעדף שינה ואיכות אימון — שם נשבר השוויון בין שריפה לבנייה.',
    'מדוד היקפים ולא רק משקל — ריקומפוזיציה לא תמיד נראית על המאזניים.'
  ],
  maintain:[
    'תחזוקה היא הזמן לחזק טכניקה, ניידות ועקביות לטווח ארוך.',
    'שמירה על הרגלים = שמירה על תוצאות. עקביות מנצחת עוצמה.',
    'נצל את התקופה לבנות בסיס כוח שיאיץ את היעד הבא שלך.',
    'שינה של 7-9 שעות שומרת על איזון הורמונלי ועל האנרגיה.'
  ]
};
function tipFor(p){
  const pool=TIPS_BY_GOAL[p.goal]||TIPS_BY_GOAL.both;
  return pool[new Date().getDate()%pool.length];
}
/* time-aware Hebrew greeting */
function greet(){const h=new Date().getHours();return h<12?'בוקר טוב':h<17?'צהריים טובים':h<21?'ערב טוב':'לילה טוב';}
/* personalized motivational status line */
function personalStatus(p,mode){
  const g=p.goal;
  if(mode==='training'){
    if(g==='fat')return '🔥 יום אימון — שורפים ומחטבים. בוא נזיע!';
    if(g==='muscle')return '💪 יום אימון — היום בונים מסה. דחוף חזק!';
    if(g==='both')return '⚡ יום אימון — שריר עולה, שומן יורד. קדימה!';
    return '🏋️ יום אימון — שומרים על העקביות והכוח.';
  }
  if(mode==='sick')return '🤒 יום מחלה — מנוחה והרבה נוזלים. הבריאות קודמת.';
  if(g==='fat')return '🧘 יום מנוחה — גם ההתאוששות שורפת קלוריות.';
  if(g==='muscle')return '🧘 יום מנוחה — דווקא עכשיו השריר נבנה. שינה = צמיחה.';
  return '🧘 יום מנוחה — תן לגוף להתחזק לקראת האימון הבא.';
}
/* allergy keyword groups → ingredient words to avoid */
const ALLERGEN_WORDS={
  'בוטנים':['בוטנים','חמאת בוטנים','פולי אדמה'],
  'אגוזים':['אגוז','אגוזי','שקד','שקדים','קשיו','פקאן','לוז','מקדמיה','פיסטוק','גרנולה','חלב שקדים','חמאת שקד'],
  'שקדים':['שקד','שקדים','חלב שקדים','חמאת שקד'],
  'שקד':['שקד','שקדים','חלב שקדים','חמאת שקד'],
  'שומשום':['שומשום','טחינה','חלבה','חומוס','חומוס'],
  'טחינה':['טחינה','שומשום','חלבה','חומוס'],
  'גלוטן':['לחם','פסטה','קרקר','שיבולת שועל','גרנולה','טורטייה','אטריות','קרוטונים','בורגול','קוסקוס','פיתה','בגט'],
  'לקטוז':['גבינה','יוגורט','חלב','פטה','מוצרלה','חלומי','בולגרית','קוטג','שמנת','חמאה','גלידה','אבקת חלבון','מי גבינה','קזאין','גבינת שמנת','חמאת'],
  'חלב':['גבינה','יוגורט','חלב','פטה','מוצרלה','חלומי','בולגרית','קוטג','שמנת','חמאה','גלידה','אבקת חלבון','מי גבינה','קזאין','גבינת שמנת','חמאת'],
  'מי גבינה':['מי גבינה','אבקת חלבון','קזאין','חלב'],
  'ביצים':['ביצה','ביצים','חביתה','חביתת','מיונז'],
  'ביצה':['ביצה','ביצים','חביתה','חביתת','מיונז'],
  'דגים':['דג','סלמון','טונה','אמנון','דניס','בקלה'],
  'דג':['דג','סלמון','טונה','אמנון','דניס','בקלה'],
  'סויה':['סויה','טופו','אדממה','רוטב סויה'],
  'קטניות':['עדשים','חומוס','שעועית','אפונה','טופו','אדממה','פול'],
  'רכיכות':['שרימפס','שרימפ','סרטן','סרטנים','לובסטר','רכיכות','קלמרי','קלמארי','מולים','צדפות','חסילון'],
  'שרימפס':['שרימפס','שרימפ','סרטן','לובסטר','רכיכות','קלמרי','צדפות'],
  // ---- English / Spanish trigger words (map to the Hebrew ingredient lists) ----
  'peanut':['בוטנים','חמאת בוטנים'],'peanuts':['בוטנים','חמאת בוטנים'],'cacahuete':['בוטנים','חמאת בוטנים'],'maní':['בוטנים','חמאת בוטנים'],
  'nut':['אגוז','אגוזי','שקד','שקדים','קשיו','פקאן','לוז','מקדמיה','פיסטוק','חלב שקדים'],'nuts':['אגוז','אגוזי','שקד','שקדים','קשיו','פקאן','לוז','מקדמיה','פיסטוק','חלב שקדים'],'nueces':['אגוז','אגוזי','שקד','שקדים','קשיו','פקאן','לוז'],'almond':['שקד','שקדים','חלב שקדים'],'almendra':['שקד','שקדים','חלב שקדים'],
  'sesame':['שומשום','טחינה','חלבה','חומוס'],'sésamo':['שומשום','טחינה','חלבה','חומוס'],'sesamo':['שומשום','טחינה','חלבה','חומוס'],'tahini':['טחינה','שומשום','חומוס'],
  'gluten':['לחם','פסטה','קרקר','שיבולת שועל','טורטייה','אטריות','קרוטונים','בורגול','קוסקוס','פיתה','בגט'],'wheat':['לחם','פסטה','פיתה','אטריות','בורגול'],'trigo':['לחם','פסטה','פיתה'],
  'lactose':['גבינה','יוגורט','חלב','שמנת','חמאה','גלידה','קוטג'],'milk':['גבינה','יוגורט','חלב','שמנת','חמאה','גלידה','קוטג'],'dairy':['גבינה','יוגורט','חלב','שמנת','חמאה','גלידה','קוטג'],'leche':['גבינה','יוגורט','חלב','שמנת','חמאה','גלידה'],'lacteo':['גבינה','יוגורט','חלב','שמנת','חמאה'],'lácteo':['גבינה','יוגורט','חלב','שמנת','חמאה'],
  'egg':['ביצה','ביצים','חביתה','חביתת','מיונז'],'eggs':['ביצה','ביצים','חביתה','חביתת','מיונז'],'huevo':['ביצה','ביצים','חביתה','מיונז'],'huevos':['ביצה','ביצים','חביתה','מיונז'],
  'fish':['דג','סלמון','טונה','אמנון','דניס','בקלה'],'pescado':['דג','סלמון','טונה','דניס','בקלה'],
  'shellfish':['שרימפס','שרימפ','סרטן','לובסטר','רכיכות','קלמרי','צדפות'],'crustacean':['שרימפס','סרטן','לובסטר'],'crustaceans':['שרימפס','סרטן','לובסטר'],'shrimp':['שרימפס','שרימפ'],'marisco':['שרימפס','סרטן','לובסטר','רכיכות','קלמרי'],'mariscos':['שרימפס','סרטן','לובסטר','רכיכות','קלמרי'],
  'soy':['סויה','טופו','אדממה','רוטב סויה'],'soya':['סויה','טופו','אדממה'],'soja':['סויה','טופו','אדממה'],
  'legume':['עדשים','חומוס','שעועית','אפונה','פול'],'legumes':['עדשים','חומוס','שעועית','אפונה','פול'],'legumbres':['עדשים','חומוס','שעועית','אפונה'],
  // ---- statutory (EU top-14) additions: mustard, celery, sulphites, lupin, molluscs ----
  'חרדל':['חרדל','מוסטרד','רוטב חרדל','דיז׳ון'],'mustard':['חרדל','מוסטרד','דיז׳ון'],'mostaza':['חרדל','מוסטרד'],
  'סלרי':['סלרי','כרפס','שורש סלרי'],'celery':['סלרי','כרפס'],'apio':['סלרי','כרפס'],
  'סולפיטים':['סולפיט','סולפיטים','יין','חומץ יין','פירות יבשים','משמש מיובש','צימוקים'],'סולפיט':['סולפיט','יין','פירות יבשים','משמש מיובש','צימוקים'],'sulphite':['סולפיט','יין','פירות יבשים','משמש מיובש'],'sulphites':['סולפיט','יין','פירות יבשים','משמש מיובש'],'sulfite':['סולפיט','יין','פירות יבשים','משמש מיובש'],'sulfito':['סולפיט','יין','פירות יבשים','משמש מיובש'],
  'תורמוס':['תורמוס','לופין','קמח תורמוס'],'lupin':['תורמוס','לופין'],'lupine':['תורמוס','לופין'],'altramuz':['תורמוס','לופין'],
  'רכיכות ים':['מולים','צדפות','קלמרי','קלמארי','חבלולים','תמנון','דיונון'],'mollusc':['מולים','צדפות','קלמרי','תמנון','דיונון'],'mollusk':['מולים','צדפות','קלמרי','תמנון'],'molusco':['מולים','צדפות','קלמרי','תמנון']
};
function bannedWords(allergiesText){
  const t=(allergiesText||'').toLowerCase(),out=[];
  Object.entries(ALLERGEN_WORDS).forEach(([k,words])=>{if(t.includes(k.toLowerCase()))words.forEach(w=>out.push(w));});
  return out;
}
function mealHasAllergen(m,banned){return banned.length&&m.ing.some(i=>banned.some(w=>i.includes(w)));}
var ALLERGY_CHIPS=[['🥜 בוטנים','בוטנים'],['🌰 אגוזים','אגוזים'],['⚪ שומשום','שומשום'],['🌾 גלוטן','גלוטן'],['🥛 חלב','חלב'],['🥚 ביצים','ביצים'],['🐟 דגים','דגים'],['🦐 רכיכות','רכיכות'],['🫘 סויה','סויה'],['🫛 קטניות','קטניות'],['🟡 חרדל','חרדל'],['🥬 סלרי','סלרי'],['🍷 סולפיטים','סולפיטים'],['🌱 תורמוס','תורמוס']];
function algChips(inputId,current){var cur=(current||'').toLowerCase();return '<div class="pills" style="margin-top:8px">'+ALLERGY_CHIPS.map(function(o){var on=cur.indexOf(o[1].toLowerCase())>=0;return '<button type="button" class="pill'+(on?' act':'')+'" onclick="algToggle(&quot;'+inputId+'&quot;,this,&quot;'+o[1]+'&quot;)">'+o[0]+'</button>';}).join('')+'</div>';}
function algToggle(inputId,btn,word){var inp=document.getElementById(inputId);if(!inp)return;var parts=inp.value.split(/[,\u060c;\n]/).map(function(x){return x.trim();}).filter(Boolean);var lw=word.toLowerCase();var idx=-1;for(var k=0;k<parts.length;k++){if(parts[k].toLowerCase()===lw){idx=k;break;}}if(idx>=0){parts.splice(idx,1);btn.classList.remove('act');}else{parts.push(word);btn.classList.add('act');}inp.value=parts.join(', ');try{inp.dispatchEvent(new Event('input',{bubbles:true}));}catch(e){}try{inp.dispatchEvent(new Event('change',{bubbles:true}));}catch(e){}}
function dislikeWords(t){return (t||'').split(/[,،;\n]/).map(s=>s.trim()).filter(s=>s.length>=2);}
function isProteinFriendly(m){return m&&m.p>=15&&m.f<=Math.round(m.p*0.6);}  // fat well below protein (guide rule)
function mealDisliked(m,dis){return dis.length&&(dis.some(w=>m.name.includes(w))||m.ing.some(i=>dis.some(w=>i.includes(w))));}
function pickSafeMeal(arr,seed,banned,dis){
  dis=dis||[];
  for(let k=0;k<arr.length;k++){const m=arr[(seed+k)%arr.length];if(!mealHasAllergen(m,banned)&&!mealDisliked(m,dis))return{m,safe:true};}
  for(let k=0;k<arr.length;k++){const m=arr[(seed+k)%arr.length];if(!mealHasAllergen(m,banned))return{m,safe:true};}
  return {m:arr[seed%arr.length],safe:false};
}
/* scale recipe ingredient quantities to the per-meal calorie target */
function scaleQty(str,f){
  if(!f||Math.abs(f-1)<0.04)return str;
  return str.replace(/(\d+(?:\.\d+)?)/g,m=>{
    let x=parseFloat(m)*f;
    if(x>=20)x=Math.round(x/5)*5; else x=Math.max(1,Math.round(x));
    return Number.isInteger(x)?String(x):x.toFixed(1);
  });
}
/* injuries → which exercises/areas to avoid */
function injuryFlags(p){
  const t=((p.nutrition&&p.nutrition.injuries)||'').toLowerCase();
  var back=/גב|back|espalda|lumbar/.test(t),
      shoulder=/כתפ|כתף|shoulder|hombro/.test(t),
      knee=/ברכ|ברך|knee|rodilla/.test(t),
      wrist=/שורש|כף יד|פרק|wrist|mu.eca|carpo/.test(t),
      elbow=/מרפק|elbow|codo/.test(t);
  return {has:(back||shoulder||knee||wrist||elbow), back:back, shoulder:shoulder, knee:knee, wrist:wrist, elbow:elbow};
}
function injuryNote(p){var fl=injuryFlags(p);if(!fl.has)return '';var pa=[];if(fl.knee)pa.push('ברכיים');if(fl.shoulder)pa.push('כתפיים');if(fl.back)pa.push('גב');if(fl.wrist)pa.push('שורש כף יד');if(fl.elbow)pa.push('מרפק');if(!pa.length)return '';return 'התוכנית הותאמה לפציעות שציינת ('+pa.join(', ')+') — תרגילים מעמיסים הוחלפו בגרסאות בטוחות (או הוסרו אם אין חלופה). בצע בטווח כאב-חופשי בלבד.';}
function exerciseConflict(ex,fl){
  const nm=(ex.name||'').toLowerCase(),cat=ex.cat;
  if(fl.knee&&(cat==='legs'||/squat|lunge|pistol|leg press|split/.test(nm)))return 'ברכיים';
  if(fl.back&&/deadlift|row|yoke|good morning|squat/.test(nm))return 'גב';
  if(fl.shoulder&&/bench|press|dip|overhead|push-up|handstand|flag|lever/.test(nm))return 'כתפיים';
  if(fl.wrist&&/push-up|plank|handstand|lever|flag|rollout|l-sit/.test(nm))return 'שורש כף יד';
  if(fl.elbow&&/dip|press|pull-up|chin|row|push-up/.test(nm))return 'מרפק';
  return null;
}
/* display name honoring user-selected swaps */
function exName(p,ex){
  const sw=(p.exSwaps||{})[ex.id]||0;
  if(!sw||ex.baseIdx==null)return ex.name;
  return ladderBase(p,ex,sw)+' (חלופי)';
}
/* personalized "today's workout" — focus rotates, exercises match level & location */
function todayWorkout(p){
  const lvl=Math.min(10,Math.max(1,p.fitness.level));
  const exs=levelExercises(lvl), fl=injuryFlags(p);
  const rotations=[['chest','core'],['back','core'],['legs','core']];
  const focus=rotations[p.workouts%3];
  let picks=exs.filter(e=>focus.includes(e.cat)&&!e.peak&&!exerciseConflict(e,fl)&&equipOK(p,e.name));
  if(picks.length<3){const extra=exs.filter(e=>!picks.includes(e)&&!e.peak&&!exerciseConflict(e,fl)&&equipOK(p,e.name));picks=picks.concat(extra);}
  picks=picks.slice(0,4);
  const focusHe=focus.map(c=>CATS.find(x=>x.k===c).he).join(' + ');
  return {focusHe,picks,lvl,injuryAware:fl.has};
}

