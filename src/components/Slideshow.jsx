import { useEffect, useState, useCallback, cloneElement } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PieChart, Pie, Cell } from 'recharts'
import { CountUpDollar, CountUpInt } from './CountUpNumber.jsx'
import { formatCurrency, PALETTE } from '../lib/finance.js'

const DEFAULT_ADVANCE_MS = 5000
const DETAIL_ADVANCE_MS = 7000
const DETAIL_SLIDES = new Set([4, 8, 9])

// Each slide: a dark base with an accent-colored radial glow + accent text.
const SLIDE_BG = (accent) =>
  `radial-gradient(120% 120% at 50% 0%, ${accent}22 0%, #0F1117 55%, #0B0D12 100%)`

function Slide({ children, accent }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -40 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="absolute inset-0 flex flex-col items-center justify-center text-center px-8"
      style={{ background: SLIDE_BG(accent) }}
    >
      <div className="max-w-2xl w-full">{children}</div>
    </motion.div>
  )
}

const Eyebrow = ({ children, accent }) => (
  <div
    className="text-sm font-bold tracking-[0.3em] uppercase mb-6"
    style={{ color: accent }}
  >
    {children}
  </div>
)

const Caption = ({ children }) => (
  <p className="text-white/60 text-lg mt-6 leading-relaxed">{children}</p>
)

export default function Slideshow({ data, onDone }) {
  const accent = (i) => PALETTE[i % PALETTE.length]

  const slides = [
    // 1 — Title
    (t) => (
      <Slide accent={accent(0)}>
        <Eyebrow accent={accent(0)}>Budget Wrapped</Eyebrow>
        <h1 className="text-6xl sm:text-7xl font-black leading-none">
          {data.periodLabel}
          <br />
          <span style={{ color: accent(0) }}>Wrapped</span>
        </h1>
        <Caption>
          You made{' '}
          <span className="text-white font-bold">
            <CountUpInt value={data.transactionCount} trigger={t} />
          </span>{' '}
          transactions this month. Let’s break it down.
        </Caption>
      </Slide>
    ),
    // 2 — Total Spent
    (t) => (
      <Slide accent={accent(1)}>
        <Eyebrow accent={accent(1)}>Total Spent</Eyebrow>
        <div className="text-7xl sm:text-8xl font-black" style={{ color: accent(1) }}>
          <CountUpDollar value={data.totalSpent} trigger={t} />
        </div>
        <Caption>
          That’s where your money went across every category this month.
          {data.net >= 0 ? (
            <>
              {' '}After expenses and investment contributions, you came out{' '}
              <span className="text-accent-green font-bold">
                {formatCurrency(data.net)} ahead
              </span>
              .
            </>
          ) : (
            <>
              {' '}After expenses and investment contributions, you ran{' '}
              <span className="text-accent-coral font-bold">
                {formatCurrency(Math.abs(data.net))} over
              </span>{' '}
              your income.
            </>
          )}
        </Caption>
      </Slide>
    ),
    // 3 — Top Category
    (t) => {
      const pct = data.totalSpent
        ? Math.round((data.topCategory.amount / data.totalSpent) * 100)
        : 0
      return (
        <Slide accent={accent(2)}>
          <Eyebrow accent={accent(2)}>Your Top Category</Eyebrow>
          <h2 className="text-5xl sm:text-6xl font-black mb-4">
            {data.topCategory?.name}
          </h2>
          <div className="text-6xl font-black" style={{ color: accent(2) }}>
            <CountUpDollar value={data.topCategory?.amount || 0} trigger={t} />
          </div>
          <Caption>
            That’s <span className="text-white font-bold">{pct}%</span> of everything
            you spent this month.
          </Caption>
        </Slide>
      )
    },
    // 4 — Biggest Single Purchase
    (t) => (
      <Slide accent={accent(3)}>
        <Eyebrow accent={accent(3)}>Biggest Single Purchase</Eyebrow>
        <h2 className="text-5xl sm:text-6xl font-black mb-4">
          {data.biggestPurchase?.name || '—'}
        </h2>
        <div className="text-6xl font-black" style={{ color: accent(3) }}>
          <CountUpDollar value={data.biggestPurchase?.amount || 0} trigger={t} />
        </div>
        <Caption>
          Your single largest charge — filed under {data.biggestPurchase?.category}.
        </Caption>
      </Slide>
    ),
    // 5 — Dining Deep Dive
    (t) => (
      <Slide accent={accent(4)}>
        <Eyebrow accent={accent(4)}>Dining Deep Dive</Eyebrow>
        <div className="text-6xl sm:text-7xl font-black" style={{ color: accent(4) }}>
          <CountUpDollar value={data.diningTotal} trigger={t} />
        </div>
        <p className="text-white/60 mt-3 mb-6">on restaurants & drinks</p>
        <div className="space-y-2 max-w-sm mx-auto text-left">
          {data.topRestaurants.length ? (
            data.topRestaurants.map((r, i) => (
              <div
                key={r.name}
                className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3"
              >
                <span className="font-semibold">
                  <span style={{ color: accent(4) }}>#{i + 1}</span> {r.name}
                </span>
                <span className="tabular-nums text-white/80">
                  {formatCurrency(r.amount, { cents: true })}
                </span>
              </div>
            ))
          ) : (
            <p className="text-white/50 text-center">No dining charges this month.</p>
          )}
        </div>
      </Slide>
    ),
    // 6 — Savings Move
    (t) => (
      <Slide accent={accent(0)}>
        <Eyebrow accent={accent(0)}>Savings Move</Eyebrow>
        <div className="text-6xl sm:text-7xl font-black" style={{ color: accent(0) }}>
          <CountUpDollar value={data.savingsMoved} trigger={t} />
        </div>
        <Caption>
          {data.savingsMoved > 0 ? (
            <>
              moved to savings across{' '}
              <span className="text-white font-bold">{data.savingsCount}</span>{' '}
              transfer{data.savingsCount === 1 ? '' : 's'}. Future you says thanks. 🙌
            </>
          ) : (
            <>No savings transfers detected this month.</>
          )}
        </Caption>
      </Slide>
    ),
    // 7 — Investment Pulse
    (t) => (
      <Slide accent={accent(3)}>
        <Eyebrow accent={accent(3)}>Investment Pulse</Eyebrow>
        <div className="text-6xl sm:text-7xl font-black" style={{ color: accent(3) }}>
          <CountUpDollar value={data.investmentTotal} trigger={t} />
        </div>
        <Caption>
          {data.investmentTotal > 0 ? (
            <>
              invested across{' '}
              <span className="text-white font-bold">{data.investmentCount}</span>{' '}
              transaction{data.investmentCount === 1 ? '' : 's'}. Money making money. 📈
            </>
          ) : (
            <>No investment activity detected this month.</>
          )}
        </Caption>
      </Slide>
    ),
    // 8 — Donations
    (t) => (
      <Slide accent={accent(2)}>
        <Eyebrow accent={accent(2)}>Giving Back</Eyebrow>
        <div className="text-6xl sm:text-7xl font-black" style={{ color: accent(2) }}>
          <CountUpDollar value={data.donationsTotal} trigger={t} />
        </div>
        <Caption>
          {data.donationsTotal > 0
            ? 'donated to charity this month. That generosity adds up. ❤️'
            : 'No charitable donations recorded this month.'}
        </Caption>
      </Slide>
    ),
    // 9 — Where Your Money Went (donut)
    () => {
      const pie = data.categories
        .filter((c) => c.actual > 0)
        .map((c) => ({ name: c.bucket, value: c.actual }))
      return (
        <Slide accent={accent(4)}>
          <Eyebrow accent={accent(4)}>Where Your Money Went</Eyebrow>
          <div className="flex flex-col items-center">
            <PieChart width={300} height={300}>
              <Pie
                data={pie}
                dataKey="value"
                nameKey="name"
                innerRadius={80}
                outerRadius={130}
                paddingAngle={2}
                stroke="none"
                isAnimationActive
                animationDuration={900}
              >
                {pie.map((entry, i) => (
                  <Cell key={entry.name} fill={PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
            </PieChart>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-4 max-w-lg text-sm">
              {pie.slice(0, 8).map((e, i) => (
                <span key={e.name} className="flex items-center gap-1.5 text-white/70">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ background: PALETTE[i % PALETTE.length] }}
                  />
                  {e.name}
                </span>
              ))}
            </div>
          </div>
        </Slide>
      )
    },
    // 10 — Budget Report Card (or Top Categories when no budgets are set)
    () => {
      const graded = data.categories.filter((c) => c.hasBudget && !c.trackOnly)
      if (!graded.length) {
        const top = data.categories.filter((c) => c.actual > 0).slice(0, 6)
        return (
          <Slide accent={accent(0)}>
            <Eyebrow accent={accent(0)}>Your Top Categories</Eyebrow>
            <p className="text-white/50 mb-5 text-sm">
              No budget targets in this export — here’s where it all landed.
            </p>
            <div className="space-y-1.5 max-w-md mx-auto text-left max-h-[45vh] overflow-y-auto no-scrollbar">
              {top.map((c, i) => (
                <div
                  key={c.bucket}
                  className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-2.5"
                >
                  <span>
                    <span style={{ color: accent(0) }}>#{i + 1}</span> {c.bucket}
                  </span>
                  <span className="tabular-nums text-white/70 text-sm">
                    {formatCurrency(c.actual)}
                  </span>
                </div>
              ))}
            </div>
          </Slide>
        )
      }
      return (
        <Slide accent={accent(0)}>
          <Eyebrow accent={accent(0)}>Budget Report Card</Eyebrow>
          {Number.isFinite(data.budgetTotal)&&<div className="mb-5 text-center"><div className="text-sm text-white/50">Official monthly limit</div><div className="text-2xl font-black">{formatCurrency(data.budgetTotal)}</div><div className={`text-sm ${data.budgetRemaining<0?'text-accent-coral':'text-accent-green'}`}>{formatCurrency(Math.abs(data.budgetRemaining))} {data.budgetRemaining<0?'over':'remaining'}</div></div>}
          <div className="flex justify-center gap-8 mb-6">
            <div>
              <div className="text-4xl font-black text-accent-green">
                {data.onBudget}
              </div>
              <div className="text-white/50 text-sm">under budget</div>
            </div>
            <div>
              <div className="text-4xl font-black text-accent-coral">
                {data.overBudget}
              </div>
              <div className="text-white/50 text-sm">over budget</div>
            </div>
          </div>
          <div className="space-y-1.5 max-w-md mx-auto text-left max-h-[40vh] overflow-y-auto no-scrollbar">
            {graded.map((c) => (
              <div
                key={c.bucket}
                className="flex items-center justify-between bg-white/5 rounded-lg px-4 py-2.5"
              >
                <span className="flex items-center gap-2">
                  <span className={c.status === 'under' ? 'text-accent-green' : 'text-accent-coral'}>
                    {c.status === 'under' ? '✓' : '✕'}
                  </span>
                  {c.bucket}
                </span>
                <span className="tabular-nums text-white/70 text-sm">
                  {formatCurrency(c.actual)} / {formatCurrency(c.budget)}
                </span>
              </div>
            ))}
          </div>
        </Slide>
      )
    },
  ]

  const [index, setIndex] = useState(0)
  const total = slides.length
  const advanceMs = DETAIL_SLIDES.has(index) ? DETAIL_ADVANCE_MS : DEFAULT_ADVANCE_MS

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= total) {
        onDone()
        return i
      }
      return i + 1
    })
  }, [total, onDone])

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  // auto-advance
  useEffect(() => {
    const timer = setTimeout(next, advanceMs)
    return () => clearTimeout(timer)
  }, [advanceMs, index, next])

  // keyboard controls
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Escape') onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onDone])

  return (
    <div className="fixed inset-0 overflow-hidden select-none">
      {/* progress bars */}
      <div className="absolute top-0 left-0 right-0 z-20 flex gap-1.5 p-4">
        {slides.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full bg-white/20 overflow-hidden">
            <motion.div
              className="h-full bg-white"
              initial={false}
              animate={{ width: i < index ? '100%' : i === index ? '100%' : '0%' }}
              transition={{
                duration: i === index ? advanceMs / 1000 : 0.2,
                ease: 'linear',
              }}
              key={`${i}-${index}`}
            />
          </div>
        ))}
      </div>

      {/* skip */}
      <button
        onClick={onDone}
        className="absolute top-4 right-4 z-30 mt-3 text-sm text-white/60 hover:text-white transition-colors"
      >
        Skip to dashboard →
      </button>

      <AnimatePresence mode="wait">
        {cloneElement(slides[index](index), { key: index })}
      </AnimatePresence>

      {/* click zones for prev/next */}
      <button
        aria-label="Previous"
        onClick={prev}
        className="absolute left-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
      />
      <button
        aria-label="Next"
        onClick={next}
        className="absolute right-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
      />

      {/* explicit controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-6">
        <button
          onClick={prev}
          disabled={index === 0}
          className="text-2xl text-white/60 hover:text-white disabled:opacity-20 transition"
        >
          ‹
        </button>
        <span className="text-white/40 text-sm tabular-nums">
          {index + 1} / {total}
        </span>
        <button onClick={next} className="text-2xl text-white/60 hover:text-white transition">
          ›
        </button>
      </div>
    </div>
  )
}
