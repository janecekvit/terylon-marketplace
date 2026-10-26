// THE OWNER'S ACTS (S27, #27): every former gate but merge is an owner write since Terylon PR 228, and the pane takes
// each one on its subject's card, on the owner's press and never on render. One click, or a field that opens under
// the card; "…ing" while Terylon answers, the card's other buttons waiting; then Terylon's answer, its refusal word
// for word with Refresh, or Claude Code's refusal with How to fix. Merge stays a link to the console.

import { test, expect } from 'claude-code/testing'

import { OWNER_ACTS } from '../hooks/terylon'

import { ACTS, BRIEFING, FLIGHT, GATES, MEMORY, PANE_PROPS, POLICY, SESSION, STORY_327, exact, leaderRefusal, refusal, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

type Mounted = Awaited<ReturnType<Parameters<Parameters<typeof test>[1]>[0]['ui']['mount']>>

function actCalls(calls: { tool: string; args: Record<string, unknown> }[]): { tool: string; args: Record<string, unknown> }[] {
  return calls.filter(call => ACTS.includes(call.tool)).map(call => ({ tool: call.tool, args: call.args }))
}

type Session = { command: { run: (input: never) => Promise<unknown> } }

// Back to the queue from wherever the pane is: the command opens the one pane on it.
async function toQueue($: Session): Promise<void> {
  await $.command.run({ command: 'terylon-pane', args: '' } as never)
}

// A waiting row opened on an earlier surface stays open: pressing it again would close it.
async function openRow(ui: Mounted, row: string, inside: string): Promise<void> {
  if ((await ui.find({ key: inside })) === undefined) {
    await ui.press({ key: row })
  }

  await ui.press({ key: inside })
}

async function openPlan(ui: Mounted): Promise<void> {
  await openRow(ui, 'plan-41', 'open-plan-41')
}

async function openStory($: Session, ui: Mounted, story: number): Promise<void> {
  await toQueue($)

  if (story === 327) {
    await openRow(ui, 'merge-327', 'open-story-327')
  } else {
    await ui.press({ key: `story-${story}` })
  }
}

// A story blocked as stopped, and one verified in Terylon's own list: neither is among the fixtures' defaults.
const STORY_BLOCKED = { id: 329, goal: 3, title: 'Memory proposals', state: 'blocked', attempt: 2, blockedReason: 'stopped by you', blockedFrom: '2026-10-11T15:20:00Z', pullRequest: { id: null, url: null, branch: 'feat/memory-proposals', head: null }, timeline: [] }
const STORY_LIST = { id: 352, goal: 3, title: 'Weekly cost summary', state: 'verified', target: 'list', attempt: 1, pullRequest: null, timeline: [] }

test('the acts are the thirteen owner writes S11 made of the former gates, and merge is not among them', () => {
  expect([...OWNER_ACTS].sort()).toEqual([...ACTS].sort())
  expect(OWNER_ACTS).not.toContain('story_merge')
  expect(GATES).toEqual(['story_merge'])
})

test('NOTHING IS CALLED ON RENDER: every screen with acts drawn, and no act reaches Terylon until it is pressed', async ($, on) => {
  const terylon = world(on)
  terylon.answers.memory_get = { ...MEMORY, proposals: [{ id: 5, file: 'owner', action: 'add', text: 'A new entry.', why: 'Because.', by: 'web:alice@contoso', at: '2026-10-11T19:14:00Z' }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await openPlan(ui)
    expect(await ui.find({ key: 'act-plan-41-approve' })).toBeDefined()
    await openStory($, ui, 333)
    expect(await ui.find({ key: 'act-story-333-stop' })).toBeDefined()
    await openStory($, ui, 327)
    expect(await ui.find({ key: 'act-story-327-return' })).toBeDefined()
    await toQueue($)
    await ui.press({ key: 'tab-goals' })
    await ui.press({ key: 'goal-3' })
    expect(await ui.find({ key: 'act-goal-3-drop' })).toBeDefined()
    await toQueue($)
    await ui.press({ key: 'tab-memory' })
    expect(await ui.find({ key: 'act-proposal-5-confirm' })).toBeDefined()
    await ui.press({ key: 'tab-status' })
    expect(await ui.find({ key: 'act-policy-edit' })).toBeDefined()
    await toQueue($)
    expect(await ui.find({ key: 'act-leader-pause' })).toBeDefined()
    await ui.unmount()
  }

  expect(actCalls(terylon.calls)).toEqual([])
})

test('PLAN: Approve calls plan_approve for that plan once, on the press, and says Terylon\'s answer', async ($, on) => {
  const terylon = world(on)
  terylon.answers.plan_approve = { accepted: true, sentence: 'Plan 41: 2 approved, 0 dropped.', commandId: 'c1', subjectId: 3 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openPlan(ui)
  expect((await ui.find({ key: 'act-plan-41-approve' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'act-plan-41-rethink' }))?.props.label).toBe('Rethink…')
  expect(await ui.find({ type: 'Link', text: 'Approve in the console ↗' })).toBeUndefined()
  expect((await ui.find({ type: 'Link', text: 'Edit criteria or pick stories in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=plan&plan=41')

  await ui.press({ key: 'act-plan-41-approve' })
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'plan_approve', args: { plan: 41 } }])
  expect(await ui.find({ type: 'Text', text: exact('✓ Plan 41: 2 approved, 0 dropped.') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: exact('✓ Plan 41: 2 approved, 0 dropped.') }))?.props.color).toBe('success')
  expect(await ui.find({ key: 'act-plan-41-queue' })).toBeDefined()
})

test('PLAN: Rethink needs its comment; Send back stays dim and sends nothing until the comment says something', async ($, on) => {
  const terylon = world(on)
  terylon.answers.plan_rethink = { accepted: true, sentence: 'Plan 41 goes back to the leader with your comment; a new plan follows.', commandId: 'c2', subjectId: 3 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openPlan(ui)
  await ui.press({ key: 'act-plan-41-rethink' })
  expect((await ui.find({ key: 'act-plan-41-rethink' }))?.props.label).toBe('● Rethink…')
  expect((await ui.find({ key: 'act-plan-41-text' }))?.props.label).toBe('What to think again about')
  expect((await ui.find({ key: 'act-plan-41-send' }))?.props.dimColor).toBe(true)
  expect((await ui.find({ key: 'act-plan-41-approve' }))?.props.dimColor).toBe(true)

  await ui.press({ key: 'act-plan-41-send' })
  await ui.press({ key: 'act-plan-41-approve' })
  expect(actCalls(terylon.calls)).toEqual([])

  await ui.input({ key: 'act-plan-41-text', text: 'Merge 2 and 3 into one story.', kind: 'change' })
  expect((await ui.find({ key: 'act-plan-41-send' }))?.props.variant).toBe('primary')
  await ui.press({ key: 'act-plan-41-send' })
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'plan_rethink', args: { plan: 41, comment: 'Merge 2 and 3 into one story.' } }])
  expect(await ui.find({ type: 'Text', text: exact('✓ Plan 41 goes back to the leader with your comment; a new plan follows.') })).toBeDefined()
})

test('BUSY: between the press and the answer the act reads "…ing", the card\'s other buttons wait, and a second press sends nothing', async ($, on) => {
  const terylon = world(on)
  terylon.hang.add('plan_approve')
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openPlan(ui)
  void ui.press({ key: 'act-plan-41-approve' })
  await terylon.clock.settle()

  expect((await ui.find({ key: 'act-plan-41-approve' }))?.props.label).toBe('Approving…')
  expect((await ui.find({ key: 'act-plan-41-rethink' }))?.props.dimColor).toBe(true)
  expect(await ui.find({ type: 'Text', text: exact('Every other button on this card waits until the leader answers.') })).toBeDefined()

  void ui.press({ key: 'act-plan-41-approve' })
  void ui.press({ key: 'act-plan-41-rethink' })
  await terylon.clock.settle()
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'plan_approve', args: { plan: 41 } }])
  expect(await ui.find({ key: 'act-plan-41-text' })).toBeUndefined()
})

test('REFUSED: Terylon\'s sentence word for word on a red card, its status, Refresh, and the console as the way round', async ($, on) => {
  const terylon = world(on)
  terylon.answers.story_stop = refusal('Story 333 is pr-open; only a dispatched or running story has a run to stop.', 409)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openStory($, ui, 333)
  await ui.press({ key: 'act-story-333-stop' })

  expect((await ui.find({ type: 'Text', text: exact('✗ Refused (409)') }))?.props.color).toBe('error')
  expect(await ui.find({ type: 'Text', text: exact('Story 333 is pr-open; only a dispatched or running story has a run to stop.') })).toBeDefined()
  expect((await ui.find({ key: 'act-story-333-outcome' }))?.props.borderColor).toBe('error')
  expect((await ui.find({ key: 'act-story-333-refresh' }))?.props.label).toBe('Refresh')
  expect((await ui.find({ type: 'Link', text: 'Story in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=work&story=333')

  await ui.press({ key: 'act-story-333-refresh' })
  expect(await ui.find({ type: 'Text', text: exact('✗ Refused (409)') })).toBeUndefined()
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'story_stop', args: { story: 333 } }])
})

test('NOT ALLOWED: Claude Code refused the act, nothing happened, and How to fix opens Status with the rules, no merge among them', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openPlan(ui)
  terylon.mode.server = 'prompted'
  await ui.press({ key: 'act-plan-41-approve' })
  terylon.mode.server = 'up'

  expect(await ui.find({ type: 'Text', text: exact("Claude Code refused the pane's call to plan_approve") })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact("Nothing was approved. Add the pane's rules in ~/.claude/settings.json, then press Approve again.") })).toBeDefined()
  expect((await ui.find({ key: 'act-plan-41-outcome' }))?.props.borderColor).toBe('warning')

  await ui.press({ key: 'act-plan-41-fix' })
  expect((await ui.find({ key: 'tab-status' }))?.props.variant).toBe('primary')
  const rules = String((await ui.find({ type: 'Code' }))?.props.source ?? '')
  expect(rules).toContain('"mcp__plugin_terylon-os_terylon__plan_approve"')
  expect(rules).not.toContain('story_merge')
})

test('STORY, VERIFIED IN A REPOSITORY: merge is only ever the console\'s link; Return needs its note', async ($, on) => {
  const terylon = world(on)
  terylon.answers.story_return = { accepted: true, sentence: 'Story 327 is running again with your note, as attempt 3.', commandId: 'c3', subjectId: 327 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await openStory($, ui, 327)
    expect((await ui.find({ type: 'Link', text: 'Merge in the console ↗' }))?.props.href).toBe('https://terylon.example.ts.net/?cockpit=merge&story=327')
    expect(await ui.find({ type: 'Button', text: /Merge/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: exact('Merge is the one gate: your passkey confirms it in the console, at exactly commit 4be21c0. The pane never merges.') })).toBeDefined()
    expect(await ui.find({ key: 'act-story-327-accept' })).toBeUndefined()
    await ui.unmount()
  }

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openStory($, ui, 327)
  await ui.press({ key: 'act-story-327-return' })
  expect((await ui.find({ key: 'act-story-327-text' }))?.props.label).toBe('What to do')
  expect(await ui.find({ type: 'Text', text: exact('A return carries a note saying what to do.') })).toBeDefined()
  await ui.press({ key: 'act-story-327-send' })
  expect(actCalls(terylon.calls)).toEqual([])

  await ui.input({ key: 'act-story-327-text', text: 'Cover the gap case.', kind: 'change' })
  await ui.press({ key: 'act-story-327-send' })
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'story_return', args: { story: 327, note: 'Cover the gap case.' } }])
  expect(await ui.find({ type: 'Text', text: exact('✓ Story 327 is running again with your note, as attempt 3.') })).toBeDefined()
})

test('STORY, VERIFIED IN TERYLON\'S LIST: Accept, and no merge at all', async ($, on) => {
  const terylon = world(on)
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 352 ? STORY_LIST : STORY_327)
  terylon.answers.work_in_flight = { ...FLIGHT, stories: [...FLIGHT.stories, { id: 352, title: 'Weekly cost summary', state: 'verified', attempt: 1, progress: null, costUsd: 1.8, budgetUsd: 4 }] }
  terylon.answers.story_accept = { accepted: true, sentence: "Story 352's result is accepted.", commandId: 'c4', subjectId: 352 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-352' })
  expect((await ui.find({ key: 'act-story-352-accept' }))?.props.variant).toBe('primary')
  expect(await ui.find({ type: 'Link', text: 'Merge in the console ↗' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('A list story has no merge: Accept ends it as done.') })).toBeDefined()

  await ui.press({ key: 'act-story-352-accept' })
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'story_accept', args: { story: 352 } }])
  expect(await ui.find({ type: 'Text', text: exact("✓ Story 352's result is accepted.") })).toBeDefined()
})

test('STORY, BLOCKED: Unblock with or without a note, Return only with one, Abandon after a second press', async ($, on) => {
  const terylon = world(on)
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 329 ? STORY_BLOCKED : STORY_327)
  terylon.answers.work_in_flight = { ...FLIGHT, stories: [FLIGHT.stories[0], { ...FLIGHT.stories[1], state: 'blocked' }] }
  terylon.answers.story_unblock = { accepted: true, sentence: 'Story 329 goes on: it is running again.', commandId: 'c5', subjectId: 329 }
  terylon.answers.story_abandon = { accepted: true, sentence: 'Story 329 is abandoned.', commandId: 'c6', subjectId: 329 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-329' })
  expect((await ui.find({ key: 'act-story-329-text' }))?.props.label).toBe('Note (optional for Unblock, required for Return)')
  expect((await ui.find({ key: 'act-story-329-unblock' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'act-story-329-return' }))?.props.dimColor).toBe(true)
  expect(await ui.find({ key: 'act-story-329-stop' })).toBeUndefined()

  await ui.press({ key: 'act-story-329-return' })
  expect(actCalls(terylon.calls)).toEqual([])

  await ui.press({ key: 'act-story-329-abandon' })
  expect((await ui.find({ key: 'act-story-329-text' }))?.props.label).toBe('Why (optional)')
  expect((await ui.find({ key: 'act-story-329-unblock' }))?.props.dimColor).toBe(true)
  expect(actCalls(terylon.calls)).toEqual([])
  await ui.input({ key: 'act-story-329-text', text: 'S19 covers it.', kind: 'change' })
  await ui.press({ key: 'act-story-329-send' })
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'story_abandon', args: { story: 329, reason: 'S19 covers it.' } }])
  expect(await ui.find({ type: 'Text', text: exact('✓ Story 329 is abandoned.') })).toBeDefined()

  await ui.press({ key: 'act-story-329-unblock' })
  expect(actCalls(terylon.calls).slice(1)).toEqual([{ tool: 'story_unblock', args: { story: 329 } }])
})

test('STORY, RUNNING: Stop in one press, Summarise beside it, the story in the console', async ($, on) => {
  const terylon = world(on)
  terylon.answers.story_stop = { accepted: true, sentence: "Story 333's run is stopped; it stays blocked until you unblock, return or abandon it.", commandId: 'c7', subjectId: 333 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openStory($, ui, 333)
  expect(await ui.find({ key: 'summarise' })).toBeDefined()
  expect(await ui.find({ type: 'Link', text: 'Stop in the console ↗' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('Stop cancels the run; the story waits, blocked as stopped, until you unblock, return or abandon it.') })).toBeDefined()

  await ui.press({ key: 'act-story-333-stop' })
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'story_stop', args: { story: 333 } }])
  expect(await ui.find({ type: 'Text', text: exact("✓ Story 333's run is stopped; it stays blocked until you unblock, return or abandon it.") })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('The story waits, blocked as stopped. Unblock, Return or Abandon now show here.') })).toBeDefined()
})

test('THE S27 SLOTS ARE GONE: the story\'s and the leader\'s acts sit on plain rows, no dashed border left', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openStory($, ui, 333)
  expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'dashed')).toEqual([])
  await toQueue($)
  await ui.press({ key: 'tab-bell' })
  expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'dashed')).toEqual([])
})

test('LEADER: Pause… in the queue\'s header with an optional reason; Resume on the paused card, in the queue and on Status', async ($, on) => {
  const terylon = world(on)
  terylon.answers.leader_pause = { accepted: true, sentence: 'Paused: nothing new is dispatched, no effect is issued and no judgement starts until you resume.', commandId: 'c8', subjectId: null }
  terylon.answers.leader_resume = { accepted: true, sentence: 'Resumed: the leader continues from where it stopped.', commandId: 'c9', subjectId: null }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'act-leader-pause' })
  expect((await ui.find({ key: 'act-leader-text' }))?.props.label).toBe('Why (optional)')
  expect(await ui.find({ type: 'Text', text: exact('Nothing new is admitted, issued, judged or written until you resume. Runs already going keep going.') })).toBeDefined()
  expect(actCalls(terylon.calls)).toEqual([])
  await ui.input({ key: 'act-leader-text', text: 'Host maintenance tonight.', kind: 'change' })
  await ui.press({ key: 'act-leader-send' })
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'leader_pause', args: { reason: 'Host maintenance tonight.' } }])
  expect(await ui.find({ type: 'Text', text: exact('✓ Paused: nothing new is dispatched, no effect is issued and no judgement starts until you resume.') })).toBeDefined()

  terylon.answers.briefing = { ...BRIEFING, leader: { paused: true, pausedAt: '2026-10-11T12:05:00Z', reason: 'Host maintenance tonight.' } }
  terylon.answers.work_in_flight = { ...FLIGHT, paused: true }
  await ui.press({ key: 'refresh' })
  expect(await ui.find({ key: 'act-leader-pause' })).toBeUndefined()
  expect(await ui.find({ type: 'Link', text: 'Resume in the console ↗' })).toBeUndefined()
  await ui.press({ key: 'act-leader-resume' })
  expect(actCalls(terylon.calls).slice(1)).toEqual([{ tool: 'leader_resume', args: {} }])

  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ key: 'act-leader-resume' })).toBeDefined()
})

test('GOAL: Drop goal… asks once more, says what it withdraws, then goal_drop', async ($, on) => {
  const terylon = world(on)
  terylon.answers.plans_list = { plans: [{ id: 44, goal: 3, goalTitle: 'Agentic OS', state: 'proposed', estimateUsd: 4, comment: null, stories: [] }] }
  terylon.answers.goal_drop = { accepted: true, sentence: 'Goal 3 is dropped.', commandId: 'c10', subjectId: 3 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-goals' })
  await ui.press({ key: 'goal-3' })
  await ui.press({ key: 'act-goal-3-drop' })
  expect(actCalls(terylon.calls)).toEqual([])
  expect(await ui.find({ type: 'Text', text: exact('Drop it for good: the leader stops working on it and withdraws plan 44. #333 keeps running until you stop it.') })).toBeDefined()
  expect((await ui.find({ key: 'act-goal-3-outcome' }))).toBeUndefined()

  await ui.press({ key: 'act-goal-3-send' })
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'goal_drop', args: { goal: 3 } }])
  expect(await ui.find({ type: 'Text', text: exact('✓ Goal 3 is dropped.') })).toBeDefined()
})

test('MEMORY: a proposal waits on the Memory tab, old text struck and new, with Confirm and Drop', async ($, on) => {
  const terylon = world(on)
  terylon.answers.memory_get = {
    ...MEMORY,
    proposals: [
      // The shape of Terylon main aaf07e8: `by` is "web:<login>" for the owner and "brain" for the leader.
      { id: 5, consolidates: null, operations: [{ action: 'replace', file: 'owner', text: 'Merge potvrzuje passkey; produkci nasazuje follower.', oldText: 'Merge potvrzuje passkey.' }], suggestsRule: false, action: 'replace', file: 'owner', oldText: 'Merge potvrzuje passkey.', text: 'Merge potvrzuje passkey; produkci nasazuje follower.', why: 'Since #287 a timer deploys production on its own.', judgement: 'desktop', by: 'web:alice@contoso', subject: 'memory', at: '2026-10-11T19:14:00Z' },
      { id: 6, consolidates: null, operations: [{ action: 'add', file: 'topic:terylon/deploy', text: 'pr-environments share the host lock only for create and remove.', oldText: null }], suggestsRule: false, action: 'add', file: 'topic:terylon/deploy', text: 'pr-environments share the host lock only for create and remove.', oldText: null, why: 'Seen in #333.', judgement: 'story-run', by: 'brain', subject: 'story/333', at: '2026-10-11T19:20:00Z' },
      { id: 7, consolidates: null, operations: [{ action: 'remove', file: 'project:terylon', text: null, oldText: 'PRs stay drafts' }], suggestsRule: false, action: 'remove', file: 'project:terylon', text: null, oldText: 'PRs stay drafts', why: 'Superseded.', judgement: 'desktop', by: 'web:alice@contoso', subject: 'memory', at: '2026-10-11T19:30:00Z' },
    ],
  }
  terylon.answers.memory_confirm = { accepted: true, sentence: "Remembered: the leader's memory takes it as a new version.", commandId: 'c11', subjectId: null }
  terylon.answers.memory_drop = { accepted: true, sentence: 'Discarded: nothing was written.', commandId: 'c12', subjectId: null }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-memory' })
  expect(await ui.find({ type: 'Text', text: exact('Proposals waiting · 3') })).toBeDefined()
  expect((await ui.find({ key: 'mem-proposals' }))?.props.borderColor).toBe('warning')
  // The owner's memory holds the same entry, unstruck: the proposal's old text is the struck one.
  expect((await ui.findAll({ type: 'Text', text: exact('Merge potvrzuje passkey.') })).map(node => [node.props.strikethrough, node.props.color])).toContainEqual([true, 'error'])
  expect((await ui.find({ type: 'Text', text: exact('Merge potvrzuje passkey; produkci nasazuje follower.') }))?.props.color).toBe('success')
  expect(await ui.find({ type: 'Text', text: exact('proposed by the leader · #333') })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: exact('proposed by you') })).length).toBe(2)
  // NEVER THE LOGIN: "web:<login>" is said as "you".
  expect(await ui.find({ type: 'Text', text: /alice/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: exact('terylon/deploy') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: exact('− PRs stay drafts') }))?.props).toMatchObject({ strikethrough: true, color: 'error' })
  expect(await ui.find({ type: 'Link', text: 'Confirm in the console ↗' })).toBeUndefined()

  await ui.press({ key: 'act-proposal-5-confirm' })
  await ui.press({ key: 'act-proposal-6-drop' })
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'memory_confirm', args: { proposal: 5 } }, { tool: 'memory_drop', args: { proposal: 6 } }])
  expect(await ui.find({ type: 'Text', text: exact("✓ Remembered: the leader's memory takes it as a new version.") })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('✓ Discarded: nothing was written.') })).toBeDefined()
})

// policy_get as Terylon main aaf07e8 answers it: the values, the memory's bounds nested, the version, and the limits.
const LIMIT = (minimum: number, maximum: number, whole: boolean, unit: string, aboveMinimum = false) => ({ minimum, maximum, aboveMinimum, whole, unit })
const POLICY_AAF = {
  slots: 4,
  storyBudgetUsd: 25,
  dayBudgetUsd: 100,
  retryLimit: 2,
  continueLimit: 3,
  storyHours: 6,
  stuckMinutes: 30,
  memory: { ownerCharacters: 1375, projectCharacters: 2200, topicCharacters: 4000, topicsPerProject: 12 },
  version: 1,
  changedAt: null,
  changedBy: null,
  limits: {
    slots: LIMIT(1, 8, true, 'stories'),
    storyBudgetUsd: LIMIT(0, 10000, false, 'USD', true),
    dayBudgetUsd: LIMIT(0, 10000, false, 'USD', true),
    retryLimit: LIMIT(0, 10, true, 'retries'),
    continueLimit: LIMIT(0, 10, true, 'continuations'),
    storyHours: LIMIT(0, 168, false, 'hours', true),
    stuckMinutes: LIMIT(1, 1440, true, 'minutes'),
    memory: { ownerCharacters: LIMIT(200, 20000, true, 'characters'), projectCharacters: LIMIT(200, 20000, true, 'characters'), topicCharacters: LIMIT(200, 20000, true, 'characters'), topicsPerProject: LIMIT(1, 50, true, 'topics') },
  },
}

test('POLICY: read on Status with its version, edited within policy_get\'s limits, only what changed sent, the memory nested', async ($, on) => {
  const terylon = world(on)
  terylon.answers.policy_get = POLICY_AAF
  terylon.answers.policy_save = refusal("A memory file's bound is 200 to 20000 characters.", 400)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-status' })
  expect(await ui.find({ type: 'Text', text: exact('version 1 · never changed') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('4 stories') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('$25') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('Memory: owner · project · topic') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('1375 · 2200 · 4000 chars') })).toBeDefined()

  await ui.press({ key: 'act-policy-edit' })
  expect((await ui.find({ key: 'act-policy-field-slots' }))?.props.label).toBe('Slots (1–8)')
  expect((await ui.find({ key: 'act-policy-field-storyBudgetUsd' }))?.props.label).toBe('Story budget (over $0, up to $10000)')
  expect((await ui.find({ key: 'act-policy-field-memory.ownerCharacters' }))?.props.label).toBe('Owner memory, chars (200–20000)')
  expect(actCalls(terylon.calls)).toEqual([])

  // VALIDATED IN THE PANE: Terylon checks no act's arguments against a schema.
  await ui.input({ key: 'act-policy-field-slots', text: '12', kind: 'change' })
  await ui.input({ key: 'act-policy-field-storyBudgetUsd', text: '0', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: exact('Slots is a whole number from 1 to 8; 12 is not.') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact('Story budget is more than $0 and at most $10000; 0 is not.') })).toBeDefined()
  expect((await ui.find({ key: 'act-policy-send' }))?.props.dimColor).toBe(true)
  await ui.press({ key: 'act-policy-send' })
  expect(actCalls(terylon.calls)).toEqual([])

  await ui.input({ key: 'act-policy-field-slots', text: '3', kind: 'change' })
  await ui.input({ key: 'act-policy-field-storyBudgetUsd', text: '25', kind: 'change' })
  await ui.input({ key: 'act-policy-field-memory.ownerCharacters', text: '1500', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: exact('2 changes: slots 4 → 3, owner memory 1375 → 1500.') })).toBeDefined()
  await ui.press({ key: 'act-policy-send' })
  // A PARTIAL memory OBJECT keeps the other bounds; no version is sent, the last write wins.
  expect(actCalls(terylon.calls)).toEqual([{ tool: 'policy_save', args: { slots: 3, memory: { ownerCharacters: 1500 } } }])
  expect(await ui.find({ type: 'Text', text: exact('✗ Refused (400)') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: exact("A memory file's bound is 200 to 20000 characters.") })).toBeDefined()

  await ui.press({ key: 'act-policy-again' })
  expect((await ui.find({ key: 'act-policy-field-slots' }))?.props.value).toBe('3')
})

test('EVERY ACT ANSWERS {accepted, sentence}: null is no answer within 10 s, false the leader\'s refusal, its sentence word for word', async ($, on) => {
  const terylon = world(on)
  terylon.answers.plan_approve = { accepted: null, sentence: 'The leader has not answered within 10 s; ask leader_answer with this commandId.', commandId: 'c9', subjectId: null }
  terylon.answers.story_stop = leaderRefusal("Story 333 is pr-open; it cannot be moved by 'Stop'.")
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openPlan(ui)
  await ui.press({ key: 'act-plan-41-approve' })
  expect(await ui.find({ type: 'Text', text: exact('The leader did not answer within 10 s. It may have taken the act; Refresh shows where it stands (command c9).') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^✓/ })).toBeUndefined()
  expect((await ui.find({ key: 'act-plan-41-refresh' }))?.props.label).toBe('Refresh')

  await openStory($, ui, 333)
  await ui.press({ key: 'act-story-333-stop' })
  expect((await ui.find({ type: 'Text', text: exact('✗ Refused') }))?.props.color).toBe('error')
  expect(await ui.find({ type: 'Text', text: exact("Story 333 is pr-open; it cannot be moved by 'Stop'.") })).toBeDefined()
})

test('THE TEXT LIMITS (Terylon main aaf07e8): a rethink\'s comment at most 2000 characters, a return\'s note at most 4000', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await openPlan(ui)
  await ui.press({ key: 'act-plan-41-rethink' })
  await ui.input({ key: 'act-plan-41-text', text: 'x'.repeat(2001), kind: 'change' })
  expect(await ui.find({ type: 'Text', text: exact('At most 2000 characters; this is 2001.') })).toBeDefined()
  expect((await ui.find({ key: 'act-plan-41-send' }))?.props.dimColor).toBe(true)
  await ui.press({ key: 'act-plan-41-send' })
  expect(actCalls(terylon.calls)).toEqual([])

  await openStory($, ui, 327)
  await ui.press({ key: 'act-story-327-return' })
  await ui.input({ key: 'act-story-327-text', text: 'y'.repeat(4001), kind: 'change' })
  expect(await ui.find({ type: 'Text', text: exact('At most 4000 characters; this is 4001.') })).toBeDefined()
  await ui.press({ key: 'act-story-327-send' })
  expect(actCalls(terylon.calls)).toEqual([])
})

test('AN ACT WITHOUT ITS SUBJECT\'S ID SENDS NOTHING: a proposal memory_get listed with no id', async ($, on) => {
  const terylon = world(on)
  terylon.answers.memory_get = { ...MEMORY, proposals: [{ file: 'owner', action: 'add', text: 'No id.', why: 'Because.', by: 'web:alice@contoso' }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'tab-memory' })
  expect(await ui.find({ type: 'Text', text: exact('+ No id.') })).toBeDefined()
  await ui.press({ key: 'act-proposal-0-confirm' })
  await ui.press({ key: 'act-proposal-0-drop' })
  expect(actCalls(terylon.calls)).toEqual([])
})

test('a story\'s acts are drawn on the terminal too, and the busy label and the refusal read the same there', async ($, on) => {
  const terylon = world(on)
  terylon.answers.story_get = () => STORY_327
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await openStory($, ui, 327)
  expect(await ui.find({ key: 'act-story-327-return' })).toBeDefined()
  expect(await ui.find({ type: 'Link', text: 'PR 196 ↗' })).toBeDefined()
})
