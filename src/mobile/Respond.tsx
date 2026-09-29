import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { submitAnswer } from '../lib/orchestrator'
import { parsePrompt } from '../lib/gameState'
import { MobileCountdown } from '../components/CountdownClock'

interface RespondProps {
  roomId: string
  playerId: string
}

export default function Respond({ roomId, playerId }: RespondProps) {
  const [roundId, setRoundId] = useState<string>('')
  const [deadline, setDeadline] = useState<string>('')
  const [text, setText] = useState('')
  const [prompt, setPrompt] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  // Load current round for this room
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('rounds')
        .select('id, deadline, prompt')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (!error && data) {
        setRoundId(data.id)
        setDeadline(data.deadline || '')
        setPrompt(parsePrompt(data.prompt))
        const { data: existingSubmission } = await supabase
          .from('submissions')
          .select('text')
          .eq('round_id', data.id)
          .eq('player_id', playerId)
          .maybeSingle()
        if (existingSubmission) {
          setText(existingSubmission.text)
          setSubmitted(true)
        }
      }
    }
    load()
  }, [playerId, roomId])

  const msLeft = useMemo(() => {
    if (!deadline) return 0
    return Math.max(0, new Date(deadline).getTime() - now)
  }, [deadline, now])

  useEffect(() => {
    if (!deadline) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [deadline])

  const handleSubmit = async () => {
    if (!roundId) return
    setSubmitting(true)
    try {
      console.log('Submitting answer:', { roundId, playerId, text: text.trim() })
      await submitAnswer(roundId, playerId, text)
      console.log('Answer submitted successfully')
      setSubmitted(true)
    } catch (e) {
      console.error('Submit error:', e)
      alert((e as Error).message || 'Failed to submit')
      setSubmitting(false)
    }
  }

  const secondsLeft = Math.ceil(msLeft / 1000)
  const disabled = submitting || submitted || text.trim().length === 0 || text.trim().length > 100

  if (!roundId) {
    return (
      <div className="whatever-stage flex min-h-screen items-center justify-center p-4">
        <div className="eyebrow text-[#8f98a3]">Waiting for the next round…</div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="whatever-stage flex min-h-screen items-center justify-center p-4 text-[#f3efe4]">
        <div className="text-center">
          <div className="mx-auto mb-5 h-3 w-3 rounded-full bg-[#73d8b0] shadow-[0_0_1.5rem_rgba(115,216,176,.65)]" />
          <h1 className="mb-4 text-3xl font-black tracking-[-.04em]">Answer submitted</h1>
          <p className="text-[#8f98a3]">Eyes on the TV. The reveal is next.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="whatever-stage relative flex min-h-screen items-center justify-center p-4 text-[#f3efe4]">
      <div className="absolute right-4 top-4"><MobileCountdown seconds={secondsLeft} /></div>
      <div className="material-panel w-full max-w-md rounded-[2rem] p-6 pt-8">
        <div className="eyebrow text-[#35d8e6]">Your answer</div>
        {prompt && <h1 className="mb-5 mt-3 text-3xl font-black leading-tight tracking-[-.04em]">{prompt}</h1>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={100}
          rows={4}
          className="paper-slip mb-2 w-full resize-none rounded-2xl border-0 p-4 font-semibold leading-relaxed outline-none ring-[#35d8e6] focus:ring-2"
          placeholder="Write the line only you would write…"
        />
        <div className="mb-3 text-xs text-slate-500">{text.length}/100</div>
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="w-full rounded-full bg-[#f24b9d] py-3 font-black text-[#170a12] transition hover:bg-[#ff6aae] disabled:bg-[#252b34] disabled:text-[#69717c]"
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  )
}
