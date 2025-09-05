import { useState, useEffect, useCallback, useRef } from 'react'
import { createRoom, joinRoom, subscribeToRoom, unsubscribeFromRoom, deriveBoardState } from '../lib/orchestrator'
import { generateQRCode } from '../lib/qr'
import CategoryOptIn from '../mobile/CategoryOptIn'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const [showHostJoinModal, setShowHostJoinModal] = useState(false)
  const [showHostCategories, setShowHostCategories] = useState(false)
  const [hostPlayerId, setHostPlayerId] = useState('')
  const [hostName, setHostName] = useState('')
  const [hostColor, setHostColor] = useState({ name: 'Red', value: '🔴', hex: '#ef4444' })
  const [isJoiningAsHost, setIsJoiningAsHost] = useState(false)
  const suppressResumeRef = useRef(false)
  
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

      const roomChannel = subscribeToRoom(id, async () => {
        const boardState = await deriveBoardState(id)
        setPlayers(boardState.players)
        setCategoriesLocked(boardState.categoriesLocked || 0)
        if (boardState.room?.created_at) {
          setExpiresInSec(computeExpiry(boardState.room.created_at))
        }
      })
      setChannel(roomChannel)

      const initialState = await deriveBoardState(id)
      setPlayers(initialState.players)
      setCategoriesLocked(initialState.categoriesLocked || 0)
      if (initialState.room?.created_at) {
        setExpiresInSec(computeExpiry(initialState.room.created_at))
      }
    } catch (err) {
      console.error('Error initializing lobby for room:', err)
      setError('Failed to resume room')
    }
  }, [navigate])

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

    // If explicitly coming from Create (hostJoin), show host join modal instead of initializing lobby
    if (hostJoinRequested) {
      setRoomId(id)
      setShowHostJoinModal(true)
      return
    }

    // Otherwise resume
    initLobbyForRoom(id)
    const storedHost = localStorage.getItem('hostPlayerId')
    if (storedHost) {
      setHostPlayerId(storedHost)
      setShowHostJoinModal(false)
    }
  }, [roomId, searchParams, initLobbyForRoom, hostJoinRequested])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channel) {
        unsubscribeFromRoom(channel)
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
        .select('id,status,created_at')
        .eq('host_device_id', hostDeviceId)
        .neq('status', 'ended')
        .order('created_at', { ascending: false })
      if (error) {
        console.error('Error fetching rooms:', error)
        return
      }
      const now = Date.now()
      const fresh = (data || []).filter(r => (now - new Date(r.created_at).getTime()) < 30 * 60 * 1000)
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
  }, [hostDeviceId, roomId])

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
    // Extra safety: ensure no lingering channels remain
    try {
      // @ts-ignore supabase-js v2 exposes getChannels
      const chans = (supabase as any).getChannels ? (supabase as any).getChannels() : []
      if (Array.isArray(chans)) {
        chans.forEach((ch: any) => {
          try { supabase.removeChannel(ch) } catch {}
        })
      }
    } catch {}
    setRoomId('')
    setPlayers([])
    setQrCode('')
    setCategoriesLocked(0)
    setShowHostJoinModal(false)
    setShowHostCategories(false)
    // Clear query params immediately and navigate to splash home
    try { window.history.replaceState(null, '', '/') } catch {}
    navigate('/', { replace: true })
  }

  // Host Join Modal
  if (showHostJoinModal) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
          <h2 className="text-2xl font-bold text-gray-800 text-center mb-6">
            Join Your Game
          </h2>
          <p className="text-gray-600 text-center mb-6">
            Room <span className="font-bold text-blue-600">{roomId}</span> created! 
            Enter your details to join as a player.
          </p>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Your Name
            </label>
            <input
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              className="w-full px-3 py-3 border rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="Enter your name"
              maxLength={20}
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Choose Your Color
            </label>
            <div className="grid grid-cols-4 gap-2">
              {COLORS.map((color) => (
                <button
                  key={color.name}
                  onClick={() => setHostColor(color)}
                  className={`p-3 text-2xl rounded-lg border-4 transition-all ${
                    hostColor.name === color.name
                      ? 'border-gray-800 bg-gray-100 scale-110'
                      : 'border-gray-200 hover:border-gray-400'
                  }`}
                  style={{ borderColor: hostColor.name === color.name ? color.hex : undefined }}
                >
                  {color.value}
                  <div className="text-xs text-gray-600 mt-1">{color.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleHostJoin}
              disabled={isJoiningAsHost || !hostName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isJoiningAsHost ? 'Joining...' : 'Join & Open Lobby'}
            </button>
            
            <button
              onClick={handleSkipHostJoin}
              disabled={isJoiningAsHost}
              className="w-full bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-lg font-medium disabled:opacity-50"
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
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg text-xl font-semibold disabled:opacity-50"
          >
            {isLoading ? 'Creating Room...' : 'Create Room'}
          </button>
          {resumeRooms.length > 0 && (
            <button
              onClick={() => setShowResumeList(true)}
              className="ml-4 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg text-xl font-semibold"
            >
              Resume Room
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

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold text-white mb-1">Room: {roomId}</h1>
        {expiresInSec != null && (
          <div className="text-sm text-gray-400 mb-4">
            Auto-deletes in {Math.floor(expiresInSec / 60)}:{String(expiresInSec % 60).padStart(2, '0')}
          </div>
        )}
        
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* QR Code */}
          <div className="bg-white p-6 rounded-lg">
            <h2 className="text-xl font-bold mb-4">Scan to Join</h2>
            {qrCode && (
              <img src={qrCode} alt="QR Code" className="mx-auto max-w-64" />
            )}
            <p className="text-sm text-gray-600 mt-2">
              Or go to: {window.location.origin}/join?room={roomId}
            </p>
          </div>
          
          {/* Players List */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-xl font-bold text-white mb-4">
              Players ({players.length}/8)
            </h2>
            <div className="space-y-2">
              {players.map((player) => (
                <div key={player.id} className="flex items-center space-x-3 p-3 bg-gray-700 rounded">
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
              {players.length === 0 && (
                <p className="text-gray-400">Waiting for players to join...</p>
              )}
            </div>
            {players.length >= 3 ? (
              <button className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded font-semibold">
                Start Game ({players.length} players)
              </button>
            ) : (
              <button className="mt-4 bg-gray-500 text-gray-300 px-6 py-2 rounded font-semibold cursor-not-allowed" disabled>
                Need {3 - players.length} more players
              </button>
            )}
          </div>
        </div>
        <button onClick={handleLeaveRoom} className="mb-6 bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded">Leave Room</button>

        {/* Category Status */}
        <div className="mb-4 p-4 bg-gray-800 rounded-lg">
          <h3 className="text-lg font-semibold text-white mb-2">Category Selection</h3>
          <p className="text-gray-300">
            Categories locked: <span className="text-blue-400 font-bold">{categoriesLocked}</span>
          </p>
          <p className="text-sm text-gray-400 mt-1">
            Players must select categories on their phones. Only shared categories will be used in the game.
          </p>
        </div>
        {expiresInSec != null && expiresInSec <= 300 && (
          <div className="mb-4 p-4 bg-yellow-200 text-yellow-900 rounded-lg">
            This room will auto-delete in {Math.floor(expiresInSec / 60)}:{String(expiresInSec % 60).padStart(2, '0')} unless activity resumes.
          </div>
        )}
        
      </div>
    </div>
  )
}
