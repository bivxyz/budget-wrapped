import { validDate, cents } from '../../src/lib/weekly.js'

export function manualInput(body) {
  const row = { date: body.date, name: String(body.name || '').trim(), amount: Number(body.amount), bucket: String(body.bucket || '').trim(), account: String(body.account || '').trim() }
  if (!validDate(row.date) || !row.name || row.name.length > 200 || !row.bucket || row.bucket.length > 100 || row.account.length > 200 || !Number.isFinite(row.amount) || row.amount <= 0 || row.amount > 10000000 || Math.abs(row.amount * 100 - cents(row.amount)) > 0.00001) throw new Error('Enter a valid date, merchant, category, and positive amount with at most two decimal places.')
  return row
}
export async function assertOpen(db, ...dates) {
  for (const date of new Set(dates)) {
    if (await db.prepare('SELECT month_key FROM monthly_closeouts WHERE month_key=?').bind(date.slice(0, 7)).first()) throw new Error('Reopen this month before making changes.')
  }
}
