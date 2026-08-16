/* src/profiles.js — the profile button and the profile menu
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* =====================================================================
   PROFILE SELECTOR
   ===================================================================== */
function renderProfileBtn(){
  const p=P();
  $('profName').textContent=p.name;
  $('profAv').textContent=(p.name||'?').trim().charAt(0);
}
function renderProfileMenu(){
  const ids=Object.keys(DB.profiles);
  $('profMenu').innerHTML=`
    <div class="ph">פרופילים — נשמרים במכשיר שלך בלבד</div>
    ${ids.map(id=>{
      const pr=DB.profiles[id];
      return `<div class="profrow ${id===DB.active?'act':''}" data-pid="${id}">
        <span class="av">${esc((pr.name||'?').charAt(0))}</span>
        <span class="nm">${esc(pr.name)}</span>
        ${id===DB.active?'<span style="color:var(--green2)">✓</span>':''}
      </div>`;
    }).join('')}
    <div class="profrow" data-act="coach"><span class="av">💪</span><span class="nm">מאמן אישי</span></div>
        <div class="profact">
      <button data-act="addProf">➕ הוסף פרופיל</button>
      <button data-act="dupProf">📋 שכפל</button>
      <button data-act="exportProf">💾 ייצוא (גיבוי)</button>
      <button data-act="importProf">📁 ייבוא מקובץ</button>
      <button data-act="renameProf">✏️ שנה שם</button>
      <button data-act="delProf">🗑️ מחק</button>
    </div>`;
  bindActs($('profMenu'));
  $('profMenu').querySelectorAll('[data-pid]').forEach(r=>r.onclick=()=>{
    DB.active=r.dataset.pid;save();$('profMenu').classList.remove('open');if(P()&&!P().onboarded){startOnboarding();}else{render();toast('הוחלף פרופיל');}
  });
}
$('profBtn').addEventListener('click',()=>{
  const m=$('profMenu');
  if(m.classList.contains('open')){m.classList.remove('open');return;}
  renderProfileMenu();m.classList.add('open');
});
document.addEventListener('click',e=>{
  const m=$('profMenu');
  if(m.classList.contains('open')&&!m.contains(e.target)&&!$('profBtn').contains(e.target))m.classList.remove('open');
});

