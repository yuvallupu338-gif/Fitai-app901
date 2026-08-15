/*
 * shift.js — the day.
 *
 * A shift is a queue of customers, a till that fills up, and a reputation that
 * moves slowly. Days get longer and the requests get harder, which is the only
 * progression the game has and all it needs: the difficulty is in the faces,
 * not in a skill tree.
 *
 * Everything here is derived from one save seed and the day number, so a save
 * file is four numbers and a list of who has already been served.
 */

import { makeRng, hashSeed } from '../core/rng.js';
import { generateCustomer } from './customer.js';

export class Shift {
  constructor(save = {}) {
    this.saveSeed = save.saveSeed || (hashSeed('bella-' + Date.now()) >>> 0);
    this.day = save.day || 1;
    this.index = save.index || 0;
    this.money = save.money === undefined ? 0 : save.money;
    this.served = save.served || [];        /* every customer ever finished */
    this.dayResults = save.dayResults || [];
    this.customer = null;
  }

  get customersToday() {
    return Math.min(8, 3 + Math.floor(this.day * 0.8));
  }

  /* The day's takings target. Missing it does not end anything — it moves the
   * reputation, which moves how often a regular comes back. */
  get target() {
    return 260 + this.day * 140;
  }

  get takingsToday() {
    return this.dayResults.reduce((n, r) => n + r.take, 0);
  }

  get reputation() {
    if (!this.served.length) return 3;
    const recent = this.served.slice(-12);
    return recent.reduce((n, s) => n + s.stars, 0) / recent.length;
  }

  get done() {
    return this.index >= this.customersToday;
  }

  /*
   * The next person through the door.
   *
   * A regular returning is not random noise: it only happens once there is
   * somebody worth returning — a customer whose preference the player actually
   * marked — and it becomes more likely as the shop's reputation rises. That is
   * what turns the card at the till from a quiz into an investment.
   */
  next() {
    const rng = makeRng(`${this.saveSeed}-d${this.day}-c${this.index}`);
    const candidates = this.served.filter((s) => s.markedRight && s.stars >= 3);
    const chance = Math.min(0.42, 0.10 + candidates.length * 0.05 + (this.reputation - 3) * 0.06);
    let opts = { day: this.day, index: this.index };
    if (candidates.length && this.day > 1 && rng.chance(chance)) {
      opts.returning = rng.pick(candidates);
    }
    const seed = hashSeed(`${this.saveSeed}-d${this.day}-c${this.index}-p`);
    this.customer = generateCustomer(seed, opts);
    this.customer.slot = this.index;
    return this.customer;
  }

  /* Bank a finished customer and move the queue on. */
  complete(result, marking, till) {
    const c = this.customer;
    const record = {
      seed: c.seed,
      name: c.name,
      lookId: c.lookId,
      stars: result.stars,
      score: result.score,
      markedRight: !!(marking && marking.itemRight),
      favouriteKey: marking && marking.favourite ? marking.favourite.key : null,
      take: till.take,
      day: this.day,
    };
    this.served.push(record);
    this.dayResults.push(record);
    this.money += till.take;
    this.index++;
    this.customer = null;
    return record;
  }

  endDay() {
    const summary = {
      day: this.day,
      take: this.takingsToday,
      target: this.target,
      customers: this.dayResults.length,
      stars: this.dayResults.length
        ? this.dayResults.reduce((n, r) => n + r.stars, 0) / this.dayResults.length
        : 0,
      hitTarget: this.takingsToday >= this.target,
    };
    this.day++;
    this.index = 0;
    this.dayResults = [];
    return summary;
  }

  toSave() {
    return {
      saveSeed: this.saveSeed,
      day: this.day,
      index: this.index,
      money: this.money,
      /* Only the last fifty are kept. A save that grows without bound is a save
       * that eventually will not fit in localStorage, and nobody is coming back
       * for customer number three hundred. */
      served: this.served.slice(-50),
      dayResults: this.dayResults,
    };
  }
}
