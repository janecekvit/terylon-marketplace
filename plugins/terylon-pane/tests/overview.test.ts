// THE OVERVIEW AND MORE: the pane's tabs replaced by one screen of tiles, Waiting for you and a card per goal, with
// Notices, Memory and Health on one page behind its pills. On the desktop, the narrow dock and the terminal where each
// is drawn.

import { test, expect } from 'claude-code/testing'

import { CARD_FILL, WAITING_TILE_FILL } from '../hooks/drawing'

import { BRIEFING, FLIGHT, GOALS, GOAL_QUESTION, METRICS, NARROW_PANE_PROPS, PANE_PROPS, PLANS, SESSION, STORIES, STORY_327, STORY_333, chipOf, exact, openCockpit, pictures, pill, toOverview, toRoot, unfold, world, foldOf } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon' } as const

const WIDE_TERMINAL = { ...(PANE_PROPS as Record<string, unknown>), bodyColumns: 100 } as never

const WIDE_DOCK = { ...(PANE_PROPS as Record<string, unknown>), bodyColumns: 120 } as never

const SURFACES = [['desktop', PANE_PROPS, 'desktop'], ['narrow dock', NARROW_PANE_PROPS, 'desktop'], ['terminal', PANE_PROPS, 'terminal']] as const

type Call = { tool: string; args: Record<string, unknown> }

function callsOf(calls: readonly Call[], tool: string): Call[] {
  return calls.filter(call => call.tool === tool)
}

// A world with one goal at every stage of the road, by what the pane reads of it.
const ROAD_GOALS = {
  goals: [
    { id: 20, ref: 'G-PLAN1', title: 'Nothing yet', priority: 2, state: 'open', stories: {} },
    { id: 21, ref: 'G-APPRV', title: 'Household budget', priority: 2, state: 'open', target: 'list', stories: { proposed: 3 } },
    { id: 22, ref: 'G-BUILD', title: 'Take your time', priority: 2, state: 'active', target: 'list', stories: { merged: 1, running: 1 } },
    { id: 23, ref: 'G-VERIF', title: 'Being verified', priority: 2, state: 'active', stories: { verifying: 1 } },
    { id: 24, ref: 'G-MERGE', title: 'Slots fit the machine', priority: 2, state: 'active', stories: { verified: 1, merged: 1 } },
    { id: 25, ref: 'G-ACCPT', title: 'A list goal', priority: 2, state: 'active', target: 'list', stories: { verified: 1 } },
  ],
  closedCount: 12,
}

const ROAD_PLANS = { plans: [{ id: 50, ref: 'P-58HFX', goal: 21, goalTitle: 'Household budget', state: 'proposed', estimateUsd: 0, comment: null, stories: [{ id: 60, title: 'One', criteria: [], size: 'S', after: [] }, { id: 61, title: 'Two', criteria: [], size: 'S', after: [] }, { id: 62, title: 'Three', criteria: [], size: 'S', after: [] }] }] }

const ROAD_FLIGHT = {
  slots: 2,
  paused: false,
  stories: [
    { id: 70, ref: 'S-JMAVS', title: 'Running', state: 'running', attempt: 1, startedAt: '2026-10-11T21:59:24Z', costUsd: 0, budgetUsd: 8, stuck: null, progress: { stage: 'test', step: 1, steps: 2, current: 'x', agent: { name: 'tester', running: 1 }, tokens: null } },
    { id: 71, ref: 'S-VERIF', title: 'Verifying', state: 'verifying', attempt: 1, costUsd: 0, budgetUsd: 8, stuck: null, progress: { stage: 'verify' } },
  ],
}

const ROAD_STORIES = {
  stories: [
    { id: 70, ref: 'S-JMAVS', goal: 22, title: 'Running', state: 'running', target: 'list', updatedAt: '2026-10-11T21:00:00Z' },
    { id: 71, ref: 'S-VERIF', goal: 23, title: 'Verifying', state: 'verifying', updatedAt: '2026-10-11T21:00:00Z' },
    { id: 72, ref: 'S-MERGE', goal: 24, title: 'Slots fit', state: 'verified', pullRequest: { id: 1 }, updatedAt: '2026-10-11T21:00:00Z' },
    { id: 73, ref: 'S-ACCPT', goal: 25, title: 'List story', state: 'verified', target: 'list', updatedAt: '2026-10-11T21:00:00Z' },
  ],
}

const ROAD_BRIEFING = {
  plansWaiting: [{ id: 50, ref: 'P-58HFX', goal: 21, goalTitle: 'Household budget', stories: 3, estimateUsd: 0 }],
  questionsOpen: [],
  storiesVerified: [{ id: 72, ref: 'S-MERGE', goal: 24, title: 'Slots fit', target: 'github:contoso/x', pullRequest: { id: 1 } }, { id: 73, ref: 'S-ACCPT', goal: 25, title: 'List story', target: 'list' }],
  storiesBlocked: [],
  leader: { paused: false },
}

function roadWorld(on: Parameters<typeof world>[0]) {
  const terylon = world(on)
  terylon.answers.goals_list = ROAD_GOALS
  terylon.answers.plans_list = ROAD_PLANS
  terylon.answers.work_in_flight = ROAD_FLIGHT
  terylon.answers.stories_list = ROAD_STORIES
  terylon.answers.briefing = ROAD_BRIEFING

  return terylon
}

for (const [surface, props, drawnOn] of SURFACES) {
  test(`${surface}: one card per goal, each its ref, its title, its stage and what next, from what the pane read`, async ($, on) => {
    const terylon = roadWorld(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()
    await openCockpit($)

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })

    for (const [id, title, next] of [
      [20, 'Nothing yet', 'The leader plans it'],
      [21, 'Household budget', 'Waits for your approval'],
      [22, 'Take your time', 'The leader builds it'],
      [23, 'Being verified', 'The leader verifies it'],
      [24, 'Slots fit the machine', 'Merge in the console'],
      [25, 'A list goal', 'Accept it on its card'],
    ] as const) {
      expect((await ui.find({ key: `goal-${id}` }))?.text).toBe(title)
      expect(await ui.find({ type: 'Text', text: exact(next) })).toBeDefined()
    }

    for (const ref of ['G-PLAN1', 'G-APPRV', 'G-BUILD', 'G-VERIF', 'G-MERGE', 'G-ACCPT']) {
      expect((await ui.find({ type: 'Text', text: exact(ref) }))?.props).toMatchObject({ mono: true, color: 'subtle' })
    }

    // HOW FAR, AND EACH RUNNING STORY ONE PRESS AWAY BY ITS REF AND ITS STATE.
    expect(await ui.find({ type: 'Text', text: exact('plan P-58HFX · 3 stories') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('1 of 2 stories') })).toBeDefined()
    expect((await ui.find({ key: 'story-70' }))?.text).toBe('S-JMAVS running 36 s')
    expect((await ui.find({ key: 'story-71' }))?.text).toBe('S-VERIF verifying')

    await ui.press({ key: 'story-70' })
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ Overview')
    await ui.press({ key: 'back' })

    if (drawnOn === 'desktop') {
      expect((await pictures(ui)).map(picture => picture.alt)).toEqual([
        'Plan now; Approve, Build, Verify, Your merge, Done to come',
        'Plan done; Approve now; Build, Verify, Your accept, Done to come',
        'Plan, Approve done; Build now; Verify, Your accept, Done to come',
        'Plan, Approve, Build done; Verify now; Your merge, Done to come',
        'Plan, Approve, Build, Verify done; Your merge now; Done to come',
        'Plan, Approve, Build, Verify done; Your accept now; Done to come',
      ])
    } else {
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      expect((await ui.findAll({ type: 'Text', text: /^━+$/ })).length).toBe(36)
    }

    await ui.unmount()
  })
}

test('the stage\'s chip: purple for a gate, blue while it runs, its word never amber; a list goal says Your accept', async ($, on) => {
  const terylon = roadWorld(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await openCockpit($)

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })

  for (const [card, word, dot] of [['goal-card-21', 'Approve', 'merged'], ['goal-card-22', 'Build', 'suggestion'], ['goal-card-24', 'Your merge', 'merged'], ['goal-card-25', 'Your accept', 'merged']] as const) {
    const chip = await chipOf(ui, card)
    expect(chip).toEqual({ word: 'inactive', dot, background: 'userMessageBackground', size: 'caption' })
    expect(await ui.find({ type: 'Text', text: new RegExp(`^\\u00a0●\\u00a0${word}\\u00a0$`) })).toBeDefined()
  }

  // NO CARD IS FILLED.
  expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.backgroundColor !== undefined && ![CARD_FILL, WAITING_TILE_FILL].includes(String(box.props.backgroundColor)))).toEqual([])
})

test('a goal\'s ref falls back to nothing where Terylon sends none, its stories\' to #id, as today', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await openCockpit($)

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  expect((await ui.find({ key: 'goal-3' }))?.text).toBe('P1 · Agentic OS')
  expect((await ui.find({ key: 'story-333' }))?.text).toMatch(/^#333 running/)
})

for (const [surface, props, drawnOn] of SURFACES) {
  test(`${surface}: a running story whose goal cannot be found still appears, open, and its row opens it`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.work_in_flight = { ...FLIGHT, stories: [...FLIGHT.stories, { id: 400, ref: 'S-LOST1', title: 'Under no open goal', state: 'running', attempt: 1, goal: 99, startedAt: '2026-10-11T21:00:00Z', costUsd: 0, budgetUsd: 8, stuck: null, progress: { stage: 'develop', step: 1, steps: 4, current: 'x', agent: { name: 'developer', running: 1 }, tokens: 10 } }] }
    await $.session.start(SESSION)
    await terylon.clock.settle()
    await openCockpit($)

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    expect((await foldOf(ui, 'fold-running'))).toBe('▾ Running, goal not found 1')
    expect((await ui.find({ key: 'story-400' }))?.text).toMatch(/^S-LOST1 Under no open goal/)
    // THE OTHERS STAND ON THEIR GOAL'S CARD, under the same key.
    expect((await ui.find({ key: 'story-333' }))?.text).toMatch(/^#333 running/)

    // A PRESS SHUTS THE FOLD AND ANOTHER OPENS IT; THE COUNT ALWAYS SAYS IT.
    await ui.press({ key: 'fold-running' })
    expect(await ui.find({ key: 'story-400' })).toBeUndefined()
    expect((await foldOf(ui, 'fold-running'))).toBe('▸ Running, goal not found 1')
    await ui.press({ key: 'fold-running' })

    await ui.press({ key: 'story-400' })
    expect(terylon.calls.filter(call => call.tool === 'story_get').map(call => call.args.story)).toContain(400)
    await ui.unmount()
  })

  test(`${surface}: a stuck story is flagged on its goal's card and counted in the third tile`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.work_in_flight = { ...FLIGHT, stories: FLIGHT.stories.map(story => (story.id === 333 ? { ...story, stuck: { since: '2026-10-11T15:20:00Z', reason: 'no progress' } } : story)) }
    await $.session.start(SESSION)
    await terylon.clock.settle()
    await openCockpit($)

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    expect((await ui.find({ key: 'goal-card-3' }))?.props.borderColor).toBe('warning')
    expect(await ui.find({ type: 'Text', text: exact('⚠ 1 stuck') })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact('⚠') }))?.props.color).toBe('warning')
    expect((await ui.find({ key: 'story-333' }))?.text).toMatch(/^#333 stuck since \d\d:\d\d$/)
    expect((await ui.find({ key: 'goal-card-11' }))?.props.borderColor).toBe('subtle')

    if (surface === 'desktop') {
      expect((await ui.find({ key: 'tile-stuck' }))?.props.borderColor).toBe('warning')
    } else {
      expect(await ui.find({ type: 'Text', text: exact('3 waiting · 2 running · 1 stuck') })).toBeDefined()
    }

    await ui.unmount()
  })

  test(`${surface}: a paused leader shows on the overview with Resume, and Pause is on Health alone`, async ($, on) => {
    const terylon = world(on)
    const paused = { at: '2026-10-11T14:05:00Z', source: 'cockpit', reason: 'maintenance' }
    terylon.answers.briefing = { ...BRIEFING, leader: { paused } }
    terylon.answers.leader_status = { paused }
    terylon.answers.leader_resume = { accepted: true, sentence: 'Resumed.', commandId: 'c9', subjectId: null }
    await $.session.start(SESSION)
    await terylon.clock.settle()
    await openCockpit($)

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    expect(await ui.find({ type: 'Text', text: /^The leader is paused since \d\d:\d\d \(maintenance\)\./ })).toBeDefined()
    expect((await ui.find({ key: 'act-leader-resume' }))?.props.label).toBe('Resume')
    expect(await ui.find({ key: 'act-leader-pause' })).toBeUndefined()

    await pill(ui, 'tab-status')
    expect(await ui.find({ key: 'act-leader-resume' })).toBeDefined()
    expect(await ui.find({ key: 'act-leader-pause' })).toBeUndefined()
    await ui.press({ key: 'act-leader-resume' })
    expect(callsOf(terylon.calls, 'leader_resume')).toHaveLength(1)
    await ui.unmount()
  })

  test(`${surface}: with no story in the 30 days the line drops what a story cost, on the overview and on Health`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.metrics = { ...METRICS, stories: 0, costPerStoryUsd: null, costKnown: false, opened: 0, merged: 0 }
    await $.session.start(SESSION)
    await terylon.clock.settle()
    await openCockpit($)

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    expect(await ui.find({ type: 'Text', text: exact('Last 30 days 0 stories') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /per story/ })).toBeUndefined()
    await pill(ui, 'tab-status')
    expect(await ui.find({ type: 'Text', text: exact('Stories') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /per story|Per story/i })).toBeUndefined()
    await ui.unmount()
  })

  test(`${surface}: a repeating task's goal has no road: its card says its newest run in words`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.goals_list = { goals: [{ id: 12, ref: 'G-FOREX', title: 'Daily forex statistics', priority: 2, state: 'active', stories: { verified: 1 }, repeating: { approved: { version: 1, title: 'Daily forex statistics', runBudgetUsd: 1, autoAccept: false }, runs: [{ story: 125, state: 'verified', startedAt: '2026-10-11T05:00:00Z', costUsd: 0.2, files: [] }] } }], closedCount: 0 }
    terylon.answers.work_in_flight = { ...FLIGHT, stories: [] }
    terylon.answers.stories_list = { stories: [] }
    await $.session.start(SESSION)
    await terylon.clock.settle()
    await openCockpit($)

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    expect((await ui.find({ key: 'goal-12' }))?.text).toBe('Daily forex statistics')
    expect(await ui.find({ type: 'Text', text: /^\S+ \d\d:\d\d · green · waits for you$|^today \d\d:\d\d · green · waits for you$|\d+ Oct \d\d:\d\d · green · waits for you$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Approved version 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Svg' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^━+$/ })).toBeUndefined()
    await ui.unmount()
  })
}

test('a repeating task whose run goes stays one press away on its card', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = { goals: [{ id: 12, title: 'Daily', priority: 2, state: 'active', stories: { running: 1 }, repeating: { approved: { version: 1, autoAccept: true }, runs: [{ story: 333, state: 'running', startedAt: '2026-10-11T05:00:00Z', files: [] }] } }], closedCount: 0 }
  terylon.answers.work_in_flight = { ...FLIGHT, stories: [{ ...FLIGHT.stories[0], goal: 12 }] }
  terylon.answers.stories_list = { stories: [] }
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await openCockpit($)

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  expect((await ui.find({ key: 'story-333' }))?.text).toMatch(/^#333 running/)
})

test('THE TILES: three boxes on the desktop and a wide terminal, one line of counts in a narrow terminal and the narrow dock', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const [props, surface, isLine] of [[PANE_PROPS, 'desktop', false], [WIDE_TERMINAL, 'terminal', false], [PANE_PROPS, 'terminal', true], [NARROW_PANE_PROPS, 'desktop', true]] as const) {
    const ui = await $.ui.mount({ ...PANE, props, surface })
    expect((await ui.find({ key: 'tiles' })) !== undefined).toBe(!isLine)
    expect((await ui.find({ key: 'tiles-line' })) !== undefined).toBe(isLine)
    expect((await ui.find({ type: 'Text', text: exact('3 waiting · 2 running · 0 stuck') })) !== undefined).toBe(isLine)
    await ui.unmount()
  }
})

test('A WAITING ROW\'S ACT: Approve and Accept open their card and take nothing on that press; a question opens; merge is only a link', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { ...BRIEFING, storiesVerified: [...BRIEFING.storiesVerified, { id: 352, goal: 3, title: 'Weekly cost summary', target: 'list' }], storiesBlocked: [{ id: 87, title: 'Plan the export', blockedReason: 'needs your choice' }] }
  terylon.answers.plan_approve = { accepted: true, sentence: 'Plan 41: 2 approved, 0 dropped.', commandId: 'c1', subjectId: 3 }
  terylon.answers.story_accept = { accepted: true, sentence: 'Story 352 is accepted.', commandId: 'c2', subjectId: 352 }
  const repository = terylon.answers.story_get as (args: Record<string, unknown>) => Record<string, unknown>
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 352 ? { ...repository({ story: 327 }), id: 352, title: 'Weekly cost summary', state: 'verified', target: 'list', pullRequest: null } : repository(args))
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  // NOTHING IS TAKEN ON RENDER.
  expect(callsOf(terylon.calls, 'plan_approve')).toEqual([])
  expect(callsOf(terylon.calls, 'story_accept')).toEqual([])
  expect(await ui.find({ type: 'Button', text: /Merge/ })).toBeUndefined()
  expect((await ui.find({ key: 'open-story-87' }))?.props.label).toBe('Open')

  // THE ROW KEEPS THE ACT'S WORD, AND ITS PRESS ONLY OPENS THE CARD: a plan is never approved unread.
  expect((await ui.find({ key: 'open-plan-41' }))?.props.label).toBe('Approve')
  await ui.press({ key: 'open-plan-41' })
  expect(callsOf(terylon.calls, 'plan_approve')).toEqual([])
  await ui.press({ key: 'act-plan-41-approve' })
  expect(callsOf(terylon.calls, 'plan_approve').map(call => call.args)).toEqual([{ plan: 41 }])
  expect(await ui.find({ type: 'Text', text: exact('✓ Plan 41: 2 approved, 0 dropped.') })).toBeDefined()
  await ui.press({ key: 'back' })
  // IT LEAVES THE LIST AT ONCE, THOUGH THE BRIEFING STILL NAMES IT.
  expect(await ui.find({ key: 'plan-41' })).toBeUndefined()

  expect((await ui.find({ key: 'open-story-352' }))?.props.label).toBe('Accept')
  await ui.press({ key: 'open-story-352' })
  expect(callsOf(terylon.calls, 'story_accept')).toEqual([])
  await ui.press({ key: 'act-story-352-accept' })
  expect(callsOf(terylon.calls, 'story_accept').map(call => call.args)).toEqual([{ story: 352 }])
  expect(await ui.find({ type: 'Text', text: exact('✓ Story 352 is accepted.') })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'accept-352' })).toBeUndefined()

  await ui.press({ key: 'answer-9' })
  expect(await ui.find({ key: 'answer-send' })).toBeDefined()
  await ui.press({ key: 'back' })
  await ui.press({ key: 'open-story-87' })
  expect(await ui.find({ key: 'back' })).toBeDefined()
})

test('AN ACT REFUSED ON THE CARD A ROW OPENED says so there, with Terylon\'s sentence and the console as the way round', async ($, on) => {
  const terylon = world(on)
  terylon.answers.plan_approve = { accepted: false, sentence: 'Plan 41 is already approved.', commandId: 'c1', subjectId: null }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  await ui.press({ key: 'open-plan-41' })
  await ui.press({ key: 'act-plan-41-approve' })
  expect(await ui.find({ type: 'Text', text: exact('Plan 41 is already approved.') })).toBeDefined()
  expect((await ui.findAll({ type: 'Link', text: 'Plan in the console ↗' })).map(link => link.props.href)).toContain('https://terylon.example.ts.net/?view=plan&plan=41')
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'plan-41' })).toBeDefined()
})

test('THE OVERVIEW READS ITS GOALS ON ITS LOAD AND WITH THE POLL WHILE IT IS DRAWN, and a pane nobody opened reads none', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  // NO PANE IS DRAWN: the poll reads what the band needs, no goals.
  await terylon.clock.advance(60000)
  await terylon.clock.settle()
  expect(callsOf(terylon.calls, 'goals_list')).toEqual([])
  expect(callsOf(terylon.calls, 'plans_list')).toEqual([])
  expect(callsOf(terylon.calls, 'metrics')).toEqual([])

  await openCockpit($)
  expect(callsOf(terylon.calls, 'goals_list').length).toBe(1)
  expect(callsOf(terylon.calls, 'plans_list').length).toBe(1)
  expect(callsOf(terylon.calls, 'metrics').length).toBe(1)
  expect(callsOf(terylon.calls, 'memory_get').length).toBe(1)

  // DRAWN, A NEW GOAL COMES WITH THE NEXT POLL, and the 30 days and the memory wait for a load.
  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  expect(await ui.find({ key: 'goal-3' })).toBeDefined()
  terylon.answers.goals_list = { goals: [...GOALS.goals, { id: 30, title: 'New from the chat', priority: 2, state: 'open', stories: {} }] }
  await terylon.clock.advance(30000)
  await terylon.clock.settle()
  expect((await ui.find({ key: 'goal-30' }))?.text).toBe('New from the chat')
  expect(callsOf(terylon.calls, 'metrics').length).toBe(1)

  // A FAILED READ OF THE POLL KEEPS WHAT WAS READ.
  terylon.denied.set('goals_list', 'fetch failed: connect ETIMEDOUT')
  await terylon.clock.advance(30000)
  await terylon.clock.settle()
  expect(await ui.find({ key: 'goal-30' })).toBeDefined()
  expect(await ui.find({ key: 'goals-error' })).toBeUndefined()

  // SAID ON A LOAD, with its reason.
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: exact('Goals did not load') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Reason: .*ETIMEDOUT/ })).toBeDefined()
})

test('MORE: Health and Memory on one page, whichever button opened it, its sources read at once under the bound of a press', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  const before = terylon.calls.length
  terylon.hang.add('memory_get')
  const pressed = ui.press({ key: 'tab-status' })
  await terylon.clock.settle()

  // ALL ASKED AT ONCE: Health drawn while Memory is still not answered.
  expect(terylon.calls.slice(before).map(call => call.tool)).toEqual(expect.arrayContaining(['notices_list', 'metrics', 'memory_get']))
  expect(await ui.find({ type: 'Text', text: exact('Loading the memory…') })).toBeDefined()
  expect(await ui.find({ key: 'status-machine' })).toBeDefined()

  // UNDER DESKTOP'S 10 s BOUND ON A PRESS, the one that does not answer ends as its own error; the others stand.
  await terylon.clock.advance(8000)
  await terylon.clock.settle()
  await pressed
  expect(await ui.find({ type: 'Text', text: exact('The memory did not load') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /did not answer within 8 s/ })).toBeDefined()
  expect(await ui.find({ key: 'status-machine' })).toBeDefined()

  // ITS OWN TRY AGAIN.
  terylon.hang.delete('memory_get')
  await ui.press({ key: 'mem-retry' })
  expect(await ui.find({ key: 'fold-memory-owner' })).toBeDefined()
})

test('MORE on a wide pane: Terylon and the last 30 days side by side, as its board draws them', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: WIDE_DOCK, surface: 'desktop' })
  await pill(ui, 'tab-status')
  expect((await ui.find({ key: 'status-cards' }))?.props.flexDirection).toBe('row')
  expect(await ui.find({ key: 'status-machine' })).toBeDefined()
  expect(await ui.find({ key: 'status-month' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('Slots') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('Cost') })).toBeDefined()

  // POLICY AND DIAGNOSTICS, A PRESS AWAY.
  expect(await ui.find({ key: 'status-policy' })).toBeUndefined()
  expect(await ui.find({ key: 'status-diagnostics' })).toBeUndefined()
  await ui.press({ key: 'fold-policy' })
  await ui.press({ key: 'fold-diagnostics' })
  expect(await ui.find({ key: 'status-policy' })).toBeDefined()
  expect(await ui.find({ key: 'status-diagnostics' })).toBeDefined()
})

test('A GOAL: its road on top with What next, its plan that waits as its card with its acts, its stories, and Add a task under it', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goal_get = () => ({ id: 21, ref: 'G-APPRV', title: 'Household budget', priority: 2, state: 'open', target: 'list', ask: 'A monthly sheet of what we spend.', storyList: [{ id: 60, ref: 'S-ONE', title: 'One', state: 'proposed' }] })
  terylon.answers.goals_list = ROAD_GOALS
  terylon.answers.plans_list = ROAD_PLANS
  terylon.answers.plan_approve = { accepted: true, sentence: 'Approved.', commandId: 'c1', subjectId: 21 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface })
    await toOverview(ui)
    await ui.press({ key: 'goal-21' })

    expect(await ui.find({ type: 'Text', text: exact('GOAL G-APPRV') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('A monthly sheet of what we spend.') })).toBeDefined()
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ Overview')
    expect(await ui.find({ type: 'Link', text: 'Goal in the console ↗' })).toBeDefined()
    expect((await ui.find({ key: 'refresh' }))?.props.label).toBe('Refresh')

    // THE ROAD AND ITS NAMES, THE OWNER'S GATES IN PURPLE; A LIST GOAL'S GATE AN ACCEPTANCE.
    for (const name of ['Plan', 'Build', 'Verify', 'Done']) {
      expect(await ui.find({ type: 'Text', text: exact(name) })).toBeDefined()
    }

    const named = await ui.findAll({ type: 'Text', text: /^(Approve|Your accept)$/ })
    expect(named.every(node => node.props.color === 'merged' || node.props.color === undefined)).toBe(true)
    expect(await ui.find({ type: 'Text', text: exact('What next') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Plan P-58HFX waits for your approval') })).toBeDefined()

    // ITS PLAN, WITH ITS ACTS, RIGHT THERE; NO BUTTON BACK TO THE GOAL IT IS ON.
    expect((await ui.find({ key: 'act-plan-50-approve' }))?.props.label).toBe('Approve')
    expect(await ui.find({ key: 'plan-50-goal' })).toBeUndefined()
    expect(await ui.find({ key: 'goal-story-60' })).toBeDefined()

    // A TASK UNDER THIS GOAL: the new task's form opens with it picked.
    await ui.press({ key: 'fold-add-task' })
    await ui.input({ key: 'quick-add', text: 'A task' })
    expect((await ui.find({ key: 'add-goal' }))?.props.value).toBe('21')
    await ui.press({ key: 'add-cancel' })
    await ui.press({ key: 'fold-add-task' })
    await ui.unmount()
  }

  // ITS ✓ STAYS WHEN THE PLAN'S CARD HAS GONE.
  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  await toOverview(ui)
  await ui.press({ key: 'goal-21' })
  await ui.press({ key: 'act-plan-50-approve' })
  expect(await ui.find({ type: 'Text', text: exact('✓ Approved.') })).toBeDefined()
  expect(await ui.find({ key: 'act-plan-50-approve' })).toBeUndefined()
})

test('a repeating task\'s goal screen draws no road; a closed goal\'s road is done', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goal_get = (args: Record<string, unknown>) => (args.goal === 12
    ? { id: 12, title: 'Daily', priority: 2, state: 'active', storyList: [], repeating: { approved: { version: 1 }, runs: [] } }
    : { id: args.goal, title: 'Closed', priority: 2, state: 'done', storyList: [{ id: 2, title: 'x', state: 'merged' }] })
  terylon.answers.goals_list = { goals: [{ id: 12, title: 'Daily', priority: 2, state: 'active', stories: {} }, { id: 8, title: 'Closed', priority: 2, state: 'done', stories: { merged: 1 } }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  await toOverview(ui)
  await ui.press({ key: 'goal-12' })
  expect(await ui.find({ key: 'goal-road' })).toBeUndefined()
  expect(await ui.find({ key: 'goal-repeating' })).toBeDefined()
  await toOverview(ui)
  await ui.press({ key: 'goals-show-closed' })
  await ui.press({ key: 'goal-8' })
  expect(await ui.find({ key: 'goal-road' })).toBeDefined()
  expect((await pictures(ui))[0]?.alt).toBe('Plan, Approve, Build, Verify, Your merge, Done done')
  expect(await ui.find({ key: 'fold-add-task' })).toBeUndefined()
})

test('A STORY: its road with its names under it, Now working and its acts on it while a run goes, What next when none does', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  await ui.press({ key: 'story-333' })
  expect((await ui.find({ key: 'phase-labels' }))).toBeDefined()
  expect(await ui.find({ key: 'story-working' })).toBeDefined()
  expect(await ui.find({ key: 'story-next' })).toBeUndefined()
  expect(await ui.find({ type: 'Link', text: 'Story in the console ↗' })).toBeDefined()
  expect((await ui.find({ key: 'act-story-333-stop' }))?.props.label).toBe('Stop')
  expect(await ui.find({ key: 'summarise' })).toBeDefined()
  await toRoot(ui)

  // VERIFIED IN A REPOSITORY, it says the merge; no run, no Now working.
  await ui.press({ key: 'merge-327' })
  await ui.press({ key: 'open-story-327' })
  expect(await ui.find({ key: 'story-working' })).toBeUndefined()
  expect(await ui.find({ key: 'story-next' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('Merge in the console') })).toBeDefined()
  expect(STORY_327.state).toBe('verified')
  expect(STORY_333.state).toBe('running')
})

test('A STACK AN EARLIER VERSION KEPT, on a tab that is gone, opens on the overview', async ($, on) => {
  const stale: Record<string, unknown> = { view: { stack: [{ screen: 'goals' }, { screen: 'status' }] } }
  on('state.set', async ($, e, next) => {
    delete stale[String((e as { key?: unknown }).key)]
    return next(e)
  })
  on('state.get', async ($, e, next) => {
    const key = String((e as { key?: unknown }).key)
    return key in stale ? ({ value: { value: stale[key], version: 1 } } as never) : next(e)
  })
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  expect(await ui.find({ key: 'tiles' })).toBeDefined()
  expect(await ui.find({ key: 'back' })).toBeUndefined()
})

test('the plans and stories of the fixtures stand under their goal, so the overview\'s goal card reads them', () => {
  expect(PLANS.plans[0]?.goal).toBe(3)
  expect(STORIES.stories.every(story => story.goal === 3)).toBe(true)
  expect(GOAL_QUESTION.subject).toBe('goal/11')
})

test('a fold stays open across a walk, and each says what it holds', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  await unfold(ui, 'fold-queued')
  await ui.press({ key: 'queued-328' })
  await ui.press({ key: 'back' })
  expect((await foldOf(ui, 'fold-queued'))).toBe('▾ Queued 2')
  expect(await ui.find({ key: 'queued-328' })).toBeDefined()
})

test('AN ACT STILL GOING WHEN ITS CARD IS LEFT says what became of it under Waiting for you, though its row has gone', async ($, on) => {
  const terylon = world(on)
  terylon.answers.plan_approve = { accepted: true, sentence: 'Plan 41: 2 approved, 0 dropped.', commandId: 'c1', subjectId: 3 }
  terylon.hang.add('plan_approve')
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  await ui.press({ key: 'open-plan-41' })
  const pressed = ui.press({ key: 'act-plan-41-approve' })
  await terylon.clock.settle()
  await ui.press({ key: 'back' })

  for (const release of terylon.held.splice(0)) {
    release()
  }

  await pressed
  await terylon.clock.settle()
  expect(await ui.find({ key: 'tiles' })).toBeDefined()
  expect(await ui.find({ key: 'plan-41' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('✓ Plan 41: 2 approved, 0 dropped.') })).toBeDefined()
})
