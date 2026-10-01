import { trueSpending, monthEndDate } from './tracker.js'

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

const shiftMonth=(key,offset)=>{const [year,month]=key.split('-').map(Number),date=new Date(year,month-1+offset,1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`}
const covered=(coverage,month)=>coverage.some(range=>range.from<=`${month}-01`&&range.through>=monthEndDate(month))
export function cutbackOpportunities(rows=[],budgets=[],coverage=[],month){
  const previous=shiftMonth(month,-1),complete=covered(coverage,previous),comparisonMonths=[shiftMonth(previous,-2),shiftMonth(previous,-1),previous].filter(key=>covered(coverage,key))
  const spending=trueSpending(rows),sum=(bucket,key)=>spending.filter(row=>row.bucket===bucket&&row.date.startsWith(key)).reduce((total,row)=>total+Number(row.amount||0),0)
  const buckets=[...new Set(spending.filter(row=>row.date.startsWith(previous)&&row.bucket!=='Fixed Expenses').map(row=>row.bucket))]
  const rowsOut=buckets.map(bucket=>{const actual=sum(bucket,previous),values=comparisonMonths.map(key=>sum(bucket,key)),average=values.length?values.reduce((a,b)=>a+b,0)/values.length:null,target=budgets.find(row=>row.monthKey===previous&&row.bucket===bucket)?.target??null;return{bucket,actual,target,average,difference:average==null?null:actual-average}}).filter(row=>row.actual>0).sort((a,b)=>b.actual-a.actual||a.bucket.localeCompare(b.bucket)).slice(0,5)
  return{month:previous,complete,comparisonMonths,rows:rowsOut}
}
