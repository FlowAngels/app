import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getPrompt } from './prompts'
import { intersectCategorySelections, parseLeaderboards, parseStringArray } from './gameState'
import { scoreRound } from './scoring'
import { ensureAnonymousSession } from './auth'
import { useAuthenticatedCommands } from './backendMode'

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
  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { data, error } = await supabase.rpc('whatever_create_room', {
      p_host_device_id: hostDeviceId,
    })
    if (error || !data) throw new Error(error?.message || 'Failed to create room')
    return { id: data }
  }

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
  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { data, error } = await supabase.rpc('whatever_join_room', {
      p_room_id: roomId,
      p_name: name,
      p_avatar: avatar,
    })
    if (error || !data) throw new Error(error?.message || 'Failed to join room')
    return { playerId: data }
  }

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
  if (useAuthenticatedCommands) await ensureAnonymousSession()
  // Get all connected players in room with their selected categories
  const { data: players, error } = await supabase
    .from('players')
    .select('selected_categories')
    .eq('room_id', roomId)
    .eq('connected', true)
  
  if (error || !players || players.length === 0) {
    return []
  }
  
  const selections = players.map((player) => parseStringArray(player.selected_categories))

  return intersectCategorySelections(selections)
}

// Update room's category pool
export async function updateCategoryPool(roomId: string): Promise<void> {
  if (useAuthenticatedCommands) return
  const categoryPool = await computeCategoryIntersection(roomId)
  
  const { error } = await supabase
    .from('rooms')
    .update({ category_pool: categoryPool })
    .eq('id', roomId)
  
  if (error) {
    throw new Error(`Failed to update category pool: ${error.message}`)
  }
}

export async function setPlayerCategories(
  playerId: string,
  categories: string[],
): Promise<void> {
  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { error } = await supabase.rpc('whatever_set_categories', {
      p_player_id: playerId,
      p_categories: categories,
    })
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabase
    .from('players')
    .update({ selected_categories: categories })
    .eq('id', playerId)
  if (error) throw new Error(error.message)
}

export async function setPlayerConnected(playerId: string, connected: boolean): Promise<void> {
  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { error } = await supabase.rpc('whatever_set_connected', {
      p_player_id: playerId,
      p_connected: connected,
    })
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabase
    .from('players')
    .update({ connected })
    .eq('id', playerId)
  if (error) throw new Error(error.message)
}

// Derive current board state for a room
export async function deriveBoardState(roomId: string) {
  if (useAuthenticatedCommands) await ensureAnonymousSession()
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
    if (useAuthenticatedCommands) {
      const { data, error } = await supabase.rpc('whatever_submission_progress', {
        p_round_id: currentRound.id,
      })
      if (error) throw new Error(error.message)
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        submissionCount = typeof data.count === 'number' ? data.count : 0
        submittedPlayerIds = Array.isArray(data.playerIds)
          ? data.playerIds.filter((id): id is string => typeof id === 'string')
          : []
      }
    } else {
      const { count } = await supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('round_id', currentRound.id)
      submissionCount = count || 0
      const { data: submitted } = await supabase
        .from('submissions')
        .select('player_id')
        .eq('round_id', currentRound.id)
      submittedPlayerIds = (submitted || []).map((submission) => submission.player_id)
      const { data: subs } = await supabase
        .from('submissions')
        .select('id, text, player_id')
        .eq('round_id', currentRound.id)
      currentSubmissions = subs || []
    }
  }
  
  // Sort players alphabetically by name (case-insensitive)
  const sortedPlayers = (players || []).slice().sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
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

export async function getRoomPreview(roomId: string): Promise<{
  id: string
  status: string
  avatars: string[]
  playerCount: number
}> {
  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { data, error } = await supabase.rpc('whatever_room_preview', {
      p_room_id: roomId,
    })
    if (error || typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error(error?.message || 'Room not found')
    }
    return {
      id: typeof data.id === 'string' ? data.id : roomId,
      status: typeof data.status === 'string' ? data.status : '',
      avatars: Array.isArray(data.avatars)
        ? data.avatars.filter((avatar): avatar is string => typeof avatar === 'string')
        : [],
      playerCount: typeof data.playerCount === 'number' ? data.playerCount : 0,
    }
  }
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('id, status')
    .eq('id', roomId)
    .single()
  if (roomError || !room) throw new Error('Room not found')
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('avatar')
    .eq('room_id', roomId)
    .eq('connected', true)
  if (playersError) throw new Error(playersError.message)
  return {
    id: room.id,
    status: room.status,
    avatars: (players || []).map((player) => player.avatar),
    playerCount: players?.length || 0,
  }
}

export async function getRevealItems(roundId: string): Promise<{ id: string; text: string }[]> {
  if (!useAuthenticatedCommands) return []
  await ensureAnonymousSession()
  const { data, error } = await supabase.rpc('whatever_reveal_items', {
    p_round_id: roundId,
  })
  if (error) throw new Error(error.message)
  return Array.isArray(data)
    ? data.filter(
        (item): item is { id: string; text: string } =>
          typeof item === 'object' && item !== null && !Array.isArray(item) &&
          typeof item.id === 'string' && typeof item.text === 'string',
      )
    : []
}

// Subscribe to room updates
export function subscribeToRoom(roomId: string, callback: (payload: unknown) => void): RealtimeChannel {
  const channel = getOrCreateRoomChannel(roomId)

  // Attach listeners
  channel
    .on('broadcast', { event: 'room:update' }, callback)
    .on('broadcast', { event: 'round:*' }, callback)
    .on('broadcast', { event: 'round:start' }, callback)
    .on('broadcast', { event: 'round:countdown_start' }, callback)
    .on('broadcast', { event: 'round:submit' }, callback)
    .on('broadcast', { event: 'categories:update' }, async (payload) => {
      // When category selections change, recompute intersection and let subscribers refresh
      await updateCategoryPool(roomId)
      callback(payload)
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, async () => {
      // Any player change should cause a fresh derive and UI update
      await updateCategoryPool(roomId)
      callback({ type: 'players:changed' })
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, () => {
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
  const pool = parseStringArray(room.category_pool)
  if (pool.length === 0 && !opts?.category) throw new Error('No categories available')
  const category = opts?.category || pool[0]

  const promptText = opts?.promptText || getPrompt(category)
  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { data, error } = await supabase.rpc('whatever_start_round', {
      p_room_id: roomId,
      p_category: category,
      p_prompt_text: promptText,
    })
    if (error || !data) throw new Error(error?.message || 'Failed to start round')
    await broadcast(roomId, 'round:start', { roundId: data, category, prompt: promptText })
    return { roundId: data }
  }

  // Choose round owner by rotation among connected players (sorted by name)
  const { data: pl } = await supabase
    .from('players')
    .select('id,name')
    .eq('room_id', roomId)
    .eq('connected', true)
  const sortedPl = (pl || []).slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  const idx = Math.max(0, room.round_index || 0) % Math.max(1, sortedPl.length || 1)
  const ownerId = sortedPl.length > 0 ? sortedPl[idx].id : null

  // Insert round without deadline initially
  const { data: round, error: roundErr } = await supabase
    .from('rounds')
    .insert({ room_id: roomId, category, prompt: { text: promptText }, owner_id: ownerId })
    .select('*')
    .single()
  if (roundErr || !round) throw new Error('Failed to start round')

  // Update room status
  await supabase.from('rooms').update({ status: 'inRound' }).eq('id', roomId)

  // Broadcast round start (without deadline)
  await broadcast(roomId, 'round:start', { roundId: round.id, category, prompt: promptText })
  return { roundId: round.id }
}

// Begin countdown for the current round (60s submission deadline)
export async function beginRoundCountdown(roomId: string): Promise<{ deadline: string }> {
  // Get current round
  const { data: round, error: roundErr } = await supabase
    .from('rounds')
    .select('id')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  if (roundErr || !round) throw new Error('No active round found')

  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { data, error } = await supabase.rpc('whatever_begin_round', {
      p_round_id: round.id,
    })
    if (error || !data) throw new Error(error?.message || 'Failed to set round deadline')
    await broadcast(roomId, 'round:countdown_start', { roundId: round.id, deadline: data })
    return { deadline: data }
  }

  // Set 60s deadline
  const deadline = new Date(Date.now() + 60 * 1000).toISOString()
  const { error: updateErr } = await supabase
    .from('rounds')
    .update({ deadline })
    .eq('id', round.id)
  if (updateErr) throw new Error('Failed to set round deadline')

  // Broadcast countdown start
  await broadcast(roomId, 'round:countdown_start', { roundId: round.id, deadline })
  return { deadline }
}

// Submit an answer for the current round
export async function submitAnswer(roundId: string, playerId: string, text: string): Promise<void> {
  const trimmed = (text || '').trim()
  if (trimmed.length === 0 || trimmed.length > 100) {
    throw new Error('Answer must be 1-100 characters')
  }
  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { error } = await supabase.rpc('whatever_submit_answer', {
      p_round_id: roundId,
      p_text: trimmed,
    })
    if (error) throw new Error(error.message)
    const { data: round } = await supabase
      .from('rounds')
      .select('room_id')
      .eq('id', roundId)
      .single()
    if (round?.room_id) await broadcast(round.room_id, 'round:submit', { playerId })
    return
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

  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { data, error } = await supabase.rpc('whatever_reveal_round', {
      p_round_id: round.id,
    })
    if (error) throw new Error(error.message)
    const items = Array.isArray(data)
      ? data.filter(
          (item): item is { id: string; text: string } =>
            typeof item === 'object' && item !== null && !Array.isArray(item) &&
            typeof item.id === 'string' && typeof item.text === 'string',
        )
      : []
    await broadcast(roomId, 'round:reveal', { roundId: round.id, items })
    return { items }
  }

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
  if (useAuthenticatedCommands) {
    const { data: round, error } = await supabase
      .from('rounds')
      .select('vote_deadline')
      .eq('room_id', roomId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (error || !round?.vote_deadline) {
      throw new Error(error?.message || 'Vote deadline is missing')
    }
    await broadcast(roomId, 'round:vote_start', { voteDeadline: round.vote_deadline })
    return { voteDeadline: round.vote_deadline }
  }
  const voteDeadline = new Date(Date.now() + 30 * 1000).toISOString()
  await broadcast(roomId, 'round:vote_start', { voteDeadline })
  return { voteDeadline }
}

// Upsert guess (single) for player
export async function upsertGuess(roundId: string, playerId: string, submissionId: string): Promise<void> {
  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { error } = await supabase.rpc('whatever_set_guess', {
      p_round_id: roundId,
      p_answer_id: submissionId,
    })
    if (error) throw new Error(error.message)
    return
  }

  // Remove existing guess
  await supabase.from('guesses').delete().eq('round_id', roundId).eq('player_id', playerId)
  // Insert new
  const { error } = await supabase.from('guesses').insert({ round_id: roundId, player_id: playerId, answer_id: submissionId })
  if (error) throw new Error(error.message)
}

// Set a player's single favourite vote.
export async function setVotes(roundId: string, playerId: string, submissionIds: string[]): Promise<void> {
  const answerId = submissionIds[0]
  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { error } = await supabase.rpc('whatever_set_vote', {
      p_round_id: roundId,
      p_answer_id: answerId || null,
    })
    if (error) throw new Error(error.message)
    return
  }
  // Replace set
  await supabase.from('votes').delete().eq('round_id', roundId).eq('player_id', playerId)
  if (!answerId) return
  const { error } = await supabase.from('votes').insert({
    round_id: roundId,
    player_id: playerId,
    answer_id: answerId,
  })
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

  if (useAuthenticatedCommands) {
    await ensureAnonymousSession()
    const { data, error } = await supabase.rpc('whatever_finalize_round', {
      p_round_id: round.id,
    })
    if (error) throw new Error(error.message)
    const results = data as {
      ownerAnswerId: string | null
      correctGuessers: string[]
      voteCounts: Record<string, number>
    }
    await broadcast(roomId, 'round:results', results)
    return results
  }

  // Submissions map
  const { data: subs } = await supabase
    .from('submissions')
    .select('id, player_id')
    .eq('round_id', round.id)

  const { data: guesses } = await supabase
    .from('guesses')
    .select('player_id, answer_id')
    .eq('round_id', round.id)

  const { data: votes } = await supabase
    .from('votes')
    .select('answer_id')
    .eq('round_id', round.id)

  const { data: room } = await supabase
    .from('rooms')
    .select('leaderboards, round_index')
    .eq('id', roomId)
    .single()
  const { data: players } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', roomId)
    .eq('connected', true)

  if (!round.owner_id) throw new Error('Round owner is missing')
  const scored = scoreRound({
    ownerId: round.owner_id,
    playerIds: (players || []).map((player) => player.id),
    submissions: (subs || []).map((submission) => ({
      id: submission.id,
      playerId: submission.player_id,
    })),
    guesses: (guesses || []).map((guess) => ({
      playerId: guess.player_id,
      answerId: guess.answer_id,
    })),
    votes: (votes || []).map((vote) => ({ answerId: vote.answer_id })),
    leaderboards: parseLeaderboards(room?.leaderboards),
  })

  await supabase.from('rounds').update({ results: scored.results }).eq('id', round.id)

  await supabase
    .from('rooms')
    .update({
      leaderboards: scored.leaderboards,
      status: 'results',
      round_index: (room?.round_index || 0) + 1,
    })
    .eq('id', roomId)

  await broadcast(roomId, 'round:results', scored.results)
  return scored.results
}
