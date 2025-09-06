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

  const addVote = (id: string) => setVotesState(prev => prev.length < 2 ? [...prev, id] : [prev[0], id])
  const clearVotes = () => setVotesState([])
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
          {items.map(item => {
            const isOwn = ownIds.has(item.id)
            const voteCount = votes.filter(v => v === item.id).length
            const isGuess = guessId === item.id
            return (
              <div key={item.id} className={`w-full p-4 rounded-xl border-2 ${isGuess ? 'border-purple-600 bg-purple-50' : 'border-gray-200 bg-white'}`}>
                <div className="text-gray-800 mb-3">{item.text}</div>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <button
                    disabled={isOwn}
                    onClick={() => selectGuess(item.id)}
                    className={`px-3 py-1 rounded ${isOwn ? 'bg-gray-200 text-gray-400' : isGuess ? 'bg-purple-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                  >
                    {isGuess ? 'Guessed 👤' : 'Guess 👤'}
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={isOwn || votes.length >= 2}
                      onClick={() => addVote(item.id)}
                      className={`px-3 py-1 rounded ${isOwn || votes.length >= 2 ? 'bg-gray-200 text-gray-400' : 'bg-yellow-100 hover:bg-yellow-200'}`}
                    >
                      Vote ★
                    </button>
                    <span className="text-gray-500">{isOwn ? '—' : `${voteCount}★`}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-3 text-center text-xs text-gray-500">Votes left: {Math.max(0, 2 - votes.length)} {votes.length > 0 && (<button onClick={clearVotes} className="ml-2 underline">Clear</button>)}</div>
        <p className="text-xs text-gray-500 mt-3 text-center">Tap Guess (👤) and Vote (★). You can change until time's up.</p>
      </div>
    </div>
  )
}
