// TERYLON RESET TO FACTORY DEFAULTS: its store is empty, its event log has a new epoch and its sequence begins again
// from 1. The pane starts over when Terylon says reset, when the epochs it knows differ, or, from a server that names
// no epoch, when the head is below the since: it goes on from the new epoch and head, tells nothing of the old history
// and forgets the signals told for stories that no longer exist. A gap within one epoch keeps its own meaning.

import { test, expect } from 'claude-code/testing'

import { HOUR, PANE_PROPS, SESSION, events, exact, refusal, storyMoved, world } from './fixtures'

const OLD_SEQ = 2483
const NEW_HEAD = 5
const OLD_EPOCH = '7d1c2f0e-0000-4000-8000-000000000001'
const NEW_EPOCH = '7d1c2f0e-0000-4000-8000-000000000002'

// The signal the pane told for story 327 before the reset: the same id and commit come again after it.
const OLD_SIGNAL = '327:verified:4be21c0aaaa'

const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { top: 0, bodyRows: 3 }, view: {} }

// How Terylon answers a client out of its log: today's server names no epoch and answers a since above its head with
// no events and no gap; S48 answers it, and a client of another epoch, with a gap at its head, `reset` where it says one.
type Shape = 'today' | 'gap' | 'reset' | 'reset-only'

type Log = { epoch: string; head: number; moved: Record<string, unknown>[] }

function serve(terylon: ReturnType<typeof world>, shape: Shape, log: Log): void {
  terylon.answers.events_since = (args: Record<string, unknown>) => {
    const since = Number(args.since)
    const head = Math.max(log.head, ...log.moved.map(event => Number(event.seq)))

    if (shape === 'today') {
      return since > head ? events(since, [], head) : events(since, log.moved.filter(event => Number(event.seq) > since), head)
    }

    const isOther = (args.epoch !== undefined && args.epoch !== log.epoch) || since > head

    if (isOther) {
      return { epoch: log.epoch, events: [], since, last: head, more: false, head, gap: shape !== 'reset-only', ...(shape === 'gap' ? {} : { reset: true }) }
    }

    return { ...events(since, log.moved.filter(event => Number(event.seq) > since), head), epoch: log.epoch }
  }
}

function eventsCalls(terylon: ReturnType<typeof world>): Record<string, unknown>[] {
  return terylon.calls.filter(call => call.tool === 'events_since').map(call => call.args)
}

function resetLines(terylon: ReturnType<typeof world>): string[] {
  return terylon.logs.filter(log => log.to === 'debug' && log.text.includes('was reset')).map(log => log.text)
}

async function bandText($: Parameters<Parameters<typeof test>[1]>[0]): Promise<string | undefined> {
  const band = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: BAND_PROPS as never })
  const found = await band.find({ type: 'Text', text: /^(Terylon started over|Missed too much|summary of)/ })
  await band.unmount()

  return found?.text
}

for (const shape of ['today', 'gap', 'reset', 'reset-only'] as const) {
  test(`A RESET answered in the ${shape} shape: the pane starts over, and the next event at seq 6 posts its signal`, async ($, on) => {
    const stored = { lastSeq: OLD_SEQ, lastSeenAt: Date.parse('2026-10-11T21:59:00Z'), signalled: [OLD_SIGNAL], ...(shape === 'today' ? {} : { epoch: OLD_EPOCH }) }
    const terylon = world(on, { store: stored })
    const log: Log = { epoch: NEW_EPOCH, head: NEW_HEAD, moved: [] }
    serve(terylon, shape, log)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    // Nothing is told for the reset itself, and it is said once.
    expect(terylon.prompts).toEqual([])
    expect(terylon.toasts).toEqual([])
    expect(resetLines(terylon)).toEqual([`terylon-pane: events: Terylon's history was reset (asked from ${OLD_SEQ}, its head is ${NEW_HEAD}); starting over`])
    expect(await bandText($)).toBe(`Terylon started over · its history was reset; the pane goes on from event ${NEW_HEAD}, nothing before is caught up`)

    // The pane reads from the new head, and in the new epoch where Terylon names one.
    await terylon.clock.advance(30000)
    expect(eventsCalls(terylon).at(-1)).toEqual(shape === 'today' ? { since: NEW_HEAD, limit: 500 } : { since: NEW_HEAD, epoch: NEW_EPOCH, limit: 500 })
    expect(resetLines(terylon)).toHaveLength(1)

    // Story 327 of the new history, at the old one's id and commit: its signal is new, not one told before.
    log.moved = [storyMoved(6, 327, 'Events since the last look', 'verified')]
    await terylon.clock.advance(30000)
    expect(terylon.prompts).toHaveLength(1)
    expect(terylon.prompts[0]).toStartWith('Story #327')
    expect(terylon.toasts).toEqual(['Terylon: #327 verified, waiting for merge'])

    // Told once.
    await terylon.clock.advance(30000)
    expect(terylon.prompts).toHaveLength(1)
  })
}

test('A CHANGED EPOCH with the head at or above the since is a reset, though Terylon says only a gap', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 3, epoch: OLD_EPOCH, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
  serve(terylon, 'gap', { epoch: NEW_EPOCH, head: 40, moved: [] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(eventsCalls(terylon)[0]).toEqual({ since: 3, epoch: OLD_EPOCH, limit: 500 })
  expect(terylon.prompts).toEqual([])
  expect(resetLines(terylon)).toHaveLength(1)
  expect(await bandText($)).toStartWith('Terylon started over')

  await terylon.clock.advance(30000)
  expect(eventsCalls(terylon).at(-1)).toEqual({ since: 40, epoch: NEW_EPOCH, limit: 500 })
})

test('A ROLLBACK to the earlier epoch is a reset too: the epoch differs from the one the pane knows', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 12, epoch: NEW_EPOCH, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
  serve(terylon, 'reset', { epoch: OLD_EPOCH, head: 3000, moved: [] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  expect(resetLines(terylon)).toEqual([`terylon-pane: events: Terylon's history was reset (asked from 12, its head is 3000); starting over`])

  await terylon.clock.advance(30000)
  expect(eventsCalls(terylon).at(-1)).toEqual({ since: 3000, epoch: OLD_EPOCH, limit: 500 })
})

test('RESET ALONE, its head at or above the since and no gap, starts over', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 3, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
  terylon.answers.events_since = (args: Record<string, unknown>) => ({ events: [], since: Number(args.since), last: 9, more: false, head: 9, gap: false, reset: true })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  expect(resetLines(terylon)).toHaveLength(1)
  expect(await bandText($)).toStartWith('Terylon started over')
})

test('RESET AND GAP in one answer: the reset wins, and the catch-up on start posts no summary of the old history', async ($, on) => {
  const now = Date.parse('2026-10-12T09:40:00Z')
  const terylon = world(on, { now, store: { lastSeq: OLD_SEQ, epoch: OLD_EPOCH, lastSeenAt: now - 14 * HOUR } })
  serve(terylon, 'reset', { epoch: NEW_EPOCH, head: NEW_HEAD, moved: [storyMoved(3, 341, 'S10a cleanup', 'merged', 'merged')] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  expect(await bandText($)).toStartWith('Terylon started over')

  // The events at or below the new head are of the new history before the pane's look: not told either.
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toEqual([])
})

test("THE CATCH-UP ON START AFTER A RESET from today's server posts no summary of the old history", async ($, on) => {
  const now = Date.parse('2026-10-12T09:40:00Z')
  const terylon = world(on, { now, store: { lastSeq: OLD_SEQ, lastSeenAt: now - 14 * HOUR } })
  serve(terylon, 'today', { epoch: NEW_EPOCH, head: NEW_HEAD, moved: [storyMoved(3, 341, 'S10a cleanup', 'merged', 'merged')] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  expect(await bandText($)).toStartWith('Terylon started over')
})

for (const epoch of [OLD_EPOCH, null]) {
  test(`AN ORDINARY GAP ${epoch === null ? 'with no epoch' : 'in the same epoch'}, its head at or above the since, still says the history is too long`, async ($, on) => {
    const terylon = world(on, { store: { lastSeq: 1000, lastSeenAt: Date.parse('2026-10-11T21:59:00Z'), ...(epoch === null ? {} : { epoch }) } })
    terylon.answers.events_since = (args: Record<string, unknown>) => ({ events: [], since: Number(args.since), last: 9000, more: false, head: 9000, gap: true, ...(epoch === null ? {} : { epoch }) })
    await $.session.start(SESSION)
    await terylon.clock.settle()

    expect(terylon.prompts).toEqual([])
    expect(resetLines(terylon)).toEqual([])
    expect(await bandText($)).toStartWith('Missed too much')

    await terylon.clock.advance(30000)
    expect(eventsCalls(terylon).at(-1)).toEqual(epoch === null ? { since: 9000, limit: 500 } : { since: 9000, epoch, limit: 500 })
  })
}

test('THE EPOCH IS SENT ONCE KNOWN: from the first look, and from a read that names it first', async ($, on) => {
  const terylon = world(on)
  serve(terylon, 'gap', { epoch: NEW_EPOCH, head: 18100, moved: [] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  // The first look asks for the head with no epoch, and keeps the one it is told.
  expect(eventsCalls(terylon)).toEqual([{ since: 0, limit: 1 }])
  await terylon.clock.advance(30000)
  expect(eventsCalls(terylon).at(-1)).toEqual({ since: 18100, epoch: NEW_EPOCH, limit: 500 })
})

test('an epoch named first by an ordinary read is kept and sent from the next', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
  serve(terylon, 'gap', { epoch: NEW_EPOCH, head: 18100, moved: [] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(eventsCalls(terylon)).toEqual([{ since: 18100, limit: 500 }])
  expect(resetLines(terylon)).toEqual([])
  await terylon.clock.advance(30000)
  expect(eventsCalls(terylon).at(-1)).toEqual({ since: 18100, epoch: NEW_EPOCH, limit: 500 })
})

for (const head of [null, '5', undefined]) {
  test(`A HEAD THAT IS NO NUMBER (${String(head)}) is no reset: the pane keeps its place and tells the next event`, async ($, on) => {
    const terylon = world(on, { store: { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
    let moved: Record<string, unknown>[] = []
    terylon.answers.events_since = (args: Record<string, unknown>) => ({ ...events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since))), head })
    await $.session.start(SESSION)
    await terylon.clock.settle()

    expect(resetLines(terylon)).toEqual([])
    moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
    await terylon.clock.advance(30000)
    expect(eventsCalls(terylon).at(-1)).toEqual({ since: 18100, limit: 500 })
    expect(terylon.prompts).toHaveLength(1)
    expect(terylon.prompts[0]).toStartWith('Story #327')
  })
}

for (const stored of ['', '   ', 42, null]) {
  test(`A STORED EPOCH OF ${JSON.stringify(stored)} is none known: the first real epoch is adopted silently, never a reset`, async ($, on) => {
    const terylon = world(on, { store: { lastSeq: 18100, epoch: stored, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
    serve(terylon, 'reset', { epoch: NEW_EPOCH, head: 18100, moved: [] })
    await $.session.start(SESSION)
    await terylon.clock.settle()

    expect(eventsCalls(terylon)).toEqual([{ since: 18100, limit: 500 }])
    expect(resetLines(terylon)).toEqual([])
    expect(await bandText($)).toBeUndefined()

    await terylon.clock.advance(30000)
    expect(eventsCalls(terylon).at(-1)).toEqual({ since: 18100, epoch: NEW_EPOCH, limit: 500 })
  })
}

for (const stored of [undefined, '']) {
  test(`NO BLANK EPOCH IS WRITTEN${stored === '' ? ', and one an earlier version wrote is deleted' : ''}: unknown is an absent key`, async ($, on) => {
    // The store answered by the test, so that every write and delete is seen.
    const kept = new Map<string, unknown>([['lastSeq', 18100], ['lastSeenAt', Date.parse('2026-10-11T21:59:00Z')]])
    if (stored !== undefined) {
      kept.set('epoch', stored)
    }
    const written: { key: string; value: unknown }[] = []
    on('store.get', async ($_, e) => ({ value: kept.get(e.key) }) as never)
    on('store.set', async ($_, e) => {
      kept.set(e.key, e.value)
      written.push({ key: e.key, value: e.value })
      return { value: undefined } as never
    })
    on('store.delete', async ($_, e) => {
      kept.delete(e.key)
      return { value: undefined } as never
    })
    const terylon = world(on, { store: null })
    await $.session.start(SESSION)
    await terylon.clock.settle()
    await terylon.clock.advance(30000)

    expect(written.some(entry => entry.key === 'lastSeq')).toBe(true)
    expect(written.filter(entry => entry.key === 'epoch')).toEqual([])
    expect(kept.has('epoch')).toBe(false)
    expect(resetLines(terylon)).toEqual([])
  })
}

// AN EPOCH TERYLON CANNOT READ: events_since refuses it with a 400 on every tick it is sent, so the pane forgets it
// and starts over as on a reset; any other refusal keeps the epoch and says what failed.
const EPOCH_REFUSED = "'epoch' is the log's identity as an earlier answer gave it."
const BAD_EPOCH = 'not-a-guid'
const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

function refusing(terylon: ReturnType<typeof world>, other: Record<string, unknown> | null, log: { head: number; moved: Record<string, unknown>[] }): void {
  terylon.answers.events_since = (args: Record<string, unknown>) => {
    if (args.epoch === BAD_EPOCH) {
      return other ?? refusal(EPOCH_REFUSED, 400)
    }

    const since = Number(args.since)

    return { ...events(since, log.moved.filter(event => Number(event.seq) > since), log.head), epoch: NEW_EPOCH }
  }
}

test('A REFUSED EPOCH is forgotten: the pane starts over, the next tick asks for the head with no epoch, and the done-signal works again', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 18100, epoch: BAD_EPOCH, signalled: [OLD_SIGNAL], lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
  const log = { head: 18120, moved: [] as Record<string, unknown>[] }
  refusing(terylon, null, log)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(eventsCalls(terylon)).toEqual([{ since: 18100, epoch: BAD_EPOCH, limit: 500 }])
  expect(terylon.prompts).toEqual([])
  expect(terylon.toasts).toEqual([])
  expect(terylon.logs.filter(entry => entry.to === 'debug' && entry.text.includes('refused the epoch')).map(entry => entry.text)).toEqual([`terylon-pane: events: Terylon refused the epoch ${BAD_EPOCH} (asked from 18100); starting over from its head`])
  expect(await bandText($)).toBe("Terylon started over · it refused the epoch the pane kept; the pane goes on from Terylon's head, nothing before is caught up")

  // A start over, not a failure: the Status tab names no stopped done-signal.
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ type: 'Text', text: exact('⚠ The done-signal stopped') })).toBeUndefined()
  await ui.unmount()

  // The next tick reads the head with no epoch and tells nothing; the one after sends the epoch it was told.
  log.moved = [storyMoved(18110, 341, 'S10a cleanup', 'merged', 'merged')]
  await terylon.clock.advance(30000)
  expect(eventsCalls(terylon).at(-1)).toEqual({ since: 0, limit: 1 })
  expect(terylon.prompts).toEqual([])
  await terylon.clock.advance(30000)
  expect(eventsCalls(terylon).at(-1)).toEqual({ since: 18120, epoch: NEW_EPOCH, limit: 500 })

  // Story 327 at the commit told before: the signals told before were forgotten, so it is told again, once.
  log.moved = [storyMoved(18121, 327, 'Events since the last look', 'verified')]
  log.head = 18121
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)
})

for (const other of [refusal('The leader is not answering.', 503), refusal("'limit' is 1 to 500.", 400)]) {
  test(`ANY OTHER REFUSAL of events_since (${String(other.refused)}) keeps the epoch and says the done-signal stopped`, async ($, on) => {
    const terylon = world(on, { store: { lastSeq: 18100, epoch: BAD_EPOCH, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
    refusing(terylon, other, { head: 18120, moved: [] })
    await $.session.start(SESSION)
    await terylon.clock.settle()
    await terylon.clock.advance(30000)

    expect(eventsCalls(terylon)).toEqual([{ since: 18100, epoch: BAD_EPOCH, limit: 500 }, { since: 18100, epoch: BAD_EPOCH, limit: 500 }])
    expect(await bandText($)).toBeUndefined()

    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    await ui.press({ key: 'tab-status' })
    expect(await ui.find({ type: 'Text', text: exact('⚠ The done-signal stopped') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact(`Reason: ${String(other.refused)}`) })).toBeDefined()
  })
}
