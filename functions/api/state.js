import { json, requireDb } from './_utils.js'
import { matchRecord } from './reconcile.js'

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env)
    const [transactions, budgets, budgetSettings, uploads, reviews, closeouts, matches, savings, coverage] = await Promise.all([
      db.prepare(`SELECT txn_key,date,amount,name,raw_category,bucket,account,is_income,imported_flow,override_bucket,override_flow,source,created_at,created_by,deleted_at
        FROM transactions ORDER BY date DESC, name`).all(),
      db.prepare('SELECT month_key,bucket,target,paced,sort_order,updated_at,updated_by FROM monthly_budgets ORDER BY month_key,sort_order,bucket').all(),
      db.prepare('SELECT month_key,spending_limit,updated_at,updated_by FROM monthly_budget_settings ORDER BY month_key').all(),
      db.prepare('SELECT id,file_name,row_count,added_count,unchanged_count,uploaded_at,uploaded_by FROM upload_events ORDER BY id DESC').all(),
      db.prepare('SELECT month_key,upload_event_id,reviewed_at,reviewed_by,revision FROM monthly_reviews ORDER BY month_key').all(),
      db.prepare('SELECT month_key,closed_at,closed_by FROM monthly_closeouts ORDER BY month_key').all(),
      db.prepare('SELECT * FROM transaction_matches ORDER BY linked_at DESC').all(),
      db.prepare('SELECT * FROM monthly_savings_settings ORDER BY month_key').all(),
      db.prepare('SELECT * FROM import_coverage').all(),
    ])
    const uploadHistory = uploads.results.map((row) => ({ id: row.id, fileName: row.file_name, rowCount: row.row_count, added: row.added_count, unchanged: row.unchanged_count, uploadedAt: row.uploaded_at, uploadedBy: row.uploaded_by }))
    return json({
      transactions: transactions.results.map((row) => ({
        txnKey: row.txn_key, date: row.date, amount: row.amount, name: row.name,
        rawCategory: row.raw_category, originalBucket: row.bucket,
        bucket: row.override_bucket || row.bucket, account: row.account,
        importedFlow: row.imported_flow || (row.is_income ? 'Income' : 'Expense'),
        flow: row.override_flow || row.imported_flow || (row.is_income ? 'Income' : 'Expense'),
        overrideBucket: row.override_bucket, overrideFlow: row.override_flow,
        source: row.source, createdAt: row.created_at, createdBy: row.created_by, deletedAt: row.deleted_at,
        matchedTxnKey: matches.results.find(match => match.manual_key === row.txn_key && !match.undone_at)?.imported_key || null,
      })),
      budgets: budgets.results.map((row) => ({ monthKey: row.month_key, bucket: row.bucket, target: row.target, paced: Boolean(row.paced), sortOrder: row.sort_order, updatedAt: row.updated_at, updatedBy: row.updated_by })),
      budgetSettings: budgetSettings.results.map((row) => ({ monthKey: row.month_key, spendingLimit: row.spending_limit, updatedAt: row.updated_at, updatedBy: row.updated_by })),
      monthlyReviews: reviews.results.map((row) => ({ monthKey: row.month_key, uploadEventId: row.upload_event_id, reviewedAt: row.reviewed_at, reviewedBy: row.reviewed_by, revision: row.revision })),
      transactionMatches: matches.results.map(matchRecord),
      savingsSettings: savings.results.map(row => ({ monthKey: row.month_key, income: row.income_cents, savings: row.savings_cents, groceriesBaseline: row.groceries_baseline_cents, restaurantsBaseline: row.restaurants_baseline_cents, updatedAt: row.updated_at, updatedBy: row.updated_by })),
      importCoverage: coverage.results.map(row => ({ uploadEventId: row.upload_event_id, from: row.date_from, through: row.date_through })),
      monthlyCloseouts: closeouts.results.map((row) => ({ monthKey: row.month_key, closedAt: row.closed_at, closedBy: row.closed_by })),
      lastUpload: uploadHistory[0] || null,
      uploadHistory,
    })
  } catch (error) { return json({ error: error.message }, 503) }
}
