const shortDate=value=>value?new Date(`${value}T00:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'—'

export default function CoverageStatus({monthly,hasTransactions}){
  if(!hasTransactions)return null
  const complete=monthly.fullMonthData
  return <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${complete?'border-accent-green/25 bg-accent-green/5 text-accent-green':'border-accent-gold/25 bg-accent-gold/5 text-accent-gold'}`}><strong>{complete?'Full month captured':'Month partially captured'}</strong> · Transactions through {shortDate(monthly.coverageThrough)}{monthly.monthEnd&&` of ${shortDate(monthly.monthEnd)}`}. {complete?'Review and sign off to close the month.':'Upload a later export before closing.'}</div>
}
