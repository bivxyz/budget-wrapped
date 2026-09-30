import test from 'node:test'
import assert from 'node:assert/strict'
import { cents, dailyAllowance, incomeSuggestion, monday, recommendWeekly, weeklyBaselines, weeklySummary } from '../src/lib/weekly.js'
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
  const base={income:500000,savings:100000,other:250000,groceries:100000,restaurants:80000}
  assert.deepEqual(recommendWeekly(base),{available:150000,groceries:100000,restaurants:50000,shortfall:0,bonus:0})
  assert.equal(recommendWeekly({...base,other:350000}).shortfall,50000)
  assert.equal(recommendWeekly({...base,income:600000}).bonus,70000)
  assert.equal(recommendWeekly({...base,income:0}).groceries,0)
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
