import test from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { BUDGET_MESSAGE_CATEGORIES, composeWeeklyReminder, composeWeeklySpending, cutbackPreview, SPENDING_MESSAGE_CATEGORIES } from '../src/lib/reminders.js'
import { weeklySummary } from '../src/lib/weekly.js'
import { onRequestPost as reminders } from '../functions/api/reminders.js'
import { onRequestPost as confirmWeek } from '../functions/api/weekly-confirmation.js'
import { onRequestGet as state } from '../functions/api/state.js'

function database() {
  const sqlite = new DatabaseSync(':memory:')
  for (const name of readdirSync(new URL('../migrations/', import.meta.url)).sort()) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
  return { sqlite, prepare(sql) { let params=[]; return { bind(...values){params=values;return this}, first:async()=>sqlite.prepare(sql).get(...params)||null, all:async()=>({results:sqlite.prepare(sql).all(...params)}), run:async()=>{const result=sqlite.prepare(sql).run(...params);return{meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}}} } }, batch:async statements=>{sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result}catch(error){sqlite.exec('ROLLBACK');throw error}} }
}
const call = async (handler, DB, body, token) => { const response=await handler({env:{DB,REMINDER_AGENT_TOKEN:'agent-secret'},request:new Request('https://example.test/api',{method:'POST',headers:{'content-type':'application/json',...(token?{'X-Budget-Reminder-Token':token}:{})},body:JSON.stringify(body)})}); return {httpStatus:response.status,...await response.json()} }

test('weekly reminder uses concise emoji lines and slash-formatted dates',()=>{
  const budgets=[{monthKey:'2027-02',bucket:'Groceries',target:1000},{monthKey:'2027-02',bucket:'Restaurants/Fast Food',target:400},{monthKey:'2027-02',bucket:'Shopping/Gifts',target:280}],rows=[{date:'2027-02-09',amount:200,name:'Market',bucket:'Groceries',flow:'Expense'},{date:'2027-02-10',amount:40,name:'Cafe',bucket:'Restaurants/Fast Food',flow:'Expense'},{date:'2027-02-11',amount:60,name:'Target',bucket:'Shopping/Gifts',flow:'Expense'}]
  const budgetSummary=weeklySummary(rows,budgets,'2027-02-08',{categories:BUDGET_MESSAGE_CATEGORIES.map(row=>row.bucket)}),spendingSummary=weeklySummary(rows,budgets,'2027-02-08',{categories:SPENDING_MESSAGE_CATEGORIES.map(row=>row.bucket)})
  const budget=composeWeeklyReminder(budgetSummary)
  assert.equal(budget.text,'Budget this week (02/08–02/14):\n🛒 Groceries: $250.02\n🍽️ Dining: $100.03')
  assert.equal(composeWeeklySpending(spendingSummary).text,'Spent last week (02/08–02/14):\n🛒 Groceries: $200\n🍽️ Dining: $40\n🛍️ Shopping: $60\n💸 Biggest: Market — $200')
  assert.equal(composeWeeklyReminder(weeklySummary(rows,budgets.slice(0,1),'2027-02-08',{categories:BUDGET_MESSAGE_CATEGORIES.map(row=>row.bucket)})).canSend,false)
})
test('cutback preview ranks variable risks, excludes fixed expenses, and handles a healthy month',()=>{
  const rows=[{date:'2026-10-10',amount:90,bucket:'Groceries',flow:'Expense'},{date:'2026-10-10',amount:5000,bucket:'Fixed Expenses',flow:'Expense'}],budgets=[{monthKey:'2026-10',bucket:'Groceries',target:100},{monthKey:'2026-10',bucket:'Fixed Expenses',target:5000}]
  const result=cutbackPreview({monthKey:'2026-10',rows,budgets,savingsSetting:{income:500000,savings:100000},asOf:'2026-10-15'})
  assert.equal(result.canSend,true);assert.deepEqual(result.risks.map(row=>row.bucket),['Groceries']);assert.match(result.text,/Projected savings/)
  assert.equal(cutbackPreview({monthKey:'2026-10',rows:[],budgets,asOf:'2026-10-15'}).canSend,false)
})
test('week confirmation is shared and can be reopened',async()=>{
  const db=database(),confirmed=await call(confirmWeek,db,{action:'confirm',weekStart:'2020-01-06'})
  assert.equal(confirmed.httpStatus,200)
  let shared=await (await state({env:{DB:db}})).json();assert.equal(shared.weeklyConfirmations[0].weekStart,'2020-01-06')
  assert.equal((await call(confirmWeek,db,{action:'reopen',weekStart:'2020-01-06'})).httpStatus,200)
  shared=await (await state({env:{DB:db}})).json();assert.equal(shared.weeklyConfirmations.length,0)
})
test('reminder outbox is idempotent, agent protected, and records delivery',async()=>{
  const db=database();db.sqlite.exec(`INSERT INTO monthly_budgets(month_key,bucket,target,paced,updated_at,updated_by,sort_order) VALUES('2026-10','Groceries',100,1,'now','test',0);
    INSERT INTO monthly_savings_settings VALUES('2026-10',500000,100000,0,0,'now','test');
    INSERT INTO transactions(txn_key,date,amount,name,bucket,account,is_income,uploaded_at,uploaded_by,source,imported_flow) VALUES('t','2026-10-10',90,'Market','Groceries','Card',0,'now','test','import','Expense');`)
  const body={action:'queue',kind:'cutback',monthKey:'2026-10',clientId:'12345678-1234-1234-1234-123456789012'}
  const first=await call(reminders,db,body),second=await call(reminders,db,body)
  assert.equal(first.httpStatus,200);assert.equal(second.item.id,first.item.id);assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM message_outbox').get().count,1)
  assert.equal((await call(reminders,db,{action:'claim'},'wrong')).httpStatus,403)
  const claimed=await call(reminders,db,{action:'claim'},'agent-secret');assert.equal(claimed.item.id,first.item.id)
  assert.equal((await call(reminders,db,{action:'complete',id:claimed.item.id,claimToken:claimed.item.claimToken},'agent-secret')).httpStatus,200)
  assert.equal(db.sqlite.prepare('SELECT status FROM message_outbox').get().status,'sent')
})
test('manual weekly budget and spending messages require confirmation and queue separately',async()=>{
  const db=database();db.sqlite.exec("INSERT INTO monthly_budgets(month_key,bucket,target,paced,updated_at,updated_by,sort_order) VALUES('2027-02','Groceries',1000,1,'now','test',0),('2027-02','Restaurants/Fast Food',400,1,'now','test',1),('2027-02','Shopping/Gifts',280,1,'now','test',2); INSERT INTO transactions(txn_key,date,amount,name,bucket,account,is_income,uploaded_at,uploaded_by,source,imported_flow) VALUES('shop','2027-02-03',50,'Target','Shopping/Gifts','Card',0,'now','test','manual','Expense')")
  const id='12345678-1234-1234-1234-123456789012'
  assert.equal((await call(reminders,db,{action:'preview',kind:'weekly-spend',weekStart:'2027-02-01'})).httpStatus,400)
  db.sqlite.exec("INSERT INTO weekly_confirmations VALUES('2027-02-01','2027-02-07','now','test')")
  const spend=await call(reminders,db,{action:'queue',kind:'weekly-spend',weekStart:'2027-02-01',clientId:id})
  const budget=await call(reminders,db,{action:'queue',kind:'weekly',weekStart:'2027-02-08',confirmationWeekStart:'2027-02-01',clientId:'22345678-1234-1234-1234-123456789012'})
  assert.equal(spend.httpStatus,200);assert.equal(budget.httpStatus,200)
  assert.deepEqual(db.sqlite.prepare('SELECT kind FROM message_outbox ORDER BY id').all().map(row=>row.kind),['weekly-spend','weekly'])
  assert.equal((await call(reminders,db,{action:'automatic',weekStart:'2027-02-08'},'agent-secret')).httpStatus,400)
})
