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

// The owner's gates, spelled out here rather than imported, so a mutation of the mod's own list cannot hide one.
export const GATES = ['plan_approve', 'plan_rethink', 'story_merge', 'story_return', 'story_unblock', 'story_abandon', 'story_stop', 'story_accept', 'leader_pause', 'leader_resume']

export type Call = { server: string; tool: string; args: Record<string, unknown> }

export type Answer = unknown | ((args: Record<string, unknown>) => unknown)

export type World = {
  calls: Call[]
  prompts: string[]
  toasts: string[]
  statuses: (string | undefined)[]
  answers: Record<string, Answer>
  mode: { server: 'up' | 'missing' | 'down' | 'refused' | 'error' }
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
    { id: 333, title: 'Direct dispatch', run: 'r1', state: 'running', attempt: 2, progress: { step: 5, steps: 9, current: 'testy' }, startedAt: '2026-10-11T10:00:00Z', costUsd: 2.1, budgetUsd: 8, hours: 6, stuck: null, environment: null },
    { id: 329, title: 'Memory proposals', run: 'r2', state: 'verifying', attempt: 1, progress: null, startedAt: '2026-10-11T09:00:00Z', costUsd: 3.4, budgetUsd: 8, hours: 6, stuck: null, environment: { name: 'pr-197', url: 'https://y' } },
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

export const GOALS = { goals: [{ id: 3, title: 'P1 · Agentic OS', state: 'open' }, { id: 1, title: 'Old', state: 'done' }] }

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

export const STORY_327 = { id: 327, title: 'Events since the last look', state: 'verified', pullRequest: { id: 196, url: 'u', branch: 'feat/events' }, verdict: { commit: '4be21c0aaaa', environment: 'pr-196', green: true } }

// The world beneath the plugin: the clock, the store, the environment, and Terylon at /mcp.
export function world(on: On, options: { store?: Record<string, unknown>; now?: number } = {}): World & { clock: ReturnType<typeof mock.clock> } {
  const clock = mock.clock(on, { now: options.now ?? Date.parse('2026-10-11T22:00:00Z') })
  mock.store(on, options.store ?? {})
  mock.env(on, { TERYLON_URL: BASE })
  const state: World = {
    calls: [],
    prompts: [],
    toasts: [],
    statuses: [],
    mode: { server: 'up' },
    answers: {
      briefing: BRIEFING,
      work_in_flight: FLIGHT,
      stories_list: STORIES,
      policy_get: POLICY,
      goals_list: GOALS,
      memory_get: MEMORY,
      story_get: (args: Record<string, unknown>) => (args.story === 327 ? STORY_327 : { id: args.story, title: 'Direct dispatch', pullRequest: { branch: 'feat/direct-dispatch' } }),
      events_since: (args: Record<string, unknown>) => events(Number(args.since), []),
      tasks_add: { accepted: true, sentence: 'Lídr z úkolu udělal plán 42.', commandId: 'c1', subjectId: 42 },
      memory_propose: { accepted: true, gate: 'pending', sentence: 'Návrh čeká.', commandId: 'c2', proposal: 6 },
    },
  }

  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }) as never)
  on('ui.open', async () => ({ value: { isPlaced: true } }) as never)
  on('ui.toast', async ($, e) => {
    state.toasts.push(e.text)
    return { value: undefined } as never
  })
  on('ui.status', async ($, e) => {
    state.statuses.push(e.text)
    return { value: undefined } as never
  })
  on('prompt.submit', async ($, e) => {
    state.prompts.push(e.text)
    return { text: e.text }
  })
  on('mcp.call', async ($, e) => {
    state.calls.push({ server: e.server, tool: e.tool, args: e.args })

    if (state.mode.server === 'missing' || (state.mode.server === 'up' && e.server !== SERVER)) {
      return { deny: `MCP server "${e.server}" is not connected` } as never
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

  return { ...state, clock, calls: state.calls, prompts: state.prompts, toasts: state.toasts, statuses: state.statuses, answers: state.answers, mode: state.mode }
}

export const SESSION = { cwd: '/work', surface: 'desktop', isInteractive: true } as const
