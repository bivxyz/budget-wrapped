# Manual expenses and weekly planning

Use **Add expense** on Overview, Transactions, or Weekly Budget. Manual entries affect shared spending immediately. Use the exact Rocket Money account name for automatic matching. Entries can be edited or soft-deleted in Transactions while the month is open.

## Import and matching

CSV imports automatically match a unique manual/imported pair with the same amount, merchant, and nonempty account when the settlement dates are within three days. Only capitalization and whitespace are normalized. This allows a manually entered purchase to settle on a nearby day without counting twice. Repeated or ambiguous same-amount purchases remain separate and appear in Transactions for confirmation. Conflicting imported category corrections require explicit confirmation to replace.

Matched manual records remain in D1 and workbook audit data, but only the imported transaction counts. Undo restores the manual entry and restores the previous imported category only if no later correction replaced it. An undone entry is never automatically matched again. Manual changes and matches invalidate the affected month's review; stale review requests are rejected.

Confirm the CSV's date range only when it includes all accounts and transactions for that range, including days with no purchases. Coverage is not inferred from manual transactions. Legacy uploads without confirmed coverage remain usable for tracking but cannot establish complete baseline weeks.

## Weekly math

- Weeks are Monday–Sunday. Grocery and dining allowances reset every week; unused allowance does not roll forward.
- Each monthly target is divided across its calendar days in integer cents. Remainder cents go to the earliest days. Cross-month weeks combine both targets; if either target is absent, the week says **Budget not set**.
- A confirmed CSV covering all seven days or the Sunday **Week is complete** sign-off establishes completeness for the two manual family messages. Any manual add, edit, or delete clears a manual sign-off; confirmed Rocket Money coverage remains authoritative.
- Recommendations reserve confirmed expected income minus a default $1,000 monthly savings target and all other monthly category targets.
- Income suggestions average up to three prior reviewed months with complete confirmed import coverage. Irregular pay must be reviewed before confirming.
- Baselines use up to 12 completed covered weeks. Zero-spend covered weeks count. At least four weeks are needed; otherwise enter manual monthly baselines. Groceries use median weekly spending rounded up to $5; restaurants use the median. Monthly equivalents use ×52÷12.
- Groceries receive their baseline first, then restaurants. Shortfalls require explicit adjustment; savings is never silently reduced. Extra capacity is potential additional savings, not proof of cash transferred.
- Saving changes only the two category targets and the selected month's income/savings settings. Other targets, pacing, and order remain unchanged. The official monthly budget is recalculated from all category targets.

## Weekly check-in and private iMessage reminders

The dashboard stores reminder text and delivery status in D1, but never stores the recipient's number. A signed-in Mac sends from the family's Messages identity.

1. Apply migrations through `0009_manual_weekly_messages.sql` locally and remotely before deploying the new Functions.
2. Generate a dedicated Cloudflare Access service token and add it to an Access policy for `budget.bivens.xyz`. Do not reuse a broad administrative API token.
3. Create a separate random agent token, then set the same value as the Pages secret:

   ```bash
   npx wrangler pages secret put REMINDER_AGENT_TOKEN --project-name budget-wrapped
   ```

4. After deployment, save the recipient, Access client ID/secret, site URL, and agent token in macOS Keychain:

   ```bash
   npm run reminders:configure
   npm run reminders:permission
   npm run reminders:dry-run
   ```

5. Only after the dry-run text is correct, install the sender:

   ```bash
   npm run reminders:install
   ```

Budget and spending messages are previewed and queued manually from Overview after the completed week is confirmed. The polling agent checks dashboard-queued messages about once per minute. Re-running the installer removes the legacy Monday scheduler. Message failures remain visible in Overview and require an explicit retry. Remove the polling job with `npm run reminders:uninstall`; Keychain settings are retained.

Launch-agent logs contain only queue IDs and statuses under `~/Library/Logs/BudgetWrapped`. A local delivery ledger under `~/Library/Application Support/Budget Wrapped` prevents an uncertain restart from silently sending a duplicate.

## Rollout

Requires Node 22.13+ (Node 24 recommended) for the SQLite-backed tests. No new runtime dependencies.

1. Run `npm test` and `npm run build`.
2. Check pending local migrations with `npx wrangler d1 migrations list DB --local`, then apply with `npx wrangler d1 migrations apply DB --local`.
3. Compile Pages Functions with `npx wrangler pages functions build --outdir .wrangler/functions-check`.
4. Test locally with `npx wrangler pages dev dist --compatibility-date 2026-08-06` (the date supported by the installed runtime; use the project's supported date after upgrading).
5. Before production deployment, confirm the migration registry and explicitly apply all pending migrations, including **0009_manual_weekly_messages.sql**, to the production DB. Deploy the web app before reinstalling the local sender.

Keep Cloudflare Access covering the custom domain, API routes, and any reachable Pages aliases. D1 data, local database files, CSVs, and configuration remain private and outside source control. Do not deploy the new API before its migration: it requires the new columns and tables.
