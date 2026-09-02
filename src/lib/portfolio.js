import { analyze } from './finance.js'
import { effectiveTransaction, monthlySummary } from './tracker.js'

export function localDateKey(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
export function monthKey(date){return localDateKey(date).slice(0,7)}
export function daysInMonth(key){const [y,m]=key.split('-').map(Number);return new Date(y,m,0).getDate()}
export function normalizeBudget(entry){return typeof entry==='number'?{target:entry,paced:true}:{target:Number(entry?.target||0),paced:entry?.paced!==false}}
const config=(targets={})=>({providerId:'rocket-money',providerName:'Rocket Money Archive',columns:{date:'date',amount:'amount',category:'bucket',merchant:'name',account:'account',type:'flow'},sign:'expense-positive',categoryMap:{},budgetTargets:targets,excludedCategories:['Transfer','Investment','Ignore'],incomeCategories:[],inferIncomeBySign:false})
export function analyzeArchiveMonth(rows,budgets={}){const targets=Object.fromEntries(Object.entries(budgets).map(([k,v])=>[k,normalizeBudget(v).target]));return analyze(rows.map(effectiveTransaction).filter(r=>r.flow==='Expense'||r.flow==='Income'),config(targets))}
export function shiftMonth(key,offset){const [year,month]=key.split('-').map(Number),date=new Date(year,month-1+offset,1);return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`}
export function portfolioMonths(archive={},budgets={},limits={},closeouts=[]){
  const keys=new Set([...Object.keys(archive),...Object.keys(budgets),...Object.keys(limits),...closeouts])
  if(closeouts.length)keys.add(shiftMonth([...closeouts].sort().at(-1),1))
  return [...keys].sort()
}
export function activePlanningMonth(months,currentCalendarKey,closeouts=[]){
  if(closeouts.length)return shiftMonth([...closeouts].sort().at(-1),1)
  return months.includes(currentCalendarKey)?currentCalendarKey:months.at(-1)||currentCalendarKey
}
export function budgetStreak(archive,monthly,currentCalendarKey,budgetLimits={}){
  const imported=new Set(Object.keys(archive).filter(key=>(archive[key]||[]).length>0&&key<currentCalendarKey).sort()),throughMonth=[...imported].at(-1)||null
  if(!throughMonth)return{current:0,best:0,amount:0,throughMonth:null,recent:[]}
  const statusFor=month=>{if(!imported.has(month))return{month,status:'no-data',difference:null};const budget=monthly[month]?.budgetTotal||0;if(!Object.prototype.hasOwnProperty.call(budgetLimits,month)||budget<=0)return{month,status:'no-budget',difference:null};const difference=budget-(monthly[month]?.totalSpent||0);return{month,status:difference>=0?'success':'miss',difference}}
  const recent=Array.from({length:6},(_,index)=>statusFor(shiftMonth(throughMonth,index-5)))
  let current=0,amount=0,cursor=throughMonth
  while(true){const result=statusFor(cursor);if(result.status!=='success')break;current+=1;amount+=result.difference;cursor=shiftMonth(cursor,-1)}
  const first=[...imported][0];let best=0,run=0
  for(cursor=first;cursor<=throughMonth;cursor=shiftMonth(cursor,1)){if(statusFor(cursor).status==='success'){run+=1;best=Math.max(best,run)}else run=0}
  return{current,best,amount,throughMonth,recent}
}
export function budgetPerformance(pacing=[]){const over=pacing.filter(row=>row.actual>row.target).map(row=>({bucket:row.bucket,target:row.target,actual:row.actual,difference:row.actual-row.target})).sort((a,b)=>b.difference-a.difference||a.bucket.localeCompare(b.bucket)).slice(0,5),under=pacing.filter(row=>row.actual>0&&row.actual<row.target).map(row=>({bucket:row.bucket,target:row.target,actual:row.actual,difference:row.target-row.actual})).sort((a,b)=>b.difference-a.difference||a.bucket.localeCompare(b.bucket)).slice(0,5);return{over,under}}
export function buildPortfolio(archive,budgetsByMonth={},today=new Date(),budgetLimits={},closeouts=[]){
  const currentCalendarKey=monthKey(today),months=portfolioMonths(archive,budgetsByMonth,budgetLimits,closeouts),selectedKey=activePlanningMonth(months,currentCalendarKey,closeouts),analyses={},monthly={}
  for(const key of months){const budgets=budgetsByMonth[key]||{},rows=archive[key]||[],analysis=analyzeArchiveMonth(rows,budgets),summary=monthlySummary(rows),dim=daysInMonth(key),elapsed=key===currentCalendarKey?Math.max(1,today.getDate()):dim;const pacing=Object.entries(budgets).map(([bucket,raw])=>{const {target,paced}=normalizeBudget(raw),actual=summary.byCategory[bucket]||0,proratedTarget=paced&&key===currentCalendarKey?target*elapsed/dim:target;return{bucket,target,paced,sortOrder:Number(raw?.sortOrder)||0,actual,remaining:target-actual,percent:target?actual/target:null,proratedTarget,paceRatio:paced&&proratedTarget?actual/proratedTarget:null,projected:paced?actual/elapsed*dim:null}}).sort((a,b)=>a.sortOrder-b.sortOrder||a.bucket.localeCompare(b.bucket));const allocatedTotal=pacing.reduce((s,x)=>s+x.target,0),budgetTotal=Object.prototype.hasOwnProperty.call(budgetLimits,key)?Number(budgetLimits[key])||0:allocatedTotal,budgetRemaining=budgetTotal-summary.totalSpent;Object.assign(analysis,{budgetTotal,budgetRemaining,allocatedBudgetTotal:allocatedTotal});analyses[key]=analysis;monthly[key]={...summary,pacing,budgetPerformance:budgetPerformance(pacing),allocatedTotal,budgetTotal,budgetRemaining,projectedTotal:pacing.reduce((s,x)=>s+(x.projected??x.actual),0)}}
  const year=selectedKey.slice(0,4),ytdMonths=months.filter(m=>m.startsWith(year)&&m<=currentCalendarKey),ytdActual=ytdMonths.reduce((s,m)=>s+(monthly[m]?.totalSpent||0),0),ytdTarget=ytdMonths.reduce((s,m)=>s+(monthly[m]?.budgetTotal||0),0)
  const categories=[...new Set(months.flatMap(m=>[...Object.keys(monthly[m].byCategory),...Object.keys(budgetsByMonth[m]||{})]))],trends=categories.map(bucket=>({bucket,series:months.map(m=>({month:m,actual:monthly[m].byCategory[bucket]||0,target:normalizeBudget(budgetsByMonth[m]?.[bucket]).target}))}))
  return{months,analyses,monthly,currentKey:selectedKey,trends,ytd:{actual:ytdActual,target:ytdTarget,difference:ytdTarget-ytdActual},streak:budgetStreak(archive,monthly,currentCalendarKey,budgetLimits)}
}
export function annualTrendView(portfolio,year){const months=portfolio.months.filter(month=>month.startsWith(`${year}-`)),actual=months.reduce((sum,month)=>sum+(portfolio.monthly[month]?.totalSpent||0),0),target=months.reduce((sum,month)=>sum+(portfolio.monthly[month]?.budgetTotal||0),0),categories=portfolio.trends.map(trend=>{const series=trend.series.filter(point=>point.month.startsWith(`${year}-`));return{...trend,series,actual:series.reduce((sum,point)=>sum+point.actual,0),target:series.reduce((sum,point)=>sum+point.target,0)}}).filter(trend=>trend.actual>0||trend.target>0).sort((a,b)=>b.actual-a.actual||b.target-a.target||a.bucket.localeCompare(b.bucket));return{actual,target,difference:target-actual,categories}}
