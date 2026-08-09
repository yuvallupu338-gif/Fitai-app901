/*
 * achievements.js — a record of what a player has actually done, kept in the
 * profile so it survives a run.
 *
 * They are worded so that reading the list is itself a mild spoiler-free hint
 * about what the game contains, which is what an achievement list in a game
 * about noticing things ought to be. A few are deliberately not explained
 * until they are earned.
 */

export const ACHIEVEMENTS = [
  { id: 'boarded', name: 'The Last Service', desc: 'Board the 00:47.' },
  { id: 'sat', name: 'Take a Seat', desc: 'Sit down.' },
  { id: 'walkedTrain', name: 'End to End', desc: 'Walk the whole length of the train.' },
  { id: 'firstClue', name: 'Left Behind', desc: 'Pick up something that is not yours.' },
  { id: 'halfClues', name: 'Collector', desc: 'Find half of everything there is to find.' },
  { id: 'allClues', name: 'Everything on Board', desc: 'Find all fifteen.', hiddenDesc: true },
  { id: 'alarm', name: 'Pull the Handle', desc: 'Use the emergency alarm.' },
  { id: 'noAlarm', name: 'Nobody Came', desc: 'Use the emergency alarm and find out what answers.', secret: true },
  { id: 'talkedStranger', name: 'The Far End', desc: 'Speak to the passenger nobody sits near.' },
  { id: 'strangerFive', name: 'Persistent', desc: 'Speak to him five times.' },
  { id: 'sawReflection', name: 'Not Quite', desc: 'Notice something about your reflection.' },
  { id: 'sawCamera', name: 'Under Observation', desc: 'Catch the camera doing its job too well.' },
  { id: 'mapChanged', name: 'Revised', desc: 'Read the route map after it has been corrected.' },
  { id: 'stoodStill', name: 'Nothing to Do', desc: 'Stand perfectly still for a full minute while the train moves.', secret: true },
  { id: 'rodeToEnd', name: 'Terminus', desc: 'Ride to the last stop.' },
  { id: 'everyStation', name: 'Every Door', desc: 'Stand in an open doorway at every station without getting off.' },
  { id: 'firstEnding', name: 'One Way Out', desc: 'Reach any ending.' },
  { id: 'threeEndings', name: 'Three Ways Out', desc: 'Reach three different endings.' },
  { id: 'allEndings', name: 'The Whole Timetable', desc: 'Reach every ending.' },
  { id: 'secretEnding', name: 'Out of Service', desc: 'Find out what the 00:47 is for.', secret: true },
  { id: 'nightmare', name: 'Worse', desc: 'Finish a run in Nightmare Mode.' },
  { id: 'noSit', name: 'On Your Feet', desc: 'Reach the last stop without ever sitting down.' },
  { id: 'lookedAway', name: 'Blink', desc: 'Be looking somewhere else when it happens. Fifteen times.', secret: true },
];

export function achievementById(id) {
  return ACHIEVEMENTS.find((a) => a.id === id) || null;
}

export class AchievementTracker {
  constructor(profile, events) {
    this.profile = profile;
    this.events = events;
    this.pending = [];
  }

  has(id) { return Boolean(this.profile.achievements[id]); }

  unlock(id) {
    if (this.has(id)) return false;
    const def = achievementById(id);
    if (!def) return false;
    this.profile.achievements[id] = Date.now();
    this.events.emit('achievement', def);
    return true;
  }

  /* Called after every ending so the meta-achievements catch up even for
     players who unlock things out of order. */
  reconcile(profile) {
    const endings = Object.keys(profile.endings || {});
    if (endings.length >= 1) this.unlock('firstEnding');
    if (endings.length >= 3) this.unlock('threeEndings');
    if (profile.endings?.secret) this.unlock('secretEnding');
  }
}
