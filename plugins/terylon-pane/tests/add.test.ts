import { test, expect } from 'claude-code/testing'

import { PANE_PROPS, SESSION, world } from './fixtures'

const MOUNT = { plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

test('adding a task sends tasks_add under the goal, after the chosen story, and links the plan to the console', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.input({ key: 'quick-add', text: 'Konzole: tlačítko Check now u Health' })

  expect(await ui.find({ type: 'Text', text: 'New task' })).toBeDefined()
  expect((await ui.find({ key: 'add-title' }))?.props.value).toBe('Konzole: tlačítko Check now u Health')

  await ui.input({ key: 'add-criteria', text: 'Tlačítko je vidět; Spustí kontrolu', kind: 'change' })
  await ui.select({ key: 'add-after', value: '328' })
  await ui.press({ key: 'add-send' })

  const sent = terylon.calls.filter(call => call.tool === 'tasks_add')
  expect(sent).toHaveLength(1)
  expect(sent[0]?.args).toEqual({
    goal: 3,
    tasks: [{ title: 'Konzole: tlačítko Check now u Health', brief: 'Konzole: tlačítko Check now u Health', criteria: ['Tlačítko je vidět', 'Spustí kontrolu'], files: [], size: 'M', after: [328] }],
  })
  expect(await ui.find({ type: 'Text', text: '✓ Handed over' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Lídr z úkolu udělal plán 42.' })).toBeDefined()
  expect((await ui.find({ type: 'Link', text: 'Plan in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=plan&goal=3')
  // The plan the task becomes is approved on its own card, under Waiting for you, never from the task's result.
  expect(await ui.find({ type: 'Button', text: /Approve/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'The plan it becomes waits for you under “Waiting for you”.' })).toBeDefined()
})

test("a refused task shows the leader's own sentence, and the form comes back to edit", async ($, on) => {
  const terylon = world(on)
  terylon.answers.tasks_add = { accepted: false, sentence: 'The order makes a cycle: 337 → 999 → 337. Nothing was added.', commandId: 'c9', subjectId: null }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.input({ key: 'quick-add', text: 'Kruh' })
  await ui.press({ key: 'add-send' })

  expect(await ui.find({ type: 'Text', text: 'Not handed over' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'The order makes a cycle: 337 → 999 → 337. Nothing was added.' })).toBeDefined()
  await ui.press({ key: 'add-retry' })
  expect((await ui.find({ key: 'add-title' }))?.props.value).toBe('Kruh')
})

test('a leader that does not answer within 10 s is said so with the command, and a paused one as written and waiting', async ($, on) => {
  const terylon = world(on)
  terylon.answers.tasks_add = { accepted: null, sentence: 'The leader has not answered within 10 s; ask leader_answer with this commandId.', commandId: '9f2c', subjectId: null }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount(MOUNT)
  await ui.input({ key: 'quick-add', text: 'Pomalý' })
  await ui.press({ key: 'add-send' })
  expect(await ui.find({ type: 'Text', text: 'The leader did not answer within 10 s. The task may have arrived; look at the queue before you send it again (command 9f2c).' })).toBeDefined()

  terylon.answers.work_in_flight = { slots: 4, paused: true, stories: [] }
  await ui.press({ key: 'back' })
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ type: 'Text', text: /The leader is paused/ })).toBeDefined()
  expect((await ui.find({ key: 'act-leader-resume' }))?.props.label).toBe('Resume')

  await ui.input({ key: 'quick-add', text: 'Během pauzy' })
  await ui.press({ key: 'add-send' })
  expect(await ui.find({ type: 'Text', text: 'The leader is paused. The task is written down and waits; the plan comes after the resume.' })).toBeDefined()
})
