import type { GameState } from '../core/GameState';
import type { BehaviorProfile } from '../core/types';
import type { LocalizedText } from '../data/dialogue';

/**
 * "The floor begins to remember you."
 *
 * Turns the behaviour profile the mimic already collects into something the
 * player can read. Nothing here is generated text in the machine-learning
 * sense — every line is authored, and this module only picks which one the
 * evidence supports and fills in the blanks.
 */

export interface RememberedNote {
  /** Short enough to fit the slip pinned to the corridor board. */
  board: LocalizedText;
  title: LocalizedText;
  body: LocalizedText;
}

const ROOM_NAMES: Record<string, LocalizedText> = {
  corridor: { he: 'המסדרון', en: 'the corridor' },
  elevator: { he: 'המעלית', en: 'the lift' },
  apt01: { he: 'דירה 01', en: 'apartment 01' },
  apt02hall: { he: 'דירה 02', en: 'apartment 02' },
  apt02kids: { he: 'חדר הילדים', en: "the children's room" },
  apt03: { he: 'דירה 03', en: 'apartment 03' },
  apt04: { he: 'דירה 04', en: 'apartment 04' },
  alcove: { he: 'הגומחה', en: 'the alcove' },
  service: { he: 'חדר השירות', en: 'the service room' },
  control: { he: 'חדר הבקרה', en: 'the control room' },
};

const DOOR_NAMES: Record<string, LocalizedText> = {
  door_apt01: { he: 'הדלת של 01', en: 'the door of 01' },
  door_apt02: { he: 'הדלת של 02', en: 'the door of 02' },
  door_apt03: { he: 'הדלת של 03', en: 'the door of 03' },
  door_apt04a: { he: 'הדלת של 04', en: 'the door of 04' },
  door_apt04b: { he: 'הדלת השנייה של 04', en: 'the second door of 04' },
  door_alcove: { he: 'דלת הגומחה', en: 'the alcove door' },
  door_service: { he: 'דלת השירות', en: 'the service door' },
  door_control: { he: 'דלת הבקרה', en: 'the control door' },
};

function topKey(table: Record<string, number>, ignore: string[] = []): string | null {
  let best: string | null = null;
  let bestValue = 0;
  for (const [key, value] of Object.entries(table)) {
    if (ignore.includes(key)) continue;
    if (value > bestValue) {
      bestValue = value;
      best = key;
    }
  }
  return best;
}

function fill(text: LocalizedText, value: LocalizedText | string): LocalizedText {
  const he = typeof value === 'string' ? value : value.he;
  const en = typeof value === 'string' ? value : value.en;
  return { he: text.he.replace('{0}', he), en: text.en.replace('{0}', en) };
}

/** Everything the floor could plausibly say, given what it has watched. */
function candidates(behavior: BehaviorProfile, notesRead: number): RememberedNote[] {
  const list: RememberedNote[] = [];

  const room = topKey(behavior.roomDwell, ['corridor', 'elevator', '']);
  if (room && ROOM_NAMES[room]) {
    const name = ROOM_NAMES[room];
    list.push({
      board: fill({ he: 'אתה חוזר אל {0}.', en: 'You keep returning to {0}.' }, name),
      title: { he: 'לוח מודעות — הודעה חדשה', en: 'Notice board — new message' },
      body: fill(
        {
          he: 'הדייר מבלה את רוב זמנו ב{0}.\nהוא נכנס לשם גם כשאין לו סיבה.\n\nאנחנו יודעים לאן הוא ילך בפעם הבאה.',
          en: 'The occupant spends most of his time in {0}.\nHe goes in even when he has no reason to.\n\nWe know where he will go next.',
        },
        name,
      ),
    });
  }

  const door = topKey(behavior.doorUse);
  if (door && DOOR_NAMES[door]) {
    const name = DOOR_NAMES[door];
    list.push({
      board: fill({ he: '{0} נפתחת יותר מדי.', en: '{0} opens too often.' }, name),
      title: { he: 'לוח מודעות — תחזוקה', en: 'Notice board — maintenance' },
      body: fill(
        {
          he: 'רשמנו כמה פעמים נפתחה {0}.\nהמספר גדל בכל ביקור, גם בביקורים שלא נרשמו.\n\nהצירים ייבדקו. הדייר לא.',
          en: 'We logged how often {0} was opened.\nThe count grows every visit, including the visits that were never logged.\n\nThe hinges will be inspected. The occupant will not.',
        },
        name,
      ),
    });
  }

  if (Math.abs(behavior.junctionBias) > 0.15) {
    const east = behavior.junctionBias > 0;
    list.push({
      board: east
        ? { he: 'אתה תמיד פונה מזרחה.', en: 'You always turn east.' }
        : { he: 'אתה תמיד חוזר מערבה.', en: 'You always turn back west.' },
      title: { he: 'לוח מודעות — תנועה', en: 'Notice board — movement' },
      body: east
        ? {
            he: 'בכל צומת במסדרון הוא בוחר להתרחק מהמעלית.\nגם כשהמטרה מאחוריו.\n\nזה נוח לנו.',
            en: 'At every junction he chooses to walk away from the lift.\nEven when the objective is behind him.\n\nThat suits us.',
          }
        : {
            he: 'בכל צומת במסדרון הוא בוחר לחזור אל המעלית.\nהוא מודד את המרחק הביתה בלי לשים לב.\n\nאין בית.',
            en: 'At every junction he chooses to head back toward the lift.\nHe measures the distance home without noticing.\n\nThere is no home.',
          },
    });
  }

  if (behavior.observations > 40) {
    const fast = behavior.averageSpeed > 2.1;
    list.push({
      board: fast
        ? { he: 'אתה ממהר יותר מאתמול.', en: 'You move faster than yesterday.' }
        : { he: 'אתה מאט. שמנו לב.', en: 'You are slowing down. We noticed.' },
      title: { he: 'לוח מודעות — קצב', en: 'Notice board — pace' },
      body: fast
        ? {
            he: 'מהירות ההליכה הממוצעת שלו עלתה.\nזה קורה לכולם, בערך בשלב הזה.\n\nזה לא עוזר.',
            en: 'His average walking speed has gone up.\nThey all do this, around now.\n\nIt does not help.',
          }
        : {
            he: 'מהירות ההליכה הממוצעת שלו ירדה.\nהוא עוצר לפני פינות. הוא לא עשה את זה בהתחלה.\n\nהוא לומד. גם אנחנו.',
            en: 'His average walking speed has dropped.\nHe stops before corners now. He did not at first.\n\nHe is learning. So are we.',
          },
    });
  }

  if (notesRead >= 3) {
    list.push({
      board: { he: 'קראת את כל מה שהשארנו.', en: 'You read everything we left.' },
      title: { he: 'לוח מודעות — קריאה', en: 'Notice board — reading' },
      body: {
        he: 'הוא קורא כל פתק, גם את אלה שאין בהם מידע.\nהפתקים לא נכתבו בשבילו.\nהם נכתבו כדי לראות מי עוצר לקרוא אותם.',
        en: 'He reads every note, including the ones with nothing in them.\nThe notes were not written for him.\nThey were written to see who stops to read them.',
      },
    });
  }

  return list;
}

/** The generic line, used until the profile has anything to say. */
const FALLBACK: RememberedNote = {
  board: { he: 'הקומה רשמה את הביקור.', en: 'The floor logged your visit.' },
  title: { he: 'לוח מודעות — יומן ביקורים', en: 'Notice board — visitor log' },
  body: {
    he: 'ביקור נרשם.\nשעה: 00:17.\nאותה שעה כמו בכל שאר הביקורים.\n\nהדייר אינו מודע לכך שהיה כאן קודם.',
    en: 'Visit logged.\nTime: 00:17.\nThe same time as every other visit.\n\nThe occupant is unaware that he has been here before.',
  },
};

/**
 * The line the board rewrites itself with mid-visit: it names the room the
 * player is standing in right now, which is a different trick from the notice
 * that greets them when the doors open.
 */
export function rememberedRoomLine(roomId: string): LocalizedText {
  const name = ROOM_NAMES[roomId];
  if (!name) return { he: 'אנחנו יודעים איפה אתה.', en: 'We know where you are.' };
  return fill({ he: 'הוא נמצא כרגע ב{0}.', en: 'He is in {0} right now.' }, name);
}

/**
 * Picks the message for this visit. The choice walks through the eligible lines
 * so a player who rides the lift six times reads six different things.
 */
export function rememberedNote(state: GameState): RememberedNote {
  const list = candidates(state.behavior, state.run.notesRead.length);
  if (list.length === 0) return FALLBACK;
  const step = Math.max(0, state.run.visit - 1);
  return list[step % list.length];
}
