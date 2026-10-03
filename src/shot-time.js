// When a screenshot was taken, from its filename. Covers the common formats:
//   Windows        "Screenshot 2026-10-02 152530.png"
//   Steam          "20261002152530_1.png"
//   NVIDIA / misc  "Zenless Zone Zero Screenshot 2026.10.02 - 15.25.30.12.png"
//   ISO-ish        "zzz_2026-10-02T15-25-30.png"
// Returns epoch ms (local time) or null.
const STAMP = /(20\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?:[\sT_-]|\s-\s)*(\d{2})[-_.:]?(\d{2})[-_.:]?(\d{2})(?:[.,_-](\d{1,3})(?!\d))?/;

export function timeFromName(name) {
  const m = STAMP.exec(name || '');
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const frac = m[7] ? Number(m[7].padEnd(3, '0')) : 0;
  return new Date(y, mo - 1, d, h, mi, s, frac).getTime();
}

// Filename timestamp first; the file's modified time otherwise; "now" for pastes.
export function shotTime(file) {
  return timeFromName(file?.name) ?? (file?.lastModified || Date.now());
}

// Chronological order; ties broken by natural filename order.
export const byShotTime = (a, b) => a.time - b.time
  || (a.label || '').localeCompare(b.label || '', undefined, { numeric: true });
