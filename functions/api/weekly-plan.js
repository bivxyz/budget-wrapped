import { actor, json, requireDb } from './_utils.js'
import { assertOpen } from './_manual.js'
import { validMonth, WEEKLY_CATEGORIES } from '../../src/lib/weekly.js'

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env), body = await request.json(), month = body.monthKey, now = new Date().toISOString(), user = actor(request)
    if (!validMonth(month) || body.commitmentsConfirmed !== true || body.incomeConfirmed !== true) throw new Error('Confirm expected income and that your other monthly commitments are budgeted.')
    const amounts = ['income', 'savings', 'groceries', 'restaurants', 'groceriesBaseline', 'restaurantsBaseline']
    if (amounts.some(key => !Number.isSafeInteger(body[key]) || body[key] < 0 || body[key] > 1000000000)) throw new Error('Enter nonnegative amounts with cent precision.')
    await assertOpen(db, month)
    const other = await db.prepare('SELECT COALESCE(SUM(ROUND(target*100)),0) AS amount FROM monthly_budgets WHERE month_key=? AND bucket NOT IN(?,?)').bind(month, ...WEEKLY_CATEGORIES).first()
    if (body.income - body.savings - other.amount - body.groceries - body.restaurants < 0) throw new Error('This plan exceeds income after savings and other commitments. Adjust the amounts explicitly before saving.')
    const statements = [
      db.prepare(`INSERT INTO monthly_savings_settings(month_key,income_cents,savings_cents,groceries_baseline_cents,restaurants_baseline_cents,updated_at,updated_by)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(month_key) DO UPDATE SET income_cents=excluded.income_cents,savings_cents=excluded.savings_cents,groceries_baseline_cents=excluded.groceries_baseline_cents,restaurants_baseline_cents=excluded.restaurants_baseline_cents,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(month, body.income, body.savings, body.groceriesBaseline, body.restaurantsBaseline, now, user),
      ...WEEKLY_CATEGORIES.map((bucket, index) => db.prepare(`INSERT INTO monthly_budgets(month_key,bucket,target,paced,sort_order,updated_at,updated_by)
        VALUES(?,?,?,1,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM monthly_budgets WHERE month_key=?),?,?)
        ON CONFLICT(month_key,bucket) DO UPDATE SET target=excluded.target,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(month, bucket, body[index ? 'restaurants' : 'groceries'] / 100, month, now, user)),
      db.prepare(`INSERT INTO monthly_budget_settings(month_key,spending_limit,updated_at,updated_by)
        VALUES(?,(SELECT COALESCE(SUM(ROUND(target*100)),0)/100.0 FROM monthly_budgets WHERE month_key=?),?,?)
        ON CONFLICT(month_key) DO UPDATE SET spending_limit=excluded.spending_limit,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(month, month, now, user),
    ]
    // Validate affordability against the targets inside the same transaction.
    const settings = statements.shift(); statements.push(settings)
    await db.batch(statements)
    return json({ ok: true })
  } catch (error) { return json({ error: error.message }, 400) }
}
