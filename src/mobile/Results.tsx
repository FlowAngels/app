import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { parseLeaderboards, parseRoundResults, playerRank } from '../lib/gameState'
import type { Leaderboards, RoundResults } from '../lib/gameState'
import { getRevealItems } from '../lib/orchestrator'

interface Props { roomId: string; playerId: string }
interface Player { id: string; name: string; avatar: string }

const emptyResults: RoundResults = {
  ownerAnswerId: null,
  correctGuessers: [],
  voteCounts: {},
  ownerSweetSpot: false,
  answerOwners: {},
  roundChameleon: {},
  roundCrowd: {},
}

function winners(scores: Record<string, number>) {
  const highScore = Math.max(0, ...Object.values(scores))
  return highScore > 0
    ? { ids: Object.keys(scores).filter((id) => scores[id] === highScore), points: highScore }
    : { ids: [], points: 0 }
}

export default function Results({ roomId, playerId }: Props) {
  const [results, setResults] = useState<RoundResults>(emptyResults)
  const [leaderboards, setLeaderboards] = useState<Leaderboards>({ chameleon: {}, crowd: {} })
  const [myAnswerVotes, setMyAnswerVotes] = useState(0)
  const [answers, setAnswers] = useState<{ id: string; text: string }[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [ownerId, setOwnerId] = useState('')
  const [roundNumber, setRoundNumber] = useState(0)
  const [gameComplete, setGameComplete] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: round } = await supabase
        .from('rounds')
        .select('id, results, owner_id')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (!round) return
      const parsedResults = parseRoundResults(round.results)
      setResults(parsedResults)
      setOwnerId(round.owner_id || '')
      setAnswers(await getRevealItems(round.id))

      const { data: mySub } = await supabase
        .from('submissions')
        .select('id')
        .eq('round_id', round.id)
        .eq('player_id', playerId)
        .maybeSingle()
      setMyAnswerVotes(mySub?.id ? (parsedResults.voteCounts[mySub.id] || 0) : 0)

      const [{ data: room }, { data: roomPlayers }] = await Promise.all([
        supabase
          .from('rooms')
          .select('leaderboards, round_index, total_rounds')
          .eq('id', roomId)
          .single(),
        supabase
          .from('players')
          .select('id, name, avatar')
          .eq('room_id', roomId),
      ])
      setPlayers(roomPlayers || [])
      setLeaderboards(parseLeaderboards(room?.leaderboards))
      setRoundNumber(room?.round_index || 0)
      setGameComplete(Boolean(room && room.round_index >= room.total_rounds))
    }
    load()
  }, [roomId, playerId])

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  )
  const correct = results.correctGuessers.includes(playerId)
  const owner = playerById.get(ownerId)
  const chameleonWinners = winners(results.roundChameleon)
  const crowdWinners = winners(results.roundCrowd)
  const mostPopular = useMemo(() => {
    const entries = Object.entries(results.voteCounts)
    const top = entries.length > 0 ? Math.max(...entries.map(([, count]) => count)) : 0
    const topIds = entries.filter(([, count]) => count === top).map(([id]) => id)
    return topIds.map((id) => ({
      id,
      votes: results.voteCounts[id],
      text: answers.find((answer) => answer.id === id)?.text || '',
      author: playerById.get(results.answerOwners[id]),
    }))
  }, [answers, playerById, results.answerOwners, results.voteCounts])
  const totalPlayers = Math.max(players.length, 1)
  const chameleonTotal = leaderboards.chameleon[playerId] || 0
  const crowdTotal = leaderboards.crowd[playerId] || 0
  const nameList = (ids: string[]) => ids.map((id) => {
    const player = playerById.get(id)
    return player ? `${player.avatar} ${player.name}` : 'A player'
  }).join(' & ')

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-white">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-fuchsia-400/30 bg-slate-900 shadow-2xl">
        <div className="bg-gradient-to-r from-fuchsia-500/20 to-cyan-500/20 px-6 py-7 text-center">
          <div className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Round {roundNumber} complete</div>
          <h1 className="mt-2 text-3xl font-black">{owner?.avatar} {owner?.name || 'The Round Owner'} revealed</h1>
          <p className={`mt-2 font-bold ${correct ? 'text-emerald-300' : 'text-slate-300'}`}>
            {playerId === ownerId ? (results.ownerSweetSpot ? 'Sweet spot! You earned +3.' : 'You were either too hidden or too obvious.') : correct ? 'You recognised them! +2' : 'They slipped past you.'}
          </p>
        </div>

        <div className="space-y-4 p-5">
          <section>
            <div className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-slate-400">This round</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4">
                <div className="text-xs font-black uppercase tracking-wider text-cyan-300">Chameleon</div>
                <div className="mt-2 font-bold">{chameleonWinners.ids.length ? nameList(chameleonWinners.ids) : 'No points awarded'}</div>
                {chameleonWinners.points > 0 && <div className="mt-1 text-xs text-slate-400">+{chameleonWinners.points} this round</div>}
              </div>
              <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-4">
                <div className="text-xs font-black uppercase tracking-wider text-fuchsia-300">Crowd</div>
                <div className="mt-2 font-bold">{crowdWinners.ids.length ? nameList(crowdWinners.ids) : 'No favourite'}</div>
                {crowdWinners.points > 0 && <div className="mt-1 text-xs text-slate-400">+{crowdWinners.points} this round</div>}
              </div>
            </div>
          </section>

          {mostPopular.length > 0 && <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-5">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">Favourite {mostPopular.length > 1 ? 'answers' : 'answer'}</div>
            {mostPopular.map((answer) => <div key={answer.id} className="mt-3">
              <p className="text-lg font-bold">“{answer.text}”</p>
              <p className="mt-1 text-sm text-slate-400">{answer.author ? `${answer.author.avatar} ${answer.author.name} · ` : ''}{answer.votes} {answer.votes === 1 ? 'vote' : 'votes'}</p>
            </div>)}
          </div>}

          <section>
            <div className="mb-2 text-xs font-black uppercase tracking-[0.22em] text-slate-400">Your standing</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-center">
                <div className="text-3xl font-black text-cyan-300">{chameleonTotal}</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-300">Chameleon points</div>
                <div className="mt-2 text-sm font-black">#{playerRank(leaderboards.chameleon, playerId)} of {totalPlayers}</div>
              </div>
              <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/5 p-4 text-center">
                <div className="text-3xl font-black text-fuchsia-300">{crowdTotal}</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-300">Crowd points</div>
                <div className="mt-2 text-sm font-black">#{playerRank(leaderboards.crowd, playerId)} of {totalPlayers}</div>
              </div>
            </div>
          </section>

          <p className="text-center text-sm text-slate-300">
            Your answer received <span className="font-bold text-white">{myAnswerVotes}</span> {myAnswerVotes === 1 ? 'favourite vote' : 'favourite votes'}.
          </p>
          <p className="text-center text-xs text-slate-500">
            {gameComplete ? 'Watch the shared screen for the two champions.' : 'The next round will begin on the shared screen.'}
          </p>
        </div>
      </div>
    </div>
  )
}
