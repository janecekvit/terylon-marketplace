// THE OWNER'S WALK OF 1.2.2 (2026-10-25): in a pane of ~1060 px the stepper's nodes were a strip of fixed width,
// centred under eight labels that stretched with the pane, so "Admitted" sat under empty space and "Verified" under
// the Merge diamond; at ~660 px they were nearly aligned. Nodes and labels share one x-scale now. A test cannot see
// the paint, so it lays the drawing out as a browser would: an `Svg` of a pixel width is a strip centred in its slot,
// one of `width="100%"` takes the slot; a node at `x` is that many pixels in, or that share of the width; the label
// row's equal columns put each label at its column's centre. Each label must sit within half a node gap of its node.

import { test, expect } from 'claude-code/testing'

import { PANE_PROPS, SESSION, pictures, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

// The two widths of the walk, in CSS pixels.
const WIDTHS = [660, 1060]

type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

function findKey(node: unknown, key: string): Drawn | null {
  if (node === null || typeof node !== 'object') {
    return null
  }

  const element = node as Drawn

  if (element.props?.key === key) {
    return element
  }

  for (const child of element.children ?? []) {
    const found = findKey(child, key)

    if (found !== null) {
      return found
    }
  }

  return null
}

// Where the stepper's nodes fall in a slot of `width` pixels, read off its markup.
function nodeCentres(source: string, width: number): number[] {
  const root = /^<svg [^>]*width="([^"]+)"/.exec(source)?.[1] ?? ''
  const pictureWidth = root.endsWith('%') ? width * Number(root.slice(0, -1)) / 100 : Number(root)
  const offset = (width - pictureWidth) / 2
  const inner = source.replace(/^<svg [^>]*>/, '')

  return [...inner.matchAll(/<svg x="([^"]+)"/g)].map(match => {
    const x = match[1] ?? ''

    return offset + (x.endsWith('%') ? pictureWidth * Number(x.slice(0, -1)) / 100 : Number(x))
  })
}

// Where the labels fall: the row's columns must be equal (each grows by one from no width) for the centres to hold.
function labelCentres(row: Drawn, width: number): number[] {
  const columns = (row.children ?? []) as Drawn[]

  for (const column of columns) {
    expect(column.props).toMatchObject({ flexGrow: 1, width: 0 })
  }

  expect(row.props?.gap ?? 0).toBe(0)
  expect(row.props?.paddingX ?? 0).toBe(0)

  return columns.map((_, index) => (index + 0.5) * width / columns.length)
}

test('THE WIDE STEPPER, at ~660 and ~1060 px: each label is centred within half a node gap of its node', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-333' })

  const [stepper] = await pictures(ui)
  const row = findKey(await ui.drawn(), 'phase-labels')
  expect(row).not.toBeNull()

  for (const width of WIDTHS) {
    const nodes = nodeCentres(stepper?.source ?? '', width)
    const labels = labelCentres(row as Drawn, width)
    expect(nodes).toHaveLength(8)
    expect(labels).toHaveLength(8)

    const gap = (nodes[7]! - nodes[0]!) / 7
    const apart = labels.map((label, index) => Math.abs(label - nodes[index]!))
    expect({ width, worst: Math.max(...apart) <= gap / 2 }).toEqual({ width, worst: true })
  }
})

test('THE WIDE STEPPER\'s nodes keep their size and stay round: each is drawn in pixels about its own point', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-333' })

  const [stepper] = await pictures(ui)
  const source = stepper?.source ?? ''
  // No viewBox to stretch, so nothing scales a node into an ellipse.
  expect(source).toMatch(/^<svg [^>]*width="100%" height="22">/)
  expect(source).not.toMatch(/viewBox|preserveAspectRatio|<ellipse/)
  expect(source.match(/<circle cx="0" cy="11" r="6"/g)?.length).toBeGreaterThanOrEqual(5)
})
