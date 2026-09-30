import { actor, json, requireDb } from './_utils.js'
import { assertOpen } from './_manual.js'
import { matchSuggestions } from '../../src/lib/reconciliation.js'
import { cents, shiftDay } from '../../src/lib/weekly.js'

export const matchRecord = row => ({ id: row.id, manualKey: row.manual_key, importedKey: row.imported_key, previousOverride: row.previous_override, appliedOverride: row.applied_override, linkedAt: row.linked_at, linkedBy: row.linked_by, undoneAt: row.undone_at })
export const matchingRow = row => ({ ...row, txnKey: row.txn_key, bucket: row.override_bucket || row.bucket, overrideBucket: row.override_bucket, flow: row.override_flow || row.imported_flow, deletedAt: row.deleted_at })

export async function linkMatch(db, manualKey, importedKey, user, replaceOverride = false) {
  const manual = await db.prepare("SELECT * FROM transactions WHERE txn_key=? AND source='manual' AND deleted_at IS NULL").bind(manualKey).first()
  const imported = await db.prepare("SELECT * FROM transactions WHERE txn_key=? AND source='import'").bind(importedKey).first()
  if (!manual || !imported) throw new Error('Both transactions must still exist. Refresh and try again.')
  if ((manual.override_flow || manual.imported_flow) !== 'Expense' || (imported.override_flow || imported.imported_flow) !== 'Expense' || cents(manual.amount) !== cents(imported.amount) || imported.date < shiftDay(manual.date,-3) || imported.date > shiftDay(manual.date,3)) throw new Error('Match expenses with the same amount and dates within three days.')
  await assertOpen(db, manual.date, imported.date)
  const bucket = manual.override_bucket || manual.bucket
  if (imported.override_bucket != null && imported.override_bucket !== bucket && !replaceOverride) throw new Error('This import already has a category correction. Confirm replacement before matching.')
  const id = crypto.randomUUID()
  await db.batch([
    db.prepare('INSERT INTO transaction_matches(id,manual_key,imported_key,previous_override,applied_override,linked_at,linked_by) VALUES(?,?,?,?,?,?,?)').bind(id, manualKey, importedKey, imported.override_bucket, bucket, new Date().toISOString(), user),
    db.prepare('UPDATE transactions SET override_bucket=? WHERE txn_key=?').bind(bucket, importedKey),
  ])
  return id
}
export async function autoReconcile(db, user) {
  const [rows, history, closed] = await Promise.all([db.prepare('SELECT * FROM transactions WHERE deleted_at IS NULL').all(), db.prepare('SELECT * FROM transaction_matches').all(), db.prepare('SELECT month_key FROM monthly_closeouts').all()])
  const closedMonths = new Set(closed.results.map(row => row.month_key))
  const suggestions = matchSuggestions(rows.results.filter(row => !closedMonths.has(row.date.slice(0, 7))).map(matchingRow), history.results.map(matchRecord))
  let matched = 0
  for (const pair of suggestions.filter(row => row.automatic)) { await linkMatch(db, pair.manual.txnKey, pair.imported.txnKey, user); matched++ }
  return matched
}
export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env), body = await request.json()
    if (body.action === 'link') return json({ ok: true, id: await linkMatch(db, body.manualKey, body.importedKey, actor(request), body.replaceOverride === true) })
    if (body.action !== 'undo') throw new Error('Invalid match action.')
    const match = await db.prepare('SELECT * FROM transaction_matches WHERE id=? AND undone_at IS NULL').bind(body.id).first()
    if (!match) throw new Error('This match has already been undone. Refresh the page.')
    await db.batch([
      db.prepare('UPDATE transaction_matches SET undone_at=? WHERE id=?').bind(new Date().toISOString(), match.id),
      // A subsequent family correction is never overwritten by Undo.
      db.prepare('UPDATE transactions SET override_bucket=? WHERE txn_key=? AND override_bucket IS ?').bind(match.previous_override, match.imported_key, match.applied_override),
    ])
    return json({ ok: true })
  } catch (error) { return json({ error: error.message }, 409) }
}
