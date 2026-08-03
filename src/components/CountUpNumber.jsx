import { useCountUp } from '../lib/useCountUp.js'
import { formatCurrency } from '../lib/finance.js'

// Big ticking dollar amount. `trigger` changes -> restarts the animation.
export function CountUpDollar({ value, trigger, className = '', cents = false }) {
  const n = useCountUp(value, { key: trigger })
  return <span className={`tabular-nums ${className}`}>{formatCurrency(n, { cents })}</span>
}

export function CountUpInt({ value, trigger, className = '' }) {
  const n = useCountUp(value, { key: trigger, duration: 1000 })
  return <span className={`tabular-nums ${className}`}>{Math.round(n).toLocaleString()}</span>
}
