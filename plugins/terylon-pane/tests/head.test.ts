// THE OVERVIEW'S HEAD AND WHAT HANGS OFF IT: the way to Notices and to Health & memory, the amber frame round a button
// while something behind it waits for the owner, Notices as a screen of its own, the thin road and the fills on the
// graphic surfaces alone.

import { test, expect } from 'claude-code/testing'

import { CARD_FILL, HEAD_FRAME, HEAD_WAITING_MARK, ROAD_CARD_HEIGHT, SVG_COLOURS, WAITING_TILE_FILL, road } from '../hooks/drawing'
import { TONE_KEYS } from '../hooks/tones'

import { MARK_RATIO, TEXT_RATIO, contrast, inks, painted } from './contrast'
import type { Ink, Theme } from './contrast'
import { BRIEFING, FLIGHT, MEMORY, NARROW_PANE_PROPS, PANE_PROPS, SESSION, exact, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

const THEMES: Theme[] = ['dark', 'light']

const WIDE_PROPS = { ...(PANE_PROPS as Record<string, unknown>), bodyColumns: 100 } as never

// The head's two buttons, each with the word it draws.
const HEAD_BUTTONS = [['tab-bell', 'Notices'], ['tab-status', 'Health & memory']] as const

// The graphic surfaces, where the frame is drawn: the narrow dock follows the desktop.
const GRAPHIC = [['the desktop', PANE_PROPS], ['the narrow dock', NARROW_PANE_PROPS]] as const

function unreadable(found: readonly Ink[]): string[] {
  return THEMES.flatMap(theme => found.filter(ink => contrast(ink.color, ink.on, theme) < TEXT_RATIO).map(ink => `${theme}: "${ink.text}" in ${ink.color} on ${ink.on}`))
}

// A world with this many notices and memory proposals waiting, and Health well.
function waitingWorld(on: Parameters<typeof world>[0], count: number) {
  const terylon = world(on)

  terylon.answers.briefing = { ...BRIEFING, unhandledNotices: count }
  terylon.answers.notices_list = { unhandled: count, notices: [] }
  terylon.answers.memory_get = { ...MEMORY, proposals: count === 0 ? [] : (MEMORY.proposals as unknown[]).slice(0, 1) }

  return terylon
}

test('the head holds the status line, then Notices, Health & memory and Refresh in that order, each its plain word; the foot the 30 days alone', async ($, on) => {
  const terylon = waitingWorld(on, 2)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'refresh' })
    const navigation = await ui.find({ key: 'overview-nav' })
    const buttons = (await ui.findAll({ type: 'Button' })).filter(button => ['tab-bell', 'tab-memory', 'tab-status', 'refresh'].includes(String(button.key)))

    expect(navigation).toBeDefined()
    expect(buttons.map(button => button.key)).toEqual(['tab-bell', 'tab-status', 'refresh'])
    // NO GLYPH, COUNT, BADGE, ⚠ OR › in a label: what waits is drawn round the button, never in it.
    expect(buttons.map(button => button.props.label)).toEqual(['Notices', 'Health & memory', 'Refresh'])
    expect(buttons.filter(button => /[0-9⚠›🔔]/u.test(`${String(button.props.label)} ${button.text}`))).toEqual([])
    expect(await ui.find({ key: 'pills' })).toBeUndefined()
    expect((await ui.find({ key: 'overview-foot' }))?.text).toContain('Last 30 days')
    expect((await ui.findAll({ type: 'Button' })).filter(button => /›$/.test(String(button.props.label)))).toEqual([])
    await ui.unmount()
  }
})

for (const [key, word] of HEAD_BUTTONS) {
  for (const [name, props] of GRAPHIC) {
    test(`${name}: ${word} at 0 draws its Button in a Box of the frame's padding with no frame`, async ($, on) => {
      const terylon = waitingWorld(on, 0)
      await $.session.start(SESSION)
      await terylon.clock.settle()

      const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props })
      await ui.press({ key: 'refresh' })
      const frame = await ui.find({ key: `${key}-frame` })

      // ITS PLACE KEPT: the same Box and padding as when it waits, so the head does not move.
      expect(frame?.type).toBe('Box')
      expect(frame?.props.padding).toBe('xs')
      expect(frame?.props.borderStyle).toBeUndefined()
      expect(frame?.props.borderColor).toBeUndefined()
      expect((await ui.find({ key }))?.props.label).toBe(word)
      expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.borderColor === HEAD_FRAME)).toEqual([])
    })

    test(`${name}: ${word} at 1 is framed round in amber, its Button the plain word with nothing inside it`, async ($, on) => {
      const terylon = waitingWorld(on, 1)
      await $.session.start(SESSION)
      await terylon.clock.settle()

      const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props })
      await ui.press({ key: 'refresh' })
      const frame = await ui.find({ key: `${key}-frame` }) as unknown as { type: string; text: string; props: Record<string, unknown>; children: { type?: string }[] }
      const button = await ui.find({ key })

      expect(frame.type).toBe('Box')
      expect(frame.props).toMatchObject({ borderStyle: 'round', borderColor: HEAD_FRAME, padding: 'xs' })
      expect(frame.props.backgroundColor).toBeUndefined()
      // THE BUTTON IS THE FRAME'S ONE CHILD, and holds no child of its own: Desktop would not draw one.
      expect(frame.children.map(child => child.type)).toEqual(['Button'])
      expect(frame.text).toBe(word)
      expect(button?.props.label).toBe(word)
      expect(button?.props.variant).toBeUndefined()
      expect(((button as unknown as { children?: unknown[] }).children ?? []).filter(child => typeof child !== 'string')).toEqual([])
    })
  }

  for (const count of [1, 0]) {
    test(`the terminal: ${word} at ${count} is "${count === 0 ? '' : '● '}${word}"${count === 0 ? '' : ', the dot in warning'}, and no frame`, async ($, on) => {
      const terylon = waitingWorld(on, count)
      await $.session.start(SESSION)
      await terylon.clock.settle()

      const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
      await ui.press({ key: 'refresh' })
      const button = await ui.find({ key })
      const dots = (await ui.findAll({ type: 'Text', text: /^● $/ })).filter(dot => dot.props.color === 'warning')

      expect(button?.props.label).toBe(word)
      expect(button?.text).toBe(count === 0 ? word : `● ${word}`)
      expect(dots.length).toBe(count === 0 ? 0 : HEAD_BUTTONS.length)
      expect(await ui.find({ key: `${key}-frame` })).toBeUndefined()
      expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.borderColor === HEAD_FRAME)).toEqual([])
    })
  }
}

test('Health & memory is framed while Health has a problem, with no memory proposal waiting; Notices is not', async ($, on) => {
  const terylon = waitingWorld(on, 0)
  terylon.answers.briefing = { ...BRIEFING, unhandledNotices: 0, leader: { paused: true, pausedAt: '2026-10-11T12:05:00Z', reason: 'Host maintenance tonight.' } }
  terylon.answers.work_in_flight = { ...FLIGHT, paused: true }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await desktop.press({ key: 'refresh' })
  expect((await desktop.find({ key: 'tab-status-frame' }))?.props.borderColor).toBe(HEAD_FRAME)
  expect((await desktop.find({ key: 'tab-bell-frame' }))?.props.borderColor).toBeUndefined()
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await terminal.press({ key: 'refresh' })
  expect((await terminal.find({ key: 'tab-status' }))?.text).toBe('● Health & memory')
  expect((await terminal.find({ key: 'tab-bell' }))?.text).toBe('Notices')
})

test('Health & memory is framed while a memory proposal waits, with Health well and no notice', async ($, on) => {
  const terylon = waitingWorld(on, 0)
  terylon.answers.memory_get = { ...MEMORY, proposals: (MEMORY.proposals as unknown[]).slice(0, 1) }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'refresh' })
  expect((await ui.find({ key: 'tab-status-frame' }))?.props.borderColor).toBe(HEAD_FRAME)
  expect((await ui.find({ key: 'tab-bell-frame' }))?.props.borderColor).toBeUndefined()
})

test('the frame is a mark and no amber word: raw and the same on both themes, the theme\'s warning never its ink', () => {
  expect(HEAD_FRAME).toBe('#e0a84e')
  expect(HEAD_WAITING_MARK).toBe('frame')
  expect(TONE_KEYS.wait).toBe('warning')

  for (const theme of THEMES) {
    expect(painted(HEAD_FRAME, theme)).toBe('#e0a84e')
  }

  // A MARK'S 3:1 ON THE DARK THEME; on the light one the raw stroke falls short of it, which is what the switch to the
  // surface's primary button is for.
  expect(contrast(HEAD_FRAME, 'background', 'dark')).toBeGreaterThanOrEqual(MARK_RATIO)
})

test('Health & memory opens More at its top: Health first, then Memory, and no button opens Memory alone', async ($, on) => {
  const terylon = waitingWorld(on, 1)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ key: 'tab-memory' })).toBeUndefined()
  await ui.press({ key: 'tab-status' })
  const keys = (await ui.findAll({ type: 'Box' })).map(box => String(box.key))

  // THE PAGE'S HEAD FIRST, then Health, then Memory: the top it is opened at is Health's.
  expect(keys.indexOf('more-top')).toBeGreaterThanOrEqual(0)
  expect(keys.indexOf('more-top')).toBeLessThan(keys.indexOf('more-health'))
  expect(keys.indexOf('more-health')).toBeLessThan(keys.indexOf('more-memory'))
  expect(await ui.find({ key: 'act-proposal-5-confirm' })).toBeDefined()
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

  for (const path of [['refresh'], ['tab-bell', 'back'], ['tab-status', 'tab-queue'], ['open-plan-41', 'back'], ['story-333', 'back']]) {
    await ui.press({ key: path[0] ?? '' })
    await look()

    if (path[1] !== undefined) {
      await ui.press({ key: path[1] })
    }
  }

  expect(seen.length).toBeGreaterThan(20)
  expect(seen.filter(line => /\b(notice_handle|plans_list|story_get|work_in_flight|events_since|task_run|memory_get)\b|\/terylon-cockpit/.test(line))).toEqual([])
})
