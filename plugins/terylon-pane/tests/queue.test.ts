import { test, expect } from 'claude-code/testing'

import { BRIEFING, PANE_PROPS, SESSION, chipOf, exact, lateOnTheLocalDayOf, pictures, world } from './fixtures'

// The theme keys the house style allows: a colour is a role, never a hex value.
const THEME = ['text', 'inactive', 'subtle', 'suggestion', 'success', 'warning', 'error', 'merged', 'userMessageBackground']

test('the queue draws the four groups from Terylon as cards, each row one Button, on the desktop and the terminal', async ($, on) => {
  const terylon = world(on, { now: lateOnTheLocalDayOf('2026-10-11T12:20:00Z') })
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await $.command.run({ command: 'terylon-pane', args: '' } as never).catch(() => undefined)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'Pane', requestId: 'terylon', props: PANE_PROPS })

    const tab = await ui.find({ key: 'tab-queue' })
    expect(tab?.props.label).toBe('Queue')
    expect(tab?.props.variant).toBe('primary')
    expect(tab?.props.hotkey).toBe('1')
    expect(tab?.text).toBe(surface === 'terminal' ? '● Queue' : 'Queue')
    expect((await ui.find({ key: 'tab-goals' }))?.props.dimColor).toBe(true)
    expect((await ui.find({ type: 'Link', text: 'terylon' }))?.props.href).toBe('https://terylon.example.ts.net')
    const connected = await ui.find({ type: 'Text', text: exact('connected · 0 s ago') })
    expect(connected?.props.color).toBe('subtle')
    expect(connected?.props.tabular).toBe(true)

    // ONE ROW, ONE BUTTON (S32): the kind chip, the title, the detail, keyed by the subject's id.
    expect(await ui.find({ type: 'Text', text: exact('Waiting for you · 3') })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact('decide here · merge in the console') }))?.props.color).toBe('subtle')
    expect((await ui.find({ key: 'question-9' }))?.text).toMatch(/^\s*(?:●\s+)?question\s+#333 — Má mrtvý běh pokračovat od posledního commitu\?$/)
    expect((await ui.find({ key: 'merge-327' }))?.text).toMatch(/^\s*(?:●\s+)?merge\s+#327 Events since the last look · verified in pr-196 · waiting for merge$/)
    expect((await ui.find({ key: 'plan-41' }))?.text).toMatch(/^\s*(?:●\s+)?plan\s+Plan 41 · Agentic OS · 3 stories$/)
    // THE KIND AS A CHIP: a dot in the kind's colour, the word in inactive, which reads on the chip in both themes.
    expect(await chipOf(ui, 'question-9')).toEqual({ word: 'inactive', dot: 'warning', background: surface === 'desktop' ? 'userMessageBackground' : undefined, size: 'caption' })
    expect((await chipOf(ui, 'merge-327'))?.dot).toBe('merged')
    expect((await chipOf(ui, 'plan-41'))?.dot).toBe('inactive')

    expect(await ui.find({ type: 'Text', text: exact('Running · 2') })).toBeDefined()
    expect((await ui.find({ key: 'story-333' }))?.text).toMatch(/^#333 Direct dispatch\s+5\/8 · \$2\.10$/)
    expect((await ui.find({ type: 'Text', text: exact('5/8 · $2.10') }))?.props.tabular).toBe(true)
    expect(await ui.find({ type: 'Text', text: exact('verifying · $3.40') })).toBeDefined()

    if (surface === 'desktop') {
      // THE RUNNING HEADING'S GAUGES and THE RUN'S EIGHT SEGMENTS, as Svg with an alt; every word outside it.
      const drawn = await pictures(ui)
      expect(drawn.map(item => item.alt)).toEqual(['2 of 4 slots in use', '$5.50 of $20 today', 'Phase 5 of 8: tests', 'Phase 7 of 8: verified'])
      expect((await ui.find({ type: 'Text', text: exact('2/4 slots') }))?.props.tabular).toBe(true)
      expect(await ui.find({ type: 'Text', text: exact('$5.50 of $20') })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: exact('Tests · tester · step 5 of 9') })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: exact('Verified in its PR environment · pr-197') })).toBeDefined()
    } else {
      // THE TERMINAL HAS NO Svg: ▰▱ cells for the gauges, ✓●○◇ for the phases, the same words beside them.
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: exact('▰▰▱▱ 2/4 slots · ▰▱▱▱ $5.50 of $20') })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: exact('✓ ✓ ✓ ✓ ● ○ ○ ◇  Tests · tester · step 5 of 9') })).toBeDefined()
      expect((await ui.findAll({ type: 'Text', text: exact('● ') })).map(node => node.props.color)).toEqual(['suggestion', 'suggestion'])
      expect((await ui.findAll({ type: 'Text', text: exact('◇ ') })).every(node => node.props.color === 'subtle')).toBe(true)
    }

    expect(await ui.find({ type: 'Text', text: exact('Queued · 2') })).toBeDefined()
    expect((await ui.find({ key: 'queued-328' }))?.text).toMatch(/^\s*(?:●\s+)?queued\s+#328 Owner's spec and plan\s+after #324$/)
    expect((await ui.find({ type: 'Text', text: exact('tvoje volba') }))?.props).toMatchObject({ color: 'text', weight: 'semibold' })

    expect(await ui.find({ type: 'Text', text: exact('Done today · 1') })).toBeDefined()
    expect((await chipOf(ui, 'done-341'))?.dot).toBe('merged')
    expect((await ui.find({ key: 'done-341' }))?.text).toContain('#341 S10a cleanup')

    expect(await ui.find({ key: 'quick-add' })).toBeDefined()
    const footer = await ui.find({ type: 'Text', text: exact('/terylon-pane · /terylon-memory') })
    expect(footer?.props.color).toBe('subtle')
    expect(footer?.props.mono).toBe(true)
    await ui.unmount()
  }
})

test('the counts carry their colours in tabular digits: waiting warning, running suggestion, done success', async ($, on) => {
  const terylon = world(on, { now: lateOnTheLocalDayOf('2026-10-11T12:20:00Z') })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
  const counts = await ui.findAll({ type: 'Text', text: /^ · \d$/ })

  expect(counts.map(count => [count.text, count.props.color])).toEqual([[' · 3', 'text'], [' · 2', 'suggestion'], [' · 2', 'inactive'], [' · 1', 'success']])
  expect(counts.every(count => count.props.tabular === true)).toBe(true)

  // A CARD'S HEADING (S32): semibold at the heading size.
  const heading = await ui.find({ type: 'Text', text: exact('Waiting for you · 3') })
  expect(heading?.props.size).toBe('heading')
  expect(heading?.props.weight).toBe('semibold')
})

test('the house style: theme keys only, round cards, a card that waits stroked and never filled, and the kinds as chips on the desktop', async ($, on) => {
  // LATE ON THE LOCAL DAY of the merge (#39): "done today" is the host's day, and the merged chip is drawn in every zone.
  const terylon = world(on, { now: lateOnTheLocalDayOf('2026-10-11T12:20:00Z') })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
    const boxes = await ui.findAll({ type: 'Box' })
    const texts = await ui.findAll({ type: 'Text' })

    for (const node of [...boxes, ...texts]) {
      for (const color of [node.props.color, node.props.borderColor, node.props.backgroundColor]) {
        if (color !== undefined) {
          expect(THEME).toContain(color)
        }
      }
    }

    // NO CARD IS FILLED (the owner's walk of 1.2.0: on a tinted fill the hints, links and chips could not be read).
    // Only a kind chip has a background, the theme's neutral grey, and only where a surface draws chips.
    expect(boxes.filter(box => box.props.backgroundColor !== undefined)).toEqual([])
    const chips = texts.filter(text => text.props.backgroundColor !== undefined)
    expect(chips.map(text => text.text.replace(/[\s●]+/g, ''))).toEqual(surface === 'desktop' ? ['question', 'merge', 'plan', 'queued', 'held', 'merged'] : [])
    expect(chips.every(text => text.props.backgroundColor === 'userMessageBackground' && text.props.color === 'inactive' && /^\u00a0●\u00a0\S+\u00a0$/.test(text.text))).toBe(true)

    const cards = boxes.filter(box => box.props.borderStyle === 'round')
    expect(cards.length).toBeGreaterThanOrEqual(3)
    expect(cards.map(box => box.props.borderColor)).toEqual(['warning', 'subtle', 'subtle', 'subtle'])
    await ui.unmount()
  }
})

test('a waiting row opens under itself: the whole question and the way to answer it', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
  expect(await ui.find({ key: 'answer-9' })).toBeUndefined()

  await ui.press({ key: 'question-9' })
  expect((await ui.find({ key: 'answer-9' }))?.props.label).toBe('Answer')
  expect((await ui.find({ type: 'Link', text: 'Answer in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=question&question=9')

  await ui.press({ key: 'question-9' })
  expect(await ui.find({ key: 'answer-9' })).toBeUndefined()
})

test('every console link points at the console screen of its subject, never at a gate tool: one press into the row', async ($, on) => {
  const terylon = world(on, { env: { TERYLON_PANE_PROOFS: 'no-hover-reveal' } })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })

  // WITH THE HOVER REVEAL TURNED OFF, 1.1.2's way: the console link is in the row's body, a press away.
  expect(await ui.find({ type: 'Link', text: /in the console/ })).toBeUndefined()

  for (const key of ['merge-327', 'plan-41', 'question-9']) {
    await ui.press({ key })
  }

  const links = (await ui.findAll({ type: 'Link' })).map(link => String(link.props.href))

  expect(links).toContain('https://terylon.example.ts.net/?cockpit=merge&story=327')
  expect(links).toContain('https://terylon.example.ts.net/?cockpit=question&question=9')
  // A PLAN'S ROW OPENS THE PLAN (S27): its acts are on its card; the row itself no longer links out.
  expect(links).not.toContain('https://terylon.example.ts.net/?cockpit=plan&plan=41')
  expect(await ui.find({ key: 'open-plan-41' })).toBeDefined()
})

test('on the phone there is no Input: adding a task posts a request into the session', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', surface: 'mobile', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })

  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('Waiting for you · 3') })).toBeDefined()
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
    expect((await ui.find({ type: 'Link', text: 'Answer in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=question&question=22')
    await ui.press({ key: 'question-22' })
    await ui.unmount()
  }
})
