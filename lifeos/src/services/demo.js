/*
 * demo.js — a worked example, not a screenshot.
 *
 * §171 asks for at least a week of history, and the reason is specific: an
 * empty analytics screen teaches nobody anything about what the app does.
 * Somebody evaluating LifeOS wants to see the time-allocation chart with time
 * in it, the estimate calibration having actually calibrated, a project whose
 * health says "at risk" because it genuinely is, and a weekly review with
 * eighteen real completions behind it.
 *
 * SO NOTHING HERE IS A DISPLAYED NUMBER.
 *
 * §172 and §188 rule out the easy version — writing "18 משימות הושלמו" onto a
 * review record. Instead this seeds the same records real use would produce:
 * tasks with completedAt, focus sessions with durations, habit completions,
 * activity events with backdated timestamps. Every statistic on every screen
 * is then derived by the same code path as for a real account, which means the
 * demo also serves as a test — if the analytics are wrong, the demo shows them
 * wrong rather than hiding it behind a constant.
 *
 * The one deliberate distortion: the estimates are seeded to run about 35%
 * light, because that is the finding §53 describes and a demo where nothing
 * has been learned demonstrates nothing. It is seeded as data, not as a
 * conclusion — learn.js derives the 35% itself, or does not, depending on
 * whether the numbers really say so.
 */

import * as db from '../core/db.js';
import { invalidate, updateProfile, updatePreferences } from './core.js';
import * as session from '../core/session.js';
import { today as todayIso, addDays, instantAt, dayOfWeek, isoDay } from '../core/time.js';
import { learn } from './memory.js';

/* A stable pseudo-random source. The demo must look the same every time it is
 * loaded — a support conversation about "the number on my screen" is
 * impossible when the numbers are different on every machine. */
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const AREAS = [
  { key: 'study', title: 'לימודים', color: 'area-2' },
  { key: 'code', title: 'תכנות', color: 'area-1' },
  { key: 'fitness', title: 'כושר', color: 'area-5' },
  { key: 'personal', title: 'פרויקטים אישיים', color: 'area-3' },
];

/* ------------------------------------------------------------------ *
 * The seed
 * ------------------------------------------------------------------ */

export function seedDemo(opts) {
  const o = opts || {};
  const rand = seededRandom(20260814);
  const today = todayIso();

  return db.batch(() => {
    if (o.replace) db.wipe();

    /* -- preferences and profile ---------------------------------- */
    updateProfile({
      displayName: o.displayName || 'אלכס',
      planningStyle: 'balanced',
      dailyCapacityMinutes: 240,
      helpWith: ['organize', 'focus', 'projects'],
      onboardedAt: Date.now(),
    });
    updatePreferences({
      workStartMinutes: 8 * 60,
      workEndMinutes: 22 * 60,
      focusWindowStart: 16 * 60,
      focusWindowEnd: 19 * 60,
      dailyCapacityMinutes: 240,
      bufferPct: 15,
      restDays: [6],
    });

    /* -- areas ---------------------------------------------------- */
    const area = {};
    AREAS.forEach((a, i) => {
      area[a.key] = db.insert('areas', { title: a.title, color: a.color, order: i, icon: 'area' });
    });

    /* -- goals ---------------------------------------------------- */
    const goalSite = db.insert('goals', {
      title: 'להשיק אתר תיק עבודות',
      description: 'אתר שאפשר לשלוח למעסיק במקום קורות חיים.',
      areaId: area.personal.id,
      type: 'outcome',
      status: 'active',
      priority: 5,
      startDate: addDays(today, -21),
      targetDate: addDays(today, 18),
      successDefinition: 'האתר באוויר, יש בו שלושה פרויקטים, והוא נראה טוב בטלפון.',
      motivation: 'כדי שיהיה מה להראות כשמישהו שואל מה עשיתי.',
      progressSource: 'milestones',
      confidence: 65,
    });

    const goalJs = db.insert('goals', {
      title: 'להשתפר ב־JavaScript',
      areaId: area.code.id,
      type: 'improvement',
      status: 'active',
      priority: 4,
      startDate: addDays(today, -30),
      targetDate: addDays(today, 60),
      successDefinition: 'לכתוב פיצ׳ר שלם בלי לחפש כל שורה.',
      motivation: 'זה מה שחוסם אותי בכל פרויקט.',
      progressSource: 'tasks',
      confidence: 55,
    });

    const goalStudy = db.insert('goals', {
      title: 'לבנות שגרת לימודים',
      areaId: area.study.id,
      type: 'maintenance',
      status: 'active',
      priority: 3,
      startDate: addDays(today, -14),
      successDefinition: 'ארבעה ימים בשבוע, בלי להילחם בזה.',
      progressSource: 'manual',
      progressManual: 45,
      confidence: 70,
    });

    const goalBooks = db.insert('goals', {
      title: 'לקרוא 12 ספרים השנה',
      areaId: area.personal.id,
      type: 'metric',
      status: 'active',
      priority: 2,
      targetDate: `${today.slice(0, 4)}-12-31`,
      progressSource: 'metric',
      metricTarget: 12,
      metricCurrent: 5,
      metricUnit: 'ספרים',
      confidence: 60,
    });

    /* -- projects ------------------------------------------------- */
    const pSite = db.insert('projects', {
      title: 'אתר תיק עבודות',
      description: 'העיצוב והפיתוח של האתר עצמו.',
      goalId: goalSite.id,
      areaId: area.personal.id,
      status: 'active',
      priority: 5,
      startDate: addDays(today, -21),
      dueDate: addDays(today, 18),
      estimatedMinutes: 1500,
      order: 0,
    });

    /*
     * Deliberately behind, and behind for a reason the rest of the demo tells:
     * the exam is in three days, there is more revision left than there are
     * hours to do it in, and that is because the website has been eating the
     * afternoons. health.js works that out on its own from the estimates and
     * the calendar — nothing here says "at risk".
     *
     * A demo where every project is green demonstrates none of the machinery
     * that matters, and a demo that fakes a red badge demonstrates less.
     */
    const pExam = db.insert('projects', {
      title: 'הכנה למבחן במתמטיקה',
      goalId: goalStudy.id,
      areaId: area.study.id,
      status: 'active',
      priority: 4,
      startDate: addDays(today, -10),
      dueDate: addDays(today, 3),
      estimatedMinutes: 900,
      order: 1,
    });

    const pJs = db.insert('projects', {
      title: 'מסלול JavaScript',
      goalId: goalJs.id,
      areaId: area.code.id,
      status: 'active',
      priority: 3,
      startDate: addDays(today, -30),
      estimatedMinutes: 1200,
      order: 2,
    });

    /* -- milestones ----------------------------------------------- */
    const msSite = [
      { title: 'האפיון הושלם', done: addDays(today, -18) },
      { title: 'העיצוב הושלם', done: addDays(today, -8) },
      { title: 'הפיתוח הושלם', done: null },
      { title: 'הבדיקות הושלמו', done: null },
      { title: 'האתר עלה לאוויר', done: null },
    ].map((m, i) => db.insert('milestones', {
      projectId: pSite.id,
      title: m.title,
      order: i,
      targetDate: addDays(today, -21 + (i + 1) * 8),
      completedAt: m.done ? instantAt(m.done, 18 * 60) : null,
    }));

    [
      { title: 'החומר ממופה', done: addDays(today, -7) },
      { title: 'הסיכומים מוכנים', done: null },
      { title: 'פתרון מבחנים קודמים', done: null },
    ].forEach((m, i) => db.insert('milestones', {
      projectId: pExam.id,
      title: m.title,
      order: i,
      targetDate: addDays(today, -10 + (i + 1) * 5),
      completedAt: m.done ? instantAt(m.done, 20 * 60) : null,
    }));

    /* -- tasks ---------------------------------------------------- */
    function task(fields) {
      return db.insert('tasks', Object.assign({
        status: 'ready',
        importance: 3,
        urgency: 3,
        goalImpact: 3,
        difficulty: 3,
        energyLevel: 'normal',
        estimatedMinutes: 30,
        actualMinutes: 0,
        tags: [],
        recurrenceDays: [],
        someday: false,
        recurrence: 'none',
        postponeCount: 0,
        order: 0,
      }, fields));
    }

    /* The open work on the site, in dependency order. */
    const tNav = task({
      title: 'לתקן את הניווט במובייל',
      projectId: pSite.id,
      goalId: goalSite.id,
      areaId: area.personal.id,
      milestoneId: msSite[2].id,
      importance: 4, urgency: 4, goalImpact: 5,
      energyLevel: 'deep',
      estimatedMinutes: 35,
      status: 'ready',
    });

    const tHome = task({
      title: 'לסיים את עמוד הבית',
      projectId: pSite.id,
      goalId: goalSite.id,
      areaId: area.personal.id,
      milestoneId: msSite[2].id,
      importance: 5, urgency: 4, goalImpact: 5,
      energyLevel: 'deep',
      estimatedMinutes: 90,
      status: 'in_progress',
      actualMinutes: 45,
    });

    const tTests = task({
      title: 'לבדוק את האתר בדפדפנים ובטלפון',
      projectId: pSite.id,
      goalId: goalSite.id,
      areaId: area.personal.id,
      milestoneId: msSite[3].id,
      importance: 4, urgency: 3, goalImpact: 4,
      estimatedMinutes: 60,
      dueDate: addDays(today, 3),
    });

    const tDeploy = task({
      title: 'להעלות את האתר לאוויר',
      projectId: pSite.id,
      goalId: goalSite.id,
      areaId: area.personal.id,
      milestoneId: msSite[4].id,
      importance: 5, urgency: 3, goalImpact: 5,
      estimatedMinutes: 45,
      dueDate: addDays(today, 16),
    });

    /* עיצוב → פיתוח → בדיקות → השקה, exactly the chain from §24. */
    db.insert('taskDependencies', { taskId: tTests.id, dependsOnId: tNav.id });
    db.insert('taskDependencies', { taskId: tTests.id, dependsOnId: tHome.id });
    db.insert('taskDependencies', { taskId: tDeploy.id, dependsOnId: tTests.id });

    task({
      title: 'לכתוב את הטקסטים לעמוד "עליי"',
      projectId: pSite.id, goalId: goalSite.id, areaId: area.personal.id,
      importance: 3, urgency: 2, goalImpact: 3,
      estimatedMinutes: 45,
    });
    task({
      title: 'לבחור שלושה פרויקטים להציג',
      projectId: pSite.id, goalId: goalSite.id, areaId: area.personal.id,
      importance: 4, urgency: 2, goalImpact: 4,
      estimatedMinutes: 25,
      energyLevel: 'light',
    });

    /* The exam project — genuinely more revision than there are hours left. */
    task({
      title: 'לכתוב סיכום לפרק על נגזרות',
      projectId: pExam.id, goalId: goalStudy.id, areaId: area.study.id,
      importance: 5, urgency: 5, goalImpact: 4,
      energyLevel: 'deep',
      estimatedMinutes: 120,
      dueDate: addDays(today, 1),
      scheduledDate: today,
    });
    task({
      title: 'לפתור מבחן משנה שעברה',
      projectId: pExam.id, goalId: goalStudy.id, areaId: area.study.id,
      importance: 5, urgency: 4, goalImpact: 5,
      energyLevel: 'deep',
      estimatedMinutes: 150,
      dueDate: addDays(today, 2),
    });
    task({
      title: 'לעבור על הטעויות מהמבחן',
      projectId: pExam.id, goalId: goalStudy.id, areaId: area.study.id,
      importance: 4, urgency: 4, goalImpact: 4,
      estimatedMinutes: 90,
      dueDate: addDays(today, 3),
    });
    task({
      title: 'חזרה על אינטגרלים',
      projectId: pExam.id, goalId: goalStudy.id, areaId: area.study.id,
      importance: 4, urgency: 4, goalImpact: 3,
      energyLevel: 'deep',
      estimatedMinutes: 120,
      dueDate: addDays(today, 3),
    });
    task({
      title: 'חזרה על טורים',
      projectId: pExam.id, goalId: goalStudy.id, areaId: area.study.id,
      importance: 4, urgency: 4, goalImpact: 3,
      energyLevel: 'deep',
      estimatedMinutes: 120,
      dueDate: addDays(today, 3),
    });
    task({
      title: 'לפתור מבחן נוסף בתנאי מבחן',
      projectId: pExam.id, goalId: goalStudy.id, areaId: area.study.id,
      importance: 5, urgency: 4, goalImpact: 5,
      energyLevel: 'deep',
      estimatedMinutes: 150,
      dueDate: addDays(today, 3),
    });
    task({
      title: 'לסכם את דף הנוסחאות',
      projectId: pExam.id, goalId: goalStudy.id, areaId: area.study.id,
      importance: 3, urgency: 4, goalImpact: 2,
      energyLevel: 'light',
      estimatedMinutes: 60,
      dueDate: addDays(today, 3),
    });

    /* A task that keeps sliding — this is what §137 detects. */
    task({
      title: 'לסדר את התיקייה של הפרויקטים הישנים',
      projectId: pJs.id, goalId: goalJs.id, areaId: area.code.id,
      importance: 2, urgency: 1, goalImpact: 1,
      energyLevel: 'light',
      estimatedMinutes: 30,
      postponeCount: 6,
      scheduledDate: today,
    });

    task({
      title: 'לסיים את הפרק על async/await',
      projectId: pJs.id, goalId: goalJs.id, areaId: area.code.id,
      importance: 4, urgency: 2, goalImpact: 5,
      energyLevel: 'deep',
      estimatedMinutes: 60,
    });
    task({
      title: 'לכתוב תרגיל על Promises',
      projectId: pJs.id, goalId: goalJs.id, areaId: area.code.id,
      importance: 3, urgency: 2, goalImpact: 4,
      energyLevel: 'deep',
      estimatedMinutes: 45,
    });

    /* A blocked-on-a-person task, so 'waiting' is visible. */
    task({
      title: 'לקבל את הלוגו מדנה',
      projectId: pSite.id, goalId: goalSite.id, areaId: area.personal.id,
      status: 'waiting',
      waitingFor: 'תשובה מדנה',
      importance: 3, urgency: 3, goalImpact: 2,
      estimatedMinutes: 10,
    });

    /* Inbox items, unfiled on purpose. */
    task({ title: 'לבדוק אם צריך לחדש את הדומיין', status: 'inbox', estimatedMinutes: 15, energyLevel: 'light' });
    task({ title: 'רעיון: להוסיף עמוד עם ההמלצות', status: 'inbox', estimatedMinutes: 25 });
    task({ title: 'לקבוע תור לרופא שיניים', status: 'inbox', estimatedMinutes: 10, energyLevel: 'light' });

    /* Someday. */
    task({ title: 'ללמוד Blender', someday: true, status: 'inbox', areaId: area.personal.id, estimatedMinutes: 60 });
    task({ title: 'לבנות משחק קטן', someday: true, status: 'inbox', areaId: area.code.id, estimatedMinutes: 90 });

    /* A short quick win, so the Today screen's quick-wins section is real. */
    task({
      title: 'לענות למייל של המרצה',
      areaId: area.study.id,
      importance: 3, urgency: 4, goalImpact: 1,
      energyLevel: 'light',
      estimatedMinutes: 10,
    });

    /* A recurring task, distinct from a habit. */
    task({
      title: 'לשלוח דוח שבועי',
      areaId: area.study.id,
      recurrence: 'weekly',
      recurrenceDays: [0],
      estimatedMinutes: 20,
      energyLevel: 'light',
      importance: 3, urgency: 3,
      scheduledDate: nextDow(today, 0),
    });

    /* -- habits --------------------------------------------------- */
    const hRead = db.insert('habits', {
      title: 'לקרוא',
      areaId: area.personal.id,
      frequency: 'daily',
      target: 7,
      days: [],
      preferredTime: 22 * 60,
      regularVersion: 'לקרוא 30 דקות',
      minimumVersion: 'לקרוא 5 דקות',
      estimatedMinutes: 30,
      status: 'active',
      order: 0,
    });

    const hTrain = db.insert('habits', {
      title: 'אימון',
      areaId: area.fitness.id,
      frequency: 'weekly',
      target: 3,
      days: [],
      preferredTime: 18 * 60,
      regularVersion: 'אימון מלא',
      minimumVersion: 'עשרים דקות הליכה',
      estimatedMinutes: 45,
      status: 'active',
      order: 1,
    });

    const hStudy = db.insert('habits', {
      title: 'ללמוד',
      areaId: area.study.id,
      frequency: 'specific_days',
      target: 4,
      days: [0, 1, 2, 3],
      preferredTime: 17 * 60,
      regularVersion: 'ללמוד שעה',
      minimumVersion: 'ללמוד 10 דקות',
      estimatedMinutes: 60,
      status: 'active',
      order: 2,
    });

    /* -- routine -------------------------------------------------- */
    db.insert('routines', {
      title: 'שגרת ערב',
      areaId: area.personal.id,
      preferredTime: 21 * 60 + 30,
      order: 0,
      steps: [
        { id: 's1', title: 'לסדר את תיבת הקליטה', minutes: 5, optional: false },
        { id: 's2', title: 'לעבור על מה שלא הושלם', minutes: 5, optional: false },
        { id: 's3', title: 'לתכנן את מחר', minutes: 10, optional: false },
        { id: 's4', title: 'לקרוא', minutes: 20, optional: true },
      ],
    });

    /* -- calendar ------------------------------------------------- */
    /* Real fixed commitments, so the free-window arithmetic has something to
     * work around and the "אירוע קבוע — ללא שינוי" line in the replan preview
     * has something to point at. */
    for (let i = -7; i <= 14; i += 1) {
      const day = addDays(today, i);
      const dow = dayOfWeek(day);
      if (dow === 0 || dow === 2) {
        db.insert('events', {
          title: 'שיעור מתמטיקה',
          date: day,
          startMinutes: 18 * 60,
          endMinutes: 19 * 60 + 30,
          allDay: false,
          areaId: area.study.id,
          source: 'local',
        });
      }
      if (dow === 3) {
        db.insert('events', {
          title: 'אימון בחדר כושר',
          date: day,
          startMinutes: 19 * 60,
          endMinutes: 20 * 60,
          allDay: false,
          areaId: area.fitness.id,
          source: 'local',
        });
      }
    }
    db.insert('events', {
      title: 'פגישה עם דנה על העיצוב',
      date: addDays(today, 1),
      startMinutes: 11 * 60,
      endMinutes: 12 * 60,
      allDay: false,
      areaId: area.personal.id,
      source: 'local',
    });

    /* Today's blocks, so the timeline is not empty on first open. */
    db.insert('blocks', {
      date: today,
      startMinutes: 16 * 60,
      endMinutes: 17 * 60 + 30,
      taskId: tHome.id,
      kind: 'flexible',
      createdBy: 'USER',
    });
    db.update('tasks', tHome.id, {
      scheduledDate: today, scheduledStart: 16 * 60, scheduledEnd: 17 * 60 + 30,
    });

    /* -- history: the last fourteen days -------------------------- */
    seedHistory({
      today, rand, area, goals: { goalSite, goalJs, goalStudy },
      projects: { pSite, pExam, pJs },
      habits: { hRead, hTrain, hStudy },
    });

    /* -- notes ---------------------------------------------------- */
    db.insert('notes', {
      title: 'מה דנה אמרה על העיצוב',
      body: 'הכותרת גדולה מדי בטלפון. הצבע של הכפתורים בסדר. להוריד את האנימציה בכניסה.',
      type: 'meeting',
      projectId: pSite.id,
      areaId: area.personal.id,
      tags: [],
      pinned: false,
    });
    db.insert('notes', {
      title: 'למה async/await לא עבד לי',
      body: 'שכחתי ש־forEach לא מחכה. צריך for...of או Promise.all.',
      type: 'learning',
      projectId: pJs.id,
      areaId: area.code.id,
      tags: [],
      pinned: true,
    });
    db.insert('notes', {
      title: 'רעיון לעמוד הבית',
      body: 'במקום "עליי" בהתחלה — קודם שלושה פרויקטים, ואז מי אני.',
      type: 'idea',
      projectId: pSite.id,
      tags: [],
      pinned: false,
    });

    invalidate();

    /* Derive the memories from the history that was just written, rather than
     * writing memories directly. If learn.js does not find enough evidence,
     * the memory screen stays empty — which is the honest outcome and the one
     * a real account would get. */
    learn({ force: true });
    invalidate();

    return { ok: true };
  });
}

function nextDow(fromIso, targetDow) {
  const current = dayOfWeek(fromIso);
  const delta = (targetDow - current + 7) % 7;
  return addDays(fromIso, delta === 0 ? 7 : delta);
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

/**
 * Two weeks of completions, focus sessions and habit ticks.
 *
 * Written as records plus backdated activity events, because that is what the
 * analytics read. db.logEvent stamps Date.now(), so the events are inserted
 * directly with the timestamp they belong to — the one place in the app that
 * bypasses logEvent, and it is doing so precisely to avoid inventing the
 * numbers the log is supposed to produce.
 */
function seedHistory(ctx) {
  const { today, rand, area, projects, habits } = ctx;

  const DONE_TASKS = [
    { title: 'לאפיין את מבנה האתר', project: 'pSite', minutes: 60, actual: 85, day: -18, energy: 'deep' },
    { title: 'לבחור פלטת צבעים', project: 'pSite', minutes: 30, actual: 40, day: -16, energy: 'normal' },
    { title: 'לעצב את עמוד הבית', project: 'pSite', minutes: 90, actual: 130, day: -12, energy: 'deep' },
    { title: 'לעצב את עמוד הפרויקטים', project: 'pSite', minutes: 60, actual: 75, day: -10, energy: 'deep' },
    { title: 'להקים את הפרויקט', project: 'pSite', minutes: 45, actual: 50, day: -8, energy: 'normal' },
    { title: 'לבנות את התפריט', project: 'pSite', minutes: 60, actual: 95, day: -6, energy: 'deep' },
    { title: 'לבנות את הפוטר', project: 'pSite', minutes: 25, actual: 30, day: -6, energy: 'light' },
    { title: 'לחבר את הטופס', project: 'pSite', minutes: 45, actual: 70, day: -4, energy: 'deep' },
    { title: 'למפות את החומר למבחן', project: 'pExam', minutes: 45, actual: 55, day: -7, energy: 'normal' },
    { title: 'לסכם את הפרק על גבולות', project: 'pExam', minutes: 60, actual: 90, day: -5, energy: 'deep' },
    { title: 'לפתור תרגילים על גבולות', project: 'pExam', minutes: 45, actual: 60, day: -3, energy: 'deep' },
    { title: 'לסמן את הנושאים החלשים', project: 'pExam', minutes: 25, actual: 25, day: -2, energy: 'light' },
    { title: 'לקרוא על closures', project: 'pJs', minutes: 45, actual: 55, day: -13, energy: 'deep' },
    { title: 'לתרגל closures', project: 'pJs', minutes: 45, actual: 70, day: -11, energy: 'deep' },
    { title: 'לקרוא על Promises', project: 'pJs', minutes: 45, actual: 60, day: -9, energy: 'deep' },
    { title: 'לסדר את קובץ ההערות', project: null, minutes: 15, actual: 15, day: -9, energy: 'light' },
    { title: 'לענות למיילים', project: null, minutes: 20, actual: 25, day: -5, energy: 'light' },
    { title: 'להזמין ספר', project: null, minutes: 10, actual: 10, day: -4, energy: 'light' },
    { title: 'לעדכן את קורות החיים', project: null, minutes: 30, actual: 45, day: -2, energy: 'normal' },
    { title: 'לבדוק את הטופס בטלפון', project: 'pSite', minutes: 20, actual: 25, day: -1, energy: 'light' },
  ];

  for (const spec of DONE_TASKS) {
    const day = addDays(today, spec.day);
    const project = spec.project ? projects[spec.project] : null;
    const finishedAt = instantAt(day, 17 * 60 + Math.floor(rand() * 240));

    const record = db.insert('tasks', {
      title: spec.title,
      projectId: project ? project.id : null,
      goalId: project ? project.goalId : null,
      areaId: project ? project.areaId : area.personal.id,
      status: 'done',
      importance: 3, urgency: 3, goalImpact: project ? 4 : 2,
      difficulty: 3,
      energyLevel: spec.energy,
      estimatedMinutes: spec.minutes,
      actualMinutes: spec.actual,
      scheduledDate: day,
      completedAt: finishedAt,
      tags: [], recurrenceDays: [], recurrence: 'none',
      someday: false, postponeCount: 0, order: 0,
    });

    db.insert('activity', {
      type: 'TASK_COMPLETED',
      actor: 'USER',
      at: finishedAt,
      payload: {
        taskId: record.id,
        title: record.title,
        projectId: record.projectId,
        goalId: record.goalId,
        minutes: spec.actual,
      },
    });

    /* The focus session that produced the actual time. This is what makes the
     * estimate calibration real: actual/estimated across twenty finished tasks
     * averages about 1.35, and learn.js finds that on its own. */
    const startMinutes = 16 * 60 + Math.floor(rand() * 180);
    db.insert('focusSessions', {
      taskId: record.id,
      title: record.title,
      kind: spec.energy === 'deep' ? 'deep' : 'light',
      plannedMinutes: spec.minutes,
      actualMinutes: spec.actual,
      startedAt: instantAt(day, startMinutes),
      endedAt: instantAt(day, startMinutes) + spec.actual * 60000,
      startMinutes,
      outcome: 'done',
      note: '',
      date: day,
      pauses: [],
    });

    db.insert('activity', {
      type: 'FOCUS_COMPLETED',
      actor: 'USER',
      at: instantAt(day, startMinutes) + spec.actual * 60000,
      payload: { taskId: record.id, title: record.title, minutes: spec.actual, outcome: 'done' },
    });
  }

  /* Milestone completions in the log, so the weekly review counts them. */
  for (const spec of [{ title: 'האפיון הושלם', day: -18 }, { title: 'העיצוב הושלם', day: -8 }]) {
    db.insert('activity', {
      type: 'MILESTONE_COMPLETED',
      actor: 'USER',
      at: instantAt(addDays(today, spec.day), 18 * 60),
      payload: { title: spec.title, projectId: projects.pSite.id },
    });
  }

  /* Habit history. Reading is nearly daily with two minimum days and two
   * misses; training hits its three-a-week most weeks; studying follows its
   * four declared days with a couple of gaps. A perfect record would make the
   * completion rates meaningless. */
  for (let i = 27; i >= 0; i -= 1) {
    const day = addDays(today, -i);
    const dow = dayOfWeek(day);
    const roll = rand();

    if (roll > 0.14) {
      db.insert('habitCompletions', {
        habitId: ctx.habits.hRead.id,
        date: day,
        minimum: roll < 0.3,
        minutes: roll < 0.3 ? 5 : 30,
      });
    }

    if ((dow === 1 || dow === 3 || dow === 5) && rand() > 0.25) {
      db.insert('habitCompletions', {
        habitId: ctx.habits.hTrain.id,
        date: day,
        minimum: rand() < 0.2,
        minutes: 45,
      });
    }

    if ([0, 1, 2, 3].includes(dow) && rand() > 0.2) {
      db.insert('habitCompletions', {
        habitId: ctx.habits.hStudy.id,
        date: day,
        minimum: rand() < 0.25,
        minutes: 60,
      });
    }
  }

  /* A handful of reschedules, so the weekly review's "moved" figure and the
   * weekday-reliability analysis have something to read. */
  for (const spec of [{ day: -6 }, { day: -4 }, { day: -3 }, { day: -1 }]) {
    db.insert('activity', {
      type: 'TASK_RESCHEDULED',
      actor: 'USER',
      at: instantAt(addDays(today, spec.day), 21 * 60),
      payload: {
        title: 'לסדר את התיקייה של הפרויקטים הישנים',
        from: addDays(today, spec.day),
        to: addDays(today, spec.day + 1),
      },
    });
  }
}

/* ------------------------------------------------------------------ *
 * A separate demo account
 * ------------------------------------------------------------------ */

/**
 * Create a demo account and sign into it, leaving any existing account alone.
 *
 * This is what the settings screen offers: somebody with real data in LifeOS
 * should be able to look at the demo without their own account being touched.
 */
export async function createDemoAccount() {
  const stamp = Date.now().toString(36);
  await session.signUp({
    displayName: 'אלכס',
    email: `demo-${stamp}@lifeos.local`,
    password: `demo-${stamp}-demo`,
    isDemo: true,
  });
  db.load();
  invalidate();
  seedDemo({ replace: true });
  return session.currentUser();
}

export { isoDay };
