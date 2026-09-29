export const DEMO_PHASES = [
  'lobby',
  'prompt',
  'answering',
  'reveal',
  'voting',
  'results',
  'champions',
] as const

export type DemoPhase = (typeof DEMO_PHASES)[number]
