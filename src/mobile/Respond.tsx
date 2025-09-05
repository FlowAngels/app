import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { submitAnswer } from '../lib/orchestrator'

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
        setDeadline(data.deadline)
        const p = (data as any)?.prompt
        if (p && typeof p === 'object' && p.text) setPrompt(p.text)
      }
    }
    load()
  }, [roomId])

  const msLeft = useMemo(() => {
    if (!deadline) return 0
    return Math.max(0, new Date(deadline).getTime() - Date.now())
  }, [deadline])

  useEffect(() => {
    if (!deadline) return
    const t = setInterval(() => {
      // Trigger re-render
      setDeadline((d) => d)
    }, 500)
    return () => clearInterval(t)
  }, [deadline])

  const handleSubmit = async () => {
    if (!roundId) return
    setSubmitting(true)
    try {
      await submitAnswer(roundId, playerId, text)
      setSubmitted(true)
    } catch (e) {
      alert((e as Error).message || 'Failed to submit')
    } finally {
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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-lg shadow w-full max-w-md">
        <h1 className="text-xl font-semibold mb-2">Submit your answer</h1>
        {prompt && <p className="text-sm text-gray-700 mb-2">Prompt: <span className="font-medium">{prompt}</span></p>}
        <p className="text-sm text-gray-500 mb-4">Time left: {secondsLeft}s</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={100}
          rows={4}
          className="w-full border rounded p-3 mb-2"
          placeholder="Type up to 100 characters"
        />
        <div className="text-xs text-gray-500 mb-3">{text.length}/100</div>
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2 rounded"
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      </div>
    </div>
  )
}
