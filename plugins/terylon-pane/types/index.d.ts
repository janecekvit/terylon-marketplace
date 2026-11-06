// The terylon-pane mod's state contract: what the band and the pane draw from, held by the host for the session.
// Everything here is a copy of what Terylon's /mcp answered, shaped for drawing; nothing is decided here.

export type PaneConnection = 'connecting' | 'ok' | 'unreachable' | 'refused' | 'no-server' | 'not-allowed' | 'error'

export type PaneWaitingItem = {
  // A verified story waits for a merge over a repository, or for an acceptance in Terylon's own list (#39).
  kind: 'merge' | 'accept' | 'plan' | 'question' | 'blocked'
  key: string
  // The subject the row opens in the pane: a story, a plan or a question.
  target: number
  // Its ref, drawn monospaced before its title; null where the question names no subject by a ref.
  ref: string | null
  title: string
  detail: string
  console: string
  // The goal a waiting plan or story is under, for its road: null where Terylon names none.
  goal: number | null
  // A waiting plan's stories, for its goal's card.
  stories?: number
}

export type PaneRunningItem = {
  story: number
  // Its ref, and the goal it is under where its answer names one: a goal card draws the ref as its press.
  ref: string
  goal: number | null
  goalRef: string | null
  // "running 12 h", "verifying", "stuck since 14:20": what the goal card says beside the ref.
  now: string
  title: string
  detail: string
  step: string | null
  fraction: number | null
  isStuck: boolean
  isVerifying: boolean
  // The phases from progress.stage, as the story's own screen draws them (S32): none is now without a stage.
  phases: PanePhase[]
  // "Tests · tester · step 5 of 9": the stage, who works in it and the step, or null with no stage reported.
  stageLine: string | null
}

export type PaneQueuedItem = { story: number; title: string; detail: string; isHeld: boolean }

// An ended story of today: merged over a repository, or accepted in Terylon's own list.
export type PaneDoneItem = { story: number; title: string; detail: string; isAccepted: boolean }

// WHY THE DONE-SIGNAL CANNOT RUN: events_since did not answer as the owner's, or the store that keeps the pane's place
// refused. The kind names the fix Health draws; the reason is the engine's or Terylon's own words.
export type PaneEventsProblem = {
  kind: 'not-allowed' | 'no-server' | 'unreachable' | 'refused' | 'store' | 'failed'
  reason: string
  since: number
}

export type PaneQuestionItem = {
  id: number
  about: string
  subject: string
  // "cíl 11", "story 38": what the question waits on, as the pane names it.
  subjectLabel: string
  // Its subject's ref, where Terylon names one.
  subjectRef?: string | null
  text: string
  askedAt: string | null
}

export type PaneChoice = { value: string; label: string }

// One story as a goal's road reads it: its state, where it is kept, whether it is stuck and what it spent.
export type PaneRoadStory = {
  id: number
  ref: string
  title: string
  goal: number | null
  goalRef: string | null
  state: string
  isList: boolean
  isStuck: boolean
  usd: number
  tokens: number | null
  isCostKnown: boolean
}

// A plan as a goal's road reads it.
export type PaneRoadPlan = { id: number; ref: string; goal: number; isProposed: boolean; stories: number; storyIds: readonly number[] }

export type PaneRoadStage = 'plan' | 'approve' | 'build' | 'verify' | 'merge' | 'done'

// A step of a road, a goal's or a story's: its name, how far it is, and whether it is one of the owner's gates.
export type PaneRoadStep = { name: string; status: 'done' | 'now' | 'next'; isGate: boolean }

export type PaneRoad = {
  stage: PaneRoadStage
  // "Approve", "Your merge", "Your accept": the stage in words, its chip's and the road's.
  word: string
  tone: 'merged' | 'success' | 'suggestion'
  steps: PaneRoadStep[]
  next: string
}

// One goal's card on the overview, derived from what the pane read (hooks/road.ts). A repeating task's goal has no road.
export type PaneGoalCard = {
  goal: PaneGoalItem
  road: PaneRoad | null
  summary: string
  spend: string | null
  next: string
  running: PaneRunningItem[]
  stuck: number
}

export type PaneSnapshot = {
  connection: PaneConnection
  problem: string | null
  fetchedAt: number | null
  failingSince: number | null
  header: string
  runningUsd: string
  dayBudget: string | null
  slots: number
  slotsUsed: number
  paused: string | null
  pausedSince: string | null
  notices: number
  alerts: number
  alertNotices: PaneNotice[]
  server: string | null
  waiting: PaneWaitingItem[]
  running: PaneRunningItem[]
  queued: PaneQueuedItem[]
  doneToday: PaneDoneItem[]
  // Every story of the last read, as a goal's road reads it.
  stories: PaneRoadStory[]
  questions: PaneQuestionItem[]
  events: PaneEventsProblem | null
  // THE WATCHDOG'S CLOCK: when events_since last answered, and when this session began to wait for it.
  eventsAnsweredAt: number | null
  eventsWatchedSince: number | null
  // Since when events_since has not answered, once the watchdog's bound has passed: null while all is well.
  eventsSilentSince: number | null
  // WHO POSTS THE DONE-SIGNAL on this machine: this session, another that holds the lease since when, or none.
  signaller: 'this' | 'another' | 'none'
  signallerSince: number | null
  // The holder's id, shortened, and where this session's own id came from: the engine's session.id, or made here.
  signallerHolder: string | null
  sessionIdSource: 'session.id' | 'fallback'
  // TODAY'S COST, KNOWN OR NOT (Terylon S68): on the setup token, or where a story says its cost is not known, only the
  // tokens are said, never a $ figure. The basis is the briefing's costBasis, 'api' or 'setup-token'.
  costKnown?: boolean
  runningTokens?: number | null
  costBasis?: string | null
  // Since when no session has posted the done-signal, once that outlasts a lease: null while one does.
  signallerMissingSince: number | null
}

export type PaneScreen =
  | { screen: 'queue' }
  // HEALTH AND MEMORY ON ONE PAGE: `section` is the one its button scrolls to.
  | { screen: 'more'; section: 'memory' | 'health' }
  // NOTICES: a slide-over on the overview where the surface has room, else a screen of its own.
  | { screen: 'notices' }
  | { screen: 'new-goal' }
  | { screen: 'add' }
  | { screen: 'story'; story: number }
  | { screen: 'question'; question: number }
  | { screen: 'plan'; plan: number }
  | { screen: 'goal'; goal: number }
  // ONE VERSION OF A GOAL'S SPECIFICATION, read-only (Terylon S53): the latest when `version` is null, one file of it
  // when `file` names one.
  | { screen: 'spec'; goal: number; version: number | null; file: string | null }

// Where the pane is, and the way back: the last entry is drawn, ‹ pops it; the overview is always at its root.
export type PaneView = { stack: PaneScreen[] }

export type PanePhase = { label: string; role: string | null; detail: string; status: 'done' | 'now' | 'next' }

export type PaneWorking = {
  agent: string
  stage: string
  step: string
  fraction: number | null
  spend: string
  // The run's numbers drawn large on the desktop (S32): the spend, the tokens, the time since start.
  numbers: { value: string; label: string }[]
  // Null where the cost is not known: no spend bar is drawn against a dollar budget then.
  spentUsd: number | null
  budgetUsd: number | null
}

export type PaneCheck = { name: string; isPass: boolean; detail: string }

export type PaneEvent = { time: string; actor: string; summary: string }

export type PaneStory = {
  story: number
  // 'deleted': story_get said the story was deleted with its goal; its sentence is drawn quietly, never as a failure.
  phase: 'loading' | 'ok' | 'error' | 'deleted'
  sentence: string | null
  title: string
  meta: string
  // The meta's parts, drawn apart on the desktop (S32): the time tabular, the branch monospaced.
  // "running 12 h 0 min", or "blocked for 2 h 5 min": the time a story's header names, by its state.
  running: string | null
  attempt: number
  branch: string | null
  model: string | null
  state: string
  stateText: string
  stateTone: 'success' | 'warning' | 'suggestion' | 'subtle' | 'merged'
  // Terylon's short ids (Terylon S66): its ref and its goal's, null from a Terylon older than refs.
  ref?: string | null
  goalRef?: string | null
  // Its work item, only ever the link "ADO #n ↗".
  workItem?: { label: string; url: string } | null
  step: string | null
  fraction: number | null
  cost: string
  working: PaneWorking | null
  phases: PanePhase[]
  question: { id: number; text: string } | null
  environment: { name: string; url: string | null } | null
  verdict: { commit: string; at: string | null; checks: PaneCheck[]; isGreen: boolean } | null
  overrun: string[]
  criteria: string[]
  timeline: PaneEvent[]
  pullRequest: { label: string; url: string } | null
  goal: number | null
  isRunning: boolean
  isVerified: boolean
  // What the owner's acts are drawn by (S27): blocked, verified in Terylon's own list (Accept, no merge), and a run
  // to stop, which only a dispatched or running story has.
  isBlocked: boolean
  isList: boolean
  canStop: boolean
  // An approved story that has not started can be abandoned (#35); whether Terylon reported a stage for it.
  canAbandon: boolean
  hasStage: boolean
  // Why an approved story has not started, as story_get says it (`blockedReason`): held after another (#35).
  heldReason: string | null
  // The commit a merge would take: the verdict's, else the pull request's head.
  commit: string | null
}

export type PaneAddPhase = 'form' | 'sending' | 'added' | 'refused' | 'timeout' | 'paused'

export type PaneAdd = {
  phase: PaneAddPhase
  title: string
  criteria: string
  goal: string
  after: string
  size: string
  // The files a task over a repository declares, one path per line (#39).
  files: string
  goals: PaneChoice[]
  // The goals, by their value in `goals`, whose target is a repository: their tasks declare 1 to 30 files.
  repositoryGoals: string[]
  stories: PaneChoice[]
  sentence: string | null
  link: string | null
  // Why the pane did not send the task: what the Files field breaks, said under it.
  problem: string | null
  // What tasks_add was sent, word for word, said under ✓ Handed over (#35).
  sent: { title: string; criteria: string[]; files: string[] } | null
}

export type PaneAnswer = {
  question: number
  text: string
  choice: string | null
  phase: 'form' | 'sending' | 'answered' | 'refused'
  sentence: string | null
}

// `counts`: its stories by state, as goals_list says them. `target`: where it is kept. `repeating`: a repeating task's
// goal, its newest run in words; absent in a value an older version stored.
export type PaneGoalItem = { id: number; ref?: string | null; title: string; priority: string; state: string; questions: number; stories: string; counts?: Record<string, number>; target?: string | null; repeating?: PaneGoalRepeating | null }

export type PaneGoalRepeating = { run: string; terms: string }

// `after`: the places in the plan, 1-based, of the stories this one waits for (#35).
export type PanePlanStory = { id: number; ref?: string | null; index: number; title: string; detail: string; criteria: string[]; after: number[]; size: string; estimate: string | null }

export type PanePlan = {
  id: number
  goal: number
  goalTitle: string
  ref?: string | null
  goalRef?: string | null
  state: string
  stateText: string
  isProposed: boolean
  comment: string | null
  stories: PanePlanStory[]
  console: string
  // A REPEATING TASK'S VERSION PLAN (Terylon S43) has no stories: approving it approves the version each later run uses.
  // Its version, the task's title and its terms (budget, auto-accept) where Terylon sends them, else null. Absent in a
  // value an older version stored.
  taskVersion?: PaneTaskVersion | null
}

export type PaneGoals = {
  phase: 'loading' | 'ok' | 'error'
  sentence: string | null
  open: PaneGoalItem[]
  closed: PaneGoalItem[]
  plans: PanePlan[]
  // The new goal's title, short, and its ask, the request in the owner's own words, as goal_add takes them.
  draft: string
  ask: string
  // The new goal's priority (1–4) and target, as goal_add takes them (S32).
  priority: string
  target: string
  targets: PaneChoice[]
  adding: 'idle' | 'sending' | 'added' | 'refused'
  addSentence: string | null
  // OPEN AND HISTORY, TWO BUTTONS: which list the tab shows, Open by default, and the closed goals' count. History is
  // the closed goals; `closed` keeps its name so a value an older version stored still reads.
  showing: 'open' | 'closed'
  closedCount: number
  // Where the closed goals come from: the full list before Terylon S44, goals_list {closed: true} after it. The second
  // is read on a press of Closed alone and kept until the next press, or until closedCount changes ('changed').
  closedFrom: 'list' | 'terylon'
  closedPhase: 'idle' | 'loading' | 'ok' | 'error' | 'changed'
  closedSentence: string | null
}

export type PaneGoal = {
  goal: number
  // 'deleted': goal_get said the goal was deleted for good; its sentence is drawn quietly, never as a failure.
  phase: 'loading' | 'ok' | 'error' | 'deleted'
  sentence: string | null
  title: string
  // Its ref (Terylon S66), null from a Terylon older than refs.
  ref?: string | null
  meta: string
  // The goal's ask in the owner's words, and its state as Terylon says it; absent in a value an older version stored.
  ask?: string | null
  state?: string
  target?: string | null
  stories: { id: number; title: string; state: string; stateKey?: string; isList?: boolean }[]
  // An open or active goal can be dropped (S27); a done or dropped one cannot. A drop abandons every story of it that
  // has not ended, stopping a run first (Terylon S35, #388), and the drop says which, by title (#35).
  isOpen: boolean
  openStories: { id: number; label?: string; title: string; isRunning: boolean }[]
  // A REPEATING TASK'S GOAL (Terylon S43): its card replaces the stories card. Absent in a value an older version stored.
  repeating?: PaneRepeating | null
  // ITS SPECIFICATION (Terylon S53), from goal_get: null where it has none. Absent in a value an older version stored.
  specification?: PaneSpecification | null
}

// A goal's specification as goal_get answers it, shaped for its card: the latest version, its files with their sizes,
// the older versions, the re-plan the leader offers, and the owner's decisions on earlier plans, one line each.
export type PaneSpecification = {
  version: number
  revised: string
  files: { name: string; size: string }[]
  older: number[]
  replan: { from: number; to: number } | null
  decisions: string[]
}

// A .md file the owner can attach, as $.fs.list answered it: its name, the path it is read from, its size in bytes.
export type PaneSpecFile = { name: string; path: string; bytes: number }

// The folder list a specification is picked from: the folder typed, the one listed, its .md files, and those attached.
export type PaneSpecPicker = {
  folder: string
  listedFolder: string
  phase: 'idle' | 'loading' | 'ok' | 'error'
  sentence: string | null
  listed: PaneSpecFile[]
  attached: PaneSpecFile[]
}

// REVISING A GOAL'S SPECIFICATION: the version it is based on, its files kept whole, and the files added from a folder.
// `problem` is the pane's own sentence or Terylon's refusal; `sentence` Terylon's answer once the version is saved.
export type PaneRevise = {
  goal: number
  basedOn: number
  phase: 'loading' | 'failed' | 'editing' | 'saving' | 'saved'
  kept: { name: string; text: string }[]
  picker: PaneSpecPicker
  problem: string | null
  sentence: string | null
}

// ONE VERSION OF A SPECIFICATION, read with spec_get to be drawn read-only.
export type PaneSpecView = {
  goal: number
  version: number | null
  file: string | null
  phase: 'loading' | 'ok' | 'error'
  sentence: string | null
  shown: number | null
  revised: string
  files: { name: string; text: string }[]
}

// One run of a repeating task, newest first: its day in the host's time zone, its state in words and that state's tone,
// and its files with its cost. `story` is null when Terylon names none, and the run then opens nothing.
export type PaneRepeatingRun = { story: number | null; day: string; state: string; tone: 'success' | 'attention' | 'subtle' | 'merged'; line: string }

export type PaneRepeating = { title: string; summary: string; runs: PaneRepeatingRun[]; console: string }

export type PaneTaskVersion = { version: string | null; title: string | null; terms: string | null }

export type PaneNotice = { id: number; source: string; title: string; body: string; when: string; link: string | null }

export type PaneBell = {
  phase: 'loading' | 'ok' | 'error'
  sentence: string | null
  unhandledCount: number
  unhandled: PaneNotice[]
  handled: PaneNotice[]
  metrics: { value: string; label: string }[]
  handling: number | null
  handleSentence: string | null
}

// What the overview's footer says: the last 30 days in a line, and how many memory proposals wait. Null before an answer.
export type PaneOverview = { month: string | null; memoryPending: number | null }

// TEST MODE, this session's alone: whether it is on, and what the last made-up merge said.
export type PaneTestMode = { isOn: boolean; note: string | null }

export type PaneBand = { text: string; link: string; isAlert: boolean } | null

export type PaneMemoryFile = { file: string; heading: string; entries: string[]; text: string | null }

export type PaneMemoryRule = { rule: string; enforcedBy: string; artefact: string }

export type PaneMemoryEdit = {
  action: 'add' | 'replace' | 'remove'
  file: string
  oldText: string | null
  text: string
  why: string
}

// A memory proposal waiting for the owner (S27): what it changes, why, and who proposed it, the owner or the leader.
export type PaneProposalOperation = { action: string; file: string; text: string | null; oldText: string | null }

export type PaneProposal = { id: number; file: string; action: string; oldText: string | null; text: string | null; operations: PaneProposalOperation[]; why: string | null; by: 'owner' | 'leader'; story: number | null; storyRef?: string | null; at: string | null }

export type PaneMemory = {
  phase: 'loading' | 'ok' | 'error' | 'editing' | 'sending' | 'proposed' | 'refused'
  files: PaneMemoryFile[]
  rules: PaneMemoryRule[]
  pending: number
  proposals: PaneProposal[]
  edit: PaneMemoryEdit | null
  sentence: string | null
  proposed: string[]
}

// WHAT BECAME OF AN ACT (S27): Terylon took it, has not answered within its bound, refused it in its own words, or
// Claude Code did not let the call through.
export type PaneActOutcome = { kind: 'done' | 'pending' | 'refused' | 'not-allowed'; tool: string; sentence: string | null; status: number | null }

// One subject's acts: the field open under its card (the act it sends), what is typed there, the act Terylon is
// answering, and the last outcome. Keyed by subject: "plan-41", "story-327", "leader", "goal-3", "proposal-5", "policy".
export type PaneAct = { open: string | null; text: string; busy: string | null; outcome: PaneActOutcome | null }

// The policy's form on Health: whether it is open, and each field as typed.
export type PanePolicyForm = { isEditing: boolean; values: Record<string, string> }

declare module 'claude-code' {
  interface PluginState {
    'terylon-pane': {
      snapshot: PaneSnapshot
      view: PaneView
      story: PaneStory | null
      add: PaneAdd
      quick: string
      band: PaneBand
      memory: PaneMemory
      answer: PaneAnswer | null
      goals: PaneGoals
      goal: PaneGoal | null
      bell: PaneBell
      overview: PaneOverview
      testMode: PaneTestMode
      open: string[]
      acts: Record<string, PaneAct>
      policyForm: PanePolicyForm
      rulesAsked: boolean
      specPicker: PaneSpecPicker
      revise: PaneRevise | null
      specView: PaneSpecView | null
    }
  }
}
