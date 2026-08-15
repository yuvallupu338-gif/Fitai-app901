/* src/screens/home.js — the home screen
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---------- HOME ---------- */
function Home(){
  const p=P(),t=targets(p),mode=effectiveDayMode(p),dd=dayDist(p);
  const dayTxt=mode==='training'?'יום אימון':mode==='rest'?'יום מנוחה':'יום מחלה';
  const sl=strengthLevel(p);
  const equip=studioEquip(p).length?studioEquip(p).map(equipName)
                                   :[L('משקל גוף בלבד','Bodyweight only','Solo peso corporal')];
  const today=new Date().getDay();
  const _now7=Date.now()-7*86400000;
  const week=[...Array(7)].map((_,i)=>({dow:DOW[i],v:p.history.some(h=>h>_now7&&new Date(h).getDay()===i)?1:0,today:i===today}));
  const anyData=p.history.length>0;
  const lastW=(p.weights&&p.weights.length)?p.weights[p.weights.length-1]:{v:(p.personal&&p.personal.weight)||0};
  const tw=todayWorkout(p);
  return `
  <h1 class="hello">${greet()}, <span data-notr>${esc(p.personal.name)}</span></h1>
  <div class="daystat">${dayTxt} · ${DOW_HE[today]} · ${num(dd.eff.cal)} קלוריות · ${dd.eff.protein} ג׳ חלבון · ${(()=>{const _wt=weighedToday(p);return _wt
    ?`<span data-act="weighDone" class="lnk" data-notr>${_wt.v}</span> ק״ג`
    :`<span data-act="quickWeigh" class="lnk">${L('שקילה','log weight','pésate')}</span>`;})()}</div>
  ${p.goalWeight?(()=>{var ws=p.weights||[];var start=ws.length?ws[0].v:p.personal.weight;var cur=p.personal.weight;var goal=p.goalWeight;var total=start-goal;var done=start-cur;var pct=total!==0?Math.max(0,Math.min(100,Math.round(done/total*100))):(cur===goal?100:0);var rem=(goal<start)?Math.round((cur-goal)*10)/10:Math.round((goal-cur)*10)/10;return `<div class="card" style="margin:0 4px 8px;padding:12px 14px"><div class="gauge"><span>${L('יעד משקל','Goal weight','Peso objetivo')}: ${goal} ק״ג</span><span style="color:var(--teal2);font-weight:800">${pct}%</span></div><div class="waterbar"><i style="width:${pct}%;background:var(--grad)"></i></div><div class="sub" style="margin-top:5px">${cur} ק״ג עכשיו · ${rem>0?('נותרו '+rem+' ק״ג'):rem<0?('עברת ביעד '+Math.abs(rem)+' ק״ג'):'הגעת ליעד! 🎉'}</div></div>`;})():''}
  ${returnWeek(p)?`<div class="card" style="border-color:rgba(255,107,61,.45);background:rgba(255,107,61,.07)">
    <div style="font-weight:800">חזרה מהפסקה — שבוע ${returnWeek(p)} מתוך 4</div>
    <div class="sub" style="margin:4px 0 0">האימונים מותאמים: פחות סטים, משקלים קלים יותר ומנוחה ארוכה יותר. נעלה בהדרגה.</div>
  </div>`:''}
  ${mode!=='training'?`<div class="card" style="border-color:rgba(217,255,61,.4);background:linear-gradient(135deg,rgba(217,255,61,.12),rgba(217,255,61,.05))">
    <h2>${mode==='rest'?'יום מנוחה':'יום מחלה'}</h2>
    <div class="sub">היום מוקדש להתאוששות — הגוף נבנה דווקא במנוחה. עשה מתיחות קלות ותן לשרירים להתחזק.</div>
    <button class="btn p" data-goto="stretches" style="margin-top:8px;width:100%">למתיחות התאוששות</button>
  </div>`:''}


  ${p.workouts>0?'':`<div class="card">
    <h2>${L('שלושה צעדים להתחלה','Three steps to start','Tres pasos para empezar')}</h2>
    <ol class="steps">
      <li>פתח את <b>עץ הכישורים</b> ובחר תרגיל לתרגול ממוקד</li>
      <li>התחל <b>אימון מותאם</b> לפי הציוד והרמה שלך</li>
      <li>עקוב אחר <b>משקל ותזונה</b> כדי לראות התקדמות לאורך זמן</li>
    </ol>
    <button class="btn grad" data-goto="skills" style="width:100%">${L('לעץ הכישורים','To the skill tree','Al árbol de habilidades')}</button>
  </div>`}

  ${(()=>{const pr=woPrefs(p);const sess=todaySession(p);if(!sess)return '';
  const list=buildSession(p,sess),mus=sessionMuscles(list),sets=sessionSets(list);var _woCard=`
  <div class="card glow">
    <h2>${L('האימון של היום',"Today's session",'Sesión de hoy')} — ${sessName(sess)}</h2>
    ${musBreakdownHTML(mus,sessionSecondary(list))}
    ${soreWarnHTML(p,list)}
    <div class="sub" style="margin:2px 0 0">${L('רמה','Level','Nivel')} ${p.fitness.level} · ${list.length} ${L('תרגילים','exercises','ejercicios')} · ${sets} ${L('סטים','sets','series')} · ${kitSummary(p)}${injuryFlags(p).has?' · '+L('מסונן לפי פציעות','filtered for your injuries','filtrado por tus lesiones'):''}</div>
    <div class="pills" style="margin-top:10px">
      ${[30,45,60,90].map(d=>`<button class="pill ${pr.duration===d?'act':''}" data-act="woDur" data-v="${d}">${d} ${L('דק׳','min','min')}</button>`).join('')}
    </div>
    <div style="margin:10px 0 4px">${list.map(e=>`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 0;border-top:1px solid var(--line)">
      ${musBadge(e.mus)}<span style="flex:1;min-width:0;overflow-wrap:anywhere;font-size:13px" data-notr>${esc(e.name)}</span>
      <span class="sub" style="margin:0;font-size:12px">${e.sets}×</span>
      <button class="btn sm" data-act="exVideo" data-b="${esc(e.base)}" style="flex:none;padding:8px 9px">${L('סרטון','Video','Vídeo')}</button></div>`).join('')}</div>
    <button class="btn grad" data-act="startWorkout">${L('התחל אימון מודרך','Start guided workout','Empezar entreno guiado')} · ${pr.duration} ${L('דק׳','min','min')}</button>
  </div>`;return mode==='training'?_woCard:'';})()}
  ${weekPlanHTML(p)}
  ${goalCountdownHTML(p)}
  ${recoveryHTML(p)}

  <div class="card tip">
    <h2>${L('טיפ היום','Tip of the day','Consejo del día')} — ${goalLabel(p.goal).replace(/ [🔥💪⚡🧘]+$/,'')}</h2>
    <div style="font-size:14px;color:var(--txt)">${tipFor(p)}</div>
  </div>

  <div class="card">
    <h2>${L('ההתקדמות שלי','My progress','Mi progreso')}</h2>
    ${(()=>{const _x=xpLevel(p.xp);return `<div class="sub" style="margin:0 0 7px">רמה ${_x.level} · ${rankFor(_x.level)} · רצף ${streakDays(p)} ימים${p.bestStreak>streakDays(p)?` · שיא ${p.bestStreak}`:''} · ${_x.into}/${_x.need} XP</div><div class="pbar" style="margin:0 0 12px"><i style="width:${_x.pct}%"></i></div>`;})()}
    <div class="grid">
      <div class="stat"><div class="v">${p.workouts}</div><div class="l">אימונים</div></div>
      <div class="stat"><div class="v">${sl}</div><div class="l">רמת כוח</div></div>
      <div class="stat"><div class="v">${num(p.xp)}</div><div class="l">נקודות XP</div></div>
    </div>
    <div class="row" style="margin-top:12px">
      <button class="btn b" data-act="trends" style="flex:1">${L('גרפים והישגים','Charts and badges','Gráficos y logros')}</button>
      <button class="btn ghost" data-act="shareCard" style="flex:1">${L('שתף','Share','Compartir')}</button>
    </div>
  </div>

  <details style="margin:8px 0"><summary style="cursor:pointer;font-weight:800;padding:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;color:var(--teal2)">${L('מדידות גוף ומשקל','Body measurements and weight','Medidas corporales y peso')}</summary>
  <div class="card" style="margin-top:8px">
    <h2>${L('מדידות גוף','Body measurements','Medidas corporales')}</h2>
    <div class="inrow">
      <div class="field"><label>מותן (ס״מ)</label><input class="inp" id="m_waist" inputmode="decimal"></div>
      <div class="field"><label>חזה</label><input class="inp" id="m_chest" inputmode="decimal"></div>
      <div class="field"><label>ירכיים</label><input class="inp" id="m_hips" inputmode="decimal"></div>
    </div>
    <div class="inrow">
      <div class="field"><label>זרוע</label><input class="inp" id="m_arm" inputmode="decimal"></div>
      <div class="field"><label>ירך</label><input class="inp" id="m_thigh" inputmode="decimal"></div>
    </div>
    <button class="btn p" data-act="saveMeas">שמור מדידה</button>
    ${(p.measurements||[]).length?`<div class="sub" style="margin-top:8px">נשמרו ${p.measurements.length} מדידות · אחרונה: ${new Date(p.measurements[p.measurements.length-1].d).toLocaleDateString('he-IL')}</div>`:''}
  </div>

  <div class="card">
    <h2>${L('מעקב משקל','Weight tracking','Seguimiento de peso')}</h2>
    <div style="display:flex;align-items:center;gap:14px">
      <div style="font-size:34px;font-weight:900">${lastW.v} <span style="font-size:16px;color:var(--muted)">ק״ג</span></div>
      <div style="flex:1"><input class="inp" id="w_val" inputmode="decimal" placeholder="משקל חדש (ק״ג)"></div>
    </div>
    <button class="btn b" data-act="saveWeight">${L('שמור משקל','Save weight','Guardar peso')}</button>
    ${p.weights.length>=2?weightChart(p):`<div class="empty">הוסף מדידה נוספת כדי לבנות גרף משקל 📈</div>`}
  </div>
  </details>

  <div class="disclaimer">${L('הנתונים נשמרים על המכשיר שלך בלבד.','Your data is stored only on your device.','Tus datos se guardan solo en tu dispositivo.')}<br>המידע באפליקציה לעיון בלבד ואינו מהווה ייעוץ רפואי.</div>
  `;
}
function dietHe(d){return{regular:'רגיל',vegetarian:'צמחוני',vegan:'טבעוני',pescatarian:'פסקטריאני'}[d];}
function weightChart(p){
  const ws=p.weights.slice(-30),vals=ws.map(w=>w.v),min=Math.min(...vals),max=Math.max(...vals),rng=(max-min)||1;
  return `<div class="bars" style="height:90px;margin-top:12px">${ws.map(w=>{
    const h=18+((w.v-min)/rng)*80;
    return `<div class="bar"><div class="col" style="height:${h}%;background:linear-gradient(180deg,var(--blue2),var(--blue))"></div><div class="lbl">${w.v}</div></div>`;
  }).join('')}</div>`;
}
function dayKey(ts){var d=new Date(ts);return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate();}
function markActive(pp){try{pp.activeDays=pp.activeDays||{};pp.activeDays[dayKey(Date.now())]=1;var ks=Object.keys(pp.activeDays);if(ks.length>500){ks.sort();ks.slice(0,ks.length-500).forEach(function(k){delete pp.activeDays[k];});}}catch(e){}}
/* ===== food logging: searchable common-foods DB + per-item diary ===== */
