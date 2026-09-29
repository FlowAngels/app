import { useEffect, useMemo, useState } from 'react'
import { DEMO_PHASES, type DemoPhase } from './demoPhases'

const players = [
  { name: 'Ali', avatar: '🔵', answer: 'replace every meeting with competitive karaoke' },
  { name: 'Erika', avatar: '🟢', answer: 'issue every resident a ceremonial traffic cone' },
  { name: 'Tim', avatar: '🟡', answer: 'put the mayor on a strict snack schedule' },
]

const phaseLabels: Record<DemoPhase, string> = {
  lobby: 'Lobby',
  prompt: 'Round ready',
  answering: 'Answering',
  reveal: 'Reveal',
  voting: 'Guess + favourite',
  results: 'Round results',
  champions: 'Final champions',
}

function Phone({ playerIndex, phase }: { playerIndex: number; phase: DemoPhase }) {
  const player = players[playerIndex]
  const ownerIndex = 1
  const chosenGuess = playerIndex === 0 ? 1 : 2
  const chosenVote = (playerIndex + 1) % players.length

  return (
    <div className="mx-auto min-h-[29rem] w-full max-w-[16rem] overflow-hidden rounded-[2rem] border-[5px] border-slate-800 bg-slate-950 text-white shadow-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-xs text-slate-400">
        <span>{player.avatar} {player.name}</span><span>Room DEMO</span>
      </div>
      <div className="p-4">
        {phase === 'lobby' && <>
          <div className="text-xs font-black uppercase tracking-widest text-cyan-300">You are in</div>
          <h3 className="mt-3 text-2xl font-black">Ready to play?</h3>
          <p className="mt-3 text-sm text-slate-300">The host will start when everyone has joined.</p>
          <div className="mt-8 rounded-xl bg-emerald-400/10 p-4 text-center text-emerald-300">Headline Hijack ✓</div>
        </>}
        {phase === 'prompt' && <>
          <div className="text-xs font-black uppercase tracking-widest text-amber-300">Round 1 of 6</div>
          <h3 className="mt-4 text-2xl font-black">Get ready</h3>
          <p className="mt-3 text-sm text-slate-300">Complete the headline in your own voice.</p>
          <div className="mt-8 animate-pulse text-center text-5xl">3</div>
        </>}
        {phase === 'answering' && <>
          <div className="text-xs font-black uppercase tracking-widest text-cyan-300">Headline Hijack · 42s</div>
          <p className="mt-4 text-lg font-bold">Mayor announces plan to ____ by Friday.</p>
          <div className="mt-5 min-h-28 rounded-xl border border-cyan-400/30 bg-white/5 p-3 text-sm">{player.answer}</div>
          <div className="mt-2 text-right text-xs text-slate-500">{player.answer.length}/100</div>
          <button className="mt-4 w-full rounded-xl bg-fuchsia-500/30 py-3 font-black text-fuchsia-100">Submitted ✓</button>
        </>}
        {(phase === 'reveal' || phase === 'voting') && <>
          <div className="text-xs font-black uppercase tracking-widest text-fuchsia-300">Find Erika · choose a favourite</div>
          <div className="mt-4 space-y-3">
            {players.map((answerPlayer, index) => {
              const own = index === playerIndex
              return <div key={answerPlayer.name} className={`rounded-xl border p-3 text-sm ${phase === 'voting' && chosenGuess === index ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 bg-white/5'}`}>
                <p>{answerPlayer.answer}</p>
                {phase === 'voting' && <div className="mt-3 flex gap-2 text-[0.65rem] font-bold">
                  <span className={chosenGuess === index ? 'text-cyan-300' : 'text-slate-500'}>{own ? 'YOUR ANSWER' : chosenGuess === index ? 'OWNER? ✓' : 'OWNER?'}</span>
                  {!own && <span className={chosenVote === index ? 'text-amber-300' : 'text-slate-500'}>{chosenVote === index ? '★ FAVOURITE' : '☆ FAVOURITE'}</span>}
                </div>}
              </div>
            })}
          </div>
        </>}
        {phase === 'results' && <>
          <div className="text-xs font-black uppercase tracking-widest text-amber-300">Round results</div>
          <h3 className="mt-3 text-2xl font-black">{chosenGuess === ownerIndex ? 'You spotted Erika! +2' : 'Erika slipped past you.'}</h3>
          <div className="mt-6 grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-cyan-400/10 p-3"><b className="text-2xl text-cyan-300">{playerIndex === 0 ? 2 : 0}</b><div className="text-[0.65rem] uppercase">Chameleon</div></div>
            <div className="rounded-xl bg-fuchsia-400/10 p-3"><b className="text-2xl text-fuchsia-300">1</b><div className="text-[0.65rem] uppercase">Crowd</div></div>
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">Watch the shared screen for the full story.</p>
        </>}
        {phase === 'champions' && <>
          <div className="text-xs font-black uppercase tracking-widest text-amber-300">Game complete</div>
          <h3 className="mt-4 text-2xl font-black">Thanks for playing!</h3>
          <p className="mt-4 text-sm text-slate-300">The champions are being crowned on the shared screen.</p>
          <div className="mt-10 text-center text-6xl">🏆</div>
        </>}
      </div>
    </div>
  )
}

function TvBoard({ phase }: { phase: DemoPhase }) {
  const answers = useMemo(() => [...players].sort((a, b) => a.answer.localeCompare(b.answer)), [])
  return (
    <div className="aspect-video w-full overflow-hidden rounded-2xl border border-cyan-400/25 bg-slate-950 text-white shadow-2xl">
      <div className="flex h-full flex-col p-6 md:p-8">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
          <span><span className="text-cyan-300">WHAT</span><span className="text-fuchsia-300">EVER!</span></span>
          <span>Room DEMO · {phaseLabels[phase]}</span>
        </div>
        {phase === 'lobby' && <div className="grid flex-1 place-items-center text-center">
          <div><div className="mx-auto grid h-36 w-36 place-items-center rounded-xl bg-white text-6xl text-slate-950">▦</div><h2 className="mt-5 text-4xl font-black">Scan to join</h2><p className="mt-2 text-slate-300">Ali, Erika and Tim are ready</p></div>
        </div>}
        {(phase === 'prompt' || phase === 'answering') && <div className="grid flex-1 place-items-center text-center">
          <div><div className="text-sm font-black uppercase tracking-[0.3em] text-amber-300">Headline Hijack · Round 1 of 6</div><h2 className="mt-6 text-4xl font-black md:text-6xl">Mayor announces plan to <span className="text-cyan-300">____</span> by Friday.</h2><p className="mt-6 text-xl text-slate-300">{phase === 'prompt' ? 'Round Owner: Erika' : '3 of 3 answers received · 42s'}</p></div>
        </div>}
        {(phase === 'reveal' || phase === 'voting') && <div className="flex flex-1 flex-col justify-center">
          <h2 className="text-center text-3xl font-black md:text-5xl">Which answer sounds like Erika?</h2>
          <div className="mt-6 grid grid-cols-3 gap-3">{answers.map((player, index) => <div key={player.name} className="rounded-xl border border-white/10 bg-white/5 p-4"><div className="text-xs font-black text-fuchsia-300">ANSWER {index + 1}</div><p className="mt-2 font-bold">{player.answer}</p></div>)}</div>
          {phase === 'voting' && <p className="mt-5 text-center text-amber-300">Players are guessing and choosing favourites · 18s</p>}
        </div>}
        {phase === 'results' && <div className="flex flex-1 flex-col justify-center text-center">
          <div className="text-xs font-black uppercase tracking-[0.3em] text-amber-300">Round 1 results</div><h2 className="mt-2 text-3xl font-black md:text-4xl">🟢 Erika was the Round Owner</h2><p className="mt-2 text-lg md:text-xl">“issue every resident a ceremonial traffic cone”</p>
          <div className="mx-auto mt-4 grid w-full max-w-2xl grid-cols-2 gap-3"><div className="rounded-xl bg-cyan-400/10 p-3"><b className="text-cyan-300">CHAMELEON</b><p className="mt-1 text-sm">Ali +2 · Erika +3</p></div><div className="rounded-xl bg-fuchsia-400/10 p-3"><b className="text-fuchsia-300">CROWD</b><p className="mt-1 text-sm">Three-way tie · 1 each</p></div></div>
        </div>}
        {phase === 'champions' && <div className="grid flex-1 place-items-center text-center"><div><div className="text-sm font-black uppercase tracking-[0.3em] text-amber-300">Final results</div><h2 className="mt-4 text-5xl font-black">Two ways to win</h2><div className="mt-8 flex justify-center gap-14"><div><div className="text-6xl">🦎</div><b className="mt-2 block text-cyan-300">Ali</b><span>Chameleon champion</span></div><div><div className="text-6xl">🏆</div><b className="mt-2 block text-fuchsia-300">Tim</b><span>Crowd favourite</span></div></div></div></div>}
      </div>
    </div>
  )
}

export default function PlaytestDemo() {
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const phase = DEMO_PHASES[phaseIndex]

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      if (phaseIndex === DEMO_PHASES.length - 1) setPlaying(false)
      else setPhaseIndex((index) => index + 1)
    }, 3500)
    return () => clearTimeout(timer)
  }, [phaseIndex, playing])

  return (
    <main className="min-h-screen bg-[#050914] p-4 text-white md:p-6">
      <div className="mx-auto max-w-[96rem]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div><div className="text-xs font-black uppercase tracking-[0.28em] text-amber-300">Internal dress rehearsal</div><h1 className="mt-1 text-2xl font-black">Whatever! TV + three-phone simulator</h1></div>
          <div className="flex items-center gap-2">
            <button onClick={() => setPhaseIndex((index) => Math.max(0, index - 1))} className="rounded-lg bg-white/10 px-4 py-2 font-bold">←</button>
            <button onClick={() => setPlaying((value) => !value)} className="rounded-lg border border-fuchsia-400 bg-fuchsia-500/20 px-5 py-2 font-bold">{playing ? 'Pause' : 'Auto-play'}</button>
            <button onClick={() => setPhaseIndex((index) => Math.min(DEMO_PHASES.length - 1, index + 1))} className="rounded-lg bg-white/10 px-4 py-2 font-bold">→</button>
          </div>
        </header>
        <nav className="mb-5 flex gap-2 overflow-x-auto pb-2">{DEMO_PHASES.map((item, index) => <button key={item} onClick={() => { setPlaying(false); setPhaseIndex(index) }} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${index === phaseIndex ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-slate-400'}`}>{index + 1}. {phaseLabels[item]}</button>)}</nav>
        <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(42rem,1fr)]">
          <div><div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Shared TV</div><TvBoard phase={phase} /></div>
          <div><div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Player phones</div><div className="grid gap-3 md:grid-cols-3">{players.map((player, index) => <Phone key={player.name} playerIndex={index} phase={phase} />)}</div></div>
        </section>
        <p className="mt-5 text-xs text-slate-500">Synthetic UX rehearsal only. The separate live six-round test covers real Supabase identity, privacy, deadlines, scoring, refresh and reconnect behaviour.</p>
      </div>
    </main>
  )
}
