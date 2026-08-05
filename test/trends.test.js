import test from 'node:test'
import assert from 'node:assert/strict'
import { annualTrendView } from '../src/lib/portfolio.js'

test('annual trend view filters the selected year and includes budget-only categories',()=>{
  const portfolio={
    months:['2025-12','2026-01','2026-02'],
    monthly:{'2025-12':{totalSpent:50,budgetTotal:100},'2026-01':{totalSpent:70,budgetTotal:200},'2026-02':{totalSpent:30,budgetTotal:250}},
    trends:[
      {bucket:'Groceries',series:[{month:'2025-12',actual:50,target:60},{month:'2026-01',actual:60,target:100},{month:'2026-02',actual:20,target:100}]},
      {bucket:'Dining',series:[{month:'2025-12',actual:0,target:0},{month:'2026-01',actual:10,target:20},{month:'2026-02',actual:10,target:20}]},
      {bucket:'Travel',series:[{month:'2025-12',actual:0,target:0},{month:'2026-01',actual:0,target:50},{month:'2026-02',actual:0,target:50}]},
      {bucket:'Unused',series:[{month:'2026-01',actual:0,target:0},{month:'2026-02',actual:0,target:0}]}
    ]
  }
  const view=annualTrendView(portfolio,'2026')
  assert.deepEqual({actual:view.actual,target:view.target,difference:view.difference},{actual:100,target:450,difference:350})
  assert.deepEqual(view.categories.map(row=>row.bucket),['Groceries','Dining','Travel'])
  assert.deepEqual(view.categories[0].series.map(point=>point.month),['2026-01','2026-02'])
})
