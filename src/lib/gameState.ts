import type { Json } from '../types/database'

export type Leaderboards = {
  chameleon: Record<string, number>
  crowd: Record<string, number>
}

export type RoundResults = {
  ownerAnswerId: string | null
  correctGuessers: string[]
  voteCounts: Record<string, number>
}

export type RevealItem = { id: string; text: string }

export type RoomEvent = {
  event?: string
  payload?: {
    items?: RevealItem[]
    voteDeadline?: string
  }
  type?: string
}

export const GAME_CATEGORIES = ['headline_hijack', 'law_or_nah', 'meme_mash'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  )
}

export function parsePrompt(value: Json): string {
  return isRecord(value) && typeof value.text === 'string' ? value.text : ''
}

export function parseStringArray(value: Json | null | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function intersectCategorySelections(selections: string[][]): string[] {
  if (selections.length === 0 || selections.some((selected) => selected.length === 0)) {
    return []
  }

  return GAME_CATEGORIES.filter((category) =>
    selections.every((selected) => selected.includes(category)),
  )
}

export function parseLeaderboards(value: Json | null | undefined): Leaderboards {
  if (!isRecord(value)) return { chameleon: {}, crowd: {} }
  return {
    chameleon: numberRecord(value.chameleon),
    crowd: numberRecord(value.crowd),
  }
}

export function parseRoundResults(value: Json | null | undefined): RoundResults {
  if (!isRecord(value)) {
    return { ownerAnswerId: null, correctGuessers: [], voteCounts: {} }
  }
  return {
    ownerAnswerId: typeof value.ownerAnswerId === 'string' ? value.ownerAnswerId : null,
    correctGuessers: Array.isArray(value.correctGuessers)
      ? value.correctGuessers.filter((id): id is string => typeof id === 'string')
      : [],
    voteCounts: numberRecord(value.voteCounts),
  }
}

export function parseRoomEvent(value: unknown): RoomEvent {
  if (!isRecord(value)) return {}
  const payload = isRecord(value.payload) ? value.payload : undefined
  const items = Array.isArray(payload?.items)
    ? payload.items.filter(
        (item): item is RevealItem =>
          isRecord(item) && typeof item.id === 'string' && typeof item.text === 'string',
      )
    : undefined
  return {
    event: typeof value.event === 'string' ? value.event : undefined,
    type: typeof value.type === 'string' ? value.type : undefined,
    payload: payload
      ? {
          items,
          voteDeadline:
            typeof payload.voteDeadline === 'string' ? payload.voteDeadline : undefined,
        }
      : undefined,
  }
}
