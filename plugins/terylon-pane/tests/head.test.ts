// THE OVERVIEW'S HEAD AND WHAT HANGS OFF IT: the way to Notices, to Memory and to System, the primary button while something
// behind it waits for the owner, Notices as a screen of its own, the thin road and the fills on the graphic surfaces
// alone.

import { test, expect } from 'claude-code/testing'

import { CARD_FILL, ROAD_CARD_HEIGHT, SVG_COLOURS, WAITING_TILE_FILL, road } from '../hooks/drawing'

import { TEXT_RATIO, contrast, inks, painted } from './contrast'
import type { Ink, Theme } from './contrast'
import { BRIEFING, FLIGHT, MEMORY, NARROW_PANE_PROPS, PANE_PROPS, SESSION, exact, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

const THEMES: Theme[] = ['dark', 'light']

const WIDE_PROPS = { ...(PANE_PROPS as Record<string, unknown>), bodyColumns: 100 } as never

// The head's three buttons, each with the word it draws.
const HEAD_BUTTONS = [['tab-bell', 'Notices'], ['tab-memory', 'Memory'], ['tab-status', 'System']] as const

// THE LEADER PAUSED, a problem on Health: what lights System.
const PAUSED_LEADER = { paused: true, pausedAt: '2026-10-11T12:05:00Z', reason: 'Host maintenance tonight.' }

// The graphic surfaces, where a waiting button is the primary one: the narrow dock follows the desktop.
const GRAPHIC = [['the desktop', PANE_PROPS], ['the narrow dock', NARROW_PANE_PROPS]] as const

// An amber stroke round a head button: no Box of the head carries it, since Desktop draws the Button as it likes.
const AMBER = '#e0a84e'

type Drawn = { type?: string; key?: unknown; props: Record<string, unknown>; children?: unknown[] }

function unreadable(found: readonly Ink[]): string[] {
  return THEMES.flatMap(theme => found.filter(ink => contrast(ink.color, ink.on, theme) < TEXT_RATIO).map(ink => `${theme}: "${ink.text}" in ${ink.color} on ${ink.on}`))
}

// A world with this many notices and memory proposals waiting, and while any waits, a problem on Health: the leader
// paused. With none, Health is well.
function waitingWorld(on: Parameters<typeof world>[0], count: number) {
  const terylon = world(on)

  terylon.answers.briefing = count === 0 ? { ...BRIEFING, unhandledNotices: count } : { ...BRIEFING, unhandledNotices: count, leader: PAUSED_LEADER }
  terylon.answers.work_in_flight = { ...FLIGHT, paused: count > 0 }
  terylon.answers.notices_list = { unhandled: count, notices: [] }
  terylon.answers.memory_get = { ...MEMORY, proposals: count === 0 ? [] : (MEMORY.proposals as unknown[]).slice(0, 1) }

  return terylon
}

test('the head holds the status line, then Notices, Memory, System and Refresh in that order, each its plain word; no 30 days at the foot', async ($, on) => {
  const terylon = waitingWorld(on, 2)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'refresh' })
    const navigation = await ui.find({ key: 'overview-nav' })
    const buttons = (await ui.findAll({ type: 'Button' })).filter(button => ['tab-bell', 'tab-memory', 'tab-status', 'refresh'].includes(String(button.key)))

    expect(navigation).toBeDefined()
    expect(buttons.map(button => button.key)).toEqual(['tab-bell', 'tab-memory', 'tab-status', 'refresh'])
    // NO GLYPH, COUNT, BADGE, ⚠ OR › in a label: what waits is the Button's variant, never a word in it.
    expect(buttons.map(button => button.props.label)).toEqual(['Notices', 'Memory', 'System', 'Refresh'])
    expect(buttons.filter(button => /[0-9⚠›🔔]/u.test(`${String(button.props.label)} ${button.text}`))).toEqual([])
    expect(await ui.find({ key: 'pills' })).toBeUndefined()
    expect(await ui.find({ key: 'overview-foot' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Last 30 days|per story/ })).toBeUndefined()
    expect((await ui.findAll({ type: 'Button' })).filter(button => /›$/.test(String(button.props.label)))).toEqual([])
    await ui.unmount()
  }
})

for (const [key, word] of HEAD_BUTTONS) {
  for (const [name, props] of GRAPHIC) {
    for (const count of [0, 1]) {
      test(`${name}: ${word} at ${count} is ${count === 0 ? 'a plain Button, no variant' : 'the primary Button'}, its label the plain word with nothing inside it`, async ($, on) => {
        const terylon = waitingWorld(on, count)
        await $.session.start(SESSION)
        await terylon.clock.settle()

        const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props })
        await ui.press({ key: 'refresh' })
        const button = await ui.find({ key }) as unknown as Drawn & { text: string }

        expect(button.type).toBe('Button')
        expect(button.props.label).toBe(word)
        expect(button.props.variant).toBe(count === 0 ? undefined : 'primary')
        expect(button.text).toBe(word)
        // THE BUTTON HOLDS NO CHILD OF ITS OWN: Desktop would not draw one.
        expect((button.children ?? []).filter(child => typeof child !== 'string')).toEqual([])
        expect(await ui.find({ key: `${key}-frame` })).toBeUndefined()
      })
    }
  }

  for (const count of [1, 0]) {
    test(`the terminal: ${word} at ${count} is "${count === 0 ? '' : '● '}${word}"${count === 0 ? '' : ', the dot in warning'}, and no variant`, async ($, on) => {
      const terylon = waitingWorld(on, count)
      await $.session.start(SESSION)
      await terylon.clock.settle()

      const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
      await ui.press({ key: 'refresh' })
      const button = await ui.find({ key })
      const dots = (await ui.findAll({ type: 'Text', text: /^● $/ })).filter(dot => dot.props.color === 'warning')

      expect(button?.props.label).toBe(word)
      expect(button?.props.variant).toBeUndefined()
      expect(button?.text).toBe(count === 0 ? word : `● ${word}`)
      expect(dots.length).toBe(count === 0 ? 0 : HEAD_BUTTONS.length)
      expect(await ui.find({ key: `${key}-frame` })).toBeUndefined()
    })
  }
}

test('System is primary while Health has a problem, with no memory proposal waiting; Memory and Notices stay plain', async ($, on) => {
  const terylon = waitingWorld(on, 0)
  terylon.answers.briefing = { ...BRIEFING, unhandledNotices: 0, leader: PAUSED_LEADER }
  terylon.answers.work_in_flight = { ...FLIGHT, paused: true }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await desktop.press({ key: 'refresh' })
  expect((await desktop.find({ key: 'tab-status' }))?.props.variant).toBe('primary')
  expect((await desktop.find({ key: 'tab-memory' }))?.props.variant).toBeUndefined()
  expect((await desktop.find({ key: 'tab-bell' }))?.props.variant).toBeUndefined()
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await terminal.press({ key: 'refresh' })
  expect((await terminal.find({ key: 'tab-status' }))?.text).toBe('● System')
  expect((await terminal.find({ key: 'tab-memory' }))?.text).toBe('Memory')
  expect((await terminal.find({ key: 'tab-bell' }))?.text).toBe('Notices')
})

test('Memory is primary while a memory proposal waits, with Health well and no notice; a proposal no longer lights System', async ($, on) => {
  const terylon = waitingWorld(on, 0)
  terylon.answers.memory_get = { ...MEMORY, proposals: (MEMORY.proposals as unknown[]).slice(0, 1) }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await desktop.press({ key: 'refresh' })
  expect((await desktop.find({ key: 'tab-memory' }))?.props.variant).toBe('primary')
  expect((await desktop.find({ key: 'tab-status' }))?.props.variant).toBeUndefined()
  expect((await desktop.find({ key: 'tab-bell' }))?.props.variant).toBeUndefined()
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await terminal.press({ key: 'refresh' })
  expect((await terminal.find({ key: 'tab-memory' }))?.text).toBe('● Memory')
  expect((await terminal.find({ key: 'tab-status' }))?.text).toBe('System')
  expect((await terminal.find({ key: 'tab-bell' }))?.text).toBe('Notices')
})

for (const count of [0, 2]) {
  test(`Refresh is never primary, with ${count} waiting, and no Box of the head carries an amber stroke`, async ($, on) => {
    const terylon = waitingWorld(on, count)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    for (const [, props] of GRAPHIC) {
      const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props })
      await ui.press({ key: 'refresh' })
      const navigation = await ui.find({ key: 'overview-nav' }) as unknown as Drawn
      const head = await ui.find({ key: 'overview-head' }) as unknown as Drawn
      const boxesOf = (node: unknown): Drawn[] => {
        const drawn = node as Drawn

        return [...(drawn?.type === 'Box' ? [drawn] : []), ...(drawn?.children ?? []).flatMap(boxesOf)]
      }

      expect((await ui.find({ key: 'refresh' }))?.props.variant).toBeUndefined()
      // THE HEAD'S BUTTONS SIT IN THE ROW THEMSELVES, no Box round any of them.
      expect((navigation.children ?? []).map(child => (child as Drawn).type)).toEqual(['Button', 'Button', 'Button', 'Button'])
      expect(boxesOf(head).filter(box => box.props.borderColor !== undefined || box.props.borderStyle !== undefined)).toEqual([])
      expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.borderColor === AMBER || String(box.key).endsWith('-frame'))).toEqual([])
      await ui.unmount()
    }
  })
}

test('System opens Health alone and Memory the memory alone, each at its top under ‹ Overview and Refresh', async ($, on) => {
  const terylon = waitingWorld(on, 1)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'refresh' })
  await ui.press({ key: 'tab-status' })
  const system = (await ui.findAll({ type: 'Box' })).map(box => String(box.key))

  // SYSTEM: its head, then Health, and nothing of the memory.
  expect(system.indexOf('more-top')).toBeGreaterThanOrEqual(0)
  expect(system.indexOf('more-top')).toBeLessThan(system.indexOf('more-health'))
  expect(system).not.toContain('more-memory')
  expect(await ui.find({ key: 'act-proposal-5-confirm' })).toBeUndefined()
  expect((await ui.find({ key: 'tab-queue' }))?.props.label).toBe('‹ Overview')
  expect(await ui.find({ key: 'refresh' })).toBeDefined()

  // MEMORY: its head, then the memory with its proposal, and nothing of Health.
  await ui.press({ key: 'tab-queue' })
  await ui.press({ key: 'tab-memory' })
  const memory = (await ui.findAll({ type: 'Box' })).map(box => String(box.key))

  expect(memory.indexOf('memory-top')).toBeGreaterThanOrEqual(0)
  expect(memory.indexOf('memory-top')).toBeLessThan(memory.indexOf('more-memory'))
  expect(memory).not.toContain('more-health')
  expect(memory).not.toContain('more-top')
  expect(await ui.find({ key: 'act-proposal-5-confirm' })).toBeDefined()
  expect(await ui.find({ key: 'act-leader-resume' })).toBeUndefined()
  expect((await ui.find({ key: 'tab-queue' }))?.props.label).toBe('‹ Overview')
  expect(await ui.find({ key: 'refresh' })).toBeDefined()
  await ui.press({ key: 'tab-queue' })
  expect(await ui.find({ key: 'tiles' })).toBeDefined()
})

for (const [name, surface, props, env] of [
  ['the desktop', 'desktop', PANE_PROPS, {}],
  ['the desktop with notices-over named', 'desktop', PANE_PROPS, { TERYLON_PANE_PROOFS: 'notices-over' }],
  ['the terminal', 'terminal', PANE_PROPS, {}],
  ['the narrow dock', 'desktop', NARROW_PANE_PROPS, {}],
] as const) {
  test(`${name}: Notices are an ordinary screen with ‹ Overview and Refresh, nothing laid over the overview`, async ($, on) => {
    const terylon = world(on, { env })
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, surface, props })
    await ui.press({ key: 'tab-bell' })

    // NO PANEL, NO BACKDROP and nothing drawn absolute: the overview is not under it.
    expect(await ui.find({ key: 'notices-over' })).toBeUndefined()
    expect(await ui.find({ key: 'notices-panel' })).toBeUndefined()
    expect(await ui.find({ key: 'notices-backdrop' })).toBeUndefined()
    expect(await ui.find({ key: 'notices-close' })).toBeUndefined()
    expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.position !== undefined)).toEqual([])
    expect(await ui.find({ key: 'tiles' })).toBeUndefined()
    // ITS HEAD AS MORE'S: ‹ Overview, then Refresh.
    const head = (await ui.findAll({ type: 'Button' })).map(button => String(button.key)).filter(key => ['back', 'refresh'].includes(key))
    expect(head).toEqual(['back', 'refresh'])
    expect(await ui.find({ key: 'notices-top' })).toBeDefined()
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ Overview')
    // ITS CARDS: the console, Needs you, each notice with Mark handled, and What the machine did.
    expect((await ui.find({ type: 'Link', text: exact('In the console ↗') }))?.props.href).toContain('notices=open')
    expect(await ui.find({ type: 'Text', text: exact('Needs you · 2') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('What the machine did') })).toBeDefined()
    expect((await ui.find({ key: 'handle-117' }))?.props.label).toBe('Mark handled')
    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'tab-bell' })).toBeDefined()
  })
}

test('every word and link on the Notices screen reads on the pane\'s own background in both themes', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-bell' })
  const found = inks(await ui.find({ key: 'notices' }))

  expect(found.map(ink => ink.text)).toEqual(expect.arrayContaining(['Needs you · 2', 'What the machine did', 'In the console ↗']))
  expect(unreadable(found)).toEqual([])
})

test('MARK HANDLED on the Notices screen moves the notice out of Needs you, its call sent on the press', async ($, on) => {
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

test('SYSTEM IS HEALTH ALONE: no memory, no notice on it, and an alert a line that leads to Notices', async ($, on) => {
  const terylon = world(on)
  const alert = { id: 117, source: 'gatus', title: 'the page is not well', body: 'its body', key: 'gatus:x', link: null, raisedAt: '2026-10-11T07:26:00Z', handledAt: null }
  terylon.answers.notices_list = { unhandled: 1, notices: [alert] }
  terylon.answers.briefing = { ...BRIEFING, unhandledNotices: 1 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  const keys = (await ui.findAll({ type: 'Box' })).map(box => String(box.key))

  expect(keys).toContain('more-health')
  expect(keys).not.toContain('more-memory')
  expect(await ui.find({ key: 'notices' })).toBeUndefined()
  expect(await ui.find({ key: 'handle-117' })).toBeUndefined()
  expect(await ui.find({ key: 'problem-alert-117' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('1 notice needs you: the page is not well') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('its body') })).toBeUndefined()

  await ui.press({ key: 'health-open-notices' })
  expect(await ui.find({ key: 'handle-117' })).toBeDefined()
  await ui.press({ key: 'back' })
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

  for (const path of [['refresh'], ['tab-bell', 'back'], ['tab-status', 'tab-queue'], ['tab-memory', 'tab-queue'], ['open-plan-41', 'back'], ['story-333', 'back']]) {
    await ui.press({ key: path[0] ?? '' })
    await look()

    if (path[1] !== undefined) {
      await ui.press({ key: path[1] })
    }
  }

  expect(seen.length).toBeGreaterThan(20)
  expect(seen.filter(line => /\b(notice_handle|plans_list|story_get|work_in_flight|events_since|task_run|memory_get)\b|\/terylon-cockpit/.test(line))).toEqual([])
})
