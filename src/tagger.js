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

export function tagsFor(card) {
  const text = card.effect || card.desc || '';
  // 'CRIT DMG increases…' / 'Stun DMG Multiplier' are not generic DMG bonuses.
  const generic = text.replace(/(crit|stun)\s*dmg/gi, '');
  // 'ignore 20% of enemy DEF' is PEN, not a DEF stat for the Agent.
  const ownDef = text.replace(/(ignore[^.]{0,24}DEF|enem(y|ies)'?s? DEF)/gi, '');
  const textFor = (id) => (id === 'dmg' ? generic : id === 'def' ? ownDef : text);
  const found = new Set(TAGS.filter((t) => t.re.test(textFor(t.id))).map((t) => t.id));
  for (const t of card.extraTags || []) found.add(t);
  return [...found];
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
