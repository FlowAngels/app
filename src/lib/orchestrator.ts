import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Generate a random room code (4-5 characters)
function generateRoomCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// Create a new room and return the room ID
export async function createRoom(hostDeviceId: string): Promise<{ id: string }> {
  let roomId = generateRoomCode()
  let attempts = 0
  
  // Ensure room code is unique
  while (attempts < 10) {
    const { data: existingRoom } = await supabase
      .from('rooms')
      .select('id')
      .eq('id', roomId)
      .single()
    
    if (!existingRoom) break
    
    roomId = generateRoomCode()
    attempts++
  }
  
  if (attempts >= 10) {
    throw new Error('Could not generate unique room code')
  }
  
  const { data, error } = await supabase
    .from('rooms')
    .insert({
      id: roomId,
      host_device_id: hostDeviceId,
      status: 'lobby'
    })
    .select()
    .single()
  
  if (error) {
    throw new Error(`Failed to create room: ${error.message}`)
  }
  
  return { id: roomId }
}

// Join a room as a player
export async function joinRoom(roomId: string, name: string, avatar: string): Promise<{ playerId: string }> {
  // First check if room exists and is joinable
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, status')
    .eq('id', roomId)
    .single()
  
  if (roomError || !room) {
    throw new Error('Room not found')
  }
  
  if (room.status !== 'lobby') {
    throw new Error('Room is not accepting new players')
  }
  
  // Check if player limit reached (8 max)
  const { count } = await supabase
    .from('players')
    .select('*', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('connected', true)
  
  if (count && count >= 8) {
    throw new Error('Room is full')
  }
  
  // Insert new player
  const { data, error } = await supabase
    .from('players')
    .insert({
      room_id: roomId,
      name: name,
      avatar: avatar,
      connected: true
    })
    .select()
    .single()
  
  if (error) {
    throw new Error(`Failed to join room: ${error.message}`)
  }
  
  // Broadcast room update after successful join
  await broadcast(roomId, 'room:update', { type: 'player_joined', playerId: data.id })
  
  return { playerId: data.id }
}

// Broadcast a message to all clients in a room
export async function broadcast(roomId: string, type: string, payload: any): Promise<void> {
  const channel = supabase.channel(`realtime:room:${roomId}`)
  
  // Subscribe briefly to send message
  channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.send({
        type: 'broadcast',
        event: type,
        payload: payload
      })
      // Don't unsubscribe immediately - let it persist
    }
  })
}

// Derive current board state for a room
export async function deriveBoardState(roomId: string) {
  // Get room info
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()
  
  if (roomError || !room) {
    throw new Error('Room not found')
  }
  
  // Get all players in room
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at')
  
  if (playersError) {
    throw new Error('Failed to fetch players')
  }
  
  // Get current round if any
  const { data: currentRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  return {
    room,
    players: players || [],
    currentRound,
    playerCount: players?.length || 0
  }
}

// Subscribe to room updates
export function subscribeToRoom(roomId: string, callback: (payload: any) => void): RealtimeChannel {
  const channel = supabase.channel(`realtime:room:${roomId}`)
  
  channel
    .on('broadcast', { event: 'room:update' }, callback)
    .on('broadcast', { event: 'round:*' }, callback)
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'players',
        filter: `room_id=eq.${roomId}`
      }, 
      async () => {
        // When players change, broadcast updated state
        const boardState = await deriveBoardState(roomId)
        channel.send({
          type: 'broadcast',
          event: 'room:update',
          payload: boardState
        })
      }
    )
    .subscribe()
  
  return channel
}

// Unsubscribe from room updates
export function unsubscribeFromRoom(channel: RealtimeChannel): void {
  supabase.removeChannel(channel)
}