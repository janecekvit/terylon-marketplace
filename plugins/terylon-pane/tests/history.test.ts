// HISTORY AND DELETE… (Terylon S47): the closed goals are History, and a goal in History is deleted for good in the
// console alone, under History › Delete…. No tool of the pane deletes: each History row ends with a link there. A
// deleted goal's goal_get, and story_get of a story deleted with it, answer a sentence the pane says quietly, and the
// feed's one GoalDeleted drops the goal everywhere and keeps its stories' signals from posting. A task takes size S.

import { test, expect } from 'claude-code/testing'

import { deleteLink } from '../hooks/queue'

import { BASE, NARROW_PANE_PROPS, PANE_PROPS, PLANS, SESSION, events, exact, refusal, storyMoved, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const
const SURFACES = [['desktop', PANE_PROPS, 'desktop'], ['terminal', PANE_PROPS, 'terminal'], ['narrow dock', NARROW_PANE_PROPS, 'desktop']] as const

const DELETE_LINK = 'Delete… ↗'
// The goal's row in History with its Delete… sheet open (Terylon S49); the owner still types the number there.
function deleteHref(goal: number): string {
  return `${BASE}/?cockpit=goals&tab=history&goal=${goal}&sheet=delete`
}

const OPEN_GOALS = [
  { id: 3, title: 'P1 · Agentic OS', priority: 1, state: 'open', stories: { running: 2 } },
  { id: 10, title: 'Daily forex statistics', priority: 2, state: 'active', stories: {} },
]
const CLOSED_GOALS = [
  { id: 8, title: 'TEST: earlier output', priority: 2, state: 'done', stories: { merged: 2 } },
  { id: 5, title: 'Merge proof', priority: 3, state: 'dropped', stories: { abandoned: 1 } },
]

// Plan 144 is goal 8's, still proposed, so History draws it: it leaves with its goal.
const PLAN_144 = { id: 144, goal: 8, goalTitle: 'TEST: earlier output', state: 'proposed', estimateUsd: 4, comment: null, stories: [{ id: 400, title: 'Old work', criteria: [], after: [], size: 'M', estimateUsd: 2 }] }

// The feed's one transition for a deleted goal, as Terylon S47 sends it: no title, none of its earlier transitions.
function goalDeleted(seq: number, goal: number) {
  return { seq, at: '2026-10-29T18:00:00Z', type: 'GoalDeleted', about: 'goal', goal, state: 'deleted', title: null }
}

function s44(closedCount: number, closed: readonly Record<string, unknown>[] = CLOSED_GOALS) {
  return (args: Record<string, unknown>) => (args.closed === true ? { goals: closed } : { goals: OPEN_GOALS, closedCount })
}

type Terylon = ReturnType<typeof world>

function deleteCalls(terylon: Terylon): string[] {
  return terylon.calls.map(call => call.tool).filter(tool => /delete/i.test(tool))
}

for (const [surface, props, drawnOn] of SURFACES) {
  test(`${surface}: History · M in place of Closed, each History row ending in Delete… to the console's Goals, and no tool deletes`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.goals_list = s44(2)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    await ui.press({ key: 'tab-goals' })
    expect((await ui.find({ key: 'goals-show-closed' }))?.props.label).toBe('History · 2')
    expect(await ui.find({ type: 'Text', text: /Closed/ })).toBeUndefined()
    // UNDER OPEN, NO DELETE…: only a goal in History is deleted.
    expect(await ui.findAll({ type: 'Link', text: DELETE_LINK })).toHaveLength(0)

    await ui.press({ key: 'goals-show-closed' })
    expect(await ui.find({ key: 'goal-8' })).toBeDefined()
    expect(await ui.find({ key: 'goal-5' })).toBeDefined()
    const links = await ui.findAll({ type: 'Link', text: DELETE_LINK })
    expect(links).toHaveLength(2)
    expect(links.map(link => link.props.href)).toEqual([deleteHref(8), deleteHref(5)])
    // A LINK ONLY: nothing on it calls a tool, and drawing History called none but the reads.
    expect(links.every(link => link.props.onPress === undefined)).toBe(true)
    expect(terylon.calls.filter(call => !['goals_list', 'plans_list', 'briefing', 'work_in_flight', 'stories_list', 'policy_get', 'events_since', 'leader_status', 'notices_list', 'metrics', 'story_get', 'memory_get'].includes(call.tool))).toEqual([])
    expect(deleteCalls(terylon)).toEqual([])
  })

  test(`${surface}: an empty History says "History is empty." quietly`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.goals_list = s44(0, [])
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    await ui.press({ key: 'tab-goals' })
    expect((await ui.find({ key: 'goals-show-closed' }))?.props.label).toBe('History · 0')
    await ui.press({ key: 'goals-show-closed' })
    expect((await ui.find({ type: 'Text', text: exact('History is empty.') }))?.props.color).toBe('subtle')
    expect(await ui.findAll({ type: 'Link', text: DELETE_LINK })).toHaveLength(0)
  })

  test(`${surface}: a deleted goal's goal_get is said quietly with ‹ back, and the goal leaves History`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.goals_list = s44(2)
    const goalGet = terylon.answers.goal_get as (args: Record<string, unknown>) => unknown
    terylon.answers.goal_get = (args: Record<string, unknown>) => (args.goal === 8 ? refusal('Goal 8 was deleted.', 404) : goalGet(args))
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    await ui.press({ key: 'tab-goals' })
    await ui.press({ key: 'goals-show-closed' })
    // DELETED IN THE CONSOLE meanwhile: closedCount says so, while the closed list read right after still names it.
    terylon.answers.goals_list = s44(1)
    await ui.press({ key: 'goal-8' })

    expect((await ui.find({ type: 'Text', text: exact('Goal 8 was deleted.') }))?.props.color).toBe('subtle')
    expect(await ui.find({ key: 'goal-error' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /Could not load/ })).toBeUndefined()
    expect(await ui.find({ key: 'back' })).toBeDefined()

    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'goal-8' })).toBeUndefined()
    expect(await ui.find({ key: 'goal-5' })).toBeDefined()
    expect((await ui.find({ key: 'goals-show-closed' }))?.props.label).toBe('History · 1')

    // A LIST READ RIGHT AFTER THE DELETION, still naming it, does not bring it back.
    await ui.press({ key: 'goals-show-open' })
    await ui.press({ key: 'goals-show-closed' })
    expect(await ui.find({ key: 'goal-8' })).toBeUndefined()
  })

  test(`${surface}: a story deleted with its goal is said quietly with ‹ back, never as a failure`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.story_get = (args: Record<string, unknown>) => refusal(`Story ${String(args.story)} was deleted with its goal.`, 404)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    await ui.press({ key: 'story-333' })

    expect((await ui.find({ type: 'Text', text: exact('Story 333 was deleted with its goal.') }))?.props.color).toBe('subtle')
    expect(await ui.find({ key: 'story-error' })).toBeUndefined()
    expect(await ui.find({ key: 'back' })).toBeDefined()
    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'tab-queue' })).toBeDefined()
  })

  test(`${surface}: size S is offered beside M, L and XL, M stays the default, and S is what tasks_add sends`, async ($, on) => {
    const terylon = world(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    await ui.input({ key: 'quick-add', text: 'A small fix' })
    expect((await ui.find({ key: 'add-size' }))?.props.options).toEqual([{ value: 'S', label: 'S' }, { value: 'M', label: 'M' }, { value: 'L', label: 'L' }, { value: 'XL', label: 'XL' }])
    expect((await ui.find({ key: 'add-size' }))?.props.value).toBe('M')

    await ui.select({ key: 'add-size', value: 'S' })
    await ui.press({ key: 'add-send' })
    const [sent] = terylon.calls.filter(call => call.tool === 'tasks_add')
    expect((sent?.args.tasks as { size: string }[])[0]?.size).toBe('S')
  })
}

test('GOALDELETED IN THE FEED: the goal and its plans leave every list, its story signals nothing, another goal\'s still does', async ($, on) => {
  const terylon = world(on)
  let moved: Record<string, unknown>[] = []
  // The head moves with the events, as Terylon's does: a head below the since asked reads as a reset.
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since)), Math.max(18100, ...moved.map(event => Number(event.seq))))
  // A list that lags: goals_list still names goal 8 among the closed, and plans_list its plan.
  terylon.answers.goals_list = s44(2)
  terylon.answers.plans_list = { plans: [...PLANS.plans, PLAN_144] }
  // story_get lags too: story 400 is verified under goal 8, as if nothing were deleted.
  const storyGet = terylon.answers.story_get as (args: Record<string, unknown>) => unknown
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 400 ? { id: 400, goal: 8, title: 'Old work', state: 'verified', pullRequest: null, timeline: [] } : storyGet(args))
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goals-show-closed' })
  expect(await ui.find({ key: 'goal-8' })).toBeDefined()
  expect(await ui.find({ key: 'plan-144' })).toBeDefined()

  // title: null, the goal by `goal`: parsed as it comes. closedCount says the deletion; the closed list lags.
  terylon.answers.goals_list = s44(1)
  moved = [{ ...storyMoved(18101, 400, 'Old work', 'verified'), goal: 8 }, goalDeleted(18102, 8), storyMoved(18103, 327, 'Events since the last look', 'verified')]
  await terylon.clock.advance(30000)
  await terylon.clock.settle()

  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
  expect(terylon.prompts.join('\n')).not.toContain('#400')
  expect(terylon.toasts.join('\n')).not.toContain('#400')

  expect(await ui.find({ key: 'goal-8' })).toBeUndefined()
  expect(await ui.find({ key: 'plan-144' })).toBeUndefined()
  expect((await ui.find({ key: 'goals-show-closed' }))?.props.label).toBe('History · 1')

  // THE NEXT POLL AND A REFRESH, the lists still lagging, bring nothing of it back, and nothing posts for it.
  await terylon.clock.advance(30000)
  await ui.press({ key: 'refresh' })
  await ui.press({ key: 'goals-show-open' })
  await ui.press({ key: 'goals-show-closed' })
  expect(await ui.find({ key: 'goal-5' })).toBeDefined()
  expect(await ui.find({ key: 'goal-8' })).toBeUndefined()
  expect(await ui.find({ key: 'plan-144' })).toBeUndefined()
  expect(terylon.prompts).toHaveLength(1)
  expect(deleteCalls(terylon)).toEqual([])
})

test('GOALDELETED IN THE FEED, the goal open on screen: its screen says so quietly, with ‹ back', async ($, on) => {
  const terylon = world(on)
  let moved: Record<string, unknown>[] = []
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since)), Math.max(18100, ...moved.map(event => Number(event.seq))))
  terylon.answers.goals_list = s44(2)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goals-show-closed' })
  await ui.press({ key: 'goal-8' })
  expect(await ui.find({ type: 'Text', text: exact('Goal 8') })).toBeDefined()

  moved = [goalDeleted(18101, 8)]
  await terylon.clock.advance(30000)
  await terylon.clock.settle()

  expect((await ui.find({ type: 'Text', text: exact('Goal 8 was deleted.') }))?.props.color).toBe('subtle')
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'goal-8' })).toBeUndefined()
})

test('A PENDING SIGNAL OF A STORY DELETED WITH ITS GOAL does not post: story_get\'s sentence keeps it back', async ($, on) => {
  const terylon = world(on)
  let moved: Record<string, unknown>[] = []
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since)), Math.max(18100, ...moved.map(event => Number(event.seq))))
  const storyGet = terylon.answers.story_get as (args: Record<string, unknown>) => unknown
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 401 ? refusal('Story 401 was deleted with its goal.', 404) : storyGet(args))
  await $.session.start(SESSION)
  await terylon.clock.settle()

  moved = [storyMoved(18101, 401, 'Gone with its goal', 'verified'), storyMoved(18102, 402, 'Also gone', 'blocked')]
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 401 || args.story === 402 ? refusal(`Story ${String(args.story)} was deleted with its goal.`, 404) : storyGet(args))
  await terylon.clock.advance(30000)
  await terylon.clock.settle()
  await terylon.clock.advance(30000)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual([])
  expect(terylon.toasts).toEqual([])
})

test('GOALDELETED, BEFORE S44: an open goal\'s plan leaves the Goals tab, though plans_list still names it', async ($, on) => {
  const terylon = world(on)
  let moved: Record<string, unknown>[] = []
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), moved.filter(event => Number(event.seq) > Number(args.since)), Math.max(18100, ...moved.map(event => Number(event.seq))))
  // The full list, no closedCount: a plan stays on the tab unless its goal is among the closed ones.
  terylon.answers.goals_list = { goals: [...OPEN_GOALS, { id: 12, title: 'Household budget', priority: 2, state: 'open', stories: {} }] }
  terylon.answers.plans_list = { plans: [...PLANS.plans, { ...PLAN_144, id: 150, goal: 12, goalTitle: 'Household budget' }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  expect(await ui.find({ key: 'plan-150' })).toBeDefined()

  // Deleted while open; both lists lag and still name it.
  moved = [goalDeleted(18101, 12)]
  await terylon.clock.advance(30000)
  await terylon.clock.settle()
  await ui.press({ key: 'refresh' })

  expect(await ui.find({ key: 'goal-12' })).toBeUndefined()
  expect(await ui.find({ key: 'plan-150' })).toBeUndefined()
  expect(await ui.find({ key: 'plan-41' })).toBeDefined()
})

test('AFTER A RESET, a goal deleted in the old history hides nothing: a new goal 8 is listed and its story signals', async ($, on) => {
  const terylon = world(on)
  let moved: Record<string, unknown>[] = []
  let isReset = false
  terylon.answers.events_since = (args: Record<string, unknown>) => {
    const since = Number(args.since)

    // Reset to factory defaults: a new epoch whose sequence begins again from 1.
    if (isReset) {
      return since > 5 && args.epoch === undefined
        ? { epoch: 'new', events: [], since, last: 5, more: false, head: 5, gap: true, reset: true }
        : { ...events(since, moved.filter(event => Number(event.seq) > since), Math.max(5, ...moved.map(event => Number(event.seq)))), epoch: 'new' }
    }

    return events(since, moved.filter(event => Number(event.seq) > since), Math.max(18100, ...moved.map(event => Number(event.seq))))
  }
  terylon.answers.goals_list = s44(2)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  moved = [goalDeleted(18101, 8)]
  await terylon.clock.advance(30000)
  await terylon.clock.settle()

  isReset = true
  moved = []
  terylon.answers.goals_list = { goals: [...OPEN_GOALS, { id: 8, title: 'New budget', priority: 2, state: 'open', stories: {} }], closedCount: 0 }
  const storyGet = terylon.answers.story_get as (args: Record<string, unknown>) => unknown
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 4 ? { id: 4, goal: 8, title: 'First of the new', state: 'verified', pullRequest: null, timeline: [] } : storyGet(args))
  await terylon.clock.advance(30000)
  await terylon.clock.settle()
  expect(terylon.logs.some(log => log.to === 'debug' && log.text.includes('was reset'))).toBe(true)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  expect((await ui.find({ key: 'goal-8' }))?.text).toContain('New budget')

  moved = [{ ...storyMoved(6, 4, 'First of the new', 'verified'), goal: 8 }]
  await terylon.clock.advance(30000)
  await terylon.clock.settle()
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #4')
})

test('deleteLink is the goal\'s row in History with its Delete… sheet, the id URL-safe', () => {
  expect(deleteLink('https://terylon.example.ts.net', 52)).toBe('https://terylon.example.ts.net/?cockpit=goals&tab=history&goal=52&sheet=delete')
  expect(deleteLink('https://terylon.example.ts.net', 1e21)).toBe('https://terylon.example.ts.net/?cockpit=goals&tab=history&goal=1e%2B21&sheet=delete')
})
