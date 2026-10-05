import { actor, json, requireDb } from './_utils.js'
import { assertOpen } from './_manual.js'
import { monthlyFromWeekly, validMonth, WEEKLY_CATEGORIES } from '../../src/lib/weekly.js'

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env), body = await request.json(), month = body.monthKey, now = new Date().toISOString(), user = actor(request)
    if (!validMonth(month)) throw new Error('Choose a valid month.')
    const amounts = ['groceriesWeekly', 'restaurantsWeekly']
    if (amounts.some(key => !Number.isSafeInteger(body[key]) || body[key] < 0 || body[key] > 1000000000)) throw new Error('Enter nonnegative amounts with cent precision.')
    await assertOpen(db, month)
    const [other,setting] = await Promise.all([
      db.prepare('SELECT COALESCE(SUM(ROUND(target*100)),0) AS amount FROM monthly_budgets WHERE month_key=? AND bucket NOT IN(?,?)').bind(month, ...WEEKLY_CATEGORIES).first(),
      db.prepare('SELECT income_cents AS income,savings_cents AS savings FROM monthly_savings_settings WHERE month_key=?').bind(month).first(),
    ])
    const groceries = monthlyFromWeekly(body.groceriesWeekly), restaurants = monthlyFromWeekly(body.restaurantsWeekly)
    const shortfall = setting?Math.max(0, Number(other.amount) + groceries + restaurants - (Number(setting.income) - Number(setting.savings))):null
    const statements = [
      ...WEEKLY_CATEGORIES.map((bucket, index) => db.prepare(`INSERT INTO monthly_budgets(month_key,bucket,target,paced,sort_order,updated_at,updated_by)
        VALUES(?,?,?,1,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM monthly_budgets WHERE month_key=?),?,?)
        ON CONFLICT(month_key,bucket) DO UPDATE SET target=excluded.target,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(month, bucket, (index ? restaurants : groceries) / 100, month, now, user)),
      db.prepare(`INSERT INTO monthly_budget_settings(month_key,spending_limit,updated_at,updated_by)
        VALUES(?,(SELECT COALESCE(SUM(ROUND(target*100)),0)/100.0 FROM monthly_budgets WHERE month_key=?),?,?)
        ON CONFLICT(month_key) DO UPDATE SET spending_limit=excluded.spending_limit,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(month, month, now, user),
    ]
    await db.batch(statements)
    return json({ ok: true, affordability: { shortfall, potentialAdditionalSavings: setting?Math.max(0, Number(setting.income) - Number(setting.savings) - Number(other.amount) - groceries - restaurants):null } })
  } catch (error) { return json({ error: error.message }, 400) }
}
