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
