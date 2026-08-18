import { Language } from '../core/types';

type Dict = Record<string, string>;

const he: Dict = {
  'game.title': 'קומה 0',
  'game.title_erased': 'קומה',
  'game.subtitle': 'קריאת שירות 0317',

  'menu.new_game': 'משחק חדש',
  'menu.continue': 'המשך',
  'menu.chapters': 'בחירת פרק',
  'menu.settings': 'הגדרות',
  'menu.endings': 'סופים שנפתחו',
  'menu.credits': 'קרדיטים',
  'menu.exit': 'יציאה',
  'menu.back': 'חזרה',
  'menu.hint_click': 'לחץ כדי להתחיל',

  'menu.exit_note':
    'הדפדפן אינו מרשה לסגור לשונית שלא נפתחה על ידי המשחק. סגור את הלשונית ידנית כדי לצאת.',

  'pause.title': 'המשחק מושהה',
  'pause.resume': 'המשך',
  'pause.settings': 'הגדרות',
  'pause.checkpoint': 'התחלה מנקודת הבדיקה',
  'pause.menu': 'חזרה לתפריט הראשי',

  'settings.title': 'הגדרות',
  'settings.tab_audio': 'שמע',
  'settings.tab_controls': 'שליטה',
  'settings.tab_video': 'תצוגה',
  'settings.tab_access': 'נגישות',
  'settings.tab_data': 'נתונים',
  'settings.master': 'עוצמת קול כללית',
  'settings.music': 'עוצמת מוזיקה',
  'settings.sfx': 'עוצמת אפקטים',
  'settings.voice': 'עוצמת קולות',
  'settings.mouse': 'רגישות עכבר',
  'settings.touch': 'רגישות מגע',
  'settings.invert_y': 'היפוך ציר אנכי',
  'settings.sprint_toggle': 'ריצה במצב החלפה (במקום החזקה)',
  'settings.fov': 'שדה ראייה',
  'settings.quality': 'איכות גרפיקה',
  'settings.quality.low': 'נמוכה',
  'settings.quality.medium': 'בינונית',
  'settings.quality.high': 'גבוהה',
  'settings.shadows': 'צללים',
  'settings.screen_fx': 'עוצמת אפקטי מסך',
  'settings.head_bob': 'תנודת מצלמה בהליכה',
  'settings.subtitles': 'כתוביות',
  'settings.subtitle_size': 'גודל כתוביות',
  'settings.size.small': 'קטן',
  'settings.size.medium': 'בינוני',
  'settings.size.large': 'גדול',
  'settings.high_contrast': 'ניגודיות גבוהה',
  'settings.reduce_motion': 'הפחתת תנועה',
  'settings.reduce_flashing': 'הפחתת הבהובי אור',
  'settings.scare': 'עוצמת בהלות',
  'settings.scare.normal': 'רגילה',
  'settings.scare.reduced': 'מופחתת',
  'settings.hints': 'רמזים נוספים בחידות',
  'settings.language': 'שפה',
  'settings.reset_save': 'איפוס שמירה',
  'settings.reset_confirm': 'למחוק את כל ההתקדמות? לא ניתן לבטל פעולה זו.',
  'settings.reset_done': 'השמירה נמחקה.',

  'common.on': 'פעיל',
  'common.off': 'כבוי',
  'common.yes': 'כן',
  'common.no': 'לא',
  'common.close': 'סגירה',
  'common.cancel': 'ביטול',
  'common.confirm': 'אישור',
  'common.locked': 'נעול',

  'hud.objective': 'מטרה',
  'hud.tab_hint': 'Tab — מטרה',
  'hud.saved': 'נשמר',

  'prompt.open': 'פתיחה',
  'prompt.close': 'סגירה',
  'prompt.use': 'הפעלה',
  'prompt.take': 'לקיחה',
  'prompt.read': 'קריאה',
  'prompt.listen': 'האזנה',
  'prompt.watch': 'צפייה',
  'prompt.turn': 'סיבוב',
  'prompt.press': 'לחיצה',
  'prompt.hide': 'הסתתרות',
  'prompt.exit': 'יציאה',
  'prompt.inspect': 'בדיקה',
  'prompt.key': 'E',
  'prompt.locked': 'נעול',

  'chapter.0': 'פרולוג — הקריאה',
  'chapter.1': 'פרק 1 — המסדרון הריק',
  'chapter.2': 'פרק 2 — החיקוי הראשון',
  'chapter.3': 'פרק 3 — הדירה עם השעונים',
  'chapter.4': 'פרק 4 — חדר הילדים',
  'chapter.5': 'פרק 5 — חדר הבקרה',

  'ending.1.name': 'יציאה',
  'ending.2.name': 'עצירת המעגל',
  'ending.3.name': 'מחיקה',
  'ending.locked': 'טרם נפתח',
  'endings.title': 'סופים שנפתחו',
  'endings.hint': 'שלושה סופים. כל אחד נבחר בחדר הבקרה.',

  'chapters.title': 'בחירת פרק',
  'chapters.locked_note': 'בחירת פרק נפתחת לאחר סיום המשחק פעם אחת.',

  'credits.title': 'קרדיטים',
  'credits.body':
    'קומה 0\n\nעיצוב, קוד, סאונד וטקסט — נוצרו במיוחד לפרויקט זה.\nכל הנכסים במשחק נוצרים בזמן ריצה: הגיאומטריה, הטקסטורות והצלילים.\nאין שימוש בנכסים חיצוניים מוגנים.\n\nמנוע: Three.js · Vite · TypeScript\nסאונד: Web Audio API\n\nתודה ששיחקת.',

  'loading.title': 'טוען',
  'loading.assets': 'בונה את הבניין',
  'loading.audio': 'מכין את מערכת השמע',
  'loading.world': 'מרכיב את הקומה',
  'loading.ready': 'מוכן',

  'error.title': 'שגיאה בטעינה',
  'error.body': 'לא ניתן היה להפעיל את המשחק בדפדפן הזה.',
  'error.webgl': 'הדפדפן אינו תומך ב־WebGL, או שהאצת החומרה מושבתת.',
  'error.reload': 'רענון',

  'mobile.rotate': 'סובב את המכשיר לרוחב',
  'mobile.rotate_sub': 'המשחק בנוי למסך רחב',

  'death.caught': 'הוא הגיע ראשון',
  'death.caught.mimic': 'הוא הגיע ראשון',
  'death.caught.crawler': 'היה חשוך מדי',
  'death.caught.tall': 'הורדת ממנו עיניים',
  'death.retry': 'חזרה לנקודת הבדיקה',

  'toast.saved': 'המשחק נשמר',
  'toast.item': 'נאסף: {0}',
  'toast.no_key': 'הדלת נעולה',
  'toast.power_off': 'אין חשמל',
  'toast.recorded': 'המערכת מקליטה',
  'toast.photo': 'תצלום {0} מתוך {1}',
  'toast.photo_all': 'כל התצלומים נאספו. משהו התפתח בחדר הבקרה.',

  'note.title': 'פתק',
  'tape.title': 'קלטת תחזוקה',
  'tape.playing': 'מנגן…',
};

const en: Dict = {
  'game.title': 'FLOOR 0',
  'game.title_erased': 'FLOOR',
  'game.subtitle': 'Service call 0317',

  'menu.new_game': 'New game',
  'menu.continue': 'Continue',
  'menu.chapters': 'Chapter select',
  'menu.settings': 'Settings',
  'menu.endings': 'Endings',
  'menu.credits': 'Credits',
  'menu.exit': 'Exit',
  'menu.back': 'Back',
  'menu.hint_click': 'Click to begin',
  'menu.exit_note': 'Browsers cannot close a tab they did not open. Close this tab to exit.',

  'pause.title': 'Paused',
  'pause.resume': 'Resume',
  'pause.settings': 'Settings',
  'pause.checkpoint': 'Restart from checkpoint',
  'pause.menu': 'Main menu',

  'settings.title': 'Settings',
  'settings.tab_audio': 'Audio',
  'settings.tab_controls': 'Controls',
  'settings.tab_video': 'Video',
  'settings.tab_access': 'Accessibility',
  'settings.tab_data': 'Data',
  'settings.master': 'Master volume',
  'settings.music': 'Music volume',
  'settings.sfx': 'Effects volume',
  'settings.voice': 'Voice volume',
  'settings.mouse': 'Mouse sensitivity',
  'settings.touch': 'Touch sensitivity',
  'settings.invert_y': 'Invert vertical axis',
  'settings.sprint_toggle': 'Sprint as toggle',
  'settings.fov': 'Field of view',
  'settings.quality': 'Graphics quality',
  'settings.quality.low': 'Low',
  'settings.quality.medium': 'Medium',
  'settings.quality.high': 'High',
  'settings.shadows': 'Shadows',
  'settings.screen_fx': 'Screen effect strength',
  'settings.head_bob': 'Head bob',
  'settings.subtitles': 'Subtitles',
  'settings.subtitle_size': 'Subtitle size',
  'settings.size.small': 'Small',
  'settings.size.medium': 'Medium',
  'settings.size.large': 'Large',
  'settings.high_contrast': 'High contrast',
  'settings.reduce_motion': 'Reduce motion',
  'settings.reduce_flashing': 'Reduce flashing',
  'settings.scare': 'Scare intensity',
  'settings.scare.normal': 'Normal',
  'settings.scare.reduced': 'Reduced',
  'settings.hints': 'Extra puzzle hints',
  'settings.language': 'Language',
  'settings.reset_save': 'Erase save',
  'settings.reset_confirm': 'Erase all progress? This cannot be undone.',
  'settings.reset_done': 'Save erased.',

  'common.on': 'On',
  'common.off': 'Off',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.locked': 'Locked',

  'hud.objective': 'Objective',
  'hud.tab_hint': 'Tab — objective',
  'hud.saved': 'Saved',

  'prompt.open': 'Open',
  'prompt.close': 'Close',
  'prompt.use': 'Use',
  'prompt.take': 'Take',
  'prompt.read': 'Read',
  'prompt.listen': 'Listen',
  'prompt.watch': 'Watch',
  'prompt.turn': 'Turn',
  'prompt.press': 'Press',
  'prompt.hide': 'Hide',
  'prompt.exit': 'Exit',
  'prompt.inspect': 'Inspect',
  'prompt.key': 'E',
  'prompt.locked': 'Locked',

  'chapter.0': 'Prologue — The Call',
  'chapter.1': 'Chapter 1 — The Empty Corridor',
  'chapter.2': 'Chapter 2 — The First Mimic',
  'chapter.3': 'Chapter 3 — The Apartment of Clocks',
  'chapter.4': "Chapter 4 — The Children's Room",
  'chapter.5': 'Chapter 5 — The Control Room',

  'ending.1.name': 'Exit',
  'ending.2.name': 'Break the loop',
  'ending.3.name': 'Erasure',
  'ending.locked': 'Not unlocked',
  'endings.title': 'Endings',
  'endings.hint': 'Three endings. Each is chosen in the control room.',

  'chapters.title': 'Chapter select',
  'chapters.locked_note': 'Chapter select unlocks after finishing the game once.',

  'credits.title': 'Credits',
  'credits.body':
    'FLOOR 0\n\nDesign, code, sound and text written for this project.\nEvery asset is generated at runtime: geometry, textures and audio.\nNo external copyrighted assets are used.\n\nEngine: Three.js · Vite · TypeScript\nAudio: Web Audio API\n\nThanks for playing.',

  'loading.title': 'Loading',
  'loading.assets': 'Building the block',
  'loading.audio': 'Preparing audio',
  'loading.world': 'Assembling the floor',
  'loading.ready': 'Ready',

  'error.title': 'Failed to start',
  'error.body': 'The game could not run in this browser.',
  'error.webgl': 'WebGL is unavailable or hardware acceleration is disabled.',
  'error.reload': 'Reload',

  'mobile.rotate': 'Rotate your device',
  'mobile.rotate_sub': 'This game is built for landscape',

  'death.caught': 'It got there first',
  'death.caught.mimic': 'It got there first',
  'death.caught.crawler': 'It was too dark',
  'death.caught.tall': 'You looked away',
  'death.retry': 'Return to checkpoint',

  'toast.saved': 'Game saved',
  'toast.item': 'Picked up: {0}',
  'toast.no_key': 'The door is locked',
  'toast.power_off': 'No power',
  'toast.recorded': 'The system is recording',
  'toast.photo': 'Photograph {0} of {1}',
  'toast.photo_all': 'Every photograph found. Something developed in the control room.',

  'note.title': 'Note',
  'tape.title': 'Maintenance tape',
  'tape.playing': 'Playing…',
};

const tables: Record<Language, Dict> = { he, en };

let current: Language = 'he';

export function setLanguage(lang: Language): void {
  current = tables[lang] ? lang : 'he';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current;
    document.documentElement.dir = current === 'he' ? 'rtl' : 'ltr';
  }
}

export function getLanguage(): Language {
  return current;
}

export function isRTL(): boolean {
  return current === 'he';
}

/** Look up a key, falling back to Hebrew then to the key itself. */
export function t(key: string, ...args: Array<string | number>): string {
  const raw = tables[current][key] ?? he[key] ?? key;
  if (args.length === 0) return raw;
  return raw.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = args[Number(index)];
    return value === undefined ? match : String(value);
  });
}

export const LANGUAGES: Language[] = ['he', 'en'];
