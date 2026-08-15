/* src/coach-figure.js — the animated vector coach
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---------- animated coach figure ---------- */
function archetype(ex){
  const n=(ex.name||'').toLowerCase(), c=ex.cat;
  if(c==='legs'||/squat|lunge|leg|deadlift|pistol|yoke/.test(n))return 'squat';
  if(c==='chest'||/press|push|bench|dip|fly/.test(n))return 'press';
  if(c==='back'||/row|pull|lat|chin|lever|flag/.test(n))return 'pull';
  return 'core';
}
function animLabel(a){var m={
  squat:function(){return L('סקוואט','Squat','Sentadilla');},
  press:function(){return L('דחיפה','Push','Empuje');},
  pull :function(){return L('משיכה','Pull','Tirón');},
  core :function(){return L('ליבה','Core','Core');},
  idle :function(){return L('מנוחה','Rest','Descanso');}};
  return m[a]?('· '+m[a]()):'';}
function coachSVG(gender,anim,pri,sec){
  const fem=gender==='נקבה';
  const shirt=fem?'#4DE1FF':'#D9FF3D', shirtD=fem?'#2BB8D6':'#B4D62E',
        skin=fem?'#f1c6a2':'#e7b693', hair=fem?'#5b3a29':'#2c2c2c', pants='#28303f', shoe='#15171c';
  const hairTop=fem
    ? '<path d="M80,60 Q100,38 120,60 Q120,49 100,46 Q80,49 80,60 Z" fill="'+hair+'"/><path d="M117,58 Q135,74 127,106 Q123,82 112,70 Z" fill="'+hair+'"/>'
    : '<path d="M82,60 Q100,42 118,60 L118,55 Q100,45 82,55 Z" fill="'+hair+'"/>';
  return '<svg class="coach anim-'+anim+'" viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg">'+
    '<defs><linearGradient id="cgs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="'+shirt+'"/><stop offset="1" stop-color="'+shirtD+'"/></linearGradient></defs>'+
    '<ellipse class="shadow" cx="100" cy="242" rx="40" ry="6" fill="rgba(0,0,0,.4)"/>'+
    '<g class="fig">'+
      '<g class="part legL" style="transform-origin:91px 150px"><rect x="84" y="150" width="14" height="58" rx="7" fill="'+pants+'"/><ellipse cx="91" cy="212" rx="10" ry="5" fill="'+shoe+'"/>'+musMarks('legL',pri,sec)+'</g>'+
      '<g class="part legR" style="transform-origin:109px 150px"><rect x="102" y="150" width="14" height="58" rx="7" fill="'+pants+'"/><ellipse cx="109" cy="212" rx="10" ry="5" fill="'+shoe+'"/>'+musMarks('legR',pri,sec)+'</g>'+
      '<g class="part armL" style="transform-origin:77px 95px"><rect x="69" y="95" width="11" height="50" rx="5.5" fill="'+shirtD+'"/><circle cx="74.5" cy="148" r="6" fill="'+skin+'"/>'+musMarks('armL',pri,sec)+'</g>'+
      '<g class="part armR" style="transform-origin:123px 95px"><rect x="120" y="95" width="11" height="50" rx="5.5" fill="'+shirtD+'"/><circle cx="125.5" cy="148" r="6" fill="'+skin+'"/>'+musMarks('armR',pri,sec)+'</g>'+
      '<path d="M75,94 Q100,86 125,94 L119,152 Q100,160 81,152 Z" fill="url(#cgs)"/>'+musMarks('fig',pri,sec)+
      '<rect x="94" y="78" width="12" height="13" rx="4" fill="'+skin+'"/>'+
      '<circle cx="100" cy="66" r="18" fill="'+skin+'"/>'+
      hairTop+
      '<circle cx="93" cy="66" r="2" fill="#222"/><circle cx="107" cy="66" r="2" fill="#222"/>'+
      '<path d="M95,73 Q100,76 105,73" stroke="#b9805f" stroke-width="1.5" fill="none" stroke-linecap="round"/>'+
    '</g></svg>';
}
