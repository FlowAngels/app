import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { upsertGuess, setVotes } from '../lib/orchestrator'
import { MobileCountdown } from '../components/CountdownClock'

interface Item { id: string; text: string }
interface GuessVoteProps {
  roomId: string
  playerId: string
  items: Item[]
  voteDeadline?: string
}

export default function GuessVote({ roomId, playerId, items, voteDeadline }: GuessVoteProps) {
  const [roundId, setRoundId] = useState<string>('')
  const [ownerId, setOwnerId] = useState<string>('')
  const [guessId, setGuessId] = useState<string | null>(null)
  const [voteId, setVoteId] = useState<string | null>(null)
  const [ownIds, setOwnIds] = useState<Set<string>>(new Set())
  const [step, setStep] = useState<'guess' | 'favourite'>('guess')
  const [now, setNow] = useState(() => Date.now())
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('rounds')
        .select('id, owner_id')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (data) {
        setRoundId(data.id)
        setOwnerId(data.owner_id || '')
        const { data: mine } = await supabase
          .from('submissions')
          .select('id')
          .eq('round_id', data.id)
          .eq('player_id', playerId)
        setOwnIds(new Set((mine || []).map(m => m.id)))

        const [{ data: savedGuess }, { data: savedVote }] = await Promise.all([
          supabase
            .from('guesses')
            .select('answer_id')
            .eq('round_id', data.id)
            .eq('player_id', playerId)
            .maybeSingle(),
          supabase
            .from('votes')
            .select('answer_id')
            .eq('round_id', data.id)
            .eq('player_id', playerId)
            .maybeSingle(),
        ])
        setGuessId(savedGuess?.answer_id || null)
        setVoteId(savedVote?.answer_id || null)
        setStep(data.owner_id === playerId || savedGuess?.answer_id ? 'favourite' : 'guess')
        setHydrated(true)
      }
    }
    load()
  }, [playerId, roomId])

  const msLeft = useMemo(
    () => (voteDeadline ? Math.max(0, new Date(voteDeadline).getTime() - now) : 0),
    [now, voteDeadline],
  )
  useEffect(() => {
    if (!voteDeadline) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [voteDeadline])

  const selectVote = (id: string) => setVoteId(id)
  const clearVote = () => setVoteId(null)
  const selectGuess = (id: string) => setGuessId(id)

  useEffect(() => {
    const sync = async () => {
      if (!roundId || !hydrated) return
      try {
        if (guessId) await upsertGuess(roundId, playerId, guessId)
        await setVotes(roundId, playerId, voteId ? [voteId] : [])
      } catch (error) {
        console.error('Failed to save guess or votes', error)
      }
    }
    sync()
  }, [roundId, playerId, guessId, voteId, hydrated])

  const secondsLeft = Math.ceil(msLeft / 1000)
  const eligibleItems = hydrated ? items.filter((item) => !ownIds.has(item.id)) : []
  const isRoundOwner = ownerId === playerId

  if (!hydrated) {
    return <div className="min-h-screen bg-slate-950 p-6 text-center text-slate-400">Preparing the anonymous answers…</div>
  }

  return (
    <div className="relative min-h-screen bg-slate-950 p-4 text-white">
      {voteDeadline && <div className="absolute right-4 top-4"><MobileCountdown seconds={secondsLeft} /></div>}
      <div className="mx-auto max-w-md pt-12">
        <div className="mb-5 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/5 p-1 text-sm font-black">
          <button
            disabled={isRoundOwner}
            onClick={() => setStep('guess')}
            className={`rounded-xl px-3 py-3 ${step === 'guess' ? 'bg-cyan-400 text-slate-950' : isRoundOwner ? 'text-slate-600' : 'text-slate-400'}`}
          >
            1 · Spot the owner {guessId ? '✓' : ''}
          </button>
          <button
            onClick={() => setStep('favourite')}
            className={`rounded-xl px-3 py-3 ${step === 'favourite' ? 'bg-fuchsia-400 text-slate-950' : 'text-slate-400'}`}
          >
            {isRoundOwner ? '1' : '2'} · Pick a favourite {voteId ? '✓' : ''}
          </button>
        </div>

        <div className="mb-5 text-center">
          <div className={`text-xs font-black uppercase tracking-[0.25em] ${step === 'guess' ? 'text-cyan-300' : 'text-fuchsia-300'}`}>
            {step === 'guess' ? 'Recognition' : 'Crowd vote'}
          </div>
          <h1 className="mt-2 text-3xl font-black">
            {step === 'guess' ? 'Which answer sounds like the Round Owner?' : 'Which answer deserves the spotlight?'}
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {step === 'guess' ? 'Choose one. Your own answer is hidden.' : 'Choose the answer you enjoyed most. Your own answer is hidden.'}
          </p>
        </div>

        <div className="space-y-3">
          {eligibleItems.map((item, index) => {
            const selected = step === 'guess' ? guessId === item.id : voteId === item.id
            return <button
              key={item.id}
              onClick={() => {
                if (step === 'guess') {
                  selectGuess(item.id)
                  setStep('favourite')
                } else selectVote(item.id)
              }}
              className={`w-full rounded-2xl border-2 p-5 text-left transition active:scale-[.99] ${selected ? (step === 'guess' ? 'border-cyan-300 bg-cyan-300/10' : 'border-fuchsia-300 bg-fuchsia-300/10') : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
            >
              <div className="flex gap-3"><span className="font-black text-slate-500">{index + 1}</span><span className="font-semibold leading-snug">{item.text}</span></div>
              {selected && <div className={`mt-3 text-xs font-black uppercase tracking-widest ${step === 'guess' ? 'text-cyan-300' : 'text-fuchsia-300'}`}>{step === 'guess' ? 'Owner guess selected ✓' : 'Favourite selected ★'}</div>}
            </button>
          })}
        </div>

        {step === 'favourite' && voteId && <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
          <span>Saved—you can change it until time runs out.</span>
          <button onClick={clearVote} className="font-bold text-fuchsia-300 underline">Clear</button>
        </div>}
      </div>
    </div>
  )
}
