/* src/food-log.js — the food diary: search, portions, quick add, the vegan guide, the trends sheet
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
function fbadge(e,n){var im=n&&(typeof FOODIMG!=='undefined')&&FOODIMG[n];if(im)return '<img src="'+im+'" alt="" style="width:26px;height:26px;border-radius:50%;object-fit:cover;margin-inline-end:7px;flex:none;border:1px solid var(--line)">';return '<span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;background:var(--card2);border-radius:50%;margin-inline-end:7px;font-size:14px;flex:none">'+esc(e||'🍽️')+'</span>';}
function ensureEaten(pp){pp.todayEaten=pp.todayEaten||{cal:0,p:0,c:0,f:0};var te=pp.todayEaten;if(te.fib==null)te.fib=0;if(te.na==null)te.na=0;if(te.sug==null)te.sug=0;pp.foodLog=pp.foodLog||[];}
function addFoodEntry(pp,e){ensureEaten(pp);pp._foodId=(pp._foodId||0)+1;e.id=pp._foodId;e.cal=Math.round(e.cal||0);e.p=Math.round(e.p||0);e.c=Math.round(e.c||0);e.f=Math.round(e.f||0);e.fib=Math.round(e.fib||0);e.na=Math.round(e.na||0);e.sug=Math.round(e.sug||0);pp.foodLog.push(e);var te=pp.todayEaten;te.cal+=e.cal;te.p+=e.p;te.c+=e.c;te.f+=e.f;te.fib+=e.fib;te.na+=e.na;te.sug+=e.sug;if(pp.foodLog.length>200){var _drop=pp.foodLog.slice(0,pp.foodLog.length-200);pp.foodLog=pp.foodLog.slice(-200);_drop.forEach(function(d){te.cal=Math.max(0,te.cal-(d.cal||0));te.p=Math.max(0,te.p-(d.p||0));te.c=Math.max(0,te.c-(d.c||0));te.f=Math.max(0,te.f-(d.f||0));te.fib=Math.max(0,te.fib-(d.fib||0));te.na=Math.max(0,te.na-(d.na||0));te.sug=Math.max(0,te.sug-(d.sug||0));});}}
function removeFoodEntry(pp,id){ensureEaten(pp);var i=pp.foodLog.findIndex(function(x){return x.id===id;});if(i<0)return;var e=pp.foodLog[i];var te=pp.todayEaten;te.cal=Math.max(0,te.cal-e.cal);te.p=Math.max(0,te.p-e.p);te.c=Math.max(0,te.c-e.c);te.f=Math.max(0,te.f-e.f);te.fib=Math.max(0,te.fib-(e.fib||0));te.na=Math.max(0,te.na-(e.na||0));te.sug=Math.max(0,te.sug-(e.sug||0));pp.foodLog.splice(i,1);}
function removeFoodByMeal(pp,key){ensureEaten(pp);(pp.foodLog.slice()).forEach(function(e){if(e.mealKey===key)removeFoodEntry(pp,e.id);});}
function foodSearchRender(q){
  var box=document.getElementById('qa_results');if(!box)return;
  q=(q||'').trim().toLowerCase();
  if(q.length<1){box.innerHTML='';return;}
  var l=lang(),d=I18N[l]||{},hits=[];
  for(var i=0;i<FOODDB.length&&hits.length<12;i++){var f=FOODDB[i];var tr=(d[f.n]||f.n).toLowerCase();if(f.n.toLowerCase().indexOf(q)>=0||tr.indexOf(q)>=0)hits.push(i);}
  var mine=(P().myFoods||[]),mhits=[];for(var j=0;j<mine.length&&mhits.length<8;j++){if(mine[j].n.toLowerCase().indexOf(q)>=0)mhits.push(j);}
  var html=mhits.map(function(j){var f=mine[j];return '<button class="btn ghost sm" data-act="addMyFood" data-mi="'+j+'" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:3px 0;text-align:start"><span style="display:flex;align-items:center;min-width:0">'+fbadge('⭐')+'<span style="overflow:hidden;text-overflow:ellipsis">'+esc(f.n)+'</span></span><span class="sub" style="margin:0;white-space:nowrap">'+f.cal+' קל׳ · '+f.p+' ג׳ חלבון</span></button>';}).join('')+hits.map(function(i){var f=FOODDB[i];return '<button class="btn ghost sm" data-act="pickFood" data-i="'+i+'" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;margin:3px 0;text-align:start"><span style="display:flex;align-items:center;min-width:0">'+fbadge(f.e,f.n)+'<span style="overflow:hidden;text-overflow:ellipsis">'+esc(f.n)+'</span></span><span class="sub" style="margin:0;white-space:nowrap">'+f.cal+' קל׳ · '+f.p+' ג׳ חלבון</span></button>';}).join('');
  box.innerHTML=(mhits.length||hits.length)?html:'<div class="sub" style="text-align:center;padding:6px">— אין תוצאה —</div>';
  try{bindActs(box);translateEl(box);}catch(e){}
}
var _fp=null;
function foodBaseName(n){return (n||'').replace(/\s*\([^)]*\)\s*$/,'').trim();}
function openFoodPortion(fi,eid){
  var f=FOODDB[fi];if(!f)return;var qty=(P().foodQty&&P().foodQty[fi])||f.base;
  if(eid!=null){var e=(P().foodLog||[]).find(function(x){return x.id===eid;});if(e&&e.qty)qty=e.qty;}
  _fp={fi:fi,eid:(eid==null?null:eid)};
  openSheet('<h3 style="display:flex;align-items:center;gap:9px">'+((typeof FOODIMG!=='undefined')&&FOODIMG[f.n]?'<img src="'+FOODIMG[f.n]+'" alt="" style="width:40px;height:40px;border-radius:12px;object-fit:cover;border:1px solid var(--line)">':'')+'<span>'+esc(foodBaseName(f.n))+'</span></h3>'+
    '<div class="sub" style="margin:0 0 10px">'+(eid!=null?'עריכת כמות':'בחר כמות')+' · לכל '+f.base+' '+f.u+': '+f.cal+' קל׳</div>'+
    '<div class="field"><label>כמות ('+f.u+')</label><input class="inp" id="fp_qty" inputmode="decimal" value="'+esc(qty)+'" data-call="foodPortionCalc" data-on="input"></div>'+
    '<div class="pills" style="margin:8px 0">'+[0.5,1,1.5,2].map(function(m){return '<button type="button" class="pill" data-call="fpSetQty" data-args="['+(Math.round(f.base*m*100)/100)+']">×'+m+'</button>';}).join('')+'</div>'+
    '<div id="fp_prev" class="card" style="margin:8px 0"></div>'+
    '<button class="btn grad" data-act="foodAddPortion" style="width:100%;margin-top:6px">'+(eid!=null?'עדכן ✓':'הוסף ליום ✓')+'</button>'+
    '<button class="btn ghost" data-act="close" style="width:100%;margin-top:6px">ביטול</button>');
  foodPortionCalc();
}
function foodPortionCalc(){
  if(!_fp)return;var f=FOODDB[_fp.fi];var box=document.getElementById('fp_prev');if(!f||!box)return;
  var qEl=document.getElementById('fp_qty');var qty=parseFloat(qEl&&qEl.value)||0;var k=f.base?qty/f.base:0;
  function r(x){return Math.round((x||0)*k);}
  box.innerHTML='<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px"><b>'+r(f.cal)+' קל׳</b><span class="sub" style="margin:0">💪 '+r(f.p)+' ג׳</span><span class="sub" style="margin:0">🌾 '+r(f.c)+' ג׳</span><span class="sub" style="margin:0">🥑 '+r(f.f)+' ג׳</span><span class="sub" style="margin:0">🌱 '+r(f.fib)+' ג׳</span></div><div class="sub" style="margin:4px 0 0">🧂 '+r(f.na)+' מ״ג נתרן · 🍬 '+r(f.sug)+' ג׳ סוכר</div>';
  try{translateEl(box);}catch(e){}
}
function foodAddPortion(){
  if(!_fp)return;var f=FOODDB[_fp.fi];if(!f)return;
  var qEl=document.getElementById('fp_qty');var qty=parseFloat(qEl&&qEl.value)||0;if(qty<=0){toast('כמות לא תקינה');return;}
  var k=f.base?qty/f.base:0;var eid=_fp.eid;function r(x){return Math.round((x||0)*k);}
  commit(function(pp){if(eid!=null)removeFoodEntry(pp,eid);addFoodEntry(pp,{n:f.n,fi:_fp.fi,qty:qty,unit:f.u,cal:r(f.cal),p:r(f.p),c:r(f.c),f:r(f.f),fib:r(f.fib),na:r(f.na),sug:r(f.sug),emoji:f.e});if(eid==null)pp.xp+=1;pp.foodQty=pp.foodQty||{};pp.foodQty[_fp.fi]=qty;markActive(pp);});
  _fp=null;closeSheet();render();toast(eid!=null?'עודכן ✓':'נוסף: '+foodBaseName(f.n)+' ✓ +1 XP');
}
function foodDiary(p){
  var log=(p.foodLog||[]);
  if(!log.length)return '<div class="sub" style="margin:8px 2px 0">📖 יומן היום ריק — הוסף אוכל או סמן ארוחה כנאכלה.</div>';
  return '<div class="sub" style="margin:10px 2px 4px;font-weight:800">📖 יומן היום ('+log.length+')</div>'+
    log.slice().reverse().map(function(e){return '<div class="row" style="align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 10px;margin:4px 0">'+
      '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:13px;display:flex;align-items:center">'+fbadge(e.emoji||(e.meal?'🍽️':'✍️'),e.n)+'<span style="overflow:hidden;text-overflow:ellipsis">'+esc(e.n)+'</span></div><div class="sub" style="margin:2px 0 0">'+(e.qty?esc(e.qty+' '+(e.unit||''))+' · ':'')+(+e.cal||0)+' קל׳ · '+(+e.p||0)+' ג׳ חלבון · '+(+e.c||0)+' ג׳ פחמ׳ · '+(+e.f||0)+' ג׳ שומן</div></div>'+
      '<div style="display:flex;gap:4px;flex:none">'+(e.fi!=null?'<button class="btn ghost sm" data-act="editFood" data-id="'+e.id+'" aria-label="ערוך כמות" style="padding:6px 9px">✏️</button>':'')+'<button class="btn ghost sm" data-act="delFood" data-id="'+e.id+'" aria-label="מחק" style="padding:6px 9px">🗑️</button></div></div>';}).join('');
}
var QA_PRESET=[['🍎 פרי',80,1,20,0],['🥚 ביצה',78,6,1,5],['🍗 מנת חלבון',150,28,2,4],['🥗 מנה מלאה',550,30,55,18],['½ מנה',275,15,28,9]];
function quickAddForm(){return '<h3>➕ הוסף אוכל</h3>'+
  '<div class="field" style="margin:0 0 8px"><label>🔎 חיפוש מזון</label><input class="inp" id="qa_search" placeholder="לדוגמה: בננה, חזה עוף, אורז" data-call="foodSearchRender" data-on="input" data-args="[&quot;$value&quot;]"></div>'+
  '<div id="qa_results" style="margin:0 0 8px;max-height:220px;overflow:auto"></div>'+
  '<div class="sub" style="margin:0 0 8px">— או מנה מהירה / ערכים ידניים —</div>'+'<div class="pills" style="margin-bottom:10px">'+'<div class="pills" style="margin-bottom:10px">'+QA_PRESET.map(function(o,i){return '<button class="pill" data-act="qaPreset" data-i="'+i+'">'+o[0]+'</button>';}).join('')+'</div>'+'<div class="field"><label>שם (אופציונלי — יישמר למזונים שלי)</label><input class="inp" id="qa_name" placeholder="לדוגמה: כריך טונה שלי"></div>'+'<div class="inrow"><div class="field"><label>קלוריות</label><input class="inp" id="qa_cal" inputmode="decimal" placeholder="0"></div><div class="field"><label>חלבון (ג׳)</label><input class="inp" id="qa_p" inputmode="decimal" placeholder="0"></div></div>'+'<div class="inrow"><div class="field"><label>פחמימות (ג׳)</label><input class="inp" id="qa_c" inputmode="decimal" placeholder="0"></div><div class="field"><label>שומן (ג׳)</label><input class="inp" id="qa_f" inputmode="decimal" placeholder="0"></div></div>'+'<div class="inrow"><div class="field"><label>נתרן (מ״ג)</label><input class="inp" id="qa_na" inputmode="decimal" placeholder="0"></div><div class="field"><label>סוכר (ג׳)</label><input class="inp" id="qa_sug" inputmode="decimal" placeholder="0"></div></div>'+'<button class="btn grad" data-act="quickAddSave" style="width:100%;margin-top:12px">הוסף ליום ✓</button>'+'<button class="btn ghost" data-act="close" style="width:100%;margin-top:6px">ביטול</button>';}

function veganGuide(){
  openSheet('<h3>🌱 מדריך הצלחת הטבעונית</h3>'+
  '<div class="sub" style="margin:0 0 10px">תקציר מעשי לפי המדריך של אסי הטבעוני · אינו תחליף לייעוץ תזונתי אישי.</div>'+
  '<div class="card" style="margin:8px 0"><b>🍽️ איך בונים צלחת</b>'+
    '<ul style="margin:6px 0 0;padding-inline-start:18px;line-height:1.7">'+
    '<li><b>50% ירקות</b> — 2/3 ירוקים/מצליבים (קייל, ברוקולי, תרד, בוק צ׳וי) ו-1/3 צבעוניים</li>'+
    '<li><b>25% חלבון</b> — טופו, טמפה, סייטן, פתיתי סויה (TSP), חלבון אפונה</li>'+
    '<li><b>25% פחמימה מורכבת</b> — אורז מלא, קינואה, בטטה, פסטה מלאה</li>'+
    '<li><b>לשתות מים</b> — לא משקאות ממותקים/מיצים</li></ul></div>'+
  '<div class="card" style="margin:8px 0"><b>💪 כמה חלבון</b>'+
    '<div class="sub" style="margin-top:6px;line-height:1.7">לא פעיל גופנית: 1.2–1.6 ג׳/ק״ג · מתאמן התנגדות: <b>1.6–2.0 ג׳/ק״ג</b>.<br>לטבעונים מומלץ הטווח העליון — חלבון מהצומח נספג מעט פחות. האפליקציה כבר מתאימה לך יעד חלבון מוגבר אוטומטית.</div></div>'+
  '<div class="card" style="margin:8px 0"><b>📏 כלל אצבע לבחירת מקור חלבון</b>'+
    '<div class="sub" style="margin-top:6px;line-height:1.7">פחות מ-13 ג׳ שומן ל-100 ג׳ (אידיאלי &lt;10), והשומן לא עולה על החלבון.<br>⚠️ חומוס ופלאפל נתפסים כעתירי חלבון אך הם בעיקר שומן — לא מקור חלבון אידיאלי. חפש את התווית <b>💪 ידידותי לחלבון</b> על המנות.</div></div>'+
  '<div class="card" style="margin:8px 0"><b>🥩 מקורות חלבון מומלצים</b>'+
    '<div class="sub" style="margin-top:6px;line-height:1.7">פתיתי סויה TSP (≈60 ג׳ חלבון) · חלבון אפונה · סייטן (≈75) · טמפה · טופו וטופו משי · יובה · תורמוס (15 חלבון, 3 שומן) · שמרי בירה · חלב/מעדני סויה · אבקת חמאת בוטנים.<br>ירקות עשירים בחלבון: קייל, כרוב ניצנים, ברוקולי, פטריות.</div></div>'+
  '<div class="card" style="margin:8px 0;border-color:rgba(255,107,61,.45)"><b>💊 מיקרו-נוטריאנטים חיוניים</b>'+
    '<div class="sub" style="margin-top:6px;line-height:1.7"><b>B12 — חובה</b> בתוסף (אין מקור צמחי אמין).<br>כדאי לוודא גם: ויטמין D, אומגה-3 (אצות/ALA מפשתן/צ׳יה/אגוזי מלך), סידן (טופו מועשר, ירקות מצליבים), ברזל (קטניות + ויטמין C לספיגה), אבץ ויוד. מומלץ להתייעץ עם דיאטן/ית.</div></div>'+
  '<div class="card" style="margin:8px 0"><b>🧂 להיזהר</b>'+
    '<div class="sub" style="margin-top:6px;line-height:1.7">מלח: עד ~3.5 ג׳ ביום — בעיקר במזון מעובד.<br>תחליפי גבינה: לרוב שמן קוקוס — חריג, לא מקור חלבון.<br>גם קלוריות נוזליות נספרות — לשתות לאט, ללעוס היטב, ולאכול בנחת.</div></div>'+
  '<button class="btn ghost" data-act="close" style="width:100%;margin-top:6px">סגור</button>');
}
function trendsModal(){
  var p=P(),MS=86400000,now=Date.now();
  var H='<h3>'+L('ההתקדמות שלי לאורך זמן','My progress over time','Mi progreso a lo largo del tiempo')+'</h3>';
  (function(){
    var _t=new Date().getDay(),_n7=Date.now()-7*86400000,_h=p.history||[];
    var _wk=[0,1,2,3,4,5,6].map(function(i){return {dow:DOW[i],v:_h.some(function(x){return x>_n7&&new Date(x).getDay()===i;})?1:0,today:i===_t};});
    H+='<div class="card"><h2>'+L('השבוע','This week','Esta semana')+'</h2>'+
      (_h.length?'<div class="bars">'+_wk.map(function(d){return '<div class="bar '+(d.today?'today':'')+'"><div class="col" style="height:'+(d.v?70:6)+'%"></div><div class="lbl">'+d.dow+'</div></div>';}).join('')+'</div>'
                :'<div class="empty">'+L('עדיין אין אימונים השבוע','No sessions this week yet','Aún no hay sesiones esta semana')+'</div>')+'</div>';
    var _ac=achievements(p),_got=_ac.filter(function(a){return a.got;}),_left=_ac.filter(function(a){return !a.got;});
    H+='<div class="card"><h2>'+L('הישגים','Badges','Logros')+' ('+_got.length+'/'+_ac.length+')</h2>'+
      '<div class="chips">'+(_got.map(function(a){return '<span class="chip p sm">'+a.emo+' '+a.t+'</span>';}).join('')||
        '<span class="sub" style="margin:0">'+L('עוד לא נפתחו הישגים','Nothing unlocked yet','Aún no hay logros')+'</span>')+'</div>'+
      (_left.length?'<div class="chips" style="margin-top:10px">'+_left.map(function(a){return '<span class="chip sm" style="opacity:.45">'+a.emo+' '+a.t+'</span>';}).join('')+'</div>':'')+
      '</div>';
  })();
  // weekly workout frequency (8 weeks)
  var wk=[0,0,0,0,0,0,0,0];
  (p.history||[]).forEach(function(ts){var diff=Math.floor((now-ts)/(7*MS));if(diff>=0&&diff<8)wk[diff]++;});
  wk.reverse();
  var wkMax=Math.max(1,Math.max.apply(null,wk));
  H+='<div class="card"><h2>🗓️ אימונים בשבוע (8 שבועות אחרונים)</h2><div class="bars" style="height:110px">'+
    wk.map(function(c){var h=8+(c/wkMax)*88;return '<div class="bar"><div class="col" style="height:'+h+'%;background:var(--teal2)"></div><div class="lbl">'+c+'</div></div>';}).join('')+
    '</div><div class="sub" style="margin-top:6px">משמאל = לפני 8 שבועות · מימין = השבוע</div></div>';
  // volume (tonnage) per logged day
  var byDay={};
  Object.keys(p.exLog||{}).forEach(function(base){(p.exLog[base]||[]).forEach(function(e){var k=dayKey(e.d);byDay[k]=byDay[k]||{t:0,d:e.d};byDay[k].t+=(parseFloat(e.w)||0)*(parseInt(e.reps)||0)*(parseInt(e.sets)||1);});});
  var days=Object.keys(byDay).map(function(k){return byDay[k];}).sort(function(a,b){return a.d-b.d;}).slice(-10);
  var _vMax=days.length?Math.max.apply(null,days.map(function(x){return x.t;})):0;
  if(days.length>=2&&_vMax>0){
    var vMax=_vMax;
    H+='<div class="card"><h2>🏋️ נפח אימון (ק״ג ליום מתועד)</h2><div class="bars" style="height:110px">'+
      days.map(function(x){var h=8+(x.t/vMax)*88;return '<div class="bar"><div class="col" style="height:'+h+'%;background:var(--orange2)"></div><div class="lbl">'+Math.round(x.t)+'</div></div>';}).join('')+
      '</div><div class="sub" style="margin-top:6px">משקל × חזרות × סטים — סך ליום</div></div>';
  }
  // per-muscle weekly volume (sets/week)
  var _wv=weeklyVolume(p);var _wvTot=0;Object.keys(_wv).forEach(function(k){_wvTot+=_wv[k];});
  if(_wvTot>0){
    var _mg=[['chest','חזה','var(--teal2)'],['back','גב','var(--blue2)'],['shoulders','כתפיים','var(--purple2)'],['arms','ידיים','var(--orange2)'],['legs','רגליים','var(--yellow)'],['core','ליבה','var(--green2)']];
    H+='<div class="card"><h2>📊 נפח שבועי לפי שריר</h2><div class="sub" style="margin:0 0 8px">סטים ב-7 הימים האחרונים · יעד: ~10 סטים לתחזוקה, 12-20 לצמיחה</div>'+
      _mg.filter(function(m){return _wv[m[0]]>0;}).map(function(m){var v=_wv[m[0]],pct=Math.min(100,Math.round(v/20*100));var tag,cue;if(v<10){tag=' · מתחת ליעד';cue='הוסף '+(10-v)+' סטים לתחזוקה';}else if(v>22){tag=' · נפח גבוה';cue='נפח גבוה — ודא התאוששות מספקת';}else{tag=' ✓';cue='בטווח צמיחה — המשך כך';}return '<div class="gaugewrap"><div class="gauge"><span>'+m[1]+'</span><span style="color:'+m[2]+';font-weight:800">'+v+' סטים'+tag+'</span></div><div class="waterbar"><i style="width:'+pct+'%;background:linear-gradient(90deg,'+m[2]+','+m[2]+')"></i></div><div class="sub" style="font-size:11px;margin:2px 2px 0">'+cue+'</div></div>';}).join('')+
      '</div>';
  }
  // per-exercise progression
  var exs=Object.keys(p.exLog||{}).filter(function(b){return (p.exLog[b]||[]).length>=1;});
  if(exs.length){
    H+='<div class="card"><h2>💪 התקדמות לפי תרגיל</h2>';
    exs.forEach(function(base){
      var a=p.exLog[base],last=a[a.length-1],first=a[0];
      var useReps=a.every(function(e){return !(parseFloat(e.w)>0);});
      var met=function(e){return useReps?(parseInt(e.reps)||0):(parseFloat(e.w)||0);};
      var unit=useReps?'חזרות':'ק״ג';
      var pr=a.reduce(function(m,e){return Math.max(m,met(e));},0);
      var trend=met(last)-met(first);
      var vals=a.slice(-8).map(met),mx=Math.max.apply(null,vals)||1;
      var e1=0,stalled=false;if(!useReps){var e1all=a.map(function(e){return est1RM(e.w,e.reps);});e1=e1all[e1all.length-1];if(e1all.length>=4){var recent=e1all.slice(-3),prevPeak=Math.max.apply(null,e1all.slice(0,-3));stalled=Math.max.apply(null,recent)<=prevPeak;}}
      H+='<div style="margin:10px 0;padding:10px;background:var(--card2);border:1px solid var(--line);border-radius:12px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><b style="font-size:14px">'+esc(base)+'</b>'+
        '<span class="sub" style="margin:0;white-space:nowrap">🏆 '+pr+' '+unit+(e1?' · 1RM≈'+e1:'')+(trend>0?' · ⬆️ +'+(Math.round(trend*10)/10):trend<0?' · ⬇️ '+(Math.round(trend*10)/10):' · ➡️')+'</span></div>'+(stalled?'<div class="sub" style="margin:6px 0 0;color:var(--orange2)">⚠️ תקוע 3 אימונים — שקול דילוד, שינוי טווח חזרות או החלפת גרסה</div>':'')+
        (vals.length>=2?'<div class="bars" style="height:60px;margin-top:8px">'+vals.map(function(v){var h=12+(v/mx)*82;return '<div class="bar"><div class="col" style="height:'+h+'%;background:var(--purple2)"></div><div class="lbl">'+v+'</div></div>';}).join('')+'</div>':'<div class="sub" style="margin:6px 0 0">תיעוד אחד עד כה: '+(last.w?last.w+' ק״ג × ':'')+(last.reps||'?')+' '+unit+'</div>')+
      '</div>';
    });
    H+='</div>';
  }
  if((p.weights||[]).length>=2){H+='<div class="card"><h2>⚖️ מעקב משקל גוף</h2>'+weightChart(p)+'</div>';}
  if(!exs.length&&(p.history||[]).length===0){H+='<div class="empty">עדיין אין מספיק נתונים — השלם אימון ורשום משקלים כדי לראות גרפים 📊</div>';}
  H+='<button class="btn ghost" data-act="woClose">סגור</button>';
  openModal(H);
}

