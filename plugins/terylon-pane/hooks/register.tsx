// terylon-pane, Terylon Cockpit (Terylon S68): the band and the pane in Claude Desktop (S7), built to the approved
// S15 canvas, page v2, in Terylon's tones, words and refs since S68 (hooks/tones.ts, hooks/words.ts).
//
//   every 30 s ──▶ $.mcp.call terylon: briefing · work_in_flight · stories_list · events_since
//        │            (through callTerylon's allow-list: NEVER a gate tool)
//        ├──▶ the band above the prompt, what calls for the owner: Terylon Cockpit · Waiting · Running · Queued · Notices
//        ├──▶ the status line, the machine's health and cost: Terylon ● all well · $x of $y today · a/b slots, or on the
//        │      setup token its tokens and "cost not known on the setup token", never a $ figure
//        ├──▶ the pane, opened by the band or /terylon-cockpit, never by itself:
//        │      the overview ── tiles · Waiting for you ──▶ question · story · plan
//        │        │              goals_list · plans_list ──▶ one card per goal, its road from hooks/road.ts ──▶ goal ──▶ story
//        │        │              folds: Done today · Queued · History; a new goal is goal_add
//        │        ├──▶ Notices ──▶ Notices, a screen of its own
//        │        └──▶ System ──▶ More: Health · Memory on one page, at its top
//        │             each the primary button while something behind it waits; on the terminal a dot before the word
//        └──▶ the done-signal: $.prompt.submit once per story and verdict commit, and a toast, by the story's ref
//   session start, away > 2 h ──▶ ONE catch-up summary, and the band says it until dismissed
//   a host proof's subjects ──▶ no prompt, no band count, no catch-up line
//   "Add" ──▶ tasks_add, which becomes a plan the owner approves in the console
//
// The mod holds no rule the endpoint does not: every decision is a Link to the console.
//
// THE DRAWING is S32's (#25), on the 2.1.304 mod API: a row is one Button, type has a size and a weight, numbers
// are tabular, a road and the spend are Svg (hooks/drawing.ts), the pickers are Selects, the allow rules Code. What
// 2.1.304 declares but Desktop has not proven sits behind TERYLON_PANE_PROOFS and draws 1.1.2 until named.

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
  PaneGoalCard,
  PaneGoal,
  PaneGoals,
  PaneRepeating,
  PaneRepeatingRun,
  PaneRevise,
  PanePlan,
  PaneMemory,
  PaneOverview,
  PaneTestMode,
  PanePolicyForm,
  PaneRoadStep,
  PaneScreen,
  PaneSnapshot,
  PaneSpecFile,
  PaneSpecPicker,
  PaneSpecView,
  PaneStory,
  PaneView,
} from '../types'

import { COPY } from './copy'
import { CARD_FILL, CHIP_BACKGROUND, CHIP_DOT, CHIP_WORD, NARROW_COLUMNS, ROAD_CARD_HEIGHT, WAITING_TILE_FILL, NARROW_TERMINAL_COLUMNS, ROAD_NAMES_COLUMNS, WIDE_COLUMNS, phaseGlyph, planChain, planOrder, proofsOf, road, roadCells, spendBar, splitHash } from './drawing'
import type { Picture, Proofs } from './drawing'
import { REASON_WHOLE, alertCount, checkTree, healthLine, plainLine, stateWord, statusDrawingOf, storeFileOf, todayCost, treeLine, typedLine } from './health'
import type { Health, StatusPart } from './health'
import { MISSING_SERVER, NEEDS_TEXT, NOT_ALLOWED, SERVER_CANDIDATES, TEXT_LIMITS, actArguments, allowRules, assertPaneTool, isSendable, readResult } from './terylon'
import type { TerylonAnswer } from './terylon'
import { createTestWorld, testAnswer } from './testmode'
import type { TestWorld } from './testmode'
import { goalCardsOf, isClosedGoal, phaseSteps, repeatingWords, roadOf, roadPlansOf, roadStoriesOf, storyNext } from './road'
import { CARD_STROKES, kindTone, markOf } from './tones'
import * as words from './words'
import {
  alertItems,
  bellView,
  clock,
  consoleLink,
  costBasisOf,
  deleteLink,
  goalLink,
  dayBudget,
  doneTodayItems,
  filesOf,
  firstLine,
  goalItems,
  header,
  hostName,
  isHostProof,
  isListStory,
  isRepositoryTarget,
  list,
  monthOf,
  number,
  pausedOf,
  planItems,
  policyArguments,
  policyChanges,
  policyFieldLabel,
  policyProblems,
  policyRows,
  policyValue,
  planLink,
  POLICY_FIELDS,
  proposalItems,
  questionChoices,
  questionItems,
  queuedItems,
  refOf,
  repeatingOf,
  runDay,
  runningItems,
  spend,
  storyLink,
  storyView,
  text,
  verifiedIds,
  waitingItems,
} from './queue'
import type { Zone } from './queue'
import {
  CATCH_UP_AFTER_MS,
  CATCH_UP_MOST_EVENTS,
  EVENTS_PAGE,
  SIGNALS_KEPT,
  candidatesFromEvents,
  candidatesFromFlight,
  catchUpSummary,
  coalesce,
  deletedGoalsOf,
  goalOfStory,
  heldOf,
  isDeletedSentence,
  settleCandidate,
  signalFor,
  signalKey,
  signalsSummary,
  verdictOf,
  withoutDeletedGoals,
} from './signals'
import type { Candidate, Signal, Verdict } from './signals'
import { attach, bytesText, charactersText, markdownFilesOf, pathIn, specFilesOf, specificationOf, specificationProblem } from './specification'

type Json = Record<string, unknown>

// WHY THE PANE STARTS OVER: the head Terylon's reset answered with, or none where the epoch it sent was refused.
type Reset = { from: number; head: number | null; refused: string | null }

// The pane's id: ONE pane, More a page of it. No command the mod registers shares a skill's name: the skill would win (a node test holds it).
export const PANE = 'terylon'

// The mod's version, said on Health: a node test holds it to plugin.json.
export const MOD_VERSION = '1.21.1'

// How often the pane asks Terylon, and how often it retries while Terylon does not answer.
export const POLL_MS = 30000
export const RETRY_MS = 60000

// THE WATCHDOG: events_since unanswered for longer than three ticks while the queue reads is a problem, whatever
// stopped it, a call never made included.
export const EVENTS_SILENT_MILLISECONDS = 3 * POLL_MS

// How often the watchdog looks: often enough that the problem is said within ten seconds of its bound.
const WATCH_MILLISECONDS = 10000

// How many criteria and timeline rows a story shows before "další N ▾".
const CRITERIA_SHOWN = 2
// What the machine did: its latest in the open, the rest a press away.
const MACHINE_SHOWN = 3
const TIMELINE_SHOWN = 4

// Health's parts in the order it draws them, as its debug line names them.
const STATUS_DRAWN = ['machine', 'gauges', 'problems', 'events', 'alerts', 'outcomes', 'policy', 'diagnostics'] as const

// HOW LONG A SCREEN'S LOAD MAY TAKE before it is said as its error: under Desktop's own 10 s bound on a press
// (`ui.press: … did not answer within 10000ms`), so the error is written while the press is still answered.
const LOAD_BOUND_MILLISECONDS = 8000

// HOW LONG THE SAME PROMPT IS NOT POSTED AGAIN: the operator's walk of 1.1.1 found question 22 posted into the
// chat twice from one screen.
const PROMPT_REPEAT_MILLISECONDS = 60000

// What the store keeps across sessions: where the pane last read the events, when, and what it signalled.
const STORE_LAST_SEQ = 'lastSeq'
// THE EVENT LOG'S IDENTITY, kept beside lastSeq: a sequence means something only within its epoch.
const STORE_EPOCH = 'epoch'
// HOW events_since REFUSES AN EPOCH IT CANNOT READ (a 400): the pane forgets the one it sent and starts over.
const EPOCH_REFUSAL = /'epoch' is the log's identity as an earlier answer gave it/
const STORE_LAST_SEEN_AT = 'lastSeenAt'
const STORE_SIGNALLED = 'signalled'
// THE SIGNALS HELD FOR A TURN'S END, kept before lastSeq moves past their events: a restart before the turn ends, or a
// prompt that did not enter, loses none of them, and the next signaller posts them once.
const STORE_HELD = 'held'
// ONE SIGNALLER PER MACHINE: every open session runs the mod, and only the session holding this lease reads the events,
// posts and toasts. Its holder renews it every tick; one not renewed for three ticks has lapsed.
const STORE_SIGNALLER = 'signaller'
const LEASE_MILLISECONDS = 3 * POLL_MS

// HOW LONG ONE $.store CALL MAY TAKE before the pane goes on with what it keeps in memory: a store that never answers
// must not hold the poll, which waits for its last tick to end.
const STORE_BOUND_MILLISECONDS = 2000

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
  stories: [],
  questions: [],
  events: null,
  eventsAnsweredAt: null,
  eventsWatchedSince: null,
  eventsSilentSince: null,
  signaller: 'none',
  signallerSince: null,
  signallerMissingSince: null,
  signallerHolder: null,
  sessionIdSource: 'fallback',
  costKnown: true,
  runningTokens: null,
  costBasis: null,
}

const QUEUE: PaneScreen = { screen: 'queue' }

const EMPTY_ADD: PaneAdd = { phase: 'form', title: '', criteria: '', goal: '', after: '', size: 'M', files: '', goals: [], repositoryGoals: [], stories: [], sentence: null, link: null, problem: null, sent: null }

const EMPTY_MEMORY: PaneMemory = { phase: 'loading', files: [], rules: [], pending: 0, proposals: [], edit: null, sentence: null, proposed: [] }

const NO_ACT: PaneAct = { open: null, text: '', busy: null, outcome: null }

const EMPTY_POLICY_FORM: PanePolicyForm = { isEditing: false, values: {} }

// A new goal goes to Terylon's own list at priority 2 unless the owner picks otherwise: goal_add's own defaults.
const DEFAULT_PRIORITY = '2'
const OWN_LIST = 'list'

const EMPTY_GOALS: PaneGoals = { phase: 'loading', sentence: null, open: [], closed: [], plans: [], draft: '', ask: '', priority: DEFAULT_PRIORITY, target: OWN_LIST, targets: [], adding: 'idle', addSentence: null, showing: 'open', closedCount: 0, closedFrom: 'list', closedPhase: 'idle', closedSentence: null }

// THE FOLDER A SPECIFICATION IS PICKED FROM: the session's own, until the owner names another.
const SESSION_FOLDER = '.'

// A PATH THAT NEEDS NO FOLDER BEFORE IT: /x, \x or C:\x.
const ABSOLUTE_PATH = /^([A-Za-z]:)?[\\/]/

const EMPTY_PICKER: PaneSpecPicker = { folder: '', listedFolder: SESSION_FOLDER, phase: 'idle', sentence: null, listed: [], attached: [] }

const EMPTY_OVERVIEW: PaneOverview = { month: null, memoryPending: null }

const EMPTY_TEST_MODE: PaneTestMode = { isOn: false, note: null }

// Where a console link of a made-up subject leads while test mode is on: nowhere, never the real console.
const TEST_CONSOLE = 'https://test-mode.invalid'

const EMPTY_BELL: PaneBell = { phase: 'loading', sentence: null, unhandledCount: 0, unhandled: [], handled: [], metrics: [], handling: null, handleSentence: null }

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
const overview = atom({ plugin: 'terylon-pane', key: 'overview' } as const, EMPTY_OVERVIEW)
const open = atom({ plugin: 'terylon-pane', key: 'open' } as const, [] as string[])
const acts = atom({ plugin: 'terylon-pane', key: 'acts' } as const, {} as Record<string, PaneAct>)
const policyForm = atom({ plugin: 'terylon-pane', key: 'policyForm' } as const, EMPTY_POLICY_FORM)
const rulesAsked = atom({ plugin: 'terylon-pane', key: 'rulesAsked' } as const, false)
// A GOAL'S SPECIFICATION (Terylon S53): the new goal's files, a goal's revise form, and one version drawn read-only.
const specPicker = atom({ plugin: 'terylon-pane', key: 'specPicker' } as const, EMPTY_PICKER)
const revise = atom({ plugin: 'terylon-pane', key: 'revise' } as const, null as PaneRevise | null)
const specView = atom({ plugin: 'terylon-pane', key: 'specView' } as const, null as PaneSpecView | null)
// TEST MODE, this session's alone: in $.state and never in $.store, so no other session hears of it.
const testMode = atom({ plugin: 'terylon-pane', key: 'testMode' } as const, EMPTY_TEST_MODE)

// TEST MODE'S MADE-UP TERYLON, in memory: lost on a reload and made anew, gone when test mode ends.
let testWorld: TestWorld | null = null

// What the last answers were: the module's own, lost on a reload and refilled by the next poll.
let lastFlight: Json = {}
let lastBriefing: Json = {}
let lastStories: Json[] = []
let policy: Json | null = null
let lastAttemptAt = 0
let isPolling = false

// THE BASIS TODAY'S COST IS SAID ON, as the briefing names it: 'setup-token' says no $ figure anywhere.
let costBasis: string | null = null

// A HOST PROOF'S STORIES, as Terylon's answers name them by `source`: none reaches a prompt, the band or the catch-up.
const hostProofStories = new Set<number>()

// TERYLON'S SHORT IDS, by kind and number ("story-333" → "S-BD6XS"), from every answer the pane reads: the label a
// screen names its subject by where it holds only the number. Lost on a reload, refilled by the next read.
const refs = new Map<string, string>()

function rememberRefs(kind: 'story' | 'goal' | 'plan', items: readonly Json[]): void {
  for (const item of items) {
    const id = number(item.id)
    const ref = text(item.ref)

    if (id !== null && ref !== null) {
      refs.set(`${kind}-${id}`, ref)
    }

    const goal = number(item.goal)
    const goalRef = text(item.goalRef)

    if (kind !== 'goal' && goal !== null && goalRef !== null) {
      refs.set(`goal-${goal}`, goalRef)
    }
  }
}

// A subject's label: its ref, else a hash and its number for a story and the bare number for a goal or a plan, as before refs.
function labelOf(kind: 'story' | 'goal' | 'plan', id: number): string {
  return refs.get(`${kind}-${id}`) ?? (kind === 'story' ? `#${id}` : String(id))
}

// What a console address names a subject by: its ref where it is known, else its number.
function refItem(kind: 'story' | 'goal' | 'plan', id: number): Json {
  const ref = refs.get(`${kind}-${id}`)

  return ref === undefined ? {} : { ref }
}

// AN ANSWER WITHOUT A HOST PROOF'S SUBJECTS: a story, a plan or a question whose source says so, or a story the pane
// already knows as one, is left out, and every story it names is remembered as one.
function withoutHostProof(items: unknown, isStory = true): Json[] {
  return list(items).filter(item => {
    const id = isStory ? number(item.id) ?? number(item.story) : null

    if (isHostProof(item)) {
      if (id !== null) {
        hostProofStories.add(id)
      }

      return false
    }

    return id === null || !hostProofStories.has(id)
  })
}

// THIS SESSION, as the lease names it: its id, whether nobody is at it, whether its band or pane was drawn, and when
// the owner last typed in it.
let sessionId = ''
let isUnattended = false
// THE SESSION'S WORKING DIRECTORY, as session.start names it: the folder a specification's files are listed from, and
// the one a relative folder is read under. The engine's own until it is heard.
let sessionFolder = SESSION_FOLDER
let isSeen = false
let typedAt: number | null = null

// WHETHER THE MAIN LOOP'S TURN RUNS, from turn.start and turn.complete: a prompt submitted meanwhile waits for its end.
let isTurnRunning = false
// The done-signal's candidates found while a turn ran, and the keys already toasted for them; bounded.
const HELD_MOST = 200
const held: Candidate[] = []
const heldToasted: string[] = []
// Whether this session has read back what an earlier one held: once, on its first read of the events as the signaller.
let isHeldRestored = false
// A TURN THAT NEVER ENDS, its turn.complete never heard, would hold every signal for good: past this it is taken as ended.
const TURN_LONGEST_MILLISECONDS = 30 * 60 * 1000
let turnStartedAt = 0
let answeringServer: string | null = null

// WHAT AN ACT JUST CHANGED, drawn at once and kept until Terylon's own answer shows the subject moved (the owner's walk
// of 1.5.0, #35): the leader takes an act before its read models catch up, so a read right after ✓ still answered the
// old state, and the card stayed one poll stale. Keyed by subject ("plan-41", "goal-3"); the state it was acted from,
// and the state it reads until Terylon's answer leaves the first. Bounded, so a lost act cannot hold a card for good.
const SETTLE_MILLISECONDS = 300000

// The states of a story that has ended: no stage is reported any more, and its phases say how it ended instead.
const ENDED_STORY_STATES: readonly string[] = ['merged', 'accepted', 'abandoned']

// The states of a story that has not ended: what a goal's drop abandons (Terylon S35, #388).
const OPEN_STORY_STATES: readonly string[] = ['approved', 'dispatched', 'running', 'blocked', 'pr-open', 'verifying', 'verified']
const settled = new Map<string, { from: readonly string[]; to: string; until: number }>()
// Where each verified story is kept, as story_get said it: `list`, or its repository's target.
const storyTargets = new Map<number, string>()
// THE GOALS DELETED FOR GOOD, and the stories deleted with them, as the feed or Terylon's answers said it this session:
// nothing of them is listed, opened as a failure or signalled again.
const deletedGoals = new Set<number>()
const deletedStories = new Set<number>()

// WHAT THE PANE KEEPS IN $.store, mirrored here: where a store refuses, the session still reads from its last place and
// signals each story once, and only a return after Desktop was closed is lost.
const keptInMemory = new Map<string, unknown>()
// How often the store refused in this tick's read of the events: Health's problem stays while it is not 0.
let storeRefusals = 0

// THE PANE'S OWN LOG, the debug lines it wrote last, drawn on the overview under TERYLON_PANE_STATUS=log: a host that
// writes no log the owner can read still shows what the pane did and saw.
const NOTES_KEPT = 40
const notes: string[] = []
let notesWritten = 0

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
  } else if (tool === 'story_accept') {
    settled.set(`story-${subject}`, { from: ['verified'], to: 'accepted', until })
  }
}

// A story as Terylon answered it, or accepted where the owner just accepted it: a list story stays one.
function settledStory(document: Json, id: number, now: number): Json {
  if (typeof document.state !== 'string') {
    return document
  }

  const state = settledState(`story-${id}`, document.state, now)

  return state === document.state ? document : { ...document, state, target: document.target ?? 'list' }
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

  // TEST MODE'S ONE GATE: this is the single route to $.mcp.call, and with it on every call is answered here.
  if ((await read($, testMode)).isOn) {
    const now = await $.clock.now()
    testWorld = testWorld ?? createTestWorld(now)

    return testAnswer(testWorld, tool, args, now)
  }

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
  if ((await read($, testMode)).isOn) {
    return TEST_CONSOLE
  }

  return ((await $.env.get('TERYLON_URL')) ?? '').replace(/\/+$/, '')
}

function zoneOffset(now: number): number {
  return new Date(now).getTimezoneOffset()
}

function healthOf(current: PaneSnapshot, offset: Zone): Health {
  return {
    connection: current.connection,
    failingSince: current.failingSince === null ? null : clock(new Date(current.failingSince).toISOString(), offset),
    isPaused: current.paused !== null,
    alerts: current.alerts,
    runningUsd: current.runningUsd,
    dayBudget: current.dayBudget,
    slotsUsed: current.slotsUsed,
    slots: current.slots,
    isCostKnown: current.costKnown !== false,
    tokens: current.runningTokens ?? null,
  }
}

// Something the owner should look at: the connection, the leader paused, an alert. A part TERYLON_PANE_STATUS leaves
// out lights no ⚠, so the tab never warns over a list that shows nothing.
function hasProblem(current: PaneSnapshot, off: ReadonlySet<StatusPart> = new Set()): boolean {
  if (off.has('problems')) {
    return false
  }

  return (current.connection !== 'ok' && current.connection !== 'connecting') || current.paused !== null || (!off.has('alerts') && current.alerts > 0) || (!off.has('events') && (current.events !== null || isEventsSilent(current) || current.signallerMissingSince !== null))
}

// The watchdog's finding, said while the queue reads and no failure of events_since says why already.
function isEventsSilent(current: PaneSnapshot): boolean {
  return current.eventsSilentSince !== null && current.connection === 'ok' && current.events === null
}

// THE WATCHDOG, on a timer of its own: a tick held for good, or one that never reaches the call, still ends here.
async function watchEvents($: EngineInterface): Promise<void> {
  const now = await $.clock.now()

  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => {
    const since = current.eventsAnsweredAt ?? current.eventsWatchedSince
    // ANOTHER SESSION READS THE EVENTS while this one does not hold the lease: its silence is no problem.
    const silentSince = current.signaller === 'this' && since !== null && now - since > EVENTS_SILENT_MILLISECONDS ? since : null
    // NO SESSION POSTS THE DONE-SIGNAL for longer than a lease: a problem, never a quiet "none".
    const missingSince = current.signaller === 'none' && current.signallerSince !== null && now - current.signallerSince > LEASE_MILLISECONDS ? current.signallerSince : null

    return silentSince === current.eventsSilentSince && missingSince === current.signallerMissingSince ? current : { ...EMPTY_SNAPSHOT, ...current, eventsSilentSince: silentSince, signallerMissingSince: missingSince }
  })
}

// THE STATUS LINE: the worst of the machine's health, or its spend when all is well.
async function showHealth($: EngineInterface): Promise<void> {
  const current = await readSnapshot($)
  const line = healthLine(healthOf(current, zoneOffset))

  $.ui.status((await read($, testMode)).isOn ? COPY.testStatus(line) : line)
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
  const alertNotices = notices.kind === 'ok' ? alertItems(notices.value, now, zoneOffset) : previous.alertNotices

  if (policy === null) {
    const answered = await callTerylon($, 'policy_get')
    policy = answered.kind === 'ok' ? policyAfterSave(answered.value, now) : null
  }

  // A HOST PROOF'S SUBJECTS LEAVE EVERY ANSWER FIRST: no count of the band, no prompt and no catch-up says them.
  lastStories = withoutHostProof(stories.value.stories)
  lastFlight = { ...flight.value, stories: withoutHostProof(flight.value.stories) }
  costBasis = costBasisOf(briefing.value, flight.value)
  rememberRefs('story', [...lastStories, ...list(lastFlight.stories), ...list(briefing.value.storiesVerified), ...list(briefing.value.storiesBlocked)])
  rememberRefs('plan', list(briefing.value.plansWaiting))
  // A PLAN THE OWNER JUST DECIDED leaves "Waiting for you" at once, whatever the briefing still lists (#35).
  lastBriefing = {
    ...briefing.value,
    // A plan the briefing names by number alone takes the ref plans_list gave it.
    plansWaiting: withoutHostProof(briefing.value.plansWaiting, false).filter(plan => settledState(`plan-${number(plan.id) ?? 0}`, 'proposed', now) === 'proposed').map(plan => (text(plan.ref) === null ? { ...plan, ...refItem('plan', number(plan.id) ?? 0) } : plan)),
    storiesVerified: await withTargets($, withoutHostProof(briefing.value.storiesVerified).filter(item => settledState(`story-${number(item.id) ?? 0}`, 'verified', now) === 'verified'), lastStories),
    storiesBlocked: withoutHostProof(briefing.value.storiesBlocked),
    questionsOpen: withoutHostProof(briefing.value.questionsOpen, false),
  }

  const base = await baseUrl($)
  const offset = zoneOffset
  const running = runningItems(lastFlight, offset, verifiedIds(lastBriefing), costBasis, now)
  const spent = spend(lastFlight, costBasis)
  const inFlight = new Set(running.map(item => item.story))
  const paused = pausedOf((lastBriefing.leader ?? null) as Json | null, lastFlight.paused === true, offset)
  const slots = number(lastFlight.slots) ?? number(policy?.slots) ?? 0
  const queuedStories = await withHeldReasons($, lastStories, inFlight)

  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => ({
    connection: 'ok',
    problem: null,
    fetchedAt: now,
    failingSince: null,
    header: header(lastFlight, policy, costBasis),
    runningUsd: spent.usd.toFixed(2),
    costKnown: spent.isKnown,
    runningTokens: spent.tokens,
    costBasis,
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
    doneToday: doneTodayItems(lastStories, now, offset, costBasis),
    stories: roadStories(now),
    // THE DONE-SIGNAL'S PROBLEM IS ITS OWN: a good read of the queue says nothing of events_since or the store.
    events: current.events ?? null,
    eventsAnsweredAt: current.eventsAnsweredAt ?? null,
    eventsWatchedSince: current.eventsWatchedSince ?? null,
    eventsSilentSince: current.eventsSilentSince ?? null,
    signaller: current.signaller ?? 'none',
    signallerSince: current.signallerSince ?? null,
    signallerMissingSince: current.signallerMissingSince ?? null,
    signallerHolder: current.signallerHolder ?? null,
    sessionIdSource: current.sessionIdSource ?? 'fallback',
    questions: questionItems(lastBriefing),
  }))
  await showHealth($)

  return true
}

// Every story of the last answers as a goal's road reads it, an act the owner just took laid over a read that lags.
function roadStories(now: number) {
  return roadStoriesOf(lastStories, lastFlight, lastBriefing, costBasis, (id, state) => settledState(`story-${id}`, state, now))
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

// A line in `claude --debug` under terylon-pane: for the events path, so a run shows where the call stops.
// A line for claude --debug and for the pane's own log, numbered so that two reads of the log can be told apart.
function note($: EngineInterface, line: string): void {
  $.ui.log(line, { to: 'debug' })
  notesWritten += 1
  notes.push(`${notesWritten} ${line}`)
  notes.splice(0, Math.max(0, notes.length - NOTES_KEPT))
}

function debug($: EngineInterface, line: string): void {
  note($, `terylon-pane: events: ${line}`)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// WHY THE DONE-SIGNAL CANNOT RUN, on Health until a whole read of the events succeeds; the first failure's time.
async function eventsFailed($: EngineInterface, kind: NonNullable<PaneSnapshot['events']>['kind'], reason: string): Promise<void> {
  const now = await $.clock.now()
  debug($, `stopped (${kind}): ${reason}`)
  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => ({
    ...EMPTY_SNAPSHOT,
    ...current,
    events: { kind, reason, since: current.events?.kind === kind ? current.events.since : now },
  }))
}

// One $.store call, bounded: what it answers, or the error it rejected with, or that it did not answer.
async function storeCall<T>($: EngineInterface, work: () => Promise<T>): Promise<{ value: T } | { error: string }> {
  const timedOut = new Promise<{ error: string }>(resolve => {
    $.clock.after(STORE_BOUND_MILLISECONDS, () => resolve({ error: COPY.storeTimedOut(STORE_BOUND_MILLISECONDS / 1000) }))
  })
  const finished = work().then(
    (value: T): { value: T } => ({ value }),
    (error: unknown): { error: string } => ({ error: messageOf(error) }),
  )

  return Promise.race([finished, timedOut])
}

// A value the pane keeps: the store's, else what this session kept in memory. A store that refuses is said, not thrown.
async function kept($: EngineInterface, key: string): Promise<unknown> {
  const answered = await storeCall($, () => $.store.get(key))

  if ('error' in answered) {
    storeRefusals += 1
    await eventsFailed($, 'store', COPY.storeReadFailed(key, answered.error))

    return keptInMemory.get(key)
  }

  return answered.value === undefined ? keptInMemory.get(key) : answered.value
}

async function keep($: EngineInterface, key: string, value: unknown): Promise<void> {
  keptInMemory.set(key, value)

  const answered = await storeCall($, () => $.store.set(key, value))

  if ('error' in answered) {
    storeRefusals += 1
    await eventsFailed($, 'store', COPY.storeWriteFailed(key, answered.error))
  }
}

// AN EPOCH IS WRITTEN ONLY ONCE ONE IS KNOWN: a blank or a value of another type reads as none, never as an epoch.
async function keepEpoch($: EngineInterface, epoch: string | null): Promise<void> {
  if (epoch !== null) {
    await keep($, STORE_EPOCH, epoch)
  }
}

// A KEY TAKEN OUT OF THE STORE: a blank epoch an earlier version wrote, so an unknown epoch is an absent key, or the
// epoch and position a start over leaves behind.
async function forget($: EngineInterface, key: string): Promise<void> {
  keptInMemory.delete(key)

  const answered = await storeCall($, () => $.store.delete(key))

  if ('error' in answered) {
    storeRefusals += 1
    await eventsFailed($, 'store', COPY.storeWriteFailed(key, answered.error))
  }
}

async function signalled($: EngineInterface): Promise<string[]> {
  const value = await kept($, STORE_SIGNALLED)

  return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : []
}

async function verdictFor($: EngineInterface, candidate: Candidate): Promise<Verdict | null> {
  if (candidate.kind !== 'verified') {
    return null
  }

  const answered = await callTerylon($, 'story_get', { story: candidate.story })

  return answered.kind === 'ok' ? verdictOf(answered.value) : null
}

// events_since answered: the watchdog's clock starts again.
async function eventsAnswered($: EngineInterface): Promise<void> {
  const now = await $.clock.now()

  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => ({ ...EMPTY_SNAPSHOT, ...current, eventsAnsweredAt: now, eventsSilentSince: null }))
}

// events_since did not answer as the owner's: the same kinds as the poll's own problem.
async function eventsRefused($: EngineInterface, answered: TerylonAnswer): Promise<void> {
  const kind = answered.kind === 'ok' ? 'failed' : answered.kind === 'refused' ? 'refused' : answered.kind

  await eventsFailed($, kind, why(answered) || COPY.noServerTitle)
}

// GOALS DELETED FOR GOOD: dropped from the overview, its plans, the queue's questions and every settled act; an open
// goal screen of one says so quietly. The stories known under them are dropped with them.
async function forgetGoals($: EngineInterface, ids: readonly number[]): Promise<void> {
  if (ids.length === 0) {
    return
  }

  const gone = new Set(ids)
  const goalsNow = await readGoals($)
  const shownGoal = await read($, goal)
  const stories = [
    ...goalsNow.plans.filter(plan => gone.has(plan.goal)).flatMap(plan => plan.stories.map(item => item.id)),
    ...(shownGoal !== null && gone.has(shownGoal.goal) ? shownGoal.stories.map(item => item.id) : []),
  ]

  for (const id of ids) {
    deletedGoals.add(id)
    settled.delete(`goal-${id}`)
  }

  for (const id of stories) {
    deletedStories.add(id)
    settled.delete(`story-${id}`)
    storyTargets.delete(id)
  }

  debug($, `goals deleted: ${ids.join(', ')}; dropped with ${stories.length} of their stories`)
  await update($, goals, (current: PaneGoals): PaneGoals => {
    const closed = current.closed.filter(item => !gone.has(item.id))

    return {
      ...current,
      open: current.open.filter(item => !gone.has(item.id)),
      closed,
      // A DELETED GOAL READ IN HISTORY leaves its count too; one never read there is counted again by the next poll.
      closedCount: Math.max(0, current.closedCount - (current.closed.length - closed.length)),
      plans: current.plans.filter(plan => !gone.has(plan.goal)),
    }
  })
  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => ({
    ...EMPTY_SNAPSHOT,
    ...current,
    questions: (current.questions ?? []).filter(item => !ids.some(id => item.subject === `goal/${id}`)),
  }))

  const shownStory = await read($, story)

  if (shownStory !== null && shownStory.goal !== null && gone.has(shownStory.goal)) {
    deletedStories.add(shownStory.story)
    await update($, story, (current: PaneStory | null): PaneStory | null => (current === null || current.story !== shownStory.story ? current : { ...current, phase: 'deleted', sentence: COPY.storyDeleted(shownStory.story) }))
  }

  if (shownGoal !== null && gone.has(shownGoal.goal)) {
    await update($, goal, (current: PaneGoal | null): PaneGoal | null => (current === null || current.goal !== shownGoal.goal ? current : { ...current, phase: 'deleted', sentence: COPY.goalDeleted(shownGoal.goal) }))
  }
}

// WHETHER AN ANSWER OF events_since MEANS TERYLON'S HISTORY WAS RESET, in this order: it says so; its epoch is known
// and not the pane's; or, from a server that names no epoch, its head is below the since asked.
function isReset(page: Json, since: number, epoch: string | null): boolean {
  if (page.reset === true) {
    return true
  }

  const answered = text(page.epoch)

  if (epoch !== null && answered !== null && answered !== epoch) {
    return true
  }

  const head = number(page.head)

  return head !== null && head < since
}

// Reads events_since from the stored position, page by page, up to `most` events; its epoch is sent once known.
async function readEvents($: EngineInterface, since: number, epoch: string | null, most: number): Promise<{ events: Json[]; last: number; epoch: string | null; isWhole: boolean; reset: Reset | null } | null> {
  const events: Json[] = []
  let from = since
  let known = epoch

  for (;;) {
    debug($, `calling events_since since ${from}${known === null ? '' : ` in epoch ${known}`}`)
    const answered = await callTerylon($, 'events_since', known === null ? { since: from, limit: EVENTS_PAGE } : { since: from, epoch: known, limit: EVENTS_PAGE })

    // AN EPOCH TERYLON CANNOT READ, refused every tick it is sent: forgotten, and the pane starts over from the head.
    if (answered.kind === 'refused' && known !== null && (answered.status === 400 || answered.status === null) && EPOCH_REFUSAL.test(answered.sentence)) {
      await eventsAnswered($)

      return { events: [], last: from, epoch: null, isWhole: true, reset: { from, head: null, refused: known } }
    }

    if (answered.kind !== 'ok') {
      await eventsRefused($, answered)

      return null
    }

    await eventsAnswered($)

    const page = answered.value
    const head = number(page.head)

    // A RESET WINS OVER A GAP: the old history is gone, so nothing of it is summed up.
    if (isReset(page, from, known)) {
      return { events: [], last: head ?? number(page.last) ?? 0, epoch: text(page.epoch), isWhole: true, reset: { from, head: head ?? number(page.last) ?? 0, refused: null } }
    }

    known = text(page.epoch) ?? known
    events.push(...list(page.events))
    from = number(page.last) ?? from
    debug($, `events_since answered ${list(page.events).length} events, last ${from}${page.more === true ? ', more' : ''}${page.gap === true ? ', a gap' : ''}`)

    if (page.gap === true || events.length > most) {
      return { events, last: head ?? from, epoch: known, isWhole: false, reset: null }
    }

    if (page.more !== true) {
      return { events, last: from, epoch: known, isWhole: true, reset: null }
    }
  }
}

// Each story's latest move alone, read again with story_get, and only what no earlier signal told.
async function settleSignals($: EngineInterface, candidates: Candidate[], done: string[]): Promise<Signal[]> {
  const signals: Signal[] = []
  const now = await $.clock.now()

  for (const candidate of coalesce(candidates)) {
    if (deletedStories.has(candidate.story)) {
      debug($, `not posting ${candidate.story}:${candidate.kind}: the story was deleted with its goal`)
      continue
    }

    const answered = await callTerylon($, 'story_get', { story: candidate.story })

    // A STORY DELETED WITH ITS GOAL asks nothing: story_get says so in a sentence, or names a goal the feed deleted.
    if ((answered.kind === 'refused' && isDeletedSentence(answered.sentence)) || (answered.kind === 'ok' && deletedGoals.has(goalOfStory(answered.value) ?? -1))) {
      deletedStories.add(candidate.story)
      debug($, `not posting ${candidate.story}:${candidate.kind}: the story was deleted with its goal`)
      continue
    }

    // A HOST PROOF'S STORY TELLS NOBODY: its source, read again right before the post, says so.
    if ((answered.kind === 'ok' && isHostProof(answered.value)) || hostProofStories.has(candidate.story)) {
      hostProofStories.add(candidate.story)
      debug($, `not posting ${candidate.story}:${candidate.kind}: the story is a host proof's`)
      continue
    }

    // AN ACCEPT PRESSED IN THE PANE stands over a story_get that lags, or that did not answer.
    const story = answered.kind === 'ok'
      ? settledStory(answered.value, candidate.story, now)
      : settled.has(`story-${candidate.story}`) ? settledStory({ id: candidate.story, state: 'verified' }, candidate.story, now) : null
    const settled_ = settleCandidate(candidate, story)

    if (settled_ === null) {
      debug($, `not posting ${candidate.story}:${candidate.kind}: the story is ${text(story?.state) ?? 'moved on'} now`)
      continue
    }

    const verdict = settled_.kind === 'verified' && story !== null ? verdictOf(story) : null
    const key = signalKey(settled_, verdict)

    if (done.includes(key)) {
      continue
    }

    done.push(key)
    // THE STORY BY ITS REF, as story_get names it right before the post, else as the event or the list named it.
    const ref = (story === null ? null : text(story.ref)) ?? settled_.ref ?? refs.get(`story-${candidate.story}`) ?? null
    signals.push(signalFor({ ...settled_, ref }, verdict))
  }

  return signals
}

function toastOf(signals: Signal[]): string {
  return signals.length === 1 ? signals[0]?.toast ?? '' : signalsSummary(signals).toast
}

// THE DONE-SIGNAL: once per story and verdict commit, several in one summary, one turn. A PROMPT WAITS FOR THE RUNNING
// TURN, so one found while a turn runs is held: its toast goes now, and its prompt only at the turn's end, read again.
async function postSignals($: EngineInterface, candidates: Candidate[]): Promise<void> {
  const done = await signalled($)

  if (isTurnRunning) {
    const signals = await settleSignals($, candidates, [...done, ...heldToasted])
    held.push(...candidates)
    held.splice(0, Math.max(0, held.length - HELD_MOST))
    await keepHeld($)

    if (signals.length > 0) {
      heldToasted.push(...signals.map(signal => signal.key))
      debug($, `holding the done-signal ${signals.map(signal => signal.key).join(', ')} until the turn ends`)
      $.ui.toast(toastOf(signals))
    }

    return
  }

  const toasted = heldToasted.splice(0)
  const read_ = [...held.splice(0), ...candidates]
  const signals = await settleSignals($, read_, done)

  if (signals.length === 0) {
    if (read_.length > 0) {
      await keepHeld($)
    }

    return
  }

  const posted = signals.length === 1 ? { prompt: signals[0]?.prompt ?? '', toast: signals[0]?.toast ?? '' } : signalsSummary(signals)
  const keys = signals.map(signal => signal.key).join(', ')
  debug($, `posting the done-signal ${keys}`)
  const entered = await submitted($, posted.prompt)

  // A KEY IS RECORDED ONLY ONCE ITS PROMPT ENTERED: one dropped or refused is held, read again and posted next time.
  if (entered !== true) {
    held.push(...read_)
    await keepHeld($)
    debug($, `the done-signal ${keys} did not enter the session (${entered}); it is told on the next read`)

    return
  }

  await keep($, STORE_SIGNALLED, done.slice(-SIGNALS_KEPT))
  await keepHeld($)

  if (signals.some(signal => !toasted.includes(signal.key))) {
    $.ui.toast(posted.toast)
  }
}

async function keepHeld($: EngineInterface): Promise<void> {
  await keep($, STORE_HELD, held.map(candidate => ({ ...candidate })))
}

// Whether a prompt entered the session: true, or why not, a hook's drop or the engine's refusal.
async function submitted($: EngineInterface, text: string): Promise<true | string> {
  try {
    const result: unknown = await $.prompt.submit({ text })

    if (result !== null && typeof result === 'object' && 'drop' in result) {
      return `dropped: ${String((result as { drop: unknown }).drop)}`
    }

    return true
  } catch (error) {
    // A refused submit is said and retried, never taken for a post.
    return `refused: ${messageOf(error)}`
  }
}

// The turn ended: what was held is read again and posted, unless a tick is reading the events, which posts it itself.
async function flushHeld($: EngineInterface): Promise<void> {
  if (isPolling || isTurnRunning || held.length === 0) {
    return
  }

  // WHAT WAS HELD WAITS: it is real, so it is posted once test mode ends.
  if ((await read($, testMode)).isOn) {
    return
  }

  isPolling = true

  try {
    await postSignals($, [])
  } catch (error) {
    await eventsFailed($, 'failed', messageOf(error))
  } finally {
    isPolling = false
  }
}

async function markSignalled($: EngineInterface, candidates: Candidate[]): Promise<void> {
  const done = await signalled($)

  for (const candidate of candidates) {
    done.push(signalKey(candidate, await verdictFor($, candidate)))
  }

  await keep($, STORE_SIGNALLED, done.slice(-SIGNALS_KEPT))
}

type Lease = { session: string; since: number; until: number; seen: boolean }

function leaseOf(value: unknown): Lease | null {
  if (value === null || typeof value !== 'object') {
    return null
  }

  const lease = value as Partial<Lease>

  return typeof lease.session === 'string' && typeof lease.since === 'number' && typeof lease.until === 'number' ? { session: lease.session, since: lease.since, until: lease.until, seen: lease.seen === true } : null
}

// Who signals, its id shortened, and since when; for none, since when this session has seen no signaller at all.
async function showSignaller($: EngineInterface, who: PaneSnapshot['signaller'], since: number | null, holder: string | null = null): Promise<void> {
  const now = await $.clock.now()
  const short = holder === null ? null : shortId(holder)

  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => {
    const at = who === 'none' ? (current.signaller === 'none' ? current.signallerSince ?? now : now) : since

    return current.signaller === who && current.signallerSince === at && current.signallerHolder === short ? current : { ...EMPTY_SNAPSHOT, ...current, signaller: who, signallerSince: at, signallerHolder: short }
  })
}

// An id as Diagnostics names it: its last eight characters, where a made one carries its nonce.
function shortId(id: string): string {
  return id.slice(-8)
}

// WHETHER THIS SESSION POSTS THE DONE-SIGNAL. A machine with no live lease always gets one: any attended session takes
// an empty or lapsed lease, and the one whose write is read back holds it. The owner's typing, or a band drawn where the
// holder's never was, moves it; a session nobody is at never takes it, and a lease naming this session is always renewed.
async function isSignaller($: EngineInterface, now: number): Promise<boolean> {
  const isOwners = isSeen || typedAt !== null
  const answered = await storeCall($, () => $.store.get(STORE_SIGNALLER))

  // A STORE THAT REFUSES keeps no lease: only a session the owner sees or types in posts.
  if ('error' in answered) {
    storeRefusals += 1
    await eventsFailed($, 'store', COPY.storeReadFailed(STORE_SIGNALLER, answered.error))
    await showSignaller($, isOwners ? 'this' : 'none', null)

    return isOwners
  }

  const lease = leaseOf(answered.value)
  const isMine = lease !== null && lease.session === sessionId

  // A SESSION TAKEN FOR UNATTENDED takes no lease, but renews its own: a module reloaded in place may hear a
  // session.start that says nobody is at the session that held it.
  if (isUnattended && !isOwners && !isMine) {
    await showSignaller($, 'none', null)

    return false
  }

  const isLive = lease !== null && lease.until > now
  const isTyped = typedAt !== null && lease !== null && typedAt > lease.since
  const mayTake = isMine || !isLive || isTyped || (isOwners && lease !== null && !lease.seen)

  if (!mayTake && lease !== null) {
    await showSignaller($, 'another', lease.since, lease.session)

    return false
  }

  const since = isMine && lease !== null ? lease.since : now
  const written = await storeCall($, () => $.store.set(STORE_SIGNALLER, { session: sessionId, since, until: now + LEASE_MILLISECONDS, seen: isOwners }))

  if ('error' in written) {
    await showSignaller($, isOwners ? 'this' : 'none', null)

    return isOwners
  }

  // COMPARE AND SET: two sessions that took an empty lease in one tick read it back, and only the last write holds it.
  const back = await storeCall($, () => $.store.get(STORE_SIGNALLER))
  const holder = 'error' in back ? null : leaseOf(back.value)

  if (holder !== null && holder.session !== sessionId) {
    await showSignaller($, 'another', holder.since, holder.session)

    return false
  }

  if (!isMine) {
    debug($, `this session takes the signaller lease${lease === null ? '' : ` from ${lease.session}`}`)
    // WHAT THE LAST HOLDER HELD is read back at this tick, and posted at it unless a turn runs here.
    isHeldRestored = false
    // THE WATCHDOG STARTS AGAIN with the lease: an answer this session had before it is no clock of today's.
    await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => ({ ...EMPTY_SNAPSHOT, ...current, eventsAnsweredAt: null, eventsWatchedSince: now, eventsSilentSince: null }))
  }

  await showSignaller($, 'this', since, sessionId)

  return true
}

// A NONCE MADE ONCE PER LOAD OF THE MODULE: sessions Desktop restores together start in one second, often in one
// directory, so their start and directory alone would name two sessions alike.
const MODULE_NONCE = moduleNonce()

function moduleNonce(): string {
  const random = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto

  return typeof random?.randomUUID === 'function' ? random.randomUUID() : `${Date.now().toString(36)}${String(Object.keys(globalThis).length)}`
}

// This session's id for the lease, and where it came from: the engine's session.id, or made here from the start,
// the directory and this load's nonce.
async function sessionIdOf($: EngineInterface, cwd: string): Promise<{ id: string; source: PaneSnapshot['sessionIdSource'] }> {
  try {
    return { id: await $.session.id(), source: 'session.id' }
  } catch {
    // An engine without session.id still needs a name: it is no secret, only told apart from another session's.
    return { id: `session-${await $.clock.now()}-${cwd}-${MODULE_NONCE}`, source: 'fallback' }
  }
}

// THE POLL, STARTED ONCE PER LOAD OF THE MODULE: by session.start, or, for a module updated in place in a running
// session that hears no session.start, by the first band, pane, prompt or turn it sees. Without it no session ticks,
// renews its lease or reads the events until one starts again.
let isStarted = false
// THE POLL'S OWN TIMERS, and when a tick last ran: a timer the host refused once never fires again, so a hook that
// finds no tick for longer than this starts the poll afresh, the old timers cancelled.
const pollTimers: { cancel?: () => void }[] = []
let tickedAt = 0
export const POLL_STALLED_MILLISECONDS = 2 * POLL_MS
// When the pane last drew the overview, and whether the poll is reading its goals.
let overviewDrawnAt = 0
let isGoalsPolling = false

async function start($: EngineInterface, cwd: string): Promise<void> {
  if (isStarted) {
    return
  }

  isStarted = true
  const own = await sessionIdOf($, cwd)
  sessionId = own.id
  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => ({ ...EMPTY_SNAPSHOT, ...current, sessionIdSource: own.source }))
  debug($, `this session's id is ${shortId(own.id)}, from ${own.source}`)
  const startedAt = await $.clock.now()
  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => ({ ...EMPTY_SNAPSHOT, ...current, eventsWatchedSince: startedAt }))
  await showHealth($)
  tickedAt = startedAt
  $.clock.after(0, () => tick($, true))
  startPoll($)
}

function startPoll($: EngineInterface): void {
  for (const timer of pollTimers.splice(0)) {
    timer.cancel?.()
  }

  pollTimers.push($.clock.every(POLL_MS, () => tick($, false)))
  pollTimers.push($.clock.every(WATCH_MILLISECONDS, () => watchEvents($)))
}

// EVERY HOOK KEEPS THE POLL GOING, after it answers: a module that never heard session.start starts it, and one whose
// poll has not ticked for longer than two polls starts it again and ticks at once.
function ensurePoll($: EngineInterface, hook: string): void {
  $.clock.after(0, async () => {
    if (!isStarted) {
      debug($, `the poll starts on ${hook}: this load of the module heard no session.start`)
      await start($, '')

      return
    }

    const now = await $.clock.now()

    if (now - tickedAt > POLL_STALLED_MILLISECONDS) {
      debug($, `the poll had not ticked for ${Math.round((now - tickedAt) / 1000)} s; ${hook} starts it again`)
      tickedAt = now
      startPoll($)
      await tick($, false)
    }
  })
}

// One tick: the queue, then what moved since the last look.
async function tick($: EngineInterface, isStart: boolean): Promise<void> {
  tickedAt = await $.clock.now()

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

    pollGoals($, now)

    // TEST MODE TAKES NO PART IN THE SIGNALS: no lease and no read of the shared store, and other sessions keep working.
    if ((await read($, testMode)).isOn) {
      return
    }

    if (!(await isSignaller($, now))) {
      return
    }

    if (isTurnRunning && now - turnStartedAt > TURN_LONGEST_MILLISECONDS) {
      isTurnRunning = false
      debug($, `the main loop's turn has not ended in ${TURN_LONGEST_MILLISECONDS / 60000} min; taken as ended, what it held is posted`)
    }

    // WHAT AN EARLIER SESSION HELD, read back when this one takes the lease: it posts here, re-read like any signal,
    // unless a turn runs here too.
    if (!isHeldRestored) {
      isHeldRestored = true
      held.push(...heldOf(await kept($, STORE_HELD), held))
    }

    await readMoved($, isStart, now)
  } catch (error) {
    // NOTHING OF A TICK IS LOST UNSAID: a timer drops what its callback rejects with, so it is said here instead.
    await eventsFailed($, 'failed', messageOf(error))
  } finally {
    isPolling = false

    // A TURN THAT ENDED WHILE THIS TICK RAN found it polling: what it held is posted now, not a tick later.
    if (!isTurnRunning && held.length > 0) {
      $.clock.after(0, () => flushHeld($))
    }
  }
}

// THE OVERVIEW'S GOALS FOLLOW THE POLL WHILE IT IS DRAWN: on a timer of its own, so a read held for good never holds the
// events path, and never for a pane nobody has open, which draws nothing.
function pollGoals($: EngineInterface, now: number): void {
  if (isGoalsPolling || now - overviewDrawnAt > POLL_STALLED_MILLISECONDS) {
    return
  }

  isGoalsPolling = true
  $.clock.after(0, async () => {
    try {
      await bounded($, 'goals', () => readGoalsFromTerylon($, true), async () => undefined)
    } finally {
      isGoalsPolling = false
    }
  })
}

// What moved since the last look: the done-signal, or one catch-up summary after a long time away.
async function readMoved($: EngineInterface, isStart: boolean, now: number): Promise<void> {
  storeRefusals = 0

  const lastSeq = number(await kept($, STORE_LAST_SEQ))
  const storedEpoch = await kept($, STORE_EPOCH)
  const epoch = text(storedEpoch)

  if (storedEpoch !== undefined && storedEpoch !== null && epoch === null) {
    await forget($, STORE_EPOCH)
  }
  const lastSeenAt = number(await kept($, STORE_LAST_SEEN_AT))
  debug($, `the last look: sequence ${lastSeq ?? 'none'}, at ${lastSeenAt ?? 'never'}`)

  if (lastSeq === null) {
    // The first look ever: start from now, and tell nothing of the past.
    debug($, 'calling events_since for the head')
    const head = await callTerylon($, 'events_since', { since: 0, limit: 1 })

    if (head.kind !== 'ok') {
      await eventsRefused($, head)

      return
    }

    await eventsAnswered($)

    await keep($, STORE_LAST_SEQ, number(head.value.head) ?? number(head.value.last) ?? 0)
    await keepEpoch($, text(head.value.epoch))
    await keep($, STORE_LAST_SEEN_AT, now)
    await eventsRead($)

    return
  }

  const awayMs = lastSeenAt === null ? 0 : now - lastSeenAt
  const isCatchUp = isStart && awayMs > CATCH_UP_AFTER_MS
  const read_ = await readEvents($, lastSeq, epoch, CATCH_UP_MOST_EVENTS)

  if (read_ === null) {
    return
  }

  if (read_.reset !== null) {
    await startOver($, read_.reset, read_.epoch, now)

    return
  }

  const base = await baseUrl($)
  // A GOALDELETED IN THE FEED drops its goal everywhere, before anything of its stories could be told.
  await forgetGoals($, deletedGoalsOf(read_.events))
  // A HOST PROOF'S EVENTS ARE TOLD NOWHERE: by their source, or by a story the pane knows as one.
  const events = withoutDeletedGoals(read_.events, deletedGoals).filter(event => !isHostProof(event) && !hostProofStories.has(number(event.story) ?? -1))
  const candidates = [
    ...candidatesFromEvents(events),
    ...candidatesFromFlight(lastFlight).filter(candidate => !deletedStories.has(candidate.story)),
  ]

  if (!read_.isWhole) {
    // Too far behind for a whole summary: say so, link the console, tell nothing piecemeal.
    await markSignalled($, candidates)
    await update($, band, (): PaneBand => ({ text: `${COPY.tooFarHeading} · ${COPY.tooFarBody(String(CATCH_UP_MOST_EVENTS))}`, link: consoleLink(base, 'history'), isAlert: true }))
  } else if (isCatchUp) {
    // Back after a long time away: ONE summary, the gap's signals inside it.
    const summary = catchUpSummary({ awayMs, events, briefing: lastBriefing, flight: lastFlight, policy, basis: costBasis })
    await markSignalled($, candidates)
    debug($, `posting the catch-up summary of ${read_.events.length} events`)
    await $.prompt.submit({ text: summary.prompt })
    await update($, band, (): PaneBand => ({ text: summary.band, link: consoleLink(base, 'waiting'), isAlert: false }))
  } else {
    await postSignals($, candidates)
  }

  await keep($, STORE_LAST_SEQ, read_.last)
  await keepEpoch($, read_.epoch)
  await keep($, STORE_LAST_SEEN_AT, now)
  await eventsRead($)
}

// TERYLON'S HISTORY WAS RESET, or its epoch the pane kept was refused: the pane goes on from the new epoch and head,
// tells nothing of the old history, and forgets what it remembered of the stories in it. Said once, in the debug log
// and on the band. A refused epoch names no head: the epoch and the position are forgotten, and the next tick reads
// the head without an epoch, as a first look does, and keeps the epoch it answers.
async function startOver($: EngineInterface, reset: Reset, epoch: string | null, now: number): Promise<void> {
  debug($, reset.head === null
    ? `Terylon refused the epoch ${reset.refused ?? ''} (asked from ${reset.from}); starting over from its head`
    : `Terylon's history was reset (asked from ${reset.from}, its head is ${reset.head}); starting over`)
  held.splice(0)
  heldToasted.splice(0)
  await keep($, STORE_HELD, [])
  settled.clear()
  storyTargets.clear()
  // THE NEW HISTORY NUMBERS ITS GOALS AFRESH: a goal deleted in the old one names nothing in it.
  deletedGoals.clear()
  deletedStories.clear()
  await keep($, STORE_SIGNALLED, [])

  if (reset.head === null) {
    await forget($, STORE_EPOCH)
    await forget($, STORE_LAST_SEQ)
  } else {
    await keep($, STORE_LAST_SEQ, reset.head)
    await keepEpoch($, epoch)
  }

  await keep($, STORE_LAST_SEEN_AT, now)

  const base = await baseUrl($)
  await update($, band, (): PaneBand => ({ text: `${COPY.resetHeading} · ${reset.head === null ? COPY.resetRefusedBody : COPY.resetBody(String(reset.head))}`, link: consoleLink(base, 'history'), isAlert: false }))
  await eventsRead($)
}

// A whole read of the events, and a store that kept it: Health's events problem goes.
async function eventsRead($: EngineInterface): Promise<void> {
  if (storeRefusals > 0) {
    return
  }

  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => (current.events === null ? current : { ...EMPTY_SNAPSHOT, ...current, events: null }))
}

// A value the host kept from an earlier version of the mod, across a reload, may lack what this one draws.
async function readSnapshot($: EngineInterface): Promise<PaneSnapshot> {
  return snapshotOf(await read($, snapshot))
}

// THE DONE-SIGNAL'S FIELDS, READ BY THEIR TYPE: a value an earlier version kept lacks them, and one of another shape
// must draw as none rather than throw where Health formats its time.
function snapshotOf(value: unknown): PaneSnapshot {
  const kept = { ...EMPTY_SNAPSHOT, ...(value !== null && typeof value === 'object' ? (value as Partial<PaneSnapshot>) : {}) }
  const time = (moment: unknown): number | null => (typeof moment === 'number' && Number.isFinite(moment) ? moment : null)
  const events = kept.events as Partial<NonNullable<PaneSnapshot['events']>> | null | undefined
  const isEvents = events !== null && typeof events === 'object' && typeof events.kind === 'string' && typeof events.reason === 'string' && time(events.since) !== null

  return {
    ...kept,
    events: isEvents ? (events as NonNullable<PaneSnapshot['events']>) : null,
    eventsAnsweredAt: time(kept.eventsAnsweredAt),
    eventsWatchedSince: time(kept.eventsWatchedSince),
    eventsSilentSince: time(kept.eventsSilentSince),
    signaller: kept.signaller === 'this' || kept.signaller === 'another' ? kept.signaller : 'none',
    signallerSince: time(kept.signallerSince),
    signallerMissingSince: time(kept.signallerMissingSince),
    signallerHolder: typeof kept.signallerHolder === 'string' ? kept.signallerHolder : null,
    sessionIdSource: kept.sessionIdSource === 'session.id' ? 'session.id' : 'fallback',
  }
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

// A story's road's short names: a list story's last phase is Accept, never Merge.
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
  // A MADE-UP SUBJECT NEVER REACHES THE CHAT, where Claude's own tools reach the real Terylon.
  if ((await read($, testMode)).isOn) {
    await noteInTestMode($, COPY.testPrompt)

    return
  }

  const now = await $.clock.now()
  const last = postedAt.get(text)

  // RECORDED BEFORE THE POST, so a second press — a double click included — finds it and posts nothing.
  if (last !== undefined && now - last < PROMPT_REPEAT_MILLISECONDS) {
    return
  }

  postedAt.set(text, now)
  await $.prompt.submit({ text })
}

// THE SCREENS 1.18 HAD AS TABS, in a stack an earlier version kept across a reload: the overview and System hold them
// now. Memory is a screen again, under the name its tab had.
const RETIRED_SCREENS: readonly string[] = ['goals', 'bell', 'status']

function stackOf(value: PaneView): PaneScreen[] {
  const stack = Array.isArray(value.stack) ? value.stack.filter(screen => !RETIRED_SCREENS.includes(screen.screen)) : []

  return stack.length > 0 ? stack : [QUEUE]
}

// NAVIGATION: a stack of screens with the overview at its root. A row pushes, ‹ pops back to where the owner came from.
async function show($: EngineInterface, screen: PaneScreen, isRoot: boolean): Promise<void> {
  await update($, view, (current: PaneView): PaneView => ({ stack: isRoot ? [screen] : [...stackOf(current), screen] }))
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
    case 'queue':
      return loadOverview($)
    case 'story':
      return openStory($, screen.story)
    case 'question':
      return openQuestion($, screen.question)
    case 'plan':
      return loadGoals($)
    case 'new-goal':
      return openNewGoal($)
    case 'goal':
      return openGoal($, screen.goal)
    case 'spec':
      return openSpec($, screen.goal, screen.version, screen.file)
    case 'more':
      return loadMore($)
    case 'memory':
      return loadMemory($)
    case 'notices':
      return loadNotices($)
    default:
      return undefined
  }
}

// WHAT THE OVERVIEW NEEDS BESIDE THE POLL: the goals and their plans, and for its footer the 30 days and the memory's
// proposals. Read at once, each under the bound of a press.
async function loadOverview($: EngineInterface): Promise<void> {
  await Promise.all([loadGoals($), readOverviewFooter($)])
}

async function readOverviewFooter($: EngineInterface): Promise<void> {
  await bounded($, 'the overview', async () => {
    const [metrics, memoryAnswer] = await Promise.all([callTerylon($, 'metrics'), callTerylon($, 'memory_get')])

    await update($, overview, (current: PaneOverview): PaneOverview => ({
      ...EMPTY_OVERVIEW,
      ...current,
      month: metrics.kind === 'ok' ? monthOf(metrics.value, costBasis ?? costBasisOf(metrics.value)) : current?.month ?? null,
      memoryPending: memoryAnswer.kind === 'ok' ? list(memoryAnswer.value.proposals).length : current?.memoryPending ?? null,
    }))
  }, async () => undefined)
}

// NOTICES, a screen of its own like More: the bell is all it reads.
async function loadNotices($: EngineInterface): Promise<void> {
  await loadBell($)
}

// The bell: Notices, whichever screen it was asked from, so ‹ Overview leads back to the overview.
async function openNotices($: EngineInterface): Promise<void> {
  const screen: PaneScreen = { screen: 'notices' }

  await update($, view, (): PaneView => ({ stack: [QUEUE, screen] }))
  await leaveActs($)
  await load($, screen)
}

// SYSTEM: Health alone, its alert line read from the bell under Desktop's 10 s bound on a press. The memory is not read.
async function loadMore($: EngineInterface): Promise<void> {
  await loadBell($)
}

// MEMORY: memory_get alone, under the same bound.
async function loadMemory($: EngineInterface): Promise<void> {
  await bounded($, 'the memory', () => openMemory($), sentence => update($, memory, (current: PaneMemory): PaneMemory => ({ ...EMPTY_MEMORY, ...current, phase: 'error', sentence })))
}

// A button of the overview's head, and How to fix: System, at its top, where Health stands.
async function openMore($: EngineInterface): Promise<void> {
  await show($, { screen: 'more' }, false)
  await $.ui.scroll({ to: 'start', in: PANE }).catch(() => undefined)
}

// A button of the overview's head: Memory, at its top.
async function openMemoryScreen($: EngineInterface): Promise<void> {
  await show($, { screen: 'memory' }, false)
  await $.ui.scroll({ to: 'start', in: PANE }).catch(() => undefined)
}

// The band's button and the commands: the one pane, on the tab asked for, never opened by itself.
async function openPane($: EngineInterface, screen: PaneScreen): Promise<void> {
  await update($, view, (): PaneView => ({ stack: [screen] }))
  await $.ui.open({ id: PANE, title: (await read($, testMode)).isOn ? COPY.testHead : COPY.title })
  await load($, screen)
}

// The band's Open: the pane where the owner left it, the overview the first time; never a screen chosen for them.
async function reopenPane($: EngineInterface): Promise<void> {
  const stack = stackOf(await read($, view))

  await $.ui.open({ id: PANE, title: (await read($, testMode)).isOn ? COPY.testHead : COPY.title })
  await load($, stack[stack.length - 1] ?? QUEUE)
}

// What a press in test mode did not do, said on the screen it was pressed on.
async function noteInTestMode($: EngineInterface, sentence: string): Promise<void> {
  await update($, testMode, (current: PaneTestMode): PaneTestMode => ({ ...EMPTY_TEST_MODE, ...current, note: sentence }))
}

// /terylon-cockpit test, and test off: everything the pane read and everything drawn starts over, so nothing made-up
// stays behind in live data, nor the other way round. THE SHARED STORE IS NOT TOUCHED, and what this session held for it
// stays in memory: leaving, the pane stands where it stood. `isOpened` false enters it without opening the pane.
async function setTestMode($: EngineInterface, isOn: boolean, isOpened = true): Promise<void> {
  const now = await $.clock.now()

  if ((await read($, testMode)).isOn !== isOn) {
    testWorld = isOn ? createTestWorld(now) : null
    lastFlight = {}
    lastBriefing = {}
    lastStories = []
    policy = null
    costBasis = null
    savedPolicy = null
    lastAttemptAt = 0
    refs.clear()
    settled.clear()
    storyTargets.clear()
    hostProofStories.clear()
    postedAt.clear()
    await update($, testMode, (): PaneTestMode => ({ isOn, note: null }))
    await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => ({ ...EMPTY_SNAPSHOT, sessionIdSource: current?.sessionIdSource ?? EMPTY_SNAPSHOT.sessionIdSource, eventsWatchedSince: now }))
    await update($, band, (): PaneBand => null)
    await update($, story, (): PaneStory | null => null)
    await update($, goal, (): PaneGoal | null => null)
    await update($, answer, (): PaneAnswer | null => null)
    await update($, goals, (): PaneGoals => EMPTY_GOALS)
    await update($, bell, (): PaneBell => EMPTY_BELL)
    await update($, overview, (): PaneOverview => EMPTY_OVERVIEW)
    await update($, memory, (): PaneMemory => EMPTY_MEMORY)
    await update($, open, (): string[] => [])
    await update($, acts, (): Record<string, PaneAct> => ({}))
    await update($, policyForm, (): PanePolicyForm => EMPTY_POLICY_FORM)
    await update($, rulesAsked, (): boolean => false)
    await showHealth($)

    if (isOn) {
      await refresh($)
    } else {
      $.clock.after(0, () => tick($, true))
    }
  }

  if (isOpened) {
    await openPane($, QUEUE)
  }
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

  const inFlight = settledStory(list(lastFlight.stories).find(item => number(item.id) === id) ?? {}, id, now)
  const question = (await readSnapshot($)).questions.find(item => item.subject === `story/${id}`) ?? null

  // A STORY DELETED WITH ITS GOAL: Terylon's sentence, quietly; nothing of it is signalled or settled any more.
  if (answered.kind === 'refused' && isDeletedSentence(answered.sentence)) {
    deletedStories.add(id)
    settled.delete(`story-${id}`)
    storyTargets.delete(id)
    await update($, story, (): PaneStory | null => ({ ...storyView(id, {}, {}, null, now, zoneOffset), phase: 'deleted', sentence: answered.sentence }))
    return
  }

  if (answered.kind !== 'ok' && Object.keys(inFlight).length === 0) {
    await update($, story, (): PaneStory | null => ({ ...storyView(id, {}, {}, null, now, zoneOffset), phase: 'error', sentence: why(answered) }))
    return
  }

  const document = settledStory(answered.kind === 'ok' ? answered.value : {}, id, now)
  rememberRefs('story', [{ ...document, id }])
  const view_ = storyView(id, document, inFlight, question, now, zoneOffset, costBasis)
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

  lastFlight = { ...flight.value, stories: withoutHostProof(flight.value.stories) }
  rememberRefs('story', list(lastFlight.stories))

  const running = runningItems(lastFlight, zoneOffset, verifiedIds(lastBriefing), costBasis, now)
  const spent = spend(lastFlight, costBasis)

  await update($, snapshot, (current: PaneSnapshot): PaneSnapshot => ({
    ...EMPTY_SNAPSHOT,
    ...current,
    header: header(lastFlight, policy, costBasis),
    runningUsd: spent.usd.toFixed(2),
    costKnown: spent.isKnown,
    runningTokens: spent.tokens,
    slotsUsed: running.length,
    running,
    stories: roadStories(now),
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
  // draft and what became of it stay, and goals already read stay drawn while they are read again.
  await update($, goals, (current: PaneGoals): PaneGoals => ({
    ...EMPTY_GOALS,
    ...(current?.phase === 'ok' && Array.isArray(current.open) && Array.isArray(current.plans) ? { phase: 'ok' as const, open: current.open, plans: current.plans, targets: Array.isArray(current.targets) ? current.targets : [] } : {}),
    draft: typeof current?.draft === 'string' ? current.draft : '',
    ask: typeof current?.ask === 'string' ? current.ask : '',
    priority: typeof current?.priority === 'string' ? current.priority : DEFAULT_PRIORITY,
    target: typeof current?.target === 'string' ? current.target : OWN_LIST,
    adding: current?.adding ?? 'idle',
    addSentence: typeof current?.addSentence === 'string' ? current.addSentence : null,
    // THE CLOSED GOALS ALREADY READ stay until the next press of History, or a closedCount that changed.
    showing: current?.showing === 'closed' ? 'closed' : 'open',
    closed: Array.isArray(current?.closed) ? current.closed : [],
    closedCount: typeof current?.closedCount === 'number' ? current.closedCount : 0,
    closedFrom: current?.closedFrom === 'terylon' ? 'terylon' : 'list',
    closedPhase: typeof current?.closedPhase === 'string' ? current.closedPhase : 'idle',
    closedSentence: typeof current?.closedSentence === 'string' ? current.closedSentence : null,
  }))
  await bounded($, 'goals', () => readGoalsFromTerylon($), sentence => update($, goals, (current: PaneGoals): PaneGoals => ({ ...EMPTY_GOALS, ...current, phase: 'error', sentence })))
}

// THE NEW GOAL'S FORM: its pickers from the goals, and its folder listed again: the one the owner listed last, the
// session's own at first.
async function openNewGoal($: EngineInterface): Promise<void> {
  await loadGoals($)
  await listFolder($, 'new', (await readPicker($)).listedFolder)
}

// `isQuiet`: a read of the poll's. One that fails keeps what was read; the next load, or the band, says why.
async function readGoalsFromTerylon($: EngineInterface, isQuiet = false): Promise<void> {
  const [goalsAnswer, plansAnswer] = await Promise.all([callTerylon($, 'goals_list'), callTerylon($, 'plans_list')])
  const base = await baseUrl($)
  const questions = (await readSnapshot($)).questions

  if (goalsAnswer.kind !== 'ok') {
    if (!isQuiet) {
      await update($, goals, (current: PaneGoals): PaneGoals => ({ ...current, phase: 'error', sentence: why(goalsAnswer) }))
    }

    return
  }

  // WHAT AN ACT JUST CHANGED, over what the two lists still answer (#35).
  const now = await $.clock.now()
  // A GOAL DELETED FOR GOOD stays gone, its plans with it, where a list read right after the deletion still names it.
  const goalsNow = { ...goalsAnswer.value, goals: list(goalsAnswer.value.goals).filter(item => !deletedGoals.has(number(item.id) ?? -1)).map(item => ({ ...item, state: settledState(`goal-${number(item.id) ?? 0}`, String(item.state ?? ''), now) })) }
  const plansNow = plansAnswer.kind === 'ok' ? { ...plansAnswer.value, plans: list(plansAnswer.value.plans).filter(item => !deletedGoals.has(number(item.goal) ?? -1)).map(item => ({ ...item, state: settledState(`plan-${number(item.id) ?? 0}`, String(item.state ?? ''), now) })) } : {}
  rememberRefs('goal', list(goalsNow.goals))
  rememberRefs('plan', list((plansNow as Json).plans))
  rememberRefs('story', list((plansNow as Json).plans).flatMap(plan => list(plan.stories)))
  // A REPEATING TASK'S GOAL HAS NO ROAD: its card says its newest run, from goals_list's own `repeating`.
  const items = goalItems(goalsNow, questions, item => {
    const repeating = repeatingOf(item, base, now, zoneOffset, costBasis)

    return repeating === null ? null : repeatingWords(repeating)
  })
  const plans = plansAnswer.kind === 'ok' ? planItems(plansNow, base, costBasis) : []
  const targets = targetsOf(goalsAnswer.value)
  // A Terylon with S44 answers the open goals and closedCount, one without it the full list: read per answer.
  const closedCount = number(goalsAnswer.value.closedCount)

  await update($, goals, (current: PaneGoals): PaneGoals => {
    const read_ = { ...current, phase: 'ok' as const, sentence: plansAnswer.kind === 'ok' ? null : why(plansAnswer), open: items.open, plans: plansAnswer.kind === 'ok' || current.plans === undefined ? plans : current.plans, targets }

    // BEFORE S44: the closed goals counted and filtered here, from the full list, as before.
    if (closedCount === null) {
      return { ...read_, closed: items.closed, closedCount: items.closed.length, closedFrom: 'list', closedPhase: 'ok', closedSentence: null }
    }

    // AFTER S44: what a press of History read is kept while closedCount says the same; never read again from here.
    const isKept = current.closedFrom === 'terylon' && current.closedCount === closedCount && current.closedPhase !== 'idle' && (current.closedPhase !== 'loading' || closedGoalsRead !== null)
    // NOTHING CLOSED needs no read: History says it is empty, whether it is open or shut.
    const closedPhase = closedCount === 0 ? 'ok' : current.showing === 'closed' ? 'changed' : 'idle'

    return isKept
      ? { ...read_, closedCount, closedFrom: 'terylon' }
      : { ...read_, closed: [], closedCount, closedFrom: 'terylon', closedPhase, closedSentence: null }
  })
}

// THE READ OF THE CLOSED GOALS this load of the module has in flight: a 'loading' the store kept with none is a read
// that was lost, and is never drawn or waited on.
let closedGoalsRead: Promise<void> | null = null

// HISTORY'S FOLD, PRESSED. Where goals_list counts them, a press of History reads the closed goals, and nothing else ever does.
async function showGoals($: EngineInterface, showing: 'open' | 'closed'): Promise<void> {
  await update($, goals, (current: PaneGoals): PaneGoals => ({ ...current, showing }))

  if (showing === 'open') {
    return
  }

  let current = await readGoals($)

  // PRESSED BEFORE THE GOALS WERE READ: they are read first, under their bound, so the fold knows what to say.
  if (current.closedFrom !== 'terylon' && current.phase !== 'ok') {
    await loadGoals($)
    current = await readGoals($)
  }

  // BEFORE S44 the goals' own read filled History; one that failed says why under the fold too.
  if (current.closedFrom !== 'terylon') {
    if (current.closedPhase !== 'ok') {
      await update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, closedPhase: 'error', closedSentence: state.sentence ?? COPY.loadError(COPY.goalsHistory) }))
    }

    return
  }

  if (current.closedPhase === 'loading' && closedGoalsRead !== null) {
    return
  }

  // NOTHING CLOSED, SAID BY closedCount: nothing to read.
  if (current.closedCount === 0) {
    await update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, closed: [], closedPhase: 'ok', closedSentence: null }))
    return
  }

  await update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, closedPhase: 'loading', closedSentence: null }))
  closedGoalsRead = bounded($, 'closed goals', () => readClosedGoals($), sentence => update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, closedPhase: 'error', closedSentence: sentence })))

  try {
    await closedGoalsRead
  } finally {
    closedGoalsRead = null
  }
}

async function readClosedGoals($: EngineInterface): Promise<void> {
  const answered = await callTerylon($, 'goals_list', { closed: true })

  if (answered.kind !== 'ok') {
    await update($, goals, (current: PaneGoals): PaneGoals => ({ ...current, closedPhase: 'error', closedSentence: why(answered) }))
    return
  }

  const now = await $.clock.now()
  const questions = (await readSnapshot($)).questions
  const closedNow = { ...answered.value, goals: list(answered.value.goals).filter(item => !deletedGoals.has(number(item.id) ?? -1)).map(item => ({ ...item, state: settledState(`goal-${number(item.id) ?? 0}`, String(item.state ?? ''), now) })) }
  rememberRefs('goal', list(closedNow.goals))

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

// A NEW GOAL: goal_add with its short title, its ask, its priority and target; the leader breaks it into a plan that
// waits for the owner in the console. A blank ask is left out, never sent empty; Terylon checks both lengths.
async function addGoal($: EngineInterface): Promise<void> {
  const form = await readGoals($)
  const title = form.draft.trim()
  const ask = (typeof form.ask === 'string' ? form.ask : '').trim()

  if (title === '') {
    return
  }

  // ITS SPECIFICATION, EACH FILE READ WHOLE ON THE PRESS: over a cap, a bad name or a file that cannot be read is the
  // pane's own sentence, and nothing is sent.
  const picked = await readPicker($)
  const specification = await readSpecification($, [], picked.attached)

  if ('problem' in specification) {
    await update($, goals, (current: PaneGoals): PaneGoals => ({ ...current, adding: 'refused', addSentence: specification.problem }))
    return
  }

  await update($, goals, (current: PaneGoals): PaneGoals => ({ ...current, adding: 'sending', addSentence: null }))

  const priority = Number(form.priority)
  const answered = await callTerylon($, 'goal_add', {
    title,
    ...(ask === '' ? {} : { ask }),
    priority: Number.isInteger(priority) && priority >= 1 && priority <= 4 ? priority : Number(DEFAULT_PRIORITY),
    target: form.target === '' ? OWN_LIST : form.target,
    ...(specification.files.length === 0 ? {} : { specification: specification.files }),
  })
  const isAccepted = answered.kind === 'ok' && answered.value.accepted !== false

  await update($, goals, (current: PaneGoals): PaneGoals => ({
    ...current,
    adding: isAccepted ? 'added' : 'refused',
    addSentence: answered.kind === 'ok' && answered.value.accepted == null
      ? COPY.timeout(text(answered.value.commandId))
      : isAccepted ? COPY.goalAdded(why(answered)) : why(answered),
    draft: isAccepted ? '' : current.draft,
    ask: isAccepted ? '' : current.ask,
  }))

  if (isAccepted) {
    await update($, specPicker, (current: PaneSpecPicker): PaneSpecPicker => ({ ...EMPTY_PICKER, ...current, attached: [] }))
    await loadGoals($)
  }
}

// THE NEW GOAL'S FOLDER LIST, merged over its defaults: a value an older version stored has none of it.
async function readPicker($: EngineInterface): Promise<PaneSpecPicker> {
  const stored = await read($, specPicker)

  return { ...EMPTY_PICKER, ...(stored ?? {}), attached: Array.isArray(stored?.attached) ? stored.attached : [], listed: Array.isArray(stored?.listed) ? stored.listed : [] }
}

// ONE FOLDER LIST, the new goal's or a revise form's: every change goes through here.
async function changePicker($: EngineInterface, which: 'new' | 'revise', change: (current: PaneSpecPicker) => PaneSpecPicker): Promise<void> {
  if (which === 'new') {
    await update($, specPicker, (current: PaneSpecPicker): PaneSpecPicker => change({ ...EMPTY_PICKER, ...(current ?? {}) }))
    return
  }

  await update($, revise, (current: PaneRevise | null): PaneRevise | null => (current === null ? null : { ...current, picker: change({ ...EMPTY_PICKER, ...current.picker }) }))
}

// WHERE A FOLDER THE OWNER NAMES IS: the session's own for none, an absolute one as typed, a relative one under the
// session's.
function folderPath(folder: string): string {
  const asked = folder.trim()

  if (asked === '' || asked === SESSION_FOLDER) {
    return sessionFolder
  }

  return ABSOLUTE_PATH.test(asked) ? asked : pathIn(sessionFolder, asked)
}

// THE .md FILES OF A FOLDER, the session's own or one the owner names, relative or absolute: $.fs.list, bounded, its
// failure said in the engine's words under the list.
async function listFolder($: EngineInterface, which: 'new' | 'revise', folder: string): Promise<void> {
  const asked = folder.trim() === '' ? SESSION_FOLDER : folder.trim()
  const path = folderPath(asked)

  await changePicker($, which, current => ({ ...current, listedFolder: asked, phase: 'loading', sentence: null }))
  await bounded($, `the folder ${asked}`, async () => {
    const entries: unknown = await $.fs.list(path)

    await changePicker($, which, current => ({ ...current, listedFolder: asked, phase: 'ok', sentence: null, listed: markdownFilesOf(entries, path) }))
  }, sentence => changePicker($, which, current => ({ ...current, phase: 'error', sentence: COPY.specListFailed(asked, sentence) })))
}

// A FILE PRESSED IN THE LIST is attached; one of the same name takes the place of the first, a kept one's included.
async function attachFile($: EngineInterface, which: 'new' | 'revise', file: PaneSpecFile): Promise<void> {
  await changePicker($, which, current => ({ ...current, attached: attach(current.attached, file) }))

  if (which === 'revise') {
    await update($, revise, (current: PaneRevise | null): PaneRevise | null => (current === null ? null : { ...current, kept: current.kept.filter(item => item.name !== file.name), problem: null }))
  } else {
    await update($, goals, (current: PaneGoals): PaneGoals => (current.adding === 'refused' ? { ...current, adding: 'idle', addSentence: null } : current))
  }
}

async function removeFile($: EngineInterface, which: 'new' | 'revise', name: string): Promise<void> {
  await changePicker($, which, current => ({ ...current, attached: current.attached.filter(item => item.name !== name) }))
}

// A SPECIFICATION WHOLE: the files kept as Terylon sent them, then each attached file read now, in full. Checked before
// the reads and again after them; a file the engine cannot read names itself.
async function readSpecification($: EngineInterface, kept: readonly { name: string; text: string }[], attached: readonly PaneSpecFile[]): Promise<{ files: { name: string; text: string }[] } | { problem: string }> {
  const names = [...kept.map(item => item.name), ...attached.map(item => item.name)]
  const named = specificationProblem(names)

  if (named !== null) {
    return { problem: named }
  }

  const files = [...kept]

  for (const file of attached) {
    try {
      const value: unknown = await $.fs.read(file.path)

      files.push({ name: file.name, text: typeof value === 'string' ? value : String(value ?? '') })
    } catch (error) {
      debug($, `reading ${file.path} failed: ${messageOf(error)}`)
      return { problem: COPY.specUnread(file.name, messageOf(error)) }
    }
  }

  const sized = specificationProblem(names, files.map(item => item.text))

  return sized === null ? { files } : { problem: sized }
}

// B, THE FALLBACK: a request in this chat, in the owner's words, for Claude to add the goal with the .md files the owner
// names or Claude wrote. The pane sends nothing to Terylon itself.
async function specInSession($: EngineInterface): Promise<void> {
  const form = await readGoals($)

  await postPrompt($, COPY.specPrompt(form.draft.trim(), form.ask.trim(), form.priority, form.target === '' ? OWN_LIST : form.target))
}

// ONE VERSION OF A GOAL'S SPECIFICATION, READ-ONLY: spec_get {goal}, or {goal, version} for an older one.
async function openSpec($: EngineInterface, id: number, version: number | null, file: string | null): Promise<void> {
  await update($, specView, (): PaneSpecView | null => ({ goal: id, version, file, phase: 'loading', sentence: null, shown: null, revised: '', files: [] }))

  const answered = await callTerylon($, 'spec_get', version === null ? { goal: id } : { goal: id, version })

  if (answered.kind !== 'ok') {
    await update($, specView, (): PaneSpecView | null => ({ goal: id, version, file, phase: 'error', sentence: why(answered), shown: null, revised: '', files: [] }))
    return
  }

  const now = await $.clock.now()

  await update($, specView, (): PaneSpecView | null => ({
    goal: id,
    version,
    file,
    phase: 'ok',
    sentence: null,
    shown: number(answered.value.version) ?? version,
    revised: answered.value.at === undefined || answered.value.at === null ? '' : runDay(answered.value.at, now, zoneOffset),
    files: specFilesOf(answered.value),
  }))
}

// REVISE…: the form starts from the version shown, its files read whole and kept, and the session's folder listed.
async function openRevise($: EngineInterface, id: number, version: number): Promise<void> {
  await update($, revise, (): PaneRevise | null => ({ goal: id, basedOn: version, phase: 'loading', kept: [], picker: EMPTY_PICKER, problem: null, sentence: null }))

  const answered = await callTerylon($, 'spec_get', { goal: id, version })

  if (answered.kind !== 'ok') {
    await update($, revise, (current: PaneRevise | null): PaneRevise | null => (current === null ? null : { ...current, phase: 'failed', problem: why(answered) }))
    return
  }

  await update($, revise, (current: PaneRevise | null): PaneRevise | null => (current === null ? null : { ...current, phase: 'editing', kept: specFilesOf(answered.value) }))
  await listFolder($, 'revise', SESSION_FOLDER)
}

async function dropKept($: EngineInterface, name: string): Promise<void> {
  await update($, revise, (current: PaneRevise | null): PaneRevise | null => (current === null ? null : { ...current, kept: current.kept.filter(item => item.name !== name) }))
}

// SAVE AS VERSION N+1: spec_revise with every file whole and basedOn the version the form started from, so a version
// saved meanwhile is refused rather than written over. Terylon's refusal is said word for word.
async function saveRevise($: EngineInterface): Promise<void> {
  const form = await read($, revise)

  if (form === null || form.phase !== 'editing') {
    return
  }

  if (form.kept.length + form.picker.attached.length === 0) {
    await update($, revise, (current: PaneRevise | null): PaneRevise | null => (current === null ? null : { ...current, problem: COPY.specNoneKept }))
    return
  }

  const specification = await readSpecification($, form.kept, form.picker.attached)

  if ('problem' in specification) {
    await update($, revise, (current: PaneRevise | null): PaneRevise | null => (current === null ? null : { ...current, problem: specification.problem }))
    return
  }

  await update($, revise, (current: PaneRevise | null): PaneRevise | null => (current === null ? null : { ...current, phase: 'saving', problem: null }))

  const answered = await callTerylon($, 'spec_revise', { goal: form.goal, specification: specification.files, basedOn: form.basedOn })
  const isAccepted = answered.kind === 'ok' && answered.value.accepted === true

  if (!isAccepted) {
    const sentence = answered.kind === 'ok' && answered.value.accepted == null && text(answered.value.refused) === null ? COPY.timeout(text(answered.value.commandId)) : text(answered.kind === 'ok' ? answered.value.refused : null) ?? why(answered)

    await update($, revise, (current: PaneRevise | null): PaneRevise | null => (current === null ? null : { ...current, phase: 'editing', problem: sentence }))
    return
  }

  await openGoal($, form.goal)
  await update($, revise, (current: PaneRevise | null): PaneRevise | null => (current === null ? null : { ...current, phase: 'saved', kept: [], picker: EMPTY_PICKER, problem: null, sentence: why(answered) }))
}

async function openGoal($: EngineInterface, id: number): Promise<void> {
  await update($, goal, (): PaneGoal | null => ({ goal: id, phase: 'loading', sentence: null, title: '', meta: '', stories: [], isOpen: false, openStories: [], repeating: null }))

  const answered = await callTerylon($, 'goal_get', { goal: id })

  // A GOAL DELETED FOR GOOD: Terylon's sentence, quietly, and the goal gone from every list.
  if (answered.kind === 'refused' && isDeletedSentence(answered.sentence)) {
    await update($, goal, (): PaneGoal | null => ({ goal: id, phase: 'deleted', sentence: answered.sentence, title: '', meta: '', stories: [], isOpen: false, openStories: [], repeating: null }))
    await forgetGoals($, [id])
    return
  }

  if (answered.kind !== 'ok') {
    await update($, goal, (): PaneGoal | null => ({ goal: id, phase: 'error', sentence: why(answered), title: '', meta: '', stories: [], isOpen: false, openStories: [], repeating: null }))
    return
  }

  const document = answered.value
  const now = await $.clock.now()
  const state = settledState(`goal-${id}`, String(document.state ?? ''), now)
  const repeating = repeatingOf({ ...document, id }, await baseUrl($), now, zoneOffset, costBasis)
  rememberRefs('goal', [{ ...document, id }])
  rememberRefs('story', list(document.storyList))

  await update($, goal, (): PaneGoal | null => ({
    goal: id,
    phase: 'ok',
    sentence: null,
    title: text(document.title) ?? refOf(document, id),
    ref: text(document.ref),
    meta: COPY.goalMeta(`P${number(document.priority) ?? 2}`, COPY.stateText(state)),
    ask: text(document.ask),
    state,
    target: text(document.target),
    stories: list(document.storyList).map(item => ({
      id: number(item.id) ?? 0,
      title: `${refOf(item, number(item.id) ?? 0)} ${text(item.title) ?? ''}`.trim(),
      state: COPY.stateText(String(item.target) === 'list' && item.state === 'merged' ? 'accepted' : String(item.state ?? '')),
      stateKey: String(item.state ?? ''),
      isList: text(item.target) === 'list' || (text(item.target) === null && text(document.target) === 'list'),
    })),
    isOpen: ['open', 'active'].includes(state),
    // EVERY STORY OF IT THAT HAS NOT ENDED, which a drop abandons (Terylon S35, #388), by title; a run is stopped first.
    openStories: list(document.storyList)
      .filter(item => OPEN_STORY_STATES.includes(String(item.state ?? '')))
      .map(item => ({ id: number(item.id) ?? 0, label: refOf(item, number(item.id) ?? 0), title: text(item.title) ?? '', isRunning: ['dispatched', 'running'].includes(String(item.state ?? '')) })),
    repeating,
    // ITS SPECIFICATION (Terylon S53), with the owner's decisions on earlier plans; null where goal_get names none.
    specification: specificationOf(document, now, zoneOffset),
  }))

  // A REVISE FORM BELONGS TO ITS GOAL: another goal opened closes it.
  await update($, revise, (current: PaneRevise | null): PaneRevise | null => (current !== null && current.goal !== id ? null : current))

  if ((await read($, goals)).phase !== 'ok') {
    await loadGoals($)
  }
}

async function loadBell($: EngineInterface): Promise<void> {
  await update($, bell, (): PaneBell => EMPTY_BELL)
  await bounded($, 'the bell', () => readBellFromTerylon($), sentence => update($, bell, (current: PaneBell): PaneBell => ({ ...EMPTY_BELL, ...current, phase: 'error', sentence })))
}

async function readBellFromTerylon($: EngineInterface): Promise<void> {
  const [notices, metrics] = await Promise.all([callTerylon($, 'notices_list'), callTerylon($, 'metrics')])

  if (notices.kind !== 'ok') {
    await update($, bell, (current: PaneBell): PaneBell => ({ ...current, phase: 'error', sentence: why(notices) }))
    return
  }

  const now = await $.clock.now()

  await update($, bell, (): PaneBell =>
    bellView(notices.value, metrics.kind === 'ok' ? metrics.value : null, now, zoneOffset, costBasis ?? (metrics.kind === 'ok' ? costBasisOf(metrics.value) : null)))

  if (metrics.kind === 'ok') {
    await update($, overview, (current: PaneOverview): PaneOverview => ({ ...EMPTY_OVERVIEW, ...current, month: monthOf(metrics.value, costBasis ?? costBasisOf(metrics.value)) }))
  }
}

// A notice marked handled on More: notice_handle is a write the owner decided is not a gate, so
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
  await update($, testMode, (current: PaneTestMode): PaneTestMode => ({ ...EMPTY_TEST_MODE, ...current, note: null }))
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
  } else if ((tool === 'goal_drop' || tool === 'goal_replan') && subject !== null) {
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

// How to fix: Health, with every rule the pane needs.
async function howToFix($: EngineInterface): Promise<void> {
  await update($, rulesAsked, (): boolean => true)
  await openMore($)
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

// `goal`: the goal it was opened from, picked first.
async function openAdd($: EngineInterface, title: string, goal?: number): Promise<void> {
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
    .map(item => ({ value: String(number(item.id) ?? 0), label: `${refOf(item, number(item.id) ?? 0)} ${text(item.title) ?? ''}` }))

  await update($, add, (): PaneAdd => ({ ...EMPTY_ADD, title, goal: choices.find(choice => choice.value === String(goal))?.value ?? choices[0]?.value ?? '', goals: choices, repositoryGoals, stories: [{ value: '', label: COPY.nothingBefore }, ...stories] }))
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
      return { ...current, phase: 'added', sentence: text(answered.value.sentence), link: goalLink(base, refItem('goal', goalId), goalId), sent: { title, criteria, files: declared.files } }
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

  await update($, memory, (current: PaneMemory): PaneMemory => ({ ...current, phase: 'ok', files, rules, pending: list(answered.value.proposals).length, proposals: proposalItems(answered.value, zoneOffset), edit: null, sentence: null }))
  // THE OVERVIEW'S PILL follows what was just read.
  await update($, overview, (current: PaneOverview): PaneOverview => ({ ...EMPTY_OVERVIEW, ...current, memoryPending: list(answered.value.proposals).length }))
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
    case 'more':
      return `‹ ${COPY.more}`
    case 'memory':
      return `‹ ${COPY.navMemory}`
    case 'story':
      return `‹ ${labelOf('story', previous.story)}`
    case 'goal':
      return `‹ ${refs.get(`goal-${previous.goal}`) ?? COPY.goalOf(String(previous.goal))}`
    case 'plan':
      return `‹ ${COPY.plan(labelOf('plan', previous.plan))}`
    case 'question':
      return COPY.back
    default:
      return `‹ ${COPY.overview}`
  }
}

type Elements = ReturnType<EngineInterface['ui']['resolve']>

type Tone = 'text' | 'inactive' | 'subtle' | 'suggestion' | 'success' | 'warning' | 'error' | 'merged' | 'attention'

// A WORD THAT WAITS FOR THE OWNER is `attention`: the default text, semibold. The host's light amber reads 4.08:1 on
// white (tests/contrast.ts), under text's 4.5:1, so `warning` is only ever a stroke, a dot or a ⚠, never a word.
function colorOf(tone: Tone | undefined): Tone | undefined {
  return tone === 'attention' ? 'text' : tone
}

function weightOf(tone: Tone | undefined): 'semibold' | undefined {
  return tone === 'attention' ? 'semibold' : undefined
}

// HOW A SURFACE DRAWS (S32): a graphic one (Desktop, the phone, VS Code) takes Svg, type sizes and spacing steps;
// the terminal draws whole cells, no Svg, and the text fallbacks the canvas's terminal board draws. Below
// NARROW_COLUMNS the pane is the narrow dock.
// isCompact: too few columns to name a story's eight phases (ROAD_NAMES_COLUMNS), so only the one now is named.
// isWide: room for two cards side by side. isTilesLine: no room for three tiles, so they are one line of counts.
type Look = { isGraphic: boolean; isNarrow: boolean; isCompact: boolean; isWide: boolean; isTilesLine: boolean; columns: number; proofs: Proofs }

// A card's stroke: plain, Waiting for you in the gate's purple, waiting for the owner (warning), or a problem (error).
type CardTone = keyof typeof CARD_STROKES

// A card: a round border, a heading left and a quiet hint right, then its rows. On a graphic surface the spacing is
// the surface's own steps; on the terminal, where every gap is a whole line, the rows stay together and only the
// heading stands apart. EVERY CARD LIES ON THE ONE NEUTRAL FILL, WHATEVER ITS STROKE: on a tinted fill the hints, links
// and chips could not be read, so what a card waits for or warns of is its stroke. The terminal paints no fill.
function card(elements: Elements, look: Look, key: string, title: unknown, hint: unknown, children: unknown[], tone: CardTone = 'plain', isFilling = false): unknown {
  const { Box, Text } = elements
  const toneKey = CARD_STROKES[tone]

  return (
    <Box
      key={key}
      flexDirection="column"
      borderStyle="round"
      borderColor={toneKey}
      backgroundColor={look.isGraphic ? CARD_FILL : undefined}
      flexGrow={isFilling ? 1 : undefined}
      paddingX={look.isGraphic ? 'md' : 1}
      paddingY={look.isGraphic ? 'sm' : 0}
      gap={look.isGraphic ? 'sm' : 1}
    >
      {title === null && hint === null
        ? null
        : (
            <Box flexDirection="row" justifyContent="space-between" gap={1}>
              {typeof title === 'string' ? heading(elements, title) : title}
              {typeof hint === 'string' ? <Text color="subtle" size="footnote">{hint}</Text> : hint ?? null}
            </Box>
          )}
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
      {count === undefined ? null : <Text tabular color={colorOf(countTone)} weight={weightOf(countTone)}>{count}</Text>}
    </Text>
  )
}

// A card's border and padding on the terminal, in cells.
const CARD_CHROME_COLUMNS = 6

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
  // Its subject's ref, monospaced before its title.
  ref?: string | null
  title: string
  titleTone?: Tone
  // A title drawn dim, as the engine dims a Text: a closed goal's, which a colour alone left as bright as an open one's.
  isTitleDim?: boolean
  detail?: string | null
  detailTone?: Tone
  // The console link the pointer reveals over the row's right edge (hover-reveal); without the proof it sits in the body.
  reveal?: { href: string; label: string } | null
  // A console link that ends the row, always drawn beside the press: History's Delete….
  trail?: { href: string; label: string } | null
  // The row's own act, drawn beside the press: Waiting for you's Answer, Approve, Accept or Merge ↗.
  act?: unknown
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

  if (input.ref !== undefined && input.ref !== null) {
    children.push(<Text mono size="footnote" color="subtle">{input.ref}</Text>, ' ')
  }

  children.push(<Text color={colorOf(input.titleTone)} weight={weightOf(input.titleTone)} dimColor={input.isTitleDim === true ? true : undefined} wrap="truncate-end">{input.title}</Text>)

  if (hasDetail) {
    children.push('  ', <Text size="footnote" tabular color={colorOf(input.detailTone ?? 'subtle')} weight={weightOf(input.detailTone)}>{input.detail}</Text>)
  }

  // NO REVEAL OVER AN OPEN ROW (the owner's walk of 1.2.0): laid over its first line it covered the question; the open
  // row's body carries the same link.
  const isOpen = input.body !== undefined && input.body !== null
  const isRevealed = look.proofs.hoverReveal && look.isGraphic && !isOpen && input.reveal !== undefined && input.reveal !== null

  return (
    <Box key={`row-${input.key}`} flexDirection="column" hover={isRevealed ? { backgroundColor: 'userMessageBackgroundHover' } : undefined}>
      <Box flexDirection="row" minWidth={0} overflow="hidden" justifyContent={input.act === undefined || input.act === null ? undefined : 'space-between'} gap={isRevealed || (input.trail !== undefined && input.trail !== null) || (input.act !== undefined && input.act !== null) ? (look.isGraphic ? 'sm' : 1) : undefined}>
        <Button key={input.key} plain onPress={input.onPress}>
          {children}
        </Button>
        {isRevealed && input.reveal !== undefined && input.reveal !== null && (
          // BESIDE THE PRESS, NEVER OVER IT: laid over the row's right edge, the link covered the row's own text.
          // NO KEY ON THE REVEAL: a keyed Box is a hover scope of its own, and one drawn "none" is never under the pointer.
          <Box flexShrink={0} display="none" hover={{ display: 'flex' }}>
            <Link href={input.reveal.href} label={input.reveal.label} />
          </Box>
        )}
        {input.trail !== undefined && input.trail !== null && (
          <Box flexShrink={0}>
            <Link href={input.trail.href} label={input.trail.label} />
          </Box>
        )}
        {input.act !== undefined && input.act !== null && <Box flexShrink={0}>{input.act}</Box>}
      </Box>
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

// A ROAD: an Svg where the surface draws one, on the terminal runs of coloured cells, as wide as the pane gives.
function roadDrawing(elements: Elements, look: Look, key: string, steps: readonly PaneRoadStep[], options: { isStuck?: boolean; tooltips?: readonly string[] | null; height?: number } = {}): unknown {
  const { Text } = elements

  if (look.isGraphic) {
    return picture(elements, road(steps, options), { isInteractive: options.tooltips !== null && options.tooltips !== undefined })
  }

  return (
    <Text key={key} wrap="truncate-end">
      {roadCells(steps, look.columns - CARD_CHROME_COLUMNS, options.isStuck).flatMap((cell, index) => (index === 0 ? [<Text color={cell.tone}>{cell.text}</Text>] : [' ', <Text color={cell.tone}>{cell.text}</Text>]))}
    </Text>
  )
}

// THE NAMES UNDER A ROAD, each in its segment's column; `onlyNow` where there is no room for them all.
function roadNames(elements: Elements, look: Look, key: string, steps: readonly PaneRoadStep[], options: { isStuck?: boolean; onlyNow?: boolean } = {}): unknown {
  const { Box, Text } = elements
  const toneOf = (step: PaneRoadStep): Tone => (step.status === 'now' ? (step.isGate ? 'merged' : options.isStuck === true ? 'error' : 'suggestion') : step.status === 'done' ? 'inactive' : step.isGate ? 'merged' : 'subtle')

  if (options.onlyNow === true) {
    const now = steps.find(step => step.status === 'now')

    return now === undefined ? null : <Text key={`${key}-now`} size="caption" weight="semibold" color={toneOf(now)}>{now.name}</Text>
  }

  return (
    <Box key={`${key}-labels`} flexDirection="row" flexWrap={look.isGraphic ? undefined : 'wrap'} gap={look.isGraphic ? undefined : 1}>
      {steps.map((step, index) => (
        <Box key={`${key}-label-${index}`} flexGrow={look.isGraphic ? 1 : undefined} flexShrink={look.isGraphic ? 1 : undefined} minWidth={look.isGraphic ? 0 : undefined} width={look.isGraphic ? 0 : undefined}>
          <Text size="caption" wrap="truncate-end" weight={step.status === 'now' ? 'semibold' : undefined} color={toneOf(step)}>{step.name}</Text>
        </Box>
      ))}
    </Box>
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
    // TERYLON COCKPIT'S ONE COMMAND (Terylon S68): /terylon-pane, /terylon and /terylon-memory are gone, not aliased.
    await $.command.register({ name: 'terylon-cockpit', description: 'Opens Terylon Cockpit: what waits for you, your goals, and Notices, Memory and Health; test and test off for its test mode' })
    storyTargets.clear()
    // UNATTENDED ONLY WHEN THE ENGINE SAYS SO TWICE: no person at the prompt and nowhere to draw, a -p run or the SDK.
    // An engine that names neither starts a session someone is at.
    isUnattended = e.isInteractive === false && (e.surface === null || e.surface === undefined)
    debug($, `this session starts with isInteractive ${String(e.isInteractive)}, surface ${String(e.surface)}: ${isUnattended ? 'nobody is at it' : 'someone is at it'}`)
    sessionFolder = typeof e.cwd === 'string' && e.cwd.trim() !== '' ? e.cwd : sessionFolder

    // TEST MODE FROM THE ENVIRONMENT: TERYLON_PANE_TEST_MODE=on starts the session in it, once, without opening the pane;
    // /terylon-cockpit test off still ends it. Any other value, or none, changes nothing.
    if (!isStarted && (await $.env.get('TERYLON_PANE_TEST_MODE')) === 'on') {
      await setTestMode($, true, false)
    }

    await start($, e.cwd)
    ensurePoll($, 'session.start')

    return next(e)
  })

  // THE OWNER'S OWN TYPING, at the prompt or through Remote Control, moves the signaller lease to this session.
  on('prompt.submit', async ($, e, next) => {
    ensurePoll($, 'prompt.submit')
    const result = await next(e)

    if (e.origin?.kind === 'composer' || e.origin?.kind === 'bridge') {
      typedAt = await $.clock.now()
    }

    return result
  })

  on('turn.start', async ($, e, next) => {
    ensurePoll($, 'turn.start')

    if (e.agentId === undefined) {
      isTurnRunning = true
      turnStartedAt = await $.clock.now()
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    ensurePoll($, 'turn.complete')
    const result = await next(e)

    if (e.agentId === undefined) {
      isTurnRunning = false
      $.clock.after(0, () => flushHeld($))
    }

    return result
  })

  on('command.run', { command: 'terylon-cockpit' }, async ($, e) => {
    const asked = (e.args ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

    if (asked === 'test' || asked === 'test off') {
      await setTestMode($, asked === 'test')

      return { text: asked === 'test' ? COPY.testOn : COPY.testOff }
    }

    await openPane($, QUEUE)

    return { text: 'Terylon Cockpit is open.' }
  })

  // A FAULT THE HOST REPORTED for what the pane drew, said in its own log as well as the debug log.
  on('ui.fault', ($, e, next) => {
    note($, `terylon-pane: ui.fault: ${e.component} ${e.phase} on ${e.surface}: ${e.reason}`)

    return next(e)
  })

  // THE BAND: one row above the prompt, what calls for the owner, and the pane's entry point. The machine's health and
  // spend are the status line's, never repeated here.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    isSeen = true
    ensurePoll($, 'the band')

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
              <Text color={caught.isAlert ? 'text' : 'inactive'} weight={caught.isAlert ? 'semibold' : undefined}>{caught.text}</Text>
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
    const offset = zoneOffset
    const stuck = current.running.filter(item => item.isStuck).length
    // THE BAND IS UNCHANGED BUT FOR ITS DIGITS (S32): tabular, so a count that moves at a poll does not shift the row.
    const pair = (name: string, value: string, tone: 'inactive' | 'attention' | 'suggestion') => [
      <Text color="subtle">{` · ${name} `}</Text>,
      <Text color={colorOf(tone)} weight={weightOf(tone)} tabular>{value}</Text>,
    ]
    const counts = [
      ...pair(COPY.bandWaiting, String(current.waiting.length), current.waiting.length > 0 ? 'attention' : 'inactive'),
      ...pair(COPY.bandRunning, String(current.running.length), current.running.length > 0 ? 'suggestion' : 'inactive'),
      ...(stuck > 0 ? [<Text color="error" tabular>{COPY.bandStuck(stuck)}</Text>] : []),
    ]
    let segments: unknown[]
    let title: string = (await read($, testMode)).isOn ? `${COPY.title} · ${COPY.testBand}` : COPY.title
    switch (current.connection) {
      case 'connecting':
        segments = [<Text color="subtle">{` · ${COPY.connecting}`}</Text>]
        break
      // WHAT IS WRONG WITH THE WAY TO THE MACHINE is said under its name, Terylon, as the board draws it.
      case 'not-allowed':
        segments = [<Text color="subtle">{' · '}</Text>, <Text color="error">{COPY.bandNotAllowed}</Text>, <Text color="subtle">{` · ${COPY.bandNotAllowedHint}`}</Text>]
        title = COPY.machineName
        break
      case 'no-server':
        segments = [<Text color="subtle">{' · '}</Text>, <Text color="error">{COPY.bandNoServer}</Text>, <Text color="subtle">{` · ${COPY.bandNoServerHint}`}</Text>]
        title = COPY.machineName
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
          <Text color="error" tabular>{COPY.disconnected(current.failingSince === null ? '?' : clock(new Date(current.failingSince).toISOString(), offset) ?? '?')}</Text>,
          ...pair(COPY.bandWaiting, String(current.waiting.length), 'inactive'),
          ...pair(COPY.bandRunning, String(current.running.length), 'inactive'),
          <Text color="subtle">{` · ${COPY.bandRetrying}`}</Text>,
        ]
        break
      default:
        segments = current.paused !== null
          ? [
              ...pair(COPY.bandLeader, COPY.bandPaused(current.pausedSince), 'attention'),
              ...pair(COPY.bandWaiting, String(current.waiting.length), current.waiting.length > 0 ? 'attention' : 'inactive'),
              ...pair(COPY.bandQueued, String(current.queued.length), 'inactive'),
              ...pair(COPY.bandNotices, String(current.notices), current.notices > 0 ? 'attention' : 'inactive'),
            ]
          : [
              ...counts,
              ...pair(COPY.bandQueued, String(current.queued.length), 'inactive'),
              ...pair(COPY.bandNotices, String(current.notices), current.notices > 0 ? 'attention' : 'inactive'),
              ...(current.alerts > 0 ? [<Text color="error" tabular>{COPY.bandAlerts(current.alerts)}</Text>] : []),
            ]
    }

    return (
      <Box width="100%" flexDirection="row" justifyContent="space-between" gap={1}>
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">
            <Text color="inactive">{title}</Text>
            {segments}
          </Text>
        </Box>
        <Button key="band-open" label={COPY.bandOpen} plain dimColor onPress={() => reopenPane($)} />
      </Box>
    )
  })

  // THE PANE: the screen on top of the stack, the overview at its root.
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // EVERY SCREEN'S DRAWING, each returning where it ends; test mode's line goes over whichever it was, at the end.
    const drawn = await (async (): Promise<unknown> => {
    isSeen = true
    ensurePoll($, 'the pane')
    const elements = $.ui.resolve(e)
    const { Box, Text, Button, Link, Markdown, Code } = elements
    const hasInput = e.surface !== 'mobile' && 'Input' in elements
    const look: Look = {
      isGraphic: e.surface !== 'terminal',
      isNarrow: e.props.bodyColumns < NARROW_COLUMNS,
      isCompact: e.props.bodyColumns < ROAD_NAMES_COLUMNS,
      isWide: e.surface !== 'terminal' && e.props.bodyColumns >= WIDE_COLUMNS,
      isTilesLine: e.props.bodyColumns < NARROW_COLUMNS || (e.surface === 'terminal' && e.props.bodyColumns < NARROW_TERMINAL_COLUMNS),
      columns: e.props.bodyColumns,
      proofs: proofsOf(await $.env.get('TERYLON_PANE_PROOFS')),
    }
    const current = await readSnapshot($)
    const stack = stackOf(await read($, view))
    const screen = stack[stack.length - 1] ?? QUEUE
    const isTestOn = (await read($, testMode)).isOn
    const shown = await read($, open)
    const now = await $.clock.now()

    if (screen.screen === 'queue') {
      overviewDrawnAt = now
    }

    const base = await baseUrl($)
    const offset = zoneOffset
    const at = (moment: number | null) => (typeof moment !== 'number' || !Number.isFinite(moment) ? '?' : clock(new Date(moment).toISOString(), offset) ?? '?')
    // WHAT THE OWNER LEFT OUT to find the part Desktop does not draw (TERYLON_PANE_STATUS); unset, nothing is.
    const drawingAsked = statusDrawingOf(await $.env.get('TERYLON_PANE_STATUS'))
    const isStale = current.connection === 'unreachable'
    const stale = isStale ? COPY.stale : ''
    const go = (target: PaneScreen) => show($, target, false)
    const cardOf = (key: string, title: unknown, hint: unknown, children: unknown[], tone: CardTone = 'plain', isFilling = false) => card(elements, look, key, title, hint, children, tone, isFilling)
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

    // MERGE IS ONLY EVER A LINK INTO THE CONSOLE; in test mode, for a made-up story, the sentence instead.
    const mergeLink = (key: string, href: string, label: string) => (isTestOn
      ? <Button key={key} label={label} onPress={() => noteInTestMode($, COPY.testMerge)} />
      : <Link href={href} label={label} />)
    const refreshButton = <Button key="refresh" label={COPY.refresh} dimColor onPress={async () => { await tick($, true); await load($, screen) }} />
    const backButton = <Button key="back" label={backLabel(stack)} dimColor onPress={() => back($)} />
    // A FOLD: a real Button of its word and its count, drawn dim while shut and at full strength while open. The terminal
    // draws a Button with no state of its own, so there it stays plain, ▸ shut and ▾ open, in the quiet tone.
    const foldButton = (key: string, label: string, isOpen: boolean, onPress: () => unknown = () => toggle($, key)) => (look.isGraphic
      ? <Button key={key} label={label} dimColor={isOpen ? undefined : true} onPress={onPress} />
      : (
          <Button key={key} plain onPress={onPress}>
            <Text color="subtle">{`${isOpen ? '▾' : '▸'} ${label}`}</Text>
          </Button>
        ))
    const folds = (key: string, buttons: unknown[]) => <Box key={key} flexDirection="row" gap={look.isGraphic ? 'md' : 1} flexWrap="wrap">{buttons}</Box>
    // AN OPEN FOLD'S CARD: the fold's word and count its heading, its rows inside, one card per fold.
    const foldCard = (key: string, label: string, count: number, rows: unknown[]) => cardOf(key, headingOf(label, count), null, rows)
    // TWO CARDS SIDE BY SIDE where the pane is wide, each column a column, so its card takes the column's whole width and
    // none sits at the width of its words; one under the other elsewhere.
    const twoColumns = (key: string, left: unknown, right: unknown) => (look.isWide && left !== null && right !== null
      ? (
          <Box key={key} flexDirection="row" gap="sm" alignItems="stretch">
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} width={0}>{left}</Box>
            <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} width={0}>{right}</Box>
          </Box>
        )
      : [left, right])
    // THE WORDS OF WHAT COMES NEXT, under a road: "What next  Merge in the console".
    const nextLine = (key: string, label: string, words_: string) => (
      <Box key={key} flexDirection="row" gap={1} flexWrap="wrap">
        <Text color="subtle">{label}</Text>
        <Text weight="semibold">{words_}</Text>
      </Box>
    )
    // THE MACHINE IN A LINE, at the overview's head: its health, the connection, the slots, and today's cost, or on the
    // setup token today's tokens and never a $.
    const overviewLine = () => {
      const running_ = Number(current.runningUsd)
      const health = healthOf(current, offset)
      const cost = current.costKnown !== false
        ? COPY.todayCost(words.money(running_), current.dayBudget === null ? null : words.budget(Number(current.dayBudget)))
        : (current.runningTokens ?? null) === null ? null : `${words.tokens(current.runningTokens ?? 0)} today`

      return [
        current.connection === 'connecting' ? COPY.connecting : isStale ? COPY.disconnected(at(current.failingSince)) : stateWord(health).word,
        current.connection === 'ok' ? COPY.connectedShort : null,
        current.slots > 0 ? COPY.slotsShort(current.slotsUsed, current.slots) : null,
        current.fetchedAt === null ? null : cost,
      ].filter(part => part !== null).join(' · ')
    }
    // THE WAY TO NOTICES, TO MEMORY AND TO SYSTEM, in the overview's head, each Button its plain word. Desktop draws a Button natively,
    // drops its children and lets nothing recolour it, so on a graphic surface a head button with something behind it is
    // the surface's primary Button and a plain one otherwise; Refresh is never primary. On the terminal a `warning` dot
    // before the word. Its label is the word it draws, since Desktop draws the label.
    const overviewState = { ...EMPTY_OVERVIEW, ...(await read($, overview)) }
    const navButton = (key: string, name: string, isWaiting: boolean, onPress: () => unknown) => {
      if (!look.isGraphic) {
        return (
          <Button key={key} label={name} onPress={onPress}>
            {isWaiting && <Text color="warning">{'● '}</Text>}
            {name}
          </Button>
        )
      }

      return isWaiting ? <Button key={key} label={name} variant="primary" onPress={onPress} /> : <Button key={key} label={name} onPress={onPress} />
    }
    const isMemoryWaiting = (overviewState.memoryPending ?? 0) > 0
    const nav = (
      <Box key="overview-nav" flexDirection="row" gap={1} flexShrink={0} flexWrap="wrap" alignItems="center">
        {navButton('tab-bell', COPY.navNotices, current.notices > 0, () => openNotices($))}
        {navButton('tab-memory', COPY.navMemory, isMemoryWaiting, () => openMemoryScreen($))}
        {navButton('tab-status', COPY.navSystem, hasProblem(current, drawingAsked.off), () => openMore($))}
        {refreshButton}
      </Box>
    )
    const overviewHead = (
      <Box key="overview-head" flexDirection={look.isNarrow ? 'column' : 'row'} justifyContent="space-between" alignItems={look.isNarrow ? undefined : 'center'} gap={1}>
        <Box flexDirection="row" alignItems="center" gap={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Box flexShrink={0}>
            <Text size="title" weight="semibold">{isTestOn ? COPY.testHead : COPY.machineName}</Text>
          </Box>
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            <Text color={isStale ? 'error' : 'subtle'} size="footnote" tabular wrap="truncate-end">{overviewLine()}</Text>
          </Box>
        </Box>
        {nav}
      </Box>
    )
    // THE 30 DAYS, ALONE at the overview's foot.
    const overviewFoot = (
      <Box key="overview-foot" flexShrink={1} minWidth={0}>
        {overviewState.month === null ? null : <Text color="subtle" size="footnote" tabular>{COPY.monthLine(overviewState.month)}</Text>}
      </Box>
    )
    // A REASON IS ONE CLEAN LINE, whatever it was handed: no control character, no page of text, never an object.
    // Wrapped, not cut: a store's refusal ends in the file that is the fix.
    const reason = (problem: unknown) => (problem === null || problem === undefined ? null : <Text color="subtle" size="footnote">{COPY.reason(plainLine(problem, REASON_WHOLE))}</Text>)
    const retry = <Button key="retry" label={COPY.retry} variant="primary" onPress={() => tick($, true)} />
    const steps = (lines: readonly string[]) => (
      <Box flexDirection="column">
        <Text bold>{COPY.howToFix}</Text>
        {lines.map((line, index) => <Text key={`step-${index}`} color="inactive">{COPY.fixStep(index + 1, line)}</Text>)}
      </Box>
    )
    // A CARD'S TITLE THAT WARNS (the owner's walk of 1.2.0): a problem's in `error`, a waiting card's in `text`, its
    // stroke carrying the warning. Amber text reads under 4.5:1 on light (tests/contrast.ts), so no text is amber.
    const warned = (title: string, tone: 'wait' | 'bad' = 'bad') => <Text size="heading" weight="semibold" color={tone === 'bad' ? 'error' : 'text'}>{title}</Text>


    // THE ALLOW RULES' FIX, ONE DRAWING for a refused poll and an act Claude Code refused (S27): the steps, then the
    // rules the pane needs.
    const rulesFix = (lines: readonly string[] = COPY.fixNotAllowed, key = 'allow-rules') => [
      steps(lines),
      // THE ALLOW RULES AS CODE (S32): json, the pane's whole own list, no gate; selected and copied by hand.
      <Code key={key} source={allowRules()} language="json" />,
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
          {overviewHead}
          {overviewFoot}
        </Box>
      )
    }

    // Today's spend against its limit.
    const runningUsd = Number(current.runningUsd)
    const budgetUsd = current.dayBudget === null ? null : Number(current.dayBudget)
    // TODAY'S COST, OR ITS TOKENS ON THE SETUP TOKEN: no $ figure and no bar against a dollar limit where it is not known.
    const isCostKnown = current.costKnown !== false

    // A PART THAT THROWS IS ONE PROBLEM, NEVER A BLANK PAGE: Desktop draws its own placeholder when a render fails.
    const part = async (name: string, build: () => unknown): Promise<unknown> => {
      try {
        return await build()
      } catch (error) {
        const message = messageOf(error)
        note($, `terylon-pane: Health's ${name} did not draw: ${message}`)

        return cardOf(`problem-part-${name}`, warned(COPY.statusPartFailed(name)), null, [reason(message), steps(COPY.fixStatusPart)], 'bad')
      }
    }

    // NOTICES: Needs you, each notice on a card of its own, then What the machine did, its latest in the open and the rest a
    // press away. Its way back is the screen's ‹ Overview.
    const noticesSection = async (): Promise<unknown> => {
      const bellState = await readBell($)
      const isMachineOpen = shown.includes('fold-machine')
      const machineShown = isMachineOpen ? bellState.handled : bellState.handled.slice(0, MACHINE_SHOWN)
      const machineMore = bellState.handled.length - MACHINE_SHOWN

      return (
        <Box key="notices" flexDirection="column" gap={1}>
          <Box key="notices-head" flexDirection="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap">
            <Text size="heading" weight="semibold">{COPY.moreNotices}</Text>
            <Link href={consoleLink(base, 'bell')} label={COPY.noticesInConsoleShort} />
          </Box>
          {bellState.phase === 'ok' && <Text weight="semibold" color="inactive">{COPY.needsYou(bellState.unhandledCount)}</Text>}
          {bellState.phase === 'loading' && quiet(elements, COPY.loading)}
          {bellState.phase === 'error' && cardOf('bell-error', warned(COPY.loadError(COPY.moreNotices)), null, [reason(bellState.sentence)], 'bad')}
          {bellState.phase === 'ok' && bellState.unhandled.length === 0 && quiet(elements, COPY.nothingYet)}
          {bellState.phase === 'ok' && bellState.unhandled.map(notice => cardOf(`notice-card-${notice.id}`, <Text weight="semibold">{notice.title}</Text>, null, [
            <Text color="subtle" size="footnote" tabular>{COPY.alertHint(notice.source, notice.when)}</Text>,
            <Text color="inactive">{notice.body === '' ? COPY.noBody : notice.body}</Text>,
            <Box key={`notice-acts-${notice.id}`} flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
              <Button
                key={`handle-${notice.id}`}
                label={bellState.handling === notice.id ? COPY.handling : COPY.markHandled}
                onPress={() => handleNotice($, notice.id)}
              />
              {notice.link !== null && <Link href={`${base}${notice.link}`} label={COPY.noticesInConsole} />}
            </Box>,
          ], 'wait'))}
          {bellState.handleSentence === null ? null : reason(bellState.handleSentence)}
          {bellState.phase === 'ok' && bellState.handled.length > 0 && <Text weight="semibold" color="inactive">{COPY.machineDid}</Text>}
          {bellState.phase === 'ok' && bellState.handled.length > 0 && cardOf('bell-machine', null, null, [
            ...machineShown.map(notice => (
              <Text key={`handled-${notice.id}`} wrap="truncate-end">
                <Text color="success">{'✓ '}</Text>
                {withHash(elements, notice.title)}
                <Text color="subtle" size="footnote" tabular>{` ${notice.when}`}</Text>
              </Text>
            )),
            machineMore > 0 ? foldButton('fold-machine', COPY.machineMore(machineMore), isMachineOpen) : null,
          ])}
        </Box>
      )
    }

    // MEMORY: the proposals waiting, then what the leader remembers and the rules the machine enforces, a press away.
    const memorySection = async (): Promise<unknown> => {
      const state = await readMemory($)
      const memoryLink = consoleLink(base, 'memory')

      if (state.phase === 'loading') {
        return (
          <Box key="more-memory" flexDirection="column" gap={1}>
            <Text size="heading" weight="semibold">{COPY.moreMemory}</Text>
            {quiet(elements, COPY.memoryLoading)}
          </Box>
        )
      }

      if (state.phase === 'error') {
        return (
          <Box key="more-memory" flexDirection="column" gap={1}>
            <Text size="heading" weight="semibold">{COPY.moreMemory}</Text>
            {cardOf('mem-error', warned(COPY.memoryError), null, [
              reason(state.sentence ?? '?'),
              <Button key="mem-retry" label={COPY.retry} variant="primary" onPress={() => openMemory($)} />,
            ], 'bad')}
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

      // ONE MEMORY FILE'S CARD: its entries, each with Edit and Remove, or a topic's note, a press away.
      const fileCard = (file: PaneMemory['files'][number]) => {
        const fileIndex = state.files.indexOf(file)

        return cardOf(
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
        )
      }
      const ownerFiles = state.files.filter(file => file.text === null)
      const topicFiles = state.files.filter(file => file.text !== null)
      const ownerCount = ownerFiles.reduce((sum, file) => sum + file.entries.length, 0)
      const isOwnerOpen = shown.includes('fold-memory-owner')
      const isTopicsOpen = shown.includes('fold-memory-topics')
      const isRulesOpen = shown.includes('fold-memory-rules')

      return (
        <Box key="more-memory" flexDirection="column" gap={1}>
          <Text size="heading" weight="semibold">{COPY.moreMemory}</Text>
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
                      <Text>{COPY.proposedBy(proposal.by, proposal.storyRef ?? (proposal.story === null ? null : labelOf('story', proposal.story)), null)}</Text>
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
              }), 'gate')}
          {/* WHAT BECAME OF A PROPOSAL NO LONGER LISTED: confirmed or dropped, it left memory_get's list. */}
          {Object.keys(allActs)
            .filter(key => key.startsWith('proposal-') && !state.proposals.some(proposal => `proposal-${proposal.id}` === key))
            .map(key => actOutcome(key, memoryLink, COPY.memoryBrowser))}
          {state.proposals.length > 0 && <Link key="mem-browser" href={memoryLink} label={COPY.memoryBrowser} />}
          {folds('memory-folds', [
            ownerFiles.length === 0 ? null : foldButton('fold-memory-owner', `${COPY.memoryOwner} ${ownerCount}`, isOwnerOpen),
            topicFiles.length === 0 ? null : foldButton('fold-memory-topics', `${COPY.memoryTopics} ${topicFiles.length}`, isTopicsOpen),
            state.rules.length === 0 ? null : foldButton('fold-memory-rules', `${COPY.memoryRules} ${state.rules.length}`, isRulesOpen),
          ])}
          {state.files.length === 0 && cardOf('mem-empty', COPY.memoryFiles, null, [quiet(elements, COPY.memoryEmpty)])}
          {isOwnerOpen && ownerFiles.map(fileCard)}
          {isTopicsOpen && topicFiles.map(fileCard)}
          {isRulesOpen && cardOf('mem-rules', COPY.memoryRules, COPY.memoryRulesHint(state.rules.length), state.rules.map((rule, index) =>
            rowOf({
              key: `mem-rule-${index}`,
              kind: null,
              title: rule.rule,
              detail: rule.enforcedBy,
              onPress: () => toggle($, `mem-rule-${index}`),
              body: shown.includes(`mem-rule-${index}`) ? <Text color="inactive">{`${rule.rule} · ${rule.artefact}`}</Text> : null,
            })))}
          {state.proposed.length === 0 ? null : cardOf('mem-proposed', COPY.memoryProposedHeading, null, state.proposed.slice().reverse().map((line, position) => <Text key={`mem-proposed-${position}`} color="inactive" wrap="truncate-end">{line}</Text>))}
        </Box>
      )
    }

    // HEALTH: the machine, its slots and cost, every problem with how to fix it, the 30 days, the policy, where to look.
    const healthSection = async (): Promise<unknown> => {
      // EVERY DRAW SAYS THAT IT BEGAN: a line here with no "draws" after it is a draw that never returned.
      note($, `terylon-pane: Health begins on ${e.surface} at ${e.props.bodyColumns} columns`)

      try {
        const pausedCard = await part('paused', () => current.paused === null ? null : cardOf('problem-paused', warned(COPY.pausedTitle, 'wait'), current.pausedSince === null ? null : COPY.statusSince(current.pausedSince), [
          <Text color="inactive">{current.paused}</Text>,
          steps(COPY.fixPaused),
          <Box flexDirection="row" gap={1}>{actButton('leader', 'leader_resume', null, { isPrimary: true })}</Box>,
          actBusyNote('leader'),
        ], 'wait'))
        // THE RULES, ASKED FOR BY How to fix (S27): an act Claude Code refused needs the same rules as a refused poll.
        const rulesCard = await part('rules', async () => current.connection === 'not-allowed' || !(await read($, rulesAsked)) ? null : cardOf('problem-rules', warned(COPY.notAllowedTitle, 'wait'), COPY.notAllowedHint, [
          <Text color="inactive">{COPY.notAllowedBody}</Text>,
          // NO Try again ON THIS CARD (#35): its last step names the act's own button instead.
          ...rulesFix(COPY.fixNotAllowedAct),
        ], 'wait'))
        // A NOTICE IS NEVER REPEATED HERE: Health says that one needs the owner, and Notices holds it.
        const alertLine = await part('alerts', () => {
          const first = current.alertNotices[0]

          return first === undefined ? null : (
            <Box key="health-notices" flexDirection="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap="wrap" borderStyle="round" borderColor={CARD_STROKES.wait} backgroundColor={look.isGraphic ? CARD_FILL : undefined} paddingX={look.isGraphic ? 'md' : 1} paddingY={look.isGraphic ? 'xs' : 0}>
              <Box flexShrink={1} minWidth={0}>
                <Text>{COPY.noticesNeedYou(current.alertNotices.length, first.title)}</Text>
              </Box>
              <Button key="health-open-notices" label={COPY.openInNotices} onPress={() => openNotices($)} />
            </Box>
          )
        })
        // ITS OWN Try again AND RULES, KEYED APART from the connection's: two elements of one key are one too many.
        // THE DONE-SIGNAL'S OWN PROBLEM: the queue may read well while events_since, or the store, fails on its own. DRAWN
        // ONLY IN WHAT DESKTOP HAS DRAWN ON THIS TAB: a plain card and title, a plain Button, no red stroke or primary.
        const events = current.events
        const silentSince = isEventsSilent(current) ? current.eventsSilentSince : null
        const eventsTitle = (title: string) => <Text size="heading" weight="semibold">{`⚠ ${title}`}</Text>
        const eventsRetry = () => <Button key="events-retry" label={COPY.retry} onPress={() => tick($, true)} />
        const eventsCard = await part('events', () => events === null
          ? silentSince === null
            ? null
            : cardOf('problem-events', eventsTitle(COPY.eventsSilentTitle), COPY.statusSince(at(silentSince)), [
                <Text color="inactive">{COPY.eventsSilentBody(Math.round((now - silentSince) / 1000), current.eventsAnsweredAt === null ? null : at(current.eventsAnsweredAt))}</Text>,
                steps(COPY.fixEventsSilent),
                eventsRetry(),
              ])
          : events.kind === 'not-allowed'
            ? cardOf('problem-events', eventsTitle(COPY.eventsNotAllowedTitle), COPY.notAllowedHint, [
                <Text color="inactive">{COPY.eventsNotAllowedBody}</Text>,
                reason(events.reason),
                ...rulesFix(COPY.fixEventsNotAllowed, 'events-allow-rules'),
                eventsRetry(),
              ])
            : events.kind === 'store'
              ? cardOf('problem-events', eventsTitle(COPY.eventsStoreTitle), COPY.statusSince(at(events.since)), [
                  <Text color="inactive">{COPY.eventsStoreBody}</Text>,
                  reason(events.reason),
                  steps(COPY.fixEventsStore(storeFileOf(events.reason) ?? COPY.storeFilePattern)),
                  eventsRetry(),
                ])
              : cardOf('problem-events', eventsTitle(COPY.eventsStoppedTitle), COPY.statusSince(at(events.since)), [
                  <Text color="inactive">{COPY.eventsStoppedBody(at(events.since))}</Text>,
                  reason(events.reason),
                  steps(COPY.fixEventsStopped),
                  <Link href={consoleLink(base, 'health')} label={COPY.health} />,
                  eventsRetry(),
                ]))
        const missingSince = current.signallerMissingSince
        const signallerCard = await part('signaller', () => missingSince === null
          ? null
          : cardOf('problem-signaller', eventsTitle(COPY.signallerMissingTitle), COPY.statusSince(at(missingSince)), [
              <Text color="inactive">{COPY.signallerMissingBody}</Text>,
              steps(COPY.fixSignallerMissing),
            ]))
        const isShown = (name: Parameters<typeof drawingAsked.off.has>[0]) => !drawingAsked.off.has(name)
        // THE DONE-SIGNAL'S STATE AS PLAIN TEXT, read as kept, each value with its type: a part that does draw says what
        // the events card would have drawn from.
        const raw = (await read($, snapshot)) as unknown as Record<string, unknown>
        const rawEvents = (raw.events ?? null) as Record<string, unknown> | null
        const eventsDiagnostics = [
          COPY.diagnosticsEvents('events', rawEvents === null || typeof rawEvents !== 'object' ? typedLine(rawEvents) : typedLine(rawEvents.kind)),
          COPY.diagnosticsEvents('since', typedLine(rawEvents?.since)),
          COPY.diagnosticsEvents('reason', typedLine(rawEvents?.reason, REASON_WHOLE)),
          COPY.diagnosticsEvents('answeredAt', typedLine(raw.eventsAnsweredAt)),
          COPY.diagnosticsEvents('watchedSince', typedLine(raw.eventsWatchedSince)),
          COPY.diagnosticsEvents('silentSince', typedLine(raw.eventsSilentSince)),
          COPY.diagnosticsEvents('store refusals', String(storeRefusals)),
          COPY.diagnosticsEvents('signaller', current.signaller === 'this' ? COPY.signallerThis(current.signallerHolder ?? shortId(sessionId), current.sessionIdSource) : current.signaller === 'another' ? COPY.signallerAnother(current.signallerHolder ?? '?', at(current.signallerSince)) : COPY.signallerNone),
        ]
        note($, `terylon-pane: Health's done-signal: ${eventsDiagnostics.join('; ')}`)
        const problems = [problemCard, rulesCard, isShown('events') ? eventsCard : null, isShown('events') ? signallerCard : null, pausedCard].filter(item => item !== null)
        // THE POLICY (S27): read as policy_get answered it, edited in place within its limits, saved with policy_save.
        const policyCard = await part('policy', async () => {
          const form = { ...EMPTY_POLICY_FORM, ...(await read($, policyForm)) }
          const rows = policyRows(policy)
          const changes = policyChanges(policy, form.values)
          const problems_ = policyProblems(policy, form.values)
          const isSavable = changes.length > 0 && problems_.length === 0
          const policyState = actState('policy')
          const isPolicyEditing = form.isEditing && hasInput && 'Input' in elements
          return cardOf('status-policy', COPY.policy, (
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
        })
        const bellState = await readBell($)
        // THE MACHINE, ITS SLOTS, ITS COST AND THE LEADER'S PAUSE: on the setup token its tokens and the phrase, never a $.
        const machineCard = await part('machine', () => {
          const health = healthOf(current, offset)
          const state = stateWord(health)
          const today = isCostKnown ? COPY.statusToday(words.money(runningUsd), current.dayBudget === null ? null : words.budget(budgetUsd)) : todayCost(health)
          const statusRow = (label: string, value: string) => (
            <Box key={`status-row-${label}`} flexDirection="row" justifyContent="space-between" gap={1}>
              <Box flexShrink={0}><Text>{label}</Text></Box>
              <Box flexShrink={1} minWidth={0}><Text color="inactive" tabular>{value}</Text></Box>
            </Box>
          )

          return cardOf('status-machine', COPY.statusMachine, <Text weight="semibold" color={colorOf(state.tone)}>{state.word}</Text>, [
            <Box key="status-since" flexDirection="row" gap={1} flexWrap="wrap">
              <Text color="subtle" size="footnote" tabular>{COPY.statusLastAnswer(current.fetchedAt === null ? null : at(current.fetchedAt))}</Text>
              {health.failingSince !== null && current.connection !== 'ok' && <Text color="subtle" size="footnote" tabular>{COPY.statusSince(health.failingSince)}</Text>}
              {current.connection === 'ok' && current.pausedSince !== null && <Text color="subtle" size="footnote" tabular>{COPY.statusSince(current.pausedSince)}</Text>}
              <Link href={base === '' ? 'https://' : base} label={`${hostName(base)} ↗`} />
            </Box>,
            statusRow(COPY.statusRowSlots, COPY.statusSlotsLine(current.slotsUsed, current.slots)),
            statusRow(COPY.statusRowCost, today),
            // THE LEADER'S PAUSE, with an optional reason; its Resume is on the paused card, here and on the overview.
            current.connection === 'ok' && current.paused === null ? <Box key="status-pause" flexDirection="row">{actButton('leader', 'leader_pause', null, { opens: true })}</Box> : null,
            current.connection === 'ok' && current.paused === null && actState('leader').open === 'leader_pause' ? actField('leader', 'leader_pause', null, { label: COPY.whyOptional }) : null,
            current.connection === 'ok' && current.paused === null && actState('leader').open === 'leader_pause' ? <Text color="subtle" size="footnote">{COPY.pauseNote}</Text> : null,
            actBusyNote('leader'),
          ], 'plain', true)
        })
        // THE LAST 30 DAYS, in rows, and the Policy and Diagnostics a press away.
        const monthCard = cardOf('status-month', COPY.statusMonth, null, [
          ...(bellState.phase === 'loading' ? [quiet(elements, COPY.loading)] : bellState.metrics.map(metric => (
            <Box key={`metric-${metric.label}`} flexDirection="row" justifyContent="space-between" gap={1}>
              <Text>{`${metric.label.slice(0, 1).toUpperCase()}${metric.label.slice(1)}`}</Text>
              <Text color="inactive" tabular>{metric.value}</Text>
            </Box>
          ))),
          folds('status-folds', [
            isShown('policy') ? foldButton('fold-policy', COPY.policy, shown.includes('fold-policy')) : null,
            isShown('diagnostics') ? foldButton('fold-diagnostics', COPY.statusDiagnostics, shown.includes('fold-diagnostics')) : null,
          ]),
        ], 'plain', true)

        // PLAIN LINES ALONE: no card and no picture, to tell Health's drawing from its data.
        const tree = drawingAsked.isMinimal
          ? (
              <Box key="more-health" flexDirection="column" gap={1}>
                <Text>{COPY.statusMinimalMachine(stateWord(healthOf(current, offset)).word)}</Text>
                <Text>{COPY.statusMinimalProblems(problems.length, events === null ? null : events.kind)}</Text>
                <Text>{COPY.diagnosticsVersion(MOD_VERSION)}</Text>
              </Box>
            )
          : (
              <Box key="more-health" flexDirection="column" gap={1}>
                <Text size="heading" weight="semibold">{COPY.moreHealth}</Text>
                {isShown('alerts') && alertLine}
                {/* WHAT IS WRONG FIRST, under its heading; with nothing wrong the machine's card says so. */}
                {isShown('problems') && problems.length > 0 && headingOf(COPY.statusProblems, problems.length, 'error')}
                {isShown('problems') && problems}
                {isShown('machine') && isShown('gauges') ? twoColumns('status-cards', machineCard, monthCard) : [isShown('machine') ? machineCard : null, isShown('gauges') ? monthCard : null]}
                {isShown('outcomes') && actOutcome('leader', consoleLink(base, 'work'), COPY.workInConsole)}
                {isShown('policy') && shown.includes('fold-policy') && policyCard}
                {isShown('outcomes') && actOutcome('policy', consoleLink(base, 'policy'), COPY.policyInConsole)}
                {isShown('diagnostics') && shown.includes('fold-diagnostics') && cardOf('status-diagnostics', <Text size="heading" weight="semibold" color="subtle">{COPY.statusDiagnostics}</Text>, null, [
                  <Text color="subtle" mono>{COPY.diagnosticsVersion(MOD_VERSION)}</Text>,
                  <Text color="subtle" mono>{COPY.diagnosticsUrl(base)}</Text>,
                  <Text color="subtle" mono>{COPY.diagnosticsServer(current.server)}</Text>,
                  ...eventsDiagnostics.map(line => <Text color="subtle" mono>{line}</Text>),
                  <Text color="subtle" size="footnote">{COPY.diagnosticsDebug}</Text>,
                ])}
                <Box key="health-links" flexDirection="row" gap={1} flexWrap="wrap">
                  <Link href={consoleLink(base, 'health')} label={COPY.health} />
                </Box>
              </Box>
            )

        // EVERY DRAW SAYS WHAT IT RETURNS and what in it a host may refuse: a line here beside a blank pane is a tree
        // the host dropped, and the check names what the kit lets through.
        note($, `terylon-pane: Health draws ${drawingAsked.isMinimal ? 'minimal' : STATUS_DRAWN.filter(isShown).join(', ')}; problems ${problems.length}${events === null ? '' : `, events ${events.kind}`}${silentSince === null ? '' : ', the watchdog'}; ${treeLine(checkTree(tree))}; ${Math.max(0, (await $.clock.now()) - now)} ms`)

        return tree
      } catch (error) {
        // WHAT NO PART CAUGHT still says why, so the owner can move on and read the debug log.
        const message = messageOf(error)
        note($, `terylon-pane: Health did not draw: ${message}`)

        return (
          <Box key="more-health" flexDirection="column" gap={1}>
            {cardOf('problem-part-status', warned(COPY.statusPartFailed('tab')), null, [reason(message), steps(COPY.fixStatusPart)], 'bad')}
          </Box>
        )
      }
    }

    // NOTICES, AN ORDINARY SCREEN on every surface, as More is: ‹ Overview and Refresh at its head.
    if (screen.screen === 'notices') {
      return (
        <Box flexDirection="column" gap={1}>
          <Box key="notices-top" flexDirection="row" justifyContent="space-between" gap={1}>
            {backButton}
            {refreshButton}
          </Box>
          {await part('notices', noticesSection)}
        </Box>
      )
    }

    // SYSTEM: Health alone; ‹ Overview from the head's buttons, ‹ back from a card's How to fix.
    if (screen.screen === 'more') {
      const healthPart = await healthSection()

      return (
        <Box flexDirection="column" gap={1}>
          <Box key="more-top" flexDirection="row" justifyContent="space-between" gap={1}>
            {stack.length > 2 ? backButton : <Button key="tab-queue" label={backLabel(stack)} dimColor onPress={() => show($, QUEUE, true)} />}
            {refreshButton}
          </Box>
          {healthPart}
        </Box>
      )
    }

    // MEMORY, a screen of its own: ‹ Overview and Refresh at its head, then the memory as it stood on More.
    if (screen.screen === 'memory') {
      const memoryPart = await part('memory', memorySection)

      return (
        <Box flexDirection="column" gap={1}>
          <Box key="memory-top" flexDirection="row" justifyContent="space-between" gap={1}>
            {stack.length > 2 ? backButton : <Button key="tab-queue" label={backLabel(stack)} dimColor onPress={() => show($, QUEUE, true)} />}
            {refreshButton}
          </Box>
          {memoryPart}
        </Box>
      )
    }

    if (problemCard !== null && !isStale && screen.screen === 'queue') {
      return (
        <Box flexDirection="column" gap={1}>
          {overviewHead}
          {problemCard}
          {overviewFoot}
        </Box>
      )
    }

    if (problemCard !== null && !isStale) {
      return (
        <Box flexDirection="column" gap={1}>
          {backButton}
          {problemCard}
        </Box>
      )
    }

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

      // DELETED WITH ITS GOAL: the sentence, quietly, and ‹ back; never a failure.
      if (shownStory.phase === 'deleted') {
        return (
          <Box flexDirection="column" gap={1}>
            {backButton}
            {quiet(elements, shownStory.sentence ?? '')}
          </Box>
        )
      }

      if (shownStory.phase === 'error') {
        return (
          <Box flexDirection="column" gap={1}>
            {backButton}
            {cardOf('story-error', warned(COPY.storyError), labelOf('story', screen.story), [reason(shownStory.sentence)], 'bad')}
          </Box>
        )
      }

      const criteriaOpen = shown.includes(`criteria-${shownStory.story}`)
      const timelineOpen = shown.includes(`timeline-${shownStory.story}`)
      const done = shownStory.phases.filter(item => item.status === 'done').length
      const nowAt = shownStory.phases.findIndex(item => item.status === 'now')
      // STUCK OR BLOCKED, its segment now is drawn amber.
      const isStuck = shownStory.stateTone === 'warning'
      const labels = shortLabels(shownStory.phases)
      const steps_ = phaseSteps(shownStory.phases, labels)
      const working = shownStory.working
      const tooltips = look.proofs.svgTooltips
        ? shownStory.phases.map(item => COPY.phaseTooltip(item.label, item.role, item.status, item.status === 'now' ? shownStory.working?.step ?? null : null))
        : null
      const stateChip = (
        // THE STATE AS A CHIP: its colour on the theme's neutral grey. Filled in its own colour, 1.2.0's read as a blank block.
        <Box key="story-state" flexShrink={0} backgroundColor={look.isGraphic ? CHIP_BACKGROUND : undefined} paddingX={look.isGraphic ? 'xs' : 0}>
          <Text size="caption" color={CHIP_WORD}>{look.isGraphic ? '\u00a0' : ''}<Text color={shownStory.stateTone}>{CHIP_DOT}</Text>{` ${shownStory.stateText}${look.isGraphic ? '\u00a0' : ''}`}</Text>
        </Box>
      )
      const storyKey = `story-${shownStory.story}`
      const storyAct = actState(storyKey)
      // THE STORY AND ITS GOAL BY THEIR REFS, in the console's addresses, its Goal button and the prompt alike.
      const storyRef = refItem('story', shownStory.story)
      const storyLabel = labelOf('story', shownStory.story)
      const goalLabel = shownStory.goal === null ? null : shownStory.goalRef ?? labelOf('goal', shownStory.goal)

      return (
        <Box flexDirection="column" gap={1}>
          <Box key="story-top" flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
            {backButton}
            <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
              <Link href={storyLink(base, 'story', storyRef, shownStory.story)} label={COPY.storyInConsole} />
              {refreshButton}
            </Box>
          </Box>
          <Box key="story-head" flexDirection="column">
            <Text size="caption" color="subtle">{COPY.storyCaption(goalLabel)}</Text>
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
          {cardOf('story-phases', COPY.phases, <Text color="subtle" size="footnote" tabular>{ENDED_STORY_STATES.includes(shownStory.state) ? COPY.phasesEnded(done, shownStory.phases.length, shownStory.stateText) : nowAt >= 0 || shownStory.hasStage ? COPY.phasesHint(nowAt >= 0 ? nowAt + 1 : done, shownStory.phases.length) : COPY.phasesNoStage(done, shownStory.phases.length)}</Text>, [
            // THE ROAD: the Svg says no word, the names sit under it in Text; no stage, no segment is now.
            roadDrawing(elements, look, 'story-road', steps_, { isStuck, tooltips }),
            look.isGraphic
              // COMPACT, below ROAD_NAMES_COLUMNS (the owner's walk, a dock of about 435 px): eight names ran together, so
              // only the phase now is named; the tooltips name the rest.
              ? roadNames(elements, look, 'phase', steps_, { isStuck, onlyNow: look.isCompact })
              : shownStory.phases.map((item, index) => (
                  <Box key={`phase-${index}`} flexDirection="row" justifyContent="space-between" gap={1}>
                    <Text>
                      <Text color={item.status === 'done' ? 'success' : item.status === 'now' ? 'suggestion' : 'subtle'}>{`${phaseGlyph(item.status, index === shownStory.phases.length - 1)} `}</Text>
                      <Text bold={item.status === 'now'} color={item.status === 'next' ? 'subtle' : 'text'}>{item.label}</Text>
                      {item.role !== null && <Text color="subtle">{` · ${item.role}`}</Text>}
                    </Text>
                    <Text color="subtle" wrap="truncate-end">{item.detail}</Text>
                  </Box>
                )),
            // WHAT NEXT, for a story no run is working on: what it waits for.
            working === null && storyNext(shownStory) !== null ? nextLine('story-next', COPY.whatNext, storyNext(shownStory) ?? '') : null,
            // NOW WORKING, under the road: the agent at work, its step and what the run spent, with the run's own acts.
            working === null ? null : (
              <Box key="story-working" flexDirection="column" gap={look.isGraphic ? 'xs' : 0}>
                <Box flexDirection="row" justifyContent="space-between" gap={1}>
                  <Text weight="semibold" color="subtle">{COPY.nowWorking}</Text>
                  <Text color="subtle" size="footnote">{COPY.nowWorkingHint(working.agent, working.stage)}</Text>
                </Box>
                <Text weight="semibold">{working.step}</Text>
                {look.isGraphic
                  ? (
                      <Box key="working-numbers" flexDirection="row" gap="lg" flexWrap="wrap">
                        {working.numbers.map((item, index) => (
                          <Box key={`working-number-${index}`} flexDirection="column">
                            <Text size="title" weight="semibold" tabular>{item.value}</Text>
                            <Text size="footnote" color="subtle">{item.label}</Text>
                          </Box>
                        ))}
                      </Box>
                    )
                  : null}
                {/* A BAR AGAINST THE STORY'S DOLLAR BUDGET only where the cost is known: none on the setup token. */}
                {look.isGraphic && working.spentUsd !== null ? picture(elements, spendBar(working.spentUsd, working.budgetUsd, COPY.spendAlt(words.money(working.spentUsd), words.budget(working.budgetUsd ?? 0)))) : null}
                {!look.isGraphic && working.fraction !== null ? <Text color="suggestion">{bar(working.fraction)}</Text> : null}
                {!look.isGraphic ? <Text color="inactive">{working.spend}</Text> : null}
                <Box key="story-working-acts" flexDirection="row" gap={1} flexWrap="wrap">
                  {shownStory.canStop && actButton(storyKey, 'story_stop', screen.story)}
                  <Button key="summarise" label={COPY.summariseInSession} onPress={() => postPrompt($, COPY.summarisePrompt(storyLabel))} />
                </Box>
              </Box>
            ),
          ])}
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
          {shownStory.verdict !== null && cardOf('story-verdict', <Text size="heading" weight="semibold" color={shownStory.verdict.isGreen ? 'success' : 'error'}>{COPY.verdict}</Text>, <Text color="subtle" size="footnote" mono>{COPY.verdictHint(shownStory.verdict.commit)}</Text>, [
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
                <Text color="error">{`! ${COPY.overrun} `}</Text>
                <Text color="error">{`${shownStory.overrun.length} · ${shownStory.overrun.join(', ')}`}</Text>
              </Text>
            ),
          ])}
          {twoColumns('story-columns', shownStory.criteria.length === 0 ? null : cardOf('story-criteria', COPY.criteria, COPY.criteriaHint(shownStory.criteria.length), [
            ...(criteriaOpen ? shownStory.criteria : shownStory.criteria.slice(0, CRITERIA_SHOWN)).map((criterion, index) => (
              <Text key={`criterion-${index}`} color="inactive" wrap={criteriaOpen ? 'wrap' : 'truncate-end'}>{`· ${criterion}`}</Text>
            )),
            shownStory.criteria.length > CRITERIA_SHOWN ? (
              <Button key="criteria-more" plain dimColor label={criteriaOpen ? COPY.less : COPY.moreCount(shownStory.criteria.length - CRITERIA_SHOWN)} onPress={() => toggle($, `criteria-${shownStory.story}`)} />
            ) : null,
          ]), shownStory.timeline.length === 0 ? null : cardOf('story-timeline', COPY.timeline, COPY.timelineHint, [
            ...(timelineOpen ? shownStory.timeline : shownStory.timeline.slice(0, TIMELINE_SHOWN)).map((event, index) => (
              <Text key={`event-${index}`} wrap="truncate-end">
                <Text color="subtle" tabular>{`${event.time} `}</Text>
                <Text color="inactive">{`${event.actor} `}</Text>
                {withHash(elements, event.summary)}
              </Text>
            )),
            shownStory.timeline.length > TIMELINE_SHOWN ? (
              <Button key="timeline-more" plain dimColor label={timelineOpen ? COPY.less : COPY.moreCount(shownStory.timeline.length - TIMELINE_SHOWN)} onPress={() => toggle($, `timeline-${shownStory.story}`)} />
            ) : null,
          ]))}
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
          {actOutcome(storyKey, storyLink(base, 'story', storyRef, shownStory.story), COPY.storyInConsole)}
          <Box key="story-actions" flexDirection="row" gap={1} flexWrap="wrap" alignItems="center">
            {shownStory.isVerified && !shownStory.isList && mergeLink('merge-story', storyLink(base, 'merge', storyRef, shownStory.story), COPY.mergeInConsole)}
            {shownStory.isVerified && shownStory.isList && actButton(storyKey, 'story_accept', screen.story, { isPrimary: true })}
            {shownStory.isVerified && actButton(storyKey, 'story_return', screen.story, { opens: true })}
            {shownStory.canAbandon && actButton(storyKey, 'story_abandon', screen.story, { isDanger: true, opens: true })}
            {working === null && <Button key="summarise" label={COPY.summariseInSession} onPress={() => postPrompt($, COPY.summarisePrompt(storyLabel))} />}
            {shownStory.goal !== null && <Button key="story-goal" label={COPY.goalOf(goalLabel ?? String(shownStory.goal))} dimColor onPress={() => go({ screen: 'goal', goal: shownStory.goal ?? 0 })} />}
            {shownStory.pullRequest !== null && <Link href={shownStory.pullRequest.url} label={shownStory.pullRequest.label} />}
            {/* A WORK ITEM IS ONLY EVER THIS LINK, "ADO #n ↗", never the story's name. */}
            {shownStory.workItem !== null && shownStory.workItem !== undefined && <Link href={shownStory.workItem.url} label={shownStory.workItem.label} />}
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
          </Box>
        )
      }

      const choices = question === null ? [] : questionChoices(question.text)
      const about = question === null ? '' : question.about === question.subjectLabel ? question.subjectLabel : `${question.about} · ${question.subjectLabel}`

      return (
        <Box flexDirection="column" gap={1}>
          <Box key="question-top" flexDirection="row" justifyContent="space-between">
            {backButton}
            {index >= 0 && <Text color="text" weight="semibold" tabular>{COPY.questionOf(index + 1, current.questions.length)}</Text>}
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
            <Text weight="semibold" color={form.phase === 'paused' ? 'text' : 'error'}>{form.phase === 'paused' ? COPY.added : COPY.notAdded}</Text>
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
          {form.goals.length === 0 && <Text color="text" weight="semibold">{COPY.noGoal}</Text>}
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

    const goalsState = await readGoals($)

    // ONE PLAN: its chain, its stories in order, each opening the story; approval and rethinking are the console's.
    const planCard = (plan: (typeof goalsState.plans)[number], isOnGoal = false) => {
      // ITS ORDER IS ITS STORIES' after (#35): an arrow only where a story waits for another, said by their titles.
      const chain = plan.stories.map(item => ({ index: item.index, after: item.after }))
      const orderAlt = COPY.planOrderAlt(plan.stories.map(item => ({ title: item.title, after: item.after.map(place => plan.stories[place - 1]?.title ?? `#${place}`) })))

      const planKey = `plan-${plan.id}`
      // A value an older version stored has no taskVersion: it is drawn as a plan of stories until plans_list is read again.
      const taskVersion = plan.taskVersion ?? null
      const planSubtitle = taskVersion === null ? plan.goalTitle : COPY.taskVersion(taskVersion.version, taskVersion.title ?? plan.goalTitle)
      const card_ = cardOf(`plan-${plan.id}`, <Text size="heading" weight="semibold">{COPY.plan(plan.ref ?? String(plan.id))}<Text color="subtle" weight="regular">{` · ${planSubtitle}`}</Text></Text>, plan.stateText, [
        // A PLAN AS A CHAIN (S32): the order and the "after" of its stories as an Svg, as 1 → 2 → 3 on the terminal. Only
        // the order (#39): the sizes beside it, "S ~$3 → M ~$5", read as nodes of a second chain, and a plan of one story
        // drew "○ M" above its row. A plan of one story has no order to draw; each size is said on its story's row. Nor
        // has a plan whose stories wait for none: its chain would be circles with nothing between them.
        plan.stories.length < 2 || plan.stories.every(item => item.after.length === 0)
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
        taskVersion === null ? <Text color="inactive" size="footnote">{COPY.planNote}</Text> : null,
        taskVersion === null || taskVersion.terms === null ? null : <Text key={`plan-${plan.id}-terms`} color="inactive" size="footnote">{taskVersion.terms}</Text>,
        // THE PLAN'S ACTS (S27): Approve in one press, Rethink… with its comment; editing criteria stays the console's.
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {plan.isProposed && actButton(planKey, 'plan_approve', plan.id, { isPrimary: true })}
          {plan.isProposed && actButton(planKey, 'plan_rethink', plan.id, { opens: true })}
          {isOnGoal ? null : <Button key={`plan-${plan.id}-goal`} label={COPY.goalOf(plan.goalRef ?? labelOf('goal', plan.goal))} dimColor onPress={() => go({ screen: 'goal', goal: plan.goal })} />}
        </Box>,
        plan.isProposed && actState(planKey).open === 'plan_rethink' ? actField(planKey, 'plan_rethink', plan.id, { label: COPY.rethinkLabel }) : null,
        plan.isProposed && actState(planKey).open === 'plan_rethink' ? <Text color="subtle" size="footnote">{COPY.rethinkNote}</Text> : null,
        actBusyNote(planKey),
        plan.isProposed ? (
          <Text key={`plan-${plan.id}-note`} color="subtle" size="footnote">{taskVersion === null ? COPY.approveNote(plan.stories.length) : COPY.approveVersionNote(taskVersion.version)}</Text>
        ) : null,
        plan.isProposed ? <Link key={`plan-${plan.id}-console`} href={plan.console} label={taskVersion === null ? COPY.approveConsole : COPY.planInConsole} /> : null,
      ], plan.isProposed ? 'wait' : 'plain')

      return [card_, actOutcome(planKey, plan.console, COPY.planInConsole, [
        actState(planKey).outcome?.tool === 'plan_approve' && screen.screen !== 'queue' ? <Button key={`act-${planKey}-queue`} label={COPY.openQueue} variant="primary" onPress={() => show($, QUEUE, true)} /> : null,
      ])]
    }

    // A REPEATING TASK'S CARD (Terylon S43), in place of the goal's stories: the summary, the newest run in a box of its
    // own with the link to its story, the older runs as rows, the foot and the task's sheet in the console. Every
    // child is keyed and every word a string: Desktop drops the whole tab when it cannot draw one card.
    const repeatingCard = (repeating: PaneRepeating, versions: readonly PanePlan[]) => {
      const [newest, ...older] = repeating.runs
      // ONE KEY PER RUN: two runs of one story would otherwise draw two children of one key.
      // AN OLDER RUN THAT WENT WELL IS QUIET, as the design draws it: only one that waits keeps its colour.
      const olderTone = (run: PaneRepeatingRun) => (run.tone === 'success' ? 'subtle' : run.tone)
      const runKey = (run: PaneRepeatingRun, index: number) => (repeating.runs.findIndex(item => item.story === run.story) === index ? `repeating-run-${run.story}` : `repeating-run-${run.story}-${index}`)

      return cardOf('goal-repeating', repeating.title, <Text color="success" size="footnote" mono>{COPY.repeating}</Text>, [
        <Text key="repeating-summary" color="subtle" size="footnote">{repeating.summary}</Text>,
        // THE TASK'S SETTLED VERSIONS, in one line here rather than as plans below the card: nothing in them waits.
        versions.length === 0 ? null : (
          <Text key="repeating-versions" color="subtle" size="footnote">
            {COPY.repeatingVersions(versions.map(plan => ({ version: plan.taskVersion?.version ?? null, plan: plan.ref ?? String(plan.id), isWithdrawn: plan.state === 'withdrawn' })))}
          </Text>
        ),
        newest === undefined
          ? <Box key="repeating-none" flexDirection="column">{quiet(elements, COPY.repeatingNoRun)}</Box>
          : (
              <Box key="repeating-newest" flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={look.isGraphic ? 'sm' : 1} gap={look.isGraphic ? 'xs' : 0}>
                <Box flexDirection="row" justifyContent="space-between" gap={1}>
                  <Text tabular>{newest.day}</Text>
                  <Text color={colorOf(newest.tone)} weight={weightOf(newest.tone)}>{newest.state}</Text>
                </Box>
                {newest.line === '' ? null : <Text color="subtle" size="footnote">{newest.line}</Text>}
                {newest.story === null ? null : <Button key={runKey(newest, 0)} label={COPY.openRun} plain onPress={() => go({ screen: 'story', story: newest.story ?? 0 })} />}
              </Box>
            ),
        // AN OLDER RUN: its day the press, its state a Text of its own in its tone. Folded into one Button's label, Desktop
        // drew the state in the label's colour; the narrow dock keeps both on one line, "day · state".
        ...older.map((run, index) => (
          <Box key={`repeating-older-${index}`} flexDirection="row" justifyContent={look.isNarrow ? 'flex-start' : 'space-between'} gap={look.isNarrow ? 0 : 1}>
            {run.story === null
              ? <Text key={`repeating-older-${index}-day`} color="subtle" tabular>{run.day}</Text>
              : <Button key={runKey(run, index + 1)} label={run.day} plain onPress={() => go({ screen: 'story', story: run.story ?? 0 })} />}
            <Text key={`repeating-older-${index}-state`} color={colorOf(olderTone(run))} weight={weightOf(olderTone(run))}>{look.isNarrow ? ` · ${run.state}` : run.state}</Text>
          </Box>
        )),
        <Text key="repeating-foot" color="subtle" size="footnote">{COPY.repeatingFoot}</Text>,
        <Link key="repeating-console" href={repeating.console} label={COPY.repeatingInConsole} />,
      ])
    }

    // A SPECIFICATION'S FILES (Terylon S53): those kept and attached, each a row with a quiet Remove, then the folder's
    // .md files to attach and another folder to list. A file of a name takes the place of the other, so each name keys
    // one row. New goal's card names the session's folder above its files and, on a graphic surface, frames each
    // attached file and sets Another folder's label above its field.
    const specPickerOf = (prefix: 'spec-new' | 'revise', picker: PaneSpecPicker, kept: readonly { name: string; text: string }[]) => {
      const which = prefix === 'spec-new' ? 'new' : 'revise'
      const isNewGoal = prefix === 'spec-new'
      const isLabelAbove = isNewGoal && look.isGraphic
      const offered = picker.listed.filter(file => !picker.attached.some(item => item.path === file.path))
      const fileRow = (name: string, line: string, removeKey: string, onRemove: () => unknown) => (
        <Box key={`${prefix}-row-${name}`} flexDirection="row" justifyContent="space-between" alignItems="center" gap={1} {...(isLabelAbove ? ({ borderStyle: 'round', borderColor: 'subtle', paddingX: 'sm' } as const) : {})}>
          <Box flexShrink={1} minWidth={0}>
            <Text wrap="truncate-end">{line}</Text>
          </Box>
          <Button key={removeKey} label={COPY.specRemove} plain dimColor onPress={onRemove} />
        </Box>
      )
      const listedIn = picker.listedFolder === SESSION_FOLDER ? (isNewGoal ? COPY.specInSessionFolder : null) : COPY.specListedIn(picker.listedFolder)

      return [
        ...kept.map(file => fileRow(file.name, COPY.specAttached(file.name, charactersText(file.text.length)), `${prefix}-drop-${file.name}`, () => dropKept($, file.name))),
        ...picker.attached.map(file => fileRow(file.name, COPY.specAttached(file.name, bytesText(file.bytes)), `${prefix}-remove-${file.name}`, () => removeFile($, which, file.name))),
        picker.phase === 'loading' ? quiet(elements, COPY.specListing) : null,
        picker.phase === 'error' ? <Text key={`${prefix}-list-error`} color="error">{picker.sentence ?? ''}</Text> : null,
        picker.phase === 'ok' && picker.listed.length === 0 ? quiet(elements, COPY.specNoFiles(picker.listedFolder)) : null,
        picker.phase === 'ok' && offered.length > 0 && listedIn !== null ? <Text key={`${prefix}-listed-in`} color="subtle" size="footnote">{listedIn}</Text> : null,
        picker.phase === 'ok' && offered.length > 0 ? (
          <Box key={`${prefix}-listed`} flexDirection={look.isNarrow ? 'column' : 'row'} flexWrap="wrap" gap={look.isGraphic ? 'xs' : 1}>
            {offered.map(file => <Button key={`${prefix}-add-${file.name}`} label={COPY.specAttach(file.name, bytesText(file.bytes))} onPress={() => attachFile($, which, file)} />)}
          </Box>
        ) : null,
        hasInput && 'Input' in elements ? (
          <Box key={`${prefix}-folder-field`} flexDirection="column">
            {isLabelAbove ? <Text color="subtle" size="footnote">{COPY.specFolderLabel}</Text> : null}
            <elements.Input key={`${prefix}-folder`} {...(isLabelAbove ? {} : { label: COPY.specFolderLabel })} placeholder={COPY.specFolderPlaceholder} value={picker.folder} onInput={value => changePicker($, which, current => ({ ...current, folder: value }))} onSubmit={value => listFolder($, which, value)} />
          </Box>
        ) : null,
      ]
    }

    // ONE VERSION OF A GOAL'S SPECIFICATION, READ-ONLY (Terylon S53): its files as Markdown, or the one file pressed.
    if (screen.screen === 'spec') {
      const shownSpec = await read($, specView)
      const isShown = shownSpec !== null && shownSpec.goal === screen.goal && shownSpec.version === screen.version && shownSpec.file === screen.file

      if (shownSpec === null || !isShown || shownSpec.phase === 'loading') {
        return (
          <Box flexDirection="column" gap={1}>
            {backButton}
            {quiet(elements, COPY.specLoading)}
          </Box>
        )
      }

      const version = shownSpec.shown ?? screen.version ?? 0
      const files = screen.file === null ? shownSpec.files : shownSpec.files.filter(file => file.name === screen.file)

      return (
        <Box flexDirection="column" gap={1}>
          {backButton}
          {shownSpec.phase === 'error'
            ? cardOf('spec-error', warned(COPY.loadError(COPY.specOf(labelOf('goal', screen.goal)))), null, [reason(shownSpec.sentence)], 'bad')
            : (
                <Box key="spec-head" flexDirection="column">
                  <Text size="caption" color="subtle">{COPY.specOf(labelOf('goal', screen.goal)).toUpperCase()}</Text>
                  <Text size="title" weight="semibold">{screen.file ?? COPY.specVersionShown(version)}</Text>
                  <Text color="subtle" size="footnote">{screen.file === null ? COPY.specReadOnly(shownSpec.revised) : `${COPY.specVersionShown(version)} · ${COPY.specReadOnly(shownSpec.revised)}`}</Text>
                </Box>
              )}
          {shownSpec.phase === 'ok' && files.length === 0 ? quiet(elements, COPY.specFileMissing(screen.file ?? '', version)) : null}
          {shownSpec.phase === 'ok' && files.map(file => cardOf(`spec-text-${file.name}`, file.name, charactersText(file.text.length), [
            <Markdown key={`spec-markdown-${file.name}`} text={file.text} />,
          ]))}
          <Link key="spec-view-console" href={goalLink(base, refItem('goal', screen.goal), screen.goal)} label={COPY.specInConsole} />
        </Box>
      )
    }

    if (screen.screen === 'plan') {
      const plan = goalsState.plans.find(item => item.id === screen.plan) ?? null

      return (
        <Box flexDirection="column" gap={1}>
          {backButton}
          {plan === null ? quiet(elements, goalsState.phase === 'loading' ? COPY.loading : COPY.noPlans) : planCard(plan)}
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
      // A REPEATING TASK'S SETTLED VERSION PLANS are said on its card; a version that waits stays below as an act.
      const settledVersions = repeating === null
        ? []
        : plans.filter(plan => (plan.taskVersion ?? null) !== null && !plan.isProposed && plan.state !== 'rethink').sort((first, second) => first.id - second.id)

      if (shownGoal === null || shownGoal.goal !== screen.goal || shownGoal.phase === 'loading') {
        return (
          <Box flexDirection="column" gap={1}>
            {backButton}
            {quiet(elements, COPY.loading)}
          </Box>
        )
      }

      // ITS SPECIFICATION (Terylon S53): the version, each file opening read-only, the re-plan the leader offers, Revise…,
      // the older versions, the console, and the owner's decisions on earlier plans. A goal with none draws nothing here.
      const specification = shownGoal.phase === 'ok' ? shownGoal.specification ?? null : null
      const specKey = `spec-${screen.goal}`
      const replanState = actState(specKey)
      const replan = specification === null ? null : specification.replan
      const reviseForm = await read($, revise)
      const isRevising = reviseForm !== null && reviseForm.goal === screen.goal && reviseForm.phase !== 'saved'
      // ITS ROAD (hooks/road.ts), from its own stories as goal_get names them, each as the last read knows it. A repeating
      // task's goal has none. Its proposed plan's card stands right under it, with its acts.
      const goalRoadStories = (shownGoal.stories ?? []).map(item => current.stories.find(story => story.id === item.id) ?? { id: item.id, ref: '', title: item.title, goal: screen.goal, goalRef: null, state: item.stateKey ?? '', isList: item.isList === true, isStuck: false, usd: 0, tokens: null, isCostKnown: true })
      const goalRoad = shownGoal.phase !== 'ok' || repeating !== null
        ? null
        : roadOf({
            isClosed: isClosedGoal(shownGoal.state ?? 'open'),
            target: shownGoal.target,
            stories: goalRoadStories,
            plans: roadPlansOf(plans, current.waiting).filter(plan => plan.goal === screen.goal),
            hasQuestion: questions.length > 0 || current.questions.some(item => goalRoadStories.some(story => item.subject === `story/${story.id}`)),
          })
      const waitingPlan = plans.find(plan => plan.isProposed)
      const goalNext = goalRoad?.stage === 'approve' && waitingPlan !== undefined ? COPY.nextApprovePlan(waitingPlan.ref ?? String(waitingPlan.id)) : goalRoad?.next ?? ''
      const specCard = specification === null ? null : cardOf('goal-spec', COPY.specTitle(specification.version), COPY.specRevised(specification.revised), [
        <Box key="spec-files" flexDirection="column" gap={look.isGraphic ? 'xs' : 0}>
          {specification.files.map(file => <Button key={`spec-file-${file.name}`} label={COPY.specFile(file.name, file.size)} plain onPress={() => go({ screen: 'spec', goal: screen.goal, version: null, file: file.name })} />)}
        </Box>,
        // THE RE-PLAN THE LEADER OFFERS, stroked amber as a card that waits, its words never amber: called on its press alone.
        replan === null ? null : cardOf('spec-replan-notice', <Text weight="semibold">{COPY.specReplanNote(replan.from)}</Text>, null, [
          <Box key="spec-replan-actions" flexDirection="row" gap={1} flexWrap="wrap">
            <Button key="spec-replan" label={replanState.busy === 'goal_replan' ? COPY.actBusy.goal_replan ?? '' : COPY.specReplan(replan.to)} variant={replanState.busy === null ? 'primary' : undefined} dimColor={replanState.busy === null ? undefined : true} onPress={() => (replanState.busy === null ? takeAct($, specKey, 'goal_replan', screen.goal, '', { goal: screen.goal }) : undefined)} />
          </Box>,
        ], 'wait'),
        reviseForm !== null && reviseForm.goal === screen.goal && reviseForm.phase === 'saved' ? <Text key="spec-saved" color="success">{COPY.specSaved(reviseForm.sentence ?? '')}</Text> : null,
        <Box key="spec-actions" flexDirection="row" gap={1} flexWrap="wrap">
          {isRevising ? null : <Button key="spec-revise" label={COPY.specRevise} onPress={() => openRevise($, screen.goal, specification.version)} />}
          {specification.older.map(version => <Button key={`spec-version-${version}`} label={COPY.specVersion(version)} dimColor onPress={() => go({ screen: 'spec', goal: screen.goal, version, file: null })} />)}
        </Box>,
      ])
      // REVISE…: the files kept whole, replaced or added from a folder, removed; saved as the next version on its press.
      const reviseCard = specification === null || reviseForm === null || !isRevising ? null : cardOf('spec-revise-form', COPY.specReviseTitle(reviseForm.basedOn), COPY.specReviseHint, [
        reviseForm.phase === 'loading' ? quiet(elements, COPY.specLoading) : null,
        ...(reviseForm.phase === 'editing' || reviseForm.phase === 'saving' ? specPickerOf('revise', reviseForm.picker, reviseForm.kept) : []),
        reviseForm.phase === 'failed' ? null : <Text color="subtle" size="footnote">{COPY.specHelp}</Text>,
        reviseForm.problem === null ? null : <Text key="revise-problem" color="error">{reviseForm.problem}</Text>,
        <Box key="revise-actions" flexDirection="row" gap={1} flexWrap="wrap">
          {reviseForm.phase === 'failed' || reviseForm.phase === 'loading' ? null : (
            <Button key="revise-save" label={reviseForm.phase === 'saving' ? COPY.specSaving : COPY.specSave(reviseForm.basedOn + 1)} variant={reviseForm.phase === 'saving' ? undefined : 'primary'} dimColor={reviseForm.phase === 'saving' ? true : undefined} onPress={() => saveRevise($)} />
          )}
          <Button key="revise-cancel" label={COPY.specCancel} dimColor onPress={() => (reviseForm.phase === 'saving' ? undefined : update($, revise, (): PaneRevise | null => null))} />
        </Box>,
      ])

      // DELETED FOR GOOD: the sentence, quietly, and ‹ back; never a failure.
      if (shownGoal.phase === 'deleted') {
        return (
          <Box flexDirection="column" gap={1}>
            {backButton}
            {quiet(elements, shownGoal.sentence ?? COPY.goalDeleted(screen.goal))}
          </Box>
        )
      }

      const decisions = specification === null ? [] : specification.decisions
      const isDecisionsOpen = shown.includes('fold-decisions')
      const isAddOpen = shown.includes('fold-add-task')
      const storiesCard = shownGoal.phase === 'ok' && repeating === null ? cardOf('goal-stories', COPY.goalStories, <Text color="subtle" size="footnote" tabular>{String(shownGoal.stories.length)}</Text>, [
        shownGoal.stories.length === 0 ? quiet(elements, COPY.noGoalStories) : null,
        ...shownGoal.stories.map(item =>
          rowOf({ key: `goal-story-${item.id}`, kind: COPY.kindStory, kindTone: markOf(kindTone(item.state)), title: item.title, detail: item.state, onPress: () => go({ screen: 'story', story: item.id }) })),
      ]) : null

      return (
        <Box flexDirection="column" gap={1}>
          <Box key="goal-top" flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
            {backButton}
            <Box flexDirection="row" alignItems="center" gap={1} flexWrap="wrap">
              <Link key="goal-console" href={goalLink(base, refItem('goal', screen.goal), screen.goal)} label={COPY.goalInConsole} />
              {refreshButton}
            </Box>
          </Box>
          {shownGoal.phase === 'error'
            ? cardOf('goal-error', warned(COPY.loadError(COPY.goalOf(labelOf('goal', screen.goal)))), null, [reason(shownGoal.sentence)], 'bad')
            : (
                <Box key="goal-head" flexDirection="column">
                  <Text size="caption" color="subtle">{COPY.goalOf(shownGoal.ref ?? labelOf('goal', screen.goal)).toUpperCase()}</Text>
                  <Text size="title" weight="semibold">{shownGoal.title}</Text>
                  <Text color="subtle" size="footnote">{shownGoal.meta}</Text>
                  {shownGoal.ask === null || shownGoal.ask === undefined ? null : <Text color="inactive">{shownGoal.ask}</Text>}
                </Box>
              )}
          {goalRoad === null ? null : (
            <Box key="goal-road" flexDirection="column" borderStyle="round" borderColor="subtle" backgroundColor={look.isGraphic ? CARD_FILL : undefined} paddingX={look.isGraphic ? 'md' : 1} paddingY={look.isGraphic ? 'sm' : 0} gap={look.isGraphic ? 'sm' : 1}>
              {roadDrawing(elements, look, 'goal-road-cells', goalRoad.steps)}
              {roadNames(elements, look, 'goal-road', goalRoad.steps, { onlyNow: look.isNarrow })}
              {nextLine('goal-next', COPY.whatNext, goalNext)}
            </Box>
          )}
          {plans.filter(plan => plan.isProposed).map(plan => planCard(plan, true))}
          {twoColumns('goal-columns', storiesCard, specCard === null && reviseCard === null ? null : [specCard, reviseCard])}
          {specCard === null ? null : actOutcome(specKey, goalLink(base, refItem('goal', screen.goal), screen.goal), COPY.specInConsole)}
          {shownGoal.phase === 'ok' && repeating !== null && repeatingCard(repeating, settledVersions)}
          {questions.length > 0 && cardOf('goal-questions', headingOf(COPY.goalQuestionsHeading, questions.length, 'text'), null, questions.map(item =>
            rowOf({ key: `goal-question-${item.id}`, kind: COPY.kindQuestion, kindTone: markOf(kindTone('question')), title: firstLine(item.text), onPress: () => go({ screen: 'question', question: item.id }) })), 'wait')}
          {/* WHAT BECAME OF AN ACT ON A PLAN THAT NO LONGER WAITS: its card has gone, its ✓ stays. */}
          {plans.filter(plan => !plan.isProposed).map(plan => actOutcome(`plan-${plan.id}`, plan.console, COPY.planInConsole))}
          {plans.filter(plan => !plan.isProposed && !settledVersions.includes(plan)).map(plan =>
            rowOf({ key: `goal-plan-${plan.id}`, kind: COPY.kindPlan, title: COPY.plan(plan.ref ?? String(plan.id)), detail: plan.stateText, detailTone: 'subtle', onPress: () => go({ screen: 'plan', plan: plan.id }) }))}
          {folds('goal-folds', [
            decisions.length === 0 ? null : foldButton('fold-decisions', `${COPY.yourDecisions} ${decisions.length}`, isDecisionsOpen),
            shownGoal.phase === 'ok' && shownGoal.isOpen ? foldButton('fold-add-task', COPY.addTask, isAddOpen) : null,
          ])}
          {isDecisionsOpen && decisions.length > 0 && (
            <Box key="spec-decisions" flexDirection="column">
              {decisions.map((line, index) => <Text key={`spec-decision-${index}`} color="inactive">{line}</Text>)}
            </Box>
          )}
          {/* A TASK UNDER THIS GOAL: a line here, the whole form on the next screen, this goal picked. */}
          {shownGoal.phase === 'ok' && shownGoal.isOpen && isAddOpen && isStale && quiet(elements, COPY.addAfterReconnect)}
          {shownGoal.phase === 'ok' && shownGoal.isOpen && isAddOpen && !isStale && hasInput && 'Input' in elements && (
            <Box key="quick" flexDirection="column">
              <Box flexDirection="row" gap={1}>
                <Box flexGrow={1}>
                  <elements.Input key="quick-add" label={COPY.quickLabel} placeholder={COPY.quickPlaceholder} value={await read($, quick)} onInput={value => update($, quick, (): string => value)} onSubmit={async value => { await update($, quick, (): string => ''); await openAdd($, value, screen.goal) }} />
                </Box>
                <Button key="quick-open" label={COPY.quickAdd} variant="primary" onPress={async () => { const value = await read($, quick); await update($, quick, (): string => ''); await openAdd($, value, screen.goal) }} />
              </Box>
              <Text color="subtle" size="footnote">{COPY.quickNote}</Text>
            </Box>
          )}
          {/* THE GOAL'S ACT (S27): Drop goal… asks once more, saying what it withdraws and what keeps running. */}
          {shownGoal.phase === 'ok' && shownGoal.isOpen && goalAct.open !== 'goal_drop' && (
            <Box key="goal-actions" flexDirection="row" gap={1}>{actButton(goalKey, 'goal_drop', screen.goal, { isDanger: true, opens: true })}</Box>
          )}
          {shownGoal.phase === 'ok' && goalAct.open === 'goal_drop' && cardOf(`act-${goalKey}-confirm`, <Text>{COPY.dropGoalWarning(plans.filter(plan => plan.isProposed || plan.state === 'rethink').map(plan => plan.ref ?? String(plan.id)), (shownGoal.openStories ?? []).map(item => ({ ...item, label: item.label ?? labelOf('story', item.id) })))}</Text>, null, [
            actField(goalKey, 'goal_drop', screen.goal, { label: '', isDanger: true, hasText: false }),
          ], 'wait')}
          {actBusyNote(goalKey)}
          {actOutcome(goalKey, goalLink(base, refItem('goal', screen.goal), screen.goal), COPY.goalInConsole)}
        </Box>
      )
    }

    // A NEW GOAL: its head, a card of its title, its ask, its priority and target, a card of its specification, and
    // Cancel and Add goal at its foot, by goal_add. A FIELD'S LABEL STANDS ABOVE IT on a graphic surface, the field as
    // wide as its card; the terminal, a lesser form in the same order, draws the label before the field.
    if (screen.screen === 'new-goal') {
      const newPicker = await readPicker($)
      const labelAbove = (label: string) => (look.isGraphic ? <Text weight="semibold">{label}</Text> : null)
      const labelBefore = (label: string) => (look.isGraphic ? {} : { label })
      const isSideBySide = look.isGraphic && !look.isNarrow
      const goalPickers = [
        'Select' in elements ? (
          <Box key="goal-picker-0" flexDirection="column" flexGrow={isSideBySide ? 1 : undefined} flexShrink={1} minWidth={0}>
            {labelAbove(COPY.priority)}
            <elements.Select key="goal-priority" {...labelBefore(COPY.priority)} value={goalsState.priority} options={COPY.priorities} onSelect={value => update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, priority: value }))} />
          </Box>
        ) : null,
        'Select' in elements ? (
          <Box key="goal-picker-1" flexDirection="column" flexGrow={isSideBySide ? 1 : undefined} flexShrink={1} minWidth={0}>
            {labelAbove(COPY.target)}
            <elements.Select key="goal-target" {...labelBefore(COPY.target)} value={goalsState.target} options={goalsState.targets.length === 0 ? [{ value: OWN_LIST, label: COPY.ownList }] : goalsState.targets} onSelect={value => update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, target: value }))} />
          </Box>
        ) : null,
      ].filter(item => item !== null)

      return (
        <Box flexDirection="column" gap={1}>
          {backButton}
          {hasInput && (
            // THE HEAD: the screen's name, and the one line on what a goal is and what a task is.
            <Box key="goal-new-head" flexDirection="column">
              <Text size="title" weight="semibold">{COPY.newGoal}</Text>
              <Text color="subtle">{COPY.addGoalNote}</Text>
            </Box>
          )}
          {hasInput && cardOf('goal-new', null, null, [
            // A SHORT TITLE, AND THE ASK IN THE OWNER'S OWN WORDS, as long as it needs: in rows where Desktop has proven a
            // multi-line field (input-rows). Each with its helper line under it.
            <Box key="goal-new-fields" flexDirection="column" gap={look.isGraphic ? 'sm' : 0}>
              <Box key="goal-title-field" flexDirection="column">
                {labelAbove(COPY.goalTitleLabel)}
                <elements.Input key="goal-draft" {...labelBefore(COPY.goalTitleLabel)} value={goalsState.draft} onInput={value => update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, draft: value }))} onSubmit={() => addGoal($)} />
                <Text color="subtle" size="footnote">{COPY.goalTitleHelp}</Text>
              </Box>
              <Box key="goal-ask-field" flexDirection="column">
                {labelAbove(COPY.goalAskLabel)}
                <elements.Input key="goal-ask" {...labelBefore(COPY.goalAskLabel)} value={goalsState.ask} rows={look.proofs.inputRows ? 4 : undefined} onInput={value => update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, ask: value }))} onSubmit={value => update($, goals, (state: PaneGoals): PaneGoals => ({ ...state, ask: value }))} />
                <Text color="subtle" size="footnote">{COPY.goalAskHelp}</Text>
              </Box>
              {/* PRIORITY AND WHERE: two equal columns on the desktop, one under the other in the narrow dock and the terminal. */}
              <Box key="goal-pickers" flexDirection={isSideBySide ? 'row' : 'column'} gap={look.isGraphic ? 'sm' : 0}>
                {goalPickers}
              </Box>
            </Box>,
          ])}
          {/* ITS SPECIFICATION (Terylon S53), optional: A, the .md files of a folder attached here and read on Add goal;
              B, a request in this chat for Claude to add the goal with the files the owner names or Claude wrote. */}
          {hasInput && cardOf('spec-new-section', COPY.specSection, COPY.specLimits, [
            ...specPickerOf('spec-new', newPicker, []),
            <Box key="spec-new-foot" flexDirection={isSideBySide ? 'row' : 'column'} justifyContent="space-between" alignItems={isSideBySide ? 'center' : undefined} gap={1}>
              <Box flexShrink={1} minWidth={0}>
                <Text color="subtle" size="footnote">{COPY.specDataHelp}</Text>
              </Box>
              <Button key="spec-in-session" label={COPY.specInSession} plain onPress={() => specInSession($)} />
            </Box>,
          ])}
          {hasInput && (
            // THE FOOT: Cancel, back to the overview, and Add goal, the one to press, at the right.
            <Box key="goal-new-foot" flexDirection="row" justifyContent="flex-end" gap={1}>
              <Button key="goal-cancel" label={COPY.cancel} onPress={() => show($, QUEUE, true)} />
              <Button key="goal-add" label={COPY.addGoal} variant="primary" onPress={() => addGoal($)} />
            </Box>
          )}
          {hasInput && goalsState.adding === 'sending' ? quiet(elements, COPY.goalSending) : null}
          {hasInput && goalsState.adding === 'added' ? <Text color="success">{`✓ ${goalsState.addSentence ?? ''}`}</Text> : null}
          {hasInput && goalsState.adding === 'refused' ? <Text color="error">{goalsState.addSentence ?? ''}</Text> : null}
        </Box>
      )
    }

    // THE OVERVIEW: the machine in a line, three tiles, what waits for the owner, one card per goal, the folds, the footer.
    const isHistoryOpen = goalsState.showing === 'closed'
    const stuckCount = current.running.filter(item => item.isStuck).length
    const { cards: goalCards, elsewhere } = goalCardsOf({
      goals: goalsState.phase === 'ok' ? goalsState.open : [],
      plans: roadPlansOf(goalsState.phase === 'ok' ? goalsState.plans : [], current.waiting),
      stories: current.stories,
      running: current.running,
      questions: current.questions,
    })
    // A TILE: a stroke, a coloured number and the fill of a card; the waiting tile the gate's translucent purple, its word
    // `inactive` since `subtle` falls short on it. Amber is a stroke alone: a stuck count's number is ink.
    const tile = (name: string, count: number, label: string, stroke: 'merged' | 'subtle' | 'warning', numberTone: Tone, fill: string = CARD_FILL, labelTone: Tone = 'subtle') => (
      <Box key={`tile-${name}`} backgroundColor={look.isGraphic ? fill : undefined} flexGrow={1} flexShrink={1} minWidth={0} width={look.isGraphic ? 0 : '33%'} flexDirection="row" alignItems="center" borderStyle="round" borderColor={count > 0 ? stroke : 'subtle'} paddingX={look.isGraphic ? 'md' : 1} paddingY={look.isGraphic ? 'sm' : 0} gap={look.isGraphic ? 'sm' : 1}>
        <Text size="title" tabular color={colorOf(count > 0 ? numberTone : 'inactive')} weight="semibold">{String(count)}</Text>
        <Text color={labelTone} wrap="truncate-end">{label}</Text>
      </Box>
    )
    const tiles = look.isTilesLine
      ? (
          <Box key="tiles-line">
            <Text wrap="truncate-end">
              <Text color={current.waiting.length > 0 ? 'merged' : 'inactive'} weight="semibold" tabular>{COPY.tilesWaiting(current.waiting.length)}</Text>
              <Text color="subtle">{' · '}</Text>
              <Text color={current.running.length > 0 ? 'suggestion' : 'inactive'} tabular>{COPY.tilesRunning(current.running.length)}</Text>
              <Text color="subtle">{' · '}</Text>
              <Text color={stuckCount > 0 ? 'text' : 'inactive'} weight={stuckCount > 0 ? 'semibold' : undefined} tabular>{COPY.tilesStuck(stuckCount)}</Text>
            </Text>
          </Box>
        )
      : (
          <Box key="tiles" flexDirection="row" gap={look.isGraphic ? 'sm' : 1}>
            {tile('waiting', current.waiting.length, COPY.tileWaiting, 'merged', 'merged', WAITING_TILE_FILL, 'inactive')}
            {tile('running', current.running.length, COPY.tileRunning, 'subtle', 'suggestion')}
            {tile('stuck', stuckCount, COPY.tileStuck, 'warning', 'attention')}
          </Box>
        )
    const waitingKind = (kind: string) =>
      kind === 'question' ? COPY.kindQuestion : kind === 'merge' ? COPY.kindMerge : kind === 'accept' ? COPY.kindAccept : kind === 'plan' ? COPY.kindPlan : COPY.kindBlocked
    // THE KIND'S DOT (hooks/tones.ts): what waits on the owner's merge, acceptance or approval purple, a question amber.
    const waitingTone = (kind: string): Tone => markOf(kindTone(kind))
    // A WAITING ROW'S ACT, beside its press: each opens its subject's card, where the act is taken, so a plan is never
    // approved unread; the row keeps the act's word. MERGE IS ONLY EVER A LINK INTO THE CONSOLE.
    const waitingAct = (item: PaneSnapshot['waiting'][number]) => {
      switch (item.kind) {
        case 'question':
          return <Button key={`answer-${item.target}`} label={COPY.answer} onPress={() => go({ screen: 'question', question: item.target })} />
        case 'plan':
          return <Button key={`open-plan-${item.target}`} label={COPY.actButton.plan_approve} onPress={() => go({ screen: 'plan', plan: item.target })} />
        case 'accept':
          return <Button key={`open-story-${item.target}`} label={COPY.actButton.story_accept} onPress={() => go({ screen: 'story', story: item.target })} />
        case 'merge':
          return mergeLink(`merge-act-${item.target}`, item.console, COPY.mergeShort)
        default:
          return <Button key={`open-story-${item.target}`} label={COPY.rowOpen} onPress={() => go({ screen: 'story', story: item.target })} />
      }
    }
    // WHAT BECAME OF AN ACT STILL GOING WHEN ITS CARD WAS LEFT: it may have left the list, so its outcome stands under the card.
    const rowOutcomes = Object.keys(allActs)
      .filter(key => /^(plan|story)-\d+$/.test(key))
      .map(key => {
        const id = Number(key.slice(key.indexOf('-') + 1))

        return key.startsWith('plan-')
          ? actOutcome(key, planLink(base, refItem('plan', id), id), COPY.planInConsole)
          : actOutcome(key, storyLink(base, 'story', refItem('story', id), id), COPY.storyInConsole)
      })
    // ONE GOAL'S CARD: its ref, its title, its stage; its road; how far it is with a press for each running story; what next.
    const goalCard = (item: PaneGoalCard) => {
      const stageTone = item.road?.tone ?? 'subtle'
      const stageWord = item.road?.word ?? COPY.repeating
      const stageChip = look.isGraphic
        ? <Text size="caption" color={CHIP_WORD} backgroundColor={CHIP_BACKGROUND}>{'\u00a0'}<Text color={stageTone}>{CHIP_DOT}</Text>{`\u00a0${stageWord}\u00a0`}</Text>
        : <Text color={stageTone} weight="semibold">{stageWord}</Text>

      return (
        <Box key={`goal-card-${item.goal.id}`} flexDirection="column" borderStyle="round" borderColor={item.stuck > 0 ? 'warning' : 'subtle'} backgroundColor={look.isGraphic ? CARD_FILL : undefined} paddingX={look.isGraphic ? 'md' : 1} paddingY={look.isGraphic ? 'sm' : 0} gap={look.isGraphic ? 'sm' : 1}>
          <Box key={`goal-card-title-${item.goal.id}`} flexDirection="row" alignItems="center" justifyContent="space-between" gap={1}>
            <Box flexDirection="row" alignItems="center" gap={1} flexShrink={1} minWidth={0} overflow="hidden">
              {item.goal.ref === undefined || item.goal.ref === null ? null : <Box flexShrink={0}><Text mono size="footnote" color="subtle">{item.goal.ref}</Text></Box>}
              <Button key={`goal-${item.goal.id}`} plain onPress={() => go({ screen: 'goal', goal: item.goal.id })}>
                <Text weight="semibold" wrap="truncate-end">{item.goal.title}</Text>
              </Button>
            </Box>
            <Box flexShrink={0}>{stageChip}</Box>
          </Box>
          {item.road === null ? null : roadDrawing(elements, look, `goal-card-road-${item.goal.id}`, item.road.steps, { height: ROAD_CARD_HEIGHT })}
          <Box key={`goal-card-detail-${item.goal.id}`} flexDirection={look.isNarrow ? 'column' : 'row'} justifyContent="space-between" gap={1}>
            <Box flexDirection="row" flexWrap="wrap" flexShrink={1} minWidth={0} gap={1} alignItems="center">
              <Text color="subtle" size="footnote" tabular>{item.summary}</Text>
              {item.running.map(run => (
                // A RUNNING STORY IS ONE PRESS AWAY, by its ref and its state.
                <Button key={`story-${run.story}`} plain onPress={() => go({ screen: 'story', story: run.story })}>
                  <Text mono size="footnote" color="suggestion">{run.ref}</Text>
                  {' '}
                  <Text size="footnote" tabular color="inactive">{run.now}</Text>
                </Button>
              ))}
              {item.stuck > 0 && (
                <Text size="footnote">
                  <Text color="warning">⚠</Text>
                  {' '}
                  <Text weight="semibold">{COPY.stuckFlag(item.stuck)}</Text>
                </Text>
              )}
              {item.spend === null ? null : <Text color="subtle" size="footnote" tabular>{item.spend}</Text>}
            </Box>
            <Box flexShrink={0}>
              <Text>{item.next}</Text>
            </Box>
          </Box>
        </Box>
      )
    }
    // HISTORY NEVER SITS ON LOADING: the line stands only while a read runs, under its bound; a count of 0 is empty with
    // nothing called, and a read nothing runs, one a reload of the module lost, is a press away.
    const closedLines = goalsState.closedPhase === 'error'
      ? [reason(goalsState.closedSentence), <Button key="goals-closed-retry" label={COPY.retry} onPress={() => showGoals($, 'closed')} />]
      : goalsState.closedPhase === 'changed'
        ? [quiet(elements, COPY.closedChanged), <Button key="goals-closed-retry" label={COPY.closedReadAgain} onPress={() => showGoals($, 'closed')} />]
        : goalsState.closedCount === 0 && goalsState.closed.length === 0
          ? [quiet(elements, COPY.historyEmpty)]
          : goalsState.closedPhase === 'loading' && closedGoalsRead !== null
            ? [quiet(elements, COPY.closedLoading)]
            : goalsState.closedPhase !== 'ok'
              ? [<Button key="goals-closed-retry" label={COPY.closedRead} onPress={() => showGoals($, 'closed')} />]
              : goalsState.closed.length === 0 ? [quiet(elements, COPY.historyEmpty)] : null
    const isDoneOpen = shown.includes('fold-done')
    const isQueuedOpen = shown.includes('fold-queued')
    // OPEN UNTIL IT IS SHUT: nothing running is ever hidden, so a story no goal could be found for stands in the open.
    const isElsewhereOpen = !shown.includes('fold-running')

    const overviewDrawing = (
      <Box flexDirection="column" gap={1}>
        {overviewHead}
        {tiles}
        {problemCard}
        {current.paused !== null && cardOf('paused', <Text size="heading" weight="semibold" color="text">{current.paused}</Text>, null, [
          <Box flexDirection="row" gap={1}>{actButton('leader', 'leader_resume', null, { isPrimary: true })}</Box>,
        ], 'wait')}
        {actBusyNote('leader')}
        {actOutcome('leader', consoleLink(base, 'work'), COPY.workInConsole)}
        {cardOf('waiting', heading(elements, `${COPY.waiting}${stale}`), null, [
          current.waiting.length === 0 ? quiet(elements, COPY.nothingWaiting) : null,
          ...current.waiting.map(item =>
            rowOf({
              key: item.key,
              kind: waitingKind(item.kind),
              kindTone: waitingTone(item.kind),
              ref: item.ref,
              title: item.kind === 'merge' || item.kind === 'accept' ? `${item.title} · ${item.detail}` : item.title,
              // A QUESTION CAN BE ANSWERED IN THE CONSOLE TOO; every other act is the row's own.
              reveal: item.kind === 'question' ? { href: item.console, label: COPY.answerInConsole } : null,
              act: waitingAct(item),
              // A QUESTION IS ONE LINE AND ITS Answer: its text is read where it is answered.
              onPress: () => (item.kind === 'question' ? go({ screen: 'question', question: item.target }) : toggle($, item.key)),
              body: item.kind !== 'question' && shown.includes(item.key) ? (
                <Box flexDirection="column" paddingLeft={look.isGraphic ? 0 : KIND_WIDTH + 1}>
                  <Text color="inactive">{item.detail}</Text>
                  <Box flexDirection="row" gap={1} flexWrap="wrap">
                    {item.kind === 'merge' && <Button key={`open-story-${item.target}`} label={COPY.openStory} onPress={() => go({ screen: 'story', story: item.target })} />}
                    {item.kind === 'merge' && mergeLink(`merge-long-${item.target}`, item.console, COPY.mergeInConsole)}
                  </Box>
                </Box>
              ) : null,
            })),
        ], 'gate')}
        {rowOutcomes}
        <Box key="goals" flexDirection="column" gap={look.isGraphic ? 'sm' : 1}>
          <Box key="goals-head" flexDirection="row" justifyContent="space-between" alignItems="center" gap={1}>
            <Text size="heading" weight="semibold">{COPY.goalsHeading}</Text>
            {hasInput && <Button key="goal-new-open" label={COPY.newGoal} onPress={() => go({ screen: 'new-goal' })} />}
          </Box>
          {goalsState.phase === 'loading' && quiet(elements, COPY.loading)}
          {goalsState.phase === 'error' && cardOf('goals-error', warned(COPY.loadError(COPY.goalsHeading)), null, [reason(goalsState.sentence)], 'bad')}
          {goalsState.phase === 'ok' && goalCards.length === 0 && quiet(elements, COPY.noOpenGoals)}
          {goalCards.map(goalCard)}
          {goalsState.sentence !== null && goalsState.phase === 'ok' && reason(goalsState.sentence)}
          {folds('overview-folds', [
            elsewhere.length === 0 ? null : foldButton('fold-running', `${COPY.foldRunning} ${elsewhere.length}`, isElsewhereOpen),
            foldButton('fold-done', `${COPY.doneToday} ${current.doneToday.length}`, isDoneOpen),
            foldButton('fold-queued', `${COPY.queued} ${current.queued.length}`, isQueuedOpen),
            foldButton('goals-show-closed', `${COPY.goalsHistory} ${goalsState.closedCount}`, isHistoryOpen, () => showGoals($, isHistoryOpen ? 'open' : 'closed')),
          ])}
          {/* EACH OPEN FOLD ITS OWN CARD, stacked in the folds' order. */}
          {isElsewhereOpen && elsewhere.length > 0 && foldCard('fold-running-card', COPY.foldRunning, elsewhere.length, elsewhere.map(item =>
            rowOf({
              key: `story-${item.story}`,
              kind: null,
              title: item.title,
              detail: look.isNarrow ? null : item.detail,
              detailTone: item.isStuck ? 'error' : 'inactive',
              onPress: () => go({ screen: 'story', story: item.story }),
              // ITS PHASES FROM progress.stage: a road on the desktop, coloured cells on the terminal.
              body: (
                <Box flexDirection="column" paddingLeft={look.isGraphic ? 0 : 1}>
                  {roadDrawing(elements, look, `story-${item.story}-road`, phaseSteps(item.phases, shortLabels(item.phases)), { isStuck: item.isStuck })}
                  {(item.stageLine ?? item.step) !== null && <Text color="inactive" size="footnote" wrap="truncate-end">{item.stageLine ?? item.step}</Text>}
                </Box>
              ),
            })))}
          {isDoneOpen && foldCard('fold-done-card', COPY.doneToday, current.doneToday.length, current.doneToday.length === 0 ? [quiet(elements, COPY.nothingDone)] : current.doneToday.map(item =>
            rowOf({
              key: `done-${item.story}`,
              kind: item.isAccepted === true ? COPY.kindAccepted : COPY.kindMerged,
              // DONE IS GREEN: merged or accepted, the gate's purple is for what still waits.
              kindTone: markOf(kindTone('merged')),
              title: item.title,
              detail: item.detail,
              onPress: () => go({ screen: 'story', story: item.story }),
            })))}
          {isQueuedOpen && foldCard('fold-queued-card', COPY.queued, current.queued.length, current.queued.length === 0 ? [quiet(elements, COPY.nothingQueued)] : current.queued.map(item =>
            rowOf({
              key: `queued-${item.story}`,
              kind: item.isHeld ? COPY.kindHeld : COPY.kindQueued,
              title: item.title,
              detail: item.detail,
              detailTone: item.isHeld ? 'attention' : 'subtle',
              onPress: () => go({ screen: 'story', story: item.story }),
            })))}
          {isHistoryOpen && foldCard('goals-closed-card', COPY.goalsHistory, goalsState.closedCount, closedLines ?? goalsState.closed.map(item =>
            rowOf({
              key: `goal-${item.id}`,
              // THE PRIORITY AS A CHIP: P1 in warning, the others inactive.
              kind: item.priority,
              kindTone: item.priority === 'P1' ? 'warning' : 'inactive',
              kindColumn: 3,
              title: item.title,
              titleTone: 'subtle',
              isTitleDim: true,
              // DELETE… ENDS EACH HISTORY ROW: the console's Goals, where the owner deletes it; no tool of the pane deletes.
              trail: { href: deleteLink(base, item.id, item.ref ?? null), label: COPY.deleteInConsole },
              detail: item.questions > 0 ? COPY.goalQuestions(item.questions) : item.stories,
              detailTone: item.questions > 0 ? 'attention' : 'subtle',
              onPress: () => go({ screen: 'goal', goal: item.id }),
            })))}
        </Box>
        {!isStale && !hasInput && (
          <Box key="phone-add-box" flexDirection="column">
            <Button key="phone-add" label={COPY.addOnPhone} onPress={() => postPrompt($, COPY.addOnPhonePrompt)} />
            <Text color="subtle" size="footnote">{COPY.addOnPhoneNote}</Text>
          </Box>
        )}
        {drawingAsked.isLogShown && cardOf('pane-log', COPY.paneLogTitle, COPY.paneLogHint, [
          notes.length === 0 ? quiet(elements, COPY.paneLogEmpty) : null,
          ...notes.map(line => <Text color="subtle" size="footnote" mono>{line}</Text>),
        ])}
        {overviewFoot}
      </Box>
    )

    return overviewDrawing
    })()

    // TEST MODE IS SAID ON EVERY SCREEN: its head names it on the overview, this line elsewhere, and the sentence of what
    // a press did not do on any.
    const testing = await read($, testMode)
    const screenNow = stackOf(await read($, view)).at(-1) ?? QUEUE
    const testLine = !testing.isOn ? null : testing.note ?? (screenNow.screen === 'queue' ? null : COPY.testBand)

    if (testLine === null) {
      return drawn as never
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" gap={1}>
        <Text key="test-line" color="merged" weight="semibold">{testLine}</Text>
        {drawn}
      </Box>
    )
  })
}
