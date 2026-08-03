import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { getProvider, PROVIDERS, SIGN_OPTIONS } from '../lib/providers.js'
import { previewTransactions, formatCurrency } from '../lib/fields.js'

const FIELD_LABELS = {
  date: 'Date',
  merchant: 'Merchant / Description',
  category: 'Category',
  account: 'Account',
  type: 'Type (income/expense)',
}

function Field({ label, value, options, onChange, hint }) {
  return (
    <label className="block">
      <div className="text-white/60 text-xs font-semibold mb-1">{label}</div>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-base border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent-sky"
      >
        <option value="">— none —</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint && <div className="text-white/30 text-[11px] mt-1">{hint}</div>}
    </label>
  )
}

export default function MappingReview({ headers, rows, detected, onConfirm, onCancel }) {
  const [config, setConfig] = useState(() =>
    getProvider(detected.provider.id).makeConfig(headers),
  )

  const setProvider = (id) => setConfig(getProvider(id).makeConfig(headers))
  const setColumn = (field, val) =>
    setConfig((c) => ({ ...c, columns: { ...c.columns, [field]: val } }))
  const setSign = (sign) => setConfig((c) => ({ ...c, sign }))

  const preview = useMemo(() => previewTransactions(rows, config, 6), [rows, config])

  const missingDate = !config.columns.date
  const missingAmount =
    config.sign === 'debit-credit'
      ? !config.columns.debit && !config.columns.credit
      : !config.columns.amount
  const ready = !missingAmount // date is nice-to-have, amount is essential

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto px-5 py-10"
    >
      <div className="text-accent-green text-sm font-bold tracking-[0.25em] uppercase mb-1">
        Budget Wrapped
      </div>
      <h1 className="text-3xl font-black mb-2">Confirm your columns</h1>
      <p className="text-white/50 mb-6">
        We detected <span className="text-white font-semibold">{detected.provider.name}</span>
        {detected.confidence >= 0.7 ? ' with high confidence' : ''}. Map the columns below —
        the preview updates live.
      </p>

      {/* provider preset */}
      <div className="bg-base-2 rounded-xl p-4 mb-4 border-l-4 border-accent-green">
        <div className="text-white/60 text-xs font-semibold mb-2">CSV source</div>
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
                config.providerId === p.id
                  ? 'bg-accent-green text-base'
                  : 'bg-white/10 hover:bg-white/20'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <p className="text-white/40 text-xs mt-2">
          {getProvider(config.providerId).blurb}
        </p>
      </div>

      {/* column mapping */}
      <div className="bg-base-2 rounded-xl p-4 mb-4 border-l-4 border-accent-sky grid sm:grid-cols-2 gap-4">
        <Field
          label={FIELD_LABELS.date}
          value={config.columns.date}
          options={headers}
          onChange={(v) => setColumn('date', v)}
        />
        <Field
          label={FIELD_LABELS.merchant}
          value={config.columns.merchant}
          options={headers}
          onChange={(v) => setColumn('merchant', v)}
        />
        <Field
          label={FIELD_LABELS.category}
          value={config.columns.category}
          options={headers}
          onChange={(v) => setColumn('category', v)}
        />
        <Field
          label={FIELD_LABELS.account}
          value={config.columns.account}
          options={headers}
          onChange={(v) => setColumn('account', v)}
        />

        {/* amount handling */}
        <div className="sm:col-span-2">
          <div className="text-white/60 text-xs font-semibold mb-1">Amount handling</div>
          <select
            value={config.sign}
            onChange={(e) => setSign(e.target.value)}
            className="w-full bg-base border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-accent-sky"
          >
            {SIGN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {config.sign === 'debit-credit' ? (
          <>
            <Field
              label="Debit (money out)"
              value={config.columns.debit}
              options={headers}
              onChange={(v) => setColumn('debit', v)}
            />
            <Field
              label="Credit (money in)"
              value={config.columns.credit}
              options={headers}
              onChange={(v) => setColumn('credit', v)}
            />
          </>
        ) : (
          <Field
            label="Amount"
            value={config.columns.amount}
            options={headers}
            onChange={(v) => setColumn('amount', v)}
          />
        )}

        <Field
          label={FIELD_LABELS.type}
          value={config.columns.type}
          options={headers}
          onChange={(v) => setColumn('type', v)}
          hint="Optional — used to flag income rows."
        />
      </div>

      {/* preview */}
      <div className="bg-base-2 rounded-xl overflow-hidden border-l-4 border-accent-purple mb-4">
        <div className="px-4 py-2 text-white/60 text-xs font-semibold border-b border-white/10">
          Preview (first {preview.length} rows)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-left">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Merchant</th>
                <th className="px-4 py-2 font-medium">Category</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
                <th className="px-4 py-2 font-medium text-right">Flagged</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((t, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="px-4 py-2 text-white/60 whitespace-nowrap">
                    {t.date ? t.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="px-4 py-2">{t.name}</td>
                  <td className="px-4 py-2 text-white/60">{t.bucket || '—'}</td>
                  <td
                    className="px-4 py-2 text-right tabular-nums"
                    style={{ color: t.amount < 0 ? '#00FF87' : '#fff' }}
                  >
                    {formatCurrency(t.amount, { cents: true })}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-white/40">
                    {t.isIncome ? 'income' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {missingAmount && (
        <p className="text-accent-coral text-sm mb-3">
          Pick an Amount column (or Debit/Credit pair) to continue.
        </p>
      )}
      {missingDate && !missingAmount && (
        <p className="text-accent-gold/80 text-sm mb-3">
          No Date column mapped — the timeline chart will be empty, but everything else works.
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => onConfirm(config)}
          disabled={!ready}
          className="px-5 py-2.5 rounded-lg bg-accent-green text-base font-bold disabled:opacity-30 transition"
        >
          Generate my Wrapped →
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 font-semibold transition"
        >
          ← Back
        </button>
      </div>
    </motion.div>
  )
}
