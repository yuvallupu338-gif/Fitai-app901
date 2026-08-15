/* src/screens/stretches.js — the stretches screen
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---------- STRETCHES ---------- */
function Stretches(){
  const p=P(),mode=p.stretchMode,groups=STRETCH[mode],fl=injuryFlags(p);
  const areaInjury=a=>{
    if(fl.knee&&/ברכ|ירכ|רגל/.test(a))return 'ברכיים';
    if(fl.shoulder&&/כתפ|גוף עליון/.test(a))return 'כתפיים';
    if(fl.back&&/גב/.test(a))return 'גב';
    if(fl.wrist&&/כתפ|גוף עליון|גוף מלא/.test(a))return 'שורש כף יד';
    if(fl.elbow&&/כתפ|גוף עליון|גוף מלא/.test(a))return 'מרפק';
    return null;
  };
  // Only claim an adaptation that was actually made: a wrist injury used to
  // raise the banner over a list with nothing marked on it.
  const anyMarked=groups.some(g=>areaInjury(g.area));
  return `
  <h1 class="hello" style="font-size:24px">🧘 מתיחות</h1>
  <div class="daystat">${mode==='dynamic'?'מתיחות דינמיות — לפני האימון, להכנת הגוף':'מתיחות סטטיות — אחרי האימון או ביום מנוחה'}</div>
  ${(fl.has&&anyMarked)?`<div class="card" style="border-color:rgba(255,107,61,.4);background:linear-gradient(135deg,rgba(255,107,61,.08),rgba(217,255,61,.03))"><b style="color:var(--orange2)">⚠️ מותאם לפציעות שלך</b><div class="sub" style="margin-top:5px">אזורים רגישים (${esc(p.nutrition.injuries)}) מסומנים — בצע בעדינות או דלג.</div></div>`:''}
  <div class="seg">
    <button class="${mode==='dynamic'?'act':''}" data-smode="dynamic">דינמי 🔥</button>
    <button class="${mode==='static'?'act':''}" data-smode="static">סטטי 🧘</button>
  </div>
  ${groups.map(g=>{const inj=areaInjury(g.area);return `
    <div class="group">
      <div class="gt">${g.area} ${inj?`<span class="catbadge" style="background:rgba(255,107,61,.2);color:var(--orange2)">⚠️ ${inj} — בעדינות</span>`:''}</div>
      ${g.items.map(s=>`
        <div class="stretch" ${inj?'style="opacity:.72"':''}>
          <div class="sh"><b>${esc(s.n)}</b><span class="dur">${esc(s.d)}</span></div>
          ${s.gif?`<div style="margin:8px 0 2px">${exDemo(s.gif,s.n)}</div>`:''}
          <p>${esc(s.t)}${inj?' · בטווח כאב-חופשי בלבד':''}</p>
        </div>`).join('')}
    </div>`;}).join('')}
  <div class="disclaimer">בצע כל מתיחה באיטיות ועצור אם מרגיש כאב חד.</div>
  `;
}

