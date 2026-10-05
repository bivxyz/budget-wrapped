import { activeTransactions, cents, dateKey, dollars } from './weekly.js'
import { effectiveTransaction } from './tracker.js'

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Number(value) % 100 ? 2 : 0 }).format(dollars(value))
const shortMonth = key => new Date(`${key}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short' })
const normalize = value => String(value || '').trim().toLowerCase()
export const MESSAGE_CATEGORIES = [
  { bucket: 'Groceries', label: 'Groceries', icon: '🛒' },
  { bucket: 'Restaurants/Fast Food', label: 'Dining', icon: '🍽️' },
  { bucket: 'Shopping/Gifts', label: 'Shopping', icon: '🛍️' },
]
const messageDates = summary => {
  const date = value => value.slice(5).replace('-', '/')
  return `${date(summary.start)}–${date(summary.end)}`
}

export function composeWeeklyReminder(summary) {
  const lines = MESSAGE_CATEGORIES.map(meta => {
    const category = summary.categories.find(row => row.bucket === meta.bucket)
    return `${meta.icon} ${meta.label}: ${category?.available == null ? 'Budget not set' : money(category.available)}`
  })
  const missing = MESSAGE_CATEGORIES.filter(meta => summary.categories.find(row => row.bucket === meta.bucket)?.available == null).map(row => row.label)
  return {
    kind: 'weekly', canSend: missing.length === 0, missing,
    text: `Budget this week (${messageDates(summary)}):\n${lines.join('\n')}`,
  }
}

export function composeWeeklySpending(summary) {
  const rows = MESSAGE_CATEGORIES.flatMap(meta => (summary.categories.find(row => row.bucket === meta.bucket)?.transactions || []).map(row => ({ ...row, messageCategory: meta })))
  const biggest = rows.filter(row => cents(row.amount) > 0).sort((left, right) => cents(right.amount) - cents(left.amount) || left.date.localeCompare(right.date))[0]
  const lines = MESSAGE_CATEGORIES.map(meta => {
    const category = summary.categories.find(row => row.bucket === meta.bucket)
    return `${meta.icon} ${meta.label}: ${money(category?.spent || 0)}`
  })
  lines.push(biggest ? `💸 Biggest: ${biggest.name} — ${money(cents(biggest.amount))}` : '💸 Biggest: No purchases logged')
  return { kind: 'weekly-spend', canSend: true, text: `Spent last week (${messageDates(summary)}):\n${lines.join('\n')}` }
}

export function cutbackPreview({ monthKey, rows = [], budgets = [], savingsSetting = null, asOf = dateKey() }) {
  const active = activeTransactions(rows).map(effectiveTransaction).filter(row => row.date.startsWith(monthKey)), monthRows = active.filter(row => row.flow === 'Expense')
  const actual = monthRows.reduce((result, row) => {
    result[row.bucket] = (result[row.bucket] || 0) + cents(row.amount)
    return result
  }, {})
  const [year, month] = monthKey.split('-').map(Number), days = new Date(year, month, 0).getDate()
  const elapsed = monthKey === asOf.slice(0, 7) ? Math.max(1, Math.min(days, Number(asOf.slice(8, 10)))) : days
  const risks = budgets.filter(row => row.monthKey === monthKey && cents(row.target) > 0 && normalize(row.bucket) !== 'fixed expenses').map(row => {
    const target = cents(row.target), spent = actual[row.bucket] || 0, projected = row.paced === false ? spent : Math.round(spent / elapsed * days), projectedOverage = Math.max(0, projected - target), percent = target ? spent / target : 0
    return { bucket: row.bucket, target, spent, remaining: target - spent, projected, projectedOverage, percent }
  }).filter(row => row.percent >= .8 || row.projectedOverage > 0).sort((left, right) => Number(right.projectedOverage > 0) - Number(left.projectedOverage > 0) || right.projectedOverage - left.projectedOverage || right.percent - left.percent || left.bucket.localeCompare(right.bucket)).slice(0, 3)
  const projectedSpending = monthRows.reduce((sum, row) => sum + cents(row.amount), 0) / elapsed * days
  const investments = active.filter(row => row.flow === 'Investment').reduce((sum, row) => sum + Math.max(0, cents(row.amount)), 0)
  const projectedSavings = savingsSetting ? savingsSetting.income - Math.round(projectedSpending) - investments : null
  const goal = savingsSetting?.savings ?? null
  if (!risks.length) return { kind: 'cutback', canSend: false, text: 'No cutback warning is needed right now.', risks, projectedSavings, goal }
  const categoryText = risks.map(row => row.spent > row.target ? `${row.bucket} is ${money(row.spent - row.target)} over` : row.projectedOverage > 0 ? `${row.bucket} projects ${money(row.projectedOverage)} over` : `${row.bucket} has ${money(Math.max(0, row.remaining))} left`).join('; ')
  const savingsText = projectedSavings == null || goal == null ? '' : ` Projected savings: ${money(projectedSavings)} vs ${money(goal)} goal.`
  return { kind: 'cutback', canSend: true, text: `Budget check for ${shortMonth(monthKey)}: ${categoryText}.${savingsText} Let's cut back where we can.`, risks, projectedSavings, goal }
}

export function manualReminderKey(kind, clientId) { return `${kind}:${clientId}` }
