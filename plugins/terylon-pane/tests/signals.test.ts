import { test, expect } from 'claude-code/testing'

import { HOUR, SESSION, events, storyMoved, world } from './fixtures'

const SEEN = { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') }

test('THE DONE-SIGNAL: a story verified is posted into the session once, with its commit, and a toast', async ($, on) => {
  const terylon = world(on, { store: SEEN })
  let moved = [storyMoved(18101, 327, 'A client follows the leader by the events since its last look', 'verified')]
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => event.seq > Number(args.since)))
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([
    'Story #327 „A client follows the leader by the events since its last look“ je ověřená v pr-196 a čeká na merge (PR 196, commit 4be21c0). Shrň mi důkazy a co mám proklikat.',
  ])
  expect(terylon.toasts).toEqual(['Terylon: #327 ověřená, čeká na merge'])

  // The next poll reads from the new sequence: nothing new, nothing posted again.
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)

  // The same story verified again at the same commit is the same signal; a new commit is a new one.
  moved = [...moved, storyMoved(18150, 327, 'A client follows the leader by the events since its last look', 'verified')]
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)

  terylon.answers.story_get = { id: 327, title: 'x', pullRequest: { id: 196 }, verdict: { commit: '9d0e111', environment: 'pr-196' } }
  moved = [...moved, storyMoved(18160, 327, 'A client follows the leader by the events since its last look', 'verified')]
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(2)
  expect(terylon.prompts[1]).toContain('commit 9d0e111')
})

test('merged, accepted, abandoned, blocked and stuck are signalled; nothing else is', async ($, on) => {
  const terylon = world(on, { store: SEEN })
  terylon.answers.events_since = (args: Record<string, unknown>) =>
    events(Number(args.since), Number(args.since) >= 18106 ? [] : [
      storyMoved(18101, 341, 'S10a cleanup', 'merged', 'merged'),
      storyMoved(18102, 342, 'Accepted one', 'merged', 'accepted'),
      storyMoved(18103, 343, 'Dropped one', 'abandoned', 'abandoned'),
      storyMoved(18104, 344, 'Blocked one', 'blocked'),
      storyMoved(18105, 345, 'Running one', 'running'),
      { seq: 18106, type: 'PlanProposed', about: 'plan', subject: 'plan/41', plan: 41 },
    ])
  terylon.answers.work_in_flight = { slots: 4, paused: false, stories: [{ id: 333, title: 'Direct dispatch', state: 'running', costUsd: 1, stuck: { since: '2026-10-11T21:00:00Z', reason: 'no output for 30 minutes' } }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts.map(prompt => prompt.slice(0, 30))).toEqual([
    'Story #341 „S10a cleanup“ je m',
    'Story #342 „Accepted one“ je p',
    'Story #343 „Dropped one“ je op',
    'Story #344 „Blocked one“ je za',
    'Story #333 „Direct dispatch“ s',
  ])
  expect(terylon.prompts[4]).toContain('no output for 30 minutes')

  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(5)
})

test('the very first look starts from now and tells nothing of the past', async ($, on) => {
  const terylon = world(on)
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), [storyMoved(17000, 300, 'Old', 'merged', 'merged')], 18200)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  expect(terylon.calls.filter(call => call.tool === 'events_since')[0]?.args).toEqual({ since: 0, limit: 1 })
})

test('THE CATCH-UP: back after 14 h, ONE summary in the order done, waiting, running, stuck, spend, and a band', async ($, on) => {
  const now = Date.parse('2026-10-12T09:40:00Z')
  const terylon = world(on, { now, store: { lastSeq: 18100, lastSeenAt: now - 14 * HOUR } })
  terylon.answers.events_since = (args: Record<string, unknown>) =>
    events(Number(args.since), Number(args.since) >= 18103 ? [] : [
      storyMoved(18101, 341, 'S10a cleanup', 'merged', 'merged'),
      storyMoved(18102, 327, 'Events since the last look', 'verified'),
      storyMoved(18103, 326, 'S1', 'merged', 'merged'),
    ])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toHaveLength(1)
  const summary = terylon.prompts[0] ?? ''
  expect(summary).toStartWith('Terylon, zatímco byl počítač vypnutý (14 h, 3 změn)')
  const order = ['**Hotovo:**', '**Čeká na tebe:**', '**Běží:**', '**Zadrhlo se:**', '**Útrata:**'].map(label => summary.indexOf(label))
  expect(order).toEqual([...order].sort((left, right) => left - right))
  expect(summary).toContain('#341 mergnutá · #326 mergnutá')
  expect(summary).toContain('#327 ověřená (merge) · plán 41, 3 story (schválení) · otázka 9')
  expect(summary).toContain('#333 krok 5/9 · #329 ověřuje se')
  expect(summary).not.toContain('Má mrtvý běh')

  // The signals of the gap are inside the summary, never posted on their own after it.
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.toasts).toEqual([])

  const band = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { top: 0, bodyRows: 3 }, view: {} } as never })
  expect(await band.find({ type: 'Text', text: 'Souhrn 14 h vložen · 3 věci čekají na tebe' })).toBeDefined()
  await band.press({ key: 'band-hide' })
})

test('a short absence is no summary: the signals come one by one', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:00:00Z') } })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 341, 'S10a cleanup', 'merged', 'merged')])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #341')
})

test('more than 2 000 events behind: no summary, no signals, a band that links the console', async ($, on) => {
  const now = Date.parse('2026-10-22T09:40:00Z')
  const terylon = world(on, { now, store: { lastSeq: 1000, lastSeenAt: now - 11 * 24 * HOUR } })
  terylon.answers.events_since = (args: Record<string, unknown>) => {
    const since = Number(args.since)
    const page = Array.from({ length: 500 }, (_, index) => storyMoved(since + index + 1, 400 + index, 'Many', 'merged', 'merged'))

    return { events: page, since, last: since + 500, more: true, head: 9000, gap: false }
  }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  const band = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { top: 0, bodyRows: 3 }, view: {} } as never })
  expect(await band.find({ type: 'Text', text: /ZMEŠKÁNO PŘÍLIŠ MOC/ })).toBeDefined()
  expect((await band.find({ type: 'Link' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=history')

  await terylon.clock.advance(30000)
  expect(terylon.prompts).toEqual([])
})
