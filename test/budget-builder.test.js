import test from 'node:test'
import assert from 'node:assert/strict'
import { allocationTotals,priorActualPlan,reorderBudgetItems } from '../src/lib/budgetBuilder.js'

test('new budget plans seed positive prior-month actuals in descending order',()=>{assert.deepEqual(priorActualPlan({byCategory:{Dining:150.235,Groceries:400,Refunds:-20,Empty:0}}),[{bucket:'Groceries',target:400,paced:true},{bucket:'Dining',target:150.24,paced:true}])})
test('allocation totals expose both unused capacity and allowed overages',()=>{assert.deepEqual(allocationTotals(1000,[{target:300},{target:250}]),{allocated:550,unallocated:450,over:0});assert.deepEqual(allocationTotals(500,[{target:325},{target:275}]),{allocated:600,unallocated:0,over:100})})
test('drag reordering keeps category allocations intact',()=>{const rows=[{bucket:'A',target:1},{bucket:'B',target:2},{bucket:'C',target:3}],next=reorderBudgetItems(rows,'C','A');assert.deepEqual(next.map(row=>row.bucket),['C','A','B']);assert.equal(next[0].target,3)})
