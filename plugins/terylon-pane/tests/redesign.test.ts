// S32 (#25): the pane redrawn on the 2.1.304 mod API to the approved canvas. The content and the rules hold; what is
// held here is the drawing that changed: the three Desktop proofs behind TERYLON_PANE_PROOFS, the narrow dock, the
// pickers over tasks_add and goal_add, the S27 slots, the band's tabular digits, and no word inside an Svg.

import { test, expect } from 'claude-code/testing'

import { SVG_COLOURS, proofsOf } from '../hooks/drawing'

import { BRIEFING, GOAL_QUESTION, MID_PANE_PROPS, NARROW_PANE_PROPS, PANE_PROPS, SESSION, bandProps, exact, pictures, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

// Every colour an Svg may paint: the fixed set the light-theme board allows, and none.
const PAINTS = new Set([...Object.values(SVG_COLOURS), 'none'])

// Every element of a drawn tree that carries a hover, with its key.
function hovers(node: unknown): { key: unknown; hover: unknown }[] {
  if (node === null || typeof node !== 'object') {
    return []
  }

  const element = node as { hover?: unknown; props?: { key?: unknown }; children?: unknown[] }
  const own = element.hover === undefined ? [] : [{ key: element.props?.key, hover: element.hover }]

  return [...own, ...(Array.isArray(element.children) ? element.children.flatMap(hovers) : [])]
}

test('THE PROOFS AS THE OWNER\'S WALK SETTLED THEM: all three proven and on; `no-<name>` the escape hatch', () => {
  expect(proofsOf(undefined)).toEqual({ inputRows: true, hoverReveal: true, svgTooltips: true })
  expect(proofsOf('')).toEqual({ inputRows: true, hoverReveal: true, svgTooltips: true })
  expect(proofsOf('svg-tooltips')).toEqual({ inputRows: true, hoverReveal: true, svgTooltips: true })
  expect(proofsOf(' No-Input-Rows, no-hover-reveal ')).toEqual({ inputRows: false, hoverReveal: false, svgTooltips: true })
  expect(proofsOf('no-svg-tooltips')).toEqual({ inputRows: true, hoverReveal: true, svgTooltips: false })
  expect(proofsOf('all yes true 1 no')).toEqual({ inputRows: true, hoverReveal: true, svgTooltips: true })
})

test('TURNED OFF, 1.1.2 DRAWS: one-line fields, no hover reveal, no tooltip', async ($, on) => {
  const terylon = world(on, { env: { TERYLON_PANE_PROOFS: 'no-input-rows,no-hover-reveal,no-svg-tooltips' } })
  terylon.answers.briefing = { ...BRIEFING, questionsOpen: [...BRIEFING.questionsOpen, GOAL_QUESTION] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  // No row lights under the pointer, and nothing is laid over a row: the console link is in its body.
  expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute')).toEqual([])
  expect(hovers(await ui.drawn())).toEqual([])

  await ui.press({ key: 'story-333' })
  const [stepper] = await pictures(ui)
  expect(stepper?.isInteractive).toBeUndefined()
  expect(stepper?.source).not.toContain('<title>')

  await ui.press({ key: 'back' })
  await ui.press({ key: 'question-606' })
  await ui.press({ key: 'answer-606' })
  const field = await ui.find({ key: 'answer-text' })
  expect(field?.props.rows).toBeUndefined()
  expect(field?.props.autoFocus).toBe(true)

  await ui.press({ key: 'back' })
  await ui.input({ key: 'quick-add', text: 'Health: a Check now button' })
  expect((await ui.find({ key: 'add-criteria' }))?.props.rows).toBeUndefined()
  expect((await ui.find({ key: 'add-criteria' }))?.props.placeholder).toBe('Separate them with semicolons, or the leader writes them')
})

test('input-rows, PROVEN AND ON: the answer takes four rows, the criteria three, one criterion per line', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'question-9' })
  await ui.press({ key: 'answer-9' })
  expect((await ui.find({ key: 'answer-text' }))?.props.rows).toBe(4)

  await ui.press({ key: 'back' })
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
    await ui.press({ key: 'tab-queue' })
    await ui.press({ key: 'question-9' })
    await ui.press({ key: 'answer-9' })
    expect((await ui.find({ key: 'answer-text' }))?.props.submitLabel).toBe(label)
    expect((await ui.findAll({ type: 'Button', text: /^Answer$/ })).map(button => button.key)).toEqual(['answer-send'])
    await ui.press({ key: 'back' })
    await ui.press({ key: 'question-9' })
    await ui.unmount()
  }
})

test('hover-reveal, PROVEN AND ON: a waiting row lights and lays its console link over its right edge, a link and never a button', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // A hover is not among a found element's props: it is read off the drawn tree.
  const hovered = hovers(await ui.drawn())
  expect(hovered.filter(node => node.key === 'row-merge-327').map(node => node.hover)).toEqual([{ backgroundColor: 'userMessageBackgroundHover' }])

  // The reveal is not keyed: a keyed Box drawn "none" would be a hover scope the pointer can never be over.
  // ONLY MERGE AND AN ANSWER LINK OUT (S27): the plan's row reveals nothing, its acts are on its card.
  const reveals = (await ui.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute')
  expect(reveals).toHaveLength(2)
  expect(reveals.every(box => box.key === undefined && box.props.top === 0 && box.props.right === 0 && box.props.display === 'none')).toBe(true)
  expect(hovered.filter(node => node.key === undefined).map(node => node.hover)).toEqual([{ display: 'flex' }, { display: 'flex' }])
  expect((await ui.findAll({ type: 'Link' })).map(link => link.text)).toEqual(expect.arrayContaining(['Answer in the console ↗', 'Merge in the console ↗']))
  expect((await ui.findAll({ type: 'Link' })).map(link => link.text)).not.toContain('Approve in the console ↗')
  expect((await ui.find({ type: 'Link', text: 'Merge in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=merge&story=327')
  expect(await ui.find({ type: 'Button', text: /Merge|Approve/ })).toBeUndefined()

  // NO REVEAL OVER AN OPEN ROW (the owner's walk of 1.2.0): it covered the question; the body carries the link.
  await ui.press({ key: 'question-9' })
  expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute')).toHaveLength(1)
  expect((await ui.findAll({ type: 'Link', text: 'Answer in the console ↗' }))).toHaveLength(1)
  await ui.press({ key: 'question-9' })
  expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute')).toHaveLength(2)
  await ui.unmount()

  // THE TERMINAL HAS NO POINTER TO HOVER: the row draws as 1.1.2 there, whatever is proven.
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute')).toEqual([])
  expect(hovers(await terminal.drawn())).toEqual([])
})

test('svg-tooltips, PROVEN AND ON: the stepper is interactive, a title on each node, at its own height, its labels under it', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-333' })

  const [stepper] = await pictures(ui)
  expect(stepper?.isInteractive).toBe(true)
  expect(stepper?.source.match(/<title>/g)).toHaveLength(8)
  // ITS OWN HEIGHT, given: the interactive frame left to itself drew an empty band around it (the owner's walk).
  expect(stepper?.height).toBe(22)
  expect((await ui.find({ type: 'Text', text: exact('Tests') }))?.props.color).toBe('suggestion')
})

test('A DOCK OF ABOUT 435 PX (52 body columns): the stepper keeps its nodes\' size, only the phase now named under it', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: MID_PANE_PROPS })
  // The rest of the pane is drawn as wide: the rows keep their detail, the gauges their pictures.
  expect((await ui.find({ key: 'story-333' }))?.text).toMatch(/5\/8 · \$2\.10$/)
  expect((await pictures(ui)).map(item => item.alt)).toContain('2 of 4 slots in use')

  await ui.press({ key: 'story-333' })
  const [stepper] = await pictures(ui)
  expect(stepper?.source).toMatch(/^<svg [^>]*width="196" height="22"/)
  expect(stepper?.source.match(/<circle cx="[^"]*" cy="11" r="6"/g)?.length).toBeGreaterThanOrEqual(5)
  expect(stepper?.isInteractive).toBe(true)
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

test('svg-tooltips, named: each node of the stepper says its stage, role and state, and only what Terylon reports', async ($, on) => {
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

  for (const path of [['story-333'], ['back', 'merge-327', 'open-story-327'], ['back', 'tab-goals'], ['tab-status']]) {
    for (const key of path) {
      await ui.press({ key })
    }

    seen.push(...(await pictures(ui)))
  }

  expect(seen.length).toBeGreaterThanOrEqual(8)

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

test('THE NARROW DOCK, below 44 body columns: rows drop their detail, the phases shrink to dots, the gauges to numbers', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: NARROW_PANE_PROPS })
  expect((await ui.find({ key: 'story-333' }))?.text).toBe('#333 Direct dispatch')
  expect((await ui.find({ key: 'queued-328' }))?.text).toMatch(/^\s*(?:●\s+)?queued\s+#328 Owner's spec and plan$/)
  expect(await ui.find({ type: 'Text', text: exact('you decide in the console') })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: exact('2/4 · $5.50') }))?.props.tabular).toBe(true)

  const drawn = await pictures(ui)
  expect(drawn.map(item => item.alt)).toEqual(['Phase 5 of 8: tests', 'Phase 7 of 8: verified'])
  expect(drawn.every(item => item.source.includes('<circle') && !item.source.includes('<rect'))).toBe(true)

  // The Status tab stacks its slots and cost; a wide pane sets them side by side.
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ key: 'status-gauges' })).toBeUndefined()
  await ui.unmount()
  const wide = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await wide.find({ key: 'status-gauges' })).toBeDefined()
  expect((await pictures(wide)).map(item => item.alt)).toEqual(['2 of 4 slots in use', '$5.50 of the $20 daily limit today'])
})

test('the Status tab says the machine in one word, large, in its colour, its times in tabular digits', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-status' })
    const word = await ui.find({ type: 'Text', text: exact('ok') })

    expect(word?.props).toMatchObject({ size: 'title', weight: 'semibold', color: 'success' })
    expect((await ui.find({ type: 'Text', text: /^\s*last answer at / }))?.props.tabular).toBe(true)
    expect((await ui.find({ type: 'Text', text: exact('terylon-pane 1.3.1') }))?.props.mono).toBe(true)
    await ui.unmount()
  }
})

test('the New goal card says a goal is a general direction, in the words of the approved S31 canvas', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  expect((await ui.find({ key: 'goal-new' }))?.props.borderStyle).toBe('round')
  expect(await ui.find({ type: 'Text', text: exact('A goal is a general direction. A concrete ask — a file, a document, one change — becomes a task under a goal. The leader asks its questions first, then makes a plan you approve.') })).toBeDefined()
})

test('THE NEW TASK: goal, after and size are Selects over tasks_add, and what is picked is what is sent', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'quick-add', text: 'Health: a Check now button' })

  expect((await ui.find({ key: 'add-goal' }))?.props.options).toEqual([{ value: '3', label: 'P1 · Agentic OS' }, { value: '11', label: 'Test z telefonu' }])
  expect((await ui.find({ key: 'add-after' }))?.props.value).toBe('')
  expect((await ui.find({ key: 'add-size' }))?.props.options).toEqual([{ value: 'M', label: 'M' }, { value: 'L', label: 'L' }, { value: 'XL', label: 'XL' }])
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
    await ui.press({ key: 'tab-queue' })
    await ui.press({ key: 'story-333' })

    const slot = await ui.find({ key: 'story-actions' })
    expect(slot?.props.borderStyle).toBeUndefined()
    expect((await ui.findAll({ type: 'Button' })).map(button => button.key).filter(key => key === 'act-story-333-stop' || key === 'summarise' || key === 'story-goal')).toEqual(['act-story-333-stop', 'summarise', 'story-goal'])
    expect(await ui.find({ type: 'Button', text: /Merge/ })).toBeUndefined()
    expect((await ui.find({ type: 'Link', text: 'Story in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=work&story=333')

    await ui.press({ key: 'back' })
    await ui.press({ key: 'tab-bell' })
    expect((await ui.find({ key: 'leader-actions' }))?.props.borderStyle).toBeUndefined()
    await ui.unmount()
  }
})

test('the tabs: a digit each while the pane holds the keyboard, the bell\'s count and the Status warning as chips', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { ...BRIEFING, unhandledNotices: 2 }
  terylon.mode.server = 'up'
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const keys = ['tab-queue', 'tab-goals', 'tab-bell', 'tab-memory', 'tab-status']
  expect((await Promise.all(keys.map(key => ui.find({ key })))).map(tab => tab?.props.hotkey)).toEqual(['1', '2', '3', '4', '5'])
  expect((await ui.find({ key: 'tab-bell' }))?.text).toBe('Bell 2')
  const count = await ui.find({ type: 'Text', text: exact('2') })
  expect(count?.props).toMatchObject({ tabular: true, color: 'warning' })
})

test('THE BAND IS UNCHANGED BUT FOR ITS DIGITS: the same words and colours, every number tabular, still one row', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const band = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'AbovePrompt', props: bandProps() })
    const row = await band.find({ type: 'Text', text: exact('Terylon · Waiting 3 · Running 2 · Queue 2 · Bell 2') })

    expect(row?.props.wrap).toBe('truncate-end')
    const digits = await band.findAll({ type: 'Text', text: /^\d+$/ })
    expect(digits.map(node => [node.text, node.props.color, node.props.tabular])).toEqual([['3', 'warning', true], ['2', 'suggestion', true], ['2', 'inactive', true], ['2', 'warning', true]])
    expect((await band.findAll({ type: 'Text' })).filter(node => !/^\d+$/.test(node.text) && node.props.tabular !== undefined)).toEqual([])
    expect(await band.find({ type: 'Svg' })).toBeUndefined()
    expect((await band.findAll({ type: 'Box' })).length).toBe(2)
    await band.unmount()
  }
})
