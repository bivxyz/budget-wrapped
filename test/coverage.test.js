import test from 'node:test'
import assert from 'node:assert/strict'
import { monthEndDate,monthlySummary } from '../src/lib/tracker.js'

const row=(date,amount,flow='Expense')=>({date,amount,name:flow,bucket:flow==='Expense'?'Groceries':'Income',rawCategory:flow,flow})
test('month coverage recognizes calendar month end including leap years',()=>{assert.equal(monthEndDate('2026-08'),'2026-08-31');assert.equal(monthEndDate('2024-02'),'2024-02-29');assert.equal(monthlySummary([row('2026-08-30',10)]).fullMonthData,false);assert.equal(monthlySummary([row('2026-08-31',10)]).fullMonthData,true)})
test('monthly net profit is income minus effective true spending',()=>{const result=monthlySummary([row('2026-08-31',120),row('2026-08-31',-500,'Income'),row('2026-08-31',200,'Transfer')]);assert.equal(result.totalIncome,500);assert.equal(result.totalSpent,120);assert.equal(result.netProfit,380)})
