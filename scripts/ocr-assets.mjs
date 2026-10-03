// Runs the shop reader over every screenshot in assets/ and writes the raw
// results to data/ocr-dump.json. Used to seed and verify the resonium database.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { createWorker, PSM } from 'tesseract.js';
import { readShop } from '../src/shop-reader.js';

const dir = process.argv[2] || 'assets';
const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort();
const worker = await createWorker('eng', 1, { langPath: path.resolve('vendor/lang'), cachePath: 'vendor/lang', gzip: false });

const recognize = async (rgba, { digits, singleLine }) => {
  const png = new PNG({ width: rgba.width, height: rgba.height });
  png.data = Buffer.from(rgba.data.buffer);
  await worker.setParameters({
    tessedit_pageseg_mode: singleLine ? PSM.SINGLE_LINE : PSM.SINGLE_BLOCK,
    tessedit_char_whitelist: digits ? '0123456789' : '',
  });
  const { data } = await worker.recognize(PNG.sync.write(png));
  return data.text;
};

const out = [];
for (const f of files) {
  const png = PNG.sync.read(fs.readFileSync(path.join(dir, f)));
  const shop = await readShop({ width: png.width, height: png.height, data: png.data }, recognize);
  out.push({ file: f, ...shop });
  console.log(`${f}: coins=${shop.coins} refresh=${shop.refreshCost}`);
  for (const c of shop.cards) console.log(`  [${c.rarity}] ${c.category}/${c.subtype} | ${c.name} | ${c.price} | ${c.desc}`);
}
await worker.terminate();
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/ocr-dump.json', JSON.stringify(out, null, 2));
