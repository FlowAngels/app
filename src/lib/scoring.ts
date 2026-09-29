import type { Leaderboards, RoundResults } from './gameState'

export type ScoringSubmission = { id: string; playerId: string }
export type ScoringGuess = { playerId: string; answerId: string }
export type ScoringVote = { answerId: string }

export type ScoreRoundInput = {
  ownerId: string
  playerIds: string[]
  submissions: ScoringSubmission[]
  guesses: ScoringGuess[]
  votes: ScoringVote[]
  leaderboards: Leaderboards
}

export type ScoreRoundOutput = {
  results: RoundResults & { ownerSweetSpot: boolean }
  leaderboards: Leaderboards
}

function cloneLeaderboards(leaderboards: Leaderboards): Leaderboards {
  return {
    chameleon: { ...leaderboards.chameleon },
    crowd: { ...leaderboards.crowd },
  }
}

export function scoreRound(input: ScoreRoundInput): ScoreRoundOutput {
  const ownerAnswerId =
    input.submissions.find((submission) => submission.playerId === input.ownerId)?.id ?? null
  const correctGuessers = ownerAnswerId
    ? input.guesses
        .filter((guess) => guess.answerId === ownerAnswerId && guess.playerId !== input.ownerId)
        .map((guess) => guess.playerId)
    : []
  const eligibleGuessers = input.playerIds.filter((playerId) => playerId !== input.ownerId)
  const ownerSweetSpot =
    correctGuessers.length > 0 && correctGuessers.length < eligibleGuessers.length

  const voteCounts: Record<string, number> = {}
  for (const vote of input.votes) {
    voteCounts[vote.answerId] = (voteCounts[vote.answerId] || 0) + 1
  }

  const leaderboards = cloneLeaderboards(input.leaderboards)
  const answerOwners = Object.fromEntries(
    input.submissions.map((submission) => [submission.id, submission.playerId]),
  )
  const roundChameleon: Record<string, number> = {}
  const roundCrowd: Record<string, number> = {}
  for (const playerId of correctGuessers) {
    leaderboards.chameleon[playerId] = (leaderboards.chameleon[playerId] || 0) + 2
    roundChameleon[playerId] = (roundChameleon[playerId] || 0) + 2
  }
  if (ownerSweetSpot) {
    leaderboards.chameleon[input.ownerId] =
      (leaderboards.chameleon[input.ownerId] || 0) + 3
    roundChameleon[input.ownerId] = (roundChameleon[input.ownerId] || 0) + 3
  }
  for (const guess of input.guesses) {
    if (guess.playerId === input.ownerId || guess.answerId === ownerAnswerId) continue
    const bluffOwner = answerOwners[guess.answerId]
    if (!bluffOwner || bluffOwner === guess.playerId) continue
    leaderboards.chameleon[bluffOwner] = (leaderboards.chameleon[bluffOwner] || 0) + 1
    roundChameleon[bluffOwner] = (roundChameleon[bluffOwner] || 0) + 1
  }

  for (const [answerId, count] of Object.entries(voteCounts)) {
    const answerOwner = answerOwners[answerId]
    if (answerOwner) {
      leaderboards.crowd[answerOwner] = (leaderboards.crowd[answerOwner] || 0) + count
      roundCrowd[answerOwner] = (roundCrowd[answerOwner] || 0) + count
    }
  }

  return {
    results: {
      ownerAnswerId,
      correctGuessers,
      voteCounts,
      ownerSweetSpot,
      answerOwners,
      roundChameleon,
      roundCrowd,
    },
    leaderboards,
  }
}
