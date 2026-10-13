// What Terylon answered, shaped for drawing: the queue's four groups, one story whole, the goals and plans, the
// bell. Pure: no $, so a test reads it without a session.

import type {
  PaneBell,
  PaneDoneItem,
  PaneEvent,
  PaneGoalItem,
  PaneNotice,
  PanePhase,
  PanePlan,
  PaneQuestionItem,
  PaneQueuedItem,
  PaneRunningItem,
  PaneStory,
  PaneWaitingItem,
} from '../types'

import { COPY } from './copy'
import { isAlert } from './health'

type Json = Record<string, unknown>

// The states a story waits in before a slot takes it.
const QUEUED_STATES = new Set(['approved', 'dispatched'])

// A goal still in play; every other state is drawn among the closed ones.
const OPEN_GOAL_STATES = new Set(['open', 'active', 'planned'])

// A transition in a timeline summary: "running → verified: why".
const TRANSITION = /→\s*([a-z-]+)/

// "(a) the first option, (b) the second": a question that offers its own choices.
const CHOICE_MARK = /\(([a-z])\)/g

// The longest a choice's label is drawn.
const CHOICE_LONGEST = 40

// How many of the bell's handled notices the machine card shows.
const HANDLED_SHOWN = 4

// What each later state proves the story already passed.
const STATE_ORDER: Record<string, number> = {
  proposed: 0,
  approved: 1,
  dispatched: 2,
  running: 3,
  blocked: 3,
  'pr-open': 4,
  verifying: 5,
  verified: 6,
  merged: 7,
  accepted: 7,
}

export function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item): item is Json => item !== null && typeof item === 'object') : []
}

export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : []
}

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

export function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function money(value: unknown): string {
  return (number(value) ?? 0).toFixed(2)
}

export function firstLine(value: string): string {
  return value.split('\n')[0]?.trim() ?? ''
}

export function clock(iso: unknown, zoneOffsetMinutes = 0): string | null {
  const at = text(iso)

  if (at === null) {
    return null
  }

  const date = new Date(Date.parse(at) - zoneOffsetMinutes * 60000)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

// "14:20" today, "11. 10." on another day: when a notice was raised, in the host's own time zone.
export function when(iso: unknown, now: number, zoneOffsetMinutes = 0): string {
  const at = Date.parse(String(iso ?? ''))

  if (Number.isNaN(at)) {
    return ''
  }

  const local = new Date(at - zoneOffsetMinutes * 60000)
  const today = new Date(now - zoneOffsetMinutes * 60000)

  if (local.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)) {
    return clock(iso, zoneOffsetMinutes) ?? ''
  }

  return `${local.getUTCDate()}. ${local.getUTCMonth() + 1}.`
}

export function consoleLink(base: string, query: string): string {
  return `${base}/?cockpit=${query}`
}

// "terylonlab" from https://terylonlab.tail79a80a.ts.net: the name the owner knows the machine by.
export function hostName(base: string): string {
  const match = /^[a-z]+:\/\/([^./:]+)/i.exec(base)

  return match?.[1] ?? base
}

// "goal 11", "story 38", "plan 4": what a question or an event is about.
export function subjectLabel(subject: string): string {
  const match = /^(goal|story|plan)\/(\d+)$/.exec(subject)

  if (match === null) {
    return subject
  }

  const noun = match[1] ?? 'story'

  return `${noun} ${match[2]}`
}

export function questionItems(briefing: Json): PaneQuestionItem[] {
  return list(briefing.questionsOpen).map(question => {
    const subject = text(question.subject) ?? ''

    return {
      id: number(question.id) ?? 0,
      about: text(question.about) ?? subjectLabel(subject),
      subject,
      subjectLabel: subjectLabel(subject),
      text: text(question.text) ?? '',
      askedAt: text(question.askedAt),
    }
  })
}

export function waitingItems(briefing: Json, base: string): PaneWaitingItem[] {
  const items: PaneWaitingItem[] = []

  for (const question of questionItems(briefing)) {
    items.push({
      kind: 'question',
      key: `question-${question.id}`,
      target: question.id,
      title: `${question.about} — ${firstLine(question.text)}`,
      detail: question.text,
      console: consoleLink(base, `question&question=${question.id}`),
    })
  }

  for (const story of list(briefing.storiesVerified)) {
    const id = number(story.id) ?? 0
    const environment = story.environment as Json | null | undefined
    items.push({
      kind: 'merge',
      key: `merge-${id}`,
      target: id,
      title: `#${id} ${text(story.title) ?? ''}`.trim(),
      detail: COPY.verifiedWaiting(text(environment?.name) ?? null),
      console: consoleLink(base, `merge&story=${id}`),
    })
  }

  for (const plan of list(briefing.plansWaiting)) {
    const id = number(plan.id) ?? 0
    const estimate = number(plan.estimateUsd)
    items.push({
      kind: 'plan',
      key: `plan-${id}`,
      target: id,
      title: COPY.planTitle(id, text(plan.goalTitle) ?? '', number(plan.stories) ?? 0),
      detail: COPY.planWaiting(estimate === null ? null : estimate.toFixed(0)),
      console: consoleLink(base, `plan&plan=${id}`),
    })
  }

  for (const story of list(briefing.storiesBlocked)) {
    const id = number(story.id) ?? 0
    items.push({
      kind: 'blocked',
      key: `blocked-${id}`,
      target: id,
      title: `#${id} ${text(story.title) ?? ''}`.trim(),
      detail: COPY.blocked(text(story.blockedReason) ?? '?'),
      console: consoleLink(base, `blocked&story=${id}`),
    })
  }

  return items
}

export function runningItems(flight: Json, zoneOffsetMinutes = 0): PaneRunningItem[] {
  return list(flight.stories).map(story => {
    const progress = (story.progress ?? null) as Json | null
    const step = number(progress?.step)
    const steps = number(progress?.steps)
    const stuck = (story.stuck ?? null) as Json | null
    const isVerifying = story.state === 'verifying'
    const environment = text((story.environment as Json | null)?.name)
    const where = stuck !== null
      ? COPY.stuckSince(clock(stuck.since, zoneOffsetMinutes) ?? '?')
      : isVerifying
        ? COPY.verifying
        : step !== null && steps !== null
          ? `${step}/${steps}`
          : text(story.state) ?? ''

    return {
      story: number(story.id) ?? 0,
      title: `#${number(story.id) ?? 0} ${text(story.title) ?? ''}`.trim(),
      detail: `${where} · $${money(story.costUsd)}`,
      step: step !== null && steps !== null
        ? COPY.step(step, steps, text(progress?.current))
        : isVerifying && environment !== null
          ? `${COPY.verifying} v ${environment}`
          : null,
      fraction: isVerifying ? 0.9 : step !== null && steps !== null && steps > 0 ? Math.min(1, step / steps) : null,
      isStuck: stuck !== null,
      isVerifying,
    }
  })
}

export function queuedItems(stories: Json[], inFlight: ReadonlySet<number>): PaneQueuedItem[] {
  return stories
    .filter(story => QUEUED_STATES.has(String(story.state)) && !inFlight.has(number(story.id) ?? -1))
    .map(story => {
      const afterIds = Array.isArray(story.after) ? story.after.filter((id): id is number => typeof id === 'number') : []
      const held = text(story.blockedReason)
      const detail = held !== null
        ? COPY.held(held)
        : afterIds.length > 0
          ? COPY.after(afterIds.map(id => `#${id}`).join(', '))
          : COPY.waitsForSlot

      return { story: number(story.id) ?? 0, title: `#${number(story.id) ?? 0} ${text(story.title) ?? ''}`.trim(), detail, isHeld: held !== null }
    })
}

export function doneTodayItems(stories: Json[], now: number, zoneOffsetMinutes = 0): PaneDoneItem[] {
  const today = new Date(now - zoneOffsetMinutes * 60000).toISOString().slice(0, 10)

  return stories
    .filter(story => story.state === 'merged')
    .filter(story => {
      const at = Date.parse(String(story.updatedAt ?? ''))

      return !Number.isNaN(at) && new Date(at - zoneOffsetMinutes * 60000).toISOString().slice(0, 10) === today
    })
    .map(story => ({
      story: number(story.id) ?? 0,
      title: `#${number(story.id) ?? 0} ${text(story.title) ?? ''}`.trim(),
      detail: COPY.mergedAt(clock(story.updatedAt, zoneOffsetMinutes) ?? '?', money(story.costUsd)),
    }))
}

export function spend(flight: Json): string {
  return list(flight.stories).reduce((sum, story) => sum + (number(story.costUsd) ?? 0), 0).toFixed(2)
}

export function dayBudget(policy: Json | null): string | null {
  const day = number(policy?.dayBudgetUsd)

  return day === null ? null : day.toFixed(0)
}

export function header(flight: Json, policy: Json | null): string {
  return COPY.header(spend(flight), dayBudget(policy), list(flight.stories).length, number(flight.slots) ?? 0)
}

// The leader's kill switch, from leader_status or the briefing's copy of it: { at, source, reason } or null.
export function pausedOf(leader: Json | null, isFlightPaused: boolean, zoneOffsetMinutes = 0): { since: string | null; reason: string | null } | null {
  const paused = (leader?.paused ?? null) as Json | boolean | null

  if (paused !== null && typeof paused === 'object') {
    return { since: clock(paused.at, zoneOffsetMinutes), reason: text(paused.reason) }
  }

  return paused === true || isFlightPaused ? { since: null, reason: null } : null
}

// The latest verdict that still counts: story_get's own `verdict` when it is one, else the newest of `verdicts`.
function latestVerdict(document: Json): Json | null {
  const verdict = document.verdict

  if (verdict !== null && typeof verdict === 'object' && text((verdict as Json).commit) !== null) {
    return verdict as Json
  }

  const standing = list(document.verdicts).filter(item => item.superseded !== true)

  return standing[standing.length - 1] ?? null
}

// Which states the story has been in: its timeline's transitions, and where it is now.
function statesReached(document: Json): Set<string> {
  const reached = new Set<string>()

  for (const event of list(document.timeline)) {
    const match = TRANSITION.exec(String(event.summary ?? ''))

    if (match?.[1] !== undefined) {
      reached.add(match[1])
    }
  }

  reached.add(String(document.state ?? ''))

  return reached
}

function passed(reached: ReadonlySet<string>, order: number): boolean {
  return [...reached].some(state => (STATE_ORDER[state] ?? -1) > order)
}

function eventTime(document: Json, matches: (event: Json) => boolean, zoneOffsetMinutes: number): string | null {
  const event = list(document.timeline).find(matches)

  return event === undefined ? null : clock(event.at, zoneOffsetMinutes)
}

// The run's phases, as far as the timeline tells them: what /mcp reports today, not the agents inside a run.
export function phasesOf(document: Json, zoneOffsetMinutes = 0): PanePhase[] {
  const state = String(document.state ?? '')
  const reached = statesReached(document)
  const admitted = list(document.timeline).find(event => event.type === 'StoryAdmitted')
  const pullRequest = (document.pullRequest ?? null) as Json | null
  const verdict = latestVerdict(document)
  const isRunNow = state === 'running' || state === 'dispatched' || state === 'blocked'
  const ranAt = eventTime(document, event => /→\s*running/.test(String(event.summary ?? '')), zoneOffsetMinutes)

  const phases: PanePhase[] = [
    {
      label: COPY.phaseAdmitted,
      detail: admitted === undefined ? '—' : `${text(admitted.summary) ?? ''}${clock(admitted.at, zoneOffsetMinutes) === null ? '' : ` · ${clock(admitted.at, zoneOffsetMinutes)}`}`,
      status: admitted !== undefined || passed(reached, 2) ? 'done' : 'next',
    },
    {
      label: COPY.phaseRun,
      detail: state === 'blocked' ? COPY.waitsOnYou : ranAt ?? '—',
      status: isRunNow ? 'now' : passed(reached, 3) ? 'done' : 'next',
    },
    {
      label: COPY.phasePullRequest,
      detail: pullRequest !== null ? `PR ${number(pullRequest.id) ?? ''}`.trim() : '—',
      status: state === 'pr-open' ? 'now' : pullRequest !== null || passed(reached, 4) ? 'done' : 'next',
    },
    {
      label: COPY.phaseVerify,
      detail: verdict === null ? '—' : `${text(verdict.environment) ?? ''} · ${verdict.green === true ? '✓' : '✗'}`,
      status: state === 'verifying' ? 'now' : passed(reached, 5) ? 'done' : 'next',
    },
    {
      label: COPY.phaseMerge,
      detail: state === 'verified' ? COPY.waitsOnYou : '—',
      status: state === 'verified' ? 'now' : state === 'merged' || state === 'accepted' ? 'done' : 'next',
    },
  ]

  return phases
}

export function storyView(id: number, document: Json, inFlight: Json, question: PaneQuestionItem | null, now: number, zoneOffsetMinutes = 0): PaneStory {
  const state = String(inFlight.state ?? document.state ?? '')
  const progress = (inFlight.progress ?? document.progress ?? null) as Json | null
  const step = number(progress?.step)
  const steps = number(progress?.steps)
  const startedAt = Date.parse(String(inFlight.startedAt ?? document.startedAt ?? ''))
  const isRunning = ['dispatched', 'running', 'pr-open', 'verifying', 'blocked'].includes(state)
  const hours = !isRunning || Number.isNaN(startedAt) ? null : `${Math.floor((now - startedAt) / 3600000)} h ${Math.floor(((now - startedAt) % 3600000) / 60000)} min`
  const pullRequest = (document.pullRequest ?? null) as Json | null
  const budget = number(inFlight.budgetUsd ?? document.budgetUsd)
  const environment = (inFlight.environment ?? document.environment ?? null) as Json | null
  const verdict = latestVerdict(document)
  const model = [text(document.model), text(document.effort)].filter(part => part !== null).join(' / ')
  const timeline: PaneEvent[] = list(document.timeline)
    .slice()
    .reverse()
    .map(event => ({ time: when(event.at, now, zoneOffsetMinutes), actor: text(event.actor) ?? '', summary: text(event.summary) ?? text(event.type) ?? '' }))
  const tone: PaneStory['stateTone'] = state === 'verified' || state === 'merged' || state === 'accepted'
    ? 'success'
    : state === 'blocked' || inFlight.stuck != null
      ? 'warning'
      : isRunning
        ? 'suggestion'
        : 'subtle'

  return {
    story: id,
    phase: 'ok',
    sentence: null,
    title: `#${id} ${text(document.title) ?? text(inFlight.title) ?? ''}`.trim(),
    meta: COPY.storyMeta(hours, number(inFlight.attempt ?? document.attempt) ?? 1, text(pullRequest?.branch), model === '' ? null : model),
    state,
    stateText: COPY.stateText(state),
    stateTone: tone,
    step: step !== null && steps !== null ? COPY.step(step, steps, text(progress?.current)) : isRunning ? COPY.noStep : null,
    fraction: step !== null && steps !== null && steps > 0 ? step / steps : null,
    cost: COPY.costOf(money(inFlight.costUsd ?? document.costUsd), budget === null ? null : budget.toFixed(0)),
    phases: phasesOf({ ...document, state }, zoneOffsetMinutes),
    question: question === null ? null : { id: question.id, text: question.text },
    environment: environment === null || text(environment.name) === null ? null : { name: text(environment.name) ?? '', url: text(environment.url) },
    verdict: verdict === null
      ? null
      : {
          commit: (text(verdict.commit) ?? '').slice(0, 7),
          at: clock(verdict.at, zoneOffsetMinutes),
          isGreen: verdict.green === true,
          checks: list(verdict.checks).map(check => ({ name: text(check.name) ?? '', isPass: check.result === 'pass', detail: text(check.detail) ?? '' })),
        },
    overrun: strings(document.overrun),
    criteria: strings(document.criteria),
    timeline,
    pullRequest: pullRequest === null || text(pullRequest.url) === null
      ? null
      : { label: number(pullRequest.id) === null ? 'PR ↗' : `PR ${number(pullRequest.id)} ↗`, url: text(pullRequest.url) ?? '' },
    goal: number(document.goal),
    isRunning,
    isVerified: state === 'verified',
  }
}

// "(a) web na mobilu": the options a question offers in its own text, to press instead of typing.
export function questionChoices(question: string): string[] {
  const marks = [...question.matchAll(CHOICE_MARK)]

  return marks.map((mark, index) => {
    const start = (mark.index ?? 0) + mark[0].length
    const end = marks[index + 1]?.index ?? question.length
    const body = question.slice(start, end).split(/[?,;]/)[0]?.trim() ?? ''
    const label = body.length > CHOICE_LONGEST ? `${body.slice(0, CHOICE_LONGEST - 1).trimEnd()}…` : body

    return `(${mark[1]}) ${label}`
  })
}

export function goalItems(goals: Json, questions: readonly PaneQuestionItem[]): { open: PaneGoalItem[]; closed: PaneGoalItem[] } {
  const items = list(goals.goals)
    .map(goal => {
      const id = number(goal.id) ?? 0
      const counts = (goal.stories ?? {}) as Json

      return {
        id,
        title: text(goal.title) ?? `#${id}`,
        priority: `P${number(goal.priority) ?? 2}`,
        state: String(goal.state ?? ''),
        questions: questions.filter(question => question.subject === `goal/${id}`).length,
        stories: Object.entries(counts).map(([state, count]) => `${count} ${COPY.stateText(state)}`).join(', '),
      }
    })
    .sort((first, second) => first.priority.localeCompare(second.priority) || first.id - second.id)

  return { open: items.filter(goal => OPEN_GOAL_STATES.has(goal.state)), closed: items.filter(goal => !OPEN_GOAL_STATES.has(goal.state)) }
}

export function planItems(plans: Json, base: string): PanePlan[] {
  return list(plans.plans).map(plan => {
    const id = number(plan.id) ?? 0
    const state = String(plan.state ?? '')
    const estimate = number(plan.estimateUsd)
    const isProposed = state === 'proposed'

    return {
      id,
      goal: number(plan.goal) ?? 0,
      goalTitle: text(plan.goalTitle) ?? '',
      state,
      stateText: isProposed ? COPY.planWaiting(estimate === null ? null : estimate.toFixed(0)) : COPY.stateText(state),
      isProposed,
      comment: text(plan.comment),
      stories: list(plan.stories).map((story, index) => {
        const after = (Array.isArray(story.runsAfter) && story.runsAfter.length > 0 ? story.runsAfter : story.after) as unknown
        const afterIds = Array.isArray(after) ? after.filter((value): value is number => typeof value === 'number') : []
        const storyEstimate = number(story.estimateUsd)

        return {
          id: number(story.id) ?? 0,
          index: index + 1,
          title: text(story.title) ?? '',
          detail: COPY.planStoryDetail(text(story.size) ?? '?', storyEstimate === null ? null : storyEstimate.toFixed(0), afterIds.length === 0 ? null : afterIds.join(', ')),
          criteria: strings(story.criteria),
        }
      }),
      console: consoleLink(base, `plan&plan=${id}`),
    }
  })
}

function noticeOf(notice: Json, now: number, zoneOffsetMinutes: number): PaneNotice {
  const link = text(notice.link)

  return {
    id: number(notice.id) ?? 0,
    source: text(notice.source) ?? '',
    title: text(notice.title) ?? '',
    body: text(notice.body) ?? '',
    when: when(notice.raisedAt, now, zoneOffsetMinutes),
    link: link !== null && link.startsWith('/') ? link : null,
  }
}

// The alerts among the bell's notices, for the Status tab: each with its body, which says what to do.
export function alertItems(notices: Json, now: number, zoneOffsetMinutes = 0): PaneNotice[] {
  return list(notices.notices).filter(isAlert).map(notice => noticeOf(notice, now, zoneOffsetMinutes))
}

// The newest handled notice of each key (a backup, a production deploy), so one that repeats shows once.
function lastOfEachKey(notices: Json[]): Json[] {
  const seen = new Set<string>()

  return [...notices]
    .sort((first, second) => String(second.raisedAt ?? '').localeCompare(String(first.raisedAt ?? '')))
    .filter(notice => {
      const key = text(notice.key) ?? `id:${String(notice.id)}`

      if (seen.has(key)) {
        return false
      }

      seen.add(key)

      return true
    })
}

export function bellView(notices: Json, leader: Json | null, metrics: Json | null, now: number, zoneOffsetMinutes = 0): PaneBell {
  const all = list(notices.notices)
  const paused = pausedOf(leader, false, zoneOffsetMinutes)
  const rows: { value: string; label: string }[] = metrics === null
    ? []
    : [
        { value: String(number(metrics.stories) ?? 0), label: COPY.metricStories },
        { value: `$${money(metrics.costPerStoryUsd)}`, label: COPY.metricCost },
        { value: String(number(metrics.merged) ?? 0), label: COPY.metricMerged },
        { value: String(number(metrics.opened) ?? 0), label: COPY.metricOpened },
      ]

  return {
    phase: 'ok',
    sentence: null,
    unhandledCount: number(notices.unhandled) ?? all.filter(notice => notice.handledAt == null).length,
    unhandled: all.filter(notice => notice.handledAt == null).map(notice => noticeOf(notice, now, zoneOffsetMinutes)),
    handled: lastOfEachKey(all.filter(notice => notice.handledAt != null)).slice(0, HANDLED_SHOWN).map(notice => noticeOf(notice, now, zoneOffsetMinutes)),
    leader: paused === null ? { isPaused: false, text: COPY.leaderRuns } : { isPaused: true, text: COPY.leaderPaused(paused.since, paused.reason) },
    metrics: rows,
  }
}
