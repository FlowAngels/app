import { describe, expect, it } from 'vitest'
import { intersectCategorySelections } from './gameState'

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
