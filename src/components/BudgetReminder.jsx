import { useEffect, useRef, useState } from 'react'
import { postJson } from '../lib/sharedState.js'

export default function BudgetReminder({ month, shared, closed, onChanged }) {
  const [preview, setPreview] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const latest = (shared.reminderHistory || []).find(row => row.kind === 'cutback' && row.periodKey === month)
  const open = async () => {
    setBusy(true); setError(''); setNotice('')
    try { setPreview(await postJson('/api/reminders', { action: 'preview', kind: 'cutback', monthKey: month })) }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  const queue = async () => {
    setBusy(true); setError('')
    try {
      const result = await postJson('/api/reminders', { action: 'queue', kind: 'cutback', monthKey: month, clientId: crypto.randomUUID() })
      setPreview(null); setNotice(result.item?.status === 'sent' ? 'Budget check already sent.' : 'Budget check queued for the Mac sender.'); await onChanged()
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  const retry = async () => {
    setBusy(true); setError('')
    try { await postJson('/api/reminders', { action: 'retry', id: latest.id }); setNotice('Retry queued for the Mac sender.'); await onChanged() }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <section className="instrument-panel reminder-panel"><div className="eyebrow">Family check-in</div><h2>Send budget check</h2><p>Preview a short message about variable categories that are nearly spent or projected over.</p><button type="button" className="primary-button" disabled={busy||closed||!shared.available} onClick={open}>{busy?'Checking…':'Preview message'}</button>{latest&&<ReminderStatus item={latest} onRetry={retry} busy={busy}/>} {notice&&<p role="status" className="panel-success">{notice}</p>}{error&&<p role="alert" className="panel-error">{error}</p>}{preview&&<ReminderDialog preview={preview} busy={busy} onClose={()=>setPreview(null)} onQueue={queue}/>}</section>
}

function ReminderStatus({ item, onRetry, busy }) {
  const label = item.status === 'sent' ? `Sent ${new Date(item.sentAt).toLocaleString()}` : item.status === 'queued' ? 'Queued for the Mac sender' : item.status === 'sending' ? 'Sending from the Mac' : item.status === 'uncertain' ? 'Delivery uncertain' : 'Send failed'
  return <div className={`reminder-status reminder-status-${item.status}`}><span>{label}</span>{item.failure&&<small>{item.failure}</small>}{['failed','uncertain'].includes(item.status)&&<button type="button" className="quiet-action" disabled={busy} onClick={onRetry}>Retry</button>}</div>
}

function ReminderDialog({ preview, busy, onClose, onQueue }) {
  const dialog = useRef(null)
  useEffect(() => { dialog.current.showModal() }, [])
  return <dialog ref={dialog} onCancel={event=>{if(busy)event.preventDefault();else onClose()}} className="budget-dialog" aria-labelledby="reminder-preview-title"><div className="reminder-preview"><div><div className="eyebrow">Message preview</div><h2 id="reminder-preview-title">Send budget check</h2></div><blockquote>{preview.text}</blockquote>{!preview.canSend&&<p className="panel-success">Nothing is near its limit or projected over right now.</p>}<div className="reminder-preview-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={busy||!preview.canSend} onClick={onQueue}>{busy?'Queuing…':'Queue iMessage'}</button></div></div></dialog>
}
