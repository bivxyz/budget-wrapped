import { useEffect,useRef,useState } from 'react'
import {Icon} from './IconButton.jsx'
import { postJson } from '../lib/sharedState.js'
import { latestCompletedWeek,shiftDay,weekConfirmation } from '../lib/weekly.js'

const actionStatus=item=>item?.status==='sent'?'sent':item?.status==='queued'?'queued':item?.status==='sending'?'sending':item&&['failed','uncertain'].includes(item.status)?'failed':''

export default function WeeklyTextActions({shared,onChanged}){
  const completedWeek=latestCompletedWeek(),budgetWeek=shiftDay(completedWeek,7)
  const confirmation=weekConfirmation(completedWeek,shared.importCoverage||[],shared.weeklyConfirmations||[])
  const latestBudget=(shared.reminderHistory||[]).find(row=>row.kind==='weekly'&&row.periodKey===budgetWeek)
  const latestSpend=(shared.reminderHistory||[]).find(row=>row.kind==='weekly-spend'&&row.periodKey===completedWeek)
  const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const openPreview=async kind=>{
    setBusy(true);setError('');setNotice('')
    try{const request=kind==='weekly'?{kind,weekStart:budgetWeek,confirmationWeekStart:completedWeek}:{kind,weekStart:completedWeek};const result=await postJson('/api/reminders',{action:'preview',...request});setPreview({...result,request,clientId:crypto.randomUUID()})}catch(reason){setError(reason.message)}finally{setBusy(false)}
  }
  const queue=async()=>{
    setBusy(true);setError('')
    try{await postJson('/api/reminders',{action:'queue',...preview.request,clientId:preview.clientId});setPreview(null);await onChanged();setNotice('iMessage queued for the Mac sender.')}catch(reason){setError(reason.message)}finally{setBusy(false)}
  }
  const retry=async item=>{
    setBusy(true);setError('');setNotice('')
    try{await postJson('/api/reminders',{action:'retry',id:item.id});await onChanged();setNotice('Retry queued for the Mac sender.')}catch(reason){setError(reason.message)}finally{setBusy(false)}
  }
  const run=(kind,item)=>actionStatus(item)==='failed'?retry(item):openPreview(kind)
  const disabled=busy||!shared.available||!confirmation.confirmed
  const lockedHint=confirmation.confirmed?'Preview and send':'Mark last week complete before sending'
  return <div className="header-text-actions">
    <button type="button" className="header-text-action" disabled={disabled} onClick={()=>run('weekly',latestBudget)} title={`${lockedHint} the weekly budget text`} aria-label={`${lockedHint} the weekly budget text`}><Icon name="message" size={18}/><span>Budget text</span><ActionDot status={actionStatus(latestBudget)}/></button>
    <button type="button" className="header-text-action" disabled={disabled} onClick={()=>run('weekly-spend',latestSpend)} title={`${lockedHint} the weekly spending text`} aria-label={`${lockedHint} the weekly spending text`}><Icon name="receipt" size={18}/><span>Spending text</span><ActionDot status={actionStatus(latestSpend)}/></button>
    {(error||notice)&&<div className={`header-action-feedback ${error?'header-action-feedback-error':''}`} role={error?'alert':'status'}>{error||notice}</div>}
    {preview&&<MessageDialog preview={preview} busy={busy} onClose={()=>setPreview(null)} onQueue={queue}/>} 
  </div>
}

function ActionDot({status}){return status?<i className={`header-action-dot header-action-dot-${status}`} aria-hidden="true"/>:null}

function MessageDialog({preview,busy,onClose,onQueue}){const dialog=useRef(null);useEffect(()=>{dialog.current.showModal()},[]);return <dialog ref={dialog} onCancel={event=>{if(busy)event.preventDefault();else onClose()}} className="budget-dialog" aria-labelledby="weekly-message-title"><div className="reminder-preview"><div><div className="eyebrow">iMessage preview</div><h2 id="weekly-message-title">{preview.kind==='weekly'?'Send this week’s budget':'Send last week’s spending'}</h2></div><blockquote>{preview.text}</blockquote>{!preview.canSend&&<p className="panel-warning">Set the missing monthly category budgets before sending.</p>}<div className="reminder-preview-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={busy||!preview.canSend} onClick={onQueue}>{busy?'Queuing…':'Queue iMessage'}</button></div></div></dialog>}
