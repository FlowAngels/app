import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { upsertGuess, setVotes } from '../lib/orchestrator'

interface Item { id: string; text: string }
interface GuessVoteProps {
  roomId: string
  playerId: string
  items: Item[]
  voteDeadline?: string
}

export default function GuessVote({ roomId, playerId, items, voteDeadline }: GuessVoteProps) {
  const [roundId, setRoundId] = useState<string>('')
  const [guessId, setGuessId] = useState<string | null>(null)
  const [votes, setVotesState] = useState<string[]>([])
  const [ownIds, setOwnIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('rounds')
        .select('id')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (data) {
        setRoundId(data.id)
        const { data: mine } = await supabase
          .from('submissions')
          .select('id')
          .eq('round_id', data.id)
          .eq('player_id', playerId)
        setOwnIds(new Set((mine || []).map(m => m.id)))
      }
    }
    load()
  }, [roomId])

  const msLeft = useMemo(() => voteDeadline ? Math.max(0, new Date(voteDeadline).getTime() - Date.now()) : 0, [voteDeadline])
  useEffect(() => {
    if (!voteDeadline) return
    const t = setInterval(() => {}, 500)
    return () => clearInterval(t)
  }, [voteDeadline])

  const toggleVote = (id: string) => {
    setVotesState(prev => {
      const next = [...prev]
      // allow duplicates; cap at 2
      if (next.length < 2) next.push(id)
      else next[1] = id
      return next
    })
  }

  const selectGuess = (id: string) => setGuessId(id)

  useEffect(() => {
    const sync = async () => {
      if (!roundId) return
      try {
        if (guessId) await upsertGuess(roundId, playerId, guessId)
        await setVotes(roundId, playerId, votes)
      } catch {}
    }
    sync()
  }, [roundId, playerId, guessId, votes])

  const secondsLeft = Math.ceil(msLeft / 1000)

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto">
        {voteDeadline && (
          <div className="text-center text-sm text-gray-600 mb-3">Time left: {secondsLeft}s</div>
        )}
        <div className="space-y-3">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => toggleVote(item.id)}
              onDoubleClick={() => toggleVote(item.id)}
              onPointerDown={(e) => {
                // long-press detection (~500ms)
                const target = e.currentTarget as any
                target.__lp = setTimeout(() => selectGuess(item.id), 500)
              }}
              onPointerUp={(e) => {
                const target = e.currentTarget as any
                if (target.__lp) clearTimeout(target.__lp)
              }}
              disabled={ownIds.has(item.id)}
              className={`w-full p-4 rounded-xl border-2 text-left ${
                guessId === item.id ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-gray-800">{item.text}</p>
                </div>
                <div className="text-xs text-gray-500 ml-3">
                  {ownIds.has(item.id) ? '—' : `${votes.filter(v => v === item.id).length}★`} {guessId === item.id ? '👤' : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-3 text-center">Double‑tap to vote (2 total). Long‑press to guess the owner. You can change until time’s up.</p>
      </div>
    </div>
  )
}
