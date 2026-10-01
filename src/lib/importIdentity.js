const dateValue = value => value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : String(value || '')

export const transactionBaseKey = transaction => [dateValue(transaction.date), transaction.amount, transaction.name, transaction.account || ''].join('|')

export function assignImportKeys(transactions = []) {
  const occurrences = new Map()
  return transactions.map(transaction => {
    const base = transactionBaseKey(transaction), occurrence = (occurrences.get(base) || 0) + 1
    occurrences.set(base, occurrence)
    return { ...transaction, importKey: occurrence === 1 ? base : `${base}|duplicate:${occurrence}` }
  })
}

export function importIdentitySummary(transactions = []) {
  const keyed = assignImportKeys(transactions), uniqueBaseKeys = new Set(keyed.map(transactionBaseKey)).size
  return { keyed, sourceRowCount: transactions.length, storedRowCount: keyed.length, repeatedRowsPreserved: keyed.length - uniqueBaseKeys }
}
