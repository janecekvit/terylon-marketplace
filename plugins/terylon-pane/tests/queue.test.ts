import { test, expect } from 'claude-code/testing'

import { CARD_FILL, WAITING_TILE_FILL } from '../hooks/drawing'

import { BRIEFING, FLIGHT, PANE_PROPS, SESSION, chipOf, exact, lateOnTheLocalDayOf, marked, pictures, world, foldOf } from './fixtures'

// The theme keys the house style allows: a colour is a role, never a hex value.
const THEME = ['text', 'inactive', 'subtle', 'suggestion', 'success', 'warning', 'error', 'merged', 'userMessageBackground']

test('the overview: the machine in a line, three tiles, Waiting for you, a card per goal, the folds and the footer', async ($, on) => {
  const terylon = world(on, { now: lateOnTheLocalDayOf('2026-10-11T12:20:00Z') })
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await $.command.run({ command: 'terylon-cockpit', args: '' } as never).catch(() => undefined)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'Pane', requestId: 'terylon', props: PANE_PROPS })

    // THE HEAD: Terylon, a quiet line of health, connection, slots and today's cost, and Refresh.
    expect((await ui.find({ type: 'Text', text: exact('Terylon') }))?.props).toMatchObject({ size: 'title', weight: 'semibold' })
    const line = await ui.find({ type: 'Text', text: exact('all well · connected · 2/4 slots · $5.50 of $20 today') })
    expect(line?.props.color).toBe('subtle')
    expect(line?.props.tabular).toBe(true)
    expect((await ui.find({ key: 'refresh' }))?.props.label).toBe('Refresh')

    // NO TAB IS LEFT.
    expect(await ui.find({ key: 'tab-goals' })).toBeUndefined()
    expect(await ui.find({ key: 'tab-queue' })).toBeUndefined()

    // ONE ROW, ONE BUTTON (S32): the kind chip, the ref, the title, keyed by the subject's id, and the row's act beside it.
    expect(await ui.find({ type: 'Text', text: exact('Waiting for you') })).toBeDefined()
    expect((await ui.find({ key: 'question-9' }))?.text).toMatch(/^\s*(?:●\s+)?question\s+#333 — Má mrtvý běh pokračovat od posledního commitu\?$/)
    expect((await ui.find({ key: 'merge-327' }))?.text).toMatch(/^\s*(?:●\s+)?merge\s+#327 Events since the last look · verified in pr-196 · waiting for merge$/)
    expect((await ui.find({ key: 'plan-41' }))?.text).toMatch(/^\s*(?:●\s+)?plan\s+Plan 41 Agentic OS · 3 stories$/)
    expect((await ui.find({ type: 'Text', text: exact('#327') }))?.props).toMatchObject({ mono: true, color: 'subtle' })
    // THE KIND AS A CHIP: a dot in the kind's colour, the word in inactive, which reads on the chip in both themes.
    expect(await chipOf(ui, 'question-9')).toEqual({ word: 'inactive', dot: 'warning', background: surface === 'desktop' ? 'userMessageBackground' : undefined, size: 'caption' })
    expect((await chipOf(ui, 'merge-327'))?.dot).toBe('merged')
    expect((await chipOf(ui, 'plan-41'))?.dot).toBe('merged')
    expect((await ui.find({ key: 'answer-9' }))?.props.label).toBe('Answer')
    expect((await ui.find({ key: 'open-plan-41' }))?.props.label).toBe('Approve')
    // MERGE IS ONLY EVER A LINK INTO THE CONSOLE.
    expect((await ui.find({ type: 'Link', text: 'Merge ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?view=merge&story=327')
    expect(await ui.find({ type: 'Button', text: /Merge/ })).toBeUndefined()

    // THE GOALS: a card each, its road, how far it is, each running story one press away, and what next.
    expect((await ui.find({ key: 'goal-new-open' }))?.props.label).toBe('New goal')
    expect((await ui.find({ key: 'goal-3' }))?.text).toBe('P1 · Agentic OS')
    expect(await ui.find({ type: 'Text', text: exact('0 of 4 stories') })).toBeDefined()
    expect((await ui.find({ key: 'story-333' }))?.text).toMatch(/^#333 running \d+ h/)
    expect((await ui.find({ key: 'story-329' }))?.text).toBe('#329 verifying')
    expect(await ui.find({ type: 'Text', text: exact('Merge in the console') })).toBeDefined()

    if (surface === 'desktop') {
      // THE ROAD, as Svg with an alt; every word outside it.
      const drawn = await pictures(ui)
      expect(drawn.map(item => item.alt)).toEqual(['Plan, Approve, Build, Verify done; Your merge now; Done to come', 'Plan now; Approve, Build, Verify, Your merge, Done to come'])
    } else {
      // THE TERMINAL HAS NO Svg: the road as runs of coloured cells.
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      expect((await ui.findAll({ type: 'Text', text: /^━+$/ })).length).toBe(12)
    }

    // THE FOLDS, SHUT: what they hold is a press away.
    expect((await foldOf(ui, 'fold-queued'))).toBe('▸ Queued 2')
    expect(await ui.find({ key: 'queued-328' })).toBeUndefined()
    await ui.press({ key: 'fold-queued' })
    expect((await ui.find({ key: 'queued-328' }))?.text).toMatch(/^\s*(?:●\s+)?queued\s+#328 Owner's spec and plan\s+after #324$/)
    expect((await ui.find({ type: 'Text', text: exact('tvoje volba') }))?.props).toMatchObject({ color: 'text', weight: 'semibold' })
    await ui.press({ key: 'fold-queued' })

    expect((await foldOf(ui, 'fold-done'))).toBe('▸ Done today 1')
    await ui.press({ key: 'fold-done' })
    expect((await chipOf(ui, 'done-341'))?.dot).toBe('success')
    expect((await ui.find({ key: 'done-341' }))?.text).toContain('#341 S10a cleanup')
    await ui.press({ key: 'fold-done' })

    expect((await foldOf(ui, 'goals-show-closed'))).toBe('▸ History 1')

    // THE FOOT: the 30 days alone; Notices, Memory and System are in the head, each marked for what waits behind it:
    // a notice, a proposal, and Health well.
    expect(await ui.find({ type: 'Text', text: exact('Last 30 days 43 stories · $1.10 per story') })).toBeDefined()
    expect((await ui.find({ key: 'tab-bell' }))?.props.label).toBe('Notices')
    expect((await ui.find({ key: 'tab-memory' }))?.props.label).toBe('Memory')
    expect((await ui.find({ key: 'tab-status' }))?.props.label).toBe('System')
    expect(await marked(ui, 'tab-bell')).toBe(true)
    expect(await marked(ui, 'tab-memory')).toBe(true)
    expect(await marked(ui, 'tab-status')).toBe(false)
    await ui.unmount()
  }
})

test('the tiles: a stroke, a coloured number and a card\'s fill, the waiting tile\'s purple; amber is the stuck tile\'s stroke alone', async ($, on) => {
  const terylon = world(on)
  terylon.answers.work_in_flight = { ...FLIGHT, stories: [{ ...FLIGHT.stories[0], stuck: { since: '2026-10-11T15:20:00Z', reason: 'no progress' } }, FLIGHT.stories[1]] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })

  // A TILE'S NUMBER AND ITS WORD, in its drawn children.
  type Drawn = { props: Record<string, unknown>; children: { props: Record<string, unknown>; text: string }[] }
  const partsOf = async (key: string) => ((await ui.find({ key })) as unknown as Drawn).children

  for (const [key, stroke, count, color, label] of [['tile-waiting', 'merged', '3', 'merged', 'waiting for you'], ['tile-running', 'subtle', '2', 'suggestion', 'running'], ['tile-stuck', 'warning', '1', 'text', 'stuck']] as const) {
    const tile = await ui.find({ key })
    expect(tile?.props).toMatchObject({ borderStyle: 'round', borderColor: stroke })
    expect(tile?.props.backgroundColor).toBe(key === 'tile-waiting' ? WAITING_TILE_FILL : CARD_FILL)
    const [number, word] = await partsOf(key)
    expect(number?.props).toMatchObject({ color, tabular: true, size: 'title', weight: 'semibold' })
    expect(await ui.find({ type: 'Text', text: exact(count) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact(label) })).toBeDefined()
    expect(word?.props.color).toBe(key === 'tile-waiting' ? 'inactive' : 'subtle')
  }

  // NOTHING RUNNING, NOTHING STUCK: quiet numbers and quiet strokes.
  terylon.answers.work_in_flight = { ...FLIGHT, stories: [] }
  await ui.press({ key: 'refresh' })
  expect((await ui.find({ key: 'tile-stuck' }))?.props.borderColor).toBe('subtle')
  expect((await partsOf('tile-stuck'))[0]?.props.color).toBe('inactive')
  expect((await partsOf('tile-running'))[0]?.props.color).toBe('inactive')
})

test('the house style: theme keys and the one fill of each kind, round cards, a card that waits stroked, and the kinds as chips on the desktop', async ($, on) => {
  // LATE ON THE LOCAL DAY of the merge (#39): "done today" is the host's day, and the merged chip is drawn in every zone.
  const terylon = world(on, { now: lateOnTheLocalDayOf('2026-10-11T12:20:00Z') })
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await $.command.run({ command: 'terylon-cockpit', args: '' } as never)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
    const boxes = await ui.findAll({ type: 'Box' })
    const texts = await ui.findAll({ type: 'Text' })

    for (const node of [...boxes, ...texts]) {
      for (const color of [node.props.color, node.props.borderColor, node.props.backgroundColor]) {
        if (color !== undefined) {
          expect([...THEME, CARD_FILL, WAITING_TILE_FILL]).toContain(color)
        }
      }
    }

    // NO CARD TAKES A TINT OF WHAT IT HOLDS (the owner's walk of 1.2.0: on a tinted fill the hints, links and chips could not
    // be read): every card one faint neutral fill on a graphic surface, and on the terminal no fill at all.
    const fills = boxes.filter(box => box.props.backgroundColor !== undefined).map(box => box.props.backgroundColor)
    expect(surface === 'desktop' ? fills.filter(fill => fill !== CARD_FILL && fill !== WAITING_TILE_FILL) : fills).toEqual([])
    // A text's background is a chip's, the theme's neutral grey, and only where a surface draws chips.
    const chips = texts.filter(text => text.props.backgroundColor !== undefined)
    expect(chips.map(text => text.text.replace(/[●]+/g, '').replace(/[\s\u00a0]+/g, ' ').trim())).toEqual(surface === 'desktop' ? ['question', 'merge', 'plan', 'Your merge', 'Plan'] : [])
    expect(chips.every(text => text.props.backgroundColor === 'userMessageBackground' && text.props.color === 'inactive' && /^\u00a0●\u00a0.+\u00a0$/.test(text.text))).toBe(true)

    const cards = boxes.filter(box => box.props.borderStyle === 'round')
    // Terminal at this width: one line of counts in place of the tiles.
    const tiles = surface === 'desktop' ? ['merged', 'subtle', 'subtle'] : []
    expect(cards.map(box => box.props.borderColor)).toEqual([...tiles, 'merged', 'subtle', 'subtle'])
    await ui.unmount()
  }
})

test('a question\'s row does not open and does not repeat its text: one line and Answer, both leading to the question', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
  expect((await ui.find({ key: 'answer-9' }))?.props.label).toBe('Answer')
  expect(await ui.find({ type: 'Text', text: exact('Má mrtvý běh pokračovat od posledního commitu?') })).toBeUndefined()

  await ui.press({ key: 'question-9' })
  expect(await ui.find({ key: 'answer-text' })).toBeDefined()
  expect((await ui.find({ type: 'Link', text: 'Answer in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?view=question&question=9')

  await ui.press({ key: 'back' })
  await ui.press({ key: 'answer-9' })
  expect(await ui.find({ key: 'answer-text' })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ type: 'Text', text: exact('Má mrtvý běh pokračovat od posledního commitu?') })).toBeUndefined()
})

test('every console link points at the console screen of its subject, never at a gate tool: one press into the row', async ($, on) => {
  const terylon = world(on, { env: { TERYLON_PANE_PROOFS: 'no-hover-reveal' } })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })

  // WITH THE HOVER REVEAL TURNED OFF, 1.1.2's way: the console link is in the row's body, a press away; a merge's own
  // act is a link already, and into the console, as every merge is.
  expect(await ui.find({ type: 'Link', text: /in the console/ })).toBeUndefined()
  expect((await ui.find({ type: 'Link', text: 'Merge ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?view=merge&story=327')

  for (const key of ['merge-327', 'plan-41']) {
    await ui.press({ key })
  }

  const links = (await ui.findAll({ type: 'Link' })).map(link => String(link.props.href))

  expect(links).toContain('https://terylon.example.ts.net/?view=merge&story=327')
  // A PLAN'S ROW OPENS THE PLAN (S27): its acts are on its card; the row itself no longer links out.
  expect(links).not.toContain('https://terylon.example.ts.net/?view=plan&plan=41')
  expect(await ui.find({ key: 'open-plan-41' })).toBeDefined()
})

test('on the phone there is no Input: adding a task posts a request into the session', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', surface: 'mobile', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })

  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('Waiting for you') })).toBeDefined()
  await ui.press({ key: 'phone-add' })
  expect(terylon.prompts).toEqual(['Chci přidat úkol lídrovi Terylonu. Zeptej se mě, co a po čem.'])
})

test('a row longer than its card stays one line: the title is cut inside the one Button, and a press opens it whole', async ($, on) => {
  const long = 'Co má být v excelu, k čemu bude sloužit a jaké sloupce či listy v něm čekáte? '.repeat(4).trim()
  const terylon = world(on)
  terylon.answers.briefing = { ...BRIEFING, questionsOpen: [{ id: 22, subject: 'goal/1', about: 'Test1', text: long }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
    const title = await ui.find({ type: 'Text', text: /^Test1 — Co má být v excelu/ })

    expect(long.length).toBeGreaterThan(200)
    expect(title?.props.wrap).toBe('truncate-end')
    expect((await ui.find({ key: 'question-22' }))?.type).toBe('Button')
    expect((await ui.find({ key: 'question-22' }))?.props.plain).toBe(true)
    expect((await chipOf(ui, 'question-22'))?.dot).toBe('warning')
    expect(await ui.find({ type: 'Link', text: exact('↗') })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: exact(long) })).toBeUndefined()

    await ui.press({ key: 'question-22' })
    const whole = await ui.find({ type: 'Text', text: exact(long) })
    expect(whole?.props.wrap).toBeUndefined()
    expect((await ui.find({ type: 'Link', text: 'Answer in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?view=question&question=22')
    await ui.press({ key: 'back' })
    await ui.unmount()
  }
})
