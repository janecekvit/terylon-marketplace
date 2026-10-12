// The terylon-pane mod's state contract: what the pane draws from, held by the host for the session.
// Everything here is a copy of what Terylon's /mcp answered, shaped for drawing; nothing is decided here.

export type PaneConnection = 'connecting' | 'ok' | 'unreachable' | 'refused' | 'no-server' | 'error'

export type PaneWaitingItem = {
  kind: 'merge' | 'plan' | 'question' | 'blocked'
  key: string
  title: string
  detail: string
  console: string
}

export type PaneRunningItem = {
  story: number
  title: string
  detail: string
  fraction: number | null
  isStuck: boolean
  isVerifying: boolean
}

export type PaneQueuedItem = { story: number; title: string; detail: string; isHeld: boolean }

export type PaneDoneItem = { story: number; title: string; detail: string }

export type PaneChoice = { value: string; label: string }

export type PaneSnapshot = {
  connection: PaneConnection
  problem: string | null
  fetchedAt: number | null
  header: string
  paused: string | null
  waiting: PaneWaitingItem[]
  running: PaneRunningItem[]
  queued: PaneQueuedItem[]
  doneToday: PaneDoneItem[]
}

export type PaneView = { screen: 'queue' } | { screen: 'story'; story: number } | { screen: 'add' }

export type PaneStory = {
  story: number
  title: string
  meta: string
  step: string
  fraction: number | null
  cost: string
  question: string | null
  questionLink: string | null
}

export type PaneAddPhase = 'form' | 'sending' | 'added' | 'refused' | 'timeout' | 'paused'

export type PaneAdd = {
  phase: PaneAddPhase
  title: string
  criteria: string
  goal: string
  after: string
  goals: PaneChoice[]
  stories: PaneChoice[]
  sentence: string | null
  link: string | null
}

export type PaneBand = { text: string; link: string; isAlert: boolean } | null

export type PaneMemoryFile = { file: string; heading: string; entries: string[]; text: string | null }

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
  pending: number
  edit: PaneMemoryEdit | null
  sentence: string | null
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
    }
  }
}
