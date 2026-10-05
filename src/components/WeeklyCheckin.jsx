import { useEffect,useMemo,useRef,useState } from 'react'
import { formatCurrency } from '../lib/finance.js'
import { normalizeMatchText } from '../lib/reconciliation.js'
import { postJson } from '../lib/sharedState.js'
import { effectiveTransaction } from '../lib/tracker.js'
import { activeTransactions,dateKey,latestCompletedWeek,shiftDay,weekCanBeConfirmed,weekConfirmation } from '../lib/weekly.js'

const prettyDate=value=>new Date(`${value}T12:00:00`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
const shortDate=value=>value.slice(5).replace('-', '/')
export default function WeeklyCheckin({shared,categories,onChanged}){
  const today=dateKey(),latestWeek=latestCompletedWeek(today),[week,setWeek]=useState(latestWeek),end=shiftDay(week,6)
  const [form,setForm]=useState(()=>({date:shiftDay(latestWeek,6),name:'',amount:'',bucket:'Groceries',account:''})),[editing,setEditing]=useState(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirmationBusy,setConfirmationBusy]=useState(false)
  const [categoryFilter,setCategoryFilter]=useState('all')
  const merchantInput=useRef(null)
  const accounts=useMemo(()=>[...new Set((shared.transactions||[]).map(row=>row.account).filter(Boolean))].sort(),[shared.transactions])
  const rows=useMemo(()=>(shared.transactions||[]).filter(row=>row.source==='manual'&&!row.deletedAt&&!row.matchedTxnKey&&row.date>=week&&row.date<=end).sort((left,right)=>left.date.localeCompare(right.date)||String(left.createdAt||'').localeCompare(String(right.createdAt||''))),[shared.transactions,week,end])
  const rowCategories=useMemo(()=>[...new Set(rows.map(row=>row.bucket).filter(Boolean))].sort(),[rows])
  const filteredRows=categoryFilter==='all'?rows:rows.filter(row=>row.bucket===categoryFilter)
  const filteredTotal=filteredRows.reduce((sum,row)=>sum+Number(row.amount||0),0),confirmation=weekConfirmation(week,shared.importCoverage||[],shared.weeklyConfirmations||[]),confirmable=weekCanBeConfirmed(end,today)
  const closedMonths=new Set((shared.monthlyCloseouts||[]).map(row=>row.monthKey)),dateLocked=closedMonths.has(form.date.slice(0,7))

  useEffect(()=>{setEditing(null);setCategoryFilter('all');setForm(current=>({...current,date:end,name:'',amount:''}));setError('');setNotice('')},[week,end])
  useEffect(()=>{if(categoryFilter!=='all'&&!rowCategories.includes(categoryFilter))setCategoryFilter('all')},[categoryFilter,rowCategories])
  const set=(key,value)=>setForm(current=>({...current,[key]:value}))
  const predict=()=>{
    const merchant=normalizeMatchText(form.name)
    if(!merchant)return
    const match=[...activeTransactions(shared.transactions||[])].map(effectiveTransaction).filter(row=>row.flow==='Expense'&&normalizeMatchText(row.name)===merchant).sort((left,right)=>right.date.localeCompare(left.date))[0]
    if(match)setForm(current=>({...current,bucket:match.bucket||current.bucket,account:match.account||current.account}))
  }
  const save=async event=>{
    event.preventDefault();setBusy(true);setError('');setNotice('')
    try{
      await postJson('/api/manual',{...form,amount:Number(form.amount),action:editing?'update':'create',txnKey:editing,clientId:editing?undefined:crypto.randomUUID()})
      setEditing(null);setForm(current=>({...current,name:'',amount:''}));await onChanged();setNotice('Expense saved. The week must be confirmed again after any change.');requestAnimationFrame(()=>merchantInput.current?.focus())
    }catch(reason){setError(reason.message)}finally{setBusy(false)}
  }
  const edit=row=>{setEditing(row.txnKey);setForm({date:row.date,name:row.name,amount:row.amount,bucket:row.bucket,account:row.account||''});setNotice('');setError('')}
  const remove=async row=>{if(!window.confirm(`Delete ${row.name} from ${prettyDate(row.date)}?`))return;setBusy(true);setError('');try{await postJson('/api/manual',{action:'delete',txnKey:row.txnKey});await onChanged();setNotice('Expense deleted. Confirm the week again when it is complete.')}catch(reason){setError(reason.message)}finally{setBusy(false)}}
  const updateConfirmation=async action=>{setConfirmationBusy(true);setError('');try{await postJson('/api/weekly-confirmation',{action,weekStart:week});await onChanged()}catch(reason){setError(reason.message)}finally{setConfirmationBusy(false)}}

  return <section className="instrument-panel weekly-checkin"><div className="panel-titlebar"><div><h2>Weekly expenses</h2><p>{prettyDate(week)}–{prettyDate(end)}</p></div><div className="week-controls"><button type="button" className="secondary-button" aria-label="Previous logging week" onClick={()=>setWeek(value=>shiftDay(value,-7))}>←</button><button type="button" className="secondary-button" disabled={week>=latestWeek} aria-label="Next logging week" onClick={()=>setWeek(value=>shiftDay(value,7))}>→</button></div></div>
    <form className="quick-expense-form" onSubmit={save}><label>Date<input required type="date" min={week} max={end<today?end:today} className="field" value={form.date} onChange={event=>set('date',event.target.value)}/><small>{form.date?prettyDate(form.date):'Choose the purchase day'}</small></label><label>Merchant<input ref={merchantInput} required maxLength="200" autoComplete="off" className="field" value={form.name} onChange={event=>set('name',event.target.value)} onBlur={predict} placeholder="Costco, Target, restaurant…"/><small>&nbsp;</small></label><label>Amount<input required type="number" inputMode="decimal" min="0.01" max="10000000" step="0.01" className="field" value={form.amount} onFocus={event=>event.target.select()} onChange={event=>set('amount',event.target.value)} placeholder="0.00"/><small>&nbsp;</small></label><label>Category<select className="field" value={form.bucket} onChange={event=>set('bucket',event.target.value)}>{[...new Set([...categories,form.bucket])].map(bucket=><option key={bucket}>{bucket}</option>)}</select><small>&nbsp;</small></label><label><span>Account <em className="optional-label">optional</em></span><input list="checkin-accounts" maxLength="200" className="field" value={form.account} onChange={event=>set('account',event.target.value)} placeholder="For matching"/><datalist id="checkin-accounts">{accounts.map(account=><option key={account} value={account}/>)}</datalist><small>{form.account?'Ready for month-end matching':'You can leave this blank'}</small></label><button className="primary-button quick-expense-save" disabled={busy||dateLocked||!shared.available}>{busy?'Saving…':editing?'Save edit':'Add expense'}</button>{editing&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>{setEditing(null);setForm(current=>({...current,name:'',amount:''}));requestAnimationFrame(()=>merchantInput.current?.focus())}}>Cancel</button>}</form>
    {dateLocked&&<p className="panel-warning">That month is closed. Reopen it before adding an expense.</p>}{error&&<p role="alert" className="panel-error">{error}</p>}{notice&&<p role="status" className="panel-success">{notice}</p>}
    {rows.length?<div className="quick-expense-list"><div className="quick-expense-list-head"><strong>{filteredRows.length} expense{filteredRows.length===1?'':'s'}{categoryFilter==='all'?' logged':` in ${categoryFilter}`}</strong><div className="quick-expense-list-controls"><label><span>Category</span><select className="field" value={categoryFilter} onChange={event=>setCategoryFilter(event.target.value)}><option value="all">All categories</option>{rowCategories.map(bucket=><option key={bucket} value={bucket}>{bucket}</option>)}</select></label><strong className="quick-expense-total">{formatCurrency(filteredTotal,{cents:true})}</strong></div></div>{filteredRows.length?<ol>{filteredRows.map(row=><li key={row.txnKey}><span className="quick-expense-date"><strong>{new Date(`${row.date}T12:00:00`).toLocaleDateString('en-US',{weekday:'short'})}</strong><small>{shortDate(row.date)}</small></span><span className="quick-expense-merchant"><strong>{row.name}</strong><small>{row.bucket} · {row.account||'No account'}</small></span><strong>{formatCurrency(row.amount,{cents:true})}</strong><span className="quick-expense-actions"><button type="button" className="quiet-action" onClick={()=>edit(row)}>Edit</button><button type="button" className="quiet-action danger-action" onClick={()=>remove(row)} aria-label={`Delete ${row.name}`}>Delete</button></span></li>)}</ol>:<p className="quick-expense-filter-empty">No {categoryFilter} expenses were logged this week.</p>}</div>:<p className="quick-expense-empty">Nothing logged for this week yet.</p>}
    <div className="weekly-checkin-footer"><div className="week-signoff"><div><strong>{confirmation.confirmed?'Week confirmed':'Confirm after the last purchase'}</strong><small>{confirmation.confirmed?confirmation.source==='csv'?'Covered by the confirmed Rocket Money range.':`${confirmation.confirmedBy||'Family member'} · ${new Date(confirmation.confirmedAt).toLocaleString()}`:'Confirm once, then use the text buttons in the header.'}</small></div>{confirmable&&!confirmation.confirmed&&<button type="button" className="primary-button" disabled={confirmationBusy||!shared.available} onClick={()=>updateConfirmation('confirm')}>{confirmationBusy?'Saving…':'Week is complete'}</button>}{confirmation.source==='sign-off'&&<button type="button" className="secondary-button" disabled={confirmationBusy} onClick={()=>updateConfirmation('reopen')}>Undo confirmation</button>}</div></div>
  </section>
}
