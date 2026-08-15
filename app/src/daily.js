/* src/daily.js — the wellness survey, the "my day" sheet and the help sheet
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* =====================================================================
   DAILY VIEW (🎯) & HELP (?)
   ===================================================================== */
function wellField(k,label,lo,hi,cur){return '<div style="margin:8px 0"><div class="sub" style="margin:0 0 4px;font-weight:700">'+label+'</div><div class="pills">'+[1,2,3,4,5].map(function(n){return '<button class="pill'+(cur===n?' act':'')+'" data-act="wellSet" data-k="'+k+'" data-v="'+n+'" style="min-width:42px">'+n+'</button>';}).join('')+'</div><div class="sub" style="display:flex;justify-content:space-between;font-size:11px;margin-top:2px"><span>'+lo+'</span><span>'+hi+'</span></div></div>';}
function wellnessSurvey(p){var w=(p.wellness&&p.wellness.day===dayKey(Date.now()))?p.wellness:{};return '<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:8px"><div class="sub" style="font-weight:800;margin:0 0 4px">📝 צ׳ק-אין יומי — איך אתה מרגיש?</div>'+wellField('sleep','😴 שינה','גרועה','מצוינת',+w.sleep||0)+wellField('sore','💪 שרירים','כואב מאוד','רענן',+w.sore||0)+wellField('energy','⚡ אנרגיה','מותש','מלא כוח',+w.energy||0)+'</div>';}
function dailyView(){
  const p=P(),dd=dayDist(p),t=dd.eff,mode=effectiveDayMode(p),today=new Date().getDay();
  const nextTrain=(()=>{for(let i=0;i<7;i++){const d=(today+i)%7;if(p.workout.days.includes(d))return{d,days:i};}return null;})();
  const eaten=p.todayEaten||{cal:0,p:0,c:0,f:0};
  const rd=readiness(p);
  const gauge=(lbl,cur,tgt,unit)=>{
    const pct=Math.min(100,tgt?cur/tgt*100:0),near=pct>=70;
    return `<div class="gaugewrap">
      <div class="gauge"><span>${lbl}</span><span>${Math.round(cur)} / ${tgt}${unit}</span></div>
      <div class="waterbar"><i style="width:${pct}%;background:${near?'linear-gradient(90deg,#D9FF3D,#C4F03A)':'linear-gradient(90deg,#FF6B3D,#E0521F)'}"></i></div>
    </div>`;
  };
  openModal(`
    <h3>🎯 היום שלי</h3>
    <div class="desc">${mode==='training'?'יום אימון':mode==='rest'?'יום מנוחה':'יום מחלה'} · ${DOW_HE[today]}
      ${nextTrain?` · האימון הבא: ${nextTrain.days===0?'היום':DOW_HE[nextTrain.d]}`:''}</div>
    <div class="weekrow">
      ${DOW.map((d,i)=>`<div class="weekd ${p.workout.days.includes(i)?'train':''} ${i===today?'today':''}" data-notr>${dowShort(i)}</div>`).join('')}
    </div>
    <div class="card" style="margin:12px 0">
      <h2 style="font-size:15px">🔥 יעד קלורי יומי</h2>
      <div class="chip p" style="margin:4px 0 8px">${goalLabel(p.goal)}</div>
      <div class="grid g4">
        <div class="stat o"><div class="v" style="font-size:18px">${num(t.cal)}</div><div class="l">קל׳</div></div>
        <div class="stat p"><div class="v" style="font-size:18px">${t.protein}</div><div class="l">חלבון</div></div>
        <div class="stat b"><div class="v" style="font-size:18px">${t.carbs}</div><div class="l">פחמ׳</div></div>
        <div class="stat g"><div class="v" style="font-size:18px">${t.fat}</div><div class="l">שומן</div></div>
      </div>
    </div>
    <div class="card" style="margin:12px 0">
      <h2 style="font-size:15px">📊 היום / היעד</h2>
      ${gauge('קלוריות',eaten.cal,t.cal,' קל׳')}
      ${gauge('חלבון',eaten.p,t.protein,'ג׳')}
      ${gauge('פחמימות',eaten.c,t.carbs,'ג׳')}
      ${gauge('שומן',eaten.f,t.fat,'ג׳')}
    </div>
    <div class="card" style="margin:12px 0">
      <h2 style="font-size:15px">⚡ מוכנות והתאוששות</h2>
      ${rd!==null?`
        <div style="font-size:36px;font-weight:900;color:${rd>75?'var(--emerald)':rd>55?'var(--orange2)':'#FF8FB6'}">${rd}%</div>
        <div class="sub">${mode!=='training'?(rd>75?'התאוששות מצוינת — נצל אותה לשינה וחלבון 🧘':rd>55?'התאוששות טובה — המשך לנוח':'הגוף עדיין מתאושש — מנוחה מלאה 🛌'):(rd>75?'מוכן לאימון מלא 💪':rd>55?'מוכנות בינונית — שקול נפח מתון':'מומלץ יום קל או מנוחה 🧘')}</div>`
      :`<div class="sub" style="margin:2px 0">מלא את הצ׳ק-אין למטה כדי לקבל ציון מוכנות מיידי — או השלם 3 אימונים למד אוטומטי.</div>`}
      ${wellnessSurvey(p)}
    </div>
    <button class="btn ghost" data-act="closeModal">סגור</button>
    <div class="disclaimer">המספרים לעיון בלבד ואינם מהווים ייעוץ רפואי.</div>
  `);
}
function helpView(){
  openSheet(`
    <h3>❓ עזרה מהירה</h3>
    <div class="desc">איך FitAI עובד</div>
    <div class="card" style="margin:0 0 10px"><b>🌳 עץ הכישורים</b><div class="sub" style="margin:4px 0 0">10 רמות של תרגילים. תרגל, סמן כהושלם, ופתח רמות מתקדמות.</div></div>
    <div class="card" style="margin:0 0 10px"><b>🥩 תזונה</b><div class="sub" style="margin:4px 0 0">תפריט מתעדכן לפי היעד, סוג התזונה והאלרגיות. החלף ארוחות בלחיצה.</div></div>
    <div class="card" style="margin:0 0 10px"><b>🎯 היום שלי</b><div class="sub" style="margin:4px 0 0">תמונת מצב יומית של אימון, תזונה ומוכנות.</div></div>
    <div class="card" style="margin:0 0 10px"><b>🛡️ גיבוי</b><div class="sub" style="margin:4px 0 0">הכל נשמר במכשיר עם נקודות שחזור. ייצא פרופיל לקובץ לגיבוי חיצוני.</div></div>
    <button class="btn ghost" data-act="close">סגור</button>
  `);
}
$('goalFab').addEventListener('click',dailyView);
$('helpFab').addEventListener('click',helpView);

