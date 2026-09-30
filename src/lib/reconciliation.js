import { cents, shiftDay } from './weekly.js'

export const normalizeMatchText = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
export function exactSignature(row) {
  const account = normalizeMatchText(row.account)
  return account ? JSON.stringify([row.date, cents(row.amount), normalizeMatchText(row.name), account]) : null
}
export function matchSuggestions(rows, history = []) {
  const active = history.filter(row => !row.undoneAt), used = new Set(active.flatMap(row => [row.manualKey, row.importedKey]))
  const manual = rows.filter(row => row.source === 'manual' && (row.flow || row.importedFlow || 'Expense') === 'Expense' && !row.deletedAt && !used.has(row.txnKey))
  const imported = rows.filter(row => row.source !== 'manual' && !row.deletedAt && !used.has(row.txnKey) && (row.flow || row.importedFlow) === 'Expense')
  return manual.flatMap(entry => {
    const candidates = imported.filter(row => cents(row.amount) === cents(entry.amount) && row.date >= shiftDay(entry.date, -3) && row.date <= shiftDay(entry.date, 3))
    return candidates.map(candidate => {
      const signature = exactSignature(entry)
      const exact = signature && signature === exactSignature(candidate)
      const unique = exact && manual.filter(row => exactSignature(row) === signature).length === 1 && imported.filter(row => exactSignature(row) === signature).length === 1
      const bucket = entry.overrideBucket || entry.bucket
      const conflict = candidate.overrideBucket != null && candidate.overrideBucket !== bucket
      return { manual: entry, imported: candidate, exact: Boolean(exact), automatic: Boolean(unique && !conflict && !history.some(row => row.manualKey === entry.txnKey)), conflict }
    })
  })
}
