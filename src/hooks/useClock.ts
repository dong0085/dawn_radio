import { useEffect, useState } from 'react'

const format = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Wall clock as HH:MM, updated every few seconds. */
export function useClock() {
  const [now, setNow] = useState(() => format(new Date()))
  useEffect(() => {
    const id = setInterval(() => setNow(format(new Date())), 5000)
    return () => clearInterval(id)
  }, [])
  return now
}
