import { describe, expect, it } from 'vitest'
import { intersectCategorySelections, parseRoundResults } from './gameState'

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
    })).toEqual({
      ownerAnswerId: 'answer-1',
      correctGuessers: ['player-2'],
      voteCounts: { 'answer-1': 2 },
      ownerSweetSpot: true,
    })
  })

  it('returns a safe empty result for missing database JSON', () => {
    expect(parseRoundResults(null)).toEqual({
      ownerAnswerId: null,
      correctGuessers: [],
      voteCounts: {},
      ownerSweetSpot: false,
    })
  })
})
