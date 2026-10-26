// The live run and the bell, as S24 (#360) builds them to the S15 canvas, page "v2 · lišta a panel", row 3: a
// running story's phases and "Now working" read from progress (story_get, work_in_flight), never worked out from
// its timeline; a notice marked handled from the Bell tab through notice_handle; the bell's count on the band.

import { test, expect } from 'claude-code/testing'

import { SVG_COLOURS } from '../hooks/drawing'

import { GATES, NOTICES, PANE_PROPS, SESSION, STORY_333, bandProps, exact, pictures, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

test('the phases are the stage Terylon reports, never the timeline: a timeline that says verified moves nothing', async ($, on) => {
  const terylon = world(on)
  // A TIMELINE THAT CLAIMS MORE THAN THE STAGE: an inference from it would draw Pull request and Verify done.
  const progress = { stage: 'develop', step: null, steps: null, current: 'Writing the route', agent: { name: 'main', running: 0 }, tokens: 42000 }
  terylon.answers.story_get = {
    ...STORY_333,
    progress,
    timeline: [
      ...STORY_333.timeline,
      { seq: 650, at: '2026-10-11T15:00:00Z', type: 'StoryMoved', actor: 'run', key: null, summary: 'running → pr-open' },
      { seq: 651, at: '2026-10-11T15:20:00Z', type: 'StoryMoved', actor: 'leader', key: null, summary: 'pr-open → verifying' },
      { seq: 652, at: '2026-10-11T15:40:00Z', type: 'StoryMoved', actor: 'leader', key: null, summary: 'verifying → verified' },
    ],
  }
  terylon.answers.work_in_flight = { slots: 4, paused: false, stories: [{ id: 333, title: 'Direct dispatch', state: 'running', attempt: 2, progress, startedAt: '2026-10-11T10:00:00Z', costUsd: 2.1, budgetUsd: 8 }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-333' })

  expect((await pictures(ui))[0]?.alt).toBe('Admitted, Plan done; Develop now; Review, Tests, Pull req., Verified, Merge to come')
  expect((await ui.find({ type: 'Text', text: exact('Develop') }))?.props.color).toBe('suggestion')
  expect((await ui.find({ type: 'Text', text: exact('Pull req.') }))?.props.color).toBe('subtle')
  expect(await ui.find({ type: 'Text', text: exact('3 of 8') })).toBeDefined()

  // THE RUN'S OWN AGENT, with no list: its words for the step, its tokens.
  expect(await ui.find({ type: 'Text', text: exact('main agent · Develop') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('Writing the route') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('42 k') })).toBeDefined()
})

test('a story Terylon reports no stage for draws no phase as now, and Now working says neither agent nor stage was reported', async ($, on) => {
  const terylon = world(on)
  terylon.answers.story_get = { ...STORY_333, progress: null }
  terylon.answers.work_in_flight = { slots: 4, paused: false, stories: [{ id: 333, title: 'Direct dispatch', state: 'running', attempt: 2, progress: null, startedAt: '2026-10-11T10:00:00Z', costUsd: 2.1, budgetUsd: 8 }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'story-333' })

  expect(await ui.find({ type: 'Text', text: exact('✓ Admitted to a slot') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('● ') })).toBeUndefined()
  // A RUN GOES, SO NOW WORKING IS DRAWN (the owner's walk of 1.5.0, #35), naming no one it was not told of.
  expect(await ui.find({ type: 'Text', text: exact('Now working') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('no agent reported · no stage reported') })).toBeDefined()

  // THE SAME ON THE DESKTOP (S32): the stepper and the running row's segments draw no node as now, in no colour of
  // now, and say so in their alt; the labels under the stepper have none in the colour of now either.
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await desktop.press({ key: 'back' })
  const segments = (await pictures(desktop)).find(item => /phase/i.test(item.alt))
  expect(segments?.alt).toBe('1 of 8 phases done')
  expect(segments?.source).not.toContain(SVG_COLOURS.now)
  await desktop.press({ key: 'story-333' })
  const [stepper] = await pictures(desktop)
  expect(stepper?.alt).toBe('Admitted done; Plan, Develop, Review, Tests, Pull req., Verified, Merge to come')
  expect(stepper?.source).not.toContain(SVG_COLOURS.now)
  const labels = ['Admitted', 'Plan', 'Develop', 'Review', 'Tests', 'Pull req.', 'Verified', 'Merge']
  expect((await desktop.findAll({ type: 'Text' })).filter(node => labels.includes(node.text) && node.props.color === 'suggestion')).toEqual([])
  expect(await desktop.find({ type: 'Text', text: exact('1 of 8 · no stage reported') })).toBeDefined()
})

test('a subagent at work is named with how many more are out, and its stage beside it', async ($, on) => {
  const terylon = world(on)
  const progress = { stage: 'review', step: 6, steps: 9, current: 'Reviewing the diff', agent: { name: 'code-reviewer', running: 3 }, tokens: 950 }
  terylon.answers.story_get = { ...STORY_333, progress }
  terylon.answers.work_in_flight = { slots: 4, paused: false, stories: [{ id: 333, title: 'Direct dispatch', state: 'running', attempt: 2, progress, startedAt: '2026-10-11T21:00:00Z', costUsd: 0.4, budgetUsd: 8 }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-333' })

  expect(await ui.find({ type: 'Text', text: exact('code-reviewer +2 · Review') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: exact('Review') }))?.props.color).toBe('suggestion')
  expect(await ui.find({ type: 'Text', text: exact('$0.40') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('950') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('1 h 0 min') })).toBeDefined()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: exact('● Review · reviewer') })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: exact("$0.40 of the story's $8 · 950 tokens · 1 h 0 min since start") })).toBeDefined()
})

test('a notice is marked handled from the Bell tab through notice_handle, and the bell and the band drop it at once', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const band = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: bandProps() })
  expect(await band.find({ type: 'Text', text: /· Bell 2$/ })).toBeDefined()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-bell' })
  expect((await ui.find({ key: 'tab-bell' }))?.props.label).toMatch(/Bell · 2$/)
  expect(await ui.find({ key: 'handle-117' })).toBeUndefined()

  await ui.press({ key: 'notice-117' })
  expect((await ui.find({ key: 'handle-117' }))?.props.label).toBe('Mark handled')
  await ui.press({ key: 'handle-117' })

  expect(terylon.calls.filter(call => call.tool === 'notice_handle')).toEqual([{ server: 'plugin:terylon-os:terylon', tool: 'notice_handle', args: { notice: 117 } }])
  expect(await ui.find({ key: 'notice-117' })).toBeUndefined()
  expect(await ui.find({ key: 'notice-168' })).toBeDefined()
  expect(await band.find({ type: 'Text', text: /· Bell 1$/ })).toBeDefined()
  expect(terylon.calls.filter(call => GATES.includes(call.tool))).toEqual([])
})

test('the band says what Terylon published within one poll after a notice is handled', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const band = await $.ui.mount({ plugin: 'terylon-pane', surface: 'terminal', component: 'AbovePrompt', props: bandProps() })
  expect(await band.find({ type: 'Text', text: /· Bell 2$/ })).toBeDefined()

  // HANDLED IN THE CONSOLE, or by Claude: the next poll reads the bell Terylon published again.
  terylon.answers.notices_list = { unhandled: 0, notices: NOTICES.notices.map(notice => ({ ...notice, handledAt: notice.handledAt ?? '2026-10-11T22:00:10Z' })) }
  await terylon.clock.advance(30000)
  await terylon.clock.settle()

  expect(await band.find({ type: 'Text', text: /· Bell 0$/ })).toBeDefined()
})

test('a notice Terylon refuses to mark handled stays, and the refusal is said with its reason', async ($, on) => {
  const terylon = world(on)
  terylon.answers.notice_handle = undefined
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-bell' })
  await ui.press({ key: 'notice-168' })
  await ui.press({ key: 'handle-168' })

  expect(await ui.find({ key: 'notice-168' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /no such tool notice_handle/ })).toBeDefined()
})

test('a goal is dropped from its own screen (S27), the console\'s goals screen still a link away, and nothing is sent until pressed', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-333' })
  await ui.press({ key: 'story-goal' })

  // goal_drop IS AN OWNER WRITE SINCE TERYLON PR 228 (S27): the goal's own screen drops it; the console's goals
  // screen stays a link away — "goal" is no screen there.
  expect((await ui.find({ type: 'Link', text: 'Goal in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=goals&goal=3')
  expect((await ui.find({ key: 'act-goal-3-drop' }))?.props.label).toBe('Drop goal…')
  expect(terylon.calls.filter(call => call.tool === 'goal_drop')).toEqual([])
})
