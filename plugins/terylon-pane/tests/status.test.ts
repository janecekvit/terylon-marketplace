// THE STATUS TAB (#332, the operator's round 4): the machine in one word, its slots, its cost, every problem with
// its reason and how to fix it in steps, and where to look. Each state, on the desktop and the terminal.

import { test, expect } from 'claude-code/testing'

import { BRIEFING, GATES, PANE_PROPS, SESSION, bandProps, exact, world } from './fixtures'

const SURFACES = ['desktop', 'terminal'] as const

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

const GATUS = { id: 117, source: 'gatus', title: 'the page is not well', body: 'gatus says it stopped answering; check the container.', key: 'gatus:answering/the-page', link: null, raisedAt: '2026-10-11T07:26:21Z', handledAt: null }

test('well: ok, the slots and the runs in them, the cost today and over 30 days, nothing wrong, the diagnostics', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-status' })

    expect((await ui.find({ key: 'tab-status' }))?.props.variant).toBe('primary')
    expect((await ui.find({ type: 'Text', text: exact('ok') }))?.props.color).toBe('success')
    expect(await ui.find({ type: 'Text', text: /^\s*last answer at \d\d:\d\d$/ })).toBeDefined()
    expect(await ui.find({ key: 'status-refresh' })).toBeDefined()

    expect(await ui.find({ type: 'Text', text: exact('2 of 4 running') })).toBeDefined()
    expect((await ui.find({ key: 'status-story-333' }))?.text).toMatch(/^\s*(?:●\s+)?running\s+#333 Direct dispatch\s+5\/8 · \$2\.10$/)
    expect(await ui.find({ type: 'Text', text: exact('$5.50 of the $20 daily limit today') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('43 stories · $1.10 per story · 0 merged · 1 PR opened') })).toBeDefined()

    expect(await ui.find({ type: 'Text', text: exact('Problems · 0') })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact('Nothing wrong.') }))?.props.color).toBe('subtle')

    expect(await ui.find({ type: 'Text', text: exact('terylon-pane 1.11.3') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('TERYLON_URL https://terylon.example.ts.net') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('server plugin:terylon-os:terylon') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Every failure is in claude --debug under terylon-pane:') })).toBeDefined()

    await ui.press({ key: 'status-story-333' })
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ Status')
    await ui.press({ key: 'back' })
    expect((await ui.find({ key: 'tab-status' }))?.props.variant).toBe('primary')
    await ui.unmount()
  }
})

test('not allowed: the reason in the engine\'s words, how to fix it in steps, and the allow rules with no gate', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'unclassified'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-status' })

    expect((await ui.find({ type: 'Text', text: exact('not allowed') }))?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: exact('Problems · 1') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Reason: .*auto mode classifier gave no verdict/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact('How to fix') }))?.props.bold).toBe(true)
    expect(await ui.find({ type: 'Text', text: /^\s*1\. Add these rules to ~\/\.claude\/settings\.json/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('2. Press Try again.') })).toBeDefined()

    const rules = await ui.find({ type: 'Code', text: /"allow"/ })
    expect(rules?.props.language).toBe('json')
    expect(String(rules?.text)).toContain('"mcp__plugin_terylon-os_terylon__question_answer"')

    for (const gate of GATES) {
      expect(String(rules?.text)).not.toContain(gate)
    }

    expect(await ui.find({ key: 'retry' })).toBeDefined()
    await ui.unmount()
  }
})

test('not answering: since when, the last answer, the reason, and the tailnet and TERYLON_URL to check', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  terylon.mode.server = 'down'
  await terylon.clock.advance(30000)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-status' })

    expect((await ui.find({ type: 'Text', text: exact('not answering') }))?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: /^ · since \d\d:\d\d$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Reason: .*ETIMEDOUT/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('1. Check the tailnet: tailscale status') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('2. Check TERYLON_URL: https://terylon.example.ts.net') })).toBeDefined()
    // AFTER A NETWORK OUTAGE (Terylon S40, #402): the session's server is reconnected by hand until /mcp is stateless.
    expect(await ui.find({ type: 'Text', text: exact('3. After a network outage: /mcp → terylon → Reconnect, or restart Claude Desktop.') })).toBeDefined()
    await ui.unmount()
  }
})

test('paused: resuming is the owner\'s gate, a link to the console and never a button', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { ...BRIEFING, leader: { paused: { at: '2026-10-11T14:05:00Z', source: 'cockpit', reason: 'maintenance' } } }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-status' })

    expect((await ui.find({ type: 'Text', text: exact('paused') }))?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: exact('The leader is paused') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('1. Press Resume, here or on the queue: the leader continues from its log.') })).toBeDefined()
    // RESUME IS THE OWNER'S ACT ON THE PAUSED CARD (S27): a button, no longer a link to the console.
    expect(await ui.find({ type: 'Link', text: 'Resume in the console ↗' })).toBeUndefined()
    expect((await ui.find({ key: 'act-leader-resume' }))?.props.variant).toBe('primary')
    await ui.unmount()
  }
})

test('an alert: its own card with the notice\'s body, which says what to do, and the console a link away', async ($, on) => {
  const terylon = world(on)
  terylon.answers.notices_list = { unhandled: 1, notices: [GATUS] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-status' })

    expect((await ui.find({ type: 'Text', text: exact('1 alert') }))?.props.color).toBe('warning')
    expect((await ui.find({ type: 'Text', text: exact('the page is not well') }))?.props.color).toBe('error')
    expect(await ui.find({ type: 'Text', text: /^\s*gatus · / })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('gatus says it stopped answering; check the container.') })).toBeDefined()
    expect((await ui.find({ type: 'Link', text: 'Bell in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=bell')
    await ui.unmount()
  }
})

test('the band\'s Open always opens the pane where the owner left it, the queue the first time, a problem or not', async ($, on) => {
  const terylon = world(on)
  terylon.answers.notices_list = { unhandled: 1, notices: [GATUS] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const band = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: bandProps() })
  expect((await band.find({ key: 'band-open' }))?.props.label).toBe('Open')
  await band.press({ key: 'band-open' })
  expect(terylon.opens).toEqual(['terylon'])

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.find({ key: 'tab-queue' }))?.props.variant).toBe('primary')
  expect((await pane.find({ key: 'tab-status' }))?.props.label).toBe('Status ⚠')

  await pane.press({ key: 'tab-goals' })
  await band.press({ key: 'band-open' })
  expect((await pane.find({ key: 'tab-goals' }))?.props.variant).toBe('primary')

  terylon.answers.notices_list = { unhandled: 0, notices: [] }
  await terylon.clock.advance(30000)
  await band.press({ key: 'band-open' })
  expect((await band.find({ key: 'band-open' }))?.props.label).toBe('Open')
  expect((await pane.find({ key: 'tab-goals' }))?.props.variant).toBe('primary')
  expect((await pane.find({ key: 'tab-status' }))?.props.label).toBe('Status')
})
