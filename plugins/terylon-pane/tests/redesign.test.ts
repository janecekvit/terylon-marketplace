// S32 (#25): the pane redrawn on the 2.1.304 mod API to the approved canvas. The content and the rules hold; what is
// held here is the drawing that changed: the three Desktop proofs behind TERYLON_PANE_PROOFS, the narrow dock, the
// pickers over tasks_add and goal_add, the S27 slots, the band's tabular digits, and no word inside an Svg.

import { test, expect } from 'claude-code/testing'

import { SVG_COLOURS, proofsOf } from '../hooks/drawing'

import { BRIEFING, GOAL_QUESTION, MID_PANE_PROPS, NARROW_PANE_PROPS, PANE_PROPS, SESSION, bandProps, exact, pictures, world, pill, toOverview, toAddTask, moreWith, unfold, toNewGoal } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

// Every colour an Svg may paint: the fixed set the light-theme board allows, and none.
const PAINTS = new Set([...Object.values(SVG_COLOURS), 'none'])

// The hover reveals a drawing holds: a Box drawn "none" until its row is under the pointer.
async function revealsIn(ui: { findAll: (query: { type?: string }) => Promise<{ key?: unknown; props: Record<string, unknown> }[]> }) {
  return (await ui.findAll({ type: 'Box' })).filter(box => box.props.display === 'none')
}

// Every element of a drawn tree that carries a hover, with its key.
function hovers(node: unknown): { key: unknown; hover: unknown }[] {
  if (node === null || typeof node !== 'object') {
    return []
  }

  const element = node as { hover?: unknown; props?: { key?: unknown }; children?: unknown[] }
  const own = element.hover === undefined ? [] : [{ key: element.props?.key, hover: element.hover }]

  return [...own, ...(Array.isArray(element.children) ? element.children.flatMap(hovers) : [])]
}

test('THE PROOFS: on by default; `no-<name>` the escape hatch', () => {
  expect(proofsOf(undefined)).toEqual({ inputRows: true, hoverReveal: true, svgTooltips: true })
  expect(proofsOf('')).toEqual({ inputRows: true, hoverReveal: true, svgTooltips: true })
  expect(proofsOf('svg-tooltips')).toEqual({ inputRows: true, hoverReveal: true, svgTooltips: true })
  expect(proofsOf(' No-Input-Rows, no-hover-reveal ')).toEqual({ inputRows: false, hoverReveal: false, svgTooltips: true })
  expect(proofsOf('no-svg-tooltips')).toEqual({ inputRows: true, hoverReveal: true, svgTooltips: false })
  // NOTICES ARE A SCREEN, NOT A PROOF: its old names turn nothing on or off.
  expect(proofsOf('no-notices-over notices-over')).toEqual({ inputRows: true, hoverReveal: true, svgTooltips: true })
  expect(proofsOf('all yes true 1 no')).toEqual({ inputRows: true, hoverReveal: true, svgTooltips: true })
})

test('TURNED OFF, 1.1.2 DRAWS: one-line fields, no hover reveal, no tooltip', async ($, on) => {
  const terylon = world(on, { env: { TERYLON_PANE_PROOFS: 'no-input-rows,no-hover-reveal,no-svg-tooltips' } })
  terylon.answers.briefing = { ...BRIEFING, questionsOpen: [...BRIEFING.questionsOpen, GOAL_QUESTION] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // No row lights under the pointer, and nothing is revealed on a row: the console link is in its body.
  expect(await revealsIn(ui)).toEqual([])
  expect(hovers(await ui.drawn())).toEqual([])

  await ui.press({ key: 'story-333' })
  const [stepper] = await pictures(ui)
  expect(stepper?.isInteractive).toBeUndefined()
  expect(stepper?.source).not.toContain('<title>')

  await ui.press({ key: 'back' })
  await ui.press({ key: 'answer-606' })
  const field = await ui.find({ key: 'answer-text' })
  expect(field?.props.rows).toBeUndefined()
  expect(field?.props.autoFocus).toBe(true)

  await ui.press({ key: 'back' })
  await toAddTask(ui)
  await ui.input({ key: 'quick-add', text: 'Health: a Check now button' })
  expect((await ui.find({ key: 'add-criteria' }))?.props.rows).toBeUndefined()
  expect((await ui.find({ key: 'add-criteria' }))?.props.placeholder).toBe('Separate them with semicolons, or the leader writes them')
})

test('input-rows, PROVEN AND ON: the answer takes four rows, the criteria three, one criterion per line', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'answer-9' })
  expect((await ui.find({ key: 'answer-text' }))?.props.rows).toBe(4)

  await ui.press({ key: 'back' })
  await toAddTask(ui)
  await ui.input({ key: 'quick-add', text: 'Health: a Check now button' })
  expect((await ui.find({ key: 'add-criteria' }))?.props.rows).toBe(3)
  expect((await ui.find({ key: 'add-criteria' }))?.props.placeholder).toBe('One per line, or the leader writes them')
  await ui.input({ key: 'add-criteria', text: 'The Status tab has Check now\nA second press within 10 s sends nothing', kind: 'change' })
  await ui.press({ key: 'add-send' })

  expect(terylon.calls.filter(call => call.tool === 'tasks_add').map(call => (call.args.tasks as { criteria: string[] }[])[0]?.criteria)).toEqual([['The Status tab has Check now', 'A second press within 10 s sends nothing']])
})

test('ONE WAY TO SEND AN ANSWER on the desktop: the Answer button, and no submit word beside the field', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const [surface, label] of [['desktop', ''], ['terminal', 'answer']] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await toOverview(ui)
    await ui.press({ key: 'answer-9' })
    expect((await ui.find({ key: 'answer-text' }))?.props.submitLabel).toBe(label)
    expect((await ui.findAll({ type: 'Button', text: /^Answer$/ })).map(button => button.key)).toEqual(['answer-send'])
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})

test('hover-reveal, PROVEN AND ON: a question\'s row lights and shows its console link beside its press, a link and never a button', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // A hover is not among a found element's props: it is read off the drawn tree.
  const hovered = hovers(await ui.drawn())
  expect(hovered.filter(node => node.key === 'row-question-9').map(node => node.hover)).toEqual([{ backgroundColor: 'userMessageBackgroundHover' }])

  // The reveal is not keyed: a keyed Box drawn "none" would be a hover scope the pointer can never be over.
  // A MERGE'S ACT IS ITS LINK ALREADY, and a plan's act is its own: only a question reveals one.
  // BESIDE THE PRESS, NEVER OVER IT: laid over the row's right edge, the link covered the question's own text.
  const reveals = await revealsIn(ui)
  expect(reveals).toHaveLength(1)
  expect(reveals.every(box => box.key === undefined && box.props.flexShrink === 0)).toBe(true)
  expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute')).toEqual([])
  expect(hovered.filter(node => node.key === undefined).map(node => node.hover)).toEqual([{ display: 'flex' }])
  expect((await ui.findAll({ type: 'Link' })).map(link => link.text)).toEqual(expect.arrayContaining(['Answer in the console ↗', 'Merge ↗']))
  expect((await ui.findAll({ type: 'Link' })).map(link => link.text)).not.toContain('Approve in the console ↗')
  expect(await ui.find({ type: 'Button', text: /Merge/ })).toBeUndefined()

  // A QUESTION'S ROW NEVER OPENS: a press leads to the question, whose own screen links the console.
  await ui.press({ key: 'question-9' })
  expect((await ui.findAll({ type: 'Link', text: 'Answer in the console ↗' }))).toHaveLength(1)
  await ui.press({ key: 'back' })
  expect(await revealsIn(ui)).toHaveLength(1)
  await ui.unmount()

  // THE TERMINAL HAS NO POINTER TO HOVER: the row draws as 1.1.2 there, whatever is proven.
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await revealsIn(terminal)).toEqual([])
  expect(hovers(await terminal.drawn())).toEqual([])
})

test('svg-tooltips, PROVEN AND ON: a story\'s road is interactive, a title on each segment, at its own height, its names under it', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-333' })

  const [road] = await pictures(ui)
  expect(road?.isInteractive).toBe(true)
  expect(road?.source.match(/<title>/g)).toHaveLength(8)
  // ITS OWN HEIGHT, given: the interactive frame left to itself drew an empty band around it (the owner's walk).
  expect(road?.height).toBe(5)
  expect((await ui.find({ type: 'Text', text: exact('Tests') }))?.props.color).toBe('suggestion')
})

test('A DOCK OF ABOUT 435 PX (52 body columns): a story\'s road keeps its height, only the phase now named under it', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: MID_PANE_PROPS })
  // The rest of the pane is drawn as wide: the rows keep their detail.
  expect((await ui.find({ key: 'story-333' }))?.text).toMatch(/5\/8 · \$2\.10$/)

  await ui.press({ key: 'story-333' })
  const [road] = await pictures(ui)
  expect(road?.source).toMatch(/^<svg [^>]*width="100%" height="5"/)
  expect(road?.source.match(/<rect /g)?.length).toBe(8)
  expect(road?.isInteractive).toBe(true)
  expect(await ui.find({ key: 'phase-labels' })).toBeUndefined()
  const now = await ui.find({ type: 'Text', text: exact('Tests') })
  expect(now?.props).toMatchObject({ color: 'suggestion', weight: 'semibold' })
  expect(await ui.find({ type: 'Text', text: exact('Admitted') })).toBeUndefined()
  await ui.unmount()

  // THE WIDE PANE names all eight.
  const wide = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await wide.find({ key: 'phase-labels' })).toBeDefined()
  expect((await pictures(wide))[0]?.source).toMatch(/^<svg [^>]*width="100%"/)
})

test('svg-tooltips, named: each segment of a story\'s road says its stage, role and state, and only what Terylon reports', async ($, on) => {
  const terylon = world(on, { env: { TERYLON_PANE_PROOFS: 'svg-tooltips' } })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-333' })

  const [stepper] = await pictures(ui)
  expect(stepper?.isInteractive).toBe(true)
  expect(stepper?.source.match(/<title>[^<]*<\/title>/g)).toEqual([
    '<title>Admitted to a slot · done</title>',
    '<title>Plan · planner · done</title>',
    '<title>Develop · developer · done</title>',
    '<title>Review · reviewer · done</title>',
    '<title>Tests · tester · now · Step 5 of 9: testy</title>',
    '<title>Pull request · to come</title>',
    '<title>Verified in its PR environment · to come</title>',
    '<title>Merge — your gate · to come</title>',
  ])
})

test('NO WORD INSIDE AN Svg, and only the fixed colours the light theme reads: every picture on every screen', async ($, on) => {
  const terylon = world(on, { env: { TERYLON_PANE_PROOFS: 'svg-tooltips' } })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const seen: { source: string; alt: string; height: unknown }[] = [...(await pictures(ui))]

  for (const path of [['story-333'], ['back', 'merge-327', 'open-story-327'], ['back', 'refresh'], ['goal-3'], ['back', 'tab-status']]) {
    for (const key of path) {
      await ui.press({ key })
    }

    seen.push(...(await pictures(ui)))
  }

  expect(seen.length).toBeGreaterThanOrEqual(7)

  for (const picture of seen) {
    expect(picture.alt.trim()).not.toBe('')
    expect(picture.source).toMatch(/^<svg [^>]*>.*<\/svg>$/)
    expect(picture.source).not.toMatch(/<text|<tspan|<foreignObject|<script|<image/)
    // ITS OWN HEIGHT, given (the owner's walk of 1.2.0): left to itself, the frame drew an empty band around it.
    expect(picture.height).toBe(Number(/^<svg [^>]*height="(\d+)"/.exec(picture.source)?.[1]))

    for (const [, paint] of picture.source.matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
      expect(PAINTS.has(paint ?? '')).toBe(true)
    }
  }
})

test('THE NARROW DOCK, below 44 body columns: rows drop their detail, the tiles are one line of counts, a goal names its stage alone', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: NARROW_PANE_PROPS })
  expect((await ui.find({ key: 'story-333' }))?.text).toBe('#333 Direct dispatch')
  await unfold(ui, 'fold-queued')
  expect((await ui.find({ key: 'queued-328' }))?.text).toMatch(/^\s*(?:●\s+)?queued\s+#328 Owner's spec and plan$/)
  expect(await ui.find({ key: 'tiles' })).toBeUndefined()
  expect(await ui.find({ key: 'tiles-line' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('3 waiting · 2 running · 0 stuck') })).toBeDefined()
  await ui.press({ key: 'fold-queued' })

  const drawn = await pictures(ui)
  expect(drawn.map(item => item.alt)).toEqual(['Admitted, Plan, Develop, Review done; Tests now; Pull req., Verified, Merge to come', 'Admitted, Plan, Develop, Review, Tests, Pull req. done; Verified now; Merge to come'])

  // Health stacks its two cards; a wide pane sets them side by side.
  await pill(ui, 'tab-status')
  expect(await ui.find({ key: 'status-cards' })).toBeUndefined()
  await ui.unmount()
  const wide = await $.ui.mount({ ...PANE, surface: 'desktop', props: { ...(PANE_PROPS as Record<string, unknown>), bodyColumns: 120 } as never })
  expect(await wide.find({ key: 'status-cards' })).toBeDefined()
})

test('Health says the machine in one word, in its colour, its times in tabular digits', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await moreWith(ui, 'fold-diagnostics')
    const word = await ui.find({ type: 'Text', text: exact('all well') })

    expect(word?.props).toMatchObject({ weight: 'semibold', color: 'success' })
    expect((await ui.find({ type: 'Text', text: /^\s*last answer at / }))?.props.tabular).toBe(true)
    expect((await ui.find({ type: 'Text', text: exact('terylon-pane 1.21.0') }))?.props.mono).toBe(true)
    await ui.unmount()
  }
})

test('the New goal card says a goal is a general direction, in the words of the approved S31 canvas', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await toNewGoal(ui)
  expect((await ui.find({ key: 'goal-new' }))?.props.borderStyle).toBe('round')
  expect(await ui.find({ type: 'Text', text: exact('A goal is a general direction. A concrete ask — a file, a document, one change — becomes a task under a goal. The leader asks its questions first, then makes a plan you approve.') })).toBeDefined()
})

test('THE NEW TASK: goal, after and size are Selects over tasks_add, and what is picked is what is sent', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await toAddTask(ui)
  await ui.input({ key: 'quick-add', text: 'Health: a Check now button' })

  expect((await ui.find({ key: 'add-goal' }))?.props.options).toEqual([{ value: '3', label: 'P1 · Agentic OS' }, { value: '11', label: 'Test z telefonu' }])
  expect((await ui.find({ key: 'add-after' }))?.props.value).toBe('')
  expect((await ui.find({ key: 'add-size' }))?.props.options).toEqual([{ value: 'S', label: 'S' }, { value: 'M', label: 'M' }, { value: 'L', label: 'L' }, { value: 'XL', label: 'XL' }])
  expect((await ui.find({ key: 'add-size' }))?.props.value).toBe('M')
  expect(await ui.find({ key: 'add-pickers' })).toBeDefined()

  await ui.select({ key: 'add-goal', value: '11' })
  await ui.select({ key: 'add-size', value: 'XL' })
  await ui.press({ key: 'add-send' })

  const [sent] = terylon.calls.filter(call => call.tool === 'tasks_add')
  expect(sent?.args.goal).toBe(11)
  expect((sent?.args.tasks as { size: string }[])[0]?.size).toBe('XL')
})

test('THE S27 SLOTS (#27) ARE FILLED: the story\'s acts and its links on one plain row, no border, merge only a link', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await toOverview(ui)
    await ui.press({ key: 'story-333' })

    const slot = await ui.find({ key: 'story-actions' })
    expect(slot?.props.borderStyle).toBeUndefined()
    expect((await ui.findAll({ type: 'Button' })).map(button => button.key).filter(key => key === 'act-story-333-stop' || key === 'summarise' || key === 'story-goal')).toEqual(['act-story-333-stop', 'summarise', 'story-goal'])
    expect(await ui.find({ type: 'Button', text: /Merge/ })).toBeUndefined()
    expect((await ui.find({ type: 'Link', text: 'Story in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?view=story&story=333')

    await ui.unmount()
  }
})

test('THE BAND IS UNCHANGED BUT FOR ITS DIGITS: the same words and colours, every number tabular, still one row', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const band = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'AbovePrompt', props: bandProps() })
    const row = await band.find({ type: 'Text', text: exact('Terylon Cockpit · Waiting 3 · Running 2 · Queued 2 · Notices 2') })

    expect(row?.props.wrap).toBe('truncate-end')
    const digits = await band.findAll({ type: 'Text', text: /^\d+$/ })
    expect(digits.map(node => [node.text, node.props.color, node.props.weight, node.props.tabular])).toEqual([['3', 'text', 'semibold', true], ['2', 'suggestion', undefined, true], ['2', 'inactive', undefined, true], ['2', 'text', 'semibold', true]])
    expect((await band.findAll({ type: 'Text' })).filter(node => !/^\d+$/.test(node.text) && node.props.tabular !== undefined)).toEqual([])
    expect(await band.find({ type: 'Svg' })).toBeUndefined()
    expect((await band.findAll({ type: 'Box' })).length).toBe(2)
    await band.unmount()
  }
})
