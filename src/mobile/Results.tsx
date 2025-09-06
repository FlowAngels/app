import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Props { roomId: string; playerId: string }

export default function Results({ roomId, playerId }: Props) {
  const [ownerAnswerId, setOwnerAnswerId] = useState<string | null>(null)
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({})
  const [correct, setCorrect] = useState<boolean>(false)
  const [myAnswerVotes, setMyAnswerVotes] = useState<number>(0)
  const [position, setPosition] = useState<{ chameleon: number; crowd: number }>({ chameleon: 0, crowd: 0 })

  useEffect(() => {
    const load = async () => {
      const { data: round } = await supabase
        .from('rounds')
        .select('id, results')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      const res: any = round?.results || {}
      setOwnerAnswerId(res.ownerAnswerId || null)
      setVoteCounts(res.voteCounts || {})

      const { data: g } = await supabase
        .from('guesses')
        .select('answer_id')
        .eq('round_id', round?.id)
        .eq('player_id', playerId)
        .maybeSingle()
      setCorrect(!!g && res.ownerAnswerId && g.answer_id === res.ownerAnswerId)

      const { data: mySub } = await supabase
        .from('submissions')
        .select('id')
        .eq('round_id', round?.id)
        .eq('player_id', playerId)
        .maybeSingle()
      const myId = (mySub as any)?.id
      setMyAnswerVotes(myId ? (res.voteCounts?.[myId] || 0) : 0)

      const { data: room } = await supabase
        .from('rooms')
        .select('leaderboards')
        .eq('id', roomId)
        .single()
      const lb: any = (room as any)?.leaderboards || { chameleon: {}, crowd: {} }
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
    return { id: topId, votes: top }
  }, [voteCounts])

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md p-6 rounded-lg shadow">
        <h1 className="text-2xl font-bold mb-4">Round Results</h1>
        <ul className="space-y-2 text-gray-800">
          <li>Your answer received <span className="font-semibold">{myAnswerVotes}</span> votes</li>
          <li>Your guess was <span className={correct ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>{correct ? 'right' : 'wrong'}</span></li>
          <li>Most popular answer: <span className="font-semibold">{mostPopular.id ? `${mostPopular.votes} votes` : '—'}</span></li>
          <li>Your leaderboard: Chameleon <span className="font-semibold">{position.chameleon}</span> • Crowd <span className="font-semibold">{position.crowd}</span></li>
        </ul>
      </div>
    </div>
  )
}
