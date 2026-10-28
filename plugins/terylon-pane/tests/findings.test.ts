// THE OWNER'S DESKTOP WALK OF 1.5.0 (#35): each finding held here, the defects first, then the minor items in the
// order the issue lists them.

import { test, expect } from 'claude-code/testing'

import { BRIEFING, FLIGHT, GOALS, PANE_PROPS, PLANS, SESSION, STORIES, STORY_333, exact, pictures, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const
const MOUNT = { ...PANE, surface: 'desktop' } as const

type Session = { command: { run: (input: never) => Promise<unknown> } }

async function toQueue($: Session): Promise<void> {
  await $.command.run({ command: 'terylon-pane', args: '' } as never)
}

const ACTS = ['plan_approve', 'plan_rethink', 'story_return', 'story_unblock', 'story_abandon', 'story_stop', 'story_accept', 'leader_pause', 'leader_resume', 'goal_drop', 'memory_confirm', 'memory_drop', 'policy_save']

function actCalls(calls: { tool: string; args: Record<string, unknown> }[]): { tool: string; args: Record<string, unknown> }[] {
  return calls.filter(call => ACTS.includes(call.tool)).map(call => ({ tool: call.tool, args: call.args }))
}

// A goal whose title the walk's goal picker showed cut, and the owner's "TEST 5: …", typed one key at a time.
const WALK_GOALS = { goals: [{ id: 3, title: 'P1 · Agentic OS', priority: 1, state: 'open' }, { id: 7, title: 'TEST: procházka panelu…', priority: 2, state: 'open' }] }
const WALK_TITLE = 'TEST 5: the pane walk'

async function typeNewTask(ui: { input: (input: never) => Promise<unknown>; press: (input: never) => Promise<unknown> }): Promise<void> {
  for (let length = 1; length <= WALK_TITLE.length; length += 1) {
    await ui.input({ key: 'quick-add', text: WALK_TITLE.slice(0, length), kind: 'change' } as never)
  }

  await ui.press({ key: 'quick-open' } as never)
}

test('DEFECT, THE TITLE: a new task typed key by key is handed over whole, and the card says what was handed over', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = WALK_GOALS
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await typeNewTask(ui)
  expect((await ui.find({ key: 'add-title' }))?.props.value).toBe(WALK_TITLE)

  await ui.select({ key: 'add-goal', value: '7' })
  await ui.press({ key: 'add-send' })

  const sent = terylon.calls.filter(call => call.tool === 'tasks_add')
  expect(sent).toHaveLength(1)
  expect((sent[0]?.args.tasks as { title: string }[])[0]?.title).toBe(WALK_TITLE)
  expect(await ui.find({ type: 'Text', text: exact(`Title: ${WALK_TITLE}`) })).toBeDefined()
})

test('DEFECT, THE CRITERIA: an empty Criteria sends no criterion, never the goal picker\'s label, and the card says none was sent', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = WALK_GOALS
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await typeNewTask(ui)
  await ui.select({ key: 'add-goal', value: '7' })
  await ui.press({ key: 'add-send' })

  const sent = terylon.calls.filter(call => call.tool === 'tasks_add')
  expect(sent[0]?.args).toEqual({ goal: 7, tasks: [{ title: WALK_TITLE, brief: WALK_TITLE, criteria: [], files: [], size: 'M' }] })
  expect(await ui.find({ type: 'Text', text: exact('Criteria: none sent; the leader writes them.') })).toBeDefined()
})

test('STALE AFTER APPROVE: the plan reads approved at once, its acts gone, though plans_list has not caught up', async ($, on) => {
  const terylon = world(on)
  terylon.answers.plan_approve = { accepted: true, sentence: 'Plan 41: 2 approved, 0 dropped.', commandId: 'c1', subjectId: 3 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'act-plan-41-approve' })

  expect(await ui.find({ type: 'Text', text: exact('✓ Plan 41: 2 approved, 0 dropped.') })).toBeDefined()
  expect(await ui.find({ key: 'act-plan-41-approve' })).toBeUndefined()
  expect(await ui.find({ key: 'act-plan-41-rethink' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('approved') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('to approve · ~$14') })).toBeUndefined()

  // THE QUEUE TOO: the briefing still lists it as waiting until the leader moves it.
  await toQueue($)
  expect(await ui.find({ key: 'plan-41' })).toBeUndefined()
})

// policy_get as Terylon main aaf07e8 answers it, with its limits.
const LIMIT = (minimum: number, maximum: number, whole: boolean, aboveMinimum = false) => ({ minimum, maximum, aboveMinimum, whole })
const POLICY_AAF = {
  slots: 4,
  storyBudgetUsd: 25,
  dayBudgetUsd: 100,
  version: 1,
  changedAt: null,
  limits: { slots: LIMIT(1, 8, true), storyBudgetUsd: LIMIT(0, 10000, false, true), dayBudgetUsd: LIMIT(0, 10000, false, true) },
}

test('STALE AFTER A POLICY SAVE: the form closes on ✓ and the card shows what was saved, its ranges kept', async ($, on) => {
  const terylon = world(on)
  terylon.answers.policy_get = POLICY_AAF
  terylon.answers.policy_save = { accepted: true, sentence: 'Policy version 2 is in force.', commandId: 'c2', subjectId: null }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-status' })
  await ui.press({ key: 'act-policy-edit' })
  await ui.input({ key: 'act-policy-field-slots', text: '3', kind: 'change' })
  await ui.press({ key: 'act-policy-send' })

  expect(actCalls(terylon.calls)).toEqual([{ tool: 'policy_save', args: { slots: 3 } }])
  expect(await ui.find({ type: 'Text', text: exact('✓ Policy version 2 is in force.') })).toBeDefined()
  expect(await ui.find({ key: 'act-policy-field-slots' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('No change yet.') })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('3 stories') })).toBeDefined()

  // Edited again, the field keeps its range: the policy is never dropped while it is read again.
  await ui.press({ key: 'act-policy-edit' })
  expect((await ui.find({ key: 'act-policy-field-slots' }))?.props.label).toBe('Slots (1–8)')
  expect((await ui.find({ key: 'act-policy-field-slots' }))?.props.value).toBe('3')
})

test('STALE AFTER DROP GOAL: the goal reads dropped at once, Drop goal… gone, and it leaves the open goals', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goal_drop = { accepted: true, sentence: 'Goal 3 is dropped.', commandId: 'c3', subjectId: 3 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goal-3' })
  await ui.press({ key: 'act-goal-3-drop' })
  await ui.press({ key: 'act-goal-3-send' })

  expect(await ui.find({ type: 'Text', text: exact('✓ Goal 3 is dropped.') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('P1 · dropped') })).toBeDefined()
  expect(await ui.find({ key: 'act-goal-3-drop' })).toBeUndefined()

  await toQueue($)
  await ui.press({ key: 'tab-goals' })
  expect((await ui.find({ key: 'goals-show-open' }))?.props.label).toBe('Open · 1')
})

// A story blocked as stopped, as story_get answers it.
const STORY_BLOCKED = { id: 329, goal: 3, title: 'Memory proposals', state: 'blocked', attempt: 2, blockedReason: 'stopped by you', blockedFrom: '2026-10-11T15:20:00Z', pullRequest: { id: null, url: null, branch: 'feat/memory-proposals', head: null }, timeline: [] }

test('ABANDON IS RED: a danger act is a plain Button whose word is drawn in error, as the S27 canvas has it', async ($, on) => {
  const terylon = world(on)
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 329 ? STORY_BLOCKED : STORY_333)
  terylon.answers.work_in_flight = { ...FLIGHT, stories: [FLIGHT.stories[0], { ...FLIGHT.stories[1], state: 'blocked' }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'story-329' })
  // A BUTTON WITH CHROME DREW ITS CHILDREN IN ITS OWN GREY in Desktop 3.6556.2.0, engine 2.1.308 (the walk of 1.5.0);
  // a plain one draws them in their own colour, as each row's kind dot shows.
  expect((await ui.find({ key: 'act-story-329-abandon' }))?.props.plain).toBe(true)
  expect((await ui.find({ type: 'Text', text: exact('Abandon…') }))?.props.color).toBe('error')

  await ui.press({ key: 'act-story-329-abandon' })
  expect((await ui.find({ key: 'act-story-329-send' }))?.props.plain).toBe(true)
  expect((await ui.find({ type: 'Text', text: exact('Abandon for good') }))?.props.color).toBe('error')

  await toQueue($)
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goal-3' })
  expect((await ui.find({ key: 'act-goal-3-drop' }))?.props.plain).toBe(true)
  expect((await ui.find({ type: 'Text', text: exact('Drop goal…') }))?.props.color).toBe('error')
})

test('HOW TO FIX NAMES NO BUTTON THAT IS NOT THERE: the rules an act needs end with pressing the act again', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })
  terylon.mode.server = 'prompted'
  await ui.press({ key: 'act-plan-41-approve' })
  terylon.mode.server = 'up'
  await ui.press({ key: 'act-plan-41-fix' })

  expect(await ui.find({ key: 'problem-rules' })).toBeDefined()
  expect(await ui.find({ key: 'retry' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('2. Press Try again.') })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('2. Press the act again on its card.') })).toBeDefined()
})

// SINCE TERYLON S35 (#388) goal_drop withdraws the goal's waiting plans and abandons every story of it that has not
// ended, stopping a run first: the card names each, by title, and says so when it is none.
test('DROP GOAL SAYS WHAT IT WITHDRAWS AND ABANDONS, by title, and says so when it is nothing', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goal_get = (args: Record<string, unknown>) => ({
    id: args.goal,
    title: 'Test z telefonu',
    priority: 2,
    state: 'open',
    storyList: [{ id: 14, title: 'TEST C', state: 'approved' }, { id: 15, title: 'TEST D', state: 'running' }, { id: 9, title: 'Old', state: 'merged' }, { id: 8, title: 'Gone', state: 'abandoned' }],
  })
  terylon.answers.plans_list = {
    plans: [
      { id: 107, goal: 11, goalTitle: 'Test z telefonu', state: 'rethink', estimateUsd: 4, comment: 'Smaller.', stories: [] },
      { id: 112, goal: 11, goalTitle: 'Test z telefonu', state: 'approved', estimateUsd: 4, comment: null, stories: [] },
    ],
  }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goal-11' })
  await ui.press({ key: 'act-goal-11-drop' })
  expect(await ui.find({ type: 'Text', text: exact('Drop it for good: the leader stops working on it. It withdraws plan 107, which waits for a decision. It abandons #14 TEST C and #15 TEST D, stopping the run of #15 first.') })).toBeDefined()

  terylon.answers.plans_list = { plans: [] }
  terylon.answers.goal_get = (args: Record<string, unknown>) => ({ id: args.goal, title: 'Test z telefonu', priority: 2, state: 'open', storyList: [] })
  await toQueue($)
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goal-11' })
  await ui.press({ key: 'act-goal-11-drop' })
  expect(await ui.find({ type: 'Text', text: exact('Drop it for good: the leader stops working on it. No plan of it waits. No story of it is open.') })).toBeDefined()
})

// An approved story with nothing before it and no hold: the walk's stuck one, which the leader could not brief.
const STUCK = { id: 360, title: 'Brief the leader could not write', state: 'approved', after: [], updatedAt: '2026-10-11T08:00:00Z' }

test('A STUCK APPROVED STORY: not said to wait for a slot while one is free', async ($, on) => {
  const terylon = world(on)
  terylon.answers.stories_list = { stories: [...STORIES.stories, STUCK] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ type: 'Text', text: exact('not started, though a slot is free') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('waits for a slot') })).toBeUndefined()

  // Every slot taken, it does wait for one.
  terylon.answers.work_in_flight = { ...FLIGHT, slots: 2 }
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: exact('waits for a slot') })).toBeDefined()
})

// Story 14 of the walk, as Terylon's orchestrator traced it: its brief written, held after #12, which was abandoned.
// stories_list names no reason; story_get carries it as blockedReason while the state stays approved.
const HELD = { id: 14, title: 'TEST C: after A', state: 'approved', after: [], updatedAt: '2026-10-11T08:00:00Z' }
const HELD_REASON = 'after #12; #12 was abandoned, so order it again'

test('A HELD APPROVED STORY SAYS WHY: the reason story_get carries, on its row and its card, and Abandon… beside it', async ($, on) => {
  const terylon = world(on)
  terylon.answers.stories_list = { stories: [...STORIES.stories, HELD] }
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 14 ? { ...HELD, goal: 3, blockedReason: HELD_REASON, timeline: [] } : STORY_333)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ type: 'Text', text: exact(HELD_REASON) })).toBeDefined()
  expect((await ui.find({ key: 'queued-14' }))?.text).toMatch(/^\s*(?:●\s+)?held\s+#14 TEST C: after A\s+after #12; #12 was abandoned, so order it again$/)

  await ui.press({ key: 'queued-14' })
  expect((await ui.find({ key: 'story-held' }))).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact(HELD_REASON) })).toBeDefined()
  expect(await ui.find({ key: 'act-story-14-abandon' })).toBeDefined()
})

test('A STUCK APPROVED STORY CAN BE ENDED: Abandon… on its card, sent with its reason', async ($, on) => {
  const terylon = world(on)
  terylon.answers.stories_list = { stories: [...STORIES.stories, STUCK] }
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 360 ? { ...STUCK, goal: 3, timeline: [] } : STORY_333)
  terylon.answers.story_abandon = { accepted: true, sentence: 'Story 360 is abandoned.', commandId: 'c4', subjectId: 360 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'queued-360' })
  await ui.press({ key: 'act-story-360-abandon' })
  expect(actCalls(terylon.calls)).toEqual([])
  await ui.input({ key: 'act-story-360-text', text: 'The brief cannot be written.', kind: 'change' })
  await ui.press({ key: 'act-story-360-send' })
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'story_abandon', args: { story: 360, reason: 'The brief cannot be written.' } }])
  expect(await ui.find({ type: 'Text', text: exact('✓ Story 360 is abandoned.') })).toBeDefined()
})

test('A DROPPED GOAL\'S PLANS LEAVE THE GOALS TAB; an open goal\'s stay', async ($, on) => {
  const terylon = world(on)
  terylon.answers.plans_list = { plans: [...PLANS.plans, { id: 144, goal: 1, goalTitle: 'Old', state: 'approved', estimateUsd: 4, comment: null, stories: [] }, { id: 107, goal: 1, goalTitle: 'Old', state: 'rethink', estimateUsd: 4, comment: null, stories: [] }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })
  expect(GOALS.goals.find(goal => goal.id === 1)?.state).toBe('dropped')
  expect(await ui.find({ key: 'plan-41' })).toBeDefined()
  expect(await ui.find({ key: 'plan-144' })).toBeUndefined()
  expect(await ui.find({ key: 'plan-107' })).toBeUndefined()
})

// Plan 144 of the walk: A and B independent, C after A, `after` naming A by its story id.
const PLAN_144 = {
  plans: [
    {
      id: 144,
      goal: 3,
      goalTitle: 'Agentic OS',
      state: 'proposed',
      estimateUsd: 9,
      comment: null,
      stories: [
        { id: 12, title: 'TEST A: the queue', criteria: [], files: [], size: 'S', estimateUsd: 3, runsAfter: [], after: [] },
        { id: 13, title: 'TEST B: the bell', criteria: [], files: [], size: 'S', estimateUsd: 3, runsAfter: [], after: [] },
        { id: 14, title: 'TEST C: after A', criteria: [], files: [], size: 'S', estimateUsd: 3, runsAfter: [], after: [12] },
      ],
    },
  ],
}

test('A PLAN\'S ORDER IS ITS STORIES\' after: one arrow, A to C, B on its own, and "after" names a title', async ($, on) => {
  const terylon = world(on)
  terylon.answers.plans_list = PLAN_144
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'tab-goals' })
  expect(await ui.find({ type: 'Text', text: exact('S · ~$3 · after TEST A: the queue') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /after 12/ })).toBeUndefined()

  const chain = (await pictures(ui)).find(picture => picture.alt.startsWith('TEST A'))
  expect(chain?.alt).toBe('TEST A: the queue; TEST B: the bell; TEST C: after A after TEST A: the queue')
  // ONE ARROWHEAD, for the one dependency.
  expect((chain?.source.match(/<path /g) ?? []).length).toBe(1)
  await ui.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await terminal.press({ key: 'tab-goals' })
  expect(await terminal.find({ type: 'Text', text: exact('1 → 3 · 2') })).toBeDefined()
})

test('THE ROW AND THE CARD READ ONE STAGE: a story opened reads work_in_flight again, and both draw that answer', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ type: 'Text', text: exact('5/8 · $2.10') })).toBeDefined()

  // The run moved on to review since the last poll; story_get's own progress lags behind at plan.
  terylon.answers.work_in_flight = { ...FLIGHT, stories: [{ ...FLIGHT.stories[0], progress: { ...FLIGHT.stories[0]?.progress, stage: 'review', agent: { name: 'reviewer', running: 1 } } }, FLIGHT.stories[1]] }
  terylon.answers.story_get = () => ({ ...STORY_333, progress: { ...STORY_333.progress, stage: 'plan' } })
  await ui.press({ key: 'story-333' })
  expect(await ui.find({ type: 'Text', text: exact('4 of 8') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('reviewer · Review') })).toBeDefined()

  await ui.press({ key: 'back' })
  expect(await ui.find({ type: 'Text', text: exact('4/8 · $2.10') })).toBeDefined()
})

test('NOW WORKING FOR EVERY RUNNING STORY: a run whose progress names no agent, or no stage, says so there', async ($, on) => {
  const terylon = world(on)
  const noAgent = { stage: 'develop', step: null, steps: null, current: null, agent: null, tokens: null }
  terylon.answers.work_in_flight = { ...FLIGHT, stories: [{ ...FLIGHT.stories[0], progress: noAgent }, FLIGHT.stories[1]] }
  terylon.answers.story_get = () => ({ ...STORY_333, progress: noAgent })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'story-333' })
  expect(await ui.find({ key: 'story-working' })).toBeDefined()
  expect(await ui.find({ key: 'story-progress' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('no agent reported · Develop') })).toBeDefined()

  terylon.answers.work_in_flight = { ...FLIGHT, stories: [{ ...FLIGHT.stories[0], progress: null }, FLIGHT.stories[1]] }
  terylon.answers.story_get = () => ({ ...STORY_333, progress: null })
  await ui.press({ key: 'back' })
  await ui.press({ key: 'story-333' })
  expect(await ui.find({ key: 'story-working' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('no agent reported · no stage reported') })).toBeDefined()
})

test('A STOPPED STORY KEEPS THE STAGE IT REACHED: a progress with no stage does not hide the one story_get reports', async ($, on) => {
  const terylon = world(on)
  terylon.answers.work_in_flight = { ...FLIGHT, stories: [FLIGHT.stories[0], { ...FLIGHT.stories[1], state: 'blocked', progress: { stage: null, step: null, steps: null, current: null, agent: null, tokens: null } }] }
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 329 ? { ...STORY_BLOCKED, progress: { stage: 'review', step: null, steps: null, current: null, agent: null, tokens: null } } : STORY_333)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'story-329' })
  expect(await ui.find({ type: 'Text', text: exact('4 of 8') })).toBeDefined()

  // NO STAGE FROM EITHER: the count is said as what it is, not as the stage reached.
  terylon.answers.story_get = () => STORY_BLOCKED
  await ui.press({ key: 'back' })
  await ui.press({ key: 'story-329' })
  expect(await ui.find({ type: 'Text', text: exact('1 of 8 · no stage reported') })).toBeDefined()
})

test('AN UNBLOCKED STORY\'S HEADER COUNTS ONLY ITS RUNNING TIME: the hour it stood stopped is not "running"', async ($, on) => {
  const terylon = world(on)
  terylon.answers.story_get = () => ({
    ...STORY_333,
    timeline: [
      ...STORY_333.timeline,
      { seq: 650, at: '2026-10-11T12:00:00Z', type: 'StoryMoved', actor: 'owner', key: null, summary: 'running → blocked' },
      { seq: 651, at: '2026-10-11T13:00:00Z', type: 'StoryMoved', actor: 'owner', key: null, summary: 'blocked → running' },
    ],
  })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'story-333' })
  // Started at 10:00, now 22:00, stopped from 12:00 to 13:00: eleven hours of running.
  expect(await ui.find({ type: 'Text', text: exact('running 11 h 0 min') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('running 12 h 0 min') })).toBeUndefined()
})

test('THE NEW TASK\'S "What to do" IS A FIELD OF SEVERAL ROWS, and a title typed over lines is sent as one line', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.input({ key: 'quick-add', text: 'A long task' })
  expect((await ui.find({ key: 'add-title' }))?.props.rows).toBe(3)

  await ui.input({ key: 'add-title', text: 'A long task\nthat goes on', kind: 'change' })
  await ui.press({ key: 'add-send' })
  expect((terylon.calls.find(call => call.tool === 'tasks_add')?.args.tasks as { title: string }[])[0]?.title).toBe('A long task that goes on')
})

// SINCE TERYLON S35 (#388) a second tasks_add under a goal no longer replaces its waiting plan: both wait.
test('TWO WAITING PLANS OF ONE GOAL are both drawn, each with its own acts, and both wait in the queue', async ($, on) => {
  const terylon = world(on)
  const second = { ...PLANS.plans[0], id: 42, stories: [] }
  terylon.answers.plans_list = { plans: [...PLANS.plans, second] }
  terylon.answers.briefing = { ...BRIEFING, plansWaiting: [...BRIEFING.plansWaiting, { id: 42, goal: 3, goalTitle: 'Agentic OS', stories: 1, estimateUsd: 4 }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  expect(await ui.find({ key: 'plan-41' })).toBeDefined()
  expect(await ui.find({ key: 'plan-42' })).toBeDefined()

  await ui.press({ key: 'tab-goals' })
  expect(await ui.find({ key: 'act-plan-41-approve' })).toBeDefined()
  expect(await ui.find({ key: 'act-plan-42-approve' })).toBeDefined()

  await toQueue($)
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goal-3' })
  expect(await ui.find({ key: 'goal-plan-41' })).toBeDefined()
  expect(await ui.find({ key: 'goal-plan-42' })).toBeDefined()
})
