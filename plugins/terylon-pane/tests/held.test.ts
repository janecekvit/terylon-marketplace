// A PROMPT WAITS FOR THE RUNNING TURN: Claude Code holds a submitted prompt until the turn ends, so a done-signal read
// again right before the submit could still reach the owner after the story moved on. Story 146 as it happened: verified
// for 26 s while a turn ran, then returned, blocked and abandoned under a dropped goal. The pane holds a signal found
// while the main loop's turn runs, toasts it at once, and posts at the turn's end only what is still true.

import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

import { SESSION, events, storyMoved, world } from './fixtures'

const SEEN = { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') }

const VERIFIED_146 = { id: 146, goal: 40, title: 'Weekly report', state: 'verified', pullRequest: { id: 7 }, verdict: { commit: 'abc1234def', environment: 'pr-7' }, timeline: [] }
const ABANDONED_146 = { ...VERIFIED_146, state: 'abandoned', goalState: 'dropped' }

// The engine beneath the pane's turn hooks: a turn starts with its id and ends with its answer.
function turns(on: On): void {
  on('turn.start', async ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', async ($, e) => ({ text: e.answer }))
}

const END = { answer: '', durationMs: 1000, isAborted: false, reason: 'answer' as const }

test('STORY 146: verified while a turn runs, abandoned before it ends: no Accept asked, only the line still true', async ($, on) => {
  turns(on)
  const terylon = world(on, { store: SEEN })
  let moved: Record<string, unknown>[] = []
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since)))
  terylon.answers.story_get = VERIFIED_146
  await $.session.start(SESSION)
  await terylon.clock.settle()

  await $.turn.start({ text: 'something else', turnId: 't1' })
  moved = [{ ...storyMoved(18101, 146, 'Weekly report', 'verified'), pullRequest: 7 }]
  await terylon.clock.advance(30000)

  // Held: the toast now, no prompt while the turn runs.
  expect(terylon.prompts).toEqual([])
  expect(terylon.toasts).toEqual(['Terylon: #146 verified, waiting for merge'])

  terylon.answers.story_get = ABANDONED_146
  moved = [...moved, { ...storyMoved(18102, 146, 'Weekly report', 'abandoned', 'abandoned'), from: 'blocked', pullRequest: 7 }]
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toEqual([])

  await $.turn.complete({ ...END, turnId: 't1' })
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual(['Story #146 „Weekly report“ je opuštěná. Shrň mi proč a co z ní zůstalo.'])
  expect(terylon.prompts.filter(prompt => prompt.includes('čeká na'))).toEqual([])

  // Told once.
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)
})

test('a signal still true at the turn\'s end is posted then, and its toast is not given twice', async ($, on) => {
  turns(on)
  const terylon = world(on, { store: SEEN })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 327, 'Events since the last look', 'verified')])
  await $.session.start(SESSION)

  await $.turn.start({ text: 'something else', turnId: 't1' })
  await terylon.clock.settle()
  expect(terylon.prompts).toEqual([])
  expect(terylon.toasts).toEqual(['Terylon: #327 verified, waiting for merge'])

  await $.turn.complete({ ...END, turnId: 't1' })
  await terylon.clock.settle()
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
  expect(terylon.toasts).toEqual(['Terylon: #327 verified, waiting for merge'])
})

test("a subagent's turn holds nothing: only the main loop's turn makes a prompt wait", async ($, on) => {
  turns(on)
  const terylon = world(on, { store: SEEN })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 327, 'Events since the last look', 'verified')])
  await $.session.start(SESSION)

  await $.turn.start({ text: 'a task', turnId: 'a1', agentId: 'agent-1' })
  await terylon.clock.settle()
  expect(terylon.prompts).toHaveLength(1)
})

// The store answered by the test, so that what the pane records as told can be read beside what it posted.
function storeOf(on: On, seed: Record<string, unknown>): Map<string, unknown> {
  const kept = new Map<string, unknown>(Object.entries(seed))
  on('store.get', async ($, e) => ({ value: kept.get(e.key) }) as never)
  on('store.set', async ($, e) => {
    kept.set(e.key, e.value)
    return { value: undefined } as never
  })
  on('store.delete', async ($, e) => {
    kept.delete(e.key)
    return { value: undefined } as never
  })

  return kept
}

function told(kept: Map<string, unknown>): unknown[] {
  const value = kept.get('signalled')

  return Array.isArray(value) ? value : []
}

test('STORY 148: verified, then abandoned while a turn runs: at its end the abandoned line is posted, and the store records exactly what was posted', async ($, on) => {
  turns(on)
  const kept = storeOf(on, SEEN)
  const terylon = world(on, { store: null })
  let moved: Record<string, unknown>[] = []
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since)))
  terylon.answers.story_get = VERIFIED_146
  await $.session.start(SESSION)
  await terylon.clock.settle()

  await $.turn.start({ text: 'something else', turnId: 't1' })
  moved = [{ ...storyMoved(18101, 146, 'Weekly report', 'verified'), pullRequest: 7 }]
  await terylon.clock.advance(30000)
  terylon.answers.story_get = ABANDONED_146
  moved = [...moved, { ...storyMoved(18102, 146, 'Weekly report', 'abandoned', 'abandoned'), pullRequest: 7 }]
  await terylon.clock.advance(30000)

  // Held: nothing recorded as told while nothing is posted.
  expect(terylon.prompts).toEqual([])
  expect(told(kept)).toEqual([])

  await $.turn.complete({ ...END, turnId: 't1' })
  await terylon.clock.settle()
  expect(terylon.prompts).toEqual(['Story #146 „Weekly report“ je opuštěná. Shrň mi proč a co z ní zůstalo.'])
  expect(told(kept)).toEqual(['146:abandoned:18102'])
})

test('A PROMPT THAT DOES NOT ENTER THE SESSION records nothing as told: the next read posts it, once', async ($, on) => {
  const kept = storeOf(on, SEEN)
  const terylon = world(on, { store: null })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 327, 'Events since the last look', 'verified')])
  terylon.prompt.drop = 'the session is closing'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  expect(told(kept)).toEqual([])

  terylon.prompt.drop = null
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
  expect(told(kept)).toEqual(['327:verified:4be21c0aaaa'])

  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)
})

test('A TURN THAT ENDS WHILE A TICK RUNS loses nothing: what the tick held is posted as the tick ends', async ($, on) => {
  turns(on)
  // A store whose write of lastSeq is held while `holding`, so the turn ends after the tick held its signal.
  const kept = new Map<string, unknown>(Object.entries(SEEN))
  const holding = { isOn: false }
  on('store.get', async ($_, e) => ({ value: kept.get(e.key) }) as never)
  on('store.set', async ($_, e) => {
    if (holding.isOn && e.key === 'lastSeq') {
      return new Promise(() => undefined) as never
    }
    kept.set(e.key, e.value)
    return { value: undefined } as never
  })
  const terylon = world(on, { store: null })
  let moved: Record<string, unknown>[] = []
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since)))
  await $.session.start(SESSION)
  await terylon.clock.settle()

  await $.turn.start({ text: 'something else', turnId: 't1' })
  moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  holding.isOn = true
  await terylon.clock.advance(30000)
  expect(terylon.toasts).toEqual(['Terylon: #327 verified, waiting for merge'])

  // The turn ends while the tick still waits on the store.
  await $.turn.complete({ ...END, turnId: 't1' })
  await terylon.clock.advance(1)
  expect(terylon.prompts).toEqual([])

  // The store's bound lets the tick end, well before the next poll: posted as this tick ends.
  await terylon.clock.advance(2100)
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
})

// STORY 172 as it happened: verified, then abandoned by its goal's drop, both in one page while a turn ran.
const VERIFIED_172 = { id: 172, goal: 52, title: 'Test S', state: 'verified', target: 'list', pullRequest: null, timeline: [] }
const ABANDONED_172 = { ...VERIFIED_172, state: 'abandoned', goalState: 'dropped' }

test('STORY 172: verified then abandoned in one page during a turn, under a dropped goal: the abandon is told at its end', async ($, on) => {
  turns(on)
  const kept = storeOf(on, SEEN)
  const terylon = world(on, { store: null })
  let moved: Record<string, unknown>[] = []
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since)))
  terylon.answers.story_get = ABANDONED_172
  await $.session.start(SESSION)
  await terylon.clock.settle()

  await $.turn.start({ text: 'something else', turnId: 't1' })
  moved = [{ ...storyMoved(18101, 172, 'Test S', 'verified'), pullRequest: null }, { ...storyMoved(18104, 172, 'Test S', 'abandoned', 'abandoned'), pullRequest: null }]
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toEqual([])
  expect(terylon.toasts).toEqual(['Terylon: #172 abandoned'])

  // An abandon under a dropped goal asks nothing, and is still told: only verified, blocked and stuck are silenced there.
  await $.turn.complete({ ...END, turnId: 't1' })
  await terylon.clock.settle()
  expect(terylon.prompts).toEqual(['Story #172 „Test S“ je opuštěná. Shrň mi proč a co z ní zůstalo.'])
  expect(told(kept)).toEqual(['172:abandoned:18104'])
  expect(kept.get('held')).toEqual([])
})

test('A HELD SIGNAL SURVIVES A RESTART: kept in the store before lastSeq moves past it, and posted once by the next session', async ($, on) => {
  turns(on)
  const kept = storeOf(on, SEEN)
  const terylon = world(on, { store: null })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 327, 'Events since the last look', 'verified')])
  await $.session.start(SESSION)
  await $.turn.start({ text: 'something else', turnId: 't1' })
  await terylon.clock.settle()

  // Held while the turn runs: in the store as well as in memory, and the position already past its event.
  expect(terylon.prompts).toEqual([])
  expect(kept.get('lastSeq')).toBe(18101)
  expect(kept.get('held')).toEqual([{ story: 327, kind: 'verified', seq: 18101, title: 'Events since the last look', pullRequest: 196, reason: null }])
  expect(told(kept)).toEqual([])
})

test('A HELD SIGNAL AN EARLIER SESSION KEPT is posted once by the session that takes the lease, and leaves the store', async ($, on) => {
  const kept = storeOf(on, { ...SEEN, lastSeq: 18101, held: [{ story: 327, kind: 'verified', seq: 18101, title: 'Events since the last look', pullRequest: 196, reason: null }, { story: 'x' }] })
  const terylon = world(on, { store: null })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), [])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
  expect(told(kept)).toEqual(['327:verified:4be21c0aaaa'])
  expect(kept.get('held')).toEqual([])

  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)
})

test('A TURN WHOSE END IS NEVER HEARD holds nothing for good: after 30 min it is taken as ended, and the signal is posted', async ($, on) => {
  turns(on)
  const terylon = world(on, { store: SEEN })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 327, 'Events since the last look', 'verified')])
  await $.session.start(SESSION)
  await $.turn.start({ text: 'something else', turnId: 't1' })
  await terylon.clock.settle()
  expect(terylon.prompts).toEqual([])

  await terylon.clock.advance(29 * 60000)
  expect(terylon.prompts).toEqual([])

  await terylon.clock.advance(2 * 60000)
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
})
