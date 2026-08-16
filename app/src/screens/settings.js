/* src/screens/settings.js — the settings screen
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---------- SETTINGS ---------- */
function Settings(){
  const p=P(),rp=p.restorePoints;
  return `
  <h1 class="hello" style="font-size:24px">⚙️ הגדרות</h1>

  <div class="sectitle">🌐 שפה · Language · Idioma</div>
  <div class="card"><div class="pills"><button class="pill ${lang()==='en'?'act':''}" data-call="setLang" data-args="[&quot;en&quot;]">🇬🇧 English</button><button class="pill ${lang()==='he'?'act':''}" data-call="setLang" data-args="[&quot;he&quot;]">🇮🇱 עברית</button><button class="pill ${lang()==='es'?'act':''}" data-call="setLang" data-args="[&quot;es&quot;]">🇪🇸 Español</button></div></div>
  <div class="sectitle">אימון</div>
  <div class="card">
    <div class="field"><label>${L('איך אתה מתאמן?','How do you train?','¿Cómo entrenas?')}</label></div>
    <div class="pills">
      ${(()=>{const _r=recommendTrack(p).style;return STYLES.map(k=>`<button class="pill ${trainStyle(p)===k?'act':''}" data-call="setTrainEnv" data-args="${esc(JSON.stringify([k]))}">${styleName(k)}${k===_r?`<span class="reco">${L('מומלץ','best fit','recomendado')}</span>`:''}</button>`).join('');})()}
    </div>
    <div class="sub" style="margin:6px 0 0">${styleBlurb(trainStyle(p))}</div>
    ${recoTrackHTML(p)}
    <button class="btn ghost sm" data-act="redoOb" style="width:100%;margin-top:10px">${L('מלא את השאלון מחדש',
      'Answer the questionnaire again','Responder el cuestionario otra vez')}</button>
    <div class="sub" style="margin:4px 0 0;font-size:12px">${L('אותן שאלות של ההתחלה — האימונים, הרמה, הימים והתזונה. ההיסטוריה, המשקלים והעץ נשמרים.',
      'The same questions you started with — training, level, days and diet. Your history, weights and skill tree are kept.',
      'Las mismas preguntas del principio — entreno, nivel, días y dieta. Tu historial, pesos y árbol se conservan.')}</div>
    ${kitAsk(trainStyle(p)).length?`
    <div class="field" style="margin-top:12px"><label>${L('מה יש לך?',"What do you have?",'¿Qué tienes?')}</label></div>
    <div class="sub" style="margin:0 0 6px">${trainStyle(p)==='hybrid'
      ?L('את ציוד חדר הכושר אנחנו מניחים — סמן רק מה שיש לך מעבר לזה.','The gym kit is assumed — tick only what you have on top of it.','El equipo del gimnasio se da por hecho — marca solo lo que tengas además.')
      :L('סמן מה שזמין לך — התרגילים ייבנו רק ממנו.','Tick what you can get to — the exercises are built from that only.','Marca lo que tengas — los ejercicios se construyen solo con eso.')}</div>
    ${equipPills(studioEquip(p),'toggleEquip',kitAsk(trainStyle(p)))}
    ${(trainStyle(p)!=='calisthenics'||studioEquip(p).length)?'':`<div class="sub" style="margin-top:6px;color:var(--teal2)">${L('בלי ציוד — נבנה אימוני משקל גוף על הרצפה ובמשקוף','No kit — we build floor and doorway bodyweight sessions','Sin equipo — creamos sesiones de suelo y marco de puerta')}</div>`}`
    :`<div class="sub" style="margin:10px 0 0;color:var(--teal2)">${L('בחרת חדר כושר — אין מה לסמן. מוט, משקולות, ספסל, מכונות וכבלים מונחים כזמינים.','You picked a gym — nothing to tick. Barbell, dumbbells, bench, machines and cables are all assumed.','Elegiste gimnasio — nada que marcar. Barra, mancuernas, banco, máquinas y poleas se dan por disponibles.')}</div>`}
    <div class="field" style="margin-top:12px"><label>ימי אימון</label></div>
    <div class="daysel" data-field="days">
      ${DOW.map((d,i)=>`<button class="${p.workout.days.includes(i)?'act':''}" data-v="${i}" data-notr>${dowName(i)}</button>`).join('')}
    </div>
    <div class="toggle" style="margin-top:14px">
      <div class="tx"><b>🔄 חזרתי מהפסקה ארוכה</b><span>${returnWeek(p)?('שבוע '+returnWeek(p)+' מתוך 4 — האימונים מותאמים'):'נתחיל בעדינות ונעלה בהדרגה במשך 4 שבועות'}</span></div>
      <div class="sw ${(p.returnMode&&p.returnMode.on)?'on':''}" data-act="toggleReturn" role="switch" tabindex="0" aria-checked="${(p.returnMode&&p.returnMode.on)?'true':'false'}" aria-label="חזרתי מהפסקה ארוכה"><i></i></div>
    </div>
  </div>

  <div class="sectitle">תצוגה ונגישות</div>
  <div class="card">
    <div class="field"><label>גודל טקסט (1-10)</label>
      <select class="inp" aria-label="גודל טקסט" data-call="setFontLevel" data-on="change" data-args="[&quot;$value&quot;]">${[...Array(10)].map((_,i)=>{const lv=i+1,cur=fontLevel(p);return `<option value="${lv}" ${cur===lv?'selected':''}>${lv}${lv===1?' · הכי קטן':lv===3?' · רגיל':lv===10?' · הכי גדול':''}</option>`;}).join('')}</select></div>
    <div class="sub" style="margin-top:8px">אפשר גם להגדיל באמצעות צביטה במסך (zoom)</div>
    <div class="field" style="margin-top:12px"><label>ערכת נושא</label></div>
    <div class="pills"><button class="pill ${(DB.theme||'dark')==='dark'?'act':''}" data-act="setTheme" data-v="dark">🌙 כהה</button><button class="pill ${DB.theme==='light'?'act':''}" data-act="setTheme" data-v="light">☀️ בהיר</button></div>
  </div>

  <div class="sectitle">📲 התקנה כאפליקציה</div>
  <div class="card">${_pwaInstalled()?'<div class="sub">✓ FitAI מותקן כאפליקציה — נפתח במסך מלא. 🎉</div>':`<div class="sub" style="margin-bottom:8px">התקן את FitAI למסך הבית לחוויית אפליקציה מלאה, פתיחה מהירה ועבודה גם בלי אינטרנט.</div><button class="btn grad" data-act="installApp" style="width:100%">📲 התקן כאפליקציה</button><div class="sub" style="margin:8px 2px 0;font-size:12px">${_deferredPrompt?'לחיצה תפתח את חלון ההתקנה של הדפדפן.':'לחיצה תציג הוראות שלב-אחר-שלב לפי המכשיר שלך.'}</div>`}</div>

  <div class="sectitle">פרטים אישיים</div>
  <div class="card">
    <div class="field"><label>שם</label><input class="inp" data-set="personal.name" value="${esc(p.personal.name)}"></div>
    <div class="inrow">
      <div class="field"><label>גיל</label><input class="inp" inputmode="numeric" data-set="personal.age" value="${esc(p.personal.age)}"></div>
      <div class="field"><label>מגדר</label>
        <select class="inp" data-set="personal.gender">
          ${['זכר','נקבה','אחר'].map(g=>`<option ${p.personal.gender===g?'selected':''}>${g}</option>`).join('')}
        </select></div>
    </div>
    <div class="inrow">
      <div class="field"><label>גובה (ס״מ)</label><input class="inp" inputmode="numeric" data-set="personal.height" value="${esc(p.personal.height)}"></div>
      <div class="field"><label>משקל (ק״ג)</label><input class="inp" inputmode="decimal" data-set="personal.weight" value="${esc(p.personal.weight)}"></div>
    </div>
  </div>

  <div class="sectitle">מטרה וקצב</div>
  <div class="card">
    <div class="pills" data-field="goal">
      ${[['fat','חיטוב 🔥'],['muscle','בניית שריר 💪'],['both','שריר + חיטוב ⚡'],['maintain','שמירה 🧘']].map(([k,v])=>`<button class="pill ${p.goal===k?'act':''}" data-v="${k}">${v}</button>`).join('')}
    </div>
    ${goalDateSettingHTML(p)}
  </div>

  <div class="sectitle">רמת כושר — מבחן כוח</div>
  <div class="card">
    <div class="field"><label>רמת הכושר שלך</label>
      <div class="sub" style="margin:0;font-weight:800;color:var(--teal2)">רמה ${p.fitness.level}/10 · מחושבת אוטומטית ממבחן הכוח 👇</div></div>
    <div class="field"><label>שכיבות סמיכה</label></div>
    <div class="pills" data-field="fitness.pushups">${['0-5','6-15','16-30','30+'].map(v=>`<button class="pill ${p.fitness.pushups===v?'act':''}" data-v="${v}">${v}</button>`).join('')}</div>
    <div class="field" style="margin-top:10px"><label>מתח (Pull-ups)</label></div>
    <div class="pills" data-field="fitness.pullups">${['0','1-4','5-10','10+'].map(v=>`<button class="pill ${p.fitness.pullups===v?'act':''}" data-v="${v}">${v}</button>`).join('')}</div>
    <div class="field" style="margin-top:10px"><label>סקוואט</label></div>
    <div class="pills" data-field="fitness.squats">${['0-20','21-50','51-100'].map(v=>`<button class="pill ${p.fitness.squats===v?'act':''}" data-v="${v}">${v}</button>`).join('')}</div>
    <div class="toggle" style="margin-top:12px">
      <div class="tx"><b>סקוואט פיסטול</b><span>יכולת ביצוע סקוואט על רגל אחת</span></div>
      <div class="sw ${p.fitness.pistol?'on':''}" data-act="togglePistol" role="switch" tabindex="0" aria-checked="${p.fitness.pistol?'true':'false'}" aria-label="פיסטול סקוואט"><i></i></div>
    </div>
  </div>

  <div class="sectitle">תזונה ובריאות</div>
  <div class="card">
    <div class="field"><label>סוג תזונה</label></div>
    <div class="pills" data-field="nutrition.diet">
      ${[['regular','רגיל'],['vegetarian','צמחוני'],['vegan','טבעוני'],['pescatarian','פסקטריאני']].map(([k,v])=>`<button class="pill ${p.nutrition.diet===k?'act':''}" data-v="${k}">${v}</button>`).join('')}
    </div>
    <div class="field" style="margin-top:10px"><label>אלרגיות <span class="sub" style="font-size:12px">· בחר מהרשימה או הקלד חופשי</span></label><input class="inp" id="alg_set" data-set="nutrition.allergies" value="${esc(p.nutrition.allergies)}" placeholder="לדוגמה: בוטנים, גלוטן, או כל דבר אחר">${algChips('alg_set',p.nutrition.allergies)}</div>
    <div class="inrow" style="margin-top:10px"><div class="field"><label>יעד נתרן (מ״ג/יום)</label><input class="inp" inputmode="numeric" data-set="naTarget" value="${esc(p.naTarget||2300)}"></div><div class="field"><label>יעד סוכר (ג׳/יום)</label><input class="inp" inputmode="numeric" data-set="sugTarget" value="${esc(p.sugTarget||50)}"></div></div>
    <div class="field"><label>פציעות / מגבלות <span style="color:var(--muted);font-weight:600;font-size:12px">· משפיע על אימונים ומתיחות</span></label><input class="inp" data-set="nutrition.injuries" value="${esc(p.nutrition.injuries)}" placeholder="לדוגמה: כתף, ברך, גב"></div>
    <div class="field"><label>מאכלים שאני לא אוהב <span style="color:var(--muted);font-weight:600;font-size:12px">· יסוננו מהתפריט</span></label><input class="inp" data-set="nutrition.dislikes" value="${esc(p.nutrition.dislikes||'')}" placeholder="לדוגמה: טונה, עגבניות"></div>
  </div>

  <div class="sectitle">⚕️ מסמכים משפטיים</div>
  <div class="card">
    <div class="sub" style="margin:0 0 8px">הצהרת הבריאות ותנאי השימוש שאישרת</div>
    <button class="btn ghost" data-act="openLegal" style="width:100%">📜 הצג הצהרת בריאות ותנאי שימוש</button>
  </div>

  <div class="sectitle">🛡️ גיבוי אוטומטי</div>
  <div class="card">
    <div class="sub">הנתונים נשמרים אוטומטית בשתי שכבות אחסון במכשיר. נקודות שחזור יומיות (עד 4 אחרונות).</div>
    <div class="grid g2">
      <div class="stat g"><div class="v">${rp.length}</div><div class="l">נקודות שחזור</div></div>
      <div class="stat b"><div class="v" style="font-size:14px">${rp.length?new Date(rp[rp.length-1].d).toLocaleDateString('he-IL'):'—'}</div><div class="l">נקודה אחרונה</div></div>
    </div>
    <button class="btn g" data-act="makeRestore">📌 צור נקודת שחזור עכשיו</button>
    <button class="btn o" data-act="restore" ${rp.length?'':'disabled'}>⏪ שחזר מנקודת השחזור האחרונה</button>
    <button class="btn danger" data-act="fullReset">🗑️ איפוס מלא</button>
    <div class="disclaimer">⚠️ ניקוי נתוני האתר בדפדפן עלול למחוק גם את הגיבוי. מומלץ לייצא פרופיל לקובץ מדי פעם.</div>
  </div>
  <div class="sub" style="text-align:center;opacity:.6;margin:14px 0 4px">FitAI · build ${APP_BUILD}</div>
  <div style="height:20px"></div>
  `;
}

