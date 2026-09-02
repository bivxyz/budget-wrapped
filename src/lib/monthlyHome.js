export function latestTransactionMonth(rows=[]){return rows.map(row=>String(row.date||'').slice(0,7)).filter(month=>/^\d{4}-\d{2}$/.test(month)).sort().at(-1)||null}

export function monthlyMood({month,currentMonth,budgetTotal=0,transactionCount=0,remaining=0,projectedTotal=0}){
  if(budgetTotal<=0)return{state:'no-budget',emoji:'🧭',title:'Set your monthly budget'}
  if(transactionCount<=0)return{state:'no-data',emoji:'📥',title:'Budget ready'}
  if(month>=currentMonth)return{state:'progress',emoji:'⏳',title:'Month in progress',detail:`Projected finish: ${projectedTotal}`}
  if(remaining>=0)return{state:'under',emoji:'🎉',title:'You finished under budget',detail:`${remaining} left in the plan.`}
  return{state:'over',emoji:'😬',title:'This month finished over budget',detail:`${Math.abs(remaining)} over the plan.`}
}

export function budgetRingData(monthly={}){
  const budget=(monthly.pacing||[]).filter(row=>row.target>0).map(row=>({name:row.bucket,value:row.target}))
  const actual=Object.entries(monthly.byCategory||{}).filter(([,value])=>value>0).map(([name,value])=>({name,value}))
  return{budget,actual,names:[...new Set([...budget.map(row=>row.name),...actual.map(row=>row.name)])]}
}
