import { actor, json, requireDb } from './_utils.js'
import { assertOpen } from './_manual.js'
import { validMonth } from '../../src/lib/weekly.js'

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env), body = await request.json(), month = body.monthKey, income = body.income, savings = body.savings
    if (!validMonth(month) || body.incomeConfirmed !== true) throw new Error('Confirm the expected monthly income before saving this goal.')
    if (![income, savings].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000000)) throw new Error('Enter nonnegative income and savings amounts with cent precision.')
    await assertOpen(db, month)
    const now = new Date().toISOString(), user = actor(request)
    await db.prepare(`INSERT INTO monthly_savings_settings(month_key,income_cents,savings_cents,groceries_baseline_cents,restaurants_baseline_cents,updated_at,updated_by)
      VALUES(?,?,?,0,0,?,?) ON CONFLICT(month_key) DO UPDATE SET income_cents=excluded.income_cents,savings_cents=excluded.savings_cents,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(month, income, savings, now, user).run()
    const budget = await db.prepare('SELECT COALESCE(SUM(ROUND(target*100)),0) AS amount FROM monthly_budgets WHERE month_key=?').bind(month).first()
    const shortfall = Math.max(0, Number(budget?.amount || 0) - (income - savings))
    return json({ ok: true, affordability: { spendable: income - savings, budget: Number(budget?.amount || 0), shortfall } })
  } catch (error) { return json({ error: error.message }, 400) }
}
