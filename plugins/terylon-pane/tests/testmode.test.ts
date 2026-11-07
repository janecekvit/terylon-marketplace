// /terylon-cockpit test: a made-up Terylon behind the pane, for this session alone. Nothing the pane does reaches the real
// one, nothing of the store the live pane and other sessions share is read or written, no signal is posted, and turning it
// off returns to live data with that store exactly as it was.

import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

import { createTestWorld, testAnswer } from '../hooks/testmode'
import { PANE_TOOLS } from '../hooks/terylon'

import { NARROW_PANE_PROPS, PANE_PROPS, SESSION, events, exact, storyMoved, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

const SEEN = { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') }

const VERIFIED = { id: 146, goal: 40, title: 'Weekly report', state: 'verified', pullRequest: { id: 7 }, verdict: { commit: 'abc1234def', environment: 'pr-7', green: true } }

const END = { answer: '', durationMs: 1000, isAborted: false, reason: 'answer' as const }

function turns(on: On): void {
  on('turn.start', async ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', async ($, e) => ({ text: e.answer }))
}

// A store this test answers itself, so every touch of it is seen.
function watchedStore(on: On, start: Record<string, unknown> = SEEN) {
  const kept = new Map<string, unknown>(Object.entries(start))
  const touched: string[] = []

  on('store.get', async ($, e) => {
    touched.push(`get ${e.key}`)

    return { value: kept.get(e.key) } as never
  })
  on('store.set', async ($, e) => {
    touched.push(`set ${e.key}`)
    kept.set(e.key, e.value)

    return { value: undefined } as never
  })
  on('store.delete', async ($, e) => {
    touched.push(`delete ${e.key}`)
    kept.delete(e.key)

    return { value: undefined } as never
  })

  return { kept, touched }
}

async function testModeOn($: { command: { run: (request: never) => Promise<unknown> } }): Promise<unknown> {
  return $.command.run({ command: 'terylon-cockpit', args: 'test' } as never)
}

async function testModeOff($: { command: { run: (request: never) => Promise<unknown> } }): Promise<unknown> {
  return $.command.run({ command: 'terylon-cockpit', args: 'test off' } as never)
}

// Every screen and every act of the made-up Terylon: Approve, Accept, Answer, Mark handled, Confirm, Drop, New goal.
async function walk(ui: { press: (query: { key: string }) => Promise<unknown>; find: (query: { key: string }) => Promise<unknown>; input: (query: { key: string; text: string; kind: string }) => Promise<unknown> }): Promise<string[]> {
  const pressed: string[] = []
  const press = async (key: string) => {
    if ((await ui.find({ key })) !== undefined) {
      await ui.press({ key })
      pressed.push(key)
    }
  }
  const backHome = async () => {
    while ((await ui.find({ key: 'back' })) !== undefined) {
      await press('back')
    }

    await press('tab-queue')
  }

  await press('refresh')
  await press('tab-bell')
  await press('handle-3')
  await backHome()
  await press('tab-status')
  await press('fold-memory-owner')
  await press('act-proposal-5-confirm')
  await backHome()
  await press('tab-status')
  await press('fold-policy')
  await press('fold-diagnostics')
  await backHome()
  await press('goal-71')
  await backHome()
  await press('open-plan-58')
  await press('act-plan-58-approve')
  await backHome()
  await press('open-story-205')
  await press('act-story-205-accept')
  await backHome()
  await press('merge-act-204')
  await backHome()
  await press('story-206')
  await press('act-story-206-stop')
  await backHome()
  await press('story-207')
  await backHome()
  await press('answer-9')

  if ((await ui.find({ key: 'answer-text' })) !== undefined) {
    await ui.input({ key: 'answer-text', text: 'The second.', kind: 'change' })
    await press('answer-send')
  }

  await backHome()

  if ((await ui.find({ key: 'goal-new-open' })) !== undefined) {
    await press('goal-new-open')
    await ui.input({ key: 'goal-draft', text: 'A goal in test mode', kind: 'change' })
    await press('goal-add')
    await backHome()
  }

  return pressed
}

for (const [name, surface, props] of [['desktop', 'desktop', PANE_PROPS], ['narrow dock', 'desktop', NARROW_PANE_PROPS], ['terminal', 'terminal', PANE_PROPS]] as const) {
  test(`${name}: a walk of every screen and act makes no call, touches no store key, posts nothing and shows no toast`, { timeoutMs: 20_000 }, async ($, on) => {
    const store = watchedStore(on)
    const terylon = world(on, { store: null })
    await $.session.start(SESSION)
    await terylon.clock.settle()
    await testModeOn($)
    await terylon.clock.settle()

    const calls = terylon.calls.length
    const prompts = terylon.prompts.length
    const toasts = terylon.toasts.length
    store.touched.length = 0

    const ui = await $.ui.mount({ ...PANE, surface, props })
    const pressed = await walk(ui as never)

    expect(pressed).toEqual(expect.arrayContaining(['tab-bell', 'handle-3', 'tab-status', 'act-proposal-5-confirm', 'goal-71', 'open-plan-58', 'act-plan-58-approve', 'open-story-205', 'act-story-205-accept', 'merge-act-204', 'answer-9', 'answer-send']))
    expect(terylon.calls.slice(calls)).toEqual([])
    expect(store.touched).toEqual([])
    expect(terylon.prompts).toHaveLength(prompts)
    expect(terylon.toasts).toHaveLength(toasts)
  })
}

test('TICKS AND A TURN\'S END: no lease taken or renewed, no store key, no catch-up and nothing posted, even what was held', async ($, on) => {
  turns(on)
  const store = watchedStore(on)
  const terylon = world(on, { store: null })
  let moved: Record<string, unknown>[] = []
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since)))
  terylon.answers.story_get = VERIFIED
  await $.session.start(SESSION)
  await terylon.clock.settle()

  // A SIGNAL HELD BY THE RUNNING TURN when test mode starts: real, so it waits.
  await $.turn.start({ text: 'something else', turnId: 't1' })
  moved = [{ ...storyMoved(18101, 146, 'Weekly report', 'verified'), pullRequest: 7 }]
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toEqual([])

  await testModeOn($)
  await terylon.clock.settle()
  const calls = terylon.calls.length
  const toasts = terylon.toasts.length
  const keptWhenEntered = JSON.stringify([...store.kept])
  store.touched.length = 0

  await terylon.clock.advance(300000)
  await $.turn.complete({ ...END, turnId: 't1' })
  await terylon.clock.settle()
  await terylon.clock.advance(120000)

  expect(terylon.calls.slice(calls)).toEqual([])
  expect(store.touched).toEqual([])
  expect(terylon.prompts).toEqual([])
  expect(terylon.toasts).toHaveLength(toasts)
  expect(JSON.stringify([...store.kept])).toBe(keptWhenEntered)

  // OFF: live calls again, the store as it was until the live pane moves it, and what was held is posted.
  await testModeOff($)
  expect(JSON.stringify([...store.kept])).toBe(keptWhenEntered)
  await terylon.clock.settle()
  await terylon.clock.advance(30000)

  expect(terylon.calls.slice(calls).map(call => call.tool)).toEqual(expect.arrayContaining(['work_in_flight', 'briefing']))
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toContain('146')
})

test('OTHER SESSIONS KEEP WORKING: a lease this session held runs out instead of being renewed, and nobody is told of test mode', async ($, on) => {
  const store = watchedStore(on)
  const terylon = world(on, { store: null })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const lease = store.kept.get('signaller')
  expect(lease).toBeDefined()

  await testModeOn($)
  await terylon.clock.settle()
  await terylon.clock.advance(300000)

  expect(store.kept.get('signaller')).toEqual(lease)
  expect([...store.kept.keys()].filter(key => /test/i.test(key))).toEqual([])
})

test('CLEARLY MARKED: the head, the band, the status line and every other screen say Test mode', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(await testModeOn($)).toEqual({ text: expect.stringContaining('test mode') })
  expect(terylon.statuses.at(-1)).toMatch(/^Terylon · Test mode/)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: exact('Terylon · Test mode') })).toBeDefined()
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ type: 'Text', text: exact('Test mode') })).toBeDefined()

  const band = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } as never })
  expect(await band.find({ type: 'Text', text: /Test mode/ })).toBeDefined()

  await testModeOff($)
  await terylon.clock.settle()
  expect(await band.find({ type: 'Text', text: /Test mode/ })).toBeUndefined()
  expect(terylon.statuses.at(-1)).not.toMatch(/Test mode/)
})

test('THE ACTS WORK IN MEMORY: Approve moves its goal to Build, Accept moves the story on, Answer clears, handled and Confirm and Drop move, New goal adds', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await testModeOn($)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'refresh' })

  // ONE GOAL AT EACH STAGE OF THE ROAD, A STUCK STORY, A QUESTION, A PLAN, A MERGE AND AN ACCEPT.
  for (const key of ['goal-70', 'goal-71', 'goal-72', 'goal-73', 'goal-74', 'goal-75', 'goal-76', 'question-9', 'plan-58', 'merge-act-204', 'accept-205']) {
    expect(await ui.find({ key })).toBeDefined()
  }

  expect((await ui.find({ key: 'goal-card-71' }))?.text).toContain('Approve')
  await ui.press({ key: 'open-plan-58' })
  await ui.press({ key: 'act-plan-58-approve' })
  expect(await ui.find({ type: 'Text', text: /nothing was sent|Nothing was sent/ })).toBeDefined()
  await ui.press({ key: 'back' })
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ key: 'plan-58' })).toBeUndefined()
  expect((await ui.find({ key: 'goal-card-71' }))?.text).toContain('Build')

  await ui.press({ key: 'open-story-205' })
  await ui.press({ key: 'act-story-205-accept' })
  await ui.press({ key: 'back' })
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ key: 'accept-205' })).toBeUndefined()

  await ui.press({ key: 'answer-9' })
  await ui.input({ key: 'answer-text', text: 'The second.', kind: 'change' })
  await ui.press({ key: 'answer-send' })
  await ui.press({ key: 'back' })
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ key: 'question-9' })).toBeUndefined()

  await ui.press({ key: 'tab-bell' })
  expect(await ui.find({ type: 'Text', text: exact('Needs you · 2') })).toBeDefined()
  await ui.press({ key: 'handle-3' })
  await ui.press({ key: 'back' })
  await ui.press({ key: 'tab-bell' })
  expect(await ui.find({ key: 'handle-3' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('Needs you · 1') })).toBeDefined()
  await ui.press({ key: 'back' })

  await ui.press({ key: 'tab-status' })
  await ui.press({ key: 'act-proposal-5-drop' })
  await ui.press({ key: 'tab-queue' })
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ key: 'act-proposal-5-drop' })).toBeUndefined()
  await ui.press({ key: 'tab-queue' })

  await ui.press({ key: 'goal-new-open' })
  await ui.input({ key: 'goal-draft', text: 'A goal in test mode', kind: 'change' })
  await ui.press({ key: 'goal-add' })
  await ui.press({ key: 'back' })
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: exact('A goal in test mode') })).toBeDefined()

  // RESET ON TURNING IT OFF, AND AGAIN ON: the plan is back at its gate.
  await testModeOff($)
  await terylon.clock.settle()
  await testModeOn($)
  await terylon.clock.settle()
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ key: 'plan-58' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('A goal in test mode') })).toBeUndefined()
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: a merge opens no console for a made-up story: the sentence instead, and no link leads to the real console`, async ($, on) => {
    const terylon = world(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()
    await testModeOn($)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ type: 'Link', text: /Merge/ })).toBeUndefined()
    expect((await ui.findAll({ type: 'Link' })).filter(link => !String(link.props.href).startsWith('https://test-mode.invalid'))).toEqual([])

    await ui.press({ key: 'merge-act-204' })
    expect(await ui.find({ type: 'Text', text: exact('Test mode: nothing was merged. A real merge is confirmed with your passkey in the console.') })).toBeDefined()
    expect(terylon.calls.filter(call => call.tool === 'story_merge')).toEqual([])

    // THE SENTENCE STANDS UNTIL THE OWNER MOVES ON.
    await ui.press({ key: 'tab-status' })
    expect(await ui.find({ type: 'Text', text: /nothing was merged/ })).toBeUndefined()
  })
}

test('A PRESS THAT WOULD POST INTO THE CHAT posts nothing and says so: Claude\'s own tools there reach the real Terylon', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await testModeOn($)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-201' })
  await ui.press({ key: 'summarise' })
  expect(terylon.prompts).toEqual([])
  expect(await ui.find({ type: 'Text', text: exact('Test mode: nothing was posted into the chat.') })).toBeDefined()
})

test('OFF: the live pane again, on live data, with nothing made-up left, and test mode alone never reached a real tool', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await testModeOn($)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ key: 'plan-58' })).toBeDefined()

  const calls = terylon.calls.length
  expect(await testModeOff($)).toEqual({ text: 'Terylon Cockpit is back on live data.' })
  await terylon.clock.settle()
  await ui.press({ key: 'refresh' })

  expect(terylon.calls.length).toBeGreaterThan(calls)
  expect(await ui.find({ key: 'plan-58' })).toBeUndefined()
  expect(await ui.find({ key: 'plan-41' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('Terylon') })).toBeDefined()
})

test('TERYLON_PANE_TEST_MODE=on starts the session in test mode with the pane shut, and test off ends it for this session', async ($, on) => {
  const terylon = world(on, { env: { TERYLON_PANE_TEST_MODE: 'on' } })
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await terylon.clock.advance(60000)

  // MADE-UP FROM THE FIRST TICK: no call reached the real Terylon, nothing was posted, and no pane opened by itself.
  expect(terylon.calls).toEqual([])
  expect(terylon.prompts).toEqual([])
  expect(terylon.opens).toEqual([])
  expect(terylon.statuses.at(-1)).toMatch(/^Terylon · Test mode/)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: exact('Terylon · Test mode') })).toBeDefined()
  expect(await ui.find({ key: 'plan-58' })).toBeDefined()
  expect(terylon.calls).toEqual([])

  // OFF FOR THIS SESSION, whatever the environment still says.
  expect(await testModeOff($)).toEqual({ text: 'Terylon Cockpit is back on live data.' })
  await terylon.clock.settle()
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ key: 'plan-58' })).toBeUndefined()
  expect(await ui.find({ key: 'plan-41' })).toBeDefined()
  expect(terylon.calls.map(call => call.tool)).toEqual(expect.arrayContaining(['work_in_flight', 'briefing']))
  expect(terylon.statuses.at(-1)).not.toMatch(/Test mode/)
})

for (const value of [null, 'off', 'ON', ' on', '1']) {
  test(`TERYLON_PANE_TEST_MODE ${value === null ? 'unset' : JSON.stringify(value)} changes nothing: the live pane on live data`, async ($, on) => {
    const terylon = world(on, value === null ? {} : { env: { TERYLON_PANE_TEST_MODE: value } })
    await $.session.start(SESSION)
    await terylon.clock.settle()

    expect(terylon.calls.map(call => call.tool)).toEqual(expect.arrayContaining(['work_in_flight', 'briefing']))
    expect(terylon.statuses.at(-1)).not.toMatch(/Test mode/)
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    expect(await ui.find({ type: 'Text', text: exact('Terylon') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Terylon · Test mode') })).toBeUndefined()
  })
}

test('/terylon-cockpit alone opens the pane as ever, test mode or not; a word it does not know opens it too', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(await $.command.run({ command: 'terylon-cockpit', args: 'something' } as never)).toEqual({ text: 'Terylon Cockpit is open.' })
  expect(await testModeOff($)).toEqual({ text: 'Terylon Cockpit is back on live data.' })
  expect(await $.command.run({ command: 'terylon-cockpit', args: ' Test  OFF ' } as never)).toEqual({ text: 'Terylon Cockpit is back on live data.' })
  expect(terylon.opens.every(id => id === 'terylon')).toBe(true)
})

test('THE WORLD ANSWERS every tool of the pane and only its own: its moments follow the clock, a made-up refusal for what it does not hold', () => {
  const now = Date.parse('2026-11-06T12:00:00Z')
  const made = createTestWorld(now)

  for (const tool of PANE_TOOLS) {
    expect(['ok', 'refused']).toContain(testAnswer(made, tool, {}, now).kind)
  }

  const later = createTestWorld(now + 3600000)
  expect(Date.parse(String(later.notices[0]?.raisedAt)) - Date.parse(String(createTestWorld(now).notices[0]?.raisedAt))).toBe(3600000)
  expect(testAnswer(createTestWorld(now), 'story_get', { story: 9999 }, now)).toMatchObject({ kind: 'refused' })
})
