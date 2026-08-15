/*
 * scoring.js — what the customer thinks of the result.
 *
 * The judgement is built out of the same request the player was shown, want by
 * want, and it reports itself that way: not "72%", but "you were asked for a
 * matte lip and gave a gloss", "the base is two shades too light", "there is
 * blusher on the temple". A score a player cannot argue with is a score they
 * cannot learn from.
 *
 * Four things are measured:
 *
 *   1. each want — was that kind of product used, in the right finish, in the
 *      right colour family, to roughly the right coverage;
 *   2. each avoid — did something land that she explicitly did not want;
 *   3. the shade match on anything that has to disappear into her skin;
 *   4. mess — how much product ended up outside the zone it belongs in.
 *
 * The persona then scales the distance from perfect: the same face gets a
 * warmer number out of an easy-going customer than out of one who knows
 * exactly what she wanted, which is both true and the reason a shift has a
 * rhythm rather than being twelve identical exams.
 */

import { clamp, smoothstep } from '../core/math.js';
import { hexToRgb, shadeMiss } from '../core/color.js';
import { CATEGORIES, FINISH_HE, FAMILY_HE, zoneOf } from '../data/products.js';
import { favourite } from './customer.js';

/* Coverage is scored against a band, not a point: anywhere from a bit under to
 * a bit over the request is fully right, and it falls away either side. Being
 * generous here matters — nobody can hit 0.70 coverage on purpose. */
function coverageScore(got, want) {
  const under = smoothstep(want * 0.35, want * 0.85, got);
  const over = 1 - 0.55 * smoothstep(want + 0.22, 1.0, got);
  return clamp(under * over, 0, 1);
}

function listed(value, spec) {
  if (!spec) return null;
  return [].concat(spec).includes(value);
}

/*
 * Which product answered a want. When several of a category went on — two
 * lipsticks, a blush over a blush — the one with the most product on the face
 * is the one she sees, and the one she judges.
 */
function usedFor(applied, cat) {
  let best = null;
  for (const e of applied) {
    if (e.item.product.cat !== cat) continue;
    if (!best || e.amount > best.amount) best = e;
  }
  return best;
}

export function scoreCustomer(c, paint) {
  const stats = paint.stats();
  const applied = paint.applied();
  const parts = [];
  let weighted = 0, weight = 0;

  for (const want of c.look.wants) {
    const cat = CATEGORIES[want.cat];
    const zone = cat.zone;
    const used = usedFor(applied, want.cat);
    const coverage = zone && stats[zone] ? stats[zone].coverage : 0;
    const w = want.weight || 1;
    weight += w;

    if (!used) {
      parts.push({
        cat: want.cat, label: cat.he, score: 0, weight: w,
        note: 'לא הושם בכלל',
      });
      continue;
    }

    /* Coverage is read off the zone, not off how much was in the ledger: what
     * matters is what is on the face, and a product half of which landed on
     * the counter should not count as applied. */
    const cov = coverageScore(coverage, want.coverage);
    const finishOk = listed(used.item.product.finish, want.finish);
    const familyOk = listed(used.item.shade.family, want.family);

    const score = clamp(
      0.52 * cov
      + 0.24 * (finishOk === null ? 1 : finishOk ? 1 : 0.18)
      + 0.24 * (familyOk === null ? 1 : familyOk ? 1 : 0.22), 0, 1);

    const notes = [];
    if (cov < 0.55) {
      notes.push(coverage < want.coverage * 0.6 ? 'מעט מדי' : 'לא אחיד');
    }
    if (finishOk === false) {
      notes.push(`ביקשה ${[].concat(want.finish).map((f) => FINISH_HE[f]).join('/')}, קיבלה ${FINISH_HE[used.item.product.finish]}`);
    }
    if (familyOk === false) {
      notes.push(`הגוון לא מהמשפחה שביקשה (${[].concat(want.family).map((f) => FAMILY_HE[f] || f).join('/')})`);
    }

    parts.push({
      cat: want.cat, label: cat.he, score, weight: w,
      used: used.name,
      note: notes.join(' · ') || 'בדיוק',
    });
    weighted += score * w;
  }

  /* ---- things she asked not to have ---- */
  const violations = [];
  for (const a of c.look.avoid) {
    const hit = applied.find((e) => e.item.product.cat === a.cat
      && (!a.finish || e.item.product.finish === a.finish)
      && (!a.family || [].concat(a.family).includes(e.item.shade.family)));
    if (!hit) continue;
    /* An avoid with a coverage threshold is about quantity, not presence —
     * "not too much highlighter" is a different complaint from "no glitter". */
    if (a.coverage) {
      const zone = zoneOf(hit.item.product);
      if (!zone || (stats[zone] ? stats[zone].coverage : 0) < a.coverage) continue;
    }
    violations.push({ label: CATEGORIES[a.cat].he, why: a.why, hit: hit.name });
  }

  /* ---- shade match ---- */
  let shade = null;
  const base = usedFor(applied, 'foundation');
  if (base) {
    const miss = shadeMiss(hexToRgb(base.item.shade.hex), c.skin);
    /* Under about 4 delta-E nobody can see a difference; past 12 it is the
     * first thing anyone notices. */
    const ok = 1 - smoothstep(4, 13, miss.deltaE);
    shade = {
      deltaE: miss.deltaE,
      score: ok,
      note: miss.deltaE < 4 ? 'הגוון מדויק'
        : `${Math.abs(miss.depth) > 4 ? (miss.depth > 0 ? 'בהיר מדי' : 'כהה מדי') : ''}${Math.abs(miss.depth) > 4 && Math.abs(miss.warmth) > 3 ? ' וגם ' : ''}${Math.abs(miss.warmth) > 3 ? (miss.warmth > 0 ? 'חם מדי' : 'קר מדי') : ''}`.trim() || 'הגוון קצת לא מדויק',
      used: base.name,
    };
    weighted += ok * 1.6;
    weight += 1.6;
  }

  /* ---- mess ---- */
  let total = 0, off = 0;
  for (const e of applied) { total += e.amount; off += e.offZone; }
  const messRatio = total > 0 ? off / total : 0;
  const mess = clamp(smoothstep(0.10, 0.42, messRatio), 0, 1);

  const raw = weight > 0 ? weighted / weight : 0;
  const withPenalties = clamp(
    raw - violations.length * 0.14 - mess * 0.22, 0, 1);

  /* The persona scales the *distance from perfect*, so an easy customer never
   * scores a blank face well — she is forgiving, not blind. */
  const picky = c.persona.picky;
  const final = clamp(1 - (1 - withPenalties) * picky, 0, 1);

  return {
    parts,
    violations,
    shade,
    mess: { ratio: messRatio, penalty: mess },
    raw,
    score: Math.round(final * 100),
    stars: starsFor(final),
    applied,
  };
}

export function starsFor(fraction) {
  if (fraction >= 0.92) return 5;
  if (fraction >= 0.78) return 4;
  if (fraction >= 0.60) return 3;
  if (fraction >= 0.40) return 2;
  if (fraction >= 0.20) return 1;
  return 0;
}

/* ------------------------------------------------------------------ *
 * The card at the till
 * ------------------------------------------------------------------ */

/*
 * The player marks two things: which product she liked best, and which kind of
 * product she prefers. They are scored separately because they are different
 * observations — "she smiled at the satin lipstick" and "she is a satin person"
 * — and a player can easily get one without the other.
 */
export function scoreMarking(c, paint, markedKey, markedFinish) {
  const applied = paint.applied();
  const fav = favourite(c, applied);
  const itemRight = !!fav && markedKey === fav.key;
  const finishRight = !!c.prefs.finish && markedFinish === c.prefs.finish;

  return {
    favourite: fav,
    itemRight,
    finishRight,
    /* Half the bonus each, so noticing the finish without pinning the exact
     * shade still pays. */
    bonus: (itemRight ? 0.5 : 0) + (finishRight ? 0.5 : 0),
    truth: {
      itemName: fav ? fav.name : null,
      finish: c.prefs.finish,
      finishHe: c.prefs.finish ? FINISH_HE[c.prefs.finish] : null,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Money
 * ------------------------------------------------------------------ */

/*
 * What she pays. The service is charged at the look's rate scaled by how well
 * it went, the products she is taking home are charged at list price, and the
 * tip is where the preference card lands: reading a customer right is worth
 * more than a perfect application to a customer you did not read.
 */
export function till(c, result, marking) {
  const lines = result.applied
    .filter((e) => e.item.product.price > 0)
    .map((e) => ({ name: e.name, price: e.item.product.price }));

  const products = lines.reduce((n, l) => n + l.price, 0);
  const service = Math.round(c.look.pay * (0.45 + 0.55 * result.score / 100));
  const tipRate = 0.10 + 0.14 * (result.score / 100) + 0.12 * (marking ? marking.bonus : 0);
  const tip = Math.round(service * tipRate * c.persona.tip);

  return {
    lines,
    products,
    service,
    tip,
    total: products + service,
    take: products + service + tip,
  };
}
