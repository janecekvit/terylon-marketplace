// THE PRODUCTION RETEST OF 1.6.0 (#39): each pane-side finding held here, in the order the issue lists them. The fourth,
// the suite in any time zone, is held by tests/terylon-pane/zones.test.js at the repository root.

import { test, expect } from 'claude-code/testing'

import { PANE_PROPS, SESSION, chipOf, exact, pictures, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const
const MOUNT = { ...PANE, surface: 'desktop' } as const

// A goal over a repository and a goal in Terylon's own list, as goals_list gives their targets.
const REPOSITORY_GOAL = { id: 3, title: 'P1 · Agentic OS', priority: 1, state: 'open', target: 'github:contoso/agentic-os' }
const LIST_GOAL = { id: 11, title: 'Household budget', priority: 2, state: 'open', target: 'list' }
const TARGET_GOALS = { goals: [REPOSITORY_GOAL, LIST_GOAL] }
const TITLE = 'Health: a Check now button'

type Form = { input: (input: never) => Promise<unknown>; press: (input: never) => Promise<unknown>; select: (input: never) => Promise<unknown> }

async function openNewTask(ui: Form, goal: number): Promise<void> {
  await ui.input({ key: 'quick-add', text: TITLE, kind: 'change' } as never)
  await ui.press({ key: 'quick-open' } as never)
  await ui.select({ key: 'add-goal', value: String(goal) } as never)
}

async function typeFiles(ui: Form, files: string): Promise<void> {
  await ui.input({ key: 'add-files', text: files, kind: 'change' } as never)
}

function sentTasks(calls: { tool: string; args: Record<string, unknown> }[]): Record<string, unknown>[] {
  return calls.filter(call => call.tool === 'tasks_add').map(call => call.args)
}

test('A REPOSITORY GOAL\'S TASK DECLARES ITS FILES: one path per line, sent with the task, and said under ✓ Handed over', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = TARGET_GOALS
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await openNewTask(ui, 3)
  expect((await ui.find({ key: 'add-files' }))?.props.label).toBe('Files (1 to 30, one per line)')

  await typeFiles(ui, 'src/Health/CheckNow.cs\n  src/Health/HealthPage.tsx  \n')
  await ui.press({ key: 'add-send' })

  expect(sentTasks(terylon.calls)).toEqual([{ goal: 3, tasks: [{ title: TITLE, brief: TITLE, criteria: [], files: ['src/Health/CheckNow.cs', 'src/Health/HealthPage.tsx'], size: 'M' }] }])
  expect(await ui.find({ type: 'Text', text: exact('Files: src/Health/CheckNow.cs · src/Health/HealthPage.tsx') })).toBeDefined()
})

test('A REPOSITORY GOAL\'S TASK IS CHECKED BEFORE IT IS SENT: no files, a blank line, or more than 30 sends nothing and says why', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = TARGET_GOALS
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await openNewTask(ui, 3)

  for (const [files, problem] of [
    ['', 'A task over a repository declares 1 to 30 files it will change, one per line.'],
    ['src/a.ts\n\nsrc/b.ts', 'Files: line 2 is blank. Write one path per line, with no blank line between.'],
    [Array.from({ length: 31 }, (_, index) => `src/file${index + 1}.ts`).join('\n'), 'Files: 31 paths; a task declares at most 30.'],
  ] as const) {
    await typeFiles(ui, files)
    await ui.press({ key: 'add-send' })
    expect(await ui.find({ key: 'add-files' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact(problem) }))?.props.color).toBe('error')
  }

  expect(sentTasks(terylon.calls)).toEqual([])

  // THIRTY IS STILL A TASK: the bound is inclusive.
  await typeFiles(ui, Array.from({ length: 30 }, (_, index) => `src/file${index + 1}.ts`).join('\n'))
  await ui.press({ key: 'add-send' })
  expect(((sentTasks(terylon.calls)[0]?.tasks as { files: string[] }[])[0]?.files ?? []).length).toBe(30)
})

test('A LIST GOAL\'S TASK HAS NO FILES: the field is not drawn and files: [] is sent', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = TARGET_GOALS
  await $.session.start(SESSION)
  await terylon.clock.settle()

  // The new task's fields are drawn where the surface has an Input, the desktop.
  const ui = await $.ui.mount(MOUNT)
  await openNewTask(ui, 3)
  expect(await ui.find({ key: 'add-files' })).toBeDefined()
  await ui.select({ key: 'add-goal', value: '11' })
  expect(await ui.find({ key: 'add-files' })).toBeUndefined()
  await ui.press({ key: 'add-send' })
  expect(sentTasks(terylon.calls)).toEqual([{ goal: 11, tasks: [{ title: TITLE, brief: TITLE, criteria: [], files: [], size: 'M' }] }])
})

// A story kept in Terylon's own list, verified: its briefing entry names no target and no environment, and story_get
// says where it is kept.
const LIST_STORY = { id: 352, goal: 11, title: 'Weekly cost summary', state: 'verified', target: 'list', attempt: 1, pullRequest: null, timeline: [] }

function withListStory(terylon: ReturnType<typeof world>): void {
  terylon.answers.briefing = {
    briefing: 'x',
    plansWaiting: [],
    questionsOpen: [],
    storiesVerified: [{ id: 327, title: 'Events since the last look', environment: { name: 'pr-196', url: 'https://x' } }, { id: 352, title: 'Weekly cost summary', environment: null }],
    storiesBlocked: [],
    leader: { paused: false },
    unhandledNotices: 0,
  }
  const repository = terylon.answers.story_get as (args: Record<string, unknown>) => unknown
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 352 ? LIST_STORY : repository(args))
}

test('A VERIFIED LIST STORY WAITS FOR AN ACCEPTANCE: its row, kind and words say accept and lead to its card\'s Accept', async ($, on) => {
  const terylon = world(on)
  withListStory(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    // The pane opens where it was left; each surface starts on the queue.
    await $.command.run({ command: 'terylon-pane', args: '' } as never)
    const ui = await $.ui.mount({ ...PANE, surface })
    const row = await ui.find({ key: 'accept-352' })
    expect(row?.text).toMatch(/accept/)
    expect(row?.text).not.toMatch(/merge/i)
    expect(row?.text).toMatch(/#352 Weekly cost summary · verified · waiting for your acceptance/)
    expect(await ui.find({ key: 'merge-352' })).toBeUndefined()
    if (surface === 'desktop') {
      expect((await chipOf(ui, 'accept-352'))?.dot).toBe('success')
    }

    // A REPOSITORY STORY KEEPS ITS MERGE: the row, its kind and its link to the console.
    expect((await ui.find({ key: 'merge-327' }))?.text).toMatch(/merge[\s\S]*verified in pr-196 · waiting for merge/)

    // THE CARD'S HINT names both, as both wait.
    expect(await ui.find({ type: 'Text', text: exact('decide here · merge in the console, accept on its card') })).toBeDefined()

    await ui.unmount()
  }

  // THE ROW OPENS UNDER ITSELF and leads to its story's card, where Accept is; no link sends it to a merge.
  await $.command.run({ command: 'terylon-pane', args: '' } as never)
  const ui = await $.ui.mount(MOUNT)
  const mergeLinks = async () => (await ui.findAll({ type: 'Link' })).filter(link => String(link.props.href).includes('merge&story=352'))
  await ui.press({ key: 'accept-352' })
  expect(await mergeLinks()).toEqual([])
  await ui.press({ key: 'open-story-352' })
  expect((await ui.find({ key: 'act-story-352-accept' }))?.props.label).toBe('Accept')
  expect(await mergeLinks()).toEqual([])
  expect(await ui.find({ type: 'Link', text: 'Merge in the console ↗' })).toBeUndefined()

  // NO MERGE IS ASKED FOR in the catch-up summary either: the list story is accepted.
  expect(terylon.calls.filter(call => call.tool === 'story_merge')).toEqual([])
})

test('A VERIFIED LIST STORY\'S CARD SAYS ACCEPT IN ITS STEPPER: the last phase is Accept, never Merge — your gate', async ($, on) => {
  const terylon = world(on)
  withListStory(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'accept-352' })
  await ui.press({ key: 'open-story-352' })
  expect(await ui.find({ type: 'Text', text: /Merge/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('Accept') })).toBeDefined()
  expect((await pictures(ui)).some(picture => /Merge/.test(picture.source) || /Merge/.test(picture.alt))).toBe(false)
})

test('A LIST STORY\'S PHASES HAVE NO PULL REQUEST: verdict, then Accept; a repository story keeps its Pull req.', async ($, on) => {
  const terylon = world(on)
  withListStory(terylon)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.press({ key: 'accept-352' })
  await ui.press({ key: 'open-story-352' })
  // Its briefing names no stage, so only Admitted is drawn done; the phases are seven, the pull request not among them.
  expect((await pictures(ui))[0]?.alt).toBe('Admitted done; Plan, Develop, Review, Tests, Verified, Accept to come')
  expect(await ui.find({ type: 'Text', text: /Pull req/ })).toBeUndefined()
  expect((await pictures(ui)).some(picture => /Pull request/.test(picture.source))).toBe(false)
  expect(await ui.find({ type: 'Text', text: / of 7\b/ })).toBeDefined()

  // THE REPOSITORY STORY BESIDE IT still passes through its pull request on the way to the merge.
  await ui.unmount()
  await $.command.run({ command: 'terylon-pane', args: '' } as never)
  const queue = await $.ui.mount(MOUNT)
  await queue.press({ key: 'merge-327' })
  await queue.press({ key: 'open-story-327' })
  expect((await pictures(queue))[0]?.alt).toMatch(/Tests, Pull req\., Verified/)
})

// A plan of one story, as the owner's screenshot showed it: "○ M" above "● 1 <title> M".
const ONE_STORY_PLAN = {
  plans: [
    {
      id: 145,
      goal: 3,
      goalTitle: 'Agentic OS',
      state: 'proposed',
      estimateUsd: 5,
      comment: null,
      stories: [{ id: 360, title: 'TEST 6: one story', criteria: [], files: ['src/a.ts'], size: 'M', estimateUsd: null, runsAfter: [], after: [] }],
    },
  ],
}

test('THE PLAN CARD DRAWS NO STRAY SIZE NODE: the size is said once, on its story\'s row, on the desktop and the terminal', async ($, on) => {
  const terylon = world(on)
  terylon.answers.plans_list = ONE_STORY_PLAN
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-goals' })
    expect((await ui.find({ key: 'plan-145-story-360' }))?.text).toMatch(/^\s*(?:●\s+)?1\s+TEST 6: one story\s+M$/)
    // ONE STORY HAS NO ORDER: no chain is drawn, and no size stands beside it.
    expect(await ui.find({ key: 'plan-145-chain' })).toBeUndefined()
    expect((await pictures(ui)).filter(picture => picture.alt.startsWith('TEST 6'))).toEqual([])
    await ui.unmount()
  }
})

test('A PLAN OF SEVERAL STORIES draws its order alone: each size is on its story\'s row, never beside the chain', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-goals' })
    expect(await ui.find({ key: 'plan-41-chain' })).toBeDefined()
    // THE ONLY ARROWS ARE THE ORDER'S: the chain is an Svg on the desktop, "1 → 2" on the terminal.
    expect((await ui.findAll({ type: 'Text' })).map(node => node.text).filter(words => words.includes('→'))).toEqual(surface === 'desktop' ? [] : ['1 → 2'])
    expect(await ui.find({ type: 'Text', text: exact('S · ~$3') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('M · ~$5 · after Health: tlačítko Check now') })).toBeDefined()
    await ui.unmount()
  }
})
