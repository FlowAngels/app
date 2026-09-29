import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
  joinRoom,
  broadcast,
  deriveBoardState,
  getRevealItems,
  getRoomPreview,
  setPlayerConnected,
} from '../lib/orchestrator'
import { supabase } from '../lib/supabase'
import CategoryOptIn from './CategoryOptIn'
import Respond from './Respond'
import GuessVote from './GuessVote'
import Results from './Results'
import { subscribeToRoom, unsubscribeFromRoom } from '../lib/orchestrator'
import { parseRoomEvent, parseStringArray } from '../lib/gameState'
import { PlayerDot, WhateverMark } from '../components/WhateverVisuals'

const COLORS = [
  { name: 'Red', value: '🔴', hex: '#ef4444' },
  { name: 'Blue', value: '🔵', hex: '#3b82f6' },
  { name: 'Green', value: '🟢', hex: '#10b981' },
  { name: 'Yellow', value: '🟡', hex: '#f59e0b' },
  { name: 'Purple', value: '🟣', hex: '#8b5cf6' },
  { name: 'Orange', value: '🟠', hex: '#f97316' },
  { name: 'Pink', value: '🩷', hex: '#ec4899' },
  { name: 'Teal', value: '🩵', hex: '#14b8a6' }
]

export default function Join() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const roomId = searchParams.get('room')
  const [name, setName] = useState('')
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [leftRoomId, setLeftRoomId] = useState<string | null>(null)
  const [takenColors, setTakenColors] = useState<string[]>([])
  const [phase, setPhase] = useState<'idle' | 'respond' | 'ready' | 'guessvote' | 'results'>('idle')
  const [phaseInitialized, setPhaseInitialized] = useState(false)
  const [revealItems, setRevealItems] = useState<{ id: string; text: string }[]>([])
  const [voteDeadline, setVoteDeadline] = useState<string | undefined>(undefined)

  // Mark player as disconnected if they close the tab unexpectedly
  useEffect(() => {
    const handleUnload = () => {
      try {
        const playerId = localStorage.getItem('playerId')
        if (playerId && success !== 'left') {
          // Fire-and-forget; may not always complete but improves accuracy
          void setPlayerConnected(playerId, false).catch(() => undefined)
        }
      } catch {
        // ignore
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
  }, [success])

  // Check existing player state and resume correct phase
  useEffect(() => {
    const checkExistingPlayer = async () => {
      if (!roomId || phaseInitialized) return

      const playerId = localStorage.getItem('playerId')
      if (!playerId) {
        setPhaseInitialized(true)
        return
      }

      try {
        // Check if player still exists and is connected
        const { data: player, error: playerError } = await supabase
          .from('players')
          .select('id, name, connected, selected_categories')
          .eq('id', playerId)
          .eq('room_id', roomId)
          .single()

        if (playerError || !player) {
          // Player doesn't exist, clear storage and start fresh
          localStorage.removeItem('playerId')
          setPhaseInitialized(true)
          return
        }

        // Player exists, check game state
        const boardState = await deriveBoardState(roomId)

        if (parseStringArray(player.selected_categories).length === 0) {
          // Player hasn't selected categories yet
          setSuccess('joined')
          setPhaseInitialized(true)
          return
        }

        // Player has selected categories
        setSuccess('categories_selected')

        // Determine phase based on current round state
        if (boardState.currentRound) {
          if (boardState.currentRound.phase === 'guessing') {
            setRevealItems(await getRevealItems(boardState.currentRound.id))
            setVoteDeadline(boardState.currentRound.vote_deadline || undefined)
            setPhase('guessvote')
          } else if (boardState.currentRound.phase === 'results') {
            setPhase('results')
          } else if (boardState.currentRound.deadline) {
            // Round is active with countdown
            setPhase('respond')
          } else {
            // Round started but no countdown yet
            setPhase('idle')
          }
        }

        setPhaseInitialized(true)
      } catch (error) {
        console.error('Error checking existing player:', error)
        setPhaseInitialized(true)
      }
    }

    checkExistingPlayer()
  }, [roomId, phaseInitialized])

  const fetchTakenColors = useCallback(async () => {
    if (!roomId) return

    try {
      const preview = await getRoomPreview(roomId)
      const taken = preview.avatars
      setTakenColors(taken)

      // If selected color is taken, select first available
      if (taken.includes(selectedColor.value)) {
        const availableColor = COLORS.find(color => !taken.includes(color.value))
        if (availableColor) {
          setSelectedColor(availableColor)
        }
      }
    } catch (err) {
      console.error('Error fetching taken colors:', err)
    }
  }, [roomId, selectedColor.value])

  // Fetch taken colors when component loads
  useEffect(() => {
    if (roomId) {
      fetchTakenColors()
    }
  }, [roomId, fetchTakenColors])

  // Subscribe to round:countdown_start to flip into Respond phase
  useEffect(() => {
    if (!roomId) return
    const ch = subscribeToRoom(roomId, (payload) => {
      const p = parseRoomEvent(payload)
      if (p?.event === 'round:countdown_start') {
        setPhase('respond')
      }
      if (p?.event === 'round:reveal') {
        setRevealItems(p.payload?.items || [])
        setPhase('guessvote')
      }
      if (p?.event === 'round:vote_start') {
        setVoteDeadline(p.payload?.voteDeadline)
      }
      if (p?.event === 'round:results') {
        setPhase('results')
      }
    })
    return () => {
      if (ch) unsubscribeFromRoom(ch)
    }
  }, [roomId])

  const handleJoin = async () => {
    if (!roomId || !name.trim()) {
      setError('Please enter your name')
      return
    }

    if (takenColors.includes(selectedColor.value)) {
      setError('This color is already taken. Please select another color.')
      return
    }

    // Normalize name capitalization (Title Case)
    const toTitleCase = (s: string) => s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    const properName = toTitleCase(name.trim())

    setIsJoining(true)
    setError('')

    try {
      const result = await joinRoom(roomId, properName, selectedColor.value)
      setName(properName)
      // Store player info for category selection
      localStorage.setItem('playerId', result.playerId)
      localStorage.setItem('roomId', roomId)
      setSuccess(`joined:${result.playerId}`) // Signal to show category selection
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room')
    } finally {
      setIsJoining(false)
    }
  }

  const leaveCurrent = async () => {
    try {
      const playerId = localStorage.getItem('playerId')
      const rid = localStorage.getItem('roomId') || roomId || ''
      setLeftRoomId(rid || null)
      if (playerId) {
        await setPlayerConnected(playerId, false)
        // Broadcast so host UI updates even if PG changes are not enabled
        if (rid) {
          try {
            await broadcast(rid, 'room:update', { type: 'player:left', playerId })
          } catch (error) {
            console.warn('Failed to broadcast player departure', error)
          }
        }
      }
    } catch (e) {
      console.error('Leave error:', e)
    } finally {
      localStorage.removeItem('playerId')
      localStorage.removeItem('roomId')
      // Navigate away from the room-specific join link
      navigate('/', { replace: true })
    }
  }


  // Host/Player toggle (if this device is also host)
  const hostPid = typeof window !== 'undefined' ? localStorage.getItem('hostPlayerId') : null
  const toggleToHost = () => {
    if (!roomId) return
    window.location.href = `/lobby?room=${roomId}`
  }

  if (!roomId) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Invalid Join Link</h1>
          <p className="text-gray-600">No room code found in the URL.</p>
        </div>
      </div>
    )
  }

  if (success && success.startsWith('joined:')) {
    const playerId = success.split(':')[1]
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <CategoryOptIn
            playerId={playerId}
            roomId={roomId!}
            onComplete={() => setSuccess('categories_selected')}
          />
          <div className="mt-4 text-center">
            <button
              onClick={leaveCurrent}
              className="text-sm text-gray-600 underline hover:text-gray-800"
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (success === 'categories_selected') {
    // If a round is already active, render Respond; otherwise show waiting screen until round:countdown_start
    if (phase === 'respond') {
      const playerId = localStorage.getItem('playerId')!
      return <Respond roomId={roomId!} playerId={playerId} />
    }
    if (phase === 'guessvote') {
      const playerId = localStorage.getItem('playerId')!
      return <GuessVote roomId={roomId!} playerId={playerId} items={revealItems} voteDeadline={voteDeadline} />
    }
    if (phase === 'results') {
      const playerId = localStorage.getItem('playerId')!
      return <Results roomId={roomId!} playerId={playerId} />
    }
    return (
      <div className="whatever-stage flex min-h-screen items-center justify-center p-4 text-[#f3efe4]">
        <div className="text-center">
          <div className="mx-auto mb-5 h-3 w-3 rounded-full bg-[#73d8b0] shadow-[0_0_1.5rem_rgba(115,216,176,.65)]" />
          <h1 className="mb-4 text-3xl font-black tracking-[-.04em]">You’re in</h1>
          <p className="mb-4 text-[#b3b8c0]">Your place in room {roomId} is saved.</p>
          <p className="mb-6 text-sm text-[#737b86]">The host will start when everyone is ready.</p>
          <button
            onClick={leaveCurrent}
            className="text-sm text-gray-700 underline hover:text-gray-900"
          >
            Leave Room
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="whatever-stage flex min-h-screen items-center justify-center p-4 text-[#f3efe4]">
      <div className="material-panel w-full max-w-md rounded-[2rem] p-6">
        <div className="mb-8 text-center"><WhateverMark compact /><div className="eyebrow mt-5 text-[#e8bd45]">Join room {roomId}</div></div>
        {success === 'left' && leftRoomId && (
          <div className="mb-4 rounded-xl border border-[#e8bd45]/20 bg-[#e8bd45]/10 p-3 text-center text-sm text-[#e8cf80]">
            You left Room {leftRoomId}. You can rejoin below.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-[#f24b9d]/40 bg-[#f24b9d]/10 px-4 py-3 text-[#ff9bc9]">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="eyebrow mb-2 block text-[#8f98a3]">
            Your name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-lg font-semibold outline-none focus:border-[#35d8e6]"
            placeholder="Enter your name"
            maxLength={20}
          />
        </div>

        <div className="mb-6">
          <label className="eyebrow mb-3 block text-[#8f98a3]">
            Choose your colour
          </label>
          <div className="grid grid-cols-4 gap-2">
            {COLORS.map((color) => {
              const isTaken = takenColors.includes(color.value)
              const isSelected = selectedColor.name === color.name

              return (
                <button
                  key={color.name}
                  onClick={() => !isTaken && setSelectedColor(color)}
                  disabled={isTaken}
                  className={`grid min-h-20 place-items-center rounded-2xl border transition-all ${
                    isTaken
                      ? 'cursor-not-allowed border-white/5 bg-white/[.02] opacity-35'
                      : isSelected
                        ? 'scale-105 bg-white/10'
                        : 'border-white/10 bg-white/[.03] hover:bg-white/[.06]'
                  }`}
                  style={{ borderColor: isSelected && !isTaken ? color.hex : undefined }}
                >
                  <PlayerDot color={color.hex} />
                  <div className={`mt-1 text-[.62rem] font-bold ${isTaken ? 'text-[#555d67]' : 'text-[#9ca3ad]'}`}>
                    {color.name}{isTaken ? ' (taken)' : ''}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <button
          onClick={handleJoin}
          disabled={isJoining || !name.trim()}
          className="w-full rounded-full bg-[#f24b9d] px-4 py-3 font-black text-[#170a12] transition hover:bg-[#ff6aae] disabled:cursor-not-allowed disabled:bg-[#252b34] disabled:text-[#69717c]"
        >
          {isJoining ? 'Joining...' : 'Join Game'}
        </button>
      </div>
      {hostPid && (<button onClick={toggleToHost} className="fixed bottom-4 right-4 bg-gray-800 text-white px-3 py-2 rounded shadow">Host View</button>)}
    </div>
  )
}
