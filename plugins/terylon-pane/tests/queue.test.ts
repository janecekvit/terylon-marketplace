import { test, expect } from 'claude-code/testing'

import { BRIEFING, PANE_PROPS, SESSION, exact, lateOnTheLocalDayOf, world } from './fixtures'

// The theme keys the house style allows: a colour is a role, never a hex value.
const THEME = ['text', 'inactive', 'subtle', 'suggestion', 'success', 'warning', 'error']

test('the queue draws the four groups from Terylon as cards, on the desktop and the terminal', async ($, on) => {
  const terylon = world(on, { now: lateOnTheLocalDayOf('2026-10-11T12:20:00Z') })
  await $.session.start(SESSION)
  await terylon.clock.settle()
  await $.command.run({ command: 'terylon-pane', args: '' } as never).catch(() => undefined)

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'Pane', requestId: 'terylon', props: PANE_PROPS })

    const tab = await ui.find({ key: 'tab-queue' })
    expect(tab?.props.label).toBe('● Queue')
    expect(tab?.props.variant).toBe('primary')
    expect((await ui.find({ key: 'tab-goals' }))?.props.dimColor).toBe(true)
    expect((await ui.find({ type: 'Link', text: 'terylon' }))?.props.href).toBe('https://terylon.example.ts.net')
    expect((await ui.find({ type: 'Text', text: exact('connected · 0 s ago') }))?.props.color).toBe('subtle')

    expect(await ui.find({ type: 'Text', text: exact('Waiting for you · 3') })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact('you decide in the console') }))?.props.color).toBe('subtle')
    expect((await ui.find({ key: 'question-9' }))?.text).toBe('#333 — Má mrtvý běh pokračovat od posledního commitu?')
    expect((await ui.findAll({ type: 'Text', text: exact('question') })).every(kind => kind.props.color === 'subtle')).toBe(true)
    expect((await ui.find({ key: 'merge-327' }))?.text).toBe('#327 Events since the last look · verified in pr-196 · waiting for merge')
    expect((await ui.find({ key: 'plan-41' }))?.text).toBe('Plan 41 · Agentic OS · 3 stories')

    expect(await ui.find({ type: 'Text', text: exact('Running · 2') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('running $5.50 of $20 today · 2 of 4 slots') })).toBeDefined()
    expect((await ui.find({ key: 'story-333' }))?.text).toBe('#333 Direct dispatch')
    expect(await ui.find({ type: 'Text', text: exact('5/9 · $2.10') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('verifying · $3.40') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Step 5 of 9: testy') })).toBeDefined()

    expect(await ui.find({ type: 'Text', text: exact('Queued · 2') })).toBeDefined()
    expect((await ui.find({ key: 'queued-328' }))?.text).toBe("#328 Owner's spec and plan")
    expect((await ui.find({ type: 'Text', text: exact('tvoje volba') }))?.props.color).toBe('warning')

    expect(await ui.find({ type: 'Text', text: exact('Done today · 1') })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact('merged') }))?.props.color).toBe('success')
    expect((await ui.find({ key: 'done-341' }))?.text).toContain('#341 S10a cleanup')

    expect(await ui.find({ key: 'quick-add' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact('/terylon-pane · /terylon-memory') }))?.props.color).toBe('subtle')
    await ui.unmount()
  }
})

test('the counts carry their colours: waiting warning, running suggestion, done success', async ($, on) => {
  const terylon = world(on, { now: lateOnTheLocalDayOf('2026-10-11T12:20:00Z') })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
  const counts = await ui.findAll({ type: 'Text', text: /^ · \d$/ })

  expect(counts.map(count => [count.text, count.props.color])).toEqual([[' · 3', 'warning'], [' · 2', 'suggestion'], [' · 2', 'inactive'], [' · 1', 'success']])
})

test('the house style: theme keys only, no background, round subtle cards', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
    const boxes = await ui.findAll({ type: 'Box' })
    const texts = await ui.findAll({ type: 'Text' })

    for (const node of [...boxes, ...texts]) {
      expect(node.props.backgroundColor).toBeUndefined()

      for (const color of [node.props.color, node.props.borderColor]) {
        if (color !== undefined) {
          expect(THEME).toContain(color)
        }
      }
    }

    const cards = boxes.filter(box => box.props.borderStyle === 'round')
    expect(cards.length).toBeGreaterThanOrEqual(3)
    expect(cards.every(box => box.props.borderColor === 'subtle')).toBe(true)
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

test('every console link points at the console screen of its gate, never at a gate tool', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
  const links = (await ui.findAll({ type: 'Link' })).map(link => String(link.props.href))

  expect(links).toContain('https://terylon.example.ts.net/?cockpit=merge&story=327')
  expect(links).toContain('https://terylon.example.ts.net/?cockpit=plan&plan=41')
  expect(links).toContain('https://terylon.example.ts.net/?cockpit=question&question=9')
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

test('a row longer than its card stays one line: the title is cut, the kind and the ↗ stay, and a press opens it whole', async ($, on) => {
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
    expect((await ui.find({ type: 'Text', text: exact('question') }))?.props.color).toBe('subtle')
    expect((await ui.find({ type: 'Link', text: '↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=question&question=22')
    expect(await ui.find({ type: 'Text', text: exact(long) })).toBeUndefined()

    await ui.press({ key: 'question-22' })
    const whole = await ui.find({ type: 'Text', text: exact(long) })
    expect(whole?.props.wrap).toBeUndefined()
    await ui.press({ key: 'question-22' })
    await ui.unmount()
  }
})
