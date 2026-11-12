// ONE SESSION POSTS A STORY'S SIGNAL: every open session runs the mod, and the owner saw one blocked story's prompt
// posted into two Claude Code sessions at once. Two instances of the mod share one $.store; the other instance is stood
// in here by what it writes into that store, at the moment it writes it, as lease.test.ts stands in its lease.
//
//   the owner's mark ("Terylon's session") ──▶ that session holds the lease while it lives, typing elsewhere or not
//   no mark ──▶ the lease, and a claim per signal in the shared store, written, then read back before the prompt
//   a session whose claim was overwritten, or whose lease moved on during its turn ──▶ no prompt

import { test, expect } from 'claude-code/testing'
import type { On } from 'claude-code'

import { PANE_PROPS, SESSION, WORLD_NOW, events, exact, moreWith, storyMoved, world } from './fixtures'
import { claimsOf, withClaims } from '../hooks/signals'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

const THIS = 'session-a'
const OTHER = 'session-b'
const SEEN = { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') }
const HOURS_10 = 10 * 3600000

// The claim key of story 327's move at sequence 18101 to verified: the candidate as both sessions read it.
const CLAIM_327 = '327:verified:18101'

const END = { answer: '', durationMs: 1000, isAborted: false, reason: 'answer' as const }

type Lease = { session: string; since: number; until: number; seen: boolean }

// The shared store and this session's id. `afterSet` is the other instance writing right after this one.
function machine(on: On, seed: Record<string, unknown>, afterSet: (key: string, kept: Map<string, unknown>) => void = () => undefined): Map<string, unknown> {
  const kept = new Map<string, unknown>(Object.entries(seed))
  on('session.id', async () => ({ value: THIS }) as never)
  on('store.get', async ($, e) => ({ value: kept.get(e.key) }) as never)
  on('store.set', async ($, e) => {
    kept.set(e.key, e.value)
    afterSet(e.key, kept)

    return { value: undefined } as never
  })
  on('store.delete', async ($, e) => {
    kept.delete(e.key)

    return { value: undefined } as never
  })

  return kept
}

function turns(on: On): void {
  on('turn.start', async ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', async ($, e) => ({ text: e.answer }))
}

function leaseIn(kept: Map<string, unknown>): Lease | undefined {
  return kept.get('signaller') as Lease | undefined
}

function moving(terylon: ReturnType<typeof world>): { moved: Record<string, unknown>[] } {
  const log = { moved: [] as Record<string, unknown>[] }
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), log.moved.filter(event => Number(event.seq) > Number(args.since)))

  return log
}

async function diagnostics($: Parameters<Parameters<typeof test>[1]>[0], text: string | RegExp): Promise<boolean> {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await moreWith(ui, 'fold-diagnostics')
  const found = await ui.find({ type: 'Text', text: typeof text === 'string' ? exact(text) : text })
  await ui.unmount()

  return found !== undefined
}

test('TWO INSTANCES READ THE SAME CANDIDATE IN ONE TICK: the other\'s claim lands last, so exactly one prompt is submitted', async ($, on) => {
  let otherPrompts = 0
  // THE OTHER INSTANCE took the lease in the same tick and claims the same signal right after this one wrote its claim.
  const kept = machine(on, SEEN, (key, store) => {
    const claims = store.get('claims') as Record<string, { session: string }> | undefined

    if (key === 'claims' && claims?.[CLAIM_327]?.session === THIS) {
      store.set('claims', { ...claims, [CLAIM_327]: { session: OTHER, at: WORLD_NOW } })
      otherPrompts += 1
    }
  })
  const terylon = world(on, { store: null })
  const log = moving(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)

  expect(otherPrompts).toBe(1)
  expect(terylon.prompts).toEqual([])
  expect(otherPrompts + terylon.prompts.length).toBe(1)
  expect((kept.get('claims') as Record<string, { session: string }>)[CLAIM_327]?.session).toBe(OTHER)
})

test('A SIGNAL ANOTHER INSTANCE HAS CLAIMED is not posted here, and no toast repeats it', async ($, on) => {
  machine(on, { ...SEEN, claims: { [CLAIM_327]: { session: OTHER, at: WORLD_NOW - 1000 } } })
  const terylon = world(on, { store: null })
  const log = moving(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)

  expect(terylon.prompts).toEqual([])
  expect(terylon.toasts).toEqual([])
})

test('ONE INSTANCE ALONE claims its signal and posts it once, the claim naming this session', async ($, on) => {
  const kept = machine(on, SEEN)
  const terylon = world(on, { store: null })
  const log = moving(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)

  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
  expect((kept.get('claims') as Record<string, { session: string }>)[CLAIM_327]?.session).toBe(THIS)
})

test('A CLAIM LEFT BY A SESSION THAT CLOSED lapses: after ten minutes this session posts the signal, once', async ($, on) => {
  machine(on, { ...SEEN, claims: { [CLAIM_327]: { session: OTHER, at: WORLD_NOW - 11 * 60000 } } })
  const terylon = world(on, { store: null })
  const log = moving(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)

  expect(terylon.prompts).toHaveLength(1)
})

test('THE LEASE MOVED ON DURING THIS SESSION\'S TURN: what it held is not posted here at the turn\'s end; the holder tells it', async ($, on) => {
  turns(on)
  const kept = machine(on, SEEN)
  const terylon = world(on, { store: null })
  const log = moving(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  expect(leaseIn(kept)?.session).toBe(THIS)

  await $.turn.start({ text: 'something else', turnId: 't1' })
  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toEqual([])
  expect(terylon.toasts).toEqual(['Terylon: #327 verified, waiting for merge'])

  // The owner typed in the other session: it took the lease, and holds the signal for its own turn's end.
  const now = WORLD_NOW + 30000
  kept.set('signaller', { session: OTHER, since: now, until: now + HOURS_10, seen: true })

  await $.turn.complete({ ...END, turnId: 't1' })
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  // What it held stays in the shared store for the holder.
  expect(JSON.stringify(kept.get('held'))).toContain('"story":327')
})

test('THE OWNER\'S MARK: with another session marked as Terylon\'s and holding the lease, typing here does not take it', async ($, on) => {
  const kept = machine(on, { ...SEEN, home: { session: OTHER, since: WORLD_NOW - 60000 }, signaller: { session: OTHER, since: WORLD_NOW - 60000, until: WORLD_NOW + HOURS_10, seen: true } })
  const terylon = world(on, { store: null })
  const log = moving(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  await $.prompt.submit({ text: 'how is goal 3 going?', origin: { kind: 'composer' } } as never)
  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  await terylon.clock.advance(30000)

  expect(leaseIn(kept)?.session).toBe(OTHER)
  expect(terylon.prompts.filter(prompt => prompt.startsWith('Story #327'))).toEqual([])
  expect(await diagnostics($, /^home: another \(ession-b\)$/)).toBe(true)
})

test('THE OWNER MARKS THIS SESSION as Terylon\'s from the pane: it takes the lease from a live holder and posts here, remembered in the store', async ($, on) => {
  const kept = machine(on, { ...SEEN, signaller: { session: OTHER, since: WORLD_NOW - 60000, until: WORLD_NOW + HOURS_10, seen: true } })
  const terylon = world(on, { store: null })
  const log = moving(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  expect(leaseIn(kept)?.session).toBe(OTHER)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await moreWith(ui, 'fold-diagnostics')
  await ui.press({ key: 'home-mark' })
  await ui.unmount()
  expect(kept.get('home')).toMatchObject({ session: THIS })

  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)

  expect(leaseIn(kept)?.session).toBe(THIS)
  expect(terylon.prompts.filter(prompt => prompt.startsWith('Story #327'))).toHaveLength(1)
  expect(await diagnostics($, 'home: this session')).toBe(true)
})

test('THE MARK IS TAKEN BACK from the pane: the session stops being Terylon\'s, and the store forgets it', async ($, on) => {
  const kept = machine(on, { ...SEEN, home: { session: THIS, since: WORLD_NOW - 60000 } })
  const terylon = world(on, { store: null })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await moreWith(ui, 'fold-diagnostics')
  await ui.press({ key: 'home-unmark' })
  await ui.unmount()

  expect(kept.has('home')).toBe(false)
  expect(await diagnostics($, 'home: none')).toBe(true)
})

test('/terylon-cockpit here marks this session, and "here off" takes the mark back', async ($, on) => {
  const kept = machine(on, SEEN)
  const terylon = world(on, { store: null })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  await $.command.run({ command: 'terylon-cockpit', args: 'here' } as never)
  expect(kept.get('home')).toMatchObject({ session: THIS })

  await $.command.run({ command: 'terylon-cockpit', args: 'here off' } as never)
  expect(kept.has('home')).toBe(false)
})

test('A MARKED SESSION THAT CLOSED holds nothing: its lease lapses, and an unmarked session takes it and posts', async ($, on) => {
  const kept = machine(on, { ...SEEN, home: { session: OTHER, since: WORLD_NOW - HOURS_10 }, signaller: { session: OTHER, since: WORLD_NOW - HOURS_10, until: WORLD_NOW - 1000, seen: true } })
  const terylon = world(on, { store: null })
  const log = moving(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  log.moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)

  expect(leaseIn(kept)?.session).toBe(THIS)
  expect(terylon.prompts).toHaveLength(1)
})

test('THE CATCH-UP SUMMARY ANOTHER INSTANCE CLAIMED is not posted here', async ($, on) => {
  const away = { lastSeq: 18100, lastSeenAt: WORLD_NOW - 3 * 3600000 }
  machine(on, { ...away, claims: { 'catch-up:18100': { session: OTHER, at: WORLD_NOW - 1000 } } })
  const terylon = world(on, { store: null })
  moving(terylon).moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
})

test('THE CATCH-UP SUMMARY, alone on the machine, is claimed and posted once', async ($, on) => {
  const away = { lastSeq: 18100, lastSeenAt: WORLD_NOW - 3 * 3600000 }
  const kept = machine(on, away)
  const terylon = world(on, { store: null })
  moving(terylon).moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toHaveLength(1)
  expect((kept.get('claims') as Record<string, { session: string }>)['catch-up:18100']?.session).toBe(THIS)
})

const CLAIM_OPTIONS = { lapseMs: 10 * 60000, keptMs: 24 * 3600000, most: 4 }

test('the claim table: a key another session holds is not taken, a lapsed or own one is, and the table stays bounded', () => {
  const now = WORLD_NOW
  const claims = claimsOf({
    held: { session: OTHER, at: now - 1000 },
    lapsed: { session: OTHER, at: now - 11 * 60000 },
    own: { session: THIS, at: now - 11 * 60000 },
    stale: { session: OTHER, at: now - 25 * 3600000 },
    broken: { session: 7, at: 'x' },
  })

  expect(Object.keys(claims).sort()).toEqual(['held', 'lapsed', 'own', 'stale'])

  const written = withClaims(claims, ['held', 'lapsed', 'own', 'new'], THIS, now, CLAIM_OPTIONS)

  expect(written.mine).toEqual(['lapsed', 'own', 'new'])
  expect(written.claims.held).toEqual({ session: OTHER, at: now - 1000 })
  expect(written.claims.stale).toBeUndefined()
  expect(Object.keys(written.claims).sort()).toEqual(['held', 'lapsed', 'new', 'own'])
  expect(Object.keys(withClaims(written.claims, ['newer'], THIS, now + 1, CLAIM_OPTIONS).claims).sort()).toEqual(['lapsed', 'new', 'newer', 'own'])
})

test('the claims a store kept in another shape read as none', () => {
  expect(claimsOf(null)).toEqual({})
  expect(claimsOf(['327:verified:1'])).toEqual({})
  expect(claimsOf('claims')).toEqual({})
})
