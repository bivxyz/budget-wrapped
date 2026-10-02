import { actor, json, requireDb } from './_utils.js'
import { monday, shiftDay, validDate } from '../../src/lib/weekly.js'

const pacificDateKey = () => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export async function onRequestPost({ request, env }) {
  try {
    const db = requireDb(env), body = await request.json(), weekStart = String(body.weekStart || '')
    if (!validDate(weekStart) || monday(weekStart) !== weekStart) return json({ error: 'Choose a valid Monday.' }, 400)
    const weekEnd = shiftDay(weekStart, 6)
    if (weekEnd >= pacificDateKey()) return json({ error: 'A week can only be confirmed after Sunday has ended.' }, 409)
    if (body.action === 'reopen') {
      const result = await db.prepare('DELETE FROM weekly_confirmations WHERE week_start=?').bind(weekStart).run()
      if (!result.meta.changes) return json({ error: 'This week does not have a manual confirmation.' }, 409)
      return json({ ok: true, weekStart, confirmed: false })
    }
    if (body.action !== 'confirm') return json({ error: 'Invalid week confirmation action.' }, 400)
    const now = new Date().toISOString(), confirmedBy = actor(request)
    await db.prepare(`INSERT INTO weekly_confirmations(week_start,week_end,confirmed_at,confirmed_by) VALUES(?,?,?,?)
      ON CONFLICT(week_start) DO UPDATE SET week_end=excluded.week_end,confirmed_at=excluded.confirmed_at,confirmed_by=excluded.confirmed_by`).bind(weekStart, weekEnd, now, confirmedBy).run()
    return json({ ok: true, weekStart, weekEnd, confirmed: true, confirmedAt: now, confirmedBy })
  } catch (error) { return json({ error: error.message }, 400) }
}
