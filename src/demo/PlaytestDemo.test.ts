import { describe, expect, it } from 'vitest'
import { DEMO_PHASES } from './demoPhases'

describe('playtest demo sequence', () => {
  it('covers the full private playtest choreography', () => {
    expect(DEMO_PHASES).toEqual([
      'lobby', 'prompt', 'answering', 'reveal', 'voting', 'results', 'champions',
    ])
  })
})
