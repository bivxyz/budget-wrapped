import { useState } from 'react'
import Upload from './components/Upload.jsx'
import MappingReview from './components/MappingReview.jsx'
import Slideshow from './components/Slideshow.jsx'
import Dashboard from './components/Dashboard.jsx'
import { analyze } from './lib/finance.js'
import { detectProvider } from './lib/providers.js'

export default function App() {
  const [stage, setStage] = useState('upload') // upload | review | slideshow | dashboard
  const [parsed, setParsed] = useState(null) // { rows, headers }
  const [detected, setDetected] = useState(null)
  const [data, setData] = useState(null)

  const handleParsed = ({ rows, headers, sample }) => {
    const det = detectProvider(headers)
    setParsed({ rows, headers })
    setDetected(det)
    // Known sample CSVs skip straight to the show; real uploads confirm columns first.
    if (sample) {
      const config = det.provider.makeConfig(headers)
      setData(analyze(rows, config))
      setStage('slideshow')
    } else {
      setStage('review')
    }
  }

  const handleConfirm = (config) => {
    setData(analyze(parsed.rows, config))
    setStage('slideshow')
  }

  const reset = () => {
    setData(null)
    setParsed(null)
    setDetected(null)
    setStage('upload')
  }

  return (
    <div className="min-h-full">
      {stage === 'upload' && <Upload onParsed={handleParsed} />}

      {stage === 'review' && parsed && (
        <MappingReview
          headers={parsed.headers}
          rows={parsed.rows}
          detected={detected}
          onConfirm={handleConfirm}
          onCancel={reset}
        />
      )}

      {stage === 'slideshow' && data && (
        <Slideshow data={data} onDone={() => setStage('dashboard')} />
      )}

      {stage === 'dashboard' && data && (
        <Dashboard data={data} onReplay={() => setStage('slideshow')} />
      )}

      {stage === 'dashboard' && (
        <button
          onClick={reset}
          className="fixed bottom-4 right-4 z-30 text-xs text-white/40 hover:text-white/80 transition"
        >
          ← upload another CSV
        </button>
      )}
    </div>
  )
}
