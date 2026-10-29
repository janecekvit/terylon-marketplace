// terylon-pane: the Terylon band and pane in Claude Desktop (S7, #332), built to the approved S15 canvas, page v2.
//
//   every 30 s ──▶ $.mcp.call terylon: briefing · work_in_flight · stories_list · events_since
//        │            (through callTerylon's allow-list: NEVER a gate tool)
//        ├──▶ the band above the prompt, what calls for the owner: Terylon · Waiting · Running · Queue   [Open | Fix]
//        ├──▶ the status line, the machine's health and spend: Agentic OS ● ok · $x of $y today · a/b slots
//        ├──▶ the pane, opened by the band or /terylon-pane, never by itself:
//        │      Fronta ── Čeká na tebe ──▶ question (question_answer) · story · plan
//        │        │       Běží · Ve frontě · Hotovo dnes ──▶ story ──▶ goal ──▶ story …
//        │      Cíle ──── goals_list · plans_list ──▶ goal · plan ──▶ story; a new goal is goal_add
//        │      Zvonek ── notices_list · leader_status · metrics; Mark handled is notice_handle (#360)
//        │      Paměť ─── the memory pane: memory_get; an edit is memory_propose, confirmed in the console
//        └──▶ the done-signal: $.prompt.submit once per story and verdict commit, and a toast
//   session start, away > 2 h ──▶ ONE catch-up summary, and the band says it until dismissed
//   "Přidat" ──▶ tasks_add, which becomes a plan the owner approves in the console
//
// The mod holds no rule the endpoint does not: every decision is a Link to the console.
//
// THE DRAWING is S32's (#25), on the 2.1.304 mod API: a row is one Button, type has a size and a weight, numbers
// are tabular, the phases, slots and spend are Svg (hooks/drawing.ts), the pickers are Selects, the allow rules
// Code. What 2.1.304 declares but Desktop has not proven sits behind TERYLON_PANE_PROOFS and draws 1.1.2 until named.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  PaneAct,
  PaneActOutcome,
  PaneAdd,
  PanePhase,
  PaneAnswer,
  PaneBand,
  PaneBell,
  PaneGoal,
  PaneGoals,
  PaneRepeating,
  PaneRepeatingRun,
  PaneMemory,
  PanePolicyForm,
  PaneScreen,
  PaneSnapshot,
  PaneStory,
  PaneView,
} from '../types'

import { COPY } from './copy'
import { CHIP_BACKGROUND, CHIP_DOT, CHIP_WORD, NARROW_COLUMNS, STEPPER_COLUMNS, dots, meter, phaseGlyph, planChain, planOrder, proofsOf, segments, slotsGauge, spendBar, splitHash, stepper } from './drawing'
import type { Picture, Proofs } from './drawing'
import { ALERT_SOURCES, alertCount, healthLine, stateWord } from './health'
import type { Health } from './health'
import { MISSING_SERVER, NEEDS_TEXT, NOT_ALLOWED, SERVER_CANDIDATES, TEXT_LIMITS, actArguments, allowRules, assertPaneTool, isSendable, readResult } from './terylon'
import type { TerylonAnswer } from './terylon'
import {
  alertItems,
  bellView,
  clock,
  consoleLink,
  dayBudget,
  doneTodayItems,
  filesOf,
  firstLine,
  goalItems,
  header,
  hostName,
  isListStory,
  isRepositoryTarget,
  list,
  number,
  pausedOf,
  planItems,
  policyArguments,
  policyChanges,
  policyFieldLabel,
  policyProblems,
  policyRows,
  policyValue,
  POLICY_FIELDS,
  proposalItems,
  questionChoices,
  questionItems,
  queuedItems,
  repeatingOf,
  runningItems,
  spend,
  storyView,
  text,
  waitingItems,
} from './queue'
import {
  CATCH_UP_AFTER_MS,
  CATCH_UP_MOST_EVENTS,
  EVENTS_PAGE,
  SIGNALS_KEPT,
  candidatesFromEvents,
  candidatesFromFlight,
  catchUpSummary,
  signalFor,
  signalKey,
  verdictOf,
} from './signals'
import type { Candidate, Verdict } from './signals'

type Json = Record<string, unknown>

// The pane's id: ONE pane, the memory one of its tabs. No command the mod registers shares a skill's name: the skill would win (a node test holds it).
export const PANE = 'terylon'

// The mod's version, said on the Status tab: a node test holds it to plugin.json.
export const MOD_VERSION = '1.10.1'

// How often the pane asks Terylon, and how often it retries while Terylon does not answer.
export const POLL_MS = 30000
export const RETRY_MS = 60000

// How many criteria and timeline rows a story shows before "další N ▾".
const CRITERIA_SHOWN = 2
const TIMELINE_SHOWN = 4

// HOW LONG A SCREEN'S LOAD MAY TAKE before it is said as its error: under Desktop's own 10 s bound on a press
// (`ui.press: … did not answer within 10000ms`), so the error is written while the press is still answered.
const LOAD_BOUND_MILLISECONDS = 8000

// HOW LONG THE SAME PROMPT IS NOT POSTED AGAIN: the operator's walk of 1.1.1 found question 22 posted into the
// chat twice from one screen.
const PROMPT_REPEAT_MILLISECONDS = 60000

// What the store keeps across sessions: where the pane last read the events, when, and what it signalled.
const STORE_LAST_SEQ = 'lastSeq'
const STORE_LAST_SEEN_AT = 'lastSeenAt'
const STORE_SIGNALLED = 'signalled'

const EMPTY_SNAPSHOT: PaneSnapshot = {
  connection: 'connecting',
  problem: null,
  fetchedAt: null,
  failingSince: null,
  header: '',
  runningUsd: '0.00',
  dayBudget: null,
  slots: 0,
  slotsUsed: 0,
  paused: null,
  pausedSince: null,
  notices: 0,
  alerts: 0,
  alertNotices: [],
  server: null,
  waiting: [],
  running: [],
  queued: [],
  doneToday: [],
  questions: [],
}

const QUEUE: PaneScreen = { screen: 'queue' }

const EMPTY_ADD: PaneAdd = { phase: 'form', title: '', criteria: '', goal: '', after: '', size: 'M', files: '', goals: [], repositoryGoals: [], stories: [], sentence: null, link: null, problem: null, sent: null }

const EMPTY_MEMORY: PaneMemory = { phase: 'loading', files: [], rules: [], pending: 0, proposals: [], edit: null, sentence: null, proposed: [] }

const NO_ACT: PaneAct = { open: null, text: '', busy: null, outcome: null }

const EMPTY_POLICY_FORM: PanePolicyForm = { isEditing: false, values: {} }

// A new goal goes to Terylon's own list at priority 2 unless the owner picks otherwise: goal_add's own defaults.
const DEFAULT_PRIORITY = '2'
const OWN_LIST = 'list'

const EMPTY_GOALS: PaneGoals = { phase: 'loading', sentence: null, open: [], closed: [], plans: [], draft: '', priority: DEFAULT_PRIORITY, target: OWN_LIST, targets: [], adding: 'idle', addSentence: null, showing: 'open', closedCount: 0, closedFrom: 'list', closedPhase: 'idle', closedSentence: null }

const EMPTY_BELL: PaneBell = { phase: 'loading', sentence: null, unhandledCount: 0, unhandled: [], handled: [], leader: { isPaused: false, text: '' }, metrics: [], handling: null, handleSentence: null }

const snapshot = atom({ plugin: 'terylon-pane', key: 'snapshot' } as const, EMPTY_SNAPSHOT)
const view = atom({ plugin: 'terylon-pane', key: 'view' } as const, { stack: [QUEUE] } as PaneView)
const story = atom({ plugin: 'terylon-pane', key: 'story' } as const, null as PaneStory | null)
const add = atom({ plugin: 'terylon-pane', key: 'add' } as const, EMPTY_ADD)
const quick = atom({ plugin: 'terylon-pane', key: 'quick' } as const, '')
const band = atom({ plugin: 'terylon-pane', key: 'band' } as const, null as PaneBand)
const memory = atom({ plugin: 'terylon-pane', key: 'memory' } as const, EMPTY_MEMORY)
const answer = atom({ plugin: 'terylon-pane', key: 'answer' } as const, null as PaneAnswer | null)
const goals = atom({ plugin: 'terylon-pane', key: 'goals' } as const, EMPTY_GOALS)
const goal = atom({ plugin: 'terylon-pane', key: 'goal' } as const, null as PaneGoal | null)
const bell = atom({ plugin: 'terylon-pane', key: 'bell' } as const, EMPTY_BELL)
const open = atom({ plugin: 'terylon-pane', key: 'open' } as const, [] as string[])
const acts = atom({ plugin: 'terylon-pane', key: 'acts' } as const, {} as Record<string, PaneAct>)
const policyForm = atom({ plugin: 'terylon-pane', key: 'policyForm' } as const, EMPTY_POLICY_FORM)
const rulesAsked = atom({ plugin: 'terylon-pane', key: 'rulesAsked' } as const, false)

// What the last answers were: the module's own, lost on a reload and refilled by the next poll.
let lastFlight: Json = {}
let lastBriefing: Json = {}
let lastStories: Json[] = []
let policy: Json | null = null
let lastAttemptAt = 0
let isPolling = false
let answeringServer: string | null = null

// WHAT AN ACT JUST CHANGED, drawn at once and kept until Terylon's own answer shows the subject moved (the owner's walk
// of 1.5.0, #35): the leader takes an act before its read models catch up, so a read right after ✓ still answered the
// old state, and the card stayed one poll stale. Keyed by subject ("plan-41", "goal-3"); the state it was acted from,
// and the state it reads until Terylon's answer leaves the first. Bounded, so a lost act cannot hold a card for good.
const SETTLE_MILLISECONDS = 300000

// The states of a story that has not ended: what a goal's drop abandons (Terylon S35, #388).
const OPEN_STORY_STATES: readonly string[] = ['approved', 'dispatched', 'running', 'blocked', 'pr-open', 'verifying', 'verified']
const settled = new Map<string, { from: readonly string[]; to: string; until: number }>()
// Where each verified story is kept, as story_get said it: `list`, or its repository's target.
const storyTargets = new Map<number, string>()

// The policy just saved, laid over what policy_get answers until policy_get answers it too (#35).
let savedPolicy: { values: Json; until: number } | null = null

function settledState(key: string, state: string, now: number): string {
  const entry = settled.get(key)

  if (entry === undefined) {
    return state
  }

  if (now < entry.until && entry.from.includes(state)) {
    return entry.to
  }

  settled.delete(key)

  return state
}

// The acts whose subject's state the pane draws at once, and the states each moves it from.
function settle(tool: string, subject: number | null, now: number): void {
  if (subject === null) {
    return
  }

  const until = now + SETTLE_MILLISECONDS

  if (tool === 'plan_approve' || tool === 'plan_rethink') {
    settled.set(`plan-${subject}`, { from: ['proposed'], to: tool === 'plan_approve' ? 'approved' : 'rethink', until })
  } else if (tool === 'goal_drop') {
    settled.set(`goal-${subject}`, { from: ['open', 'active', 'planned'], to: 'dropped', until })
  }
}

// One object's values laid over another's, a nested one (the memory's bounds) merged rather than replaced.
function overlay(base: Json, values: Json): Json {
  return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(values)])].map(key => {
    const over = values[key]
    const under = base[key]

    return [key, over !== null && typeof over === 'object' && under !== null && typeof under === 'object' ? overlay(under as Json, over as Json) : over ?? under]
  }))
}

// Whether every value saved is what an answer now holds.
function holds(answer: Json, values: Json): boolean {
  return Object.entries(values).every(([key, value]) =>
    value !== null && typeof value === 'object' ? holds((answer[key] ?? {}) as Json, value as Json) : answer[key] === value)
}

// policy_get's answer with the policy just saved laid over it, until it answers that policy itself.
function policyAfterSave(answer: Json, now: number): Json {
  if (savedPolicy === null || now >= savedPolicy.until || holds(answer, savedPolicy.values)) {
    savedPolicy = null

    return answer
  }

  return overlay(answer, savedPolicy.values)
}

// Calls one of the pane's tools on whichever terylon server the session has, through the allow-list.
async function callTerylon($: EngineInterface, tool: string, args: Record<string, unknown> = {}): Promise<TerylonAnswer> {
  assertPaneTool(tool)

  let missing = 0
  let reason = ''

  for (const server of SERVER_CANDIDATES) {
    try {
      const result = readResult((await $.mcp.call(server, tool, args)) as never)
      answeringServer = server

      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      // Every failure, in the engine's own words, for `claude --debug`: the pane shows only the last one.
      $.ui.log(`terylon-pane: ${tool} on ${server} failed: ${message}`, { to: 'debug' })

      if (NOT_ALLOWED.test(message)) {
        return { kind: 'not-allowed', reason: message }
      }

      if (MISSING_SERVER.test(message)) {
        missing += 1
        continue
      }

      reason = message
      break
    }
  }

  return missing === SERVER_CANDIDATES.length ? { kind: 'no-server' } : { kind: 'unreachable', reason }
}

// What a failed call says, in one line: the leader's sentence, Terylon's refusal, or the engine's words.
function why(answered: TerylonAnswer): string {
  switch (answered.kind) {
    case 'ok':
      return text(answered.value.sentence) ?? ''
    case 'refused':
      return answered.sentence
    case 'not-allowed':
    case 'unreachable':
      return answered.reason
    default:
      return COPY.noServerTitle
  }
}

async function baseUrl($: EngineInterface): Promise<string> {
  return ((await $.env.get('TERYLON_URL')) ?? '').replace(/\/+$/, '')
}

function zoneOffset(now: number): number {
  return new Date(now).getTimezoneOffset()
}

function healthOf(current: PaneSnapshot, offset: number): Health {
  return {
    connection: current.connection,
    failingSince: current.failingSince === null ? null : clock(new Date(current.failingSince).toISOString(), offset),
    isPaused: current.paused !== null,
    alerts: current.alerts,
    runningUsd: current.runningUsd,
    dayBudget: current.dayBudget,
    slotsUsed: current.slotsUsed,
    slots: current.slots,
  }
}

// Something the owner should look at: the connection, the leader paused, an alert.
function hasProblem(current: PaneSnapshot): boolean {
  return (current.connection !== 'ok' && current.connection !== 'connecting') || current.paused !== null || current.alerts > 0
}

// THE STATUS LINE: the worst of the machine's health, or its spend when all is well.
async function showHealth($: EngineInterface): Promise<void> {
  const current = await readSnapshot($)

  $.ui.status(healthLine(healthOf(current, zoneOffset(await $.clock.now()))))
}

async function failed($: EngineInterface, answered: TerylonAnswer, tool: string, now: number): Promise<void> {
  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => {
    const failingSince = current.failingSince ?? now

    switch (answered.kind) {
      case 'no-server':
        return { ...current, connection: 'no-server', problem: null, failingSince }
      case 'not-allowed':
        return { ...current, connection: 'not-allowed', problem: answered.reason, failingSince }
      case 'unreachable':
        return { ...current, connection: 'unreachable', problem: answered.reason, failingSince }
      case 'refused':
        return answered.status === 403 || answered.status === 401
          ? { ...current, connection: 'refused', problem: `${answered.sentence} (${answered.status})`, failingSince }
          : { ...current, connection: 'error', problem: `${tool}: ${answered.status ?? ''} ${answered.sentence}`.replace(/\s+/g, ' '), failingSince }
      default:
        return current
    }
  })
  await showHealth($)
}

// One read of the queue. Returns false when Terylon did not answer as the owner's.
async function refresh($: EngineInterface): Promise<boolean> {
  const now = await $.clock.now()
  lastAttemptAt = now

  const flight = await callTerylon($, 'work_in_flight')

  if (flight.kind !== 'ok') {
    await failed($, flight, 'work_in_flight', now)
    return false
  }

  const briefing = await callTerylon($, 'briefing')

  if (briefing.kind !== 'ok') {
    await failed($, briefing, 'briefing', now)
    return false
  }

  const stories = await callTerylon($, 'stories_list')

  if (stories.kind !== 'ok') {
    await failed($, stories, 'stories_list', now)
    return false
  }

  // The bell, for the alerts the status line counts; a bell that does not answer keeps the last count.
  const notices = await callTerylon($, 'notices_list')
  const previous = await readSnapshot($)
  const alerts = notices.kind === 'ok' ? alertCount(notices.value) : previous.alerts
  const alertNotices = notices.kind === 'ok' ? alertItems(notices.value, now, zoneOffset(now)) : previous.alertNotices

  if (policy === null) {
    const answered = await callTerylon($, 'policy_get')
    policy = answered.kind === 'ok' ? policyAfterSave(answered.value, now) : null
  }

  lastFlight = flight.value
  // A PLAN THE OWNER JUST DECIDED leaves "Waiting for you" at once, whatever the briefing still lists (#35).
  lastStories = list(stories.value.stories)
  lastBriefing = {
    ...briefing.value,
    plansWaiting: list(briefing.value.plansWaiting).filter(plan => settledState(`plan-${number(plan.id) ?? 0}`, 'proposed', now) === 'proposed'),
    storiesVerified: await withTargets($, list(briefing.value.storiesVerified), lastStories),
  }

  const base = await baseUrl($)
  const offset = zoneOffset(now)
  const running = runningItems(lastFlight, offset)
  const inFlight = new Set(running.map(item => item.story))
  const paused = pausedOf((lastBriefing.leader ?? null) as Json | null, lastFlight.paused === true, offset)
  const slots = number(lastFlight.slots) ?? number(policy?.slots) ?? 0
  const queuedStories = await withHeldReasons($, lastStories, inFlight)

  await update($, snapshot, (): PaneSnapshot => ({
    connection: 'ok',
    problem: null,
    fetchedAt: now,
    failingSince: null,
    header: header(lastFlight, policy),
    runningUsd: spend(lastFlight),
    dayBudget: dayBudget(policy),
    slots,
    slotsUsed: running.length,
    paused: paused === null ? null : COPY.paused(paused.since, paused.reason),
    pausedSince: paused?.since ?? null,
    // THE BELL'S COUNT ON THE BAND (#360): what notices_list says, else the briefing's, else the last.
    notices: (notices.kind === 'ok' ? number(notices.value.unhandled) : null) ?? number(lastBriefing.unhandledNotices) ?? previous.notices,
    alerts,
    alertNotices,
    server: answeringServer,
    waiting: waitingItems(lastBriefing, base),
    running,
    queued: queuedItems(queuedStories, inFlight, paused === null && running.length < slots),
    doneToday: doneTodayItems(lastStories, now, offset),
    questions: questionItems(lastBriefing),
  }))
  await showHealth($)

  return true
}

// WHY AN APPROVED STORY HAS NOT STARTED (the owner's walk of 1.5.0, #35): story_get carries a held story's reason as
// `blockedReason` while its state stays approved ("after #12; #12 was abandoned, so order it again"). For an approved
// story stories_list gives no reason and no order for, it is read there, so the row says why rather than "waits for
// a slot". Such a story is rare; one whose read fails keeps what stories_list said.
async function withHeldReasons($: EngineInterface, stories: Json[], inFlight: ReadonlySet<number>): Promise<Json[]> {
  const read_: Json[] = []

  for (const story of stories) {
    const id = number(story.id)
    const isUnexplained = story.state === 'approved' && id !== null && !inFlight.has(id) && text(story.blockedReason) === null && !(Array.isArray(story.after) && story.after.length > 0)

    if (!isUnexplained) {
      read_.push(story)
      continue
    }

    const answered = await callTerylon($, 'story_get', { story: id })
    const reason = answered.kind === 'ok' ? text(answered.value.blockedReason) : null
    read_.push(reason === null ? story : { ...story, blockedReason: reason })
  }

  return read_
}

// WHERE A VERIFIED STORY IS KEPT (#39): a story in Terylon's own list waits for an acceptance, never a merge. The briefing
// or stories_list may say its target; otherwise story_get is read once per story, and what it says is kept for the session.
async function withTargets($: EngineInterface, verified: Json[], stories: Json[]): Promise<Json[]> {
  const read_: Json[] = []

  for (const story of verified) {
    const id = number(story.id)
    const listed = stories.find(item => number(item.id) === id)
    const named = text(story.target) ?? text(listed?.target)

    if (named !== null || id === null) {
      read_.push(named === null ? story : { ...story, target: named })
      continue
    }

    if (!storyTargets.has(id)) {
      const answered = await callTerylon($, 'story_get', { story: id })

      if (answered.kind === 'ok') {
        storyTargets.set(id, isListStory({ ...answered.value, state: 'verified' }) ? 'list' : text(answered.value.target) ?? 'repository')
      }
    }

    const target = storyTargets.get(id)
    read_.push(target === undefined ? story : { ...story, target })
  }

  return read_
}

async function signalled($: EngineInterface): Promise<string[]> {
  const kept = await $.store.get(STORE_SIGNALLED)

  return Array.isArray(kept) ? kept.filter((key): key is string => typeof key === 'string') : []
}

async function verdictFor($: EngineInterface, candidate: Candidate): Promise<Verdict | null> {
  if (candidate.kind !== 'verified') {
    return null
  }

  const answered = await callTerylon($, 'story_get', { story: candidate.story })

  return answered.kind === 'ok' ? verdictOf(answered.value) : null
}

// Reads events_since from the stored sequence, page by page, up to `most` events.
async function readEvents($: EngineInterface, since: number, most: number): Promise<{ events: Json[]; last: number; isWhole: boolean } | null> {
  const events: Json[] = []
  let from = since

  for (;;) {
    const answered = await callTerylon($, 'events_since', { since: from, limit: EVENTS_PAGE })

    if (answered.kind !== 'ok') {
      return null
    }

    const page = answered.value
    events.push(...list(page.events))
    from = number(page.last) ?? from

    if (page.gap === true || events.length > most) {
      return { events, last: number(page.head) ?? from, isWhole: false }
    }

    if (page.more !== true) {
      return { events, last: from, isWhole: true }
    }
  }
}

// THE DONE-SIGNAL: one prompt per story and verdict commit, posted when the session is idle.
async function postSignals($: EngineInterface, candidates: Candidate[]): Promise<void> {
  const done = await signalled($)

  for (const candidate of candidates) {
    const verdict = await verdictFor($, candidate)
    const key = signalKey(candidate, verdict)

    if (done.includes(key)) {
      continue
    }

    const signal = signalFor(candidate, verdict)
    done.push(key)
    await $.store.set(STORE_SIGNALLED, done.slice(-SIGNALS_KEPT))
    await $.prompt.submit({ text: signal.prompt })
    $.ui.toast(signal.toast)
  }
}

async function markSignalled($: EngineInterface, candidates: Candidate[]): Promise<void> {
  const done = await signalled($)

  for (const candidate of candidates) {
    done.push(signalKey(candidate, await verdictFor($, candidate)))
  }

  await $.store.set(STORE_SIGNALLED, done.slice(-SIGNALS_KEPT))
}

// One tick: the queue, then what moved since the last look.
async function tick($: EngineInterface, isStart: boolean): Promise<void> {
  if (isPolling) {
    return
  }

  isPolling = true

  try {
    const now = await $.clock.now()
    const connection = (await readSnapshot($)).connection

    if (!isStart && connection === 'unreachable' && now - lastAttemptAt < RETRY_MS) {
      return
    }

    if (!(await refresh($))) {
      return
    }

    const lastSeq = number(await $.store.get(STORE_LAST_SEQ))
    const lastSeenAt = number(await $.store.get(STORE_LAST_SEEN_AT))

    if (lastSeq === null) {
      // The first look ever: start from now, and tell nothing of the past.
      const head = await callTerylon($, 'events_since', { since: 0, limit: 1 })

      if (head.kind === 'ok') {
        await $.store.set(STORE_LAST_SEQ, number(head.value.head) ?? number(head.value.last) ?? 0)
        await $.store.set(STORE_LAST_SEEN_AT, now)
      }

      return
    }

    const awayMs = lastSeenAt === null ? 0 : now - lastSeenAt
    const isCatchUp = isStart && awayMs > CATCH_UP_AFTER_MS
    const read_ = await readEvents($, lastSeq, CATCH_UP_MOST_EVENTS)

    if (read_ === null) {
      return
    }

    const base = await baseUrl($)
    const candidates = [...candidatesFromEvents(read_.events), ...candidatesFromFlight(lastFlight)]

    if (!read_.isWhole) {
      // Too far behind for a whole summary: say so, link the console, tell nothing piecemeal.
      await markSignalled($, candidates)
      await update($, band, (): PaneBand => ({ text: `${COPY.tooFarHeading} · ${COPY.tooFarBody(String(CATCH_UP_MOST_EVENTS))}`, link: consoleLink(base, 'history'), isAlert: true }))
    } else if (isCatchUp) {
      // Back after a long time away: ONE summary, the gap's signals inside it.
      const summary = catchUpSummary({ awayMs, events: read_.events, briefing: lastBriefing, flight: lastFlight, policy })
      await markSignalled($, candidates)
      await $.prompt.submit({ text: summary.prompt })
      await update($, band, (): PaneBand => ({ text: summary.band, link: consoleLink(base, 'waiting'), isAlert: false }))
    } else {
      await postSignals($, candidates)
    }

    await $.store.set(STORE_LAST_SEQ, read_.last)
    await $.store.set(STORE_LAST_SEEN_AT, now)
  } finally {
    isPolling = false
  }
}

// A value the host kept from an earlier version of the mod, across a reload, may lack what this one draws.
async function readSnapshot($: EngineInterface): Promise<PaneSnapshot> {
  return { ...EMPTY_SNAPSHOT, ...(await read($, snapshot)) }
}

async function readMemory($: EngineInterface): Promise<PaneMemory> {
  return { ...EMPTY_MEMORY, ...(await read($, memory)) }
}

async function readGoals($: EngineInterface): Promise<PaneGoals> {
  return { ...EMPTY_GOALS, ...(await read($, goals)) }
}

async function readBell($: EngineInterface): Promise<PaneBell> {
  return { ...EMPTY_BELL, ...(await read($, bell)) }
}

// The stepper's short labels: a list story's last phase is Accept, never Merge (#39).
function shortLabels(phases: readonly { label: string }[]): readonly string[] {
  return phases.map(phase => COPY.phaseShort(phase.label))
}

async function readAdd($: EngineInterface): Promise<PaneAdd> {
  return { ...EMPTY_ADD, ...(await read($, add)) }
}

// A SCREEN'S LOAD IS TOTAL (the operator's walk of 1.1.1: Goals and Bell sat on "Loading…" for good): whatever
// it throws, and whatever does not answer within the bound, ends as the screen's error with its reason — never
// a "Loading…" nothing will ever replace.
async function bounded($: EngineInterface, what: string, work: () => Promise<void>, fail: (sentence: string) => Promise<void>): Promise<void> {
  const timedOut = new Promise<string>(resolve => {
    $.clock.after(LOAD_BOUND_MILLISECONDS, () => resolve(COPY.loadTimedOut(LOAD_BOUND_MILLISECONDS / 1000)))
  })
  const finished = work().then(
    (): null => null,
    (error: unknown): string => (error instanceof Error ? error.message : String(error)),
  )
  const outcome = await Promise.race([finished, timedOut])

  if (outcome !== null) {
    $.ui.log(`terylon-pane: loading ${what} failed: ${outcome}`, { to: 'debug' })
    await fail(outcome)
  }
}

// THE PANE'S OWN PROMPTS, ONCE: the same text is not posted again within a minute, however often it is pressed.
const postedAt = new Map<string, number>()
async function postPrompt($: EngineInterface, text: string): Promise<void> {
  const now = await $.clock.now()
  const last = postedAt.get(text)

  // RECORDED BEFORE THE POST, so a second press — a double click included — finds it and posts nothing.
  if (last !== undefined && now - last < PROMPT_REPEAT_MILLISECONDS) {
    return
  }

  postedAt.set(text, now)
  await $.prompt.submit({ text })
}

function stackOf(value: PaneView): PaneScreen[] {
  return Array.isArray(value.stack) && value.stack.length > 0 ? value.stack : [QUEUE]
}

// NAVIGATION: a stack of screens. A tab starts it over, a row pushes, ‹ pops back to where the owner came from.
async function show($: EngineInterface, screen: PaneScreen, isTab: boolean): Promise<void> {
  await update($, view, (current: PaneView): PaneView => ({ stack: isTab ? [screen] : [...stackOf(current), screen] }))

  // THE GOALS TAB STARTS OVER ON OPEN; ‹ back to it keeps the list the owner left.
  if (isTab && screen.screen === 'goals') {
    await update($, goals, (current: PaneGoals): PaneGoals => ({ ...EMPTY_GOALS, ...current, showing: 'open' }))
  }
  await leaveActs($)
  await load($, screen)
}

async function back($: EngineInterface): Promise<void> {
  await update($, view, (current: PaneView): PaneView => ({ stack: stackOf(current).length > 1 ? stackOf(current).slice(0, -1) : [QUEUE] }))
  await leaveActs($)

  const current = await read($, view)
  await load($, stackOf(current)[stackOf(current).length - 1] ?? QUEUE)
}

async function load($: EngineInterface, screen: PaneScreen): Promise<void> {
  switch (screen.screen) {
    case 'story':
      return openStory($, screen.story)
    case 'question':
      return openQuestion($, screen.question)
    case 'goals':
    case 'plan':
      return loadGoals($)
    case 'goal':
      return openGoal($, screen.goal)
    case 'bell':
      return loadBell($)
    case 'memory':
      return openMemory($)
    case 'status':
      return loadBell($)
    default:
      return undefined
  }
}

// The band's button and the commands: the one pane, on the tab asked for, never opened by itself.
async function openPane($: EngineInterface, screen: PaneScreen): Promise<void> {
  await update($, view, (): PaneView => ({ stack: [screen] }))
  await $.ui.open({ id: PANE, title: COPY.title })
  await load($, screen)
}

// The band's Open: the pane where the owner left it, the queue the first time; never a tab chosen for them.
async function reopenPane($: EngineInterface): Promise<void> {
  const stack = stackOf(await read($, view))

  await $.ui.open({ id: PANE, title: COPY.title })
  await load($, stack[stack.length - 1] ?? QUEUE)
}

async function toggle($: EngineInterface, key: string): Promise<void> {
  await update($, open, (current: string[]): string[] => (current.includes(key) ? current.filter(item => item !== key) : [...current, key]))
}

async function openStory($: EngineInterface, id: number): Promise<void> {
  await update($, story, (): PaneStory | null => null)

  const answered = await callTerylon($, 'story_get', { story: id })
  const now = await $.clock.now()

  // THE ROW AND THE CARD DRAW ONE ANSWER (the owner's walk of 1.5.0, #35: the queue said "3/8 · Develop" and the card,
  // seconds later, "2 of 8 · Plan"): work_in_flight is read again with the story, and the queue's running rows are
  // drawn from that same answer.
  await readFlight($, now)

  const inFlight = list(lastFlight.stories).find(item => number(item.id) === id) ?? {}
  const question = (await readSnapshot($)).questions.find(item => item.subject === `story/${id}`) ?? null

  if (answered.kind !== 'ok' && Object.keys(inFlight).length === 0) {
    await update($, story, (): PaneStory | null => ({ ...storyView(id, {}, {}, null, now, zoneOffset(now)), phase: 'error', sentence: why(answered) }))
    return
  }

  const document = answered.kind === 'ok' ? answered.value : {}
  const view_ = storyView(id, document, inFlight, question, now, zoneOffset(now))
  await update($, story, (): PaneStory | null => view_)

  // A RUNNING STORY OPENS ON "NOW WORKING" (S32): the pane moves the least that shows it, and not at all when it shows.
  if (view_.working !== null) {
    await $.ui.scroll({ to: { key: 'story-working' }, in: PANE, block: 'nearest' }).catch(() => undefined)
  }
}

// work_in_flight read again on its own: the running rows, the slots in use and the spend, from its answer. One that
// does not answer leaves the last; the next poll says why.
async function readFlight($: EngineInterface, now: number): Promise<void> {
  const flight = await callTerylon($, 'work_in_flight')

  if (flight.kind !== 'ok') {
    return
  }

  lastFlight = flight.value

  const running = runningItems(lastFlight, zoneOffset(now))

  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => ({
    ...EMPTY_SNAPSHOT,
    ...current,
    header: header(lastFlight, policy),
    runningUsd: spend(lastFlight),
    slotsUsed: running.length,
    running,
  }))
}

async function openQuestion($: EngineInterface, id: number): Promise<void> {
  await update($, answer, (): PaneAnswer | null => ({ question: id, text: '', choice: null, phase: 'form', sentence: null }))
}

// AN ANSWER IS NOT A GATE: question_answer only completes the brief; the leader takes it from there.
// ONE SEND AT A TIME, decided before the first await: two presses dispatched before the screen draws "sending" —
// a double click, or Enter and the button — both read the answer as a form, so the state alone cannot tell.
let isAnswerSending = false

// Enter hands over the field's own value: what the owner sees is sent, whether or not its last onInput arrived first.
async function sendAnswer($: EngineInterface, submitted?: string): Promise<void> {
  if (isAnswerSending) {
    return
  }

  isAnswerSending = true

  try {
    if (typeof submitted === 'string') {
      await update($, answer, (current: PaneAnswer | null): PaneAnswer | null => (current === null || current.phase === 'sending' ? current : { ...current, text: submitted }))
    }

    await sendAnswerOnce($)
  } finally {
    isAnswerSending = false
  }
}

async function sendAnswerOnce($: EngineInterface): Promise<void> {
  const form = await read($, answer)

  if (form === null || form.phase === 'sending') {
    return
  }

  // A pressed choice fills the answer, so what is sent is always what the owner sees in it.
  const reply = form.text.trim()

  if (reply === '') {
    return
  }

  await update($, answer, (current: PaneAnswer | null): PaneAnswer | null => (current === null ? null : { ...current, phase: 'sending' }))

  const answered = await callTerylon($, 'question_answer', { question: form.question, answer: reply })
  const isAccepted = answered.kind === 'ok' && answered.value.accepted === true
  const isPending = answered.kind === 'ok' && answered.value.accepted == null

  await update($, answer, (current: PaneAnswer | null): PaneAnswer | null =>
    current === null
      ? null
      : {
          ...current,
          phase: isAccepted || isPending ? 'answered' : 'refused',
          sentence: isPending ? COPY.timeout(answered.kind === 'ok' ? text(answered.value.commandId) : null) : why(answered),
        })

  if (isAccepted) {
    await refresh($)
  }
}

async function loadGoals($: EngineInterface): Promise<void> {
  // A VALUE KEPT FROM AN EARLIER VERSION OF THE MOD is replaced whole, as the memory's is; only the new goal's
  // draft and what became of it stay.
  await update($, goals, (current: PaneGoals): PaneGoals => ({
    ...EMPTY_GOALS,
    draft: typeof current?.draft === 'string' ? current.draft : '',
    priority: typeof current?.priority === 'string' ? current.priority : DEFAULT_PRIORITY,
    target: typeof current?.target === 'string' ? current.target : OWN_LIST,
    adding: current?.adding ?? 'idle',
    addSentence: typeof current?.addSentence === 'string' ? current.addSentence : null,
    // THE CLOSED GOALS ALREADY READ stay until the next press of Closed, or a closedCount that changed.
    showing: current?.showing === 'closed' ? 'closed' : 'open',
    closed: Array.isArray(current?.closed) ? current.closed : [],
    closedCount: typeof current?.closedCount === 'number' ? current.closedCount : 0,
    closedFrom: current?.closedFrom === 'terylon' ? 'terylon' : 'list',
    closedPhase: typeof current?.closedPhase === 'string' ? current.closedPhase : 'idle',
    closedSentence: typeof current?.closedSentence === 'string' ? current.closedSentence : null,
  }))
  await bounded($, 'goals', () => readGoalsFromTerylon($), sentence => update($, goals, (current: PaneGoals): PaneGoals => ({ ...EMPTY_GOALS, ...current, phase: 'error', sentence })))
}

async function readGoalsFromTerylon($: EngineInterface): Promise<void> {
  const goalsAnswer = await callTerylon($, 'goals_list')
  const plansAnswer = await callTerylon($, 'plans_list')
  const base = await baseUrl($)
  const questions = (await readSnapshot($)).questions

  if (goalsAnswer.kind !== 'ok') {
    await update($, goals, (current: PaneGoals): PaneGoals => ({ ...current, phase: 'error', sentence: why(goalsAnswer) }))
    return
  }

  // WHAT AN ACT JUST CHANGED, over what the two lists still answer (#35).
  const now = await $.clock.now()
  const goalsNow = { ...goalsAnswer.value, goals: list(goalsAnswer.value.goals).map(item => ({ ...item, state: settledState(`goal-${number(item.id) ?? 0}`, String(item.state ?? ''), now) })) }
  const plansNow = plansAnswer.kind === 'ok' ? { ...plansAnswer.value, plans: list(plansAnswer.value.plans).map(item => ({ ...item, state: settledState(`plan-${number(item.id) ?? 0}`, String(item.state ?? ''), now) })) } : {}
  const items = goalItems(goalsNow, questions)
  const plans = plansAnswer.kind === 'ok' ? planItems(plansNow, base) : []
  const targets = targetsOf(goalsAnswer.value)
  // A Terylon with S44 answers the open goals and closedCount, one without it the full list: read per answer.
  const closedCount = number(goalsAnswer.value.closedCount)

  await update($, goals, (current: PaneGoals): PaneGoals => {
    const read_ = { ...current, phase: 'ok' as const, sentence: plansAnswer.kind === 'ok' ? null : why(plansAnswer), open: items.open, plans, targets }

    // BEFORE S44: the closed goals counted and filtered here, from the full list, as before.
    if (closedCount === null) {
      return { ...read_, closed: items.closed, closedCount: items.closed.length, closedFrom: 'list', closedPhase: 'ok', closedSentence: null }
    }

    // AFTER S44: what a press of Closed read is kept while closedCount says the same; never read again from here.
    const isKept = current.closedFrom === 'terylon' && current.closedCount === closedCount && current.closedPhase !== 'idle'

    return isKept
      ? { ...read_, closedCount, closedFrom: 'terylon' }
      : { ...read_, closed: [], closedCount, closedFrom: 'terylon', closedPhase: current.showing === 'closed' && closedCount > 0 ? 'changed' : 'idle', closedSentence: null }
  })
}

// OPEN OR CLOSED, PRESSED. With S44 a press of Closed reads the closed goals, and nothing else ever does.
async function showGoals($: EngineInterface, showing: 'open' | 'closed'): Promise<void> {
  await update($, goals, (current: PaneGoals): PaneGoals => ({ ...current, showing }))

  const current = await readGoals($)

  if (showing === 'open' || current.closedFrom !== 'terylon' || current.closedPhase === 'loading') {
    return
  }

  // NOTHING CLOSED, SAID BY closedCount: nothing to read.
  if (current.closedCount === 0) {
    await update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, closed: [], closedPhase: 'ok', closedSentence: null }))
    return
  }

  await update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, closedPhase: 'loading', closedSentence: null }))
  await bounded($, 'closed goals', () => readClosedGoals($), sentence => update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, closedPhase: 'error', closedSentence: sentence })))
}

async function readClosedGoals($: EngineInterface): Promise<void> {
  const answered = await callTerylon($, 'goals_list', { closed: true })

  if (answered.kind !== 'ok') {
    await update($, goals, (current: PaneGoals): PaneGoals => ({ ...current, closedPhase: 'error', closedSentence: why(answered) }))
    return
  }

  const now = await $.clock.now()
  const questions = (await readSnapshot($)).questions
  const closedNow = { ...answered.value, goals: list(answered.value.goals).map(item => ({ ...item, state: settledState(`goal-${number(item.id) ?? 0}`, String(item.state ?? ''), now) })) }

  await update($, goals, (current: PaneGoals): PaneGoals => ({ ...current, closed: goalItems(closedNow, questions).closed, closedPhase: 'ok', closedSentence: null }))
}

// WHERE A GOAL CAN LAND: Terylon's own list, then every repository target goals_list shows, each once.
function targetsOf(answer: Json): { value: string; label: string }[] {
  const named = [
    ...(Array.isArray(answer.targets) ? answer.targets : []),
    ...list(answer.goals).map(item => item.target),
  ].filter((target): target is string => typeof target === 'string' && target.trim() !== '' && target !== OWN_LIST)

  return [{ value: OWN_LIST, label: COPY.ownList }, ...[...new Set(named)].map(target => ({ value: target, label: target }))]
}

// A NEW GOAL: goal_add with its priority and target; the leader breaks it into a plan that waits for the owner in
// the console.
async function addGoal($: EngineInterface): Promise<void> {
  const form = await readGoals($)
  const title = form.draft.trim()

  if (title === '') {
    return
  }

  await update($, goals, (current: PaneGoals): PaneGoals => ({ ...current, adding: 'sending', addSentence: null }))

  const priority = Number(form.priority)
  const answered = await callTerylon($, 'goal_add', { title, priority: Number.isInteger(priority) && priority >= 1 && priority <= 4 ? priority : Number(DEFAULT_PRIORITY), target: form.target === '' ? OWN_LIST : form.target })
  const isAccepted = answered.kind === 'ok' && answered.value.accepted !== false

  await update($, goals, (current: PaneGoals): PaneGoals => ({
    ...current,
    adding: isAccepted ? 'added' : 'refused',
    addSentence: answered.kind === 'ok' && answered.value.accepted == null
      ? COPY.timeout(text(answered.value.commandId))
      : isAccepted ? COPY.goalAdded(why(answered)) : why(answered),
    draft: isAccepted ? '' : current.draft,
  }))

  if (isAccepted) {
    await loadGoals($)
  }
}

async function openGoal($: EngineInterface, id: number): Promise<void> {
  await update($, goal, (): PaneGoal | null => ({ goal: id, phase: 'loading', sentence: null, title: '', meta: '', stories: [], isOpen: false, openStories: [], repeating: null }))

  const answered = await callTerylon($, 'goal_get', { goal: id })

  if (answered.kind !== 'ok') {
    await update($, goal, (): PaneGoal | null => ({ goal: id, phase: 'error', sentence: why(answered), title: '', meta: '', stories: [], isOpen: false, openStories: [], repeating: null }))
    return
  }

  const document = answered.value
  const now = await $.clock.now()
  const state = settledState(`goal-${id}`, String(document.state ?? ''), now)
  const repeating = repeatingOf({ ...document, id }, await baseUrl($), now, zoneOffset(now))

  await update($, goal, (): PaneGoal | null => ({
    goal: id,
    phase: 'ok',
    sentence: null,
    title: text(document.title) ?? `#${id}`,
    meta: COPY.goalMeta(`P${number(document.priority) ?? 2}`, COPY.stateText(state)),
    stories: list(document.storyList).map(item => ({ id: number(item.id) ?? 0, title: `#${number(item.id) ?? 0} ${text(item.title) ?? ''}`.trim(), state: COPY.stateText(String(item.state ?? '')) })),
    isOpen: ['open', 'active'].includes(state),
    // EVERY STORY OF IT THAT HAS NOT ENDED, which a drop abandons (Terylon S35, #388), by title; a run is stopped first.
    openStories: list(document.storyList)
      .filter(item => OPEN_STORY_STATES.includes(String(item.state ?? '')))
      .map(item => ({ id: number(item.id) ?? 0, title: text(item.title) ?? '', isRunning: ['dispatched', 'running'].includes(String(item.state ?? '')) })),
    repeating,
  }))

  if ((await read($, goals)).phase !== 'ok') {
    await loadGoals($)
  }
}

async function loadBell($: EngineInterface): Promise<void> {
  await update($, bell, (): PaneBell => EMPTY_BELL)
  await bounded($, 'the bell', () => readBellFromTerylon($), sentence => update($, bell, (current: PaneBell): PaneBell => ({ ...EMPTY_BELL, ...current, phase: 'error', sentence })))
}

async function readBellFromTerylon($: EngineInterface): Promise<void> {
  const notices = await callTerylon($, 'notices_list')

  if (notices.kind !== 'ok') {
    await update($, bell, (current: PaneBell): PaneBell => ({ ...current, phase: 'error', sentence: why(notices) }))
    return
  }

  const leader = await callTerylon($, 'leader_status')
  const metrics = await callTerylon($, 'metrics')
  const now = await $.clock.now()

  await update($, bell, (): PaneBell =>
    bellView(notices.value, leader.kind === 'ok' ? leader.value : null, metrics.kind === 'ok' ? metrics.value : null, now, zoneOffset(now)))
}

// A notice marked handled from the Bell tab (#360): notice_handle is a write the owner decided is not a gate, so
// the pane sends it; the bell and the band drop it at once, and the next poll reads what Terylon published.
async function handleNotice($: EngineInterface, id: number): Promise<void> {
  await update($, bell, (current: PaneBell): PaneBell => ({ ...current, handling: id, handleSentence: null }))

  const answered = await callTerylon($, 'notice_handle', { notice: id })

  if (answered.kind !== 'ok') {
    await update($, bell, (current: PaneBell): PaneBell => ({ ...current, handling: null, handleSentence: why(answered) }))
    return
  }

  await update($, bell, (current: PaneBell): PaneBell => {
    const isListed = current.unhandled.some(notice => notice.id === id)

    return {
      ...current,
      handling: null,
      handleSentence: null,
      unhandled: current.unhandled.filter(notice => notice.id !== id),
      unhandledCount: isListed ? Math.max(0, current.unhandledCount - 1) : current.unhandledCount,
    }
  })
  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => ({ ...current, notices: Math.max(0, current.notices - 1) }))
}


// THE OWNER'S ACTS (S27, #27): each one on its subject's card, sent only when the owner presses it.
async function readActs($: EngineInterface): Promise<Record<string, PaneAct>> {
  const stored = await read($, acts)

  return stored !== null && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
}

function actOf(all: Record<string, PaneAct>, key: string): PaneAct {
  return { ...NO_ACT, ...(all[key] ?? {}) }
}

async function setAct($: EngineInterface, key: string, change: (current: PaneAct) => PaneAct): Promise<void> {
  await update($, acts, (current: Record<string, PaneAct>): Record<string, PaneAct> => {
    const all = current !== null && typeof current === 'object' && !Array.isArray(current) ? current : {}

    return { ...all, [key]: change(actOf(all, key)) }
  })
}

// Leaving a screen closes its fields and forgets its outcomes; an act Terylon is still answering is kept.
async function leaveActs($: EngineInterface): Promise<void> {
  await update($, acts, (current: Record<string, PaneAct>): Record<string, PaneAct> => {
    const all = current !== null && typeof current === 'object' && !Array.isArray(current) ? current : {}

    return Object.fromEntries(Object.entries(all).filter(([, value]) => value?.busy != null).map(([key, value]) => [key, { ...NO_ACT, busy: value.busy }]))
  })
  await update($, policyForm, (): PanePolicyForm => EMPTY_POLICY_FORM)
}

// An act's field: opened under its card by its button, closed by the same button or Cancel. Not while it is busy.
async function openAct($: EngineInterface, key: string, tool: string): Promise<void> {
  if (actsInFlight.has(key)) {
    return
  }

  await setAct($, key, current => (current.open === tool ? { ...current, open: null, text: '' } : { ...current, open: tool, text: '', outcome: null }))
}

// ONE ACT AT A TIME PER CARD, decided before the first await: a double press, or Enter and the button, would both
// read the card as idle.
const actsInFlight = new Set<string>()

async function takeAct($: EngineInterface, key: string, tool: string, subject: number | null, words: string, args?: Record<string, unknown>): Promise<void> {
  if (actsInFlight.has(key) || !isSendable(tool, subject, words)) {
    return
  }

  actsInFlight.add(key)

  try {
    await setAct($, key, current => ({ ...current, busy: tool, outcome: null }))

    const sent = args ?? actArguments(tool, subject, words)
    const answered = await callTerylon($, tool, sent)
    const outcome = outcomeOf(tool, answered)

    // ✓ IS DRAWN WITH WHAT IT CHANGED (#35): the subject's new state first, then the reads that catch up with it.
    if (outcome.kind === 'done') {
      const now = await $.clock.now()
      settle(tool, subject, now)

      if (tool === 'policy_save' && policy !== null) {
        savedPolicy = { values: sent, until: now + SETTLE_MILLISECONDS }
        policy = overlay(policy, sent)
        await update($, policyForm, (): PanePolicyForm => EMPTY_POLICY_FORM)
      }
    }

    await setAct($, key, current => ({ ...current, busy: null, outcome, open: outcome.kind === 'done' || outcome.kind === 'pending' ? null : current.open, text: outcome.kind === 'done' ? '' : current.text }))

    if (outcome.kind === 'done') {
      await update($, rulesAsked, (): boolean => false)
      await afterAct($, tool, subject)
    }
  } finally {
    actsInFlight.delete(key)
  }
}

function outcomeOf(tool: string, answered: TerylonAnswer): PaneActOutcome {
  switch (answered.kind) {
    // EVERY OWNER ACT ANSWERS {accepted, sentence, commandId, subjectId} (Terylon main aaf07e8): true the leader took
    // it, false the leader refused it, null no answer within 10 s. Refused before the leader, it is {refused, status?}.
    case 'ok':
      if (text(answered.value.refused) !== null) {
        return { kind: 'refused', tool, sentence: text(answered.value.refused), status: number(answered.value.status) }
      }

      if (answered.value.accepted === true) {
        return { kind: 'done', tool, sentence: text(answered.value.sentence), status: null }
      }

      if (answered.value.accepted === false) {
        return { kind: 'refused', tool, sentence: text(answered.value.sentence), status: null }
      }

      return { kind: 'pending', tool, sentence: COPY.actPending(text(answered.value.commandId)), status: null }
    case 'refused':
      return { kind: 'refused', tool, sentence: answered.sentence, status: answered.status }
    case 'not-allowed':
      return { kind: 'not-allowed', tool, sentence: answered.reason, status: null }
    default:
      return { kind: 'refused', tool, sentence: why(answered), status: null }
  }
}

// WHAT AN ACT CHANGED, read again: the queue always, then the screen the act was taken on.
async function afterAct($: EngineInterface, tool: string, subject: number | null): Promise<void> {
  // THE POLICY IS READ AGAIN, NEVER DROPPED FIRST (#35): with it dropped, a draw in between lost the fields' ranges and
  // said "No change yet." on a form already saved.
  if (tool === 'policy_save') {
    const answered = await callTerylon($, 'policy_get')

    if (answered.kind === 'ok') {
      policy = policyAfterSave(answered.value, await $.clock.now())
    }
  }

  await refresh($)

  if (tool.startsWith('story_') && subject !== null) {
    await openStory($, subject)
  } else if (tool.startsWith('plan_')) {
    await loadGoals($)
  } else if (tool === 'goal_drop' && subject !== null) {
    await openGoal($, subject)
    await loadGoals($)
  } else if (tool.startsWith('memory_')) {
    await openMemory($)
  }
}

// Refresh after a refusal: the outcome goes, and what Terylon says now is read again.
async function refreshAct($: EngineInterface, key: string): Promise<void> {
  await setAct($, key, current => ({ ...current, outcome: null }))
  await tick($, false)

  const stack = stackOf(await read($, view))
  await load($, stack[stack.length - 1] ?? QUEUE)
}

// How to fix: the Status tab, with every rule the pane needs.
async function howToFix($: EngineInterface): Promise<void> {
  await update($, rulesAsked, (): boolean => true)
  await show($, { screen: 'status' }, true)
}

// THE POLICY: Edit fills the form with what policy_get answered; Save sends only what changed.
async function editPolicy($: EngineInterface, isAgain: boolean): Promise<void> {
  await setAct($, 'policy', current => ({ ...current, outcome: null }))
  await update($, policyForm, (current: PanePolicyForm): PanePolicyForm => ({
    isEditing: true,
    values: isAgain && current?.values !== undefined && Object.keys(current.values).length > 0
      ? current.values
      : Object.fromEntries(POLICY_FIELDS.filter(field => policyValue(policy, field.key) !== null).map(field => [field.key, String(policyValue(policy, field.key))])),
  }))
}

async function savePolicy($: EngineInterface): Promise<void> {
  const form = { ...EMPTY_POLICY_FORM, ...(await read($, policyForm)) }
  const changes = policyChanges(policy, form.values)

  if (changes.length === 0) {
    return
  }

  // ONLY WHAT CHANGED, AND ONLY WITHIN policy_get's LIMITS: no version, no concurrency check, the last write wins
  // (Terylon main aaf07e8), and Terylon checks no argument against a schema.
  if (policyProblems(policy, form.values).length > 0) {
    return
  }

  const args = policyArguments(changes)

  await takeAct($, 'policy', 'policy_save', null, '', args)

  // A SAVE TAKEN closed the form as it was answered; a refused one keeps what was typed, for Edit again.
  const outcome = actOf(await readActs($), 'policy').outcome

  if (outcome?.kind !== 'done') {
    await update($, policyForm, (current: PanePolicyForm): PanePolicyForm => ({ ...current, isEditing: false }))
  }
}

async function openAdd($: EngineInterface, title: string): Promise<void> {
  const goalsAnswer = await callTerylon($, 'goals_list')
  const openGoals = goalsAnswer.kind === 'ok'
    ? list(goalsAnswer.value.goals).filter(item => !['done', 'closed', 'abandoned', 'dropped'].includes(String(item.state)))
    : []
  const choices = openGoals.map(item => ({ value: String(number(item.id) ?? 0), label: `${text(item.title) ?? ''}` }))
  // A GOAL OVER A REPOSITORY, by the target goals_list gives (#39): its task declares the files it will change.
  const repositoryGoals = openGoals
    .filter(item => isRepositoryTarget(item.target))
    .map(item => String(number(item.id) ?? 0))
  const stories = lastStories
    .filter(item => !['merged', 'abandoned'].includes(String(item.state)))
    .map(item => ({ value: String(number(item.id) ?? 0), label: `#${number(item.id) ?? 0} ${text(item.title) ?? ''}` }))

  await update($, add, (): PaneAdd => ({ ...EMPTY_ADD, title, goal: choices[0]?.value ?? '', goals: choices, repositoryGoals, stories: [{ value: '', label: COPY.nothingBefore }, ...stories] }))
  await update($, view, (current: PaneView): PaneView => ({ stack: [...stackOf(current), { screen: 'add' }] }))
}

// ADD A TASK: tasks_add proposes; the plan it becomes waits for the owner in the console.
async function sendTask($: EngineInterface): Promise<void> {
  const form = await readAdd($)
  const goalId = Number(form.goal)
  // THE TITLE AS ONE LINE: "What to do" is a field of several rows (#35), and a title is one line wherever it is drawn.
  const title = form.title.replace(/\s*\n\s*/g, ' ').trim()

  if (title === '' || !Number.isInteger(goalId) || goalId < 1) {
    return
  }

  // THE FILES A REPOSITORY'S TASK WILL CHANGE (#39): Terylon refuses such a task without 1 to 30, so the pane checks them
  // before it sends anything and says what is wrong under the field. A task in Terylon's own list declares none.
  const declared = form.repositoryGoals.includes(form.goal) ? filesOf(form.files) : { files: [], problem: null }

  if (declared.problem !== null) {
    await update($, add, (current: PaneAdd): PaneAdd => ({ ...current, problem: declared.problem }))
    return
  }

  await update($, add, (current: PaneAdd): PaneAdd => ({ ...current, phase: 'sending', problem: null }))

  const after = Number(form.after)
  // ONE CRITERION PER LINE where the field holds several (input-rows), by semicolons as in 1.1.2 either way; an empty
  // field sends none, and the leader writes them.
  const criteria = form.criteria.split(/[;\n]/).map(line => line.trim()).filter(line => line !== '')
  const task: Json = {
    title,
    brief: title,
    criteria,
    files: declared.files,
    size: COPY.sizes.includes(form.size) ? form.size : 'M',
  }

  if (Number.isInteger(after) && after > 0) {
    task.after = [after]
  }

  const answered = await callTerylon($, 'tasks_add', { goal: goalId, tasks: [task] })
  const base = await baseUrl($)
  const isPaused = lastFlight.paused === true

  await update($, add, (current: PaneAdd): PaneAdd => {
    if (answered.kind === 'ok' && answered.value.accepted === true) {
      return { ...current, phase: 'added', sentence: text(answered.value.sentence), link: consoleLink(base, `plan&goal=${goalId}`), sent: { title, criteria, files: declared.files } }
    }

    if (answered.kind === 'ok' && answered.value.accepted == null) {
      return isPaused
        ? { ...current, phase: 'paused', sentence: COPY.pausedAdd, link: null }
        : { ...current, phase: 'timeout', sentence: COPY.timeout(text(answered.value.commandId)), link: null }
    }

    const sentence = answered.kind === 'refused' ? answered.sentence : answered.kind === 'ok' ? text(answered.value.sentence) : COPY.addAfterReconnect

    return { ...current, phase: 'refused', sentence, link: null }
  })
}

async function openMemory($: EngineInterface): Promise<void> {
  await update($, memory, (current: PaneMemory): PaneMemory => ({ ...EMPTY_MEMORY, proposed: current.proposed ?? [] }))

  const answered = await callTerylon($, 'memory_get')

  if (answered.kind !== 'ok') {
    await update($, memory, (current: PaneMemory): PaneMemory => ({ ...current, phase: 'error', sentence: why(answered) }))
    return
  }

  // Each entry and rule as the leader stored it, in whatever language that was: only the frame around it is the pane's.
  const files = list(answered.value.files).map(file => {
    const name = text(file.file) ?? ''

    return {
      file: name,
      heading: name === 'owner' ? COPY.memoryOwner : name.replace(/^topic:/, ''),
      entries: Array.isArray(file.entries) ? file.entries.filter((entry): entry is string => typeof entry === 'string') : [],
      text: text(file.text),
    }
  })

  const rules = list(answered.value.rules).map(rule => ({
    rule: text(rule.rule) ?? '',
    enforcedBy: text(rule.enforcedBy) ?? '',
    artefact: text(rule.artefact) ?? '',
  }))

  const now = await $.clock.now()

  await update($, memory, (current: PaneMemory): PaneMemory => ({ ...current, phase: 'ok', files, rules, pending: list(answered.value.proposals).length, proposals: proposalItems(answered.value, zoneOffset(now)), edit: null, sentence: null }))
}

// A MEMORY EDIT IS A PROPOSAL: memory_propose, then the owner confirms it in the console's memory gate.
async function proposeMemory($: EngineInterface): Promise<void> {
  const state = await readMemory($)
  const edit = state.edit

  if (edit === null || edit.why.trim() === '' || (edit.action !== 'remove' && edit.text.trim() === '')) {
    return
  }

  await update($, memory, (current: PaneMemory): PaneMemory => ({ ...current, phase: 'sending' }))

  const args: Json = { action: edit.action, file: edit.file, why: edit.why.trim() }

  if (edit.action !== 'remove') {
    args.text = edit.text.trim()
  }

  if (edit.oldText !== null) {
    args.oldText = edit.oldText
  }

  const answered = await callTerylon($, 'memory_propose', args)

  await update($, memory, (current: PaneMemory): PaneMemory => {
    if (answered.kind === 'ok') {
      const shown = edit.action === 'remove' ? edit.oldText ?? '' : edit.text.trim()

      return {
        ...current,
        phase: 'proposed',
        sentence: answered.value.gate === 'checking' ? COPY.memoryChecking : COPY.memoryProposed,
        proposed: [...(current.proposed ?? []), COPY.memoryProposedItem(edit.action === 'remove' ? COPY.memoryRemove : edit.action === 'add' ? COPY.memoryAdd : COPY.memoryEdit, edit.file, shown)],
      }
    }

    const value = answered.kind === 'refused' ? answered.value : {}

    return { ...current, phase: 'refused', sentence: text(value.refusal) ?? why(answered) }
  })
}

function bar(fraction: number | null): string {
  if (fraction === null) {
    return ''
  }

  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * 20)

  return `${'█'.repeat(filled)}${'░'.repeat(20 - filled)}`
}

// The way back, named for where it leads.
function backLabel(stack: readonly PaneScreen[]): string {
  const previous = stack[stack.length - 2] ?? QUEUE

  switch (previous.screen) {
    case 'goals':
      return `‹ ${COPY.tabGoals}`
    case 'bell':
      return `‹ ${COPY.tabBell(0)}`
    case 'memory':
      return `‹ ${COPY.tabMemory}`
    case 'status':
      return `‹ ${COPY.tabStatus(false)}`
    case 'story':
      return `‹ #${previous.story}`
    case 'goal':
      return `‹ ${COPY.goalOf(previous.goal)}`
    case 'plan':
      return `‹ ${COPY.plan(previous.plan)}`
    case 'question':
      return COPY.back
    default:
      return `‹ ${COPY.tabQueue}`
  }
}

type Elements = ReturnType<EngineInterface['ui']['resolve']>

type Tone = 'text' | 'inactive' | 'subtle' | 'suggestion' | 'success' | 'warning' | 'error' | 'merged'

// HOW A SURFACE DRAWS (S32): a graphic one (Desktop, the phone, VS Code) takes Svg, type sizes and spacing steps;
// the terminal draws whole cells, no Svg, and the text fallbacks the canvas's terminal board draws. Below
// NARROW_COLUMNS the pane is the narrow dock.
// isCompact: too few columns for the stepper of eight at its size (STEPPER_COLUMNS), so it is drawn compact.
type Look = { isGraphic: boolean; isNarrow: boolean; isCompact: boolean; proofs: Proofs }

// The tint of a card: plain, waiting for the owner (warning), or a problem (error).
type CardTone = 'plain' | 'wait' | 'bad'

// A card: a round border, a heading left and a quiet hint right, then its rows. On a graphic surface the spacing is
// the surface's own steps; on the terminal, where every gap is a whole line, the rows stay together and only the
// heading stands apart. A CARD THAT WAITS FOR THE OWNER, OR A PROBLEM, IS STROKED IN ITS COLOUR AND NEVER FILLED (the
// owner's walk of 1.2.0): on a tinted fill the hints, links and chips could not be read.
function card(elements: Elements, look: Look, key: string, title: unknown, hint: unknown, children: unknown[], tone: CardTone = 'plain'): unknown {
  const { Box, Text } = elements
  const toneKey = tone === 'wait' ? 'warning' : tone === 'bad' ? 'error' : 'subtle'

  return (
    <Box
      key={key}
      flexDirection="column"
      borderStyle="round"
      borderColor={toneKey}
      paddingX={look.isGraphic ? 'md' : 1}
      paddingY={look.isGraphic ? 'sm' : 0}
      gap={look.isGraphic ? 'sm' : 1}
    >
      <Box flexDirection="row" justifyContent="space-between" gap={1}>
        {typeof title === 'string' ? heading(elements, title) : title}
        {typeof hint === 'string' ? <Text color="subtle" size="footnote">{hint}</Text> : hint ?? null}
      </Box>
      <Box flexDirection="column" gap={look.isGraphic ? 'xs' : 0}>
        {children}
      </Box>
    </Box>
  )
}

// A card's heading: semibold at the heading size, its count beside it in tabular digits and the count's colour.
function heading(elements: Elements, title: string, count?: string, countTone?: Tone, titleTone?: Tone): unknown {
  const { Text } = elements

  return (
    <Text size="heading" weight="semibold" color={titleTone}>
      {title}
      {count === undefined ? null : <Text tabular color={countTone}>{count}</Text>}
    </Text>
  )
}

// The width of a row's kind column on the terminal, in cells: every title starts under the one above it. A card
// whose kinds are wider ("orchestrator") takes its widest, up to KIND_WIDEST, past which a kind is cut.
const KIND_WIDTH = 12
const KIND_WIDEST = 14

export function kindWidth(kinds: readonly string[]): number {
  return Math.min(KIND_WIDEST, Math.max(KIND_WIDTH, ...kinds.map(kind => kind.length)))
}

// The kind as the terminal draws it, padded to its column so the titles line up, cut with … past it.
function kindCell(kind: string, width: number): string {
  return kind.length > width ? `${kind.slice(0, width - 1)}…` : kind.padEnd(width)
}

type Row = {
  key: string
  kind: string | null
  kindTone?: Tone
  kindColumn?: number
  title: string
  titleTone?: Tone
  detail?: string | null
  detailTone?: Tone
  // The console link the pointer reveals over the row's right edge (hover-reveal); without the proof it sits in the body.
  reveal?: { href: string; label: string } | null
  onPress: () => unknown
  body?: unknown
}

// ONE ROW, ONE PRESS (S32): a plain Button whose children are the kind chip, the title cut at its end, and the detail
// in tabular digits, keyed by its subject's id. The narrow dock drops the detail; the row's body holds it whole.
function row(elements: Elements, look: Look, input: Row): unknown {
  const { Box, Text, Button, Link } = elements
  const hasDetail = !look.isNarrow && input.detail !== undefined && input.detail !== null && input.detail !== ''
  const children: unknown[] = []

  // THE KIND AS A CHIP: a dot in the kind's colour, then the word in `inactive`, which reads on the chip in both themes
  // where the kind's colour does not (tests/contrast.ts). A graphic surface lays it on the theme's neutral grey with a
  // space of air inside; the terminal pads it to its column instead, and paints nothing behind it.
  if (input.kind !== null) {
    children.push(
      look.isGraphic
        ? <Text size="caption" color={CHIP_WORD} backgroundColor={CHIP_BACKGROUND}>{'\u00a0'}<Text color={input.kindTone ?? 'subtle'}>{CHIP_DOT}</Text>{`\u00a0${input.kind}\u00a0`}</Text>
        : <Text size="caption" color={CHIP_WORD}><Text color={input.kindTone ?? 'subtle'}>{CHIP_DOT}</Text>{` ${kindCell(input.kind, input.kindColumn ?? KIND_WIDTH)}`}</Text>,
      ' ',
    )
  }

  children.push(<Text color={input.titleTone} wrap="truncate-end">{input.title}</Text>)

  if (hasDetail) {
    children.push('  ', <Text size="footnote" tabular color={input.detailTone ?? 'subtle'}>{input.detail}</Text>)
  }

  // NO REVEAL OVER AN OPEN ROW (the owner's walk of 1.2.0): laid over its first line it covered the question; the open
  // row's body carries the same link.
  const isOpen = input.body !== undefined && input.body !== null
  const isRevealed = look.proofs.hoverReveal && look.isGraphic && !isOpen && input.reveal !== undefined && input.reveal !== null

  return (
    <Box key={`row-${input.key}`} flexDirection="column" hover={isRevealed ? { backgroundColor: 'userMessageBackgroundHover' } : undefined}>
      <Box flexDirection="row" minWidth={0} overflow="hidden">
        <Button key={input.key} plain onPress={input.onPress}>
          {children}
        </Button>
      </Box>
      {isRevealed && input.reveal !== undefined && input.reveal !== null && (
        // NO KEY ON THE REVEAL: a keyed Box is a hover scope of its own, and one drawn "none" is never under the pointer.
        <Box position="absolute" top={0} right={0} display="none" hover={{ display: 'flex' }}>
          <Link href={input.reveal.href} label={input.reveal.label} />
        </Box>
      )}
      {input.body ?? null}
    </Box>
  )
}

function quiet(elements: Elements, line: string): unknown {
  const { Text } = elements

  return <Text color="subtle">{line}</Text>
}

// A picture where the surface draws one, nothing where it does not: the terminal draws its own text instead.
function picture(elements: Elements, value: Picture | null, options: { isInteractive?: boolean } = {}): unknown {
  if (value === null || !('Svg' in elements)) {
    return null
  }

  const { Svg } = elements

  // ITS OWN HEIGHT, given: left to itself, the frame of an interactive Svg drew an empty band above and below it.
  return <Svg source={value.source} alt={value.alt} height={value.height} isInteractive={options.isInteractive === true ? true : undefined} />
}

// THE TERMINAL'S STEPPER: ✓ ✓ ✓ ✓ ● ○ ○ ◇, done in success, now in suggestion (warning when stuck), the rest subtle.
function phaseLine(elements: Elements, phases: readonly PanePhase[], isStuck: boolean, after: string | null): unknown {
  const { Text } = elements

  return (
    <Text wrap="truncate-end">
      {phases.map((phase, index) => (
        <Text color={phase.status === 'done' ? 'success' : phase.status === 'now' ? (isStuck ? 'warning' : 'suggestion') : 'subtle'}>{`${phaseGlyph(phase, index === phases.length - 1)} `}</Text>
      ))}
      {after === null ? null : <Text color="subtle">{` ${after}`}</Text>}
    </Text>
  )
}

// A line with a commit or an image hash in it, the hash in the monospaced face.
function withHash(elements: Elements, line: string, tone?: Tone): unknown {
  const { Text } = elements
  const parts = splitHash(line)

  return parts.hash === null
    ? <Text color={tone}>{line}</Text>
    : <Text color={tone}>{parts.before}<Text mono>{parts.hash}</Text>{parts.after}</Text>
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'terylon-pane', description: 'Opens the Terylon pane: queue, goals, bell, memory' })
    await $.command.register({ name: 'terylon', description: 'Opens the Terylon pane (the same as /terylon-pane)' })
    await $.command.register({ name: 'terylon-memory', description: "Opens the Terylon pane on the leader's memory; an edit is confirmed in the console" })
    storyTargets.clear()
    await showHealth($)
    $.clock.after(0, () => tick($, true))
    $.clock.every(POLL_MS, () => tick($, false))

    return next(e)
  })

  on('command.run', { command: 'terylon-pane' }, async $ => {
    await openPane($, QUEUE)

    return { text: 'The Terylon pane is open.' }
  })

  on('command.run', { command: 'terylon' }, async $ => {
    await openPane($, QUEUE)

    return { text: 'The Terylon pane is open.' }
  })

  on('command.run', { command: 'terylon-memory' }, async $ => {
    await openPane($, { screen: 'memory' })

    return { text: "The leader's memory is open." }
  })

  // THE BAND: one row above the prompt, what calls for the owner, and the pane's entry point. The machine's health and
  // spend are the status line's, never repeated here.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const caught = await read($, band)

    if (caught !== null) {
      return (
        <Box width="100%" flexDirection="row" justifyContent="space-between" gap={1}>
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate-end">
              <Text color="inactive">{COPY.title}</Text>
              <Text color="subtle">{' · '}</Text>
              <Text color={caught.isAlert ? 'warning' : 'inactive'}>{caught.text}</Text>
            </Text>
          </Box>
          <Box flexDirection="row" gap={1} flexShrink={0}>
            <Link href={caught.link} label={COPY.bandConsole} />
            <Button key="band-hide" label="✕" role="dismiss" plain dimColor onPress={() => update($, band, (): PaneBand => null)} />
          </Box>
        </Box>
      )
    }

    const current = await readSnapshot($)
    const now = await $.clock.now()
    const offset = zoneOffset(now)
    const stuck = current.running.filter(item => item.isStuck).length
    // THE BAND IS UNCHANGED BUT FOR ITS DIGITS (S32): tabular, so a count that moves at a poll does not shift the row.
    const pair = (name: string, value: string, color: 'inactive' | 'warning' | 'suggestion') => [
      <Text color="subtle">{` · ${name} `}</Text>,
      <Text color={color} tabular>{value}</Text>,
    ]
    const counts = [
      ...pair(COPY.bandWaiting, String(current.waiting.length), current.waiting.length > 0 ? 'warning' : 'inactive'),
      ...pair(COPY.bandRunning, String(current.running.length), current.running.length > 0 ? 'suggestion' : 'inactive'),
      ...(stuck > 0 ? [<Text color="warning" tabular>{COPY.bandStuck(stuck)}</Text>] : []),
    ]
    let segments: unknown[]
    switch (current.connection) {
      case 'connecting':
        segments = [<Text color="subtle">{` · ${COPY.connecting}`}</Text>]
        break
      case 'not-allowed':
        segments = [<Text color="subtle">{' · '}</Text>, <Text color="warning">{COPY.bandNotAllowed}</Text>, <Text color="subtle">{` · ${COPY.bandNotAllowedHint}`}</Text>]
        break
      case 'no-server':
        segments = [<Text color="subtle">{' · '}</Text>, <Text color="warning">{COPY.bandNoServer}</Text>, <Text color="subtle">{` · ${COPY.bandNoServerHint}`}</Text>]
        break
      case 'refused':
        segments = [<Text color="subtle">{' · '}</Text>, <Text color="error">{COPY.bandRefused}</Text>]
        break
      case 'error':
        segments = [<Text color="subtle">{' · '}</Text>, <Text color="error">{COPY.bandError}</Text>]
        break
      case 'unreachable':
        segments = [
          <Text color="subtle">{' · '}</Text>,
          <Text color="warning" tabular>{COPY.disconnected(current.failingSince === null ? '?' : clock(new Date(current.failingSince).toISOString(), offset) ?? '?')}</Text>,
          ...pair(COPY.bandWaiting, String(current.waiting.length), 'inactive'),
          ...pair(COPY.bandRunning, String(current.running.length), 'inactive'),
          <Text color="subtle">{` · ${COPY.bandRetrying}`}</Text>,
        ]
        break
      default:
        segments = current.paused !== null
          ? [
              ...pair(COPY.bandLeader, COPY.bandPaused(current.pausedSince), 'warning'),
              ...pair(COPY.bandWaiting, String(current.waiting.length), current.waiting.length > 0 ? 'warning' : 'inactive'),
              ...pair(COPY.bandQueued, String(current.queued.length), 'inactive'),
              ...pair(COPY.bandBell, String(current.notices), current.notices > 0 ? 'warning' : 'inactive'),
            ]
          : [
              ...counts,
              ...pair(COPY.bandQueued, String(current.queued.length), 'inactive'),
              ...pair(COPY.bandBell, String(current.notices), current.notices > 0 ? 'warning' : 'inactive'),
              ...(current.alerts > 0 ? [<Text color="warning" tabular>{COPY.bandAlerts(current.alerts)}</Text>] : []),
            ]
    }

    return (
      <Box width="100%" flexDirection="row" justifyContent="space-between" gap={1}>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">
            <Text color="inactive">{COPY.title}</Text>
            {segments}
          </Text>
        </Box>
        <Button key="band-open" label={COPY.bandOpen} plain dimColor onPress={() => reopenPane($)} />
      </Box>
    )
  })

  // THE PANE: tabs, then the screen on top of the stack.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button, Link, Markdown, Code } = elements
    const hasInput = e.surface !== 'mobile' && 'Input' in elements
    const look: Look = {
      isGraphic: e.surface !== 'terminal',
      isNarrow: e.props.bodyColumns < NARROW_COLUMNS,
      isCompact: e.props.bodyColumns < STEPPER_COLUMNS,
      proofs: proofsOf(await $.env.get('TERYLON_PANE_PROOFS')),
    }
    const current = await readSnapshot($)
    const stack = stackOf(await read($, view))
    const screen = stack[stack.length - 1] ?? QUEUE
    const tab = stack[0]?.screen ?? 'queue'
    const shown = await read($, open)
    const now = await $.clock.now()
    const base = await baseUrl($)
    const offset = zoneOffset(now)
    const at = (moment: number | null) => (moment === null ? '?' : clock(new Date(moment).toISOString(), offset) ?? '?')
    const age = current.fetchedAt === null ? null : COPY.ago(Math.max(0, Math.round((now - current.fetchedAt) / 1000)))
    const isStale = current.connection === 'unreachable'
    const stale = isStale ? COPY.stale : ''
    const go = (target: PaneScreen) => show($, target, false)
    const cardOf = (key: string, title: unknown, hint: unknown, children: unknown[], tone: CardTone = 'plain') => card(elements, look, key, title, hint, children, tone)
    const rowOf = (input: Row) => row(elements, look, input)
    const headingOf = (title: string, count?: number, countTone?: Tone, suffix = '') => heading(elements, title, count === undefined ? undefined : `${COPY.count(count)}${suffix}`, countTone)
    // THE OWNER'S ACTS (S27, #27), drawn on their subject's card. A button takes its act in one press, or opens the
    // field its act needs; while Terylon answers it reads "…ing" and the card's other buttons wait, dim, and do
    // nothing. NOTHING HERE CALLS A TOOL: only a press does.
    const allActs = await readActs($)
    const actState = (key: string) => actOf(allActs, key)
    const actButton = (key: string, tool: string, subject: number | null, options: { isPrimary?: boolean; isDanger?: boolean; opens?: boolean; isDim?: boolean; words?: string } = {}) => {
      const state = actState(key)
      const isOpen = options.opens === true && state.open === tool
      const isWaiting = (state.busy !== null && state.busy !== tool) || (state.open !== null && state.open !== tool) || options.isDim === true
      const label = state.busy === tool ? COPY.actBusy[tool] ?? tool : isOpen ? COPY.selected(COPY.actButton[tool] ?? tool) : COPY.actButton[tool] ?? tool
      const name = tool.replace(/^[a-z]+_/, '')
      const press = () => (isWaiting || state.busy !== null ? undefined : options.opens === true ? openAct($, key, tool) : takeAct($, key, tool, subject, options.words ?? state.text))

      // A DANGER ACT IS PLAIN, ITS WORD IN error (the owner's walk of 1.5.0, #35): a Button with chrome drew its children
      // in its own grey in Desktop 3.6556.2.0 (engine 2.1.308), while a plain one draws them in their colour, as each
      // row's kind dot shows.
      const isRed = options.isDanger === true && !isWaiting

      return (
        <Button key={`act-${key}-${name}`} label={label} plain={isRed ? true : undefined} variant={options.isPrimary === true && !isWaiting && state.busy === null ? 'primary' : undefined} dimColor={isWaiting ? true : undefined} onPress={press}>
          {isRed ? <Text color="error">{label}</Text> : label}
        </Button>
      )
    }
    // THE FIELD AN ACT OPENS: what to type, then the button that sends it, dim until a needed text says something.
    const actField = (key: string, tool: string, subject: number | null, field: { label: string; placeholder?: string; send?: string; isDanger?: boolean; hasCancel?: boolean; hasText?: boolean }) => {
      const state = actState(key)
      const isEmpty = state.text.trim() === ''
      const limit = TEXT_LIMITS[tool]
      const isLong = limit !== undefined && state.text.trim().length > limit
      const isDim = state.busy !== null || (NEEDS_TEXT.has(tool) && isEmpty) || isLong
      const sendLabel = state.busy === tool ? COPY.actBusy[tool] ?? tool : field.send ?? COPY.actSend[tool] ?? COPY.actButton[tool] ?? tool

      return (
        <Box key={`act-${key}-field`} flexDirection="column" gap={look.isGraphic ? 'xs' : 0}>
          {field.hasText !== false && hasInput && 'Input' in elements && (
            <elements.Input
              key={`act-${key}-text`}
              label={field.label}
              placeholder={field.placeholder}
              value={state.text}
              rows={look.proofs.inputRows ? 3 : undefined}
              onInput={value => setAct($, key, current => ({ ...current, text: value }))}
              onSubmit={() => takeAct($, key, tool, subject, state.text)}
            />
          )}
          {isLong && <Text key={`act-${key}-long`} color="error">{COPY.textTooLong(limit ?? 0, state.text.trim().length)}</Text>}
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button key={`act-${key}-send`} label={sendLabel} plain={field.isDanger === true && !isDim ? true : undefined} variant={isDim || field.isDanger === true ? undefined : 'primary'} dimColor={isDim ? true : undefined} onPress={() => (isDim ? undefined : takeAct($, key, tool, subject, state.text))}>
              {field.isDanger === true && !isDim ? <Text color="error">{sendLabel}</Text> : sendLabel}
            </Button>
            {field.hasCancel !== false && <Button key={`act-${key}-cancel`} label={COPY.actCancel} dimColor onPress={() => (state.busy === null ? setAct($, key, current => ({ ...current, open: null, text: '' })) : undefined)} />}
          </Box>
        </Box>
      )
    }
    // WHILE TERYLON ANSWERS, the card says why its other buttons wait.
    const actBusyNote = (key: string) => (actState(key).busy === null ? null : <Text key={`act-${key}-busy`} color="subtle" size="footnote">{COPY.actBusyNote}</Text>)
    // THE THREE OUTCOMES: Terylon's answer; its refusal word for word, with Refresh and the console; Claude Code's refusal.
    const actOutcome = (key: string, consoleHref: string, consoleLabel: string, extra: unknown[] = []) => {
      const outcome = actState(key).outcome

      if (outcome === null) {
        return null
      }

      if (outcome.kind === 'done' || outcome.kind === 'pending') {
        const after = outcome.kind === 'done' ? COPY.actAfter[outcome.tool] ?? null : null

        return cardOf(`act-${key}-outcome`, outcome.kind === 'done'
          ? <Text weight="semibold" color="success">{COPY.actDoneLine(COPY.actDone[outcome.tool] ?? outcome.tool, outcome.sentence)}</Text>
          : <Text weight="semibold">{outcome.sentence ?? ''}</Text>, null, [
          after === null ? null : <Text color="inactive" size="footnote">{after}</Text>,
          ...(outcome.kind === 'done' ? extra : [<Button key={`act-${key}-refresh`} label={COPY.actRefresh} variant="primary" onPress={() => refreshAct($, key)} />]),
        ])
      }

      if (outcome.kind === 'refused') {
        return cardOf(`act-${key}-outcome`, <Text size="heading" weight="semibold" color="error">{COPY.actRefused(outcome.status)}</Text>, null, [
          <Text>{outcome.sentence ?? ''}</Text>,
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            {key === 'policy'
              ? <Button key="act-policy-again" label={COPY.policyAgain} variant="primary" onPress={() => editPolicy($, true)} />
              : <Button key={`act-${key}-refresh`} label={COPY.actRefresh} variant="primary" onPress={() => refreshAct($, key)} />}
            <Link href={consoleHref} label={consoleLabel} />
          </Box>,
        ], 'bad')
      }

      return cardOf(`act-${key}-outcome`, (
        <Text size="heading" weight="semibold">
          <Text color="warning">⚠</Text>
          {' '}
          <Text>{COPY.actNotAllowed(outcome.tool)}</Text>
        </Text>
      ), null, [
        <Text color="inactive">{COPY.actNotAllowedBody(COPY.actNothing[outcome.tool] ?? '', COPY.actButton[outcome.tool] ?? outcome.tool)}</Text>,
        <Button key={`act-${key}-fix`} label={COPY.actFix} variant="primary" onPress={() => howToFix($)} />,
        <Text color="subtle" size="footnote">{COPY.actFixNote}</Text>,
      ], 'wait')
    }

    // A TAB is a Button with children: its name and a count chip in tabular digits; the selected one primary, its
    // digit a hotkey while the pane holds the keyboard. The terminal marks the selected one ●, as 1.1.2 did.
    const tabButton = (key: string, hotkey: string, name: string, target: PaneScreen, isSelected: boolean, chip: { text: string; tone: Tone } | null) => (
      <Button
        key={key}
        label={chip === null ? name : `${name}${chip.text === '⚠' ? ' ⚠' : ` · ${chip.text}`}`}
        hotkey={hotkey}
        variant={isSelected ? 'primary' : undefined}
        dimColor={!isSelected}
        onPress={() => show($, target, true)}
      >
        {!look.isGraphic && isSelected ? '● ' : ''}
        {name}
        {chip === null ? '' : ' '}
        {chip === null ? null : <Text tabular color={chip.tone}>{chip.text}</Text>}
      </Button>
    )
    const tabs = (
      <Box key="tabs" flexDirection="row" gap={look.isGraphic ? 'xs' : 1} flexWrap="wrap">
        {tabButton('tab-queue', '1', COPY.tabQueue, QUEUE, tab === 'queue', null)}
        {tabButton('tab-goals', '2', COPY.tabGoals, { screen: 'goals' }, tab === 'goals', null)}
        {tabButton('tab-bell', '3', COPY.tabBell(0), { screen: 'bell' }, tab === 'bell', current.notices > 0 ? { text: String(current.notices), tone: 'warning' } : null)}
        {tabButton('tab-memory', '4', COPY.tabMemory, { screen: 'memory' }, tab === 'memory', null)}
        {tabButton('tab-status', '5', COPY.tabStatus(false), { screen: 'status' }, tab === 'status', hasProblem(current) ? { text: '⚠', tone: 'warning' } : null)}
      </Box>
    )
    const context = (
      <Box key="context" flexDirection="row" justifyContent="space-between" gap={1}>
        <Link href={base === '' ? 'https://' : base} label={hostName(base)} />
        <Box flexDirection="row" gap={1}>
          <Text color={isStale ? 'warning' : 'subtle'} size="footnote" tabular>
            {screen.screen === 'memory'
              ? COPY.memoryContext
              : current.connection === 'connecting' ? COPY.connecting : isStale ? COPY.disconnected(at(current.failingSince)) : COPY.connected(age ?? '')}
          </Text>
          <Button key="refresh" label={COPY.refresh} dimColor onPress={async () => { await tick($, false); await load($, screen) }} />
          {screen.screen === 'queue' && current.connection === 'ok' && current.paused === null && actButton('leader', 'leader_pause', null, { opens: true })}
        </Box>
      </Box>
    )
    const footer = <Text key="footer" color="subtle" size="footnote" mono>{COPY.footer}</Text>
    // A FAULT OF THE MACHINE, for a bell row's chip: an alert source, or a notice the Status tab counts as an alert.
    const isMachineFault = (notice: { id: number; source: string }) => ALERT_SOURCES.includes(notice.source) || current.alertNotices.some(alert => alert.id === notice.id)
    const reason = (problem: string | null) => (problem === null ? null : <Text color="subtle" size="footnote" wrap="truncate-end">{COPY.reason(problem)}</Text>)
    const retry = <Button key="retry" label={COPY.retry} variant="primary" onPress={() => tick($, true)} />
    const steps = (lines: readonly string[]) => (
      <Box flexDirection="column">
        <Text bold>{COPY.howToFix}</Text>
        {lines.map((line, index) => <Text key={`step-${index}`} color="inactive">{COPY.fixStep(index + 1, line)}</Text>)}
      </Box>
    )
    // A CARD'S TITLE THAT WARNS (the owner's walk of 1.2.0): a problem's in `error`, a waiting card's in `text`, its
    // stroke carrying the warning. Amber text reads under 4.5:1 on light (tests/contrast.ts), so no card's text is amber.
    const warned = (title: string, tone: 'wait' | 'bad' = 'bad') => <Text size="heading" weight="semibold" color={tone === 'bad' ? 'error' : 'text'}>{title}</Text>


    // THE ALLOW RULES' FIX, ONE DRAWING for a refused poll and an act Claude Code refused (S27): the steps, then the
    // rules the pane needs.
    const rulesFix = (lines: readonly string[] = COPY.fixNotAllowed) => [
      steps(lines),
      // THE ALLOW RULES AS CODE (S32): json, the pane's whole own list, no gate; selected and copied by hand.
      <Code key="allow-rules" source={allowRules()} language="json" />,
    ]

    // THE STATES THAT ARE NOT A QUEUE: what happened, why, and the step that fixes it.
    let problemCard: unknown = null

    if (current.connection === 'no-server') {
      problemCard = cardOf('problem', COPY.noServerTitle, null, [
        <Text color="inactive">{COPY.noServerBody}</Text>,
        <Code source={COPY.noServerCommand} />,
        steps(COPY.fixNoServer),
        retry,
      ], 'bad')
    } else if (current.connection === 'not-allowed') {
      problemCard = cardOf('problem', warned(COPY.notAllowedTitle), COPY.notAllowedHint, [
        <Text color="inactive">{COPY.notAllowedBody}</Text>,
        reason(current.problem),
        ...rulesFix(),
        retry,
      ], 'bad')
    } else if (current.connection === 'refused') {
      problemCard = cardOf('problem', warned(COPY.refusedTitle), null, [
        <Text color="inactive">{COPY.refusedBody}</Text>,
        reason(current.problem),
        steps(COPY.fixRefused),
        retry,
      ], 'bad')
    } else if (current.connection === 'error') {
      problemCard = cardOf('problem', warned(COPY.errorTitle), null, [
        <Text color="inactive">{COPY.errorBody}</Text>,
        reason(current.problem),
        steps(COPY.fixError),
        <Link href={consoleLink(base, 'health')} label={COPY.health} />,
        retry,
      ], 'bad')
    } else if (isStale) {
      problemCard = cardOf('problem', warned(COPY.unreachableTitle), COPY.unreachableWhen(at(current.failingSince)), [
        <Text color="inactive">{COPY.unreachableBody(current.fetchedAt === null ? null : clock(new Date(current.fetchedAt).toISOString(), offset))}</Text>,
        reason(current.problem),
        steps(COPY.fixUnreachable(base)),
        <Text color="subtle">{COPY.unreachableFix}</Text>,
        retry,
      ], 'bad')
    }

    if (current.connection === 'connecting') {
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {context}
          {footer}
        </Box>
      )
    }

    // The slots and today's spend, as gauges where the surface draws Svg, as ▰▱ cells on the terminal.
    const runningUsd = Number(current.runningUsd)
    const budgetUsd = current.dayBudget === null ? null : Number(current.dayBudget)

    // THE STATUS TAB: the machine, its slots and cost, every problem with how to fix it, and where to look.
    if (screen.screen === 'status') {
      const health = healthOf(current, offset)
      const state = stateWord(health)
      const bellState = await readBell($)
      const pausedCard = current.paused === null ? null : cardOf('problem-paused', warned(COPY.pausedTitle, 'wait'), current.pausedSince === null ? null : COPY.statusSince(current.pausedSince), [
        <Text color="inactive">{current.paused}</Text>,
        steps(COPY.fixPaused),
        <Box flexDirection="row" gap={1}>{actButton('leader', 'leader_resume', null, { isPrimary: true })}</Box>,
        actBusyNote('leader'),
      ], 'wait')
      // THE RULES, ASKED FOR BY How to fix (S27): an act Claude Code refused needs the same rules as a refused poll.
      const rulesCard = current.connection === 'not-allowed' || !(await read($, rulesAsked)) ? null : cardOf('problem-rules', warned(COPY.notAllowedTitle, 'wait'), COPY.notAllowedHint, [
        <Text color="inactive">{COPY.notAllowedBody}</Text>,
        // NO Try again ON THIS CARD (#35): its last step names the act's own button instead.
        ...rulesFix(COPY.fixNotAllowedAct),
      ], 'wait')
      const alertCards = current.alertNotices.map(notice =>
        cardOf(`problem-alert-${notice.id}`, warned(notice.title), COPY.alertHint(notice.source, notice.when), [
          notice.body === '' ? null : <Text color="inactive">{notice.body}</Text>,
          <Text color="subtle">{COPY.fixAlert}</Text>,
          <Link href={notice.link === null ? consoleLink(base, 'bell') : `${base}${notice.link}`} label={COPY.bellInConsole} />,
        ], 'bad'))
      const problems = [problemCard, rulesCard, pausedCard, ...alertCards].filter(item => item !== null)
      const slotsCard = cardOf('status-slots', COPY.statusSlots, COPY.statusSlotsHint, [
        look.isGraphic ? picture(elements, slotsGauge(current.slotsUsed, current.slots, true)) : null,
        <Text tabular>{COPY.statusSlotsLine(current.slotsUsed, current.slots)}</Text>,
        current.running.length === 0 ? quiet(elements, COPY.nothingRunning) : null,
        ...current.running.map(item =>
          rowOf({
            key: `status-story-${item.story}`,
            kind: item.isStuck ? COPY.kindStuck : item.isVerifying ? COPY.verifying : COPY.kindRunning,
            kindTone: item.isStuck ? 'warning' : 'subtle',
            title: item.title,
            detail: item.detail,
            onPress: () => go({ screen: 'story', story: item.story }),
          })),
      ])
      // THE POLICY (S27): read as policy_get answered it, edited in place within its limits, saved with policy_save.
      const form = { ...EMPTY_POLICY_FORM, ...(await read($, policyForm)) }
      const rows = policyRows(policy)
      const changes = policyChanges(policy, form.values)
      const problems_ = policyProblems(policy, form.values)
      const isSavable = changes.length > 0 && problems_.length === 0
      const policyState = actState('policy')
      const isPolicyEditing = form.isEditing && hasInput && 'Input' in elements
      const policyCard = cardOf('status-policy', COPY.policy, (
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text color="subtle" size="footnote" tabular>{isPolicyEditing ? COPY.policyEditing : COPY.policyVersion(number(policy?.version), policy?.changedAt === undefined || policy?.changedAt === null ? null : clock(policy.changedAt, offset))}</Text>
          {!isPolicyEditing && hasInput && rows.length > 0 && <Button key="act-policy-edit" label={COPY.policyEdit} dimColor={policyState.busy !== null ? true : undefined} onPress={() => (policyState.busy === null ? editPolicy($, false) : undefined)} />}
        </Box>
      ), isPolicyEditing && 'Input' in elements
        ? [
            ...POLICY_FIELDS.filter(field => form.values[field.key] !== undefined).map(field => (
              <elements.Input
                key={`act-policy-field-${field.key}`}
                label={policyFieldLabel(field, policy)}
                value={form.values[field.key] ?? ''}
                onInput={value => update($, policyForm, (state: PanePolicyForm): PanePolicyForm => ({ ...EMPTY_POLICY_FORM, ...state, values: { ...state.values, [field.key]: value } }))}
                onSubmit={() => savePolicy($)}
              />
            )),
            ...problems_.map((problem, index) => <Text key={`policy-problem-${index}`} color="error">{problem}</Text>),
            <Text color="subtle" size="footnote" tabular>{COPY.policyChanges(changes)}</Text>,
            <Box flexDirection="row" gap={1}>
              <Button key="act-policy-send" label={policyState.busy === null ? COPY.actButton.policy_save ?? 'Save' : COPY.actBusy.policy_save ?? 'Saving…'} variant={!isSavable || policyState.busy !== null ? undefined : 'primary'} dimColor={!isSavable || policyState.busy !== null ? true : undefined} onPress={() => (policyState.busy === null && isSavable ? savePolicy($) : undefined)} />
              <Button key="act-policy-cancel" label={COPY.actCancel} dimColor onPress={() => (policyState.busy === null ? update($, policyForm, (): PanePolicyForm => EMPTY_POLICY_FORM) : undefined)} />
            </Box>,
            actBusyNote('policy'),
            <Text color="subtle" size="footnote">{COPY.policyNote}</Text>,
          ]
        : [
            rows.length === 0 ? quiet(elements, COPY.policyMissing) : null,
            ...rows.map((row_, index) => (
              <Box key={`policy-row-${index}`} flexDirection="row" justifyContent="space-between" gap={1}>
                <Text color="inactive">{row_.label}</Text>
                <Text tabular>{row_.value}</Text>
              </Box>
            )),
          ])
      const costCard = cardOf('status-cost', COPY.statusCost, null, [
        look.isGraphic && budgetUsd !== null ? picture(elements, spendBar(runningUsd, budgetUsd, 'wide', COPY.statusToday(current.runningUsd, current.dayBudget))) : null,
        <Text tabular>{COPY.statusToday(current.runningUsd, current.dayBudget)}</Text>,
        bellState.metrics.length === 0 ? null : (
          <Text tabular>
            <Text color="subtle">{`${COPY.statusMonth} `}</Text>
            <Text color="inactive">{bellState.metrics.map(metric => `${metric.value} ${metric.label}`).join(' · ')}</Text>
          </Text>
        ),
      ])

      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {cardOf('status-machine', <Text size="caption" color="subtle">{COPY.statusMachine.toUpperCase()}</Text>, null, [
            <Box flexDirection="row" justifyContent="space-between" gap={1}>
              <Box flexDirection="row" gap={1}>
                <Text size="title" weight="semibold" color={state.tone}>{state.word}</Text>
                {health.failingSince !== null && current.connection !== 'ok' && <Text color="subtle" tabular>{` · ${COPY.statusSince(health.failingSince)}`}</Text>}
                {current.connection === 'ok' && current.pausedSince !== null && <Text color="subtle" tabular>{` · ${COPY.statusSince(current.pausedSince)}`}</Text>}
              </Box>
              <Button key="status-refresh" label={COPY.refresh} dimColor onPress={async () => { await tick($, true); await loadBell($) }} />
            </Box>,
            <Text color="subtle" size="footnote" tabular>{COPY.statusLastAnswer(current.fetchedAt === null ? null : at(current.fetchedAt))}</Text>,
          ])}
          {look.isGraphic && !look.isNarrow
            ? (
                <Box key="status-gauges" flexDirection="row" gap="sm">
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>{slotsCard}</Box>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>{costCard}</Box>
                </Box>
              )
            : [slotsCard, costCard]}
          {cardOf('status-problems', headingOf(COPY.statusProblems, problems.length, problems.length > 0 ? 'warning' : 'inactive'), null, [
            problems.length === 0 ? quiet(elements, COPY.nothingWrong) : null,
          ])}
          {problems}
          {actOutcome('leader', consoleLink(base, 'work'), COPY.workInConsole)}
          {policyCard}
          {actOutcome('policy', consoleLink(base, 'policy'), COPY.policyInConsole)}
          {cardOf('status-diagnostics', <Text size="heading" weight="semibold" color="subtle">{COPY.statusDiagnostics}</Text>, null, [
            <Text color="subtle" mono>{COPY.diagnosticsVersion(MOD_VERSION)}</Text>,
            <Text color="subtle" mono>{COPY.diagnosticsUrl(base)}</Text>,
            <Text color="subtle" mono>{COPY.diagnosticsServer(current.server)}</Text>,
            <Text color="subtle" size="footnote">{COPY.diagnosticsDebug}</Text>,
          ])}
          {footer}
        </Box>
      )
    }

    if (problemCard !== null && !isStale) {
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {context}
          {problemCard}
          {footer}
        </Box>
      )
    }

    const backButton = <Button key="back" label={backLabel(stack)} dimColor onPress={() => back($)} />

    // ONE STORY: its phases, Now working, the run's question, environment, verdict, criteria, what happened.
    if (screen.screen === 'story') {
      const shownStory = await read($, story)

      if (shownStory === null || shownStory.story !== screen.story) {
        return (
          <Box flexDirection="column" gap={1}>
            {backButton}
            {quiet(elements, COPY.storyLoading)}
          </Box>
        )
      }

      if (shownStory.phase === 'error') {
        return (
          <Box flexDirection="column" gap={1}>
            {backButton}
            {cardOf('story-error', warned(COPY.storyError), `#${screen.story}`, [reason(shownStory.sentence)], 'bad')}
            {footer}
          </Box>
        )
      }

      const criteriaOpen = shown.includes(`criteria-${shownStory.story}`)
      const timelineOpen = shown.includes(`timeline-${shownStory.story}`)
      const done = shownStory.phases.filter(item => item.status === 'done').length
      const nowAt = shownStory.phases.findIndex(item => item.status === 'now')
      const isStuck = shownStory.stateTone === 'warning'
      const labels = shortLabels(shownStory.phases)
      const tooltips = look.proofs.svgTooltips
        ? shownStory.phases.map(item => COPY.phaseTooltip(item.label, item.role, item.status, item.status === 'now' ? shownStory.working?.step ?? null : null))
        : null
      const stateChip = (
        // THE STATE AS A CHIP: its colour on the theme's neutral grey. Filled in its own colour, 1.2.0's read as a blank block.
        <Box key="story-state" flexShrink={0} backgroundColor={look.isGraphic ? CHIP_BACKGROUND : undefined} paddingX={look.isGraphic ? 'xs' : 0}>
          <Text size="caption" color={CHIP_WORD}>{look.isGraphic ? '\u00a0' : ''}<Text color={shownStory.stateTone}>{CHIP_DOT}</Text>{` ${shownStory.stateText}${look.isGraphic ? '\u00a0' : ''}`}</Text>
        </Box>
      )
      const working = shownStory.working
      const storyKey = `story-${shownStory.story}`
      const storyAct = actState(storyKey)

      return (
        <Box flexDirection="column" gap={1}>
          <Box key="story-top" flexDirection="row" justifyContent="space-between">
            {backButton}
            {age !== null && <Text color="subtle" size="footnote" tabular>{age}</Text>}
          </Box>
          <Box key="story-head" flexDirection="column">
            <Text size="caption" color="subtle">{COPY.storyCaption(shownStory.goal)}</Text>
            <Text size="title" weight="semibold">{shownStory.title}</Text>
            <Box flexDirection="row" gap={1}>
              {stateChip}
              <Text color="subtle" size="footnote" wrap="truncate-end">
                {[
                  shownStory.running === null ? null : <Text tabular>{shownStory.running}</Text>,
                  COPY.storyAttempt(shownStory.attempt),
                  shownStory.branch === null ? null : <Text mono>{shownStory.branch}</Text>,
                  shownStory.model,
                ]
                  .filter(part => part !== null)
                  .flatMap((part, index) => (index === 0 ? [part] : [' · ', part]))}
              </Text>
            </Box>
          </Box>
          {cardOf('story-phases', COPY.phases, <Text color="subtle" size="footnote" tabular>{nowAt >= 0 || shownStory.hasStage ? COPY.phasesHint(nowAt >= 0 ? nowAt + 1 : done, shownStory.phases.length) : COPY.phasesNoStage(done, shownStory.phases.length)}</Text>, look.isGraphic
            ? [
                // THE STEPPER (S32): the Svg says no word, the labels sit under it in Text; no stage, no node is now.
                picture(elements, stepper(shownStory.phases, labels, { isStuck, tooltips, isCompact: look.isCompact }), { isInteractive: tooltips !== null }),
                // COMPACT, below STEPPER_COLUMNS (the owner's walk, a dock of about 435 px): eight labels ran together, so
                // only the phase now is named; the tooltips name the rest.
                look.isCompact
                  ? (nowAt < 0 ? null : <Text key="phase-now" size="caption" weight="semibold" color={isStuck ? 'warning' : 'suggestion'}>{shownStory.phases[nowAt]?.label ?? ''}</Text>)
                  : <Box key="phase-labels" flexDirection="row">
                  {shownStory.phases.map((item, index) => (
                    <Box key={`phase-label-${index}`} flexGrow={1} flexShrink={1} minWidth={0} width={0} justifyContent="center">
                      <Text
                        size="caption"
                        wrap="truncate-end"
                        weight={item.status === 'now' ? 'semibold' : undefined}
                        color={item.status === 'now' ? (isStuck ? 'warning' : 'suggestion') : item.status === 'done' ? 'inactive' : index === shownStory.phases.length - 1 ? 'merged' : 'subtle'}
                      >
                        {labels[index] ?? item.label}
                      </Text>
                    </Box>
                  ))}
                </Box>,
              ]
            : shownStory.phases.map((item, index) => (
                <Box key={`phase-${index}`} flexDirection="row" justifyContent="space-between" gap={1}>
                  <Text>
                    <Text color={item.status === 'done' ? 'success' : item.status === 'now' ? 'suggestion' : 'subtle'}>{`${phaseGlyph(item, index === shownStory.phases.length - 1)} `}</Text>
                    <Text bold={item.status === 'now'} color={item.status === 'next' ? 'subtle' : 'text'}>{item.label}</Text>
                    {item.role !== null && <Text color="subtle">{` · ${item.role}`}</Text>}
                  </Text>
                  <Text color="subtle" wrap="truncate-end">{item.detail}</Text>
                </Box>
              )))}
          {working !== null && (
            <Box key="story-working" flexDirection="column">
              {cardOf('story-working-card', COPY.nowWorking, COPY.nowWorkingHint(working.agent, working.stage), look.isGraphic
                ? [
                    <Text>{working.step}</Text>,
                    <Box key="working-numbers" flexDirection="row" gap="lg" flexWrap="wrap">
                      {working.numbers.map((item, index) => (
                        <Box key={`working-number-${index}`} flexDirection="column">
                          <Text size="title" weight="semibold" tabular>{item.value}</Text>
                          <Text size="footnote" color="subtle">{item.label}</Text>
                        </Box>
                      ))}
                    </Box>,
                    picture(elements, spendBar(working.spentUsd, working.budgetUsd, 'full', COPY.spendAlt(working.spentUsd.toFixed(2), (working.budgetUsd ?? 0).toFixed(0)))),
                  ]
                : [
                    <Text>{working.step}</Text>,
                    working.fraction === null ? null : <Text color="suggestion">{bar(working.fraction)}</Text>,
                    <Text color="inactive">{working.spend}</Text>,
                  ])}
            </Box>
          )}
          {/* HELD (#35): an approved story story_get says is held, with its reason, as the queue's row says it. */}
          {shownStory.heldReason !== null && shownStory.heldReason !== undefined && cardOf('story-held', COPY.heldTitle, null, [<Text color="inactive">{shownStory.heldReason}</Text>])}
          {working === null && shownStory.step !== null && cardOf('story-progress', COPY.progress, null, [
            <Text>{shownStory.step}</Text>,
            shownStory.fraction === null ? null : <Text color="suggestion">{bar(shownStory.fraction)}</Text>,
            <Text color="inactive" tabular>{shownStory.cost}</Text>,
          ])}
          {shownStory.question !== null && cardOf('story-question', warned(COPY.questionFromRun, 'wait'), COPY.waitsOnYou, [
            <Text>{shownStory.question.text}</Text>,
            <Box flexDirection="row" gap={1}>
              <Button key="story-answer" label={COPY.answer} variant="primary" onPress={() => go({ screen: 'question', question: shownStory.question?.id ?? 0 })} />
              <Link href={consoleLink(base, `question&question=${shownStory.question.id}`)} label={COPY.answerInConsole} />
            </Box>,
          ], 'wait')}
          {shownStory.environment !== null && cardOf('story-environment', COPY.environment(shownStory.environment.name), null, [
            shownStory.environment.url === null ? null : <Link href={shownStory.environment.url} label={`${shownStory.environment.url} ↗`} />,
          ])}
          {shownStory.verdict !== null && cardOf('story-verdict', <Text size="heading" weight="semibold" color={shownStory.verdict.isGreen ? 'success' : 'warning'}>{COPY.verdict}</Text>, <Text color="subtle" size="footnote" mono>{COPY.verdictHint(shownStory.verdict.commit)}</Text>, [
            ...shownStory.verdict.checks.map((check, index) => (
              <Box key={`check-${index}`} flexDirection="row" justifyContent="space-between" gap={1}>
                <Text>
                  <Text color={check.isPass ? 'success' : 'error'}>{check.isPass ? '✓ ' : '✗ '}</Text>
                  <Text>{check.name}</Text>
                </Text>
                <Text color="subtle" wrap="truncate-end" tabular>{check.detail}</Text>
              </Box>
            )),
            shownStory.overrun.length === 0 ? null : (
              <Text key="overrun">
                <Text color="warning">{`! ${COPY.overrun} `}</Text>
                <Text color="warning">{`${shownStory.overrun.length} · ${shownStory.overrun.join(', ')}`}</Text>
              </Text>
            ),
          ])}
          {shownStory.criteria.length > 0 && cardOf('story-criteria', COPY.criteria, COPY.criteriaHint(shownStory.criteria.length), [
            ...(criteriaOpen ? shownStory.criteria : shownStory.criteria.slice(0, CRITERIA_SHOWN)).map((criterion, index) => (
              <Text key={`criterion-${index}`} color="inactive" wrap={criteriaOpen ? 'wrap' : 'truncate-end'}>{`· ${criterion}`}</Text>
            )),
            shownStory.criteria.length > CRITERIA_SHOWN ? (
              <Button key="criteria-more" plain dimColor label={criteriaOpen ? COPY.less : COPY.more(shownStory.criteria.length - CRITERIA_SHOWN)} onPress={() => toggle($, `criteria-${shownStory.story}`)} />
            ) : null,
          ])}
          {shownStory.timeline.length > 0 && cardOf('story-timeline', COPY.timeline, COPY.timelineHint, [
            ...(timelineOpen ? shownStory.timeline : shownStory.timeline.slice(0, TIMELINE_SHOWN)).map((event, index) => (
              <Text key={`event-${index}`} wrap="truncate-end">
                <Text color="subtle" tabular>{`${event.time} `}</Text>
                <Text color="inactive">{`${event.actor} `}</Text>
                {withHash(elements, event.summary)}
              </Text>
            )),
            shownStory.timeline.length > TIMELINE_SHOWN ? (
              <Button key="timeline-more" plain dimColor label={timelineOpen ? COPY.less : COPY.more(shownStory.timeline.length - TIMELINE_SHOWN)} onPress={() => toggle($, `timeline-${shownStory.story}`)} />
            ) : null,
          ])}
          {/* THE STORY'S ACTS (S27), by its state, where S32 left the dashed slot for them. Merge is only ever a link. */}
          {shownStory.isBlocked && cardOf(`act-${storyKey}-blocked`, warned(COPY.blockedTitle, 'wait'), null, [
            storyAct.open === 'story_abandon'
              ? [
                  <Box key="act-blocked-buttons" flexDirection="row" gap={1} flexWrap="wrap">
                    {actButton(storyKey, 'story_unblock', screen.story, { isPrimary: true, isDim: true })}
                    {actButton(storyKey, 'story_return', screen.story, { isDim: true })}
                    {actButton(storyKey, 'story_abandon', screen.story, { isDanger: true, opens: true })}
                  </Box>,
                  actField(storyKey, 'story_abandon', screen.story, { label: COPY.whyOptional, isDanger: true }),
                  <Text color="subtle" size="footnote">{COPY.abandonNote}</Text>,
                ]
              : [
                  hasInput && 'Input' in elements ? (
                    <elements.Input
                      key={`act-${storyKey}-text`}
                      label={COPY.blockedLabel}
                      placeholder={COPY.returnPlaceholder}
                      value={storyAct.text}
                      rows={look.proofs.inputRows ? 3 : undefined}
                      onInput={value => setAct($, storyKey, current => ({ ...current, text: value }))}
                      onSubmit={() => takeAct($, storyKey, 'story_unblock', screen.story, storyAct.text)}
                    />
                  ) : null,
                  storyAct.text.trim().length > (TEXT_LIMITS.story_return ?? 0)
                    ? <Text key="act-blocked-long" color="error">{COPY.textTooLong(TEXT_LIMITS.story_return ?? 0, storyAct.text.trim().length)}</Text>
                    : null,
                  <Box key="act-blocked-buttons" flexDirection="row" gap={1} flexWrap="wrap">
                    {actButton(storyKey, 'story_unblock', screen.story, { isPrimary: true, isDim: storyAct.text.trim().length > (TEXT_LIMITS.story_unblock ?? 0) })}
                    {actButton(storyKey, 'story_return', screen.story, { isDim: storyAct.text.trim() === '' || storyAct.text.trim().length > (TEXT_LIMITS.story_return ?? 0) })}
                    {actButton(storyKey, 'story_abandon', screen.story, { isDanger: true, opens: true })}
                  </Box>,
                ],
            actBusyNote(storyKey),
          ], 'wait')}
          {actOutcome(storyKey, consoleLink(base, `work&story=${shownStory.story}`), COPY.storyInConsole)}
          <Box key="story-actions" flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
            {shownStory.isVerified && !shownStory.isList && <Link href={consoleLink(base, `merge&story=${shownStory.story}`)} label={COPY.mergeInConsole} />}
            {shownStory.isVerified && shownStory.isList && actButton(storyKey, 'story_accept', screen.story, { isPrimary: true })}
            {shownStory.isVerified && actButton(storyKey, 'story_return', screen.story, { opens: true })}
            {shownStory.canStop && actButton(storyKey, 'story_stop', screen.story)}
            {shownStory.canAbandon && actButton(storyKey, 'story_abandon', screen.story, { isDanger: true, opens: true })}
            <Button key="summarise" label={COPY.summariseInSession} onPress={() => postPrompt($, COPY.summarisePrompt(screen.story))} />
            {shownStory.goal !== null && <Button key="story-goal" label={COPY.goalOf(shownStory.goal)} dimColor onPress={() => go({ screen: 'goal', goal: shownStory.goal ?? 0 })} />}
            {shownStory.pullRequest !== null && <Link href={shownStory.pullRequest.url} label={shownStory.pullRequest.label} />}
            <Link href={consoleLink(base, `work&story=${shownStory.story}`)} label={COPY.storyInConsole} />
          </Box>
          {shownStory.isVerified && storyAct.open === 'story_return' && actField(storyKey, 'story_return', screen.story, { label: COPY.returnLabel, placeholder: COPY.returnPlaceholder })}
          {shownStory.canAbandon && storyAct.open === 'story_abandon' && actField(storyKey, 'story_abandon', screen.story, { label: COPY.whyOptional, isDanger: true })}
          {shownStory.canAbandon && storyAct.open === 'story_abandon' && <Text key="story-abandon-note" color="subtle" size="footnote">{COPY.abandonApprovedNote}</Text>}
          {shownStory.isVerified && storyAct.open === 'story_return' && storyAct.text.trim() === '' && (
            <Text key="act-return-needs" size="footnote"><Text color="warning">⚠</Text>{' '}<Text color="inactive">{COPY.returnNeedsNote}</Text></Text>
          )}
          {!shownStory.isBlocked && actBusyNote(storyKey)}
          {shownStory.isVerified && !shownStory.isList && <Text key="story-merge-note" color="subtle" size="footnote">{COPY.mergeNote(shownStory.commit)}</Text>}
          {shownStory.isVerified && shownStory.isList && <Text key="story-accept-note" color="subtle" size="footnote">{COPY.acceptNote}</Text>}
          {shownStory.canStop && <Text key="story-stop-note" color="subtle" size="footnote">{COPY.stopNote}</Text>}
          <Text key="story-note" color="subtle" size="footnote">{COPY.summariseNote}</Text>
          {footer}
        </Box>
      )
    }

    // A QUESTION OF THE LEADER'S: its choices to press, an answer to type, question_answer to send it.
    if (screen.screen === 'question') {
      const form = await read($, answer)
      const question = current.questions.find(item => item.id === screen.question) ?? null
      const index = current.questions.findIndex(item => item.id === screen.question)
      const next = current.questions.find((item, position) => position > index && item.id !== screen.question) ?? current.questions.find(item => item.id !== screen.question) ?? null

      if (form === null || form.question !== screen.question) {
        return (
          <Box flexDirection="column" gap={1}>
            {backButton}
            {quiet(elements, COPY.loading)}
          </Box>
        )
      }

      if (question === null && form.phase === 'form') {
        return (
          <Box flexDirection="column" gap={1}>
            {backButton}
            {quiet(elements, COPY.questionGone)}
            {footer}
          </Box>
        )
      }

      const choices = question === null ? [] : questionChoices(question.text)
      const about = question === null ? '' : question.about === question.subjectLabel ? question.subjectLabel : `${question.about} · ${question.subjectLabel}`

      return (
        <Box flexDirection="column" gap={1}>
          <Box key="question-top" flexDirection="row" justifyContent="space-between">
            {backButton}
            {index >= 0 && <Text color="warning" tabular>{COPY.questionOf(index + 1, current.questions.length)}</Text>}
          </Box>
          {question !== null && (
            <Box key="question" flexDirection="column" gap={look.isGraphic ? 'xs' : 0}>
              <Text size="caption" color="subtle">{COPY.questionMeta(about, clock(question.askedAt, offset))}</Text>
              {/* THE QUESTION AS MARKDOWN (S32), in the language Terylon sent it in. */}
              <Markdown key="question-text" text={question.text} />
            </Box>
          )}
          {choices.length > 0 && (
            <Box key="choices" flexDirection="column" gap={look.isGraphic ? 'xs' : 0}>
              {choices.map((choice, position) => {
                const isChosen = form.choice === choice
                const letter = /^\(([a-z])\)\s*/.exec(choice)

                // A CHOICE is a Button with its letter and its words: pressed, it only fills the answer; it sends nothing.
                return (
                  <Button
                    key={`choice-${position}`}
                    label={choice}
                    variant={isChosen ? 'primary' : undefined}
                    dimColor={!isChosen}
                    onPress={() => update($, answer, (value: PaneAnswer | null): PaneAnswer | null => (value === null ? null : { ...value, choice, text: value.text === '' || value.text === value.choice ? choice : value.text }))}
                  >
                    {!look.isGraphic && isChosen ? '● ' : ''}
                    <Text color="suggestion" weight="semibold">{letter?.[1] ?? '·'}</Text>
                    {` ${letter === null ? choice : choice.slice(letter[0].length)}`}
                  </Button>
                )
              })}
            </Box>
          )}
          {form.phase === 'form' && hasInput && 'Input' in elements ? (
            // THE ANSWER: four rows where Desktop has proven a multi-line field (input-rows), one line as 1.1.2 otherwise.
            <elements.Input
              key="answer-text"
              label={COPY.answerLabel}
              value={form.text}
              rows={look.proofs.inputRows ? 4 : undefined}
              // ONE WAY TO SEND (the owner's walk of 1.2.0): the Answer button below; the field names no second one.
              submitLabel={look.isGraphic ? '' : 'answer'}
              autoFocus
              onInput={value => update($, answer, (state: PaneAnswer | null): PaneAnswer | null => (state === null ? null : { ...state, text: value }))}
              onSubmit={value => sendAnswer($, value)}
            />
          ) : null}
          {form.phase === 'form' ? (
            <Box key="answer-actions" flexDirection="row" gap={1} flexWrap="wrap">
              <Button key="answer-send" label={COPY.answerSend} variant="primary" onPress={() => sendAnswer($)} />
              <Button key="answer-discuss" label={COPY.discussInSession} dimColor onPress={() => postPrompt($, COPY.discussPrompt(question?.id ?? 0, question?.text ?? ''))} />
            </Box>
          ) : null}
          {form.phase === 'sending' ? quiet(elements, COPY.answerSending) : null}
          {(form.phase === 'answered' || form.phase === 'refused') && cardOf('answer-result', form.phase === 'answered' ? <Text weight="semibold" color="success">{COPY.answered(form.sentence ?? '')}</Text> : <Text weight="semibold" color="error">{COPY.notAnswered}</Text>, null, [
            form.phase === 'answered' ? <Text color="inactive" size="footnote">{COPY.answeredNote}</Text> : reason(form.sentence),
            form.phase === 'refused' ? <Button key="answer-retry" label={COPY.editAndRetry} variant="primary" onPress={() => update($, answer, (state: PaneAnswer | null): PaneAnswer | null => (state === null ? null : { ...state, phase: 'form' }))} /> : null,
            next !== null && form.phase === 'answered' ? <Button key="answer-next" label={COPY.nextQuestion} variant="primary" onPress={() => show($, { screen: 'question', question: next.id }, false)} /> : null,
          ])}
          <Link key="answer-console" href={consoleLink(base, `question&question=${screen.question}`)} label={COPY.answerInConsole} />
          <Text key="answer-note" color="subtle" size="footnote">{COPY.answerNote}</Text>
          {footer}
        </Box>
      )
    }

    // THE ADD FORM: one task for the leader; the plan it becomes is approved in the console.
    if (screen.screen === 'add' && !isStale && hasInput) {
      const form = await readAdd($)
      const isRepositoryGoal = form.repositoryGoals.includes(form.goal)

      if (form.phase === 'sending') {
        return (
          <Box flexDirection="column" gap={1}>
            <Text size="heading" weight="semibold">{COPY.newTask}</Text>
            <Text color="subtle">{form.title}</Text>
            <Text>{COPY.sending}</Text>
          </Box>
        )
      }

      if (form.phase === 'added') {
        return (
          <Box flexDirection="column" gap={1}>
            <Text weight="semibold" color="success">{COPY.added}</Text>
            <Text>{form.sentence ?? ''}</Text>
            {/* WHAT WAS HANDED OVER, word for word (#35): the story the leader writes from it is the leader's. */}
            {form.sent !== null && form.sent !== undefined && <Text key="add-sent-title" color="inactive">{COPY.handedTitle(form.sent.title)}</Text>}
            {form.sent !== null && form.sent !== undefined && <Text key="add-sent-criteria" color="inactive">{COPY.handedCriteria(form.sent.criteria)}</Text>}
            {form.sent !== null && form.sent !== undefined && (form.sent.files ?? []).length > 0 && <Text key="add-sent-files" color="inactive">{COPY.handedFiles(form.sent.files)}</Text>}
            {form.link !== null && <Link href={form.link} label={COPY.planInConsole} />}
            <Text color="subtle" size="footnote">{COPY.addedNote}</Text>
            <Button key="add-next" label={COPY.nextTask} variant="primary" onPress={() => openAdd($, '')} />
            {backButton}
          </Box>
        )
      }

      if (form.phase === 'refused' || form.phase === 'timeout' || form.phase === 'paused') {
        return (
          <Box flexDirection="column" gap={1}>
            <Text weight="semibold" color={form.phase === 'paused' ? 'warning' : 'error'}>{form.phase === 'paused' ? COPY.added : COPY.notAdded}</Text>
            <Text>{form.sentence ?? ''}</Text>
            <Button key="add-retry" label={COPY.editAndRetry} variant="primary" onPress={() => update($, add, (value: PaneAdd): PaneAdd => ({ ...value, phase: 'form' }))} />
            {backButton}
          </Box>
        )
      }

      // THREE PICKERS (S32) over tasks_add's own fields: the goal, the story it runs after, the size.
      const pickers = [
        'Select' in elements && form.goals.length > 0 ? (
          <elements.Select key="add-goal" label={COPY.goal} value={form.goal} options={form.goals} onSelect={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, goal: value, problem: null }))} />
        ) : null,
        'Select' in elements ? (
          <elements.Select key="add-after" label={COPY.afterLabel} value={form.after} options={form.stories} onSelect={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, after: value }))} />
        ) : null,
        'Select' in elements ? (
          <elements.Select key="add-size" label={COPY.size} value={form.size} options={COPY.sizes.map(size => ({ value: size, label: size }))} onSelect={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, size: value }))} />
        ) : null,
      ].filter(item => item !== null)

      return (
        <Box flexDirection="column" gap={1}>
          <Box key="add-top" flexDirection="row" justifyContent="space-between">
            {backButton}
            <Text color="subtle" size="footnote">{COPY.newTask}</Text>
          </Box>
          <Text size="heading" weight="semibold">{COPY.newTask}</Text>
          {'Input' in elements && (
            // "WHAT TO DO" IN THREE ROWS where Desktop has proven a multi-line field (the owner's walk of 1.5.0, #35: one line
            // showed only a slice of a long task); its lines are sent as one.
            <elements.Input key="add-title" label={COPY.whatToDo} value={form.title} rows={look.proofs.inputRows ? 3 : undefined} onInput={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, title: value }))} onSubmit={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, title: value }))} />
          )}
          {'Input' in elements && (
            // CRITERIA ONE PER LINE where Desktop has proven a multi-line field (input-rows), by semicolons otherwise.
            <elements.Input
              key="add-criteria"
              label={COPY.criteriaLabel}
              placeholder={look.proofs.inputRows ? COPY.criteriaPlaceholderRows : COPY.criteriaPlaceholder}
              value={form.criteria}
              rows={look.proofs.inputRows ? 3 : undefined}
              onInput={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, criteria: value }))}
              onSubmit={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, criteria: value }))}
            />
          )}
          {'Input' in elements && isRepositoryGoal && (
            // THE FILES, ONLY FOR A GOAL OVER A REPOSITORY (#39): one path per line where Desktop has proven a multi-line
            // field, by semicolons otherwise; a goal in Terylon's own list has no files to declare.
            <elements.Input
              key="add-files"
              label={COPY.filesLabel}
              placeholder={look.proofs.inputRows ? COPY.filesPlaceholderRows : COPY.filesPlaceholder}
              value={form.files}
              rows={look.proofs.inputRows ? 3 : undefined}
              onInput={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, files: value, problem: null }))}
              onSubmit={value => update($, add, (state: PaneAdd): PaneAdd => ({ ...state, files: value, problem: null }))}
            />
          )}
          {isRepositoryGoal && form.problem !== null && <Text key="add-files-problem" color="error">{form.problem}</Text>}
          {form.goals.length === 0 && <Text color="warning">{COPY.noGoal}</Text>}
          {look.isGraphic && !look.isNarrow
            ? (
                <Box key="add-pickers" flexDirection="row" gap="sm">
                  {pickers.map((picker, position) => <Box key={`add-picker-${position}`} flexGrow={position === 0 ? 3 : position === 1 ? 2 : 1} flexShrink={1} minWidth={0}>{picker}</Box>)}
                </Box>
              )
            : pickers}
          <Box flexDirection="row" gap={1}>
            <Button key="add-send" label={COPY.handOver} variant="primary" onPress={() => sendTask($)} />
            <Button key="add-cancel" label={COPY.cancel} dimColor onPress={() => back($)} />
          </Box>
          <Text color="subtle" size="footnote">{COPY.quickTaskNote}</Text>
        </Box>
      )
    }

    // THE MEMORY TAB: the rules the machine enforces, the leader's memory as stored, the proposals waiting.
    if (screen.screen === 'memory') {
      const state = await readMemory($)
      const memoryLink = consoleLink(base, 'memory')

      if (state.phase === 'loading') {
        return (
          <Box flexDirection="column" gap={1}>
            {tabs}
            {quiet(elements, COPY.memoryLoading)}
          </Box>
        )
      }

      if (state.phase === 'error') {
        return (
          <Box flexDirection="column" gap={1}>
            {tabs}
            {context}
            {cardOf('mem-error', warned(COPY.memoryError), null, [
              reason(state.sentence ?? '?'),
              <Button key="mem-retry" label={COPY.retry} variant="primary" onPress={() => openMemory($)} />,
            ], 'bad')}
            {footer}
          </Box>
        )
      }

      const edit = state.edit
      const startEdit = (action: 'add' | 'replace' | 'remove', file: string, oldText: string | null) =>
        update($, memory, (value: PaneMemory): PaneMemory => ({ ...value, phase: 'editing', sentence: null, edit: { action, file, oldText, text: action === 'replace' ? oldText ?? '' : '', why: '' } }))
      const isEditing = (file: string, oldText: string | null, action: string) =>
        edit !== null && edit.file === file && edit.oldText === oldText && edit.action === action
      const choice = (key: string, label: string, isChosen: boolean, onPress: () => unknown) => (
        <Button key={key} label={isChosen ? COPY.selected(label) : label} variant={isChosen ? 'primary' : undefined} dimColor={!isChosen} onPress={onPress} />
      )

      // The form under the entry it changes: text, why, then Propose; after it, the answer and the console's link.
      const form = (file: string) => {
        if (edit === null || edit.file !== file) {
          return null
        }

        return (
          <Box key={`mem-form-${file}`} flexDirection="column" gap={1}>
            {state.phase === 'editing' && hasInput && 'Input' in elements && edit.action !== 'remove' && (
              <elements.Input key="mem-text" label={COPY.memoryText} value={edit.text} onInput={value => update($, memory, (value_: PaneMemory): PaneMemory => ({ ...value_, edit: value_.edit === null ? null : { ...value_.edit, text: value } }))} onSubmit={() => undefined} />
            )}
            {state.phase === 'editing' && hasInput && 'Input' in elements && (
              <elements.Input key="mem-why" label={COPY.memoryWhy} value={edit.why} onInput={value => update($, memory, (value_: PaneMemory): PaneMemory => ({ ...value_, edit: value_.edit === null ? null : { ...value_.edit, why: value } }))} onSubmit={() => proposeMemory($)} />
            )}
            {state.phase === 'editing' && (
              <Box flexDirection="row" gap={1}>
                <Button key="mem-propose" label={COPY.memoryPropose} variant="primary" onPress={() => proposeMemory($)} />
                <Button key="mem-cancel" label={COPY.cancel} dimColor onPress={() => update($, memory, (value: PaneMemory): PaneMemory => ({ ...value, phase: 'ok', edit: null }))} />
              </Box>
            )}
            {state.phase === 'sending' && quiet(elements, COPY.memorySending)}
            {(state.phase === 'proposed' || state.phase === 'refused') && (
              <Box flexDirection="column">
                <Text color={state.phase === 'refused' ? 'error' : 'success'}>{state.sentence ?? ''}</Text>
                <Button key="mem-back" label={COPY.memoryBack} dimColor onPress={() => openMemory($)} />
              </Box>
            )}
            {state.phase === 'editing' && <Text color="inactive" size="footnote">{COPY.memoryNote}</Text>}
          </Box>
        )
      }

      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {context}
          {state.rules.length > 0 && cardOf('mem-rules', COPY.memoryRules, COPY.memoryRulesHint(state.rules.length), state.rules.map((rule, index) =>
            rowOf({
              key: `mem-rule-${index}`,
              kind: null,
              title: rule.rule,
              detail: rule.enforcedBy,
              onPress: () => toggle($, `mem-rule-${index}`),
              body: shown.includes(`mem-rule-${index}`) ? <Text color="inactive">{`${rule.rule} · ${rule.artefact}`}</Text> : null,
            })))}
          {state.files.length === 0 && cardOf('mem-empty', COPY.memoryFiles, null, [quiet(elements, COPY.memoryEmpty)])}
          {state.files.map((file, fileIndex) =>
            cardOf(
              `mem-file-${fileIndex}`,
              file.heading,
              file.text !== null ? COPY.memoryTopic : COPY.memoryEntries(file.file, file.entries.length),
              [
                ...file.entries.map((entry, entryIndex) => (
                  <Box key={`mem-entry-${fileIndex}-${entryIndex}`} flexDirection="row" justifyContent="space-between" gap={1}>
                    <Box flexShrink={1}>
                      <Text>{entry}</Text>
                    </Box>
                    <Box flexDirection="row" gap={1} flexShrink={0}>
                      {choice(`mem-edit-${fileIndex}-${entryIndex}`, COPY.memoryEdit, isEditing(file.file, entry, 'replace'), () => startEdit('replace', file.file, entry))}
                      {choice(`mem-remove-${fileIndex}-${entryIndex}`, COPY.memoryRemove, isEditing(file.file, entry, 'remove'), () => startEdit('remove', file.file, entry))}
                    </Box>
                  </Box>
                )),
                ...(file.text === null
                  ? [choice(`mem-add-${fileIndex}`, COPY.memoryAdd, isEditing(file.file, null, 'add'), () => startEdit('add', file.file, null))]
                  : [
                      rowOf({
                        key: `mem-topic-${fileIndex}`,
                        kind: shown.includes(`mem-topic-${fileIndex}`) ? '▾' : '▸',
                        title: firstLine(file.text),
                        onPress: () => toggle($, `mem-topic-${fileIndex}`),
                        body: shown.includes(`mem-topic-${fileIndex}`) ? <Text color="inactive">{file.text}</Text> : null,
                      }),
                    ]),
                form(file.file),
              ],
            ))}
          {/* THE PROPOSALS WAITING (S27): what each changes, old text struck and new, with Confirm and Drop. */}
          {state.proposals.length === 0
            ? cardOf('mem-pending', COPY.memoryPendingHeading, null, [quiet(elements, COPY.nothingYet)])
            : cardOf('mem-proposals', headingOf(COPY.proposalsHeading, state.proposals.length, 'text'), COPY.proposalsHint, state.proposals.map(proposal => {
                const proposalKey = `proposal-${proposal.id}`

                return (
                  <Box key={`mem-proposal-${proposal.id}`} flexDirection="column" gap={look.isGraphic ? 'xs' : 0}>
                    <Text size="footnote" color="subtle" wrap="truncate-end">
                      <Text color="inactive">{proposal.file === 'owner' ? COPY.memoryOwnerFile : proposal.file.replace(/^(topic|project):/, '')}</Text>
                      {' · '}
                      <Text>{COPY.proposedBy(proposal.by, proposal.story, null)}</Text>
                      {proposal.at === null ? null : ' · '}
                      {proposal.at === null ? null : <Text tabular>{proposal.at}</Text>}
                    </Text>
                    {/* NO DIFF FIELD (Terylon main aaf07e8): a replace is its old text struck, then its new; an add +text; a remove −oldText. */}
                    {proposal.operations.flatMap((operation, index) => [
                      operation.oldText !== null && operation.action !== 'add'
                        ? <Text key={`mem-proposal-${proposal.id}-old-${index}`} strikethrough color="error">{operation.action === 'remove' ? `− ${operation.oldText}` : operation.oldText}</Text>
                        : null,
                      operation.text !== null && operation.action !== 'remove'
                        ? <Text key={`mem-proposal-${proposal.id}-new-${index}`} color="success">{operation.action === 'add' ? `+ ${operation.text}` : operation.text}</Text>
                        : null,
                    ])}
                    {proposal.why !== null && <Text color="subtle" size="footnote">{COPY.proposalWhy(proposal.why)}</Text>}
                    <Box flexDirection="row" gap={1}>
                      {actButton(proposalKey, 'memory_confirm', proposal.id, { isPrimary: true })}
                      {actButton(proposalKey, 'memory_drop', proposal.id)}
                    </Box>
                    {actBusyNote(proposalKey)}
                    {actOutcome(proposalKey, memoryLink, COPY.memoryBrowser)}
                  </Box>
                )
              }), 'wait')}
          {/* WHAT BECAME OF A PROPOSAL NO LONGER LISTED: confirmed or dropped, it left memory_get's list. */}
          {Object.keys(allActs)
            .filter(key => key.startsWith('proposal-') && !state.proposals.some(proposal => `proposal-${proposal.id}` === key))
            .map(key => actOutcome(key, memoryLink, COPY.memoryBrowser))}
          {state.proposals.length > 0 && <Link key="mem-browser" href={memoryLink} label={COPY.memoryBrowser} />}
          {cardOf('mem-proposed', COPY.memoryProposedHeading, null, state.proposed.length === 0
            ? [quiet(elements, COPY.nothingYet)]
            : state.proposed.slice().reverse().map((line, position) => <Text key={`mem-proposed-${position}`} color="inactive" wrap="truncate-end">{line}</Text>))}
          {footer}
        </Box>
      )
    }

    const goalsState = await readGoals($)

    // ONE PLAN: its chain, its stories in order, each opening the story; approval and rethinking are the console's.
    const planCard = (plan: (typeof goalsState.plans)[number]) => {
      // ITS ORDER IS ITS STORIES' after (#35): an arrow only where a story waits for another, said by their titles.
      const chain = plan.stories.map(item => ({ index: item.index, after: item.after }))
      const orderAlt = COPY.planOrderAlt(plan.stories.map(item => ({ title: item.title, after: item.after.map(place => plan.stories[place - 1]?.title ?? `#${place}`) })))

      const planKey = `plan-${plan.id}`
      const card_ = cardOf(`plan-${plan.id}`, <Text size="heading" weight="semibold">{COPY.plan(plan.id)}<Text color="subtle" weight="regular">{` · ${plan.goalTitle}`}</Text></Text>, plan.stateText, [
        // A PLAN AS A CHAIN (S32): the order and the "after" of its stories as an Svg, as 1 → 2 → 3 on the terminal. Only
        // the order (#39): the sizes beside it, "S ~$3 → M ~$5", read as nodes of a second chain, and a plan of one story
        // drew "○ M" above its row. A plan of one story has no order to draw; each size is said on its story's row.
        plan.stories.length < 2
          ? null
          : (
              <Box key={`plan-${plan.id}-chain`} flexDirection="row" gap={1} alignItems="center">
                {look.isGraphic ? picture(elements, planChain(chain, orderAlt)) : <Text color="subtle">{planOrder(chain)}</Text>}
              </Box>
            ),
        ...plan.stories.map(item =>
          rowOf({
            key: `plan-${plan.id}-story-${item.id}`,
            kind: String(item.index),
            title: item.title,
            detail: item.detail,
            onPress: () => go({ screen: 'story', story: item.id }),
          })),
        plan.comment === null ? null : <Text color="inactive">{plan.comment}</Text>,
        <Text color="inactive" size="footnote">{COPY.planNote}</Text>,
        // THE PLAN'S ACTS (S27): Approve in one press, Rethink… with its comment; editing criteria stays the console's.
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {plan.isProposed && actButton(planKey, 'plan_approve', plan.id, { isPrimary: true })}
          {plan.isProposed && actButton(planKey, 'plan_rethink', plan.id, { opens: true })}
          <Button key={`plan-${plan.id}-goal`} label={COPY.goalOf(plan.goal)} dimColor onPress={() => go({ screen: 'goal', goal: plan.goal })} />
        </Box>,
        plan.isProposed && actState(planKey).open === 'plan_rethink' ? actField(planKey, 'plan_rethink', plan.id, { label: COPY.rethinkLabel }) : null,
        plan.isProposed && actState(planKey).open === 'plan_rethink' ? <Text color="subtle" size="footnote">{COPY.rethinkNote}</Text> : null,
        actBusyNote(planKey),
        plan.isProposed ? (
          <Text key={`plan-${plan.id}-note`} color="subtle" size="footnote">{COPY.approveNote(plan.stories.length)}</Text>
        ) : null,
        plan.isProposed ? <Link key={`plan-${plan.id}-console`} href={plan.console} label={COPY.approveConsole} /> : null,
      ], plan.isProposed ? 'wait' : 'plain')

      return [card_, actOutcome(planKey, plan.console, COPY.planInConsole, [
        actState(planKey).outcome?.tool === 'plan_approve' ? <Button key={`act-${planKey}-queue`} label={COPY.openQueue} variant="primary" onPress={() => show($, QUEUE, true)} /> : null,
      ])]
    }

    // A REPEATING TASK'S CARD (Terylon S43), in place of the goal's stories: the summary, the newest run in a box of its
    // own with the link to its story, the older runs as rows, the foot and the task's sheet in the console. Every
    // child is keyed and every word a string: Desktop drops the whole tab when it cannot draw one card.
    const repeatingCard = (repeating: PaneRepeating) => {
      const [newest, ...older] = repeating.runs
      // ONE KEY PER RUN: two runs of one story would otherwise draw two children of one key.
      // AN OLDER RUN THAT WENT WELL IS QUIET, as the design draws it: only one that waits keeps its colour.
      const olderTone = (run: PaneRepeatingRun) => (run.tone === 'success' ? 'subtle' : run.tone)
      const runKey = (run: PaneRepeatingRun, index: number) => (repeating.runs.findIndex(item => item.story === run.story) === index ? `repeating-run-${run.story}` : `repeating-run-${run.story}-${index}`)

      return cardOf('goal-repeating', repeating.title, <Text color="success" size="footnote" mono>{COPY.repeating}</Text>, [
        <Text key="repeating-summary" color="subtle" size="footnote">{repeating.summary}</Text>,
        newest === undefined
          ? <Box key="repeating-none" flexDirection="column">{quiet(elements, COPY.repeatingNoRun)}</Box>
          : (
              <Box key="repeating-newest" flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={look.isGraphic ? 'sm' : 1} gap={look.isGraphic ? 'xs' : 0}>
                <Box flexDirection="row" justifyContent="space-between" gap={1}>
                  <Text tabular>{newest.day}</Text>
                  <Text color={newest.tone}>{newest.state}</Text>
                </Box>
                {newest.line === '' ? null : <Text color="subtle" size="footnote">{newest.line}</Text>}
                {newest.story === null ? null : <Button key={runKey(newest, 0)} label={COPY.openRun} plain onPress={() => go({ screen: 'story', story: newest.story ?? 0 })} />}
              </Box>
            ),
        ...older.map((run, index) => (run.story === null
          ? (
              <Box key={`repeating-older-${index}`} flexDirection="row" justifyContent="space-between" gap={1}>
                <Text color="subtle" tabular>{run.day}</Text>
                <Text color={olderTone(run)}>{run.state}</Text>
              </Box>
            )
          : rowOf({ key: runKey(run, index + 1), kind: null, title: look.isNarrow ? `${run.day} · ${run.state}` : run.day, detail: run.state, detailTone: olderTone(run), onPress: () => go({ screen: 'story', story: run.story ?? 0 }) }))),
        <Text key="repeating-foot" color="subtle" size="footnote">{COPY.repeatingFoot}</Text>,
        <Link key="repeating-console" href={repeating.console} label={COPY.repeatingInConsole} />,
      ])
    }

    if (screen.screen === 'plan') {
      const plan = goalsState.plans.find(item => item.id === screen.plan) ?? null

      return (
        <Box flexDirection="column" gap={1}>
          {backButton}
          {plan === null ? quiet(elements, goalsState.phase === 'loading' ? COPY.loading : COPY.noPlans) : planCard(plan)}
          {footer}
        </Box>
      )
    }

    // ONE GOAL: its stories, the leader's questions about it, its plans.
    if (screen.screen === 'goal') {
      const shownGoal = await read($, goal)
      const questions = current.questions.filter(item => item.subject === `goal/${screen.goal}`)
      const plans = goalsState.plans.filter(item => item.goal === screen.goal)
      const goalKey = `goal-${screen.goal}`
      const goalAct = actState(goalKey)
      // A value an older version stored has no `repeating`: it is an ordinary goal until goal_get is read again.
      const repeating = shownGoal?.repeating ?? null

      if (shownGoal === null || shownGoal.goal !== screen.goal || shownGoal.phase === 'loading') {
        return (
          <Box flexDirection="column" gap={1}>
            {backButton}
            {quiet(elements, COPY.loading)}
          </Box>
        )
      }

      return (
        <Box flexDirection="column" gap={1}>
          {backButton}
          {shownGoal.phase === 'error'
            ? cardOf('goal-error', warned(COPY.loadError(COPY.goalOf(screen.goal))), null, [reason(shownGoal.sentence)], 'bad')
            : (
                <Box key="goal-head" flexDirection="column">
                  <Text size="caption" color="subtle">{COPY.goalOf(screen.goal).toUpperCase()}</Text>
                  <Text size="title" weight="semibold">{shownGoal.title}</Text>
                  <Text color="subtle" size="footnote">{shownGoal.meta}</Text>
                </Box>
              )}
          {shownGoal.phase === 'ok' && repeating !== null && repeatingCard(repeating)}
          {shownGoal.phase === 'ok' && repeating === null && cardOf('goal-stories', COPY.goalStories, <Text color="subtle" size="footnote" tabular>{String(shownGoal.stories.length)}</Text>, [
            shownGoal.stories.length === 0 ? quiet(elements, COPY.noGoalStories) : null,
            ...shownGoal.stories.map(item =>
              rowOf({ key: `goal-story-${item.id}`, kind: COPY.kindStory, title: item.title, detail: item.state, onPress: () => go({ screen: 'story', story: item.id }) })),
          ])}
          {questions.length > 0 && cardOf('goal-questions', headingOf(COPY.goalQuestionsHeading, questions.length, 'text'), null, questions.map(item =>
            rowOf({ key: `goal-question-${item.id}`, kind: COPY.kindQuestion, kindTone: 'warning', title: firstLine(item.text), onPress: () => go({ screen: 'question', question: item.id }) })), 'wait')}
          {plans.map(plan =>
            rowOf({ key: `goal-plan-${plan.id}`, kind: COPY.kindPlan, title: COPY.plan(plan.id), detail: plan.stateText, detailTone: plan.isProposed ? 'warning' : 'subtle', onPress: () => go({ screen: 'plan', plan: plan.id }) }))}
          {/* THE GOAL'S ACT (S27): Drop goal… asks once more, saying what it withdraws and what keeps running. */}
          {shownGoal.phase === 'ok' && shownGoal.isOpen && goalAct.open !== 'goal_drop' && (
            <Box key="goal-actions" flexDirection="row" gap={1}>{actButton(goalKey, 'goal_drop', screen.goal, { isDanger: true, opens: true })}</Box>
          )}
          {shownGoal.phase === 'ok' && goalAct.open === 'goal_drop' && cardOf(`act-${goalKey}-confirm`, <Text>{COPY.dropGoalWarning(plans.filter(plan => plan.isProposed || plan.state === 'rethink').map(plan => plan.id), shownGoal.openStories ?? [])}</Text>, null, [
            actField(goalKey, 'goal_drop', screen.goal, { label: '', isDanger: true, hasText: false }),
          ], 'wait')}
          {actBusyNote(goalKey)}
          {actOutcome(goalKey, consoleLink(base, `goals&goal=${screen.goal}`), COPY.goalInConsole)}
          <Link key="goal-console" href={consoleLink(base, `goals&goal=${screen.goal}`)} label={COPY.goalInConsole} />
          {footer}
        </Box>
      )
    }

    // THE GOALS TAB: open goals by priority, the plans, and a new goal with its priority and target.
    if (screen.screen === 'goals') {
      const isClosedShown = goalsState.showing === 'closed'
      // A WITHDRAWN PLAN (plans_list's `state: 'withdrawn'`) LEAVES THE TAB: it waits on nothing, and stays on its goal's screen.
      const tabPlans = goalsState.plans.filter(plan => plan.state !== 'withdrawn')
      // A CLOSED GOAL'S PLANS LEAVE THE OPEN LIST: they stay on the goal's own screen. After
      // S44 the tab knows the open goals alone, so a plan stays only under one of them.
      const openPlans = tabPlans.filter(plan => (goalsState.closedFrom === 'terylon'
        ? goalsState.open.some(item => item.id === plan.goal)
        : !goalsState.closed.some(item => item.id === plan.goal)))
      // UNDER CLOSED, THE CLOSED GOALS' PLANS ALONE: each button draws its own goals' plans.
      const shownPlans = isClosedShown ? tabPlans.filter(plan => goalsState.closed.some(item => item.id === plan.goal)) : openPlans
      // OPEN · N AND CLOSED · M: the one selected filled, the other dim, as the tabs are.
      const switchButton = (key: string, name: string, count: number, isSelected: boolean, showing: 'open' | 'closed') => (
        <Button key={key} label={`${name}${COPY.count(count)}`} variant={isSelected ? 'primary' : undefined} dimColor={isSelected ? undefined : true} onPress={() => showGoals($, showing)}>
          {!look.isGraphic && isSelected ? '● ' : ''}
          {name}
          {' · '}
          <Text tabular>{String(count)}</Text>
        </Button>
      )
      const goalSwitch = (
        <Box flexDirection="row" gap={look.isGraphic ? 'xs' : 1} flexWrap="wrap">
          {switchButton('goals-show-open', COPY.goalsOpen, goalsState.open.length, !isClosedShown, 'open')}
          {switchButton('goals-show-closed', COPY.goalsClosed, goalsState.closedCount, isClosedShown, 'closed')}
        </Box>
      )
      const closedRetry = (label: string) => <Button key="goals-closed-retry" label={label} onPress={() => showGoals($, 'closed')} />
      // THE CLOSED LIST'S OWN STATES: loading and empty said quietly, a failed read with Terylon's sentence and Try again.
      const closedLines = goalsState.closedPhase === 'loading' || goalsState.closedPhase === 'idle'
        ? [quiet(elements, COPY.closedLoading)]
        : goalsState.closedPhase === 'error'
          ? [reason(goalsState.closedSentence), closedRetry(COPY.retry)]
          : goalsState.closedPhase === 'changed'
            ? [quiet(elements, COPY.closedChanged), closedRetry(COPY.closedReadAgain)]
            : goalsState.closed.length === 0 ? [quiet(elements, COPY.noClosedGoals)] : null
      const goalRows = isClosedShown ? goalsState.closed : goalsState.open
      const goalPickers = [
        'Select' in elements ? (
          <elements.Select key="goal-priority" label={COPY.priority} value={goalsState.priority} options={COPY.priorities} onSelect={value => update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, priority: value }))} />
        ) : null,
        'Select' in elements ? (
          <elements.Select key="goal-target" label={COPY.target} value={goalsState.target} options={goalsState.targets.length === 0 ? [{ value: OWN_LIST, label: COPY.ownList }] : goalsState.targets} onSelect={value => update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, target: value }))} />
        ) : null,
      ].filter(item => item !== null)

      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {context}
          {problemCard}
          {goalsState.phase === 'loading' && quiet(elements, COPY.loading)}
          {goalsState.phase === 'error' && cardOf('goals-error', warned(COPY.loadError(COPY.tabGoals)), null, [reason(goalsState.sentence)], 'bad')}
          {goalsState.phase === 'ok' && cardOf('goals-open', goalSwitch, COPY.goalsHint, [
            ...(isClosedShown && closedLines !== null ? closedLines : []),
            !isClosedShown && goalRows.length === 0 ? quiet(elements, COPY.noOpenGoals) : null,
            ...(isClosedShown && closedLines !== null ? [] : goalRows).map(item =>
              rowOf({
                key: `goal-${item.id}`,
                // THE PRIORITY AS A CHIP (S32): P1 in warning, the others inactive.
                kind: item.priority,
                kindTone: item.priority === 'P1' ? 'warning' : 'inactive',
                kindColumn: 3,
                title: item.title,
                titleTone: isClosedShown ? 'subtle' : undefined,
                detail: item.questions > 0 ? COPY.goalQuestions(item.questions) : item.stories,
                detailTone: item.questions > 0 ? 'warning' : 'subtle',
                onPress: () => go({ screen: 'goal', goal: item.id }),
              })),
          ])}
          {goalsState.phase === 'ok' && !isClosedShown && openPlans.length === 0 && cardOf('plans-empty', COPY.plans, null, [quiet(elements, COPY.noPlans)])}
          {shownPlans.map(plan => planCard(plan))}
          {goalsState.sentence !== null && goalsState.phase === 'ok' && reason(goalsState.sentence)}
          {hasInput && 'Input' in elements && cardOf('goal-new', COPY.newGoal, null, [
            <elements.Input key="goal-draft" placeholder={COPY.newGoalPlaceholder} value={goalsState.draft} onInput={value => update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, draft: value }))} onSubmit={() => addGoal($)} />,
            look.isGraphic && !look.isNarrow
              ? (
                  <Box key="goal-pickers" flexDirection="row" gap="sm">
                    {goalPickers.map((picker, position) => <Box key={`goal-picker-${position}`} flexGrow={1} flexShrink={1} minWidth={0}>{picker}</Box>)}
                  </Box>
                )
              : goalPickers,
            <Box flexDirection="row" gap={1}>
              <Button key="goal-add" label={COPY.addGoal} variant="primary" onPress={() => addGoal($)} />
            </Box>,
            goalsState.adding === 'sending' ? quiet(elements, COPY.goalSending) : null,
            goalsState.adding === 'added' ? <Text color="success">{`✓ ${goalsState.addSentence ?? ''}`}</Text> : null,
            goalsState.adding === 'refused' ? <Text color="error">{goalsState.addSentence ?? ''}</Text> : null,
            <Text color="subtle" size="footnote">{COPY.addGoalNote}</Text>,
          ])}
          {footer}
        </Box>
      )
    }

    // THE BELL TAB: what needs the owner, what the machine did, the leader's state, the last 30 days.
    if (screen.screen === 'bell') {
      const bellState = await readBell($)
      const sourceColumn = kindWidth(bellState.unhandled.map(item => item.source))

      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          {context}
          {problemCard}
          {bellState.phase === 'loading' && quiet(elements, COPY.loading)}
          {bellState.phase === 'error' && cardOf('bell-error', warned(COPY.loadError(COPY.tabBell(0))), null, [reason(bellState.sentence)], 'bad')}
          {bellState.phase === 'ok' && cardOf('bell-needs', headingOf(COPY.needsYou, bellState.unhandledCount, bellState.unhandledCount > 0 ? 'text' : 'inactive'), COPY.bellHint, [
            bellState.unhandled.length === 0 ? quiet(elements, COPY.nothingYet) : null,
            ...bellState.unhandled.map(notice =>
              rowOf({
                key: `notice-${notice.id}`,
                // THE SOURCE AS A CHIP (S32): a fault of the machine in error, everything else inactive.
                kind: notice.source,
                kindTone: isMachineFault(notice) ? 'error' : 'inactive',
                kindColumn: sourceColumn,
                title: notice.title,
                detail: `${notice.when} ${shown.includes(`notice-${notice.id}`) ? '▾' : '▸'}`,
                onPress: () => toggle($, `notice-${notice.id}`),
                body: shown.includes(`notice-${notice.id}`) ? (
                  <Box flexDirection="column" paddingLeft={look.isGraphic ? 0 : sourceColumn + 1}>
                    <Text color="inactive">{notice.body === '' ? COPY.noBody : notice.body}</Text>
                    <Box flexDirection="row" gap={1} flexWrap="wrap">
                      <Button
                        key={`handle-${notice.id}`}
                        label={bellState.handling === notice.id ? COPY.handling : COPY.markHandled}
                        onPress={() => handleNotice($, notice.id)}
                      />
                      {notice.link !== null && <Link href={`${base}${notice.link}`} label={COPY.bellInConsole} />}
                    </Box>
                  </Box>
                ) : null,
              })),
            bellState.handleSentence === null ? null : reason(bellState.handleSentence),
            <Text color="subtle" size="footnote">{COPY.bellNote}</Text>,
          ], bellState.unhandledCount > 0 ? 'wait' : 'plain')}
          {bellState.phase === 'ok' && cardOf('bell-machine', COPY.machine, COPY.machineHint, [
            <Text>
              <Text color={bellState.leader.isPaused ? 'warning' : 'success'}>{bellState.leader.isPaused ? '! ' : '✓ '}</Text>
              <Text color={bellState.leader.isPaused ? 'warning' : 'text'}>{bellState.leader.text}</Text>
            </Text>,
            ...bellState.handled.map(notice => (
              <Text key={`handled-${notice.id}`} wrap="truncate-end">
                <Text color="success">{'✓ '}</Text>
                {withHash(elements, notice.title)}
                <Text color="subtle" size="footnote" tabular>{` ${notice.when}`}</Text>
              </Text>
            )),
          ])}
          {bellState.phase === 'ok' && bellState.metrics.length > 0 && cardOf('bell-metrics', COPY.metrics, COPY.metricsHint, [
            look.isGraphic
              ? (
                  // FOUR NUMBERS, LARGE (S32): metrics reports no per-day series, so there is no 30-day chart.
                  <Box key="metric-numbers" flexDirection="row" gap="lg" flexWrap="wrap">
                    {bellState.metrics.map((metric, index) => (
                      <Box key={`metric-${index}`} flexDirection="column">
                        <Text size="title" weight="semibold" tabular>{metric.value}</Text>
                        <Text size="footnote" color="subtle">{metric.label}</Text>
                      </Box>
                    ))}
                  </Box>
                )
              : (
                  <Box flexDirection="row" gap={2} flexWrap="wrap">
                    {bellState.metrics.map((metric, index) => (
                      <Text key={`metric-${index}`}>
                        <Text bold>{metric.value}</Text>
                        <Text color="subtle">{` ${metric.label}`}</Text>
                      </Text>
                    ))}
                  </Box>
                ),
          ])}
          {/* WHERE S32 LEFT THE DASHED SLOT: the leader's Pause and Resume are on the queue and the Status tab (S27). */}
          <Box key="leader-actions" flexDirection="row" gap={1} flexWrap="wrap">
            <Link href={consoleLink(base, 'bell')} label={COPY.bellInConsole} />
            <Link href={consoleLink(base, 'health')} label={COPY.health} />
          </Box>
          {footer}
        </Box>
      )
    }

    // THE QUEUE: waiting for you, running, queued or held, done today. Each card stays, quiet when empty.
    const waitingKind = (kind: string) =>
      kind === 'question' ? COPY.kindQuestion : kind === 'merge' ? COPY.kindMerge : kind === 'accept' ? COPY.kindAccept : kind === 'plan' ? COPY.kindPlan : COPY.kindBlocked
    const waitingTone = (kind: string): Tone =>
      kind === 'question' ? 'warning' : kind === 'merge' ? 'merged' : kind === 'accept' ? 'success' : kind === 'blocked' ? 'error' : 'inactive'
    // THE CARD'S HINT says where each waiting decision is taken: a merge in the console, an acceptance on its card (#39).
    const hasAccept = current.waiting.some(item => item.kind === 'accept')
    const waitingHint = !hasAccept ? COPY.waitingHint : current.waiting.some(item => item.kind === 'merge') ? COPY.waitingHintBoth : COPY.waitingHintAccept
    const waitingReveal = (kind: string) => (kind === 'question' ? COPY.answerInConsole : COPY.mergeInConsole)
    const slots = slotsGauge(current.slotsUsed, current.slots, false)
    const spend = budgetUsd === null ? null : spendBar(runningUsd, budgetUsd, 'small', COPY.gaugeSpendAlt(current.runningUsd, current.dayBudget ?? ''))

    // THE RUNNING HEADING'S GAUGES (S32): the slots and today's spend as two small Svg with their numbers; the
    // narrow dock says the numbers alone, the terminal draws ▰▱ cells.
    const gauges = !look.isGraphic
      ? (
          <Text color="subtle" tabular>
            {`${meter(current.slotsUsed, Math.min(current.slots, 12))} ${COPY.gaugeSlots(current.slotsUsed, current.slots)} · ${budgetUsd === null || budgetUsd <= 0 ? '' : `${meter((runningUsd / budgetUsd) * 4, 4)} `}${COPY.gaugeSpend(current.runningUsd, current.dayBudget)}`}
          </Text>
        )
      : look.isNarrow
        ? <Text color="subtle" size="footnote" tabular>{COPY.gaugesNarrow(current.slotsUsed, current.slots, current.runningUsd)}</Text>
        : (
            <Box flexDirection="row" gap="sm" alignItems="center">
              {picture(elements, slots)}
              <Text color="subtle" size="footnote" tabular>{COPY.gaugeSlots(current.slotsUsed, current.slots)}</Text>
              {picture(elements, spend)}
              <Text color="subtle" size="footnote" tabular>{COPY.gaugeSpend(current.runningUsd, current.dayBudget)}</Text>
            </Box>
          )

    return (
      <Box flexDirection="column" gap={1}>
        {tabs}
        {context}
        {problemCard}
        {/* THE LEADER'S ACTS (S27): Pause… with an optional reason under the header, Resume on the paused card. */}
        {current.connection === 'ok' && current.paused === null && actState('leader').open === 'leader_pause' && cardOf('act-leader-pause-card', COPY.actButton.leader_pause?.replace('…', '') ?? '', null, [
          actField('leader', 'leader_pause', null, { label: COPY.whyOptional }),
          <Text color="subtle" size="footnote">{COPY.pauseNote}</Text>,
        ])}
        {current.paused !== null && cardOf('paused', <Text size="heading" weight="semibold" color="text">{current.paused}</Text>, null, [
          <Box flexDirection="row" gap={1}>{actButton('leader', 'leader_resume', null, { isPrimary: true })}</Box>,
        ], 'wait')}
        {actBusyNote('leader')}
        {actOutcome('leader', consoleLink(base, 'work'), COPY.workInConsole)}
        {cardOf('waiting', headingOf(COPY.waiting, current.waiting.length, current.waiting.length > 0 ? 'text' : 'inactive', stale), look.isNarrow ? null : waitingHint, [
          current.waiting.length === 0 ? quiet(elements, COPY.nothingWaiting) : null,
          ...current.waiting.map(item =>
            rowOf({
              key: item.key,
              kind: waitingKind(item.kind),
              kindTone: waitingTone(item.kind),
              title: item.kind === 'merge' || item.kind === 'accept' ? `${item.title} · ${item.detail}` : item.title,
              // ONLY MERGE LINKS OUT (S27): every other waiting row's act is on its subject's card.
              reveal: item.kind === 'merge' || item.kind === 'question' ? { href: item.console, label: waitingReveal(item.kind) } : null,
              onPress: () => toggle($, item.key),
              body: shown.includes(item.key) ? (
                <Box flexDirection="column" paddingLeft={look.isGraphic ? 0 : KIND_WIDTH + 1}>
                  <Text color="inactive">{item.detail}</Text>
                  <Box flexDirection="row" gap={1} flexWrap="wrap">
                    {item.kind === 'question' && <Button key={`answer-${item.target}`} label={COPY.answer} variant="primary" onPress={() => go({ screen: 'question', question: item.target })} />}
                    {item.kind === 'question' && <Link href={item.console} label={COPY.answerInConsole} />}
                    {(item.kind === 'merge' || item.kind === 'accept' || item.kind === 'blocked') && <Button key={`open-story-${item.target}`} label={COPY.openStory} onPress={() => go({ screen: 'story', story: item.target })} />}
                    {item.kind === 'merge' && <Link href={item.console} label={COPY.mergeInConsole} />}
                    {item.kind === 'plan' && <Button key={`open-plan-${item.target}`} label={COPY.openPlan} onPress={() => go({ screen: 'plan', plan: item.target })} />}
                  </Box>
                </Box>
              ) : null,
            })),
        ], current.waiting.length > 0 ? 'wait' : 'plain')}
        {cardOf('running', headingOf(COPY.running, current.running.length, current.running.length > 0 ? 'suggestion' : 'inactive', stale), gauges, [
          current.running.length === 0 ? quiet(elements, COPY.nothingRunning) : null,
          ...current.running.map(item =>
            rowOf({
              key: `story-${item.story}`,
              kind: null,
              title: item.title,
              detail: look.isNarrow ? null : item.detail,
              detailTone: item.isStuck ? 'warning' : 'inactive',
              onPress: () => go({ screen: 'story', story: item.story }),
              // THE RUN'S PHASES (S32): eight segments from progress.stage, dots in the narrow dock, ✓●○◇ on the terminal.
              body: (
                <Box flexDirection="column" paddingLeft={look.isGraphic ? 0 : 1}>
                  {look.isGraphic
                    ? picture(elements, (look.isNarrow ? dots : segments)(item.phases, shortLabels(item.phases), item.isStuck))
                    : phaseLine(elements, item.phases, item.isStuck, item.stageLine)}
                  {look.isGraphic && (item.stageLine ?? item.step) !== null && <Text color="inactive" size="footnote" wrap="truncate-end">{item.stageLine ?? item.step}</Text>}
                  {!look.isGraphic && item.stageLine === null && item.step !== null && <Text color="inactive" wrap="truncate-end">{item.step}</Text>}
                </Box>
              ),
            })),
        ])}
        {cardOf('queued', headingOf(COPY.queued, current.queued.length, 'inactive', stale), null, [
          current.queued.length === 0 ? quiet(elements, COPY.nothingQueued) : null,
          ...current.queued.map(item =>
            rowOf({
              key: `queued-${item.story}`,
              kind: item.isHeld ? COPY.kindHeld : COPY.kindQueued,
              title: item.title,
              detail: item.detail,
              detailTone: item.isHeld ? 'warning' : 'subtle',
              onPress: () => go({ screen: 'story', story: item.story }),
            })),
        ])}
        {cardOf('done', headingOf(COPY.doneToday, current.doneToday.length, current.doneToday.length > 0 ? 'success' : 'inactive'), null, [
          current.doneToday.length === 0 ? quiet(elements, COPY.nothingDone) : null,
          ...current.doneToday.map(item =>
            rowOf({
              key: `done-${item.story}`,
              kind: COPY.kindMerged,
              kindTone: 'merged',
              title: item.title,
              detail: item.detail,
              onPress: () => go({ screen: 'story', story: item.story }),
            })),
        ])}
        {isStale && quiet(elements, COPY.addAfterReconnect)}
        {!isStale && hasInput && 'Input' in elements && (
          <Box key="quick" flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Box flexGrow={1}>
                <elements.Input key="quick-add" label={COPY.quickLabel} placeholder={COPY.quickPlaceholder} value={await read($, quick)} onInput={value => update($, quick, (): string => value)} onSubmit={async value => { await update($, quick, (): string => ''); await openAdd($, value) }} />
              </Box>
              <Button key="quick-open" label={COPY.quickAdd} variant="primary" onPress={async () => { const value = await read($, quick); await update($, quick, (): string => ''); await openAdd($, value) }} />
            </Box>
            <Text color="subtle" size="footnote">{COPY.quickNote}</Text>
          </Box>
        )}
        {!isStale && !hasInput && (
          <Box key="phone-add" flexDirection="column">
            <Button key="phone-add" label={COPY.addOnPhone} onPress={() => postPrompt($, COPY.addOnPhonePrompt)} />
            <Text color="subtle" size="footnote">{COPY.addOnPhoneNote}</Text>
          </Box>
        )}
        {footer}
      </Box>
    )
  })
}
