// Canonical analytics engine for Budget Wrapped.
// It is provider-agnostic: it consumes a normalized config (see providers.js)
// plus the raw CSV rows, and produces everything the slideshow + dashboard need.

import { buildTransactions, formatCurrency, parseAmount, parseDate } from './fields.js'

export { formatCurrency, parseAmount, parseDate }

const INDIVIDUAL_RANKING_EXCLUDED_BUCKETS = new Set(['Fixed Expenses'])
// Buckets that represent investing/savings rather than consumption.
const NON_SPEND_BUCKETS = new Set(['Investments'])

// Accent palette keyed for reuse across slides + charts.
export const PALETTE = [
  '#00FF87', // electric green
  '#FF6B6B', // coral
  '#FFD700', // gold
  '#00D4FF', // sky blue
  '#A855F7', // purple
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const norm = (s) => String(s ?? '').toLowerCase().trim()

export function analyze(rawRows, config) {
  const txns = buildTransactions(rawRows, config)

  const excluded = new Set((config.excludedCategories || []).map(norm))
  const isExcluded = (t) => excluded.has(norm(t.rawCategory)) || excluded.has(norm(t.bucket))

  // --- period label (most common month-year in the data) ---
  const periodCounts = {}
  for (const t of txns) {
    if (!t.date) continue
    const key = `${t.date.getFullYear()}-${t.date.getMonth()}`
    periodCounts[key] = (periodCounts[key] || 0) + 1
  }
  const periodKey = Object.keys(periodCounts).sort(
    (a, b) => periodCounts[b] - periodCounts[a],
  )[0]
  let periodLabel = 'Your'
  let periodMonth = null
  let periodYear = null
  if (periodKey) {
    const [y, m] = periodKey.split('-').map(Number)
    periodYear = y
    periodMonth = m
    periodLabel = `${MONTHS[m]} ${y}`
  }

  // --- spending vs income ---
  const spending = txns.filter((t) => !isExcluded(t) && !t.isIncome)

  const income = txns
    .filter((t) => t.isIncome)
    .reduce((sum, t) => sum + Math.max(0, -t.amount), 0)

  // category (bucket) totals — sum amounts so negative refunds subtract
  const bucketTotals = {}
  for (const t of spending) {
    bucketTotals[t.bucket] = (bucketTotals[t.bucket] || 0) + t.amount
  }

  const spendBuckets = Object.entries(bucketTotals)
    .filter(([bucket]) => !NON_SPEND_BUCKETS.has(bucket))
    .sort((a, b) => b[1] - a[1])

  const totalSpent = spendBuckets.reduce((sum, [, v]) => sum + v, 0)

  const topCategory = spendBuckets[0]
    ? { name: spendBuckets[0][0], amount: spendBuckets[0][1] }
    : null

  // --- biggest single purchase (positive spend row) ---
  let biggestPurchase = null
  for (const t of spending) {
    if (NON_SPEND_BUCKETS.has(t.bucket) || INDIVIDUAL_RANKING_EXCLUDED_BUCKETS.has(t.bucket)) continue
    if (t.amount > 0 && (!biggestPurchase || t.amount > biggestPurchase.amount)) {
      biggestPurchase = { name: t.name, amount: t.amount, category: t.bucket, date: t.date }
    }
  }

  // --- dining deep dive (any bucket mapped to restaurants/dining) ---
  const diningTxns = spending.filter(
    (t) => /restaurant|dining|fast food/i.test(t.bucket) || /dining|drinks/i.test(t.rawCategory),
  )
  const diningTotal = diningTxns.reduce((s, t) => s + t.amount, 0)
  const diningByMerchant = {}
  for (const t of diningTxns) {
    if (t.amount <= 0) continue
    diningByMerchant[t.name] = (diningByMerchant[t.name] || 0) + t.amount
  }
  const topRestaurants = Object.entries(diningByMerchant)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3)

  // --- savings move ---
  const savingsRe = config.savingsRegex
  const savingsTxns = savingsRe
    ? txns.filter((t) => !t.isIncome && savingsRe.test(t.name))
    : []
  const savingsMoved = savingsTxns.reduce((s, t) => s + Math.abs(t.amount), 0)

  // --- investments ---
  const investmentRe = config.investmentRegex
  const investmentTxns = txns.filter(
    (t) => t.bucket === 'Investments' || (investmentRe && investmentRe.test(t.name)),
  )
  const investmentTotal = investmentTxns.reduce((s, t) => s + Math.abs(t.amount), 0)

  // --- donations ---
  const donationsTotal = bucketTotals['Donations'] || 0

  // --- cumulative daily spend ---
  const byDay = {}
  for (const t of spending) {
    if (!t.date || NON_SPEND_BUCKETS.has(t.bucket)) continue
    const key = [
      t.date.getFullYear(),
      String(t.date.getMonth() + 1).padStart(2, '0'),
      String(t.date.getDate()).padStart(2, '0'),
    ].join('-')
    byDay[key] = (byDay[key] || 0) + t.amount
  }
  let running = 0
  const cumulative = Object.keys(byDay)
    .sort()
    .map((day) => {
      running += byDay[day]
      return { date: day, day: Number(day.slice(8, 10)), spent: byDay[day], cumulative: running }
    })

  // --- category breakdown / budget report card ---
  const budgetTargets = config.budgetTargets || {}
  const hasBudgets = Object.keys(budgetTargets).length > 0
  const allBuckets = new Set([...Object.keys(budgetTargets), ...Object.keys(bucketTotals)])
  const categories = [...allBuckets]
    .filter((b) => !excluded.has(norm(b)))
    .map((bucket) => {
      const actual = bucketTotals[bucket] || 0
      const hasBudget = bucket in budgetTargets
      const budget = budgetTargets[bucket] ?? 0
      const trackOnly = NON_SPEND_BUCKETS.has(bucket) || budget === 0
      const diff = budget - actual
      let status = 'none'
      if (hasBudget && !trackOnly) status = actual <= budget ? 'under' : 'over'
      return { bucket, actual, budget, hasBudget, trackOnly, diff, status }
    })
    .sort((a, b) => b.actual - a.actual)

  const onBudget = categories.filter((c) => c.status === 'under').length
  const overBudget = categories.filter((c) => c.status === 'over').length

  return {
    provider: { id: config.providerId, name: config.providerName },
    hasBudgets,
    periodLabel,
    periodMonth,
    periodYear,
    transactionCount: txns.length,
    income,
    totalSpent,
    net: income - totalSpent,
    topCategory,
    biggestPurchase,
    diningTotal,
    topRestaurants,
    savingsMoved,
    savingsCount: savingsTxns.length,
    investmentTotal,
    investmentCount: investmentTxns.length,
    donationsTotal,
    bucketTotals,
    categories,
    cumulative,
    onBudget,
    overBudget,
    transactions: spending,
    allTransactions: txns,
  }
}
