// What Terylon answered, shaped for drawing: the queue's four groups, one story whole, the goals and plans, the
// bell. Pure: no $, so a test reads it without a session.

import type {
  PaneBell,
  PaneDoneItem,
  PaneEvent,
  PaneGoalItem,
  PaneNotice,
  PanePhase,
  PaneWorking,
  PanePlan,
  PaneProposal,
  PaneQuestionItem,
  PaneQueuedItem,
  PaneRepeating,
  PaneRepeatingRun,
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

// "(a) the first option, (b) the second": a question that offers its own choices.
const CHOICE_MARK = /\(([a-z])\)/g

// The longest a choice's label is drawn.
const CHOICE_LONGEST = 40

// How many of the bell's handled notices the machine card shows.
const HANDLED_SHOWN = 4

// The stages a story's work moves through, as Terylon reports them on progress.stage (#360): four measured from
// its run, three said by its state. The pane draws them in this order and never works one out for itself.
const STAGES = ['plan', 'develop', 'review', 'test', 'pr', 'verify', 'merge'] as const

// The states a story's work is over in.
const ENDED_STATES = new Set(['merged', 'accepted'])

// The states a story has been given a slot in.
const ADMITTED_STATES = new Set(['dispatched', 'running', 'pr-open', 'verifying', 'verified', 'blocked', 'merged', 'accepted'])

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

// THE FILES A TASK OVER A REPOSITORY DECLARES (#39): Terylon takes 1 to 30, and refuses the task otherwise. One path per
// line, or per semicolon where the field is one line; the field's own leading and trailing blank lines are forgiven,
// a blank line between two paths is not.
export const FILES_MOST = 30

export function filesOf(field: string): { files: string[]; problem: string | null } {
  const whole = field.trim()

  if (whole === '') {
    return { files: [], problem: COPY.filesNone }
  }

  const files = whole.split(/[;\n]/).map(line => line.trim())
  const blank = files.indexOf('')

  if (blank >= 0) {
    return { files: [], problem: COPY.filesBlank(blank + 1) }
  }

  if (files.length > FILES_MOST) {
    return { files: [], problem: COPY.filesTooMany(files.length) }
  }

  return { files, problem: null }
}

// A STORY IN TERYLON'S OWN LIST has no pull request to merge: it is accepted instead (S27). Its target says so, and a
// verified story with no pull request is one too.
export function isListStory(document: Json): boolean {
  return text(document.target) === 'list' || ((document.pullRequest ?? null) === null && document.state === 'verified')
}

// A goal's target over a repository, `<forge>:<org>/<project>/<repo>`, rather than Terylon's own list.
export function isRepositoryTarget(target: unknown): boolean {
  const named = text(target)

  return named !== null && named !== 'list'
}

export function consoleLink(base: string, query: string): string {
  return `${base}/?cockpit=${query}`
}

// "alice-host" from https://alice-host.example.ts.net: the name the owner knows the machine by.
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

    // A STORY IN TERYLON'S OWN LIST has no merge (#39): it waits for story_accept, on its card.
    if (text(story.target) === 'list') {
      items.push({
        kind: 'accept',
        key: `accept-${id}`,
        target: id,
        title: `#${id} ${text(story.title) ?? ''}`.trim(),
        detail: COPY.verifiedAccept,
        console: consoleLink(base, `work&story=${id}`),
      })
      continue
    }

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

// "Tests · tester · step 5 of 9": a running row's stage, who works in it and how far, from progress alone.
function stageLineOf(stage: string | null, step: number | null, steps: number | null, environment: string | null): string | null {
  if (stage === null) {
    return null
  }

  return [COPY.stageLabel(stage), COPY.stageRole(stage), step !== null && steps !== null ? COPY.stepOf(step, steps) : null, stage === 'verify' ? environment : null]
    .filter(part => part !== null)
    .join(' · ')
}

// A STORY THE OWNER DECIDES ON, OR ONE THAT ENDED, IS NOT RUNNING, whatever progress work_in_flight still carries for it:
// it is drawn under Waiting for you or Done today, never under Running beside it.
const NOT_RUNNING_STATES: ReadonlySet<string> = new Set(['verified', 'merged', 'accepted', 'abandoned'])

// The stories the briefing lists as verified and waiting for the owner, by id.
export function verifiedIds(briefing: Json): ReadonlySet<number> {
  return new Set(list(briefing.storiesVerified).map(story => number(story.id)).filter((id): id is number => id !== null))
}

export function runningItems(flight: Json, zoneOffsetMinutes = 0, waiting: ReadonlySet<number> = new Set()): PaneRunningItem[] {
  return list(flight.stories).filter(story => !NOT_RUNNING_STATES.has(String(story.state ?? '')) && !waiting.has(number(story.id) ?? -1)).map(story => {
    const progress = (story.progress ?? null) as Json | null
    const step = number(progress?.step)
    const steps = number(progress?.steps)
    const stuck = (story.stuck ?? null) as Json | null
    const isVerifying = story.state === 'verifying'
    const environment = text((story.environment as Json | null)?.name)
    const stage = text(progress?.stage)
    const phases = phasesOf({ ...story, state: String(story.state ?? '') }, stage)
    const now = phases.findIndex(phase => phase.status === 'now')
    // THE PHASE OF EIGHT the row is at (the S32 canvas: "5/8 · $2.10"), else the step, as 1.1.2 said it.
    const where = stuck !== null
      ? COPY.stuckSince(clock(stuck.since, zoneOffsetMinutes) ?? '?')
      : isVerifying
        ? COPY.verifying
        : now >= 0
          ? `${now + 1}/${phases.length}`
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
      phases,
      stageLine: stageLineOf(stage, step, steps, environment),
    }
  })
}

// A story waiting for a slot says so only while none is free: with one free and nothing before it, it has not
// started for a reason /mcp does not name (the owner's walk of 1.5.0, #35: a brief the leader could not write).
export function queuedItems(stories: Json[], inFlight: ReadonlySet<number>, hasFreeSlot = false): PaneQueuedItem[] {
  return stories
    .filter(story => QUEUED_STATES.has(String(story.state)) && !inFlight.has(number(story.id) ?? -1))
    .map(story => {
      const afterIds = Array.isArray(story.after) ? story.after.filter((id): id is number => typeof id === 'number') : []
      const held = text(story.blockedReason)
      const detail = held !== null
        ? COPY.held(held)
        : afterIds.length > 0
          ? COPY.after(afterIds.map(id => `#${id}`).join(', '))
          : hasFreeSlot ? COPY.notStarted : COPY.waitsForSlot

      return { story: number(story.id) ?? 0, title: `#${number(story.id) ?? 0} ${text(story.title) ?? ''}`.trim(), detail, isHeld: held !== null }
    })
}

export function doneTodayItems(stories: Json[], now: number, zoneOffsetMinutes = 0): PaneDoneItem[] {
  const today = new Date(now - zoneOffsetMinutes * 60000).toISOString().slice(0, 10)

  return stories
    .filter(story => ENDED_STATES.has(String(story.state ?? '')))
    .filter(story => {
      const at = Date.parse(String(story.updatedAt ?? ''))

      return !Number.isNaN(at) && new Date(at - zoneOffsetMinutes * 60000).toISOString().slice(0, 10) === today
    })
    .map(story => ({
      story: number(story.id) ?? 0,
      title: `#${number(story.id) ?? 0} ${text(story.title) ?? ''}`.trim(),
      detail: COPY.mergedAt(clock(story.updatedAt, zoneOffsetMinutes) ?? '?', money(story.costUsd)),
      isAccepted: isAcceptedStory(story),
    }))
}

// AN ENDED STORY OF TERYLON'S OWN LIST was accepted, never merged: its state, its outcome or its target says so.
export function isAcceptedStory(story: Json): boolean {
  return story.state === 'accepted' || text(story.outcome) === 'accepted' || text(story.target) === 'list'
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

// The story's phases, from the stage Terylon reports (progress.stage) and the state it is in — never from its
// timeline: a stage is measured from the run, and the pane draws what it is told.
export function phasesOf(document: Json, stage: string | null): PanePhase[] {
  const state = String(document.state ?? '')
  const at = stage === null ? -1 : (STAGES as readonly string[]).indexOf(stage)
  const isOver = ENDED_STATES.has(state)
  const pullRequest = (document.pullRequest ?? null) as Json | null
  const verdict = latestVerdict(document)
  const status = (index: number): PanePhase['status'] => (isOver || (at >= 0 && index < at) ? 'done' : index === at ? 'now' : 'next')
  const details: Record<(typeof STAGES)[number], string> = {
    plan: '—',
    develop: '—',
    review: '—',
    test: '—',
    pr: pullRequest !== null && number(pullRequest.id) !== null ? `PR ${number(pullRequest.id)}` : '—',
    verify: verdict === null ? '—' : `${text(verdict.environment) ?? ''} · ${verdict.green === true ? '✓' : '✗'}`,
    merge: state === 'verified' ? COPY.waitsOnYou : '—',
  }
  // THE LAST PHASE OF A LIST STORY is its acceptance, never a merge, and it has no pull request, so no Pull request
  // phase either: verdict, then accept. A repository story keeps both.
  const isList = isListStory(document)

  return [
    { label: COPY.phaseAdmitted, role: null, detail: '—', status: isOver || at >= 0 || ADMITTED_STATES.has(state) ? 'done' : 'next' },
    ...STAGES.flatMap((name, index): PanePhase[] => (name === 'pr' && isList ? [] : [{
      label: name === 'merge' && isList ? COPY.acceptPhase : COPY.stageLabel(name),
      role: COPY.stageRole(name),
      detail: details[name],
      status: status(index),
    }])),
  ]
}

// "1.4 M": the run's tokens so far, as Terylon measured them.
export function tokenCount(tokens: number | null): string | null {
  if (tokens === null) {
    return null
  }

  return tokens >= 1000000 ? `${(tokens / 1000000).toFixed(1)} M` : tokens >= 1000 ? `${Math.round(tokens / 1000)} k` : String(tokens)
}

// "1.4 M tokens".
export function tokensText(tokens: number | null): string | null {
  const count = tokenCount(tokens)

  return count === null ? null : COPY.tokens(count)
}

// Who works in the run now, at which stage, on which step, and what it has spent: read from progress, WHILE A RUN GOES,
// whatever progress names (the owner's walk of 1.5.0, #35: one running story showed Now working, the other did not).
// An agent or a stage progress does not name is said as not reported, never worked out.
function workingOf(progress: Json | null, state: string, spent: { usd: number; budget: number | null }, hours: string | null): PaneWorking | null {
  if (!['running', 'dispatched'].includes(state)) {
    return null
  }

  const agent = (progress?.agent ?? null) as Json | null
  const stage = text(progress?.stage)
  const step = number(progress?.step)
  const steps = number(progress?.steps)
  const name = agent === null ? null : text(agent.name) ?? 'main'
  const others = (number(agent?.running) ?? 0) - 1
  const cost = COPY.costOf(spent.usd.toFixed(2), spent.budget === null ? null : spent.budget.toFixed(0))
  const tokens = tokenCount(number(progress?.tokens))

  return {
    agent: name === null ? COPY.noAgent : `${name === 'main' ? COPY.mainAgent : name}${others > 0 ? ` +${others}` : ''}`,
    stage: stage === null ? COPY.noStage : COPY.stageLabel(stage),
    step: step !== null && steps !== null ? COPY.step(step, steps, text(progress?.current)) : text(progress?.current) ?? COPY.noStep,
    fraction: step !== null && steps !== null && steps > 0 ? step / steps : null,
    spend: [cost, tokensText(number(progress?.tokens)), hours === null ? null : COPY.sinceStart(hours)].filter(part => part !== null).join(' · '),
    numbers: [
      { value: `$${spent.usd.toFixed(2)}`, label: spent.budget === null ? COPY.numberSpent : COPY.numberOfBudget(spent.budget.toFixed(0)) },
      ...(tokens === null ? [] : [{ value: tokens, label: COPY.numberTokens }]),
      ...(hours === null ? [] : [{ value: hours, label: COPY.numberSinceStart }]),
    ],
    spentUsd: spent.usd,
    budgetUsd: spent.budget,
  }
}

// "75 h 46 min": a span of milliseconds, in whole hours and minutes.
function duration(milliseconds: number): string {
  const span = Math.max(0, milliseconds)

  return `${Math.floor(span / 3600000)} h ${Math.floor((span % 3600000) / 60000)} min`
}

// A story's progress, field by field: work_in_flight's where it names a value, story_get's where it does not. A
// progress whose stage is null must not hide the stage story_get reports (the owner's walk of 1.5.0, #35: a stopped
// story fell back to "1 of 8").
export function progressOf(inFlight: Json, document: Json): Json | null {
  const flight = (inFlight.progress ?? null) as Json | null
  const own = (document.progress ?? null) as Json | null

  if (flight === null || own === null) {
    return flight ?? own
  }

  return Object.fromEntries([...new Set([...Object.keys(own), ...Object.keys(flight)])].map(key => [key, flight[key] ?? own[key] ?? null]))
}

// "running → blocked": a move a story_get timeline event says in its summary.
const MOVE = /^\s*([a-z-]+)\s*→\s*([a-z-]+)\s*$/

// HOW LONG A STORY STOOD BLOCKED since it started, from the moves its timeline records: the owner's walk of 1.5.0 (#35)
// read "running 1 h 9 min" on a story unblocked after an hour stopped. A block still open counts up to now.
function blockedSpan(timeline: Json[], since: number, now: number): number {
  let blockedFrom: number | null = null
  let total = 0

  for (const event of [...timeline].sort((first, second) => String(first.at ?? '').localeCompare(String(second.at ?? '')))) {
    const move = MOVE.exec(text(event.summary) ?? '')
    const at = Date.parse(String(event.at ?? ''))

    if (move === null || Number.isNaN(at)) {
      continue
    }

    if (move[2] === 'blocked' && blockedFrom === null) {
      blockedFrom = Math.max(at, since)
    } else if (move[1] === 'blocked' && blockedFrom !== null) {
      total += Math.max(0, at - blockedFrom)
      blockedFrom = null
    }
  }

  return blockedFrom === null ? total : total + Math.max(0, now - blockedFrom)
}

export function storyView(id: number, document: Json, inFlight: Json, question: PaneQuestionItem | null, now: number, zoneOffsetMinutes = 0): PaneStory {
  const state = String(inFlight.state ?? document.state ?? '')
  const progress = progressOf(inFlight, document)
  const step = number(progress?.step)
  const steps = number(progress?.steps)
  const startedAt = Date.parse(String(inFlight.startedAt ?? document.startedAt ?? ''))
  const isRunning = ['dispatched', 'running', 'pr-open', 'verifying', 'blocked'].includes(state)
  const hours = !isRunning || Number.isNaN(startedAt) ? null : duration(now - startedAt - blockedSpan(list(document.timeline), startedAt, now))
  // A BLOCKED STORY IS NOT RUNNING (the owner's walk of 1.2.2, #87: "running 75 h 46 min" beside its blocked chip): its
  // header says how long it has been blocked, from blockedFrom, else from its last update.
  const blockedAt = Date.parse(String(inFlight.blockedFrom ?? document.blockedFrom ?? inFlight.updatedAt ?? document.updatedAt ?? ''))
  const timed = state === 'blocked'
    ? (Number.isNaN(blockedAt) ? null : COPY.storyBlocked(duration(now - blockedAt)))
    : hours === null ? null : COPY.storyRunning(hours)
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
    meta: COPY.storyMeta(timed, number(inFlight.attempt ?? document.attempt) ?? 1, text(pullRequest?.branch), model === '' ? null : model),
    running: timed,
    attempt: number(inFlight.attempt ?? document.attempt) ?? 1,
    branch: text(pullRequest?.branch),
    model: model === '' ? null : model,
    state,
    // A LIST STORY ENDS ACCEPTED: Terylon says merged for it too, and the card says what Done today says.
    stateText: COPY.stateText(state === 'merged' && isAcceptedStory({ ...document, state, target: document.target ?? inFlight.target }) ? 'accepted' : state),
    stateTone: tone,
    step: step !== null && steps !== null ? COPY.step(step, steps, text(progress?.current)) : isRunning ? COPY.noStep : null,
    working: workingOf(progress, state, { usd: number(inFlight.costUsd ?? document.costUsd) ?? 0, budget }, hours),
    fraction: step !== null && steps !== null && steps > 0 ? step / steps : null,
    cost: COPY.costOf(money(inFlight.costUsd ?? document.costUsd), budget === null ? null : budget.toFixed(0)),
    phases: phasesOf({ ...document, state }, text(progress?.stage)),
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
    isBlocked: state === 'blocked',
    isList: isListStory({ ...document, state, target: document.target ?? inFlight.target }),
    canStop: state === 'dispatched' || state === 'running',
    // AN APPROVED STORY THAT HAS NOT STARTED can be ended (the owner's walk of 1.5.0, #35: a story the leader could not
    // brief offered no act at all). Terylon answers whether it takes it.
    canAbandon: state === 'approved',
    hasStage: text(progress?.stage) !== null,
    heldReason: state === 'approved' ? text(document.blockedReason ?? inFlight.blockedReason) : null,
    commit: verdict === null ? (text(pullRequest?.head) ?? '').slice(0, 7) || null : (text(verdict.commit) ?? '').slice(0, 7) || null,
  }
}

// THE POLICY'S FIELDS (S27), as Terylon main aaf07e8 names them, in the order the Status tab draws them: the path in
// policy_get's answer (the memory's bounds nest under `memory`), the label, the word a change is said with, whether it
// is money, and how its value reads. Only the fields policy_get sends are drawn; their ranges are its `limits`.
export type PolicyField = { key: string; label: string; change: string; isMoney?: boolean; isWhole: boolean; show: (value: number) => string; isMemory?: boolean }

export const POLICY_FIELDS: readonly PolicyField[] = [
  { key: 'slots', label: 'Slots', change: 'slots', isWhole: true, show: value => `${value} ${value === 1 ? 'story' : 'stories'}` },
  { key: 'storyBudgetUsd', label: 'Story budget', change: 'story budget', isMoney: true, isWhole: false, show: value => `$${value}` },
  { key: 'dayBudgetUsd', label: 'Daily budget', change: 'daily budget', isMoney: true, isWhole: false, show: value => `$${value}` },
  { key: 'retryLimit', label: 'Red verdicts before blocked', change: 'retries', isWhole: true, show: value => `${value}` },
  { key: 'continueLimit', label: 'Continuations', change: 'continuations', isWhole: true, show: value => `${value}` },
  { key: 'storyHours', label: 'Story hours', change: 'story hours', isWhole: false, show: value => `${value} h` },
  { key: 'stuckMinutes', label: 'Stuck after, minutes', change: 'stuck after', isWhole: true, show: value => `${value} min` },
  { key: 'memory.ownerCharacters', label: 'Owner memory, chars', change: 'owner memory', isWhole: true, show: value => `${value} chars`, isMemory: true },
  { key: 'memory.projectCharacters', label: 'Project memory, chars', change: 'project memory', isWhole: true, show: value => `${value} chars`, isMemory: true },
  { key: 'memory.topicCharacters', label: 'Topic memory, chars', change: 'topic memory', isWhole: true, show: value => `${value} chars`, isMemory: true },
  { key: 'memory.topicsPerProject', label: 'Topics per project', change: 'topics per project', isWhole: true, show: value => `${value}` },
]

// A value at a dotted path: "memory.ownerCharacters".
function at(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((found, part) => (found !== null && typeof found === 'object' ? (found as Json)[part] : undefined), value)
}

export function policyValue(policy: Json | null, key: string): number | null {
  return number(at(policy, key))
}

// A field's limit as policy_get sends it under `limits`, nested as the field is: { minimum, maximum, aboveMinimum, whole }.
export type PolicyLimit = { minimum: number; maximum: number; isAboveMinimum: boolean; isWhole: boolean }

export function policyLimit(policy: Json | null, key: string): PolicyLimit | null {
  const limit = at(policy?.limits, key)

  if (limit === null || typeof limit !== 'object') {
    return null
  }

  const entry = limit as Json
  const minimum = typeof entry.minimum === 'number' ? entry.minimum : null
  const maximum = typeof entry.maximum === 'number' ? entry.maximum : null

  return minimum === null || maximum === null ? null : { minimum, maximum, isAboveMinimum: entry.aboveMinimum === true, isWhole: entry.whole === true }
}

function rangeOf(field: PolicyField, limit: PolicyLimit): string {
  const unit = field.isMoney === true ? '$' : ''

  return limit.isAboveMinimum ? `over ${unit}${limit.minimum}, up to ${unit}${limit.maximum}` : `${unit}${limit.minimum}–${unit}${limit.maximum}`
}

// The label a field is edited under, its range from policy_get's limits: "Slots (1–8)", "Story budget (over $0, up to $10000)".
export function policyFieldLabel(field: PolicyField, policy: Json | null = null): string {
  const limit = policyLimit(policy, field.key)

  return limit === null ? field.label : `${field.label} (${rangeOf(field, limit)})`
}

// The fields policy_get sent, as the Status tab reads them: one row each, the three memory sizes in one row.
export function policyRows(policy: Json | null): { label: string; value: string }[] {
  if (policy === null) {
    return []
  }

  const present = POLICY_FIELDS.filter(field => policyValue(policy, field.key) !== null)
  const memory = present.filter(field => field.isMemory === true)
  const rows: { label: string; value: string }[] = []

  for (const field of present) {
    if (field.isMemory === true) {
      if (field === memory[0]) {
        rows.push(memory.length === 1
          ? { label: field.label.replace(/, chars$/, ''), value: field.show(policyValue(policy, field.key) ?? 0) }
          : { label: `Memory: ${memory.map(item => item.label.replace(/ memory, chars$/, '').toLowerCase()).join(' · ')}`, value: `${memory.map(item => String(policyValue(policy, item.key))).join(' · ')} chars` })
      }

      continue
    }

    rows.push({ label: field.label.replace(/, minutes$/, ''), value: field.show(policyValue(policy, field.key) ?? 0) })
  }

  return rows
}

// What the form changes against policy_get's answer: the field, the value before and the value typed.
export function policyChanges(policy: Json | null, values: Record<string, string>): { key: string; label: string; from: string; to: string; value: number | string }[] {
  if (policy === null) {
    return []
  }

  return POLICY_FIELDS
    .filter(field => policyValue(policy, field.key) !== null && values[field.key] !== undefined && values[field.key]?.trim() !== String(policyValue(policy, field.key)))
    .map(field => {
      const typed = (values[field.key] ?? '').trim()
      const asNumber = Number(typed)

      return { key: field.key, label: field.change, from: String(policyValue(policy, field.key)), to: typed, value: typed !== '' && Number.isFinite(asNumber) ? asNumber : typed }
    })
}

// What policy_save is sent: only what changed, the memory's bounds as a partial `memory` object (Terylon main aaf07e8).
export function policyArguments(changes: readonly { key: string; value: number | string }[]): Json {
  const args: Json = {}

  for (const change of changes) {
    const [head, tail] = change.key.split('.')

    if (tail === undefined) {
      args[head ?? change.key] = change.value
    } else {
      args[head ?? ''] = { ...((args[head ?? ''] as Json | undefined) ?? {}), [tail]: change.value }
    }
  }

  return args
}

// WHAT IS WRONG WITH THE FORM, in the pane's own words: Terylon checks no act's arguments against a schema, so a
// value outside its limit, or not a number of the right kind, is caught here and nothing is sent.
export function policyProblems(policy: Json | null, values: Record<string, string>): string[] {
  return policyChanges(policy, values).flatMap(change => {
    const field = POLICY_FIELDS.find(item => item.key === change.key)

    if (field === undefined) {
      return []
    }

    const limit = policyLimit(policy, change.key)
    const isWhole = limit?.isWhole ?? field.isWhole
    const unit = field.isMoney === true ? '$' : ''
    const name = field.label.replace(/, (chars|minutes)$/, '')
    const value = typeof change.value === 'number' ? change.value : NaN
    const isKind = Number.isFinite(value) && (!isWhole || Number.isInteger(value))
    const isInLimit = limit === null || ((limit.isAboveMinimum ? value > limit.minimum : value >= limit.minimum) && value <= limit.maximum)

    if (isKind && isInLimit) {
      return []
    }

    const typed = change.to === '' ? 'an empty field' : change.to
    const said = limit === null
      ? `${name} is ${isWhole ? 'a whole number' : 'a number'}`
      : limit.isAboveMinimum
        ? `${name} is more than ${unit}${limit.minimum} and at most ${unit}${limit.maximum}`
        : `${name} is ${isWhole ? 'a whole number' : 'a number'} from ${unit}${limit.minimum} to ${unit}${limit.maximum}`

    return [`${said}; ${typed} is not.`]
  })
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

// WHICH OF THE PLAN'S STORIES ONE RUNS AFTER, as their places in the plan (1-based): `after` names them by story id,
// `runsAfter` by place (the walk's plan 144 said "after 12", a story id). A value that names neither is left out.
function afterPlaces(story: Json, ids: readonly (number | null)[]): number[] {
  const named = Array.isArray(story.after) ? story.after.filter((value): value is number => typeof value === 'number') : []
  const placed = Array.isArray(story.runsAfter) ? story.runsAfter.filter((value): value is number => typeof value === 'number') : []
  const byId = named.map(value => ids.indexOf(value) + 1).filter(place => place > 0)
  const byPlace = placed.filter(place => Number.isInteger(place) && place >= 1 && place <= ids.length)

  return [...new Set([...byId, ...byPlace])].sort((first, second) => first - second)
}

// "Today 05:00" on the local day of `now`, "27 Oct 05:00" on another, in the host's own time zone; "?" for a time
// that cannot be read, so nothing undefined or NaN reaches the drawing.
export function runDay(iso: unknown, now: number, zoneOffsetMinutes = 0): string {
  const at = Date.parse(String(iso ?? ''))

  if (!Number.isFinite(at) || !Number.isFinite(now) || !Number.isFinite(zoneOffsetMinutes)) {
    return '?'
  }

  const local = new Date(at - zoneOffsetMinutes * 60000)
  const today = new Date(now - zoneOffsetMinutes * 60000)
  const time = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`

  if (local.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)) {
    return COPY.runToday(time)
  }

  return `${local.getUTCDate()} ${COPY.months[local.getUTCMonth()] ?? '?'} ${time}`
}

// A run's state in words and its tone. A state the pane does not know is drawn as running: Terylon may add one.
function runStateOf(state: unknown): { state: string; tone: PaneRepeatingRun['tone'] } {
  switch (state) {
    case 'merged':
    case 'accepted':
      return { state: COPY.runAccepted, tone: 'success' }
    case 'verified':
      return { state: COPY.runGreenWaits, tone: 'warning' }
    case 'blocked':
      return { state: COPY.runRedWaits, tone: 'warning' }
    case 'abandoned':
      return { state: COPY.runAbandoned, tone: 'subtle' }
    default:
      return { state: COPY.runRunning, tone: 'subtle' }
  }
}

// A version as Terylon numbers it, or names it.
function versionOf(value: unknown): string | null {
  const numbered = number(value)

  return numbered !== null ? String(numbered) : text(value)
}

// A file a run made: `{name}` as Terylon sends it, or a bare name.
function fileName(value: unknown): string | null {
  return value !== null && typeof value === 'object' ? text((value as Json).name) : text(value)
}

// A REPEATING TASK'S GOAL (Terylon S43), from goal_get's `repeating`: null when the goal is not one. Every field is
// read tolerantly: a missing or odd-typed one draws less, never throws.
export function repeatingOf(goal: Json, base: string, now: number, zoneOffsetMinutes = 0): PaneRepeating | null {
  const repeating = goal.repeating

  if (repeating === null || typeof repeating !== 'object' || Array.isArray(repeating)) {
    return null
  }

  const document = repeating as Json
  const approved = document.approved !== null && typeof document.approved === 'object' ? (document.approved as Json) : null
  const waiting = document.waiting !== null && typeof document.waiting === 'object' ? (document.waiting as Json) : null
  const version = approved === null ? null : versionOf(approved.version)
  const budget = approved === null ? null : number(approved.runBudgetUsd)
  const waitingVersion = waiting === null ? null : versionOf(waiting.version)
  const id = number(goal.id)
  const summary = [
    approved === null ? COPY.repeatingNotApproved : COPY.repeatingApproved(version ?? '?'),
    budget === null ? null : COPY.repeatingBudget(money(budget)),
    approved === null ? null : approved.autoAccept === true ? COPY.repeatingAcceptsItself : COPY.repeatingWaitsForYou,
    text(document.paused) === null && document.paused !== true ? null : COPY.repeatingPaused,
    waitingVersion === null ? null : COPY.repeatingWaiting(waitingVersion),
  ]

  return {
    title: (approved === null ? null : text(approved.title)) ?? text(goal.title) ?? (id === null ? '' : `#${id}`),
    summary: summary.filter((part): part is string => part !== null).join(' · '),
    runs: list(document.runs).map(run => {
      const cost = number(run.costUsd)
      const files = Array.isArray(run.files) ? run.files.map(fileName).filter((name): name is string => name !== null) : []

      return {
        story: number(run.story),
        day: runDay(run.startedAt, now, zoneOffsetMinutes),
        ...runStateOf(run.state),
        line: [...files, ...(cost === null ? [] : [`$${money(cost)}`])].join(' · '),
      }
    }),
    console: consoleLink(base, `waiting&task=${id ?? 0}`),
  }
}

export function planItems(plans: Json, base: string): PanePlan[] {
  return list(plans.plans).map(plan => {
    const id = number(plan.id) ?? 0
    const state = String(plan.state ?? '')
    const estimate = number(plan.estimateUsd)
    const isProposed = state === 'proposed'
    const stories = list(plan.stories)
    const ids = stories.map(story => number(story.id))
    const titles = stories.map(story => text(story.title) ?? '')

    return {
      id,
      goal: number(plan.goal) ?? 0,
      goalTitle: text(plan.goalTitle) ?? '',
      state,
      stateText: isProposed ? COPY.planWaiting(estimate === null ? null : estimate.toFixed(0)) : COPY.stateText(state),
      isProposed,
      comment: text(plan.comment),
      stories: stories.map((story, index) => {
        const after = afterPlaces(story, ids)
        const storyEstimate = number(story.estimateUsd)

        return {
          id: number(story.id) ?? 0,
          index: index + 1,
          title: titles[index] ?? '',
          // "after <title>": the story it waits for by its title, never by a number (#35).
          detail: COPY.planStoryDetail(text(story.size) ?? '?', storyEstimate === null ? null : storyEstimate.toFixed(0), after.length === 0 ? null : after.map(place => titles[place - 1] ?? `#${place}`).join(', ')),
          criteria: strings(story.criteria),
          after,
          size: text(story.size) ?? '?',
          estimate: storyEstimate === null ? null : storyEstimate.toFixed(0),
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
        { value: String(number(metrics.stories) ?? 0), label: COPY.metricStories(number(metrics.stories) ?? 0, number((metrics.hostProof as Json | null | undefined)?.stories)) },
        { value: `$${money(metrics.costPerStoryUsd)}`, label: COPY.metricCost },
        { value: String(number(metrics.merged) ?? 0), label: COPY.metricMerged },
        { value: String(number(metrics.opened) ?? 0), label: COPY.metricOpened(number(metrics.opened) ?? 0) },
      ]

  return {
    phase: 'ok',
    sentence: null,
    unhandledCount: number(notices.unhandled) ?? all.filter(notice => notice.handledAt == null).length,
    unhandled: all.filter(notice => notice.handledAt == null).map(notice => noticeOf(notice, now, zoneOffsetMinutes)),
    handled: lastOfEachKey(all.filter(notice => notice.handledAt != null)).slice(0, HANDLED_SHOWN).map(notice => noticeOf(notice, now, zoneOffsetMinutes)),
    leader: paused === null ? { isPaused: false, text: COPY.leaderRuns } : { isPaused: true, text: COPY.leaderPaused(paused.since, paused.reason) },
    metrics: rows,
    handling: null,
    handleSentence: null,
  }
}

// THE MEMORY'S PROPOSALS (S27), as memory_get lists them on Terylon main aaf07e8: the pending ones only, each with its
// operations (several for a consolidation), why, and who proposed it. `by` is "web:<login>" for the owner and "brain"
// for the leader: the pane keeps only which of the two, never the login.
export function proposalItems(memory: Json, zoneOffsetMinutes = 0): PaneProposal[] {
  return list(memory.proposals).map(proposal => {
    const by = text(proposal.by) ?? ''
    const subject = /^story\/(\d+)$/.exec(text(proposal.subject) ?? '')
    const operations = list(proposal.operations).map(operation => ({ action: text(operation.action) ?? '', file: text(operation.file) ?? '', text: text(operation.text), oldText: text(operation.oldText) }))
    const flattened = { action: text(proposal.action) ?? '', file: text(proposal.file) ?? '', text: text(proposal.text), oldText: text(proposal.oldText) }

    return {
      id: number(proposal.id) ?? 0,
      file: flattened.file,
      action: flattened.action,
      oldText: flattened.oldText,
      text: flattened.text,
      operations: operations.length === 0 ? [flattened] : operations,
      why: text(proposal.why),
      by: by.startsWith('web:') || by === 'owner' ? 'owner' : 'leader',
      story: subject === null ? number(proposal.story) : Number(subject[1]),
      at: clock(proposal.at, zoneOffsetMinutes),
    }
  })
}
