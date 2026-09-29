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
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="text-center text-gray-700">Waiting for round...</div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-600 mb-4">Answer submitted!</h1>
          <p className="text-gray-600">Waiting for reveal...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-slate-950 flex items-center justify-center p-4 text-white">
      <div className="absolute right-4 top-4"><MobileCountdown seconds={secondsLeft} /></div>
      <div className="w-full max-w-md rounded-3xl border border-cyan-400/20 bg-slate-900 p-6 pt-8 shadow-2xl">
        <h1 className="text-xl font-semibold mb-2">Submit your answer</h1>
        {prompt && <p className="mb-4 text-sm text-slate-300">Prompt: <span className="font-medium text-white">{prompt}</span></p>}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={100}
          rows={4}
          className="mb-2 w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-white"
          placeholder="Type up to 100 characters"
        />
        <div className="mb-3 text-xs text-slate-500">{text.length}/100</div>
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="w-full rounded-xl bg-fuchsia-600 py-3 font-bold text-white hover:bg-fuchsia-500 disabled:bg-slate-700 disabled:text-slate-400"
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  )
}
