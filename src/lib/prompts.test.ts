import { describe, expect, it } from 'vitest'
import { HEADLINE_PROMPTS } from './prompts'

describe('Headline Hijack prompt pack', () => {
  it('contains the complete 20-prompt vertical-slice pack', () => {
    expect(HEADLINE_PROMPTS).toHaveLength(20)
    expect(new Set(HEADLINE_PROMPTS).size).toBe(20)
  })

  it('gives every prompt one visible blank to complete', () => {
    for (const prompt of HEADLINE_PROMPTS) {
      expect(prompt.match(/____/g)).toHaveLength(1)
    }
  })
})
