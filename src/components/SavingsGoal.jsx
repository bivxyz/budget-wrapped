import { useEffect,useMemo,useState } from 'react'
import { formatCurrency } from '../lib/finance.js'
import { cents,dollars,expectedIncome,incomeSuggestion } from '../lib/weekly.js'
import { postJson } from '../lib/sharedState.js'

const money=value=>formatCurrency(dollars(value),{cents:true})
const labelMonth=key=>new Date(`${key}-01T12:00:00`).toLocaleDateString('en-US',{month:'long',year:'numeric'})
const snapshot=form=>JSON.stringify({income:String(form.income),savings:String(form.savings)})
const predictionCopy=prediction=>prediction?.basis==='prior-plan'?`Carried forward from the saved ${labelMonth(prediction.months[0])} income plan.`:prediction?.basis==='reviewed-complete'?`Median take-home income from reviewed, complete months: ${prediction.months.join(', ')}.`:prediction?.basis==='available-history'?`Estimated from the median imported income in ${prediction.months.join(', ')}. Confirm before saving.`:''

export default function SavingsGoal({month,monthly,shared,closed,onChanged,onDirtyChange,onOpenWeekly}){
  const saved=(shared.savingsSettings||[]).find(row=>row.monthKey===month)
  const suggestion=useMemo(()=>incomeSuggestion(shared.transactions||[],shared.monthlyReviews||[],`${month}-01`,shared.importCoverage||[]),[shared.transactions,shared.monthlyReviews,shared.importCoverage,month])
  const prediction=useMemo(()=>expectedIncome(shared.savingsSettings||[],month,suggestion),[shared.savingsSettings,month,suggestion])
  const initial=useMemo(()=>({income:saved?dollars(saved.income):prediction.amount==null?'':dollars(prediction.amount),savings:saved?dollars(saved.savings):1000}),[saved,prediction.amount])
  const [form,setForm]=useState(initial),[baseline,setBaseline]=useState(saved?snapshot(initial):snapshot({income:'',savings:1000})),[touched,setTouched]=useState(false),[confirmed,setConfirmed]=useState(Boolean(saved)),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  useEffect(()=>{setForm(initial);setBaseline(saved?snapshot(initial):snapshot({income:'',savings:1000}));setTouched(false);setConfirmed(Boolean(saved));setError('');setNotice('')},[month,initial,saved])
  const dirty=snapshot(form)!==baseline
  useEffect(()=>{onDirtyChange?.(dirty&&touched);return()=>onDirtyChange?.(false)},[dirty,touched,onDirtyChange])
  useEffect(()=>{if(!dirty||!touched)return;const warn=event=>{event.preventDefault();event.returnValue=''};addEventListener('beforeunload',warn);return()=>removeEventListener('beforeunload',warn)},[dirty,touched])
  const income=form.income===''?null:cents(form.income),goal=cents(form.savings),spendingCeiling=income==null?null:income-goal,actualSavings=cents(monthly.savingsLoss),closedDifference=closed?actualSavings-goal:null
  const focusedBudgets=(shared.budgets||[]).filter(row=>row.monthKey===month&&['Groceries','Restaurants/Fast Food'].includes(row.bucket)),focusedTotal=cents(focusedBudgets.reduce((sum,row)=>sum+Number(row.target||0),0))
  const update=(key,value)=>{setForm(current=>({...current,[key]:value}));setTouched(true);setNotice('');if(key==='income')setConfirmed(false)}
  const save=async event=>{event.preventDefault();setBusy(true);setError('');setNotice('');try{await postJson('/api/savings-goal',{monthKey:month,income:cents(form.income),savings:goal,incomeConfirmed:confirmed});setBaseline(snapshot(form));setTouched(false);await onChanged();setNotice('Savings goal saved for the family.')}catch(reason){setError(reason.message)}finally{setBusy(false)}}
  return <section className="instrument-panel savings-goal-panel"><div className="savings-goal-heading"><div><h1>{saved?`${money(saved.savings)} savings goal`:'Set a $1,000 savings goal'}</h1><p>{labelMonth(month)} · choose the amount to protect before everyday spending.</p></div><span className="savings-goal-icon" aria-hidden="true">🎯</span></div>
    <div className="savings-goal-grid savings-goal-grid-simple"><div className="savings-goal-hero"><span>{closed?'Saved goal':'Monthly goal'}</span><strong>{formatCurrency(Number(form.savings)||0)}</strong></div><SavingsStat label="Expected income" value={income}/><SavingsStat label="Spending ceiling" value={spendingCeiling} hot={spendingCeiling<0}/><SavingsStat label={closed?'Actual savings / loss':'Saved so far'} value={actualSavings} hot={actualSavings<0}/></div>
    {closed&&saved&&<div className={`savings-capacity ${closedDifference<0?'savings-capacity-warning':''}`}><strong>{closedDifference<0?`${money(-closedDifference)} below goal`:`${money(closedDifference)} above goal`}</strong><span>Final income minus true spending and investment contributions.</span></div>}
    {!closed&&<form onSubmit={save} className="savings-goal-form"><MoneyInput label="Expected monthly take-home income" value={form.income} onChange={value=>update('income',value)}/><MoneyInput label="Monthly savings goal" value={form.savings} onChange={value=>update('savings',value)}/><label className="check-row savings-confirm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>I confirm this expected income for {labelMonth(month)}.</label><button className="primary-button" disabled={busy||!dirty||!confirmed||form.income===''}>{busy?'Saving…':'Save savings goal'}</button></form>}
    <div className="focused-budget-link"><span><strong>Groceries + dining</strong><small>{focusedBudgets.length===2?`${money(focusedTotal)} planned this month`:'Set the two weekly limits you are actively tracking.'}</small></span>{onOpenWeekly&&<button type="button" className="secondary-button" onClick={onOpenWeekly}>Set weekly limits</button>}</div>
    {!saved&&prediction.amount!=null&&<p className="planner-help"><strong>Predicted income: {money(prediction.amount)}.</strong> {predictionCopy(prediction)}</p>}{error&&<p role="alert" className="panel-error">{error}</p>}{notice&&<p role="status" className="panel-success">{notice}</p>}
  </section>
}

function SavingsStat({label,value,hot=false}){return <div className="savings-stat"><span>{label}</span><strong className={hot?'negative':''}>{value==null?'Not confirmed':money(value)}</strong></div>}
function MoneyInput({label,value,onChange}){return <label className="money-input">{label}<input required type="number" min="0" max="10000000" step="0.01" inputMode="decimal" value={value} onFocus={event=>event.target.select()} onChange={event=>onChange(event.target.value)} className="field"/></label>}
