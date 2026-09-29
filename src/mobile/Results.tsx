import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseLeaderboards, parseRoundResults } from '../lib/gameState'
import { getRevealItems } from '../lib/orchestrator'

interface Props { roomId: string; playerId: string }

export default function Results({ roomId, playerId }: Props) {
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})
  const [correct, setCorrect] = useState<boolean>(false)
  const [myAnswerVotes, setMyAnswerVotes] = useState<number>(0)
  const [position, setPosition] = useState<{ chameleon: number; crowd: number }>({ chameleon: 0, crowd: 0 })
  const [answers, setAnswers] = useState<{ id: string; text: string }[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: round } = await supabase
        .from('rounds')
        .select('id, results')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (!round) return
      const res = parseRoundResults(round.results)
      setVoteCounts(res.voteCounts)
      setAnswers(await getRevealItems(round.id))

      const { data: g } = await supabase
        .from('guesses')
        .select('answer_id')
        .eq('round_id', round.id)
        .eq('player_id', playerId)
        .maybeSingle()
      setCorrect(!!g && !!res.ownerAnswerId && g.answer_id === res.ownerAnswerId)

      const { data: mySub } = await supabase
        .from('submissions')
        .select('id')
        .eq('round_id', round.id)
        .eq('player_id', playerId)
        .maybeSingle()
      const myId = mySub?.id
      setMyAnswerVotes(myId ? (res.voteCounts?.[myId] || 0) : 0)

      const { data: room } = await supabase
        .from('rooms')
        .select('leaderboards')
        .eq('id', roomId)
        .single()
      const lb = parseLeaderboards(room?.leaderboards)
      setPosition({ chameleon: lb.chameleon[playerId] || 0, crowd: lb.crowd[playerId] || 0 })
    }
    load()
  }, [roomId, playerId])

  const mostPopular = useMemo(() => {
    let topId: string | null = null
    let top = -1
    Object.entries(voteCounts).forEach(([id, n]) => {
      const v = n as number
      if (v > top) { top = v; topId = id }
    })
    return {
      id: topId,
      votes: top,
      text: answers.find((answer) => answer.id === topId)?.text || '',
    }
  }, [answers, voteCounts])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-fuchsia-400/30 bg-slate-900 shadow-2xl">
        <div className="bg-gradient-to-r from-fuchsia-500/20 to-cyan-500/20 px-6 py-7 text-center">
          <div className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Whatever!</div>
          <h1 className="mt-2 text-3xl font-black">Round results</h1>
          <p className={`mt-2 font-bold ${correct ? 'text-emerald-300' : 'text-slate-300'}`}>
            {correct ? 'You spotted the Round Owner! +2' : 'The Round Owner slipped past you.'}
          </p>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-5">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Crowd favourite</div>
            <p className="mt-2 text-lg font-bold">{mostPopular.text ? `“${mostPopular.text}”` : 'No favourite emerged.'}</p>
            {mostPopular.id && <p className="mt-2 text-sm text-slate-400">{mostPopular.votes} {mostPopular.votes === 1 ? 'vote' : 'votes'}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-center">
              <div className="text-3xl font-black text-cyan-300">{position.chameleon}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-300">Chameleon</div>
            </div>
            <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-4 text-center">
              <div className="text-3xl font-black text-fuchsia-300">{position.crowd}</div>
              <div className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-300">Crowd</div>
            </div>
          </div>

          <p className="text-center text-sm text-slate-300">
            Your answer earned <span className="font-bold text-white">{myAnswerVotes}</span> {myAnswerVotes === 1 ? 'favourite vote' : 'favourite votes'}.
          </p>
          <p className="text-center text-xs text-slate-500">Watch the shared screen for the full standings and next round.</p>
        </div>
      </div>
    </div>
  )
}
