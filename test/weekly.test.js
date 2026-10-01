import test from 'node:test'
import assert from 'node:assert/strict'
import { cents, dailyAllowance, incomeSuggestion, monday, monthlyFromWeekly, previousMonthWeekly, recommendWeekly, savingsPosition, weeklyBaselines, weeklyFromMonthly, weeklySummary } from '../src/lib/weekly.js'
import { matchSuggestions } from '../src/lib/reconciliation.js'
import { monthlySummary } from '../src/lib/tracker.js'

test('daily cent allocation reconciles each calendar month including leap February', () => {
  for (const [month, days] of [['2024-02', 29], ['2026-09', 30], ['2026-12', 31]]) {
    assert.equal(Array.from({ length: days }, (_, i) => dailyAllowance(123.47, `${month}-${String(i+1).padStart(2,'0')}`)).reduce((a,b)=>a+b,0),12347)
  }
  assert.equal(monday('2027-01-01'),'2026-12-28')
})
test('cross-month allowances require both targets and spending uses active expense rows', () => {
  const budgets=[{monthKey:'2026-08',bucket:'Groceries',target:310},{monthKey:'2026-09',bucket:'Groceries',target:600}]
  const base={date:'2026-08-31',name:'Market',bucket:'Groceries',flow:'Expense',amount:20}
  const rows=[base,{...base,amount:-5},{...base,source:'manual',amount:10},{...base,matchedTxnKey:'import'},{...base,deletedAt:'now'},{...base,flow:'Transfer'}]
  const result=weeklySummary(rows,budgets,'2026-09-01').categories[0]
  assert.equal(result.allowance,13000);assert.equal(result.spent,2500);assert.equal(result.remaining,10500)
  assert.equal(weeklySummary(rows,budgets.slice(0,1),'2026-09-01').categories[0].allowance,null)
})
test('covered zero-spending weeks count; partial and current weeks do not', () => {
  const rows=[{date:'2026-08-04',amount:100,flow:'Expense',bucket:'Groceries'}]
  assert.equal(weeklyBaselines(rows,[],'2026-08-31').categories[0].weekly,null)
  const baseline=weeklyBaselines(rows,[{from:'2026-08-03',through:'2026-08-30'}],'2026-08-31')
  assert.equal(baseline.weeks,4);assert.equal(baseline.categories[0].weekly,0)
  assert.equal(weeklyBaselines(rows,[{from:'2026-08-04',through:'2026-08-30'}],'2026-08-31').weeks,3)
})
test('recommendations reserve savings, prioritize groceries, and expose shortfalls and bonus', () => {
  const base={income:550000,savings:100000,other:250000,groceries:20000,restaurants:15000}
  assert.deepEqual(recommendWeekly(base),{available:200000,groceries:20000,restaurants:15000,groceriesMonthly:86667,restaurantsMonthly:65000,shortfall:0,bonus:48333})
  assert.equal(recommendWeekly({...base,other:400000}).shortfall,101667)
  assert.equal(recommendWeekly({...base,income:650000}).bonus,148333)
  assert.equal(recommendWeekly({...base,income:0}).groceries,0)
})
test('weekly and monthly target conversions are stable to the cent',()=>{
  for(const weekly of [0,1,9999,20000,32145])assert.equal(weeklyFromMonthly(monthlyFromWeekly(weekly)),weekly)
})
test('previous month weekly context uses effective expenses and reports coverage',()=>{
  const rows=[{date:'2026-08-02',amount:100,flow:'Expense',bucket:'Groceries'},{date:'2026-08-03',amount:-10,flow:'Expense',bucket:'Groceries'},{date:'2026-08-04',amount:20,flow:'Transfer',bucket:'Groceries'},{date:'2026-08-05',amount:50,flow:'Expense',bucket:'Restaurants/Fast Food'}]
  const partial=previousMonthWeekly(rows,[],'2026-09');assert.equal(partial.complete,false);assert.equal(partial.categories[0].monthly,9000)
  const complete=previousMonthWeekly(rows,[{from:'2026-08-01',through:'2026-08-31'}],'2026-09');assert.equal(complete.complete,true);assert.equal(complete.categories[0].weekly,2077)
})
test('savings position separates selected goal, extra capacity, and shortfall',()=>{
  assert.deepEqual(savingsPosition({income:1000000,savings:100000,budget:700000,projected:650000}),{spendable:900000,extra:200000,shortfall:0,planned:300000,projected:350000})
  assert.equal(savingsPosition({income:1000000,savings:500000,budget:600000}).shortfall,100000)
  assert.deepEqual(savingsPosition({income:50000,savings:100000,budget:20000,projected:80000}),{spendable:-50000,extra:0,shortfall:70000,planned:30000,projected:-30000})
})
test('exact matching requires unique amount/date/merchant/account and preserves uncertainty', () => {
  const manual={txnKey:'m',source:'manual',date:'2026-08-03',amount:20,name:' Market ',account:' Card ',bucket:'Groceries',flow:'Expense'}
  const imported={...manual,txnKey:'i',source:'import',name:'market',account:'card'}
  assert.equal(matchSuggestions([manual,imported])[0].automatic,true)
  assert.equal(matchSuggestions([manual,imported,{...imported,txnKey:'i2'}]).some(row=>row.automatic),false)
  assert.equal(matchSuggestions([{...manual,account:''},imported])[0].automatic,false)
  assert.equal(matchSuggestions([manual,{...imported,date:'2026-08-04'}])[0].automatic,false)
  assert.equal(matchSuggestions([manual,{...imported,overrideBucket:'Dining'}])[0].automatic,false)
  assert.equal(matchSuggestions([manual,imported],[{manualKey:'m',importedKey:'i',undoneAt:'now'}])[0].automatic,false)
})
test('manual spending affects net profit but never imported coverage; audit entries do not count', () => {
  const row={date:'2026-08-31',source:'manual',amount:10,flow:'Expense',bucket:'Groceries'}
  const result=monthlySummary([row,{...row,matchedTxnKey:'i'},{...row,deletedAt:'now'}])
  assert.equal(result.totalSpent,10);assert.equal(result.netProfit,-10);assert.equal(result.coverageThrough,null);assert.equal(result.fullMonthData,false)
})

test('income suggestions require reviewed complete imported months and ignore transfers',()=>{
  const rows=[{date:'2026-07-01',amount:-4000,flow:'Income'},{date:'2026-08-01',amount:-5000,flow:'Income'},{date:'2026-08-04',amount:-20000,flow:'Transfer'}]
  const reviews=[{monthKey:'2026-07',reviewedAt:'yes'},{monthKey:'2026-08',reviewedAt:'yes'}]
  assert.equal(incomeSuggestion(rows,reviews,'2026-09-01').amount,null)
  assert.equal(incomeSuggestion(rows,reviews,'2026-09-01',[{from:'2026-07-01',through:'2026-08-31'}]).amount,450000)
  assert.equal(incomeSuggestion(rows,reviews,'2026-09-01',[{from:'2026-08-01',through:'2026-08-30'}]).amount,null)
})
