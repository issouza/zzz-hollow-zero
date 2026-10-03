# Hollow Zero Shop Advisor

Helps you spend gear coins in the ZZZ Hollow Zero **Lost Void** Bangboo shop. Paste a screenshot of the shop and it reads the cards, scores them for your build, and tells you what to buy and whether to refresh.

```sh
npm install
npm start        # http://localhost:5174
npm test         # checks OCR, tagger and optimizer
npm run ocr      # re-reads every screenshot in assets/ into data/ocr-dump.json
npm run db:format  # re-sorts src/resonia-db.js after manual edits
```

## Using it

1. Choose a **build preset** (Crit DPS, Armorer (Claret), Anomaly, Stun, Rupture, Support, Survival, Balanced). Then adjust the stat sliders and the resonium category focus. Cards that score 0 for your priorities are grayed out.
2. Add the shop **pages in order**: page 1 is the shop you open, page 2 is what you see after the 1st refresh, and so on. Paste screenshots one at a time with Ctrl+V, or drop or choose many at once (files are sorted by name). Starting coins and each page's refresh price come from the screenshots. Everything is editable.
3. Read the **Best path**, e.g. *Page 1: buy #1 → Page 2: skip → Page 3: buy #1 → Page 4: skip → Page 5: buy #1 #2 #5 → Stop*. Each page shows its verdict, its coins before and after, and BUY badges on the cards to take.

**Gear:** the category whose "Owned" counter is highlighted orange in the shop is your gear. It is detected automatically (with its owned count) and can be overridden next to the starting coins. Gear grants a set bonus for every 2 resonia of its category, so the planner tracks that count and adds the "Gear set bonus" value (Tuning) whenever a purchase completes a pair. General cards have no counter and never count.

**Load my 20 sample pages** loads the screenshots in assets/. Per-card Always/Never rules are set in the Resonium database tab.

## How it decides

- **Card score:** each effect is tagged by keyword (CRIT Rate, DMG Bonus, Anomaly…). The tag you weight highest counts in full and any extra tags count at 35%. Conditional effects ("when…", "for 10s") count ×0.8. The category focus bonus is added, and the result is multiplied by rarity (A ×1.7, about its 1000-coin vs 600-coin price).
- **Path:** an exact dynamic program over (page, coins) through the known pages. On each page it chooses which combination to buy, then whether to pay that page's refresh price and continue or stop. Pages are assumed to be a fixed sequence, the same no matter what you bought.
- **Past the last page** (optional checkbox): an expectimax over coins. For each set of cards you could buy now, it adds the expected value of the coins you keep. That expected value comes from simulating refreshes at the observed price ladder (50 → 100 → 200 → 300, then 300 each time), each giving 5 random cards from the database, with the best choice made at every step. Leftover coins are worth nothing by default, so it spends everything. Raise "Leftover coins" to save for a later shop.

## Data

`src/resonia-db.js` lists the resonia, transcribed from the screenshots in `assets/`. Effects ending in "…" were cut off on the shop card.

To maintain it from the app:

- In the **Resonium database** tab every field is editable. **Only cut-off effects (…)** shows the cards still waiting for their full text.
- Cards you save from a shop page, and any edits, are held as pending changes. The header button shows how many ("2 new · 3 edited cards to update").
- **Update database** asks for confirmation, backs up the current file to `data/backups/`, then rewrites `src/resonia-db.js` through the local server (`npm start`; only requests from this computer are accepted).

OCR runs fully locally with tesseract.js; the English data is in `vendor/lang/`.
