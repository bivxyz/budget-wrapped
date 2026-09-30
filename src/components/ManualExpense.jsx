import { useEffect, useRef, useState } from 'react'
import { postJson } from '../lib/sharedState.js'
import { dateKey } from '../lib/weekly.js'

export default function ManualExpense({ row, categories, accounts, onClose, onSaved }) {
  const dialog = useRef(null), clientId = useRef(crypto.randomUUID())
  const [form, setForm] = useState({ date: row?.date || dateKey(), name: row?.name || '', amount: row?.amount ?? '', bucket: row?.bucket || 'Groceries', account: row?.account || '' })
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { dialog.current.showModal() }, [])
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const save = async event => {
    event.preventDefault(); setBusy(true); setError('')
    try { await postJson('/api/manual', { ...form, amount: Number(form.amount), clientId: clientId.current, txnKey: row?.txnKey, action: row ? 'update' : 'create' }); await onSaved(); onClose() }
    catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else onClose() }} className="budget-dialog" aria-labelledby="expense-title">
    <form onSubmit={save} className="space-y-4"><h2 id="expense-title" className="text-xl font-black">{row ? 'Edit expense' : 'Add expense'}</h2>
      <p className="text-sm text-white/55">Saved for the family immediately. Rocket Money uploads can match this purchase later.</p>
      <label className="block">Date<input required type="date" className="field mt-1 block w-full" value={form.date} onChange={e => set('date', e.target.value)}/></label>
      <label className="block">Merchant<input autoFocus required maxLength={200} className="field mt-1 block w-full" value={form.name} onChange={e => set('name', e.target.value)}/></label>
      <label className="block">Amount ($)<input required type="number" inputMode="decimal" min="0.01" max="10000000" step="0.01" className="field mt-1 block w-full" value={form.amount} onFocus={e => e.target.select()} onChange={e => set('amount', e.target.value)}/></label>
      <label className="block">Category<select aria-label="Expense category" value={form.bucket} onChange={e=>set('bucket',e.target.value)} className="field mt-1 w-full" style={{colorScheme:'dark'}}>{[...new Set([...categories,form.bucket])].map(bucket=><option key={bucket} value={bucket}>{bucket}</option>)}</select></label>
      <label className="block">Account<input aria-label="Account" aria-describedby="account-help" list="expense-accounts" maxLength={200} className="field mt-1 block w-full" value={form.account} onChange={e => set('account', e.target.value)}/><datalist id="expense-accounts">{accounts.map(account => <option key={account} value={account}/>)}</datalist><span id="account-help" className="text-xs text-white/45">Use the Rocket Money account name for automatic matching.</span></label>
      {error && <p role="alert" className="text-accent-coral">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button></div>
    </form>
  </dialog>
}
