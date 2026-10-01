export const FLOW_TYPES = ['Expense', 'Income', 'Transfer', 'Investment', 'Ignore']

const normalize = value => String(value ?? '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
const cents = value => Math.round((Number(value) || 0) * 100)
const dollars = value => value / 100
const CREDIT_CARD_PAYMENT_RE = /^credit card payments?$/
const INTERNAL_TRANSFER_RE = /^internal transfers?$/
const OTHER_TRANSFER_RE = /^transfers?$/
const CASH_CHECK_RE = /^cash (?:&|and) checks?$/

export function importedFlow(transaction) {
  const category = normalize(transaction.rawCategory), bucket = normalize(transaction.bucket)
  if (transaction.isIncome || category === 'income') return 'Income'
  if (category === 'investment' || bucket === 'investments') return 'Investment'
  if (CREDIT_CARD_PAYMENT_RE.test(category) || INTERNAL_TRANSFER_RE.test(category) || OTHER_TRANSFER_RE.test(category)) return 'Transfer'
  return 'Expense'
}

export function effectiveTransaction(transaction) {
  const flow = transaction.overrideFlow || transaction.flow || transaction.importedFlow || importedFlow(transaction)
  const bucket = transaction.overrideBucket || transaction.bucket || transaction.originalBucket || transaction.rawCategory || 'Uncategorized'
  return { ...transaction, bucket, flow, isIncome: flow === 'Income' }
}

export const activeTransactionRows = rows => rows.filter(row => !row.deletedAt && !row.matchedTxnKey)

export function transactionDisposition(transaction) {
  const row = effectiveTransaction(transaction), amount = cents(row.amount)
  if (row.deletedAt) return { row, active: false, kind: 'deleted', amount }
  if (row.matchedTxnKey) return { row, active: false, kind: 'matched-manual', amount }
  if (row.flow === 'Expense') return { row, active: true, included: true, kind: amount < 0 ? 'refund' : 'purchase', amount }
  if (row.flow === 'Income') return { row, active: true, included: false, kind: 'income', amount }
  if (row.flow === 'Investment') return { row, active: true, included: false, kind: 'investment', amount }
  if (row.flow === 'Ignore') return { row, active: true, included: false, kind: 'ignored', amount }
  const category = normalize(row.rawCategory || row.originalBucket)
  const kind = CREDIT_CARD_PAYMENT_RE.test(category) ? 'credit-card-payment' : INTERNAL_TRANSFER_RE.test(category) ? 'internal-transfer' : 'other-transfer'
  return { row, active: true, included: false, kind, amount }
}

const auditGroup = () => ({ count: 0, grossCents: 0 })
const publicGroup = group => ({ count: group.count, gross: dollars(group.grossCents) })

export function spendingAudit(rows = []) {
  let grossPurchases = 0, refunds = 0, income = 0
  const excluded = { creditCardPayments: auditGroup(), internalTransfers: auditGroup(), otherTransfers: auditGroup(), investments: auditGroup(), ignored: auditGroup() }
  const needsReview = { uncategorized: 0, cashAndChecks: 0, ambiguousMatches: 0 }
  for (const transaction of rows) {
    const disposition = transactionDisposition(transaction)
    if (!disposition.active) continue
    const { row, kind, amount } = disposition, bucket = normalize(row.bucket)
    if (kind === 'purchase' || kind === 'refund') {
      if (bucket === 'uncategorized') needsReview.uncategorized += 1
      if (CASH_CHECK_RE.test(bucket)) needsReview.cashAndChecks += 1
    }
    if (row.matchStatus === 'ambiguous') needsReview.ambiguousMatches += 1
    if (kind === 'purchase') grossPurchases += Math.max(0, amount)
    else if (kind === 'refund') refunds += Math.abs(amount)
    else if (kind === 'income') income += Math.max(0, -amount)
    else {
      const group = kind === 'credit-card-payment' ? excluded.creditCardPayments : kind === 'internal-transfer' ? excluded.internalTransfers : kind === 'other-transfer' ? excluded.otherTransfers : kind === 'investment' ? excluded.investments : excluded.ignored
      group.count += 1
      group.grossCents += Math.abs(amount)
    }
  }
  const trueSpending = grossPurchases - refunds
  return {
    grossPurchases: dollars(grossPurchases), refunds: dollars(refunds), trueSpending: dollars(trueSpending), income: dollars(income), netProfit: dollars(income - trueSpending),
    excluded: { creditCardPayments: publicGroup(excluded.creditCardPayments), internalTransfers: publicGroup(excluded.internalTransfers), otherTransfers: publicGroup(excluded.otherTransfers), investments: publicGroup(excluded.investments), ignored: publicGroup(excluded.ignored) },
    needsReview,
  }
}

export function trueSpending(rows) {
  return rows.map(transactionDisposition).filter(result => result.active && result.included).map(result => result.row)
}

export function monthEndDate(monthKey) {
  if (!/^\d{4}-\d{2}$/.test(monthKey || '')) return null
  const [year, month] = monthKey.split('-').map(Number), day = new Date(year, month, 0).getDate()
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

export function monthlySummary(rows) {
  const active = activeTransactionRows(rows), spending = trueSpending(rows), audit = spendingAudit(rows), byCategoryCents = {}, highestByCategory = {}
  for (const row of spending) {
    byCategoryCents[row.bucket] = (byCategoryCents[row.bucket] || 0) + cents(row.amount)
    if (Number(row.amount) > 0 && (!highestByCategory[row.bucket] || Number(row.amount) > Number(highestByCategory[row.bucket].amount))) highestByCategory[row.bucket] = row
  }
  const byCategory = Object.fromEntries(Object.entries(byCategoryCents).map(([bucket, amount]) => [bucket, dollars(amount)]))
  const topExpenses = spending.filter(row => Number(row.amount) > 0 && row.bucket !== 'Fixed Expenses' && normalize(row.rawCategory) !== 'loan payment').sort((a, b) => b.amount - a.amount).slice(0, 5)
  const topCategories = Object.entries(byCategory).map(([bucket, amount]) => ({ bucket, amount, highestExpense: highestByCategory[bucket] || null })).sort((a, b) => b.amount - a.amount).slice(0, 5)
  const dates = active.filter(row => row.source !== 'manual').map(row => String(row.date || '')).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort(), coverageThrough = dates.at(-1) || null, monthKey = coverageThrough?.slice(0, 7) || null, monthEnd = monthEndDate(monthKey)
  return { totalSpent: audit.trueSpending, totalIncome: audit.income, netProfit: audit.netProfit, spendingAudit: audit, topExpenses, topCategories, byCategory, coverageThrough, monthEnd, fullMonthData: Boolean(coverageThrough && coverageThrough === monthEnd) }
}

export function budgetsByMonth(rows) { return rows.reduce((result, row) => { (result[row.monthKey] ||= {})[row.bucket] = { target: Number(row.target), paced: row.paced, sortOrder: Number(row.sortOrder) || 0 }; return result }, {}) }
export function budgetLimitsByMonth(rows) { return rows.reduce((result, row) => { result[row.monthKey] = Number(row.spendingLimit) || 0; return result }, {}) }
