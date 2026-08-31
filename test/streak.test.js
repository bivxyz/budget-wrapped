import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPortfolio } from '../src/lib/portfolio.js'

const row=(date,amount,patch={})=>({date,amount,name:'Expense',account:'Checking',bucket:'Groceries',flow:'Expense',originalBucket:'Groceries',importedFlow:'Expense',...patch})
const plan=target=>({Groceries:{target,paced:true}})

test('streak counts closed months, includes exact-budget finishes, and excludes the current month',()=>{
  const archive={'2025-12':[row('2025-12-10',80)],'2026-01':[row('2026-01-10',100)],'2026-02':[row('2026-02-01',10)]}
  const budgets={'2025-12':plan(100),'2026-01':plan(100),'2026-02':plan(100)},limits={'2025-12':100,'2026-01':100,'2026-02':100}
  const streak=buildPortfolio(archive,budgets,new Date(2026,1,15),limits).streak
  assert.deepEqual({current:streak.current,best:streak.best,amount:streak.amount,throughMonth:streak.throughMonth},{current:2,best:2,amount:20,throughMonth:'2026-01'})
  assert.equal(streak.recent.at(-1).status,'success')
  assert.equal(streak.recent.some(result=>result.month==='2026-02'),false)
})

test('misses, missing data, and months without an explicit saved budget break streaks',()=>{
  const archive={'2025-11':[row('2025-11-10',50)],'2025-12':[row('2025-12-10',120)],'2026-01':[row('2026-01-10',20)],'2026-03':[row('2026-03-10',50)]}
  const budgets=Object.fromEntries(Object.keys(archive).map(month=>[month,plan(100)])),limits={'2025-11':100,'2025-12':100,'2026-03':100}
  const streak=buildPortfolio(archive,budgets,new Date(2026,3,10),limits).streak,status=Object.fromEntries(streak.recent.map(result=>[result.month,result.status]))
  assert.deepEqual({current:streak.current,best:streak.best,amount:streak.amount},{current:1,best:1,amount:50})
  assert.equal(status['2025-12'],'miss')
  assert.equal(status['2026-01'],'no-budget')
  assert.equal(status['2026-02'],'no-data')
  assert.equal(status['2026-03'],'success')
})

test('effective overrides drive streak spending and empty histories are safe',()=>{
  const ignored=row('2026-01-10',500,{flow:'Ignore',overrideFlow:'Ignore'})
  const streak=buildPortfolio({'2026-01':[ignored]},{'2026-01':plan(100)},new Date(2026,1,1),{'2026-01':100}).streak
  assert.deepEqual({current:streak.current,amount:streak.amount},{current:1,amount:100})
  assert.deepEqual(buildPortfolio({}, {}, new Date(2026,1,1),{}).streak,{current:0,best:0,amount:0,throughMonth:null,recent:[]})
})
