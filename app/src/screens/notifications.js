/* src/screens/notifications.js — the notifications screen
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---------- NOTIFICATIONS ---------- */
function Notif(){
  const p=P(),training=isTrainingToday(p),R=p.reminders||{};
  const perm=('Notification'in window)?Notification.permission:'unsupported';
  return `
  <h1 class="hello" style="font-size:24px">🔔 התראות</h1>
  <div class="daystat">תזכורות חכמות ומתוזמנות — מותאמות ליום ${training?'אימון':'מנוחה'}</div>
  ${(()=>{const on=notifOn(p);
    const why=perm==='unsupported'?L('הדפדפן הזה לא תומך בהתראות','This browser does not support notifications','Este navegador no admite notificaciones')
      :perm==='denied'?L('חסום בהגדרות האתר בדפדפן — צריך לאשר שם כדי להדליק','Blocked in the browser\u2019s site settings — allow it there to switch this on','Bloqueado en los ajustes del sitio — permítelo allí para activarlo')
      :on?L('פעיל — התזכורות למטה יישלחו','On — the reminders below will be sent','Activo — se enviarán los recordatorios de abajo')
      :L('הפעל כדי לקבל את התזכורות למטה','Switch on to get the reminders below','Actívalo para recibir los recordatorios de abajo');
    return `<div class="toggle">
    <div class="tx"><b>${L('הפעלת התראות','Notifications','Notificaciones')}</b><span>${why}</span></div>
    <div class="sw ${on?'on':''}" data-act="toggleNotif" role="switch" tabindex="0" aria-checked="${on?'true':'false'}" aria-label="${L('הפעלת התראות','Notifications','Notificaciones')}"><i></i></div>
  </div>${perm==='denied'?`<div class="sub" style="margin:-2px 6px 8px">${L('בכרום: 🔒 בשורת הכתובת ← התראות ← אפשר. בספארי: הגדרות ← אתרים ← התראות.','In Chrome: the lock icon in the address bar → Notifications → Allow. In Safari: Settings → Websites → Notifications.','En Chrome: el candado de la barra de direcciones → Notificaciones → Permitir. En Safari: Ajustes → Sitios web → Notificaciones.')}</div>`:''}`;})()}
  <div class="card">
    <h2>⏰ זמני תזכורת</h2>
    <div class="field"><label>בוקר טוב ☀️</label><input class="inp" type="time" data-set="reminders.morning" value="${esc(R.morning||'07:00')}"></div>
    <div class="field" style="margin-top:8px"><label>תזכורת אימון 🏋️ (בימי אימון)</label><input class="inp" type="time" data-set="reminders.workout" value="${esc(R.workout||'18:00')}"></div>
    <div class="field" style="margin-top:8px"><label>שעת שינה 🌙</label><input class="inp" type="time" data-set="reminders.sleep" value="${esc(R.sleep||'22:00')}"></div>
  </div>
  <div class="card">
    ${(()=>{const wOn=notifOn(p)&&!!R.water;return `<div class="toggle"><div class="tx"><b>${L('תזכורות מים','Water reminders','Recordatorios de agua')}</b><span>${L('תזכורת לשתות לאורך היום','A nudge to drink through the day','Un aviso para beber durante el día')}</span></div><div class="sw ${wOn?'on':''}" data-act="toggleWater" role="switch" tabindex="0" aria-checked="${wOn?'true':'false'}" aria-label="${L('תזכורות מים','Water reminders','Recordatorios de agua')}"><i></i></div></div>`;})()}
    <div class="field" style="margin-top:10px"><label>${L('כל כמה שעות','How many hours apart','Cada cuántas horas')}</label>
      <select class="inp" data-set="reminders.waterEvery">${[2,3,4].map(n=>`<option ${(R.waterEvery||3)==n?'selected':''}>${n}</option>`).join('')}</select></div>
    <div class="sub" style="margin:8px 2px 0;font-size:12px">${waterHours(R.waterEvery).map(h=>hhmm(h,0)).join(' · ')}</div>
  </div>
  <button class="btn b" data-act="testNotif">🔔 שלח התראת בדיקה</button>
  <div class="disclaimer">${L('התזכורות נשלחות מתוך האפליקציה עצמה, ולכן הן מגיעות רק כשהיא פתוחה — בחזית או בלשונית פעילה ברקע. כשהיא סגורה לגמרי לא נשלח כלום, וגם התקנה למסך הבית לא משנה זאת: התראות במצב סגור דורשות שרת Push, ולאפליקציה הזאת אין שרת בכוונה. תזכורת שהזמן שלה חלף בזמן שהאפליקציה הייתה סגורה תישלח כשתפתח אותה, עד שעה באיחור.','The reminders are sent by the app itself, so they arrive only while it is open — in front of you, or in a live background tab. Nothing is sent while it is fully closed, and installing it to the home screen does not change that: notifications while closed need a push server, and this app deliberately has none. A reminder whose time passed while the app was closed is sent when you open it, up to an hour late.','Los recordatorios los envía la propia app, así que solo llegan mientras está abierta — delante de ti o en una pestaña activa en segundo plano. No se envía nada mientras está cerrada del todo, y instalarla en la pantalla de inicio no lo cambia: las notificaciones con la app cerrada necesitan un servidor push, y esta app no tiene ninguno a propósito. Un recordatorio cuya hora pasó mientras la app estaba cerrada se envía al abrirla, hasta una hora tarde.')}</div>
  `;
}

