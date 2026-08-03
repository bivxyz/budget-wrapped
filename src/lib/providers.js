// Provider presets. A "provider" knows how to turn a specific budget app's CSV
// into a normalized config that the canonical engine (finance.js) consumes.
//
// Each preset exposes:
//   id, name, blurb
//   detect(headers) -> confidence 0..1  (how sure we are this CSV is from them)
//   makeConfig(headers) -> config        (resolved columns + rules)
//
// A config is the single source of truth handed to analyze():
//   {
//     providerId, providerName,
//     columns: { date, amount, debit, credit, category, merchant, account, type },
//     sign: 'expense-positive' | 'expense-negative' | 'debit-credit',
//     categoryMap, budgetTargets, excludedCategories, incomeCategories,
//     inferIncomeBySign, savingsRegex, investmentRegex,
//   }

import { resolveColumns } from './fields.js'

const has = (headers, names) => {
  const lowered = headers.map((h) => String(h).toLowerCase().trim())
  return names.some((n) => lowered.includes(n.toLowerCase()))
}

// Default heuristics for spotting savings + investment activity by merchant name.
export const DEFAULT_SAVINGS_RE =
  /\bally\b|marcus|capital ?one ?360|sofi savings|high.?yield|to savings|savings transfer|emergency fund/i
export const DEFAULT_INVESTMENT_RE =
  /robinhood|vanguard|fidelity|schwab|wealthfront|betterment|coinbase|e\*?trade|brokerage|401\s?k|roth|ira\b/i

// ---------------------------------------------------------------------------
// Rocket Money (the original, fully-validated preset)
// ---------------------------------------------------------------------------
const ROCKET_CATEGORY_MAP = {
  'Dining & Drinks': 'Restaurants/Fast Food',
  Groceries: 'Groceries',
  'Auto & Transport': 'Car/Commute',
  'Bills & Utilities': 'Bills',
  Shopping: 'Shopping/Gifts',
  Gifts: 'Shopping/Gifts',
  'Entertainment & Rec.': 'Streaming/Entertainment',
  'Software & Tech': 'Streaming/Entertainment',
  'Travel & Vacation': 'Family Fun/Travel',
  'Family Care': 'Family Fun/Travel',
  'Home & Garden': 'Home Improvement',
  Medical: 'Medical',
  Pets: 'Pet/Baby',
  'Charitable Donations': 'Donations',
  'Loan Payment': 'Fixed Expenses',
  Investment: 'Investments',
}

const ROCKET_BUDGETS = {
  Groceries: 1000,
  'Restaurants/Fast Food': 750,
  Bills: 500,
  'Shopping/Gifts': 500,
  'Streaming/Entertainment': 60,
  'Family Fun/Travel': 100,
  'Home Improvement': 200,
  'Car/Commute': 450,
  Medical: 25,
  'Pet/Baby': 100,
  'Self Care/Hobby': 200,
  Donations: 950,
  Investments: 0,
}

const rocketMoney = {
  id: 'rocket-money',
  name: 'Rocket Money',
  blurb: 'Positive = expense, negative = income. Categories like “Dining & Drinks”.',
  detect(headers) {
    let score = 0
    if (has(headers, ['Institution Name'])) score += 0.4
    if (has(headers, ['Account Type']) && has(headers, ['Account Name'])) score += 0.2
    if (has(headers, ['Custom Name'])) score += 0.2
    if (has(headers, ['Ignored From']) || has(headers, ['Tax Deductible'])) score += 0.2
    if (has(headers, ['Amount']) && has(headers, ['Category']) && has(headers, ['Name']))
      score += 0.1
    return Math.min(score, 1)
  },
  makeConfig(headers) {
    const cols = resolveColumns(headers)
    return {
      providerId: 'rocket-money',
      providerName: 'Rocket Money',
      columns: {
        date: 'Date',
        amount: 'Amount',
        debit: '',
        credit: '',
        category: 'Category',
        merchant: 'Name',
        account: cols.account || 'Account Name',
        type: '',
      },
      sign: 'expense-positive',
      categoryMap: ROCKET_CATEGORY_MAP,
      budgetTargets: ROCKET_BUDGETS,
      excludedCategories: ['Income', 'Credit Card Payment', 'Internal Transfers', 'Uncategorized'],
      incomeCategories: ['Income'],
      inferIncomeBySign: false,
      savingsRegex: DEFAULT_SAVINGS_RE,
      investmentRegex: DEFAULT_INVESTMENT_RE,
    }
  },
}

// ---------------------------------------------------------------------------
// EveryDollar (Dave Ramsey) — best-effort preset.
// Their transaction export columns are not publicly standardized, so we lean on
// synonym resolution and let the user confirm/adjust in the mapping screen.
// ---------------------------------------------------------------------------
const everyDollar = {
  id: 'every-dollar',
  name: 'EveryDollar',
  blurb: 'Dave Ramsey’s zero-based budget. Expenses positive; income via a Type column.',
  detect(headers) {
    const lowered = headers.map((h) => String(h).toLowerCase().trim())
    let score = 0
    // EveryDollar leans on Group/Category + Merchant + Amount, often a Type column.
    if (lowered.includes('group') || lowered.includes('budget category')) score += 0.35
    if (lowered.includes('merchant')) score += 0.25
    if (lowered.includes('type') || lowered.includes('income/expense')) score += 0.2
    if (lowered.includes('amount') && lowered.includes('category')) score += 0.15
    // de-prioritise if it clearly looks like Rocket
    if (lowered.includes('institution name')) score -= 0.5
    return Math.max(0, Math.min(score, 0.9))
  },
  makeConfig(headers) {
    const cols = resolveColumns(headers)
    return {
      providerId: 'every-dollar',
      providerName: 'EveryDollar',
      columns: { ...cols },
      sign: cols.debit && cols.credit ? 'debit-credit' : 'expense-positive',
      categoryMap: {}, // user's own categories pass through as their own buckets
      budgetTargets: {}, // budgets not present in the transaction export
      excludedCategories: ['Transfer', 'Transfers', 'Income'],
      incomeCategories: ['Income', 'Paycheck'],
      inferIncomeBySign: false,
      savingsRegex: DEFAULT_SAVINGS_RE,
      investmentRegex: DEFAULT_INVESTMENT_RE,
    }
  },
}

// ---------------------------------------------------------------------------
// Generic — works on virtually any CSV via synonym detection.
// ---------------------------------------------------------------------------
const generic = {
  id: 'generic',
  name: 'Generic / Other',
  blurb: 'Any CSV. We’ll guess the columns — confirm them on the next screen.',
  detect() {
    return 0.1 // always available as a low-confidence fallback
  },
  makeConfig(headers) {
    const cols = resolveColumns(headers)
    const useDebitCredit = !!(cols.debit && cols.credit) && !cols.amount
    return {
      providerId: 'generic',
      providerName: 'Generic / Other',
      columns: { ...cols },
      sign: useDebitCredit ? 'debit-credit' : 'expense-positive',
      categoryMap: {},
      budgetTargets: {},
      excludedCategories: ['Transfer', 'Transfers', 'Internal Transfers', 'Credit Card Payment'],
      incomeCategories: ['Income', 'Paycheck', 'Salary'],
      // with no category-based income signal, treat money-in as income
      inferIncomeBySign: true,
      savingsRegex: DEFAULT_SAVINGS_RE,
      investmentRegex: DEFAULT_INVESTMENT_RE,
    }
  },
}

export const PROVIDERS = [rocketMoney, everyDollar, generic]

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || generic
}

// Pick the most likely provider for a given CSV header list.
export function detectProvider(headers) {
  const ranked = PROVIDERS.map((p) => ({ provider: p, confidence: p.detect(headers) })).sort(
    (a, b) => b.confidence - a.confidence,
  )
  return ranked[0]
}

// Sign-convention options surfaced in the mapping UI.
export const SIGN_OPTIONS = [
  { value: 'expense-positive', label: 'Expenses are positive, income negative (Rocket Money)' },
  { value: 'expense-negative', label: 'Expenses are negative, income positive (most banks)' },
  { value: 'debit-credit', label: 'Separate Debit / Credit columns' },
]
