import { useMemo } from 'react'
import SavingsGoal from './SavingsGoal.jsx'
import WeeklyCheckin from './WeeklyCheckin.jsx'
import { formatCurrency } from '../lib/finance.js'
import { savingsGoalStreak } from '../lib/monthlyHome.js'
import { weeklyLoggingStreak } from '../lib/weekly.js'

const monthLabel=key=>key?new Date(Number(key.slice(0,4)),Number(key.slice(5))-1,1).toLocaleString('en-US',{month:'short'}):''
const weekLabel=key=>new Date(`${key}T12:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})

export default function MonthlyHomeSimple({month,monthly,monthlyHistory,categories,shared,closeout,onSharedChanged,onOpenWeekly,onDirtyChange,discardVersion}){
  const weeklyStreak=useMemo(()=>weeklyLoggingStreak(shared.weeklyConfirmations||[]),[shared.weeklyConfirmations])
  const monthlyStreak=useMemo(()=>savingsGoalStreak(monthlyHistory,shared.savingsSettings||[],shared.monthlyCloseouts||[]),[monthlyHistory,shared.savingsSettings,shared.monthlyCloseouts])
  return <div className="monthly-home monthly-home-simple">
    <SavingsGoal key={`${month}:${discardVersion}`} month={month} monthly={monthly} shared={shared} closed={Boolean(closeout)} onChanged={onSharedChanged} onDirtyChange={onDirtyChange} onOpenWeekly={onOpenWeekly}/>
    <WeeklyCheckin shared={shared} categories={categories} onChanged={onSharedChanged}/>
    <Streaks weekly={weeklyStreak} monthly={monthlyStreak}/>
  </div>
}

function Streaks({weekly,monthly={current:0,best:0,amount:0,recent:[]}}){return <section className="instrument-panel streaks-panel"><div className="streaks-heading"><div><h2>Keep the rhythm</h2><p>Log each week and hit the savings goal each month.</p></div><span aria-hidden="true">🔥</span></div><div className="streaks-grid"><StreakSummary icon="🗓️" label="Weekly check-ins" value={weekly.current?`${weekly.current}-week streak`:'Start this week'} detail={weekly.current?`Best: ${weekly.best} week${weekly.best===1?'':'s'}`:'Complete and sign off a week to begin.'}><div className="streak-strip">{weekly.recent.map(result=><div key={result.weekStart} title={result.status==='logged'?'Week logged':'Not logged'}><small>{weekLabel(result.weekStart)}</small><span className={`streak-dot streak-dot-${result.status==='logged'?'success':'empty'}`}>{result.status==='logged'?'✓':'·'}</span></div>)}</div></StreakSummary><StreakSummary icon="🎯" label="Savings goals" value={monthly.current?`${monthly.current}-month streak`:'Build a monthly streak'} detail={monthly.current?`${formatCurrency(monthly.amount)} above goal across the streak · best ${monthly.best}`:'Close a month at or above its saved goal to begin.'}><div className="streak-strip">{monthly.recent.map(result=><div key={result.month} title={result.status}><small>{monthLabel(result.month)}</small><span className={`streak-dot streak-dot-${result.status==='success'?'success':result.status==='miss'?'miss':'empty'}`}>{result.status==='success'?'✓':result.status==='miss'?'×':'·'}</span></div>)}</div></StreakSummary></div></section>}
function StreakSummary({icon,label,value,detail,children}){return <article className="streak-summary"><div className="streak-summary-copy"><span aria-hidden="true">{icon}</span><div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div></div>{children}</article>}
