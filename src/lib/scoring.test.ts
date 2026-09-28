import { describe, expect, it } from 'vitest'
import { scoreRound } from './scoring'

const players = ['owner', 'alex', 'blair', 'casey']
const submissions = [
  { id: 'owner-answer', playerId: 'owner' },
  { id: 'alex-answer', playerId: 'alex' },
  { id: 'blair-answer', playerId: 'blair' },
  { id: 'casey-answer', playerId: 'casey' },
]
const emptyLeaderboards = { chameleon: {}, crowd: {} }

describe('scoreRound', () => {
  it('awards nobody when the owner is completely hidden', () => {
    const scored = scoreRound({
      ownerId: 'owner',
      playerIds: players,
      submissions,
      guesses: [],
      votes: [],
      leaderboards: emptyLeaderboards,
    })

    expect(scored.results.ownerSweetSpot).toBe(false)
    expect(scored.leaderboards.chameleon).toEqual({})
  })

  it('awards +2 to every correct guesser but nothing to an obvious owner', () => {
    const scored = scoreRound({
      ownerId: 'owner',
      playerIds: players,
      submissions,
      guesses: players.slice(1).map((playerId) => ({
        playerId,
        answerId: 'owner-answer',
      })),
      votes: [],
      leaderboards: emptyLeaderboards,
    })

    expect(scored.results.ownerSweetSpot).toBe(false)
    expect(scored.leaderboards.chameleon).toEqual({ alex: 2, blair: 2, casey: 2 })
  })

  it('awards the owner +3 when only some eligible players identify them', () => {
    const scored = scoreRound({
      ownerId: 'owner',
      playerIds: players,
      submissions,
      guesses: [
        { playerId: 'alex', answerId: 'owner-answer' },
        { playerId: 'blair', answerId: 'casey-answer' },
        { playerId: 'casey', answerId: 'alex-answer' },
      ],
      votes: [],
      leaderboards: emptyLeaderboards,
    })

    expect(scored.results.ownerSweetSpot).toBe(true)
    expect(scored.leaderboards.chameleon).toEqual({ alex: 2, owner: 3 })
  })

  it('awards one crowd point per vote to each answer owner', () => {
    const scored = scoreRound({
      ownerId: 'owner',
      playerIds: players,
      submissions,
      guesses: [],
      votes: [
        { answerId: 'alex-answer' },
        { answerId: 'alex-answer' },
        { answerId: 'casey-answer' },
      ],
      leaderboards: { chameleon: { alex: 4 }, crowd: { alex: 1 } },
    })

    expect(scored.results.voteCounts).toEqual({ 'alex-answer': 2, 'casey-answer': 1 })
    expect(scored.leaderboards).toEqual({
      chameleon: { alex: 4 },
      crowd: { alex: 3, casey: 1 },
    })
  })

  it('does not mutate the previous leaderboard object', () => {
    const leaderboards = { chameleon: { alex: 2 }, crowd: { blair: 1 } }
    const before = structuredClone(leaderboards)

    scoreRound({
      ownerId: 'owner',
      playerIds: players,
      submissions,
      guesses: [{ playerId: 'alex', answerId: 'owner-answer' }],
      votes: [],
      leaderboards,
    })

    expect(leaderboards).toEqual(before)
  })
})
