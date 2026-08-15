/* src/backup.js — restore points, profile export and import
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---------- restore points ---------- */
function makeRestore(){
  const p=P();if(!p)return;
  if(!Array.isArray(p.restorePoints))p.restorePoints=[];
  const snap=JSON.parse(JSON.stringify(p));delete snap.restorePoints;
  p.restorePoints.push({d:Date.now(),data:JSON.stringify(snap)});
  if(p.restorePoints.length>4)p.restorePoints=p.restorePoints.slice(-4);
  save();
}
(function autoRestore(){
  try{
    const p=P();if(!p)return;
    const last=(p.restorePoints||[])[(p.restorePoints||[]).length-1];
    if(!last||Date.now()-last.d>86400000)makeRestore();
  }catch(e){console.error('autoRestore',e);}
})();

/* ---------- export / import ---------- */
function exportProfile(){
  const p=P();
  const blob=new Blob([JSON.stringify(p,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='fitai_'+p.name+'.json';a.click();
  URL.revokeObjectURL(url);toast('הפרופיל יוצא לקובץ 💾');
}
function importProfile(){
  const inp=document.createElement('input');inp.type='file';inp.accept='application/json,.json';
  inp.onchange=()=>{
    const f=inp.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const data=JSON.parse(r.result);
        if(!data||typeof data!=='object'||!data.personal||!data.workout)throw new Error('bad');
        const tpl=newProfile(data.name||'מיובא');
        const healed=Object.assign({},tpl,data);
        healed.personal=Object.assign({},tpl.personal,data.personal||{});
        healed.workout=Object.assign({},tpl.workout,data.workout||{});
        healed.fitness=Object.assign({},tpl.fitness,data.fitness||{});
        healed.nutrition=Object.assign({},tpl.nutrition,data.nutrition||{});
        if(!Array.isArray(healed.workout.days)||!healed.workout.days.length)healed.workout.days=tpl.workout.days;
        if(!Array.isArray(healed.weights)||!healed.weights.length)healed.weights=tpl.weights;
        if(!Array.isArray(healed.history))healed.history=[];
        healed.id='p_'+Math.random().toString(36).slice(2,9);
        healed.restorePoints=[];
        ['history','weights','measurements'].forEach(function(k){if(Array.isArray(healed[k])&&healed[k].length>365)healed[k]=healed[k].slice(-365);});
        if(Array.isArray(healed.foodLog)&&healed.foodLog.length>200)healed.foodLog=healed.foodLog.slice(-200);
        const prevActive=DB.active;
        DB.profiles[healed.id]=healed;DB.active=healed.id;
        var _ok=true;
        try{if(_saveT){clearTimeout(_saveT);_saveT=null;}var _s=JSON.stringify(DB);localStorage.setItem(KEY,_s);localStorage.setItem(KEY+'_bk',_s);}catch(_err){_ok=false;}
        if(_ok){render();renderProfileMenu();toast('פרופיל יובא 📁');}
        else{delete DB.profiles[healed.id];DB.active=prevActive;try{save();}catch(_e){}render();toast('האחסון מלא — הייבוא בוטל');}
      }catch(e){toast('קובץ פרופיל לא תקין');}
    };
    r.readAsText(f);
  };
  inp.click();
}

