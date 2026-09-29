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

export type DemoStep = {
  phase: DemoPhase
  round?: number
}

const ROUND_PHASES: DemoPhase[] = ['prompt', 'answering', 'reveal', 'voting', 'results']

export const DEMO_STEPS: DemoStep[] = [
  { phase: 'lobby' },
  ...Array.from({ length: 6 }, (_, roundIndex) =>
    ROUND_PHASES.map((phase) => ({ phase, round: roundIndex + 1 })),
  ).flat(),
  { phase: 'champions' },
]
