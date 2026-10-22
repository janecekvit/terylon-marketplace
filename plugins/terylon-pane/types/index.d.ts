// The terylon-pane mod's state contract: what the band and the pane draw from, held by the host for the session.
// Everything here is a copy of what Terylon's /mcp answered, shaped for drawing; nothing is decided here.

export type PaneConnection = 'connecting' | 'ok' | 'unreachable' | 'refused' | 'no-server' | 'not-allowed' | 'error'

export type PaneWaitingItem = {
  kind: 'merge' | 'plan' | 'question' | 'blocked'
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
}

export type PaneAddPhase = 'form' | 'sending' | 'added' | 'refused' | 'timeout' | 'paused'

export type PaneAdd = {
  phase: PaneAddPhase
  title: string
  criteria: string
  goal: string
  after: string
  size: string
  goals: PaneChoice[]
  stories: PaneChoice[]
  sentence: string | null
  link: string | null
}

export type PaneAnswer = {
  question: number
  text: string
  choice: string | null
  phase: 'form' | 'sending' | 'answered' | 'refused'
  sentence: string | null
}

export type PaneGoalItem = { id: number; title: string; priority: string; state: string; questions: number; stories: string }

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
}

export type PaneGoal = {
  goal: number
  phase: 'loading' | 'ok' | 'error'
  sentence: string | null
  title: string
  meta: string
  stories: { id: number; title: string; state: string }[]
}

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

export type PaneMemory = {
  phase: 'loading' | 'ok' | 'error' | 'editing' | 'sending' | 'proposed' | 'refused'
  files: PaneMemoryFile[]
  rules: PaneMemoryRule[]
  pending: number
  edit: PaneMemoryEdit | null
  sentence: string | null
  proposed: string[]
}

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
    }
  }
}
