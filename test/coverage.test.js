import test from 'node:test'
import assert from 'node:assert/strict'
import { monthEndDate,monthlySummary } from '../src/lib/tracker.js'

const row=(date,amount,flow='Expense')=>({date,amount,name:flow,bucket:flow==='Expense'?'Groceries':'Income',rawCategory:flow,flow})
test('month coverage recognizes calendar month end including leap years',()=>{assert.equal(monthEndDate('2026-08'),'2026-08-31');assert.equal(monthEndDate('2024-02'),'2024-02-29');assert.equal(monthlySummary([row('2026-08-30',10)]).fullMonthData,false);assert.equal(monthlySummary([row('2026-08-31',10)]).fullMonthData,true)})
test('monthly savings or loss is income minus true spending and investment contributions',()=>{const result=monthlySummary([row('2026-08-31',120),row('2026-08-31',-500,'Income'),row('2026-08-31',200,'Transfer'),row('2026-08-31',50,'Investment')]);assert.equal(result.totalIncome,500);assert.equal(result.totalSpent,120);assert.equal(result.investmentContributions,50);assert.equal(result.operatingNet,380);assert.equal(result.savingsLoss,330);assert.equal(result.netProfit,330)})
test('original family worksheet formula reconciles income, expenses, donations, and investments',()=>{const result=monthlySummary([row('2026-08-31',6258.35),row('2026-08-31',950),row('2026-08-31',-13431.87,'Income'),row('2026-08-31',0,'Investment')]);assert.equal(result.totalIncome,13431.87);assert.equal(result.totalSpent,7208.35);assert.equal(result.savingsLoss,6223.52)})
