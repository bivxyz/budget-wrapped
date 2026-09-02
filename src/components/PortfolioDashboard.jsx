import { useMemo,useState } from 'react'
import { LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer } from 'recharts'
import Slideshow from './Slideshow.jsx'
import MonthlyHome from './MonthlyHome.jsx'
import TransactionTracker from './TransactionTracker.jsx'
import SelectMenu from './SelectMenu.jsx'
import ExportMenu from './ExportMenu.jsx'
import IconButton from './IconButton.jsx'
import { formatCurrency } from '../lib/finance.js'
import { effectiveTransaction } from '../lib/tracker.js'
import { annualTrendView } from '../lib/portfolio.js'
import { postJson } from '../lib/sharedState.js'

const tabs=[['overview','Overview'],['transactions','Transactions'],['trends','Trends & YTD']]

export default function PortfolioDashboard({portfolio,archive,shared,onSharedChanged,onOverride,defaultBudgets,initialMonth}){
  const [month,setMonth]=useState(initialMonth||portfolio.currentKey),[view,setView]=useState(initialMonth?'slideshow':'overview'),[budgetDirty,setBudgetDirty]=useState(false),[discardVersion,setDiscardVersion]=useState(0),[reviewBusy,setReviewBusy]=useState(false),[reviewError,setReviewError]=useState('')
  const rows=archive[month]||[],monthly=portfolio.monthly[month]||{totalSpent:0,topExpenses:[],topCategories:[],byCategory:{},pacing:[],budgetPerformance:{over:[],under:[]},budgetTotal:0,budgetRemaining:0,projectedTotal:0},data=portfolio.analyses[month]
  const categories=useMemo(()=>[...new Set([...Object.values(archive).flat().map(effectiveTransaction).filter(row=>row.flow==='Expense').map(row=>row.bucket),...Object.keys(defaultBudgets),...monthly.pacing.map(row=>row.bucket),'Uncategorized'].filter(Boolean))].sort(),[archive,defaultBudgets,monthly.pacing])
  const selectedYear=month.slice(0,4),years=[...new Set([selectedYear,...portfolio.months.map(key=>key.slice(0,4))])].sort(),monthOptions=portfolio.months.filter(key=>key.startsWith(`${selectedYear}-`)).map(key=>({value:key,label:new Date(2000,Number(key.slice(5))-1,1).toLocaleString('en-US',{month:'short'})}))
  const [yearNumber,monthNumber]=month.split('-').map(Number),previousKey=`${monthNumber===1?yearNumber-1:yearNumber}-${String(monthNumber===1?12:monthNumber-1).padStart(2,'0')}`,previous=portfolio.monthly[previousKey]||{totalSpent:0,byCategory:{}},setting=(shared.budgetSettings||[]).find(row=>row.monthKey===month),review=(shared.monthlyReviews||[]).find(row=>row.monthKey===month)

  const discardDraft=message=>{if(!budgetDirty)return true;if(!window.confirm(message))return false;setBudgetDirty(false);setDiscardVersion(value=>value+1);return true}
  const selectMonth=value=>{if(value===month||!discardDraft('Discard the unsaved monthly budget draft?'))return;setMonth(value);history.replaceState(null,'',`?m=${value}`)}
  const selectYear=year=>{const sameMonth=`${year}-${month.slice(5)}`,available=portfolio.months.filter(key=>key.startsWith(`${year}-`));selectMonth(available.includes(sameMonth)?sameMonth:available.at(-1)||sameMonth)}
  const changeView=next=>{if(next!==view&&view==='overview'&&!discardDraft('Discard the unsaved monthly budget draft?'))return;setView(next)}
  const beforeUpload=()=>discardDraft('Discard the unsaved monthly budget draft and choose a Rocket Money CSV?')
  const handleUploaded=async result=>{await onSharedChanged();if(result.latestMonth){setMonth(result.latestMonth);history.replaceState(null,'',`?m=${result.latestMonth}`)}setReviewError('');setView('transactions')}
  const completeReview=async()=>{if(!review)return;setReviewBusy(true);setReviewError('');try{await postJson('/api/review',{monthKey:month,uploadEventId:review.uploadEventId});await onSharedChanged()}catch(error){setReviewError(error.message)}finally{setReviewBusy(false)}}

  if(view==='slideshow'&&data)return <Slideshow data={data} onDone={()=>setView('overview')}/>

  return <div className="max-w-7xl mx-auto px-5 py-8">
    <header className="flex items-start justify-between gap-4 mb-6"><div><div className="text-accent-green text-xs font-bold tracking-[.25em] uppercase">Budget Wrapped</div><h1 className="text-3xl font-black">Family budget tracker</h1></div><div className="flex justify-end gap-2"><ExportMenu month={month} shared={shared} portfolio={portfolio}/><IconButton onClick={()=>changeView('slideshow')} icon="replay" label="Replay Wrapped"/></div></header>
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6"><div><div className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-1.5">Viewing period</div><div className="flex gap-2"><SelectMenu value={selectedYear} onChange={selectYear} options={years} label="Year" className="min-w-28"/><SelectMenu value={month} onChange={selectMonth} options={monthOptions.length?monthOptions:[{value:month,label:new Date(2000,Number(month.slice(5))-1,1).toLocaleString('en-US',{month:'short'})}]} label="Month" className="min-w-24"/></div></div><nav className="flex flex-wrap gap-2">{tabs.map(([key,label])=><button key={key} onClick={()=>changeView(key)} className={view===key?'primary-button':'secondary-button'}>{label}</button>)}</nav></div>
    <SharedStatus shared={shared}/>
    {view==='overview'&&<MonthlyHome month={month} monthly={monthly} rows={rows} previous={previous} categories={categories} setting={setting} shared={shared} streak={portfolio.streak} review={review} onSharedChanged={onSharedChanged} onUploaded={handleUploaded} onOpenTransactions={()=>changeView('transactions')} onReplay={()=>changeView('slideshow')} onDirtyChange={setBudgetDirty} beforeUpload={beforeUpload} discardVersion={discardVersion}/>}
    {view==='transactions'&&<><ReviewPrompt review={review} month={month} busy={reviewBusy} error={reviewError} onComplete={completeReview}/><TransactionTracker rows={rows} categories={categories} onOverride={onOverride}/></>}
    {view==='trends'&&<Trends portfolio={portfolio} year={selectedYear}/>}
  </div>
}

function SharedStatus({shared}){return shared.available?<div className="text-xs text-accent-green mb-4">● Shared family data connected</div>:<div className="bg-accent-gold/10 border border-accent-gold/30 text-accent-gold rounded-lg px-4 py-3 text-sm mb-5">Shared editing is offline. The dashboard remains readable, but uploads and edits require the local or production D1 binding.</div>}
function ReviewPrompt({review,month,busy,error,onComplete}){if(!review)return null;if(review.reviewedAt)return <div className="mb-5 rounded-xl border border-accent-green/20 bg-accent-green/5 px-4 py-3 text-sm text-accent-green">✓ Transactions reviewed for {month}{review.reviewedBy?` by ${review.reviewedBy}`:''}.</div>;return <div className="mb-5 rounded-xl border border-accent-gold/30 bg-accent-gold/10 p-4"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-wider text-accent-gold">Step 3 · Check the data</div><h2 className="mt-1 font-bold">Review this month’s transactions</h2><p className="mt-1 text-sm text-white/50">Confirm categories and flow types, then mark this upload reviewed.</p></div><button onClick={onComplete} disabled={busy} className="primary-button">{busy?'Saving…':'Mark review complete'}</button></div>{error&&<div className="mt-3 text-sm text-accent-coral">{error}</div>}</div>}

const Card=({label,value,hot})=><div className={`bg-base-2 rounded-xl p-5 border-l-4 ${hot?'border-accent-coral':'border-accent-green'}`}><div className="text-sm text-white/45">{label}</div><div className="text-2xl font-black mt-1">{value}</div></div>
const monthLabel=key=>new Date(2000,Number(key.slice(5))-1,1).toLocaleString('en-US',{month:'short'})
const axisCurrency=value=>Math.abs(value)>=1000?`$${Math.round(value/1000)}k`:`$${Math.round(value)}`
function Trends({portfolio,year}){
  const annual=useMemo(()=>annualTrendView(portfolio,year),[portfolio,year])
  const [chosen,setChosen]=useState('')
  const selected=annual.categories.find(row=>row.bucket===chosen)||annual.categories[0]
  return <><div className="grid sm:grid-cols-3 gap-3 mb-6"><Card label={`${year} spending`} value={formatCurrency(annual.actual)}/><Card label={`${year} budget`} value={formatCurrency(annual.target)}/><Card label={`${year} remaining`} value={formatCurrency(annual.difference)} hot={annual.difference<0}/></div><section className="bg-base-2 rounded-xl p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-4 mb-6"><div><div className="text-xs font-semibold uppercase tracking-wider text-white/40">Annual category trend</div><h2 className="text-xl font-black mt-1">{selected?.bucket||'No category data'}</h2>{selected&&<div className="text-sm text-white/45 mt-1">{formatCurrency(selected.actual)} spent · {formatCurrency(selected.target)} budgeted</div>}</div>{annual.categories.length>0&&<SelectMenu value={selected.bucket} onChange={setChosen} options={annual.categories.map(row=>({value:row.bucket,label:row.bucket}))} label="Category" className="min-w-64"/>}</div>{selected?<><div className="flex gap-5 text-xs text-white/55 mb-2"><span className="flex items-center gap-2"><i className="block w-5 h-0.5 bg-accent-green"/>Actual spending</span><span className="flex items-center gap-2"><i className="block w-5 border-t-2 border-dashed border-white/35"/>Category budget</span></div><ResponsiveContainer width="100%" height={340}><LineChart data={selected.series} margin={{top:12,right:14,left:2,bottom:2}}><XAxis dataKey="month" tickFormatter={monthLabel}/><YAxis tickFormatter={axisCurrency}/><Tooltip labelFormatter={monthLabel} formatter={(value,name)=>[formatCurrency(value),name==='actual'?'Actual spending':'Category budget']}/><Line type="monotone" dataKey="actual" stroke="#00ff87" strokeWidth={3} dot={{r:4,fill:'#00ff87'}} activeDot={{r:6}}/><Line type="monotone" dataKey="target" stroke="#6b7280" strokeWidth={2} strokeDasharray="5 5" dot={{r:3}}/></LineChart></ResponsiveContainer></>:<div className="py-20 text-center text-white/40">No spending or category budgets are available for {year}.</div>}</section></>
}
