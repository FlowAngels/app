import { useState, useEffect, useCallback, useRef } from 'react'
import { createRoom, joinRoom, subscribeToRoom, unsubscribeFromRoom, deriveBoardState, getRevealItems, startRound, beginRoundCountdown, revealRound, startVotePhase, finalizeRound } from '../lib/orchestrator'
import { getPrompt } from '../lib/prompts'
import { generateQRCode } from '../lib/qr'
import CategoryOptIn from '../mobile/CategoryOptIn'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { parseLeaderboards, parsePrompt, parseRoomEvent, parseRoundResults, parseStringArray } from '../lib/gameState'
import type { Leaderboards, RevealItem, RoundResults } from '../lib/gameState'
import CountdownClock from './CountdownClock'
import { WhateverMark } from './WhateverVisuals'

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

export default function Lobby() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const hostJoinRequested = searchParams.get('hostJoin') === '1'
  const [roomId, setRoomId] = useState<string>('')
  const [qrCode, setQrCode] = useState<string>('')
  const [players, setPlayers] = useState<{ id: string; name: string; avatar: string; connected: boolean }[]>([])
  const [categoriesLocked, setCategoriesLocked] = useState<number>(0)
  const [submissionCount, setSubmissionCount] = useState<number>(0)
  const [submittedIds, setSubmittedIds] = useState<string[]>([])
  const [roundDeadline, setRoundDeadline] = useState<string>('')
  const [currentCategory, setCurrentCategory] = useState<string>('')
  const [currentPrompt, setCurrentPrompt] = useState<string>('')
  const [currentOwnerId, setCurrentOwnerId] = useState('')
  const [roundPhase, setRoundPhase] = useState<'prompt' | 'responding' | 'guessing' | 'results' | ''>('')
  const [voteDeadline, setVoteDeadline] = useState('')
  const [revealItems, setRevealItems] = useState<RevealItem[]>([])
  const [roundResults, setRoundResults] = useState<RoundResults>({
    ownerAnswerId: null,
    correctGuessers: [],
    voteCounts: {},
    ownerSweetSpot: false,
    answerOwners: {},
    roundChameleon: {},
    roundCrowd: {},
  })
  const [leaderboards, setLeaderboards] = useState<Leaderboards>({ chameleon: {}, crowd: {} })
  const [roundIndex, setRoundIndex] = useState(0)
  const [totalRounds, setTotalRounds] = useState(6)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const [showHostJoinModal, setShowHostJoinModal] = useState(false)
  const [showHostCategories, setShowHostCategories] = useState(false)
  const [hostPlayerId, setHostPlayerId] = useState('')
  const [hostName, setHostName] = useState('')
  const [hostColor, setHostColor] = useState({ name: 'Red', value: '🔴', hex: '#ef4444' })
  const [isJoiningAsHost, setIsJoiningAsHost] = useState(false)
  const [roundStarted, setRoundStarted] = useState(false)
  const suppressResumeRef = useRef(false)
  const deadlineTimerRef = useRef<number | null>(null)

  // Ensure a stable host device id for this browser
  useEffect(() => {
    let id = localStorage.getItem('hostDeviceId')
    if (!id) {
      id = 'host-' + Math.random().toString(36).slice(2, 11)
      localStorage.setItem('hostDeviceId', id)
    }
    setHostDeviceId(id)
  }, [])

  const computeExpiry = useCallback((createdAtIso: string) => {
    const createdMs = new Date(createdAtIso).getTime()
    const deleteAt = createdMs + 30 * 60 * 1000
    const now = Date.now()
    return Math.max(0, Math.floor((deleteAt - now) / 1000))
  }, [])
  const [hostDeviceId, setHostDeviceId] = useState('')
  const [resumeRooms, setResumeRooms] = useState<{ id: string; status: string; created_at: string; playerCount?: number; expiresInSec?: number }[]>([])
  const [showResumeList, setShowResumeList] = useState(false)
  const [expiresInSec, setExpiresInSec] = useState<number | null>(null)
  const [previewCategory, setPreviewCategory] = useState('')
  const [previewPrompt, setPreviewPrompt] = useState('')
  const autoFlagsRef = useRef<{ revealedFor?: string; voteTimer?: number | null }>({ revealedFor: undefined, voteTimer: null })

  // Initialize/resume an existing room: QR, subscription, initial state
  const initLobbyForRoom = useCallback(async (id: string) => {
    try {
      // Persist and reflect in URL for resume
      localStorage.setItem('currentRoomId', id)
      if (new URLSearchParams(window.location.search).get('room') !== id) {
        navigate(`/lobby?room=${id}`, { replace: true })
      }

      setRoomId(id)
      const joinUrl = `${window.location.origin}/join?room=${id}`
      const qrDataUrl = await generateQRCode(joinUrl)
      setQrCode(qrDataUrl)

      const roomChannel = subscribeToRoom(id, async (payload) => {
        const event = parseRoomEvent(payload)
        console.log('Lobby received event:', payload)
        const boardState = await deriveBoardState(id)
        setPlayers(boardState.players)
        if (boardState.room?.created_at) {

          setExpiresInSec(computeExpiry(boardState.room.created_at))
        }
        setSubmissionCount(boardState.submissionCount || 0)
        setSubmittedIds(boardState.submittedPlayerIds || [])
        setRoundDeadline(boardState.currentRound?.deadline || '')
        setCurrentCategory(boardState.currentRound?.category || '')
        setCurrentPrompt(boardState.currentRound ? parsePrompt(boardState.currentRound.prompt) : '')
        setCurrentOwnerId(boardState.currentRound?.owner_id || '')
        setRoundPhase(boardState.currentRound?.phase || '')
        setVoteDeadline(boardState.currentRound?.vote_deadline || '')
        setRoundResults(parseRoundResults(boardState.currentRound?.results))
        setLeaderboards(parseLeaderboards(boardState.room?.leaderboards))
        setRoundIndex(boardState.room?.round_index || 0)
        setTotalRounds(boardState.room?.total_rounds || 6)
        if (boardState.currentRound?.id && (boardState.currentRound.phase === 'guessing' || boardState.currentRound.phase === 'results')) {
          setRevealItems(await getRevealItems(boardState.currentRound.id))
        } else {
          setRevealItems([])
        }
        setCategoriesLocked(boardState.categoriesLocked || 0)

        // Set up deadline auto-progression timer
        if (boardState.currentRound?.deadline) {
          const deadline = new Date(boardState.currentRound.deadline).getTime()
          const now = Date.now()
          const timeLeft = deadline - now

          // Clear any existing timer
          if (deadlineTimerRef.current) {
            clearTimeout(deadlineTimerRef.current)
          }

          // Set timer to auto-reveal when deadline expires (if time is left)
          if (timeLeft > 0) {
            deadlineTimerRef.current = window.setTimeout(async () => {
              try {
                console.log('Deadline expired, auto-revealing round...')
                await revealRound(id)
                await startVotePhase(id)
              } catch (e) {
                console.error('Auto-reveal failed:', e)
              }
              deadlineTimerRef.current = null
            }, timeLeft)
          } else if (timeLeft <= 0) {
            // Deadline already expired, trigger immediately
            setTimeout(async () => {
              try {
                console.log('Deadline already expired, auto-revealing round...')
                await revealRound(id)
                await startVotePhase(id)
              } catch (e) {
                console.error('Auto-reveal failed:', e)
              }
            }, 100)
          }
        } else {
          // No deadline, clear timer
          if (deadlineTimerRef.current) {
            clearTimeout(deadlineTimerRef.current)
            deadlineTimerRef.current = null
          }
        }

        // Check if round started but no deadline yet
        if (boardState.currentRound && !boardState.currentRound.deadline) {
          setRoundStarted(true)
        } else if (!boardState.currentRound) {
          setRoundStarted(false)
        }

        // Pre-start prompt preview when no active round
        if (!boardState.currentRound) {
          const pool = boardState.categoryPool || []
          if (pool.length > 0) {
            const cat = pool[0]
            setPreviewCategory(cat)
            setPreviewPrompt(getPrompt(cat))
          }
        } else {
          setPreviewCategory('')
          setPreviewPrompt('')
        }

        // Auto-reveal when everyone submitted and not yet revealed
        const round = boardState.currentRound
        if (round && boardState.submissionCount === boardState.playerCount) {
          const rid = round.id as string
          const revealed = parseStringArray(round.reveal_order).length > 0
          if (!revealed && autoFlagsRef.current.revealedFor !== rid) {
            autoFlagsRef.current.revealedFor = rid
            try {
              await revealRound(id)
              // Auto-start voting immediately after reveal
              await startVotePhase(id)
            } catch (error) {
              console.error('Automatic reveal failed', error)
            }
          }
        }

        // Auto-finalize at vote deadline
        if (event.event === 'round:vote_start') {
          const dl = event.payload?.voteDeadline
          if (dl) {
            const ms = Math.max(0, new Date(dl).getTime() - Date.now())
            if (autoFlagsRef.current.voteTimer) {
              clearTimeout(autoFlagsRef.current.voteTimer)
            }
            autoFlagsRef.current.voteTimer = window.setTimeout(async () => {
              try {
                await finalizeRound(id)
              } catch (error) {
                console.error('Automatic finalization failed', error)
              }
              autoFlagsRef.current.voteTimer = null
            }, ms)
          }
        }

        if (boardState.currentRound?.phase === 'guessing' && boardState.currentRound.vote_deadline) {
          const ms = Math.max(0, new Date(boardState.currentRound.vote_deadline).getTime() - Date.now())
          if (autoFlagsRef.current.voteTimer) clearTimeout(autoFlagsRef.current.voteTimer)
          autoFlagsRef.current.voteTimer = window.setTimeout(async () => {
            try {
              await finalizeRound(id)
            } catch (error) {
              console.error('Automatic finalization failed', error)
            }
            autoFlagsRef.current.voteTimer = null
          }, ms)
        }
      })
      setChannel(roomChannel)

      const initialState = await deriveBoardState(id)
      setPlayers(initialState.players)
      if (initialState.room?.created_at) {

        setExpiresInSec(computeExpiry(initialState.room.created_at))
      }
      setSubmissionCount(initialState.submissionCount || 0)
      setSubmittedIds(initialState.submittedPlayerIds || [])
      setRoundDeadline(initialState.currentRound?.deadline || '')
      setCurrentCategory(initialState.currentRound?.category || '')
      setCurrentPrompt(initialState.currentRound ? parsePrompt(initialState.currentRound.prompt) : '')
      setCurrentOwnerId(initialState.currentRound?.owner_id || '')
      setRoundPhase(initialState.currentRound?.phase || '')
      setVoteDeadline(initialState.currentRound?.vote_deadline || '')
      setRoundResults(parseRoundResults(initialState.currentRound?.results))
      setLeaderboards(parseLeaderboards(initialState.room?.leaderboards))
      setRoundIndex(initialState.room?.round_index || 0)
      setTotalRounds(initialState.room?.total_rounds || 6)
      if (initialState.currentRound?.id && (initialState.currentRound.phase === 'guessing' || initialState.currentRound.phase === 'results')) {
        setRevealItems(await getRevealItems(initialState.currentRound.id))
      } else {
        setRevealItems([])
      }
      setCategoriesLocked(initialState.categoriesLocked || 0)

      if (!initialState.currentRound && initialState.categoryPool.length > 0) {
        const category = initialState.categoryPool[0]
        setPreviewCategory(category)
        setPreviewPrompt(getPrompt(category))
      }

      // Set up deadline auto-progression timer
      if (initialState.currentRound?.deadline) {
        const deadline = new Date(initialState.currentRound.deadline).getTime()
        const now = Date.now()
        const timeLeft = deadline - now

        // Clear any existing timer
        if (deadlineTimerRef.current) {
          clearTimeout(deadlineTimerRef.current)
        }

        // Set timer to auto-reveal when deadline expires (if time is left)
        if (timeLeft > 0) {
          deadlineTimerRef.current = window.setTimeout(async () => {
            try {
              console.log('Deadline expired, auto-revealing round...')
              await revealRound(id)
              await startVotePhase(id)
            } catch (e) {
              console.error('Auto-reveal failed:', e)
            }
            deadlineTimerRef.current = null
          }, timeLeft)
        } else if (timeLeft <= 0) {
          // Deadline already expired, trigger immediately
          setTimeout(async () => {
            try {
              console.log('Deadline already expired, auto-revealing round...')
              await revealRound(id)
              await startVotePhase(id)
            } catch (e) {
              console.error('Auto-reveal failed:', e)
            }
          }, 100)
        }
      }

      // Check if round started but no deadline yet
      if (initialState.currentRound && !initialState.currentRound.deadline) {
        setRoundStarted(true)
      } else {
        setRoundStarted(false)
      }


      if (initialState.currentRound?.phase === 'guessing' && initialState.currentRound.vote_deadline) {
        const ms = Math.max(0, new Date(initialState.currentRound.vote_deadline).getTime() - Date.now())
        if (autoFlagsRef.current.voteTimer) clearTimeout(autoFlagsRef.current.voteTimer)
        autoFlagsRef.current.voteTimer = window.setTimeout(async () => {
          try {
            await finalizeRound(id)
          } catch (error) {
            console.error('Automatic finalization failed', error)
          }
          autoFlagsRef.current.voteTimer = null
        }, ms)
      }
    } catch (err) {
      console.error('Error initializing lobby for room:', err)
      setError('Failed to resume room')
    }
  }, [computeExpiry, navigate])

  const handleCreateRoom = async () => {
    setIsLoading(true)
    setError('')

    try {
      const devId = hostDeviceId || 'host-' + Math.random().toString(36).substr(2, 9)
      const { id } = await createRoom(devId)
      setRoomId(id)
      localStorage.setItem('currentRoomId', id)
      navigate(`/lobby?room=${id}`, { replace: true })

      // Show modal for host to join as player
      setShowHostJoinModal(true)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room')
    } finally {
      setIsLoading(false)
    }
  }

  const handleHostJoin = async () => {
    if (!hostName.trim()) {
      setError('Please enter your name')
      return
    }

    setIsJoiningAsHost(true)
    setError('')

    try {
      // Normalize host name capitalization (Title Case)
      const toTitleCase = (s: string) => s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      const properName = toTitleCase(hostName.trim())
      setHostName(properName)
      // Join the room as the host player
      const result = await joinRoom(roomId, properName, hostColor.value)
      setHostPlayerId(result.playerId)
      localStorage.setItem('hostPlayerId', result.playerId)

      // Close modal and show category selection
      setShowHostJoinModal(false)
      setShowHostCategories(true)
      // Remove hostJoin flag from URL to prevent modal on refresh
      window.history.replaceState(null, '', `/lobby?room=${roomId}`)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join as host')
    } finally {
      setIsJoiningAsHost(false)
    }
  }

  const handleSkipHostJoin = async () => {
    try {
      await initLobbyForRoom(roomId)

      // Close modal and show lobby
      setShowHostJoinModal(false)

    } catch (err) {
      console.error('Error setting up lobby:', err)
      setError('Failed to set up lobby')
    }
  }

  const handleHostCategoriesComplete = async () => {
    console.log('Host categories complete, setting up lobby...')

    try {
      await initLobbyForRoom(roomId)
      setShowHostCategories(false)

    } catch (err) {
      console.error('Error setting up lobby after categories:', err)
      setError(`Failed to set up lobby: ${err instanceof Error ? err.message : 'Unknown error'}`)
      // Still close categories even if there's an error
      setShowHostCategories(false)
    }
  }

  // Resume on load if room id is present in URL or storage
  useEffect(() => {
    if (roomId) return
    if (suppressResumeRef.current) return
    const fromUrl = searchParams.get('room')
    const fromStorage = localStorage.getItem('currentRoomId') || ''
    const id = fromUrl || fromStorage
    if (!id) return

    const storedHost = localStorage.getItem('hostPlayerId')
    // If explicitly coming from Create (hostJoin) AND no host player exists yet, show the join modal
    if (hostJoinRequested && !storedHost) {
      setRoomId(id)
      setShowHostJoinModal(true)
      return
    }

    // Otherwise resume normally
    initLobbyForRoom(id)
    if (storedHost) {
      setHostPlayerId(storedHost)
      setShowHostJoinModal(false)
    }
  }, [roomId, searchParams, initLobbyForRoom, hostJoinRequested])

  // Cleanup on unmount
  useEffect(() => {
    const autoFlags = autoFlagsRef.current
    return () => {
      if (channel) {
        unsubscribeFromRoom(channel)
      }
      if (deadlineTimerRef.current) {
        clearTimeout(deadlineTimerRef.current)
        deadlineTimerRef.current = null
      }
      if (autoFlags.voteTimer) {
        clearTimeout(autoFlags.voteTimer)
        autoFlags.voteTimer = null
      }
    }
  }, [channel])

  // Countdown update tick
  useEffect(() => {
    if (!roomId || expiresInSec == null) return
    const t = setInterval(() => {
      setExpiresInSec(prev => (prev == null ? prev : Math.max(0, prev - 1)))
    }, 1000)
    return () => clearInterval(t)
  }, [roomId, expiresInSec])

  // Load resumable rooms for this host (when idle on host page)
  useEffect(() => {
    const load = async () => {
      if (!hostDeviceId || roomId) return
      const { data, error } = await supabase
        .from('rooms')
        .select('id,status,created_at,round_index,total_rounds')
        .eq('host_device_id', hostDeviceId)
        .neq('status', 'ended')
        .order('created_at', { ascending: false })
      if (error) {
        console.error('Error fetching rooms:', error)
        return
      }
      const now = Date.now()
      const fresh = (data || []).filter(r =>
        (now - new Date(r.created_at).getTime()) < 30 * 60 * 1000 &&
        r.round_index < r.total_rounds,
      )
      // Fetch counts for display
      const augmented = await Promise.all(fresh.map(async (r) => {
        const { count } = await supabase
          .from('players')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', r.id)
        return { ...r, playerCount: count || 0, expiresInSec: computeExpiry(r.created_at) }
      }))
      setResumeRooms(augmented)
    }
    load()
  }, [computeExpiry, hostDeviceId, roomId])

  // If host is already a player, resume category selection if not yet chosen
  useEffect(() => {
    if (!hostPlayerId || !roomId) return
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('players')
          .select('selected_categories')
          .eq('id', hostPlayerId)
          .single()
        if (error) return
        const hasSelections = parseStringArray(data?.selected_categories).length > 0
        setShowHostCategories(!hasSelections)
      } catch (error) {
        console.error('Failed to restore host category state', error)
      }
    })()
  }, [hostPlayerId, roomId])

  // Live countdown for timers in the Resume list while open
  useEffect(() => {
    if (!showResumeList) return
    const t = setInterval(() => {
      setResumeRooms(prev => prev.map(r => ({
        ...r,
        expiresInSec: r.expiresInSec != null ? Math.max(0, r.expiresInSec - 1) : r.expiresInSec
      })))
    }, 1000)
    return () => clearInterval(t)
  }, [showResumeList])

  const handleLeaveRoom = () => {
    suppressResumeRef.current = true
    localStorage.removeItem('currentRoomId')
    localStorage.removeItem('hostPlayerId')
    if (channel) {
      unsubscribeFromRoom(channel)
      setChannel(null)
    }
    if (deadlineTimerRef.current) {
      clearTimeout(deadlineTimerRef.current)
      deadlineTimerRef.current = null
    }
    // Extra safety: ensure no lingering channels remain
    supabase.getChannels().forEach((roomChannel) => {
      void supabase.removeChannel(roomChannel)
    })
    setRoomId('')
    setPlayers([])
    setQrCode('')
    setShowHostJoinModal(false)
    setShowHostCategories(false)
    // Clear query params immediately and navigate to splash home
    window.history.replaceState(null, '', '/')
    navigate('/', { replace: true })
  }

  // Host Join Modal
  if (showHostJoinModal) {
    return (
      <div className="min-h-screen flex items-start justify-center px-4 py-8 relative overflow-hidden" style={{
        background: 'radial-gradient(ellipse at center, #0f172a 0%, #1e293b 30%, #0f172a 70%, #000 100%)'
      }}>
        {/* Background emoji decorations - scaled for mobile */}
        <div className="absolute top-8 left-6 text-4xl md:text-6xl opacity-20 md:opacity-30">🎭</div>
        <div className="absolute top-16 right-6 text-5xl md:text-7xl opacity-15 md:opacity-25">⭐</div>
        <div className="absolute bottom-32 left-6 text-4xl md:text-6xl opacity-15 md:opacity-20">🎪</div>
        <div className="absolute bottom-8 right-6 text-6xl md:text-8xl opacity-10 md:opacity-15">😵</div>

        <div className="relative z-10 w-full max-w-sm mx-auto" style={{
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(15px)',
          padding: '32px 24px'
        }}>
          <style>{`
            .host-name-input::placeholder {
              color: #fbbf24 !important;
              opacity: 0.9;
              text-shadow: 0 0 8px #fbbf24;
            }
          `}</style>
          <div className="text-center" style={{marginBottom: '4rem'}}>
            <div className="font-medium mb-2" style={{
              color: '#cbd5e1',
              lineHeight: '1.3',
              fontSize: 'clamp(1.75rem, 8vw, 3rem)'
            }}>
              Join your
            </div>
            <div className="mb-2" style={{
              fontSize: '2.5rem',
              fontWeight: '900',
              lineHeight: '0.9',
              letterSpacing: '0.02em'
            }}>
              {/* WHAT - Neon tube style */}
              <span style={{
                color: 'transparent',
                WebkitTextStroke: '2px #00f5ff',
                textShadow: `
                  0 0 8px #00f5ff,
                  0 0 16px #00f5ff,
                  0 0 24px #00f5ff,
                  0 0 32px #00f5ff,
                  inset 0 0 8px #00f5ff
                `,
                filter: 'drop-shadow(0 0 16px #00f5ff)'
              }}>WHAT</span>
              {/* EVER! - Neon tube style */}
              <span style={{
                color: 'transparent',
                WebkitTextStroke: '2px #ff1493',
                textShadow: `
                  0 0 8px #ff1493,
                  0 0 16px #ff1493,
                  0 0 24px #ff1493,
                  0 0 32px #ff1493,
                  inset 0 0 8px #ff1493
                `,
                filter: 'drop-shadow(0 0 16px #ff1493)'
              }}>EVER!</span>
            </div>
            <div className="font-bold mb-4" style={{
              color: '#cbd5e1',
              fontSize: '2rem'
            }}>
              {roomId} game
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded mb-4" style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '2px solid rgba(239, 68, 68, 0.5)',
              color: '#fca5a5',
              boxShadow: '0 0 15px rgba(239, 68, 68, 0.3)'
            }}>
              {error}
            </div>
          )}

          <div style={{marginBottom: '3rem'}}>
            <input
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              className="w-full px-6 py-4 rounded-xl focus:outline-none transition-all text-center host-name-input"
              style={{
                background: 'rgba(15, 23, 42, 0.9)',
                border: '3px solid rgba(0, 245, 255, 0.4)',
                color: '#fff',
                fontSize: '1.25rem',
                fontWeight: '500',
                minHeight: '56px'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#00f5ff'
                e.target.style.boxShadow = '0 0 20px rgba(0, 245, 255, 0.5)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(0, 245, 255, 0.4)'
                e.target.style.boxShadow = 'none'
              }}
              placeholder="Enter Player Name"
              maxLength={20}
            />
          </div>

          <div style={{marginBottom: '3rem'}}>
            <label className="block font-bold text-center" style={{
              color: '#fbbf24',
              textShadow: '0 0 10px #fbbf24, 0 0 20px #fbbf24',
              fontSize: '1.25rem',
              marginBottom: '2rem'
            }}>
              Choose Your Color
            </label>
            <div className="grid grid-cols-4 gap-3 mb-6">
              {COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => setHostColor(color)}
                  className="p-4 text-3xl transition-all transform active:scale-95"
                  style={{
                    background: 'transparent',
                    border: 'none'
                  }}
                >
                  <div className="mb-2" style={{
                    textShadow: hostColor.name === color.name ? `0 0 15px ${color.hex}, 0 0 30px ${color.hex}` : 'none'
                  }}>{color.value}</div>
                  <div className="text-sm font-medium" style={{
                    color: hostColor.name === color.name ? color.hex : '#cbd5e1',
                    textShadow: hostColor.name === color.name ? `0 0 10px ${color.hex}, 0 0 20px ${color.hex}` : 'none'
                  }}>{color.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5 mt-8">
            <button
              onClick={handleHostJoin}
              disabled={isJoiningAsHost || !hostName.trim()}
              className="w-full py-5 px-6 rounded-2xl font-bold text-lg transition-all active:scale-95"
              style={{
                backgroundColor: isJoiningAsHost || !hostName.trim()
                  ? 'rgba(107, 114, 128, 0.3)'
                  : 'rgba(255, 20, 147, 0.3)',
                color: 'white',
                border: isJoiningAsHost || !hostName.trim()
                  ? '2px solid rgba(107, 114, 128, 0.3)'
                  : '2px solid #ff1493',
                cursor: isJoiningAsHost || !hostName.trim() ? 'not-allowed' : 'pointer',
                minHeight: '64px'
              }}
              onMouseEnter={(e) => {
                if (!isJoiningAsHost && hostName.trim()) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 20, 147, 0.5)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isJoiningAsHost && hostName.trim()) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 20, 147, 0.3)'
                }
              }}
            >
              {isJoiningAsHost ? 'JOINING...' : 'JOIN & OPEN LOBBY!'}
            </button>

            <button
              onClick={handleSkipHostJoin}
              disabled={isJoiningAsHost}
              className="w-full py-4 px-6 rounded-2xl font-semibold text-base transition-all active:scale-95"
              style={{
                backgroundColor: isJoiningAsHost
                  ? 'rgba(107, 114, 128, 0.3)'
                  : 'rgba(0, 245, 255, 0.3)',
                color: 'white',
                border: isJoiningAsHost
                  ? '2px solid rgba(107, 114, 128, 0.3)'
                  : '2px solid #00f5ff',
                opacity: isJoiningAsHost ? 0.5 : 1,
                cursor: isJoiningAsHost ? 'not-allowed' : 'pointer',
                minHeight: '56px'
              }}
              onMouseEnter={(e) => {
                if (!isJoiningAsHost) {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 245, 255, 0.5)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isJoiningAsHost) {
                  e.currentTarget.style.backgroundColor = 'rgba(0, 245, 255, 0.3)'
                }
              }}
            >
              Skip - Just Open Lobby
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Host Category Selection
  if (showHostCategories) {
    return (
      <CategoryOptIn
        playerId={hostPlayerId}
        roomId={roomId}
        onComplete={handleHostCategoriesComplete}
      />
    )
  }

  if (!roomId) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-8">Host a Game</h1>
          {error && (
            <div className="bg-red-600 text-white p-4 rounded mb-4">
              {error}
            </div>
          )}
          <button
            onClick={handleCreateRoom}
            disabled={isLoading}
            className="bg-teal-600 hover:bg-teal-700 text-white px-8 py-3 rounded-lg text-xl font-semibold disabled:opacity-50 border-2 border-teal-500"
          >
            {isLoading ? 'CREATING ROOM...' : 'START GAME'}
          </button>
          {resumeRooms.length > 0 && (
            <button
              onClick={() => setShowResumeList(true)}
              className="ml-4 bg-purple-800 hover:bg-purple-900 text-white px-6 py-3 rounded-lg text-xl font-semibold border-2 border-purple-700"
            >
              RESUME ROOM
            </button>
          )}

          {showResumeList && (
            <div className="mt-8 bg-gray-800 text-left text-white p-4 rounded-lg max-w-xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-bold">Your Rooms</h2>
                <button onClick={() => setShowResumeList(false)} className="text-gray-300 hover:text-white">Close</button>
              </div>
              {resumeRooms.length === 0 ? (
                <p className="text-gray-400">No rooms to resume.</p>
              ) : (
                <div className="space-y-2">
                  {resumeRooms.map(r => (
                    <div key={r.id} className="flex items-center justify-between bg-gray-700 p-3 rounded">
                      <div>
                        <div className="font-semibold">Room {r.id} <span className="text-sm text-gray-300">({r.status})</span></div>
                        <div className="text-sm text-gray-300">
                          Players: {r.playerCount ?? 0}
                          {r.status === 'lobby' && typeof r.expiresInSec === 'number' && (
                            <>
                              {' '}• auto-deletes in {Math.floor(r.expiresInSec / 60)}:{String(r.expiresInSec % 60).padStart(2, '0')}
                            </>
                          )}
                        </div>
                      </div>
                      <button onClick={() => { setShowResumeList(false); localStorage.setItem('currentRoomId', r.id); initLobbyForRoom(r.id) }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Resume</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const owner = players.find((player) => player.id === currentOwnerId)
  const ownerAnswer = revealItems.find((item) => item.id === roundResults.ownerAnswerId)
  const topVoteCount = Math.max(0, ...Object.values(roundResults.voteCounts))
  const crowdFavourites = revealItems.filter(
    (item) => topVoteCount > 0 && roundResults.voteCounts[item.id] === topVoteCount,
  )
  const rank = (scores: Record<string, number>) => players
    .map((player) => ({ ...player, score: scores[player.id] || 0 }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  const chameleonRanking = rank(leaderboards.chameleon)
  const crowdRanking = rank(leaderboards.crowd)
  const gameComplete = roundIndex >= totalRounds
  const chameleonHighScore = chameleonRanking[0]?.score ?? 0
  const crowdHighScore = crowdRanking[0]?.score ?? 0
  const chameleonChampions = chameleonRanking.filter((player) => player.score === chameleonHighScore)
  const crowdChampions = crowdRanking.filter((player) => player.score === crowdHighScore)

  return (
    <div className="whatever-stage min-h-screen p-5 text-[#f3efe4] md:p-8">
      <div className="mx-auto max-w-5xl text-center">
        <header className="mb-6 flex items-center justify-between border-b border-white/[.07] pb-5 text-left">
          <WhateverMark compact />
          <div><div className="eyebrow text-[#777f89]">Room</div><div className="text-3xl font-black tracking-[-.04em] text-[#e8bd45]">{roomId}</div></div>
        </header>
        {expiresInSec != null && !roundDeadline && (
          <div className="mb-4 text-sm text-[#777f89]">
            Auto-deletes in {Math.floor(expiresInSec / 60)}:{String(expiresInSec % 60).padStart(2, '0')}
          </div>
        )}
        {/* Question view during Submit phase */}
        {(roundStarted || roundDeadline) && roundPhase !== 'guessing' && roundPhase !== 'results' && (
          <div className="tv-frame mb-8 rounded-[1.75rem] p-7 text-left">
            <div className="eyebrow text-[#e8bd45]">Round {roundIndex + 1} of {totalRounds}</div>
            <div className="mt-2 text-sm font-bold uppercase tracking-[.16em] text-[#747d88]">
              {(currentCategory || previewCategory) ? (currentCategory || previewCategory).replaceAll('_',' ') : '—'}
            </div>
            <div className="mt-5 text-3xl font-black leading-tight tracking-[-.04em] text-[#f3efe4] md:text-5xl">
              {currentPrompt || previewPrompt || '—'}
            </div>
            {!roundDeadline ? (
              <div className="mt-4 flex items-center justify-between text-gray-200">
                {!roundStarted ? (
                  <>
                    <div className="text-gray-300">Press Start to begin the round.</div>
                    <button
                      onClick={async () => {
                        try {
                          if (players.length < 3 || categoriesLocked === 0) return
                          const opts = previewCategory && previewPrompt ? { category: previewCategory, promptText: previewPrompt } : undefined
                          await startRound(roomId, opts)

                          // If host is also a player, redirect them to mobile player view
                          if (hostPlayerId) {
                            // Open player view in a new tab/window so host can keep lobby open
                            window.open(`/join?room=${roomId}`, '_blank')
                          }
                        } catch (e) {
                          console.error('Failed to start round', e)
                        }
                      }}
                      disabled={players.length < 3 || categoriesLocked === 0}
                      className={`px-5 py-2 rounded font-semibold text-white ${
                        players.length < 3
                          ? 'bg-gray-600 cursor-not-allowed opacity-60'
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {players.length < 3 ? `Need ${3 - players.length} more` : (categoriesLocked === 0 ? 'Pick shared categories' : 'Start Game')}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-gray-300">Round ready! Begin countdown when all players are ready.</div>
                    <button
                      onClick={async () => {
                        try {
                          await beginRoundCountdown(roomId)
                        } catch (e) {
                          console.error('Failed to begin countdown', e)
                        }
                      }}
                      className="px-5 py-2 rounded font-semibold text-white bg-orange-600 hover:bg-orange-700"
                    >
                      Start
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-4 flex items-center justify-between text-gray-200">
                <div>
                  Waiting for responses…
                  <span className="ml-2 text-sm text-gray-300">Submissions: <span className="font-semibold">{submissionCount}</span> / {players.length}</span>
                </div>
                <CountdownClock deadline={roundDeadline} totalSeconds={60} label="Answer" />
              </div>
            )}
          </div>
        )}

        {/* Grid area: If in Question view, show only Players with ticks; otherwise show QR + Players */}
        {roundPhase === 'guessing' ? (
          <div className="tv-frame mb-8 overflow-hidden rounded-[1.75rem] text-left">
            <div className="border-b border-white/[.07] px-8 py-6 text-center">
              <div className="eyebrow text-[#35d8e6]">Round {roundIndex + 1} · The reveal</div>
              <h2 className="mt-3 text-3xl font-black tracking-[-.045em] md:text-5xl">Which answer sounds like {owner?.name || 'the Round Owner'}?</h2>
              <p className="mt-3 text-[#9da4ae]">Players are guessing the owner and choosing the answer they loved most.</p>
              {voteDeadline && <div className="mt-4 flex justify-center"><CountdownClock deadline={voteDeadline} totalSeconds={20} label="Vote" /></div>}
            </div>
            <div className="grid gap-4 p-6 md:grid-cols-2">
              {revealItems.map((item, index) => (
                <div key={item.id} className="paper-slip rounded-2xl p-5">
                  <div className="mb-3 text-xs font-black uppercase tracking-[0.25em] text-[#b52c72]">Answer {index + 1}</div>
                  <p className="text-xl font-semibold leading-snug">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : roundPhase === 'results' ? (
          <div className="tv-frame mb-8 overflow-hidden rounded-[1.75rem]">
            <div className="border-b border-white/[.07] px-8 py-7 text-center">
              <div className="eyebrow text-[#e8bd45]">{gameComplete ? 'Final results' : `Round ${roundIndex} results`}</div>
              <h2 className="mt-3 text-4xl font-black tracking-[-.045em] md:text-6xl">{owner?.avatar} {owner?.name || 'The Round Owner'}</h2>
              <p className="mt-2 text-lg text-slate-300">was hiding in plain sight</p>
            </div>

            <div className="grid gap-5 p-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-6">
                <div className="text-xs font-black uppercase tracking-[0.25em] text-cyan-300">The owner's answer</div>
                <p className="mt-3 text-2xl font-bold leading-snug">“{ownerAnswer?.text || 'Answer unavailable'}”</p>
                <p className="mt-4 text-sm text-slate-300">
                  {roundResults.correctGuessers.length} {roundResults.correctGuessers.length === 1 ? 'player saw' : 'players saw'} through the disguise.
                  {roundResults.ownerSweetSpot ? ` ${owner?.name || 'The owner'} hit the sweet spot and earned 3 Chameleon points.` : ''}
                </p>
              </div>

              <div className="rounded-2xl border border-amber-300/25 bg-amber-300/5 p-6">
                <div className="text-xs font-black uppercase tracking-[0.25em] text-amber-300">Crowd favourite</div>
                {crowdFavourites.length > 0 ? crowdFavourites.map((item) => (
                  <p key={item.id} className="mt-3 text-2xl font-bold leading-snug">“{item.text}”</p>
                )) : <p className="mt-3 text-xl text-slate-300">No favourite emerged this round.</p>}
                {topVoteCount > 0 && <p className="mt-4 text-sm text-slate-300">{topVoteCount} {topVoteCount === 1 ? 'vote' : 'votes'}</p>}
              </div>
            </div>

            <div className="grid gap-5 px-6 pb-6 md:grid-cols-2">
              {[{ title: 'Chameleon', accent: 'text-cyan-300', rows: chameleonRanking }, { title: 'Crowd', accent: 'text-fuchsia-300', rows: crowdRanking }].map((board) => (
                <div key={board.title} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <h3 className={`text-xl font-black uppercase tracking-[0.2em] ${board.accent}`}>{board.title}</h3>
                  <div className="mt-4 space-y-2">
                    {board.rows.map((player, index) => (
                      <div key={player.id} className="flex items-center gap-3 rounded-xl bg-black/20 px-4 py-3">
                        <span className="w-6 text-sm font-bold text-slate-400">{index + 1}</span>
                        <span className="text-xl">{player.avatar}</span>
                        <span className="flex-1 font-semibold">{player.name}</span>
                        <span className="text-xl font-black">{player.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {gameComplete && (
              <div className="mx-6 mb-6 grid gap-4 rounded-2xl border border-amber-300/30 bg-amber-300/5 p-6 text-center md:grid-cols-2">
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">Chameleon champion{chameleonChampions.length > 1 ? 's' : ''}</div>
                  <div className="mt-2 text-2xl font-black">{chameleonChampions.map((player) => `${player.avatar} ${player.name}`).join(' & ')}</div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-fuchsia-300">Crowd favourite{crowdChampions.length > 1 ? 's' : ''}</div>
                  <div className="mt-2 text-2xl font-black">{crowdChampions.map((player) => `${player.avatar} ${player.name}`).join(' & ')}</div>
                </div>
              </div>
            )}

            <div className="border-t border-white/10 p-6 text-center">
              {gameComplete ? (
                <div>
                  <div className="text-2xl font-black text-amber-300">Game complete</div>
                  <p className="mt-2 text-sm text-slate-400">Six rounds finished. Thanks for playing!</p>
                  <button
                    onClick={handleLeaveRoom}
                    className="mt-5 rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-bold text-white hover:bg-white/15"
                  >
                    Back to title
                  </button>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      setError('')
                      await startRound(roomId)
                    } catch (nextRoundError) {
                      setError(nextRoundError instanceof Error ? nextRoundError.message : 'Failed to start the next round')
                    }
                  }}
                  className="rounded-2xl border-2 border-fuchsia-400 bg-fuchsia-500/20 px-8 py-4 text-xl font-black text-white transition hover:bg-fuchsia-500/35 active:scale-95"
                >
                  Next round →
                </button>
              )}
            </div>
          </div>
        ) : (roundStarted || roundDeadline) ? (
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="hidden md:block" />
            <div className="bg-gray-800 p-6 rounded-lg">
              <h2 className="text-xl font-bold text-white mb-4">Players ({players.length}/8)</h2>
              <div className="space-y-2">
                {players.map((player) => {
                  const submitted = submittedIds.includes(player.id)
                  return (
                    <div key={player.id} className="flex items-center space-x-3 p-3 bg-gray-700 rounded">
                      <span className="text-3xl">{player.avatar}</span>
                      <div className="flex-1">
                        <span className="text-white font-medium text-lg capitalize">{player.name}</span>
                      </div>
                      <span className={submitted ? 'text-green-400' : 'text-gray-400'}>{submitted ? '✓' : '•'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="material-panel rounded-[1.75rem] p-6">
              <div className="eyebrow mb-4 text-[#e8bd45]">Scan to join</div>
              {qrCode && (<div className="mx-auto w-fit rounded-[1.4rem] bg-[#f3efe4] p-3"><img src={qrCode} alt="QR Code" className="max-w-56" /></div>)}
              <p className="mt-3 text-sm text-[#7f8792]">Or open {window.location.origin}/join?room={roomId}</p>
            </div>
            <div className="material-panel rounded-[1.75rem] p-6 text-left">
              <div className="eyebrow mb-4 text-[#35d8e6]">Players · {players.length}/8</div>
              <div className="space-y-2">
                {players.map((player) => (
                  <div key={player.id} className="flex items-center space-x-3 rounded-2xl border border-white/[.06] bg-black/20 p-3">
                    <span className="text-3xl">{player.avatar}</span>
                    <div className="flex-1">
                      <span className="text-white font-medium text-lg capitalize">{player.name}</span>
                    </div>
                    {player.connected ? (
                      <span className="text-green-400 text-sm">● Online</span>
                    ) : (
                      <span className="text-red-400 text-sm">● Offline</span>
                    )}
                  </div>
                ))}
                {players.length === 0 && (<p className="text-gray-400">Waiting for players to join...</p>)}
              </div>
              <div className="mt-4 flex items-center justify-end">
                {players.length < 3 ? (
                  <button className="bg-gray-500 text-gray-300 px-6 py-2 rounded font-semibold cursor-not-allowed" disabled>
                    Need {3 - players.length} more
                  </button>
                ) : categoriesLocked === 0 ? (
                  <button className="bg-gray-500 text-gray-300 px-6 py-2 rounded font-semibold cursor-not-allowed" disabled>
                    Pick shared categories
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      try {
                        const opts = previewCategory && previewPrompt ? { category: previewCategory, promptText: previewPrompt } : undefined
                        await startRound(roomId, opts)
                      } catch (e) {
                        console.error('Failed to start round', e)
                      }
                    }}
                    className="rounded-full bg-[#f24b9d] px-6 py-3 font-black text-[#170a12] transition hover:bg-[#ff6aae]"
                  >
                    Start
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {!roundDeadline && (
          <button onClick={handleLeaveRoom} className="mb-6 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded">Leave Room</button>
        )}
        {expiresInSec != null && expiresInSec <= 300 && (
          <div className="mb-4 p-4 bg-yellow-200 text-yellow-900 rounded-lg">
            This room will auto-delete in {Math.floor(expiresInSec / 60)}:{String(expiresInSec % 60).padStart(2, '0')} unless activity resumes.
          </div>
        )}

      </div>
    </div>
  )
}
