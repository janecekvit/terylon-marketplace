// The pane's pictures, as S32 (#25) draws them on the 2.1.304 mod API: the 8-phase stepper, the running row's
// segments, the slots gauge, the spend bar and a plan's chain, each an SVG document for `Svg`; and the text the
// terminal draws in their place, since the terminal has no `Svg`. Pure: no $, so a test reads it without a session.
//
// AN SVG DOES NOT READ THE THEME (the canvas's light-theme board): its colours are fixed, medium-saturated so they
// hold on white and on dark, grey as transparency rather than a fixed dark, and NO WORD inside it. Every word sits in
// a `Text` beside it, which follows the theme; the `alt` says the whole picture for a reader that cannot see it.

import type { PanePhase } from '../types'

// The fixed colours of every picture, as the canvas's boards draw them.
export const SVG_COLOURS = {
  done: '#4caf72',
  now: '#7aa7ff',
  stuck: '#e3a03f',
  rest: '#8f8d88',
  gate: '#a98bf0',
  check: '#1a1a19',
} as const

// Below this many body columns the pane is the narrow dock (the canvas's 360 px board): a row drops its detail,
// the running phases shrink to dots and the gauges to their numbers.
export const NARROW_COLUMNS = 44

// THE THREE DESKTOP PROOFS (S32), all PROVEN in the owner's walk of 1.2.0 in Desktop 3.6556.2.0 (engine 2.1.308) on
// 2026-10-23, and on. `no-<name>` in TERYLON_PANE_PROOFS is the escape hatch that turns one off; off draws 1.1.2.
//   input-rows    a multi-line answer (rows 4) and criteria one per line (rows 3); off: one line, semicolons
//   hover-reveal  a waiting row lights under the pointer and lays its console link over its right edge, never over
//                 an open row; off: the link sits in the row's body, one press away
//   svg-tooltips  a phase of the stepper says its stage, role and step under a still pointer; off: the labels alone
export type Proofs = { inputRows: boolean; hoverReveal: boolean; svgTooltips: boolean }

export const PROOF_NAMES = { inputRows: 'input-rows', hoverReveal: 'hover-reveal', svgTooltips: 'svg-tooltips' } as const

// What each proof is without a word in TERYLON_PANE_PROOFS: what the owner's walk proved.
export const PROOF_DEFAULTS: Proofs = { inputRows: true, hoverReveal: true, svgTooltips: true }

export function proofsOf(value: string | null | undefined): Proofs {
  const named = new Set((value ?? '').split(/[\s,]+/).map(name => name.trim().toLowerCase()).filter(name => name !== ''))
  const isOn = (key: keyof Proofs) => (named.has(`no-${PROOF_NAMES[key]}`) ? false : named.has(PROOF_NAMES[key]) ? true : PROOF_DEFAULTS[key])

  return {
    inputRows: isOn('inputRows'),
    hoverReveal: isOn('hoverReveal'),
    svgTooltips: isOn('svgTooltips'),
  }
}

// THE CHIP'S BACKGROUND: the theme's own neutral grey for a user message, rgb(55, 55, 55) on dark and rgb(240, 240,
// 240) on light. Its word is drawn in `inactive`, which reads on it in both themes; the kind's colour is a dot before
// the word, a mark that needs 3:1 rather than text's 4.5:1 (tests/contrast.ts). The owner's walk of 1.2.0 read neither
// a chip on a fill of its own colour nor secondary text on a tinted card.
export const CHIP_BACKGROUND = 'userMessageBackground'
export const CHIP_WORD = 'inactive'
export const CHIP_DOT = '●'

// Below this many body columns the stepper of eight would shrink as a whole and its labels run together (the owner's
// walk, a dock of about 435 px): it is drawn compact instead, its nodes at their size and only the phase now labelled.
export const STEPPER_COLUMNS = 60

// A picture and its own height in CSS pixels, given to `Svg` so a surface does not size its box for itself.
export type Picture = { source: string; alt: string; height: number }

function svg(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function round(value: number): string {
  return String(Math.round(value * 10) / 10)
}

// Where the stepper's node of each phase sits, and the phase said now, if Terylon reported one.
function nowOf(phases: readonly PanePhase[]): number {
  return phases.findIndex(phase => phase.status === 'now')
}

// "Admitted, Plan, Develop, Review done; Tests now; Pull request, Verified, Merge to come": the stepper's alt.
export function phasesAlt(phases: readonly PanePhase[], labels: readonly string[], isStuck = false): string {
  const named = (status: PanePhase['status']) => phases.map((phase, index) => (phase.status === status ? labels[index] ?? phase.label : null)).filter(label => label !== null)
  const done = named('done')
  const now = named('now')
  const next = named('next')

  return [
    done.length === 0 ? null : `${done.join(', ')} done`,
    now.length === 0 ? null : `${now.join(', ')} ${isStuck ? 'stuck' : 'now'}`,
    next.length === 0 ? null : `${next.join(', ')} to come`,
  ].filter(part => part !== null).join('; ')
}

// "Phase 5 of 8: tests": a running row's segments, said in one line; a story with no stage reported says how far.
export function segmentsAlt(phases: readonly PanePhase[], labels: readonly string[], isStuck: boolean): string {
  const now = nowOf(phases)

  if (now < 0) {
    return `${phases.filter(phase => phase.status === 'done').length} of ${phases.length} phases done`
  }

  return `Phase ${now + 1} of ${phases.length}: ${(labels[now] ?? phases[now]?.label ?? '').toLowerCase()}${isStuck ? ', stuck' : ''}`
}

function fillOf(phase: PanePhase, isStuck: boolean): string {
  return phase.status === 'done' ? SVG_COLOURS.done : phase.status === 'now' ? (isStuck ? SVG_COLOURS.stuck : SVG_COLOURS.now) : SVG_COLOURS.rest
}

// Where the centre of each of `count` equal columns falls, as a share of the row's width: the label row's columns,
// and so the stepper's nodes. One scale for both, so a label sits under its node at any width (the owner's walk of
// 1.2.2: at ~1060 px a node strip of fixed width sat centred under labels that stretched with the pane).
export function columnCentres(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 0.5) / count)
}

function percent(share: number): string {
  return `${round(share * 100)}%`
}

// One node drawn at the origin, in pixels, so it keeps its size and stays round whatever the picture's width.
function stepperNode(phase: PanePhase, isGate: boolean, isStuck: boolean): string {
  if (phase.status === 'done') {
    return `<circle cx="0" cy="11" r="6" fill="${SVG_COLOURS.done}"/><path d="M-3 11l2 2 4-4" stroke="${SVG_COLOURS.check}" stroke-width="1.6" fill="none"/>`
  }

  if (phase.status === 'now') {
    const fill = fillOf(phase, isStuck)

    return `<circle cx="0" cy="11" r="9" fill="${fill}" fill-opacity=".25"/><circle cx="0" cy="11" r="6" fill="${fill}"/>`
  }

  if (isGate) {
    return `<rect x="-6" y="5" width="12" height="12" transform="rotate(45 0 11)" fill="none" stroke="${SVG_COLOURS.gate}" stroke-width="1.5"/>`
  }

  return `<circle cx="0" cy="11" r="5.5" fill="none" stroke="${SVG_COLOURS.rest}" stroke-opacity=".7" stroke-width="1.5"/>`
}

// THE STEPPER of one story: a node per phase on a line, done ✓ green, now blue (amber when stuck), the rest
// hollow grey, Merge a hollow purple square — the owner's gate. No phase is now unless Terylon said so.
//
// WIDE, the picture is as wide as its slot (`width="100%"`, no viewBox) and each node sits at its column's centre
// as a percentage, the label row's own columns, so the two share one x-scale; the nodes are drawn in pixels about
// that point and keep their size. COMPACT, a fixed strip with the nodes 24 px apart, never scaled down, and only the
// phase now labelled under it.
export function stepper(phases: readonly PanePhase[], labels: readonly string[], options: { isStuck?: boolean; tooltips?: readonly string[] | null; isCompact?: boolean } = {}): Picture {
  const height = 22
  const isStuck = options.isStuck === true
  const isCompact = options.isCompact === true
  const compactWidth = 28 + (phases.length - 1) * 24
  const centres = columnCentres(phases.length)
  const xOf = (index: number) => (isCompact ? `${14 + index * 24}` : percent(centres[index] ?? 0))
  const lastDone = phases.reduce((found, phase, index) => (phase.status === 'done' || phase.status === 'now' ? index : found), -1)
  const last = phases.length - 1
  const parts: string[] = [
    `<line x1="${xOf(0)}" y1="11" x2="${xOf(last)}" y2="11" stroke="${SVG_COLOURS.rest}" stroke-opacity=".35" stroke-width="2"/>`,
  ]

  if (lastDone > 0) {
    parts.push(`<line x1="${xOf(0)}" y1="11" x2="${xOf(lastDone)}" y2="11" stroke="${SVG_COLOURS.done}" stroke-width="2"/>`)
  }

  phases.forEach((phase, index) => {
    const title = options.tooltips?.[index]
    const node = `<svg x="${xOf(index)}" y="0" width="1" height="${height}" overflow="visible">${stepperNode(phase, index === last, isStuck)}</svg>`

    parts.push(title === undefined || title === null ? node : `<g><title>${escape(title)}</title>${node}</g>`)
  })

  const source = isCompact
    ? svg(compactWidth, height, parts.join(''))
    : `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${height}">${parts.join('')}</svg>`

  return { source, alt: phasesAlt(phases, labels, isStuck), height }
}

// A RUNNING ROW's phases: eight segments in a bar, the last one Merge, dashed purple until it is reached.
export function segments(phases: readonly PanePhase[], labels: readonly string[], isStuck: boolean): Picture {
  const width = 456
  const gap = 4
  const size = (width - gap * (phases.length - 1)) / Math.max(1, phases.length)
  const parts = phases.map((phase, index) => {
    const x = round(index * (size + gap))
    const isGate = index === phases.length - 1

    if (isGate && phase.status === 'next') {
      return `<rect x="${x}" y="1" width="${round(size)}" height="6" rx="3" fill="none" stroke="${SVG_COLOURS.gate}" stroke-width="1.2" stroke-dasharray="3 2"/>`
    }

    return `<rect x="${x}" y="1" width="${round(size)}" height="6" rx="3" fill="${fillOf(phase, isStuck)}"${phase.status === 'next' ? ' fill-opacity=".3"' : ''}/>`
  })

  return { source: svg(width, 8, parts.join('')), alt: segmentsAlt(phases, labels, isStuck), height: 8 }
}

// THE NARROW DOCK's phases: a dot each, the last the hollow purple ring of Merge.
export function dots(phases: readonly PanePhase[], labels: readonly string[], isStuck: boolean): Picture {
  const parts = phases.map((phase, index) => {
    const x = 4 + index * 16

    if (index === phases.length - 1 && phase.status === 'next') {
      return `<circle cx="${x}" cy="4" r="3" fill="none" stroke="${SVG_COLOURS.gate}" stroke-width="1.2"/>`
    }

    return `<circle cx="${x}" cy="4" r="3.5" fill="${fillOf(phase, isStuck)}"${phase.status === 'next' ? ' fill-opacity=".35"' : ''}/>`
  })

  return { source: svg(Math.max(8, phases.length * 16 - 8), 8, parts.join('')), alt: segmentsAlt(phases, labels, isStuck), height: 8 }
}

// THE SLOTS GAUGE: a filled box per slot in use, a hollow one per slot free. Small beside the Running heading,
// wide on the Status tab.
export function slotsGauge(used: number, slots: number, isWide: boolean): Picture | null {
  if (slots < 1) {
    return null
  }

  const count = Math.min(slots, 12)
  const width = isWide ? 200 : count * 12 - 2
  const height = isWide ? 14 : 10
  const gap = isWide ? 4 : 2
  const size = (width - gap * (count - 1)) / count
  const parts = Array.from({ length: count }, (_, index) => {
    const x = round(index * (size + gap))

    return index < used
      ? `<rect x="${x}" y="1" width="${round(size)}" height="${height - 2}" rx="${isWide ? 3 : 2}" fill="${SVG_COLOURS.now}"/>`
      : `<rect x="${x}" y="1.5" width="${round(size)}" height="${height - 3}" rx="${isWide ? 3 : 2}" fill="none" stroke="${SVG_COLOURS.rest}" stroke-opacity=".7" stroke-width="1"/>`
  })

  return { source: svg(width, height, parts.join('')), alt: `${used} of ${slots} slots in use`, height }
}

// THE SPEND BAR: what is spent against its limit. No limit, no bar: the pane does not invent one.
export function spendBar(spent: number, limit: number | null, size: 'small' | 'wide' | 'full', alt: string): Picture | null {
  if (limit === null || limit <= 0) {
    return null
  }

  const width = size === 'small' ? 64 : size === 'wide' ? 200 : 456
  const height = size === 'wide' ? 14 : 6
  const filled = Math.max(0, Math.min(1, spent / limit)) * width
  const track = `<rect x="0" y="0" width="${width}" height="${height}" rx="3" fill="${SVG_COLOURS.rest}" fill-opacity=".3"/>`
  const bar = filled <= 0 ? '' : `<rect x="0" y="0" width="${round(filled)}" height="${height}" rx="3" fill="${spent > limit ? SVG_COLOURS.stuck : SVG_COLOURS.now}"/>`

  return { source: svg(width, height, track + bar), alt, height }
}

// A PLAN AS A CHAIN: a node per story in its order, an arrow into each that runs after another.
export function planChain(stories: readonly { index: number; after: readonly number[] }[]): Picture | null {
  if (stories.length === 0) {
    return null
  }

  const spacing = 67
  const width = 16 + (stories.length - 1) * spacing
  const parts: string[] = []

  stories.forEach((story, position) => {
    const x = 8 + position * spacing
    parts.push(`<circle cx="${x}" cy="7" r="5.5" fill="none" stroke="${SVG_COLOURS.rest}" stroke-width="1.4"/>`)

    if (position > 0) {
      const from = x - spacing + 7
      const to = x - 11
      parts.push(`<line x1="${from}" y1="7" x2="${to}" y2="7" stroke="${SVG_COLOURS.rest}" stroke-opacity=".6" stroke-width="1.4"/>`)
      parts.push(`<path d="M${to} 4l5 3-5 3z" fill="${SVG_COLOURS.rest}" fill-opacity=".6"/>`)
    }
  })

  const alt = stories
    .map((story, position) => (position === 0 ? `Story ${story.index}` : `then ${story.index}${story.after.length === 0 ? '' : ` after ${story.after.join(', ')}`}`))
    .join(', ')

  return { source: svg(width, 14, parts.join('')), alt, height: 14 }
}

// THE TERMINAL'S STEPPER: ✓ ✓ ✓ ✓ ● ○ ○ ◇, one glyph per phase, Merge the diamond.
export function phaseGlyph(phase: PanePhase, isGate: boolean): string {
  return phase.status === 'done' ? '✓' : phase.status === 'now' ? '●' : isGate ? '◇' : '○'
}

// THE TERMINAL'S GAUGE: ▰▰▱▱, a cell per slot or per quarter of the limit.
export function meter(filled: number, cells: number): string {
  const count = Math.max(0, Math.min(cells, Math.round(filled)))

  return `${'▰'.repeat(count)}${'▱'.repeat(Math.max(0, cells - count))}`
}

// A commit or image hash inside a line, drawn in the monospaced face: the line cut around it.
const HASH = /\b[0-9a-f]{7,40}\b/

export function splitHash(line: string): { before: string; hash: string | null; after: string } {
  const match = HASH.exec(line)

  if (match === null) {
    return { before: line, hash: null, after: '' }
  }

  return { before: line.slice(0, match.index), hash: match[0], after: line.slice(match.index + match[0].length) }
}
