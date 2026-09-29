import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { DEMO_STEPS, type DemoPhase } from './demoPhases'
import { generateQRCode } from '../lib/qr'
import { FeltThing, PlayerDot, WhateverMark } from '../components/WhateverVisuals'

const players = [
  { name: 'Ali', avatar: '🔵', color: '#35d8e6' },
  { name: 'Erika', avatar: '🟢', color: '#73d8b0' },
  { name: 'Tim', avatar: '🟡', color: '#e8bd45' },
]

const demoRounds = [
  { ownerIndex: 1, prompt: 'Mayor announces plan to ____ by Friday.', answers: ['replace every meeting with competitive karaoke', 'issue every resident a ceremonial traffic cone', 'put the mayor on a strict snack schedule'] },
  { ownerIndex: 2, prompt: 'New study finds happiness is mostly caused by ____.', answers: ['leaving group chats without explanation', 'the exact right amount of garlic bread', 'finding money in your winter coat'] },
  { ownerIndex: 0, prompt: 'Local café bans customers who keep asking for ____.', answers: ['the Wi-Fi password while holding a laptop', 'a coffee that tastes less like coffee', 'one tiny emotional-support croissant'] },
  { ownerIndex: 1, prompt: 'Scientists confirm the moon is actually made of ____.', answers: ['expired supermarket loyalty points', 'the socks missing from every dryer', 'cheese, but disappointingly mild cheese'] },
  { ownerIndex: 2, prompt: 'Airline introduces surcharge for passengers carrying ____.', answers: ['a suspicious amount of confidence', 'more than three unresolved feelings', 'their own tiny emotional-support pilot'] },
  { ownerIndex: 0, prompt: 'Nation celebrates after finally agreeing on ____.', answers: ['where everyone should order dinner from', 'the correct way to load a dishwasher', 'a font for the family group chat'] },
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

function DemoCountdown({ seconds, label }: { seconds: number; label: string }) {
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const progress = seconds / (label === 'Vote' ? 20 : 60)
  return <div className="relative h-20 w-20 drop-shadow-[0_0_18px_rgba(53,216,230,.28)]">
    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
      <circle cx="50" cy="50" r={radius} fill="rgba(5,7,11,.9)" stroke="rgba(232,189,69,.18)" strokeWidth="6" />
      <circle cx="50" cy="50" r={radius} fill="none" stroke={seconds <= 10 ? '#f24b9d' : '#35d8e6'} strokeWidth="7" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
    </svg>
    <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-xl font-black">{seconds}</div><div className="text-[0.45rem] font-black uppercase tracking-widest text-slate-400">{label}</div></div></div>
  </div>
}

function Phone({ playerIndex, phase, roundNumber }: { playerIndex: number; phase: DemoPhase; roundNumber?: number }) {
  const player = players[playerIndex]
  const round = demoRounds[(roundNumber ?? 1) - 1]
  const ownerIndex = round.ownerIndex
  const owner = players[ownerIndex]
  const answer = round.answers[playerIndex]
  const otherPlayer = [0, 1, 2].find((index) => index !== playerIndex && index !== ownerIndex) ?? ownerIndex
  const chosenGuess = playerIndex === ownerIndex ? otherPlayer : (playerIndex + (roundNumber ?? 1)) % 2 === 0 ? ownerIndex : otherPlayer
  const chosenVote = (playerIndex + 1) % players.length
  const chameleonScores = [(roundNumber ?? 1) * 2 + 2, (roundNumber ?? 1) * 2 + 1, (roundNumber ?? 1) * 2]
  const crowdScores = [(roundNumber ?? 1), (roundNumber ?? 1) + 1, (roundNumber ?? 1) + 2]
  const chameleonRank = 1 + chameleonScores.filter((score) => score > chameleonScores[playerIndex]).length
  const crowdRank = 1 + crowdScores.filter((score) => score > crowdScores[playerIndex]).length
  const crowdWinner = players[((roundNumber ?? 1) + 1) % players.length]

  return (
    <div className="phone-shell mx-auto min-h-[29rem] w-full max-w-[16rem] overflow-hidden rounded-[2.25rem] border-[5px] text-[#f3efe4]">
      <div className="flex items-center justify-between border-b border-white/[.07] px-4 py-3 text-xs text-[#8e96a1]">
        <span className="flex items-center gap-2 font-bold text-[#d4d1c8]"><PlayerDot color={player.color} /> {player.name}</span>
        {(phase === 'answering' || phase === 'voting')
          ? <span className="rounded-full border border-[#e8bd45]/30 bg-[#e8bd45]/10 px-2.5 py-1 font-black tabular-nums text-[#e8bd45]">{phase === 'answering' ? '42s' : '18s'}</span>
          : <span>Room DEMO</span>}
      </div>
      <div className="p-4">
        {phase === 'lobby' && <>
          <div className="eyebrow text-[#73d8b0]">You are in</div>
          <h3 className="mt-3 text-2xl font-black">Ready to play?</h3>
          <p className="mt-3 text-sm text-slate-300">The host will start when everyone has joined.</p>
          <div className="material-panel mt-8 rounded-2xl p-4 text-center text-[#73d8b0]">Ready when the room is</div>
        </>}
        {phase === 'prompt' && <>
          <div className="eyebrow text-[#e8bd45]">Round {roundNumber} of 6</div>
          <h3 className="mt-4 text-2xl font-black">Get ready</h3>
          <p className="mt-3 text-sm text-slate-300">{owner.name} is hiding in this round.</p>
          <div className="mt-8 animate-pulse text-center text-5xl">3</div>
        </>}
        {phase === 'answering' && <>
          <div className="eyebrow text-[#35d8e6]">Round {roundNumber}</div>
          <p className="mt-4 text-lg font-bold">{round.prompt}</p>
          <div className="paper-slip mt-5 min-h-28 rounded-2xl p-4 text-sm font-semibold leading-relaxed">{answer}</div>
          <div className="mt-2 text-right text-xs text-slate-500">{answer.length}/100</div>
          <button className="mt-4 w-full rounded-full bg-[#f24b9d] py-3 font-black text-[#190a12]">Submitted ✓</button>
        </>}
        {phase === 'reveal' && <>
          <div className="eyebrow text-[#f24b9d]">Answers locked</div>
          <h3 className="mt-4 text-2xl font-black">Eyes on the TV</h3>
          <p className="mt-3 text-sm text-slate-300">The answers are being shuffled before voting begins.</p>
          <div className="relative mt-7 h-28"><FeltThing shape="blob" color={player.color} mood="ooh" className="left-1/2 top-0 w-24 -translate-x-1/2" /></div>
        </>}
        {phase === 'voting' && <>
          <div className="material-panel grid grid-cols-2 rounded-full p-1 text-[0.62rem] font-black">
            <div className="rounded-lg px-2 py-2 text-center text-emerald-300">1 · OWNER ✓</div>
            <div className="rounded-full bg-[#f24b9d] px-2 py-2 text-center text-[#170a12]">2 · FAVOURITE</div>
          </div>
          <h3 className="mt-4 text-xl font-black">Which answer deserves the spotlight?</h3>
          <p className="mt-1 text-xs text-slate-400">Your own answer is hidden.</p>
          <div className="mt-4 space-y-3">
            {players.map((answerPlayer, index) => ({ answerPlayer, index })).filter(({ index }) => index !== playerIndex).map(({ answerPlayer, index }) => {
              return <div key={answerPlayer.name} className={`rounded-2xl border p-3 text-sm ${chosenVote === index ? 'border-[#f24b9d] bg-[#f24b9d]/10' : 'border-white/10 bg-white/[.035]'}`}>
                <p>{round.answers[index]}</p>
                {chosenVote === index && <div className="mt-3 text-[0.65rem] font-black text-[#f58abb]">★ FAVOURITE SELECTED</div>}
              </div>
            })}
          </div>
        </>}
        {phase === 'results' && <>
          <div className="text-xs font-black uppercase tracking-widest text-amber-300">Round {roundNumber} results</div>
          <h3 className="mt-3 text-2xl font-black">{owner.avatar} {owner.name} revealed</h3>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[0.65rem]">
            <div className="rounded-xl bg-cyan-400/10 p-3"><b className="text-cyan-300">CHAMELEON</b><div className="mt-1">{owner.avatar} {owner.name} +3</div></div>
            <div className="rounded-xl bg-fuchsia-400/10 p-3"><b className="text-fuchsia-300">CROWD</b><div className="mt-1">{crowdWinner.avatar} {crowdWinner.name} +2</div></div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl border border-cyan-400/20 p-3"><b className="text-2xl text-cyan-300">{chameleonScores[playerIndex]}</b><div className="text-[0.58rem] uppercase">Chameleon · #{chameleonRank}/3</div></div>
            <div className="rounded-xl border border-fuchsia-400/20 p-3"><b className="text-2xl text-fuchsia-300">{crowdScores[playerIndex]}</b><div className="text-[0.58rem] uppercase">Crowd · #{crowdRank}/3</div></div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">{chosenGuess === ownerIndex ? `You spotted ${owner.name}.` : `${owner.name} slipped past you.`}</p>
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

function TvBoard({ phase, roundNumber }: { phase: DemoPhase; roundNumber?: number }) {
  const round = demoRounds[(roundNumber ?? 1) - 1]
  const owner = players[round.ownerIndex]
  const answers = useMemo(() => [...round.answers].sort((a, b) => a.localeCompare(b)), [round.answers])
  const [demoQr, setDemoQr] = useState('')

  useEffect(() => {
    generateQRCode(`${window.location.origin}/join?room=DEMO`).then(setDemoQr)
  }, [])

  return (
    <div className="tv-frame aspect-video w-full overflow-hidden rounded-[1.35rem] text-[#f3efe4]">
      <div className="whatever-stage relative flex h-full flex-col overflow-hidden p-6 md:p-8">
        {(['lobby', 'reveal', 'results', 'champions'] as DemoPhase[]).includes(phase) && <>
          <FeltThing shape="bolt" color="#727a78" className="-left-8 top-[36%] w-24 opacity-40" style={{ '--thing-rotation': '-12deg' } as CSSProperties} />
          <FeltThing shape="ghost" color="#764d89" className="-right-8 bottom-1 w-28 opacity-45" style={{ '--thing-rotation': '9deg', animationDelay: '-3s' } as CSSProperties} />
        </>}
        <div className="relative z-10 flex items-center justify-between text-xs font-bold uppercase tracking-[0.22em] text-[#767f8b]">
          <WhateverMark compact />
          <span>Room DEMO · {phaseLabels[phase]}</span>
        </div>
        {(phase === 'answering' || phase === 'voting') && <div className="absolute right-4 top-14 z-20 md:right-7"><DemoCountdown seconds={phase === 'answering' ? 42 : 18} label={phase === 'answering' ? 'Answer' : 'Vote'} /></div>}
        {phase === 'lobby' && <div className="relative z-10 grid min-h-0 flex-1 grid-cols-[0.82fr_1.18fr] items-center gap-3 pt-2 md:gap-7 md:pt-4">
          <div className="material-panel flex h-full min-h-0 flex-col items-center justify-center rounded-[1.6rem] px-3 py-3 text-center md:px-5 md:py-4">
            <div className="eyebrow text-[#e8bd45]">Join the room</div>
            <div className="mt-2 rounded-[1.15rem] bg-[#f3efe4] p-2 shadow-[0_1.2rem_2.5rem_rgba(0,0,0,.32)]">
              {demoQr ? <img src={demoQr} alt="Demo room QR code" className="h-20 w-20 md:h-28 md:w-28" /> : <div className="h-20 w-20 md:h-28 md:w-28" />}
            </div>
            <div className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-slate-400">Scan with your phone</div>
          </div>
          <div className="flex min-w-0 flex-col justify-center">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="eyebrow text-[#f58abb]">Your game is almost ready</div>
                <h2 className="mt-1 text-2xl font-black leading-none tracking-[-.05em] md:text-5xl">ROOM <span className="text-[#e8bd45]">DEMO</span></h2>
              </div>
              <div className="rounded-full border border-[#73d8b0]/25 bg-[#73d8b0]/10 px-3 py-1 text-xs font-bold text-[#9be7c8]">3 joined</div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 md:mt-4">
              {players.map((player) => <div key={player.name} className="material-panel rounded-2xl px-2 py-1.5 text-center md:py-3">
                <div className="mx-auto grid h-6 w-6 place-items-center md:h-9 md:w-9"><PlayerDot color={player.color} /></div>
                <div className="mt-1 truncate text-sm font-black">{player.name}</div>
                <div className="mt-1 text-[0.55rem] font-bold uppercase tracking-wider text-emerald-300">● Ready</div>
              </div>)}
            </div>
            <div className="material-panel mt-2 flex items-center justify-between gap-3 rounded-2xl px-4 py-2 md:mt-4 md:py-3">
              <div className="eyebrow text-[#73d8b0]">Ready</div>
              <div className="shrink-0 rounded-full bg-[#f24b9d] px-4 py-2 text-xs font-black uppercase tracking-wider text-[#160911]">Start game →</div>
            </div>
          </div>
        </div>}
        {(phase === 'prompt' || phase === 'answering') && <div className="grid flex-1 place-items-center text-center">
          <div className={phase === 'answering' ? 'mr-16 md:mr-20' : ''}><div className="eyebrow text-[#e8bd45]">Round {roundNumber} of 6</div><h2 className="mt-6 text-4xl font-black tracking-[-.045em] md:text-6xl">{round.prompt}</h2><p className="mt-6 text-xl text-[#aeb4bd]">{phase === 'prompt' ? `Round Owner: ${owner.name}` : '3 of 3 answers received'}</p></div>
        </div>}
        {(phase === 'reveal' || phase === 'voting') && <div className="flex flex-1 flex-col justify-center">
          <h2 className={`text-center text-3xl font-black md:text-5xl ${phase === 'voting' ? 'mr-16 md:mr-20' : ''}`}>Which answer sounds like {owner.name}?</h2>
          <div className="mt-6 grid grid-cols-3 gap-3">{answers.map((answer, index) => <div key={answer} className="paper-slip rotate-[var(--slip-rotation)] rounded-xl p-4" style={{ '--slip-rotation': `${(index - 1) * 1.1}deg` } as CSSProperties}><div className="text-[.62rem] font-black uppercase tracking-[.18em] text-[#b52c72]">Answer {index + 1}</div><p className="mt-2 font-bold leading-snug">{answer}</p></div>)}</div>
          {phase === 'voting' && <p className="mt-5 text-center text-[#e8bd45]">Players are guessing and choosing favourites</p>}
        </div>}
        {phase === 'results' && <div className="flex flex-1 flex-col justify-center text-center">
          <div className="eyebrow text-[#e8bd45]">Round {roundNumber} results</div><h2 className="mt-2 text-3xl font-black tracking-[-.04em] md:text-4xl"><span className="mr-2 inline-flex align-middle"><PlayerDot color={owner.color} /></span>{owner.name} was the Round Owner</h2><p className="mt-2 text-lg md:text-xl">“{round.answers[round.ownerIndex]}”</p>
          <div className="mx-auto mt-4 grid w-full max-w-2xl grid-cols-2 gap-3"><div className="material-panel rounded-xl p-3"><b className="text-[#35d8e6]">CHAMELEON</b><p className="mt-1 text-sm">Scores updated after round {roundNumber}</p></div><div className="material-panel rounded-xl p-3"><b className="text-[#f24b9d]">CROWD</b><p className="mt-1 text-sm">Favourite votes added</p></div></div>
        </div>}
        {phase === 'champions' && <div className="grid flex-1 place-items-center text-center"><div><div className="text-sm font-black uppercase tracking-[0.3em] text-amber-300">Final results</div><h2 className="mt-4 text-5xl font-black">Two ways to win</h2><div className="mt-8 flex justify-center gap-14"><div><div className="text-6xl">🦎</div><b className="mt-2 block text-cyan-300">Ali</b><span>Chameleon champion</span></div><div><div className="text-6xl">🏆</div><b className="mt-2 block text-fuchsia-300">Tim</b><span>Crowd favourite</span></div></div></div></div>}
      </div>
    </div>
  )
}

export default function PlaytestDemo() {
  const [stepIndex, setStepIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const step = DEMO_STEPS[stepIndex]
  const phase = step.phase
  const roundNumber = step.round

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      if (stepIndex === DEMO_STEPS.length - 1) setPlaying(false)
      else setStepIndex((index) => index + 1)
    }, 2500)
    return () => clearTimeout(timer)
  }, [stepIndex, playing])

  const togglePlayback = () => {
    if (!playing && stepIndex === DEMO_STEPS.length - 1) setStepIndex(0)
    setPlaying((value) => !value)
  }

  const jumpToRound = (round: number) => {
    setPlaying(false)
    setStepIndex(DEMO_STEPS.findIndex((candidate) => candidate.round === round))
  }

  return (
    <main className="whatever-stage min-h-screen p-4 text-[#f3efe4] md:p-6">
      <div className="mx-auto max-w-[96rem]">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div><div className="eyebrow text-[#e8bd45]">Internal dress rehearsal</div><h1 className="mt-1 text-2xl font-black tracking-[-.04em]">Whatever! TV + three-phone simulator</h1></div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-bold text-slate-500 sm:block">Step {stepIndex + 1}/{DEMO_STEPS.length}</span>
            <button onClick={() => { setPlaying(false); setStepIndex((index) => Math.max(0, index - 1)) }} className="rounded-lg bg-white/10 px-4 py-2 font-bold">←</button>
            <button onClick={togglePlayback} className="rounded-lg border border-fuchsia-400 bg-fuchsia-500/20 px-5 py-2 font-bold">{playing ? 'Pause' : stepIndex === DEMO_STEPS.length - 1 ? 'Replay all 6 rounds' : 'Play all 6 rounds'}</button>
            <button onClick={() => { setPlaying(false); setStepIndex((index) => Math.min(DEMO_STEPS.length - 1, index + 1)) }} className="rounded-lg bg-white/10 px-4 py-2 font-bold">→</button>
          </div>
        </header>
        <nav className="mb-5 flex gap-2 overflow-x-auto pb-2">
          <button onClick={() => { setPlaying(false); setStepIndex(0) }} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${phase === 'lobby' ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-slate-400'}`}>Lobby</button>
          {demoRounds.map((_, index) => <button key={index} onClick={() => jumpToRound(index + 1)} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${roundNumber === index + 1 ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-slate-400'}`}>Round {index + 1}</button>)}
          <button onClick={() => { setPlaying(false); setStepIndex(DEMO_STEPS.length - 1) }} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${phase === 'champions' ? 'bg-cyan-400 text-slate-950' : 'bg-white/5 text-slate-400'}`}>Champions</button>
          <span className="whitespace-nowrap rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold text-amber-300">{phaseLabels[phase]}{roundNumber ? ` · ${roundNumber}/6` : ''}</span>
        </nav>
        <section className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(42rem,1fr)]">
          <div><div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Shared TV</div><TvBoard phase={phase} roundNumber={roundNumber} /></div>
          <div><div className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-500">Player phones</div><div className="grid gap-3 md:grid-cols-3">{players.map((player, index) => <Phone key={player.name} playerIndex={index} phase={phase} roundNumber={roundNumber} />)}</div></div>
        </section>
        <p className="mt-5 text-xs text-slate-500">Synthetic UX rehearsal only. The separate live six-round test covers real Supabase identity, privacy, deadlines, scoring, refresh and reconnect behaviour.</p>
      </div>
    </main>
  )
}
