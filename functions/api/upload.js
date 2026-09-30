import { actor, json, requireDb } from './_utils.js'
import { latestTransactionMonth } from '../../src/lib/monthlyHome.js'
import { autoReconcile } from './reconcile.js'
import { validDate } from '../../src/lib/weekly.js'
const baseKey = t => [t.date,t.amount,t.name,t.account||''].join('|')
const key = t => t.importKey

export async function onRequestPost({request,env}){
  try{
    const db=requireDb(env),email=actor(request),body=await request.json()
    if(!Array.isArray(body.transactions)||!body.transactions.length||body.transactions.length>10000)return json({error:'Invalid transactions'},400)
    if(body.transactions.some(t=>!validDate(t.date)||!Number.isFinite(Number(t.amount))||!String(t.name||'').trim()))return json({error:'Invalid transaction date, amount, or merchant'},400)
    if(body.coverage && (!validDate(body.coverage.from)||!validDate(body.coverage.through)||body.coverage.from>body.coverage.through))return json({error:'Invalid confirmed CSV coverage range'},400)
    const occurrences=new Map()
    body.transactions=body.transactions.map(t=>{const base=baseKey(t),occurrence=(occurrences.get(base)||0)+1;occurrences.set(base,occurrence);return{...t,importKey:occurrence===1?base:`${base}|duplicate:${occurrence}`}})
    const latestMonth=latestTransactionMonth(body.transactions)
    if(!latestMonth)return json({error:'No valid transaction month found'},400)
    const closeoutRows=await db.prepare('SELECT month_key FROM monthly_closeouts').all(),closed=new Set(closeoutRows.results.map(row=>row.month_key))
    if(closed.has(latestMonth))return json({error:'Reopen this month before replacing its imported transactions.'},409)
    const now=new Date().toISOString(),keys=body.transactions.map(key),uniqueKeys=[...new Set(keys)],existing=new Set()
    for(let index=0;index<keys.length;index+=75){const slice=keys.slice(index,index+75),marks=slice.map(()=>'?').join(','),found=await db.prepare(`SELECT txn_key FROM transactions WHERE txn_key IN (${marks})`).bind(...slice).all();found.results.forEach(row=>existing.add(row.txn_key))}
    const writable=body.transactions.filter(t=>!closed.has(String(t.date||'').slice(0,7))),statements=writable.map(t=>db.prepare(`INSERT INTO transactions
      (txn_key,date,amount,name,raw_category,bucket,account,is_income,imported_flow,uploaded_at,uploaded_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(txn_key) DO UPDATE SET
      date=excluded.date,amount=excluded.amount,name=excluded.name,raw_category=excluded.raw_category,
      bucket=excluded.bucket,account=excluded.account,is_income=excluded.is_income,
      imported_flow=excluded.imported_flow,uploaded_at=excluded.uploaded_at,uploaded_by=excluded.uploaded_by`).bind(key(t),t.date,Number(t.amount),String(t.name),t.rawCategory||'',t.bucket||'Uncategorized',t.account||'',t.flow==='Income'?1:0,t.flow||'Expense',now,email))
    for(let index=0;index<statements.length;index+=50)await db.batch(statements.slice(index,index+50))
    const writableKeys=new Set(writable.map(key)),added=uniqueKeys.filter(value=>writableKeys.has(value)&&!existing.has(value)).length,unchanged=keys.length-added
    const upload=await db.prepare('INSERT INTO upload_events (file_name,row_count,added_count,unchanged_count,uploaded_at,uploaded_by) VALUES (?,?,?,?,?,?)').bind(body.fileName||'transactions.csv',keys.length,added,unchanged,now,email).run(),uploadEventId=Number(upload.meta.last_row_id)
    await db.prepare(`INSERT INTO monthly_reviews(month_key,upload_event_id,reviewed_at,reviewed_by) VALUES(?,?,NULL,NULL) ON CONFLICT(month_key) DO UPDATE SET upload_event_id=excluded.upload_event_id,reviewed_at=NULL,reviewed_by=NULL,revision=monthly_reviews.revision+1`).bind(latestMonth,uploadEventId).run()
    if(body.coverage)await db.prepare('INSERT INTO import_coverage(upload_event_id,date_from,date_through) VALUES(?,?,?)').bind(uploadEventId,body.coverage.from,body.coverage.through).run()
    let matched=0,reconciliationWarning=null
    try{matched=await autoReconcile(db,email)}catch{reconciliationWarning='Upload saved. Some matches need review in Transactions.'}
    return json({ok:true,added,unchanged,latestMonth,uploadEventId,matched,reconciliationWarning})
  }catch(error){return json({error:error.message},400)}
}
