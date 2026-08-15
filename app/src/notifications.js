/* src/notifications.js — the reminder scheduler
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* =====================================================================
   SCHEDULED NOTIFICATIONS (while app open)
   ===================================================================== */

/* ---- notifications: one source of truth ---------------------------------
   notifOn() is the only thing the UI asks. syncNotifPerm() writes the
   correction back once at boot, so a permission revoked in site settings (or
   a profile imported into a browser that never granted one) cannot leave the
   stored flag claiming otherwise. */
function notifPerm(){return ('Notification' in window)?Notification.permission:'unsupported';}
function notifOn(p){return !!(p&&p.notif&&p.notif.enabled)&&notifPerm()==='granted';}
function syncNotifPerm(){
  try{var p=P();if(p&&p.notif&&p.notif.enabled&&notifPerm()!=='granted')commit(function(pp){pp.notif.enabled=false;});}catch(e){}
}
/* The water window: a real interval from 09:00, not clock hours that happen
   to divide by N. Every 2 gives 9,11,13,15,17,19,21 — it used to give
   10,12,14,16,18,20 and skip the first one. */
var WATER_FROM=9,WATER_TO=21;
function waterHours(every){var out=[],ev=Math.max(1,parseInt(every,10)||3);
  for(var h=WATER_FROM;h<=WATER_TO;h+=ev)out.push(h);return out;}
function hhmm(h,m){return (h<10?'0':'')+h+':'+((m||0)<10?'0':'')+(m||0);}
/* These are timers inside the page, and a browser throttles a background tab
   hard enough to skip the one minute a reminder was due — the old code matched
   the exact HH:MM and lost it for good. Anything whose time has passed today
   fires up to an hour late instead, and the fired-state lives in the profile
   so a reload does not repeat it. */
var NOTIF_LATE_MIN=60;
setInterval(()=>{
  const p=P();
  if(!notifOn(p))return;
  const now=new Date(),mins=now.getHours()*60+now.getMinutes(),dk=dayKey(now.getTime());
  const R=p.reminders||{},training=isTrainingToday(p);
  var f=(p.notif&&p.notif.fired)||{};
  const fired=(f.d===dk)?f:{d:dk};                 // yesterday's marks are dropped
  var dirty=(fired!==f);
  const at=(t)=>{var m=/^(\d{1,2}):(\d{2})$/.exec(t||'');return m?(+m[1])*60+(+m[2]):null;};
  const due=(key,t)=>{var v=at(t);return v!==null&&!fired[key]&&mins>=v&&mins-v<=NOTIF_LATE_MIN;};
  function fire(key,title,body){fired[key]=1;dirty=true;try{new Notification('FitAI · '+title,{body:body});}catch(e){}}
  if(due('morning',R.morning))fire('morning','בוקר טוב ☀️',training?(p.personal.name+', היום יום אימון — בוא נבנה את הגוף! 💪'):'יום מנוחה — תן לגוף לצמוח 🧘');
  if(training&&due('workout',R.workout))fire('workout','תזכורת אימון 🏋️','הזמן להתאמן — אפילו 30 דק׳ מקדמות אותך.');
  if(due('sleep',R.sleep))fire('sleep','שעת שינה 🌙','כבה מסכים — שינה = צמיחה. לילה טוב!');
  if(R.water){
    var hs=waterHours(R.waterEvery);
    for(var i=0;i<hs.length;i++){
      var k='water'+hs[i];
      if(!due(k,hhmm(hs[i],0)))continue;
      var wt=waterTarget(p);
      if((p.water||0)<wt)fire(k,'תזכורת מים 💧','שתית '+(p.water||0).toFixed(1)+' מתוך '+wt+' ל׳ — קח כוס מים.');
      else{fired[k]=1;dirty=true;}                  // already on target: mark it, do not nag
      break;
    }
  }
  if(dirty)commit(pp=>{pp.notif=pp.notif||{};pp.notif.fired=fired;});
},30000);
/* ---- brand logo assets (embedded, offline) ---- */
