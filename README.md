# Budget Wrapped

A private shared family budget tracker built around Rocket Money CSV exports. It combines a practical monthly transaction workspace with the existing Spotify-Wrapped-style recap.

## Family workflow

1. Export year-to-date transactions from Rocket Money.
2. Open the selected month and upload the CSV. Repeated YTD uploads are safe and refresh imported fields without removing app overrides.
3. Review uncategorized or edited rows, adjust category and flow type, and update that month's budgets.
4. Use the top-five expenses, top-three categories, pacing, trends, and Wrapped replay to review the month together.

Corrections affect Budget Wrapped only; they do not sync back to Rocket Money. The original Rocket Money category remains visible in the tracking table.

## Local development

```bash
npm install
npm run build
npx wrangler d1 migrations apply budget-wrapped --local
npm run dev:shared
```

Copy `wrangler.example.jsonc` to the gitignored `wrangler.jsonc`. The local Pages server includes the D1-backed upload, budget, and transaction-edit APIs. `npm test` runs the analytics and upsert tests.

The standalone importer remains available for a gitignored build-time archive:

```bash
node scripts/ingest.mjs --dry-run --file=/path/to/transactions.csv
node scripts/ingest.mjs --file=/path/to/transactions.csv
```

## Shared data model

- Imported transactions are keyed by `date|amount|name|account`.
- Rocket Money fields refresh on re-upload; `override_bucket` and `override_flow` remain untouched.
- Flow types are Expense, Income, Transfer, Investment, and Ignore.
- Monthly budgets are keyed by month and category. A new month copies the latest earlier month; the first month uses the local default targets.
- Categories marked lumpy are excluded from pace ratios and projections.

## Cloudflare deployment and privacy

Create a D1 database and protect the Pages hostname plus all `/api/*` routes with the same Cloudflare Access email-OTP allow policy:

```bash
npx wrangler d1 create budget-wrapped
cp wrangler.example.jsonc wrangler.jsonc
npx wrangler d1 migrations apply budget-wrapped --remote
npm run deploy
```

Set the production D1 binding name to `DB`. Direct-upload builds keep transaction files out of git. The `data/` archive, local Wrangler configuration/state, and production identifiers are gitignored. `robots.txt` and page metadata prohibit indexing; Cloudflare Access is the security boundary.

## Original single-month flow

The upload → mapping review → slideshow → dashboard path remains available when no archive exists and for supported sample files. Provider adapters live in `src/lib/providers.js`; canonical parsing is in `src/lib/fields.js`.

React · Vite · Tailwind · Recharts · Papa Parse · Cloudflare Pages Functions · D1
