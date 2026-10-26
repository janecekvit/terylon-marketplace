// The leader's intake (S31, #26): a new goal is steered toward a direction, and every answered question is
// confirmed. The operator's 1.1.2 walk: the first answer said "Answered…", the second stayed in the field with no word.

import { test, expect } from 'claude-code/testing'

import { BRIEFING, GOAL_QUESTION, PANE_PROPS, SESSION, exact, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

const STEERING = 'A goal is a general direction. A concrete ask — a file, a document, one change — becomes a task under a goal. The leader asks its questions first, then makes a plan you approve.'
const READ_FIRST = 'The leader reads it first: a general direction stays a goal; a concrete ask — a file, a document, one change — becomes a task under a goal.'

test('the new goal line steers toward a direction, and an added goal says the leader reads it first', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })

  expect((await ui.find({ type: 'Text', text: exact(STEERING) }))?.props.color).toBe('subtle')
  expect(await ui.find({ type: 'Text', text: /makes a plan of the goal, which you approve/ })).toBeUndefined()

  // A CONCRETE ASK IS NEVER REFUSED: it is added, and the leader decides what becomes of it.
  await ui.input({ key: 'goal-draft', text: 'create an Excel file with the costs', kind: 'change' })
  await ui.press({ key: 'goal-add' })
  expect(terylon.calls.filter(call => call.tool === 'goal_add').map(call => call.args)).toEqual([{ title: 'create an Excel file with the costs', priority: 2, target: 'list' }])
  expect((await ui.find({ type: 'Text', text: exact(`✓ Goal 12 is set: create an Excel file with the costs. ${READ_FIRST}`) }))?.props.color).toBe('success')
})

test('a leader whose own answer already steers is not said twice', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goal_add = (args: Record<string, unknown>) => ({ accepted: true, sentence: `Goal 21 is set: ${String(args.title)}. ${READ_FIRST}`, commandId: 'c4', subjectId: 21 })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.input({ key: 'goal-draft', text: 'create an Excel file with the costs', kind: 'change' })
  await ui.press({ key: 'goal-add' })

  expect(await ui.find({ type: 'Text', text: exact(`✓ Goal 21 is set: create an Excel file with the costs. ${READ_FIRST}`) })).toBeDefined()
})

test('every answered question is confirmed and its field cleared, the second as the first, sent by Enter or by Answer', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { ...BRIEFING, questionsOpen: [...BRIEFING.questionsOpen, GOAL_QUESTION] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'question-9' })
  await ui.press({ key: 'answer-9' })
  await ui.input({ key: 'answer-text', text: 'Ano, od posledního commitu.', kind: 'change' })
  await ui.press({ key: 'answer-send' })

  expect((await ui.find({ type: 'Text', text: exact('✓ Answer handed over · Answered; the leader takes it from here.') }))?.props.color).toBe('success')
  expect(await ui.find({ key: 'answer-text' })).toBeUndefined()

  // THE SECOND QUESTION, typed and sent by Enter: the submitted text is the answer, whatever reached onInput.
  await ui.press({ key: 'answer-next' })
  expect((await ui.find({ key: 'answer-text' }))?.props.value).toBe('')
  await ui.input({ key: 'answer-text', text: 'vzhled webu na mobilu', kind: 'submit' })

  expect(terylon.calls.filter(call => call.tool === 'question_answer').map(call => call.args)).toEqual([
    { question: 9, answer: 'Ano, od posledního commitu.' },
    { question: 606, answer: 'vzhled webu na mobilu' },
  ])
  expect((await ui.find({ type: 'Text', text: exact('✓ Answer handed over · Answered; the leader takes it from here.') }))?.props.color).toBe('success')
  expect(await ui.find({ key: 'answer-text' })).toBeUndefined()
})

test('a refused answer keeps its text and says why in the same place', async ($, on) => {
  const terylon = world(on)
  terylon.answers.question_answer = { accepted: false, sentence: 'Question 9 is already answered.', commandId: 'c5', subjectId: null }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'question-9' })
  await ui.press({ key: 'answer-9' })
  await ui.input({ key: 'answer-text', text: 'Ano, od posledního commitu.', kind: 'submit' })

  expect(await ui.find({ type: 'Text', text: exact('Reason: Question 9 is already answered.') })).toBeDefined()
  await ui.press({ key: 'answer-retry' })
  expect((await ui.find({ key: 'answer-text' }))?.props.value).toBe('Ano, od posledního commitu.')
})
