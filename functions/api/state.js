import { json, requireDb } from './_utils.js'

export async function onRequestGet({ env }) {
  try {
    const db = requireDb(env)
    const [transactions, budgets, upload] = await Promise.all([
      db.prepare(`SELECT txn_key,date,amount,name,raw_category,bucket,account,is_income,imported_flow,override_bucket,override_flow
        FROM transactions ORDER BY date DESC, name`).all(),
      db.prepare('SELECT month_key,bucket,target,paced,updated_at,updated_by FROM monthly_budgets ORDER BY month_key,bucket').all(),
      db.prepare('SELECT file_name,row_count,added_count,unchanged_count,uploaded_at,uploaded_by FROM upload_events ORDER BY id DESC LIMIT 1').first(),
    ])
    return json({
      transactions: transactions.results.map((row) => ({
        txnKey: row.txn_key, date: row.date, amount: row.amount, name: row.name,
        rawCategory: row.raw_category, originalBucket: row.bucket,
        bucket: row.override_bucket || row.bucket, account: row.account,
        importedFlow: row.imported_flow || (row.is_income ? 'Income' : 'Expense'),
        flow: row.override_flow || row.imported_flow || (row.is_income ? 'Income' : 'Expense'),
        overrideBucket: row.override_bucket, overrideFlow: row.override_flow,
      })),
      budgets: budgets.results.map((row) => ({ monthKey: row.month_key, bucket: row.bucket, target: row.target, paced: Boolean(row.paced), updatedAt: row.updated_at, updatedBy: row.updated_by })),
      lastUpload: upload ? { fileName: upload.file_name, rowCount: upload.row_count, added: upload.added_count, unchanged: upload.unchanged_count, uploadedAt: upload.uploaded_at, uploadedBy: upload.uploaded_by } : null,
    })
  } catch (error) { return json({ error: error.message }, 503) }
}
