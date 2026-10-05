// Lost Void Bangboo shop resonia, transcribed from in-run screenshots.
// Edit by hand or from the app's Resonium database tab ("Update database").
// Keep rows sorted alphabetically by category, subtype, name (the app's
// "Update database" and `npm run db:format` re-sort automatically).
// Effects ending in "…" were truncated on the shop card. Tags are derived from
// the effect text by tagger.js; `extraTags` covers what the truncation hides.
// [category, subtype, name, rarity, price, effect, extraTags?]
const ROWS = [
  ['Anomaly', 'Infliction', 'EMI Jammer', 'B', 600, 'Agent Attribute Anomaly DMG and Disorder DMG increase by 18%.'],
  ['Anomaly', 'Infliction', 'Heavy Flamethrower', 'A', 1000, "Agent's PEN Ratio increases by 20% when attacking an enemy suffering an Attribute Anomaly."],
  ['Anomaly', 'Infliction', 'High-Strength Pepper Spray', 'A', 1000, 'When an Attribute Anomaly is triggered, the whole squad either recovers 7 Energy, recovers 9 Adrenaline, or recovers 7 Sharpness. This effect can trigger once every 5s.'],
  ['Anomaly', 'Infliction', 'High-Voltage Stun Gun', 'B', 600, 'Increases Agent Anomaly Proficiency by 45.'],
  ['Anomaly', 'Infliction', 'Net Launcher', 'B', 600, 'Increases Agent Anomaly Mastery by 60.'],
  ['Anomaly', 'Infliction', 'Tactical Flashbang', 'A', 1000, "Inflicting the Disorder effect increases the whole squad's Anomaly Proficiency by 25 for 15s, stacking up to 3 times. Repeated triggers reset the duration."],

  ['Attack', 'Eradication', 'Cutting Gale', 'B', 600, 'Increases Agent ATK by 270.'],
  ['Attack', 'Eradication', 'Fluttering Butterfly', 'A', 1000, '"Dodge turns the following Dash Attack into a Dodge Counter. This effact can trigger once every 5s.'],
  ['Attack', 'Eradication', 'Greataxe of Conquest', 'A', 1000, 'Upon entering combat, gain 3 stacks of Enhancement. Each stack of Enhancement grants the Agent bonus 16% CRIT DMG. Getting hit removes 1 stack of Enhancement.'],
  ['Attack', 'Eradication', 'Hard Knuckles', 'B', 600, 'Increase Agent CRIT DMG by 24%.'],
  ['Attack', 'Eradication', 'Strike Left and Right', 'B', 600, 'Increases Agent CRIT Rate by 12%.'],
  ['Attack', 'Eradication', 'Total Eradication', 'A', 1000, 'Agents ignore 20% of enemy DEF.'],

  ['Defense', 'Battle Shield', '4th-Gen Blast Shield', 'B', 600, 'Upon entering combat, the whole squad gains a shield equal to 10% of HP.'],
  ['Defense', 'Battle Shield', 'Lightweight Bulletproof Armor', 'B', 600, 'When triggering Perfect Dodge, the Agent gains a shield equal to 3% of HP. This effect can trigger once every 5s. Repeated triggers refresh shield HP.'],
  ['Defense', 'Battle Shield', 'Military Gas Mask', 'B', 600, 'Defensive Assist inflicts 25% more Daze.'],
  ['Defense', 'Battle Shield', 'MX7 Tactical Gloves', 'A', 1000, 'Shielded Agents deal 40% more CRIT DMG.'],
  ['Defense', 'Battle Shield', 'Standard-Issue Baton', 'A', 1000, 'Shielded Agents deal 25% more DMG.'],
  ['Defense', 'Battle Shield', 'Type-III Combat Helmet', 'A', 1000, 'Triggering Perfect Assist grants 150 Decibels to the whole squad. This effect can trigger once every 5s.'],
  
  ['Rupture', 'Activation', "Champion's Proof", 'B', 600, 'Increases Agent Max HP by 25%.'],
  ['Rupture', 'Activation', 'Heavy Hitter', 'A', 1000, 'DMG increases by 37.5% when Agent HP drops below 70%.'],
  ['Rupture', 'Activation', 'Light of Foot', 'B', 600, 'Increases Agent CRIT DMG by 30% for 20s when losing HP. Repeated triggers reset the duration.'],
  ['Rupture', 'Activation', 'Locked and Loaded', 'B', 600, "When HP is lost, Rupture Agents' Sheer Force increases by 270 while non-Rupture Agents' ATK increases by 324 for 5s. Repeated triggers reset the duration."],
  ['Rupture', 'Activation', 'Offense-Defense Balance', 'A', 1000, 'When launching EX Special Attack, the whole squad restores 4% HP. This effect can trigger once every 10s.'],
  ['Rupture', 'Activation', 'Unwavering Resolve', 'A', 1000, 'CRIT DMG increases by 60% when Agent HP drops below 70%.'],
  
  ['Stun', 'Knock', 'High-Speed Chainsaw', 'B', 600, 'Increases the duration enemies are stunned by 10%.'],
  ['Stun', 'Knock', 'Industrial Explosive', 'B', 600, 'Agents inflict 10% more Daze.'],
  ['Stun', 'Knock', 'Mini Handsaw', 'A', 1000, "Upon stunning an enemy, that enemy's Stun DMG Multiplier increases by 37.5%."],
  ['Stun', 'Knock', 'Multi-Function Circular Saw', 'A', 1000, 'Increases Agent DMG dealt to Stunned enemies by 45%.'],
  ['Stun', 'Knock', 'Portable Angle Grinder', 'A', 1000, 'Upon stunning an enemy, the whole squad recovers 5 Energy, 6 Adrenaline, or 5 Sharpness.'],
  ['Stun', 'Knock', 'Power Impact Drill', 'B', 600, 'Upon Stun recovery, the enemy accumulates 10% Daze.'],

  ['Support', 'Saturation', 'Energy Drink', 'A', 1000, 'EX Special Attack DMG increases by 44%, and Ultimate DMG increases by 44%.'],
  ['Support', 'Saturation', 'Lucky Cookie', 'A', 1000, 'When an Agent activates Ultimate, the whole squad recovers 17 Energy, 21 Adrenaline, 17 Sharpness. This effect can trigger once every 20s.'],
  ['Support', 'Saturation', 'Nutritional Can Food', 'A', 1000, 'Upon launching an EX Special Attack, the Agent deals 5% more DMG for 10s, stacking up to 5 times. Repeated triggers reset the duration.'],
  ['Support', 'Saturation', 'Quick-Heat Hot Pot', 'B', 600, 'Energy, Adrenaline, and Sharpness Generation Rate increase by 18%.'],
  ['Support', 'Saturation', 'Starlight Lollipop', 'B', 600, 'Increases Decibel Generation Rate by 23%.'],
  ['Support', 'Saturation', 'Sugar-Free Chocolate', 'B', 600, 'Increases Agent DMG dealt by 15%.'],

  ['General', null, 'Bomb Defuser', 'A', 1000, 'Vital View triggered by Evasive Assist lasts 5s longer. Defensive Assist inflicts 30% more Daze.'],
  ['General', null, 'Bubble Gun', 'A', 1000, 'Landing a critical hit increases Daze inflicted by the Agent by 15% for 3s.'],
  ['General', null, 'BUG Shield', 'B', 600, "When attacked, if the Agent's HP is below 25%, a shield that is equal to 15% of Max HP is generated for 10s. (This effect can only be triggered once by each Agent per combat encounter.)"],
  ['General', null, 'Demolition Hammer', 'A', 1000, "Triggering a Perfect Assist increases all squad members' Anomaly Buildup Rate by 25% for 10s."],
  ['General', null, 'Energy Restorer MKI', 'A', 1000, 'When triggering Chain Attack, Agents recover 5 Energy.'],
  ['General', null, 'Energy Restorer MKII', 'B', 600, 'EX Special Attack DMG increases by 15% and Daze inflicted increases by 10%.'],
  ['General', null, 'Falling Starsea Armor', 'A', 1000, "Hitting an enemy with an EX Special Attack generates a Shield equal to 10% of the Agent's Max HP for 10s. This effect can trigger once every 10s."],
  ['General', null, 'General File', 'A', 1000, 'Perfect Dodge is easier to trigger, and Dodge Counter DMG is increased by 15%.'],
  ['General', null, 'Hammer Drill', 'B', 600, "Triggering Perfect Assist increases all squad members' CRIT DMG by 20% for 10s."],
  ['General', null, 'Insect Catalog', 'B', 600, 'Attacks against enemies with less than 50% HP deal 15% more DMG.'],
  ['General', null, 'Like Subscribe Gun', 'B', 600, "Each non-critical hit increases the Agent's CRIT Rate by 6%. This effect is reset after the Agent triggers a critical hit."],
  ['General', null, 'Lucky Stars', 'A', 1000, "Launching an EX Special Attack increases the Agent's DMG by 5% for 30s, stacking up to 5 times. The duration of each stack is calculated separately."],
  ['General', null, 'Plant Catalog', 'A', 1000, 'Off-field Agents with 25% or lower HP slowly recover HP.'],
  ['General', null, 'Secret File', 'A', 1000, 'When attacked, quickly press Dodge to immediately break free and recover 50% of the DMG taken as HP. This effect can trigger once every 4s.'],
  ['General', null, 'Sword Catalog', 'A', 1000, 'Agents deal 25% more DMG but also take 15% more DMG.'],
  ['General', null, 'Three Glass Marbles', 'A', 1000, 'Increases the duration that enemies are stunned for by 15%.'],
  ['General', null, 'Tri-End Toy Stethoscope', 'B', 600, 'Increases Daze inflicted by EX Special Attack by 15%.'],
  ['General', null, 'Tripartite Battle Spinner', 'A', 1000, 'Activating Chain Attack grants 10% Decibels.'],
  ['General', null, 'Ultra Sacred Sword of Radiance', 'A', 1000, 'Shielded Agents deal 30% more DMG to enemies within 6m.'],
  ['General', null, 'Untitled Book', 'B', 600, 'Dodge Counter DMG increases by 30% and Daze inflicted increases by 15%.'],
  ['General', null, 'Water Gun', 'A', 1000, "Landing a critical hit increases the Agent's CRIT DMG by 3% for 10s, stacking up to 10 times. Repeated triggers reset the duration."],
];

export const SEED_RESONIA = ROWS.map(([category, subtype, name, rarity, price, effect, extraTags = []]) => ({
  name, category, subtype, rarity, price, effect, extraTags,
}));

// Observed refresh price ladder: 50, 100, 200, then 300 for every further refresh.
export const DEFAULT_REFRESH_LADDER = [50, 100, 200, 300];
