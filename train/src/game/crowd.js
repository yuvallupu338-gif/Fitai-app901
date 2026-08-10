/*
 * crowd.js — who is on board, and the queue of things that are waiting to be
 * true until nobody is looking.
 *
 * `queueUnobserved` is the mechanism the whole game leans on. A change is
 * described now and applied later, at the first frame where the place it
 * happens is outside the player's cone of vision or in a carriage they cannot
 * currently see into. Nothing forces it through. A player who stares at one
 * seat for four minutes will see that seat stay exactly as it is, which is
 * both correct and, after a while, considerably worse.
 */

import { carCenterZ } from '../world/dims.js';
import { CAST, EXTRA_APPEARANCES, EXTRA_COUNTS, Passenger } from './cast.js';

const VIEW_COS = Math.cos(0.95);        // a little over 50 degrees off-centre
const VIEW_RANGE = 26;

export class Crowd {
  constructor(meshes, materials, rng) {
    this.rng = rng;
    this.meshes = meshes;
    this.materials = materials;

    this.people = new Map();
    for (const def of CAST) {
      this.people.set(def.id, new Passenger(def, meshes, materials));
    }

    this.extras = [];
    for (let i = 0; i < 8; i++) {
      const look = EXTRA_APPEARANCES[i % EXTRA_APPEARANCES.length];
      const def = { id: `extra${i}`, ...look, label: 'a passenger' };
      const p = new Passenger(def, meshes, materials);
      p.present = false;
      this.extras.push(p);
    }

    this.apparition = new Passenger({
      id: 'apparition',
      body: 'tall',
      head: 'hood',
      colors: {
        coat: [0.05, 0.05, 0.06], legs: [0.04, 0.04, 0.05], shoes: [0.03, 0.03, 0.04],
        hair: [0.04, 0.04, 0.05], skin: [0.14, 0.13, 0.14],
      },
    }, meshes, materials);
    this.apparition.present = false;

    this.watcher = new Passenger({
      id: 'watcher',
      body: 'average',
      head: 'short',
      colors: {
        coat: [0.10, 0.10, 0.12], legs: [0.08, 0.08, 0.09], shoes: [0.05, 0.05, 0.06],
        hair: [0.08, 0.07, 0.07], skin: [0.55, 0.48, 0.44],
      },
    }, meshes, materials);
    this.watcher.present = false;

    this.pending = [];
    this.lookedAwayCount = 0;
  }

  get(id) { return this.people.get(id) || null; }

  all() {
    return [...this.people.values(), ...this.extras, this.apparition, this.watcher];
  }

  visiblePeople() {
    return [...this.people.values(), ...this.extras].filter((p) => p.present);
  }

  countPresent() {
    return this.all().filter((p) => p.present && p !== this.apparition).length;
  }

  /* ---- arcs ----------------------------------------------------------- */

  applyStation(index, opts = {}) {
    for (const def of CAST) {
      const state = def.arc[index];
      if (!state) continue;
      const person = this.people.get(def.id);
      if (!person) continue;
      /* An arc entry that says where somebody is sitting is also saying that
         they are on the train. Only `present: false` takes somebody off it —
         without this default, reset() clears everyone and no arc ever puts the
         six named passengers back, so the entire cast is invisible. */
      const next = { present: true, ...state };
      if (opts.immediate) person.setState(next);
      else this.queueUnobserved(person, () => person.setState(next));
    }

    const want = EXTRA_COUNTS[Math.min(index, EXTRA_COUNTS.length - 1)] ?? 0;
    const present = this.extras.filter((p) => p.present);
    if (present.length > want) {
      const leaving = present.slice(want);
      for (const p of leaving) {
        if (opts.immediate) { p.present = false; p.customPos = null; }
        else this.queueUnobserved(p, () => { p.present = false; p.customPos = null; });
      }
    } else if (present.length < want) {
      const arriving = this.extras.filter((p) => !p.present).slice(0, want - present.length);
      /*
       * Whoever is already sitting somewhere, including the named cast and the
       * extras placed earlier in this same loop. A seat was picked at random
       * with nothing stopping two people taking the same one, and two bodies
       * in one seat do not read as a crowd — they read as one passenger with
       * somebody else's coat coming through their shoulders in patches.
       */
      const taken = new Set();
      for (const q of this.all()) {
        if (q && q.present && !q.customPos) taken.add(`${q.car}:${q.seat}`);
      }
      /* The named cast move to seats their arc names, and an extra who was
         already sitting there has to give it up rather than share it. */
      const cast = new Set();
      for (const q of this.people.values()) {
        if (q.present && !q.customPos) cast.add(`${q.car}:${q.seat}`);
      }
      for (const q of this.extras) {
        if (!q.present || q.customPos || !cast.has(`${q.car}:${q.seat}`)) continue;
        let seat = this.rng.int(0, 53);
        let car = this.rng.pick([0, 1, 2, 3]);
        for (let tries = 0; tries < 24 && taken.has(`${car}:${seat}`); tries++) {
          seat = this.rng.int(0, 53);
          car = this.rng.pick([0, 1, 2, 3]);
        }
        taken.delete(`${q.car}:${q.seat}`);
        taken.add(`${car}:${seat}`);
        const move = () => { q.car = car; q.seat = seat; };
        if (opts.immediate) move(); else this.queueUnobserved(q, move);
      }
      for (const p of arriving) {
        let seat = this.rng.int(0, 53);
        let car = this.rng.pick([0, 1, 2, 3]);
        for (let tries = 0; tries < 24 && taken.has(`${car}:${seat}`); tries++) {
          seat = this.rng.int(0, 53);
          car = this.rng.pick([0, 1, 2, 3]);
        }
        taken.add(`${car}:${seat}`);
        const pose = this.rng.pick(['sit', 'sitPhone', 'sitSlump', 'sitHandsFolded', 'sitRead']);
        const apply = () => {
          p.present = true;
          p.car = car;
          p.seat = seat;
          p.pose = pose;
          p.watch = this.rng.float(0, 0.12);
          p.customPos = null;
        };
        if (opts.immediate) apply(); else this.queueUnobserved(p, apply);
      }
    }
  }

  /* ---- the queue ------------------------------------------------------ */

  queueUnobserved(person, apply, point = null) {
    this.pending.push({ apply, person, point, car: person?.car ?? null, age: 0 });
  }

  queueUnobservedCar(car, apply, point = null) {
    this.pending.push({ apply, person: null, point, car, age: 0 });
  }

  /*
   * Spends whatever it can. `force` applies everything regardless — used
   * during a blackout, which is the one moment the game is allowed to change
   * things in front of the player, because the player cannot see anything.
   */
  spend(dt, camera, playerCar, force = false) {
    if (!this.pending.length) return 0;
    let applied = 0;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const item = this.pending[i];
      item.age += dt;
      const point = item.point
        || (item.person ? pointOf(item.person) : { x: 0, z: carCenterZ(item.car ?? playerCar) });
      /* Being in another carriage is not the same as being out of sight: an
         open gangway is a clear line down two more cars, and the connecting
         doors are glazed. The cone test already rejects anything far enough
         away, so it is the only test that runs. */
      const hidden = force || !isObserved(point, camera);
      if (!hidden) continue;
      try { item.apply(); } catch (err) { console.warn('[crowd] queued change failed', err); }
      this.pending.splice(i, 1);
      applied++;
      if (!force) this.lookedAwayCount++;
    }
    return applied;
  }

  /* ---- frame ---------------------------------------------------------- */

  update(dt, time, camera, opts = {}) {
    for (const p of this.all()) {
      if (p.temporary != null) {
        p.temporary -= dt;
        if (p.temporary <= 0) {
          p.temporary = null;
          /* Only vanishes once it is out of sight; otherwise it waits. */
          const pos = pointOf(p);
          if (!isObserved(pos, camera)) {
            p.present = false;
            p.customPos = null;
          } else {
            p.temporary = 0.5;
          }
        }
      }
      p.update(dt, time, camera, opts);
    }
  }

  nodes(out = []) {
    for (const p of this.all()) p.nodes(out);
    return out;
  }

  /* Anybody at all, named or not. `get` only knows the named cast, and the
     interaction layer offers the nameless ones too. */
  find(id) {
    if (this.people.has(id)) return this.people.get(id);
    return this.all().find((p) => p.id === id) || null;
  }

  /* People close enough to be talked to. */
  nearest(position, maxDistance = 2.4) {
    let best = null;
    let bestDist = maxDistance;
    for (const p of this.all()) {
      if (!p.present) continue;
      const pos = p.position();
      const d = Math.hypot(pos[0] - position[0], pos[2] - position[2]);
      if (d < bestDist) { best = p; bestDist = d; }
    }
    return best;
  }

  reset() {
    for (const p of this.all()) {
      p.present = false;
      p.customPos = null;
      p.temporary = null;
      p.watch = 0;
      p.upsideDown = false;
    }
    this.pending.length = 0;
    this.lookedAwayCount = 0;
  }
}

function pointOf(person) {
  const p = person.position();
  return { x: p[0], z: p[2], y: p[1] + 1.1 };
}

/*
 * Is this point in front of the player and close enough to make out?
 *
 * Generous on purpose. Being wrong in the direction of "assume they can see
 * it" costs a delayed change; being wrong the other way costs the entire
 * effect.
 */
export function isObserved(point, camera) {
  if (!camera) return false;
  const dx = point.x - camera.position[0];
  const dy = (point.y ?? 1.2) - camera.position[1];
  const dz = point.z - camera.position[2];
  const dist = Math.hypot(dx, dy, dz);
  if (dist > VIEW_RANGE) return false;
  if (dist < 0.9) return true;
  const inv = 1 / dist;
  const dot = (dx * inv) * camera.forward[0] + (dy * inv) * camera.forward[1] + (dz * inv) * camera.forward[2];
  return dot > VIEW_COS;
}

