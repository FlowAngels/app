import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getPrompt } from './prompts'

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
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  
  // Compute category intersection
  const categoryPool = await computeCategoryIntersection(roomId)

  // Submission info for current round (if any)
  let submissionCount = 0
  let submittedPlayerIds: string[] = []
  let currentSubmissions: { id: string; text: string; player_id: string }[] = []
  if (currentRound?.id) {
    const { count } = await supabase
      .from('submissions')
      .select('*', { count: 'exact', head: true })
      .eq('round_id', currentRound.id)
    submissionCount = count || 0
    const { data: submitted } = await supabase
      .from('submissions')
      .select('player_id')
      .eq('round_id', currentRound.id)
    submittedPlayerIds = (submitted || []).map((s: any) => s.player_id)
    const { data: subs } = await supabase
      .from('submissions')
      .select('id, text, player_id')
      .eq('round_id', currentRound.id)
    currentSubmissions = (subs || []) as any
  }
  
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
    categoriesLocked: categoryPool.length,
    submissionCount,
    submittedPlayerIds,
    currentSubmissions
  }
}

// Subscribe to room updates
export function subscribeToRoom(roomId: string, callback: (payload: unknown) => void): RealtimeChannel {
  const channel = getOrCreateRoomChannel(roomId)

  // Attach listeners
  channel
    .on('broadcast', { event: 'room:update' }, callback)
    .on('broadcast', { event: 'round:*' }, callback)
    .on('broadcast', { event: 'round:start' }, callback)
    .on('broadcast', { event: 'round:submit' }, callback)
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

// Start a new round: pick a category and set deadline now+60s
export async function startRound(roomId: string, opts?: { category?: string; promptText?: string }): Promise<{ roundId: string }> {
  // Get room and category pool
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .select('id, category_pool, round_index')
    .eq('id', roomId)
    .single()
  if (roomErr || !room) throw new Error('Room not found')
  const pool: string[] = Array.isArray(room.category_pool) ? room.category_pool : []
  if (pool.length === 0 && !opts?.category) throw new Error('No categories available')
  const category = opts?.category || pool[0]

  // Choose round owner by rotation among connected players (sorted by name)
  const { data: pl } = await supabase
    .from('players')
    .select('id,name')
    .eq('room_id', roomId)
    .eq('connected', true)
  const sortedPl = (pl || []).slice().sort((a:any,b:any)=> (a?.name||'').localeCompare(b?.name||'', undefined, {sensitivity:'base'}))
  const idx = Math.max(0, (room as any).round_index || 0) % Math.max(1, sortedPl.length || 1)
  const ownerId = sortedPl.length > 0 ? sortedPl[idx].id : null

  // Insert round with 60s submission deadline
  const deadline = new Date(Date.now() + 60 * 1000).toISOString()
  const promptText = opts?.promptText || getPrompt(category)
  const { data: round, error: roundErr } = await supabase
    .from('rounds')
    .insert({ room_id: roomId, category, prompt: { text: promptText }, deadline, owner_id: ownerId })
    .select('*')
    .single()
  if (roundErr || !round) throw new Error('Failed to start round')

  // Update room status
  await supabase.from('rooms').update({ status: 'inRound' }).eq('id', roomId)

  // Broadcast round start
  await broadcast(roomId, 'round:start', { roundId: round.id, category, deadline, prompt: promptText })
  return { roundId: round.id }
}

// Submit an answer for the current round
export async function submitAnswer(roundId: string, playerId: string, text: string): Promise<void> {
  const trimmed = (text || '').trim()
  if (trimmed.length === 0 || trimmed.length > 100) {
    throw new Error('Answer must be 1-100 characters')
  }
  const { error } = await supabase
    .from('submissions')
    .insert({ round_id: roundId, player_id: playerId, text: trimmed })
  if (error) throw new Error(error.message)

  // Broadcast a submit event to update host UI promptly
  const { data: r } = await supabase
    .from('rounds')
    .select('room_id')
    .eq('id', roundId)
    .single()
  if (r?.room_id) {
    await broadcast(r.room_id, 'round:submit', { playerId })
  }
}

// Reveal: shuffle submissions and store reveal_order; broadcast anonymized texts
export async function revealRound(roomId: string): Promise<{ items: { id: string; text: string }[] }> {
  // Find latest round
  const { data: round } = await supabase
    .from('rounds')
    .select('id')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (!round) throw new Error('No round to reveal')

  const { data: subs } = await supabase
    .from('submissions')
    .select('id, text')
    .eq('round_id', round.id)

  const items = (subs || []).map(s => ({ id: s.id, text: s.text }))
  // Shuffle
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }

  // Save reveal_order
  await supabase
    .from('rounds')
    .update({ reveal_order: items.map(i => i.id) })
    .eq('id', round.id)

  await broadcast(roomId, 'round:reveal', { roundId: round.id, items })
  return { items }
}

// Begin combined Guess+Vote phase (30s)
export async function startVotePhase(roomId: string): Promise<{ voteDeadline: string }> {
  const voteDeadline = new Date(Date.now() + 30 * 1000).toISOString()
  await broadcast(roomId, 'round:vote_start', { voteDeadline })
  return { voteDeadline }
}

// Upsert guess (single) for player
export async function upsertGuess(roundId: string, playerId: string, submissionId: string): Promise<void> {
  // Remove existing guess
  await supabase.from('guesses').delete().eq('round_id', roundId).eq('player_id', playerId)
  // Insert new
  const { error } = await supabase.from('guesses').insert({ round_id: roundId, player_id: playerId, answer_id: submissionId })
  if (error) throw new Error(error.message)
}

// Set votes (replace player's vote set). Allows duplicates to same answer.
export async function setVotes(roundId: string, playerId: string, submissionIds: string[]): Promise<void> {
  // Ensure at most 2 items
  const ids = submissionIds.slice(0, 2)
  // Replace set
  await supabase.from('votes').delete().eq('round_id', roundId).eq('player_id', playerId)
  if (ids.length === 0) return
  const rows = ids.map(id => ({ round_id: roundId, player_id: playerId, answer_id: id }))
  const { error } = await supabase.from('votes').insert(rows)
  if (error) throw new Error(error.message)
}

// Finalize results and update leaderboards
export async function finalizeRound(roomId: string): Promise<{ ownerAnswerId: string | null; correctGuessers: string[]; voteCounts: Record<string, number> }> {
  // Load round
  const { data: round } = await supabase
    .from('rounds')
    .select('id, owner_id')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (!round) throw new Error('No round found')

  // Submissions map
  const { data: subs } = await supabase
    .from('submissions')
    .select('id, player_id')
    .eq('round_id', round.id)
  const subById = new Map((subs || []).map(s => [s.id, s.player_id]))

  // Owner answer id
  let ownerAnswerId: string | null = null
  for (const s of subs || []) {
    if (s.player_id === round.owner_id) { ownerAnswerId = s.id; break }
  }

  // Correct guessers
  const { data: guesses } = await supabase
    .from('guesses')
    .select('player_id, answer_id')
    .eq('round_id', round.id)
  const correctGuessers = (guesses || [])
    .filter(g => ownerAnswerId && g.answer_id === ownerAnswerId)
    .map(g => g.player_id)

  // Vote counts per submission id
  const { data: votes } = await supabase
    .from('votes')
    .select('answer_id')
    .eq('round_id', round.id)
  const voteCounts: Record<string, number> = {}
  for (const v of votes || []) {
    voteCounts[v.answer_id] = (voteCounts[v.answer_id] || 0) + 1
  }

  // Update rounds.results JSON
  await supabase
    .from('rounds')
    .update({ results: { ownerAnswerId, correctGuessers, voteCounts } })
    .eq('id', round.id)

  // Update leaderboards in rooms
  const { data: room } = await supabase
    .from('rooms')
    .select('leaderboards')
    .eq('id', roomId)
    .single()
  const lb = (room?.leaderboards as any) || { chameleon: {}, crowd: {} }
  // Chameleon: +1 per correct guesser
  for (const pid of correctGuessers) {
    lb.chameleon[pid] = (lb.chameleon[pid] || 0) + 1
  }
  // Crowd: +1 per vote goes to the answer's owner
  for (const [answerId, count] of Object.entries(voteCounts)) {
    const ownerPid = subById.get(answerId)
    if (!ownerPid) continue
    lb.crowd[ownerPid] = (lb.crowd[ownerPid] || 0) + (count as number)
  }
  await supabase
    .from('rooms')
    .update({ leaderboards: lb, status: 'results', round_index: ((room as any).round_index || 0) + 1 })
    .eq('id', roomId)

  await broadcast(roomId, 'round:results', { ownerAnswerId, correctGuessers, voteCounts })
  return { ownerAnswerId, correctGuessers, voteCounts }
}
