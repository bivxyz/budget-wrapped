import { useMemo,useState } from 'react'
import { LineChart,Line,XAxis,YAxis,Tooltip,ResponsiveContainer } from 'recharts'
import Slideshow from './Slideshow.jsx'
import ManualExpense from './ManualExpense.jsx'
import WeeklyBudget from './WeeklyBudgetV2.jsx'
import ReconciliationPanel from './ReconciliationPanel.jsx'
import MonthlyHome from './MonthlyHomeV2.jsx'
import TransactionTracker from './TransactionTrackerV2.jsx'
import SelectMenu from './SelectMenu.jsx'
import ExportMenu from './ExportMenu.jsx'
import IconButton,{Icon} from './IconButton.jsx'
import { formatCurrency } from '../lib/finance.js'
import { effectiveTransaction } from '../lib/tracker.js'
import { annualTrendView,shiftMonth } from '../lib/portfolio.js'
import { postJson } from '../lib/sharedState.js'

const tabs=[['overview','Overview','home'],['transactions','Transactions','transactions'],['weekly','Weekly Budget','weekly'],['trends','Trends & YTD','trends']]
const emptyMonth={totalSpent:0,totalIncome:0,investmentContributions:0,operatingNet:0,savingsLoss:0,netProfit:0,topExpenses:[],topCategories:[],byCategory:{},pacing:[],budgetPerformance:{over:[],under:[]},budgetTotal:0,budgetRemaining:0,projectedTotal:0,spendingAudit:{grossPurchases:0,refunds:0,trueSpending:0,income:0,investmentContributions:0,operatingNet:0,savingsLoss:0,netProfit:0,excluded:{creditCardPayments:{count:0,gross:0},internalTransfers:{count:0,gross:0},otherTransfers:{count:0,gross:0},investments:{count:0,gross:0},ignored:{count:0,gross:0}},needsReview:{uncategorized:0,cashAndChecks:0,ambiguousMatches:0}}}

export default function PortfolioDashboardV2({portfolio,archive,shared,onSharedChanged,onOverride,defaultBudgets,initialMonth}){
  const [month,setMonth]=useState(initialMonth||portfolio.currentKey),[view,setView]=useState('overview'),[transactionPreset,setTransactionPreset]=useState(null),[budgetDirty,setBudgetDirty]=useState(false),[discardVersion,setDiscardVersion]=useState(0),[reviewBusy,setReviewBusy]=useState(false),[reviewError,setReviewError]=useState(''),[statusBusy,setStatusBusy]=useState(false),[statusError,setStatusError]=useState('')
  const [manualForm,setManualForm]=useState(null),[manualNotice,setManualNotice]=useState('')
  const rows=archive[month]||[],monthly=portfolio.monthly[month]||emptyMonth,data=portfolio.analyses[month]
  const categories=useMemo(()=>[...new Set([...Object.values(archive).flat().map(effectiveTransaction).filter(row=>row.flow==='Expense').map(row=>row.bucket),...Object.keys(defaultBudgets),...monthly.pacing.map(row=>row.bucket),'Uncategorized'].filter(Boolean))].sort(),[archive,defaultBudgets,monthly.pacing])
  const selectedYear=month.slice(0,4),years=[...new Set([selectedYear,...portfolio.months.map(key=>key.slice(0,4))])].sort(),monthOptions=portfolio.months.filter(key=>key.startsWith(`${selectedYear}-`)).map(key=>({value:key,label:new Date(2000,Number(key.slice(5))-1,1).toLocaleString('en-US',{month:'short'})}))
  const previousKey=shiftMonth(month,-1),previous=portfolio.monthly[previousKey]||emptyMonth,setting=(shared.budgetSettings||[]).find(row=>row.monthKey===month),review=(shared.monthlyReviews||[]).find(row=>row.monthKey===month),closeout=(shared.monthlyCloseouts||[]).find(row=>row.monthKey===month),locked=Boolean(closeout)
  const discardDraft=message=>{if(!budgetDirty)return true;if(!window.confirm(message))return false;setBudgetDirty(false);setDiscardVersion(value=>value+1);return true}
  const selectMonth=value=>{if(value===month)return true;if(!discardDraft('Discard the unsaved monthly budget draft?'))return false;setMonth(value);history.replaceState(null,'',`?m=${value}`);return true}
  const selectYear=year=>{const sameMonth=`${year}-${month.slice(5)}`,available=portfolio.months.filter(key=>key.startsWith(`${year}-`));selectMonth(available.includes(sameMonth)?sameMonth:available.at(-1)||sameMonth)}
  const changeView=next=>{if(next===view)return true;if(!discardDraft('Discard the unsaved monthly budget draft?'))return false;setView(next);return true}
  const navigate=next=>{const changed=changeView(next);if(changed&&next==='transactions')setTransactionPreset(null);return changed}
  const openTransactions=(preset=null)=>{if(!changeView('transactions'))return false;setTransactionPreset(preset?{...preset,version:Date.now()}:null);return true}
  const beforeUpload=()=>locked?false:discardDraft('Discard the unsaved monthly budget draft and choose a Rocket Money CSV?')
  const openUpload=()=>{if(!changeView('overview'))return;setTimeout(()=>document.getElementById('rocket-upload-button')?.click(),0)}
  const handleUploaded=async result=>{await onSharedChanged();if(result.latestMonth){setMonth(result.latestMonth);history.replaceState(null,'',`?m=${result.latestMonth}`)}setReviewError('');setTransactionPreset(null);setView('transactions')}
  const completeReview=async()=>{if(!review)return;setReviewBusy(true);setReviewError('');try{await postJson('/api/review',{monthKey:month,uploadEventId:review.uploadEventId,revision:review.revision||0});await onSharedChanged()}catch(error){setReviewError(error.message)}finally{setReviewBusy(false)}}
  const changeMonthStatus=async action=>{if(!discardDraft('Discard the unsaved budget draft before changing month status?'))return;const verb=action==='close'?'Close':'Reopen';if(!window.confirm(`${verb} ${monthLabelLong(month)}?`))return;setStatusBusy(true);setStatusError('');try{await postJson('/api/month-status',{action,monthKey:month});await onSharedChanged();if(action==='close'){const next=shiftMonth(month,1);setMonth(next);setView('overview');history.replaceState(null,'',`?m=${next}`)}}catch(error){setStatusError(error.message)}finally{setStatusBusy(false)}}
  const openManual=row=>{if(discardDraft('Discard the unsaved budget draft before adding or editing an expense?'))setManualForm({row})}
  const manualSaved=async()=>{await onSharedChanged();setManualNotice('Expense saved for the family.')}
  const accounts=[...new Set((shared.transactions||[]).map(row=>row.account).filter(Boolean))].sort()
  const statusLabel=locked?'Closed':rows.some(row=>row.source!=='manual')?'In progress':monthly.budgetTotal>0?'Budget ready':'Planning'
  if(view==='slideshow'&&data)return <Slideshow data={data} onDone={()=>setView('overview')}/>
  return <div className="budget-app-shell">
    <Navigation view={view} onChange={navigate}/>
    <div className="budget-app-canvas">
      <header className="budget-titlebar">
        <div className="titlebar-identity"><div className="titlebar-brand">Budget Wrapped</div><div className="titlebar-period"><strong>{monthLabelLong(month)}</strong><span className={`month-status month-status-${statusLabel.toLowerCase().replace(' ','-')}`}>{statusLabel}</span></div></div>
        <div className="titlebar-period-controls"><SelectMenu value={selectedYear} onChange={selectYear} options={years} label="Year" className="min-w-24"/><SelectMenu value={month} onChange={selectMonth} options={monthOptions} label="Month" className="min-w-20"/></div>
        <div className="titlebar-actions">
          <ConnectionDot shared={shared}/>
          {['overview','transactions','weekly'].includes(view)&&<button className="primary-button titlebar-add" disabled={!shared.available||(locked&&view!=='weekly')} onClick={()=>openManual(null)}><Icon name="plus" size={17}/><span>Add expense</span></button>}
          <IconButton onClick={openUpload} disabled={!shared.available||locked} icon="upload" label="Upload Rocket Money CSV"/>
          <ExportMenu month={month} shared={shared} portfolio={portfolio}/>
          <IconButton onClick={()=>changeView('slideshow')} disabled={!data||!rows.length} icon="replay" label="Replay Wrapped"/>
        </div>
      </header>
      <main className="budget-app-content">
        {!shared.available&&<SharedStatus/>}
        {(manualNotice||statusError)&&<div className={`app-notice ${statusError?'app-notice-error':''}`} role="status">{statusError||manualNotice}</div>}
        {manualForm&&<ManualExpense row={manualForm.row} categories={categories} accounts={accounts} onClose={()=>setManualForm(null)} onSaved={manualSaved}/>} 
        {view==='transactions'&&<ReconciliationPanel shared={shared} month={month} onChanged={onSharedChanged}/>} 
        {view==='weekly'&&<WeeklyBudget key={`${month}:${discardVersion}`} month={month} shared={shared} onChanged={onSharedChanged} onDirtyChange={setBudgetDirty}/>} 
        {view==='overview'&&<MonthlyHome month={month} monthly={monthly} rows={rows} previous={previous} categories={categories} setting={setting} shared={shared} streak={portfolio.streak} review={review} closeout={closeout} statusBusy={statusBusy} statusError={statusError} onMonthStatus={changeMonthStatus} onSharedChanged={onSharedChanged} onUploaded={handleUploaded} onOpenTransactions={openTransactions} onOpenWeekly={()=>changeView('weekly')} onReplay={()=>changeView('slideshow')} onDirtyChange={setBudgetDirty} beforeUpload={beforeUpload} discardVersion={discardVersion}/>}
        {view==='transactions'&&<TransactionTracker rows={rows} categories={categories} preset={transactionPreset} onOverride={onOverride} review={review} busy={reviewBusy} error={reviewError} onReview={completeReview} locked={locked||!shared.available} onEditManual={openManual} onChanged={onSharedChanged}/>}
        {view==='trends'&&<Trends portfolio={portfolio} year={selectedYear}/>} 
      </main>
    </div>
    <Navigation view={view} onChange={navigate} mobile/>
  </div>
}

function Navigation({view,onChange,mobile=false}){return <nav className={mobile?'budget-mobile-nav':'budget-rail'} aria-label="Primary navigation">{!mobile&&<div className="rail-monogram" aria-label="Budget Wrapped">BW</div>}{tabs.map(([key,label,icon])=><button key={key} onClick={()=>onChange(key)} className={`rail-link ${view===key?'rail-link-active':''}`} aria-current={view===key?'page':undefined}><Icon name={icon} size={20}/><span>{label}</span></button>)}</nav>}
function ConnectionDot({shared}){return <span className={`connection-dot ${shared.available?'connection-dot-online':'connection-dot-offline'}`} title={shared.available?'Shared family data connected':'Shared editing offline'}><span aria-hidden="true"/><span className="sr-only">{shared.available?'Shared family data connected':'Shared editing offline'}</span></span>}
function SharedStatus(){return <div className="app-notice app-notice-warning">Shared editing is offline. The dashboard remains readable, but uploads and edits require D1.</div>}
const monthLabel=key=>new Date(2000,Number(key.slice(5))-1,1).toLocaleString('en-US',{month:'short'}),monthLabelLong=key=>new Date(Number(key.slice(0,4)),Number(key.slice(5))-1,1).toLocaleString('en-US',{month:'long',year:'numeric'}),axisCurrency=value=>Math.abs(value)>=1000?`$${Math.round(value/1000)}k`:`$${Math.round(value)}`

function Trends({portfolio,year}){const annual=useMemo(()=>annualTrendView(portfolio,year),[portfolio,year]),[chosen,setChosen]=useState(''),selected=annual.categories.find(row=>row.bucket===chosen)||annual.categories[0];return <div className="view-workspace trends-workspace"><section className="instrument-panel trends-chart-panel"><div className="panel-titlebar"><div><div className="eyebrow">Annual category trend</div><h1>{selected?.bucket||'No category data'}</h1>{selected&&<p>{formatCurrency(selected.actual)} spent · {formatCurrency(selected.target)} budgeted</p>}</div>{annual.categories.length>0&&<SelectMenu value={selected.bucket} onChange={setChosen} options={annual.categories.map(row=>({value:row.bucket,label:row.bucket}))} label="Category" className="min-w-56"/>}</div>{selected?<><div className="chart-key"><span><i className="key-actual"/>Actual spending</span><span><i className="key-budget"/>Category budget</span></div><ResponsiveContainer width="100%" height={360}><LineChart data={selected.series}><XAxis dataKey="month" tickFormatter={monthLabel}/><YAxis tickFormatter={axisCurrency}/><Tooltip labelFormatter={monthLabel} formatter={(value,name)=>[formatCurrency(value),name==='actual'?'Actual spending':'Category budget']}/><Line type="monotone" dataKey="actual" stroke="#00ff87" strokeWidth={3}/><Line type="monotone" dataKey="target" stroke="#6b7280" strokeWidth={2} strokeDasharray="5 5"/></LineChart></ResponsiveContainer></>:<EmptyAction>No spending or category budgets are available for {year}.</EmptyAction>}</section><aside className="instrument-panel ytd-panel"><div className="eyebrow">Year to date</div><h2>{year} overview</h2><StatRow label="Spending" value={annual.actual}/><StatRow label="Budget" value={annual.target}/><StatRow label={annual.difference>=0?'Remaining':'Over budget'} value={Math.abs(annual.difference)} hot={annual.difference<0}/>{selected&&<div className="ytd-category-context"><span>Selected category</span><strong>{selected.bucket}</strong><small>{selected.target?`${Math.round(selected.actual/selected.target*100)}% of annual target used`:'No saved target'}</small></div>}</aside></div>}
function StatRow({label,value,hot}){return <div className="stat-row"><span>{label}</span><strong className={hot?'text-accent-coral':''}>{formatCurrency(value)}</strong></div>}
function EmptyAction({children}){return <div className="empty-action">{children}</div>}
