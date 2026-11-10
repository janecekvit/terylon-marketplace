// The operator's Desktop walk of 1.1.1 (2026-10-21, #360): the Goals and Bell tabs sat on "Loading…" for good, a
// question was posted into the chat twice, and the Status tab read "1 stories". Each is held here.

import { test, expect } from 'claude-code/testing'

import { GOAL_QUESTION, BRIEFING, PANE_PROPS, SESSION, exact, world, pill, toOverview, toRoot } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

async function isLoading(ui: { findAll: (query: Record<string, unknown>) => Promise<{ text: string }[]> }): Promise<boolean> {
  return (await ui.findAll({ type: 'Text' })).some(node => /Loading/.test(node.text))
}

for (const [tab, tool, title] of [['refresh', 'goals_list', 'Goals did not load'], ['tab-bell', 'notices_list', 'Notices did not load']] as const) {
  test(`${tab}: a call that never answers ends as the screen's error with its reason, never "Loading…" forever`, async ($, on) => {
    const terylon = world(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()
    terylon.hang.add(tool)

    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    const pressed = ui.press({ key: tab })
    await terylon.clock.settle()
    expect(await isLoading(ui)).toBe(true)

    // UNDER DESKTOP'S 10 s BOUND ON A PRESS, the load gives up and says so.
    await terylon.clock.advance(8000)
    await terylon.clock.settle()
    await pressed

    expect(await isLoading(ui)).toBe(false)
    expect(await ui.find({ type: 'Text', text: new RegExp(`^${title}`) })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /did not answer within 8 s/ })).toBeDefined()
    expect(terylon.logs.some(entry => entry.to === 'debug' && /loading .* failed: Terylon did not answer within 8 s/.test(entry.text))).toBe(true)

    // PRESSED AGAIN, it loads: nothing is left stuck.
    terylon.hang.delete(tool)
    await toRoot(ui)
    await ui.press({ key: tab })
    await terylon.clock.settle()
    expect(await isLoading(ui)).toBe(false)
    expect(await ui.find({ type: 'Text', text: new RegExp(`^${title}`) })).toBeUndefined()
  })
}

test('a goals or bell value an earlier version of the mod left behind is replaced, and the tab loads', async ($, on) => {
  // AS A RESUMED SESSION MAY KEEP THEM: shapes this version never writes, served until the mod writes its own.
  const stale: Record<string, unknown> = { goals: { phase: 'loading', open: null, plans: 'x' }, bell: { phase: 'loading', unhandled: null } }
  on('state.set', async ($, e, next) => {
    delete stale[String((e as { key?: unknown }).key)]
    return next(e)
  })
  on('state.get', async ($, e, next) => {
    const key = String((e as { key?: unknown }).key)
    return key in stale ? ({ value: { value: stale[key], version: 1 } } as never) : next(e)
  })
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await toOverview(ui)
  await terylon.clock.settle()
  expect(await isLoading(ui)).toBe(false)
  expect(await ui.find({ type: 'Text', text: exact('P1 · Agentic OS') })).toBeDefined()

  await pill(ui, 'tab-bell')
  await terylon.clock.settle()
  expect(await isLoading(ui)).toBe(false)
  expect(await ui.find({ key: 'notice-card-117' })).toBeDefined()
})

test('the same prompt is posted into the chat once, however often it is pressed', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { ...BRIEFING, questionsOpen: [GOAL_QUESTION] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'answer-606' })
  // A DOUBLE CLICK, then a press a moment later.
  await Promise.all([ui.press({ key: 'answer-discuss' }), ui.press({ key: 'answer-discuss' })])
  await ui.press({ key: 'answer-discuss' })

  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toMatch(/606/)

  // A MINUTE LATER it is a new ask, and it is posted.
  await terylon.clock.advance(61000)
  await ui.press({ key: 'answer-discuss' })
  expect(terylon.prompts).toHaveLength(2)
})

test('an answer is sent once while it is being sent, however often Send is pressed', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { ...BRIEFING, questionsOpen: [GOAL_QUESTION] }
  await $.session.start(SESSION)
  await terylon.clock.settle()
  terylon.hang.add('question_answer')

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'answer-606' })
  await ui.input({ key: 'answer-text', text: 'vzhled webu na mobilu', kind: 'change' })
  // A DOUBLE CLICK: both presses dispatched before the screen draws "sending".
  void ui.press({ key: 'answer-send' }).catch(() => undefined)
  void ui.press({ key: 'answer-send' }).catch(() => undefined)
  await terylon.clock.settle()

  const sent = terylon.calls.filter(call => call.tool === 'question_answer')
  expect(sent).toEqual([{ server: 'plugin:terylon-os:terylon', tool: 'question_answer', args: { question: 606, answer: 'vzhled webu na mobilu' } }])
})

