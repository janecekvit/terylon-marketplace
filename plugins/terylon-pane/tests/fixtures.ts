// A Terylon that answers from memory, for `claude plugin test`: no session, no network. Every call the
// pane makes is recorded, so a test can hold it to never calling a gate.

import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'

export const SERVER = 'plugin:terylon-os:terylon'

export const BASE = 'https://terylon.example.ts.net'

export const PANE_PROPS = {
  title: 'Terylon',
  isFocused: false,
  bodyColumns: 48,
  placement: 'dock',
  scroll: { top: 0, bodyRows: 40 },
  view: {},
} as never

export const HOUR = 3600000

// The element whose whole text this is: a plain string in a query matches by inclusion, so a row's outer Text
// would answer for each coloured part inside it.
export function exact(text: string): RegExp {
  return new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

// The owner's gates, spelled out here rather than imported, so a mutation of the mod's own list cannot hide one.
export const GATES = ['plan_approve', 'plan_rethink', 'story_merge', 'story_return', 'story_unblock', 'story_abandon', 'story_stop', 'story_accept', 'leader_pause', 'leader_resume', 'goal_drop']

export type Call = { server: string; tool: string; args: Record<string, unknown> }

export type Answer = unknown | ((args: Record<string, unknown>) => unknown)

export type World = {
  calls: Call[]
  prompts: string[]
  toasts: string[]
  statuses: (string | undefined)[]
  logs: { text: string; to: string | undefined }[]
  opens: string[]
  answers: Record<string, Answer>
  mode: { server: 'up' | 'missing' | 'down' | 'refused' | 'error' | 'unclassified' | 'prompted' }
  // Tools whose call never answers: what a call held in Desktop looks like to the pane.
  hang: Set<string>
}

export const BRIEFING = {
  briefing: 'x',
  plansWaiting: [{ id: 41, goal: 3, goalTitle: 'Agentic OS', stories: 3, estimateUsd: 14 }],
  questionsOpen: [{ id: 9, subject: 'story/333', about: '#333', text: 'Má mrtvý běh pokračovat od posledního commitu?' }],
  storiesVerified: [{ id: 327, title: 'Events since the last look', environment: { name: 'pr-196', url: 'https://x' } }],
  storiesBlocked: [],
  leader: { paused: false },
  unhandledNotices: 0,
}

export const FLIGHT = {
  slots: 4,
  paused: false,
  stories: [
    { id: 333, title: 'Direct dispatch', run: 'r1', state: 'running', attempt: 2, progress: { stage: 'test', step: 5, steps: 9, current: 'testy', agent: { name: 'tester', running: 1 }, tokens: 1400000 }, startedAt: '2026-10-11T10:00:00Z', costUsd: 2.1, budgetUsd: 8, hours: 6, stuck: null, environment: null },
    { id: 329, title: 'Memory proposals', run: 'r2', state: 'verifying', attempt: 1, progress: { stage: 'verify', step: null, steps: null, current: null, agent: null, tokens: null }, startedAt: '2026-10-11T09:00:00Z', costUsd: 3.4, budgetUsd: 8, hours: 6, stuck: null, environment: { name: 'pr-197', url: 'https://y' } },
  ],
}

export const STORIES = {
  stories: [
    { id: 333, title: 'Direct dispatch', state: 'running', updatedAt: '2026-10-11T10:00:00Z' },
    { id: 329, title: 'Memory proposals', state: 'verifying', updatedAt: '2026-10-11T10:00:00Z' },
    { id: 328, title: "Owner's spec and plan", state: 'approved', after: [324], updatedAt: '2026-10-11T08:00:00Z' },
    { id: 347, title: 'Logs', state: 'approved', blockedReason: 'tvoje volba', after: [], updatedAt: '2026-10-11T08:00:00Z' },
    { id: 341, title: 'S10a cleanup', state: 'merged', costUsd: 5.6, updatedAt: '2026-10-11T12:20:00Z' },
  ],
}

// A clock at 23:00 on the local day of `at`, wherever the test runs. The pane reads "today" in the host's own
// time zone, and the world's clock at 22:00 UTC is already tomorrow from UTC+2 east: a Prague host dropped
// the story merged at 12:20 UTC out of "done today", while a UTC runner kept it.
export function lateOnTheLocalDayOf(at: string): number {
  const moment = Date.parse(at)
  const offsetMilliseconds = new Date(moment).getTimezoneOffset() * 60000
  const localDay = new Date(moment - offsetMilliseconds).toISOString().slice(0, 10)

  return Date.parse(`${localDay}T23:00:00Z`) + offsetMilliseconds
}

export const GOALS = {
  goals: [
    { id: 3, title: 'P1 · Agentic OS', priority: 1, state: 'open', stories: { running: 2, approved: 2 } },
    { id: 11, title: 'Test z telefonu', priority: 2, state: 'open', stories: {} },
    { id: 1, title: 'Old', priority: 4, state: 'dropped', stories: { abandoned: 3 } },
  ],
}

// A question that offers its own choices, about a goal: the pane draws them as buttons to press.
export const GOAL_QUESTION = {
  id: 606,
  subject: 'goal/11',
  about: 'Test z telefonu',
  text: 'Co přesně se má testovat? Jde o (a) vzhled webu na mobilu, (b) zadávání úkolů do Terylonu z telefonu, (c) něco jiného?',
  askedAt: '2026-10-11T05:10:54Z',
  answer: null,
}

export const PLANS = {
  plans: [
    {
      id: 41,
      goal: 3,
      goalTitle: 'Agentic OS',
      state: 'proposed',
      estimateUsd: 14,
      comment: null,
      stories: [
        { id: 350, title: 'Health: tlačítko Check now', criteria: ['Check now reruns every check'], files: [], size: 'S', estimateUsd: 3, runsAfter: [], after: [] },
        { id: 351, title: 'Notice handle přes MCP', criteria: [], files: [], size: 'M', estimateUsd: 5, runsAfter: [1], after: [] },
      ],
    },
  ],
}

export const GOAL_3 = {
  id: 3,
  title: 'P1 · Agentic OS',
  priority: 1,
  state: 'open',
  storyList: [
    { id: 333, title: 'Direct dispatch', state: 'running' },
    { id: 329, title: 'Memory proposals', state: 'verifying' },
  ],
}

export const NOTICES = {
  unhandled: 2,
  notices: [
    { id: 117, source: 'diun', title: 'A newer docker.io/amir20/dozzle:latest is published', body: 'Nothing was pulled: update the pin when you choose.', raisedAt: '2026-10-11T07:26:21Z', handledAt: null },
    { id: 168, source: 'leader', title: 'The leader asks about Test z telefonu', body: 'Co přesně se má testovat?', raisedAt: '2026-10-11T21:10:54Z', handledAt: null },
    { id: 175, source: 'backup', title: 'The backup ran', body: 'Encrypted, verified and pruned.', raisedAt: '2026-10-11T09:51:09Z', handledAt: '2026-10-11T09:51:09Z' },
  ],
}

export const METRICS = { since: '2026-09-12T16:39:53Z', stories: 43, opened: 1, merged: 0, acceptanceRate: 0, costPerStoryUsd: 1.1, rows: [] }

export const POLICY = { slots: 4, dayBudgetUsd: 20 }

export const MEMORY = {
  files: [
    { file: 'owner', kind: 'owner', entries: ['Píše česky; kód anglicky.', 'Merge potvrzuje passkey.'] },
    { file: 'topic:terylon/deploy', kind: 'topic', text: 'Dlouhá poznámka.' },
  ],
  proposals: [{ id: 5 }],
}

// One events_since page, as Terylon answers it: `last` is where to ask from next, `head` the newest sequence.
export function events(since: number, list: Record<string, unknown>[], head?: number) {
  const newest = list.length === 0 ? since : Number(list[list.length - 1]?.seq)
  const top = head ?? newest

  return { events: list, since, last: Math.max(since, newest, list.length === 0 ? top : newest), more: false, head: top, gap: false }
}

export function storyMoved(seq: number, story: number, title: string, to: string, outcome: string | null = null) {
  return { seq, at: '2026-10-11T21:52:00Z', type: 'StoryMoved', about: 'story', subject: `story/${story}`, story, title, from: 'verifying', to, outcome, pullRequest: 196 }
}

// One story whole, as story_get answers it on 2026-10-12: its timeline, verdicts, criteria and goal.
export const STORY_333 = {
  id: 333,
  goal: 3,
  title: 'Direct dispatch',
  state: 'running',
  attempt: 2,
  progress: { stage: 'test', step: 5, steps: 9, current: 'testy', agent: { name: 'tester', running: 1 }, tokens: 1400000 },
  model: 'opus',
  effort: 'high',
  pullRequest: { id: null, url: 'https://dev.example/pr', branch: 'feat/direct-dispatch', head: null },
  criteria: ['The leader dispatches a story without the chat API', 'A dead run resumes from its last commit', 'The pane shows the run'],
  verdict: null,
  verdicts: [],
  overrun: [],
  timeline: [
    { seq: 630, at: '2026-10-11T10:00:00Z', type: 'StoryProposed', actor: 'owner', key: null, summary: 'proposed by owner' },
    { seq: 631, at: '2026-10-11T10:00:02Z', type: 'StoryMoved', actor: 'owner', key: null, summary: 'proposed → approved' },
    { seq: 632, at: '2026-10-11T10:00:03Z', type: 'StoryAdmitted', actor: 'leader', key: null, summary: 'admitted: slot 1 of 4' },
    { seq: 635, at: '2026-10-11T10:00:04Z', type: 'StoryMoved', actor: 'leader', key: null, summary: 'approved → dispatched' },
    { seq: 636, at: '2026-10-11T10:00:05Z', type: 'StoryMoved', actor: 'run', key: null, summary: 'dispatched → running' },
    { seq: 640, at: '2026-10-11T14:10:00Z', type: 'QuestionAsked', actor: 'run', key: null, summary: 'QuestionAsked' },
  ],
}

export const STORY_327 = {
  id: 327,
  goal: 3,
  title: 'Events since the last look',
  state: 'verified',
  progress: { stage: 'merge', step: null, steps: null, current: null, agent: null, tokens: null },
  pullRequest: { id: 196, url: 'https://dev.example/pr/196', branch: 'feat/events', head: '4be21c0aaaa' },
  environment: { name: 'pr-196', url: 'https://pr-196.terylon.example.ts.net' },
  criteria: ['events_since returns transitions since a sequence, oldest first', 'a gap in the window answers gap=true', 'a third', 'a fourth'],
  verdict: { id: 'v1', key: 'k', commit: '4be21c0aaaa', verifierVersion: '1', environment: 'pr-196', environmentUrl: null, at: '2026-10-11T15:40:00Z', green: true, superseded: false, checks: [{ name: 'dotnet test', result: 'pass', detail: '412 / 412' }, { name: 'verify --phone', result: 'pass', detail: '38 kroků' }] },
  verdicts: [],
  overrun: ['docs/flows/events.md'],
  timeline: [
    { seq: 700, at: '2026-10-11T15:00:00Z', type: 'StoryMoved', actor: 'run', key: null, summary: 'running → pr-open' },
    { seq: 701, at: '2026-10-11T15:20:00Z', type: 'StoryMoved', actor: 'leader', key: null, summary: 'pr-open → verifying' },
    { seq: 702, at: '2026-10-11T15:40:00Z', type: 'StoryMoved', actor: 'leader', key: null, summary: 'verifying → verified' },
  ],
}

// The world beneath the plugin: the clock, the store, the environment, and Terylon at /mcp.
// `env` adds to the environment: TERYLON_PANE_PROOFS turns on a drawing Desktop has to prove first (S32).
export function world(on: On, options: { store?: Record<string, unknown>; now?: number; env?: Record<string, string> } = {}): World & { clock: ReturnType<typeof mock.clock> } {
  const clock = mock.clock(on, { now: options.now ?? Date.parse('2026-10-11T22:00:00Z') })
  mock.store(on, options.store ?? {})
  mock.env(on, { TERYLON_URL: BASE, ...(options.env ?? {}) })
  const state: World = {
    calls: [],
    prompts: [],
    toasts: [],
    statuses: [],
    logs: [],
    opens: [],
    mode: { server: 'up' },
    hang: new Set<string>(),
    answers: {
      briefing: BRIEFING,
      work_in_flight: FLIGHT,
      stories_list: STORIES,
      policy_get: POLICY,
      goals_list: GOALS,
      memory_get: MEMORY,
      goal_get: (args: Record<string, unknown>) => (args.goal === 3 ? GOAL_3 : { id: args.goal, title: `Goal ${String(args.goal)}`, priority: 2, state: 'open', storyList: [] }),
      plans_list: PLANS,
      notices_list: NOTICES,
      leader_status: { paused: null },
      metrics: METRICS,
      story_get: (args: Record<string, unknown>) => (args.story === 327 ? STORY_327 : args.story === 333 ? STORY_333 : { id: args.story, goal: 3, title: 'Direct dispatch', state: 'running', pullRequest: { branch: 'feat/direct-dispatch' }, timeline: [] }),
      question_answer: { accepted: true, sentence: 'Answered; the leader takes it from here.', commandId: 'c3', subjectId: 11 },
      goal_add: (args: Record<string, unknown>) => ({ accepted: true, sentence: `Goal 12 is set: ${String(args.title)}`, commandId: 'c4', subjectId: 12 }),
      events_since: (args: Record<string, unknown>) => events(Number(args.since), []),
      tasks_add: { accepted: true, sentence: 'Lídr z úkolu udělal plán 42.', commandId: 'c1', subjectId: 42 },
      memory_propose: { accepted: true, gate: 'pending', sentence: 'Návrh čeká.', commandId: 'c2', proposal: 6 },
      notice_handle: (args: Record<string, unknown>) => ({ accepted: true, notice: args.notice, sentence: `Asked: the control plane marks notice ${String(args.notice)} handled.` }),
    },
  }

  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.open', async ($, e) => {
    state.opens.push(String((e as { id?: unknown }).id))
    return { value: { isPlaced: true } } as never
  })
  on('ui.toast', async ($, e) => {
    state.toasts.push(e.text)
    return { value: undefined } as never
  })
  on('ui.status', async ($, e) => {
    state.statuses.push(e.text)
    return { value: undefined } as never
  })
  on('ui.log', async ($, e) => {
    state.logs.push({ text: e.text, to: e.to })
    return { value: undefined } as never
  })
  on('prompt.submit', async ($, e) => {
    state.prompts.push(e.text)
    return { text: e.text }
  })
  on('mcp.call', async ($, e) => {
    state.calls.push({ server: e.server, tool: e.tool, args: e.args })

    if (state.hang.has(e.tool)) {
      return new Promise(() => undefined) as never
    }

    if (state.mode.server === 'missing' || (state.mode.server === 'up' && e.server !== SERVER)) {
      return { deny: `MCP server "${e.server}" is not connected` } as never
    }

    // The two refusals Claude Code gives a mod's call to a tool no allow rule names, measured on 2.1.295:
    // auto mode, whose classifier has no request to judge, and the default mode, which cannot ask.
    if (state.mode.server === 'unclassified') {
      return { deny: `The server-side auto mode classifier gave no verdict for mcp__plugin_terylon-os_terylon__${e.tool}: the request that produced this action did not ask for one.` } as never
    }

    if (state.mode.server === 'prompted') {
      return { deny: `Claude requested permissions to use mcp__plugin_terylon-os_terylon__${e.tool}, but you haven't granted it yet.` } as never
    }

    if (state.mode.server === 'down') {
      return { deny: 'fetch failed: connect ETIMEDOUT' } as never
    }

    if (state.mode.server === 'refused') {
      return { value: { content: [{ type: 'text', text: JSON.stringify({ refused: 'Only the owner of this Terylon configures its provider.', status: 403 }) }], isError: true } } as never
    }

    if (state.mode.server === 'error') {
      return { value: { content: [{ type: 'text', text: JSON.stringify({ refused: 'The leader is not answering.', status: 503 }) }], isError: true } } as never
    }

    const answer = state.answers[e.tool]
    const value = typeof answer === 'function' ? (answer as (args: Record<string, unknown>) => unknown)(e.args) : answer

    if (value === undefined) {
      return { value: { content: [{ type: 'text', text: JSON.stringify({ refused: `no such tool ${e.tool}`, status: 404 }) }], isError: true } } as never
    }

    return { value: { content: [{ type: 'text', text: JSON.stringify(value) }], isError: false } } as never
  })

  return { ...state, clock, calls: state.calls, prompts: state.prompts, toasts: state.toasts, statuses: state.statuses, logs: state.logs, opens: state.opens, answers: state.answers, mode: state.mode, hang: state.hang }
}

export const SESSION = { cwd: '/work', surface: 'desktop', isInteractive: true } as const

// The pane in the narrow dock (the S32 canvas's 360 px board): fewer body columns than NARROW_COLUMNS.
export const NARROW_PANE_PROPS = { ...(PANE_PROPS as Record<string, unknown>), bodyColumns: 36 } as never

// Every Svg the drawing holds: its markup and its alt.
export async function pictures(ui: { findAll: (query: { type?: string }) => Promise<{ props: Record<string, unknown> }[]> }): Promise<{ source: string; alt: string; isInteractive: unknown }[]> {
  return (await ui.findAll({ type: 'Svg' })).map(node => ({ source: String(node.props.source), alt: String(node.props.alt), isInteractive: node.props.isInteractive }))
}

// The band's props as the engine passes them; a survey makes it yield.
export function bandProps(hasSurvey = false) {
  return { hasSurvey, isWorking: false, maxRows: 3, bodyColumns: 80, scroll: { top: 0, bodyRows: 3 }, view: {} } as never
}
