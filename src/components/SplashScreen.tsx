import { useEffect, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { createRoom } from '../lib/orchestrator'
import { ensureAnonymousSession } from '../lib/auth'
import { useAuthenticatedCommands } from '../lib/backendMode'
import { FeltThing, WhateverMark } from './WhateverVisuals'

export default function SplashScreen() {
  const navigate = useNavigate()
  const [canResume, setCanResume] = useState(false)
  const [latestRoomId, setLatestRoomId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const init = async () => {
      if (useAuthenticatedCommands) await ensureAnonymousSession()
      let hostDeviceId = localStorage.getItem('hostDeviceId')
      if (!hostDeviceId) {
        hostDeviceId = `host-${Math.random().toString(36).slice(2, 11)}`
        localStorage.setItem('hostDeviceId', hostDeviceId)
      }

      const cached = localStorage.getItem('currentRoomId')
      if (cached) {
        const { data: cachedRoom, error } = await supabase
          .from('rooms')
          .select('id,status,created_at,round_index,total_rounds')
          .eq('id', cached)
          .eq('host_device_id', hostDeviceId)
          .neq('status', 'ended')
          .single()

        if (!error && cachedRoom) {
          const roomAge = Date.now() - new Date(cachedRoom.created_at).getTime()
          if (roomAge < 30 * 60 * 1000 && cachedRoom.round_index < cachedRoom.total_rounds) {
            setCanResume(true)
            setLatestRoomId(cached)
            return
          }
        }
        localStorage.removeItem('currentRoomId')
      }

      const { data, error } = await supabase
        .from('rooms')
        .select('id,status,created_at,round_index,total_rounds')
        .eq('host_device_id', hostDeviceId)
        .neq('status', 'ended')
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) return
      const fresh = (data || []).filter((room) =>
        Date.now() - new Date(room.created_at).getTime() < 30 * 60 * 1000 &&
        room.round_index < room.total_rounds,
      )
      if (fresh.length > 0) {
        setCanResume(true)
        setLatestRoomId(fresh[0].id)
      }
    }
    init()
  }, [])

  const createGame = async () => {
    if (creating) return
    setCreating(true)
    try {
      let hostDeviceId = localStorage.getItem('hostDeviceId')
      if (!hostDeviceId) {
        hostDeviceId = `host-${Math.random().toString(36).slice(2, 11)}`
        localStorage.setItem('hostDeviceId', hostDeviceId)
      }
      const { id } = await createRoom(hostDeviceId)
      localStorage.removeItem('hostPlayerId')
      localStorage.setItem('currentRoomId', id)
      navigate(`/lobby?room=${id}&hostJoin=1`)
    } finally {
      setCreating(false)
    }
  }

  const resumeGame = () => {
    if (latestRoomId) {
      localStorage.setItem('currentRoomId', latestRoomId)
      navigate(`/lobby?room=${latestRoomId}`)
    } else {
      navigate('/lobby')
    }
  }

  return (
    <main className="whatever-stage min-h-screen px-5 py-8 sm:px-8">
      <FeltThing shape="bolt" color="#7d8582" className="left-[3%] top-[5%] hidden w-[clamp(6rem,13vw,12rem)] lg:block" style={{ '--thing-rotation': '-14deg' } as CSSProperties} />
      <FeltThing shape="star" color="#d8a91f" className="right-[4%] top-[4%] hidden w-[clamp(7rem,14vw,13rem)] md:block" style={{ '--thing-rotation': '8deg', animationDelay: '-1.4s' } as CSSProperties} />
      <FeltThing shape="blob" color="#1e9bbb" className="-bottom-10 -left-12 w-[clamp(7rem,15vw,13rem)] sm:bottom-[8%] sm:-left-8" style={{ '--thing-rotation': '-12deg', animationDelay: '-3s' } as CSSProperties} />
      <FeltThing shape="ghost" color="#8b5aa8" className="-right-7 bottom-[6%] hidden w-[clamp(7rem,15vw,13rem)] sm:block" style={{ '--thing-rotation': '9deg', animationDelay: '-4.6s' } as CSSProperties} />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col items-center justify-center text-center">
        <div className="eyebrow mb-6 text-[#8b929c]">A game of suspiciously familiar answers</div>
        <h1><WhateverMark /></h1>
        <p className="mt-7 text-[clamp(1.05rem,2.2vw,1.55rem)] font-medium tracking-[-.02em] text-[#e6c86c]">
          Say it in 100 characters. Laugh in 1000.
        </p>

        <div className="mt-9 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-semibold text-[#b8bdc6] sm:text-base">
          <span><b className="mr-2 text-[#e8bd45]">●</b>Party game</span>
          <span><b className="mr-2 text-[#73d8b0]">●</b>3–8 players</span>
          <span><b className="mr-2 text-[#35d8e6]">●</b>About 20 minutes</span>
        </div>

        <p className="mt-9 max-w-2xl text-[clamp(.98rem,1.8vw,1.2rem)] leading-relaxed text-[#aeb4bd]">
          Write the answer only you would write. Spot the friend hiding in the pile.
          Then reward the line the room will still be quoting tomorrow.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <button
            onClick={createGame}
            disabled={creating}
            className="group rounded-full bg-[#f24b9d] px-8 py-4 text-sm font-black uppercase tracking-[.16em] text-[#140710] shadow-[0_0_0_1px_rgba(255,255,255,.14),0_0_2.2rem_rgba(242,75,157,.28)] transition hover:-translate-y-0.5 hover:bg-[#ff6aae] disabled:cursor-wait disabled:opacity-60"
          >
            {creating ? 'Opening the room…' : 'Start a game'} <span className="ml-2 transition-transform group-hover:translate-x-1">→</span>
          </button>
          {canResume && (
            <button
              onClick={resumeGame}
              className="rounded-full border border-[#35d8e6]/45 bg-[#35d8e6]/8 px-8 py-4 text-sm font-black uppercase tracking-[.16em] text-[#87edf4] transition hover:-translate-y-0.5 hover:bg-[#35d8e6]/14"
            >
              Resume room {latestRoomId}
            </button>
          )}
        </div>

        <div className="mt-12 hidden items-center gap-3 text-xs font-semibold uppercase tracking-[.18em] text-[#626a75] sm:flex">
          <span className="h-px w-10 bg-white/10" /> TV in the middle · phones in hand <span className="h-px w-10 bg-white/10" />
        </div>
      </section>
    </main>
  )
}
