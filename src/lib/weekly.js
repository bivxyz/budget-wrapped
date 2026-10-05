import { effectiveTransaction } from './tracker.js'

export const WEEKLY_CATEGORIES = ['Groceries', 'Restaurants/Fast Food']
export const cents = value => Math.round((Number(value) || 0) * 100)
export const dollars = value => value / 100
export const monthlyFromWeekly = value => Math.round((Number(value) || 0) * 52 / 12)
export const weeklyFromMonthly = value => Math.round((Number(value) || 0) * 12 / 52)
export const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const validMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value || '')
export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && dateKey(new Date(`${value}T12:00:00`)) === value
}
export function shiftDay(key, offset) {
  const date = new Date(`${key}T12:00:00`)
  date.setDate(date.getDate() + offset)
  return dateKey(date)
}
export function monday(key) {
  return shiftDay(key, -(new Date(`${key}T12:00:00`).getDay() + 6) % 7)
}
export const sunday = key => shiftDay(monday(key), 6)
export const weekCanBeConfirmed = (weekEnd, today = dateKey()) => weekEnd <= today
export const activeTransactions = rows => rows.filter(row => !row.deletedAt && !row.matchedTxnKey)

// Allocate leftover cents to the first days: every month's daily shares sum exactly to its target.
export function dailyAllowance(target, key) {
  const [year, month, day] = key.split('-').map(Number)
  const days = new Date(year, month, 0).getDate(), total = cents(target)
  return Math.floor(total / days) + (day <= total % days ? 1 : 0)
}
const monthEnd = month => {
  const [year, number] = month.split('-').map(Number)
  return `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, '0')}`
}
const maxDate = (left, right) => left > right ? left : right
const minDate = (left, right) => left < right ? left : right
const everyDay = (from, through) => {
  const days = []
  for (let key = from; key <= through; key = shiftDay(key, 1)) days.push(key)
  return days
}
export const rangeCovered = (coverage = [], from, through) => everyDay(from, through).every(day => coverage.some(range => range.from <= day && range.through >= day))
export function weekConfirmation(start, coverage = [], confirmations = []) {
  const weekStart = monday(start), weekEnd = shiftDay(weekStart, 6)
  if (rangeCovered(coverage, weekStart, weekEnd)) return { confirmed: true, source: 'csv', weekStart, weekEnd }
  const explicit = confirmations.find(row => row.weekStart === weekStart)
  if (explicit) return { confirmed: true, source: 'sign-off', ...explicit }
  return { confirmed: false, source: null, weekStart, weekEnd }
}
export function weeklySummary(rows, budgets, day = dateKey(), { coverage = [], confirmations = [], categories = WEEKLY_CATEGORIES } = {}) {
  const start = monday(day), end = shiftDay(start, 6)
  const expenses = activeTransactions(rows).map(effectiveTransaction).filter(row => row.flow === 'Expense')
  const selectedConfirmation = weekConfirmation(start, coverage, confirmations)
  return { start, end, confirmation: selectedConfirmation, categories: categories.map(bucket => {
    const bucketExpenses = expenses.filter(row => row.bucket === bucket)
    const transactions = bucketExpenses.filter(row => row.date >= start && row.date <= end)
    const missing = new Set(), segments = []
    let baseAllowance = 0, available = 0, monthRemaining = 0
    for (const month of [...new Set(everyDay(start, end).map(key => key.slice(0, 7)))]) {
      const budget = budgets.find(row => row.monthKey === month && row.bucket === bucket)
      if (!budget) { missing.add(month); continue }
      const target = cents(budget.target), segmentFrom = maxDate(start, `${month}-01`), segmentThrough = minDate(end, monthEnd(month))
      const segmentBase = everyDay(segmentFrom, segmentThrough).reduce((sum, key) => sum + dailyAllowance(budget.target, key), 0)
      const monthSpent = bucketExpenses.filter(row => row.date.startsWith(month)).reduce((sum, row) => sum + cents(row.amount), 0)
      const segmentSpent = bucketExpenses.filter(row => row.date >= segmentFrom && row.date <= segmentThrough).reduce((sum, row) => sum + cents(row.amount), 0)
      baseAllowance += segmentBase; available += segmentBase; monthRemaining += target - monthSpent
      segments.push({ monthKey: month, from: segmentFrom, through: segmentThrough, baseAllowance: segmentBase, rollover: 0, available: segmentBase, spent: segmentSpent, remaining: segmentBase - segmentSpent, monthRemaining: target - monthSpent, rolloverPending: false })
    }
    const spent = transactions.reduce((sum, row) => sum + cents(row.amount), 0), hasMissing = missing.size > 0
    return { bucket, transactions, segments, baseAllowance: hasMissing ? null : baseAllowance, rollover: hasMissing ? null : 0, available: hasMissing ? null : available, allowance: hasMissing ? null : available, spent, remaining: hasMissing ? null : available - spent, monthRemaining: hasMissing ? null : monthRemaining, missing: [...missing], pendingWeeks: [], rolloverStatus: hasMissing ? 'missing-budget' : 'none' }
  }) }
}
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2)
  return sorted.length ? (sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)) : null
}
export function weeklyBaselines(rows, coverage, asOf = dateKey()) {
  const start = monday(asOf), weeks = []
  for (let i = 12; i >= 1; i--) {
    const from = shiftDay(start, -7 * i), to = shiftDay(from, 6)
    // Only an explicit CSV coverage range can establish zero-spending days.
    if (Array.from({ length: 7 }, (_, d) => shiftDay(from, d)).every(day => coverage.some(range => range.from <= day && range.through >= day))) weeks.push({ from, to })
  }
  const expenses = activeTransactions(rows).map(effectiveTransaction).filter(row => row.flow === 'Expense')
  return { weeks: weeks.length, categories: WEEKLY_CATEGORIES.map(bucket => {
    const raw = median(weeks.map(week => expenses.filter(row => row.bucket === bucket && row.date >= week.from && row.date <= week.to).reduce((sum, row) => sum + cents(row.amount), 0)))
    const weekly = weeks.length < 4 ? null : Math.max(0, bucket === 'Groceries' ? Math.ceil(raw / 500) * 500 : raw)
    return { bucket, weekly, monthly: weekly == null ? null : Math.round(weekly * 52 / 12) }
  }) }
}
export function previousMonthWeekly(rows, coverage, month) {
  const [year,number] = month.split('-').map(Number), date = new Date(year, number - 2, 1)
  const previous = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  const days = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(), from = `${previous}-01`, through = `${previous}-${String(days).padStart(2, '0')}`
  const complete = coverage.some(range => range.from <= from && range.through >= through)
  const expenses = activeTransactions(rows).map(effectiveTransaction).filter(row => row.flow === 'Expense' && row.date >= from && row.date <= through)
  return { month: previous, complete, categories: WEEKLY_CATEGORIES.map(bucket => {
    const monthly = expenses.filter(row => row.bucket === bucket).reduce((sum, row) => sum + cents(row.amount), 0)
    return { bucket, monthly, weekly: weeklyFromMonthly(monthly) }
  }) }
}
export function incomeSuggestion(rows, reviews, asOf = dateKey(), coverage = []) {
  const before = asOf.slice(0, 7)
  const incomeRows = activeTransactions(rows).map(effectiveTransaction).filter(row => row.flow === 'Income' && row.source !== 'manual' && row.date.slice(0, 7) < before)
  const available = [...new Set(incomeRows.map(row => row.date.slice(0, 7)))].filter(month => incomeRows.some(row => row.date.startsWith(month) && Math.max(0, -cents(row.amount)) > 0)).sort()
  const reviewed = reviews.filter(row => row.reviewedAt && row.monthKey < before && available.includes(row.monthKey) && Array.from({ length: new Date(Number(row.monthKey.slice(0, 4)), Number(row.monthKey.slice(5)), 0).getDate() }, (_, index) => shiftDay(`${row.monthKey}-01`, index)).every(day => coverage.some(range => range.from <= day && range.through >= day))).map(row => row.monthKey).sort()
  const basis = reviewed.length ? 'reviewed-complete' : available.length ? 'available-history' : null
  const months = (reviewed.length ? reviewed : available).slice(-3)
  if (!months.length) return { months, amount: null, basis }
  const totals = months.map(month => incomeRows.filter(row => row.date.startsWith(month)).reduce((sum, row) => sum + Math.max(0, -cents(row.amount)), 0))
  return { months, amount: median(totals), basis }
}
export function expectedIncome(settings = [], month, suggestion = { amount: null, months: [], basis: null }) {
  const prior = settings.filter(row => row.monthKey < month && Number(row.income) > 0).sort((left, right) => left.monthKey.localeCompare(right.monthKey)).at(-1)
  return prior ? { amount: Number(prior.income), months: [prior.monthKey], basis: 'prior-plan' } : suggestion
}
export function recommendWeekly({ income, savings, other, groceries, restaurants }) {
  const available = income - savings - other
  const groceryBaseline = monthlyFromWeekly(groceries), restaurantBaseline = monthlyFromWeekly(restaurants)
  const groceryMonthly = Math.min(groceryBaseline, Math.max(0, available))
  const restaurantMonthly = Math.min(restaurantBaseline, Math.max(0, available - groceryMonthly))
  return { available, groceries: weeklyFromMonthly(groceryMonthly), restaurants: weeklyFromMonthly(restaurantMonthly), groceriesMonthly: groceryMonthly, restaurantsMonthly: restaurantMonthly, shortfall: Math.max(0, groceryBaseline + restaurantBaseline - Math.max(0, available)), bonus: Math.max(0, available - groceryMonthly - restaurantMonthly) }
}

export function savingsPosition({ income = 0, savings = 100000, budget = 0, projected = 0 }) {
  const extra = income - savings - budget
  return { spendable: income - savings, extra: Math.max(0, extra), shortfall: Math.max(0, -extra), planned: income - budget, projected: income - projected }
}
