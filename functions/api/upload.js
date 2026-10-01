import { actor, json, requireDb } from './_utils.js'
import { latestTransactionMonth } from '../../src/lib/monthlyHome.js'
import { autoReconcile } from './reconcile.js'
import { validDate } from '../../src/lib/weekly.js'
import { importIdentitySummary } from '../../src/lib/importIdentity.js'
import { spendingAudit } from '../../src/lib/tracker.js'

const key = t => t.importKey

const mapRow = row => ({
  txnKey: row.txn_key, date: row.date, amount: row.amount, name: row.name, rawCategory: row.raw_category,
  originalBucket: row.bucket, bucket: row.override_bucket || row.bucket, account: row.account,
  importedFlow: row.imported_flow || (row.is_income ? 'Income' : 'Expense'),
  flow: row.override_flow || row.imported_flow || (row.is_income ? 'Income' : 'Expense'),
  overrideBucket: row.override_bucket, overrideFlow: row.override_flow, source: row.source,
  deletedAt: row.deleted_at, matchedTxnKey: row.matched_txn_key,
})

async function rowsForMonths(db, months) {
  if (!months.length) return []
  const marks = months.map(() => '?').join(',')
  const result = await db.prepare(`SELECT t.txn_key,t.date,t.amount,t.name,t.raw_category,t.bucket,t.account,t.is_income,t.imported_flow,t.override_bucket,t.override_flow,t.source,t.deleted_at,
    (SELECT imported_key FROM transaction_matches m WHERE m.manual_key=t.txn_key AND m.undone_at IS NULL LIMIT 1) AS matched_txn_key
    FROM transactions t WHERE substr(t.date,1,7) IN (${marks})`).bind(...months).all()
  return result.results.map(mapRow)
}

const monthReport = (months, before, after, source) => months.map(month => {
  const previous = spendingAudit(before.filter(row => row.date.startsWith(month))), next = spendingAudit(after.filter(row => row.date.startsWith(month)))
  return { month, sourceRows: source.filter(row => row.date.startsWith(month)).length, beforeSpending: previous.trueSpending, afterSpending: next.trueSpending, change: Math.round((next.trueSpending - previous.trueSpending) * 100) / 100 }
})

const simulateImport = (before, incoming, closed) => {
  const rows = new Map(before.map(row => [row.txnKey, row]))
  for (const transaction of incoming) {
    if (closed.has(transaction.date.slice(0, 7))) continue
    const previous = rows.get(key(transaction)) || {}
    rows.set(key(transaction), { ...previous, txnKey: key(transaction), date: transaction.date, amount: Number(transaction.amount), name: String(transaction.name), rawCategory: transaction.rawCategory || '', originalBucket: transaction.bucket || 'Uncategorized', bucket: previous.overrideBucket || transaction.bucket || 'Uncategorized', account: transaction.account || '', importedFlow: transaction.flow || 'Expense', flow: previous.overrideFlow || transaction.flow || 'Expense', source: 'import' })
  }
  return [...rows.values()]
}

export async function onRequestPost({request,env}){
  try{
    const db=requireDb(env),email=actor(request),body=await request.json()
    if(!Array.isArray(body.transactions)||!body.transactions.length||body.transactions.length>10000)return json({error:'Invalid transactions'},400)
    if(body.transactions.some(t=>!validDate(t.date)||!Number.isFinite(Number(t.amount))||!String(t.name||'').trim()))return json({error:'Invalid transaction date, amount, or merchant'},400)
    if(body.coverage && (!validDate(body.coverage.from)||!validDate(body.coverage.through)||body.coverage.from>body.coverage.through))return json({error:'Invalid confirmed CSV coverage range'},400)
    const identity=importIdentitySummary(body.transactions),transactions=identity.keyed,latestMonth=latestTransactionMonth(transactions)
    if(!latestMonth)return json({error:'No valid transaction month found'},400)
    const closeoutRows=await db.prepare('SELECT month_key FROM monthly_closeouts').all(),closed=new Set(closeoutRows.results.map(row=>row.month_key))
    const months=[...new Set(transactions.map(row=>row.date.slice(0,7)))].sort(),before=await rowsForMonths(db,months)
    if(body.preview===true){const after=simulateImport(before,transactions,closed),afterKeys=new Set(after.map(row=>row.txnKey));return json({ok:true,preview:true,latestMonth,sourceRowCount:identity.sourceRowCount,storedRowCount:transactions.filter(row=>afterKeys.has(key(row))).length,repeatedRowsPreserved:identity.repeatedRowsPreserved,closedMonths:months.filter(month=>closed.has(month)),perMonth:monthReport(months,before,after,transactions)})}
    if(closed.has(latestMonth))return json({error:'Reopen this month before replacing its imported transactions.'},409)
    const now=new Date().toISOString(),keys=transactions.map(key),uniqueKeys=[...new Set(keys)],existing=new Set()
    for(let index=0;index<keys.length;index+=75){const slice=keys.slice(index,index+75),marks=slice.map(()=>'?').join(','),found=await db.prepare(`SELECT txn_key FROM transactions WHERE txn_key IN (${marks})`).bind(...slice).all();found.results.forEach(row=>existing.add(row.txn_key))}
    const writable=transactions.filter(t=>!closed.has(String(t.date||'').slice(0,7))),statements=writable.map(t=>db.prepare(`INSERT INTO transactions
      (txn_key,date,amount,name,raw_category,bucket,account,is_income,imported_flow,uploaded_at,uploaded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(txn_key) DO UPDATE SET
      date=excluded.date,amount=excluded.amount,name=excluded.name,raw_category=excluded.raw_category,
      bucket=excluded.bucket,account=excluded.account,is_income=excluded.is_income,
      imported_flow=excluded.imported_flow,uploaded_at=excluded.uploaded_at,uploaded_by=excluded.uploaded_by`).bind(key(t),t.date,Number(t.amount),String(t.name),t.rawCategory||'',t.bucket||'Uncategorized',t.account||'',t.flow==='Income'?1:0,t.flow||'Expense',now,email))
    for(let index=0;index<statements.length;index+=50)await db.batch(statements.slice(index,index+50))
    const writableKeys=new Set(writable.map(key)),added=uniqueKeys.filter(value=>writableKeys.has(value)&&!existing.has(value)).length,refreshed=writable.length-added,skippedClosed=transactions.length-writable.length,unchanged=keys.length-added
    const upload=await db.prepare('INSERT INTO upload_events (file_name,row_count,added_count,unchanged_count,uploaded_at,uploaded_by) VALUES (?,?,?,?,?,?)').bind(body.fileName||'transactions.csv',keys.length,added,unchanged,now,email).run(),uploadEventId=Number(upload.meta.last_row_id)
    await db.prepare(`INSERT INTO monthly_reviews(month_key,upload_event_id,reviewed_at,reviewed_by) VALUES(?,?,NULL,NULL) ON CONFLICT(month_key) DO UPDATE SET upload_event_id=excluded.upload_event_id,reviewed_at=NULL,reviewed_by=NULL,revision=monthly_reviews.revision+1`).bind(latestMonth,uploadEventId).run()
    if(body.coverage)await db.prepare('INSERT INTO import_coverage(upload_event_id,date_from,date_through) VALUES(?,?,?)').bind(uploadEventId,body.coverage.from,body.coverage.through).run()
    let matched=0,reconciliationWarning=null
    try{matched=await autoReconcile(db,email)}catch{reconciliationWarning='Upload saved. Some matches need review in Transactions.'}
    const after=await rowsForMonths(db,months),afterKeys=new Set(after.map(row=>row.txnKey))
    return json({ok:true,added,unchanged,refreshed,skippedClosed,latestMonth,uploadEventId,matched,reconciliationWarning,sourceRowCount:identity.sourceRowCount,storedRowCount:transactions.filter(row=>afterKeys.has(key(row))).length,repeatedRowsPreserved:identity.repeatedRowsPreserved,closedMonths:months.filter(month=>closed.has(month)),perMonth:monthReport(months,before,after,transactions)})
  }catch(error){return json({error:error.message},400)}
}
