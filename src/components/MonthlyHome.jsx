import { useEffect,useMemo,useState } from 'react'
import { Cell,Pie,PieChart,ResponsiveContainer,Tooltip } from 'recharts'
import BudgetEditor from './BudgetEditor.jsx'
import TrackerUpload from './TrackerUpload.jsx'
import { CountUpDollar } from './CountUpNumber.jsx'
import { formatCurrency,PALETTE } from '../lib/finance.js'
import { budgetRingData,monthlyMood } from '../lib/monthlyHome.js'

const periodLabel=key=>key?new Date(Number(key.slice(0,4)),Number(key.slice(5))-1,1).toLocaleString('en-US',{month:'long',year:'numeric'}):''
const currentMonthKey=()=>{const date=new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`}

export default function MonthlyHome({month,monthly,rows,previous,categories,setting,shared,streak,review,onSharedChanged,onUploaded,onOpenTransactions,onReplay,onDirtyChange,beforeUpload,discardVersion}){
  const hasBudget=monthly.budgetTotal>0&&monthly.pacing.length>0,hasTransactions=rows.length>0,reviewed=Boolean(review?.reviewedAt)
  return <>
    <Workflow month={month} hasBudget={hasBudget} hasTransactions={hasTransactions} reviewed={reviewed} resultReady={hasBudget&&hasTransactions&&reviewed} onBudget={()=>document.getElementById('monthly-budget-builder')?.scrollIntoView({behavior:'smooth'})} onReview={onOpenTransactions} onReplay={onReplay}/>
    <BudgetEditor month={month} current={monthly} previous={previous} categories={categories} setting={setting} onChanged={onSharedChanged} onDirtyChange={onDirtyChange} discardVersion={discardVersion}/>
    <section className="mb-8"><div className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent-green">Step 2 · Add spending</div><TrackerUpload lastUpload={shared.lastUpload} onUploaded={onUploaded} beforeChoose={beforeUpload}/></section>
    <MonthlyStory month={month} monthly={monthly} hasBudget={hasBudget} hasTransactions={hasTransactions}/>
    <StreakCard streak={streak}/>
  </>
}

function Workflow({month,hasBudget,hasTransactions,reviewed,resultReady,onBudget,onReview,onReplay}){
  const steps=[
    {label:'Set budget',detail:hasBudget?'Saved category plan':'Build and save the plan',done:hasBudget,action:onBudget},
    {label:'Upload CSV',detail:hasTransactions?'Spending data available':'Add Rocket Money data',done:hasTransactions},
    {label:'Review transactions',detail:reviewed?'Review complete':'Check categories and flows',done:reviewed,action:onReview},
    {label:'See results',detail:resultReady?'Monthly story is ready':'Complete the steps above',done:resultReady,action:resultReady?onReplay:null},
  ]
  return <section className="mb-8 rounded-xl border border-white/10 bg-base-2 p-5">
    <div className="mb-4"><div className="text-xs font-semibold uppercase tracking-wider text-white/40">Monthly flow</div><h2 className="mt-1 text-xl font-black">{periodLabel(month)}</h2></div>
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{steps.map((step,index)=><li key={step.label}><button type="button" onClick={step.action} disabled={!step.action} className="flex min-h-20 w-full items-center gap-3 rounded-lg border border-white/10 p-3 text-left transition hover:bg-white/5 disabled:cursor-default disabled:hover:bg-transparent"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-black ${step.done?'bg-accent-green text-base':'bg-white/10 text-white/45'}`}>{step.done?'✓':index+1}</span><span><span className="block font-bold">{step.label}</span><span className="block text-xs text-white/40">{step.detail}</span></span></button></li>)}</ol>
  </section>
}

function MonthlyStory({month,monthly,hasBudget,hasTransactions}){
  const reduced=useReducedMotion(),[ready,setReady]=useState(reduced)
  useEffect(()=>{if(reduced){setReady(true);return}setReady(false);const timer=setTimeout(()=>setReady(true),650);return()=>clearTimeout(timer)},[month,reduced])
  if(!ready)return <section className="mb-8 grid min-h-44 place-items-center rounded-xl bg-base-2" role="status"><div className="text-center"><div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-accent-green border-r-transparent"/><div className="font-bold">Calculating your month…</div><div className="text-sm text-white/40">Rebuilding the family budget story</div></div></section>

  const remaining=monthly.budgetRemaining,mood=monthlyMood({month,currentMonth:currentMonthKey(),budgetTotal:monthly.budgetTotal,transactionCount:hasTransactions?1:0,remaining,projectedTotal:monthly.projectedTotal})
  const moodDetail=mood.state==='no-budget'?'Category targets turn spending into a plan.':mood.state==='no-data'?'Upload Rocket Money spending when you are ready.':mood.state==='progress'?'Projected finish: '+formatCurrency(monthly.projectedTotal):mood.state==='under'?formatCurrency(remaining)+' left in the plan.':formatCurrency(Math.abs(remaining))+' over the plan.'

  return <section className="mb-8">
    <div className="mb-4"><div className="text-xs font-semibold uppercase tracking-wider text-accent-green">Step 4 · Understand the month</div><h2 className="mt-1 text-2xl font-black">{periodLabel(month)} at a glance</h2></div>
    <div className="grid gap-4 xl:grid-cols-[minmax(320px,.85fr)_minmax(0,1.15fr)]">
      <div className="rounded-xl bg-base-2 p-5"><div className="flex items-start gap-4"><div className="text-4xl" aria-hidden="true">{mood.emoji}</div><div><h3 className="text-xl font-black">{mood.title}</h3><p className="mt-1 text-sm text-white/45">{moodDetail}</p></div></div><BudgetDonut monthly={monthly}/></div>
      <div className="grid content-start gap-3 sm:grid-cols-2">
        <Metric label="True spending" value={monthly.totalSpent} trigger={month} hot={false}/>
        <Metric label="Monthly budget" value={monthly.budgetTotal} trigger={month} hot={false}/>
        <Metric label="Remaining" value={monthly.budgetRemaining} trigger={month} hot={monthly.budgetRemaining<0}/>
        <Metric label="Projected finish" value={monthly.projectedTotal} trigger={month} hot={monthly.projectedTotal>monthly.budgetTotal}/>
        <Disclosure title="True spending" summary="Top five individual expenses"><Ranked rows={monthly.topExpenses.map(row=>({label:row.name,value:row.amount,detail:row.bucket}))} empty="No qualifying expenses yet."/></Disclosure>
        <Disclosure title="Monthly budget" summary="Top five spending categories"><Ranked rows={monthly.topCategories.map(row=>({label:row.bucket,value:row.amount,detail:row.highestExpense?`Highest: ${row.highestExpense.name} · ${formatCurrency(row.highestExpense.amount)}`:''}))} empty="No category spending yet."/></Disclosure>
        <div className="sm:col-span-2"><Disclosure title="Budget performance" summary="Largest category overages and unused budgets"><div className="grid gap-5 md:grid-cols-2"><Performance title="Most over budget" rows={monthly.budgetPerformance?.over||[]} tone="over"/><Performance title="Most under budget" rows={monthly.budgetPerformance?.under||[]} tone="under"/></div></Disclosure></div>
      </div>
    </div>
  </section>
}

function Metric({label,value,trigger,hot}){return <div className={`rounded-xl border-l-4 bg-base-2 p-5 ${hot?'border-accent-coral':'border-accent-green'}`}><div className="text-sm text-white/45">{label}</div><div className="mt-1 text-2xl font-black"><CountUpDollar value={value} trigger={trigger}/></div></div>}

function BudgetDonut({monthly}){
  const {budget,actual,names}=budgetRingData(monthly),colors=new Map(names.map((name,index)=>[name,PALETTE[index%PALETTE.length]]))
  const outer=budget.length?budget:[{name:'No budget',value:1,empty:true}],inner=actual.length?actual:[{name:'No spending',value:1,empty:true}]
  return <div className="relative mx-auto mt-3 h-72 max-w-md" role="img" aria-label="Outer ring category budgets and inner ring actual category spending">
    <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={outer} dataKey="value" nameKey="name" innerRadius="70%" outerRadius="92%" paddingAngle={2} isAnimationActive={false}>{outer.map(row=><Cell key={row.name} fill={row.empty?'#343946':colors.get(row.name)}/>)}</Pie><Pie data={inner} dataKey="value" nameKey="name" innerRadius="43%" outerRadius="63%" paddingAngle={2} isAnimationActive={false}>{inner.map(row=><Cell key={row.name} fill={row.empty?'#272c36':colors.get(row.name)}/>)}</Pie><Tooltip formatter={(value,name)=>[formatCurrency(value),name]}/></PieChart></ResponsiveContainer>
    <div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="text-center"><div className={`text-xl font-black ${monthly.budgetTotal<=0?'text-white/45':monthly.budgetRemaining<0?'text-accent-coral':'text-accent-green'}`}>{monthly.budgetTotal>0?formatCurrency(Math.abs(monthly.budgetRemaining)):'—'}</div><div className="text-[10px] uppercase tracking-wider text-white/40">{monthly.budgetTotal<=0?'no budget':monthly.budgetRemaining<0?'over budget':'remaining'}</div></div></div>
    <div className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-4 whitespace-nowrap text-[10px] uppercase tracking-wider text-white/40"><span>Outer · budget</span><span>Inner · spending</span></div>
  </div>
}

function Disclosure({title,summary,children}){const [open,setOpen]=useState(false);return <div className="rounded-xl bg-base-2"><button type="button" onClick={()=>setOpen(value=>!value)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 rounded-xl p-5 text-left focus-visible:outline-2 focus-visible:outline-accent-sky"><span><span className="block font-bold">{title}</span><span className="block text-xs text-white/40">{summary}</span></span><span className={`text-white/45 transition-transform ${open?'rotate-180':''}`} aria-hidden="true">⌄</span></button>{open&&<div className="border-t border-white/10 px-5 pb-5 pt-4">{children}</div>}</div>}
function Ranked({rows,empty}){return <ol className="space-y-3">{rows.length?rows.map((row,index)=><li key={`${row.label}-${index}`} className="flex justify-between gap-3"><div className="min-w-0"><div className="truncate"><span className="mr-2 text-white/35">{index+1}.</span>{row.label}</div>{row.detail&&<div className="ml-6 truncate text-xs text-white/40">{row.detail}</div>}</div><span className="shrink-0 font-bold tabular-nums">{formatCurrency(row.value)}</span></li>):<li className="text-sm text-white/35">{empty}</li>}</ol>}
function Performance({title,rows,tone}){const over=tone==='over';return <div><h4 className="mb-3 text-sm font-bold">{title}</h4><ol className="space-y-2">{rows.length?rows.map((row,index)=><li key={row.bucket} className="flex justify-between gap-3 text-sm"><span className="truncate"><span className="mr-2 text-white/30">{index+1}.</span>{row.bucket}</span><span className={`shrink-0 font-bold tabular-nums ${over?'text-accent-coral':'text-accent-green'}`}>{over?'+':'−'}{formatCurrency(row.difference)}</span></li>):<li className="text-white/35">Nothing to show.</li>}</ol></div>}

const streakStatus={success:{mark:'✓',label:'Under budget',tone:'bg-accent-green text-base-1'},miss:{mark:'×',label:'Over budget',tone:'bg-accent-coral text-base-1'},'no-budget':{mark:'—',label:'No saved budget',tone:'bg-accent-gold/20 text-accent-gold'},'no-data':{mark:'·',label:'No imported data',tone:'bg-white/10 text-white/35'}}
function StreakCard({streak={current:0,best:0,amount:0,recent:[]}}){const latest=streak.recent.at(-1),active=streak.current>0,message=active?`Under budget by ${formatCurrency(streak.amount)} during this streak.`:latest?.status==='miss'?`The latest closed month finished ${formatCurrency(Math.abs(latest.difference))} over budget.`:latest?.status==='no-budget'?'Save a category budget for each month to start a streak.':'Complete and import a budgeted month to start your streak.';return <section className="mb-8 rounded-xl border border-orange-400/20 bg-gradient-to-r from-orange-400/10 to-base-2 p-5"><div className="flex flex-wrap items-center justify-between gap-5"><div className="flex min-w-[230px] items-center gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-orange-400/15 text-3xl" aria-hidden="true">🔥</div><div><div className="text-xs font-semibold uppercase tracking-wider text-orange-300">Budget streak</div><h2 className="mt-0.5 text-2xl font-black">{active?`${streak.current}-month streak`:'Start your streak'}</h2><p className="mt-1 text-sm text-white/50">{message}</p>{streak.throughMonth&&<div className="mt-1 text-xs text-white/35">Through {periodLabel(streak.throughMonth)} · Best: {streak.best} {streak.best===1?'month':'months'}</div>}</div></div>{streak.recent.length>0&&<div className="flex gap-2" aria-label="Recent monthly budget results">{streak.recent.map(result=>{const state=streakStatus[result.status];return <div key={result.month} className="text-center"><div className="mb-1 text-[10px] uppercase text-white/35">{periodLabel(result.month).slice(0,3)}</div><div className={`grid h-8 w-8 place-items-center rounded-full text-sm font-black ${state.tone}`} role="img" aria-label={`${periodLabel(result.month)}: ${state.label}`} title={`${periodLabel(result.month)}: ${state.label}`}>{state.mark}</div></div>})}</div>}</div></section>}

function useReducedMotion(){const [reduced,setReduced]=useState(()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);useEffect(()=>{if(typeof matchMedia!=='function')return;const query=matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change)},[]);return reduced}
