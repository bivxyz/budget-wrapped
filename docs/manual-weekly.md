# Manual expenses and weekly planning

Use **Add expense** on Overview, Transactions, or Weekly Budget. Manual entries affect shared spending immediately. Use the exact Rocket Money account name for automatic matching. Entries can be edited or soft-deleted in Transactions while the month is open.

## Import and matching

CSV imports automatically match a unique manual/imported pair with the same date, amount, merchant, and nonempty account. Only capitalization and whitespace are normalized. Repeated identical CSV rows have stable occurrence suffixes so separate purchases are not collapsed. Ambiguous same-amount purchases within three days appear in Transactions for confirmation; both count until matched. Conflicting imported category corrections require explicit confirmation to replace.

Matched manual records remain in D1 and workbook audit data, but only the imported transaction counts. Undo restores the manual entry and restores the previous imported category only if no later correction replaced it. An undone entry is never automatically matched again. Manual changes and matches invalidate the affected month's review; stale review requests are rejected.

Confirm the CSV's date range only when it includes all accounts and transactions for that range, including days with no purchases. Coverage is not inferred from manual transactions. Legacy uploads without confirmed coverage remain usable for tracking but cannot establish complete baseline weeks.

## Weekly math

- Weeks are Monday–Sunday; no rollover.
- Each monthly target is divided across its calendar days in integer cents. Remainder cents go to the earliest days. Cross-month weeks combine both targets; if either target is absent, the week says **Budget not set**.
- Recommendations reserve confirmed expected income minus a default $1,000 monthly savings target and all other monthly category targets.
- Income suggestions average up to three prior reviewed months with complete confirmed import coverage. Irregular pay must be reviewed before confirming.
- Baselines use up to 12 completed covered weeks. Zero-spend covered weeks count. At least four weeks are needed; otherwise enter manual monthly baselines. Groceries use median weekly spending rounded up to $5; restaurants use the median. Monthly equivalents use ×52÷12.
- Groceries receive their baseline first, then restaurants. Shortfalls require explicit adjustment; savings is never silently reduced. Extra capacity is potential additional savings, not proof of cash transferred.
- Saving changes only the two category targets and the selected month's income/savings settings. Other targets, pacing, and order remain unchanged. The official monthly budget is recalculated from all category targets.

## Rollout

Requires Node 22.13+ (Node 24 recommended) for the SQLite-backed tests. No new runtime dependencies.

1. Run `npm test` and `npm run build`.
2. Check pending local migrations with `npx wrangler d1 migrations list DB --local`, then apply with `npx wrangler d1 migrations apply DB --local`.
3. Compile Pages Functions with `npx wrangler pages functions build --outdir .wrangler/functions-check`.
4. Test locally with `npx wrangler pages dev dist --compatibility-date 2026-08-06` (the date supported by the installed runtime; use the project's supported date after upgrading).
5. Before production deployment, explicitly apply **0006_manual_weekly.sql** to the production DB using the migration registry. Confirm only expected migrations are pending. This implementation does not apply remote migrations or push/deploy code.

Keep Cloudflare Access covering the custom domain, API routes, and any reachable Pages aliases. D1 data, local database files, CSVs, and configuration remain private and outside source control. Do not deploy the new API before its migration: it requires the new columns and tables.
