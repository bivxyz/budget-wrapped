import { useEffect,useMemo,useState } from 'react'
import { cents,dateKey,dollars,monday,recommendWeekly,shiftDay,weeklyBaselines,weeklyFromMonthly,weeklySummary,WEEKLY_CATEGORIES } from '../lib/weekly.js'
import { formatCurrency } from '../lib/finance.js'
import { postJson } from '../lib/sharedState.js'

const money=value=>formatCurrency(dollars(value),{cents:true})
const labelMonth=key=>new Date(`${key}-01T12:00:00`).toLocaleDateString('en-US',{month:'long',year:'numeric'})
const prettyDate=value=>new Date(`${value}T00:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})

export default function WeeklyBudgetSimple({month,shared,onChanged,onDirtyChange}){
  const [week,setWeek]=useState(monday(dateKey()))
  const weekly=weeklySummary(shared.transactions||[],shared.budgets||[],week,{coverage:shared.importCoverage||[],confirmations:shared.weeklyConfirmations||[]})
  return <div className="weekly-workspace weekly-workspace-simple">
    <section className="instrument-panel weekly-main-panel"><div className="panel-titlebar weekly-titlebar"><div><h1>This week</h1><p>{prettyDate(weekly.start)}–{prettyDate(weekly.end)} · allowances reset every Monday</p></div><div className="week-controls"><button className="secondary-button" aria-label="Previous week" onClick={()=>setWeek(shiftDay(week,-7))}>←</button><label><span className="sr-only">Week containing</span><input aria-label="Week containing date" type="date" value={week} onChange={event=>event.target.value&&setWeek(monday(event.target.value))} className="field"/></label><button className="secondary-button" aria-label="Next week" onClick={()=>setWeek(shiftDay(week,7))}>→</button><button className="secondary-button" onClick={()=>setWeek(monday(dateKey()))}>Today</button></div></div><div className="weekly-category-list">{weekly.categories.map((category,index)=><WeeklyCategory key={category.bucket} category={category} icon={index?'🍽️':'🛒'}/>)}</div></section>
    <TargetEditor key={month} month={month} shared={shared} onChanged={onChanged} onDirtyChange={onDirtyChange}/>
  </div>
}

function WeeklyCategory({category,icon}){
  const percentage=category.available==null?0:Math.min(100,Math.max(0,category.spent/category.available*100))
  return <article className="weekly-category-card"><div className="weekly-category-heading"><span aria-hidden="true">{icon}</span><div><h2>{category.bucket==='Restaurants/Fast Food'?'Dining':category.bucket}</h2><p>{category.available==null?'Set a weekly target':`${money(category.spent)} of ${money(category.available)} spent`}</p></div><div className="weekly-category-remaining"><strong className={category.remaining<0?'negative':''}>{category.available==null?'—':money(Math.abs(category.remaining))}</strong><small>{category.available==null?'not set':category.remaining<0?'over this week':'left this week'}</small></div></div>{category.available!=null&&<div className="weekly-card-progress"><span style={{width:`${percentage}%`}} className={category.remaining<0?'budget-progress-over':''}/></div>}<details className="weekly-purchases"><summary>Purchases <span>{category.transactions.length}</span></summary><ul>{category.transactions.map(row=><li key={row.txnKey}><span>{row.date.slice(5)} · {row.name}{row.source==='manual'&&<em>manual</em>}</span><strong>{formatCurrency(row.amount,{cents:true})}</strong></li>)}{!category.transactions.length&&<li className="empty-row">No recorded purchases.</li>}</ul></details></article>
}

function TargetEditor({month,shared,onChanged,onDirtyChange}){
  const saved=(shared.savingsSettings||[]).find(row=>row.monthKey===month),locked=(shared.monthlyCloseouts||[]).some(row=>row.monthKey===month)
  const targets=WEEKLY_CATEGORIES.map(bucket=>(shared.budgets||[]).find(row=>row.monthKey===month&&row.bucket===bucket)?.target)
  const initial=useMemo(()=>({groceries:targets[0]==null?'':dollars(weeklyFromMonthly(cents(targets[0]))),restaurants:targets[1]==null?'':dollars(weeklyFromMonthly(cents(targets[1])))}),[targets[0],targets[1]])
  const [form,setForm]=useState(initial),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const history=useMemo(()=>weeklyBaselines(shared.transactions||[],shared.importCoverage||[],month<dateKey().slice(0,7)?`${month}-01`:dateKey()),[shared.transactions,shared.importCoverage,month])
  const other=(shared.budgets||[]).filter(row=>row.monthKey===month&&!WEEKLY_CATEGORIES.includes(row.bucket)).reduce((sum,row)=>sum+cents(row.target),0)
  const groceryBaseline=history.categories[0].weekly??cents(form.groceries||250),restaurantBaseline=history.categories[1].weekly??cents(form.restaurants||100)
  const recommendation=saved?recommendWeekly({income:saved.income,savings:saved.savings,other,groceries:groceryBaseline,restaurants:restaurantBaseline}):null
  useEffect(()=>{onDirtyChange(dirty);return()=>onDirtyChange(false)},[dirty,onDirtyChange])
  useEffect(()=>{if(!dirty)return;const warn=event=>{event.preventDefault();event.returnValue=''};addEventListener('beforeunload',warn);return()=>removeEventListener('beforeunload',warn)},[dirty])
  const update=(key,value)=>{setForm(current=>({...current,[key]:value}));setDirty(true);setNotice('')}
  const useRecommendation=()=>{setForm({groceries:dollars(recommendation.groceries),restaurants:dollars(recommendation.restaurants)});setDirty(true);setNotice('')}
  const save=async event=>{event.preventDefault();setBusy(true);setError('');setNotice('');try{const result=await postJson('/api/weekly-plan',{monthKey:month,groceriesWeekly:cents(form.groceries),restaurantsWeekly:cents(form.restaurants)});setDirty(false);await onChanged();setNotice(result.affordability.shortfall?`Saved. This plan is ${money(result.affordability.shortfall)} above the savings-first spending limit.`:'Weekly targets saved.')}catch(reason){setError(reason.message)}finally{setBusy(false)}}
  return <aside className="instrument-panel weekly-target-editor"><div><h2>Weekly targets</h2><p>Set groceries and dining once. They reset each Monday.</p></div>{locked&&<p className="panel-warning">This month is closed and cannot be edited.</p>}<form onSubmit={save}><fieldset disabled={locked||busy||!shared.available}><TargetInput icon="🛒" label="Groceries" value={form.groceries} onChange={value=>update('groceries',value)} median={history.categories[0].weekly}/><TargetInput icon="🍽️" label="Dining" value={form.restaurants} onChange={value=>update('restaurants',value)} median={history.categories[1].weekly}/>{recommendation&&<div className="weekly-recommendation"><span>Savings-first suggestion</span><strong>{money(recommendation.groceries)} groceries · {money(recommendation.restaurants)} dining</strong><button type="button" className="quiet-action" onClick={useRecommendation}>Use suggestion</button></div>}{!saved&&<p className="planner-help">Set expected income and a savings goal on Overview to see a recommendation. You can still save these targets now.</p>}<button className="primary-button weekly-target-save" disabled={!dirty||form.groceries===''||form.restaurants===''}>{busy?'Saving…':'Save targets'}</button></fieldset></form>{error&&<p role="alert" className="panel-error">{error}</p>}{notice&&<p role="status" className="panel-success">{notice}</p>}<small className="weekly-target-month">For {labelMonth(month)}</small></aside>
}

function TargetInput({icon,label,value,onChange,median}){return <label className="weekly-target-input"><span><b aria-hidden="true">{icon}</b><strong>{label}</strong></span><input required type="number" min="0" max="10000000" step="0.01" inputMode="decimal" value={value} onFocus={event=>event.target.select()} onChange={event=>onChange(event.target.value)} className="field"/><small>{median==null?'Not enough complete history yet':`${money(median)} recent weekly median`}</small></label>}
