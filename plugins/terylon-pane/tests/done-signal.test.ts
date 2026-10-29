// THE DONE-SIGNAL IN DESKTOP: Terylon's server logged no events_since from the pane in a day, while the same tick's
// four reads came every 30 s. A store that refuses and a call Claude Code refuses both stop it there in silence; each
// is held here to reach events_since, or to say on the Status tab why it cannot, with its fix in steps.
// Then the list-story findings of the same walk: Accept is waited for and drawn at once, and an accepted story is
// never called merged.

import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

import { checkTree, treeLine } from '../hooks/health'

import { BRIEFING, FLIGHT, HOUR, PANE_PROPS, SESSION, STORY_327, events, exact, lateOnTheLocalDayOf, storyMoved, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const
const SURFACES = ['desktop', 'terminal'] as const

const STORE_REFUSAL = 'EACCES: permission denied, open terylon-pane.json'

const NOT_ALLOWED = "Claude requested permissions to use mcp__plugin_terylon-os_terylon__events_since, but you haven't granted it yet."

// A story kept in Terylon's own list, verified: no pull request, and story_get says where it is kept.
const LIST_STORY = { id: 352, goal: 11, title: 'Weekly cost summary', state: 'verified', target: 'list', attempt: 1, pullRequest: null, timeline: [] }

function listMoved(seq: number) {
  return { ...storyMoved(seq, 352, 'Weekly cost summary', 'verified'), pullRequest: null }
}

function withListStory(terylon: ReturnType<typeof world>): void {
  terylon.answers.briefing = { ...BRIEFING, storiesVerified: [...BRIEFING.storiesVerified, { id: 352, title: 'Weekly cost summary', environment: null }] }
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 352 ? LIST_STORY : STORY_327)
}

function eventsLogs(terylon: ReturnType<typeof world>): string[] {
  return terylon.logs.filter(log => log.to === 'debug' && log.text.startsWith('terylon-pane: events:')).map(log => log.text)
}

test('A STORE THAT REFUSES does not stop the done-signal: events_since is called, the story told once, the Status tab says why', async ($, on) => {
  // A store the engine refuses: every call on $.store rejects with the words beneath it.
  on('store.get', async () => ({ deny: STORE_REFUSAL }) as never)
  on('store.set', async () => ({ deny: STORE_REFUSAL }) as never)
  const terylon = world(on, { store: null })
  let moved: Record<string, unknown>[] = []
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since)), 18100)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  // The first look starts from the head, kept in memory: nothing of the past is told.
  expect(terylon.calls.filter(call => call.tool === 'events_since').map(call => call.args)).toEqual([{ since: 0, limit: 1 }])
  expect(terylon.prompts).toEqual([])

  moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  expect(terylon.calls.filter(call => call.tool === 'events_since').at(-1)?.args).toEqual({ since: 18100, limit: 500 })
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
  expect(terylon.toasts).toEqual(['Terylon: #327 verified, waiting for merge'])

  // Told once: the signal is kept in memory where the store refuses it.
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)

  // THE OWNER'S NEXT RUN SHOWS WHERE IT STOPS: each step of the events path in claude --debug.
  expect(eventsLogs(terylon).some(line => line.startsWith('terylon-pane: events: stopped (store): reading lastSeq from the store failed:') && line.endsWith(STORE_REFUSAL))).toBe(true)
  expect(eventsLogs(terylon)).toEqual(expect.arrayContaining([
    'terylon-pane: events: calling events_since since 18100',
    'terylon-pane: events: events_since answered 1 events, last 18101',
    'terylon-pane: events: posting the done-signal 327:verified:4be21c0aaaa',
  ]))

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'tab-status' }))?.text).toContain('⚠')
    await ui.press({ key: 'tab-status' })

    expect(await ui.find({ type: 'Text', text: exact('Problems · 1') })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact('The pane cannot keep its place') }))?.props.color).toBe('error')
    expect((await ui.find({ type: 'Text', text: /^Reason: (reading|writing) \w+ (from|to) the store failed: / }))?.text).toContain(STORE_REFUSAL)
    expect(await ui.find({ type: 'Text', text: exact('1. Check that your Claude Code configuration folder (~/.claude) is writable.') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('3. If it stays, run claude --debug and read the lines under terylon-pane: events:') })).toBeDefined()
    expect(await ui.find({ key: 'events-retry' })).toBeDefined()
    await ui.unmount()
  }
})

test('A STORE THAT NEVER ANSWERS holds no poll: the next tick reads the queue and events_since again', async ($, on) => {
  on('store.get', async () => new Promise(() => undefined) as never)
  on('store.set', async () => new Promise(() => undefined) as never)
  const terylon = world(on, { store: null })
  await $.session.start(SESSION)
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)

  expect(terylon.calls.filter(call => call.tool === 'work_in_flight').length).toBeGreaterThanOrEqual(3)
  expect(terylon.calls.filter(call => call.tool === 'events_since').length).toBeGreaterThanOrEqual(2)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ type: 'Text', text: exact('The pane cannot keep its place') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Reason: .*the store did not answer within 2 s$/ })).toBeDefined()
})

test('events_since REFUSED BY CLAUDE CODE: the queue reads, and the Status tab names the done-signal, its reason and the allow rules', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
  terylon.denied.set('events_since', NOT_ALLOWED)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  expect(eventsLogs(terylon)).toEqual(expect.arrayContaining([
    `terylon-pane: events: the last look: sequence 18100, at ${Date.parse('2026-10-11T21:59:00Z')}`,
    'terylon-pane: events: calling events_since since 18100',
  ]))
  expect(eventsLogs(terylon).some(line => line.startsWith('terylon-pane: events: stopped (not-allowed):') && line.endsWith(NOT_ALLOWED))).toBe(true)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-queue' })
    // THE QUEUE IS NOT THE PROBLEM: it is drawn, and the Status tab carries the warning.
    expect(await ui.find({ key: 'row-merge-327' })).toBeDefined()
    expect((await ui.find({ key: 'tab-status' }))?.text).toContain('⚠')
    await ui.press({ key: 'tab-status' })

    expect((await ui.find({ type: 'Text', text: exact("Claude Code refused the done-signal's call") }))?.props.color).toBe('error')
    expect((await ui.find({ type: 'Text', text: /^Reason: / }))?.text).toContain(NOT_ALLOWED)
    expect(await ui.find({ type: 'Text', text: /^1\. Add these rules .*events_since must be among them/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('2. If the rule is already there, restart Claude Desktop, so the settings are read again.') })).toBeDefined()
    expect(String((await ui.find({ type: 'Code' }))?.props.source)).toContain('"mcp__plugin_terylon-os_terylon__events_since"')
    await ui.unmount()
  }

  // ALLOWED AGAIN, THE PROBLEM GOES on the next whole read.
  terylon.denied.delete('events_since')
  await terylon.clock.advance(30000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ type: 'Text', text: exact('Problems · 0') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact("Claude Code refused the done-signal's call") })).toBeUndefined()
})

test('events_since failing on Terylon: the done-signal stopped, since when, its reason, and Health in the console', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
  terylon.answers.events_since = undefined as never
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ type: 'Text', text: exact('The done-signal stopped') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Since \d\d:\d\d, events_since has not answered as the owner's\./ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('Reason: no such tool events_since') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('1. Open Health in the console to see why.') })).toBeDefined()
  expect((await ui.findAll({ type: 'Link', text: 'Health ↗' })).length).toBeGreaterThan(0)
})

test('A LIST STORY VERIFIED WHILE THE PANE WAS CLOSED: on reopen, the catch-up says it waits for Accept, never a merge', async ($, on) => {
  const now = Date.parse('2026-10-12T09:40:00Z')
  const terylon = world(on, { now, store: { lastSeq: 18100, lastSeenAt: now - 14 * HOUR } })
  withListStory(terylon)
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [listMoved(18101)])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toContain('#352 ověřená (accept)')
  expect(terylon.prompts[0]).toContain('#327 ověřená (merge)')

  // Inside the summary, never told again on its own.
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)
})

test('A LIST STORY VERIFIED, back within 2 h: its own prompt and toast say it waits for Accept; a repository story keeps its merge', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:30:00Z') } })
  withListStory(terylon)
  terylon.answers.events_since = (args: Record<string, unknown>) =>
    events(Number(args.since), Number(args.since) >= 18102 ? [] : [listMoved(18101), storyMoved(18102, 327, 'Events since the last look', 'verified')])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([
    'Story #352 „Weekly cost summary“ je ověřená a čeká na moje přijetí (Accept). Shrň mi důkazy a co mám proklikat, než ji přijmu.',
    'Story #327 „Events since the last look“ je ověřená v pr-196 a čeká na merge (PR 196, commit 4be21c0). Shrň mi důkazy a co mám proklikat.',
  ])
  expect(terylon.toasts).toEqual(['Terylon: #352 verified, waiting for Accept', 'Terylon: #327 verified, waiting for merge'])
})

test('RIGHT AFTER ACCEPT, the card is drawn accepted: ✓, no Accept to press, and its waiting row gone, while Terylon still says verified', async ($, on) => {
  const terylon = world(on)
  withListStory(terylon)
  terylon.answers.story_accept = { accepted: true, sentence: "Story 352's result is accepted.", commandId: 'c4', subjectId: 352 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'accept-352' })
  await ui.press({ key: 'open-story-352' })
  expect(await ui.find({ type: 'Text', text: /verified · waits for you/ })).toBeDefined()
  await ui.press({ key: 'act-story-352-accept' })

  // Terylon's reads still answer verified: the card is the act's, until a read shows the story moved.
  expect(await ui.find({ type: 'Text', text: exact("✓ Story 352's result is accepted.") })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\W*accepted\W*$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /verified · waits for you/ })).toBeUndefined()
  expect(await ui.find({ key: 'act-story-352-accept' })).toBeUndefined()

  await terylon.clock.advance(30000)
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'accept-352' })).toBeUndefined()
  expect(await ui.find({ key: 'row-merge-327' })).toBeDefined()
})

test('DONE TODAY: an accepted list story says accepted, a merged one merged', async ($, on) => {
  const terylon = world(on, { now: lateOnTheLocalDayOf('2026-10-11T12:20:00Z') })
  terylon.answers.stories_list = {
    stories: [
      { id: 341, title: 'S10a cleanup', state: 'merged', costUsd: 5.6, updatedAt: '2026-10-11T12:20:00Z' },
      { id: 94, title: 'Weekly cost summary', state: 'merged', outcome: 'accepted', target: 'list', costUsd: 1.2, updatedAt: '2026-10-11T12:10:00Z' },
      { id: 95, title: 'Shopping list', state: 'accepted', costUsd: 0.4, updatedAt: '2026-10-11T12:00:00Z' },
    ],
  }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: exact('Done today · 3') })).toBeDefined()
    expect((await ui.find({ key: 'done-341' }))?.text).toMatch(/merged\s+#341 S10a cleanup/)
    expect((await ui.find({ key: 'done-94' }))?.text).toMatch(/accepted\s+#94 Weekly cost summary/)
    expect((await ui.find({ key: 'done-94' }))?.text).not.toMatch(/merged/)
    expect((await ui.find({ key: 'done-95' }))?.text).toMatch(/accepted\s+#95 Shopping list/)
    await ui.unmount()
  }
})

test('AN ENDED STORY\'S PHASES say how it ended, never "no stage reported"', async ($, on) => {
  // ON THE LOCAL DAY, so story 341 is done today in every zone and its row is there to open.
  const terylon = world(on, { now: lateOnTheLocalDayOf('2026-10-11T12:20:00Z') })
  terylon.answers.story_get = { id: 94, goal: 11, title: 'Weekly cost summary', state: 'accepted', target: 'list', attempt: 1, pullRequest: null, progress: null, timeline: [] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'done-341' })
  expect(await ui.find({ type: 'Text', text: /no stage reported/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^\d of \d · accepted$/ })).toBeDefined()
})

test('THE WATCHDOG: no answer from events_since for more than three ticks while the queue reads is a problem; an answer clears it', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
  terylon.hang.add('events_since')
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })

  // Within the bound: nothing said yet, the call may still answer.
  await terylon.clock.advance(60000)
  expect(await ui.find({ type: 'Text', text: exact('Problems · 0') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('The done-signal hears nothing') })).toBeUndefined()

  // Past three ticks with no answer, at the watchdog's next look: the problem, though nothing failed that the pane saw.
  await terylon.clock.advance(41000)
  expect((await ui.find({ key: 'tab-status' }))?.text).toContain('⚠')
  expect((await ui.find({ type: 'Text', text: exact('The done-signal hears nothing') }))?.props.color).toBe('error')
  expect(await ui.find({ type: 'Text', text: /^events_since has not answered for 100 s, not once this session, while the queue reads\./ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^3\. If it stays, run claude --debug and read the lines under terylon-pane: events:/ })).toBeDefined()

  // The call answers: the watchdog's clock starts again, and the problem goes.
  terylon.hang.delete('events_since')
  for (const release of terylon.held.splice(0)) {
    release()
  }
  await terylon.clock.advance(30000)
  expect(await ui.find({ type: 'Text', text: exact('The done-signal hears nothing') })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('Problems · 0') })).toBeDefined()
})

test('THE WATCHDOG stays quiet while the queue itself does not read: that problem is said already', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'down'
  await $.session.start(SESSION)
  await terylon.clock.advance(150000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ type: 'Text', text: exact('The done-signal hears nothing') })).toBeUndefined()
})

// A value an earlier version of the mod left in $.state, served for good: the state.get answer the engine takes.
function seedSnapshot(on: On, value: Record<string, unknown>): void {
  on('state.get', async ($, e, next) =>
    String((e as { key?: unknown }).key) === 'snapshot' ? ({ value: { value, version: 1 } } as never) : next(e))
}

// THE SNAPSHOT AS 1.8.3 KEPT IT: every field it drew, none of the done-signal's.
const SNAPSHOT_1_8_3 = {
  connection: 'ok', problem: null, fetchedAt: Date.parse('2026-10-11T21:59:00Z'), failingSince: null, header: 'running $1.00 of $20 today · 1 of 4 slots',
  runningUsd: '1.00', dayBudget: '20', slots: 4, slotsUsed: 1, paused: null, pausedSince: null, notices: 0, alerts: 0, alertNotices: [],
  server: 'plugin:terylon-os:terylon', waiting: [], running: [], queued: [], doneToday: [], questions: [],
}

test('THE STATUS TAB DRAWS FROM A SNAPSHOT 1.8.3 KEPT, without the done-signal\'s fields, on every surface', async ($, on) => {
  seedSnapshot(on, SNAPSHOT_1_8_3)
  world(on)
  await $.session.start(SESSION)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-status' })
    expect(await ui.find({ type: 'Text', text: exact('AGENTIC OS') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Problems · 0') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /did not draw/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('A DONE-SIGNAL FIELD OF ANOTHER SHAPE is read as none: the Status tab draws, and says nothing failed', async ($, on) => {
  seedSnapshot(on, { ...SNAPSHOT_1_8_3, events: { kind: 'store' }, eventsAnsweredAt: 'never', eventsWatchedSince: null, eventsSilentSince: {} })
  world(on)
  await $.session.start(SESSION)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ type: 'Text', text: exact('Problems · 0') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /did not draw/ })).toBeUndefined()
  expect((await ui.find({ key: 'tab-status' }))?.text).not.toContain('⚠')
})

test('A PART OF THE STATUS TAB THAT THROWS is one problem with its reason and steps; the rest of the tab draws', async ($, on) => {
  seedSnapshot(on, { ...SNAPSHOT_1_8_3, alertNotices: [null] })
  const terylon = world(on)
  await $.session.start(SESSION)

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-status' })
    expect((await ui.find({ type: 'Text', text: exact("The Status tab's alerts did not draw") }))?.props.color).toBe('error')
    expect(await ui.find({ type: 'Text', text: /^Reason: / })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('1. Press Refresh, or open another tab and come back.') })).toBeDefined()
    // EVERY OTHER PART IS DRAWN: the machine, the slots, the cost, the policy and the diagnostics.
    expect(await ui.find({ type: 'Text', text: exact('AGENTIC OS') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Slots') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Policy') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('terylon-pane 1.9.6') })).toBeDefined()
    await ui.unmount()
  }
  expect(terylon.logs.some(log => log.to === 'debug' && log.text.startsWith("terylon-pane: the Status tab's alerts did not draw: "))).toBe(true)
})

test('THE CONNECTION\'S PROBLEM AND THE DONE-SIGNAL\'S, together: each card keeps its own Try again, no key drawn twice', async ($, on) => {
  on('store.get', async () => ({ deny: STORE_REFUSAL }) as never)
  on('store.set', async () => ({ deny: STORE_REFUSAL }) as never)
  const terylon = world(on, { store: null })
  await $.session.start(SESSION)
  await terylon.clock.settle()
  terylon.mode.server = 'down'
  await terylon.clock.advance(30000)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ type: 'Text', text: exact('The pane cannot keep its place') })).toBeDefined()
  const keys = (await ui.findAll({ type: 'Button' })).map(button => button.key).filter(key => key !== undefined)
  expect(keys.filter(key => key === 'retry')).toHaveLength(1)
  expect(keys.filter(key => key === 'events-retry')).toHaveLength(1)
  expect(new Set(keys).size).toBe(keys.length)
})

test('AN ACCEPTED LIST STORY, which Terylon calls merged, reads accepted on its chip and its phases; a repository story stays merged', async ($, on) => {
  const terylon = world(on, { now: lateOnTheLocalDayOf('2026-10-11T12:20:00Z') })
  terylon.answers.stories_list = {
    stories: [
      { id: 105, title: 'TEST S32.1: reply SIGMA', state: 'merged', target: 'list', updatedAt: '2026-10-11T12:10:00Z' },
      { id: 341, title: 'S10a cleanup', state: 'merged', costUsd: 5.6, updatedAt: '2026-10-11T12:20:00Z' },
    ],
  }
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 105
    ? { id: 105, goal: 29, title: 'TEST S32.1: reply SIGMA', state: 'merged', target: 'list', attempt: 1, pullRequest: null, progress: null, timeline: [] }
    : { id: 341, goal: 3, title: 'S10a cleanup', state: 'merged', target: 'github:contoso/agentic-os', attempt: 1, pullRequest: { id: 190, url: 'https://dev.example/pr/190', branch: 'feat/cleanup' }, progress: null, timeline: [] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'done-105' })
  expect(await ui.find({ type: 'Text', text: /^\W*accepted\W*$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\W*merged\W*$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^\d of \d · accepted$/ })).toBeDefined()

  await ui.press({ key: 'back' })
  await ui.press({ key: 'done-341' })
  expect(await ui.find({ type: 'Text', text: /^\W*merged\W*$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\d of \d · merged$/ })).toBeDefined()
})

test('A VERIFIED STORY THAT WORK_IN_FLIGHT STILL LISTS is not drawn under Running beside its Waiting row', async ($, on) => {
  const terylon = world(on)
  withListStory(terylon)
  // AS TERYLON ANSWERED IT once the run had ended: the verified story still listed, its progress the plan's.
  terylon.answers.work_in_flight = {
    ...FLIGHT,
    stories: [
      ...FLIGHT.stories,
      { id: 352, title: 'Weekly cost summary', state: 'verified', attempt: 1, progress: { stage: 'plan', step: null, steps: null, current: null, agent: { name: 'planner', running: 1 }, tokens: null }, costUsd: 1.8, budgetUsd: 4 },
      { id: 327, title: 'Events since the last look', state: 'running', attempt: 1, progress: { stage: 'plan', step: null, steps: null, current: null, agent: { name: 'planner', running: 1 }, tokens: null }, costUsd: 1.1, budgetUsd: 4 },
      { id: 341, title: 'S10a cleanup', state: 'merged', attempt: 1, progress: { stage: 'merge', step: null, steps: null, current: null, agent: null, tokens: null }, costUsd: 5.6, budgetUsd: 8 },
    ],
  }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-queue' })
    expect(await ui.find({ key: 'accept-352' })).toBeDefined()
    expect(await ui.find({ key: 'merge-327' })).toBeDefined()
    // ITS OWN STATE says verified; the other, still said running, is one the briefing lists as verified.
    expect(await ui.find({ key: 'story-352' })).toBeUndefined()
    expect(await ui.find({ key: 'story-327' })).toBeUndefined()
    // AN ENDED ONE, which the briefing no longer lists, by its own state alone.
    expect(await ui.find({ key: 'story-341' })).toBeUndefined()
    expect(await ui.find({ key: 'story-333' })).toBeDefined()
    await ui.unmount()
  }
})

test('TERYLON_PANE_STATUS=minimal draws the Status tab as plain lines alone: no card, no picture, no button but the tabs', async ($, on) => {
  const terylon = world(on, { env: { TERYLON_PANE_STATUS: 'minimal' } })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-status' })
    expect(await ui.find({ type: 'Text', text: exact('Agentic OS: ok') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Problems: 0') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('terylon-pane 1.9.6') })).toBeDefined()
    expect(await ui.findAll({ type: 'Svg' })).toEqual([])
    expect(await ui.find({ type: 'Text', text: exact('AGENTIC OS') })).toBeUndefined()
    expect((await ui.findAll({ type: 'Button' })).every(button => String(button.key).startsWith('tab-'))).toBe(true)
    await ui.unmount()
  }
  expect(terylon.logs.some(log => log.to === 'debug' && log.text.startsWith('terylon-pane: the Status tab draws minimal; problems 0'))).toBe(true)
})

test('TERYLON_PANE_STATUS=no-<part> leaves that part out, and every draw says in claude --debug what it returns', async ($, on) => {
  on('store.get', async () => ({ deny: STORE_REFUSAL }) as never)
  on('store.set', async () => ({ deny: STORE_REFUSAL }) as never)
  const terylon = world(on, { store: null, env: { TERYLON_PANE_STATUS: 'no-events, no-gauges no-diagnostics' } })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ type: 'Text', text: exact('AGENTIC OS') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('Policy') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('The pane cannot keep its place') })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('Cost') })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('Diagnostics') })).toBeUndefined()
  expect(terylon.logs.some(log => log.to === 'debug' && log.text.startsWith('terylon-pane: the Status tab draws machine, problems, alerts, outcomes, policy; problems 0, events store; '))).toBe(true)
})

test("TERYLON_PANE_STATUS=log draws the pane's own log on the Queue tab: where the Status tab began, what it drew and what it holds", async ($, on) => {
  const terylon = world(on, { env: { TERYLON_PANE_STATUS: 'log' } })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: exact("The pane's own log") })).toBeDefined()
  await ui.press({ key: 'tab-status' })
  await ui.press({ key: 'tab-queue' })
  expect(await ui.find({ type: 'Text', text: /^\d+ terylon-pane: the Status tab begins on desktop at \d+ columns$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^\d+ terylon-pane: the Status tab draws machine, .*; \d+ elements, \d+ characters, nothing odd; \d+ ms$/ })).toBeDefined()
  expect(terylon.logs.some(log => log.to === 'debug' && /^terylon-pane: the Status tab draws .*nothing odd; \d+ ms$/.test(log.text))).toBe(true)
})

test("the pane's own log is not drawn unless TERYLON_PANE_STATUS asks for it", async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  await ui.press({ key: 'tab-queue' })
  expect(await ui.find({ type: 'Text', text: exact("The pane's own log") })).toBeUndefined()
})

test('the tree check names a key used twice, a prop with no finite value and a control character, and passes a clean tree', () => {
  const clean = { type: 'Box', props: { key: 'a', gap: 1 }, children: [{ type: 'Text', children: ['hi'] }, { type: 'Button', props: { key: 'b', label: 'x' } }] }
  expect(checkTree(clean)).toEqual({ elements: 3, characters: 2, duplicateKeys: [], oddProps: [] })
  expect(treeLine(checkTree(clean))).toBe('3 elements, 2 characters, nothing odd')

  const odd = { type: 'Box', props: { key: 'retry' }, children: [[{ type: 'Button', props: { key: 'retry', label: 'x' } }], { type: 'Box', props: { width: Number.NaN, label: undefined } }, { type: 'Text', children: ['a\u0007b'] }] }
  const check = checkTree(odd)
  expect(check.duplicateKeys).toEqual(['retry×2'])
  expect(check.oddProps).toEqual(['Box.width=NaN', 'Box.label=undefined', 'text: a control character'])
  expect(treeLine(check)).toBe('4 elements, 3 characters; keys used twice: retry×2; odd props: Box.width=NaN, Box.label=undefined, text: a control character')
})
