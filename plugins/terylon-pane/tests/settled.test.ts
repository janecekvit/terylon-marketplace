// THE DONE-SIGNAL TELLS WHAT IS TRUE AT THE POST: in Desktop, with repeating tasks finishing runs within seconds, the
// pane asked for Accept on stories already accepted and called a story blocked after its goal was dropped, one prompt
// per signal, one turn each. Each story's latest move alone is told, read again with story_get right before the post,
// and several of one read are one summary.

import { test, expect } from 'claude-code/testing'

import { coalesce, settleCandidate, signalFor, signalsSummary } from '../hooks/signals'
import type { Candidate } from '../hooks/signals'

import { SESSION, events, storyMoved, world } from './fixtures'

const SEEN = { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') }

// A run of a repeating task, kept in Terylon's own list and accepted by the leader the moment it was verified.
function autoAccepted(id: number) {
  return { id, goal: { id: 35, state: 'active' }, title: `TEST S43: sum the amounts · run ${id - 124}`, state: 'merged', target: 'list', autoAccept: true, timeline: [] }
}

function accepted(seq: number, story: number) {
  return { ...storyMoved(seq, story, `TEST S43: sum the amounts · run ${story - 124}`, 'merged', 'accepted'), pullRequest: null }
}

function verified(seq: number, story: number) {
  return { ...storyMoved(seq, story, `TEST S43: sum the amounts · run ${story - 124}`, 'verified'), pullRequest: null }
}

test("GOAL 35 AS IT HAPPENED: three runs auto-accepted and one blocked twice then abandoned are one summary, with no Accept asked and nothing called blocked", async ($, on) => {
  const terylon = world(on, { store: SEEN })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18109 ? [] : [
    verified(18101, 125), accepted(18102, 125),
    verified(18103, 126), accepted(18104, 126),
    verified(18105, 127), accepted(18106, 127),
    storyMoved(18107, 128, 'TEST S43: sum the amounts · run 4', 'blocked'),
    storyMoved(18108, 128, 'TEST S43: sum the amounts · run 4', 'blocked'),
    storyMoved(18109, 128, 'TEST S43: sum the amounts · run 4', 'abandoned', 'abandoned'),
  ])
  terylon.answers.story_get = (args: Record<string, unknown>) =>
    args.story === 128 ? { id: 128, goal: { id: 35, state: 'dropped' }, title: 'TEST S43: sum the amounts · run 4', state: 'abandoned', timeline: [] } : autoAccepted(Number(args.story))
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]?.split('\n')).toEqual([
    'Terylon: od posledního pohledu se pohnulo 4 story:',
    '- Story #125 „TEST S43: sum the amounts · run 1“ je přijatá bez merge.',
    '- Story #126 „TEST S43: sum the amounts · run 2“ je přijatá bez merge.',
    '- Story #127 „TEST S43: sum the amounts · run 3“ je přijatá bez merge.',
    '- Story #128 „TEST S43: sum the amounts · run 4“ je opuštěná.',
    '',
    'Shrň mi to.',
  ])
  expect(terylon.prompts[0]).not.toContain('Accept')
  expect(terylon.prompts[0]).not.toContain('zablokovaná')
  expect(terylon.toasts).toEqual(['Terylon: 4 stories moved'])

  await terylon.clock.advance(30000)
  expect(terylon.prompts).toHaveLength(1)
})

test('VERIFIED IN ONE READ, ACCEPTED BEFORE THE POST: no Accept is asked; the next read tells it accepted, once', async ($, on) => {
  const terylon = world(on, { store: SEEN })
  let moved: Record<string, unknown>[] = [verified(18101, 125)]
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since)))
  terylon.answers.story_get = (args: Record<string, unknown>) => autoAccepted(Number(args.story))
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  expect(terylon.logs.some(log => log.to === 'debug' && log.text === 'terylon-pane: events: not posting 125:verified: the story is merged now')).toBe(true)

  moved = [...moved, accepted(18102, 125)]
  await terylon.clock.advance(30000)
  expect(terylon.prompts).toEqual(['Story #125 „TEST S43: sum the amounts · run 1“ je přijatá bez merge. Shrň mi, s čím byla přijata.'])
  expect(terylon.toasts).toEqual(['Terylon: #125 accepted'])
})

test('UNDER A DROPPED GOAL nothing asks anything: a story still blocked, or still verified, posts nothing', async ($, on) => {
  const terylon = world(on, { store: SEEN })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18102 ? [] : [
    storyMoved(18101, 130, 'Blocked under a dropped goal', 'blocked'),
    { ...storyMoved(18102, 131, 'Verified under a dropped goal', 'verified'), pullRequest: null },
  ])
  terylon.answers.story_get = (args: Record<string, unknown>) =>
    ({ id: args.story, goal: { id: 35, state: 'dropped' }, title: 'x', state: args.story === 130 ? 'blocked' : 'verified', target: 'list', timeline: [] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  expect(terylon.toasts).toEqual([])
})

test('coalesce keeps each story\'s latest move, and a stuck story only where no event of the read moved it', () => {
  const candidate = (story: number, kind: Candidate['kind'], seq: number): Candidate => ({ story, kind, seq, title: `#${story}`, pullRequest: null, reason: null })

  expect(coalesce([candidate(125, 'verified', 1), candidate(126, 'verified', 3), candidate(125, 'accepted', 2), candidate(125, 'stuck', 9), candidate(333, 'stuck', 9)]))
    .toEqual([candidate(125, 'accepted', 2), candidate(126, 'verified', 3), candidate(333, 'stuck', 9)])
})

test('settleCandidate reads the story as it is now, and leaves a signal alone where the answer is about another story', () => {
  const blocked: Candidate = { story: 128, kind: 'blocked', seq: 1, title: 'x', pullRequest: null, reason: null }

  expect(settleCandidate(blocked, { id: 128, state: 'blocked' })).toEqual(blocked)
  expect(settleCandidate(blocked, { id: 128, state: 'running' })).toBeNull()
  expect(settleCandidate(blocked, { id: 128, state: 'abandoned' })).toBeNull()
  expect(settleCandidate(blocked, { id: 128, state: 'blocked', goalState: 'dropped' })).toBeNull()
  expect(settleCandidate(blocked, { id: 327, state: 'running' })).toEqual(blocked)
  expect(settleCandidate(blocked, null)).toEqual(blocked)
  expect(settleCandidate({ ...blocked, kind: 'abandoned' }, { id: 128, state: 'abandoned', goal: { state: 'dropped' } })).toEqual({ ...blocked, kind: 'abandoned' })
})

test('a summary asks what waits for the owner only when something does', () => {
  const told = (kind: Candidate['kind'], story: number) => signalFor({ story, kind, seq: story, title: `#${story}`, pullRequest: null, reason: null }, null)

  expect(signalsSummary([told('merged', 1), told('accepted', 2)]).prompt.split('\n').at(-1)).toBe('Shrň mi to.')
  expect(signalsSummary([told('merged', 1), told('blocked', 2)]).prompt.split('\n').at(-1)).toBe('Shrň mi to a u každé, která čeká na mě, co od ní potřebuju udělat.')
})
