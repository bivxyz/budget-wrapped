import { actor, json, requireDb } from './_utils.js'
import { validMonth } from '../../src/lib/weekly.js'
import { assertOpen } from './_manual.js'
export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env), body = await request.json(), { monthKey, uploadEventId, revision } = body
    if (!validMonth(monthKey) || !Number.isInteger(uploadEventId) || uploadEventId < 1 || !Number.isInteger(revision) || revision < 0) throw new Error('Refresh before reviewing this month.')
    await assertOpen(db, monthKey)
    const result = await db.prepare(`UPDATE monthly_reviews SET reviewed_at=?,reviewed_by=? WHERE month_key=? AND upload_event_id=? AND revision=?
      AND NOT EXISTS(SELECT 1 FROM monthly_closeouts WHERE month_key=?)`).bind(new Date().toISOString(), actor(request), monthKey, uploadEventId, revision, monthKey).run()
    if (!result.meta.changes) return json({ error: 'Transactions changed. Refresh and review the latest entries first.' }, 409)
    return json({ ok: true })
  } catch (error) { return json({ error: error.message }, 400) }
}
