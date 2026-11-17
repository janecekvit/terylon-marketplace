// THE OWNER'S WALK OF 1.2.2 (2026-10-25): #87's header said "running 75 h 46 min" beside its blocked chip. A blocked
// story is not running: its header names the time by its state, how long it has been blocked, from blockedFrom, else
// from its last update.

import { test, expect } from 'claude-code/testing'

import { settleCandidate, signalFor } from '../hooks/signals'
import type { Candidate } from '../hooks/signals'
import { FLIGHT, PANE_PROPS, SESSION, STORY_333, events, exact, storyMoved, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

function blockedFlight(fields: Record<string, unknown>): typeof FLIGHT {
  return { ...FLIGHT, stories: FLIGHT.stories.map(story => (story.id === 333 ? { ...story, state: 'blocked', ...fields } : story)) }
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: a blocked story's header says how long it has been blocked, never that it is running`, async ($, on) => {
    const terylon = world(on)
    // The world's clock is at 22:00; the run started at 10:00 and was blocked at 20:00.
    terylon.answers.work_in_flight = blockedFlight({ blockedFrom: '2026-10-11T20:00:00Z' })
    terylon.answers.story_get = { ...STORY_333, state: 'blocked' }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'story-333' })

    expect((await ui.find({ type: 'Text', text: exact('blocked for 2 h') }))?.props.tabular).toBe(true)
    expect(await ui.find({ type: 'Text', text: /running \d+ h/ })).toBeUndefined()
    await ui.unmount()
  })
}

test('a blocked story with no blockedFrom is timed from its last update', async ($, on) => {
  const terylon = world(on)
  terylon.answers.work_in_flight = blockedFlight({ updatedAt: '2026-10-11T21:30:00Z' })
  terylon.answers.story_get = { ...STORY_333, state: 'blocked' }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-333' })

  expect(await ui.find({ type: 'Text', text: exact('blocked for 30 min') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /running \d+ h/ })).toBeUndefined()
})

// THE BLOCKED SIGNAL NAMES ITS REASON: story_get, read right before the post, carries it as blockedReason, so the
// prompt says it and asks only for what the story needs from the owner.
const SEEN = { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') }
const REASON = 'It needs your choice of how long to keep the logs.'

function blockedStory(fields: Record<string, unknown>) {
  return (args: Record<string, unknown>) => ({ id: args.story, goal: 3, title: 'x', state: args.story === 344 ? 'blocked' : 'merged', timeline: [], ...(args.story === 344 ? fields : {}) })
}

test("a blocked story's signal names its reason and asks only what it needs from the owner", async ($, on) => {
  const terylon = world(on, { store: SEEN })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 344, 'Blocked one', 'blocked')])
  terylon.answers.story_get = blockedStory({ blockedReason: REASON })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([`Story #344 „Blocked one“ je zablokovaná: ${REASON} Shrň mi, co potřebuje ode mě.`])
  expect(terylon.toasts).toEqual(['Terylon: #344 blocked'])
})

test('a blocked story with no reason is signalled as before, asking why', async ($, on) => {
  const terylon = world(on, { store: SEEN })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 344, 'Blocked one', 'blocked')])
  terylon.answers.story_get = blockedStory({})
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual(['Story #344 „Blocked one“ je zablokovaná. Shrň mi proč a co potřebuje ode mě.'])
})

test("in a summary of several, a blocked story's line carries its reason", async ($, on) => {
  const terylon = world(on, { store: SEEN })
  terylon.answers.events_since = (args: Record<string, unknown>) =>
    events(Number(args.since), Number(args.since) >= 18102 ? [] : [storyMoved(18101, 341, 'S10a cleanup', 'merged', 'merged'), storyMoved(18102, 344, 'Blocked one', 'blocked')])
  terylon.answers.story_get = blockedStory({ blockedReason: REASON })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]?.split('\n')).toContain(`- Story #344 „Blocked one“ je zablokovaná: ${REASON}`)
  expect(terylon.prompts[0]?.split('\n').at(-1)).toBe('Shrň mi to a u každé, která čeká na mě, co od ní potřebuju udělat.')
})

test("the reason is the story's own as read now, one line, ending as it ends", () => {
  const blocked: Candidate = { story: 344, kind: 'blocked', seq: 1, title: 'Blocked one', pullRequest: null, reason: null }
  const told = (candidate: Candidate | null) => (candidate === null ? null : signalFor(candidate, null).prompt)

  // A reason over several lines is one line, and a question keeps its own end.
  expect(told(settleCandidate(blocked, { id: 344, state: 'blocked', blockedReason: 'Two retentions fit:\n  30 days or 90 days.\nWhich one?' })))
    .toBe('Story #344 „Blocked one“ je zablokovaná: Two retentions fit: 30 days or 90 days. Which one? Shrň mi, co potřebuje ode mě.')
  expect(told(settleCandidate(blocked, { id: 344, state: 'blocked', blockedReason: 'stopped by you' })))
    .toBe('Story #344 „Blocked one“ je zablokovaná: stopped by you. Shrň mi, co potřebuje ode mě.')

  // What story_get says now stands over a reason an earlier read kept; with no answer, the kept one stands.
  expect(settleCandidate({ ...blocked, reason: 'a test failed' }, { id: 344, state: 'blocked', blockedReason: REASON })?.reason).toBe(REASON)
  expect(settleCandidate({ ...blocked, reason: 'a test failed' }, null)?.reason).toBe('a test failed')
  expect(settleCandidate(blocked, { id: 344, state: 'blocked', blockedReason: '   ' })?.reason).toBeNull()
})
