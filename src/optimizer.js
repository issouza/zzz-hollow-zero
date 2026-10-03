import { tagsFor, magnitudesFor } from './tagger.js';

export const UNIT = 50; // every price and refresh cost seen is a multiple of 50

// Conditional / timed effects are worth a bit less than always-on stats.
const CONDITIONAL = /\b(when|upon|if|after|while|for \d+s|triggering|landing)\b/i;

export function scoreCard(card, prefs) {
  const override = prefs.overrides?.[card.name];
  if (override === 'skip') return 0;
  // Diminishing returns: the best-matching stat counts fully, extra matches at 35%,
  // so effects that merely mention many keywords don't dominate.
  const rarity = card.rarity === 'A' ? prefs.rarityA : card.rarity === 'S' ? prefs.rarityA * 1.3 : 1;
  // Magnitude-aware (opt-in): a stat whose amount was read from the effect is
  // scaled by amount / typical B-card amount instead of the flat rank multiplier.
  const mags = prefs.magnitude ? magnitudesFor(card) : {};
  const ws = tagsFor(card).map((t) => (prefs.tagWeights[t] ?? 0) * (mags[t]?.factor ?? rarity)).sort((a, b) => b - a);
  const tagValue = ws.length ? ws[0] + 0.35 * ws.slice(1).reduce((a, b) => a + b, 0) : 0;
  const cat = prefs.categoryWeights[card.category] ?? 0;
  const cond = CONDITIONAL.test(card.effect || card.desc || '') ? (prefs.conditionalFactor ?? 0.8) : 1;
  const score = cond * tagValue + rarity * cat;
  return override === 'must' ? score + 1000 : score;
}

// Small seeded PRNG so recommendations are stable between re-renders.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// All purchasable subsets of a shop as {mask, score, cost} (cost in UNITs),
// with dominated subsets (costlier and not better) removed.
function subsets(items) {
  const out = [];
  for (let mask = 0; mask < 1 << items.length; mask++) {
    let score = 0, cost = 0;
    items.forEach((it, i) => { if (mask & (1 << i)) { score += it.score; cost += it.cost; } });
    out.push({ mask, score, cost });
  }
  out.sort((a, b) => a.cost - b.cost || b.score - a.score);
  const kept = []; let bestScore = -Infinity;
  for (const s of out) if (s.score > bestScore) { kept.push(s); bestScore = s.score; }
  return kept;
}

/**
 * Expected value of coins carried past the last known page: "pay the next
 * refresh, see 5 random cards from the pool, buy optimally, repeat or stop".
 * Leftover coins are worth prefs.carryValue points per 1000 (0 = spend it all).
 *
 * W[k][c]: best expected value with c coin-units left when the next refresh
 * costs ladder[k] (stopping is always an option).
 */
export function futureValue({ pool, prefs, maxUnits, samples = 300, shopSize = 5, extraScore = () => 0 }) {
  const ladder = prefs.refreshLadder.map((x) => Math.max(1, Math.ceil(x / UNIT)));
  const K = ladder.length;
  const carry = carryFn(prefs);

  const poolItems = pool.map((card) => ({ card, score: scoreCard(card, prefs) + extraScore(card), cost: Math.ceil(card.price / UNIT) }));
  const rng = mulberry32(1234);
  const sampled = [];
  if (poolItems.length) {
    for (let m = 0; m < samples; m++) {
      const idx = new Set();
      const n = Math.min(shopSize, poolItems.length);
      while (idx.size < n) idx.add(Math.floor(rng() * poolItems.length));
      sampled.push(subsets([...idx].map((i) => poolItems[i])));
    }
  }

  const W = Array.from({ length: K }, () => new Float64Array(maxUnits + 1));
  for (let c = 0; c <= maxUnits; c++) {
    for (let k = 0; k < K; k++) {
      let best = carry(c);
      const r = ladder[k];
      if (sampled.length && c >= r) {
        const rem = c - r, nk = Math.min(k + 1, K - 1);
        let sum = 0;
        for (const subs of sampled) {
          let v = -Infinity;
          for (const s of subs) {
            if (s.cost > rem) break;
            const val = s.score + W[nk][rem - s.cost];
            if (val > v) v = val;
          }
          sum += v;
        }
        best = Math.max(best, sum / sampled.length);
      }
      W[k][c] = best;
    }
  }

  const ladderIndex = (refreshCost) => {
    const k = prefs.refreshLadder.findIndex((x) => x === refreshCost);
    if (k >= 0) return k;
    return refreshCost >= prefs.refreshLadder[K - 1] ? K - 1 : 0;
  };
  return { value: (c, refreshCost) => W[ladderIndex(refreshCost)][c] };
}

const carryFn = (prefs) => (c) => (c * UNIT / 1000) * (prefs.carryValue || 0);

/**
 * Best purchase path through a known, ordered sequence of shop pages
 * (page i+1 is what you see after paying page i's refresh price).
 * Exact DP over (page, coins); after the last page it optionally continues
 * into unknown pages using futureValue().
 *
 * Gear: the equipped gear grants a set bonus for every 2 resonia of its
 * category you carry. With gear = { category, owned, bonus }, each purchase
 * that brings the owned count to an even number earns `bonus` points, so the
 * DP also tracks the parity of that count.
 *
 * pages: [{ cards: [card|null x5], refreshCost }]
 * Returns { steps: [{ page, buy: [slot], cost, coinsBefore, coinsAfter, action, setBonuses, gearOwned }], total, scores }
 *   action: 'refresh' (go to next page), 'refresh-unknown' (keep refreshing past
 *   the last screenshot) or 'stop'. Pages after the stop are not visited.
 */
export function planPath({ startCoins, pages, pool, prefs, continueUnknown = true, gear = null }) {
  const C = Math.max(0, Math.floor(startCoins / UNIT));
  const N = pages.length;
  const carry = carryFn(prefs);
  const G = gear?.category && gear.bonus > 0 ? gear : null;
  const isGear = (card) => !!(G && card && card.category === G.category);
  // Unseen pages: on average every gear card is worth half a set bonus.
  const fut = continueUnknown && N
    ? futureValue({ pool, prefs, maxUnits: C, extraScore: (card) => (isGear(card) ? G.bonus / 2 : 0) })
    : null;

  const scores = pages.map((p) => p.cards.map((card) => (card ? scoreCard(card, prefs) : null)));
  // Every affordable combination per page, cheapest first so ties keep coins.
  const pageSubs = pages.map((p, i) => {
    const items = p.cards.map((card, slot) => card && { slot, score: scores[i][slot], cost: Math.ceil((card.price || 0) / UNIT), g: isGear(card) ? 1 : 0 }).filter(Boolean);
    const out = [];
    for (let mask = 0; mask < 1 << items.length; mask++) {
      const pick = items.filter((_, j) => mask & (1 << j));
      const sum = (k) => pick.reduce((a, x) => a + x[k], 0);
      out.push({ slots: pick.map((x) => x.slot), score: sum('score'), cost: sum('cost'), g: sum('g') });
    }
    return out.sort((a, b) => a.cost - b.cost || a.slots.length - b.slots.length);
  });
  const refresh = pages.map((p) => Math.ceil((p.refreshCost || 0) / UNIT));
  const setBonuses = (par, g) => Math.floor((par + g) / 2); // even counts reached

  // V[i][par][c]: best value arriving at page i with c units and gear-count parity par.
  const V = Array.from({ length: N }, () => [new Float64Array(C + 1), new Float64Array(C + 1)]);
  // Value after finishing page i: stop, or pay the refresh and go on.
  const after = (i, c, par) => {
    const stop = carry(c);
    if (i < N - 1) return c >= refresh[i] ? Math.max(stop, V[i + 1][par][c - refresh[i]]) : stop;
    return fut ? fut.value(c, pages[i].refreshCost) : stop;
  };
  const bestChoice = (i, c, par) => {
    let best = null, bestVal = -Infinity;
    for (const s of pageSubs[i]) {
      if (s.cost > c) break;
      const bonus = G ? setBonuses(par, s.g) * G.bonus : 0;
      const v = s.score + bonus + after(i, c - s.cost, (par + s.g) % 2);
      if (v > bestVal + 1e-9) { bestVal = v; best = s; }
    }
    return { best, bestVal };
  };
  for (let i = N - 1; i >= 0; i--) {
    for (let c = 0; c <= C; c++) for (const par of [0, 1]) V[i][par][c] = bestChoice(i, c, par).bestVal;
  }

  const steps = [];
  let c = C, coins = startCoins, owned = G ? G.owned || 0 : 0;
  for (let i = 0; i < N; i++) {
    const par = owned % 2;
    const { best } = bestChoice(i, c, par);
    const spent = best.slots.reduce((a, slot) => a + pages[i].cards[slot].price, 0);
    const step = {
      page: i, buy: best.slots, cost: spent, coinsBefore: coins, coinsAfter: coins - spent, score: best.score,
      setBonuses: G ? setBonuses(par, best.g) : 0, gearOwned: owned + best.g,
    };
    c -= best.cost; coins -= spent; owned += best.g;
    const goOn = i < N - 1 && c >= refresh[i] && V[i + 1][owned % 2][c - refresh[i]] > carry(c) + 1e-9;
    const goUnknown = i === N - 1 && fut && fut.value(c, pages[i].refreshCost) > carry(c) + 1e-9;
    step.action = goOn ? 'refresh' : goUnknown ? 'refresh-unknown' : 'stop';
    if (goUnknown) step.futureValue = fut.value(c, pages[i].refreshCost);
    steps.push(step);
    if (!goOn) break;
    c -= refresh[i]; coins -= pages[i].refreshCost;
  }
  return { steps, total: N ? V[0][(G ? G.owned || 0 : 0) % 2][C] : 0, scores, isGear };
}
