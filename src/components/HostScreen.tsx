import { useState, useEffect } from 'react'
import { subscribeToRoom, unsubscribeFromRoom } from '../lib/orchestrator'
import type { RealtimeChannel } from '@supabase/supabase-js'

export default function HostScreen() {
  const [messages, setMessages] = useState<string[]>([])
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  useEffect(() => {
    // Subscribe to room updates for testing
    const roomChannel = subscribeToRoom('TEST', (payload) => {
      console.log('Host received:', payload)
      setMessages(prev => [...prev, `Host: ${JSON.stringify(payload)}`])
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
      <h1 className="text-3xl font-bold text-blue-600 mb-4">Host Screen (TEST room)</h1>
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
        Open /join in another tab to test realtime communication
      </p>
    </div>
  )
}