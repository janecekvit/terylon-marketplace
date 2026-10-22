// THE BAND above the prompt: one row, the pane's entry point, in every state the canvas (v2 · V2-Band) draws.
// Colours are asserted, not only words: a value is coloured only when it differs from the calm default.

import { test, expect } from 'claude-code/testing'

import { HOUR, PANE_PROPS, SESSION, bandProps, exact, world } from './fixtures'

const SURFACES = ['desktop', 'terminal'] as const

function bandOn(surface: 'desktop' | 'terminal', hasSurvey = false) {
  return { plugin: 'terylon-pane', surface, component: 'AbovePrompt', props: bandProps(hasSurvey) } as const
}

test('calm: every value at its default is inactive, names subtle, one truncating row, a plain dim Open', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { plansWaiting: [], questionsOpen: [], storiesVerified: [], storiesBlocked: [], leader: { paused: null }, unhandledNotices: 0 }
  terylon.answers.work_in_flight = { slots: 2, paused: false, stories: [] }
  terylon.answers.stories_list = { stories: [] }
  terylon.answers.notices_list = { unhandled: 0, notices: [] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of SURFACES) {
    const band = await $.ui.mount(bandOn(surface))

    expect((await band.find({ type: 'Text', text: exact('Terylon') }))?.props.color).toBe('inactive')
    expect((await band.find({ type: 'Text', text: exact(' · Waiting ') }))?.props.color).toBe('subtle')
    expect((await band.find({ type: 'Text', text: exact(' · Queue ') }))?.props.color).toBe('subtle')

    for (const zero of await band.findAll({ type: 'Text', text: exact('0') })) {
      expect(zero.props.color).toBe('inactive')
    }

    const row = await band.find({ type: 'Text', text: /^Terylon · Waiting 0 · Running 0 · Queue 0 · Bell 0$/ })
    expect(row?.props.wrap).toBe('truncate-end')

    const button = await band.find({ key: 'band-open' })
    expect(button?.props.label).toBe('Open')
    expect(button?.props.plain).toBe(true)
    expect(button?.props.dimColor).toBe(true)

    for (const text of await band.findAll({ type: 'Text' })) {
      expect(text.props.backgroundColor).toBeUndefined()
    }

    await band.unmount()
  }
})

test('something waits: Waiting in warning, Running in suggestion, the rest stays inactive', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of SURFACES) {
    const band = await $.ui.mount(bandOn(surface))

    expect(await band.find({ type: 'Text', text: exact('Terylon · Waiting 3 · Running 2 · Queue 2 · Bell 2') })).toBeDefined()
    expect((await band.find({ type: 'Text', text: exact('3') }))?.props.color).toBe('warning')
    // THE BELL'S COUNT (#360): the unhandled notices, in warning while any waits.
    expect((await band.findAll({ type: 'Text', text: exact('2') })).map(text => text.props.color)).toEqual(['suggestion', 'inactive', 'warning'])
    expect(await band.find({ type: 'Text', text: /Today|Slots|\$/ })).toBeUndefined()
    expect((await band.find({ key: 'band-open' }))?.props.label).toBe('Open')
    await band.unmount()
  }
})

test('a stuck story is counted beside Running, in warning', async ($, on) => {
  const terylon = world(on)
  terylon.answers.work_in_flight = {
    slots: 2,
    paused: false,
    stories: [{ id: 329, title: 'Memory proposals', state: 'running', costUsd: 3.4, stuck: { since: '2026-10-11T15:20:00Z', reason: 'no progress' } }],
  }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const band = await $.ui.mount(bandOn('desktop'))
  expect((await band.find({ type: 'Text', text: exact(' (1 stuck)') }))?.props.color).toBe('warning')
})

test('the leader paused: since when, in warning, and no spend or slots', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { ...(terylon.answers.briefing as object), leader: { paused: { at: '2026-10-11T14:05:00Z', source: 'cockpit', reason: null } } }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of SURFACES) {
    const band = await $.ui.mount(bandOn(surface))
    expect((await band.find({ type: 'Text', text: /^paused since \d\d:\d\d$/ }))?.props.color).toBe('warning')
    expect((await band.find({ key: 'band-open' }))?.props.label).toBe('Open')
    await band.unmount()
  }
})

test('not allowed: the band says Claude Code refused, and Open opens the pane, whose queue starts with the rules', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'unclassified'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const band = await $.ui.mount(bandOn('desktop'))
  expect((await band.find({ type: 'Text', text: exact("Claude Code refused the pane's call") }))?.props.color).toBe('warning')
  expect(await band.find({ type: 'Text', text: exact(' · allow rules missing') })).toBeDefined()
  expect((await band.find({ key: 'band-open' }))?.props.label).toBe('Open')

  await band.press({ key: 'band-open' })
  expect(terylon.opens).toEqual(['terylon'])

  const pane = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
  expect(await pane.find({ type: 'Text', text: exact("Claude Code refused the pane's call") })).toBeDefined()
  expect(await pane.find({ type: 'Markdown', text: /permissions/ })).toBeDefined()
  expect((await pane.find({ key: 'tab-queue' }))?.props.label).toBe('● Queue')
  expect((await pane.find({ key: 'tab-status' }))?.props.label).toBe('Status ⚠')
  expect(await pane.find({ type: 'Text', text: /^Reason: / })).toBeDefined()
})

test('unreachable: since when in warning, the last numbers kept and calm, retrying each minute, and Open', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  terylon.mode.server = 'down'
  await terylon.clock.advance(30000)

  for (const surface of SURFACES) {
    const band = await $.ui.mount(bandOn(surface))
    expect((await band.find({ type: 'Text', text: /^not answering since \d\d:\d\d$/ }))?.props.color).toBe('warning')
    expect((await band.find({ type: 'Text', text: exact('3') }))?.props.color).toBe('inactive')
    expect(await band.find({ type: 'Text', text: exact(' · retrying every minute') })).toBeDefined()
    expect((await band.find({ key: 'band-open' }))?.props.label).toBe('Open')
    await band.unmount()
  }
})

test('no server, and refused: each said in the band, with the step to take', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'missing'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const band = await $.ui.mount(bandOn('terminal'))
  expect(await band.find({ type: 'Text', text: exact('no terylon server') })).toBeDefined()
  expect((await band.find({ key: 'band-open' }))?.props.label).toBe('Open')

  terylon.mode.server = 'refused'
  await terylon.clock.advance(30000)
  expect((await band.find({ type: 'Text', text: exact('refused: not the owner') }))?.props.color).toBe('error')
  expect((await band.find({ key: 'band-open' }))?.props.label).toBe('Open')
})

test('a survey takes the band: the mod yields to what draws beneath it', async ($, on) => {
  const terylon = world(on)
  // The engine beneath: the survey draws the band, which this stands in for.
  on('ui.render', async ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>survey</Text>
  })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of SURFACES) {
    const band = await $.ui.mount(bandOn(surface, true))
    expect(await band.find({ type: 'Text', text: exact('survey') })).toBeDefined()
    expect(await band.find({ type: 'Text', text: exact('Terylon') })).toBeUndefined()
    expect(await band.find({ key: 'band-open' })).toBeUndefined()
    await band.unmount()
  }
})

test('the band and the status line split the work, and the pane never opens by itself', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await terylon.clock.advance(60000)

  expect(terylon.statuses[terylon.statuses.length - 1]).toBe('Agentic OS ● ok · $5.50 of $20 today · 2/4 slots')
  expect(terylon.opens).toEqual([])

  const band = await $.ui.mount(bandOn('desktop'))
  await band.press({ key: 'band-open' })
  expect(terylon.opens).toEqual(['terylon'])
})

test('the catch-up takes the row until it is dismissed, then the counts come back', async ($, on) => {
  const now = Date.parse('2026-10-12T09:40:00Z')
  const terylon = world(on, { now, store: { lastSeq: 18100, lastSeenAt: now - 14 * HOUR } })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const band = await $.ui.mount(bandOn('desktop'))
  expect(await band.find({ type: 'Link', text: 'Console ↗' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: exact(' · Waiting ') })).toBeUndefined()

  await band.press({ key: 'band-hide' })
  expect(await band.find({ type: 'Text', text: exact(' · Waiting ') })).toBeDefined()
  expect(await band.find({ key: 'band-open' })).toBeDefined()
})
