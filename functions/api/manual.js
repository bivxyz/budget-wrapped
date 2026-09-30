import { actor, json, requireDb } from './_utils.js'
import { assertOpen, manualInput } from './_manual.js'

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env), body = await request.json(), now = new Date().toISOString(), user = actor(request)
    if (!['create', 'update', 'delete'].includes(body.action)) throw new Error('Invalid manual expense action.')
    if (body.action === 'create') {
      if(body.clientId && !/^[0-9a-f-]{36}$/i.test(body.clientId))throw new Error('Invalid expense request ID.')
      const row = manualInput(body), key = `manual:${body.clientId || crypto.randomUUID()}`
      await assertOpen(db, row.date)
      await db.prepare(`INSERT INTO transactions(txn_key,date,amount,name,bucket,account,is_income,imported_flow,source,created_at,created_by,uploaded_at,uploaded_by)
        VALUES(?,?,?,?,?,?,0,'Expense','manual',?,?,?,?) ON CONFLICT(txn_key) DO NOTHING`).bind(key, row.date, row.amount, row.name, row.bucket, row.account, now, user, now, user).run()
      return json({ ok: true, txnKey: key })
    }
    const old = await db.prepare("SELECT * FROM transactions WHERE txn_key=? AND source='manual' AND deleted_at IS NULL").bind(body.txnKey).first()
    if (!old) throw new Error('Manual expense not found. Refresh and try again.')
    await assertOpen(db, old.date)
    if (await db.prepare('SELECT id FROM transaction_matches WHERE manual_key=? AND undone_at IS NULL').bind(body.txnKey).first()) throw new Error('Undo the match before editing this manual expense.')
    if (body.action === 'delete') {
      const result=await db.prepare('UPDATE transactions SET deleted_at=? WHERE txn_key=? AND NOT EXISTS(SELECT 1 FROM transaction_matches WHERE manual_key=? AND undone_at IS NULL)').bind(now, body.txnKey, body.txnKey).run()
      if(!result.meta.changes)throw new Error('Expense changed. Refresh before deleting.')
    } else {
      const row = manualInput(body)
      await assertOpen(db, row.date)
      const result=await db.prepare(`UPDATE transactions SET date=?,amount=?,name=?,bucket=?,account=?,override_bucket=NULL WHERE txn_key=?
        AND NOT EXISTS(SELECT 1 FROM transaction_matches WHERE manual_key=? AND undone_at IS NULL)`).bind(row.date, row.amount, row.name, row.bucket, row.account, body.txnKey, body.txnKey).run()
      if(!result.meta.changes)throw new Error('Expense changed. Refresh before editing.')
    }
    return json({ ok: true })
  } catch (error) { return json({ error: error.message }, 400) }
}
