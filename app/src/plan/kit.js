/* src/plan/kit.js — the equipment kit: what exists, what is asked for, what is defaulted
 *
 * One of the files index.html loads, in order, as plain classic scripts:
 * together they share a single global scope, exactly as the one file they
 * were split out of did. Order is load-bearing; see index.html.
 */
"use strict";
/* ---- the kit ----
   Two lists, because the question "what do you have" means something different
   in a living room and in a gym. The style decides which one you are asked. */
const KIT_BW=[
  ['bar',    ['מוט מתח','Pull-up bar','Barra de dominadas'],        '🏗️'],
  ['dip',    ['מקבילים','Dip bars','Paralelas'],                    '🤸'],
  ['rings',  ['טבעות','Gymnastic rings','Anillas'],                 '⭕'],
  ['bands',  ['גומיות התנגדות','Resistance bands','Bandas elásticas'],'🎗️'],
  ['abwheel',['גלגל בטן','Ab wheel','Rueda abdominal'],             '🎡']
];
const KIT_GYM=[
  ['barbell',   ['מוט ופלטות','Barbell and plates','Barra y discos'],'🏋️'],
  ['dumbbells', ['משקולות יד','Dumbbells','Mancuernas'],             '💪'],
  ['bench',     ['ספסל','Bench','Banco'],                            '🛋️'],
  ['machines',  ['מכונות','Machines','Máquinas'],                    '⚙️'],
  ['cables',    ['כבלים','Cables','Poleas'],                         '🪢'],
  ['kettlebell',['קטלבל','Kettlebell','Kettlebell'],                 '🔔'],
  ['weight',    ['משקל נוסף (חגורה/אפוד)','Added weight (belt or vest)','Lastre (cinturón o chaleco)'],'⚖️']
];
const KIT=KIT_BW.concat(KIT_GYM);
function kitFor(st){return st==='calisthenics'?KIT_BW:st==='gym'?KIT_GYM:KIT_BW.concat(KIT_GYM);}
/* What the user is actually asked to tick. Saying "gym" answers the equipment
   question by itself — a gym has the barbell, the dumbbells, the bench, the
   machines and the cables — so a gym is asked nothing. Hybrid is a gym plus
   whatever you own, so it is asked only about the things a gym does not put on
   the floor for you. Calisthenics is the only one where the kit is really a
   question. */
function kitAsk(st){return st==='gym'?[]
  :st==='hybrid'?KIT_BW.filter(function(k){return ['rings','bands','abwheel'].indexOf(k[0])>=0;})
  :KIT_BW;}
function kitDefault(st){return st==='calisthenics'?['bar']
  :st==='gym'?KIT_GYM.map(function(k){return k[0];})
  :['bar','dip'].concat(KIT_GYM.map(function(k){return k[0];}));}
function kitEntry(k){for(var i=0;i<KIT.length;i++)if(KIT[i][0]===k)return KIT[i];return null;}
/* A profile written before the styles existed stored no kit for a gym — the
   old model derived one from location==='gym'. Left alone it says "gym" and
   trains bodyweight, so it gets the gym it is claiming. Runs at boot, once
   the lists above exist. */
function migrateKit(){
  try{
    var p=P();if(!p||!p.workout)return;
    if(!Array.isArray(p.workout.equipment))p.workout.equipment=[];
    if(trainStyle(p)!=='calisthenics'&&!p.workout.equipment.length){
      commit(function(pp){pp.workout.equipment=kitDefault(trainStyle(pp));});
    }
  }catch(e){}
}
function equipName(k){var e=kitEntry(k);return e?L(e[1][0],e[1][1],e[1][2]):k;}
function kitEmo(k){var e=kitEntry(k);return e?e[2]:'•';}
/* A full gym is ten pieces of kit and naming them all wraps to three lines for
   no gain, so past four it says how many rather than which. */
function kitSummary(p){
  var have=haveEquip(p);
  if(!have.length)return L('משקל גוף בלבד','bodyweight only','solo peso corporal');
  if(have.length<=4)return have.map(equipName).join(' · ');
  return have.slice(0,2).map(equipName).join(' · ')+' +'+(have.length-2)+
    ' '+L('ועוד','more','más');
}
const INJURY_L={'כתפיים':['כתפיים','shoulder','hombro'],'ברכיים':['ברכיים','knee','rodilla'],
  'גב':['גב','back','espalda'],'שורש כף יד':['שורש כף יד','wrist','muñeca'],'מרפק':['מרפק','elbow','codo']};
function injuryName(h){var a=INJURY_L[h];return a?L(a[0],a[1],a[2]):h;}

