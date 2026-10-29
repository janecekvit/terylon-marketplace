// The terylon-pane mod's state contract: what the band and the pane draw from, held by the host for the session.
// Everything here is a copy of what Terylon's /mcp answered, shaped for drawing; nothing is decided here.

export type PaneConnection = 'connecting' | 'ok' | 'unreachable' | 'refused' | 'no-server' | 'not-allowed' | 'error'

export type PaneWaitingItem = {
  // A verified story waits for a merge over a repository, or for an acceptance in Terylon's own list (#39).
  kind: 'merge' | 'accept' | 'plan' | 'question' | 'blocked'
  key: string
  // The subject the row opens in the pane: a story, a plan or a question.
  target: number
  title: string
  detail: string
  console: string
}

export type PaneRunningItem = {
  story: number
  title: string
  detail: string
  step: string | null
  fraction: number | null
  isStuck: boolean
  isVerifying: boolean
  // The eight phases from progress.stage, as the story's own screen draws them (S32): none is now without a stage.
  phases: PanePhase[]
  // "Tests · tester · step 5 of 9": the stage, who works in it and the step, or null with no stage reported.
  stageLine: string | null
}

export type PaneQueuedItem = { story: number; title: string; detail: string; isHeld: boolean }

export type PaneDoneItem = { story: number; title: string; detail: string }

export type PaneQuestionItem = {
  id: number
  about: string
  subject: string
  // "cíl 11", "story 38": what the question waits on, as the pane names it.
  subjectLabel: string
  text: string
  askedAt: string | null
}

export type PaneChoice = { value: string; label: string }

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
  questions: PaneQuestionItem[]
}

export type PaneScreen =
  | { screen: 'queue' }
  | { screen: 'goals' }
  | { screen: 'bell' }
  | { screen: 'memory' }
  | { screen: 'status' }
  | { screen: 'add' }
  | { screen: 'story'; story: number }
  | { screen: 'question'; question: number }
  | { screen: 'plan'; plan: number }
  | { screen: 'goal'; goal: number }

// Where the pane is, and the way back: the last entry is drawn, ‹ pops it, a tab starts the stack over.
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
  spentUsd: number
  budgetUsd: number | null
}

export type PaneCheck = { name: string; isPass: boolean; detail: string }

export type PaneEvent = { time: string; actor: string; summary: string }

export type PaneStory = {
  story: number
  phase: 'loading' | 'ok' | 'error'
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
  stateTone: 'success' | 'warning' | 'suggestion' | 'subtle'
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

export type PaneGoalItem = { id: number; title: string; priority: string; state: string; questions: number; stories: string }

// `after`: the places in the plan, 1-based, of the stories this one waits for (#35).
export type PanePlanStory = { id: number; index: number; title: string; detail: string; criteria: string[]; after: number[]; size: string; estimate: string | null }

export type PanePlan = {
  id: number
  goal: number
  goalTitle: string
  state: string
  stateText: string
  isProposed: boolean
  comment: string | null
  stories: PanePlanStory[]
  console: string
}

export type PaneGoals = {
  phase: 'loading' | 'ok' | 'error'
  sentence: string | null
  open: PaneGoalItem[]
  closed: PaneGoalItem[]
  plans: PanePlan[]
  draft: string
  // The new goal's priority (1–4) and target, as goal_add takes them (S32).
  priority: string
  target: string
  targets: PaneChoice[]
  adding: 'idle' | 'sending' | 'added' | 'refused'
  addSentence: string | null
  // OPEN AND CLOSED, TWO BUTTONS: which list the tab shows, Open by default, and the closed goals' count.
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
  phase: 'loading' | 'ok' | 'error'
  sentence: string | null
  title: string
  meta: string
  stories: { id: number; title: string; state: string }[]
  // An open or active goal can be dropped (S27); a done or dropped one cannot. A drop abandons every story of it that
  // has not ended, stopping a run first (Terylon S35, #388), and the drop says which, by title (#35).
  isOpen: boolean
  openStories: { id: number; title: string; isRunning: boolean }[]
  // A REPEATING TASK'S GOAL (Terylon S43): its card replaces the stories card. Absent in a value an older version stored.
  repeating?: PaneRepeating | null
}

// One run of a repeating task, newest first: its day in the host's time zone, its state in words and that state's tone,
// and its files with its cost. `story` is null when Terylon names none, and the run then opens nothing.
export type PaneRepeatingRun = { story: number | null; day: string; state: string; tone: 'success' | 'warning' | 'subtle'; line: string }

export type PaneRepeating = { title: string; summary: string; runs: PaneRepeatingRun[]; console: string }

export type PaneNotice = { id: number; source: string; title: string; body: string; when: string; link: string | null }

export type PaneBell = {
  phase: 'loading' | 'ok' | 'error'
  sentence: string | null
  unhandledCount: number
  unhandled: PaneNotice[]
  handled: PaneNotice[]
  leader: { isPaused: boolean; text: string }
  metrics: { value: string; label: string }[]
  handling: number | null
  handleSentence: string | null
}

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

export type PaneProposal = { id: number; file: string; action: string; oldText: string | null; text: string | null; operations: PaneProposalOperation[]; why: string | null; by: 'owner' | 'leader'; story: number | null; at: string | null }

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

// The policy's form on the Status tab: whether it is open, and each field as typed.
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
      open: string[]
      acts: Record<string, PaneAct>
      policyForm: PanePolicyForm
      rulesAsked: boolean
    }
  }
}
