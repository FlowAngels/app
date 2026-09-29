import { describe, expect, it } from 'vitest'
import { intersectCategorySelections, parseRoundResults, playerRank } from './gameState'

describe('intersectCategorySelections', () => {
  it('waits until every connected player has selected categories', () => {
    expect(intersectCategorySelections([['headline_hijack'], []])).toEqual([])
  })

  it('returns only categories selected by every player', () => {
    expect(
      intersectCategorySelections([
        ['headline_hijack', 'law_or_nah'],
        ['headline_hijack', 'meme_mash'],
        ['headline_hijack'],
      ]),
    ).toEqual(['headline_hijack'])
  })

  it('returns an empty pool when nobody is connected', () => {
    expect(intersectCategorySelections([])).toEqual([])
  })
})

describe('parseRoundResults', () => {
  it('preserves the sweet-spot outcome used by the host result screen', () => {
    expect(parseRoundResults({
      ownerAnswerId: 'answer-1',
      correctGuessers: ['player-2'],
      voteCounts: { 'answer-1': 2 },
      ownerSweetSpot: true,
      answerOwners: { 'answer-1': 'owner' },
      roundChameleon: { owner: 3, 'player-2': 2 },
      roundCrowd: { owner: 2 },
    })).toEqual({
      ownerAnswerId: 'answer-1',
      correctGuessers: ['player-2'],
      voteCounts: { 'answer-1': 2 },
      ownerSweetSpot: true,
      answerOwners: { 'answer-1': 'owner' },
      roundChameleon: { owner: 3, 'player-2': 2 },
      roundCrowd: { owner: 2 },
    })
  })

  it('returns a safe empty result for missing database JSON', () => {
    expect(parseRoundResults(null)).toEqual({
      ownerAnswerId: null,
      correctGuessers: [],
      voteCounts: {},
      ownerSweetSpot: false,
      answerOwners: {},
      roundChameleon: {},
      roundCrowd: {},
    })
  })
})

describe('playerRank', () => {
  it('uses competition ranking and preserves ties', () => {
    const scores = { ali: 5, erika: 3, tim: 3, sam: 1 }
    expect(playerRank(scores, 'ali')).toBe(1)
    expect(playerRank(scores, 'erika')).toBe(2)
    expect(playerRank(scores, 'tim')).toBe(2)
    expect(playerRank(scores, 'sam')).toBe(4)
  })

  it('ranks a scoreless player after every player with points', () => {
    expect(playerRank({ ali: 2, erika: 1 }, 'tim')).toBe(3)
  })
})
