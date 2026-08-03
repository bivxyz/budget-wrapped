# Budget Wrapped

A Spotify Wrapped-style personal finance dashboard. Upload a CSV export from **any budgeting app** — Rocket Money, EveryDollar (Dave Ramsey), your bank, or anything else — and get an animated monthly recap followed by a full budget breakdown.

## Run it

```bash
npm install
npm run dev
```

Then open the printed localhost URL. No CSV handy? Use the **Rocket Money** or **EveryDollar** sample links on the upload screen (`public/sample-*.csv`).

## How it works

- **Upload** — drag/drop or pick a CSV. Parsed client-side with PapaParse; nothing leaves the browser.
- **Confirm columns** — the app auto-detects the source and maps the columns; you confirm or adjust them (with a live preview) on the review screen. Sample CSVs skip straight to the show.
- **Slideshow** — 10 auto-advancing slides (4s each) with count-up animations. Arrow keys / click edges / on-screen controls to navigate; Esc or "Skip" jumps to the dashboard.
- **Dashboard** — summary cards, budget-vs-actual bar chart, cumulative spend line chart, sortable category table, and a searchable/filterable transaction log (Recharts).

## Architecture — supporting more budget apps

The analytics engine is format-agnostic. Adapting a new app is just a **provider preset**:

- `src/lib/fields.js` — column-name synonyms, sign-convention handling (`expense-positive` / `expense-negative` / `debit-credit`), and `buildTransactions(rows, config)` → one canonical transaction shape.
- `src/lib/providers.js` — presets (Rocket Money, EveryDollar, Generic). Each exposes `detect(headers)` (auto-detection confidence) and `makeConfig(headers)` (column map + category map + budget targets + income/savings/investment rules). Add a new object to `PROVIDERS` to support another app.
- `src/lib/finance.js` — `analyze(rows, config)`: pure, provider-agnostic; produces everything the slideshow + dashboard render.
- Sources without budget targets (EveryDollar, bank exports) degrade gracefully — the budget-comparison views show a note instead of breaking.

Whatever a preset can't nail automatically, the **Confirm columns** screen lets the user fix by hand — so the app works on arbitrary CSVs, not just the ones with a built-in preset.

## Stack
React · Vite · Tailwind v4 · Framer Motion · Recharts · PapaParse
