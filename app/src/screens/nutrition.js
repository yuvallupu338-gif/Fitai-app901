/* src/screens/nutrition.js — the nutrition screen and the day’s macro distribution
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---------- NUTRITION ---------- */
function estMealNaSug(m){var ing=((m&&m.ing)||[]).join(' ');var nm=(m&&m.name)||'';var na=110,sug=2;
  if(/גבינה|בולגרית|פטה|מוצרלה|צהוב|קוטג/.test(ing))na+=260;
  if(/טונה|סרדין|אנשובי/.test(ing))na+=250;
  if(/סויה|רוטב סויה|מיסו/.test(ing))na+=320;
  if(/לחם|פיתה|טורטייה|קרקר|לחמני|בגט|באגט/.test(ing))na+=180;
  if(/זית|כבוש|חמוץ|מלפפון חמוץ/.test(ing))na+=220;
  if(/נקניק|קבב|המבורגר|שווארמה|בייקון|פסטרמה|נקניקי/.test(ing+nm))na+=450;
  if(/מלח|סויה|רוטב/.test(ing))na+=120;
  if(/שימורים|קופסה|משומר/.test(ing))na+=180;
  if(/דבש/.test(ing))sug+=12;
  if(/סוכר/.test(ing))sug+=10;
  if(/ריבה|סילאן|מייפל|תמרים|סירופ/.test(ing))sug+=12;
  if(/בננה|תפוח|תמר|פרי|ענב|מנגו|תות|אוכמניות|יער/.test(ing))sug+=11;
  if(/שוקולד|קקאו|נוטלה/.test(ing))sug+=10;
  if(/גרנולה|דגני/.test(ing))sug+=8;
  if(/יוגורט|מעדן|חלב/.test(ing))sug+=5;
  return {na:na,sug:sug};}
function dayDist(p){
  var t=targets(p),mode=effectiveDayMode(p);
  var factor=mode==='sick'?0.85:mode==='rest'?0.92:1;
  var eff={protein:Math.round(t.protein*(mode==='sick'?0.9:1)),carbs:Math.round(t.carbs*factor),fat:Math.round(t.fat*factor)};
  eff.cal=eff.protein*4+eff.carbs*4+eff.fat*9;
  var shares=[0.27,0.35,0.28,0.10],pShares=[0.28,0.30,0.27,0.15];
  var dist=[],aP=0,aC=0,aF=0;
  for(var i=0;i<4;i++){var mp,mc,mf;
    if(i<3){mp=Math.round(eff.protein*pShares[i]);mc=Math.round(eff.carbs*shares[i]);mf=Math.round(eff.fat*shares[i]);aP+=mp;aC+=mc;aF+=mf;}
    else{mp=Math.max(0,eff.protein-aP);mc=Math.max(0,eff.carbs-aC);mf=Math.max(0,eff.fat-aF);}
    dist.push({p:mp,c:mc,f:mf,cal:mp*4+mc*4+mf*9});}
  return {eff:eff,dist:dist,keys:['breakfast','lunch','dinner','snack']};
}
function Nutrition(){
  const p=P(),t=targets(p),mode=effectiveDayMode(p);
  const pool=MEALPOOL[p.nutrition.diet]||MEALPOOL.regular;
  const banned=bannedWords(p.nutrition.allergies), dis=dislikeWords(p.nutrition.dislikes);
  const baseSeed=p.mealSeed||0, seeds=p.mealSeeds||{};
  const dd=dayDist(p), eff=dd.eff, dist=dd.dist;
  const shares=[0.27,0.35,0.28,0.10];
  const metas=[
    {key:'breakfast',he:'ארוחת בוקר',emo:'🍳',grad:'linear-gradient(135deg,#1F2218,#131519)',pl:pool.breakfast},
    {key:'lunch',he:'ארוחת צהריים',emo:'🍗',grad:'linear-gradient(135deg,#221A18,#131519)',pl:pool.lunch},
    {key:'dinner',he:'ארוחת ערב',emo:'🐟',grad:'linear-gradient(135deg,#181F27,#131519)',pl:pool.dinner},
    {key:'snack',he:'נשנוש',emo:'🥤',grad:'linear-gradient(135deg,#1B2420,#131519)',pl:pool.snack},
  ];
  const meals=metas.map((mt,i)=>{const pk=pickSafeMeal(mt.pl,(seeds[mt.key]||0)+baseSeed,banned,dis);return {...mt,m:pk.m,safe:pk.safe,mc:dist[i]};});
  const sum=dist.reduce((a,d)=>({cal:a.cal+d.cal,p:a.p+d.p,c:a.c+d.c,f:a.f+d.f}),{cal:0,p:0,c:0,f:0});
  const eaten=p.todayEaten||{cal:0,p:0,c:0,f:0};
  const anyEaten=((+eaten.cal||0)+(+eaten.p||0)+(+eaten.c||0)+(+eaten.f||0))>0;
  const wt=waterTarget(p);
  return `
  <h1 class="hello" style="font-size:24px">🥩 תזונה</h1>
  <div class="daystat">תפריט מותאם ליעד, לסוג התזונה ולאלרגיות שלך</div>
  <div class="daystat" style="margin-top:6px">${mode==='training'?'🔥 יום אימון':mode==='rest'?'🧘 יום מנוחה':'🤒 יום מחלה'} · לפי ימי האימון בהגדרות</div>

  ${isUnderweight(p)?`<div class="card" style="border-color:rgba(255,107,61,.45);background:linear-gradient(135deg,rgba(255,107,61,.10),rgba(217,255,61,.04))">
    <b style="color:var(--orange2);font-size:15px">⚠️ התאמה בריאותית</b>
    <div class="sub" style="margin-top:6px">המשקל בפרופיל (${esc(p.personal.weight)} ק״ג · ${esc(p.personal.height)} ס״מ · BMI ${bmiOf(p).toFixed(1)}) מצביע על תת-משקל. לכן היעד הותאם ל<b>עודף קלורי לבנייה</b> — בלי המלצת גירעון — וצריכת החלבון רוככה. אם הנתון מדויק, מומלץ להיוועץ באיש מקצוע.</div>
  </div>`:''}

  <div class="grid g4">
    <div class="stat o"><div class="v">${num(eff.cal)}</div><div class="l">קלוריות</div></div>
    <div class="stat p"><div class="v">${eff.protein}<span style="font-size:12px">ג׳</span></div><div class="l">חלבון</div></div>
    <div class="stat b"><div class="v">${eff.carbs}<span style="font-size:12px">ג׳</span></div><div class="l">פחמימות</div></div>
    <div class="stat g"><div class="v">${eff.fat}<span style="font-size:12px">ג׳</span></div><div class="l">שומן</div></div>
  </div>
  <div class="sub" style="margin:6px 4px 0;display:flex;gap:10px;flex-wrap:wrap"><span>🌾 סיבים מומלצים: ${Math.round(eff.cal/1000*14)} ג׳</span><span>🧂 מלח: עד 3.5 ג׳</span><span>🍬 הפחת סוכר מוסף</span></div>
  <details style="margin:8px 0 0"><summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--teal2);padding:4px 2px">🧬 מיקרו-נוטריאנטים — טיפים ליום</summary><div class="sub" style="margin:6px 2px 0;line-height:1.6">${p.nutrition.diet==='vegan'?'🌱 <b>B12</b> — חובה בתוסף. <b>ברזל</b> מקטניות + ויטמין C לספיגה. <b>אומגה-3</b> מזרעי פשתן/צ׳יה או תוסף אצות. <b>סידן</b> מטחינה, טופו ומשקאות מועשרים. <b>אבץ</b> מדגנים מלאים ואגוזים.':'💪 <b>ברזל</b> מבשר אדום/עוף וקטניות. <b>סידן</b> ממוצרי חלב/טחינה. <b>אומגה-3</b> מדגים שמנים 2× בשבוע. <b>ויטמין D</b> — שקול תוסף בחורף. <b>אשלגן</b> מבננה, בטטה וירקות ירוקים.'} <b>שתייה:</b> ${waterTarget(p)} כוסות מים ליום.</div></details>
  <div class="card glow" style="margin-top:10px">
    <h2>📲 צריכת היום בפועל</h2>
    <div class="sub">מתעדכן בכל לחיצה על "✓ אכלתי ארוחה זו"</div>
    ${[['קלוריות',(p.todayEaten||{}).cal||0,eff.cal,' קל׳','var(--orange2)'],['חלבון',(p.todayEaten||{}).p||0,eff.protein,'ג׳','var(--purple2)'],['פחמימות',(p.todayEaten||{}).c||0,eff.carbs,'ג׳','var(--blue2)'],['שומן',(p.todayEaten||{}).f||0,eff.fat,'ג׳','var(--green2)']].map(([lbl,cur,tgt,u,col])=>{const pctRaw=tgt?Math.round(cur/tgt*100):0;const pct=Math.min(100,pctRaw);const over=pctRaw>105;const c2=over?'var(--orange2)':col;return `<div class="gaugewrap"><div class="gauge"><span>${lbl}${over?' ⚠️ חריגה':''}</span><span style="color:${c2};font-weight:800">${num(Math.round(cur))}${u} / ${num(tgt)}${u} · ${pctRaw}%</span></div><div class="waterbar"><i style="width:${pct}%;background:linear-gradient(90deg,${c2},${c2})"></i></div></div>`;}).join('')}
    ${(()=>{var fib=(p.todayEaten||{}).fib||0,ft=Math.round(eff.cal/1000*14),pct=ft?Math.min(100,Math.round(fib/ft*100)):0;return `<div class="gaugewrap"><div class="gauge"><span>🌾 סיבים</span><span style="color:var(--green2);font-weight:800">${fib} ג׳ / ${ft} ג׳ · ${ft?Math.round(fib/ft*100):0}%</span></div><div class="waterbar"><i style="width:${pct}%;background:linear-gradient(90deg,var(--green2),var(--green2))"></i></div></div>`;})()}
    ${(()=>{var na=(p.todayEaten||{}).na||0,nl=(p.naTarget||2300),np=Math.min(100,Math.round(na/nl*100)),nov=na>nl,nc=nov?'var(--orange2)':'var(--blue2)';return `<div class="gaugewrap"><div class="gauge"><span>🧂 נתרן${nov?' ⚠️':''}</span><span style="color:${nc};font-weight:800">${na} / ${nl} מ״ג · ${Math.round(na/nl*100)}%</span></div><div class="waterbar"><i style="width:${np}%;background:linear-gradient(90deg,${nc},${nc})"></i></div></div>`;})()}${(()=>{var sg=(p.todayEaten||{}).sug||0,sl=(p.sugTarget||50),sp=Math.min(100,Math.round(sg/sl*100)),sov=sg>sl,sc=sov?'var(--orange2)':'var(--purple2)';return `<div class="gaugewrap"><div class="gauge"><span>🍬 סוכר (סה״כ)${sov?' ⚠️':''}</span><span style="color:${sc};font-weight:800">${sg} / ${sl} ג׳ · ${Math.round(sg/sl*100)}%</span></div><div class="waterbar"><i style="width:${sp}%;background:linear-gradient(90deg,${sc},${sc})"></i></div></div>`;})()}
    <div class="row" style="margin-top:8px">
      <button class="btn b sm" data-act="quickAdd" style="flex:1">➕ הוסף אוכל</button>
      ${(p.foodLog&&p.foodLog.length)?'<button class="btn ghost sm" data-act="undoLast" style="flex:1">↩ בטל אחרון</button>':''}
      <button class="btn ghost sm" data-act="resetEaten" style="flex:1">↺ אפס יום</button>
    </div>
    ${foodDiary(p)}
  </div>
  ${p.nutrition.allergies?`<div class="chip o" style="margin-top:10px">⚠️ נמנע מ: ${esc(p.nutrition.allergies)}</div>`:''}
  ${(p.nutrition.dislikes||'').trim()?`<div class="chip b" style="margin-top:10px">🙅 לא אוהב: ${esc(p.nutrition.dislikes)}</div>`:''}
  ${p.nutrition.diet==='vegan'?`<button class="btn b" style="width:100%;margin-top:10px" data-act="veganGuide">🌱 מדריך הצלחת הטבעונית — חלבון ובניית ארוחה</button>`:''}
  <button class="btn b" style="width:100%;margin-top:10px" data-act="shopList">🛒 רשימת קניות לתפריט היום</button>

  ${meals.map((mm,idx)=>{
    const m=mm.m, mc=mm.mc, _bc=m.p*4+m.c*4+m.f*9, f=_bc?mc.cal/_bc:1;
    return `
    <div class="meal">
      <div class="img" role="img" aria-label="${esc(m.name)}" style="background-image:linear-gradient(180deg,rgba(0,0,0,.12) 0%,rgba(0,0,0,.20) 55%,rgba(0,0,0,.68) 100%),url('${m.img}');background-size:cover;background-position:center;align-items:flex-end"><div class="tag" style="position:absolute;bottom:8px;right:8px;margin:0">${mm.emo} ${mm.he}</div><div class="tag" style="position:absolute;top:8px;left:8px;margin:0;background:rgba(0,0,0,.6)">🔥 ${num(mc.cal)} קל׳</div></div>
      <div class="body">
        <div class="nm">${esc(m.name)} ${isProteinFriendly(m)?'<span class="chip g sm" style="vertical-align:middle">💪 ידידותי לחלבון</span>':''} ${banned.length?(mm.safe?'<span class="chip g sm" style="vertical-align:middle">✓ מתאים לאלרגיות</span>':'<span class="chip o sm" style="vertical-align:middle">⚠️ בדוק מרכיבים</span>'):''}</div>
        <div class="macros">
          <span class="macro" style="border-color:rgba(217,255,61,.4);color:var(--teal2)">💪 חלבון ${mc.p}g</span>
          <span class="macro" style="border-color:rgba(255,107,61,.4);color:var(--orange2)">🌾 פחמ׳ ${mc.c}g</span>
          <span class="macro" style="border-color:rgba(217,255,61,.4);color:var(--green2)">🥑 שומן ${mc.f}g</span>
        </div>
        <div class="meta"><span>⏱️ ${m.time} דק׳</span><span>🍽️ ${m.serv} מנה</span><span>${Math.round(shares[idx]*100)}% מהיום</span></div>
        <div class="row">
          <button class="btn sm b" style="flex:1;width:auto" data-act="toggleRecipe" data-idx="${idx}">📖 מתכון מלא</button>
          <button class="btn sm o" style="flex:1;width:auto" data-act="swapMeal" data-key="${mm.key}">↻ החלף ארוחה</button>
        </div>
        <button class="btn sm ${(p.mealsEaten&&p.mealsEaten[mm.key])?'':'g'}" style="width:100%;margin-top:6px${(p.mealsEaten&&p.mealsEaten[mm.key])?';opacity:.7':''}" data-act="ateMeal" data-key="${mm.key}" data-idx="${idx}" data-name="${esc(m.name)}" data-na="${(()=>{var _n=estMealNaSug(m);return Math.round(_n.na*f);})()}" data-sug="${(()=>{var _n=estMealNaSug(m);return Math.round(_n.sug*f);})()}">${(p.mealsEaten&&p.mealsEaten[mm.key])?'✓ סומן כנאכל':'✓ אכלתי ארוחה זו'}</button>
        <div class="recipe" id="rec_${idx}">
          <h4>🧾 מרכיבים <span style="color:var(--muted);font-weight:600;font-size:12px">· כמויות מותאמות ליעד</span></h4>
          <ul>${m.ing.map(i=>`<li>${esc(scaleQty(i,f))}</li>`).join('')}</ul>
          <h4>👨‍🍳 הוראות הכנה</h4>
          <ol>${m.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>
        </div>
      </div>
    </div>`;
  }).join('')}

  <div class="card glow">
    <h2>🧮 מה אכלתי היום מול היעד</h2>
    <div class="sub">מתעדכן לפי המנות שהוספת ליום · התפריט המוצע מסתכם ב-${num(sum.cal)} קל׳</div>
    ${anyEaten?'':`<div class="sub" style="margin:4px 0 0;color:var(--orange2)">עדיין לא הוספת מנות היום — הוסף מנה או סמן "אכלתי לפי התפריט"</div>`}
    ${[['קלוריות',eaten.cal,eff.cal,' קל׳','var(--orange2)'],['חלבון',eaten.p,eff.protein,'g','var(--purple2)'],['פחמימות',eaten.c,eff.carbs,'g','var(--blue2)'],['שומן',eaten.f,eff.fat,'g','var(--green2)']].map(([lbl,cur,tgt,u,col])=>{
      const _c=Math.round(+cur||0), _t=Math.round(+tgt||0);
      const pct=_t?Math.round(_c/_t*100):0, over=_c>_t;
      return `<div class="gaugewrap">
        <div class="gauge"><span>${lbl}</span><span style="color:${over?'#FF8FB6':col};font-weight:800">${num(_c)}${u} / ${num(_t)}${u} · ${pct}%</span></div>
        <div class="waterbar"><i style="width:${Math.min(100,pct)}%;background:linear-gradient(90deg,${over?'#FF8FB6':col},${over?'#FF8FB6':col})"></i></div>
        <div class="sub" style="margin:2px 0 0;font-size:11px">${over?('חריגה של '+num(_c-_t)+u):('נותרו '+num(Math.max(0,_t-_c))+u)}</div>
      </div>`;
    }).join('')}
  </div>

  <div class="row">
    <button class="btn g" data-act="ate">✓ אכלתי לפי התפריט</button>
    <button class="btn p" data-act="refreshMenu">↻ רענן את כל התפריט</button>
  </div>

  <div class="card">
    <h2>💧 מעקב מים</h2>
    <div class="sub">יעד מותאם למשקל ולפעילות שלך: ${wt} ל׳/יום (≈33 מ״ל לק״ג${isTrainingToday(p)?' + בונוס יום אימון':''})</div>
    <div class="water">
      <div class="waterbar"><i style="width:${Math.min(100,p.water/wt*100)}%"></i></div>
      <b style="min-width:90px;text-align:end">${p.water.toFixed(1)} / ${wt} ל׳</b>
    </div>
    <div class="row">
      <button class="btn b sm" style="flex:1;width:auto" data-act="water" data-v="0.25">+250 מ״ל</button>
      <button class="btn sm" style="flex:1;width:auto" data-act="water" data-v="-0.25">−250 מ״ל</button>
    </div>
  </div>
  <div class="disclaimer">הערכים מחושבים אוטומטית ולעיון בלבד — אינם ייעוץ תזונתי או רפואי.</div>
  `;
}

