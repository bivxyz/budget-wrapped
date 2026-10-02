import { activeTransactions, cents, dateKey, dollars, shiftDay, WEEKLY_CATEGORIES } from './weekly.js'
import { effectiveTransaction } from './tracker.js'

const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Number(value) % 100 ? 2 : 0 }).format(dollars(value))
const shortMonth = key => new Date(`${key}-01T12:00:00`).toLocaleDateString('en-US', { month: 'short' })
const normalize = value => String(value || '').trim().toLowerCase()

export function composeWeeklyReminder(summary) {
  const lines = summary.categories.map(category => {
    const label = category.bucket === WEEKLY_CATEGORIES[0] ? 'Groceries' : 'Dining'
    if (category.available == null) return `${label}: budget not set.`
    const rollover = category.rollover > 0 ? ` (${money(category.baseAllowance)} base + ${money(category.rollover)} rollover)` : category.rolloverStatus === 'pending' ? ' (base only; rollover pending)' : ' (base)'
    if (category.segments.length === 1) return `${label}: ${money(category.available)}${rollover}; ${money(category.monthRemaining)} left in ${shortMonth(category.segments[0].monthKey)}.`
    const months = category.segments.map(segment => shortMonth(segment.monthKey)).join('/')
    return `${label}: ${money(category.available)}${rollover}; ${months} week, rollover resets at the month boundary.`
  })
  const pending = summary.categories.some(category => category.rolloverStatus === 'pending')
  return {
    kind: 'weekly', canSend: true,
    text: `Budget this week (${summary.start.slice(5)}–${summary.end.slice(5)}): ${lines.join(' ')}${pending ? ' Update or confirm last week to unlock rollover.' : ''}`,
  }
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

export function automaticReminderKey(weekStart) { return `weekly:${weekStart}` }
export function manualReminderKey(clientId) { return `cutback:${clientId}` }
export function withinMondayGrace(now = new Date()) {
  const day = now.getDay(), hour = now.getHours()
  return day === 1 && hour >= 9 || day === 2 && hour < 9
}
export function currentReminderWeek(now = new Date()) { return shiftDay(dateKey(now), -(now.getDay() + 6) % 7) }
