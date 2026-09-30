// Optional browser smoke test. Uses synthetic intercepted state; never writes family D1.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/check-weekly-ui.mjs
import assert from 'node:assert/strict'
import { dateKey } from '../src/lib/weekly.js'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  const date = dateKey(), month = date.slice(0, 7)
  const state = { transactions: [], budgets: [{ monthKey: month, bucket: 'Bills', target: 1500, paced: false, sortOrder: 0 }], budgetSettings: [{ monthKey: month, spendingLimit: 1500 }], monthlyReviews: [], monthlyCloseouts: [], transactionMatches: [], savingsSettings: [], importCoverage: [], uploadHistory: [], lastUpload: null }
  let failManual = true, planPayload
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/state') return route.fulfill({ json: state })
    const body = route.request().postDataJSON()
    if (path === '/api/manual') {
      if (failManual) return route.fulfill({ status: 400, json: { error: 'Test save failure. Please retry.' } })
      if (body.action === 'create') state.transactions.push({ ...body, txnKey: `manual:${body.clientId}`, source: 'manual', flow: 'Expense', importedFlow: 'Expense', originalBucket: body.bucket })
      if (body.action === 'update') Object.assign(state.transactions.find(row => row.txnKey === body.txnKey), body)
      if (body.action === 'delete') state.transactions = state.transactions.filter(row => row.txnKey !== body.txnKey)
      return route.fulfill({ json: { ok: true } })
    }
    if (path === '/api/weekly-plan') {
      planPayload = body
      state.savingsSettings = [{ ...body }]
      state.budgets = [state.budgets[0], { monthKey: month, bucket: 'Groceries', target: body.groceries / 100, paced: true }, { monthKey: month, bucket: 'Restaurants/Fast Food', target: body.restaurants / 100, paced: true }]
      state.budgetSettings = [{ monthKey: month, spendingLimit: state.budgets.reduce((sum, row) => sum + row.target, 0) }]
      return route.fulfill({ json: { ok: true } })
    }
    throw new Error(`Unexpected mutation: ${path}`)
  })
  await page.goto(`${process.env.PREVIEW_URL || 'http://127.0.0.1:8789'}/?m=${month}`)
  await page.getByRole('button', { name: 'Add expense', exact: true }).click()
  await page.getByLabel('Merchant', { exact: true }).fill('Smoke test market')
  await page.getByLabel('Amount ($)', { exact: true }).fill('25.50')
  await page.getByLabel('Account', { exact: true }).fill('Test Card')
  await page.getByRole('button', { name: 'Save expense', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Test save failure' }).waitFor()
  assert.equal(state.transactions.length, 0)
  failManual = false
  await page.getByRole('button', { name: 'Save expense', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'Transactions', exact: true }).click()
  await page.getByText('Smoke test market', { exact: false }).waitFor()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Amount ($)', { exact: true }).fill('30.00')
  await page.getByRole('button', { name: 'Save expense', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(state.transactions[0].amount, 30)
  await page.getByRole('button', { name: 'Weekly Budget', exact: true }).click()
  await page.getByText('Plan weekly targets', { exact: true }).click()
  await page.getByLabel('Expected monthly take-home income', { exact: true }).fill('5000')
  await page.getByLabel('Grocery monthly baseline', { exact: true }).fill('800')
  await page.getByLabel('Restaurant monthly baseline', { exact: true }).fill('400')
  await page.getByRole('checkbox').nth(0).check()
  await page.getByRole('checkbox').nth(1).check()
  await page.getByRole('button', { name: 'Use recommended targets', exact: true }).click()
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  assert.ok(await page.getByRole('heading', { name: 'Your weekly spending' }).isVisible())
  await page.getByRole('button', { name: 'Save monthly targets', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Saved for the family. Monthly targets' }).waitFor()
  assert.equal(planPayload.income, 500000); assert.equal(planPayload.savings, 100000)
  assert.equal(planPayload.groceries, 80000); assert.equal(planPayload.restaurants, 40000)
  await page.screenshot({ path: '/tmp/budget-weekly-synthetic-desktop.png', fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: '/tmp/budget-weekly-synthetic-mobile.png', fullPage: true })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.reload()
  await page.getByRole('button', { name: 'Weekly Budget', exact: true }).click()
  await page.getByText('Plan weekly targets', { exact: true }).click()
  assert.equal(await page.getByLabel('My grocery monthly target', { exact: true }).inputValue(), '800')
  await page.getByRole('button', { name: 'Transactions', exact: true }).click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Delete Smoke test market', exact: true }).click()
  await page.getByText('0 rows ·', { exact: false }).waitFor()
  assert.equal(state.transactions.length, 0)
  assert.deepEqual(errors, [])
  console.log('PASS: manual failure/retry/edit/delete, weekly save/reload, dirty navigation, desktop/mobile containment. Synthetic data only.')
} finally { await browser.close() }
