import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// This is an explicit live-environment smoke test, not a CI test. It creates a
// complete temporary game. The printed roomId must be removed afterwards with
// its dependent rows by an authorised operator.

dotenv.config({ path: '.env.local', quiet: true })

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Missing Supabase environment variables')

function client() {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

async function anonymousClient(label) {
  const instance = client()
  const { data, error } = await instance.auth.signInAnonymously()
  if (error) throw new Error(`${label} sign-in failed: ${error.message}`)
  assert.equal(data.user?.is_anonymous, true)
  return instance
}

async function rpc(instance, name, args) {
  const { data, error } = await instance.rpc(name, args)
  if (error) throw new Error(`${name} failed: ${error.message}`)
  return data
}

async function refreshedClient(instance, label) {
  const { data: { session } } = await instance.auth.getSession()
  assert.ok(session?.access_token, `${label} has no access token to restore`)
  assert.ok(session?.refresh_token, `${label} has no refresh token to restore`)
  const replacement = client()
  const { data, error } = await replacement.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  if (error) throw new Error(`${label} refresh failed: ${error.message}`)
  assert.equal(data.user?.id, session.user.id)
  return replacement
}

let host = await anonymousClient('host')
let players = await Promise.all([
  anonymousClient('player 1'),
  anonymousClient('player 2'),
  anonymousClient('player 3'),
])
const outsider = await anonymousClient('outsider')

const roomId = await rpc(host, 'whatever_create_room', {
  p_host_device_id: `live-verify-${crypto.randomUUID()}`,
})
assert.match(roomId, /^[A-Z2-9]{4}$/)

const outsiderPreview = await rpc(outsider, 'whatever_room_preview', { p_room_id: roomId })
assert.equal(outsiderPreview.playerCount, 0)
const outsiderRooms = await outsider.from('rooms').select('id').eq('id', roomId)
assert.equal(outsiderRooms.error, null)
assert.equal(outsiderRooms.data.length, 0)

const names = ['Alex', 'Blair', 'Casey']
const avatars = ['🔴', '🔵', '🟢']
const playerIds = []
for (let index = 0; index < players.length; index += 1) {
  playerIds.push(await rpc(players[index], 'whatever_join_room', {
    p_room_id: roomId,
    p_name: names[index],
    p_avatar: avatars[index],
  }))
  await rpc(players[index], 'whatever_set_categories', {
    p_player_id: playerIds[index],
    p_categories: ['headline_hijack'],
  })
}

const forbiddenWrite = await players[0]
  .from('players')
  .update({ name: 'Impostor' })
  .eq('id', playerIds[1])
assert.ok(forbiddenWrite.error)

await rpc(players[0], 'whatever_set_connected', { p_player_id: playerIds[0], p_connected: false })
players[0] = await refreshedClient(players[0], 'disconnected player')
await rpc(players[0], 'whatever_set_connected', { p_player_id: playerIds[0], p_connected: true })

const ownerOrder = []
let hostPrivateRowsBeforeReveal = 0
for (let roundNumber = 1; roundNumber <= 6; roundNumber += 1) {
  const roundId = await rpc(host, 'whatever_start_round', {
    p_room_id: roomId,
    p_category: 'headline_hijack',
    p_prompt_text: `Live verification round ${roundNumber}: ____`,
  })
  await rpc(host, 'whatever_begin_round', { p_round_id: roundId })

  const submissionIds = []
  for (let index = 0; index < players.length; index += 1) {
    submissionIds.push(await rpc(players[index], 'whatever_submit_answer', {
      p_round_id: roundId,
      p_text: `Round ${roundNumber} secure answer ${index + 1}`,
    }))
  }

  if (roundNumber === 1) {
    players[0] = await refreshedClient(players[0], 'answering player')
  }
  for (let index = 0; index < players.length; index += 1) {
    const ownRows = await players[index]
      .from('submissions')
      .select('id, player_id, text')
      .eq('round_id', roundId)
    assert.equal(ownRows.error, null)
    assert.equal(ownRows.data.length, 1)
    assert.equal(ownRows.data[0].player_id, playerIds[index])
  }
  const hostPrivateRows = await host.from('submissions').select('id').eq('round_id', roundId)
  assert.equal(hostPrivateRows.error, null)
  assert.equal(hostPrivateRows.data.length, 0)
  hostPrivateRowsBeforeReveal += hostPrivateRows.data.length

  const progress = await rpc(host, 'whatever_submission_progress', { p_round_id: roundId })
  assert.equal(progress.count, 3)
  assert.equal(progress.playerIds.length, 3)

  if (roundNumber === 3) host = await refreshedClient(host, 'host')
  const revealed = await rpc(host, 'whatever_reveal_round', { p_round_id: roundId })
  assert.equal(revealed.length, 3)
  const memberReveal = await rpc(players[0], 'whatever_reveal_items', { p_round_id: roundId })
  assert.deepEqual(memberReveal, revealed)
  const outsiderReveal = await outsider.rpc('whatever_reveal_items', { p_round_id: roundId })
  assert.ok(outsiderReveal.error)

  const { data: round, error: roundError } = await host
    .from('rounds')
    .select('owner_id, vote_deadline')
    .eq('id', roundId)
    .single()
  if (roundError) throw roundError
  const ownerIndex = playerIds.indexOf(round.owner_id)
  assert.notEqual(ownerIndex, -1)
  ownerOrder.push(round.owner_id)
  const eligible = [0, 1, 2].filter((index) => index !== ownerIndex)
  await rpc(players[eligible[0]], 'whatever_set_guess', {
    p_round_id: roundId,
    p_answer_id: submissionIds[ownerIndex],
  })
  const wrongTarget = [0, 1, 2].find(
    (index) => index !== ownerIndex && index !== eligible[1],
  )
  assert.notEqual(wrongTarget, undefined)
  await rpc(players[eligible[1]], 'whatever_set_guess', {
    p_round_id: roundId,
    p_answer_id: submissionIds[wrongTarget],
  })

  for (let index = 0; index < players.length; index += 1) {
    const target = (index + 1) % players.length
    await rpc(players[index], 'whatever_set_vote', {
      p_round_id: roundId,
      p_answer_id: submissionIds[target],
    })
  }
  if (roundNumber === 2) {
    await rpc(players[0], 'whatever_set_vote', { p_round_id: roundId, p_answer_id: null })
    players[0] = await refreshedClient(players[0], 'voting player')
    await rpc(players[0], 'whatever_set_vote', {
      p_round_id: roundId,
      p_answer_id: submissionIds[1],
    })
  }

  if (roundNumber === 1) {
    const earlyFinalize = await host.rpc('whatever_finalize_round', { p_round_id: roundId })
    assert.match(earlyFinalize.error?.message || '', /Voting is still open/)
  }

  const waitMs = Math.max(0, new Date(round.vote_deadline).getTime() - Date.now() + 500)
  await new Promise((resolve) => setTimeout(resolve, waitMs))
  const results = await rpc(host, 'whatever_finalize_round', { p_round_id: roundId })
  assert.equal(results.ownerSweetSpot, true)
  assert.deepEqual(results.correctGuessers, [playerIds[eligible[0]]])
  const resultsAgain = await rpc(host, 'whatever_finalize_round', { p_round_id: roundId })
  assert.deepEqual(resultsAgain, results)

  const { data: roundRoom, error: roundRoomError } = await host
    .from('rooms')
    .select('round_index, status')
    .eq('id', roomId)
    .single()
  if (roundRoomError) throw roundRoomError
  assert.equal(roundRoom.round_index, roundNumber)
  assert.equal(roundRoom.status, 'results')
  console.log(`Live round ${roundNumber}/6 passed`)
}

assert.deepEqual(ownerOrder.slice(0, 3), ownerOrder.slice(3, 6))
assert.equal(new Set(ownerOrder).size, 3)
const { data: finishedRoom, error: finishedRoomError } = await host
  .from('rooms')
  .select('round_index, status, leaderboards')
  .eq('id', roomId)
  .single()
if (finishedRoomError) throw finishedRoomError
assert.equal(finishedRoom.round_index, 6)
assert.equal(finishedRoom.status, 'results')
const { count: roundCount, error: roundCountError } = await host
  .from('rounds')
  .select('*', { count: 'exact', head: true })
  .eq('room_id', roomId)
if (roundCountError) throw roundCountError
assert.equal(roundCount, 6)

console.log(JSON.stringify({
  secureLiveVerification: 'passed',
  roomId,
  playerCount: playerIds.length,
  roundsCompleted: finishedRoom.round_index,
  distinctRoundOwners: new Set(ownerOrder).size,
  privateRowsVisibleToHostBeforeReveal: hostPrivateRowsBeforeReveal,
  outsiderRoomRows: outsiderRooms.data.length,
  directWriteBlocked: Boolean(forbiddenWrite.error),
  playerRefreshRecovered: true,
  hostRefreshRecovered: true,
  disconnectReconnectRecovered: true,
}, null, 2))
