// Round 2 of the operator's Desktop walk (#332 c9): air in the cards, everything inside a card, a kind column wide
// enough for its sources, one notice per key on the machine card, a bell row that opens, a goal that opens whole.

import { test, expect } from 'claude-code/testing'

import { kindWidth } from '../hooks/register'

import { PANE_PROPS, SESSION, exact, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

// A bell as TerylonLab rings it: a long source, a notice with its own console link, one key raised three times.
const BELL = {
  unhandled: 2,
  notices: [
    { id: 90, source: 'session', title: 'Production has no egress', body: 'Fix: as root, set EGRESS=off and restart terylon-host-firewall.', key: 'incident:321-egress', link: null, raisedAt: '2026-10-10T11:19:17Z', handledAt: null },
    { id: 56, source: 'orchestrator', title: '#265: test web push', body: '', key: 'orchestrator/265-push-test', link: '/?cockpit=waiting', raisedAt: '2026-10-08T07:49:00Z', handledAt: null },
    { id: 175, source: 'backup', title: 'The backup ran', body: 'at 09:51', key: 'backup', raisedAt: '2026-10-11T09:51:09Z', handledAt: '2026-10-11T09:51:09Z' },
    { id: 157, source: 'backup', title: 'The backup ran', body: 'at 03:35', key: 'backup', raisedAt: '2026-10-11T03:35:19Z', handledAt: '2026-10-11T03:35:19Z' },
    { id: 120, source: 'backup', title: 'The backup ran', body: 'at 03:30', key: 'backup', raisedAt: '2026-10-10T03:30:00Z', handledAt: '2026-10-10T03:30:00Z' },
    { id: 174, source: 'production', title: 'Production is at d577b984', body: '', key: 'production-follow:terylon-production', raisedAt: '2026-10-11T08:39:55Z', handledAt: '2026-10-11T08:39:55Z' },
    { id: 169, source: 'production', title: 'Production is at 6bfbcb51', body: '', key: 'production-follow:terylon-production', raisedAt: '2026-10-11T05:13:01Z', handledAt: '2026-10-11T05:13:01Z' },
    { id: 156, source: 'host', title: 'terylon-remote is signed in', body: '', key: 'remote-login', raisedAt: '2026-10-11T04:33:33Z', handledAt: '2026-10-11T04:33:33Z' },
    { id: 140, source: 'host', title: 'TerylonLab host: all well again', body: '', key: 'host-health', raisedAt: '2026-10-11T04:24:19Z', handledAt: '2026-10-11T04:24:19Z' },
    { id: 139, source: 'production', title: 'Production is at a8c9f99d', body: '', key: 'production-follow:terylon-production', raisedAt: '2026-10-11T03:26:19Z', handledAt: '2026-10-11T03:26:19Z' },
  ],
}

test('a card has air: its rows stand apart from its title on every surface, and from one another on the desktop', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  // THE SURFACE'S OWN SPACING STEPS on the desktop (S32), whole cells on the terminal.
  for (const [surface, cardGap, padding, rowGap] of [['desktop', 'sm', 'md', 'xs'], ['terminal', 1, 1, 0]] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const cards = (await ui.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'round')

    expect(cards.length).toBeGreaterThanOrEqual(4)
    expect(cards.every(box => box.props.gap === cardGap && box.props.paddingX === padding)).toBe(true)

    // Each card holds its rows in a column of their own, spaced by the surface.
    const rowColumns = (await ui.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === undefined && box.props.flexDirection === 'column' && box.props.gap === rowGap)
    expect(rowColumns.length).toBeGreaterThanOrEqual(cards.length)
    await ui.unmount()
  }
})

test('everything sits in a card: no plan, no memory, no proposal is a card with its quiet line inside', async ($, on) => {
  const terylon = world(on)
  terylon.answers.plans_list = { plans: [] }
  terylon.answers.memory_get = { files: [], proposals: [], rules: [] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  expect(await ui.find({ type: 'Text', text: exact('Plans') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: exact('No plan waits.') }))?.props.color).toBe('subtle')

  await ui.press({ key: 'tab-memory' })

  for (const heading of ['Memory', 'Proposals waiting for confirmation', 'Proposed in this session']) {
    expect((await ui.find({ type: 'Text', text: exact(heading) }))?.props.bold).toBe(true)
  }

  expect(await ui.find({ type: 'Text', text: exact('Nothing remembered yet.') })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: exact('Nothing yet.') })).length).toBe(2)
})

test('the kind column holds "orchestrator" whole, and never grows past fourteen cells', () => {
  expect(kindWidth(['question', 'merge'])).toBe(12)
  expect(kindWidth(['gatus', 'orchestrator', 'leader'])).toBe(12)
  expect(kindWidth(['production-follow'])).toBe(14)
})

test('the bell: a row opens its body, which says what to do, and its own console link sits there', async ($, on) => {
  const terylon = world(on)
  terylon.answers.notices_list = BELL
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-bell' })

    expect(await ui.find({ type: 'Text', text: /^\s*●?\s*orchestrator\s*$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /EGRESS=off/ })).toBeUndefined()
    await ui.press({ key: 'notice-90' })
    expect((await ui.find({ type: 'Text', text: /EGRESS=off/ }))?.props.color).toBe('inactive')
    await ui.press({ key: 'notice-90' })

    expect(await ui.find({ type: 'Link', text: exact('↗') })).toBeUndefined()
    await ui.press({ key: 'notice-56' })
    expect(await ui.find({ type: 'Text', text: exact('No more than the title.') })).toBeDefined()
    expect((await ui.find({ type: 'Link', text: 'Bell in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=waiting')
    await ui.press({ key: 'notice-56' })
    await ui.unmount()
  }
})

test('the machine card shows the newest notice of each key, four different ones', async ($, on) => {
  const terylon = world(on)
  terylon.answers.notices_list = BELL
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-bell' })

  const handled = (await ui.findAll({ type: 'Text', text: /^✓ (?!The leader runs)\S/ })).map(line => line.text)
  expect(handled).toHaveLength(4)
  expect(handled.filter(line => line.includes('The backup ran'))).toHaveLength(1)

  const production = handled.filter(line => line.includes('Production is at'))
  expect(production).toHaveLength(1)
  expect(production[0]).toContain('d577b984')
})

test('a goal opens whole from the goals tab, its stories open, and ‹ comes back to the goals', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goal-3' })

  expect(terylon.calls.filter(call => call.tool === 'goal_get').map(call => call.args)).toEqual([{ goal: 3 }])
  expect(await ui.find({ type: 'Text', text: exact('P1 · Agentic OS') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('P1 · open') })).toBeDefined()
  expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ Goals')

  await ui.press({ key: 'goal-story-333' })
  expect(await ui.find({ type: 'Text', text: exact('#333 Direct dispatch') })).toBeDefined()
  await ui.press({ key: 'back' })
  await ui.press({ key: 'back' })
  expect((await ui.find({ key: 'tab-goals' }))?.props.variant).toBe('primary')
})
