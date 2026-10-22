// The states that are not a queue (canvas v2 · V2-Pane-States): each says what happened, why, and the step that
// fixes it, in a card of its own.

import { test, expect } from 'claude-code/testing'

import { PANE_TOOLS } from '../hooks/terylon'

import { GATES, PANE_PROPS, SESSION, exact, world } from './fixtures'

const MOUNT = { plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

test('frame E: no terylon server tells the owner to install the plugin, and asks for no token', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'missing'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ type: 'Text', text: exact('The pane found no MCP server terylon') })).toBeDefined()
  expect(await ui.find({ type: 'Code', text: exact('/plugin install terylon-os@terylon') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /No token: your tailnet login is the identity\./ })).toBeDefined()
  expect(terylon.calls.map(call => call.server)).toEqual(['plugin:terylon-os:terylon', 'terylon'])

  terylon.mode.server = 'up'
  await ui.press({ key: 'retry' })
  expect(await ui.find({ type: 'Text', text: exact('Running · 2') })).toBeDefined()
})

test('frame G: unreachable keeps the last state, says it is stale and why, and retries each minute', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  terylon.mode.server = 'down'
  await terylon.clock.advance(30000)

  const ui = await $.ui.mount(MOUNT)
  expect((await ui.find({ type: 'Text', text: exact('TerylonLab does not answer') }))?.props.color).toBe('warning')
  expect(await ui.find({ type: 'Text', text: /^since \d\d:\d\d · retrying every minute$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Showing the state of \d\d:\d\d\. Work on the homelab goes on\.$/ })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /Reason: .*fetch failed: connect ETIMEDOUT/ }))?.props.color).toBe('subtle')
  expect(await ui.find({ type: 'Text', text: /tailscale status and TERYLON_URL/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('Running · 2 (stale)') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^not answering since / }))?.props.color).toBe('warning')
  expect(await ui.find({ type: 'Text', text: exact('Adding a task waits for the connection; what you typed stays.') })).toBeDefined()
  expect(await ui.find({ key: 'quick-add' })).toBeUndefined()

  const before = terylon.calls.length
  await terylon.clock.advance(30000)
  expect(terylon.calls.length).toBe(before)
  await terylon.clock.advance(30000)
  expect(terylon.calls.length).toBeGreaterThan(before)
})

test('frame H: refused as not the owner, and Terylon returning an error, each said plainly with its reason', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'refused'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  expect((await ui.find({ type: 'Text', text: exact('Refused: you are not the owner') }))?.props.color).toBe('warning')
  expect(await ui.find({ type: 'Text', text: exact('Reason: Only the owner of this Terylon configures its provider. (403)') })).toBeDefined()

  terylon.mode.server = 'error'
  await ui.press({ key: 'retry' })
  expect(await ui.find({ type: 'Text', text: exact('Terylon returned an error') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('Reason: work_in_flight: 503 The leader is not answering.') })).toBeDefined()
  expect((await ui.find({ type: 'Link', text: 'Health ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=health')
})

test('frame F: an empty queue keeps every card, each saying quietly that it is empty, and invites a task', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { plansWaiting: [], questionsOpen: [], storiesVerified: [], storiesBlocked: [] }
  terylon.answers.work_in_flight = { slots: 4, paused: false, stories: [] }
  terylon.answers.stories_list = { stories: [] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  for (const line of ['Nothing waits for you.', 'Nothing running.', 'Nothing queued.', 'Nothing done today.']) {
    expect((await ui.find({ type: 'Text', text: exact(line) }))?.props.color).toBe('subtle')
  }

  expect(await ui.find({ type: 'Text', text: exact('Waiting for you · 0') })).toBeDefined()
  expect(await ui.find({ key: 'quick-add' })).toBeDefined()
})

test('connecting, before the first answer, is drawn', async ($, on) => {
  world(on)
  await $.session.start(SESSION)

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ type: 'Text', text: exact('connecting…') })).toBeDefined()
})

test('frame I: a call Claude Code did not allow is said as that, with the rules to add, never as the tailnet', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'unclassified'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  expect((await ui.find({ type: 'Text', text: exact("Claude Code refused the pane's call") }))?.props.color).toBe('warning')
  expect(await ui.find({ type: 'Text', text: exact('permissions') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /TerylonLab does not answer/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Reason: .*auto mode classifier gave no verdict/ })).toBeDefined()

  // THE ALLOW RULES AS CODE (S32): json, to select and copy by hand, the pane's whole list and no gate.
  const rules = await ui.find({ type: 'Code', text: /permissions/ })
  expect(rules?.props.language).toBe('json')
  expect(rules?.props.startLine).toBeUndefined()
  expect(String(rules?.text)).not.toContain('```')

  for (const tool of ['briefing', 'work_in_flight', 'stories_list', 'events_since', 'story_get', 'policy_get', 'goals_list', 'goal_get', 'plans_list', 'notices_list', 'leader_status', 'metrics', 'memory_get', 'tasks_add', 'goal_add', 'question_answer', 'memory_propose']) {
    expect(String(rules?.text)).toContain(`"mcp__plugin_terylon-os_terylon__${tool}"`)
  }

  expect([...PANE_TOOLS]).toHaveLength(18)

  for (const gate of GATES) {
    expect(String(rules?.text)).not.toContain(gate)
  }

  terylon.mode.server = 'up'
  await ui.press({ key: 'retry' })
  expect(await ui.find({ type: 'Text', text: exact('Running · 2') })).toBeDefined()
})

test('frame I: the default mode refusal, which cannot ask the person, is the same state', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'prompted'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ type: 'Text', text: exact("Claude Code refused the pane's call") })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Reason: .*requested permissions to use/ })).toBeDefined()
})

test('every failed call goes to the debug log with its server, tool and the words the engine gave', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'unclassified'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const debug = terylon.logs.filter(line => line.to === 'debug').map(line => line.text)
  expect(debug.some(line => line.includes('plugin:terylon-os:terylon') && line.includes('work_in_flight') && line.includes('auto mode classifier gave no verdict'))).toBe(true)
  expect(terylon.logs.filter(line => line.to !== 'debug')).toEqual([])
})
