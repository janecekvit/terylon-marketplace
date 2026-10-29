// ONE SIGNALLER PER MACHINE: every open session runs the mod, and Terylon Testing saw story 147's done-signal land in a
// background design session. The session holding the lease in the shared store alone reads the events, posts and
// toasts; another session is stood in for here by a lease the test writes into that store.

import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PANE_PROPS, SESSION, WORLD_NOW, events, exact, storyMoved, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const
const BAND = { plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { top: 0, bodyRows: 3 }, view: {} } } as never

const THIS = 'session-a'
const OTHER = 'session-b'
const SEEN = { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') }

type Lease = { session: string; since: number; until: number; seen: boolean }

// The shared store, answered by the test, and this session's id.
function machine(on: On, seed: Record<string, unknown>): Map<string, unknown> {
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

  return kept
}

function leaseIn(kept: Map<string, unknown>): Lease | undefined {
  return kept.get('signaller') as Lease | undefined
}

function eventsCalls(terylon: ReturnType<typeof world>): number {
  return terylon.calls.filter(call => call.tool === 'events_since').length
}

function movingTerylon(terylon: ReturnType<typeof world>): { moved: Record<string, unknown>[] } {
  const log = { moved: [] as Record<string, unknown>[] }
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), log.moved.filter(event => Number(event.seq) > Number(args.since)))

  return log
}

async function diagnosticsLine($: Parameters<Parameters<typeof test>[1]>[0], text: string | RegExp): Promise<boolean> {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  const found = await ui.find({ type: 'Text', text: typeof text === 'string' ? exact(text) : text })
  await ui.unmount()

  return found !== undefined
}

test('ANOTHER SESSION HOLDS THE LEASE: this one reads no events and posts nothing, and Diagnostics says who signals', async ($, on) => {
  const kept = machine(on, { ...SEEN, signaller: { session: OTHER, since: WORLD_NOW - 60000, until: WORLD_NOW + 10 * 3600000, seen: true } })
  const terylon = world(on, { store: null })
  const log = movingTerylon(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)

  expect(eventsCalls(terylon)).toBe(0)
  expect(terylon.prompts).toEqual([])
  expect(terylon.toasts).toEqual([])
  expect(leaseIn(kept)?.session).toBe(OTHER)
  expect(await diagnosticsLine($, /^signaller: another \(since \d\d:\d\d\)$/)).toBe(true)
  // Not reading the events is no silence: the watchdog says nothing.
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ type: 'Text', text: /^events_since has not answered/ })).toBeUndefined()
})

test('A LEASE NOT RENEWED LAPSES: this session takes it over and posts what moved, once', async ($, on) => {
  const kept = machine(on, { ...SEEN, signaller: { session: OTHER, since: WORLD_NOW - 60000, until: WORLD_NOW + 45000, seen: true } })
  const terylon = world(on, { store: null })
  const log = movingTerylon(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  expect(eventsCalls(terylon)).toBe(0)

  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toEqual([])

  // The other session's lease ran out: this one takes it and tells what moved since the shared last look.
  await terylon.clock.advance(30000)
  expect(leaseIn(kept)?.session).toBe(THIS)
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
  expect(terylon.toasts).toEqual(['Terylon: #327 verified, waiting for merge'])

  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)
  expect(await diagnosticsLine($, 'signaller: this session')).toBe(true)
})

test('THE HOLDER RENEWS ITS LEASE every tick, so it never lapses while the session runs', async ($, on) => {
  const kept = machine(on, SEEN)
  const terylon = world(on, { store: null })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const first = leaseIn(kept)
  expect(first?.session).toBe(THIS)
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)

  const renewed = leaseIn(kept)
  expect(renewed?.session).toBe(THIS)
  expect(renewed?.since).toBe(first?.since)
  expect(renewed?.until).toBeGreaterThan((first?.until ?? 0) + 90000)
})

test('A SESSION NO PERSON IS AT never takes the lease and never posts', async ($, on) => {
  const kept = machine(on, SEEN)
  const terylon = world(on, { store: null })
  const log = movingTerylon(terylon)
  await $.session.start({ ...SESSION, surface: null, isInteractive: false } as never)
  await terylon.clock.settle()

  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)

  expect(leaseIn(kept)).toBeUndefined()
  expect(eventsCalls(terylon)).toBe(0)
  expect(terylon.prompts).toEqual([])
  expect(terylon.toasts).toEqual([])
})

test('THE OWNER TYPING HERE moves the lease to this session, which then posts', async ($, on) => {
  const kept = machine(on, { ...SEEN, signaller: { session: OTHER, since: WORLD_NOW - 60000, until: WORLD_NOW + 10 * 3600000, seen: true } })
  const terylon = world(on, { store: null })
  const log = movingTerylon(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  expect(eventsCalls(terylon)).toBe(0)

  await $.prompt.submit({ text: 'how is goal 3 going?', origin: { kind: 'composer' } } as never)
  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)

  expect(leaseIn(kept)?.session).toBe(THIS)
  expect(terylon.prompts.filter(prompt => prompt.startsWith('Story #327'))).toHaveLength(1)
})

test("A SESSION THE OWNER SEES takes the lease from one nobody saw, the background design session's case", async ($, on) => {
  const kept = machine(on, { ...SEEN, signaller: { session: OTHER, since: WORLD_NOW - 60000, until: WORLD_NOW + 10 * 3600000, seen: false } })
  const terylon = world(on, { store: null })
  const log = movingTerylon(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  expect(eventsCalls(terylon)).toBe(0)

  await (await $.ui.mount(BAND)).unmount()
  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)

  expect(leaseIn(kept)).toMatchObject({ session: THIS, seen: true })
  expect(terylon.prompts).toHaveLength(1)
})

test('A STORE THAT REFUSES keeps no lease: a session the owner neither sees nor types in posts nothing', async ($, on) => {
  on('store.get', async () => ({ deny: 'EACCES: permission denied' }) as never)
  on('store.set', async () => ({ deny: 'EACCES: permission denied' }) as never)
  const terylon = world(on, { store: null })
  const log = movingTerylon(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  expect(eventsCalls(terylon)).toBe(0)
  expect(terylon.prompts).toEqual([])
  expect(await diagnosticsLine($, 'signaller: none')).toBe(true)
})
