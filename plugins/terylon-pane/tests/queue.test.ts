import { test, expect } from 'claude-code/testing'

import { PANE_PROPS, SESSION, world } from './fixtures'

test('the queue draws the four groups from Terylon on the desktop and the terminal', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'Pane', requestId: 'terylon', props: PANE_PROPS })

    expect(await ui.find({ type: 'Text', text: 'ČEKÁ NA TEBE · 3' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '#327 Events since the last look' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'ověřená v pr-196 · čeká na merge' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Plán 41 · P1' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Plán 41 · Agentic OS · 3 story' })).toBeDefined()
    expect(await ui.find({ type: 'Link', text: 'V konzoli ↗' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'BĚŽÍ · 2' })).toBeDefined()
    expect(await ui.find({ key: 'story-333' })).toBeDefined()
    expect((await ui.find({ key: 'story-333' }))?.text).toContain('5/9 · $2.10')
    expect((await ui.find({ key: 'story-329' }))?.text).toContain('ověřuje se')
    expect(await ui.find({ type: 'Text', text: 'VE FRONTĚ · 2' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'až po #324' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'drženo: tvoje volba' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'HOTOVO DNES · 1' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'v běhu $5.50 z denních $20 · 2 ze 4 slotů' })).toBeDefined()
    expect(await ui.find({ key: 'quick-add' })).toBeDefined()
    await ui.unmount()
  }

  expect(terylon.statuses).toContain('Terylon · 2 běží · 3 čekají')
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
  expect(await ui.find({ type: 'Text', text: 'ČEKÁ NA TEBE · 3' })).toBeDefined()
  await ui.press({ key: 'phone-add' })
  expect(terylon.prompts).toEqual(['Chci přidat úkol lídrovi Terylonu. Zeptej se mě, co a po čem.'])
})

test('a running story opens with its step, cost and the run question, and summarising posts a request', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
  await ui.press({ key: 'story-333' })

  expect(await ui.find({ type: 'Text', text: 'Krok 5 z 9: testy' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '$2.10 z $8' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Má mrtvý běh pokračovat od posledního commitu?' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'feat/direct-dispatch' })).toBeDefined()
  await ui.press({ key: 'summarise' })
  expect(terylon.prompts).toEqual(['Shrň mi story #333 z Terylonu: kde je, co stojí a co potřebuje (story_get, work_in_flight).'])
  await ui.press({ key: 'back' })
  expect(await ui.find({ type: 'Text', text: 'BĚŽÍ · 2' })).toBeDefined()
})
