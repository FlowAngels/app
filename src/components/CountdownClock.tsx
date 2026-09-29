import { useEffect, useState } from 'react'

export function MobileCountdown({ seconds }: { seconds: number }) {
  const urgent = seconds <= 10
  return (
    <div
      role="timer"
      aria-label={`${seconds} seconds remaining`}
      className={`rounded-full border px-3 py-1.5 text-sm font-black tabular-nums shadow-lg ${urgent ? 'animate-pulse border-rose-300/60 bg-rose-400/20 text-rose-200' : 'border-amber-300/40 bg-slate-900/90 text-amber-300'}`}
    >
      {seconds}s
    </div>
  )
}

export default function CountdownClock({
  deadline,
  totalSeconds,
  label = 'Answer',
}: {
  deadline: string
  totalSeconds: number
  label?: string
}) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  const seconds = Math.ceil(Math.max(0, new Date(deadline).getTime() - now) / 1000)
  const progress = Math.min(1, Math.max(0, seconds / totalSeconds))
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - progress)
  const urgent = seconds <= 10
  const stroke = urgent ? '#fb7185' : '#22d3ee'

  return (
    <div role="timer" aria-label={`${seconds} seconds remaining`} className="relative h-28 w-28 shrink-0 drop-shadow-[0_0_20px_rgba(34,211,238,.25)]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={radius} fill="rgba(2,6,23,.78)" stroke="rgba(255,255,255,.10)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><div className={`text-3xl font-black tabular-nums ${urgent ? 'text-rose-300' : 'text-white'}`}>{seconds}</div><div className="text-[0.58rem] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div></div>
      </div>
    </div>
  )
}
