import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeArchiveMonth, annualTrendView, budgetPerformance, buildPortfolio, localDateKey } from '../src/lib/portfolio.js'
import { importedFlow, monthlySummary, spendingAudit, transactionDisposition } from '../src/lib/tracker.js'
const row=(date,amount,bucket,flow='Expense',name=bucket)=>({date,amount,name,rawCategory:bucket,originalBucket:bucket,bucket,flow,account:'Checking'})
test('local date keys do not shift local midnight',()=>assert.equal(localDateKey(new Date(2026,2,1)),'2026-03-01'))
test('classifies imported non-spending flows while retaining loan payments as true expenses',()=>{assert.equal(importedFlow({...row('2026-03-01',100,'Investments'),'rawCategory':'Investment'}),'Investment');assert.equal(importedFlow({...row('2026-03-01',100,'Fixed Expenses'),'rawCategory':'Credit Card Payment'}),'Transfer');assert.equal(importedFlow({...row('2026-03-01',100,'Fixed Expenses'),'rawCategory':'Loan Payment'}),'Expense')})
test('top expenses and categories include only effective expense flows',()=>{const market=row('2026-03-01',50,'Groceries','Expense','Market'),s=monthlySummary([market,row('2026-03-02',25,'Groceries','Expense','Shop'),row('2026-03-03',500,'Bills','Transfer','Payment'),row('2026-03-04',100,'Dining','Ignore','Cafe')]);assert.equal(s.totalSpent,75);assert.equal(s.topExpenses[0].name,'Market');assert.equal(s.topCategories[0].bucket,'Groceries');assert.equal(s.topCategories[0].amount,75);assert.equal(s.topCategories[0].highestExpense.name,'Market')})
test('loan payments remain in totals but are omitted from top individual expenses',()=>{const mortgage={...row('2026-03-01',4000,'Fixed Expenses','Expense','Mortgage'),rawCategory:'Loan Payment'},groceries=row('2026-03-02',200,'Groceries','Expense','Market'),s=monthlySummary([mortgage,groceries]);assert.equal(s.totalSpent,4200);assert.equal(s.topExpenses[0].name,'Market');assert.equal(s.topCategories[0].bucket,'Fixed Expenses')})
test('fixed expenses remain in totals and categories but never rank as individual purchases',()=>{const fixed=row('2026-03-01',4000,'Fixed Expenses','Expense','Insurance'),groceries=row('2026-03-02',200,'Groceries','Expense','Market'),s=monthlySummary([fixed,groceries]),analysis=analyzeArchiveMonth([fixed,groceries]);assert.equal(s.totalSpent,4200);assert.equal(s.topExpenses[0].name,'Market');assert.equal(s.topCategories[0].bucket,'Fixed Expenses');assert.equal(analysis.totalSpent,4200);assert.equal(analysis.biggestPurchase.name,'Market')})
test('ranks the five largest category budget overages and unused amounts',()=>{const rows=[{bucket:'Exact',target:10,actual:10},{bucket:'Zero spend',target:500,actual:0},...Array.from({length:7},(_,index)=>({bucket:'Over '+index,target:100,actual:110+index})),...Array.from({length:7},(_,index)=>({bucket:'Under '+index,target:200,actual:100-index}))],result=budgetPerformance(rows);assert.equal(result.over.length,5);assert.deepEqual(result.over.map(item=>item.difference),[16,15,14,13,12]);assert.equal(result.under.length,5);assert.deepEqual(result.under.map(item=>item.difference),[106,105,104,103,102]);assert.equal(result.under.some(item=>item.bucket==='Zero spend'),false);assert.equal([...result.over,...result.under].some(item=>item.bucket==='Exact'),false)})
test('uses monthly budgets, prorates current month, and leaves lumpy categories unprojected',()=>{const p=buildPortfolio({'2026-03':[row('2026-03-01',200,'Groceries'),row('2026-03-01',400,'Bills')]},{'2026-03':{Groceries:{target:620,paced:true},Bills:{target:400,paced:false}}},new Date(2026,2,10));const g=p.monthly['2026-03'].pacing.find(x=>x.bucket==='Groceries'),b=p.monthly['2026-03'].pacing.find(x=>x.bucket==='Bills');assert.equal(g.proratedTarget,200);assert.equal(g.paceRatio,1);assert.equal(b.projected,null)})
test('official spending limits drive monthly and YTD budgets independently of allocations',()=>{const p=buildPortfolio({'2026-03':[row('2026-03-01',200,'Groceries')]},{'2026-03':{Groceries:{target:300,paced:true,sortOrder:0}}},new Date(2026,2,10),{'2026-03':500});assert.equal(p.monthly['2026-03'].allocatedTotal,300);assert.equal(p.monthly['2026-03'].budgetTotal,500);assert.equal(p.monthly['2026-03'].budgetRemaining,300);assert.equal(p.ytd.target,500)})
test('category and flow overrides drive summaries',()=>{const s=monthlySummary([{...row('2026-03-01',90,'Shopping'),originalBucket:'Shopping',bucket:'Groceries',importedFlow:'Expense',flow:'Expense',overrideBucket:'Groceries'},{...row('2026-03-02',50,'Dining'),flow:'Ignore',overrideFlow:'Ignore'}]);assert.equal(s.topCategories[0].bucket,'Groceries');assert.equal(s.topCategories[0].amount,90);assert.equal(s.topCategories[0].highestExpense.bucket,'Groceries')})
test('normalizes transfer aliases and reports excluded gross movement without netting directions',()=>{
  const rows=[
    {...row('2026-09-01',5728.78,'Fixed Expenses','Transfer','Card payment'),rawCategory:'  credit-card PAYMENTS '},
    {...row('2026-09-02',1000,'Transfer','Transfer','Move out'),rawCategory:'Internal Transfer'},
    {...row('2026-09-02',-981.38,'Transfer','Transfer','Move in'),rawCategory:'internal-transfers'},
    {...row('2026-09-03',50,'Transfer','Transfer','Other move'),rawCategory:'Transfers'},
  ],audit=spendingAudit(rows)
  assert.equal(importedFlow(rows[0]),'Transfer')
  assert.equal(importedFlow(rows[1]),'Transfer')
  assert.deepEqual(audit.excluded.creditCardPayments,{count:1,gross:5728.78})
  assert.deepEqual(audit.excluded.internalTransfers,{count:2,gross:1981.38})
  assert.deepEqual(audit.excluded.otherTransfers,{count:1,gross:50})
  assert.equal(audit.trueSpending,0)
})
test('refunds reduce spending rather than becoming income and unclear expense categories remain reviewable',()=>{
  const audit=spendingAudit([
    row('2026-09-01',100,'Uncategorized','Expense','Purchase'),
    row('2026-09-02',-20,'Cash & Check','Expense','Refund'),
    row('2026-09-03',-250,'Income','Income','Paycheck'),
  ])
  assert.equal(audit.grossPurchases,100)
  assert.equal(audit.refunds,20)
  assert.equal(audit.trueSpending,80)
  assert.equal(audit.income,250)
  assert.equal(audit.savingsLoss,170)
  assert.deepEqual(audit.needsReview,{uncategorized:1,cashAndChecks:1,ambiguousMatches:0})
})
test('flow overrides are authoritative throughout the transaction disposition',()=>{
  const payment={...row('2026-09-01',500,'Fixed Expenses','Transfer','Payment'),rawCategory:'Credit Card Payment',overrideFlow:'Expense'},ignored={...row('2026-09-02',75,'Groceries','Expense','Market'),overrideFlow:'Ignore'}
  assert.equal(transactionDisposition(payment).kind,'purchase')
  assert.equal(transactionDisposition(ignored).kind,'ignored')
  assert.equal(spendingAudit([payment,ignored]).trueSpending,500)
})
test('September raw benchmark reconciles purchases, income, transfers, and investments',()=>{
  const audit=spendingAudit([
    row('2026-09-10',11357.76,'Spending'),
    row('2026-09-15',-27741.80,'Income','Income'),
    {...row('2026-09-20',5728.78,'Fixed Expenses','Transfer'),rawCategory:'Credit Card Payment'},
    {...row('2026-09-21',1000,'Transfer','Transfer'),rawCategory:'Internal Transfers'},
    {...row('2026-09-22',-981.38,'Transfer','Transfer'),rawCategory:'Internal Transfer'},
    {...row('2026-09-23',200,'Investments','Investment'),rawCategory:'Investment'},
  ])
  assert.equal(audit.income,27741.80)
  assert.equal(audit.trueSpending,11357.76)
  assert.equal(audit.operatingNet,16384.04)
  assert.equal(audit.investmentContributions,200)
  assert.equal(audit.savingsLoss,16184.04)
  assert.equal(audit.excluded.creditCardPayments.gross,5728.78)
  assert.equal(audit.excluded.internalTransfers.count,2)
  assert.equal(audit.excluded.investments.gross,200)
})
test('portfolio, Wrapped analysis, trends, and audit reconcile to the same corrected spending',()=>{
  const rows=[row('2026-09-01',100,'Groceries'),row('2026-09-02',-20,'Groceries'),row('2026-09-03',40,'Dining'),row('2026-09-04',-500,'Income','Income'),{...row('2026-09-05',300,'Fixed Expenses','Transfer'),rawCategory:'Credit Card Payment'}],portfolio=buildPortfolio({'2026-09':rows},{'2026-09':{Groceries:{target:200},Dining:{target:100}}},new Date(2026,8,30)),monthly=portfolio.monthly['2026-09'],wrapped=portfolio.analyses['2026-09'],annual=annualTrendView(portfolio,'2026')
  assert.equal(monthly.spendingAudit.trueSpending,120)
  assert.equal(monthly.totalSpent,120)
  assert.equal(wrapped.totalSpent,120)
  assert.equal(wrapped.net,380)
  assert.equal(annual.actual,120)
  assert.equal(annual.categories.reduce((sum,row)=>sum+row.actual,0),120)
})
