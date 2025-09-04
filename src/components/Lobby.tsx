import { useState, useEffect } from 'react'
import { createRoom, subscribeToRoom, unsubscribeFromRoom, deriveBoardState } from '../lib/orchestrator'
import { generateQRCode } from '../lib/qr'
import type { RealtimeChannel } from '@supabase/supabase-js'

export default function Lobby() {
  const [roomId, setRoomId] = useState<string>('')
  const [qrCode, setQrCode] = useState<string>('')
  const [players, setPlayers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>('')
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  const handleCreateRoom = async () => {
    setIsLoading(true)
    setError('')
    
    try {
      const hostDeviceId = 'host-' + Math.random().toString(36).substr(2, 9)
      const { id } = await createRoom(hostDeviceId)
      setRoomId(id)
      
      // Generate QR code for join URL
      const joinUrl = `${window.location.origin}/join?room=${id}`
      const qrDataUrl = await generateQRCode(joinUrl)
      setQrCode(qrDataUrl)
      
      // Subscribe to room updates
      const roomChannel = subscribeToRoom(id, async () => {
        const boardState = await deriveBoardState(id)
        setPlayers(boardState.players)
      })
      setChannel(roomChannel)
      
      // Get initial state
      const initialState = await deriveBoardState(id)
      setPlayers(initialState.players)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room')
    } finally {
      setIsLoading(false)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channel) {
        unsubscribeFromRoom(channel)
      }
    }
  }, [channel])

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
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto text-center">
        <h1 className="text-4xl font-bold text-white mb-4">Room: {roomId}</h1>
        
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
                    <span className="text-white font-medium text-lg">{player.name}</span>
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
        
        <p className="text-gray-400">
          {players.length < 3 ? `Need ${3 - players.length} more players to start` : 'Ready to start!'}
        </p>
      </div>
    </div>
  )
}