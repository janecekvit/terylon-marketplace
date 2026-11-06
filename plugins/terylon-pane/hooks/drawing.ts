// The pane's pictures: the road of a goal or a story, the spend bar and a plan's chain, each an SVG document for `Svg`;
// and the text the terminal draws in their place, since the terminal has no `Svg`. Pure: no $, so a test reads it
// without a session.
//
// AN SVG DOES NOT READ THE THEME (the canvas's light-theme board): its colours are fixed, medium-saturated so they
// hold on white and on dark, grey as transparency rather than a fixed dark, and NO WORD inside it. Every word sits in
// a `Text` beside it, which follows the theme; the `alt` says the whole picture for a reader that cannot see it.

import type { PaneRoadStep } from '../types'

// The fixed colours of every picture, as the canvas's boards draw them.
export const SVG_COLOURS = {
  done: '#4caf72',
  now: '#7aa7ff',
  stuck: '#e3a03f',
  rest: '#8f8d88',
  gate: '#a98bf0',
  roadDone: '#4caf7d',
  roadNow: '#6f9ff0',
  roadAhead: '#6b6b68',
  roadGate: '#8e72d8',
} as const

// Below this many body columns the pane is the narrow dock (the canvas's 360 px board): a row drops its detail and the
// tiles are one line of counts.
export const NARROW_COLUMNS = 44

// A TERMINAL NARROWER THAN THIS has no room for three boxes side by side: its tiles are one line of counts.
export const NARROW_TERMINAL_COLUMNS = 70

// From this many body columns two cards stand side by side, a dock of about 640 px.
export const WIDE_COLUMNS = 88

// THE THREE DESKTOP PROOFS (S32), all PROVEN in the owner's walk of 1.2.0 in Desktop 3.6556.2.0 (engine 2.1.308) on
// 2026-10-23, and on. `no-<name>` in TERYLON_PANE_PROOFS is the escape hatch that turns one off; off draws 1.1.2.
//   input-rows    a multi-line answer (rows 4) and criteria one per line (rows 3); off: one line, semicolons
//   hover-reveal  a waiting row lights under the pointer and lays its console link over its right edge, never over
//                 an open row; off: the link sits in the row's body, one press away
//   svg-tooltips  a phase of a story's road says its stage, role and step under a still pointer; off: the names alone
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

// Below this many body columns the names of a story's eight phases would run together (the owner's walk, a dock of
// about 435 px): only the phase now is named under its road.
export const ROAD_NAMES_COLUMNS = 60

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

// "Admitted, Plan, Develop, Review done; Tests now; Pull req., Verified, Merge to come": a road's alt.
export function roadAlt(steps: readonly PaneRoadStep[], isStuck = false): string {
  const named = (status: PaneRoadStep['status']) => steps.filter(step => step.status === status).map(step => step.name)
  const done = named('done')
  const now = named('now')
  const next = named('next')

  return [
    done.length === 0 ? null : `${done.join(', ')} done`,
    now.length === 0 ? null : `${now.join(', ')} ${isStuck ? 'stuck' : 'now'}`,
    next.length === 0 ? null : `${next.join(', ')} to come`,
  ].filter(part => part !== null).join('; ')
}

// How tall a road is, and the air between its segments as a share of its width.
const ROAD_HEIGHT = 6
const ROAD_GAP_PERCENT = 0.8

// THE ROAD: one segment per step in an equal column, done green, now blue (amber when stuck), the owner's gates purple,
// the rest grey. AS WIDE AS ITS SLOT (`width="100%"`, no viewBox), so each segment keeps its height at any width and
// sits over the column its name is drawn in. A gate still ahead is its purple at a lower opacity, which reads on both
// themes where a darker purple would not.
export function road(steps: readonly PaneRoadStep[], options: { isStuck?: boolean; tooltips?: readonly string[] | null } = {}): Picture {
  const isStuck = options.isStuck === true
  const share = 100 / Math.max(1, steps.length)
  const parts = steps.map((step, index) => {
    const fill = step.status === 'done' ? SVG_COLOURS.roadDone : step.isGate ? SVG_COLOURS.roadGate : step.status === 'now' ? (isStuck ? SVG_COLOURS.stuck : SVG_COLOURS.roadNow) : SVG_COLOURS.roadAhead
    const opacity = step.isGate && step.status === 'next' ? ' fill-opacity=".45"' : ''
    const segment = `<rect x="${round(index * share + ROAD_GAP_PERCENT / 2)}%" y="0" width="${round(share - ROAD_GAP_PERCENT)}%" height="${ROAD_HEIGHT}" rx="3" fill="${fill}"${opacity}/>`
    const title = options.tooltips?.[index]

    return title === undefined || title === null ? segment : `<g><title>${escape(title)}</title>${segment}</g>`
  })

  return { source: `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${ROAD_HEIGHT}">${parts.join('')}</svg>`, alt: roadAlt(steps, isStuck), height: ROAD_HEIGHT }
}

// THE TERMINAL'S ROAD: the same steps as runs of coloured cells in theme keys, one run per step, as wide as it is given.
export function roadCells(steps: readonly PaneRoadStep[], columns: number, isStuck = false): { text: string; tone: 'success' | 'suggestion' | 'merged' | 'subtle' | 'warning' }[] {
  const cells = Math.max(1, Math.floor((columns - (steps.length - 1)) / Math.max(1, steps.length)))

  return steps.map(step => ({
    text: '━'.repeat(cells),
    tone: step.status === 'done' ? 'success' : step.isGate ? 'merged' : step.status === 'now' ? (isStuck ? 'warning' : 'suggestion') : 'subtle',
  }))
}

// THE SPEND BAR: what is spent against its limit. No limit, no bar: the pane does not invent one.
export function spendBar(spent: number, limit: number | null, alt: string): Picture | null {
  if (limit === null || limit <= 0) {
    return null
  }

  const width = 456
  const height = 6
  const filled = Math.max(0, Math.min(1, spent / limit)) * width
  const track = `<rect x="0" y="0" width="${width}" height="${height}" rx="3" fill="${SVG_COLOURS.rest}" fill-opacity=".3"/>`
  const bar = filled <= 0 ? '' : `<rect x="0" y="0" width="${round(filled)}" height="${height}" rx="3" fill="${spent > limit ? SVG_COLOURS.stuck : SVG_COLOURS.now}"/>`

  return { source: svg(width, height, track + bar), alt, height }
}

// A PLAN'S ORDER: a node per story in the plan's order, and an arrow only where a story runs after another, from the
// one it waits for (the owner's walk of 1.5.0, #35: plan 144 drew 1 → 2 → 3 although only C ran after A). A story's
// `after` is the places, 1-based, of the stories it waits for. Next to each other, a straight arrow; further apart, an
// arc above the nodes.
export function planChain(stories: readonly { index: number; after: readonly number[] }[], alt: string): Picture | null {
  if (stories.length === 0) {
    return null
  }

  const spacing = 67
  const height = 22
  const nodeY = 15
  const width = 16 + (stories.length - 1) * spacing
  const xOf = (place: number) => 8 + (place - 1) * spacing
  const parts: string[] = stories.map(story => `<circle cx="${xOf(story.index)}" cy="${nodeY}" r="5.5" fill="none" stroke="${SVG_COLOURS.rest}" stroke-width="1.4"/>`)

  for (const story of stories) {
    for (const place of story.after) {
      const from = xOf(place)
      const to = xOf(story.index)

      if (place === story.index - 1) {
        parts.push(`<line x1="${from + 7}" y1="${nodeY}" x2="${to - 11}" y2="${nodeY}" stroke="${SVG_COLOURS.rest}" stroke-opacity=".6" stroke-width="1.4"/>`)
        parts.push(`<path d="M${to - 11} ${nodeY - 3}l5 3-5 3z" fill="${SVG_COLOURS.rest}" fill-opacity=".6"/>`)
      } else if (place !== story.index) {
        // AN ARC from above one node to above the other, its head pointing down into the story that waits.
        parts.push(`<path d="M${from} ${nodeY - 7} C${from} 1 ${to} 1 ${to} ${nodeY - 9}" fill="none" stroke="${SVG_COLOURS.rest}" stroke-opacity=".6" stroke-width="1.4"/>`)
        parts.push(`<polygon points="${to - 3},${nodeY - 10} ${to + 3},${nodeY - 10} ${to},${nodeY - 6}" fill="${SVG_COLOURS.rest}" fill-opacity=".6"/>`)
      }
    }
  }

  return { source: svg(width, height, parts.join('')), alt, height }
}

// THE TERMINAL'S ORDER: each run of stories that wait one for the next, "1 → 3", then the stories that wait for none
// and that none waits for, alone: "1 → 3 · 2". A story waiting for several says them all: "1, 2 → 3".
export function planOrder(stories: readonly { index: number; after: readonly number[] }[]): string {
  const waitsFor = new Map(stories.map(story => [story.index, story.after.filter(place => place !== story.index)]))
  const followers = (place: number) => stories.filter(story => (waitsFor.get(story.index) ?? []).includes(place)).map(story => story.index)
  const said = new Set<number>()
  const parts: string[] = []

  for (const story of stories) {
    if (said.has(story.index) || (waitsFor.get(story.index) ?? []).length === 1) {
      continue
    }

    const before = waitsFor.get(story.index) ?? []
    const path = [story.index]
    let next = followers(story.index)

    while (next.length === 1 && (waitsFor.get(next[0] ?? 0) ?? []).length === 1 && !path.includes(next[0] ?? 0)) {
      path.push(next[0] ?? 0)
      next = followers(next[0] ?? 0)
    }

    path.forEach(place => said.add(place))

    // A story alone that others wait for is said in their runs, not on its own as well.
    if (path.length === 1 && before.length === 0 && next.length > 0) {
      continue
    }

    parts.push(before.length > 1 ? `${before.join(', ')} → ${path.join(' → ')}` : path.join(' → '))
  }

  // What a branch left unsaid: a story waiting for one that already heads another run.
  for (const story of stories) {
    if (!said.has(story.index)) {
      said.add(story.index)
      parts.push(`${(waitsFor.get(story.index) ?? []).join(', ')} → ${story.index}`)
    }
  }

  return parts.join(' · ')
}

// A PHASE ON THE TERMINAL: ✓ done, ● now, ○ to come, its gate the diamond.
export function phaseGlyph(status: PaneRoadStep['status'], isGate: boolean): string {
  return status === 'done' ? '✓' : status === 'now' ? '●' : isGate ? '◇' : '○'
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
