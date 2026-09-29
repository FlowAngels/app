import type { CSSProperties } from 'react'

export function WhateverMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`whatever-mark ${compact ? 'whatever-mark--compact' : ''}`} aria-label="Whatever!">
      <span className="whatever-mark__what">WHAT</span><span className="whatever-mark__ever">EVER!</span>
    </span>
  )
}

export type ThingShape = 'blob' | 'star' | 'bolt' | 'ghost'

export function FeltThing({
  shape = 'blob',
  color = '#20d7e8',
  className = '',
  mood = 'flat',
  style,
}: {
  shape?: ThingShape
  color?: string
  className?: string
  mood?: 'flat' | 'smile' | 'ooh'
  style?: CSSProperties
}) {
  return (
    <span
      aria-hidden="true"
      className={`felt-thing felt-thing--${shape} felt-thing--${mood} ${className}`}
      style={{ '--thing-color': color, ...style } as CSSProperties}
    >
      <span className="felt-thing__eye felt-thing__eye--left" />
      <span className="felt-thing__eye felt-thing__eye--right" />
      <span className="felt-thing__mouth" />
    </span>
  )
}

export function PlayerDot({ color }: { color: string }) {
  return <span className="player-dot" style={{ '--player-color': color } as CSSProperties} aria-hidden="true" />
}
