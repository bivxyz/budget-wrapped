import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { motion } from 'framer-motion'

export default function Upload({ onParsed }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const parse = (text, { sample = false } = {}) => {
    const { data, meta } = Papa.parse(text, { header: true, skipEmptyLines: true })
    const headers = (meta.fields || []).filter(Boolean)
    if (!headers.length || !data.length) {
      setError('That file has no readable rows. Is it a CSV export?')
      setLoading(false)
      return
    }
    onParsed({ rows: data, headers, sample })
  }

  const handleFile = (file) => {
    if (!file) return
    if (!/\.csv$/i.test(file.name)) {
      setError('Please upload a .csv file exported from your budget app.')
      return
    }
    setError('')
    setLoading(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        const headers = (meta.fields || []).filter(Boolean)
        if (!headers.length || !data.length) {
          setError('That file has no readable rows. Is it a CSV export?')
          setLoading(false)
          return
        }
        onParsed({ rows: data, headers, sample: false })
      },
      error: () => {
        setError('Failed to read the file.')
        setLoading(false)
      },
    })
  }

  const loadSample = async (path) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(path)
      parse(await res.text(), { sample: true })
    } catch {
      setError('Could not load the sample file.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center max-w-xl w-full"
      >
        <div className="text-sm font-semibold tracking-[0.3em] text-accent-green uppercase mb-4">
          Budget Wrapped
        </div>
        <h1 className="text-5xl sm:text-6xl font-black leading-tight mb-4">
          Your money,
          <br />
          <span className="bg-gradient-to-r from-accent-green via-accent-sky to-accent-purple bg-clip-text text-transparent">
            wrapped.
          </span>
        </h1>
        <p className="text-white/60 text-lg mb-10">
          Drop in a CSV export from any budgeting app — Rocket Money, EveryDollar, your
          bank, or anything else — and get an animated recap plus the full breakdown.
        </p>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            handleFile(e.dataTransfer.files[0])
          }}
          className={`block cursor-pointer rounded-2xl border-2 border-dashed px-8 py-14 transition-colors ${
            dragging
              ? 'border-accent-green bg-accent-green/10'
              : 'border-white/15 hover:border-white/30 bg-base-2'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          <div className="text-4xl mb-3">{loading ? '⏳' : '📂'}</div>
          <div className="font-semibold text-lg">
            {loading ? 'Reading your file…' : 'Drag & drop your CSV here'}
          </div>
          <div className="text-white/40 text-sm mt-1">
            or click to browse · everything stays in your browser
          </div>
        </label>

        {error && <p className="text-accent-coral mt-4 text-sm">{error}</p>}

        <div className="mt-6 text-sm text-white/50">
          No CSV handy? Try a sample:{' '}
          <button
            onClick={() => loadSample('/sample-rocket-money.csv')}
            className="text-accent-sky hover:underline underline-offset-4"
          >
            Rocket Money
          </button>{' '}
          ·{' '}
          <button
            onClick={() => loadSample('/sample-everydollar.csv')}
            className="text-accent-sky hover:underline underline-offset-4"
          >
            EveryDollar
          </button>
        </div>
      </motion.div>
    </div>
  )
}
