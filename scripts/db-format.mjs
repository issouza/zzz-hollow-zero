// Writes src/resonia-db.js in its hand-editable layout. Shared by the server's
// "Update database" endpoint and `npm run db:format`.
// Rows are [category, subtype, name, rarity, price, effect, extraTags?], sorted
// alphabetically in that column order.
const COLS = ['category', 'subtype', 'name', 'rarity', 'price', 'effect'];

// Single quotes unless the text contains one (e.g. "Champion's Proof").
const q = (v) => {
  if (v == null) return 'null';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map(q).join(', ')}]`;
  return v.includes("'") ? JSON.stringify(v) : `'${v.replace(/\\/g, '\\\\')}'`;
};

const cmp = (a, b) => {
  for (const k of COLS) {
    const x = a[k] ?? '', y = b[k] ?? '';
    const d = typeof x === 'number' && typeof y === 'number'
      ? x - y
      : String(x).localeCompare(String(y), 'en', { sensitivity: 'base', numeric: true });
    if (d) return d;
  }
  return 0;
};

export function serializeDb(cards) {
  const sorted = [...cards].sort(cmp);
  const lines = [];
  let prev = null;
  for (const c of sorted) {
    if (prev !== null && prev !== c.category) lines.push('');
    prev = c.category;
    const tags = c.extraTags?.length ? `, ${q(c.extraTags)}` : '';
    lines.push(`  [${q(c.category)}, ${q(c.subtype || null)}, ${q(c.name.trim())}, ${q(c.rarity)}, ${c.price}, ${q(c.effect)}${tags}],`);
  }
  return `// Lost Void Bangboo shop resonia, transcribed from in-run screenshots.
// Edit by hand or from the app's Resonium database tab ("Update database").
// Keep rows sorted alphabetically by category, subtype, name (the app's
// "Update database" and \`npm run db:format\` re-sort automatically).
// Effects ending in "…" were truncated on the shop card. Tags are derived from
// the effect text by tagger.js; \`extraTags\` covers what the truncation hides.
// [category, subtype, name, rarity, price, effect, extraTags?]
const ROWS = [
${lines.join('\n')}
];

export const SEED_RESONIA = ROWS.map(([category, subtype, name, rarity, price, effect, extraTags = []]) => ({
  name, category, subtype, rarity, price, effect, extraTags,
}));

// Observed refresh price ladder: 50, 100, 200, then 300 for every further refresh.
export const DEFAULT_REFRESH_LADDER = [50, 100, 200, 300];
`;
}

// `node scripts/db-format.mjs`: re-sort and re-write src/resonia-db.js in place.
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/').replace(/^\//, '')}`) {
  const fs = await import('node:fs');
  const { SEED_RESONIA } = await import('../src/resonia-db.js');
  const file = new URL('../src/resonia-db.js', import.meta.url);
  fs.writeFileSync(file, serializeDb(SEED_RESONIA));
  console.log(`Wrote ${SEED_RESONIA.length} resonia to src/resonia-db.js`);
}
