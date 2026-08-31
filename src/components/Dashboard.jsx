import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Cell,
} from 'recharts'
import { formatCurrency } from '../lib/finance.js'
import IconButton from './IconButton.jsx'

const GREEN = '#00FF87'
const CORAL = '#FF6B6B'
const SKY = '#00D4FF'
const GRAY = '#3A3F4B'

function SummaryCard({ label, value, accent, sub }) {
  return (
    <div
      className="bg-base-2 rounded-xl p-5 border-l-4"
      style={{ borderColor: accent }}
    >
      <div className="text-white/50 text-sm font-medium">{label}</div>
      <div className="text-2xl sm:text-3xl font-black mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-white/40 text-xs mt-1">{sub}</div>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold mb-4 text-white/80">{title}</h2>
      {children}
    </section>
  )
}

const tooltipStyle = {
  background: '#161922',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  color: '#fff',
}

export default function Dashboard({ data, onReplay }) {
  // ---- Section B: budget vs actual ----
  const budgetData = useMemo(
    () =>
      data.categories
        .filter((c) => c.hasBudget)
        .map((c) => ({
          name: c.bucket,
          budget: c.budget,
          actual: c.actual,
          over: c.status === 'over',
        })),
    [data],
  )

  // ---- Section C: cumulative line ----
  const lineData = data.cumulative

  // ---- Section D: sortable table ----
  const [sort, setSort] = useState({ key: 'actual', dir: 'desc' })
  const sortedCategories = useMemo(() => {
    const rows = [...data.categories]
    const { key, dir } = sort
    rows.sort((a, b) => {
      let av = a[key]
      let bv = b[key]
      if (key === 'bucket') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return dir === 'asc' ? av - bv : bv - av
    })
    return rows
  }, [data, sort])

  const toggleSort = (key) =>
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    )

  // ---- Section E: transaction log ----
  const [query, setQuery] = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const categoriesForFilter = useMemo(
    () => ['All', ...Array.from(new Set(data.transactions.map((t) => t.bucket))).sort()],
    [data],
  )
  const filteredTxns = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.transactions
      .filter((t) => (catFilter === 'All' ? true : t.bucket === catFilter))
      .filter((t) =>
        q ? t.name.toLowerCase().includes(q) || t.bucket.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
  }, [data, query, catFilter])

  const fmtDate = (d) =>
    d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'

  const arrow = (key) =>
    sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="max-w-5xl mx-auto px-5 py-10"
    >
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <div className="text-accent-green text-sm font-bold tracking-[0.25em] uppercase">
            Budget Wrapped
          </div>
          <h1 className="text-3xl font-black">{data.periodLabel} Dashboard</h1>
        </div>
        <IconButton onClick={onReplay} icon="replay" label="Replay Wrapped" />
      </div>

      {/* Section A — summary cards */}
      <Section title="Monthly Summary">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="Total Income" value={formatCurrency(data.income)} accent={GREEN} />
          <SummaryCard label="Total Spent" value={formatCurrency(data.totalSpent)} accent={CORAL} />
          <SummaryCard
            label="Net"
            value={formatCurrency(data.net)}
            accent={data.net >= 0 ? GREEN : CORAL}
            sub={data.net >= 0 ? 'surplus' : 'deficit'}
          />
          <SummaryCard
            label="Top Category"
            value={data.topCategory?.name || '—'}
            accent={SKY}
            sub={data.topCategory ? formatCurrency(data.topCategory.amount) : ''}
          />
        </div>
      </Section>

      {/* Section B — budget vs actual */}
      <Section title="Budget vs. Actual">
        {budgetData.length === 0 ? (
          <div
            className="bg-base-2 rounded-xl p-5 border-l-4 text-white/50 text-sm"
            style={{ borderColor: SKY }}
          >
            This export ({data.provider?.name || 'your source'}) doesn’t include budget
            targets, so there’s nothing to compare against. The category breakdown and
            spending charts below still work — switch to a Rocket Money export to see
            budget tracking.
          </div>
        ) : (
        <div className="bg-base-2 rounded-xl p-4 border-l-4" style={{ borderColor: SKY }}>
          <ResponsiveContainer width="100%" height={budgetData.length * 42 + 20}>
            <BarChart
              data={budgetData}
              layout="vertical"
              margin={{ left: 20, right: 30, top: 5, bottom: 5 }}
              barGap={2}
            >
              <XAxis
                type="number"
                tickFormatter={(v) => `$${v}`}
                stroke="#6b7280"
                fontSize={11}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, n) => [formatCurrency(v, { cents: true }), n]}
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              />
              <Bar dataKey="budget" name="Budget" fill={GRAY} radius={[0, 4, 4, 0]} />
              <Bar dataKey="actual" name="Actual" radius={[0, 4, 4, 0]}>
                {budgetData.map((d) => (
                  <Cell key={d.name} fill={d.over ? CORAL : GREEN} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-5 justify-center text-xs text-white/50 mt-2">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: GRAY }} /> Budget
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: GREEN }} /> Under
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: CORAL }} /> Over
            </span>
          </div>
        </div>
        )}
      </Section>

      {/* Section C — cumulative spend over time */}
      <Section title="Spending Over Time">
        <div className="bg-base-2 rounded-xl p-4 border-l-4" style={{ borderColor: GREEN }}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={lineData} margin={{ left: 10, right: 20, top: 10, bottom: 5 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="day" stroke="#6b7280" fontSize={11} tickLine={false} />
              <YAxis
                tickFormatter={(v) => `$${Math.round(v)}`}
                stroke="#6b7280"
                fontSize={11}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(d) => `Day ${d}`}
                formatter={(v) => [formatCurrency(v, { cents: true }), 'Cumulative']}
              />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke={GREEN}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>

      {/* Section D — category breakdown table */}
      <Section title="Category Breakdown">
        <div className="bg-base-2 rounded-xl overflow-hidden border-l-4" style={{ borderColor: '#A855F7' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-white/50 text-left border-b border-white/10">
                  <Th onClick={() => toggleSort('bucket')}>Category{arrow('bucket')}</Th>
                  <Th onClick={() => toggleSort('budget')} right>Budget{arrow('budget')}</Th>
                  <Th onClick={() => toggleSort('actual')} right>Actual{arrow('actual')}</Th>
                  <Th onClick={() => toggleSort('diff')} right>Difference{arrow('diff')}</Th>
                  <Th right>Status</Th>
                </tr>
              </thead>
              <tbody>
                {sortedCategories.map((c) => (
                  <tr key={c.bucket} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-2.5 font-medium">{c.bucket}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-white/70">
                      {c.hasBudget ? formatCurrency(c.budget) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatCurrency(c.actual)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums"
                      style={{
                        color: !c.hasBudget ? '#9ca3af' : c.diff >= 0 ? GREEN : CORAL,
                      }}
                    >
                      {c.hasBudget ? formatCurrency(c.diff) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <StatusPill status={c.status} trackOnly={c.trackOnly} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* Section E — transaction log */}
      <Section title={`Transaction Log (${filteredTxns.length})`}>
        <div className="flex flex-wrap gap-3 mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search merchant or category…"
            className="flex-1 min-w-[200px] bg-base-2 border border-white/10 rounded-lg px-4 py-2 text-sm outline-none focus:border-accent-sky"
          />
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="bg-base-2 border border-white/10 rounded-lg px-4 py-2 text-sm outline-none focus:border-accent-sky"
          >
            {categoriesForFilter.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="bg-base-2 rounded-xl overflow-hidden border-l-4" style={{ borderColor: SKY }}>
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-base-2">
                <tr className="text-white/50 text-left border-b border-white/10">
                  <th className="px-4 py-2.5 font-semibold">Date</th>
                  <th className="px-4 py-2.5 font-semibold">Merchant</th>
                  <th className="px-4 py-2.5 font-semibold">Category</th>
                  <th className="px-4 py-2.5 font-semibold text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxns.map((t, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                    <td className="px-4 py-2.5 text-white/60 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-4 py-2.5 font-medium">{t.name}</td>
                    <td className="px-4 py-2.5 text-white/60">{t.bucket}</td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums"
                      style={{ color: t.amount < 0 ? GREEN : '#fff' }}
                    >
                      {formatCurrency(t.amount, { cents: true })}
                    </td>
                  </tr>
                ))}
                {!filteredTxns.length && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-white/40">
                      No matching transactions.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <p className="text-center text-white/30 text-xs mt-6">
        All data is processed locally in your browser. Nothing is uploaded.
      </p>
    </motion.div>
  )
}

function Th({ children, onClick, right }) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-2.5 font-semibold select-none ${
        onClick ? 'cursor-pointer hover:text-white' : ''
      } ${right ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}

function StatusPill({ status, trackOnly }) {
  if (trackOnly)
    return <span className="text-white/40 text-xs">track only</span>
  if (status === 'under')
    return (
      <span className="text-accent-green text-xs font-semibold">✓ under</span>
    )
  if (status === 'over')
    return <span className="text-accent-coral text-xs font-semibold">✕ over</span>
  return <span className="text-white/40 text-xs">—</span>
}
