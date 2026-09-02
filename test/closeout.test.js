import test from 'node:test'
import assert from 'node:assert/strict'
import { onRequestPost as updateMonthStatus } from '../functions/api/month-status.js'
import { activePlanningMonth,buildPortfolio,portfolioMonths } from '../src/lib/portfolio.js'

const request=(action,monthKey='2020-01')=>new Request('https://example.test/api/month-status',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,monthKey})})
function database({budget=500,transactions=10,coverageThrough='2020-01-31',reviewedAt='2020-02-01T00:00:00Z',closed=false}={}){
  const calls=[]
  return{calls,prepare(sql){return{bind(...values){return{first:async()=>{if(sql.includes('monthly_budget_settings'))return budget==null?null:{spending_limit:budget};if(sql.includes('COUNT(*)'))return{count:transactions,coverage_through:coverageThrough};if(sql.includes('monthly_reviews'))return reviewedAt==null?null:{upload_event_id:7,reviewed_at:reviewedAt};if(sql.includes('monthly_closeouts'))return closed?{month_key:values[0]}:null;return null},run:async()=>{calls.push({sql,values});return{meta:{changes:1}}}}}}}}
}

test('month collections include the planning month after the latest closeout',()=>{const months=portfolioMonths({'2026-08':[]},{},{},['2026-08']);assert.deepEqual(months,['2026-08','2026-09']);assert.equal(activePlanningMonth(months,'2026-09',['2026-08']),'2026-09');assert.equal(activePlanningMonth(['2026-12'],'2027-01',['2026-12']),'2027-01')})

test('portfolio supplies an empty next-month workspace seeded by previous actuals in the UI',()=>{const row={date:'2026-08-01',amount:75,name:'Market',bucket:'Groceries',flow:'Expense'};const portfolio=buildPortfolio({'2026-08':[row]},{'2026-08':{Groceries:{target:100,paced:true}}},new Date(2026,8,2),{'2026-08':100},['2026-08']);assert.equal(portfolio.currentKey,'2026-09');assert.equal(portfolio.monthly['2026-09'].totalSpent,0);assert.equal(portfolio.monthly['2026-08'].byCategory.Groceries,75)})

test('closeout validates budget, transactions, and review before inserting',async()=>{for(const [state,message] of [[{budget:0},'Save a monthly budget'],[{transactions:0},'Upload transactions'],[{coverageThrough:'2020-01-30'},'Upload transactions through 2020-01-31'],[{reviewedAt:null},'Mark this month']]){const env={DB:database(state)},response=await updateMonthStatus({request:request('close'),env});assert.equal(response.status,409);assert.match((await response.json()).error,new RegExp(message))}const db=database(),response=await updateMonthStatus({request:request('close'),env:{DB:db}});assert.equal(response.status,200);assert.equal(db.calls.some(call=>call.sql.includes('INSERT INTO monthly_closeouts')),true)})

test('reopen removes an existing closeout',async()=>{const db=database({closed:true}),response=await updateMonthStatus({request:request('reopen'),env:{DB:db}});assert.equal(response.status,200);assert.equal(db.calls.some(call=>call.sql.includes('DELETE FROM monthly_closeouts')),true)})
