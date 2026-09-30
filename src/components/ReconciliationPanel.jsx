import { useState } from 'react'
import { matchSuggestions } from '../lib/reconciliation.js'
import { postJson } from '../lib/sharedState.js'
import { formatCurrency } from '../lib/finance.js'

export default function ReconciliationPanel({ shared, month, onChanged }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const rows = shared.transactions || [], history = shared.transactionMatches || [], closed = new Set((shared.monthlyCloseouts || []).map(row => row.monthKey))
  const suggestions = matchSuggestions(rows, history).filter(pair => pair.manual.date.startsWith(month) || pair.imported.date.startsWith(month))
  const matches = history.filter(match => !match.undoneAt && rows.some(row => row.txnKey === match.manualKey && row.date.startsWith(month)))
  const run = async body => { setBusy(true); setError(''); try { await postJson('/api/reconcile', body); await onChanged(); setNotice(body.action === 'undo' ? 'Match undone. Both entries count again.' : 'Matched. This purchase counts once.') } catch (reason) { setError(reason.message) } finally { setBusy(false) } }
  if (!suggestions.length && !matches.length && !error && !notice) return null
  return <section className="mb-5 rounded-xl border border-accent-gold/25 bg-base-2 p-4">
    {suggestions.length > 0 && <><h3 className="font-bold text-accent-gold">Possible duplicate purchases</h3><p className="mb-3 text-sm text-white/55">Both entries count until you confirm a match. Different purchases? Leave them separate.</p>
      <div className="space-y-3">{suggestions.map(({ manual, imported, conflict }) => <div key={`${manual.txnKey}:${imported.txnKey}`} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"><div className="min-w-0 text-sm"><div>Manual: {manual.date} · {manual.name} · {formatCurrency(manual.amount)}</div><div className="text-white/55">Imported: {imported.date} · {imported.name} · {imported.account || 'No account'}</div>{conflict && <div className="text-accent-gold">Imported category correction: {imported.overrideBucket}</div>}</div><button disabled={busy || !shared.available || closed.has(manual.date.slice(0, 7)) || closed.has(imported.date.slice(0, 7))} className="secondary-button" onClick={() => { if (window.confirm(`Count these as one purchase?${conflict ? ` Replace the imported category correction with ${manual.bucket}?` : ''}`)) run({ action: 'link', manualKey: manual.txnKey, importedKey: imported.txnKey, replaceOverride: conflict }) }}>Match purchase</button></div>)}</div></>}
    {matches.length > 0 && <details className="mt-3"><summary className="cursor-pointer font-semibold">Matched purchases ({matches.length})</summary>{matches.map(match => { const row = rows.find(row => row.txnKey === match.manualKey), imported = rows.find(row => row.txnKey === match.importedKey); return <div key={match.id} className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"><span>{row?.date} · {row?.name} · {formatCurrency(row?.amount)} — counted once</span><button disabled={busy || !shared.available || closed.has(row?.date.slice(0, 7)) || closed.has(imported?.date.slice(0, 7))} className="secondary-button" onClick={() => { if (window.confirm('Undo this match? Both records will count toward spending again.')) run({ action: 'undo', id: match.id }) }}>Undo match</button></div> })}</details>}
    {error && <p role="alert" className="mt-2 text-accent-coral">{error}</p>}{notice && <p role="status" className="mt-2 text-accent-green">{notice}</p>}
  </section>
}
