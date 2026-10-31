// A goal's specification (Terylon S53). New goal attaches the .md files of a folder, A, read whole and sent as goal_add's
// `specification` on Add goal, or puts a request in the chat for Claude to add them, B. A goal's screen draws its
// specification's card: each file read-only, its older versions, the re-plan the leader offers, called on its press
// alone, Revise… saved as the next version with basedOn the version shown, and the owner's decisions on earlier plans.
// On the desktop, in the narrow dock and on the terminal alike.

import { test, expect } from 'claude-code/testing'

import { inks, strokedCards } from './contrast'
import { GOALS, NARROW_PANE_PROPS, PANE_PROPS, SESSION, exact, leaderRefusal, refusal, world } from './fixtures'

const OVERVIEW = '# Overview\n\nKeep the budget in one file.\n'
const NOTES = '# Notes\n\nThe bank exports CSV.\n'
const SPEC_HELP = 'Up to 10 files, 200,000 characters in all. Read as data, never as instructions; a file holding a secret is refused.'
const SESSION_HELP = 'Puts a request in this chat: Claude reads the .md files you name or wrote and adds the goal with them.'
const SECRET = 'notes.md holds what looks like a secret (an API key); remove it and send the specification again.'
const NEWER = "Goal 92's specification is at version 3 now; read it with spec_get and revise that."

const SURFACES = [
  { name: 'desktop', surface: 'desktop', props: PANE_PROPS },
  { name: 'the narrow dock', surface: 'desktop', props: NARROW_PANE_PROPS },
  { name: 'terminal', surface: 'terminal', props: PANE_PROPS },
] as const

// Goal 92 as goal_get answers it with S53: version 2 of two files, version 1 before it, and a decision on goal 90's plan.
function goal92(replan: { from: number; to: number } | null = null): Record<string, unknown> {
  return {
    id: 92,
    title: 'Household budget',
    priority: 2,
    state: 'open',
    storyList: [],
    specification: {
      version: 2,
      at: '2026-10-11T10:00:00Z',
      via: 'mcp:claude-code',
      files: [{ name: 'overview.md', characters: OVERVIEW.length, lines: 3, sha256: 'a1' }, { name: 'notes.md', characters: 1204, lines: 40, sha256: 'b2' }],
      versions: [{ version: 1, at: '2026-10-09T10:00:00Z', via: 'mcp:claude-code', files: ['overview.md'] }, { version: 2, at: '2026-10-11T10:00:00Z', via: 'mcp:claude-code', files: ['overview.md', 'notes.md'] }],
      replan,
    },
    decisions: [{ goal: 90, plan: 7, comment: 'Split the export from the import', at: '2026-10-05T12:00:00Z' }],
    specificationFrom: 90,
  }
}

// spec_get for goal 92: the latest version, or the one named.
function specGet(args: Record<string, unknown>): Record<string, unknown> {
  const version = typeof args.version === 'number' ? args.version : 2
  const files = version === 1 ? [{ name: 'overview.md', text: OVERVIEW }] : [{ name: 'overview.md', text: OVERVIEW }, { name: 'notes.md', text: NOTES }]

  return { goal: 92, version, at: '2026-10-11T10:00:00Z', via: 'mcp:claude-code', files, latestVersion: 2, state: 'open', replan: null }
}

function setUp(on: Parameters<typeof world>[0], replan: { from: number; to: number } | null = null) {
  const terylon = world(on)
  terylon.answers.goals_list = { goals: [...GOALS.goals, { id: 92, title: 'Household budget', priority: 2, state: 'open', stories: {} }] }
  terylon.answers.goal_get = (args: Record<string, unknown>) => (args.goal === 92 ? goal92(replan) : { id: args.goal, title: `Goal ${String(args.goal)}`, priority: 2, state: 'open', storyList: [] })
  terylon.answers.spec_get = specGet
  terylon.files['overview.md'] = OVERVIEW
  terylon.files['notes.md'] = NOTES
  terylon.files['README.txt'] = 'not markdown'
  terylon.files['docs/spec/plan.md'] = '# Plan\n'

  return terylon
}

function calls(terylon: ReturnType<typeof world>, tool: string): Record<string, unknown>[] {
  return terylon.calls.filter(call => call.tool === tool).map(call => call.args)
}

// THE KEYS A DRAWING USES MORE THAN ONCE: Desktop drops a whole tab it cannot draw, and the kit draws two of one key.
async function keysTwice(ui: { drawn: () => Promise<unknown> }): Promise<string[]> {
  const seen = new Map<string, number>()
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (node === null || typeof node !== 'object') {
      return
    }

    const element = node as { key?: unknown; props?: Record<string, unknown>; children?: unknown }
    const key = element.key ?? element.props?.key

    if (typeof key === 'string') {
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }

    visit(element.children)
  }

  visit(await ui.drawn())

  return [...seen].filter(([, count]) => count > 1).map(([key]) => key)
}

// Every word on a card stroked as waiting or failing, with its colour: none may be amber.
async function amberWords(ui: { drawn: () => Promise<unknown> }): Promise<string[]> {
  return strokedCards(await ui.drawn()).flatMap(card => inks(card)).filter(ink => ink.color === 'warning' && !ink.isMark).map(ink => ink.text)
}

for (const { name, surface, props } of SURFACES) {
  test(`${name}: New goal draws Specification (optional), the session folder's .md files to attach, its helper line and B`, async ($, on) => {
    const terylon = setUp(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await ui.press({ key: 'tab-goals' })

    expect(terylon.listed).toContain('.')
    expect(await ui.find({ type: 'Text', text: exact('Specification (optional)') })).toBeDefined()
    expect((await ui.find({ key: 'spec-new-add-notes.md' }))?.props.label).toBe(`+ notes.md · ${NOTES.length} B`)
    expect((await ui.find({ key: 'spec-new-add-overview.md' }))?.props.label).toBe(`+ overview.md · ${OVERVIEW.length} B`)
    expect(await ui.find({ key: 'spec-new-add-README.txt' })).toBeUndefined()
    expect((await ui.find({ key: 'spec-new-folder' }))?.props.label).toBe('Another folder')
    expect((await ui.find({ type: 'Text', text: exact(SPEC_HELP) }))?.props.color).toBe('subtle')
    expect((await ui.find({ key: 'spec-in-session' }))?.props.label).toBe('Attach .md files in the session ↗')
    expect((await ui.find({ type: 'Text', text: exact(SESSION_HELP) }))?.props.color).toBe('subtle')
    // NOTHING ELSE IN THE FORM CHANGES: its fields, its pickers and Add goal are all still there.
    for (const key of ['goal-draft', 'goal-ask', 'goal-priority', 'goal-target', 'goal-add']) {
      expect(await ui.find({ key })).toBeDefined()
    }
  })

  test(`${name}: an attached file is a row with Remove, and Add goal sends every one whole as specification`, async ($, on) => {
    const terylon = setUp(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await ui.press({ key: 'tab-goals' })
    await ui.press({ key: 'spec-new-add-overview.md' })
    await ui.press({ key: 'spec-new-add-notes.md' })

    expect(await ui.find({ type: 'Text', text: exact(`overview.md · ${OVERVIEW.length} B`) })).toBeDefined()
    expect(await ui.find({ key: 'spec-new-add-overview.md' })).toBeUndefined()
    expect((await ui.find({ key: 'spec-new-remove-notes.md' }))?.props.label).toBe('Remove')

    await ui.press({ key: 'spec-new-remove-notes.md' })
    expect(await ui.find({ type: 'Text', text: exact(`notes.md · ${NOTES.length} B`) })).toBeUndefined()
    expect(await ui.find({ key: 'spec-new-add-notes.md' })).toBeDefined()
    expect(terylon.read).toEqual([])

    await ui.press({ key: 'spec-new-add-notes.md' })
    await ui.input({ key: 'goal-draft', text: 'Household budget', kind: 'change' })
    await ui.press({ key: 'goal-add' })

    expect(calls(terylon, 'goal_add')).toEqual([{ title: 'Household budget', priority: 2, target: 'list', specification: [{ name: 'overview.md', text: OVERVIEW }, { name: 'notes.md', text: NOTES }] }])
    expect(terylon.read).toEqual(['overview.md', 'notes.md'])
    expect(await ui.find({ type: 'Text', text: /^✓ Goal 12 is set: Household budget\./ })).toBeDefined()
    expect(await ui.find({ key: 'spec-new-remove-overview.md' })).toBeUndefined()
    expect(await keysTwice(ui)).toEqual([])
  })

  test(`${name}: a goal's specification is a card under its header: the version, each file, the older ones, the console, the decisions`, async ($, on) => {
    const terylon = setUp(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await ui.press({ key: 'tab-goals' })
    await ui.press({ key: 'goal-92' })

    expect(await ui.find({ type: 'Text', text: exact('Specification · version 2') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^revised (Today|\d+ Oct) \d\d:\d\d$/ })).toBeDefined()
    expect((await ui.find({ key: 'spec-file-overview.md' }))?.props.label).toBe(`overview.md · ${OVERVIEW.length} characters ›`)
    expect((await ui.find({ key: 'spec-file-notes.md' }))?.props.label).toBe('notes.md · 1,204 characters ›')
    expect((await ui.find({ key: 'spec-version-1' }))?.props.label).toBe('Version 1 ›')
    expect(await ui.find({ key: 'spec-version-2' })).toBeUndefined()
    expect((await ui.find({ key: 'spec-revise' }))?.props.label).toBe('Revise…')
    expect((await ui.findAll({ type: 'Link' })).some(link => link.props.label === 'In the console ↗' && String(link.props.href).endsWith('/?cockpit=goals&goal=92'))).toBe(true)
    expect(await ui.find({ type: 'Text', text: exact('YOUR DECISIONS ON EARLIER PLANS') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Plan 7 · 5 Oct · “Split the export from the import”') })).toBeDefined()
    expect(await ui.find({ key: 'spec-replan' })).toBeUndefined()

    // UNDER THE HEADER, ABOVE THE STORIES.
    const keys = (await ui.findAll({ type: 'Box' })).map(box => box.key)
    expect(keys.indexOf('goal-head')).toBeLessThan(keys.indexOf('goal-spec'))
    expect(keys.indexOf('goal-spec')).toBeLessThan(keys.indexOf('goal-stories'))
  })

  test(`${name}: the re-plan notice is a stroked card that waits, its words never amber; goal_replan only on the press`, async ($, on) => {
    const terylon = setUp(on, { from: 1, to: 2 })
    terylon.answers.goal_replan = { accepted: true, sentence: 'Goal 92 is re-planned from version 2; its plan waits for you.', commandId: 'c9', subjectId: 92 }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await ui.press({ key: 'tab-goals' })
    await ui.press({ key: 'goal-92' })

    expect((await ui.find({ key: 'spec-replan-notice' }))?.props.borderColor).toBe('warning')
    expect(await ui.find({ type: 'Text', text: exact('Plan was made from version 1.') })).toBeDefined()
    expect((await ui.find({ key: 'spec-replan' }))?.props.label).toBe('Re-plan from version 2')
    expect(await amberWords(ui)).toEqual([])
    await ui.press({ key: 'spec-revise' })
    expect(await keysTwice(ui)).toEqual([])
    await terylon.clock.advance(60000)
    expect(calls(terylon, 'goal_replan')).toEqual([])

    await ui.press({ key: 'spec-replan' })

    expect(calls(terylon, 'goal_replan')).toEqual([{ goal: 92 }])
    expect(await ui.find({ type: 'Text', text: exact('✓ Goal 92 is re-planned from version 2; its plan waits for you.') })).toBeDefined()
  })

  test(`${name}: Revise… keeps the files, replaces, adds and removes, and saves version 3 with basedOn the version shown`, async ($, on) => {
    const terylon = setUp(on)
    terylon.files['docs/spec/overview.md'] = '# Overview, revised\n'
    terylon.answers.spec_revise = { accepted: true, sentence: "Goal 92's specification is at version 3; its next plan reads it.", commandId: 'c8', subjectId: 92 }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await ui.press({ key: 'tab-goals' })
    await ui.press({ key: 'goal-92' })
    await ui.press({ key: 'spec-revise' })

    expect(calls(terylon, 'spec_get')).toEqual([{ goal: 92, version: 2 }])
    expect(await ui.find({ type: 'Text', text: exact('Revise version 2') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact(`overview.md · ${OVERVIEW.length} characters`) })).toBeDefined()
    expect((await ui.find({ key: 'revise-drop-notes.md' }))?.props.label).toBe('Remove')
    expect((await ui.find({ key: 'revise-save' }))?.props.label).toBe('Save as version 3')

    // ANOTHER FOLDER, AND A FILE OF ITS NAME TAKES THE KEPT ONE'S PLACE.
    await ui.input({ key: 'revise-folder', text: 'docs/spec', kind: 'submit' })
    expect(await ui.find({ type: 'Text', text: exact('In docs/spec:') })).toBeDefined()
    await ui.press({ key: 'revise-add-overview.md' })
    expect(await ui.find({ key: 'revise-drop-overview.md' })).toBeUndefined()
    await ui.press({ key: 'revise-add-plan.md' })
    await ui.press({ key: 'revise-drop-notes.md' })
    await ui.press({ key: 'revise-save' })

    expect(calls(terylon, 'spec_revise')).toEqual([{ goal: 92, basedOn: 2, specification: [{ name: 'overview.md', text: '# Overview, revised\n' }, { name: 'plan.md', text: '# Plan\n' }] }])
    expect(await ui.find({ type: 'Text', text: exact("✓ Goal 92's specification is at version 3; its next plan reads it.") })).toBeDefined()
    expect(await ui.find({ key: 'revise-save' })).toBeUndefined()
  })
}

test('a file opens read-only as Markdown through spec_get {goal}, and an older version through spec_get {goal, version}', async ($, on) => {
  const terylon = setUp(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goal-92' })
  await ui.press({ key: 'spec-file-overview.md' })

  expect(calls(terylon, 'spec_get')).toEqual([{ goal: 92 }])
  expect(await ui.find({ type: 'Markdown', text: /^# Overview/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /^# Notes/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Version 2 · revised .* · read-only$/ })).toBeDefined()
  expect(await ui.findAll({ type: 'Input' })).toEqual([])
  expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ Goal 92')

  await ui.press({ key: 'back' })
  await ui.press({ key: 'spec-version-1' })

  expect(calls(terylon, 'spec_get')).toEqual([{ goal: 92 }, { goal: 92, version: 1 }])
  expect(await ui.find({ type: 'Text', text: exact('Version 1') })).toBeDefined()
  expect(await ui.findAll({ type: 'Markdown' })).toHaveLength(1)
  expect(calls(terylon, 'spec_revise')).toEqual([])
})

test('a goal with no specification draws nothing new, and reads no specification', async ($, on) => {
  const terylon = setUp(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goal-11' })

  expect(await ui.find({ key: 'goal-stories' })).toBeDefined()
  expect(await ui.find({ key: 'goal-spec' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^Specification/ })).toBeUndefined()
  expect(calls(terylon, 'spec_get')).toEqual([])
})

test('over the caps, a name Terylon refuses, or a file that cannot be read: the pane says why in one sentence and sends nothing', async ($, on) => {
  const terylon = setUp(on)

  for (let index = 1; index <= 11; index += 1) {
    terylon.files[`many/part-${String(index).padStart(2, '0')}.md`] = `# Part ${index}\n`
  }

  terylon.files['big/one.md'] = 'x'.repeat(100001)
  terylon.files['big/two.md'] = 'y'.repeat(100000)
  terylon.files['odd/my notes.md'] = '# Notes\n'
  terylon.files['locked/secret.md'] = '# Locked\n'
  terylon.unreadable.set('locked/secret.md', "EACCES: permission denied, open 'locked/secret.md'")
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.input({ key: 'goal-draft', text: 'Household budget', kind: 'change' })
  const pick = async (folder: string, names: readonly string[]) => {
    for (const attached of await ui.findAll({ type: 'Button' })) {
      if (String(attached.key).startsWith('spec-new-remove-')) {
        await ui.press({ key: String(attached.key) })
      }
    }

    await ui.input({ key: 'spec-new-folder', text: folder, kind: 'submit' })

    for (const fileName of names) {
      await ui.press({ key: `spec-new-add-${fileName}` })
    }

    await ui.press({ key: 'goal-add' })
  }

  await pick('many', Array.from({ length: 11 }, (_, index) => `part-${String(index + 1).padStart(2, '0')}.md`))
  expect((await ui.find({ type: 'Text', text: exact('At most 10 files; 11 are attached. Remove one, then try again.') }))?.props.color).toBe('error')

  await pick('odd', ['my notes.md'])
  expect(await ui.find({ type: 'Text', text: /^my notes\.md is not a name Terylon takes: / })).toBeDefined()

  await pick('big', ['one.md', 'two.md'])
  expect(await ui.find({ type: 'Text', text: exact('At most 200,000 characters in all; these files have 200001. Remove one, then try again.') })).toBeDefined()

  await pick('locked', ['secret.md'])
  expect(await ui.find({ type: 'Text', text: /^secret\.md could not be read: .*EACCES: permission denied/ })).toBeDefined()

  expect(calls(terylon, 'goal_add')).toEqual([])
  expect(await ui.find({ key: 'goal-draft' }).then(input => input?.props.value)).toBe('Household budget')
})

test('another folder that cannot be listed says so in the engine\'s words, and the session\'s folder lists again', async ($, on) => {
  const terylon = setUp(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS, surface: 'terminal' })
  await ui.press({ key: 'tab-goals' })
  await ui.input({ key: 'spec-new-folder', text: '/nowhere', kind: 'submit' })

  expect((await ui.find({ type: 'Text', text: /^\/nowhere could not be read: .*ENOENT/ }))?.props.color).toBe('error')
  expect(await ui.find({ key: 'spec-new-add-overview.md' })).toBeUndefined()

  await ui.input({ key: 'spec-new-folder', text: '', kind: 'submit' })
  expect(await ui.find({ key: 'spec-new-add-overview.md' })).toBeDefined()
  expect(terylon.listed).toEqual(['.', '/nowhere', '.'])
})

test('B puts a request in the chat, in Czech: the typed title and ask, the .md files named or written, goal_add specification', async ($, on) => {
  const terylon = setUp(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.input({ key: 'goal-draft', text: 'Household budget', kind: 'change' })
  await ui.input({ key: 'goal-ask', text: 'Keep the budget in one file.', kind: 'change' })
  await ui.press({ key: 'spec-in-session' })

  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toContain('Název: „Household budget“.')
  expect(terylon.prompts[0]).toContain('Co má dělat: „Keep the budget in one file.“')
  expect(terylon.prompts[0]).toMatch(/goal_add jako specification: soubory \.md, které ti jmenuji nebo které jsi v této konverzaci napsal/)
  expect(calls(terylon, 'goal_add')).toEqual([])
  expect(terylon.read).toEqual([])
})

test("Terylon's refusals are said word for word: a secret in goal_add, a newer version in spec_revise, a re-plan refused", async ($, on) => {
  const terylon = setUp(on, { from: 1, to: 2 })
  terylon.answers.goal_add = refusal(SECRET, 400)
  terylon.answers.spec_revise = leaderRefusal(NEWER)
  terylon.answers.goal_replan = leaderRefusal('Goal 92 has no newer version to re-plan from.')
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'spec-new-add-notes.md' })
  await ui.input({ key: 'goal-draft', text: 'Household budget', kind: 'change' })
  await ui.press({ key: 'goal-add' })

  expect((await ui.find({ type: 'Text', text: exact(SECRET) }))?.props.color).toBe('error')
  expect(await ui.find({ key: 'spec-new-remove-notes.md' })).toBeDefined()

  await ui.press({ key: 'goal-92' })
  await ui.press({ key: 'spec-revise' })
  await ui.press({ key: 'revise-save' })

  expect(calls(terylon, 'spec_revise')).toEqual([{ goal: 92, basedOn: 2, specification: [{ name: 'overview.md', text: OVERVIEW }, { name: 'notes.md', text: NOTES }] }])
  expect((await ui.find({ type: 'Text', text: exact(NEWER) }))?.props.color).toBe('error')
  expect(await ui.find({ key: 'revise-save' })).toBeDefined()

  await ui.press({ key: 'spec-replan' })
  expect(await ui.find({ type: 'Text', text: exact('Goal 92 has no newer version to re-plan from.') })).toBeDefined()
})
