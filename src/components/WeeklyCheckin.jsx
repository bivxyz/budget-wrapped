import { useEffect,useMemo,useRef,useState } from 'react'
import { formatCurrency } from '../lib/finance.js'
import { normalizeMatchText } from '../lib/reconciliation.js'
import { postJson } from '../lib/sharedState.js'
import { effectiveTransaction } from '../lib/tracker.js'
import { activeTransactions,dateKey,monday,shiftDay,weekCanBeConfirmed,weekConfirmation } from '../lib/weekly.js'

const prettyDate=value=>new Date(`${value}T12:00:00`).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
const shortDate=value=>value.slice(5).replace('-', '/')
const defaultCheckinWeek=()=>{const today=dateKey(),day=new Date(`${today}T12:00:00`).getDay();return day===0?monday(today):shiftDay(monday(today),-7)}

export default function WeeklyCheckin({shared,categories,onChanged}){
  const today=dateKey(),latestWeek=defaultCheckinWeek(),[week,setWeek]=useState(latestWeek),end=shiftDay(week,6)
  const [form,setForm]=useState(()=>({date:shiftDay(latestWeek,6),name:'',amount:'',bucket:'Groceries',account:''})),[editing,setEditing]=useState(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[confirmationBusy,setConfirmationBusy]=useState(false)
  const [preview,setPreview]=useState(null),[messageBusy,setMessageBusy]=useState(false),[messageError,setMessageError]=useState('')
  const accounts=useMemo(()=>[...new Set((shared.transactions||[]).map(row=>row.account).filter(Boolean))].sort(),[shared.transactions])
  const rows=useMemo(()=>(shared.transactions||[]).filter(row=>row.source==='manual'&&!row.deletedAt&&!row.matchedTxnKey&&row.date>=week&&row.date<=end).sort((left,right)=>left.date.localeCompare(right.date)||String(left.createdAt||'').localeCompare(String(right.createdAt||''))),[shared.transactions,week,end])
  const total=rows.reduce((sum,row)=>sum+Number(row.amount||0),0),confirmation=weekConfirmation(week,shared.importCoverage||[],shared.weeklyConfirmations||[]),confirmable=weekCanBeConfirmed(end,today)
  const budgetWeek=shiftDay(week,7),latestBudget=(shared.reminderHistory||[]).find(row=>row.kind==='weekly'&&row.periodKey===budgetWeek),latestSpend=(shared.reminderHistory||[]).find(row=>row.kind==='weekly-spend'&&row.periodKey===week)
  const closedMonths=new Set((shared.monthlyCloseouts||[]).map(row=>row.monthKey)),dateLocked=closedMonths.has(form.date.slice(0,7))

  useEffect(()=>{setEditing(null);setForm(current=>({...current,date:end,name:'',amount:''}));setError('');setNotice('')},[week,end])
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
      setEditing(null);setForm(current=>({...current,name:'',amount:''}));await onChanged();setNotice('Expense saved. The week must be confirmed again after any change.')
    }catch(reason){setError(reason.message)}finally{setBusy(false)}
  }
  const edit=row=>{setEditing(row.txnKey);setForm({date:row.date,name:row.name,amount:row.amount,bucket:row.bucket,account:row.account||''});setNotice('');setError('')}
  const remove=async row=>{if(!window.confirm(`Delete ${row.name} from ${prettyDate(row.date)}?`))return;setBusy(true);setError('');try{await postJson('/api/manual',{action:'delete',txnKey:row.txnKey});await onChanged();setNotice('Expense deleted. Confirm the week again when it is complete.')}catch(reason){setError(reason.message)}finally{setBusy(false)}}
  const updateConfirmation=async action=>{setConfirmationBusy(true);setError('');try{await postJson('/api/weekly-confirmation',{action,weekStart:week});await onChanged()}catch(reason){setError(reason.message)}finally{setConfirmationBusy(false)}}
  const openPreview=async kind=>{
    setMessageBusy(true);setMessageError('')
    try{const request=kind==='weekly'?{kind,weekStart:budgetWeek,confirmationWeekStart:week}:{kind,weekStart:week};const result=await postJson('/api/reminders',{action:'preview',...request});setPreview({...result,request,clientId:crypto.randomUUID()})}catch(reason){setMessageError(reason.message)}finally{setMessageBusy(false)}
  }
  const queue=async()=>{
    setMessageBusy(true);setMessageError('')
    try{await postJson('/api/reminders',{action:'queue',...preview.request,clientId:preview.clientId});setPreview(null);await onChanged();setNotice('iMessage queued for the Mac sender.')}catch(reason){setMessageError(reason.message)}finally{setMessageBusy(false)}
  }
  const retry=async item=>{setMessageBusy(true);setMessageError('');try{await postJson('/api/reminders',{action:'retry',id:item.id});await onChanged();setNotice('Retry queued for the Mac sender.')}catch(reason){setMessageError(reason.message)}finally{setMessageBusy(false)}}

  return <section className="instrument-panel weekly-checkin"><div className="panel-titlebar"><div><h2>Weekly expenses</h2><p>{prettyDate(week)}–{prettyDate(end)}</p></div><div className="week-controls"><button type="button" className="secondary-button" aria-label="Previous logging week" onClick={()=>setWeek(value=>shiftDay(value,-7))}>←</button><button type="button" className="secondary-button" disabled={week>=latestWeek} aria-label="Next logging week" onClick={()=>setWeek(value=>shiftDay(value,7))}>→</button></div></div>
    <form className="quick-expense-form" onSubmit={save}><label>Date<input required type="date" min={week} max={end<today?end:today} className="field" value={form.date} onChange={event=>set('date',event.target.value)}/><small>{form.date?prettyDate(form.date):'Choose the purchase day'}</small></label><label>Merchant<input required maxLength="200" autoComplete="off" className="field" value={form.name} onChange={event=>set('name',event.target.value)} onBlur={predict} placeholder="Costco, Target, restaurant…"/><small>&nbsp;</small></label><label>Amount<input required type="number" inputMode="decimal" min="0.01" max="10000000" step="0.01" className="field" value={form.amount} onFocus={event=>event.target.select()} onChange={event=>set('amount',event.target.value)} placeholder="0.00"/><small>&nbsp;</small></label><label>Category<select className="field" value={form.bucket} onChange={event=>set('bucket',event.target.value)}>{[...new Set([...categories,form.bucket])].map(bucket=><option key={bucket}>{bucket}</option>)}</select><small>&nbsp;</small></label><label><span>Account <em className="optional-label">optional</em></span><input list="checkin-accounts" maxLength="200" className="field" value={form.account} onChange={event=>set('account',event.target.value)} placeholder="For matching"/><datalist id="checkin-accounts">{accounts.map(account=><option key={account} value={account}/>)}</datalist><small>{form.account?'Ready for month-end matching':'You can leave this blank'}</small></label><button className="primary-button quick-expense-save" disabled={busy||dateLocked||!shared.available}>{busy?'Saving…':editing?'Save edit':'Add expense'}</button>{editing&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>{setEditing(null);setForm(current=>({...current,name:'',amount:''}))}}>Cancel</button>}</form>
    {dateLocked&&<p className="panel-warning">That month is closed. Reopen it before adding an expense.</p>}{error&&<p role="alert" className="panel-error">{error}</p>}{notice&&<p role="status" className="panel-success">{notice}</p>}
    {rows.length?<div className="quick-expense-list"><div className="quick-expense-list-head"><strong>{rows.length} expense{rows.length===1?'':'s'} logged</strong><span>{formatCurrency(total,{cents:true})}</span></div><ol>{rows.map(row=><li key={row.txnKey}><span className="quick-expense-date"><strong>{new Date(`${row.date}T12:00:00`).toLocaleDateString('en-US',{weekday:'short'})}</strong><small>{shortDate(row.date)}</small></span><span className="quick-expense-merchant"><strong>{row.name}</strong><small>{row.bucket} · {row.account||'No account'}</small></span><strong>{formatCurrency(row.amount,{cents:true})}</strong><span className="quick-expense-actions"><button type="button" className="quiet-action" onClick={()=>edit(row)}>Edit</button><button type="button" className="quiet-action danger-action" onClick={()=>remove(row)} aria-label={`Delete ${row.name}`}>Delete</button></span></li>)}</ol></div>:<p className="quick-expense-empty">Nothing logged for this week yet.</p>}
    <div className="weekly-checkin-footer"><div className="week-signoff"><div><strong>{confirmation.confirmed?'Week confirmed':'Confirm after the last purchase'}</strong><small>{confirmation.confirmed?confirmation.source==='csv'?'Covered by the confirmed Rocket Money range.':`${confirmation.confirmedBy||'Family member'} · ${new Date(confirmation.confirmedAt).toLocaleString()}`:'Sending is locked until the week is complete.'}</small></div>{confirmable&&!confirmation.confirmed&&<button type="button" className="primary-button" disabled={confirmationBusy||!shared.available} onClick={()=>updateConfirmation('confirm')}>{confirmationBusy?'Saving…':'Week is complete'}</button>}{confirmation.source==='sign-off'&&<button type="button" className="secondary-button" disabled={confirmationBusy} onClick={()=>updateConfirmation('reopen')}>Undo confirmation</button>}</div>
      <div className="weekly-message-actions"><MessageAction title="Send next week’s budget" detail={`${shortDate(budgetWeek)}–${shortDate(shiftDay(budgetWeek,6))}`} item={latestBudget} disabled={!confirmation.confirmed||messageBusy} onPreview={()=>openPreview('weekly')} onRetry={()=>retry(latestBudget)}/><MessageAction title="Send spending recap" detail={`${shortDate(week)}–${shortDate(end)}`} item={latestSpend} disabled={!confirmation.confirmed||messageBusy} onPreview={()=>openPreview('weekly-spend')} onRetry={()=>retry(latestSpend)}/></div>{messageError&&<p role="alert" className="panel-error">{messageError}</p>}</div>
    {preview&&<MessageDialog preview={preview} busy={messageBusy} onClose={()=>setPreview(null)} onQueue={queue}/>} 
  </section>
}

function MessageAction({title,detail,item,disabled,onPreview,onRetry}){const failed=item&&['failed','uncertain'].includes(item.status),status=item?.status==='sent'?`Sent ${new Date(item.sentAt).toLocaleString()}`:item?.status==='queued'?'Queued for Mac':item?.status==='sending'?'Sending…':failed?'Delivery needs attention':null;return <article className="weekly-message-action"><div><strong>{title}</strong><small>{detail}{status?` · ${status}`:''}</small></div>{failed?<button type="button" className="secondary-button" onClick={onRetry}>Retry</button>:<button type="button" className="secondary-button" disabled={disabled} onClick={onPreview}>Preview & send</button>}</article>}

function MessageDialog({preview,busy,onClose,onQueue}){const dialog=useRef(null);useEffect(()=>{dialog.current.showModal()},[]);return <dialog ref={dialog} onCancel={event=>{if(busy)event.preventDefault();else onClose()}} className="budget-dialog" aria-labelledby="weekly-message-title"><div className="reminder-preview"><div><div className="eyebrow">iMessage preview</div><h2 id="weekly-message-title">{preview.kind==='weekly'?'Send this week’s budget':'Send last week’s spending'}</h2></div><blockquote>{preview.text}</blockquote>{!preview.canSend&&<p className="panel-warning">Set the missing monthly category budgets before sending.</p>}<div className="reminder-preview-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={busy||!preview.canSend} onClick={onQueue}>{busy?'Queuing…':'Queue iMessage'}</button></div></div></dialog>}
