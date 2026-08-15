/* src/ex-demo.js — the exercise demonstration sheet
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
function openExDemo(name,anim,base){var p=P();var gif=(base&&typeof EXIMG!=='undefined')?EXIMG[base]:null;
  var mv=(typeof MOVE_BY_BASE!=='undefined')&&MOVE_BY_BASE[base];
  var _pri=mv?[mv.pri]:[],_sec=(mv&&mv.sec)||[];
  var vis=gif?('<div class="demorow">'+exDemo(gif,name||'')+musFigureHTML(_pri,_sec)+'</div>')
             :('<div class="machanim big">'+coachSVG(p.personal.gender,anim||'idle',_pri,_sec)+'</div>');
  openSheet('<div style="text-align:center">'+vis+'<div class="sub" style="margin:6px 0 0;font-weight:700;color:var(--teal2)">🏋️ המאמן מדגים לך</div><h2 style="margin:6px 0 2px">'+esc(name||'')+'</h2>'+
    (mv?('<div style="margin:6px 0">'+musBadge(mv.pri)+(mv.sec&&mv.sec.length?'<span class="sub" style="margin:0">גם: '+musList(mv.sec)+'</span>':'')+'</div>'):'')+
    '</div><a class="btn grad" style="width:100%;margin-top:14px;text-decoration:none" href="'+vidUrl(base,name)+'" target="_blank" rel="noopener">▶ צפה בסרטון טכניקה</a>'+
    '<button class="btn b" data-act="close" style="width:100%;margin-top:8px">סגור</button>');}
