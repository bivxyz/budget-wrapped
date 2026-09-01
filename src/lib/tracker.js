export const FLOW_TYPES = ['Expense','Income','Transfer','Investment','Ignore']
const TRANSFER_CATEGORIES = new Set(['Credit Card Payment','Internal Transfers'])

export function importedFlow(transaction) {
  if (transaction.isIncome || transaction.rawCategory === 'Income') return 'Income'
  if (transaction.rawCategory === 'Investment' || transaction.bucket === 'Investments') return 'Investment'
  if (TRANSFER_CATEGORIES.has(transaction.rawCategory)) return 'Transfer'
  return 'Expense'
}

export function effectiveTransaction(transaction) {
  const flow = transaction.flow || transaction.overrideFlow || transaction.importedFlow || importedFlow(transaction)
  const bucket = transaction.bucket || transaction.overrideBucket || transaction.originalBucket || transaction.rawCategory || 'Uncategorized'
  return { ...transaction, bucket, flow, isIncome: flow === 'Income' }
}

export function trueSpending(rows) {
  return rows.map(effectiveTransaction).filter((row) => row.flow === 'Expense')
}

export function monthlySummary(rows) {
  const spending = trueSpending(rows), byCategory = {}, highestByCategory = {}
  for (const row of spending) { byCategory[row.bucket] = (byCategory[row.bucket] || 0) + row.amount; if (row.amount > 0 && (!highestByCategory[row.bucket] || row.amount > highestByCategory[row.bucket].amount)) highestByCategory[row.bucket] = row }
  const topExpenses = spending.filter((row) => row.amount > 0 && row.bucket !== 'Fixed Expenses' && row.rawCategory !== 'Loan Payment').sort((a,b) => b.amount-a.amount).slice(0,5)
  const topCategories = Object.entries(byCategory).map(([bucket,amount]) => ({bucket,amount,highestExpense:highestByCategory[bucket]||null})).sort((a,b) => b.amount-a.amount).slice(0,5)
  return { totalSpent:spending.reduce((sum,row)=>sum+row.amount,0), topExpenses, topCategories, byCategory }
}

export function budgetsByMonth(rows) {
  return rows.reduce((result,row) => { (result[row.monthKey] ||= {})[row.bucket] = {target:Number(row.target),paced:row.paced,sortOrder:Number(row.sortOrder)||0}; return result }, {})
}

export function budgetLimitsByMonth(rows) {
  return rows.reduce((result,row) => { result[row.monthKey]=Number(row.spendingLimit)||0; return result }, {})
}
