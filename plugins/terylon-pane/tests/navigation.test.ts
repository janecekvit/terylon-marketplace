// Everything the pane shows opens (the operator's ask, #332 c9): queue → story → goal → story and back, a plan,
// a question answered from the pane, the goals and the bell, the memory pane and back. Gates stay links.

import { test, expect } from 'claude-code/testing'

import { BRIEFING, GOAL_QUESTION, PANE_PROPS, SESSION, exact, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: a running story opens whole, its goal opens from it, and ‹ walks back the same way`, async ($, on) => {
    const terylon = world(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'story-333' })

    expect(await ui.find({ type: 'Text', text: exact('#333 Direct dispatch') })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact('running') }))?.props.color).toBe('suggestion')
    expect(await ui.find({ type: 'Text', text: /attempt 2 · feat\/direct-dispatch · opus \/ high$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('Step 5 of 9: testy') })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact("$2.10 of the story's $8") }))?.props.color).toBe('inactive')

    // The phases, from the timeline: admitted done, the run now, the rest still to come.
    expect(await ui.find({ type: 'Text', text: exact('✓ Admitted to a slot') })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: exact('● ') }))?.props.color).toBe('suggestion')
    expect((await ui.find({ type: 'Text', text: exact('Merge — your gate') }))?.props.color).toBe('subtle')
    expect(await ui.find({ type: 'Text', text: /\/mcp does not report yet/ })).toBeDefined()

    // The run's question, answerable from here or in the console.
    expect((await ui.find({ type: 'Text', text: exact('Question from the run') }))?.props.color).toBe('warning')
    expect(await ui.find({ type: 'Text', text: exact('Má mrtvý běh pokračovat od posledního commitu?') })).toBeDefined()
    expect(await ui.find({ key: 'story-answer' })).toBeDefined()

    // Criteria clipped to two, the rest a press away; the timeline newest first.
    expect(await ui.find({ type: 'Text', text: exact('· The pane shows the run') })).toBeUndefined()
    await ui.press({ key: 'criteria-more' })
    expect(await ui.find({ type: 'Text', text: exact('· The pane shows the run') })).toBeDefined()
    expect((await ui.findAll({ type: 'Text', text: /^QuestionAsked$|^admitted: slot 1 of 4$/ })).map(node => node.text)).toEqual(['QuestionAsked', 'admitted: slot 1 of 4'])

    await ui.press({ key: 'summarise' })
    expect(terylon.prompts).toEqual(['Shrň mi story #333 z Terylonu: kde je, co stojí a co potřebuje (story_get, work_in_flight).'])

    // story → goal → another story → back → back → back.
    await ui.press({ key: 'story-goal' })
    expect(await ui.find({ type: 'Text', text: exact('P1 · Agentic OS') })).toBeDefined()
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ #333')
    await ui.press({ key: 'goal-story-329' })
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ Goal 3')
    expect(terylon.calls.filter(call => call.tool === 'story_get').map(call => call.args.story)).toContain(329)
    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'goal-story-333' })).toBeDefined()
    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Text', text: exact('#333 Direct dispatch') })).toBeDefined()
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ Queue')
    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Text', text: exact('Waiting for you · 3') })).toBeDefined()
  })
}

test('a verified story shows its environment, verdict, overrun and criteria; merge and return are links only', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'merge-327' })
  await ui.press({ key: 'open-story-327' })

  expect((await ui.find({ type: 'Text', text: exact('verified · waits for you') }))?.props.color).toBe('success')
  expect(await ui.find({ type: 'Text', text: exact('Environment pr-196') })).toBeDefined()
  expect((await ui.find({ type: 'Link', text: 'https://pr-196.terylon.example.ts.net ↗' }))?.props.href).toBe('https://pr-196.terylon.example.ts.net')
  expect((await ui.find({ type: 'Text', text: exact('Verdict') }))?.props.color).toBe('success')
  expect(await ui.find({ type: 'Text', text: exact('commit 4be21c0') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('✓ dotnet test') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('412 / 412') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: exact('! files outside the declaration ') }))?.props.color).toBe('warning')
  expect(await ui.find({ type: 'Text', text: exact('· a gap in the window answers gap=true') })).toBeDefined()
  expect((await ui.find({ key: 'criteria-more' }))?.props.label).toBe('2 more ▾')
  expect(await ui.find({ type: 'Text', text: exact('✓ Verified in its PR environment') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('● Merge — your gate') })).toBeDefined()

  expect((await ui.find({ type: 'Link', text: 'Merge in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=merge&story=327')
  expect(await ui.find({ type: 'Link', text: 'Return with a note ↗' })).toBeDefined()
  expect((await ui.find({ type: 'Link', text: 'PR 196 ↗' }))?.props.href).toBe('https://dev.example/pr/196')
  expect(await ui.find({ type: 'Button', text: /Merge|Return/ })).toBeUndefined()
})

test('a question is answered from the pane: a choice pressed, question_answer sent, the leader takes it', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { ...BRIEFING, questionsOpen: [...BRIEFING.questionsOpen, GOAL_QUESTION] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'question-606' })
  await ui.press({ key: 'answer-606' })

  expect((await ui.find({ type: 'Text', text: exact('question 2 of 2') }))?.props.color).toBe('warning')
  expect(await ui.find({ type: 'Text', text: /^goal 11 · asked by the leader · \d\d:\d\d$/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Button', text: /^\([abc]\) / })).map(button => button.text)).toEqual(['(a) vzhled webu na mobilu', '(b) zadávání úkolů do Terylonu z telefonu', '(c) něco jiného'])

  await ui.press({ key: 'choice-1' })
  const chosen = await ui.find({ key: 'choice-1' })
  expect(chosen?.props.label).toBe('● (b) zadávání úkolů do Terylonu z telefonu')
  expect(chosen?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'choice-0' }))?.props.dimColor).toBe(true)

  await ui.press({ key: 'answer-send' })
  expect(terylon.calls.filter(call => call.tool === 'question_answer').map(call => call.args)).toEqual([{ question: 606, answer: '(b) zadávání úkolů do Terylonu z telefonu' }])
  expect((await ui.find({ type: 'Text', text: exact('✓ Answer handed over · Answered; the leader takes it from here.') }))?.props.color).toBe('success')
  expect(await ui.find({ key: 'answer-next' })).toBeDefined()
})

test('a typed answer is sent as typed; a refusal is said with its reason and the form comes back', async ($, on) => {
  const terylon = world(on)
  terylon.answers.question_answer = { accepted: false, sentence: 'Question 9 is already answered.', commandId: 'c5', subjectId: null }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'question-9' })
  await ui.press({ key: 'answer-9' })
  await ui.input({ key: 'answer-text', text: 'Ano, od posledního commitu.', kind: 'change' })
  await ui.press({ key: 'answer-send' })

  expect(terylon.calls.filter(call => call.tool === 'question_answer').map(call => call.args)).toEqual([{ question: 9, answer: 'Ano, od posledního commitu.' }])
  expect((await ui.find({ type: 'Text', text: exact('Not handed over') }))?.props.color).toBe('error')
  expect(await ui.find({ type: 'Text', text: exact('Reason: Question 9 is already answered.') })).toBeDefined()

  await ui.press({ key: 'answer-retry' })
  expect(await ui.find({ key: 'answer-text' })).toBeDefined()

  await ui.press({ key: 'answer-discuss' })
  expect(terylon.prompts[0]).toContain('question_answer')
})

test('a waiting plan opens with its stories, each opening the story; approve and rethink are links', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'plan-41' })
  await ui.press({ key: 'open-plan-41' })

  expect(await ui.find({ type: 'Text', text: exact('Plan 41 · Agentic OS') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: exact('to approve · ~$14') }))?.props.color).toBe('subtle')
  expect((await ui.find({ key: 'plan-41-story-351' }))?.text).toBe('Notice handle přes MCP')
  expect(await ui.find({ type: 'Text', text: exact('M · ~$5 · after 1') })).toBeDefined()
  expect((await ui.find({ type: 'Link', text: 'Approve in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=plan&plan=41')
  expect(await ui.find({ type: 'Link', text: 'Rethink ↗' })).toBeDefined()

  await ui.press({ key: 'plan-41-story-350' })
  expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ Plan 41')
  await ui.press({ key: 'back' })
  await ui.press({ key: 'plan-41-goal' })
  expect(await ui.find({ type: 'Text', text: exact('P1 · Agentic OS') })).toBeDefined()
})

test('the goals tab: open goals by priority with their questions, the closed ones a press away, a new goal by goal_add', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { ...BRIEFING, questionsOpen: [...BRIEFING.questionsOpen, GOAL_QUESTION] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })

  expect((await ui.find({ key: 'tab-goals' }))?.props.label).toBe('● Goals')
  expect(await ui.find({ type: 'Text', text: exact('Open goals · 2') })).toBeDefined()
  expect((await ui.find({ key: 'goal-3' }))?.text).toBe('P1 · Agentic OS')
  expect((await ui.find({ type: 'Text', text: exact('1 question') }))?.props.color).toBe('warning')
  expect(await ui.find({ key: 'goal-1' })).toBeUndefined()

  await ui.press({ key: 'goals-closed' })
  expect((await ui.find({ key: 'goal-1' }))?.text).toContain('Old')

  expect(await ui.find({ type: 'Text', text: exact('Plan 41 · Agentic OS') })).toBeDefined()

  await ui.input({ key: 'goal-draft', text: 'Excel s rozpočtem domácnosti', kind: 'change' })
  await ui.press({ key: 'goal-add' })
  expect(terylon.calls.filter(call => call.tool === 'goal_add').map(call => call.args)).toEqual([{ title: 'Excel s rozpočtem domácnosti' }])
  expect((await ui.find({ type: 'Text', text: exact('✓ Goal 12 is set: Excel s rozpočtem domácnosti') }))?.props.color).toBe('success')

  await ui.press({ key: 'goal-11' })
  expect(await ui.find({ key: 'goal-question-606' })).toBeDefined()
  await ui.press({ key: 'goal-question-606' })
  expect(await ui.find({ key: 'answer-send' })).toBeDefined()
})

test('the bell tab reads the notices, the leader and the metrics; handling and pausing stay in the console', async ($, on) => {
  const terylon = world(on)
  terylon.answers.briefing = { ...BRIEFING, unhandledNotices: 2 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'tab-bell' }))?.props.label).toBe('Bell · 2')
  await ui.press({ key: 'tab-bell' })

  expect(await ui.find({ type: 'Text', text: exact('Needs you · 2') })).toBeDefined()
  expect((await ui.find({ key: 'notice-117' }))?.text).toBe('A newer docker.io/amir20/dozzle:latest is published')
  expect(await ui.find({ type: 'Text', text: exact('Nothing was pulled: update the pin when you choose.') })).toBeUndefined()
  await ui.press({ key: 'notice-117' })
  expect(await ui.find({ type: 'Text', text: exact('Nothing was pulled: update the pin when you choose.') })).toBeDefined()

  expect(await ui.find({ type: 'Text', text: exact('✓ The leader runs') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^✓ The backup ran/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('43 stories') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('$1.10 per story') })).toBeDefined()
  expect((await ui.find({ type: 'Link', text: 'Pause the leader ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=work')
  expect(await ui.find({ type: 'Link', text: 'Bell in the console ↗' })).toBeDefined()

  for (const tool of ['notices_list', 'leader_status', 'metrics']) {
    expect(terylon.calls.map(call => call.tool)).toContain(tool)
  }
})

test('Memory is a tab of the one pane: no second pane opens, and the tabs lead back to the queue and the goals', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-memory' })
  expect(terylon.opens).toEqual([])
  expect((await ui.find({ key: 'tab-memory' }))?.props.label).toBe('● Memory')
  expect(await ui.find({ type: 'Text', text: exact('About you') })).toBeDefined()

  await ui.press({ key: 'tab-goals' })
  expect((await ui.find({ key: 'tab-goals' }))?.props.label).toBe('● Goals')
  await ui.press({ key: 'tab-queue' })
  expect(await ui.find({ type: 'Text', text: exact('Waiting for you · 3') })).toBeDefined()
})

test('/terylon-pane and /terylon open the pane on the queue; /terylon-memory opens the same pane on its Memory tab', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  await $.command.run({ command: 'terylon-pane', args: '' } as never)
  await $.command.run({ command: 'terylon', args: '' } as never)
  await $.command.run({ command: 'terylon-memory', args: '' } as never)

  expect(terylon.opens).toEqual(['terylon', 'terylon', 'terylon'])

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'tab-memory' }))?.props.label).toBe('● Memory')
})
