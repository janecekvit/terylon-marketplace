// THE OVERVIEW'S HEAD AND WHAT HANGS OFF IT: the way to Notices, Memory and Health, the amber badge of a count that waits
// for the owner, Notices over the overview, the thin road and the fills on the graphic surfaces alone.

import { test, expect } from 'claude-code/testing'

import { BACKDROP_FILL, BADGE_FILL, BADGE_WORD, CARD_FILL, PANEL_GROUND, PANEL_WIDTH, ROAD_CARD_HEIGHT, SVG_COLOURS, WAITING_TILE_FILL, road } from '../hooks/drawing'
import { TONE_KEYS } from '../hooks/tones'

import { TEXT_RATIO, contrast, inks, painted } from './contrast'
import type { Ink, Theme } from './contrast'
import { BRIEFING, MEMORY, NARROW_PANE_PROPS, PANE_PROPS, SESSION, exact, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

const THEMES: Theme[] = ['dark', 'light']

const WIDE_PROPS = { ...(PANE_PROPS as Record<string, unknown>), bodyColumns: 100 } as never

function unreadable(found: readonly Ink[]): string[] {
  return THEMES.flatMap(theme => found.filter(ink => contrast(ink.color, ink.on, theme) < TEXT_RATIO).map(ink => `${theme}: "${ink.text}" in ${ink.color} on ${ink.on}`))
}

// A world with this many notices and memory proposals waiting.
function waitingWorld(on: Parameters<typeof world>[0], count: number) {
  const terylon = world(on)

  terylon.answers.briefing = { ...BRIEFING, unhandledNotices: count }
  terylon.answers.notices_list = { unhandled: count, notices: [] }
  terylon.answers.memory_get = { ...MEMORY, proposals: count === 0 ? [] : (MEMORY.proposals as unknown[]).slice(0, 1) }

  return terylon
}

test('the head holds the status line, then the bell, Memory, Health and Refresh in that order; the foot the 30 days alone', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'refresh' })
    const navigation = await ui.find({ key: 'overview-nav' })
    const keys = (await ui.findAll({ type: 'Button' })).map(button => button.key).filter(key => ['tab-bell', 'tab-memory', 'tab-status', 'refresh'].includes(String(key)))

    expect(navigation).toBeDefined()
    expect(keys).toEqual(['tab-bell', 'tab-memory', 'tab-status', 'refresh'])
    expect(await ui.find({ key: 'pills' })).toBeUndefined()
    expect((await ui.find({ key: 'overview-foot' }))?.text).toContain('Last 30 days')
    expect((await ui.findAll({ type: 'Button' })).filter(button => /›$/.test(String(button.props.label)))).toEqual([])
    await ui.unmount()
  }
})

for (const [key, badge] of [['tab-bell', 'tab-bell-badge'], ['tab-memory', 'tab-memory-badge']] as const) {
  test(`${key} at 0: no badge on the desktop and no dot on the terminal`, async ($, on) => {
    const terylon = waitingWorld(on, 0)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await desktop.press({ key: 'refresh' })
    expect(await desktop.find({ key: badge })).toBeUndefined()
    await desktop.unmount()

    const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await terminal.press({ key: 'refresh' })
    const button = await terminal.find({ key })
    expect(button?.text).toMatch(/ 0$/)
    expect(button?.text).not.toContain('●')
    await terminal.unmount()
  })

  test(`${key} at 1: the amber badge beside the Button on the desktop, one dark ink on both themes, and a warning dot on the terminal`, async ($, on) => {
    const terylon = waitingWorld(on, 1)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await desktop.press({ key: 'refresh' })
    const drawn = await desktop.find({ key: badge })
    expect(drawn?.props).toMatchObject({ backgroundColor: BADGE_FILL, borderStyle: 'round' })
    expect(drawn?.text).toBe('1')
    // BESIDE THE BUTTON, since a Button takes strings and Text alone.
    const words = inks(drawn)
    expect(words).toEqual([{ text: '1', color: BADGE_WORD, on: BADGE_FILL, isMark: false }])
    expect(unreadable(words)).toEqual([])
    await desktop.unmount()

    const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
    await terminal.press({ key: 'refresh' })
    const button = await terminal.find({ key })
    expect(button?.text).toMatch(/● 1$/)
    expect(await terminal.find({ key: badge })).toBeUndefined()
    expect((await terminal.findAll({ type: 'Text', text: /^● $/ })).map(dot => dot.props.color)).toContain('warning')
    await terminal.unmount()
  })
}

test('the badge is a mark and no amber word: raw and the same on both themes, the theme\'s warning never its ink', () => {
  expect(BADGE_FILL).toBe('#e0a84e')
  expect(BADGE_WORD).toBe('#1b1b1a')
  expect(TONE_KEYS.wait).toBe('warning')

  for (const theme of THEMES) {
    expect(painted(BADGE_FILL, theme)).toBe('#e0a84e')
    expect(contrast(BADGE_WORD, BADGE_FILL, theme)).toBeGreaterThanOrEqual(TEXT_RATIO)
  }
})

test('the bell: a glyph on the desktop, its label naming it with the count; the terminal says Notices n', async ($, on) => {
  const terylon = waitingWorld(on, 2)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await desktop.find({ key: 'tab-bell' }))?.props.label).toBe('Notices 2')
  expect((await desktop.find({ key: 'tab-bell' }))?.text).toBe('🔔')
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.find({ key: 'tab-bell' }))?.props.label).toBe('Notices 2')
  expect((await terminal.find({ key: 'tab-bell' }))?.text).toBe('Notices ● 2')
  await terminal.unmount()
})

test('NOTICES OVER THE OVERVIEW: a panel at top, right and bottom on a relative parent, a dim backdrop, ✕ takes it away', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-bell' })

  expect((await ui.find({ key: 'notices-over' }))?.props.position).toBe('relative')
  expect((await ui.find({ key: 'notices-backdrop' }))?.props).toMatchObject({ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: BACKDROP_FILL })
  expect((await ui.find({ key: 'notices-panel' }))?.props).toMatchObject({ position: 'absolute', top: 0, right: 0, bottom: 0, width: PANEL_WIDTH, backgroundColor: PANEL_GROUND })
  // THE OVERVIEW LIES UNDER IT, and the panel holds its way out, the console, Needs you and What the machine did.
  expect(await ui.find({ key: 'tiles' })).toBeDefined()
  expect((await ui.find({ key: 'notices-close' }))?.props.label).toBe('✕')
  expect((await ui.find({ type: 'Link', text: exact('In the console ↗') }))?.props.href).toContain('notices=open')
  expect(await ui.find({ type: 'Text', text: exact('Needs you · 2') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('What the machine did') })).toBeDefined()
  expect(await ui.find({ key: 'handle-117' })).toBeDefined()
  expect(await ui.find({ key: 'back' })).toBeUndefined()

  await ui.press({ key: 'notices-close' })
  expect(await ui.find({ key: 'notices-panel' })).toBeUndefined()
  expect(await ui.find({ key: 'tiles' })).toBeDefined()
})

test('every word and link on the panel reads on its own ground in both themes, and no one raw colour could', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-bell' })
  const found = inks(await ui.find({ key: 'notices-panel' }))

  expect(found.map(ink => ink.text)).toEqual(expect.arrayContaining(['Needs you · 2', 'What the machine did', 'In the console ↗']))
  expect(unreadable(found)).toEqual([])

  // WHY A THEME KEY: not one opaque grey holds `text` at 4.5:1 on both themes.
  const greys = Array.from({ length: 256 }, (_, value) => `#${value.toString(16).padStart(2, '0').repeat(3)}`)
  expect(greys.filter(grey => THEMES.every(theme => contrast('text', grey, theme) >= TEXT_RATIO))).toEqual([])
})

for (const [name, surface, props, env] of [
  ['the terminal', 'terminal', PANE_PROPS, {}],
  ['the narrow dock', 'desktop', NARROW_PANE_PROPS, {}],
  ['the desktop with the proof off', 'desktop', PANE_PROPS, { TERYLON_PANE_PROOFS: 'no-notices-over' }],
] as const) {
  test(`${name}: Notices are an ordinary screen with ‹ Overview, no panel and no backdrop`, async ($, on) => {
    const terylon = world(on, { env })
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, surface, props })
    await ui.press({ key: 'tab-bell' })

    expect(await ui.find({ key: 'notices-panel' })).toBeUndefined()
    expect(await ui.find({ key: 'notices-backdrop' })).toBeUndefined()
    expect(await ui.find({ key: 'tiles' })).toBeUndefined()
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ Overview')
    expect(await ui.find({ key: 'handle-117' })).toBeDefined()
    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'tab-bell' })).toBeDefined()
  })
}

test('MARK HANDLED in the panel moves the notice out of Needs you, its call sent on the press', async ($, on) => {
  const terylon = world(on)
  terylon.answers.notice_handle = { accepted: true, sentence: 'Handled.' }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-bell' })
  expect(terylon.calls.filter(call => call.tool === 'notice_handle')).toEqual([])
  await ui.press({ key: 'handle-117' })
  expect(terylon.calls.filter(call => call.tool === 'notice_handle').map(call => call.args)).toEqual([{ notice: 117 }])
  expect(await ui.find({ key: 'handle-117' })).toBeUndefined()
})

test('THE ROAD: 4 px on the overview\'s goal cards; what is ahead translucent, dark on dark and light on light', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'refresh' })
  const roads = await ui.findAll({ type: 'Svg' })

  expect(ROAD_CARD_HEIGHT).toBe(4)
  expect(roads.length).toBeGreaterThan(0)
  expect(roads.every(drawing => drawing.props.height === 4 && String(drawing.props.source).includes('height="4"'))).toBe(true)

  // A SEGMENT AHEAD COMPOSITED AS THE SURFACE PAINTS IT, grey and the gate's purple, near the board's #3a3a38 and #4a3b78.
  const source = road([{ label: 'Plan', status: 'next', isGate: false }, { label: 'Approve', status: 'next', isGate: true }] as never).source
  const [grey, gate] = [...source.matchAll(/fill="#([0-9a-f]{6})" fill-opacity="\.(\d+)"/g)].map(match => {
    const hex = match[1] ?? ''

    return `rgba(${[0, 2, 4].map(start => parseInt(hex.slice(start, start + 2), 16)).join(',')},0.${match[2]})`
  })
  const channel = (colour: string | undefined) => Math.max(...[1, 3, 5].map(start => parseInt((colour ?? '').slice(start, start + 2), 16)))

  expect(source).toContain(SVG_COLOURS.roadAhead)
  expect(source).toContain(SVG_COLOURS.roadGate)

  for (const fill of [grey, gate]) {
    expect(channel(painted(`background|${fill}`, 'dark'))).toBeLessThan(0x60)
    expect(channel(painted(`background|${fill}`, 'light'))).toBeGreaterThan(0xd0)
  }
})

test('THE FILLS, on a graphic surface alone: a card its neutral fill, the waiting tile its purple, the terminal none at all', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await desktop.find({ key: 'tile-waiting' }))?.props.backgroundColor).toBe(WAITING_TILE_FILL)
  expect((await desktop.find({ key: 'tile-running' }))?.props.backgroundColor).toBe(CARD_FILL)
  expect((await desktop.find({ key: 'waiting' }))?.props).toMatchObject({ borderColor: 'merged', backgroundColor: CARD_FILL })
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal', props: WIDE_PROPS })
  await terminal.press({ key: 'tab-status' })
  expect((await terminal.findAll({ type: 'Box' })).filter(box => box.props.backgroundColor !== undefined)).toEqual([])
})

test('Waiting for you keeps its purple stroke with nothing waiting', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { ...BRIEFING, plansWaiting: [], questionsOpen: [], storiesVerified: [], storiesBlocked: [] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'waiting' }))?.props.borderColor).toBe('merged')
})

test('HEALTH\'S TWO CARDS fill their columns: one width, one height, none at the width of its words', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: WIDE_PROPS })
  await ui.press({ key: 'tab-status' })

  const row = await ui.find({ key: 'status-cards' }) as unknown as { props: Record<string, unknown>; children: { props: Record<string, unknown> }[] }

  expect(row.props.alignItems).toBe('stretch')
  expect(row.children).toHaveLength(2)

  for (const column of row.children) {
    expect(column.props).toMatchObject({ flexDirection: 'column', flexGrow: 1, width: 0 })
  }

  expect((await ui.find({ key: 'status-machine' }))?.props.flexGrow).toBe(1)
  expect((await ui.find({ key: 'status-month' }))?.props.flexGrow).toBe(1)
})

test('MORE IS HEALTH AND MEMORY: Health first, no notice on it, and an alert a line that leads to Notices', async ($, on) => {
  const terylon = world(on)
  const alert = { id: 117, source: 'gatus', title: 'the page is not well', body: 'its body', key: 'gatus:x', link: null, raisedAt: '2026-10-11T07:26:00Z', handledAt: null }
  terylon.answers.notices_list = { unhandled: 1, notices: [alert] }
  terylon.answers.briefing = { ...BRIEFING, unhandledNotices: 1 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  const keys = (await ui.findAll({ type: 'Box' })).map(box => String(box.key))

  expect(keys.indexOf('more-health')).toBeLessThan(keys.indexOf('more-memory'))
  expect(await ui.find({ key: 'notices' })).toBeUndefined()
  expect(await ui.find({ key: 'handle-117' })).toBeUndefined()
  expect(await ui.find({ key: 'problem-alert-117' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('1 notice needs you: the page is not well') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('its body') })).toBeUndefined()

  await ui.press({ key: 'health-open-notices' })
  expect(await ui.find({ key: 'handle-117' })).toBeDefined()
  await ui.press({ key: 'notices-close' })
  expect(await ui.find({ key: 'tiles' })).toBeDefined()
})

test('NO DEVELOPER WORD on a screen a person reads: no tool, no internal, no command', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const seen: string[] = []
  const look = async () => {
    seen.push(...(await ui.findAll({ type: 'Text' })).map(node => node.text))
  }

  for (const path of [['refresh'], ['tab-bell', 'notices-close'], ['tab-memory', 'tab-queue'], ['tab-status', 'tab-queue'], ['open-plan-41', 'back'], ['story-333', 'back']]) {
    await ui.press({ key: path[0] ?? '' })
    await look()

    if (path[1] !== undefined) {
      await ui.press({ key: path[1] })
    }
  }

  expect(seen.length).toBeGreaterThan(20)
  expect(seen.filter(line => /\b(notice_handle|plans_list|story_get|work_in_flight|events_since|task_run|memory_get)\b|\/terylon-cockpit/.test(line))).toEqual([])
})
