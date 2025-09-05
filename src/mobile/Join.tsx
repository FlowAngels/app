import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { joinRoom, broadcast } from '../lib/orchestrator'
import { supabase } from '../lib/supabase'
import CategoryOptIn from './CategoryOptIn'

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

  // Mark player as disconnected if they close the tab unexpectedly
  useEffect(() => {
    const handleUnload = () => {
      try {
        const playerId = localStorage.getItem('playerId')
        if (playerId && success !== 'left') {
          // Fire-and-forget; may not always complete but improves accuracy
          supabase
            .from('players')
            .update({ connected: false })
            .eq('id', playerId)
            .then(() => {})
            .catch(() => {})
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

  const fetchTakenColors = useCallback(async () => {
    if (!roomId) return
    
    try {
      const { data: players, error } = await supabase
        .from('players')
        .select('avatar')
        .eq('room_id', roomId)
        .eq('connected', true)
      
      if (error) {
        console.error('Error fetching taken colors:', error)
        return
      }
      
      const taken = players?.map(player => player.avatar) || []
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

  const handleJoin = async () => {
    if (!roomId || !name.trim()) {
      setError('Please enter your name')
      return
    }

    if (takenColors.includes(selectedColor.value)) {
      setError('This color is already taken. Please select another color.')
      return
    }

    setIsJoining(true)
    setError('')
    
    try {
      const result = await joinRoom(roomId, name.trim(), selectedColor.value)
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
        const { error } = await supabase
          .from('players')
          .update({ connected: false })
          .eq('id', playerId)
        if (error) {
          console.error('Error leaving room:', error)
        }
        // Broadcast so host UI updates even if PG changes are not enabled
        if (rid) {
          try { await broadcast(rid, 'room:update', { type: 'player:left', playerId }) } catch {}
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
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-600 mb-4">🎉 Ready to Play!</h1>
          <p className="text-gray-600 mb-4">You've joined the room and selected your categories.</p>
          <p className="text-sm text-gray-500 mb-6">Wait for the host to start the game...</p>
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
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">Join Room: {roomId}</h1>
        {success === 'left' && leftRoomId && (
          <div className="mb-4 p-3 rounded bg-yellow-100 text-yellow-800 text-sm text-center">
            You left Room {leftRoomId}. You can rejoin below.
          </div>
        )}
        
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-blue-500"
            placeholder="Enter your name"
            maxLength={20}
          />
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Choose Your Color
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
                  className={`p-3 text-2xl rounded-lg border-4 transition-all ${
                    isTaken 
                      ? 'border-gray-300 bg-gray-200 opacity-50 cursor-not-allowed'
                      : isSelected
                        ? 'border-gray-800 bg-gray-100 scale-110'
                        : 'border-gray-200 hover:border-gray-400'
                  }`}
                  style={{ borderColor: isSelected && !isTaken ? color.hex : undefined }}
                >
                  {color.value}
                  <div className={`text-xs mt-1 ${isTaken ? 'text-gray-400' : 'text-gray-600'}`}>
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
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isJoining ? 'Joining...' : 'Join Game'}
        </button>
      </div>
    </div>
  )
}
