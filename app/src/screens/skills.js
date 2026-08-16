/* src/screens/skills.js — the skill-tree screen
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---------- SKILLS ---------- */
function skillFilter(q){q=(q||'').trim().toLowerCase();document.querySelectorAll('#screen .lvl').forEach(function(lv){var any=false;lv.querySelectorAll('.ex').forEach(function(ex){var bb=ex.querySelector('.nm b');var nm=(bb&&bb.textContent||'').toLowerCase();var show=!q||nm.indexOf(q)>=0;ex.style.display=show?'':'none';if(show&&q)any=true;});var exs=lv.querySelector('.exs');if(q){if(exs)exs.style.display=any?'block':'none';lv.style.display=any?'':'none';}else{if(exs)exs.style.display='';lv.style.display='';}});}
function Skills(){
  const fl=injuryFlags(P());
  let html=`
  <h1 class="hello" style="font-size:24px">🌳 עץ הכישורים</h1>
  <div class="daystat">${L('10 רמות · 9 תרגילים בכל רמה','10 levels · 9 exercises each','10 niveles · 9 ejercicios cada uno')} · ${
    trainStyle(P())==='gym'?L('תרגילי חדר כושר','gym movements','ejercicios de gimnasio')
    :trainStyle(P())==='hybrid'?L('משקל גוף וחדר כושר','bodyweight and gym','peso corporal y gimnasio')
    :L('משקל גוף','bodyweight','peso corporal')} · ${L('חזה · גב · רגליים · ליבה','chest · back · legs · core','pecho · espalda · piernas · core')}</div>
  <div class="field" style="margin:2px 0 10px"><input class="inp" id="skq" placeholder="🔎 חפש תרגיל..." aria-label="חיפוש תרגיל" data-call="skillFilter" data-on="input" data-args="[&quot;$value&quot;]"></div>`;
  if(P().woPicks&&P().woPicks.length){var _pw=pickedWorkout(P());var _pm=_pw.length?estMinutes(_pw):0;var _rest=effectiveDayMode(P())!=='training';html+=`<div class="card" style="border-color:rgba(217,255,61,.55);background:linear-gradient(135deg,rgba(217,255,61,.08),transparent)"><b>🏋️ אימון מותאם אישית</b><div class="sub" style="margin:4px 0 8px">${P().woPicks.length} תרגילים שבחרת${_rest?'':' · אימון מודרך קצר (~'+_pm+' דק׳)'}</div>${_rest?`<div class="sub" style="margin:0 0 8px">🧘 היום יום מנוחה — האימון ימתין ליום האימון הבא. <span data-goto="stretches" style="color:var(--teal2);cursor:pointer;text-decoration:underline">למתיחות התאוששות</span></div><div class="row"><button class="btn ghost" data-act="clearPicks" style="flex:1">נקה בחירה</button></div>`:`<div class="row"><button class="btn grad" data-act="startPicked" style="flex:1">▶ התחל אימון מותאם</button><button class="btn ghost" data-act="clearPicks" style="flex:none">נקה</button></div>`}</div>`;}
  html+=`
  <div class="card">
    <div class="sub">סנכרן את העץ למבחן הכוח שלך — תרגילים שכבר נשלטו יסומנו אוטומטית, מבלי לאבד הישגים קיימים.</div>
    <button class="btn grad" data-act="syncTree">${L('סנכרן את העץ לרמת הכוח שלי','Sync the tree to my strength','Sincronizar el árbol con mi fuerza')}</button>
  </div>`;
  if(P().goal==='fat'){html+=`<div class="card" style="border-color:rgba(255,107,61,.4)"><div class="sub" style="margin:0"><b style="color:var(--orange2)">🔥 גם בהרזיה זה חשוב:</b> שליטה בתרגילים בונה שריר, והשריר שורף יותר קלוריות גם במנוחה — כך תשמור על מסת גוף רזה תוך כדי הגירעון.</div></div>`;}
  for(let l=1;l<=10;l++){
    const exs=levelExercises(l), unlocked=levelUnlocked(l);
    const done=exs.filter(e=>P().skills[e.id]==='done').length;
    const open=openLevel===l;
    html+=`
    <div class="lvl ${unlocked?'':'locked'} ${open?'open':''}">
      <div class="lvlh" data-lvl="${l}" role="button" tabindex="0" aria-expanded="${open?'true':'false'}" aria-label="רמה ${l}">
        <div class="num">${unlocked?l:'🔒'}</div>
        <div class="t">
          <b>רמה ${l}</b> <span class="prog">— ${done}/9</span>
          <div class="pbar"><i style="width:${done/9*100}%"></i></div>
        </div>
        <div style="font-size:18px">${open?'▴':'▾'}</div>
      </div>
      <div class="exs">
        ${exs.map(e=>{
          const st=P().skills[e.id], locked=!unlocked;
          const cls=st==='done'?'done':(locked?'locked':'');
          const icon=st==='done'?'✓':(locked?'🔒':'▶');
          return `<div class="ex ${cls}" ${!locked?`data-ex="${e.id}" data-lvl="${l}"`:''}>
            <div class="ic">${icon}</div>
            <div class="nm">
              <b>${esc(exName(P(),e))} ${e.peak?'<span style="color:var(--orange2)">!</span>':''}</b>
              <span><span class="catbadge ${e.catCls}">${e.catHe}</span>${e.meas}${exerciseConflict(e,fl)?` <span class="catbadge" style="background:rgba(255,77,141,.2);color:#FF8FB6">⚠️ ${exerciseConflict(e,fl)}</span>`:''}</span>
            </div>
            <div class="st">${icon}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }
  html+=`<div class="disclaimer">השלם לפחות 5 תרגילים ברמה כדי לפתוח את הרמה הבאה.</div>`;
  return html;
}
function exercisePopover(exId,lvl){
  const e=levelExercises(lvl).find(x=>x.id===exId);if(!e)return;
  const p=P(),nm=exName(p,e),conf=exerciseConflict(e,injuryFlags(p));
  const base=ladderBase(p,e,(p.exSwaps||{})[exId]||0);
  const yt='https://www.youtube.com/results?search_query='+encodeURIComponent(nm+' technique');
  const done=p.skills[exId]==='done';
  const picked=(p.woPicks||[]).some(function(x){return x.id===exId;});
  openSheet(`
    <div class="chip p" style="margin-bottom:8px">${e.catHe} · רמה ${lvl}</div>
    <h3>${esc(nm)}</h3>
    ${conf?`<div class="chip o" style="margin:0 0 10px">⚠️ זהירות — רגיש ל${conf} שציינת. שקול להחליף תרגיל.</div>`:''}
    <div class="desc">מה תרצה לעשות עם התרגיל הזה?</div>
    <div class="popact">
      <button class="btn grad" data-act="trainEx" data-ex="${exId}" data-lvl="${lvl}">${picked?'✓ במסלול האימון — הסר':'🏋️ שלב באימון המודרך'}</button>
      <button class="btn g" data-act="masterEx" data-ex="${exId}" data-lvl="${lvl}">${done?'✗ בטל סימון שליטה':'✓ אני כבר שולט בזה — סמן כהושלם'}</button>
      <button class="btn b" data-act="swapEx" data-ex="${exId}" data-lvl="${lvl}">⇄ ${conf?'החלף לתרגיל בטוח':'החלף תרגיל (אין בחדר הכושר)'}</button>
      ${isBW(base)?'':`<div class="field" style="margin:4px 0"><label>💾 משקל עבודה (ק״ג) <span class="sub" style="font-size:12px">· נשמר לתרגיל</span></label><input class="inp" inputmode="decimal" value="${(p.exWeights&&p.exWeights[base])||''}" placeholder="—" data-call="woSaveWeightAndSay" data-on="change" data-args="${esc(JSON.stringify([base,'$value']))}"></div>`}
      <a class="linkbtn" href="${yt}" target="_blank" rel="noopener">▶ טכניקה ביוטיוב</a>
      <button class="btn ghost" data-act="close">סגור</button>
    </div>`);
}

