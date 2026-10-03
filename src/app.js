import { SEED_RESONIA } from './resonia-db.js';
import { TAGS, tagsFor, matchCard } from './tagger.js';
import { CATEGORIES } from './ocr-core.js';
import { PRESETS, prefsFromPreset } from './presets.js';
import { planPath, scoreCard } from './optimizer.js';
import { timeFromName, shotTime, byShotTime } from './shot-time.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n, d = 1) => (n == null ? '–' : Number(n).toFixed(d));
const TAG_LABEL = Object.fromEntries(TAGS.map((t) => [t.id, t.label]));

const store = {
  get(k, d) { try { const v = localStorage.getItem('hz:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hz:' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ---- state ---------------------------------------------------------------
let prefs = { ...prefsFromPreset('Crit DPS (Attack)'), ...store.get('prefs', {}) };
// Database changes not yet written to src/resonia-db.js: new cards (orig = null)
// and edits to existing ones (orig = the card's name in the database file).
let pending = store.get('pending', null) ?? store.get('customCards', []).map((c) => ({ ...c, orig: null }));
const emptySlot = () => ({ name: '', price: null, rarity: 'B', category: 'General', effect: '' });
// Shop pages in the order seen: page i+1 is what appears after paying page i's refresh.
let run = store.get('run', null) || { startCoins: 0, continueUnknown: true, pages: [] };
for (const p of run.pages) if (typeof p.time !== 'number') p.time = timeFromName(p.label) ?? undefined; // pages saved before timestamps
let dbSort = { key: 'ratio', dir: -1 };

const db = () => {
  const byName = new Map(SEED_RESONIA.map((c) => [c.name.toLowerCase(), c]));
  for (const { orig, ...card } of pending) {
    if (orig) byName.delete(orig.toLowerCase());
    byName.set(card.name.toLowerCase(), { ...card, pending: orig ? 'edited' : 'new' });
  }
  return [...byName.values()];
};
const CARD_FIELDS = ['name', 'category', 'subtype', 'rarity', 'price', 'effect', 'extraTags'];
const sameCard = (a, b) => CARD_FIELDS.every((f) => JSON.stringify(a[f] ?? null) === JSON.stringify(b[f] ?? null));

// Apply a change to the card currently called `name`, recording it as pending.
function editCard(name, changes) {
  const key = name.toLowerCase();
  let entry = pending.find((p) => p.name.toLowerCase() === key);
  if (!entry) {
    const base = SEED_RESONIA.find((c) => c.name.toLowerCase() === key);
    if (!base) return;
    entry = { ...base, extraTags: [...(base.extraTags || [])], orig: base.name };
    pending.push(entry);
  }
  Object.assign(entry, changes);
  // Edited back to exactly what the file has: nothing pending any more.
  const seed = entry.orig && SEED_RESONIA.find((c) => c.name === entry.orig);
  if (seed && sameCard(seed, entry)) pending = pending.filter((p) => p !== entry);
}

function addPendingCard(card) {
  pending = pending.filter((p) => p.name.toLowerCase() !== card.name.toLowerCase());
  pending.push({ ...card, orig: null });
}

const pendingCounts = () => ({
  added: pending.filter((p) => !p.orig).length,
  edited: pending.filter((p) => p.orig).length,
});
const findCard = (name) => db().find((c) => c.name.toLowerCase() === (name || '').trim().toLowerCase());

// A shop slot resolved to a full card (database entry, with the slot's price if set).
function slotCard(slot) {
  if (!slot.name) return null;
  const known = findCard(slot.name);
  if (known) return { ...known, price: slot.price || known.price, known: true };
  return { name: slot.name, category: slot.category, rarity: slot.rarity, price: slot.price || (slot.rarity === 'A' ? 1000 : 600), effect: slot.effect, known: false };
}

const save = () => { store.set('prefs', prefs); store.set('run', run); store.set('pending', pending); renderUpdateButton(); };

// ---- preferences panel ----------------------------------------------------
const info = (tip) => `<span class="info" tabindex="0" role="note" aria-label="${esc(tip)}" data-tip="${esc(tip)}">i</span>`;

function slider(id, label, value, { max = 5, step = 1, dot, tip } = {}) {
  // A div, not a <label>: clicks on the info icon must not reach the slider.
  return `<div class="slider">
    <span>${dot ? `<span class="dot" style="background:var(--${dot})"></span>` : ''}${esc(label)}${tip ? info(tip) : ''}</span>
    <input type="range" min="0" max="${max}" step="${step}" value="${value}" data-pref="${id}" aria-label="${esc(label)}">
    <output>${value}</output></div>`;
}

// Sidebar sections are collapsible; which ones are closed survives reloads.
let closedSections = new Set(store.get('closedSections', []));
const section = (key, title, body) => `<details class="sect" data-sect="${key}" ${closedSections.has(key) ? '' : 'open'}>
  <summary>${title}</summary><div class="sect-body">${body}</div></details>`;

function renderPrefs() {
  $('#prefs').innerHTML = [
    section('preset', 'Build preset', `<select id="preset">${Object.keys(PRESETS).map((p) => `<option ${p === prefs.preset ? 'selected' : ''}>${esc(p)}</option>`).join('')}
      ${PRESETS[prefs.preset] ? '' : '<option selected>Custom</option>'}</select>`),
    section('cats', 'Resonium category focus <span class="hint">match your team</span>',
      CATEGORIES.map((c) => slider('cat:' + c, c, prefs.categoryWeights[c] ?? 0, { dot: c })).join('')),
    section('tags', 'Stat priorities <span class="hint">0 = ignore · 5 = must have</span>',
      TAGS.map((t) => slider('tag:' + t.id, t.label, prefs.tagWeights[t.id] ?? 0)).join('')),
    section('tuning', 'Tuning', `
      ${slider('rarityA', 'A-rank strength ×', prefs.rarityA, { max: 3, step: 0.1, tip: 'How much stronger an A-rank card is than a B-rank one. A cards cost 1000 vs 600, so 1.7 makes them equal value per coin.' })}
      ${slider('conditionalFactor', 'Conditional effects ×', prefs.conditionalFactor, { max: 1, step: 0.05, tip: 'Discount for effects that only apply sometimes ("when…", "upon…", "for 10s"). 1 = as good as an always-on stat.' })}
      ${slider('carryValue', 'Leftover coins (pts / 1000)', prefs.carryValue, { max: 10, step: 0.5, tip: 'What unspent coins are worth when you leave the shop. 0 = spend everything here; raise it to save coins for a later shop in the run.' })}
      ${slider('gearBonus', 'Gear set bonus (pts)', prefs.gearBonus ?? 20, { max: 50, step: 1, tip: 'Your gear grants a bonus for every 2 resonia of its category you carry. This is what each completed pair is worth, compared with card scores (a strong A card is about 10). 0 ignores gear.' })}
      <div class="field"><span>Refresh price ladder ${info('Refresh prices assumed for pages beyond your last screenshot, in order. The last value repeats. Observed: 50, 100, 200, then 300 each time.')}</span>
        <input type="text" id="ladder" value="${prefs.refreshLadder.join(', ')}" aria-label="Refresh price ladder"></div>`),
  ].join('') + '<button class="btn" id="reset-prefs">Reset to preset</button>';
}

$('#prefs').addEventListener('toggle', (e) => {
  const key = e.target.dataset?.sect;
  if (!key) return;
  if (e.target.open) closedSections.delete(key); else closedSections.add(key);
  store.set('closedSections', [...closedSections]);
}, true);

$('#prefs').addEventListener('input', (e) => {
  const key = e.target.dataset.pref;
  if (!key) return;
  const v = parseFloat(e.target.value);
  e.target.nextElementSibling.value = v;
  if (key.startsWith('tag:')) prefs.tagWeights[key.slice(4)] = v;
  else if (key.startsWith('cat:')) prefs.categoryWeights[key.slice(4)] = v;
  else prefs[key] = v;
  if (key.startsWith('tag:') || key.startsWith('cat:')) {
    prefs.preset = 'Custom';
    const sel = $('#preset');
    if (![...sel.options].some((o) => o.value === 'Custom')) sel.add(new Option('Custom', 'Custom', true, true));
    sel.value = 'Custom';
  }
  save(); scheduleRecompute();
});
$('#prefs').addEventListener('change', (e) => {
  if (e.target.id === 'preset' && PRESETS[e.target.value]) {
    prefs = { ...prefsFromPreset(e.target.value), carryValue: prefs.carryValue, refreshLadder: prefs.refreshLadder, overrides: prefs.overrides, rarityA: prefs.rarityA, conditionalFactor: prefs.conditionalFactor, gearBonus: prefs.gearBonus };
  } else if (e.target.id === 'ladder') {
    const ladder = e.target.value.split(/[,\s]+/).map(Number).filter((n) => n > 0);
    if (ladder.length) prefs.refreshLadder = ladder;
  } else return;
  save(); renderPrefs(); recompute();
});
$('#prefs').addEventListener('click', async (e) => {
  if (e.target.id !== 'reset-prefs') return;
  const preset = PRESETS[prefs.preset] ? prefs.preset : 'Crit DPS (Attack)';
  const ok = await confirmDialog('Reset to preset?',
    `All stat priorities, category focus and tuning values go back to the “${esc(preset)}” defaults. Your Always/Never card rules are kept.`, 'Reset');
  if (!ok) return;
  prefs = { ...prefsFromPreset(preset), overrides: prefs.overrides };
  save(); renderPrefs(); recompute();
});

// Promise-based confirmation popup (native <dialog>; Esc / Cancel resolve false).
function confirmDialog(title, body, okLabel = 'Confirm') {
  const dlg = $('#confirm');
  $('#confirm-title').textContent = title;
  $('#confirm-body').innerHTML = body;
  $('#confirm-ok').textContent = okLabel;
  dlg.returnValue = '';
  dlg.showModal();
  return new Promise((resolve) => dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true }));
}

// ---- pages & path -----------------------------------------------------------
let lastPath = null;
let timer = null;
const scheduleRecompute = () => { clearTimeout(timer); timer = setTimeout(recompute, 60); };
const ordinal = (n) => ['1st', '2nd', '3rd', '4th', '5th'][n] || `${n + 1}th`;

function recompute() {
  const pages = run.pages.map((p) => ({ refreshCost: p.refreshCost || 0, cards: p.slots.map(slotCard) }));
  const g = currentGear();
  lastPath = planPath({
    startCoins: run.startCoins || 0, pages, pool: db(), prefs, continueUnknown: run.continueUnknown,
    gear: g.category ? { category: g.category, owned: g.owned ?? 0, bonus: prefs.gearBonus ?? 20 } : null,
  });
  lastPath.gear = g;
  lastPath.pages = pages;
  renderPath();
  renderPages();
  if (!$('#view-db').classList.contains('hidden')) renderDb();
}

function renderPath() {
  const { steps, pages, total } = lastPath;
  if (!pages.length) {
    $('#path').innerHTML = '<h2>No pages yet</h2><p class="summary">Add your shop screenshots in order, or load the 20 sample pages, to get the purchase path.</p>';
    return;
  }
  const hops = steps.map((st) => {
    const label = st.buy.length ? 'Buy ' + st.buy.map((b) => `#${b + 1}`).join(' ') : 'Skip';
    return `<a class="hop ${st.buy.length ? 'buy' : 'skip'}" href="#page-${st.page + 1}"><b>Page ${st.page + 1}</b><span>${label}</span></a>`;
  });
  const last = steps[steps.length - 1];
  const end = last.action === 'refresh-unknown'
    ? `<span class="hop buy"><b>After p${last.page + 1}</b><span>Keep refreshing</span></span>`
    : `<span class="hop stop"><b>After p${last.page + 1}</b><span>Stop</span></span>`;
  const bought = steps.flatMap((st) => st.buy.map((b) => `${pages[st.page].cards[b].name} (p${st.page + 1})`));
  const spent = steps.reduce((a, st) => a + st.cost, 0);
  const refreshes = steps.filter((st) => st.action === 'refresh').reduce((a, st) => a + pages[st.page].refreshCost, 0);
  const sentence = steps.map((st) => (st.buy.length
    ? `buy the ${st.buy.map(ordinal).join(', ').replace(/, ([^,]*)$/, ' and $1')} card${st.buy.length > 1 ? 's' : ''} on page ${st.page + 1}`
    : `skip page ${st.page + 1}`));
  $('#path').innerHTML = `
    <h2>Best path</h2>
    <div class="trail">${[...hops, end].join('<span class="arrow">→</span>')}</div>
    <p class="summary">${esc(sentence.join(', '))}, then ${last.action === 'stop' ? 'stop' : 'keep refreshing into new pages'}.<br>
      Budget: <b>${run.startCoins}</b> = <b>${refreshes}</b> on refreshes ${last.page ? `to reach page ${last.page + 1}` : '(none needed)'}
      + <b>${spent}</b> on ${bought.length} card${bought.length === 1 ? '' : 's'} + <b>${last.coinsAfter}</b> left · total value <b>${fmt(total)}</b> pts.
      ${bought.length ? '<br>' + esc(bought.join(' · ')) : ''}
      ${gearLine(steps, lastPath.gear)}</p>
    <p class="explain">Pages are treated as a fixed sequence: page n+1 is what the shop shows after paying page n's refresh price, whatever you bought.
      ${run.continueUnknown ? `Past the last page, the plan assumes 5 random cards from the ${db().length}-card database per refresh (prices ${prefs.refreshLadder.join(' → ')}…).` : ''}
      Leftover coins are worth ${prefs.carryValue} pts per 1000. Grayed cards add nothing to your current priorities.</p>`;
}

function gearLine(steps, g) {
  if (!g.category) return '<br>Gear: none set — pick one above if your run has gear.';
  const sets = steps.reduce((a, st) => a + st.setBonuses, 0);
  const end = steps[steps.length - 1].gearOwned;
  const src = g.choice === 'auto' ? ` (detected on page ${g.auto.page + 1})` : '';
  const result = sets
    ? `this path completes <b>${sets}</b> more set bonus${sets > 1 ? 'es' : ''} (${g.owned} → ${end} owned).`
    : `this path adds no set bonus (${g.owned} owned${g.owned % 2 ? ' — the next one completes a pair' : ''}).`;
  return `<br>Gear: <b>${esc(g.category)}</b>${src} — ${result}`;
}

function cardHtml(card, slot, score, buy) {
  if (!card) {
    return `<div class="card empty" data-slot="${slot}"><input class="name" list="db-names" placeholder="Card name…" data-field="name"></div>`;
  }
  const tags = tagsFor(card);
  // Gear-category cards still feed the set bonus, so they're never grayed out.
  return `<div class="card ${buy ? 'buy' : ''} ${score === 0 && !lastPath.isGear(card) ? 'zero' : ''}" data-slot="${slot}" style="--cat:var(--${card.category || 'General'})">
    ${buy ? '<span class="badge-buy">BUY</span>' : ''}
    <div class="card-top"><span class="rar ${card.rarity}">${card.rarity || '?'}</span>#${slot + 1} · ${esc(card.category)}</div>
    <input class="name" list="db-names" value="${esc(card.name)}" data-field="name" title="${esc(card.effect)}">
    ${card.known ? '' : '<div class="unknown">Not in database <button class="mini-btn" data-act="learn">save</button></div>'}
    <p class="effect">${esc(card.effect)}</p>
    <div class="chips">${lastPath.isGear(card) ? '<span class="chip gear" title="Counts toward your gear\'s 2-card set bonus">Gear set</span>' : ''}${tags.map((t) => `<span class="chip ${(prefs.tagWeights[t] ?? 0) >= 3 ? 'hot' : ''}">${esc(TAG_LABEL[t])}</span>`).join('')}</div>
    <div class="card-row"><label><input type="number" step="50" min="0" value="${card.price ?? ''}" data-field="price"></label>
      <span class="score">${fmt(score)}<span class="muted" style="font-size:11px"> pts</span></span></div>
  </div>`;
}

function renderPages() {
  const { steps, pages, scores } = lastPath;
  const stepByPage = Object.fromEntries(steps.map((st) => [st.page, st]));
  $('#pages').innerHTML = run.pages.map((p, i) => {
    const st = stepByPage[i];
    const verdict = !st ? '<span class="verdict-tag">Not reached</span>'
      : st.buy.length ? `<span class="verdict-tag buy">Buy ${st.buy.map((b) => '#' + (b + 1)).join(' + ')}</span>`
        : '<span class="verdict-tag">Skip</span>';
    const bonus = st?.setBonuses ? `<span class="verdict-tag gear">+${st.setBonuses} gear set bonus (${st.gearOwned} owned)</span>` : '';
    const then = bonus + (!st ? '' : st.action === 'stop' ? '<span class="verdict-tag stop">Then stop</span>'
      : st.action === 'refresh-unknown' ? '<span class="verdict-tag">Then keep refreshing</span>' : '');
    return `<div class="panel page ${st ? '' : 'unreached'}" id="page-${i + 1}" data-page="${i}">
      <div class="page-head"><span class="pnum">Page ${i + 1}</span>${verdict}${then}
        ${st ? `<span class="muted">${st.coinsBefore} → ${st.coinsAfter} coins</span>` : ''}
        <span class="spacer"></span>
        <label>Refresh price <input type="number" step="50" min="0" value="${p.refreshCost ?? ''}" data-field="refreshCost"></label>
        ${p.label ? `<span class="muted" title="${esc(p.label)}">${esc(p.label.replace(/^Screenshot\s*/, '').slice(0, 22))}</span>` : ''}
        <button class="x" data-act="remove" title="Remove page">✕</button></div>
      <div class="cards">${p.slots.map((slot, j) => cardHtml(pages[i].cards[j], j, scores[i][j], st?.buy.includes(j))).join('')}</div>
    </div>`;
  }).join('');
}

$('#pages').addEventListener('change', (e) => {
  const el = e.target.closest('[data-field]');
  const pageEl = e.target.closest('[data-page]');
  if (!el || !pageEl) return;
  const page = run.pages[+pageEl.dataset.page];
  const f = el.dataset.field;
  if (f === 'refreshCost') page.refreshCost = parseInt(el.value, 10) || 0;
  else {
    const slot = page.slots[+e.target.closest('[data-slot]').dataset.slot];
    if (f === 'price') slot.price = parseInt(el.value, 10) || null;
    if (f === 'name') { slot.name = el.value.trim(); slot.price = findCard(slot.name)?.price ?? slot.price; }
  }
  save(); recompute();
});
$('#pages').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const i = +btn.closest('[data-page]').dataset.page;
  if (btn.dataset.act === 'remove') run.pages.splice(i, 1);
  if (btn.dataset.act === 'learn') {
    const card = slotCard(run.pages[i].slots[+btn.closest('[data-slot]').dataset.slot]);
    addPendingCard({ name: card.name, category: card.category, subtype: null, rarity: card.rarity, price: card.price, effect: card.effect || '', extraTags: [] });
    renderDatalist();
  }
  save(); recompute();
});

// Gear: the resonium category whose "Owned" counter is highlighted in the shop.
// Auto-detected from the earliest page that shows it; can be overridden.
function detectGear() {
  for (const p of run.pages) {
    for (const slot of p.slots) {
      if (!slot.gear) continue;
      const card = slotCard(slot);
      if (card && card.category !== 'General') return { category: card.category, owned: slot.owned ?? null, page: run.pages.indexOf(p) };
    }
  }
  return null;
}
function currentGear() {
  const auto = detectGear();
  const choice = run.gearChoice || 'auto';
  const category = choice === 'auto' ? auto?.category ?? null : choice === 'none' ? null : choice;
  const autoOwned = auto && auto.category === category ? auto.owned : null;
  return { category, owned: run.gearOwned ?? autoOwned ?? 0, auto, choice };
}

function syncWallet() {
  $('#coins').value = run.startCoins;
  $('#unknown').checked = run.continueUnknown;
  const g = currentGear();
  $('#gear').innerHTML = [
    `<option value="auto">Auto${g.auto ? ` — ${esc(g.auto.category)} (page ${g.auto.page + 1})` : ' — not detected'}</option>`,
    '<option value="none">None</option>',
    ...CATEGORIES.filter((c) => c !== 'General').map((c) => `<option value="${c}">${c}</option>`),
  ].join('');
  $('#gear').value = g.choice;
  $('#gear-owned').value = g.category ? g.owned : '';
  $('#gear-owned').disabled = !g.category;
}
$('#gear').addEventListener('change', (e) => { run.gearChoice = e.target.value; run.gearOwned = null; save(); syncWallet(); recompute(); });
$('#gear-owned').addEventListener('input', (e) => {
  run.gearOwned = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0);
  save(); scheduleRecompute();
});
$('#coins').addEventListener('input', (e) => { run.startCoins = parseInt(e.target.value, 10) || 0; save(); scheduleRecompute(); });
$('#unknown').addEventListener('change', (e) => { run.continueUnknown = e.target.checked; save(); recompute(); });
$('#clear-pages').addEventListener('click', () => { run.pages = []; run.gearOwned = null; save(); syncWallet(); recompute(); setStatus('Pages cleared.'); });

// ---- screenshot input -----------------------------------------------------
function setStatus(text, cls = '') { const s = $('#ocr-status'); s.textContent = text; s.className = cls; }

// OCR result -> page, snapping each card to the database when it matches.
function pageFromShop(res, label, time) {
  const all = db();
  let unknown = 0;
  const slots = res.cards.map((c) => {
    const m = matchCard(c, all);
    const counter = { owned: c.owned ?? null, gear: c.gear ?? null };
    if (m.card) return { ...emptySlot(), ...counter, name: m.card.name, price: c.price || m.card.price };
    unknown++;
    return { ...emptySlot(), ...counter, name: c.name || c.titleRaw || '', price: c.price, rarity: c.rarity || 'B', category: c.category || 'General', effect: c.desc };
  });
  return { page: { label, time, coinsShown: res.coins, refreshCost: res.refreshCost || 0, slots }, unknown };
}

// New pages are merged in screenshot-time order, so a later batch of older
// screenshots still lands in the right place. Starting coins follow page 1.
function addPages(newPages) {
  const firstBefore = run.pages[0];
  run.pages.push(...newPages);
  if (run.pages.every((p) => typeof p.time === 'number')) run.pages.sort(byShotTime);
  if (run.pages[0] !== firstBefore && run.pages[0]?.coinsShown != null) run.startCoins = run.pages[0].coinsShown;
  save(); syncWallet(); recompute();
}

async function ingest(files) {
  try {
    const { readShopFromBlob } = await import('./browser-ocr.js');
    const blobs = files.map((blob) => ({ blob, time: shotTime(blob), label: blob.name || `Pasted ${new Date().toLocaleTimeString()}` }))
      .sort(byShotTime);
    const added = []; let unknown = 0;
    for (const [n, { blob, time, label }] of blobs.entries()) {
      const tag = blobs.length > 1 ? `Page ${n + 1}/${blobs.length}: ` : '';
      const res = await readShopFromBlob(blob, (m) => setStatus(tag + m, 'busy'));
      const r = pageFromShop(res, label, time);
      added.push(r.page); unknown += r.unknown;
    }
    addPages(added);
    setStatus(`Added ${added.length} page${added.length > 1 ? 's' : ''}, ordered by screenshot time.` + (unknown ? ` ${unknown} card(s) not in the database — check the ones marked in orange.` : ' All cards recognised.'));
  } catch (err) {
    console.error(err);
    setStatus('Could not read that image: ' + err.message, 'err');
  }
}

$('#load-demo').addEventListener('click', async () => {
  const dump = await (await fetch('data/ocr-dump.json')).json();
  run.pages = [];
  addPages(dump.map((shot) => pageFromShop(shot, shot.file, timeFromName(shot.file)).page));
  setStatus(`Loaded ${dump.length} sample pages.`);
});

const drop = $('#drop');
$('#pick').addEventListener('click', (e) => { e.stopPropagation(); $('#file').click(); });
drop.addEventListener('click', () => $('#file').click());
$('#file').addEventListener('change', (e) => {
  const files = [...e.target.files];
  if (files.length) ingest(files);
  e.target.value = '';
});
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('over');
  const files = [...e.dataTransfer.files].filter((x) => x.type.startsWith('image/'));
  if (files.length) ingest(files);
});
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'));
  if (item) { e.preventDefault(); ingest([item.getAsFile()]); }
});

// ---- database view --------------------------------------------------------
function renderDatalist() { $('#db-names').innerHTML = db().map((c) => `<option value="${esc(c.name)}">`).join(''); }

const isCut = (c) => /…|\.\.\.\s*$/.test(c.effect || '');
const options = (list, value) => list.map((v) => `<option ${v === value ? 'selected' : ''}>${v}</option>`).join('');

function renderDb() {
  const q = $('#db-filter').value.trim().toLowerCase();
  const onlyCut = $('#db-cut').checked;
  const all = db();
  const rows = all.map((c) => {
    const tags = tagsFor(c);
    const score = scoreCard(c, prefs);
    return { c, tags, score, ratio: score / c.price * 1000 };
  }).filter(({ c, tags }) => (!onlyCut || isCut(c))
    && (!q || [c.name, c.category, c.subtype, c.effect, ...tags.map((t) => TAG_LABEL[t])].join(' ').toLowerCase().includes(q)));
  const k = dbSort.key;
  rows.sort((a, b) => {
    const va = k === 'score' || k === 'ratio' ? a[k] : a.c[k], vb = k === 'score' || k === 'ratio' ? b[k] : b.c[k];
    return (va > vb ? 1 : va < vb ? -1 : 0) * dbSort.dir;
  });
  $('#db-count').textContent = `${rows.length} of ${all.length} resonia · ${all.filter(isCut).length} with cut-off effects · ranked for “${prefs.preset}”`;
  const th = (key, label, cls = '') => `<th data-sort="${key}" class="${cls}">${label}${dbSort.key === key ? (dbSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  $('#db-table').innerHTML = `<thead><tr>${th('name', 'Name')}${th('category', 'Category')}${th('rarity', 'Rank')}${th('price', 'Price', 'num')}<th>Effect <span class="hint">(edit to complete “…”)</span></th><th>Stats</th>${th('score', 'Score', 'num')}${th('ratio', 'Pts/1000c', 'num')}<th>Rule</th></tr></thead>
    <tbody>${rows.map(({ c, tags, score, ratio }) => `<tr data-name="${esc(c.name)}" class="${c.pending ? 'pending' : ''}">
      <td><input class="cell name-cell" data-edit="name" value="${esc(c.name)}" aria-label="Name">
        ${c.pending ? `<div class="row-status"><span class="chip ${c.pending}">${c.pending}</span><button class="link" data-act="revert">${c.pending === 'new' ? 'discard' : 'revert'}</button></div>` : ''}</td>
      <td><span class="catdot" style="background:var(--${c.category})"></span><select class="cell" data-edit="category" aria-label="Category">${options(CATEGORIES, c.category)}</select>
        <input class="cell sub-cell" data-edit="subtype" value="${esc(c.subtype || '')}" placeholder="subtype" aria-label="Subtype"></td>
      <td><select class="cell" data-edit="rarity" aria-label="Rank">${options(['A', 'B', 'S'], c.rarity)}</select></td>
      <td class="num"><input class="cell price-cell" type="number" step="50" min="50" data-edit="price" value="${c.price}" aria-label="Price"></td>
      <td class="eff"><textarea class="cell eff-cell ${isCut(c) ? 'cut' : ''}" data-edit="effect" rows="2" aria-label="Effect">${esc(c.effect)}</textarea></td>
      <td><div class="chips">${tags.map((t) => `<span class="chip ${(prefs.tagWeights[t] ?? 0) >= 3 ? 'hot' : ''}">${esc(TAG_LABEL[t])}</span>`).join('')}</div></td>
      <td class="num">${fmt(score)}</td><td class="num">${fmt(ratio)}</td>
      <td><select data-ovr="${esc(c.name)}">${[['', '—'], ['must', 'Always'], ['skip', 'Never']].map(([v, l]) => `<option value="${v}" ${(prefs.overrides[c.name] || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
    </tr>`).join('')}</tbody>`;
}
$('#db-filter').addEventListener('input', renderDb);
$('#db-cut').addEventListener('change', renderDb);
$('#db-table').addEventListener('click', (e) => {
  const key = e.target.closest('th[data-sort]')?.dataset.sort;
  if (key) {
    dbSort = { key, dir: dbSort.key === key ? -dbSort.dir : (key === 'name' || key === 'category' ? 1 : -1) };
    renderDb();
    return;
  }
  if (e.target.dataset.act === 'revert') {
    const name = e.target.closest('tr').dataset.name;
    const entry = pending.find((p) => p.name === name);
    pending = pending.filter((p) => p !== entry);
    if (entry?.orig && entry.orig !== entry.name) renameEverywhere(entry.name, entry.orig);
    save(); renderDatalist(); recompute(); renderDb();
  }
});

// Keep shop pages and Always/Never rules pointing at a renamed card.
function renameEverywhere(from, to) {
  for (const p of run.pages) for (const s of p.slots) if (s.name === from) s.name = to;
  if (prefs.overrides[from]) { prefs.overrides[to] = prefs.overrides[from]; delete prefs.overrides[from]; }
}

$('#db-table').addEventListener('change', (e) => {
  const ovr = e.target.dataset.ovr;
  if (ovr != null) {
    if (e.target.value) prefs.overrides[ovr] = e.target.value; else delete prefs.overrides[ovr];
    save(); recompute();
    return;
  }
  const field = e.target.dataset.edit;
  if (!field) return;
  const name = e.target.closest('tr').dataset.name;
  let value = e.target.value;
  if (field === 'price') value = Math.max(50, Math.round((parseInt(value, 10) || 0) / 50) * 50);
  if (field === 'subtype') value = value.trim() || null;
  if (field === 'name') {
    value = value.trim();
    const taken = db().some((c) => c.name.toLowerCase() === value.toLowerCase() && c.name !== name);
    if (!value || taken) { e.target.value = name; return; }
  }
  if (field === 'effect') value = value.trim();
  const isNew = pending.find((p) => p.name === name && !p.orig);
  if (isNew) Object.assign(isNew, { [field]: value }); else editCard(name, { [field]: value });
  if (field === 'name') renameEverywhere(name, value);
  save(); renderDatalist(); recompute(); renderDb();
});

// ---- write pending changes into src/resonia-db.js -------------------------
function renderUpdateButton() {
  const { added, edited } = pendingCounts();
  const parts = [added && `${added} new`, edited && `${edited} edited`].filter(Boolean);
  $('#update-db').disabled = !parts.length;
  $('#update-db-note').textContent = parts.length ? `${parts.join(' · ')} card${added + edited > 1 ? 's' : ''} to update` : 'database up to date';
  $('#update-db-note').classList.remove('err');
}

$('#update-db').addEventListener('click', async () => {
  const { added, edited } = pendingCounts();
  const list = pending.map((p) => `<li><b>${esc(p.name)}</b> — ${p.orig ? (p.orig !== p.name ? `edited (was ${esc(p.orig)})` : 'edited') : 'new'}</li>`).join('');
  const ok = await confirmDialog('Update database?',
    `This writes ${added ? `<b>${added}</b> new` : ''}${added && edited ? ' and ' : ''}${edited ? `<b>${edited}</b> edited` : ''} card${added + edited > 1 ? 's' : ''} into <code>src/resonia-db.js</code>.
     The current file is backed up to <code>data/backups/</code> first.<ul class="change-list">${list}</ul>`, 'Update database');
  if (!ok) return;
  const cards = db().map((c) => Object.fromEntries(CARD_FIELDS.map((f) => [f, f === 'extraTags' ? c.extraTags || [] : c[f] ?? null])));
  try {
    const res = await fetch('/api/resonia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cards }) });
    if (!res.ok) throw new Error(await res.text() || res.statusText);
    pending = [];
    store.set('pending', pending);
    location.reload(); // pick up the rewritten database module
  } catch (err) {
    $('#update-db-note').textContent = `Update failed: ${err.message}`;
    $('#update-db-note').classList.add('err');
  }
});

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $('#view-shop').classList.toggle('hidden', t.dataset.tab !== 'shop');
  $('#view-db').classList.toggle('hidden', t.dataset.tab !== 'db');
  if (t.dataset.tab === 'db') renderDb();
}));

// ---- boot -----------------------------------------------------------------
renderPrefs();
renderDatalist();
renderUpdateButton();
syncWallet();
recompute();
if (!store.get('run', null)) $('#load-demo').click();
