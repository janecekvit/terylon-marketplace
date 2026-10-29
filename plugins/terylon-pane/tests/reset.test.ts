// TERYLON RESET TO FACTORY DEFAULTS: its store is empty and its event sequence begins again from 1. A head below the
// since the pane asks from means start over: go on from the head, tell nothing of the old history, and forget the
// signals told for stories that no longer exist. A gap with a head at or above the since keeps its own meaning.

import { test, expect } from 'claude-code/testing'

import { HOUR, SESSION, events, storyMoved, world } from './fixtures'

const OLD_SEQ = 2483
const NEW_HEAD = 5

// The signal the pane told for story 327 before the reset: the same id and commit come again after it.
const OLD_SIGNAL = '327:verified:4be21c0aaaa'

const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { top: 0, bodyRows: 3 }, view: {} }

type Shape = 'today' | 's48'

// Terylon after its reset: `moved` above the head it has now, and for a since above that head the answer of `shape`.
function resetTerylon(terylon: ReturnType<typeof world>, shape: Shape, moved: () => Record<string, unknown>[]): void {
  terylon.answers.events_since = (args: Record<string, unknown>) => {
    const since = Number(args.since)
    const list = moved()
    const head = Math.max(NEW_HEAD, ...list.map(event => Number(event.seq)))

    if (since > head) {
      // Today's server: last is the since, no events, no gap. S48's: a gap, and last at the head.
      return shape === 'today' ? events(since, [], head) : { events: [], since, last: head, more: false, head, gap: true }
    }

    return events(since, list.filter(event => Number(event.seq) > since), head)
  }
}

function eventsLogs(terylon: ReturnType<typeof world>): string[] {
  return terylon.logs.filter(log => log.to === 'debug' && log.text.startsWith('terylon-pane: events:')).map(log => log.text)
}

for (const shape of ['today', 's48'] as const) {
  test(`A RESET, answered as ${shape === 'today' ? "today's server" : 'S48'} answers it: the pane starts over, and the next event at seq 6 posts its signal`, async ($, on) => {
    const terylon = world(on, { store: { lastSeq: OLD_SEQ, lastSeenAt: Date.parse('2026-10-11T21:59:00Z'), signalled: [OLD_SIGNAL] } })
    let moved: Record<string, unknown>[] = []
    resetTerylon(terylon, shape, () => moved)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    // Nothing is told for the reset itself, and it is said once.
    expect(terylon.prompts).toEqual([])
    expect(terylon.toasts).toEqual([])
    expect(eventsLogs(terylon).filter(line => line.includes('went back'))).toEqual([
      `terylon-pane: events: Terylon's sequence went back from ${OLD_SEQ} to ${NEW_HEAD}; starting over`,
    ])
    const band = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: BAND_PROPS as never })
    expect(await band.find({ type: 'Text', text: `Terylon started over · its events went back from ${OLD_SEQ} to ${NEW_HEAD}; nothing before is caught up` })).toBeDefined()
    await band.unmount()

    // The pane reads from the new head.
    await terylon.clock.advance(30000)
    expect(terylon.calls.filter(call => call.tool === 'events_since').at(-1)?.args).toEqual({ since: NEW_HEAD, limit: 500 })
    expect(eventsLogs(terylon).filter(line => line.includes('went back'))).toHaveLength(1)

    // Story 327 of the new history, at the old one's id and commit: its signal is new, not one told before.
    moved = [storyMoved(6, 327, 'Events since the last look', 'verified')]
    await terylon.clock.advance(30000)
    expect(terylon.prompts).toHaveLength(1)
    expect(terylon.prompts[0]).toStartWith('Story #327')
    expect(terylon.toasts).toEqual(['Terylon: #327 verified, waiting for merge'])

    // Told once.
    await terylon.clock.advance(30000)
    expect(terylon.prompts).toHaveLength(1)
  })
}

test('THE CATCH-UP ON START AFTER A RESET posts no summary of the old history', async ($, on) => {
  const now = Date.parse('2026-10-12T09:40:00Z')
  const terylon = world(on, { now, store: { lastSeq: OLD_SEQ, lastSeenAt: now - 14 * HOUR } })
  resetTerylon(terylon, 'today', () => [storyMoved(3, 341, 'S10a cleanup', 'merged', 'merged')])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  const band = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: BAND_PROPS as never })
  expect(await band.find({ type: 'Text', text: /^Terylon started over/ })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /summary of/ })).toBeUndefined()

  // The events at or below the new head are of the new history before the pane's look: not told either.
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toEqual([])
})

test('AN ORDINARY GAP, its head at or above the since, still says the history is too long, and starts nothing over', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 1000, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
  terylon.answers.events_since = (args: Record<string, unknown>) => ({ events: [], since: Number(args.since), last: 9000, more: false, head: 9000, gap: true })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  expect(eventsLogs(terylon).some(line => line.includes('went back'))).toBe(false)
  const band = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: BAND_PROPS as never })
  expect(await band.find({ type: 'Text', text: /Missed too much/ })).toBeDefined()
  await band.unmount()

  await terylon.clock.advance(30000)
  expect(terylon.calls.filter(call => call.tool === 'events_since').at(-1)?.args).toEqual({ since: 9000, limit: 500 })
})

for (const head of [null, '5', undefined]) {
  test(`A HEAD THAT IS NO NUMBER (${String(head)}) is no reset: the pane keeps its place and tells the next event`, async ($, on) => {
    const terylon = world(on, { store: { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
    let moved: Record<string, unknown>[] = []
    terylon.answers.events_since = (args: Record<string, unknown>) => ({ ...events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since))), head })
    await $.session.start(SESSION)
    await terylon.clock.settle()

    expect(eventsLogs(terylon).some(line => line.includes('went back'))).toBe(false)
    moved = [storyMoved(18101, 327, 'Events since the last look', 'verified')]
    await terylon.clock.advance(30000)
    expect(terylon.calls.filter(call => call.tool === 'events_since').at(-1)?.args).toEqual({ since: 18100, limit: 500 })
    expect(terylon.prompts).toHaveLength(1)
    expect(terylon.prompts[0]).toStartWith('Story #327')
  })
}
