/* src/plan/track.js — the recommended track: days, split and mix, and how it is shown
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---- the recommended track ------------------------------------------------
   How you train is the most consequential question the app asks and the one a
   newcomer has least basis to answer, so the app answers it: it reads the
   profile, names the track it would pick, says why in the user's own terms and
   offers to set the whole thing up.

   Its usual answer is the combination, and the reasons are the ones below:
   loaded lifts are what keep adding size and strength once bodyweight has run
   out of ways to get harder, bodyweight is what still works when the gym is
   shut and what carries the skill ladder, and each covers where the other is
   thin. Two cases get a different answer, so that the recommendation is a
   reading of the profile and not a slogan — someone already strong and only
   maintaining is told bodyweight alone covers it, and someone who cannot yet
   hold a push-up is told to start on machines, where a press can be loaded at
   any weight at all. */
function recommendTrack(p){
  p=p||P();
  var age=(p.personal&&+p.personal.age)||30,
      goal=p.goal||'both',
      lvl=(p.fitness&&+p.fitness.level)||1,
      pull=(p.fitness&&p.fitness.pullups)||'0',
      push=(p.fitness&&p.fitness.pushups)||'0-5',
      have=trainingDays(p).length,
      st='hybrid',why=[];
  var strongPull=(pull==='10+'||pull==='5-10');

  if(goal==='maintain'&&strongPull&&lvl>=6){
    st='calisthenics';
    why.push(L('אתה כבר מושך 5+ ואתה בשמירה — משקל גוף לבד מחזיק את זה, ואפשר לעשות אותו בכל מקום.',
      'You already pull 5+ and you are maintaining — bodyweight alone holds that, and it goes anywhere.',
      'Ya haces 5+ dominadas y estás manteniendo — el peso corporal solo lo sostiene, y va a cualquier parte.'));
  }else if(pull==='0'&&push==='0-5'&&(lvl<=2||age>=55)){
    st='gym';
    why.push(L('בשלב הזה מכונה נותנת לך להתחיל מכל משקל שהוא — משקל גוף מתחיל מהמשקל שלך, וזה עוד יותר מדי.',
      'At this stage a machine lets you start from any weight at all — bodyweight starts at your weight, and that is still too much.',
      'Ahora mismo una máquina te deja empezar con cualquier peso — el peso corporal empieza en el tuyo, y aún es demasiado.'));
    why.push(L('כשתחזיק 6 שכיבות סמיכה, המלצה כאן תשתנה למשולב — והעץ כבר יחכה לך.',
      'Once you hold 6 push-ups this turns into the combination — and the tree is already waiting.',
      'Cuando aguantes 6 flexiones esto pasa a la combinación — y el árbol ya te espera.'));
  }else{
    why.push(L('משקולות זה מה שממשיך להוסיף מסה כשמשקל גוף כבר לא יכול להיות קשה יותר — אפשר להוסיף ק״ג, אי אפשר להוסיף גוף.',
      'Weights are what keep adding size once bodyweight has run out of ways to get harder — you can add a kilo, you cannot add a body.',
      'Las pesas son lo que sigue añadiendo masa cuando el peso corporal ya no puede ser más difícil — puedes añadir un kilo, no un cuerpo.'));
    why.push(L('משקל גוף זה מה שנשאר לך כשחדר הכושר סגור — חצי מהתוכנית עובדת בסלון.',
      'Bodyweight is what you still have when the gym is shut — half the plan works in a living room.',
      'El peso corporal es lo que te queda cuando el gimnasio está cerrado — media rutina funciona en un salón.'));
    if(strongPull)
      why.push(L('יש לך בסיס משיכה — קליסטניקס ייקח אותו לכישורים, וחדר הכושר ייתן לגב את העומס שמתח לבד כבר לא נותן.',
        'You have a pulling base — calisthenics takes it to the skills, and the gym gives your back the load a pull-up alone stopped giving.',
        'Tienes base de tirón — la calistenia la lleva a las habilidades, y el gimnasio da a tu espalda la carga que la dominada ya no da.'));
    else
      why.push(L('מתח זו החולשה הכי נפוצה — פולי עליון בונה אותו בהדרגה בזמן שאתה מתאמן על מתח אמיתי.',
        'The pull-up is the most common gap — a lat pulldown builds it by degrees while you keep working the real thing.',
        'La dominada es la carencia más común — el jalón la construye por grados mientras sigues con la real.'));
    if(age>=50)
      why.push(L('מכונות מאפשרות עומס בלי לאזן משקל חופשי, ומשקל גוף שומר על טווח תנועה — שילוב טוב בגיל הזה.',
        'Machines let you load without balancing a free weight, and bodyweight keeps the range of motion — a good pairing at this age.',
        'Las máquinas permiten cargar sin equilibrar peso libre, y el peso corporal mantiene el rango — buena combinación a esta edad.'));
  }

  /* The day count only changes when there is a reason, and when it changes the
     reason is said out loud — the panel is about to overwrite the days the user
     picked, and silently going from 2 to 4 is not a recommendation, it is a
     surprise. */
  /* The day count only changes when there is a reason, and the reason is said
     out loud — the panel is about to overwrite the days the user picked, and
     going from two to four in silence is a surprise, not a recommendation.
     A target date is the strongest reason there is: a deadline that asks for
     more than a week can give is answered with more weeks' worth of sessions,
     up to the six that still leave a rest day. */
  /* The count is derived from the goal and the date, never from what the user
     currently trains — otherwise satisfying the recommendation moves it, and
     applying "four days" turns it into a recommendation for five. It is a
     target, so asking twice gives the same answer twice. */
  var pl=goalPlan(p),floorDays=(goal==='muscle'||goal==='fat')?4:3,days;
  /* With a date, the count is a step off that baseline in the direction the
     date points — tighter asks for one more, roomier settles for one fewer.
     Ordering it this way keeps it monotone: a date that is easier can never
     come back asking for more sessions than one that is harder. */
  if(pl.set&&pl.verdict!=='nogoalweight'){
    days=pl.verdict==='tight'||pl.verdict==='unrealistic'?Math.min(6,floorDays+1)
      :pl.verdict==='easy'?Math.max(3,floorDays-1):floorDays;
    why.push(pl.verdict==='tight'||pl.verdict==='unrealistic'
      ?L('התאריך שבחרת צפוף, אז '+days+' ימים ולא פחות — יותר אימונים בשבוע זה מה שנשאר לעשות כשיש פחות שבועות.',
        'The date you picked is tight, so '+days+' days and not fewer — more sessions a week is what is left to do when there are fewer weeks.',
        'La fecha que elegiste es ajustada, así que '+days+' días y no menos — más sesiones por semana es lo que queda cuando hay menos semanas.')
      :pl.verdict==='easy'
      ?L('יש לך מספיק זמן עד התאריך, אז '+days+' ימים מספיקים — עדיף לעמוד בזה לאורך זמן מאשר להישרף.',
        'You have enough time before the date, so '+days+' days is enough — better to keep it up than to burn out.',
        'Tienes tiempo de sobra hasta la fecha, así que '+days+' días bastan — mejor sostenerlo que quemarse.')
      :L(days+' ימים בשבוע זה מה שהתאריך שבחרת מבקש — לא צפוף ולא מפוזר.',
        days+' days a week is what your date asks for — neither tight nor thin.',
        days+' días por semana es lo que pide tu fecha — ni ajustado ni diluido.'));
  }else if(!have||have<3){
    days=floorDays;
    why.push(L('ב-'+days+' ימים כל שריר חוזר פעם-פעמיים בשבוע, בתוך חלון ההתאוששות שלו — פחות מזה והשבוע מתפזר.',
      'At '+days+' days each muscle comes round once or twice a week, inside its recovery window — fewer than that and the week thins out.',
      'Con '+days+' días cada músculo vuelve una o dos veces por semana, dentro de su ventana — con menos, la semana se diluye.'));
  }else if(have>6){
    days=6;
    why.push(L('שישה ימים ולא שבעה — יום מנוחה מלא הוא מה שמאפשר לאימון הבא להיות קשה.',
      'Six days rather than seven — one full rest day is what lets the next session be a hard one.',
      'Seis días en vez de siete — un día completo de descanso es lo que permite que la siguiente sesión sea dura.'));
  }else{
    days=have;
  }
  return {style:st,why:why,days:days,
    duration:(goal==='muscle'?60:goal==='fat'?45:45),
    changes:st!==trainStyle(p)};
}
/* what the recommended week would actually look like, session by session */
function trackSplit(days){
  return (SPLITS[Math.max(1,Math.min(7,days))]||[]).map(sessName);
}
/* Not a claim about the split — a count off a session actually built under the
   recommendation, so the two halves are described by what they really deliver. */
function trackMix(p,rec){
  try{
    var probe=Object.assign({},p,{workout:Object.assign({},p.workout,{
      style:rec.style,equipment:kitDefault(rec.style),days:[0,1,2,3,4,5,6]})});
    var n={bw:0,gym:0};
    (SPLITS[Math.max(1,Math.min(7,rec.days))]||[]).forEach(function(sess,i){
      buildSession(probe,Object.assign({},sess,{dow:i,idx:i})).forEach(function(e){
        var mv=MOVE_BY_BASE[e.base];if(mv)n[moveEnv(mv)]++;
      });
    });
    return n;
  }catch(e){return {bw:0,gym:0};}
}
/* ---- the recommendation, on screen ----
   One card. What it recommends, why, what the week looks like, and a button
   that sets it up. When you are already on it, it says so in a line and stops
   there rather than repeating the pitch. */
function recoTrackHTML(p){
  p=p||P();
  var rec=recommendTrack(p);
  if(!rec.changes){
    return '<div class="sub" style="margin:10px 0 0;color:var(--green2);font-weight:700">✅ '+
      L('זה גם המסלול שהיינו ממליצים לך לפי התשובות שלך.',
        'This is the track we would recommend for your answers too.',
        'Este es también el itinerario que recomendaríamos según tus respuestas.')+'</div>';
  }
  var mix=trackMix(p,rec),total=mix.bw+mix.gym;
  /* A panel rather than a nested .card: a card inside a card pays its padding
     twice, which at the largest text size squeezed the heading narrower than
     one Spanish word. */
  return '<div class="recobox">'+
    '<div style="font-weight:900;font-size:15px">🎯 '+L('המסלול שהיינו ממליצים לך','The track we would recommend','El itinerario que recomendaríamos')+'</div>'+
    '<div style="font-weight:900;font-size:17px;color:var(--teal2);margin:6px 0 2px">'+styleName(rec.style)+'</div>'+
    '<div class="sub" style="margin:0 0 8px">'+styleBlurb(rec.style)+'</div>'+
    rec.why.map(function(w){return '<div class="sub" style="margin:5px 0 0;line-height:1.6">• '+w+'</div>';}).join('')+
    '<div class="field" style="margin-top:12px"><label>'+L('איך השבוע ייראה','What the week looks like','Cómo sería la semana')+'</label></div>'+
    '<div class="chips">'+trackSplit(rec.days).map(function(n){
      return '<span class="chip sm" data-notr>'+esc(n)+'</span>';}).join('')+'</div>'+
    '<div class="sub" style="margin:8px 0 0">'+rec.days+' '+L('ימים בשבוע','days a week','días por semana')+' · '+
      rec.duration+' '+L('דק׳ לאימון','min a session','min por sesión')+
      (total?(' · '+L('בשבוע כזה יוצאים ','a week like that comes out ','una semana así sale ')+
        mix.gym+' '+L('תרגילי חדר כושר ו-','gym exercises and ','ejercicios de gimnasio y ')+
        mix.bw+' '+L('תרגילי משקל גוף','bodyweight ones','de peso corporal')):'')+'</div>'+
    '<button class="btn grad" data-act="applyTrack" style="width:100%;margin-top:12px">'+
      L('הפעל את המסלול הזה','Set this track up','Aplicar este itinerario')+'</button>'+
    '<div class="sub" style="margin:4px 0 0;font-size:12px">'+
      L('משנה את סגנון האימון, מספר הימים ומשך האימון. ההיסטוריה, המשקלים והעץ נשמרים.',
        'Changes the style, the number of days and the session length. Your history, weights and tree are kept.',
        'Cambia el estilo, los días y la duración. Tu historial, pesos y árbol se conservan.')+'</div>'+
  '</div>';
}
/* The questionnaire has no profile yet, so the recommender is handed the
   answers so far in the shape it expects. */
/* ---- the last question the questionnaire asks ----
   A date, and then everything the app can say about it: how many weeks that
   is, what it asks for per week, whether a body does that, how many days a
   week it would train you, and — when the answer is no — the earliest date
   that is a yes, on a button. */
function obDateStepHTML(){
  var d=(typeof OB!=='undefined'&&OB&&OB.data)||{};
  var shim=obProfileShim();
  shim.goalDate=d.goalDate||0; shim.goalWeight=+d.goalWeight||0;
  shim.personal.weight=+d.weight||70;
  var pl=goalPlan(shim),rec=recommendTrack(shim);
  var iso=d.goalDate?new Date(+d.goalDate).toISOString().slice(0,10):'';
  var min=new Date(Date.now()+14*MS_D).toISOString().slice(0,10);
  var max=new Date(Date.now()+730*MS_D).toISOString().slice(0,10);
  var col=pl.verdict==='unrealistic'?'var(--orange2)':pl.verdict==='tight'?'var(--blue2)':'var(--green2)';
  return '<h2 style="font-size:21px;margin:0 0 6px">'+L('🎯 מתי אתה רוצה להיות שם?',"🎯 When do you want to be there?",'🎯 ¿Para cuándo quieres estar ahí?')+'</h2>'+
    '<div class="sub" style="margin:0 0 12px">'+L('התוכנית תתאים את עצמה לתאריך — הקצב, הקלוריות ומספר הימים בשבוע. אפשר גם לדלג.',
      'The plan tunes itself to the date — the pace, the calories and how many days a week. You can skip this.',
      'El plan se ajusta a la fecha — el ritmo, las calorías y los días por semana. Puedes saltarlo.')+'</div>'+
    '<div class="pills">'+[[30,L('חודש','1 month','1 mes')],[90,L('3 חודשים','3 months','3 meses')],
      [180,L('חצי שנה','6 months','6 meses')],[365,L('שנה','a year','un año')]].map(function(o){
      var ts=Date.now()+o[0]*MS_D;
      var on=d.goalDate&&Math.abs(+d.goalDate-ts)<3*MS_D;
      return '<button class="pill '+(on?'act':'')+'" onclick="obSetDate('+ts+')">'+o[1]+'</button>';}).join('')+'</div>'+
    '<div class="field" style="margin-top:12px"><label>'+L('או תאריך מדויק','or an exact date','o una fecha exacta')+'</label>'+
      '<input class="inp" type="date" value="'+iso+'" min="'+min+'" max="'+max+'" onchange="obSetDate(this.value?Date.parse(this.value):0)"></label></div>'+
    (pl.set?('<div class="recobox" style="margin-top:12px">'+
      '<div style="font-weight:900;font-size:15px">'+fmtDate(pl.date)+' — '+pl.weeks+' '+L('שבועות','weeks','semanas')+'</div>'+
      (pl.need?('<div class="sub" style="margin:6px 0 0">'+L('צריך ','that is ','eso son ')+'<b>'+pl.need+' '+L('ק״ג','kg','kg')+'</b>'+
        L(' — כלומר ',' — about ',' — o sea ')+'<b>'+pl.rate+' '+L('ק״ג בשבוע','kg a week','kg por semana')+'</b>'+
        L(', והבטוח הוא עד ',', where safe is up to ',', y lo seguro es hasta ')+pl.safe+'</div>'):'')+
      '<div class="sub" style="margin:6px 0 0;color:'+col+';font-weight:700">'+goalVerdictText(pl)+'</div>'+
      (pl.verdict==='unrealistic'&&pl.earliestDate?('<button class="btn b sm" style="width:100%;margin-top:8px" onclick="obSetDate('+pl.earliestDate+')">'+
        L('קבע ל-','Use ','Usar ')+fmtDate(pl.earliestDate)+L(' — התאריך המוקדם ביותר שאפשר',' — the earliest that works',' — la fecha más temprana posible')+'</button>'):'')+
      '<div class="sub" style="margin:8px 0 0">🗓️ '+L('לפי זה נמליץ על ','From that we would train you ','Por eso entrenaríamos ')+
        '<b style="color:var(--teal2)">'+rec.days+' '+L('ימים בשבוע','days a week','días por semana')+'</b>'+
        L(' · העוצמה התזונתית תיקבע ל-',' · the nutrition side is set to ',' · el lado nutricional se fija en ')+
        Math.round(pl.factor*100)+'%</div>'+
      /* the day picker is three steps back, so the recommendation it produced
         is applied from here rather than sending the user to look for it */
      ((Array.isArray(d.days)?d.days.length:0)!==rec.days
        ?('<button class="btn p sm" style="width:100%;margin-top:8px" onclick="obUseRecDays()">'+
          L('קבע ל-','Make it ','Ponerlo en ')+rec.days+' '+L('ימים בשבוע','days a week','días por semana')+
          L(' (בחרת ',' (you picked ',' (elegiste ')+(Array.isArray(d.days)?d.days.length:0)+')</button>')
        :('<div class="sub" style="margin:4px 0 0;color:var(--green2);font-weight:700">✓ '+
          L('זה בדיוק מה שבחרת.','That is exactly what you picked.','Eso es justo lo que elegiste.')+'</div>'))+
    '</div>'):'<div class="sub" style="margin:12px 0 0">'+L('לא בחרת תאריך — נשתמש בקצב שבחרת קודם.',
      'No date picked — we will use the pace you chose earlier.','Sin fecha — usaremos el ritmo que elegiste antes.')+'</div>');
}
function obSetDate(ts){
  if(!OB)return;
  OB.data.goalDate=(+ts&&+ts>Date.now())?+ts:0;
  obRender();
}
/* Spread the recommended count over the week rather than taking the first N
   days: three days on Sunday, Monday, Tuesday is not what "three days" means. */
const DAY_SPREAD=[[0],[0,3],[0,2,4],[0,2,4,6],[0,1,3,4,6],[0,1,2,4,5,6],[0,1,2,3,4,5,6]];
function obUseRecDays(){
  if(!OB)return;
  var n=recommendTrack(obProfileShim()).days;
  OB.data.days=(DAY_SPREAD[Math.max(1,Math.min(7,n))-1]||[0,2,4]).slice();
  obRender();
}
/* the same question in settings, because a date you cannot move is a date that
   goes stale the week after you set it */
function goalDateSettingHTML(p){
  var pl=goalPlan(p),rec=recommendTrack(p);
  var iso=pl.set?new Date(pl.date).toISOString().slice(0,10):'';
  var min=new Date(Date.now()+14*MS_D).toISOString().slice(0,10);
  var max=new Date(Date.now()+730*MS_D).toISOString().slice(0,10);
  var col=pl.verdict==='unrealistic'?'var(--orange2)':pl.verdict==='tight'?'var(--blue2)':'var(--green2)';
  return '<div class="field" style="margin-top:12px"><label>'+L('תאריך יעד','Target date','Fecha objetivo')+'</label>'+
    '<div class="sub" style="margin:0 0 6px">'+L('הקצב, הקלוריות ומספר הימים בשבוע נגזרים ממנו.',
      'The pace, the calories and the days a week all follow from it.',
      'El ritmo, las calorías y los días por semana se derivan de ella.')+'</div>'+
    '<input class="inp" type="date" value="'+iso+'" min="'+min+'" max="'+max+'" data-act="setGoalDate"></div>'+
    '<div class="pills">'+[[30,L('חודש','1 month','1 mes')],[90,L('3 חודשים','3 months','3 meses')],
      [180,L('חצי שנה','6 months','6 meses')],[365,L('שנה','a year','un año')]].map(function(o){
      var ts=Date.now()+o[0]*MS_D,on=pl.set&&Math.abs(pl.date-ts)<3*MS_D;
      return '<button class="pill '+(on?'act':'')+'" data-act="goalDatePreset" data-v="'+o[0]+'">'+o[1]+'</button>';}).join('')+
      (pl.set?'<button class="pill" data-act="goalDatePreset" data-v="0">'+L('בלי תאריך','No date','Sin fecha')+'</button>':'')+'</div>'+
    (pl.set?('<div class="sub" style="margin:8px 0 0">'+fmtDate(pl.date)+' · '+pl.weeks+' '+L('שבועות','weeks','semanas')+
      (pl.need?(' · '+pl.rate+' '+L('ק״ג בשבוע (בטוח עד ','kg a week (safe up to ','kg por semana (seguro hasta ')+pl.safe+')'):'')+
      ' · '+rec.days+' '+L('ימים בשבוע','days a week','días por semana')+'</div>'+
      '<div class="sub" style="margin:4px 0 0;color:'+col+';font-weight:700">'+goalVerdictText(pl)+'</div>')
      :('<div class="sub" style="margin:8px 0 0">'+L('בלי תאריך — הקצב נשאר '+({1:'חודש',3:'3 חודשים',6:'6 חודשים'}[p.pace]||'חודש')+'.',
        'No date — the pace stays at '+({1:'1 month',3:'3 months',6:'6 months'}[p.pace]||'1 month')+'.',
        'Sin fecha — el ritmo se queda en '+({1:'1 mes',3:'3 meses',6:'6 meses'}[p.pace]||'1 mes')+'.')+'</div>'));
}
function setGoalDate(ts){
  commit(function(pp){
    pp.goalDate=(+ts&&+ts>Date.now())?+ts:0;
    if(pp.goalDate){var m=(pp.goalDate-Date.now())/(30.44*MS_D);pp.pace=m<=2?1:m<=4.5?3:6;}
  });
  render();
}
/* ---- the countdown, on the home screen ----
   One line while the date is far off and everything is on course; the whole
   arithmetic when it is not. */
function goalCountdownHTML(p){
  var pl=goalPlan(p);
  if(!pl.set)return '';
  var col=pl.verdict==='unrealistic'?'var(--orange2)':pl.verdict==='tight'?'var(--blue2)':'var(--teal2)';
  var gone=(p.weights&&p.weights.length>1)?(function(){
    var ws=p.weights.slice().sort(function(a,b){return a.d-b.d;});
    return Math.round((ws[0].v-ws[ws.length-1].v)*10)/10;})():0;
  return '<div class="card"><h2>🎯 '+L('היעד שלך','Your target','Tu objetivo')+'</h2>'+
    '<div class="sub" style="margin:0;font-size:14px;color:var(--txt)">'+
      '<b style="color:'+col+'">'+pl.weeks+' '+L('שבועות','weeks','semanas')+'</b> '+
      L('עד ','until ','hasta ')+fmtDate(pl.date)+
      (pl.need?(' · '+L('נשארו ','still ','quedan ')+'<b>'+pl.need+' '+L('ק״ג','kg','kg')+'</b>'):'')+'</div>'+
    (pl.need?('<div class="sub" style="margin:6px 0 0">'+L('קצב נדרש','required pace','ritmo necesario')+': <b>'+pl.rate+
      '</b> '+L('ק״ג בשבוע','kg a week','kg por semana')+' · '+L('בטוח עד','safe up to','seguro hasta')+' <b>'+pl.safe+'</b>'+
      (gone?(' · '+L('כבר ירדת','already moved','ya has movido')+' <b>'+Math.abs(gone)+'</b>'):'')+'</div>'):'')+
    '<div class="sub" style="margin:6px 0 0;color:'+col+';font-weight:700">'+goalVerdictText(pl)+'</div>'+
  '</div>';
}
function obProfileShim(){
  var d=(typeof OB!=='undefined'&&OB&&OB.data)||{};
  var lv=1;
  try{lv=computeLevelFromAssessment(d.pushups,d.pullups,d.squats,false);}catch(e){}
  return {personal:{age:+d.age||30,weight:+d.weight||70},goal:d.goal||'both',
    goalWeight:+d.goalWeight||0,goalDate:+d.goalDate||0,
    fitness:{level:lv,pushups:d.pushups,pullups:d.pullups,squats:d.squats},
    workout:{style:(STYLES.indexOf(d.equip)>=0?d.equip:'calisthenics'),
      equipment:(Array.isArray(d.equipment)?d.equipment:[]),
      days:(Array.isArray(d.days)?d.days:[])}};
}
function applyTrack(){
  var rec=recommendTrack(P());
  commit(function(pp){
    pp.workout.style=rec.style;
    pp.workout.location=(rec.style==='calisthenics')?'home':'gym';
    pp.workout.equipment=kitDefault(rec.style);
    // keep the days they already picked when there are enough of them; the
    // recommendation is about how many, not which
    var cur=trainingDays(pp);
    if(cur.length!==rec.days){
      pp.workout.days=(DAY_SPREAD[Math.max(1,Math.min(7,rec.days))-1]||[0,2,4]).slice();
    }
    pp.woPrefs=pp.woPrefs||{};pp.woPrefs.duration=rec.duration;
    pp.planShuffle=(pp.planShuffle||0)+1;      // rebuild the week under the new style
  });
  render();
  toast(L('המסלול הופעל — התוכנית נבנתה מחדש','Track applied — the week was rebuilt','Itinerario aplicado — la semana se reconstruyó'));
}
function styleEnvs(st){return st==='gym'?['gym']:st==='hybrid'?['bw','gym']:['bw'];}
function moveEnv(mv){return (mv&&mv.env)||'bw';}

