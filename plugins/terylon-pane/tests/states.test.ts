import { test, expect } from 'claude-code/testing'

import { PANE_PROPS, SESSION, world } from './fixtures'

const MOUNT = { plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

test('frame E: no terylon server tells the owner to install the plugin, and asks for no token', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'missing'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ type: 'Text', text: /Panel nenašel MCP server terylon/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: '/plugin install terylon-os@terylon' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Žádný token: identitu dá tvůj tailnet login.' })).toBeDefined()
  expect(terylon.calls.map(call => call.server)).toEqual(['plugin:terylon-os:terylon', 'terylon'])

  terylon.mode.server = 'up'
  await ui.press({ key: 'retry' })
  expect(await ui.find({ type: 'Text', text: 'BĚŽÍ · 2' })).toBeDefined()
})

test('frame G: unreachable keeps the last state, says it is stale, and retries each minute', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  terylon.mode.server = 'down'
  await terylon.clock.advance(30000)

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ type: 'Text', text: /TerylonLab neodpovídá \(tailnet\?\)\. Ukazuji stav z .*Zkouším znovu každou minutu\./ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'BĚŽÍ · 2 (STARÉ)' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Přidat úkol jde až po spojení; rozepsaný text zůstane.' })).toBeDefined()
  expect(await ui.find({ key: 'quick-add' })).toBeUndefined()

  const before = terylon.calls.length
  await terylon.clock.advance(30000)
  expect(terylon.calls.length).toBe(before)
  await terylon.clock.advance(30000)
  expect(terylon.calls.length).toBeGreaterThan(before)
})

test('frame H: refused as not the owner, and Terylon returning an error, each said plainly', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'refused'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ type: 'Text', text: 'ODMÍTNUTO: NEJSI VLASTNÍK' })).toBeDefined()

  terylon.mode.server = 'error'
  await ui.press({ key: 'retry' })
  expect(await ui.find({ type: 'Text', text: 'TERYLON VRÁTIL CHYBU' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'work_in_flight: 503. Health v konzoli ukáže proč.' })).toBeDefined()
})

test('frame F: an empty queue invites a task', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { plansWaiting: [], questionsOpen: [], storiesVerified: [], storiesBlocked: [] }
  terylon.answers.work_in_flight = { slots: 4, paused: false, stories: [] }
  terylon.answers.stories_list = { stories: [] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ type: 'Text', text: 'Nic neběží a nic nečeká' })).toBeDefined()
  expect(await ui.find({ key: 'quick-add' })).toBeDefined()
})

test('connecting, before the first answer, is drawn', async ($, on) => {
  world(on)
  await $.session.start(SESSION)

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ type: 'Text', text: 'připojuji…' })).toBeDefined()
})
