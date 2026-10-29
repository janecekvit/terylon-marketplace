// The status line: the health of Agentic OS and its spend, in one short line beside the model's name. The band
// above the prompt says what calls for the owner; this says whether the machine is well, never the same thing twice.
// Pure: no $, so a test reads it without a session.

import type { PaneConnection } from '../types'

import { COPY } from './copy'

type Json = Record<string, unknown>

// Sources whose unhandled notice is a fault of the machine: a health check, a failed unit, the host itself.
export const ALERT_SOURCES: readonly string[] = ['gatus', 'unit', 'host']

// Keys that are a fault whatever raised them: an incident a session or the orchestrator declared.
export const ALERT_KEY_PREFIXES: readonly string[] = ['incident:']

// Sources that report both success and failure: only a notice that says it failed is an alert.
export const FAILING_SOURCES: readonly string[] = ['production', 'backup']

// What a production or backup notice says when it failed.
const FAILURE = /\bfail|roll(ed)?\s?back|\berror\b/i

// The longest the line is drawn, in characters, so it fits beside "Opus 5.5 High".
export const HEALTH_LONGEST = 60

// Not alerts, ever: the briefing, the leader's questions and its news, a newer image published, a test.
// They wait for the owner on the band and in the bell, not as the machine's health.
export function isAlert(notice: Json): boolean {
  if (notice.handledAt != null) {
    return false
  }

  const source = String(notice.source ?? '')
  const key = String(notice.key ?? '')

  if (ALERT_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
    return true
  }

  if (ALERT_SOURCES.includes(source)) {
    return true
  }

  return FAILING_SOURCES.includes(source) && FAILURE.test(`${String(notice.title ?? '')} ${String(notice.body ?? '')}`)
}

export function alertCount(notices: Json): number {
  const list = Array.isArray(notices.notices) ? notices.notices : []

  return list.filter((notice): notice is Json => notice !== null && typeof notice === 'object' && isAlert(notice as Json)).length
}

export function clip(line: string, longest = HEALTH_LONGEST): string {
  return line.length <= longest ? line : `${line.slice(0, longest - 1).trimEnd()}…`
}

// THE STATUS TAB'S PARTS, as TERYLON_PANE_STATUS names them to bisect a tab Desktop does not draw: `no-<part>` leaves
// that part out, `minimal` draws the tab as plain lines alone. Unset, the whole tab is drawn.
export const STATUS_PARTS = ['machine', 'gauges', 'problems', 'events', 'alerts', 'policy', 'outcomes', 'diagnostics'] as const

export type StatusPart = (typeof STATUS_PARTS)[number]

export type StatusDrawing = { isMinimal: boolean; isLogShown: boolean; off: ReadonlySet<StatusPart> }

export function statusDrawingOf(value: string | null | undefined): StatusDrawing {
  const named = new Set((value ?? '').split(/[\s,]+/).map(name => name.trim().toLowerCase()).filter(name => name !== ''))

  return {
    isMinimal: named.has('minimal'),
    // `log` draws the pane's own diagnostics on the Queue tab, for a host that writes no log the owner can read.
    isLogShown: named.has('log'),
    off: new Set(STATUS_PARTS.filter(part => named.has(`no-${part}`))),
  }
}

// WHAT A DRAWN TREE HOLDS that a host may refuse while the kit draws it: a key used twice, a prop with no value or no
// finite number, a control character. Read off the engine's own shape, { type, props, children }; anything else is text.
export type TreeCheck = { elements: number; characters: number; duplicateKeys: string[]; oddProps: string[] }

// A control character other than a line feed or a tab, which no line of text the pane draws should carry.
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B-\u001F\u007F]/

// How many of each finding a check names; the count says the rest.
const FINDINGS_NAMED = 5

export function checkTree(tree: unknown): TreeCheck {
  const keys = new Map<string, number>()
  const oddProps: string[] = []
  let elements = 0
  let characters = 0

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }

    if (typeof node === 'string') {
      characters += node.length
      if (CONTROL_CHARACTER.test(node)) {
        oddProps.push('text: a control character')
      }
      return
    }

    if (node === null || typeof node !== 'object' || typeof (node as { type?: unknown }).type !== 'string') {
      return
    }

    const element = node as { type: string; props?: Record<string, unknown>; children?: unknown }
    elements += 1

    for (const [name, value] of Object.entries(element.props ?? {})) {
      if (name === 'key') {
        const key = String(value)
        keys.set(key, (keys.get(key) ?? 0) + 1)
      } else if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
        oddProps.push(`${element.type}.${name}=${String(value)}`)
      } else if (typeof value === 'string' && CONTROL_CHARACTER.test(value)) {
        oddProps.push(`${element.type}.${name}: a control character`)
      }
    }

    visit(element.children)
  }

  visit(tree)

  return {
    elements,
    characters,
    duplicateKeys: [...keys].filter(([, count]) => count > 1).map(([key, count]) => `${key}×${count}`).slice(0, FINDINGS_NAMED),
    oddProps: oddProps.slice(0, FINDINGS_NAMED),
  }
}

// The check in one line for the debug log and the pane's own log.
export function treeLine(check: TreeCheck): string {
  const findings = [
    check.duplicateKeys.length === 0 ? null : `keys used twice: ${check.duplicateKeys.join(', ')}`,
    check.oddProps.length === 0 ? null : `odd props: ${check.oddProps.join(', ')}`,
  ].filter(finding => finding !== null)

  return `${check.elements} elements, ${check.characters} characters${findings.length === 0 ? ', nothing odd' : `; ${findings.join('; ')}`}`
}

export type Health = {
  connection: PaneConnection
  failingSince: string | null
  isPaused: boolean
  alerts: number
  runningUsd: string
  dayBudget: string | null
  slotsUsed: number
  slots: number
}

// The machine's state in one word, for the Status tab: the same order as the status line.
export function stateWord(health: Health): { word: string; tone: 'success' | 'warning' | 'error' | 'subtle' } {
  switch (health.connection) {
    case 'connecting':
      return { word: 'connecting', tone: 'subtle' }
    case 'not-allowed':
      return { word: 'not allowed', tone: 'warning' }
    case 'no-server':
      return { word: 'no server', tone: 'warning' }
    case 'refused':
      return { word: 'refused', tone: 'error' }
    case 'error':
      return { word: 'error', tone: 'error' }
    case 'unreachable':
      return { word: 'not answering', tone: 'warning' }
    default:
      break
  }

  if (health.isPaused) {
    return { word: 'paused', tone: 'warning' }
  }

  if (health.alerts > 0) {
    return { word: health.alerts === 1 ? '1 alert' : `${health.alerts} alerts`, tone: 'warning' }
  }

  return { word: 'ok', tone: 'success' }
}

// Only the worst problem is said: a call Claude Code refused, then the connection, the leader paused, the alerts.
export function healthLine(health: Health): string {
  switch (health.connection) {
    case 'connecting':
      return clip(COPY.healthConnecting)
    case 'not-allowed':
      return clip(COPY.healthNotAllowed)
    case 'no-server':
      return clip(COPY.healthNoServer)
    case 'refused':
      return clip(COPY.healthRefused)
    case 'error':
      return clip(COPY.healthError)
    case 'unreachable':
      return clip(COPY.healthUnreachable(health.failingSince ?? '?'))
    default:
      break
  }

  if (health.isPaused) {
    return clip(COPY.healthPaused)
  }

  if (health.alerts > 0) {
    return clip(COPY.healthAlerts(health.alerts))
  }

  return clip(COPY.healthOk(health.runningUsd, health.dayBudget, health.slotsUsed, health.slots))
}
