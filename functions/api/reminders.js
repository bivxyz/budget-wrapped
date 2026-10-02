import { actor, json, requireDb } from './_utils.js'
import { automaticReminderKey, composeWeeklyReminder, cutbackPreview, manualReminderKey } from '../../src/lib/reminders.js'
import { monday, validDate, validMonth, weeklySummary } from '../../src/lib/weekly.js'

const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i

function requireAgent(request, env) {
  const expected = env.REMINDER_AGENT_TOKEN, provided = request.headers.get('X-Budget-Reminder-Token')
  if (!expected || !provided || provided !== expected) throw new Error('Reminder agent authorization failed.')
}

const mapTransaction = row => ({
  txnKey: row.txn_key, date: row.date, amount: row.amount, name: row.name, rawCategory: row.raw_category,
  originalBucket: row.bucket, bucket: row.override_bucket || row.bucket, account: row.account,
  importedFlow: row.imported_flow || (row.is_income ? 'Income' : 'Expense'),
  flow: row.override_flow || row.imported_flow || (row.is_income ? 'Income' : 'Expense'),
  overrideBucket: row.override_bucket, overrideFlow: row.override_flow, source: row.source,
  deletedAt: row.deleted_at, matchedTxnKey: row.matched_txn_key,
})

async function reminderData(db) {
  const [transactions, budgets, coverage, confirmations, savings] = await Promise.all([
    db.prepare(`SELECT t.txn_key,t.date,t.amount,t.name,t.raw_category,t.bucket,t.account,t.is_income,t.imported_flow,t.override_bucket,t.override_flow,t.source,t.deleted_at,
      (SELECT imported_key FROM transaction_matches m WHERE m.manual_key=t.txn_key AND m.undone_at IS NULL LIMIT 1) AS matched_txn_key FROM transactions t`).all(),
    db.prepare('SELECT month_key,bucket,target,paced,sort_order FROM monthly_budgets').all(),
    db.prepare('SELECT date_from,date_through FROM import_coverage').all(),
    db.prepare('SELECT week_start,week_end,confirmed_at,confirmed_by FROM weekly_confirmations').all(),
    db.prepare('SELECT month_key,income_cents,savings_cents FROM monthly_savings_settings').all(),
  ])
  return {
    transactions: transactions.results.map(mapTransaction),
    budgets: budgets.results.map(row => ({ monthKey: row.month_key, bucket: row.bucket, target: row.target, paced: Boolean(row.paced), sortOrder: row.sort_order })),
    coverage: coverage.results.map(row => ({ from: row.date_from, through: row.date_through })),
    confirmations: confirmations.results.map(row => ({ weekStart: row.week_start, weekEnd: row.week_end, confirmedAt: row.confirmed_at, confirmedBy: row.confirmed_by })),
    savings: savings.results.map(row => ({ monthKey: row.month_key, income: row.income_cents, savings: row.savings_cents })),
  }
}

async function preview(db, body) {
  const data = await reminderData(db)
  if (body.kind === 'weekly') {
    const weekStart = String(body.weekStart || '')
    if (!validDate(weekStart) || monday(weekStart) !== weekStart) throw new Error('Choose a valid reminder week.')
    return { ...composeWeeklyReminder(weeklySummary(data.transactions, data.budgets, weekStart, { coverage: data.coverage, confirmations: data.confirmations })), periodKey: weekStart }
  }
  if (body.kind === 'cutback') {
    const monthKey = String(body.monthKey || '')
    if (!validMonth(monthKey)) throw new Error('Choose a valid budget month.')
    return { ...cutbackPreview({ monthKey, rows: data.transactions, budgets: data.budgets, savingsSetting: data.savings.find(row => row.monthKey === monthKey) }), periodKey: monthKey }
  }
  throw new Error('Invalid reminder type.')
}

async function queue(db, request, body, automatic = false) {
  const result = await preview(db, body)
  if (!result.canSend) return result
  const clientId = String(body.clientId || ''), idempotencyKey = automatic ? automaticReminderKey(result.periodKey) : manualReminderKey(clientId)
  if (!automatic && !CLIENT_ID.test(clientId)) throw new Error('Refresh before queuing this message.')
  const now = new Date().toISOString()
  await db.prepare(`INSERT INTO message_outbox(kind,period_key,message_text,idempotency_key,status,requested_at,requested_by)
    VALUES(?,?,?,?, 'queued',?,?) ON CONFLICT(idempotency_key) DO NOTHING`).bind(result.kind, result.periodKey, result.text, idempotencyKey, now, automatic ? 'monday-automation' : actor(request)).run()
  const item = await db.prepare('SELECT id,kind,period_key,message_text,status,requested_at,sent_at,failed_at,failure FROM message_outbox WHERE idempotency_key=?').bind(idempotencyKey).first()
  return { ...result, queued: true, item: mapMessage(item) }
}

const mapMessage = row => row ? ({ id: row.id, kind: row.kind, periodKey: row.period_key, text: row.message_text, status: row.status, requestedAt: row.requested_at, sentAt: row.sent_at, failedAt: row.failed_at, failure: row.failure }) : null

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env), body = await request.json()
    if (body.action === 'preview') return json(await preview(db, body))
    if (body.action === 'queue') return json(await queue(db, request, body))
    if (body.action === 'automatic') { requireAgent(request, env); return json(await queue(db, request, { ...body, kind: 'weekly' }, true)) }
    if (body.action === 'claim') {
      requireAgent(request, env)
      const claimToken = crypto.randomUUID(), now = new Date().toISOString()
      const item = await db.prepare(`UPDATE message_outbox SET status='sending',claimed_at=?,claim_token=?,failure=NULL
        WHERE id=(SELECT id FROM message_outbox WHERE status='queued' OR (status='sending' AND julianday(claimed_at)<julianday('now','-10 minutes')) ORDER BY requested_at,id LIMIT 1)
        AND (status='queued' OR (status='sending' AND julianday(claimed_at)<julianday('now','-10 minutes')))
        RETURNING id,kind,period_key,message_text,status,requested_at,sent_at,failed_at,failure`).bind(now, claimToken).first()
      return json({ ok: true, item: item ? { ...mapMessage(item), claimToken } : null })
    }
    if (body.action === 'complete' || body.action === 'fail' || body.action === 'uncertain') {
      requireAgent(request, env)
      if (!Number.isInteger(body.id) || !String(body.claimToken || '')) throw new Error('Invalid reminder claim.')
      const now = new Date().toISOString(), status = body.action === 'complete' ? 'sent' : body.action === 'fail' ? 'failed' : 'uncertain', failure = status === 'sent' ? null : String(body.error || 'Messages delivery could not be confirmed.').slice(0, 500)
      const result = await db.prepare(`UPDATE message_outbox SET status=?,sent_at=?,failed_at=?,failure=?,claim_token=NULL
        WHERE id=? AND status='sending' AND claim_token=?`).bind(status, status === 'sent' ? now : null, status === 'sent' ? null : now, failure, body.id, body.claimToken).run()
      if (!result.meta.changes) return json({ error: 'This reminder claim is stale.' }, 409)
      return json({ ok: true, id: body.id, status })
    }
    if (body.action === 'retry') {
      if (!Number.isInteger(body.id)) throw new Error('Invalid reminder.')
      const result = await db.prepare(`UPDATE message_outbox SET status='queued',claimed_at=NULL,claim_token=NULL,failed_at=NULL,failure=NULL
        WHERE id=? AND status IN ('failed','uncertain')`).bind(body.id).run()
      if (!result.meta.changes) return json({ error: 'Only failed or uncertain reminders can be retried.' }, 409)
      return json({ ok: true, id: body.id, status: 'queued' })
    }
    return json({ error: 'Invalid reminder action.' }, 400)
  } catch (error) {
    const authorization = /authorization failed/.test(error.message)
    return json({ error: error.message }, authorization ? 403 : 400)
  }
}
