// What Terylon answered, shaped into the four groups the pane draws: waiting for you, running,
// queued or held, done today. Pure: no $, so a test reads it without a session.

import type { PaneDoneItem, PaneQueuedItem, PaneRunningItem, PaneWaitingItem } from '../types'

import { COPY } from './copy'

type Json = Record<string, unknown>

// The states a story waits in before a slot takes it.
const QUEUED_STATES = new Set(['approved', 'dispatched'])

export function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item): item is Json => item !== null && typeof item === 'object') : []
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

export function consoleLink(base: string, query: string): string {
  return `${base}/?cockpit=${query}`
}

export function waitingItems(briefing: Json, base: string): PaneWaitingItem[] {
  const items: PaneWaitingItem[] = []

  for (const story of list(briefing.storiesVerified)) {
    const id = number(story.id) ?? 0
    const environment = story.environment as Json | null | undefined
    items.push({
      kind: 'merge',
      key: `merge-${id}`,
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
      title: COPY.planTitle(id, text(plan.goalTitle) ?? '', number(plan.stories) ?? 0),
      detail: COPY.planWaiting(estimate === null ? null : estimate.toFixed(0)),
      console: consoleLink(base, `plan&plan=${id}`),
    })
  }

  for (const question of list(briefing.questionsOpen)) {
    const id = number(question.id) ?? 0
    items.push({
      kind: 'question',
      key: `question-${id}`,
      title: COPY.questionTitle(text(question.about) ?? text(question.subject) ?? `#${id}`),
      detail: text(question.text) ?? '',
      console: consoleLink(base, `question&question=${id}`),
    })
  }

  for (const story of list(briefing.storiesBlocked)) {
    const id = number(story.id) ?? 0
    items.push({
      kind: 'blocked',
      key: `blocked-${id}`,
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

export function header(flight: Json, policy: Json | null): string {
  const stories = list(flight.stories)
  const running = stories.reduce((sum, story) => sum + (number(story.costUsd) ?? 0), 0)
  const day = number(policy?.dayBudgetUsd)

  return COPY.header(running.toFixed(2), day === null ? null : day.toFixed(0), stories.length, number(flight.slots) ?? 0)
}
