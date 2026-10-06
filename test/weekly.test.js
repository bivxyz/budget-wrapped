import test from 'node:test'
import assert from 'node:assert/strict'
import { cents, dailyAllowance, expectedIncome, incomeSuggestion, latestCompletedWeek, manualWeeklyExpenses, monday, monthlyFromWeekly, previousMonthWeekly, recommendWeekly, savingsPosition, weekCanBeConfirmed, weeklyBaselines, weeklyFromMonthly, weeklyLoggingStreak, weeklySummary } from '../src/lib/weekly.js'
import { matchSuggestions } from '../src/lib/reconciliation.js'
import { monthlySummary } from '../src/lib/tracker.js'

test('daily cent allocation reconciles each calendar month including leap February', () => {
  for (const [month, days] of [['2024-02', 29], ['2026-09', 30], ['2026-12', 31]]) {
    assert.equal(Array.from({ length: days }, (_, i) => dailyAllowance(123.47, `${month}-${String(i+1).padStart(2,'0')}`)).reduce((a,b)=>a+b,0),12347)
  }
  assert.equal(monday('2027-01-01'),'2026-12-28')
  assert.equal(weekCanBeConfirmed('2026-10-04','2026-10-04'),true)
  assert.equal(weekCanBeConfirmed('2026-10-04','2026-10-03'),false)
  assert.equal(latestCompletedWeek('2026-10-05'),'2026-09-28')
  assert.equal(latestCompletedWeek('2026-10-11'),'2026-10-05')
})
test('weekly logging streak counts explicit consecutive completed-week sign-offs', () => {
  const confirmations=[
    {weekStart:'2026-09-07'},
    {weekStart:'2026-09-14'},
    {weekStart:'2026-09-28'},
    {weekStart:'2026-10-05'},
  ]
  const mondayResult=weeklyLoggingStreak(confirmations,'2026-10-12')
  assert.deepEqual({current:mondayResult.current,best:mondayResult.best,throughWeek:mondayResult.throughWeek},{current:2,best:2,throughWeek:'2026-10-05'})
  assert.equal(mondayResult.recent.at(-1).status,'logged')
  assert.equal(mondayResult.recent.at(-2).status,'logged')
  assert.equal(mondayResult.recent.at(-3).status,'missed')
  const sundayResult=weeklyLoggingStreak([...confirmations,{weekStart:'2026-10-12'}],'2026-10-18')
  assert.equal(sundayResult.current,3)
})
test('weekly expense log includes only active unreconciled manual expenses',()=>{
  const base={date:'2026-10-02',amount:20,name:'Cafe',bucket:'Restaurants/Fast Food',flow:'Expense'}
  const result=manualWeeklyExpenses([{...base,txnKey:'manual',source:'manual'},{...base,txnKey:'import',source:'import'},{...base,txnKey:'deleted',source:'manual',deletedAt:'now'},{...base,txnKey:'matched',source:'manual',matchedTxnKey:'import'},{...base,txnKey:'ignored',source:'manual',overrideFlow:'Ignore'}],'2026-09-28')
  assert.deepEqual(result.map(row=>row.txnKey),['manual'])
})
test('cross-month allowances require both targets and spending uses active expense rows', () => {
  const budgets=[{monthKey:'2026-08',bucket:'Groceries',target:310},{monthKey:'2026-09',bucket:'Groceries',target:600}]
  const base={date:'2026-08-31',name:'Market',bucket:'Groceries',flow:'Expense',amount:20}
  const rows=[base,{...base,amount:-5},{...base,source:'manual',amount:10},{...base,matchedTxnKey:'import'},{...base,deletedAt:'now'},{...base,flow:'Transfer'}]
  const result=weeklySummary(rows,budgets,'2026-09-01').categories[0]
  assert.equal(result.allowance,13000);assert.equal(result.spent,2500);assert.equal(result.remaining,10500)
  assert.equal(weeklySummary(rows,budgets.slice(0,1),'2026-09-01').categories[0].allowance,null)
})
test('weekly allowances never roll forward after underspending or confirmation',()=>{
  const budgets=[{monthKey:'2027-02',bucket:'Groceries',target:1000},{monthKey:'2027-02',bucket:'Restaurants/Fast Food',target:400}]
  const row=amount=>({date:'2027-02-03',name:'Market',bucket:'Groceries',flow:'Expense',amount})
  const stale=weeklySummary([row(200)],budgets,'2027-02-08').categories[0]
  assert.equal(stale.baseAllowance,25002);assert.equal(stale.rollover,0);assert.equal(stale.available,25002);assert.equal(stale.rolloverStatus,'none')
  const covered=weeklySummary([row(200)],budgets,'2027-02-08',{coverage:[{from:'2027-02-01',through:'2027-02-07'}]}).categories[0]
  assert.equal(covered.baseAllowance,25002);assert.equal(covered.rollover,0);assert.equal(covered.available,25002);assert.equal(covered.rolloverStatus,'none')
  const signed=weeklySummary([row(200)],budgets,'2027-02-08',{confirmations:[{weekStart:'2027-02-01',confirmedAt:'now'}]}).categories[0]
  assert.equal(signed.available,25002)
  const overspent=weeklySummary([row(300)],budgets,'2027-02-08',{coverage:[{from:'2027-02-01',through:'2027-02-07'}]}).categories[0]
  assert.equal(overspent.rollover,0);assert.equal(overspent.available,25002)
})
test('weekly allowance always uses the exact calendar-day share of its monthly target',()=>{
  const budgets=[{monthKey:'2027-02',bucket:'Groceries',target:1000},{monthKey:'2027-03',bucket:'Groceries',target:1000}]
  const rows=[{date:'2027-02-03',amount:200,bucket:'Groceries',flow:'Expense'},{date:'2027-02-10',amount:250,bucket:'Groceries',flow:'Expense'}]
  const week3=weeklySummary(rows,budgets,'2027-02-15',{coverage:[{from:'2027-02-01',through:'2027-02-14'}]}).categories[0]
  assert.equal(week3.baseAllowance,24997);assert.equal(week3.rollover,0);assert.equal(week3.available,24997)
  const capped=weeklySummary([{date:'2027-02-03',amount:950,bucket:'Groceries',flow:'Expense'}],budgets,'2027-02-22',{coverage:[{from:'2027-02-01',through:'2027-02-21'}]}).categories[0]
  assert.equal(capped.available,24997)
  const march=weeklySummary(rows,budgets,'2027-03-01',{coverage:[{from:'2027-02-01',through:'2027-02-28'}]}).categories[0]
  assert.equal(march.rollover,0)
})
test('month-opening partial weeks do not depend on coverage for allowance',()=>{
  const budgets=[{monthKey:'2026-09',bucket:'Groceries',target:300}],rows=[{date:'2026-09-02',amount:20,bucket:'Groceries',flow:'Expense'}]
  const result=weeklySummary(rows,budgets,'2026-09-07',{coverage:[{from:'2026-09-01',through:'2026-09-06'}]}).categories[0]
  assert.equal(result.rolloverStatus,'none');assert.equal(result.rollover,0);assert.deepEqual(result.pendingWeeks,[])
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
test('automatic matching allows a unique settlement-date shift but preserves uncertainty', () => {
  const manual={txnKey:'m',source:'manual',date:'2026-08-03',amount:20,name:' Market ',account:' Card ',bucket:'Groceries',flow:'Expense'}
  const imported={...manual,txnKey:'i',source:'import',name:'market',account:'card'}
  assert.equal(matchSuggestions([manual,imported])[0].automatic,true)
  assert.equal(matchSuggestions([manual,imported,{...imported,txnKey:'i2'}]).some(row=>row.automatic),false)
  assert.equal(matchSuggestions([{...manual,account:''},imported])[0].automatic,false)
  const shifted=matchSuggestions([manual,{...imported,date:'2026-08-04'}])[0];assert.equal(shifted.automatic,true);assert.equal(shifted.exact,false);assert.equal(shifted.settled,true)
  assert.equal(matchSuggestions([manual,{...imported,overrideBucket:'Dining'}])[0].automatic,false)
  assert.equal(matchSuggestions([manual,imported],[{manualKey:'m',importedKey:'i',undoneAt:'now'}])[0].automatic,false)
})
test('manual spending affects savings or loss but never imported coverage; audit entries do not count', () => {
  const row={date:'2026-08-31',source:'manual',amount:10,flow:'Expense',bucket:'Groceries'}
  const result=monthlySummary([row,{...row,matchedTxnKey:'i'},{...row,deletedAt:'now'}])
  assert.equal(result.totalSpent,10);assert.equal(result.netProfit,-10);assert.equal(result.coverageThrough,null);assert.equal(result.fullMonthData,false)
})

test('income predictions prefer reviewed months, fall back to imported history, and carry saved plans forward',()=>{
  const rows=[{date:'2026-07-01',amount:-4000,flow:'Income'},{date:'2026-08-01',amount:-5000,flow:'Income'},{date:'2026-08-04',amount:-20000,flow:'Transfer'}]
  const reviews=[{monthKey:'2026-07',reviewedAt:'yes'},{monthKey:'2026-08',reviewedAt:'yes'}]
  const fallback=incomeSuggestion(rows,reviews,'2026-09-01');assert.equal(fallback.amount,450000);assert.equal(fallback.basis,'available-history')
  const reviewed=incomeSuggestion(rows,reviews,'2026-09-01',[{from:'2026-07-01',through:'2026-08-31'}]);assert.equal(reviewed.amount,450000);assert.equal(reviewed.basis,'reviewed-complete')
  const partial=incomeSuggestion(rows,reviews,'2026-09-01',[{from:'2026-08-01',through:'2026-08-30'}]);assert.equal(partial.amount,450000);assert.equal(partial.basis,'available-history')
  const carried=expectedIncome([{monthKey:'2026-08',income:475000}], '2026-09', fallback);assert.deepEqual(carried,{amount:475000,months:['2026-08'],basis:'prior-plan'})
  const medianResult=incomeSuggestion([...rows,{date:'2026-06-01',amount:-20000,flow:'Income'}],[],'2026-09-01');assert.equal(medianResult.amount,500000)
})
