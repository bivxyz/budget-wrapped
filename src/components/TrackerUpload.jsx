import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { buildTransactions } from '../lib/fields.js'
import { getProvider } from '../lib/providers.js'
import { localDateKey } from '../lib/portfolio.js'
import { importedFlow } from '../lib/tracker.js'
import { postJson } from '../lib/sharedState.js'
import IconButton from './IconButton.jsx'

export default function TrackerUpload({ lastUpload, onUploaded, beforeChoose, buttonId, compact=false }) {
  const input = useRef(), [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState(''), [pending, setPending] = useState(null), [coverage, setCoverage] = useState({ from: '', through: '' }), [confirmed, setConfirmed] = useState(false)
  const read = async file => {
    if (!file) return; setError(''); setBusy(true)
    try {
      const parsed = Papa.parse(await file.text(), { header: true, skipEmptyLines: true })
      if (parsed.errors.length) throw new Error(parsed.errors[0].message)
      const config = getProvider('rocket-money').makeConfig(parsed.meta.fields || [])
      const transactions = buildTransactions(parsed.data, config).filter(t => t.date).map(t => { const row = { ...t, date: localDateKey(t.date) }; return { ...row, flow: importedFlow(row) } })
      if (!transactions.length) throw new Error('No transactions found in this CSV.')
      const dates = transactions.map(row => row.date).sort()
      setPending({ fileName: file.name, transactions }); setCoverage({ from: dates[0], through: dates.at(-1) }); setConfirmed(false)
    } catch (reason) { setError(reason.message) } finally { setBusy(false); input.current.value = '' }
  }
  const upload = async e => {
    e.preventDefault(); if (beforeChoose && !beforeChoose()) return; setBusy(true); setError('')
    try {
      const result = await postJson('/api/upload', { ...pending, ...(confirmed ? { coverage } : {}) })
      setNotice(`${result.added} new · ${result.unchanged} refreshed · ${result.matched || 0} manual purchases matched. ${result.reconciliationWarning || ''}`)
      setPending(null); await onUploaded?.(result)
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  return <div className={compact?'instrument-panel tracker-upload tracker-upload-compact':'rounded-xl border border-white/10 bg-base-2 p-4'}><div className="flex flex-wrap items-center gap-4"><div className="min-w-[180px] flex-1"><div className={compact?'eyebrow':'font-bold'}>{compact?'Data source':'Update from Rocket Money'}</div>{compact&&<div className="mt-1 font-bold">Rocket Money upload</div>}<div className="mt-1 text-xs text-white/45">{lastUpload ? `Last upload: ${new Date(lastUpload.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'No uploads yet.'}</div></div><input ref={input} className="hidden" type="file" accept=".csv,text/csv" onChange={e => read(e.target.files[0])}/><IconButton id={buttonId} disabled={busy} busy={busy} onClick={() => { if (!beforeChoose || beforeChoose()) input.current.click() }} icon="upload" label="Upload Rocket Money CSV" tone="primary"/></div>
    {pending && <form onSubmit={upload} className="mt-4 space-y-3 border-t border-white/10 pt-4"><p className="text-sm">{pending.transactions.length} rows ready. Confirm the date range included in your export, including days with no purchases.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Export starts<input type="date" required value={coverage.from} onChange={e => { setCoverage(value => ({ ...value, from: e.target.value })); setConfirmed(false) }} className="field mt-1 block w-full"/></label><label className="text-sm">Export through<input type="date" required min={coverage.from} value={coverage.through} onChange={e => { setCoverage(value => ({ ...value, through: e.target.value })); setConfirmed(false) }} className="field mt-1 block w-full"/></label></div><label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>This CSV includes all accounts and transactions for that range.</label><p className="text-xs text-white/45">Without confirmation, import still works, but these dates won’t establish complete weeks for recommendations.</p><div className="flex gap-2"><button disabled={busy} className="primary-button">{busy ? 'Importing…' : 'Import transactions'}</button><button disabled={busy} type="button" className="secondary-button" onClick={() => setPending(null)}>Cancel</button></div></form>}
    {notice && <div role="status" className="mt-2 text-sm text-accent-green">{notice}</div>}{error && <div role="alert" className="mt-2 text-sm text-accent-coral">{error}</div>}
  </div>
}
