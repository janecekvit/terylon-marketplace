// ONE FOLD EVERYWHERE: on a graphic surface a real Button of the fold's name and count, dim while shut and at full
// strength while open; on the terminal the lesser form, ▸ shut and ▾ open on a plain Button. On the overview each open
// fold is a card of its own, headed by its name and count, stacked in the folds' order; System's About you is as it was.

import { test, expect } from 'claude-code/testing'

import { CARD_FILL } from '../hooks/drawing'

import { NARROW_PANE_PROPS, PANE_PROPS, SESSION, exact, lateOnTheLocalDayOf, pill, toOverview, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const
const GRAPHIC = [['desktop', PANE_PROPS], ['narrow dock', NARROW_PANE_PROPS]] as const
// The fixtures' story 341 merged on this local day, so Done today holds it.
const DONE_DAY = '2026-10-11T12:20:00Z'

type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown[] }
type Found = { text?: string; props: Record<string, unknown> } | undefined

// The element of a drawn tree under a key, depth first.
function nodeOf(node: unknown, key: string): Drawn | undefined {
  if (node === null || typeof node !== 'object') {
    return undefined
  }

  const element = node as Drawn

  if (element.props?.key === key) {
    return element
  }

  for (const child of Array.isArray(element.children) ? element.children : []) {
    const found = nodeOf(child, key)

    if (found !== undefined) {
      return found
    }
  }

  return undefined
}

// Every key of a drawn tree, in the order it is drawn.
function keysOf(node: unknown): string[] {
  if (node === null || typeof node !== 'object') {
    return []
  }

  const element = node as Drawn
  const own = typeof element.props?.key === 'string' ? [element.props.key] : []

  return [...own, ...(Array.isArray(element.children) ? element.children : []).flatMap(keysOf)]
}

function expectShut(button: Found, label: string) {
  expect(button?.props.label).toBe(label)
  expect(button?.text).toBe(label)
  expect(button?.props.plain).toBeUndefined()
  expect(button?.props.dimColor).toBe(true)
}

function expectOpen(button: Found, label: string) {
  expect(button?.props.label).toBe(label)
  expect(button?.text).toBe(label)
  expect(button?.props.plain).toBeUndefined()
  expect(button?.props.dimColor).toBeUndefined()
}

for (const [surface, props] of GRAPHIC) {
  test(`${surface}: a fold's toggle is a real Button of its name and count, dim while shut and not dim while open`, async ($, on) => {
    const terylon = world(on, { now: lateOnTheLocalDayOf(DONE_DAY) })
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: 'desktop' })
    await toOverview(ui)

    // THE OVERVIEW'S THREE, SHUT, with no glyph in their words.
    expectShut(await ui.find({ key: 'fold-done' }), 'Done today 1')
    expectShut(await ui.find({ key: 'fold-queued' }), 'Queued 2')
    expectShut(await ui.find({ key: 'goals-show-closed' }), 'History 1')

    await ui.press({ key: 'fold-done' })
    expectOpen(await ui.find({ key: 'fold-done' }), 'Done today 1')
    expectShut(await ui.find({ key: 'fold-queued' }), 'Queued 2')

    await ui.press({ key: 'goals-show-closed' })
    expectOpen(await ui.find({ key: 'goals-show-closed' }), 'History 1')

    // SYSTEM'S ABOUT YOU AND TOPICS, the same Button.
    await pill(ui, 'tab-status')
    expectShut(await ui.find({ key: 'fold-memory-owner' }), 'About you 2')
    expectShut(await ui.find({ key: 'fold-memory-topics' }), 'Topics 1')
    await ui.press({ key: 'fold-memory-owner' })
    expectOpen(await ui.find({ key: 'fold-memory-owner' }), 'About you 2')
    expectShut(await ui.find({ key: 'fold-memory-topics' }), 'Topics 1')
    await ui.unmount()
  })
}

test('terminal: a fold keeps its lesser form, a plain Button with ▸ shut and ▾ open', async ($, on) => {
  const terylon = world(on, { now: lateOnTheLocalDayOf(DONE_DAY) })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await toOverview(ui)
  const done = await ui.find({ key: 'fold-done' })
  expect(done?.text).toBe('▸ Done today 1')
  expect(done?.props.plain).toBe(true)
  expect((await ui.find({ key: 'fold-queued' }))?.text).toBe('▸ Queued 2')
  expect((await ui.find({ key: 'goals-show-closed' }))?.text).toBe('▸ History 1')

  await ui.press({ key: 'fold-done' })
  expect((await ui.find({ key: 'fold-done' }))?.text).toBe('▾ Done today 1')

  await pill(ui, 'tab-status')
  expect((await ui.find({ key: 'fold-memory-owner' }))?.text).toBe('▸ About you 2')
  await ui.press({ key: 'fold-memory-owner' })
  expect((await ui.find({ key: 'fold-memory-owner' }))?.text).toBe('▾ About you 2')
  await ui.unmount()
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: each open fold of the overview is a bordered card of its own, headed by its name and count, in the folds' order`, async ($, on) => {
    const terylon = world(on, { now: lateOnTheLocalDayOf(DONE_DAY) })
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, surface })

    // SHUT, NO CARD.
    expect(await ui.find({ key: 'fold-done-card' })).toBeUndefined()
    expect(await ui.find({ key: 'fold-queued-card' })).toBeUndefined()

    // ONE OPEN: one card, its heading and its row inside.
    await ui.press({ key: 'fold-done' })
    const doneOnly = nodeOf(await ui.drawn(), 'fold-done-card')
    expect(doneOnly?.props?.borderStyle).toBe('round')
    expect(keysOf(doneOnly)).toContain('done-341')
    expect(await ui.find({ type: 'Text', text: exact('Done today · 1') })).toBeDefined()

    // TWO OPEN: two cards, each holding its own rows and none of the other's.
    await ui.press({ key: 'fold-queued' })
    await ui.press({ key: 'goals-show-closed' })
    const tree = await ui.drawn()
    const done = nodeOf(tree, 'fold-done-card')
    const queued = nodeOf(tree, 'fold-queued-card')
    const history = nodeOf(tree, 'goals-closed-card')
    const waiting = nodeOf(tree, 'waiting')

    for (const card of [done, queued, history]) {
      expect(card?.props?.borderStyle).toBe('round')
      // THE SAME CARD AS EVERY OTHER: the one fill on a graphic surface, none on the terminal.
      expect(card?.props?.backgroundColor).toBe(surface === 'desktop' ? CARD_FILL : undefined)
      expect(card?.props?.backgroundColor).toBe(waiting?.props?.backgroundColor)
    }

    expect(keysOf(done)).toContain('done-341')
    expect(keysOf(done)).not.toContain('queued-328')
    expect(keysOf(queued)).toContain('queued-328')
    expect(keysOf(queued)).not.toContain('done-341')
    expect(keysOf(history)).toContain('goal-1')
    expect(keysOf(history)).not.toContain('queued-328')
    expect(await ui.find({ type: 'Text', text: exact('Queued · 2') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('History · 1') })).toBeDefined()

    // STACKED IN THE FOLDS' ORDER: Done today, Queued, History.
    const order = keysOf(tree)
    expect(order.indexOf('fold-done-card')).toBeLessThan(order.indexOf('fold-queued-card'))
    expect(order.indexOf('fold-queued-card')).toBeLessThan(order.indexOf('goals-closed-card'))

    // A ROW STILL OPENS ITS STORY.
    await ui.press({ key: 'done-341' })
    expect(terylon.calls.filter(call => call.tool === 'story_get').map(call => call.args.story)).toContain(341)
    await ui.unmount()
  })
}

test("System's About you is unchanged: each file its own round-bordered card with its heading, its entries and its acts", async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await pill(ui, 'tab-status')
  await ui.press({ key: 'fold-memory-owner' })

  const tree = await ui.drawn()
  const owner = nodeOf(tree, 'mem-file-0')
  expect(owner?.props?.borderStyle).toBe('round')
  expect(owner?.props?.backgroundColor).toBe(CARD_FILL)
  expect(keysOf(owner)).toContain('mem-edit-0-0')
  expect(keysOf(owner)).toContain('mem-remove-0-0')
  expect(keysOf(owner)).toContain('mem-add-0')
  expect(await ui.find({ type: 'Text', text: exact('About you') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: exact('owner · 2 entries') }))?.props.color).toBe('subtle')
  // NO FOLD CARD AROUND IT: the files are the cards.
  expect(keysOf(tree).some(key => key.startsWith('fold-memory-owner') && key !== 'fold-memory-owner')).toBe(false)
  await ui.unmount()
})
