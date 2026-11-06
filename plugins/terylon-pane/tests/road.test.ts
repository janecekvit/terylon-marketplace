// THE GOAL'S ROAD (hooks/road.ts): Terylon sends no stage for a goal, so the pane derives it, the first that holds
// deciding. Every step of the precedence is held here, each against the steps below it, and a list story's gate, a
// repeating task's goal, a story no goal could be found for, and the road's drawing. Pure: no session.

import { test, expect } from 'claude-code/testing'

import { ROAD_NAMES_COLUMNS, SVG_COLOURS, road, roadAlt, roadCells } from '../hooks/drawing'
import { monthOf, repeatingOf } from '../hooks/queue'
import { ROAD_STAGES, goalCardsOf, goalSpend, isAcceptGate, phaseSteps, repeatingWords, roadOf, roadPlansOf, roadSteps, roadStoriesOf, stageOf, storyNext } from '../hooks/road'
import type { PaneGoalItem, PaneRoadStory, PaneRunningItem } from '../types'

import { FLIGHT } from './fixtures'

const story = (state: string, extra: Partial<PaneRoadStory> = {}): PaneRoadStory => ({ id: 1, ref: 'S-A', title: 't', goal: 7, goalRef: null, state, isList: false, isStuck: false, usd: 0, tokens: null, isCostKnown: true, ...extra })
const PROPOSED = { isProposed: true }
const SETTLED = { isProposed: false }

const goal = (extra: Partial<PaneGoalItem> = {}): PaneGoalItem => ({ id: 7, ref: 'G-7', title: 'A goal', priority: 'P2', state: 'open', questions: 0, stories: '', counts: {}, target: null, repeating: null, ...extra })

const running = (extra: Partial<PaneRunningItem> = {}): PaneRunningItem => ({ story: 1, ref: 'S-A', goal: null, goalRef: null, now: 'running 2 min', title: 'S-A t', detail: '', step: null, fraction: null, isStuck: false, isVerifying: false, phases: [], stageLine: null, ...extra })

test('THE PRECEDENCE, each step over everything below it: closed, your merge, approve, verify, build, plan', () => {
  // CLOSED OVER EVERYTHING.
  expect(stageOf({ isClosed: true, stories: [story('verified'), story('running')], plans: [PROPOSED] })).toBe('done')
  // A STORY WAITING FOR ITS MERGE OR ACCEPTANCE over a plan that waits, a verification and a build.
  expect(stageOf({ isClosed: false, stories: [story('verified'), story('verifying'), story('running')], plans: [PROPOSED] })).toBe('merge')
  // A PROPOSED PLAN over a verification and a build.
  expect(stageOf({ isClosed: false, stories: [story('verifying'), story('running')], plans: [PROPOSED] })).toBe('approve')
  // A STORY BEING VERIFIED over one running.
  expect(stageOf({ isClosed: false, stories: [story('verifying'), story('running')], plans: [SETTLED] })).toBe('verify')
  // A STORY RUNNING OR QUEUED.
  for (const state of ['running', 'dispatched', 'approved', 'pr-open', 'blocked']) {
    expect(stageOf({ isClosed: false, stories: [story(state)], plans: [] })).toBe('build')
  }

  // OTHERWISE: nothing yet, or nothing of it open.
  expect(stageOf({ isClosed: false, stories: [], plans: [] })).toBe('plan')
  expect(stageOf({ isClosed: false, stories: [story('merged'), story('abandoned'), story('proposed')], plans: [SETTLED] })).toBe('plan')
})

test('the road\'s six stages in order, Approve and Your merge the owner\'s gates', () => {
  expect(ROAD_STAGES).toEqual(['plan', 'approve', 'build', 'verify', 'merge', 'done'])

  const steps = roadSteps('build', false)
  expect(steps.map(step => step.name)).toEqual(['Plan', 'Approve', 'Build', 'Verify', 'Your merge', 'Done'])
  expect(steps.map(step => step.status)).toEqual(['done', 'done', 'now', 'next', 'next', 'next'])
  expect(steps.filter(step => step.isGate).map(step => step.name)).toEqual(['Approve', 'Your merge'])
  // DONE IS DONE ALL THE WAY: no step is left now.
  expect(roadSteps('done', false).every(step => step.status === 'done')).toBe(true)
})

test('A LIST STORY IS ACCEPTED, NEVER MERGED: Your accept where every verified story is one, Your merge beside a repository\'s', () => {
  const list = story('verified', { isList: true })
  const repository = story('verified', { isList: false })

  expect(roadOf({ isClosed: false, stories: [list], plans: [], hasQuestion: false })).toMatchObject({ stage: 'merge', word: 'Your accept', next: 'Accept it on its card', tone: 'merged' })
  expect(roadOf({ isClosed: false, stories: [repository], plans: [], hasQuestion: false })).toMatchObject({ stage: 'merge', word: 'Your merge', next: 'Merge in the console', tone: 'merged' })
  expect(roadOf({ isClosed: false, stories: [list, repository], plans: [], hasQuestion: false }).word).toBe('Your merge')

  // WITH NOTHING VERIFIED YET the goal's own target says which gate is ahead.
  expect(isAcceptGate([story('running')], 'list')).toBe(true)
  expect(isAcceptGate([story('running')], 'github:contoso/x')).toBe(false)
  expect(roadOf({ isClosed: false, target: 'list', stories: [story('running')], plans: [], hasQuestion: false }).steps[4]?.name).toBe('Your accept')
  // AND A VERIFIED STORY'S OWN WORD STANDS OVER THE TARGET.
  expect(isAcceptGate([repository], 'list')).toBe(false)
})

test('WHAT NEXT says what the stage waits for: a question, a stuck or a blocked story over the leader\'s work, never over a gate', () => {
  const next = (stories: PaneRoadStory[], plans: { isProposed: boolean }[], hasQuestion = false) => roadOf({ isClosed: false, stories, plans, hasQuestion }).next

  expect(next([], [PROPOSED])).toBe('Waits for your approval')
  expect(next([], [PROPOSED], true)).toBe('Waits for your approval')
  expect(next([story('verified')], [], true)).toBe('Merge in the console')
  expect(next([story('running')], [])).toBe('The leader builds it')
  expect(next([story('approved')], [])).toBe('Waits for a slot')
  expect(next([story('running')], [], true)).toBe('Asks you a question')
  expect(next([story('running', { isStuck: true })], [])).toBe('Stuck: look at it')
  expect(next([story('blocked')], [])).toBe('Blocked: waits for you')
  expect(next([story('verifying')], [])).toBe('The leader verifies it')
  expect(next([], [])).toBe('The leader plans it')
  expect(next([], [], true)).toBe('Asks you a question')
  expect(roadOf({ isClosed: true, stories: [], plans: [], hasQuestion: false })).toMatchObject({ next: 'Nothing left to do', tone: 'success', word: 'Done' })
})

test('a story\'s own What next: what it waits for, or nothing for one that ended', () => {
  expect(storyNext({ state: 'verified', isList: true, heldReason: null })).toBe('Accept it on its card')
  expect(storyNext({ state: 'verified', isList: false, heldReason: null })).toBe('Merge in the console')
  expect(storyNext({ state: 'blocked', isList: false, heldReason: null })).toBe('Blocked: waits for you')
  expect(storyNext({ state: 'approved', isList: false, heldReason: null })).toBe('Waits for a slot')
  expect(storyNext({ state: 'approved', isList: false, heldReason: 'after #12' })).toBe('after #12')
  expect(storyNext({ state: 'merged', isList: false, heldReason: null })).toBeNull()
})

test('A REPEATING TASK\'S GOAL HAS NO ROAD: its card says its newest run in words', () => {
  const repeating = repeatingOf({ id: 7, repeating: { approved: { version: 1, title: 'Echo', runBudgetUsd: 1, autoAccept: false }, runs: [{ story: 9, state: 'verified', startedAt: '2026-11-02T06:37:39Z', costUsd: null, costKnown: false, tokens: 44578, files: [] }] } }, 'https://x', Date.parse('2026-11-02T08:00:00Z'), 0)
  expect(repeating).not.toBeNull()

  const words_ = repeatingWords(repeating ?? { summary: '', runs: [] })
  expect(words_.run).toBe('today 06:37 · green · waits for you')
  expect(words_.terms).toContain('Approved version 1')

  const { cards } = goalCardsOf({ goals: [goal({ repeating: words_ })], plans: [], stories: [story('verified')], running: [], questions: [] })
  expect(cards[0]?.road).toBeNull()
  expect(cards[0]?.summary).toBe('today 06:37 · green · waits for you')
  expect(cards[0]?.next).toBe(words_.terms)

  // NO RUN YET IS SAID, never left blank.
  expect(repeatingWords({ summary: 's', runs: [] }).run).toBe('No run yet: your routine starts each one.')
})

test('A RUNNING STORY IS FOUND ITS GOAL by the number its answer names, by its goal\'s ref, or by the plan it stands in; else it stays in the open', () => {
  const goals = [goal({ id: 7, ref: 'G-7' }), goal({ id: 8, ref: 'G-8' })]
  const plans = [{ id: 40, ref: 'P-40', goal: 8, isProposed: false, stories: 1, storyIds: [33] }]
  const input = { goals, plans, stories: [], questions: [] }

  expect(goalCardsOf({ ...input, running: [running({ story: 31, goal: 7 })] }).cards[0]?.running.map(item => item.story)).toEqual([31])
  expect(goalCardsOf({ ...input, running: [running({ story: 32, goalRef: 'G-8' })] }).cards[1]?.running.map(item => item.story)).toEqual([32])
  expect(goalCardsOf({ ...input, running: [running({ story: 33 })] }).cards[1]?.running.map(item => item.story)).toEqual([33])
  // BY stories_list, where work_in_flight names no goal, as Terylon's does.
  expect(goalCardsOf({ ...input, stories: [story('running', { id: 34, goal: 7 })], running: [running({ story: 34 })] }).cards[0]?.running.map(item => item.story)).toEqual([34])

  // UNDER A GOAL THAT IS NOT OPEN, OR NONE: never hidden.
  const lost = goalCardsOf({ ...input, running: [running({ story: 35, goal: 99 }), running({ story: 36 })] })
  expect(lost.elsewhere.map(item => item.story)).toEqual([35, 36])
  expect(lost.cards.flatMap(card => card.running)).toEqual([])

  // WHILE THE GOALS ARE NOT READ, every running story stands in the open.
  expect(goalCardsOf({ goals: [], plans: [], stories: [], questions: [], running: [running({ story: 37, goal: 7 })] }).elsewhere.map(item => item.story)).toEqual([37])
})

test('a goal\'s card says how far it is: a waiting plan by its ref, else n of m stories, with what it spent and what is stuck', () => {
  const plans = [{ id: 41, ref: 'P-58HFX', goal: 7, isProposed: true, stories: 3, storyIds: [] }]
  const approve = goalCardsOf({ goals: [goal()], plans, stories: [], running: [], questions: [] }).cards[0]
  expect(approve?.road?.word).toBe('Approve')
  expect(approve?.summary).toBe('plan P-58HFX · 3 stories')
  expect(approve?.next).toBe('Waits for your approval')

  const built = goalCardsOf({
    goals: [goal({ counts: { merged: 1, accepted: 1, running: 1, abandoned: 2, proposed: 1 } })],
    plans: [],
    stories: [story('running', { tokens: 144000, isCostKnown: false }), story('merged', { id: 2, tokens: 1000, isCostKnown: false })],
    running: [running({ goal: 7, isStuck: true }), running({ story: 2, goal: 7 })],
    questions: [],
  }).cards[0]
  // ABANDONED AND PROPOSED ARE NOT YET, OR NO LONGER, THE GOAL'S WORK.
  expect(built?.summary).toBe('2 of 3 stories')
  expect(built?.spend).toBe('145 k tokens')
  expect(built?.running.map(item => item.story)).toEqual([1, 2])
  expect(built?.stuck).toBe(1)

  // ONE STORY IS ONE, and none is said so.
  expect(goalCardsOf({ goals: [goal({ counts: { running: 1 } })], plans: [], stories: [], running: [], questions: [] }).cards[0]?.summary).toBe('0 of 1 story')
  expect(goalCardsOf({ goals: [goal()], plans: [], stories: [], running: [], questions: [] }).cards[0]?.summary).toBe('No story yet.')

  // A QUESTION ABOUT THE GOAL, OR ONE OF ITS STORIES.
  expect(goalCardsOf({ goals: [goal()], plans: [], stories: [], running: [], questions: [{ id: 1, about: '', subject: 'goal/7', subjectLabel: '', text: '', askedAt: null }] }).cards[0]?.next).toBe('Asks you a question')
  expect(goalCardsOf({ goals: [goal()], plans: [], stories: [story('running', { id: 5 })], running: [], questions: [{ id: 1, about: '', subject: 'story/5', subjectLabel: '', text: '', askedAt: null }] }).cards[0]?.next).toBe('Asks you a question')
})

test('NO $ WHILE THE COST IS NOT KNOWN: a goal\'s spend is its tokens, or that it is not known; dollars only where every cost is', () => {
  expect(goalSpend([story('running', { isCostKnown: true, usd: 2.1 }), story('merged', { isCostKnown: false, usd: 5, tokens: 22000 })])).toBe('22 k tokens')
  expect(goalSpend([story('running', { isCostKnown: false })])).toBe('cost not known on the setup token')
  expect(goalSpend([story('running', { usd: 2.1 }), story('merged', { usd: 3.4 })])).toBe('$5.50')
  expect(goalSpend([story('running')])).toBeNull()
  expect(goalSpend([])).toBeNull()
})

test('the stories a road reads: one each, the fresher answer over the older, a field it leaves null kept, an act just taken over a read that lags', () => {
  const stories = roadStoriesOf(
    [{ id: 1, goal: 7, ref: 'S-1', title: 'One', state: 'approved', target: 'list', tokens: 5 }, { id: 2, goal: 7, title: 'Two', state: 'verified', pullRequest: { id: 3 } }, { id: 3, title: 'Three', state: 'verified', target: 'list' }],
    { stories: [{ id: 1, title: 'One', state: 'running', stuck: { since: 'x' }, goal: null, costUsd: 1.5 }] },
    { storiesVerified: [{ id: 4, goal: 8, title: 'Four', target: 'github:contoso/x' }, { id: 5, goal: 8, title: 'Five' }] },
    null,
    (id, state) => (id === 3 ? 'accepted' : state),
  )

  expect(stories.map(item => item.id)).toEqual([1, 2, 3, 4, 5])
  expect(stories[0]).toMatchObject({ ref: 'S-1', goal: 7, state: 'running', isList: true, isStuck: true, usd: 1.5, tokens: 5, isCostKnown: true })
  // A VERIFIED STORY WITH A PULL REQUEST IS A REPOSITORY'S; ONE THAT NAMES NO TARGET AND HAS NONE IS A LIST STORY.
  expect(stories[1]?.isList).toBe(false)
  expect(stories[3]).toMatchObject({ state: 'verified', isList: false, goal: 8 })
  expect(stories[4]).toMatchObject({ state: 'verified', isList: true })
  expect(stories[2]?.state).toBe('accepted')
  // A STORY ON THE SETUP TOKEN says its cost is not known; refs have their #id fallback.
  expect(roadStoriesOf([{ id: 9, state: 'running' }], { stories: [] }, {}, 'setup-token')[0]).toMatchObject({ ref: '#9', isCostKnown: false })
})

test('the plans a road reads: plans_list\'s, and a waiting plan the briefing names that it has not read yet', () => {
  const planned = { id: 41, ref: 'P-1', goal: 7, goalTitle: 'x', state: 'proposed', stateText: '', isProposed: true, comment: null, console: '', stories: [{ id: 5, index: 1, title: '', detail: '', criteria: [], after: [], size: 'S', estimate: null }] }
  const waiting = [
    { kind: 'plan' as const, key: 'plan-41', target: 41, ref: 'P-1', title: '', detail: '', console: '', goal: 7, stories: 1 },
    { kind: 'plan' as const, key: 'plan-42', target: 42, ref: 'P-2', title: '', detail: '', console: '', goal: 7, stories: 2 },
    { kind: 'question' as const, key: 'question-1', target: 1, ref: null, title: '', detail: '', console: '', goal: null },
  ]

  expect(roadPlansOf([planned], waiting)).toEqual([
    { id: 41, ref: 'P-1', goal: 7, isProposed: true, stories: 1, storyIds: [5] },
    { id: 42, ref: 'P-2', goal: 7, isProposed: true, stories: 2, storyIds: [] },
  ])
  // A SETTLED PLAN IS READ AS SETTLED: it holds no goal on Approve.
  expect(roadPlansOf([{ ...planned, state: 'approved', isProposed: false }], [])[0]?.isProposed).toBe(false)
})

test('THE 30-DAY LINE: stories and what one cost; with no story, no cost of one', () => {
  expect(monthOf({ stories: 12, costPerStoryUsd: 1.1 })).toBe('12 stories · $1.10 per story')
  expect(monthOf({ stories: 1, costPerStoryUsd: 46.44 })).toBe('1 story · $46.44 per story')
  expect(monthOf({ stories: 12, costKnown: false, tokensPerStory: 22367 })).toBe('12 stories · 22 k tokens per story')
  expect(monthOf({ stories: 12, costKnown: false })).toBe('12 stories · cost not known per story')
  expect(monthOf({ stories: 0, costKnown: false })).toBe('0 stories')
  expect(monthOf({ stories: 0, costPerStoryUsd: 0 })).toBe('0 stories')
})

test('THE ROAD\'S DRAWING: a segment per step in an equal column, fixed colours, no word; its alt says the whole picture', () => {
  const steps = roadSteps('approve', false)
  const picture = road(steps)

  expect(picture.source).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="100%" height="6">/)
  expect(picture.height).toBe(6)
  expect(picture.alt).toBe('Plan done; Approve now; Build, Verify, Your merge, Done to come')
  expect(picture.source).not.toMatch(/<text|<tspan|<foreignObject/)
  expect(picture.source).not.toContain('<title>')

  const rects = [...picture.source.matchAll(/<rect x="([\d.]+)%" y="0" width="([\d.]+)%" height="6" rx="3" fill="(#[0-9a-f]{6})"( fill-opacity="\.45")?\/>/g)]
  expect(rects).toHaveLength(6)

  // EACH SEGMENT OVER ITS NAME'S COLUMN, at any width: its share of the width is its column's.
  rects.forEach((rect, index) => {
    const centre = Number(rect[1]) + Number(rect[2]) / 2

    expect(Math.abs(centre - (index + 0.5) * (100 / 6))).toBeLessThan(0.2)
  })

  // DONE GREEN, A GATE PURPLE, AHEAD GREY; A GATE AHEAD ITS PURPLE AT A LOWER OPACITY.
  expect(rects.map(rect => rect[3])).toEqual([SVG_COLOURS.roadDone, SVG_COLOURS.roadGate, SVG_COLOURS.roadAhead, SVG_COLOURS.roadAhead, SVG_COLOURS.roadGate, SVG_COLOURS.roadAhead])
  expect(rects.map(rect => rect[4] !== undefined)).toEqual([false, false, false, false, true, false])
  expect(road(roadSteps('build', false)).source).toContain(SVG_COLOURS.roadNow)
})

test('a story stuck is amber on its road and says so; a tooltip names each segment; a step\'s title is escaped', () => {
  const phases = [{ label: 'Plan', role: null, detail: '', status: 'done' as const }, { label: 'Tests', role: null, detail: '', status: 'now' as const }, { label: 'Merge', role: null, detail: '', status: 'next' as const }]
  const steps = phaseSteps(phases, ['Plan', 'Tests', 'Merge'])

  expect(steps.map(step => step.isGate)).toEqual([false, false, true])
  expect(road(steps, { isStuck: true }).source).toContain(SVG_COLOURS.stuck)
  expect(roadAlt(steps, true)).toBe('Plan done; Tests stuck; Merge to come')
  expect(road(steps, { tooltips: ['a', 'b <c>', 'd'] }).source).toContain('<g><title>b &lt;c&gt;</title><rect')
  expect(ROAD_NAMES_COLUMNS).toBe(60)
})

test('THE TERMINAL\'S ROAD: runs of cells as wide as it is given, in theme keys', () => {
  const cells = roadCells(roadSteps('merge', false), 60)

  expect(cells.map(cell => cell.tone)).toEqual(['success', 'success', 'success', 'success', 'merged', 'subtle'])
  expect(cells.every(cell => /^━+$/.test(cell.text))).toBe(true)
  // Six runs and the five spaces between them fit the width, and never less than a cell each.
  expect(cells.reduce((sum, cell) => sum + cell.text.length, 0) + 5).toBeLessThanOrEqual(60)
  expect(roadCells(roadSteps('plan', false), 3).every(cell => cell.text === '━')).toBe(true)
  expect(roadCells(roadSteps('build', false), 60, true)[2]?.tone).toBe('warning')
  expect(roadCells(roadSteps('build', false), 60)[2]?.tone).toBe('suggestion')
})

test('the fixtures\' world names a goal on every story that runs, as stories_list does', () => {
  expect(FLIGHT.stories.every(item => item.goal === 3)).toBe(true)
})
