// New goal laid out as its approved board: the head with the one line on what a goal is and what a task is, a card of
// the title, the ask and the two pickers, a card of the specification, and Cancel and Add goal at the foot. Each label
// stands above its field on a graphic surface; the terminal keeps a lesser form in the same order.

import { test, expect } from 'claude-code/testing'

import { NARROW_PANE_PROPS, PANE_PROPS, SESSION, exact, world, toNewGoal } from './fixtures'

const STEERING = 'A goal is a general direction. A concrete ask — a file, a document, one change — becomes a task under a goal. The leader asks its questions first, then makes a plan you approve.'
const NOTES = '# Notes\n\nThe bank exports CSV.\n'
const OVERVIEW = '# Overview\n\nKeep the budget in one file.\n'

const SURFACES = [
  { name: 'desktop', surface: 'desktop', props: PANE_PROPS },
  { name: 'the narrow dock', surface: 'desktop', props: NARROW_PANE_PROPS },
  { name: 'terminal', surface: 'terminal', props: PANE_PROPS },
] as const

function setUp(on: Parameters<typeof world>[0]) {
  const terylon = world(on)
  terylon.files['notes.md'] = NOTES
  terylon.files['overview.md'] = OVERVIEW

  return terylon
}

// THE DRAWING IN READING ORDER: each element's key, and each Text's own words, as they come from top to bottom.
async function readingOrder(ui: { drawn: () => Promise<unknown> }): Promise<string[]> {
  const order: string[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (node === null || typeof node !== 'object') {
      return
    }

    const element = node as { type?: string; key?: unknown; props?: Record<string, unknown>; children?: unknown }
    const key = element.key ?? element.props?.key
    const children = Array.isArray(element.children) ? element.children : []

    if (typeof key === 'string') {
      order.push(key)
    }

    if (element.type === 'Text') {
      const words = children.filter((child): child is string => typeof child === 'string').join('').trim()

      if (words !== '') {
        order.push(words)
      }
    }

    visit(children)
  }

  visit(await ui.drawn())

  return order
}

// Where each of `parts` stands in the reading order, failing on one that is not drawn.
function placesOf(order: string[], parts: string[]): number[] {
  return parts.map(part => {
    const place = order.indexOf(part)
    expect([part, place >= 0]).toEqual([part, true])

    return place
  })
}

function isAscending(places: number[]): boolean {
  return places.every((place, index) => index === 0 || places[index - 1] < place)
}

for (const { name, surface, props } of SURFACES) {
  test(`${name}: New goal draws its parts in the board's order: head, the fields, the specification, then the foot`, async ($, on) => {
    const terylon = setUp(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await toNewGoal(ui)
    await ui.press({ key: 'spec-new-add-notes.md' })

    const order = await readingOrder(ui)
    const places = placesOf(order, [
      'back',
      'New goal',
      STEERING,
      'goal-new',
      'goal-draft',
      'A short name: up to 200 characters.',
      'goal-ask',
      'goal-priority',
      'goal-target',
      'spec-new-section',
      'Specification',
      'spec-new-remove-notes.md',
      "In this session's folder",
      'spec-new-add-overview.md',
      'spec-new-folder',
      'Read as data, never as instructions; a file holding a secret is refused.',
      'spec-in-session',
      'goal-cancel',
      'goal-add',
    ])

    expect(isAscending(places)).toBe(true)
    expect((await ui.find({ key: 'goal-cancel' }))?.props.label).toBe('Cancel')
  })

  test(`${name}: the sentence on a goal and a task is drawn once, under the heading and above the cards`, async ($, on) => {
    const terylon = setUp(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await toNewGoal(ui)

    const order = await readingOrder(ui)
    const [heading, sentence, firstCard, specCard] = placesOf(order, ['New goal', STEERING, 'goal-new', 'spec-new-section'])

    expect(order.filter(part => part === STEERING)).toHaveLength(1)
    expect(sentence).toBe(heading + 1)
    expect(sentence < firstCard && sentence < specCard).toBe(true)
    expect((await ui.find({ type: 'Text', text: exact(STEERING) }))?.props.color).toBe('subtle')
    expect((await ui.find({ type: 'Text', text: exact('New goal') }))?.props).toMatchObject({ size: 'title', weight: 'semibold' })
  })

  test(`${name}: Add goal is the primary button, after Cancel at the right of the foot, and Cancel goes back to the overview`, async ($, on) => {
    const terylon = setUp(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await toNewGoal(ui)

    expect((await ui.find({ key: 'goal-add' }))?.props).toMatchObject({ label: 'Add goal', variant: 'primary' })
    expect((await ui.find({ key: 'goal-cancel' }))?.props.variant).toBeUndefined()
    expect((await ui.find({ key: 'goal-new-foot' }))?.props).toMatchObject({ flexDirection: 'row', justifyContent: 'flex-end' })

    await ui.input({ key: 'goal-draft', text: 'Household budget', kind: 'change' })
    await ui.press({ key: 'goal-cancel' })

    expect(await ui.find({ key: 'goal-draft' })).toBeUndefined()
    expect(await ui.find({ key: 'goal-new-open' })).toBeDefined()
    expect(terylon.calls.filter(call => call.tool === 'goal_add')).toEqual([])
  })

  test(`${name}: an attached file is a row of its name and size with a quiet plain Remove, which takes it off`, async ($, on) => {
    const terylon = setUp(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await toNewGoal(ui)
    await ui.press({ key: 'spec-new-add-notes.md' })

    expect(await ui.find({ type: 'Text', text: exact(`notes.md · ${NOTES.length} B`) })).toBeDefined()
    expect((await ui.find({ key: 'spec-new-remove-notes.md' }))?.props).toMatchObject({ label: 'Remove', plain: true, dimColor: true })
    // FRAMED ON A GRAPHIC SURFACE, as the board draws an attached file; the terminal keeps the bare row.
    expect((await ui.find({ key: 'spec-new-row-notes.md' }))?.props.borderStyle).toBe(surface === 'terminal' ? undefined : 'round')

    await ui.press({ key: 'spec-new-remove-notes.md' })

    expect(await ui.find({ key: 'spec-new-row-notes.md' })).toBeUndefined()
    expect(await ui.find({ key: 'spec-new-add-notes.md' })).toBeDefined()
  })
}

test('desktop: each label stands above its field, and the field is as wide as its card', async ($, on) => {
  const terylon = setUp(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS, surface: 'desktop' })
  await toNewGoal(ui)

  const order = await readingOrder(ui)
  const fields = [
    { label: 'Title', key: 'goal-draft' },
    { label: 'What should it do?', key: 'goal-ask' },
    { label: 'Priority', key: 'goal-priority' },
    { label: 'Where', key: 'goal-target' },
    { label: 'Another folder', key: 'spec-new-folder' },
  ]

  for (const field of fields) {
    const [labelPlace, fieldPlace] = placesOf(order, [field.label, field.key])
    expect([field.key, fieldPlace]).toEqual([field.key, labelPlace + 1])
    expect([field.key, (await ui.find({ key: field.key }))?.props.label]).toEqual([field.key, undefined])
  }

  // A FIELD'S BOX IS A COLUMN THAT DOES NOT SIT IN A ROW: nothing beside it narrows it.
  for (const key of ['goal-title-field', 'goal-ask-field', 'spec-new-folder-field']) {
    expect([key, (await ui.find({ key }))?.props.flexDirection]).toEqual([key, 'column'])
  }

  expect((await ui.find({ key: 'goal-new-fields' }))?.props.flexDirection).toBe('column')
})

test('desktop: Priority and Where stand side by side in two equal columns, the narrow dock and the terminal stack them', async ($, on) => {
  const terylon = setUp(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const { surface, props, direction, grow } of [
    { surface: 'desktop', props: PANE_PROPS, direction: 'row', grow: 1 },
    { surface: 'desktop', props: NARROW_PANE_PROPS, direction: 'column', grow: undefined },
    { surface: 'terminal', props: PANE_PROPS, direction: 'column', grow: undefined },
  ] as const) {
    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await toNewGoal(ui)

    expect((await ui.find({ key: 'goal-pickers' }))?.props.flexDirection).toBe(direction)
    expect((await ui.find({ key: 'goal-picker-0' }))?.props.flexGrow).toBe(grow)
    expect((await ui.find({ key: 'goal-picker-1' }))?.props.flexGrow).toBe(grow)
    await ui.unmount()
  }
})
