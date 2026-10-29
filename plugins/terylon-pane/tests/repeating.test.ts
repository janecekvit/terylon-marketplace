// A REPEATING TASK'S GOAL (Terylon S43): goal_get carries `repeating`, and the goal's screen draws one card for it in
// place of the stories card: the summary, the newest run in a box with its link, the older runs, the foot and the
// task's sheet in the console. Desktop drops a whole tab it cannot draw, so a malformed answer is held here too.

import { test, expect } from 'claude-code/testing'

import { repeatingOf, runDay } from '../hooks/queue'

import { BASE, NARROW_PANE_PROPS, PANE_PROPS, SESSION, exact, hostZoneOffset, lateOnTheLocalDayOf, world } from './fixtures'

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

    // THE OLDER RUNS, a row each: the day, and the state in words.
    for (const [story, iso, state] of [[87, '2026-10-27T05:00:00Z', 'green · accepted'], [86, '2026-10-26T05:00:00Z', 'red · waits for you'], [85, '2026-10-25T05:00:00Z', 'green · waits for you'], [84, '2026-10-24T05:00:00Z', 'abandoned']] as const) {
      const row = await ui.find({ key: `repeating-run-${story}` })
      expect(row?.text).toContain(localDay(iso, false))
      expect(row?.text).toContain(state)
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
  terylon.answers.plans_list = { plans: [{ id: 60, goal: 12, goalTitle: 'Daily forex statistics', state: 'approved', estimateUsd: null, comment: null, stories: [] }] }
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
