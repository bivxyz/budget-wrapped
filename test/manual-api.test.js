import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { onRequestPost as manual } from '../functions/api/manual.js'
import { onRequestPost as upload } from '../functions/api/upload.js'
import { onRequestPost as reconcile } from '../functions/api/reconcile.js'
import { onRequestPost as weeklyPlan } from '../functions/api/weekly-plan.js'
import { onRequestPost as review } from '../functions/api/review.js'
import { onRequestGet as state } from '../functions/api/state.js'

function database() {
  const sqlite=new DatabaseSync(':memory:')
  for(const name of readdirSync(new URL('../migrations/',import.meta.url)).sort()) sqlite.exec(readFileSync(new URL(`../migrations/${name}`,import.meta.url),'utf8'))
  const db={sqlite,prepare(sql){let params=[];return{bind(...values){params=values;return this},first:async()=>sqlite.prepare(sql).get(...params)||null,all:async()=>({results:sqlite.prepare(sql).all(...params)}),run:async()=>{const result=sqlite.prepare(sql).run(...params);return{meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}}}}},batch:async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}}
  return db
}
const call=async(handler,DB,body)=>{const response=await handler({env:{DB},request:new Request('https://example.test/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});return{status:response.status,...await response.json()}}
const expense={date:'2026-08-03',amount:20,name:'Market',bucket:'Groceries',account:'Card',flow:'Expense'}
const getState=async DB=>(await state({env:{DB}})).json()

test('manual create/edit/delete persists and invalidates reviewed state', async()=>{
  const db=database();await call(upload,db,{transactions:[{...expense,date:'2026-08-01'}]})
  let shared=await getState(db);assert.equal((await call(review,db,{monthKey:'2026-08',uploadEventId:shared.monthlyReviews[0].uploadEventId,revision:0})).status,200)
  const created=await call(manual,db,{...expense,action:'create'});assert.equal(created.status,200)
  shared=await getState(db);assert.equal(shared.monthlyReviews[0].reviewedAt,null);assert.equal(shared.monthlyReviews[0].revision,1)
  assert.equal((await call(review,db,{monthKey:'2026-08',uploadEventId:1,revision:0})).status,409)
  assert.equal((await call(manual,db,{...expense,amount:25,txnKey:created.txnKey,action:'update'})).status,200)
  assert.equal((await getState(db)).transactions.find(row=>row.txnKey===created.txnKey).amount,25)
  await call(manual,db,{action:'delete',txnKey:created.txnKey});assert.ok((await getState(db)).transactions.find(row=>row.txnKey===created.txnKey).deletedAt)
  for(const amount of [-1,0,1.001])assert.equal((await call(manual,db,{...expense,amount,action:'create'})).status,400)
})
test('upload automatically links once, preserves category, undo survives re-upload',async()=>{
  const db=database(),created=await call(manual,db,{...expense,action:'create'})
  const payload={transactions:[{...expense,bucket:'Dining'}],coverage:{from:'2026-08-01',through:'2026-08-31'}}
  assert.equal((await call(upload,db,payload)).matched,1)
  let shared=await getState(db);const match=shared.transactionMatches[0]
  assert.equal(shared.transactions.find(row=>row.source==='import').bucket,'Groceries')
  assert.equal(shared.transactions.find(row=>row.txnKey===created.txnKey).matchedTxnKey,match.importedKey)
  assert.equal((await call(upload,db,payload)).matched,0);assert.equal((await getState(db)).transactions.length,2)
  assert.equal((await call(reconcile,db,{action:'undo',id:match.id})).status,200)
  assert.equal((await call(upload,db,payload)).matched,0)
  shared=await getState(db);assert.equal(shared.transactions.find(row=>row.source==='manual').matchedTxnKey,null)
})
test('identical imported purchases remain distinct and ambiguous; repeat import is idempotent',async()=>{
  const db=database();await call(manual,db,{...expense,action:'create'})
  const payload={transactions:[expense,expense]};assert.equal((await call(upload,db,payload)).matched,0)
  await call(upload,db,payload);assert.equal((await getState(db)).transactions.length,3)
})
test('matching requires explicit override replacement and linked rows lock with closeout',async()=>{
  const db=database(),created=await call(manual,db,{...expense,action:'create'})
  await call(upload,db,{transactions:[{...expense,date:'2026-08-04'}]})
  const imported=(await getState(db)).transactions.find(row=>row.source==='import')
  db.sqlite.prepare('UPDATE transactions SET override_bucket=? WHERE txn_key=?').run('Other',imported.txnKey)
  const match={action:'link',manualKey:created.txnKey,importedKey:imported.txnKey}
  assert.equal((await call(reconcile,db,match)).status,409)
  assert.equal((await getState(db)).transactionMatches.length,0)
  const linked=await call(reconcile,db,{...match,replaceOverride:true});assert.equal(linked.status,200)
  db.sqlite.exec("INSERT INTO monthly_closeouts VALUES('2026-08','now','test')")
  assert.equal((await call(reconcile,db,{action:'undo',id:linked.id})).status,409)
  assert.equal((await call(manual,db,{...expense,action:'create'})).status,400)
})
test('weekly plan atomically updates only two targets and preserves pacing/order',async()=>{
  const db=database();db.sqlite.exec("INSERT INTO monthly_budgets VALUES('2026-08','Bills',200,0,'now','test',0),('2026-08','Groceries',50,0,'now','test',1)")
  const body={monthKey:'2026-08',income:500000,savings:100000,groceries:100000,restaurants:50000,groceriesBaseline:100000,restaurantsBaseline:50000,incomeConfirmed:true,commitmentsConfirmed:true}
  assert.equal((await call(weeklyPlan,db,body)).status,200)
  let shared=await getState(db);assert.equal(shared.budgets.find(row=>row.bucket==='Bills').target,200);assert.equal(shared.budgets.find(row=>row.bucket==='Groceries').paced,false);assert.equal(shared.budgetSettings[0].spendingLimit,1700)
  assert.equal((await call(weeklyPlan,db,{...body,income:100})).status,400)
  shared=await getState(db);assert.equal(shared.savingsSettings[0].income,500000)
  const original=db.batch;db.batch=async statements=>original([...statements,db.prepare('INSERT INTO missing_table VALUES(1)')])
  assert.equal((await call(weeklyPlan,db,{...body,groceries:150000})).status,400)
  assert.equal((await getState(db)).budgets.find(row=>row.bucket==='Groceries').target,1000)
})

test('manual request IDs make retry safe and unmatched manual entries cannot close CSV coverage',async()=>{
  const db=database(),body={...expense,action:'create',clientId:'12345678-1234-1234-1234-123456789012'}
  await call(manual,db,body);await call(manual,db,body)
  assert.equal((await getState(db)).transactions.length,1)
  assert.equal(db.sqlite.prepare("SELECT MAX(date) AS date FROM transactions WHERE source='import'").get().date,null)
})
