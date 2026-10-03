import {
  layoutFor, crop, binarize, rarityFromBadge, categoryFromSwatch, gearHighlight,
  parseNumber, parseTitle, cleanText,
} from './ocr-core.js';

// recognize(rgbaImage, { digits: boolean, singleLine: boolean }) => Promise<string>
export async function readShop(img, recognize) {
  const L = layoutFor(img.width, img.height);
  const num = async (region, threshold = 140) => parseNumber(
    await recognize(binarize(crop(img, region), { threshold, upscale: 3, anyColor: true }), { digits: true, singleLine: true }),
  );

  // The balance is zero-padded with gray digits ("00005256"); a higher cutoff
  // drops them so they can't smear into the real digits.
  const coins = await num(L.coins, 190);
  const refreshCost = await num(L.refresh);
  const cards = [];
  for (const [slot, R] of L.cards.entries()) {
    const titleRaw = await recognize(binarize(crop(img, R.title), { threshold: 170 }), {});
    // anyColor: effects mix white, green (buffs) and red (drawbacks, e.g.
    // "take 15% more DMG") text, and red is dim in the green channel.
    const descRaw = await recognize(binarize(crop(img, R.desc), { threshold: 150, anyColor: true }), {});
    const price = await num(R.price);
    const title = parseTitle(cleanText(titleRaw));
    // Resonium cards show "Owned: xNN" (count of that category you carry);
    // General cards have no counter, so gear stays null for them.
    const gear = gearHighlight(crop(img, R.owned));
    const owned = gear == null ? null : await num(R.owned);
    cards.push({
      slot,
      titleRaw: cleanText(titleRaw),
      category: title.category || categoryFromSwatch(crop(img, R.swatch)),
      subtype: title.subtype,
      name: title.name,
      desc: cleanText(descRaw),
      price,
      rarity: rarityFromBadge(crop(img, R.badge)) || (price >= 1000 ? 'A' : price ? 'B' : null),
      owned,
      gear,
    });
  }
  return { coins, refreshCost, cards };
}
