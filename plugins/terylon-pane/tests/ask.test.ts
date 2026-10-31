// A goal carries its ask (Terylon S52): the Goals tab's New goal takes a short title and, in the owner's own words,
// what the goal should do. goal_add is sent the ask only where one was typed, and Terylon's refusal of a length is
// said word for word. On the desktop, in the narrow dock and on the terminal alike.

import { test, expect } from 'claude-code/testing'

import { NARROW_PANE_PROPS, PANE_PROPS, SESSION, exact, refusal, world } from './fixtures'

const TITLE_HELP = 'A short name: up to 200 characters.'
const ASK_HELP = 'In your own words, as long as you need. The leader plans from it and asks if anything is unclear.'
const ASK = 'Keep the household budget in one Excel file.\nEvery month, add the bank statement and say where it went over.'
const TOO_LONG = 'An ask is at most 4000 characters; this one has 4120.'

const SURFACES = [
  { name: 'desktop', surface: 'desktop', props: PANE_PROPS },
  { name: 'the narrow dock', surface: 'desktop', props: NARROW_PANE_PROPS },
  { name: 'terminal', surface: 'terminal', props: PANE_PROPS },
] as const

function goalAdds(terylon: ReturnType<typeof world>): Record<string, unknown>[] {
  return terylon.calls.filter(call => call.tool === 'goal_add').map(call => call.args)
}

for (const { name, surface, props } of SURFACES) {
  test(`${name}: New goal draws Title and What should it do?, each with its helper line, the pickers and Add goal`, async ($, on) => {
    const terylon = world(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await ui.press({ key: 'tab-goals' })

    expect((await ui.find({ key: 'goal-draft' }))?.props).toMatchObject({ label: 'Title' })
    expect((await ui.find({ key: 'goal-draft' }))?.props.rows).toBeUndefined()
    expect((await ui.find({ key: 'goal-ask' }))?.props).toMatchObject({ label: 'What should it do?', rows: 4, value: '' })
    expect((await ui.find({ type: 'Text', text: exact(TITLE_HELP) }))?.props.color).toBe('subtle')
    expect((await ui.find({ type: 'Text', text: exact(ASK_HELP) }))?.props.color).toBe('subtle')
    expect(await ui.find({ key: 'goal-priority' })).toBeDefined()
    expect(await ui.find({ key: 'goal-target' })).toBeDefined()
    expect((await ui.find({ key: 'goal-add' }))?.props.label).toBe('Add goal')
  })

  test(`${name}: goal_add carries the ask as typed, and the form is cleared once the goal is set`, async ($, on) => {
    const terylon = world(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props, surface })
    await ui.press({ key: 'tab-goals' })
    await ui.input({ key: 'goal-draft', text: 'Household budget', kind: 'change' })
    await ui.input({ key: 'goal-ask', text: ASK, kind: 'change' })
    await ui.press({ key: 'goal-add' })

    expect(goalAdds(terylon)).toEqual([{ title: 'Household budget', ask: ASK, priority: 2, target: 'list' }])
    expect(await ui.find({ type: 'Text', text: /^✓ Goal 12 is set: Household budget\./ })).toBeDefined()
    expect((await ui.find({ key: 'goal-draft' }))?.props.value).toBe('')
    expect((await ui.find({ key: 'goal-ask' }))?.props.value).toBe('')
  })
}

test('a blank ask is left out of goal_add, never sent empty', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.input({ key: 'goal-draft', text: 'Household budget', kind: 'change' })
  await ui.press({ key: 'goal-add' })
  await ui.input({ key: 'goal-draft', text: 'Garden', kind: 'change' })
  await ui.input({ key: 'goal-ask', text: '  \n ', kind: 'change' })
  await ui.press({ key: 'goal-add' })

  expect(goalAdds(terylon)).toEqual([
    { title: 'Household budget', priority: 2, target: 'list' },
    { title: 'Garden', priority: 2, target: 'list' },
  ])
})

test("Terylon's refusal of a long ask is said word for word, and what was typed stays", async ($, on) => {
  const terylon = world(on)
  terylon.answers.goal_add = refusal(TOO_LONG, 400)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.input({ key: 'goal-draft', text: 'Household budget', kind: 'change' })
  await ui.input({ key: 'goal-ask', text: ASK, kind: 'change' })
  await ui.press({ key: 'goal-add' })

  expect((await ui.find({ type: 'Text', text: exact(TOO_LONG) }))?.props.color).toBe('error')
  expect((await ui.find({ key: 'goal-draft' }))?.props.value).toBe('Household budget')
  expect((await ui.find({ key: 'goal-ask' }))?.props.value).toBe(ASK)
})
