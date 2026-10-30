// OPEN AND CLOSED GOALS AS TWO BUTTONS: Open · N and History · M on the Goals tab. With Terylon S44 goals_list
// answers the open goals and closedCount, and the closed ones are read with goals_list {closed: true} on a press of
// Closed alone; without it the pane counts and filters them locally from the full list. Both shapes are held here.

import { test, expect } from 'claude-code/testing'

import { NARROW_PANE_PROPS, PANE_PROPS, PLANS, SESSION, exact, refusal, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const
const MOUNT = { ...PANE, surface: 'desktop' } as const

// goals_list as Terylon S44 answers it: the open goals and closedCount; {closed: true} the done and dropped ones.
const OPEN_GOALS = [
  { id: 3, title: 'P1 · Agentic OS', priority: 1, state: 'open', stories: { running: 2 } },
  { id: 10, title: 'Daily forex statistics', priority: 2, state: 'active', stories: {} },
]
const CLOSED_GOALS = [
  { id: 8, title: 'TEST: earlier output', priority: 2, state: 'done', stories: { merged: 2 } },
  { id: 5, title: 'Merge proof', priority: 3, state: 'dropped', stories: { abandoned: 1 } },
]

function s44(closedCount: number, closed: readonly Record<string, unknown>[] = CLOSED_GOALS) {
  return (args: Record<string, unknown>) => (args.closed === true ? { goals: closed } : { goals: OPEN_GOALS, closedCount })
}

type Call = { tool: string; args: Record<string, unknown> }

function closedReads(calls: readonly Call[]): Call[] {
  return calls.filter(call => call.tool === 'goals_list' && call.args?.closed === true)
}

for (const [surface, props] of [['desktop', PANE_PROPS], ['terminal', PANE_PROPS], ['narrow dock', NARROW_PANE_PROPS]] as const) {
  test(`${surface}: the Goals tab draws Open · N and History · M in place of the fold, Open selected`, async ($, on) => {
    const terylon = world(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: surface === 'terminal' ? 'terminal' : 'desktop' })
    await ui.press({ key: 'tab-goals' })

    // BEFORE S44, the fixture's full list: two open goals and one dropped.
    expect((await ui.find({ key: 'goals-show-open' }))?.props.label).toBe('Open · 2')
    expect((await ui.find({ key: 'goals-show-closed' }))?.props.label).toBe('History · 1')
    expect((await ui.find({ key: 'goals-show-open' }))?.props.variant).toBe('primary')
    expect((await ui.find({ key: 'goals-show-closed' }))?.props.variant).toBeUndefined()
    expect((await ui.find({ key: 'goals-show-closed' }))?.props.dimColor).toBe(true)
    expect(await ui.find({ key: 'goals-closed' })).toBeUndefined()
    expect(await ui.find({ key: 'goal-3' })).toBeDefined()
    expect(await ui.find({ key: 'goal-1' })).toBeUndefined()

    // CLOSED, PRESSED: the closed goals alone, the button selected.
    await ui.press({ key: 'goals-show-closed' })
    expect((await ui.find({ key: 'goals-show-closed' }))?.props.variant).toBe('primary')
    expect((await ui.find({ key: 'goals-show-open' }))?.props.variant).toBeUndefined()
    expect((await ui.find({ key: 'goal-1' }))?.text).toContain('Old')
    expect(await ui.find({ key: 'goal-3' })).toBeUndefined()
    // A CLOSED GOAL'S TITLE IS DIM, by the engine's own dimming and not by a colour alone, which Desktop drew bright.
    expect((await ui.find({ type: 'Text', text: exact('Old') }))?.props.dimColor).toBe(true)

    await ui.press({ key: 'goals-show-open' })
    expect(await ui.find({ key: 'goal-3' })).toBeDefined()
    expect(await ui.find({ key: 'goal-1' })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: exact('P1 · Agentic OS') }))?.props.dimColor).toBeUndefined()
  })
}

test('BEFORE S44: with no closedCount the closed goals are counted and filtered locally, and Closed reads nothing', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = { goals: [...OPEN_GOALS, ...CLOSED_GOALS] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })
  expect((await ui.find({ key: 'goals-show-open' }))?.props.label).toBe('Open · 2')
  expect((await ui.find({ key: 'goals-show-closed' }))?.props.label).toBe('History · 2')

  await ui.press({ key: 'goals-show-closed' })
  expect(await ui.find({ key: 'goal-8' })).toBeDefined()
  expect(await ui.find({ key: 'goal-5' })).toBeDefined()
  expect(await ui.find({ key: 'goal-10' })).toBeUndefined()
  expect(closedReads(terylon.calls)).toEqual([])
})

test('AFTER S44: History · M is closedCount, and the closed goals are read only when Closed is pressed, never on the poll', async ($, on) => {
  const terylon = world(on)
  // closedCount, not the list: the open answer carries none of the closed goals.
  terylon.answers.goals_list = s44(4)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })
  expect((await ui.find({ key: 'goals-show-open' }))?.props.label).toBe('Open · 2')
  expect((await ui.find({ key: 'goals-show-closed' }))?.props.label).toBe('History · 4')

  // THE POLL, AND A REFRESH OF THE TAB, READ THE OPEN GOALS ONLY.
  for (let poll = 0; poll < 3; poll += 1) {
    await terylon.clock.advance(30000)
    await terylon.clock.settle()
  }

  await ui.press({ key: 'refresh' })
  await ui.press({ key: 'tab-queue' })
  await ui.press({ key: 'tab-goals' })
  expect(closedReads(terylon.calls)).toEqual([])

  await ui.press({ key: 'goals-show-closed' })
  expect(closedReads(terylon.calls).length).toBe(1)
  expect((await ui.find({ key: 'goal-8' }))?.text).toContain('TEST: earlier output')
  expect(await ui.find({ key: 'goal-5' })).toBeDefined()
  expect(await ui.find({ key: 'goal-3' })).toBeUndefined()
  expect((await ui.find({ key: 'goals-show-closed' }))?.props.label).toBe('History · 4')

  // KEPT UNTIL THE NEXT PRESS: the poll and a refresh with closedCount unchanged read nothing more.
  await terylon.clock.advance(30000)
  await terylon.clock.settle()
  await ui.press({ key: 'refresh' })
  expect(closedReads(terylon.calls).length).toBe(1)
  expect(await ui.find({ key: 'goal-8' })).toBeDefined()

  // A CLOSED GOAL'S ROW OPENS ITS GOAL SCREEN, as today, and ‹ walks back to the closed list without a read.
  await ui.press({ key: 'goal-8' })
  expect(await ui.find({ key: 'back' })).toBeDefined()
  expect(await ui.find({ key: 'goals-show-closed' })).toBeUndefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'goal-8' })).toBeDefined()
  expect(closedReads(terylon.calls).length).toBe(1)

  // THE NEXT PRESS READS THEM AGAIN.
  await ui.press({ key: 'goals-show-open' })
  await ui.press({ key: 'goals-show-closed' })
  expect(closedReads(terylon.calls).length).toBe(2)
})

test('AFTER S44: a poll that changes closedCount drops the closed goals read before, and reads nothing by itself', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = s44(2)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goals-show-closed' })
  expect(await ui.find({ key: 'goal-8' })).toBeDefined()

  terylon.answers.goals_list = s44(3, [{ id: 11, title: 'Household budget', priority: 2, state: 'done', stories: {} }, ...CLOSED_GOALS])
  await ui.press({ key: 'refresh' })
  expect((await ui.find({ key: 'goals-show-closed' }))?.props.label).toBe('History · 3')
  expect(await ui.find({ key: 'goal-8' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('The closed goals changed since they were read.') })).toBeDefined()
  expect(closedReads(terylon.calls).length).toBe(1)

  await ui.press({ key: 'goals-closed-retry' })
  expect(closedReads(terylon.calls).length).toBe(2)
  expect(await ui.find({ key: 'goal-11' })).toBeDefined()
})

test('THE CLOSED LIST, EMPTY: it says so quietly, in either shape; with closedCount 0 nothing is read', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = s44(0, [])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })
  expect((await ui.find({ key: 'goals-show-closed' }))?.props.label).toBe('History · 0')
  await ui.press({ key: 'goals-show-closed' })
  expect((await ui.find({ type: 'Text', text: exact('History is empty.') }))?.props.color).toBe('subtle')
  expect(closedReads(terylon.calls)).toEqual([])

  terylon.answers.goals_list = { goals: OPEN_GOALS }
  await ui.press({ key: 'refresh' })
  expect((await ui.find({ key: 'goals-show-closed' }))?.props.label).toBe('History · 0')
  expect((await ui.find({ type: 'Text', text: exact('History is empty.') }))?.props.color).toBe('subtle')
})

test('THE CLOSED LIST, LOADING AND FAILED: a quiet line while it loads; Terylon\'s sentence and Try again when it fails', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = s44(2)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })

  // LOADING: a read that does not answer is a quiet line, and ends as the bounded load's own sentence.
  terylon.hang.add('goals_list')
  const pressed = ui.press({ key: 'goals-show-closed' })
  await terylon.clock.settle()
  expect((await ui.find({ type: 'Text', text: exact('Loading the closed goals…') }))?.props.color).toBe('subtle')
  expect(await ui.find({ key: 'goals-closed-retry' })).toBeUndefined()
  await terylon.clock.advance(8000)
  await terylon.clock.settle()
  await pressed
  expect(await ui.find({ type: 'Text', text: /did not answer within 8 s/ })).toBeDefined()
  expect((await ui.find({ key: 'goals-closed-retry' }))?.props.label).toBe('Try again')
  terylon.hang.delete('goals_list')

  // FAILED: Terylon's sentence, word for word, and Try again reads them again.
  terylon.answers.goals_list = (args: Record<string, unknown>) => (args.closed === true ? refusal('The goal store is not answering.', 503) : { goals: OPEN_GOALS, closedCount: 2 })
  await ui.press({ key: 'goals-closed-retry' })
  expect(await ui.find({ type: 'Text', text: /The goal store is not answering\./ })).toBeDefined()
  expect((await ui.find({ key: 'goals-closed-retry' }))?.props.label).toBe('Try again')
  expect(await ui.find({ key: 'goal-8' })).toBeUndefined()

  terylon.answers.goals_list = s44(2)
  await ui.press({ key: 'goals-closed-retry' })
  expect(await ui.find({ key: 'goal-8' })).toBeDefined()
  expect(await ui.find({ key: 'goals-closed-retry' })).toBeUndefined()
})

test('AFTER S44: a plan stays on the Goals tab only under an open goal, the closed goals unread', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = s44(2)
  // Plan 41 is goal 3's, which is open; plan 144 is goal 8's, which S44 counts among the closed and does not list.
  terylon.answers.plans_list = { plans: [...PLANS.plans, { id: 144, goal: 8, goalTitle: 'TEST: earlier output', state: 'approved', estimateUsd: 4, comment: null, stories: [] }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })
  expect(await ui.find({ key: 'plan-41' })).toBeDefined()
  expect(await ui.find({ key: 'plan-144' })).toBeUndefined()
  expect(closedReads(terylon.calls)).toEqual([])
})

// EACH BUTTON DRAWS ITS OWN GOALS' PLANS: under History only a closed goal's plan that still waits for the owner, a
// settled one staying on its goal's own screen; under Open the open goals' plans.
for (const shape of ['before S44', 'after S44'] as const) {
  test(`${shape.toUpperCase()}: History shows the closed goals and only a plan of theirs that waits; Open the open ones and theirs`, async ($, on) => {
    const terylon = world(on)
    // Plan 41 is goal 3's, which is open; plan 144 is goal 8's, which is done, and settled; plan 145 is goal 5's, which
    // is dropped, and still proposed.
    terylon.answers.goals_list = shape === 'after S44' ? s44(2) : { goals: [...OPEN_GOALS, ...CLOSED_GOALS] }
    terylon.answers.plans_list = { plans: [
      ...PLANS.plans,
      { id: 144, goal: 8, goalTitle: 'TEST: earlier output', state: 'approved', estimateUsd: 4, comment: null, stories: [] },
      { id: 145, goal: 5, goalTitle: 'Merge proof', state: 'proposed', estimateUsd: 2, comment: null, stories: [] },
    ] }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount(MOUNT)
    await ui.press({ key: 'tab-goals' })
    expect(await ui.find({ key: 'plan-41' })).toBeDefined()
    expect(await ui.find({ key: 'plan-144' })).toBeUndefined()

    await ui.press({ key: 'goals-show-closed' })
    expect(await ui.find({ key: 'goal-8' })).toBeDefined()
    expect(await ui.find({ key: 'plan-41' })).toBeUndefined()
    // A SETTLED PLAN OF A CLOSED GOAL WAITS ON NOTHING: it stays on the goal's own screen, not under History.
    expect(await ui.find({ key: 'plan-144' })).toBeUndefined()
    expect(await ui.find({ key: 'plan-145' })).toBeDefined()
    // NO "No plan waits." under History: that card speaks of the open goals' plans.
    expect(await ui.find({ type: 'Text', text: exact('No plan waits.') })).toBeUndefined()

    await ui.press({ key: 'goals-show-open' })
    expect(await ui.find({ key: 'plan-41' })).toBeDefined()
    expect(await ui.find({ key: 'plan-144' })).toBeUndefined()
    expect(await ui.find({ key: 'plan-145' })).toBeUndefined()

    // ITS GOAL'S OWN SCREEN still draws the settled plan.
    await ui.press({ key: 'goals-show-closed' })
    await ui.press({ key: 'goal-8' })
    expect(await ui.find({ key: 'goal-plan-144' })).toBeDefined()
  })
}
