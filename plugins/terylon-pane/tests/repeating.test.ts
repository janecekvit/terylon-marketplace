// A REPEATING TASK'S GOAL (Terylon S43): goal_get carries `repeating`, and the goal's screen draws one card for it in
// place of the stories card: the summary, the newest run in a box with its link, the older runs, the foot and the
// task's sheet in the console. Desktop drops a whole tab it cannot draw, so a malformed answer is held here too.

import { test, expect } from 'claude-code/testing'

import { repeatingOf, runDay, taskVersionOf } from '../hooks/queue'

import { BASE, BRIEFING, NARROW_PANE_PROPS, PANE_PROPS, SESSION, exact, hostZoneOffset, lateOnTheLocalDayOf, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The newest run's start; the world's clock stands late on its local day, wherever the test runs.
const NEWEST = '2026-10-28T05:00:00Z'
const NOW = lateOnTheLocalDayOf(NEWEST)

// What the pane should say for `iso`, computed through the host's own offset: "Today 06:00" or "27 Oct 06:00" in Prague.
function localDay(iso: string, isToday: boolean): string {
  const moment = Date.parse(iso)
  const local = new Date(moment - hostZoneOffset(moment) * 60000)
  const time = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`

  return isToday ? `Today ${time}` : `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]} ${time}`
}

const REPEATING = {
  approved: { version: 1, title: 'Daily forex statistics', runBudgetUsd: 0.5, autoAccept: true },
  waiting: null,
  paused: null,
  runs: [
    { story: 88, run: 'r15', state: 'accepted', startedAt: NEWEST, costUsd: 0.21, files: [{ name: 'forex-2026-10-28.xlsx' }, { name: 'chart.png' }] },
    { story: 87, run: 'r14', state: 'merged', startedAt: '2026-10-27T05:00:00Z', costUsd: 0.19, files: [{ name: 'forex-2026-10-27.xlsx' }] },
    { story: 86, run: 'r13', state: 'blocked', startedAt: '2026-10-26T05:00:00Z', costUsd: 0.5, files: [] },
    { story: 85, run: 'r12', state: 'verified', startedAt: '2026-10-25T05:00:00Z', costUsd: 0.2, files: [] },
    { story: 84, run: 'r11', state: 'abandoned', startedAt: '2026-10-24T05:00:00Z', costUsd: 0, files: [] },
  ],
}

// A goal_get answer for a repeating task's goal, over `repeating`.
function repeatingGoal(repeating: unknown) {
  return { id: 12, title: 'Daily forex statistics', priority: 2, state: 'active', storyList: [{ id: 88, title: 'Run 15', state: 'accepted', source: 'routine' }], repeating }
}

// The world, with goal 12 among the open goals and goal_get answering `repeating` for it.
function repeatingWorld(on: Parameters<typeof world>[0], repeating: unknown) {
  const terylon = world(on, { now: NOW })
  terylon.answers.goals_list = { goals: [{ id: 12, title: 'Daily forex statistics', priority: 2, state: 'active', stories: { accepted: 1 } }], closedCount: 0 }
  terylon.answers.goal_get = (args: Record<string, unknown>) => (args.goal === 12 ? repeatingGoal(repeating) : { id: args.goal, title: 'Other', priority: 2, state: 'open', storyList: [] })

  return terylon
}

type Node = { type?: string; props?: Record<string, unknown>; children?: unknown[]; text?: string }

// Every value drawn that Desktop could not draw: a NaN, an undefined text, a Date, a word that says one slipped through.
function undrawable(node: unknown, found: string[] = []): string[] {
  if (typeof node === 'number' && !Number.isFinite(node)) {
    found.push(String(node))
  } else if (typeof node === 'string' && /\bNaN\b|\bundefined\b|Invalid Date/.test(node)) {
    found.push(node)
  } else if (node instanceof Date) {
    found.push('Date')
  } else if (Array.isArray(node)) {
    node.forEach(child => undrawable(child, found))
  } else if (node !== null && typeof node === 'object') {
    const element = node as Node
    Object.values(element.props ?? {}).forEach(value => (typeof value === 'function' ? null : undrawable(value, found)))
    undrawable(element.children ?? [], found)
  }

  return found
}

async function openGoal12(ui: { press: (query: { key: string }) => Promise<unknown> }) {
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goal-12' })
}

for (const [surface, props] of [['desktop', PANE_PROPS], ['terminal', PANE_PROPS], ['narrow dock', NARROW_PANE_PROPS]] as const) {
  test(`${surface}: a repeating task's goal draws its card in place of the stories card`, async ($, on) => {
    const terylon = repeatingWorld(on, REPEATING)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: surface === 'terminal' ? 'terminal' : 'desktop' })
    await openGoal12(ui)

    expect(await ui.find({ key: 'goal-repeating' })).toBeDefined()
    expect(await ui.find({ key: 'goal-stories' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: exact('repeating') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Approved version 1 · up to $0.50 a run · green runs accepted by themselves') })).toBeDefined()

    // THE NEWEST RUN, in its own box: its day, its state, its files and cost, and the link to its story.
    const newest = await ui.find({ key: 'repeating-newest' })
    expect(newest).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact(localDay(NEWEST, true)) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('green · accepted') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('forex-2026-10-28.xlsx · chart.png · $0.21') })).toBeDefined()
    expect((await ui.find({ key: 'repeating-run-88' }))?.props.label).toBe('Open the run ↗')

    // THE OLDER RUNS, a row each: the day the press, the state a Text of its own beside it, in its tone. Desktop draws a
    // Button's label in one colour, so the state is never inside it.
    const olderRuns = [[87, '2026-10-27T05:00:00Z', 'green · accepted', 'subtle'], [86, '2026-10-26T05:00:00Z', 'red · waits for you', 'warning'], [85, '2026-10-25T05:00:00Z', 'green · waits for you', 'warning'], [84, '2026-10-24T05:00:00Z', 'abandoned', 'subtle']] as const
    for (const [index, [story, iso, state, tone]] of olderRuns.entries()) {
      const press = await ui.find({ key: `repeating-run-${story}` })
      expect(press?.type).toBe('Button')
      expect(press?.props.label).toBe(localDay(iso, false))
      expect(press?.text ?? '').not.toContain(state)
      expect((await ui.find({ key: `repeating-older-${index}` }))?.text).toContain(state)
      const words = await ui.findAll({ type: 'Text', text: exact(surface === 'narrow dock' ? ` · ${state}` : state) })
      expect(words.map(word => word.props.color)).toContain(tone)
    }

    // THE NEWEST RUN IN ITS COLOUR, an older one that went well quiet, one that waits amber. The narrow dock folds an
    // older run's state into its title instead.
    if (surface !== 'narrow dock') {
      expect((await ui.findAll({ type: 'Text', text: exact('green · accepted') })).map(node => node.props.color)).toEqual(['success', 'subtle'])
      expect((await ui.find({ type: 'Text', text: exact('red · waits for you') }))?.props.color).toBe('warning')
    }

    expect(await ui.find({ type: 'Text', text: exact('Started by your routine; Terylon keeps no clock.') })).toBeDefined()
    expect((await ui.find({ type: 'Link', text: 'The task in the console ↗' }))?.props.href).toBe(`${BASE}/?cockpit=waiting&task=12`)
    expect(undrawable(await ui.drawn())).toEqual([])
  })
}

test('the newest run and an older one each open their story', async ($, on) => {
  const terylon = repeatingWorld(on, REPEATING)
  terylon.answers.story_get = (args: Record<string, unknown>) => ({ id: args.story, goal: 12, title: `Run of story ${String(args.story)}`, state: 'accepted', source: 'routine', pullRequest: null, timeline: [] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openGoal12(ui)
  await ui.press({ key: 'repeating-run-88' })
  expect(terylon.calls.filter(call => call.tool === 'story_get').map(call => call.args)).toContainEqual({ story: 88 })
  expect(await ui.find({ type: 'Text', text: exact('#88 Run of story 88') })).toBeDefined()

  await ui.press({ key: 'back' })
  await ui.press({ key: 'repeating-run-86' })
  expect(await ui.find({ type: 'Text', text: exact('#86 Run of story 86') })).toBeDefined()
})

test('the summary says when green runs wait for the owner, when the task is paused, and a version waiting', async ($, on) => {
  const terylon = repeatingWorld(on, { ...REPEATING, approved: { ...REPEATING.approved, autoAccept: false }, paused: '2026-10-28T08:00:00Z', waiting: { version: 2 } })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openGoal12(ui)
  expect(await ui.find({ type: 'Text', text: exact('Approved version 1 · up to $0.50 a run · green runs wait for you · paused · version 2 waits for you') })).toBeDefined()
})

test('a task with no run yet says so, and a goal without repeating keeps its stories card', async ($, on) => {
  const terylon = repeatingWorld(on, { ...REPEATING, runs: [] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openGoal12(ui)
  expect(await ui.find({ type: 'Text', text: exact('No run yet: your routine starts each one.') })).toBeDefined()
  expect(await ui.find({ key: 'repeating-newest' })).toBeUndefined()

  terylon.answers.goal_get = repeatingGoal(null)
  await ui.press({ key: 'back' })
  await ui.press({ key: 'goal-12' })
  expect(await ui.find({ key: 'goal-repeating' })).toBeUndefined()
  expect(await ui.find({ key: 'goal-stories' })).toBeDefined()
})

for (const [surface, props] of [['desktop', PANE_PROPS], ['terminal', PANE_PROPS], ['narrow dock', NARROW_PANE_PROPS]] as const) {
  test(`${surface}: a malformed repeating answer draws, never throws, and puts nothing undrawable on the card`, async ($, on) => {
    const terylon = repeatingWorld(on, {
      approved: { version: 'two', title: 7, runBudgetUsd: 'NaN', autoAccept: 'yes' },
      waiting: 'soon',
      paused: 0,
      runs: [
        null,
        5,
        { story: 90, state: 'replaying', startedAt: 'never', costUsd: Number.NaN, files: 'chart.png' },
        { story: '89', state: 42, startedAt: 1730000000000, costUsd: '0.30', files: [null, { name: 3 }, 'raw.csv', { name: 'sheet.xlsx' }] },
        { state: 'merged' },
      ],
    })
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: surface === 'terminal' ? 'terminal' : 'desktop' })
    await openGoal12(ui)

    expect(await ui.find({ key: 'goal-repeating' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Approved version two · green runs wait for you') })).toBeDefined()
    // AN UNKNOWN STATE IS DRAWN AS RUNNING, and a time that cannot be read as "?".
    expect(await ui.find({ type: 'Text', text: exact('running') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('?') })).toBeDefined()
    expect((await ui.find({ key: 'repeating-run-90' }))?.props.label).toBe('Open the run ↗')
    // A story id that is not a number opens nothing, and the run is still drawn.
    expect(await ui.find({ key: 'repeating-run-89' })).toBeUndefined()
    expect(await ui.find({ key: 'repeating-older-0' })).toBeDefined()
    expect(undrawable(await ui.drawn())).toEqual([])
  })
}

test('two runs of one story each draw, under keys of their own, and both open the story', async ($, on) => {
  const [first, second] = REPEATING.runs
  const terylon = repeatingWorld(on, { ...REPEATING, runs: [first, { ...second, story: 88 }, { ...second, story: 88, startedAt: '2026-10-26T05:00:00Z' }] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openGoal12(ui)
  expect((await ui.findAll({ type: 'Button' })).map(button => button.key).filter(key => String(key).startsWith('repeating-run-'))).toEqual(['repeating-run-88', 'repeating-run-88-1', 'repeating-run-88-2'])
  expect(undrawable(await ui.drawn())).toEqual([])
})

test('a repeating answer that is not an object is an ordinary goal', async ($, on) => {
  const terylon = repeatingWorld(on, ['not', 'an', 'object'])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openGoal12(ui)
  expect(await ui.find({ key: 'goal-repeating' })).toBeUndefined()
  expect(await ui.find({ key: 'goal-stories' })).toBeDefined()
})

test('a plan with no stories, under a repeating task, draws', async ($, on) => {
  const terylon = repeatingWorld(on, REPEATING)
  terylon.answers.plans_list = { plans: [{ id: 60, goal: 12, goalTitle: 'Daily forex statistics', state: 'proposed', estimateUsd: null, comment: null, stories: [] }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openGoal12(ui)
  await ui.press({ key: 'goal-plan-60' })
  expect(await ui.find({ key: 'back' })).toBeDefined()
  expect(undrawable(await ui.drawn())).toEqual([])
})

test('runDay reads today and another day in the given offset, and "?" for a time it cannot read', () => {
  const now = Date.parse('2026-10-28T22:00:00Z')

  expect(runDay('2026-10-28T05:00:00Z', now, 0)).toBe('Today 05:00')
  expect(runDay('2026-10-27T05:00:00Z', now, 0)).toBe('27 Oct 05:00')
  // Prague, an hour east: 22:00 UTC is the next day there.
  expect(runDay('2026-10-28T05:00:00Z', now, -120)).toBe('28 Oct 07:00')
  expect(runDay('2026-10-28T23:30:00Z', now, -120)).toBe('Today 01:30')
  // New York, four hours west.
  expect(runDay('2026-10-28T02:00:00Z', now, 240)).toBe('27 Oct 22:00')
  expect(runDay(undefined, now, 0)).toBe('?')
  expect(runDay('never', now, 0)).toBe('?')
  expect(runDay('2026-10-28T05:00:00Z', Number.NaN, 0)).toBe('?')
})

test('repeatingOf is null for a goal that is not repeating, and tolerates what it cannot read', () => {
  expect(repeatingOf({ id: 3 }, BASE, NOW)).toBeNull()
  expect(repeatingOf({ id: 3, repeating: null }, BASE, NOW)).toBeNull()
  expect(repeatingOf({ id: 3, repeating: 'yes' }, BASE, NOW)).toBeNull()

  const empty = repeatingOf({ id: 12, title: 'Forex', repeating: {} }, BASE, NOW)
  expect(empty).toEqual({ title: 'Forex', summary: 'No version approved yet', runs: [], console: `${BASE}/?cockpit=waiting&task=12` })
})

// A REPEATING TASK'S VERSION PLAN as plans_list answers it in production (Terylon S43): a `repeating` object and no
// stories. Approving it approves the version each later run uses.
const LIVE_VERSION_PLAN = {
  id: 2573, goal: 39, goalTitle: 'TEST PR54: repeating-task card (2026-10-29)', target: 'list', attempt: 0, source: 'owner', revision: null, state: 'approved', comment: null,
  proposedAt: '2026-10-29T14:56:30.8742132+00:00', decidedAt: '2026-10-29T16:08:52.5860259+00:00', estimateUsd: 0,
  repeating: {
    version: 2, plan: 2573, title: 'TEST PR54: sum the amounts',
    brief: 'The run is given a CSV with columns item,amount as its input. Add up the amount column and reply with exactly TOTAL=<sum>, nothing else. Version 2: also accept a header row in any case.',
    criteria: ["The final answer is TOTAL= followed by the correct sum of the amount column of this run's input"],
    size: 'M', runBudgetUsd: 1, autoAccept: true, state: 'approved', proposedAt: '2026-10-29T14:56:30.8742132+00:00', decidedAt: '2026-10-29T16:08:52.5860259+00:00',
  },
  stories: [],
  hidden: false,
}

// The same plan under this world's goal 12, as it waited for the owner.
const VERSION_PLAN = { ...LIVE_VERSION_PLAN, goal: 12, state: 'proposed', repeating: { ...LIVE_VERSION_PLAN.repeating, state: 'proposed' } }

for (const [surface, props] of [['desktop', PANE_PROPS], ['terminal', PANE_PROPS], ['narrow dock', NARROW_PANE_PROPS]] as const) {
  test(`${surface}: a version plan waits on the Queue as the version it approves, with no story count`, async ($, on) => {
    const terylon = repeatingWorld(on, REPEATING)
    terylon.answers.briefing = { ...BRIEFING, plansWaiting: [{ id: 2573, goal: 12, goalTitle: VERSION_PLAN.goalTitle, stories: 0, estimateUsd: 0, repeating: VERSION_PLAN.repeating }] }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: surface === 'terminal' ? 'terminal' : 'desktop' })
    expect(await ui.find({ type: 'Text', text: /Plan 2573 · version 2 of TEST PR54: sum the amounts/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0 stories|~\$0/ })).toBeUndefined()
    await ui.press({ key: 'plan-2573' })
    expect(await ui.find({ type: 'Text', text: exact('to approve · up to $1.00 a run · green runs accepted by themselves') })).toBeDefined()
  })
}

test('a version plan Terylon names no version of waits as a new version, never as 0 stories', async ($, on) => {
  const terylon = repeatingWorld(on, REPEATING)
  terylon.answers.briefing = { ...BRIEFING, plansWaiting: [{ id: 2573, goal: 12, goalTitle: 'Daily forex statistics', stories: 0, estimateUsd: null }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Plan 2573 · a new version of Daily forex statistics/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /0 stories/ })).toBeUndefined()
})

test('a version plan\'s card says what Approve does to later runs, never "all 0 stories"', async ($, on) => {
  const terylon = repeatingWorld(on, REPEATING)
  terylon.answers.plans_list = { plans: [VERSION_PLAN] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openGoal12(ui)
  await ui.press({ key: 'goal-plan-2573' })

  expect(await ui.find({ type: 'Text', text: exact('Approve: each later task_run uses version 2.') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /0 stories|its story|both stories/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact(' · version 2 of TEST PR54: sum the amounts') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('up to $1.00 a run · green runs accepted by themselves') })).toBeDefined()
  expect((await ui.find({ type: 'Link', text: 'Plan in the console ↗' }))?.props.href).toBe(`${BASE}/?cockpit=plan&plan=2573`)
  expect(await ui.find({ type: 'Button', text: /Approve/ })).toBeDefined()
  expect(undrawable(await ui.drawn())).toEqual([])
})

for (const [surface, props] of [['desktop', PANE_PROPS], ['terminal', PANE_PROPS], ['narrow dock', NARROW_PANE_PROPS]] as const) {
  test(`${surface}: a repeating task's settled version plans are one line in its card; a version that waits stays below`, async ($, on) => {
    const terylon = repeatingWorld(on, REPEATING)
    const settled = (id: number, version: number, state: string) => ({ ...LIVE_VERSION_PLAN, id, goal: 12, state, repeating: { ...LIVE_VERSION_PLAN.repeating, version, plan: id, state } })
    terylon.answers.plans_list = { plans: [settled(2573, 2, 'approved'), settled(2536, 1, 'approved'), settled(2590, 3, 'withdrawn'), settled(2600, 4, 'proposed')] }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: surface === 'terminal' ? 'terminal' : 'desktop' })
    await openGoal12(ui)

    expect(await ui.find({ type: 'Text', text: exact('Versions: 1 (plan 2536), 2 (plan 2573), 3 withdrawn (plan 2590)') })).toBeDefined()
    for (const id of [2536, 2573, 2590]) {
      expect(await ui.find({ key: `goal-plan-${id}` })).toBeUndefined()
    }
    expect(await ui.find({ key: 'goal-plan-2600' })).toBeDefined()
    expect(undrawable(await ui.drawn())).toEqual([])
  })
}

test('A SETTLED VERSION PLAN leaves the Goals tab, an approved one as a withdrawn one does; a version that waits stays there as an act', async ($, on) => {
  const terylon = repeatingWorld(on, REPEATING)
  const version = (id: number, number: number, state: string) => ({ ...LIVE_VERSION_PLAN, id, goal: 12, state, repeating: { ...LIVE_VERSION_PLAN.repeating, version: number, plan: id, state } })
  terylon.answers.plans_list = { plans: [version(3661, 1, 'approved'), version(3700, 2, 'proposed')] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await terylon.clock.settle()

  expect(await ui.find({ key: 'plan-3661' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Plan 3661/ })).toBeUndefined()
  expect(await ui.find({ key: 'plan-3700' })).toBeDefined()
})

test('an ordinary goal keeps every plan below it', async ($, on) => {
  const terylon = repeatingWorld(on, null)
  terylon.answers.plans_list = { plans: [{ ...LIVE_VERSION_PLAN, goal: 12 }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openGoal12(ui)
  expect(await ui.find({ key: 'goal-plan-2573' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Versions:/ })).toBeUndefined()
})

test('taskVersionOf reads the live plan: its version, the task\'s title and its terms', () => {
  expect(taskVersionOf(LIVE_VERSION_PLAN)).toEqual({ version: '2', title: 'TEST PR54: sum the amounts', terms: 'up to $1.00 a run · green runs accepted by themselves' })
  expect(taskVersionOf({ ...LIVE_VERSION_PLAN, repeating: { title: 'No version', autoAccept: false } })).toEqual({ version: null, title: 'No version', terms: 'green runs wait for you' })
  expect(taskVersionOf({ ...LIVE_VERSION_PLAN, repeating: 'not an object', state: 'withdrawn' })).toBeNull()
  expect(taskVersionOf({ ...LIVE_VERSION_PLAN, repeating: ['a'], state: 'proposed' })).toEqual({ version: null, title: null, terms: null })
  expect(taskVersionOf({ id: 9, state: 'approved', stories: [{ id: 1 }], repeating: null })).toBeNull()
})

test('taskVersionOf: repeating names the version; no stories while waiting is a version too; a set-aside plan is not', () => {
  expect(taskVersionOf({ id: 1, stories: [], repeating: { version: 2 } })).toEqual({ version: '2', title: null, terms: 'green runs wait for you' })
  expect(taskVersionOf({ id: 1, stories: 3, repeating: { version: 'two' } })?.version).toBe('two')
  expect(taskVersionOf({ id: 1, stories: 0 })).toEqual({ version: null, title: null, terms: null })
  expect(taskVersionOf({ id: 1, state: 'proposed', stories: [] })).toEqual({ version: null, title: null, terms: null })
  expect(taskVersionOf({ id: 1, state: 'proposed', stories: [{ id: 5 }] })).toBeNull()
  expect(taskVersionOf({ id: 1, state: 'withdrawn', stories: [] })).toBeNull()
  expect(taskVersionOf({ id: 1, state: 'rethink', stories: [] })).toBeNull()
  expect(taskVersionOf({ id: 1, stories: 2 })).toBeNull()
  expect(taskVersionOf({ id: 1, repeating: 'yes', stories: 1 })).toBeNull()
})
