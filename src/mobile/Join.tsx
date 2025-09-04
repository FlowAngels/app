import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { joinRoom } from '../lib/orchestrator'

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
  const roomId = searchParams.get('room')
  const [name, setName] = useState('')
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const [isJoining, setIsJoining] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleJoin = async () => {
    if (!roomId || !name.trim()) {
      setError('Please enter your name')
      return
    }

    setIsJoining(true)
    setError('')
    
    try {
      const result = await joinRoom(roomId, name.trim(), selectedColor.value)
      setSuccess(`Welcome ${name.trim()}! You're ${selectedColor.name} ${selectedColor.value}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room')
    } finally {
      setIsJoining(false)
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

  if (success) {
    return (
      <div className="min-h-screen bg-green-50 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-green-600 mb-4">🎉 Joined Successfully!</h1>
          <p className="text-gray-600 mb-4">{success}</p>
          <p className="text-sm text-gray-500">Wait for the host to start the game...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">Join Room: {roomId}</h1>
        
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
            {COLORS.map((color) => (
              <button
                key={color.name}
                onClick={() => setSelectedColor(color)}
                className={`p-3 text-2xl rounded-lg border-4 transition-all ${
                  selectedColor.name === color.name
                    ? 'border-gray-800 bg-gray-100 scale-110'
                    : 'border-gray-200 hover:border-gray-400'
                }`}
                style={{ borderColor: selectedColor.name === color.name ? color.hex : undefined }}
              >
                {color.value}
                <div className="text-xs text-gray-600 mt-1">{color.name}</div>
              </button>
            ))}
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