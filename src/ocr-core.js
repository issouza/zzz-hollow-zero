// Environment-agnostic screenshot layout + pixel preprocessing for the Lost Void
// Bangboo shop. Works on plain RGBA buffers ({width, height, data}) so the same
// code runs in the browser (canvas) and in Node (pngjs).

// Reference layout measured on 1920x1080 screenshots.
const REF_W = 1920;
const REF_H = 1080;
const CARD_X = [50, 440, 830, 1220, 1610];

const REGIONS = {
  coins: [1640, 28, 160, 50],
  refresh: [1540, 1008, 75, 44],
};
// Card-relative regions: [dx, y, w, h]
const CARD_REGIONS = {
  title: [18, 492, 296, 46],
  desc: [18, 538, 296, 124],
  price: [100, 738, 170, 40],
  badge: [195, 405, 60, 60],
  swatch: [20, 300, 60, 60],
  owned: [248, 680, 70, 40], // "Owned: x05" digits (resonium cards only; General cards have none)
};

export function layoutFor(width, height) {
  const scale = height / REF_H;
  const ox = (width - REF_W * scale) / 2; // keeps the centred UI aligned on non-16:9 screens
  const map = ([x, y, w, h]) => [
    Math.round(ox + x * scale), Math.round(y * scale),
    Math.round(w * scale), Math.round(h * scale),
  ];
  return {
    coins: map(REGIONS.coins),
    refresh: map(REGIONS.refresh),
    cards: CARD_X.map((cx) => Object.fromEntries(
      Object.entries(CARD_REGIONS).map(([k, [dx, y, w, h]]) => [k, map([cx + dx, y, w, h])]),
    )),
  };
}

export function crop(img, [x, y, w, h]) {
  x = Math.max(0, x); y = Math.max(0, y);
  w = Math.min(w, img.width - x); h = Math.min(h, img.height - y);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let r = 0; r < h; r++) {
    const src = ((y + r) * img.width + x) * 4;
    out.set(img.data.subarray(src, src + w * 4), r * w * 4);
  }
  return { width: w, height: h, data: out };
}

// Text in the shop is white or bright green on dark panels. Binarise on
// brightness of the green channel and output black-on-white, upscaled, which
// is what Tesseract reads best.
export function binarize(img, { threshold = 150, upscale = 2, anyColor = false } = {}) {
  const W = img.width * upscale, H = img.height * upscale;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const si = ((Math.floor(y / upscale)) * img.width + Math.floor(x / upscale)) * 4;
      const r = img.data[si], g = img.data[si + 1], b = img.data[si + 2];
      // anyColor: red "can't afford" prices are bright only in the red channel.
      const lum = anyColor ? Math.max(r, g, b) : Math.max(g, (r + g + b) / 3);
      const v = lum >= threshold ? 0 : 255;
      const di = (y * W + x) * 4;
      out[di] = out[di + 1] = out[di + 2] = v; out[di + 3] = 255;
    }
  }
  return { width: W, height: H, data: out };
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

// Average hue of the most saturated pixels in a region.
export function dominantHue(img) {
  let sx = 0, sy = 0, n = 0, satSum = 0, total = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const [h, s, v] = rgbToHsv(img.data[i], img.data[i + 1], img.data[i + 2]);
    total++; satSum += s;
    if (s > 0.45 && v > 0.35) {
      sx += Math.cos(h * Math.PI / 180); sy += Math.sin(h * Math.PI / 180); n++;
    }
  }
  if (!n) return { hue: null, sat: satSum / total, coverage: 0 };
  let hue = Math.atan2(sy, sx) * 180 / Math.PI; if (hue < 0) hue += 360;
  return { hue, sat: satSum / total, coverage: n / total };
}

// Rarity badge: A = magenta/pink, B = blue. Counted in tight hue bands so the
// card's own background colour (red/orange/purple/yellow) doesn't leak in.
export function rarityFromBadge(img) {
  let a = 0, b = 0, s = 0;
  const n = img.data.length / 4;
  for (let i = 0; i < img.data.length; i += 4) {
    const [h, sat, v] = rgbToHsv(img.data[i], img.data[i + 1], img.data[i + 2]);
    if (sat < 0.5 || v < 0.5) continue;
    if (h >= 305 && h <= 345) a++;
    else if (h >= 185 && h <= 225) b++;
  }
  if (Math.max(a, b) / n < 0.03) return null;
  return a > b ? 'A' : 'B';
}

// The owned counter's digits are yellow normally and orange (with an orange
// outline) on the category that matches the equipped gear. Judged on the
// digits only, so orange Stun / yellow Rupture card backgrounds don't interfere.
export function gearHighlight(img) {
  let orange = 0, yellow = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    const [h, s, v] = rgbToHsv(img.data[i], img.data[i + 1], img.data[i + 2]);
    if (s < 0.7 || v < 0.85) continue;
    if (h >= 20 && h < 42) orange++;
    else if (h >= 42 && h < 65) yellow++;
  }
  if (orange + yellow < 30) return null; // no counter visible
  return orange > yellow;
}

// Card background colour hints at the category when OCR misses the [Tag].
export function categoryFromSwatch(img) {
  const { hue, sat } = dominantHue(img);
  if (hue == null || sat < 0.2) return 'General';
  if (hue < 18 || hue >= 330) return 'Attack';
  if (hue < 40) return 'Stun';
  if (hue < 70) return 'Rupture';
  if (hue < 170) return 'Support';
  if (hue < 240) return 'Defense';
  return 'Anomaly';
}

export function parseNumber(text) {
  const digits = (text || '').replace(/[oO]/g, '0').replace(/[^0-9]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

export const CATEGORIES = ['Attack', 'Stun', 'Anomaly', 'Support', 'Defense', 'Rupture', 'Armorer', 'General'];

// "[Attack: Eradication] Total Eradication" -> { category, subtype, name }
export function parseTitle(raw) {
  const text = (raw || '').replace(/\$/g, 'S').replace(/\s+/g, ' ').trim();
  const m = text.match(/[\[(]\s*([A-Za-z]+)\s*:?\s*([A-Za-z ]*?)\s*[\])]\s*(.*)$/);
  if (!m) return { category: null, subtype: null, name: tidyName(text) };
  const cat = CATEGORIES.find((c) => c.toLowerCase() === m[1].toLowerCase()) || null;
  return { category: cat, subtype: m[2] || null, name: tidyName(m[3]) };
}

// Drop OCR debris such as stray "l", "|", "#" tokens around the name.
function tidyName(s) {
  return s.split(' ').filter((w) => /[A-Za-z0-9]{2,}/.test(w) || /^[A-Z]$/.test(w)).join(' ').trim();
}

export function cleanText(raw) {
  return (raw || '').replace(/\s+/g, ' ').replace(/[|]/g, 'l').trim();
}
