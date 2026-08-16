/* src/actions.js — handleAct — every data-act the interface can fire
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---------- action handler ---------- */
function handleAct(act,node){
  const p=P();
  switch(act){
    case 'close':closeSheet();break;
    case 'closeModal':closeModal();break;

    case 'redoOb':redoOb();break;
    case 'applyTrack':applyTrack();break;
    case 'setGoalDate':setGoalDate(node.value?Date.parse(node.value):0);break;
    case 'goalDatePreset':{var _d=+node.dataset.v;setGoalDate(_d?Date.now()+_d*86400000:0);break;}

    case 'syncTree':{
      const lvl=p.fitness.level;let added=0;
      for(let l=1;l<=lvl-1;l++){if(typeof levelUnlocked==='function'&&!levelUnlocked(l,p))break;levelExercises(l).forEach(e=>{if(p.skills[e.id]!=='done'){p.skills[e.id]='done';added++;}});}
      const strong=(p.fitness.pushups==='30+'||p.fitness.pullups==='10+');
      levelExercises(lvl).slice(0,strong?6:3).forEach(e=>{if(p.skills[e.id]!=='done'){p.skills[e.id]='done';added++;}});
      save();render();toast(`סונכרן! ${added} תרגילים סומנו כנשלטים 💪`);break;}
    case 'trainEx':{
      var _pid=node.dataset.ex,_plv=+node.dataset.lvl;var _wasPicked=false;
      commit(pp=>{pp.woPicks=pp.woPicks||[];var _ix=pp.woPicks.findIndex(function(x){return x.id===_pid;});if(_ix>=0){pp.woPicks.splice(_ix,1);_wasPicked=true;}else{pp.woPicks.push({id:_pid,lvl:_plv});}});
      closeSheet();render();var _n=(P().woPicks||[]).length;toast(_wasPicked?'הוסר מהאימון המותאם':('נבחרו '+_n+' תרגילים — התחל אימון מותאם מלמעלה 🏋️'));break;}
    case 'startPicked':{var _pl=pickedWorkout(P());if(!_pl.length){toast('בחר תרגילים מהעץ קודם');break;}gotoTab('skills');openWorkout(_pl);break;}
    case 'clearPicks':{commit(pp=>{pp.woPicks=[];});render();toast('הרשימה נוקתה');break;}
    case 'masterEx':{
      const id=node.dataset.ex;let mastered=false,gave=false;
      commit(pp=>{if(pp.skills[id]==='done'){delete pp.skills[id];}else{pp.skills[id]='done';pp.xpAwarded=pp.xpAwarded||{};if(!pp.xpAwarded[id]){pp.xp+=25;pp.xpAwarded[id]=1;gave=true;}mastered=true;}});
      closeSheet();render();
      if(gave){xpBurst('+25 XP');toast('כל הכבוד! נשלט ✓ +25 XP');}
      else if(mastered)toast(L('סומן כנשלט ✓ — ה-XP על התרגיל הזה כבר ניתן',
        'Marked as mastered ✓ — the XP for this one was already given',
        'Marcado como dominado ✓ — el XP de este ya se dio'));
      else toast('הסימון בוטל');break;}
    case 'swapEx':{const id=node.dataset.ex;commit(pp=>{pp.exSwaps=pp.exSwaps||{};pp.exSwaps[id]=(pp.exSwaps[id]||0)+1;});closeSheet();render();toast('הוחלף בתרגיל חלופי ⇄');break;}
    case 'startWorkout':{openWorkout();break;}
    case 'startDay':{openWorkout(null,+node.dataset.d);break;}
    case 'refreshPlan':{commit(function(pp){pp.planShuffle=(pp.planShuffle||0)+1;pp.exPick={};});render();toast(L('האימונים הוחלפו 🔄','Workouts swapped 🔄','Entrenos cambiados 🔄'));break;}
    case 'trends':{trendsModal();break;}
    case 'woSet':{const i=+node.dataset.i,ex=WO.list[i];if(ex.done<ex.sets){ex.done++;if(ex.done<ex.sets){WO.restIdx=i;WO.restLeft=ex.restSec;woNow();woAnnounce('מנוחה '+ex.restSec+' שניות');}else{WO.restIdx=-1;WO.restLeft=0;woRecord(i,ex);woAnnounce('סיימת את התרגיל');}}renderWorkout();break;}
    case 'woUndo':{const i=+node.dataset.i,ex=WO.list[i];if(ex.done>0)ex.done--;WO.restIdx=-1;WO.restLeft=0;renderWorkout();break;}
    case 'woSkipRest':{WO.restIdx=-1;WO.restLeft=0;renderWorkout();break;}
    case 'woSwap':{openSwapSheet(+node.dataset.i);break;}
    case 'swapPick':{applySwap(+node.dataset.i,node.dataset.b);break;}
    case 'exVideo':{openExVideo(node.dataset.b);break;}
    case 'woUndoSwap':{woUndoSwap(+node.dataset.i);break;}
    case 'woPause':{if(WO){WO.paused=!WO.paused;woNow();renderWorkout();}break;}
    case 'woExtend':{if(WO){woNow();WO.moveLeft=(WO.moveLeft||0)+20;var _ml=document.getElementById('woMoveLeft');if(_ml)_ml.textContent=Math.max(0,WO.moveLeft);}break;}
    case 'woNextMove':{if(WO){var _mv=(WO.phase==='warmup'?WO.warmup:WO.cooldown);WO.wIdx=(WO.wIdx+1)%_mv.length;WO.moveLeft=(WO.phase==='warmup'?35:40);woNow();renderWorkout();}break;}
    case 'woClose':{closeModal();break;}
    case 'woNext':{WO.phase='building';WO.phaseLeft=30;renderWorkout();break;}
    case 'woSkipToMain':{WO.phase='main';renderWorkout();break;}
    case 'woToCooldown':{WO.phase='cooldown';WO.phaseLeft=WO.cooldownSec;WO.wIdx=0;WO.moveLeft=40;WO.paused=false;woNow();renderWorkout();break;}
    case 'woFinish':case 'finishWorkout':{finishSession();break;}

    case 'saveMeas':{
      const m={d:Date.now(),waist:val('m_waist'),chest:val('m_chest'),hips:val('m_hips'),arm:val('m_arm'),thigh:val('m_thigh')};
      if(!m.waist&&!m.chest&&!m.hips&&!m.arm&&!m.thigh){toast('מלא לפחות שדה אחד');break;}
      commit(pp=>{pp.measurements=pp.measurements||[];pp.measurements.push(m);if(pp.measurements.length>365)pp.measurements=pp.measurements.slice(-365);markActive(pp);});render();toast('המדידה נשמרה 📏');break;}
    case 'saveWeight':{
      const v=parseFloat(val('w_val'));
      if(!v){toast('הזן משקל תקין');break;}
      commit(pp=>{pp.weights=pp.weights||[];var _lw=pp.weights[pp.weights.length-1];if(_lw&&dayKey(_lw.d)===dayKey(Date.now())){_lw.v=v;}else{pp.weights.push({d:Date.now(),v});}if(pp.weights.length>365)pp.weights=pp.weights.slice(-365);pp.personal.weight=v;markActive(pp);});render();toast('המשקל נשמר ⚖️');break;}

    case 'toggleRecipe':{
      const r=$('rec_'+node.dataset.idx);r.classList.toggle('open');
      node.textContent=t(r.classList.contains('open')?'📖 הסתר מתכון':'📖 מתכון מלא');break;}
    case 'veganGuide':{veganGuide();break;}
    case 'weighDone':{var _wd=weighedToday(P());toast('כבר נשקלת היום ('+(_wd?_wd.v:'')+' ק״ג) — השקילה הבאה מחר ⚖️');break;}
    case 'quickWeigh':{if(weighedToday(P())){toast('כבר נשקלת היום — השקילה הבאה מחר ⚖️');break;}var _w=parseFloat((prompt('משקל היום (ק׳ג):',((P().personal&&P().personal.weight)||''))||'').replace(',','.'));if(!_w||_w<=0){toast('בוטל');break;}commit(pp=>{pp.weights=pp.weights||[];var _lw=pp.weights[pp.weights.length-1];var _ag=_lw&&dayKey(_lw.d)===dayKey(Date.now());var _new=!_ag;if(_ag){_lw.v=_w;}else{pp.weights.push({d:Date.now(),v:_w});}if(pp.weights.length>365)pp.weights=pp.weights.slice(-365);pp.personal.weight=_w;if(_new)pp.xp+=1;markActive(pp);});render();toast('המשקל נשמר ⚖️ +1 XP');break;}
    case 'quickAdd':{openSheet(quickAddForm());break;}
    case 'qaPreset':{var o=QA_PRESET[+node.dataset.i];if(o){$('qa_cal').value=o[1];$('qa_p').value=o[2];$('qa_c').value=o[3];$('qa_f').value=o[4];}break;}
    case 'addFood':{var _fd=FOODDB[+node.dataset.i];if(!_fd)break;commit(pp=>{addFoodEntry(pp,{n:_fd.n,fi:+node.dataset.i,qty:_fd.base,unit:_fd.u,cal:_fd.cal,p:_fd.p,c:_fd.c,f:_fd.f,fib:_fd.fib||0,na:_fd.na||0,sug:_fd.sug||0,emoji:_fd.e});pp.xp+=1;markActive(pp);});closeSheet();render();toast('נוסף: '+foodBaseName(_fd.n)+' ✓ +1 XP');break;}
    case 'pickFood':{openFoodPortion(+node.dataset.i);break;}
    case 'addMyFood':{var _mf=(P().myFoods||[])[+node.dataset.mi];if(!_mf)break;commit(pp=>{addFoodEntry(pp,{n:_mf.n,cal:_mf.cal,p:_mf.p,c:_mf.c,f:_mf.f,fib:_mf.fib||0,na:_mf.na||0,sug:_mf.sug||0,emoji:'⭐'});pp.xp+=1;markActive(pp);});closeSheet();render();toast('נוסף: '+_mf.n+' ✓ +1 XP');break;}
    case 'foodAddPortion':{foodAddPortion();break;}
    case 'editFood':{var _ee=(P().foodLog||[]).find(function(x){return x.id===+node.dataset.id;});if(_ee&&_ee.fi!=null){openFoodPortion(_ee.fi,_ee.id);}else{toast('לפריט זה אין כמות לעריכה — מחק והוסף מחדש');}break;}
    case 'delFood':{commit(pp=>{removeFoodEntry(pp,+node.dataset.id);});render();toast('נמחק מהיומן 🗑️');break;}
    case 'quickAddSave':{var _cal=parseFloat((val('qa_cal')||'').replace(',','.'))||0,_p=parseFloat((val('qa_p')||'').replace(',','.'))||0,_c=parseFloat((val('qa_c')||'').replace(',','.'))||0,_f=parseFloat((val('qa_f')||'').replace(',','.'))||0,_na=parseFloat((val('qa_na')||'').replace(',','.'))||0,_sug=parseFloat((val('qa_sug')||'').replace(',','.'))||0,_nm=(val('qa_name')||'').trim();if(_cal<=0&&_p<=0&&_c<=0&&_f<=0){toast('הזן ערכים');break;}commit(pp=>{addFoodEntry(pp,{n:_nm||'רישום ידני',cal:_cal,p:_p,c:_c,f:_f,fib:0,na:_na,sug:_sug});if(_nm){pp.myFoods=pp.myFoods||[];if(!pp.myFoods.some(function(x){return x.n===_nm;})){pp.myFoods.push({n:_nm,cal:Math.round(_cal),p:Math.round(_p),c:Math.round(_c),f:Math.round(_f),fib:0,na:Math.round(_na),sug:Math.round(_sug)});if(pp.myFoods.length>100)pp.myFoods=pp.myFoods.slice(-100);}}pp.xp+=1;markActive(pp);});closeSheet();render();toast(_nm?('נשמר למזונים שלי ✓'):'נוסף ליום ✓ +1 XP');break;}
    case 'undoLast':{commit(pp=>{var lg=pp.foodLog||[];if(lg.length)removeFoodEntry(pp,lg[lg.length-1].id);});render();toast('ההוספה בוטלה ↩');break;}
    case 'swapMeal':{const key=node.dataset.key;commit(pp=>{pp.mealSeeds=pp.mealSeeds||{};pp.mealSeeds[key]=(pp.mealSeeds[key]||0)+1;});render();toast('הארוחה הוחלפה ↻');break;}
    case 'refreshMenu':{commit(pp=>{pp.mealSeed=(pp.mealSeed||0)+1;});render();toast('התפריט עודכן ↻');break;}
    case 'resetEaten':{commit(pp=>{pp.todayEaten={cal:0,p:0,c:0,f:0,fib:0,na:0,sug:0};pp.mealsEaten={};pp.foodLog=[];pp.water=0;});render();toast('צריכת היום אופסה ↺');break;}
    case 'ateMeal':{const key=node.dataset.key,mi=+node.dataset.idx;const md=dayDist(P()).dist[mi];const was=!!(P().mealsEaten&&P().mealsEaten[key]);var _mn=node.dataset.name||'ארוחה';commit(pp=>{pp.mealsEaten=pp.mealsEaten||{};if(was){delete pp.mealsEaten[key];removeFoodByMeal(pp,key);}else{pp.mealsEaten[key]=1;var _mna=node.dataset.na!=null&&node.dataset.na!==''?+node.dataset.na:Math.round((md.cal||0)*0.9);var _msug=node.dataset.sug!=null&&node.dataset.sug!==''?+node.dataset.sug:Math.round((md.c||0)*0.10);addFoodEntry(pp,{n:_mn,cal:md.cal,p:md.p,c:md.c,f:md.f,fib:Math.round((md.c||0)*0.08),na:_mna,sug:_msug,meal:true,mealKey:key});pp.xp+=3;markActive(pp);}});render();toast(was?'הסימון בוטל ↩':'הארוחה נרשמה ✓ +3 XP');break;}
    case 'ate':{
      var _dist=dayDist(p).dist,_mk=['breakfast','lunch','dinner','snack'],_mn={breakfast:'ארוחת בוקר',lunch:'ארוחת צהריים',dinner:'ארוחת ערב',snack:'נשנוש'};
      commit(pp=>{pp.mealsEaten=pp.mealsEaten||{};var _added=0;_mk.forEach(function(k,i){if(pp.mealsEaten[k])return;var md=_dist[i];if(!md)return;pp.mealsEaten[k]=1;addFoodEntry(pp,{n:_mn[k],cal:md.cal,p:md.p,c:md.c,f:md.f,fib:Math.round((md.c||0)*0.08),na:Math.round((md.cal||0)*0.9),sug:Math.round((md.c||0)*0.10),meal:true,mealKey:k});_added++;});if(_added>0){pp.xp+=10;markActive(pp);}pp._ateAdded=_added;});
      var _n=P()._ateAdded;render();if(_n>0){xpBurst('+10 XP');toast('נרשם! עודכן ביעד היומי ✓ +10 XP');}else{toast('כל הארוחות כבר סומנו ✓');}break;}
    case 'water':{commit(pp=>pp.water=Math.max(0,Math.round((pp.water+parseFloat(node.dataset.v))*100)/100));render();break;}

    case 'toggleNotif':{
      if(!p.notif.enabled){
        if('Notification'in window){
          Notification.requestPermission().then(perm=>{
            commit(pp=>pp.notif.enabled=(perm==='granted'));render();
            toast(perm==='granted'?L('התראות הופעלו','Notifications are on','Notificaciones activadas')
              :L('הדפדפן לא אישר — אפשר לאשר בהגדרות האתר','The browser did not allow it — you can allow it in the site settings','El navegador no lo permitió — puedes permitirlo en los ajustes del sitio'));
          });
        }else toast('הדפדפן לא תומך בהתראות');
      }else{commit(pp=>pp.notif.enabled=false);render();toast('התראות כובו');}
      break;}
    case 'testNotif':{
      if(notifOn(P()))
        new Notification('FitAI 💪',{body:`${p.personal.name}, הגוף מתחזק ונבנה היום!`});
      else if(notifPerm()==='denied')toast(L('ההתראות חסומות בהגדרות האתר בדפדפן','Notifications are blocked in the browser site settings','Las notificaciones están bloqueadas en los ajustes del sitio'));
      else toast(L('הדלק קודם את ההתראות למעלה','Switch the notifications on above first','Activa primero las notificaciones arriba'));
      break;}

    case 'toggleWater':{
      if(!notifOn(P())){toast(L('הדלק קודם את ההתראות למעלה','Switch the notifications on above first','Activa primero las notificaciones arriba'));break;}
      commit(pp=>{pp.reminders=pp.reminders||{};pp.reminders.water=!pp.reminders.water;});render();break;}
    case 'togglePistol':{commit(pp=>{pp.fitness.pistol=!pp.fitness.pistol;pp.fitness.level=computeLevelFromAssessment(pp.fitness.pushups,pp.fitness.pullups,pp.fitness.squats,pp.fitness.pistol);});render();break;}
    case 'dayPicker':{openDayPicker();break;}
    case 'openLegal':{openLegal();break;}
    case 'toggleReturn':{toggleReturnMode();break;}
    case 'dayPick':{commit(function(pp){var a=pp.workout.days=Array.isArray(pp.workout.days)?pp.workout.days:[];var v=+node.dataset.v;var idx=a.indexOf(v);if(idx>=0)a.splice(idx,1);else a.push(v);a.sort(function(x,y){return x-y;});});openDayPicker();render();break;}
    case 'woDur':{commit(pp=>{pp.woPrefs=pp.woPrefs||{};pp.woPrefs.duration=+node.dataset.v;});render();break;}

    case 'cfYes':{var cb=_confirmCb;_confirmClose();if(cb)cb();break;}
    case 'cfNo':{_confirmClose();break;}
    case 'wellSet':{var _wk=node.dataset.k,_wv=+node.dataset.v;commit(pp=>{var _d=dayKey(Date.now());if(!pp.wellness||pp.wellness.day!==_d)pp.wellness={day:_d};pp.wellness[_wk]=_wv;});dailyView();toast('נרשם ✓');break;}
    case 'shopList':{openShoppingList();break;}
    case 'shareCard':{shareCard();break;}

    case 'coachDemo':{openExDemo(node.dataset.n,node.dataset.anim,node.dataset.base);break;}



    case 'setTheme':{DB.theme=node.dataset.v;save();applyTheme();render();toast(DB.theme==='light'?'ערכת נושא בהירה ☀️':'ערכת נושא כהה 🌙');break;}
    case 'installApp':{if(_deferredPrompt){var _dp=_deferredPrompt;_deferredPrompt=null;_dp.prompt();try{_dp.userChoice.then(function(c){if(c&&c.outcome==='accepted')toast('מתקין את FitAI ✓ 🎉');else toast('ההתקנה בוטלה');render();});}catch(e){}}else{installGuide();}break;}
    case 'makeRestore':{makeRestore();render();toast('נקודת שחזור נוצרה 📌');break;}
    case 'restore':{
      if(!p.restorePoints.length){toast('אין נקודת שחזור');break;}
      askConfirm('לשחזר מהנקודה האחרונה? המצב הנוכחי יוחלף.',function(){
        var pp=P();var last=pp.restorePoints[pp.restorePoints.length-1];
        var restored=JSON.parse(last.data);restored.restorePoints=pp.restorePoints;
        DB.profiles[DB.active]=restored;save();render();toast('שוחזר מנקודת השחזור האחרונה ⏪');});break;}
    case 'fullReset':{
      askConfirm('לאפס את כל הנתונים של הפרופיל הנוכחי? פעולה זו אינה הפיכה.',function(){
        var pp=P();var fresh=newProfile(pp.name);fresh.id=pp.id;DB.profiles[pp.id]=fresh;save();render();toast('אופס בוצע');},'אפס הכל',true);
      break;}

    case 'addProf':{const nm=prompt('שם הפרופיל החדש:');if(nm){const np=newProfile(nm);DB.profiles[np.id]=np;DB.active=np.id;save();$('profMenu').classList.remove('open');startOnboarding();}break;}
    case 'dupProf':{const np=JSON.parse(JSON.stringify(p));np.id='p_'+Math.random().toString(36).slice(2,9);np.name=p.name+' (עותק)';DB.profiles[np.id]=np;DB.active=np.id;save();render();renderProfileMenu();toast('שוכפל 📋');break;}
    case 'renameProf':{const nm=prompt('שם חדש:',p.name);if(nm){commit(pp=>{pp.name=nm;pp.personal.name=nm;});render();renderProfileMenu();toast('שונה שם ✏️');}break;}
    case 'delProf':{
      if(Object.keys(DB.profiles).length<=1){toast('חייב להישאר לפחות פרופיל אחד');break;}
      askConfirm('למחוק את הפרופיל "'+p.name+'"?',function(){delete DB.profiles[DB.active];DB.active=Object.keys(DB.profiles)[0];save();render();renderProfileMenu();toast('נמחק 🗑️');},'מחק פרופיל',true);
      break;}
    case 'exportProf':{exportProfile();break;}
    case 'importProf':{importProfile();break;}
    case 'coach':{$('profMenu').classList.remove('open');coachView();break;}
  }
}

