// Stat tags a resonium can contribute to, and keyword rules to detect them
// from (possibly OCR-noisy, possibly truncated) effect text.
export const TAGS = [
  { id: 'critRate', label: 'CRIT Rate', re: /crit\s*rate/i },
  { id: 'critDmg', label: 'CRIT DMG', re: /crit\s*dmg/i },
  { id: 'laceration', label: 'Laceration / Maim', re: /(laceration|sharp dmg|maim|gash|multi-crit)/i },
  { id: 'atk', label: 'ATK', re: /\bATK\b/ },
  { id: 'def', label: 'DEF', re: /\bDEF\b/ },
  { id: 'dmg', label: 'DMG Bonus', re: /((?<!takes? \d+(?:\.\d+)?% )more DMG|Agent DMG|\bDMG (dealt )?(increases?|is increased)|deals? \d+% more|DMG increases? by|Agent's DMG)/i },
  { id: 'pen', label: 'PEN / DEF ignore', re: /(\bPEN\b|ignore .{0,24}DEF)/i },
  { id: 'hp', label: 'Max HP', re: /max hp/i },
  { id: 'shield', label: 'Shields', re: /shield/i },
  { id: 'heal', label: 'Healing', re: /(restores? .{0,12}HP|recover HP|recovers? \d+% HP)/i },
  { id: 'daze', label: 'Daze / Impact', re: /daze/i },
  { id: 'stun', label: 'Stun window', re: /(stunned|stunning|stun dmg|stun recovery)/i },
  { id: 'anomaly', label: 'Anomaly', re: /(anomaly|disorder|buildup)/i },
  { id: 'energy', label: 'Energy / Decibels', re: /(energy|decibel|adrenaline|sharpness)/i },
  { id: 'sheer', label: 'Sheer Force', re: /sheer force/i },
  { id: 'exSpecial', label: 'EX Special', re: /ex special/i },
  { id: 'ultimate', label: 'Ultimate', re: /ultimate/i },
  { id: 'chain', label: 'Chain Attack', re: /chain attack/i },
  { id: 'dodge', label: 'Dodge / Assist', re: /(dodge|assist|vital view)/i },
  { id: 'lowHp', label: 'Low-HP trigger', re: /(below \d+%|lower HP|drops below|HP is lost|losing HP|less than \d+% HP)/i },
];

// Per-tag text views. Blanking (not deleting) excluded phrases keeps character
// positions aligned with the original text for magnitudesFor().
const blank = (s) => ' '.repeat(s.length);
function textViews(text) {
  return {
    // 'CRIT DMG increases…' / 'Stun DMG Multiplier' are not generic DMG bonuses.
    dmg: text.replace(/(crit|stun)\s*dmg/gi, blank),
    // 'ignore 20% of enemy DEF' is PEN, not a DEF stat for the Agent.
    def: text.replace(/(ignore[^.]{0,24}DEF|enem(y|ies)'?s? DEF)/gi, blank),
  };
}

export function tagsFor(card) {
  const text = card.effect || card.desc || '';
  const views = textViews(text);
  const found = new Set(TAGS.filter((t) => t.re.test(views[t.id] ?? text)).map((t) => t.id));
  for (const t of card.extraTags || []) found.add(t);
  return [...found];
}

// ---- magnitudes ------------------------------------------------------------
// What a typical B-rank card gives for each stat, by unit ('%' or flat). A
// card's strength in that stat is its number divided by this, so "CRIT DMG
// +60%" is x2 and "Daze +10%" is x1. Context tags (EX Special, Ultimate, Chain,
// Dodge, Low-HP) describe *when*, not *how much*, and have no reference.
export const MAGNITUDE_REFS = {
  critRate: { pct: 12 },
  critDmg: { pct: 30 },
  laceration: { pct: 20 },
  atk: { pct: 12, flat: 270 },
  def: { pct: 15, flat: 150 },
  dmg: { pct: 15 },
  pen: { pct: 10 },
  hp: { pct: 25 },
  shield: { pct: 10 },
  heal: { pct: 5 },
  daze: { pct: 10 },
  stun: { pct: 10 },
  anomaly: { pct: 18, flat: 50 },
  energy: { pct: 20, flat: 5 },
  sheer: { flat: 270 },
};
export const MAGNITUDE_CLAMP = [0.4, 3];

// For amounts, some keywords must be the stat itself, not a condition:
// "Shielded Agents deal 30% more DMG", "DMG to Stunned enemies by 45%",
// "a shield equal to 15% of Max HP" are DMG / DMG / shield amounts.
const MAGNITUDE_KEYWORDS = {
  stun: /(duration[^.]{0,30}stunned|stunned for|stun dmg multiplier)/i,
  shield: /shield (that is )?equal to|shield of/i,
  hp: /(max hp by|max hp increases)/i,
};

// Numbers that are amounts, skipping durations/ranges ("10s", "6m"), stack
// counts ("3 stacks", "10 times") and thresholds ("below 70%", "less than 50%").
function amounts(text) {
  const out = [];
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)(\s*%)?/g)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 8);
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (!m[2] && /^(s\b|m\b|\s*(stacks?|times|seconds?)\b)/i.test(after)) continue;
    if (/(below|than|under|above|up to|within|lasts|every)\s*$/i.test(before)) continue;
    out.push({ start: m.index, end: m.index + m[0].length, value: parseFloat(m[1]), unit: m[2] ? 'pct' : 'flat' });
  }
  return out;
}

// For each tag, the amount that belongs to it: usually the first number after
// the keyword ("CRIT Rate by 12%"), or one just before it when phrased as
// "20% of enemy DEF" / "10% more Daze" / "5 Energy". Never across a sentence.
export function magnitudesFor(card) {
  const text = card.effect || '';
  const views = textViews(text);
  const nums = amounts(text);
  // Stacking effects count at full stacks: "stacking up to 5 times",
  // "gain 3 stacks of Enhancement. Each stack … grants 16% CRIT DMG".
  const stacks = Number(text.match(/stacking up to (\d+) times/i)?.[1]
    || (/\beach stack\b/i.test(text) && text.match(/\b(?:gain|with|has) (\d+) stacks\b/i)?.[1]) || 1);
  const out = {};
  for (const t of TAGS) {
    const ref = MAGNITUDE_REFS[t.id];
    if (!ref) continue;
    let best = null;
    const re = MAGNITUDE_KEYWORDS[t.id] ?? t.re;
    for (const m of (views[t.id] ?? text).matchAll(new RegExp(re.source, re.flags.replace('g', '') + 'g'))) {
      const s = m.index, e = s + m[0].length;
      const inside = nums.find((n) => n.start >= s && n.end <= e);
      const after = nums.find((n) => n.start >= e && n.start - e <= 40 && !/[.;]\s/.test(text.slice(e, n.start)));
      const prior = [...nums].reverse().find((n) => n.end <= s && s - n.end <= 14
        && /^\s*(more|additional|of [a-z' ]*)?\s*$/i.test(text.slice(n.end, s)));
      const pick = inside || prior || after;
      if (pick && (!best || pick.start < best.start)) best = pick;
    }
    if (!best || !ref[best.unit]) continue;
    const value = best.value * stacks;
    const [lo, hi] = MAGNITUDE_CLAMP;
    out[t.id] = { value, unit: best.unit, factor: Math.min(hi, Math.max(lo, value / ref[best.unit])) };
  }
  return out;
}

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Best database match for an OCR'd card. Considers the parsed name, the raw
// title line (the name is usually its tail) and the effect text.
export function matchCard(ocr, db) {
  let best = null, bestScore = 0;
  const raw = norm(ocr.titleRaw);
  for (const card of db) {
    const n = norm(card.name);
    let s = similarity(ocr.name, card.name);
    if (raw.endsWith(n) || (n.length > 5 && raw.includes(n))) s = Math.max(s, 0.98);
    else if (raw) s = Math.max(s, similarity(raw.slice(-n.length - 3), n) - 0.05);
    const eff = similarity((ocr.desc || '').slice(0, 60), (card.effect || '').slice(0, 60));
    s = Math.max(s, eff - 0.1);
    if (s > bestScore) { bestScore = s; best = card; }
  }
  return bestScore >= 0.6 ? { card: best, confidence: bestScore } : { card: null, confidence: bestScore };
}
