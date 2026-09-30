import { effectiveTransaction } from './tracker.js'

export const WEEKLY_CATEGORIES = ['Groceries', 'Restaurants/Fast Food']
export const cents = value => Math.round((Number(value) || 0) * 100)
export const dollars = value => value / 100
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
export const activeTransactions = rows => rows.filter(row => !row.deletedAt && !row.matchedTxnKey)

// Allocate leftover cents to the first days: every month's daily shares sum exactly to its target.
export function dailyAllowance(target, key) {
  const [year, month, day] = key.split('-').map(Number)
  const days = new Date(year, month, 0).getDate(), total = cents(target)
  return Math.floor(total / days) + (day <= total % days ? 1 : 0)
}
export function weeklySummary(rows, budgets, day = dateKey()) {
  const start = monday(day), end = shiftDay(start, 6)
  return { start, end, categories: WEEKLY_CATEGORIES.map(bucket => {
    const transactions = activeTransactions(rows).map(effectiveTransaction).filter(row => row.flow === 'Expense' && row.bucket === bucket && row.date >= start && row.date <= end)
    const missing = new Set(); let allowance = 0
    for (let i = 0; i < 7; i++) {
      const key = shiftDay(start, i), budget = budgets.find(row => row.monthKey === key.slice(0, 7) && row.bucket === bucket)
      if (!budget) missing.add(key.slice(0, 7)); else allowance += dailyAllowance(budget.target, key)
    }
    const spent = transactions.reduce((sum, row) => sum + cents(row.amount), 0)
    return { bucket, transactions, allowance: missing.size ? null : allowance, spent, remaining: missing.size ? null : allowance - spent, missing: [...missing] }
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
export function incomeSuggestion(rows, reviews, asOf = dateKey(), coverage = []) {
  const months = reviews.filter(row => row.reviewedAt && row.monthKey < asOf.slice(0, 7) && Array.from({length:new Date(Number(row.monthKey.slice(0,4)),Number(row.monthKey.slice(5)),0).getDate()},(_,index)=>shiftDay(`${row.monthKey}-01`,index)).every(day=>coverage.some(range=>range.from<=day&&range.through>=day)) && rows.some(t => t.source !== 'manual' && t.date.startsWith(row.monthKey))).map(row => row.monthKey).sort().slice(-3)
  if (!months.length) return { months, amount: null }
  const income = activeTransactions(rows).map(effectiveTransaction).filter(row => row.flow === 'Income' && months.includes(row.date.slice(0, 7))).reduce((sum, row) => sum + Math.max(0, -cents(row.amount)), 0)
  return { months, amount: Math.round(income / months.length) }
}
export function recommendWeekly({ income, savings, other, groceries, restaurants }) {
  const available = income - savings - other
  const groceryTarget = Math.min(groceries, Math.max(0, available))
  const restaurantTarget = Math.min(restaurants, Math.max(0, available - groceryTarget))
  return { available, groceries: groceryTarget, restaurants: restaurantTarget, shortfall: Math.max(0, groceries - available), bonus: Math.max(0, available - groceryTarget - restaurantTarget) }
}
