import { actor, json, requireDb } from './_utils.js'
import { latestTransactionMonth } from '../../src/lib/monthlyHome.js'
const key = (t) => [t.date, t.amount, t.name, t.account || ''].join('|')

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env), email = actor(request), body = await request.json()
    if (!Array.isArray(body.transactions) || !body.transactions.length || body.transactions.length > 10000) return json({ error: 'Invalid transactions' }, 400)
    const now = new Date().toISOString(), keys = body.transactions.map(key), uniqueKeys = [...new Set(keys)]
    const existing = new Set()
    for (let index = 0; index < keys.length; index += 75) {
      const slice = keys.slice(index, index + 75), marks = slice.map(() => '?').join(',')
      const found = await db.prepare(`SELECT txn_key FROM transactions WHERE txn_key IN (${marks})`).bind(...slice).all()
      found.results.forEach((row) => existing.add(row.txn_key))
    }
    const statements = body.transactions.map((t) => db.prepare(`INSERT INTO transactions
      (txn_key,date,amount,name,raw_category,bucket,account,is_income,imported_flow,uploaded_at,uploaded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(txn_key) DO UPDATE SET
      date=excluded.date,amount=excluded.amount,name=excluded.name,raw_category=excluded.raw_category,
      bucket=excluded.bucket,account=excluded.account,is_income=excluded.is_income,
      imported_flow=excluded.imported_flow,uploaded_at=excluded.uploaded_at,uploaded_by=excluded.uploaded_by`).bind(
      key(t),t.date,Number(t.amount),String(t.name),t.rawCategory||'',t.bucket||'Uncategorized',t.account||'',t.flow==='Income'?1:0,t.flow||'Expense',now,email))
    for (let index = 0; index < statements.length; index += 50) await db.batch(statements.slice(index,index+50))
    const added = uniqueKeys.filter((value) => !existing.has(value)).length, unchanged = keys.length-added
    const latestMonth = latestTransactionMonth(body.transactions)
    if (!latestMonth) return json({ error: 'No valid transaction month found' }, 400)
    const upload = await db.prepare('INSERT INTO upload_events (file_name,row_count,added_count,unchanged_count,uploaded_at,uploaded_by) VALUES (?,?,?,?,?,?)').bind(body.fileName||'transactions.csv',keys.length,added,unchanged,now,email).run()
    const uploadEventId = Number(upload.meta.last_row_id)
    await db.prepare(`INSERT INTO monthly_reviews(month_key,upload_event_id,reviewed_at,reviewed_by) VALUES(?,?,NULL,NULL) ON CONFLICT(month_key) DO UPDATE SET upload_event_id=excluded.upload_event_id,reviewed_at=NULL,reviewed_by=NULL`).bind(latestMonth,uploadEventId).run()
    return json({ ok:true, added, unchanged, latestMonth, uploadEventId })
  } catch (error) { return json({ error:error.message }, 400) }
}
