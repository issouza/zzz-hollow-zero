import { TAGS } from './tagger.js';
import { CATEGORIES } from './ocr-core.js';
import { DEFAULT_REFRESH_LADDER } from './resonia-db.js';

const zeroTags = () => Object.fromEntries(TAGS.map((t) => [t.id, 0]));
const zeroCats = () => Object.fromEntries(CATEGORIES.map((c) => [c, 0]));

// Weights are 0-5. Categories add a flat bonus to every card of that type.
export const PRESETS = {
  'Crit DPS (Attack)': {
    tags: { critRate: 5, critDmg: 5, atk: 4, dmg: 4, pen: 4, exSpecial: 2, ultimate: 2, energy: 1, chain: 1 },
    cats: { Attack: 2, General: 1 },
  },
  // Armorer (3.2), modelled on Claret: skills scale off DEF (ATK is irrelevant),
  // CRIT DMG converts to CRIT Rate (0.35% per 1%), CRIT Rate above 100% triggers
  // multi-CRIT Laceration hits, Gash -> Maim on EX Special / Ultimate, Sharpness
  // is her resource, and Defensive / Counter Assist parries enemy attacks.
  'Armorer (Claret)': {
    tags: { critRate: 5, def: 5, laceration: 5, critDmg: 4, pen: 3, dmg: 3, ultimate: 3, exSpecial: 3, energy: 3, chain: 2, dodge: 2 },
    cats: { Armorer: 2, Attack: 1, General: 1 },
  },
  'Anomaly': {
    tags: { anomaly: 5, pen: 3, atk: 3, dmg: 3, energy: 2, exSpecial: 2 },
    cats: { Anomaly: 2, General: 1 },
  },
  'Stun / Daze': {
    tags: { daze: 5, stun: 5, dmg: 3, energy: 3, chain: 2, exSpecial: 2, ultimate: 1 },
    cats: { Stun: 2, General: 1 },
  },
  'Rupture (Sheer Force)': {
    tags: { sheer: 5, hp: 4, critDmg: 4, critRate: 3, dmg: 3, lowHp: 2, heal: 2 },
    cats: { Rupture: 2, General: 1 },
  },
  'Support / Resources': {
    tags: { energy: 5, ultimate: 3, chain: 3, dmg: 3, exSpecial: 2, daze: 1 },
    cats: { Support: 2, General: 1 },
  },
  'Survival': {
    tags: { shield: 5, heal: 5, hp: 4, dodge: 3, lowHp: 1 },
    cats: { Defense: 2, General: 1 },
  },
  'Balanced': {
    tags: Object.fromEntries(TAGS.map((t) => [t.id, 2])),
    cats: {},
  },
};

export function prefsFromPreset(name) {
  const p = PRESETS[name] || PRESETS['Balanced'];
  return {
    preset: name,
    tagWeights: { ...zeroTags(), ...p.tags },
    categoryWeights: { ...zeroCats(), ...p.cats },
    rarityA: 1.7,
    gearBonus: 20,
    conditionalFactor: 0.8,
    carryValue: 0,
    refreshLadder: [...DEFAULT_REFRESH_LADDER],
    overrides: {},
  };
}
