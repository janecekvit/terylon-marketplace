// A MODULE UPDATED IN PLACE, as Terylon Testing walked it: after an update loaded into running Desktop sessions no
// session read events_since for about four minutes, Status said no session posts the done-signal, and the poll came back
// only when the owner typed. A refused round of $.clock.every stops that timer for good, and a poll that died that way is
// stood in for here by a clock.every the test refuses. And signals held when a lease lapses are posted by the next holder.

import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PANE_PROPS, SESSION, WORLD_NOW, events, storyMoved, world } from './fixtures'

const THIS = 'dev-session'
const OTHER = 'session-b'
const SEEN = { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') }
const SINCE = Date.parse('2026-10-11T08:00:00Z')
const BAND = { plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { top: 0, bodyRows: 3 }, view: {} } } as never
const PANE = { plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as never
const END = { answer: '', durationMs: 1000, isAborted: false, reason: 'answer' as const }

type Lease = { session: string; since: number; until: number; seen: boolean }

// The shared store, this session's id, a clock.every the host can refuse, and the turns beneath the pane's hooks.
// Registered before the world, so a refusal reaches the pane's own timers.
function machine(on: On, seed: Record<string, unknown>): { kept: Map<string, unknown>; host: { isRefusing: boolean } } {
  const host = { isRefusing: false }
  on('clock.every', { ms: 30000 } as never, async ($, e, next) => (host.isRefusing ? ({ deny: 'the module was replaced' }) as never : next(e)))
  const kept = new Map<string, unknown>(Object.entries(seed))
  on('session.id', async () => ({ value: THIS }) as never)
  on('store.get', async ($, e) => ({ value: kept.get(e.key) }) as never)
  on('store.set', async ($, e) => {
    kept.set(e.key, e.value)
    return { value: undefined } as never
  })
  on('store.delete', async ($, e) => {
    kept.delete(e.key)
    return { value: undefined } as never
  })
  on('turn.start', async ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', async ($, e) => ({ text: e.answer }))

  return { kept, host }
}

function eventsCalls(terylon: ReturnType<typeof world>): number {
  return terylon.calls.filter(call => call.tool === 'events_since').length
}

function leaseIn(kept: Map<string, unknown>): Lease {
  return kept.get('signaller') as Lease
}

type Hook = { name: string; fire: ($: Parameters<Parameters<typeof test>[1]>[0]) => Promise<void> }

const HOOKS: Hook[] = [
  { name: 'the band', fire: async $ => (await $.ui.mount(BAND)).unmount() },
  { name: 'the pane', fire: async $ => (await $.ui.mount(PANE)).unmount() },
  { name: 'turn.start', fire: async $ => void (await $.turn.start({ text: 'something else', turnId: 't2' })) },
  { name: 'turn.complete', fire: async $ => void (await $.turn.complete({ ...END, turnId: 't1' })) },
  { name: 'prompt.submit', fire: async $ => void (await $.prompt.submit({ text: 'a model prompt', origin: { kind: 'plugin' } } as never)) },
]

for (const hook of HOOKS) {
  test(`A RELOADED MODULE WHOSE POLL THE HOST STOPPED, with no session.start: ${hook.name} starts it again within one tick, and it renews its own lease, no typing`, async ($, on) => {
    const { kept, host } = machine(on, { ...SEEN, signaller: { session: THIS, since: SINCE, until: WORLD_NOW + 60000, seen: true } })
    const terylon = world(on, { store: null })
    terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), [])

    // The update reached a running session: the first hook the new module sees starts its poll.
    await $.turn.start({ text: 'the owner asked something', turnId: 't1' })
    await terylon.clock.settle()
    expect(eventsCalls(terylon)).toBe(1)

    // The host refuses a round of the poll's timer: it never fires again, and the lease lapses meanwhile.
    host.isRefusing = true
    await terylon.clock.advance(30000)
    host.isRefusing = false
    const stopped = eventsCalls(terylon)
    await terylon.clock.advance(30000)
    await terylon.clock.advance(30000)
    await terylon.clock.advance(30000)
    expect(eventsCalls(terylon)).toBe(stopped)
    expect(leaseIn(kept).until).toBeLessThanOrEqual(await terylon.clock.now())

    // Any hook: the poll ticks at once, and keeps ticking.
    await hook.fire($)
    await terylon.clock.settle()
    expect(eventsCalls(terylon)).toBe(stopped + 1)
    expect(leaseIn(kept).session).toBe(THIS)
    expect(leaseIn(kept).since).toBe(SINCE)
    expect(leaseIn(kept).until).toBeGreaterThan(await terylon.clock.now())
    await terylon.clock.advance(30000)
    expect(eventsCalls(terylon)).toBe(stopped + 2)
    expect(terylon.prompts.filter(prompt => prompt.startsWith('Story'))).toEqual([])
  })
}

test('A HOOK WHILE THE POLL TICKS starts no second poll: one events_since per tick', async ($, on) => {
  machine(on, SEEN)
  const terylon = world(on, { store: null })
  await $.session.start(SESSION)
  await terylon.clock.settle()
  const first = eventsCalls(terylon)

  for (let index = 0; index < 4; index += 1) {
    await (await $.ui.mount(BAND)).unmount()
    await $.turn.start({ text: 'something', turnId: `t${index}` })
    await $.turn.complete({ ...END, turnId: `t${index}` })
    await terylon.clock.advance(30000)
  }

  expect(eventsCalls(terylon)).toBe(first + 4)
})

test('A SESSION TAKEN FOR UNATTENDED renews a lease that names it: a reload\'s session.start says nobody is there, and the done-signal goes on', async ($, on) => {
  const { kept } = machine(on, { ...SEEN, signaller: { session: THIS, since: SINCE, until: WORLD_NOW - 1000, seen: true } })
  const terylon = world(on, { store: null })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 327, 'Events since the last look', 'verified')])
  await $.session.start({ ...SESSION, surface: null, isInteractive: false } as never)
  await terylon.clock.settle()

  expect(leaseIn(kept).session).toBe(THIS)
  expect(leaseIn(kept).until).toBeGreaterThan(await terylon.clock.now())
  expect(eventsCalls(terylon)).toBe(1)
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
})

// STORY 185 under goal 57, blocked then abandoned by the goal's drop; 186 and 187 a repeating task's green runs,
// verified and waiting for Accept.
const HELD = [
  { story: 185, kind: 'blocked', seq: 3600, title: 'One-off', pullRequest: null, reason: 'a test failed' },
  { story: 185, kind: 'abandoned', seq: 3605, title: 'One-off', pullRequest: null, reason: null },
  { story: 186, kind: 'verified', seq: 3610, title: 'Run 1', pullRequest: null, reason: null },
  { story: 187, kind: 'verified', seq: 3620, title: 'Run 2', pullRequest: null, reason: null },
]

function storiesOf185To187(terylon: ReturnType<typeof world>): void {
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 185
    ? { id: 185, goal: 57, title: 'One-off', state: 'abandoned', goalState: 'dropped', target: 'list', pullRequest: null, timeline: [] }
    : { id: args.story, goal: 58, title: `Run ${Number(args.story) - 185}`, state: 'verified', target: 'list', pullRequest: null, verdict: { commit: `c${String(args.story)}`, environment: null }, timeline: [] })
}

test('A LAPSED LEASE WITH HELD SIGNALS: the session that takes it reads them back and, idle, posts them once at that tick in one prompt, 185 told abandoned', async ($, on) => {
  const { kept } = machine(on, { ...SEEN, lastSeq: 3684 })
  const terylon = world(on, { store: null })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), [])
  storiesOf185To187(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  expect(leaseIn(kept).session).toBe(THIS)

  // Another session takes the lease, holds three signals through a turn, and stops before posting them.
  kept.set('signaller', { session: OTHER, since: await terylon.clock.now(), until: (await terylon.clock.now()) + 45000, seen: true })
  kept.set('held', HELD)
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toEqual([])

  // Its lease lapses: this session takes it and posts at that tick, once, one summary of the three stories.
  await terylon.clock.advance(30000)
  expect(leaseIn(kept).session).toBe(THIS)
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toContain('186')
  expect(terylon.prompts[0]).toContain('187')
  expect(terylon.prompts[0]).toContain('185')
  expect(terylon.prompts[0]).not.toContain('blok')
  expect(kept.get('held')).toEqual([])

  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)
})

test('HELD ENTRIES FOR ONE STORY post once at the turn\'s end: its latest move alone', async ($, on) => {
  const { kept } = machine(on, { ...SEEN, lastSeq: 18101, held: [
    { story: 327, kind: 'blocked', seq: 18099, title: 'Events since the last look', pullRequest: 196, reason: 'a test failed' },
    { story: 327, kind: 'verified', seq: 18101, title: 'Events since the last look', pullRequest: 196, reason: null },
  ] })
  const terylon = world(on, { store: null })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), [])
  await $.session.start(SESSION)
  await $.turn.start({ text: 'something else', turnId: 't1' })
  await terylon.clock.settle()
  await terylon.clock.advance(30000)

  expect(terylon.prompts).toEqual([])

  await $.turn.complete({ ...END, turnId: 't1' })
  await terylon.clock.settle()
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
  expect(kept.get('held')).toEqual([])
})
