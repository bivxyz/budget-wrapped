// Low-level CSV field handling shared by every provider/adapter.
// The goal: turn an arbitrary budget-app CSV row into ONE canonical transaction
// shape, regardless of column names or sign conventions.
//
// Canonical transaction:
//   { date, amount, name, rawCategory, bucket, account, type, isIncome }
//   amount sign convention (canonical): + = money OUT (expense), - = money IN (income/credit)

// ---------------------------------------------------------------------------
// column-name synonyms — used to auto-resolve which CSV column is which field
// ---------------------------------------------------------------------------
export const FIELD_SYNONYMS = {
  date: ['date', 'transaction date', 'posted date', 'post date', 'date posted', 'original date', 'time'],
  amount: ['amount', 'amount ($)', 'transaction amount', 'value', 'total', 'amount spent'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'money out', 'outflow', 'spent'],
  credit: ['credit', 'deposit', 'deposits', 'money in', 'inflow', 'received'],
  category: ['category', 'budget category', 'group', 'envelope', 'budget item', 'classification'],
  merchant: ['name', 'merchant', 'description', 'payee', 'memo', 'details', 'transaction', 'note'],
  account: ['account name', 'account', 'account type', 'institution name', 'source'],
  type: ['type', 'transaction type', 'transaction kind', 'flow', 'income/expense'],
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[_\-.]/g, ' ').replace(/\s+/g, ' ').trim()

// Given the CSV header list, guess the best column name for each canonical field.
export function resolveColumns(headers) {
  const lowered = headers.map((h) => ({ raw: h, n: norm(h) }))
  const used = new Set()
  const pick = (synonyms, { allowReuse = false } = {}) => {
    // exact match first, then "contains"
    for (const syn of synonyms) {
      const hit = lowered.find((h) => h.n === syn && (allowReuse || !used.has(h.raw)))
      if (hit) {
        if (!allowReuse) used.add(hit.raw)
        return hit.raw
      }
    }
    for (const syn of synonyms) {
      const hit = lowered.find((h) => h.n.includes(syn) && (allowReuse || !used.has(h.raw)))
      if (hit) {
        if (!allowReuse) used.add(hit.raw)
        return hit.raw
      }
    }
    return ''
  }

  return {
    date: pick(FIELD_SYNONYMS.date),
    debit: pick(FIELD_SYNONYMS.debit),
    credit: pick(FIELD_SYNONYMS.credit),
    amount: pick(FIELD_SYNONYMS.amount),
    category: pick(FIELD_SYNONYMS.category),
    merchant: pick(FIELD_SYNONYMS.merchant),
    account: pick(FIELD_SYNONYMS.account),
    type: pick(FIELD_SYNONYMS.type),
  }
}

// ---------------------------------------------------------------------------
// value parsing
// ---------------------------------------------------------------------------
export function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return 0
  if (typeof raw === 'number') return raw
  const cleaned = String(raw)
    .replace(/[$,\s]/g, '')
    .replace(/^\((.*)\)$/, '-$1') // (12.34) => -12.34
    .trim()
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

export function parseDate(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (mdy) {
    let year = Number(mdy[3])
    if (year < 100) year += 2000
    return new Date(year, Number(mdy[1]) - 1, Number(mdy[2]))
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatCurrency(n, { cents = false } = {}) {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  return (
    sign +
    '$' +
    abs.toLocaleString('en-US', {
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    })
  )
}

// case-insensitive field read with fallbacks
function readField(row, colName, ...fallbacks) {
  const candidates = [colName, ...fallbacks].filter(Boolean)
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== null && row[c] !== '') return row[c]
  }
  // case-insensitive fallback
  const lowered = {}
  for (const k of Object.keys(row)) lowered[norm(k)] = row[k]
  for (const c of candidates) {
    const v = lowered[norm(c)]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return ''
}

// ---------------------------------------------------------------------------
// canonical amount + income classification
// ---------------------------------------------------------------------------
function canonicalAmount(row, config) {
  const { columns, sign } = config
  if (sign === 'debit-credit') {
    const debit = parseAmount(readField(row, columns.debit))
    const credit = parseAmount(readField(row, columns.credit))
    return debit - credit // money out positive, money in negative
  }
  const amt = parseAmount(readField(row, columns.amount))
  if (sign === 'expense-negative') return -amt
  return amt // 'expense-positive'
}

const INCOME_TYPE_RE = /income|credit|deposit|inflow|paycheck|salary/i

function classifyIncome(row, amount, rawCategory, config) {
  const incomeCats = (config.incomeCategories || []).map(norm)
  if (rawCategory && incomeCats.includes(norm(rawCategory))) return true
  if (config.columns.type) {
    const t = String(readField(row, config.columns.type)).trim()
    if (t && INCOME_TYPE_RE.test(t)) return true
  }
  if (config.inferIncomeBySign && amount < 0) return true
  return false
}

// ---------------------------------------------------------------------------
// build canonical transactions from raw rows + a provider config
// ---------------------------------------------------------------------------
export function buildTransactions(rawRows, config) {
  const { columns, categoryMap = {} } = config
  const lookupBucket = (cat) => {
    if (!cat) return cat
    // case-insensitive category map lookup
    if (categoryMap[cat]) return categoryMap[cat]
    const found = Object.keys(categoryMap).find((k) => norm(k) === norm(cat))
    return found ? categoryMap[found] : cat
  }

  return rawRows
    .map((row) => {
      const rawCategory = String(readField(row, columns.category)).trim()
      const customName = String(readField(row, 'Custom Name')).trim()
      const name = (customName || String(readField(row, columns.merchant)).trim()) || '(no description)'
      let amount = canonicalAmount(row, config)
      const date = parseDate(readField(row, columns.date))
      const account = String(readField(row, columns.account)).trim()
      const bucket = lookupBucket(rawCategory) || rawCategory
      const isIncome = classifyIncome(row, amount, rawCategory, config)
      // Canonical convention: income is money IN, so it must be negative. Some
      // apps (e.g. EveryDollar) export income as a positive amount alongside a
      // Type=Income flag — normalize those to negative here.
      if (isIncome && amount > 0) amount = -amount
      return { date, amount, name, rawCategory, bucket, account, isIncome }
    })
    .filter((t) => t.name !== '(no description)' || t.amount || t.rawCategory || t.date)
}

// Build a small preview (used by the mapping UI) so the user can sanity-check.
export function previewTransactions(rawRows, config, limit = 6) {
  return buildTransactions(rawRows.slice(0, limit), config)
}
