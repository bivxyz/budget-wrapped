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
function priorWeekSegments(month, currentWeekStart) {
  const startOfMonth = `${month}-01`, endOfMonth = monthEnd(month), segments = []
  for (let weekStart = monday(startOfMonth); weekStart < currentWeekStart; weekStart = shiftDay(weekStart, 7)) {
    const from = maxDate(weekStart, startOfMonth), through = minDate(shiftDay(weekStart, 6), endOfMonth)
    if (from <= through) segments.push({ weekStart, from, through })
  }
  return segments
}
export function weeklySummary(rows, budgets, day = dateKey(), { coverage = [], confirmations = [] } = {}) {
  const start = monday(day), end = shiftDay(start, 6)
  const expenses = activeTransactions(rows).map(effectiveTransaction).filter(row => row.flow === 'Expense')
  const selectedConfirmation = weekConfirmation(start, coverage, confirmations)
  return { start, end, confirmation: selectedConfirmation, categories: WEEKLY_CATEGORIES.map(bucket => {
    const bucketExpenses = expenses.filter(row => row.bucket === bucket)
    const transactions = bucketExpenses.filter(row => row.date >= start && row.date <= end)
    const missing = new Set(), pendingWeeks = new Set(), segments = []
    let baseAllowance = 0, rollover = 0, available = 0, monthRemaining = 0
    for (const month of [...new Set(everyDay(start, end).map(key => key.slice(0, 7)))]) {
      const budget = budgets.find(row => row.monthKey === month && row.bucket === bucket)
      if (!budget) { missing.add(month); continue }
      const target = cents(budget.target), segmentFrom = maxDate(start, `${month}-01`), segmentThrough = minDate(end, monthEnd(month))
      const segmentBase = everyDay(segmentFrom, segmentThrough).reduce((sum, key) => sum + dailyAllowance(budget.target, key), 0)
      const priorSegments = priorWeekSegments(month, start), allConfirmed = priorSegments.every(segment => {
        const confirmed = rangeCovered(coverage, segment.from, segment.through) || confirmations.some(row => row.weekStart === segment.weekStart)
        if (!confirmed) pendingWeeks.add(segment.weekStart)
        return confirmed
      })
      const priorSpent = bucketExpenses.filter(row => row.date >= `${month}-01` && row.date < segmentFrom).reduce((sum, row) => sum + cents(row.amount), 0)
      const monthSpent = bucketExpenses.filter(row => row.date.startsWith(month)).reduce((sum, row) => sum + cents(row.amount), 0)
      const earnedCarry = allConfirmed ? Math.max(0, priorSegments.reduce((sum, segment) => sum + everyDay(segment.from, segment.through).reduce((daily, key) => daily + dailyAllowance(budget.target, key), 0), 0) - priorSpent) : 0
      const segmentAvailable = Math.min(segmentBase + earnedCarry, Math.max(0, target - priorSpent))
      const segmentRollover = Math.max(0, segmentAvailable - segmentBase)
      const segmentSpent = bucketExpenses.filter(row => row.date >= segmentFrom && row.date <= segmentThrough).reduce((sum, row) => sum + cents(row.amount), 0)
      baseAllowance += segmentBase; rollover += segmentRollover; available += segmentAvailable; monthRemaining += target - monthSpent
      segments.push({ monthKey: month, from: segmentFrom, through: segmentThrough, baseAllowance: segmentBase, rollover: segmentRollover, available: segmentAvailable, spent: segmentSpent, remaining: segmentAvailable - segmentSpent, monthRemaining: target - monthSpent, rolloverPending: priorSegments.length > 0 && !allConfirmed })
    }
    const spent = transactions.reduce((sum, row) => sum + cents(row.amount), 0), hasMissing = missing.size > 0
    return { bucket, transactions, segments, baseAllowance: hasMissing ? null : baseAllowance, rollover: hasMissing ? null : rollover, available: hasMissing ? null : available, allowance: hasMissing ? null : available, spent, remaining: hasMissing ? null : available - spent, monthRemaining: hasMissing ? null : monthRemaining, missing: [...missing], pendingWeeks: [...pendingWeeks], rolloverStatus: hasMissing ? 'missing-budget' : pendingWeeks.size ? 'pending' : rollover > 0 ? 'applied' : 'none' }
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
  const months = reviews.filter(row => row.reviewedAt && row.monthKey < asOf.slice(0, 7) && Array.from({length:new Date(Number(row.monthKey.slice(0,4)),Number(row.monthKey.slice(5)),0).getDate()},(_,index)=>shiftDay(`${row.monthKey}-01`,index)).every(day=>coverage.some(range=>range.from<=day&&range.through>=day)) && rows.some(t => t.source !== 'manual' && t.date.startsWith(row.monthKey))).map(row => row.monthKey).sort().slice(-3)
  if (!months.length) return { months, amount: null }
  const income = activeTransactions(rows).map(effectiveTransaction).filter(row => row.flow === 'Income' && months.includes(row.date.slice(0, 7))).reduce((sum, row) => sum + Math.max(0, -cents(row.amount)), 0)
  return { months, amount: Math.round(income / months.length) }
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
