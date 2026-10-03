// Offline checks: OCR dump matches the database, tagger and optimizer behave.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { SEED_RESONIA } from '../src/resonia-db.js';
import { matchCard, tagsFor } from '../src/tagger.js';
import { planPath, scoreCard } from '../src/optimizer.js';
import { prefsFromPreset } from '../src/presets.js';
import { timeFromName, byShotTime } from '../src/shot-time.js';

const byName = Object.fromEntries(SEED_RESONIA.map((c) => [c.name, c]));
let failures = 0;

// 1. Every OCR'd card in the dump should resolve to a database entry.
if (fs.existsSync('data/ocr-dump.json')) {
  const dump = JSON.parse(fs.readFileSync('data/ocr-dump.json', 'utf8'));
  let total = 0, matched = 0, priced = 0;
  for (const shot of dump) {
    for (const c of shot.cards) {
      total++;
      const m = matchCard(c, SEED_RESONIA);
      if (m.card) matched++; else { failures++; console.log(`UNMATCHED ${shot.file} slot ${c.slot}: ${c.titleRaw}`); }
      if (c.price === m.card?.price) priced++;
      else console.log(`price ${shot.file} slot ${c.slot}: ocr=${c.price} db=${m.card?.price} (${m.card?.name})`);
      if (m.card && c.rarity !== m.card.rarity) console.log(`rarity ${shot.file} slot ${c.slot}: ocr=${c.rarity} db=${m.card.rarity} (${m.card.name})`);
    }
    if (shot.coins == null || shot.refreshCost == null) { failures++; console.log(`header ${shot.file}: coins=${shot.coins} refresh=${shot.refreshCost}`); }
  }
  console.log(`OCR match: ${matched}/${total}, prices exact: ${priced}/${total}`);
}

// 2. Tagger sanity.
assert.deepEqual(tagsFor(byName['Strike Left and Right']), ['critRate']);
assert.ok(tagsFor(byName['Total Eradication']).includes('pen'));
assert.ok(tagsFor(byName["Champion's Proof"]).includes('hp'));
assert.ok(tagsFor(byName['Starlight Lollipop']).includes('energy'));
assert.ok(!tagsFor(byName['Cutting Gale']).includes('dmg'));
assert.ok(!tagsFor({ effect: 'Agents take 15% more DMG.' }).includes('dmg'), 'taking more DMG is not a DMG bonus');
assert.ok(!tagsFor({ effect: 'The Agent takes 7.5% more DMG.' }).includes('dmg'));
assert.ok(tagsFor(byName['Sword Catalog']).includes('dmg'), '"deal 25% more DMG" still counts');
assert.ok(tagsFor({ effect: 'Agents deal 10% more DMG.' }).includes('dmg'));
assert.ok(!tagsFor(byName['Total Eradication']).includes('def'), 'enemy DEF ignore is not a DEF stat');
assert.deepEqual(tagsFor({ effect: 'Increases Agent DEF by 20%.' }), ['def']);
assert.ok(tagsFor({ effect: 'Maim DMG and Laceration DMG increase by 25%.' }).includes('laceration'));
assert.ok(tagsFor(byName['Quick-Heat Hot Pot']).includes('energy'), 'Sharpness counts as a resource');

// 2b. Screenshot ordering by filename timestamp.
const t = (n) => timeFromName(n);
assert.equal(t('Screenshot 2026-10-02 152530.png'), new Date(2026, 9, 2, 15, 25, 30).getTime());
assert.equal(t('20261002152530_1.png'), new Date(2026, 9, 2, 15, 25, 30, 100).getTime());
assert.equal(t('Zenless Zone Zero Screenshot 2026.10.02 - 15.25.30.12.png'), new Date(2026, 9, 2, 15, 25, 30, 120).getTime());
assert.equal(t('my shop.png'), null);
// Mixed naming schemes and out-of-order input still come out chronological.
const shots = ['Zenless Zone Zero Screenshot 2026.10.02 - 15.30.00.01.png', 'Screenshot 2026-10-02 152530.png', '20261002152800_1.png', 'Screenshot 2026-10-01 235959.png']
  .map((label) => ({ label, time: t(label) })).sort(byShotTime).map((p) => p.label);
assert.deepEqual(shots, ['Screenshot 2026-10-01 235959.png', 'Screenshot 2026-10-02 152530.png', '20261002152800_1.png', 'Zenless Zone Zero Screenshot 2026.10.02 - 15.30.00.01.png']);

// 3. Path planner on the real 20-page sequence with a crit build.
const prefs = prefsFromPreset('Crit DPS (Attack)');
const dump = JSON.parse(fs.readFileSync('data/ocr-dump.json', 'utf8'));
const pages = dump.map((shot) => ({
  refreshCost: shot.refreshCost,
  cards: shot.cards.map((c) => matchCard(c, SEED_RESONIA).card),
}));
const path = planPath({ startCoins: dump[0].coins, pages, pool: SEED_RESONIA, prefs, continueUnknown: false });
console.log('path:', path.steps.filter((s) => s.buy.length || s.action === 'stop')
  .map((s) => `p${s.page + 1}: ${s.buy.map((b) => pages[s.page].cards[b].name).join(' + ') || 'skip'} (${s.action})`).join(' | '));
let coins = dump[0].coins;
for (const s of path.steps) {
  assert.equal(s.coinsBefore, coins);
  coins = s.coinsAfter - (s.action === 'refresh' ? pages[s.page].refreshCost : 0);
  assert.ok(coins >= 0, 'path never goes into debt');
}
const bought = path.steps.flatMap((s) => s.buy.map((b) => pages[s.page].cards[b].name));
assert.ok(bought.includes('Strike Left and Right') || bought.includes('Total Eradication'), 'crit path buys crit cards');
assert.ok(!bought.some((n) => scoreCard(byName[n], prefs) === 0), 'never buys zero-priority cards');

// 3b. Gear: Defense gear detected on page 8 (152722) with 5 owned.
const gearCards = dump.flatMap((shot) => shot.cards.filter((c) => c.gear).map((c) => ({ file: shot.file, card: matchCard(c, SEED_RESONIA).card, owned: c.owned })));
assert.ok(gearCards.length > 0 && gearCards.every((g) => g.card.category === 'Defense' && g.owned === 5), 'Defense gear, 5 owned');
assert.ok(dump.every((shot) => shot.cards.every((c) => !c.gear || matchCard(c, SEED_RESONIA).card.category === 'Defense')), 'only Defense is highlighted');
assert.ok(dump.every((shot) => shot.cards.every((c) => matchCard(c, SEED_RESONIA).card.category !== 'General' || c.gear == null)), 'General cards have no counter');
const gear = { category: 'Defense', owned: 5, bonus: 30 };
const withGear = planPath({ startCoins: dump[0].coins, pages, pool: SEED_RESONIA, prefs, continueUnknown: false, gear });
const boughtGear = withGear.steps.flatMap((s) => s.buy.map((b) => pages[s.page].cards[b])).filter((c) => c.category === 'Defense');
assert.equal(boughtGear.length, 1, 'buys exactly one Defense card: 5 -> 6 completes a set, a 2nd would not');
assert.equal(withGear.steps.reduce((a, s) => a + s.setBonuses, 0), 1);
// Parity: from an even count a single gear card earns nothing, two earn one bonus.
const two = planPath({ startCoins: 1200, prefs, pool: SEED_RESONIA, continueUnknown: false, gear: { category: 'Defense', owned: 4, bonus: 10 },
  pages: [{ refreshCost: 50, cards: [byName['Lightweight Bulletproof Armor'], { ...byName['Lightweight Bulletproof Armor'], name: 'Armor copy' }] }] });
assert.deepEqual(two.steps[0].buy, [0, 1]);
assert.equal(two.steps[0].setBonuses, 1);

// 4. Skipping: a useless page 1 is skipped when page 2 has the good card.
const tiny = planPath({
  startCoins: 700, pool: SEED_RESONIA, prefs, continueUnknown: false,
  pages: [
    { refreshCost: 50, cards: [byName['Net Launcher']] },
    { refreshCost: 100, cards: [byName['Strike Left and Right']] },
  ],
});
assert.deepEqual(tiny.steps.map((s) => s.buy), [[], [0]]);
assert.equal(tiny.steps[1].action, 'stop');
assert.equal(scoreCard(byName['Net Launcher'], { ...prefs, overrides: { 'Net Launcher': 'skip' } }), 0);

console.log(failures ? `${failures} OCR issue(s)` : 'all checks passed');
process.exit(failures ? 1 : 0);
