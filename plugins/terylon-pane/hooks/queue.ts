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
  PaneTaskVersion,
  PaneStory,
  PaneWaitingItem,
} from '../types'

import { COPY } from './copy'
import { isAlert } from './health'
import * as words from './words'

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

// A HOST PROOF'S SUBJECT (Terylon S68): the host proof's own stories, plans and questions reach no prompt, no band and
// no catch-up. Only the source `host-proof` is one; an mcp proof's fixtures say `owner` by design.
export const HOST_PROOF = 'host-proof'

export function isHostProof(item: unknown): boolean {
  return item !== null && typeof item === 'object' && (item as Json).source === HOST_PROOF
}

// WHAT TERYLON SPENT, AND WHETHER IT IS KNOWN: on the setup token, or where an item says so, a cost is not known and
// only its tokens are said, never a $ figure (Design · Glossary). `basis` is the briefing's `costBasis`.
export type Spent = { usd: number; tokens: number | null; isKnown: boolean }

export function tokensOf(item: Json): number | null {
  return number(item.tokens) ?? number((item.progress as Json | null | undefined)?.tokens)
}

export function spentOf(item: Json, basis: string | null): Spent {
  return { usd: number(item.costUsd) ?? 0, tokens: tokensOf(item), isKnown: item.costKnown !== false && basis !== words.SETUP_TOKEN }
}

// Several items' spend summed: unknown when any one is, its tokens the sum of those Terylon measured.
export function spentOfAll(items: Json[], basis: string | null): Spent {
  const all = items.map(item => spentOf(item, basis))
  const measured = all.map(item => item.tokens).filter((value): value is number => value !== null)

  return {
    usd: all.reduce((sum, item) => sum + item.usd, 0),
    tokens: measured.length === 0 ? null : measured.reduce((sum, value) => sum + value, 0),
    isKnown: basis !== words.SETUP_TOKEN && all.every(item => item.isKnown),
  }
}

// "$2.10", or on the setup token "48 k tokens · cost not known": a row's or a gauge's cost, in a tight place.
export function costTight(spent: Spent): string {
  return words.cost({ costKnown: spent.isKnown, costUsd: spent.usd, tokens: spent.tokens }, { tight: true })
}

// A COST AS THE GLOSSARY SAYS IT: "$2.10", or "48 k tokens · cost not known on the setup token".
export function costWords(spent: Spent): string {
  return words.cost({ costKnown: spent.isKnown, costUsd: spent.usd, tokens: spent.tokens })
}

// A subject as the pane names it: its ref, or a hash and its number from a Terylon older than refs.
export function refOf(item: Json | null | undefined, id: unknown): string {
  return words.refOr(item, id)
}

// What a console address names a subject by: its ref, or its number from an older Terylon.
function addressOf(item: Json | null | undefined, id: unknown): string {
  const named = item === null || item === undefined ? null : text(item.ref)

  return encodeURIComponent(named ?? String(id ?? ''))
}

// "ADO #n ↗": a story's work item, only ever this link; `workItem` as {number, url}, or a number beside workItemUrl.
export function workItemOf(document: Json): { label: string; url: string } | null {
  const item = document.workItem
  const found = item !== null && typeof item === 'object' ? (item as Json) : null
  const numbered = found === null ? number(item) : number(found.number)
  const url = found === null ? text(document.workItemUrl) : text(found.url) ?? text(document.workItemUrl)

  return numbered === null || url === null ? null : { label: words.workItem(numbered), url }
}

export function firstLine(value: string): string {
  return value.split('\n')[0]?.trim() ?? ''
}

// THE HOST'S OFFSET FROM UTC, in minutes: a fixed one, or the offset at each moment. A moment is drawn in its own
// offset, so a time from before a change of clocks keeps the hour it had, not today's.
export type Zone = number | ((moment: number) => number)

export function offsetAt(zone: Zone, moment: number): number {
  const offset = typeof zone === 'function' ? zone(moment) : zone

  return Number.isFinite(offset) ? offset : 0
}

export function clock(iso: unknown, zone: Zone = 0): string | null {
  const at = text(iso)

  if (at === null) {
    return null
  }

  const moment = Date.parse(at)
  const date = new Date(moment - offsetAt(zone, moment) * 60000)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

// "14:20" today, "yesterday 22:02", "29 Oct 16:10" on another day: when a notice was raised or an event happened, in
// the host's own time zone, in the glossary's words.
export function when(iso: unknown, now: number, zone: Zone = 0): string {
  const at = Date.parse(String(iso ?? ''))

  if (Number.isNaN(at)) {
    return ''
  }

  return words.daysBefore(at, now, zone) === 0 ? clock(iso, zone) ?? '' : words.moment(at, now, zone)
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

// THE CONSOLE'S ADDRESSES (Terylon S66): /?view=<screen> with the subject it is about by its ref; the notices are a
// panel over Waiting for you, the policy a section of Settings, and Activity holds what History held.
const CONSOLE_PLACES: Record<string, string> = {
  bell: '?view=waiting&notices=open',
  notices: '?view=waiting&notices=open',
  policy: '?settings=leader',
  work: '?view=waiting',
  history: '?view=activity',
}

export function consoleLink(base: string, query: string): string {
  return `${base}/${CONSOLE_PLACES[query] ?? `?view=${query}`}`
}

// A story's screen in the console, by its ref: its own, the merge's or the blocked one's.
export function storyLink(base: string, view: 'story' | 'merge' | 'blocked', story: Json | null | undefined, id: unknown): string {
  return consoleLink(base, `${view}&story=${addressOf(story, id)}`)
}

// A goal's screen in the console, by its ref.
export function goalLink(base: string, goal: Json | null | undefined, id: unknown): string {
  return consoleLink(base, `goal&goal=${addressOf(goal, id)}`)
}

// A plan's screen in the console, by its ref.
export function planLink(base: string, plan: Json | null | undefined, id: unknown): string {
  return consoleLink(base, `plan&plan=${addressOf(plan, id)}`)
}

// WHERE A GOAL IN HISTORY IS DELETED: the console's Goals on History, the goal's row and its Delete… sheet, where the
// owner still types the number. A console without the route ignores what it does not know and lands on Goals.
export function deleteLink(base: string, goal: number, ref: string | null = null): string {
  return consoleLink(base, `goals&tab=history&goal=${encodeURIComponent(ref ?? String(goal))}&sheet=delete`)
}

// "alice-host" from https://alice-host.example.ts.net: the name the owner knows the machine by.
export function hostName(base: string): string {
  const match = /^[a-z]+:\/\/([^./:]+)/i.exec(base)

  return match?.[1] ?? base
}

// "goal G-SRQ1A", or "goal 11" from a Terylon older than refs: what a question or an event is about.
export function subjectLabel(subject: string, ref: string | null = null): string {
  const match = /^(goal|story|plan)\/(\d+)$/.exec(subject)

  if (match === null) {
    return subject
  }

  const noun = match[1] ?? 'story'

  return `${noun} ${ref ?? match[2]}`
}

// An estimate the glossary says, or none: a plan of $0 or none estimated says only that it waits, never "~$0".
export function estimateOf(value: unknown): string | null {
  const estimated = number(value)

  return estimated === null || estimated <= 0 ? null : words.estimate(estimated)
}

export function questionItems(briefing: Json): PaneQuestionItem[] {
  return list(briefing.questionsOpen).map(question => {
    const subject = text(question.subject) ?? ''
    const ref = text(question.subjectRef)

    return {
      id: number(question.id) ?? 0,
      about: text(question.about) ?? subjectLabel(subject, ref),
      subject,
      subjectRef: ref,
      subjectLabel: subjectLabel(subject, ref),
      text: text(question.text) ?? '',
      askedAt: text(question.askedAt),
    }
  })
}

export function waitingItems(briefing: Json, base: string): PaneWaitingItem[] {
  const items: PaneWaitingItem[] = []

  for (const question of questionItems(briefing)) {
    // A QUESTION BY ITS SUBJECT'S REF where Terylon names one; else by what it is about, as before refs.
    const ref = question.subjectRef ?? null

    items.push({
      kind: 'question',
      key: `question-${question.id}`,
      target: question.id,
      ref,
      title: ref === null ? `${question.about} — ${firstLine(question.text)}` : firstLine(question.text),
      detail: question.text,
      console: consoleLink(base, `question&question=${question.id}`),
      goal: null,
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
        ref: refOf(story, id),
        title: text(story.title) ?? '',
        detail: COPY.verifiedAccept,
        console: storyLink(base, 'story', story, id),
        goal: number(story.goal),
      })
      continue
    }

    items.push({
      kind: 'merge',
      key: `merge-${id}`,
      target: id,
      ref: refOf(story, id),
      title: text(story.title) ?? '',
      detail: COPY.verifiedWaiting(text(environment?.name) ?? null),
      console: storyLink(base, 'merge', story, id),
      goal: number(story.goal),
    })
  }

  for (const plan of list(briefing.plansWaiting)) {
    const id = number(plan.id) ?? 0
    const taskVersion = taskVersionOf(plan)
    items.push({
      kind: 'plan',
      key: `plan-${id}`,
      target: id,
      ref: text(plan.ref) ?? COPY.plan(String(id)),
      title: taskVersion === null
        ? COPY.planTitle(text(plan.goalTitle) ?? '', number(plan.stories) ?? 0)
        : COPY.taskVersionTitle(taskVersion.version, taskVersion.title ?? text(plan.goalTitle) ?? ''),
      detail: taskVersion === null ? COPY.planWaiting(estimateOf(plan.estimateUsd)) : COPY.versionWaiting(taskVersion.terms),
      console: planLink(base, plan, id),
      goal: number(plan.goal),
      stories: number(plan.stories) ?? 0,
    })
  }

  for (const story of list(briefing.storiesBlocked)) {
    const id = number(story.id) ?? 0
    items.push({
      kind: 'blocked',
      key: `blocked-${id}`,
      target: id,
      ref: refOf(story, id),
      title: text(story.title) ?? '',
      detail: COPY.blocked(text(story.blockedReason) ?? '?'),
      console: storyLink(base, 'blocked', story, id),
      goal: number(story.goal),
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

export function runningItems(flight: Json, zone: Zone = 0, waiting: ReadonlySet<number> = new Set(), basis: string | null = null, at: number | null = null): PaneRunningItem[] {
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
      ? COPY.stuckSince(clock(stuck.since, zone) ?? '?')
      : isVerifying
        ? COPY.verifying
        : now >= 0
          ? `${now + 1}/${phases.length}`
          : step !== null && steps !== null
            ? `${step}/${steps}`
            : text(story.state) ?? ''
    const startedAt = Date.parse(String(story.startedAt ?? ''))

    return {
      story: number(story.id) ?? 0,
      ref: refOf(story, number(story.id) ?? 0),
      goal: number(story.goal),
      goalRef: text(story.goalRef),
      // WHAT A GOAL'S CARD SAYS BESIDE ITS REF: how long a run has gone, or the state it stands in.
      now: stuck !== null
        ? COPY.stuckSince(clock(stuck.since, zone) ?? '?')
        : story.state === 'running'
          ? COPY.storyRunningFor(at === null || Number.isNaN(startedAt) ? null : words.duration(Math.max(0, at - startedAt) / 1000))
          : COPY.stateText(String(story.state ?? '')),
      title: `${refOf(story, number(story.id) ?? 0)} ${text(story.title) ?? ''}`.trim(),
      detail: `${where} · ${costTight(spentOf(story, basis))}`,
      step: step !== null && steps !== null
        ? COPY.step(step, steps, text(progress?.current))
        : isVerifying && environment !== null
          ? COPY.verifyingIn(environment)
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
      // THE STORIES IT RUNS AFTER, by their refs where the list names them.
      const before = afterIds.map(id => refOf(stories.find(item => number(item.id) === id), id))
      const detail = held !== null
        ? COPY.held(held)
        : afterIds.length > 0
          ? COPY.after(before.join(', '))
          : hasFreeSlot ? COPY.notStarted : COPY.waitsForSlot

      return { story: number(story.id) ?? 0, title: `${refOf(story, number(story.id) ?? 0)} ${text(story.title) ?? ''}`.trim(), detail, isHeld: held !== null }
    })
}

export function doneTodayItems(stories: Json[], now: number, zone: Zone = 0, basis: string | null = null): PaneDoneItem[] {
  return stories
    .filter(story => ENDED_STATES.has(String(story.state ?? '')))
    .filter(story => words.daysBefore(story.updatedAt, now, zone) === 0)
    .map(story => ({
      story: number(story.id) ?? 0,
      title: `${refOf(story, number(story.id) ?? 0)} ${text(story.title) ?? ''}`.trim(),
      detail: COPY.mergedAt(clock(story.updatedAt, zone) ?? '?', costTight(spentOf(story, basis))),
      isAccepted: isAcceptedStory(story),
    }))
}

// AN ENDED STORY OF TERYLON'S OWN LIST was accepted, never merged: its state, its outcome or its target says so.
export function isAcceptedStory(story: Json): boolean {
  return story.state === 'accepted' || text(story.outcome) === 'accepted' || text(story.target) === 'list'
}

// WHAT THE RUNNING STORIES SPENT: unknown on the setup token, or when Terylon says a story's cost is not known.
export function spend(flight: Json, basis: string | null = null): Spent {
  return spentOfAll(list(flight.stories), basis)
}

// THE BASIS A COST IS SAID ON (Terylon S68): the briefing's costBasis, else work_in_flight's or the metrics'.
export function costBasisOf(...answers: (Json | null | undefined)[]): string | null {
  for (const answer of answers) {
    const basis = answer === null || answer === undefined ? null : text(answer.costBasis)

    if (basis !== null) {
      return basis
    }
  }

  return null
}

export function dayBudget(policy: Json | null): string | null {
  const day = number(policy?.dayBudgetUsd)

  return day === null ? null : day.toFixed(0)
}

export function header(flight: Json, policy: Json | null, basis: string | null = null): string {
  return COPY.header(costTight(spend(flight, basis)), dayBudget(policy), list(flight.stories).length, number(flight.slots) ?? 0)
}

// The leader's kill switch, from leader_status or the briefing's copy of it: { at, source, reason } or null.
export function pausedOf(leader: Json | null, isFlightPaused: boolean, zone: Zone = 0): { since: string | null; reason: string | null } | null {
  const paused = (leader?.paused ?? null) as Json | boolean | null

  if (paused !== null && typeof paused === 'object') {
    return { since: clock(paused.at, zone), reason: text(paused.reason) }
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

// "1.4 M": the run's tokens so far, as Terylon measured them: the glossary's figure without its noun.
export function tokenCount(tokens: number | null): string | null {
  return tokens === null ? null : words.tokens(tokens).replace(/ tokens?$/, '')
}

// "1.4 M tokens".
export function tokensText(tokens: number | null): string | null {
  return tokens === null ? null : words.tokens(tokens)
}

// "$2.10 of the story's $8", or on the setup token "48 k tokens · cost not known on the setup token": never a $ there.
export function storyCost(spent: Spent, budget: number | null): string {
  return spent.isKnown ? COPY.costOf(words.money(spent.usd), budget === null ? null : words.budget(budget)) : costWords(spent)
}

// Who works in the run now, at which stage, on which step, and what it has spent: read from progress, WHILE A RUN GOES,
// whatever progress names (the owner's walk of 1.5.0, #35: one running story showed Now working, the other did not).
// An agent or a stage progress does not name is said as not reported, never worked out.
function workingOf(progress: Json | null, state: string, spent: Spent & { budget: number | null }, hours: string | null): PaneWorking | null {
  if (!['running', 'dispatched'].includes(state)) {
    return null
  }

  const agent = (progress?.agent ?? null) as Json | null
  const stage = text(progress?.stage)
  const step = number(progress?.step)
  const steps = number(progress?.steps)
  const name = agent === null ? null : text(agent.name) ?? 'main'
  const others = (number(agent?.running) ?? 0) - 1
  // THE RUN'S TOKENS beside a known cost; on the setup token the story's own, which Terylon measures its spend by.
  const measured = spent.isKnown ? number(progress?.tokens) ?? spent.tokens : spent.tokens ?? number(progress?.tokens)
  const tokens = tokenCount(measured)
  // ON THE SETUP TOKEN THE TOKENS ARE THE SPEND: said once, with the phrase, and no bar against a dollar budget.
  const numbers = spent.isKnown
    ? [
        { value: words.money(spent.usd), label: spent.budget === null ? COPY.numberSpent : COPY.numberOfBudget(words.budget(spent.budget)) },
        ...(tokens === null ? [] : [{ value: tokens, label: COPY.numberTokens }]),
      ]
    : [{ value: measured === null ? COPY.numberNoTokens : words.tokens(measured), label: words.COST_NOT_KNOWN }]

  return {
    agent: name === null ? COPY.noAgent : `${name === 'main' ? COPY.mainAgent : name}${others > 0 ? ` +${others}` : ''}`,
    stage: stage === null ? COPY.noStage : COPY.stageLabel(stage),
    step: step !== null && steps !== null ? COPY.step(step, steps, text(progress?.current)) : text(progress?.current) ?? COPY.noStep,
    fraction: step !== null && steps !== null && steps > 0 ? step / steps : null,
    spend: [
      spent.isKnown ? storyCost(spent, spent.budget) : costWords({ ...spent, tokens: measured }),
      spent.isKnown ? tokensText(measured) : null,
      hours === null ? null : COPY.sinceStart(hours),
    ].filter(part => part !== null).join(' · '),
    numbers: [...numbers, ...(hours === null ? [] : [{ value: hours, label: COPY.numberSinceStart }])],
    spentUsd: spent.isKnown ? spent.usd : null,
    budgetUsd: spent.budget,
  }
}

// "1 h 9 min", "3 d 3 h": a span of milliseconds, in the glossary's two units at most.
function duration(milliseconds: number): string {
  return words.duration(Math.max(0, milliseconds) / 1000)
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

export function storyView(id: number, document: Json, inFlight: Json, question: PaneQuestionItem | null, now: number, zone: Zone = 0, basis: string | null = null): PaneStory {
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
    .map(event => ({ time: when(event.at, now, zone), actor: text(event.actor) ?? '', summary: text(event.summary) ?? text(event.type) ?? '' }))
  // THE STATE'S TONE (hooks/tones.ts): what waits on the owner's merge or acceptance purple, what ended well green, a
  // story stuck or blocked amber, a run blue, the rest quiet.
  const tone: PaneStory['stateTone'] = state === 'verified'
    ? 'merged'
    : state === 'merged' || state === 'accepted'
      ? 'success'
      : state === 'blocked' || inFlight.stuck != null
        ? 'warning'
        : isRunning
          ? 'suggestion'
          : 'subtle'
  const spent = spentOf({ costUsd: inFlight.costUsd ?? document.costUsd, costKnown: inFlight.costKnown ?? document.costKnown, tokens: inFlight.tokens ?? document.tokens, progress }, basis)

  return {
    story: id,
    phase: 'ok',
    sentence: null,
    ref: text(document.ref) ?? text(inFlight.ref),
    goalRef: text(document.goalRef) ?? text(inFlight.goalRef),
    title: `${refOf({ ref: document.ref ?? inFlight.ref }, id)} ${text(document.title) ?? text(inFlight.title) ?? ''}`.trim(),
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
    working: workingOf(progress, state, { ...spent, budget }, hours),
    fraction: step !== null && steps !== null && steps > 0 ? step / steps : null,
    cost: storyCost(spent, budget),
    phases: phasesOf({ ...document, state }, text(progress?.stage)),
    question: question === null ? null : { id: question.id, text: question.text },
    environment: environment === null || text(environment.name) === null ? null : { name: text(environment.name) ?? '', url: text(environment.url) },
    verdict: verdict === null
      ? null
      : {
          commit: (text(verdict.commit) ?? '').slice(0, 7),
          at: clock(verdict.at, zone),
          isGreen: verdict.green === true,
          checks: list(verdict.checks).map(check => ({ name: text(check.name) ?? '', isPass: check.result === 'pass', detail: text(check.detail) ?? '' })),
        },
    overrun: strings(document.overrun),
    criteria: strings(document.criteria),
    timeline,
    pullRequest: pullRequest === null || text(pullRequest.url) === null
      ? null
      : { label: number(pullRequest.id) === null ? 'PR ↗' : words.pullRequestLink(number(pullRequest.id)), url: text(pullRequest.url) ?? '' },
    workItem: workItemOf({ ...inFlight, ...document }),
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

export function goalItems(goals: Json, questions: readonly PaneQuestionItem[], repeatingOfGoal: (goal: Json) => PaneGoalItem['repeating'] = () => null): { open: PaneGoalItem[]; closed: PaneGoalItem[] } {
  const items = list(goals.goals)
    .map(goal => {
      const id = number(goal.id) ?? 0
      const counts = (goal.stories ?? {}) as Json

      return {
        id,
        title: text(goal.title) ?? refOf(goal, id),
        ref: text(goal.ref),
        priority: `P${number(goal.priority) ?? 2}`,
        state: String(goal.state ?? ''),
        questions: questions.filter(question => question.subject === `goal/${id}`).length,
        stories: Object.entries(counts).map(([state, count]) => `${count} ${COPY.stateText(state)}`).join(', '),
        counts: Object.fromEntries(Object.entries(counts).filter((entry): entry is [string, number] => typeof entry[1] === 'number')),
        target: text(goal.target),
        repeating: repeatingOfGoal(goal),
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

// "today 05:00" on the local day of `now`, "27 Oct 05:00" on another, in the host's own time zone and the glossary's
// words; "?" for a time that cannot be read, so nothing undefined or NaN reaches the drawing.
export function runDay(iso: unknown, now: number, zone: Zone = 0): string {
  const at = Date.parse(String(iso ?? ''))

  if (!Number.isFinite(at) || !Number.isFinite(now)) {
    return '?'
  }

  // EACH MOMENT IN ITS OWN OFFSET: a run from before a change of clocks keeps its hour, and today is today's.
  const days = words.daysBefore(at, now, zone)

  if (days === 0) {
    return COPY.runToday(words.clock(at, zone))
  }

  // ANOTHER DAY BY ITS DATE, never "yesterday": a run's day reads the same in a list of days.
  return `${words.date(at, zone).replace(/ \d{4}$/, '')} ${words.clock(at, zone)}`
}

// A run's state in words and its tone. A state the pane does not know is drawn as running: Terylon may add one.
function runStateOf(state: unknown): { state: string; tone: PaneRepeatingRun['tone'] } {
  switch (state) {
    case 'merged':
    case 'accepted':
      return { state: COPY.runAccepted, tone: 'success' }
    case 'verified':
      return { state: COPY.runGreenWaits, tone: 'merged' }
    case 'blocked':
      return { state: COPY.runRedWaits, tone: 'attention' }
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

// A version's terms: its budget per run, not applied on the setup token, and whether a green run accepts itself.
function termsOf(terms: Json, basis: string | null = null): string[] {
  const budget = number(terms.runBudgetUsd)

  return [
    ...(budget === null ? [] : [COPY.repeatingBudget(words.budget(budget), basis === words.SETUP_TOKEN)]),
    terms.autoAccept === true ? COPY.repeatingAcceptsItself : COPY.repeatingWaitsForYou,
  ]
}

// A REPEATING TASK'S GOAL (Terylon S43), from goal_get's `repeating`: null when the goal is not one. Every field is
// read tolerantly: a missing or odd-typed one draws less, never throws.
export function repeatingOf(goal: Json, base: string, now: number, zone: Zone = 0, basis: string | null = null): PaneRepeating | null {
  const repeating = goal.repeating

  if (repeating === null || typeof repeating !== 'object' || Array.isArray(repeating)) {
    return null
  }

  const document = repeating as Json
  const approved = document.approved !== null && typeof document.approved === 'object' ? (document.approved as Json) : null
  const waiting = document.waiting !== null && typeof document.waiting === 'object' ? (document.waiting as Json) : null
  const version = approved === null ? null : versionOf(approved.version)
  const waitingVersion = waiting === null ? null : versionOf(waiting.version)
  const id = number(goal.id)
  const summary = [
    approved === null ? COPY.repeatingNotApproved : COPY.repeatingApproved(version ?? '?'),
    ...(approved === null ? [] : termsOf(approved, basis)),
    text(document.paused) === null && document.paused !== true ? null : COPY.repeatingPaused,
    waitingVersion === null ? null : COPY.repeatingWaiting(waitingVersion),
  ]

  return {
    title: (approved === null ? null : text(approved.title)) ?? text(goal.title) ?? (id === null ? '' : refOf(goal, id)),
    summary: summary.filter((part): part is string => part !== null).join(' · '),
    runs: list(document.runs).map(run => {
      const spent = spentOf(run, basis)
      const files = Array.isArray(run.files) ? run.files.map(fileName).filter((name): name is string => name !== null) : []
      // A RUN'S COST: its dollars where known, its tokens on the setup token, nothing where Terylon sent neither.
      const cost = spent.isKnown ? (number(run.costUsd) === null ? null : words.money(spent.usd)) : spent.tokens === null ? null : words.tokens(spent.tokens)

      return {
        story: number(run.story),
        day: runDay(run.startedAt, now, zone),
        ...runStateOf(run.state),
        line: [...files, ...(cost === null ? [] : [cost])].join(' · '),
      }
    }),
    console: consoleLink(base, `waiting&task=${encodeURIComponent(text(goal.ref) ?? String(id ?? 0))}`),
  }
}

// A REPEATING TASK'S VERSION PLAN (Terylon S43): approving it approves the version each later task_run uses, and it
// carries no stories. plans_list says so with a `repeating` object; a plan with no stories while it waits is one too
// (no other plan has none then, though a withdrawn one or one sent back may list none). Its version, the task's title
// and its terms where `repeating` carries them.
export function taskVersionOf(plan: Json, basis: string | null = null): PaneTaskVersion | null {
  const repeating = plan.repeating !== null && typeof plan.repeating === 'object' && !Array.isArray(plan.repeating) ? (plan.repeating as Json) : null
  const stories = Array.isArray(plan.stories) ? plan.stories.length : number(plan.stories)
  const isSetAside = ['withdrawn', 'rethink'].includes(String(plan.state ?? ''))

  if (repeating === null && (stories !== 0 || isSetAside)) {
    return null
  }

  return {
    version: versionOf(repeating?.version ?? plan.version),
    title: repeating === null ? null : text(repeating.title),
    terms: repeating === null ? null : termsOf(repeating, basis).join(' · '),
  }
}

export function planItems(plans: Json, base: string, basis: string | null = null): PanePlan[] {
  return list(plans.plans).map(plan => {
    const id = number(plan.id) ?? 0
    const state = String(plan.state ?? '')
    const isProposed = state === 'proposed'
    const stories = list(plan.stories)
    const ids = stories.map(story => number(story.id))
    const titles = stories.map(story => text(story.title) ?? '')

    return {
      id,
      ref: text(plan.ref),
      goal: number(plan.goal) ?? 0,
      goalRef: text(plan.goalRef),
      goalTitle: text(plan.goalTitle) ?? '',
      state,
      stateText: isProposed ? COPY.planWaiting(estimateOf(plan.estimateUsd)) : COPY.stateText(state),
      isProposed,
      comment: text(plan.comment),
      stories: stories.map((story, index) => {
        const after = afterPlaces(story, ids)
        const storyEstimate = estimateOf(story.estimateUsd)

        return {
          id: number(story.id) ?? 0,
          ref: text(story.ref),
          index: index + 1,
          title: titles[index] ?? '',
          // "after <title>": the story it waits for by its title, never by a number (#35).
          detail: COPY.planStoryDetail(text(story.size) ?? '?', storyEstimate, after.length === 0 ? null : after.map(place => titles[place - 1] ?? `#${place}`).join(', ')),
          criteria: strings(story.criteria),
          after,
          size: text(story.size) ?? '?',
          estimate: storyEstimate,
        }
      }),
      console: planLink(base, plan, id),
      taskVersion: taskVersionOf(plan, basis),
    }
  })
}

// WHAT A STORY COST OVER THE 30 DAYS: its dollars, or on the setup token its tokens where metrics says them.
function metricCost(metrics: Json, basis: string | null): string {
  const isKnown = metrics.costKnown !== false && basis !== words.SETUP_TOKEN
  const tokens = number(metrics.tokensPerStory)

  return isKnown ? words.money(metrics.costPerStoryUsd) : tokens === null ? words.COST_NOT_KNOWN_TIGHT : words.tokens(tokens)
}

// THE OVERVIEW'S 30-DAY LINE: "12 stories · 22 k tokens per story". With no story there is nothing to say a story cost.
export function monthOf(metrics: Json, basis: string | null = null): string {
  const stories = number(metrics.stories) ?? 0

  return [COPY.monthStories(stories), ...(stories === 0 ? [] : [COPY.monthCost(metricCost(metrics, basis))])].join(' · ')
}

function noticeOf(notice: Json, now: number, zone: Zone): PaneNotice {
  const link = text(notice.link)

  return {
    id: number(notice.id) ?? 0,
    source: text(notice.source) ?? '',
    title: text(notice.title) ?? '',
    body: text(notice.body) ?? '',
    when: when(notice.raisedAt, now, zone),
    link: link !== null && link.startsWith('/') ? link : null,
  }
}

// The alerts among the bell's notices, for the Status tab: each with its body, which says what to do.
export function alertItems(notices: Json, now: number, zone: Zone = 0): PaneNotice[] {
  return list(notices.notices).filter(isAlert).map(notice => noticeOf(notice, now, zone))
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

export function bellView(notices: Json, leader: Json | null, metrics: Json | null, now: number, zone: Zone = 0, basis: string | null = null): PaneBell {
  const all = list(notices.notices)
  const paused = pausedOf(leader, false, zone)
  const rows: { value: string; label: string }[] = metrics === null
    ? []
    : [
        { value: String(number(metrics.stories) ?? 0), label: COPY.metricStories(number(metrics.stories) ?? 0) },
        // WITH NO STORY THERE IS NOTHING TO SAY A STORY COST.
        ...((number(metrics.stories) ?? 0) === 0 ? [] : [{ value: metricCost(metrics, basis), label: COPY.metricCost }]),
        { value: String(number(metrics.merged) ?? 0), label: COPY.metricMerged },
        { value: String(number(metrics.opened) ?? 0), label: COPY.metricOpened(number(metrics.opened) ?? 0) },
      ]

  return {
    phase: 'ok',
    sentence: null,
    unhandledCount: number(notices.unhandled) ?? all.filter(notice => notice.handledAt == null).length,
    unhandled: all.filter(notice => notice.handledAt == null).map(notice => noticeOf(notice, now, zone)),
    handled: lastOfEachKey(all.filter(notice => notice.handledAt != null)).slice(0, HANDLED_SHOWN).map(notice => noticeOf(notice, now, zone)),
    leader: paused === null ? { isPaused: false, text: COPY.leaderRuns } : { isPaused: true, text: COPY.leaderPaused(paused.since, paused.reason) },
    metrics: rows,
    handling: null,
    handleSentence: null,
  }
}

// THE MEMORY'S PROPOSALS (S27), as memory_get lists them on Terylon main aaf07e8: the pending ones only, each with its
// operations (several for a consolidation), why, and who proposed it. `by` is "web:<login>" for the owner and "brain"
// for the leader: the pane keeps only which of the two, never the login.
export function proposalItems(memory: Json, zone: Zone = 0): PaneProposal[] {
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
      storyRef: text(proposal.subjectRef) ?? text(proposal.storyRef),
      at: clock(proposal.at, zone),
    }
  })
}
