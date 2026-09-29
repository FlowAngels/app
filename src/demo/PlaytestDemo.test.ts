import { describe, expect, it } from 'vitest'
import { DEMO_PHASES, DEMO_STEPS } from './demoPhases'

describe('playtest demo sequence', () => {
  it('covers the full private playtest choreography', () => {
    expect(DEMO_PHASES).toEqual([
      'lobby', 'prompt', 'answering', 'reveal', 'voting', 'results', 'champions',
    ])
  })

  it('plays six complete rounds between the lobby and champions', () => {
    expect(DEMO_STEPS).toHaveLength(32)
    expect(DEMO_STEPS[0]).toEqual({ phase: 'lobby' })
    expect(DEMO_STEPS.at(-1)).toEqual({ phase: 'champions' })

    for (let round = 1; round <= 6; round += 1) {
      expect(DEMO_STEPS.filter((step) => step.round === round).map((step) => step.phase)).toEqual([
        'prompt', 'answering', 'reveal', 'voting', 'results',
      ])
    }
  })
})
