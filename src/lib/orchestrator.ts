import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// Keep a per-room channel so we can reliably send/receive
const roomChannels = new Map<string, RealtimeChannel>()
const channelSubscribed = new Map<string, boolean>()

function getOrCreateRoomChannel(roomId: string): RealtimeChannel {
  let channel = roomChannels.get(roomId)
  if (!channel) {
    channel = supabase.channel(`realtime:room:${roomId}`)
    roomChannels.set(roomId, channel)
    channelSubscribed.set(roomId, false)
  }
  return channel
}

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
  
  const { error } = await supabase
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
  
  // Notify listeners as a resilience path in addition to Postgres changes
  setTimeout(async () => {
    try {
      const boardState = await deriveBoardState(roomId)
      await broadcast(roomId, 'room:update', boardState)
    } catch (e) {
      console.error('broadcast after join failed', e)
    }
  }, 100)

  return { playerId: data.id }
}

// Broadcast a message to all clients in a room
export async function broadcast(roomId: string, type: string, payload: unknown): Promise<void> {
  // Use the shared channel name that subscribers are listening to
  const channel = getOrCreateRoomChannel(roomId)

  // Ensure channel is subscribed before sending
  if (!channelSubscribed.get(roomId)) {
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channelSubscribed.set(roomId, true)
          resolve()
        }
      })
    })
  }

  await channel.send({
    type: 'broadcast',
    event: type,
    payload: payload
  })
}

// Compute category intersection for a room
export async function computeCategoryIntersection(roomId: string): Promise<string[]> {
  // Get all connected players in room with their selected categories
  const { data: players, error } = await supabase
    .from('players')
    .select('selected_categories')
    .eq('room_id', roomId)
    .eq('connected', true)
  
  if (error || !players || players.length === 0) {
    return []
  }
  
  // Filter out players who haven't made selections yet
  const playersWithSelections = players.filter(
    player => player.selected_categories && Array.isArray(player.selected_categories) && player.selected_categories.length > 0
  )
  
  if (playersWithSelections.length === 0) {
    return []
  }
  
  // Compute intersection: categories that ALL players selected
  const allCategories = ['headline_hijack', 'law_or_nah', 'meme_mash']
  const intersection = allCategories.filter(category => 
    playersWithSelections.every(player => 
      player.selected_categories.includes(category)
    )
  )
  
  return intersection
}

// Update room's category pool
export async function updateCategoryPool(roomId: string): Promise<void> {
  const categoryPool = await computeCategoryIntersection(roomId)
  
  const { error } = await supabase
    .from('rooms')
    .update({ category_pool: categoryPool })
    .eq('id', roomId)
  
  if (error) {
    throw new Error(`Failed to update category pool: ${error.message}`)
  }
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
    // .order('created_at') // removed: column may not exist in MVP schema
  
  if (playersError) {
    throw new Error('Failed to fetch players')
  }
  
  // Get current round if any
  const { data: currentRound } = await supabase
    .from('rounds')
    .select('*')
    .eq('room_id', roomId)
    // .order('created_at', { ascending: false }) // removed: column may not exist
    .limit(1)
    .single()
  
  // Compute category intersection
  const categoryPool = await computeCategoryIntersection(roomId)
  
  // Sort players alphabetically by name (case-insensitive)
  const sortedPlayers = (players || []).slice().sort((a: any, b: any) =>
    (a?.name || '').localeCompare(b?.name || '', undefined, { sensitivity: 'base' })
  )

  return {
    room,
    players: sortedPlayers,
    currentRound,
    playerCount: players?.length || 0,
    categoryPool,
    categoriesLocked: categoryPool.length
  }
}

// Subscribe to room updates
export function subscribeToRoom(roomId: string, callback: (payload: unknown) => void): RealtimeChannel {
  const channel = getOrCreateRoomChannel(roomId)

  // Attach listeners
  channel
    .on('broadcast', { event: 'room:update' }, callback)
    .on('broadcast', { event: 'round:*' }, callback)
    .on('broadcast', { event: 'categories:update' }, async (payload) => {
      // When category selections change, recompute intersection and let subscribers refresh
      await updateCategoryPool(roomId)
      callback(payload)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, async (_payload) => {
      // Any player change should cause a fresh derive and UI update
      await updateCategoryPool(roomId)
      callback({ type: 'players:changed' })
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, async (_payload) => {
      // Room-level changes (e.g., category_pool) should reflect in UI
      callback({ type: 'rooms:changed' })
    })

  if (!channelSubscribed.get(roomId)) {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelSubscribed.set(roomId, true)
      }
    })
  }

  return channel
}

// Unsubscribe from room updates
export function unsubscribeFromRoom(channel: RealtimeChannel): void {
  // Remove from Supabase and our registries
  supabase.removeChannel(channel)
  for (const [roomId, ch] of roomChannels.entries()) {
    if (ch === channel) {
      roomChannels.delete(roomId)
      channelSubscribed.delete(roomId)
      break
    }
  }
}
