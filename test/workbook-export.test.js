import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPortfolio } from '../src/lib/portfolio.js'
import { buildBudgetWorkbook } from '../src/lib/workbookExport.js'

const transactions=[
  {txnKey:'1',date:'2026-01-31',amount:100,name:'Market',bucket:'Groceries',flow:'Expense',account:'Card',rawCategory:'Food',originalBucket:'Dining',overrideBucket:'Groceries',overrideFlow:null},
  {txnKey:'2',date:'2026-01-31',amount:-250,name:'Paycheck',bucket:'Income',flow:'Income',account:'Checking',rawCategory:'Income',originalBucket:'Income',overrideBucket:null,overrideFlow:null},
  {txnKey:'3',date:'2026-02-01',amount:40,name:'Cafe',bucket:'Dining',flow:'Ignore',account:'Card',rawCategory:'Dining',originalBucket:'Dining',overrideBucket:null,overrideFlow:'Ignore'},
]
const budgets=[{monthKey:'2026-01',bucket:'Groceries',target:300,paced:true},{monthKey:'2026-01',bucket:'Donations',target:50,paced:false},{monthKey:'2026-02',bucket:'Dining',target:100,paced:true}]
const archive={'2026-01':transactions.slice(0,2),'2026-02':transactions.slice(2)},budgetMap={'2026-01':{Groceries:{target:300,paced:true},Donations:{target:50,paced:false}},'2026-02':{Dining:{target:100,paced:true}}},portfolio=buildPortfolio(archive,budgetMap,new Date(2026,1,3))
const shared={available:true,transactions,budgets,uploadHistory:[{fileName:'family.csv',rowCount:3,added:3,unchanged:0,uploadedAt:'2026-02-03T16:00:00.000Z',uploadedBy:'family@example.com'}],lastUpload:{fileName:'family.csv',uploadedAt:'2026-02-03T16:00:00.000Z'}}

test('complete workbook preserves audit fields and all saved sheets',async()=>{const {workbook}=await buildBudgetWorkbook({scope:'full',month:'2026-01',shared,portfolio}),names=workbook.worksheets.map(sheet=>sheet.name);assert.deepEqual(names,['Tracking','Monthly Budgets','Monthly Summary','Upload History','Export Info']);const tracking=workbook.getWorksheet('Tracking');assert.equal(tracking.rowCount,4);assert.equal(tracking.getCell('A2').value.getDate(),31);assert.equal(tracking.getCell('D2').value,'Groceries');assert.equal(tracking.getCell('G2').value,'Food');assert.equal(tracking.getCell('H2').value,'Dining');assert.equal(tracking.getCell('I2').value,'Groceries');const summary=workbook.getWorksheet('Monthly Summary');assert.equal(summary.rowCount,3);assert.equal(summary.getCell('B2').value,100);assert.equal(summary.getCell('C2').value,250)})
test('selected month workbook filters transactions and omits upload history',async()=>{const {workbook,fileName}=await buildBudgetWorkbook({scope:'month',month:'2026-01',shared,portfolio});assert.match(fileName,/budget-wrapped-2026-01-/);assert.deepEqual(workbook.worksheets.map(sheet=>sheet.name),['Tracking','Budget','Summary','Export Info']);assert.equal(workbook.getWorksheet('Tracking').rowCount,3);assert.equal(workbook.getWorksheet('Budget').rowCount,3);assert.equal(workbook.getWorksheet('Summary').getCell('B2').value,100)})
test('export refuses to run without shared D1 state',async()=>{await assert.rejects(buildBudgetWorkbook({scope:'full',month:'2026-01',shared:{available:false},portfolio}),/unavailable/)})
