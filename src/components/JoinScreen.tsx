import { useState, useEffect } from 'react'
import { joinRoom, subscribeToRoom, unsubscribeFromRoom } from '../lib/orchestrator'
import type { RealtimeChannel } from '@supabase/supabase-js'

export default function JoinScreen() {
  const [messages, setMessages] = useState<string[]>([])
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)
  const [playerId, setPlayerId] = useState<string>('')

  const handleJoinRoom = async () => {
    try {
      const result = await joinRoom('TEST', `Player${Date.now()}`, '🎮')
      setPlayerId(result.playerId)
      setMessages(prev => [...prev, `Joined as player: ${result.playerId}`])
      
      // Also test direct broadcast
      const testChannel = channel || subscribeToRoom('TEST', () => {})
      await testChannel.send({
        type: 'broadcast',
        event: 'room:update',
        payload: { message: 'Test broadcast from join screen', playerId: result.playerId }
      })
      
    } catch (err) {
      setMessages(prev => [...prev, `Error: ${err instanceof Error ? err.message : 'Failed to join'}`])
    }
  }

  useEffect(() => {
    // Subscribe to room updates for testing
    const roomChannel = subscribeToRoom('TEST', (payload) => {
      console.log('Join received:', payload)
      setMessages(prev => [...prev, `Join: ${JSON.stringify(payload)}`])
    })
    setChannel(roomChannel)

    return () => {
      if (roomChannel) {
        unsubscribeFromRoom(roomChannel)
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold text-green-600 mb-4">Join Screen (TEST room)</h1>
      <button 
        onClick={handleJoinRoom}
        className="bg-green-600 text-white px-6 py-2 rounded mb-4 hover:bg-green-700"
      >
        Join Room TEST
      </button>
      {playerId && (
        <p className="text-green-700 mb-4">Player ID: {playerId}</p>
      )}
      <div className="bg-white p-4 rounded shadow-lg w-full max-w-2xl">
        <h2 className="font-bold mb-2">Realtime Messages:</h2>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {messages.map((msg, idx) => (
            <div key={idx} className="text-sm bg-gray-100 p-2 rounded">
              {msg}
            </div>
          ))}
          {messages.length === 0 && (
            <p className="text-gray-500">Waiting for messages...</p>
          )}
        </div>
      </div>
      <p className="text-gray-600 mt-4 text-center">
        Click "Join Room" to test realtime updates on /host tab
      </p>
    </div>
  )
}