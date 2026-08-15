/* src/onboarding.js — the first-run questionnaire
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---------- first-run onboarding wizard ---------- */
let OB=null;
function startOnboarding(){
  var p=P();
  OB={step:-1,data:{name:(p.personal.name==='יובל'?'':p.personal.name||''),gender:p.personal.gender||'זכר',age:p.personal.age||25,height:p.personal.height||175,weight:p.personal.weight||70,goal:p.goal||'both',pushups:'6-15',pullups:'1-4',squats:'21-50',equip:'calisthenics',days:[0,2,4],diet:(p.nutrition&&p.nutrition.diet)||'regular',injuries:(p.nutrition&&p.nutrition.injuries)||'',allergies:(p.nutrition&&p.nutrition.allergies)||''}};
  obRender();
}
function obSet(k,v){OB.data[k]=v;}
function obPick(k,v){OB.data[k]=v;obRender();}
function obStep(n){
  if(n>OB.step&&OB.step===0&&!String(OB.data.name).trim()){toast('מה השם שלך?');return;}
  OB.step=Math.max(0,Math.min(4,n));obRender();
}
/* Leaving the questionnaire without answering it. Only offered on a re-run —
   first-time onboarding has nothing to go back to. Nothing has been written
   yet, since obFinish is the only thing that commits, so this is just putting
   the screen away. */
function cancelOb(){
  OB=null;
  try{var w=document.getElementById('obwrap');if(w){w.innerHTML='';w.style.display='none';}}catch(e){}
  render();
}
function redoOb(){
  var p=P();
  OB={step:0,redo:true,data:{
    name:p.personal.name||'',gender:p.personal.gender||'זכר',age:p.personal.age||25,
    height:p.personal.height||175,weight:p.personal.weight||70,
    goal:p.goal||'both',goalWeight:p.goalWeight||'',goalDate:p.goalDate||0,
    pushups:(p.fitness&&p.fitness.pushups)||'6-15',
    pullups:(p.fitness&&p.fitness.pullups)||'1-4',
    squats:(p.fitness&&p.fitness.squats)||'21-50',
    equip:trainStyle(p),
    equipment:((p.workout&&p.workout.equipment)||[]).slice(),
    days:((p.workout&&p.workout.days)||[0,2,4]).slice(),
    diet:(p.nutrition&&p.nutrition.diet)||'regular',
    injuries:(p.nutrition&&p.nutrition.injuries)||'',
    allergies:(p.nutrition&&p.nutrition.allergies)||'',
    c_health:1,c_terms:1                        // already agreed to, do not ask twice
  }};
  try{closeSheet();closeModal();}catch(e){}
  obRender();
}
function obFinish(){
  var d=OB.data;
  commit(function(pp){
    pp.personal.name=String(d.name).trim()||'אני';pp.name=pp.personal.name;
    pp.personal.gender=d.gender;pp.personal.age=+d.age||25;pp.personal.height=+d.height||175;pp.personal.weight=+d.weight||70;
    // Answering the questionnaire a second time must not wipe the weight
    // chart — only add to it, and only if the number actually moved.
    var _w=+d.weight||70;
    if(!Array.isArray(pp.weights)||!pp.weights.length){pp.weights=[{d:Date.now(),v:_w}];}
    else{
      var _last=pp.weights.reduce(function(a,b){return (b&&b.d>a.d)?b:a;});
      if(!_last||_last.v!==_w)pp.weights.push({d:Date.now(),v:_w});
    }
    pp.goal=d.goal;
    pp.fitness.pushups=d.pushups||pp.fitness.pushups;pp.fitness.pullups=d.pullups||pp.fitness.pullups;pp.fitness.squats=d.squats||pp.fitness.squats;
    pp.fitness.level=computeLevelFromAssessment(pp.fitness.pushups,pp.fitness.pullups,pp.fitness.squats,pp.fitness.pistol);
    var _st=(STYLES.indexOf(d.equip)>=0)?d.equip:'calisthenics';
    pp.workout.style=_st; pp.workout.location=(_st==='calisthenics')?'home':'gym';
    // Keep only what this style was actually asked about — answering the
    // questionnaire again and switching style must not leave the tick boxes of
    // the style you left behind. What the style implies is added on top.
    var _ask=kitAsk(_st).map(function(k){return k[0];});
    var _k=(Array.isArray(d.equipment)?d.equipment:[]).filter(function(k){return _ask.indexOf(k)>=0;});
    pp.workout.equipment=(_st==='calisthenics')?_k
      :kitDefault(_st).concat(_k).filter(function(v,i,a){return a.indexOf(v)===i;});
    pp.workout.days=(Array.isArray(d.days)&&d.days.length)?d.days.slice().sort(function(a,b){return a-b;}):[0,2,4];
    pp.nutrition=pp.nutrition||{};pp.nutrition.diet=d.diet||'regular';pp.nutrition.injuries=d.injuries||'';pp.nutrition.allergies=d.allergies||'';
    pp.onboarded=true;
    if(+d.goalWeight>0)pp.goalWeight=+d.goalWeight;
    pp.goalDate=(+d.goalDate>Date.now())?+d.goalDate:0;
    // a date is a pace said precisely; keep the old setting pointing at the
    // nearest of its three steps so nothing that reads p.pace is surprised
    if(pp.goalDate){var _m=(pp.goalDate-Date.now())/(30.44*86400000);
      pp.pace=_m<=2?1:_m<=4.5?3:6;}
  });
  OB=null;obCalculating();
}
function obCalculating(){
  var w=document.getElementById('obwrap');w.style.display='';
  var steps=[['\U0001F4CA','מנתח את הנתונים שלך'],['\U0001F525','מחשב קלוריות ומאקרו'],['\U0001F3CB️','בונה תוכנית אימון מותאמת'],['\U0001F4AA','מתאים תרגילים לרמת הכוח שלך'],['\U0001F4A7','מסדר יעדי מים ותזונה'],['\U0001F3AF','מכין את המאמן האישי שלך']];
  var pname=esc((P().personal&&P().personal.name)||'');
  w.innerHTML='<style>@keyframes obspin{to{transform:rotate(360deg)}}@keyframes obpulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.07);opacity:.82}}.obcalc-logo{position:relative;display:inline-block}.obcalc-logo .logobox{animation:obpulse 1.6s ease-in-out infinite}.obcalc-ring{position:absolute;inset:-13px;border-radius:50%;border:2px solid rgba(255,255,255,.08);border-top-color:var(--accent);animation:obspin .9s linear infinite}.obcalc-bar{height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden}.obcalc-bar>i{display:block;height:100%;width:0;background:var(--accent);border-radius:99px;transition:width .55s ease}.obcalc-step{display:flex;align-items:center;gap:11px;padding:12px 14px;border-radius:16px;margin:8px 0;background:var(--card2);border:1px solid var(--line);opacity:.38;transform:translateY(5px);transition:all .35s}.obcalc-step.on{opacity:1;transform:none;border-color:var(--accent-line2);background:var(--accent-wash)}.obcalc-ic{font-size:18px}.obcalc-tx{flex:1;font-weight:700;font-size:14px}.obcalc-chk{color:var(--accent);font-weight:800;width:18px;text-align:center}</style>'+
    '<div style="position:fixed;inset:0;z-index:300;background:var(--bg);overflow:auto;display:flex;align-items:center;justify-content:center">'+
    '<div class="app" style="max-width:460px;margin:0 auto;text-align:center;padding:24px">'+
    '<div class="obcalc-logo"><span class="logobox" style="width:72px;height:72px;display:inline-block"></span><span class="obcalc-ring"></span></div>'+
    '<h2 style="font-size:22px;margin:20px 0 4px">בונים את התוכנית של '+pname+'…</h2>'+
    '<div class="sub" style="margin:0 0 18px">רגע, מחשבים הכל במיוחד בשבילך</div>'+
    '<div class="obcalc-bar"><i id="obCalcFill"></i></div>'+
    '<div style="margin-top:20px;text-align:start">'+steps.map(function(st,i){return '<div class="obcalc-step" id="obcs'+i+'"><span class="obcalc-ic">'+st[0]+'</span><span class="obcalc-tx">'+st[1]+'</span><span class="obcalc-chk" id="obck'+i+'"></span></div>';}).join('')+'</div>'+
    '</div></div>';
  try{var lb=w.querySelector('.logobox');if(lb&&typeof LOGO_MARK!=='undefined')lb.style.backgroundImage='url('+LOGO_MARK+')';}catch(e){}
  try{translateEl(w);}catch(e){}
  var total=steps.length,per=1350,done=0,fill=document.getElementById('obCalcFill');
  var iv=setInterval(function(){
    if(done<total){
      var st=document.getElementById('obcs'+done);if(st)st.classList.add('on');
      var ck=document.getElementById('obck'+done);if(ck)ck.textContent='✓';
      done++;if(fill)fill.style.width=Math.round(done/total*100)+'%';
    }else{clearInterval(iv);setTimeout(function(){try{obPayoff();}catch(e){}},600);}
  },per);
}
function obPayoff(){
  var p=P(),t=targets(p),wt=waterTarget(p),fem=p.personal.gender==='נקבה';
  var days=(p.workout.days||[]).length, locHe=studioEquip(p).length?('עם '+studioEquip(p).map(equipName).join(' ו')):'במשקל גוף';
  var gw=p.goalWeight, dir=gw?(gw<p.personal.weight?'ירידה':gw>p.personal.weight?'עלייה':'שמירה'):'';
  var gwLine=gw?('<div class="sub" style="margin:2px 0 0">🎯 יעד: '+gw+' ק״ג ('+dir+' של '+Math.abs(Math.round((p.personal.weight-gw)*10)/10)+' ק״ג)</div>'):'';
  function stat(v,l,cls){return '<div class="stat '+cls+'"><div class="v">'+v+'</div><div class="l">'+l+'</div></div>';}
  var w=document.getElementById('obwrap');w.style.display='';
  w.innerHTML='<div style="position:fixed;inset:0;z-index:300;background:var(--bg);overflow:auto"><div class="app" style="padding-top:30px;max-width:520px;margin:0 auto">'+
    '<div style="text-align:center;margin-bottom:8px"><span class="logobox" style="width:54px;height:54px"></span></div>'+
    '<h2 style="text-align:center;font-size:23px;margin:6px 0 2px">התוכנית של '+esc(p.personal.name)+' מוכנה 🎯</h2>'+
    '<div class="sub" style="text-align:center;margin:0 0 14px">'+goalLabel(p.goal)+' · '+locHe+' · '+days+' אימונים בשבוע</div>'+gwLine+
    '<div class="grid g4" style="margin-top:12px">'+stat(num(t.cal),'קל׳ ליום','o')+stat(t.protein+'<span style=font-size:12px>ג׳</span>','חלבון','p')+stat(t.carbs+'<span style=font-size:12px>ג׳</span>','פחמ׳','b')+stat(wt.toFixed(1)+'<span style=font-size:12px>ל׳</span>','מים','g')+'</div>'+
    '<div class="card" style="margin-top:12px"><b>✅ מה הכנו לך</b><ul style="margin:6px 0 0;padding-inline-start:18px;line-height:1.8">'+
      '<li>תוכנית אימון מותאמת לרמה '+p.fitness.level+' ולציוד שלך</li>'+
      '<li>הדגמות חיות לכל תרגיל + חימום ומתיחות</li>'+
      '<li>תפריט יומי בסגנון '+dietHe(p.nutrition.diet)+' עם יעדי מאקרו'+(p.nutrition.allergies?' (מסונן לאלרגיות)':'')+'</li>'+
      '<li>מעקב משקל, רצף ימים, XP ודרגות</li></ul></div>'+
    '<button class="btn grad" style="margin-top:16px;width:100%" onclick="obGo()">בוא נתחיל 💪</button>'+
    '</div></div>';
  try{var lb=w.querySelector('.logobox');if(lb&&typeof LOGO_MARK!=='undefined')lb.style.backgroundImage='url('+LOGO_MARK+')';}catch(e){}
  try{translateEl(w);}catch(e){}
}
function obGo(){var w=document.getElementById('obwrap');if(w){w.innerHTML='';w.style.display='none';}render();toast('ברוך הבא ל-FitAI! 🎯');}
function obPills(field,opts){return '<div class="pills">'+opts.map(function(o){return '<button class="pill '+(OB.data[field]==o[0]?'act':'')+'" onclick="obPick(&quot;'+field+'&quot;,&quot;'+o[0]+'&quot;)">'+o[1]+'</button>';}).join('')+'</div>';}
function obToggleEquip(k){var a=OB.data.equipment=Array.isArray(OB.data.equipment)?OB.data.equipment:[];var i=a.indexOf(k);if(i>=0)a.splice(i,1);else a.push(k);obRender();}
function obToggleDay(i){var a=OB.data.days=Array.isArray(OB.data.days)?OB.data.days:[];var idx=a.indexOf(i);if(idx>=0)a.splice(idx,1);else a.push(i);a.sort(function(x,y){return x-y;});obRender();}
var CONSENT_VERSION='1.0';
function legalHealthHTML(){return '<b>\u2695\ufe0f \u05d4\u05e6\u05d4\u05e8\u05ea \u05d1\u05e8\u05d9\u05d0\u05d5\u05ea</b><ul style="margin:6px 0 0;padding-inline-start:18px;line-height:1.75;font-size:13px"><li>FitAI הוא כלי מידע וכושר בלבד — הוא אינו שירות רפואי ואינו מהווה ייעוץ רפואי, אבחון או טיפול.</li><li>יש להתייעץ עם רופא/ה לפני תחילת כל תוכנית אימונים או תזונה — במיוחד במקרה של מחלת לב, לחץ דם, סוכרת, אסתמה או בעיות נשימה, בעיות שלד ומפרקים, פציעה, הריון או לידה לאחרונה, ניתוח לאחרונה, גיל 65+ או נטילת תרופות קבועות.</li><li>אני מצהיר/ה כי אני בריא/ה ובכושר גופני המאפשר פעילות גופנית, וכי אין מניעה רפואית לביצוע האימונים.</li><li>אני מצהיר/ה כי כל הפרטים שמסרתי — גיל, משקל, פציעות, מגבלות ואלרגיות — נכונים ומלאים, ואעדכן אותם בכל שינוי.</li><li>אני מתחייב/ת להפסיק מיד כל פעילות ולפנות לעזרה רפואית במקרה של כאב, כאב בחזה, סחרחורת, קוצר נשימה, בחילה או הרגשה רעה.</li><li>אני מבין/ה שפעילות גופנית כרוכה בסיכון לפציעה, ואני נוטל/ת על עצמי סיכון זה מרצוני החופשי ובאחריותי המלאה.</li><li>ערכי התזונה, הקלוריות והמאקרו הם הערכות בלבד ואינם מדויקים. באחריותי לבדוק את רכיבי המזון והתוויות — במיוחד בכל הנוגע לאלרגיות ולרגישויות.</li><li>השימוש מיועד לבני 18 ומעלה. קטין/ה רשאי/ת להשתמש באישור ובפיקוח הורה או אפוטרופוס.</li></ul>';}
function legalTermsHTML(){return '<b>\ud83d\udcdc \u05ea\u05e0\u05d0\u05d9 \u05e9\u05d9\u05de\u05d5\u05e9</b><ul style="margin:6px 0 0;padding-inline-start:18px;line-height:1.75;font-size:13px"><li>האפליקציה ניתנת כמות שהיא (AS IS), ללא כל אחריות מפורשת או משתמעת, לרבות להתאמה למטרה מסוימת או לזמינות רציפה.</li><li>אין כל הבטחה או ערובה לתוצאה כלשהי — ירידה במשקל, עלייה במסת שריר או שיפור בכושר. התוצאות משתנות מאדם לאדם.</li><li>מפתחי האפליקציה לא יישאו באחריות לכל נזק — גוף, נפש, רכוש, ישיר או עקיף — הנובע מהשימוש באפליקציה או מהסתמכות על תוכנה.</li><li>כל הנתונים נשמרים מקומית במכשיר שלך בלבד. איננו אוספים, שולחים או מאחסנים מידע בשרתים. באחריותך לגבות את הנתונים.</li><li>תוכן האפליקציה, העיצוב והקוד מוגנים בזכויות יוצרים ואין לעשות בהם שימוש מסחרי ללא אישור.</li><li>ייתכנו עדכונים לתנאים; המשך השימוש לאחר עדכון מהווה הסכמה לגרסה המעודכנת.</li><li>על תנאים אלה יחולו דיני מדינת ישראל, וסמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים בישראל.</li></ul>';}
function obToggleConsent(k){OB.data['c_'+k]=!OB.data['c_'+k];obRender();}
function obConsentAccept(){if(!(OB.data.c_health&&OB.data.c_terms)){toast('\u05d9\u05e9 \u05dc\u05d0\u05e9\u05e8 \u05d0\u05ea \u05e9\u05e0\u05d9 \u05d4\u05e1\u05e2\u05d9\u05e4\u05d9\u05dd \u05db\u05d3\u05d9 \u05dc\u05d4\u05de\u05e9\u05d9\u05da');return;}try{commit(function(p){p.consent={v:CONSENT_VERSION,at:Date.now(),lang:lang()};});flushSave();}catch(e){}OB.step=0;obRender();}
function openLegal(){openSheet('<h2 style="margin:0 0 10px;text-align:center">\u05d4\u05e6\u05d4\u05e8\u05ea \u05d1\u05e8\u05d9\u05d0\u05d5\u05ea \u05d5\u05ea\u05e0\u05d0\u05d9 \u05e9\u05d9\u05de\u05d5\u05e9</h2>'+'<div class="card" style="margin:0 0 10px">'+legalHealthHTML()+'</div>'+'<div class="card" style="margin:0 0 10px">'+legalTermsHTML()+'</div>'+(function(){var c=P().consent;return c?'<div class="sub" style="text-align:center">\u2713 \u05d0\u05d5\u05e9\u05e8 \u05d1\u05ea\u05d0\u05e8\u05d9\u05da '+new Date(c.at).toLocaleDateString()+' \u00b7 \u05d2\u05e8\u05e1\u05d4 '+c.v+'</div>':'';})()+'<button class="btn ghost" data-act="close" style="width:100%;margin-top:10px">\u05e1\u05d2\u05d5\u05e8</button>');}
function obRender(){
  var w=document.getElementById('obwrap');w.style.display='block';
  var d=OB.data,body='';
  if(OB.step===-0.5){
    var okH=!!d.c_health, okT=!!d.c_terms, both=okH&&okT;
    function cRow(k,on,title){return '<div class="toggle" style="cursor:pointer;align-items:center" onclick="obToggleConsent(\''+k+'\')" role="checkbox" tabindex="0" aria-checked="'+(on?'true':'false')+'"><div class="tx"><b>'+title+'</b><span>קראתי, הבנתי ואני מאשר/ת</span></div><div class="sw '+(on?'on':'')+'"><i></i></div></div>';}
    body='<h2 style="font-size:20px;margin:0 0 4px">⚕️ הצהרת בריאות ותנאי שימוש</h2>'+
      '<div class="sub" style="margin:0 0 12px">חובה לקרוא ולאשר לפני תחילת השימוש</div>'+
      '<div class="card" style="margin:0 0 10px;max-height:210px;overflow:auto">'+legalHealthHTML()+'</div>'+
      cRow('health',okH,'⚕️ הצהרת בריאות')+
      '<div class="card" style="margin:12px 0 10px;max-height:210px;overflow:auto">'+legalTermsHTML()+'</div>'+
      cRow('terms',okT,'📜 תנאי שימוש')+
      '<button class="btn grad" style="margin-top:16px;width:100%'+(both?'':';opacity:.45')+'" onclick="obConsentAccept()">'+(both?'✓ אני מאשר/ת ומתחיל/ה':'יש לאשר את שני הסעיפים')+'</button>'+
      '<button class="btn ghost" style="margin-top:8px;width:100%" onclick="OB.step=-1;obRender()">← החלף שפה</button>';
  } else if(OB.step===-1){
    body='<h2 style="font-size:21px;margin:0 0 4px">🌐 Choose your language</h2>'+
      '<div class="sub" style="margin:0 0 16px">בחר שפה · Elige tu idioma</div>'+
      '<div class="pills" style="flex-direction:column;gap:10px;align-items:stretch">'+
      '<button class="pill" style="font-size:16px;padding:14px" onclick="obSetLang(&quot;en&quot;)">🇬🇧 English</button>'+
      '<button class="pill" style="font-size:16px;padding:14px" onclick="obSetLang(&quot;he&quot;)">🇮🇱 עברית</button>'+
      '<button class="pill" style="font-size:16px;padding:14px" onclick="obSetLang(&quot;es&quot;)">🇪🇸 Español</button>'+
      '</div>';
  } else if(OB.step===0){
    body='<h2 style="font-size:21px;margin:0 0 4px">👋 ברוך הבא ל-FitAI</h2>'+
      '<div class="sub" style="margin:0 0 16px">דקה אחת של התאמה אישית ונבנה לך תוכנית מדויקת</div>'+
      '<div class="field"><label>איך לקרוא לך?</label><input class="inp" value="'+esc(d.name)+'" oninput="obSet(&quot;name&quot;,this.value)" placeholder="השם שלך"></div>'+
      '<div class="field" style="margin-top:12px"><label>מגדר</label></div>'+obPills('gender',[['זכר','זכר'],['נקבה','נקבה'],['אחר','אחר']])+
      '<div class="field" style="margin-top:12px"><label>גיל</label><input class="inp" inputmode="numeric" value="'+d.age+'" oninput="obSet(&quot;age&quot;,this.value)"></div>'+
      '<button class="btn grad" style="margin-top:18px" onclick="obStep(1)">המשך →</button>';
  } else if(OB.step===1){
    body='<h2 style="font-size:21px;margin:0 0 12px">📏 קצת נתונים</h2>'+
      '<div class="inrow"><div class="field"><label>גובה (ס״מ)</label><input class="inp" inputmode="numeric" value="'+d.height+'" oninput="obSet(&quot;height&quot;,this.value)"></div>'+
      '<div class="field"><label>משקל (ק״ג)</label><input class="inp" inputmode="decimal" value="'+d.weight+'" oninput="obSet(&quot;weight&quot;,this.value)"></div></div>'+
      '<div class="field" style="margin-top:10px"><label>'+L('משקל יעד (ק״ג)','Target weight (kg)','Peso objetivo (kg)')+' <span class="sub" style="font-size:12px">· '+L('לא חובה','optional','opcional')+'</span></label><input class="inp" inputmode="decimal" value="'+(d.goalWeight||'')+'" placeholder="—" oninput="obSet(&quot;goalWeight&quot;,this.value)"></div>'+
      '<div class="field" style="margin-top:12px"><label>מה המטרה שלך?</label></div>'+obPills('goal',[['fat','חיטוב 🔥'],['muscle','בניית שריר 💪'],['both','שריר + חיטוב ⚡'],['maintain','שמירה 🧘']])+
      '<div class="row" style="margin-top:18px"><button class="btn ghost" onclick="obStep(0)">← חזרה</button><button class="btn grad" onclick="obStep(2)">המשך →</button></div>';
  } else if(OB.step===2){
    var _obSt=(STYLES.indexOf(d.equip)>=0)?d.equip:'calisthenics';
    var _obAsk=kitAsk(_obSt);
    var _obRec=recommendTrack(obProfileShim());
    body='<h2 style="font-size:21px;margin:0 0 12px">'+L('💪 איך תתאמן/י?','💪 How will you train?','💪 ¿Cómo vas a entrenar?')+'</h2>'+
      obPills('equip',STYLES.map(function(k){
        return [k,styleName(k)+(k===_obRec.style?'<span class="reco">'+L('מומלץ','best fit','recomendado')+'</span>':'')];}))+
      '<div class="sub" style="margin:6px 0 0;font-size:12px">'+styleBlurb(_obSt)+'</div>'+
      (_obSt!==_obRec.style
        ?('<div class="sub" style="margin:6px 0 0;font-size:12px;color:var(--teal2)">🎯 '+
          L('לפי מה שענית היינו ממליצים על ','From your answers we would go with ','Por tus respuestas iríamos con ')+
          '<b>'+styleName(_obRec.style)+'</b> — '+_obRec.why[0]+'</div>')
        :'')+
      (_obAsk.length
        ?('<div class="field" style="margin-top:12px"><label>'+L('מה יש לך?','What do you have?','¿Qué tienes?')+'</label></div>'+
          '<div class="sub" style="margin:0 0 6px;font-size:12px">'+(_obSt==='hybrid'
            ?L('את ציוד חדר הכושר אנחנו מניחים — סמן רק מה שיש לך מעבר לזה.','The gym kit is assumed — tick only what you have on top of it.','El equipo del gimnasio se da por hecho — marca solo lo que tengas además.')
            :L('סמן מה שזמין לך — ואפשר גם כלום.','Tick what you can get to — none is a fine answer.','Marca lo que tengas — ninguno también vale.'))+'</div>'+
          equipPills(Array.isArray(d.equipment)?d.equipment:[],'obToggleEquip',_obAsk))
        :('<div class="sub" style="margin:8px 0 0;font-size:12px;color:var(--teal2)">'+
          L('אין מה לסמן — מוט, משקולות, ספסל, מכונות וכבלים מונחים כזמינים.','Nothing to tick — barbell, dumbbells, bench, machines and cables are all assumed.','Nada que marcar — barra, mancuernas, banco, máquinas y poleas se dan por disponibles.')+'</div>'))+
      '<div class="field" style="margin-top:16px"><label>'+L('מבחן כוח קצר — כמה חזרות ברצף?','Quick strength test — how many reps in a row?','Test rápido de fuerza — ¿cuántas repeticiones seguidas?')+'</label></div>'+
      '<div class="field"><label style="font-size:13px">שכיבות סמיכה</label></div>'+obPills('pushups',[['0-5','0-5'],['6-15','6-15'],['16-30','16-30'],['30+','30+']])+
      '<div class="field" style="margin-top:8px"><label style="font-size:13px">מתח (Pull-ups)</label></div>'+obPills('pullups',[['0','0'],['1-4','1-4'],['5-10','5-10'],['10+','10+']])+
      '<div class="field" style="margin-top:8px"><label style="font-size:13px">סקוואט (משקל גוף)</label></div>'+obPills('squats',[['0-20','0-20'],['21-50','21-50'],['51-100','51-100']])+
      '<div class="field" style="margin-top:12px"><label>באילו ימים תתאמן/י?</label></div>'+
      '<div class="daysel">'+DOW.map(function(dn,i){return '<button type="button" class="'+((Array.isArray(d.days)?d.days:[]).indexOf(i)>=0?'act':'')+'" onclick="obToggleDay('+i+')" data-notr>'+dowName(i)+'</button>';}).join('')+'</div>'+
      '<div class="row" style="margin-top:18px"><button class="btn ghost" onclick="obStep(1)">← חזרה</button><button class="btn grad" onclick="obStep(3)">המשך →</button></div>';
  } else if(OB.step===3){
    body='<h2 style="font-size:21px;margin:0 0 12px">🩺 בריאות והעדפות</h2>'+
      '<div class="sub" style="margin:0 0 12px">כדי שנתאים בבטחה לפציעות ולאלרגיות — אפשר לדלג</div>'+
      '<div class="field"><label>סוג תזונה</label></div>'+obPills('diet',[['regular','רגיל'],['vegetarian','צמחוני'],['vegan','טבעוני'],['pescatarian','פסקטריאני']])+
      '<div class="field" style="margin-top:12px"><label>פציעות / מגבלות <span class="sub" style="font-size:12px">· נסנן תרגילים מסוכנים</span></label><input class="inp" value="'+esc(d.injuries||'')+'" oninput="obSet(&quot;injuries&quot;,this.value)" placeholder="לדוגמה: ברך, כתף, גב"></div>'+
      '<div class="field" style="margin-top:10px"><label>אלרגיות <span class="sub" style="font-size:12px">· בחר או הקלד — נסנן מהתפריט</span></label><input class="inp" id="alg_ob" value="'+esc(d.allergies||'')+'" oninput="obSet(&quot;allergies&quot;,this.value)" placeholder="לדוגמה: בוטנים, גלוטן, או כל דבר אחר"></div>'+algChips('alg_ob',d.allergies||'')+
      '<div class="row" style="margin-top:18px"><button class="btn ghost" onclick="obStep(2)">'+L('← חזרה','← Back','← Atrás')+'</button><button class="btn grad" onclick="obStep(4)">'+L('המשך →','Continue →','Continuar →')+'</button></div>';
  } else {
    body=obDateStepHTML()+
      '<div class="row" style="margin-top:18px"><button class="btn ghost" onclick="obStep(3)">'+L('← חזרה','← Back','← Atrás')+'</button>'+
      '<button class="btn grad" onclick="obFinish()">'+L('🎯 בנה לי תוכנית','🎯 Build my plan','🎯 Crear mi plan')+'</button></div>';
  }
  w.innerHTML='<div style="position:fixed;inset:0;z-index:300;background:var(--bg);overflow:auto"><div class="app" style="padding-top:30px;max-width:520px;margin:0 auto">'+
    (OB.redo?('<button class="btn ghost sm" onclick="cancelOb()" style="width:auto;margin:0 0 10px">'+
      L('✕ ביטול','✕ Cancel','✕ Cancelar')+'</button>'):'')+
    '<div style="text-align:center;margin-bottom:14px"><span class="logobox" style="width:46px;height:46px"></span> <b style="font-size:20px">FitAI</b></div>'+
    (OB.step<0?'':'<div style="display:flex;gap:6px;justify-content:center;margin-bottom:18px">'+[0,1,2,3,4].map(function(i){return '<span style="width:'+(i===OB.step?'26px':'9px')+';height:9px;border-radius:5px;background:'+(i<=OB.step?'var(--teal)':'var(--line2)')+';transition:.3s"></span>';}).join('')+'</div>')+
    '<div class="card">'+body+'</div></div></div>';try{translateEl(w);}catch(e){}
}

