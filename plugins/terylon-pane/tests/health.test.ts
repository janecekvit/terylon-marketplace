// THE STATUS LINE (#332, the operator's round 3): the health of Agentic OS and its spend, only the worst problem,
// short enough to sit beside the model's name. What is an alert is decided here, and held to it.

import { test, expect } from 'claude-code/testing'

import { ALERT_SOURCES, HEALTH_LONGEST, clip, healthLine, isAlert } from '../hooks/health'
import type { Health } from '../hooks/health'

import { BRIEFING, PANE_PROPS, SESSION, bandProps, exact, world } from './fixtures'

const WELL: Health = { connection: 'ok', failingSince: null, isPaused: false, alerts: 0, runningUsd: '5.50', dayBudget: '20', slotsUsed: 2, slots: 4 }

test('well: the spend of today and the slots in use', () => {
  expect(healthLine(WELL)).toBe('Agentic OS ● ok · $5.50 of $20 today · 2/4 slots')
  expect(healthLine({ ...WELL, dayBudget: null })).toBe('Agentic OS ● ok · $5.50 today · 2/4 slots')
})

test('only the worst problem is said: not allowed, then the connection, then the leader paused, then the alerts', () => {
  const everything: Health = { ...WELL, isPaused: true, alerts: 3, failingSince: '18:42' }

  expect(healthLine({ ...everything, connection: 'not-allowed' })).toBe('Agentic OS ⚠ not allowed · /terylon-pane')
  expect(healthLine({ ...everything, connection: 'unreachable' })).toBe('Agentic OS ⚠ not answering since 18:42')
  expect(healthLine({ ...everything })).toBe('Agentic OS ⚠ leader paused')
  expect(healthLine({ ...everything, isPaused: false })).toBe('Agentic OS ⚠ 3 alerts')
  expect(healthLine({ ...WELL, alerts: 1 })).toBe('Agentic OS ⚠ 1 alert')
  expect(healthLine({ ...WELL, connection: 'connecting' })).toBe('Agentic OS · connecting…')
})

test('the line is never longer than it may be, and a cut line ends with an ellipsis', () => {
  expect(HEALTH_LONGEST).toBeLessThanOrEqual(60)
  expect(healthLine({ ...WELL, runningUsd: '12345678.90', dayBudget: '99999999', slotsUsed: 100, slots: 1000 }).length).toBeLessThanOrEqual(HEALTH_LONGEST)
  expect(clip('x'.repeat(80))).toHaveLength(HEALTH_LONGEST)
  expect(clip('x'.repeat(80)).endsWith('…')).toBe(true)
  expect(clip('short')).toBe('short')
})

test('an alert is a fault of the machine; the briefing, the questions, a newer image and a handled notice are not', () => {
  expect(ALERT_SOURCES).toEqual(['gatus', 'unit', 'host'])

  expect(isAlert({ source: 'gatus', title: 'the page is not well', handledAt: null })).toBe(true)
  expect(isAlert({ source: 'unit', title: 'terylon-leader-verify.service failed', handledAt: null })).toBe(true)
  expect(isAlert({ source: 'host', title: 'alice-host: the disk is full', handledAt: null })).toBe(true)
  expect(isAlert({ source: 'session', key: 'incident:321-egress', title: 'Production has no egress', handledAt: null })).toBe(true)
  expect(isAlert({ source: 'production', title: 'Deploy of 1a2b3c failed; rolled back', handledAt: null })).toBe(true)

  expect(isAlert({ source: 'production', title: 'Production is at d577b984', handledAt: null })).toBe(false)
  expect(isAlert({ source: 'leader', key: 'briefing:2026-10-12', title: 'Good morning: your briefing', handledAt: null })).toBe(false)
  expect(isAlert({ source: 'leader', key: 'question:goal/11', title: 'The leader asks about Test z telefonu', handledAt: null })).toBe(false)
  expect(isAlert({ source: 'diun', title: 'A newer docker.io/library/node:22 is published', handledAt: null })).toBe(false)
  expect(isAlert({ source: 'gatus', title: 'the page is not well', handledAt: '2026-10-11T07:50:52Z' })).toBe(false)
})

test('in a session: the status line counts the alerts, the band says them and its Open opens the pane as always', async ($, on) => {
  const terylon = world(on)
  terylon.answers.notices_list = {
    unhandled: 3,
    notices: [
      { id: 117, source: 'gatus', title: 'the page is not well', body: 'gatus says it stopped answering.', raisedAt: '2026-10-11T07:26:21Z', handledAt: null },
      { id: 163, source: 'leader', key: 'briefing:2026-10-11', title: 'Good morning: your briefing', body: '', raisedAt: '2026-10-11T05:00:06Z', handledAt: null },
      { id: 36, source: 'diun', title: 'A newer docker.io/library/node:22-bookworm-slim is published', body: '', raisedAt: '2026-10-06T06:00:09Z', handledAt: null },
    ],
  }
  terylon.answers.briefing = { ...BRIEFING, unhandledNotices: 3 }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.statuses[terylon.statuses.length - 1]).toBe('Agentic OS ⚠ 1 alert')

  for (const surface of ['desktop', 'terminal'] as const) {
    const band = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'AbovePrompt', props: bandProps() })
    expect((await band.find({ type: 'Text', text: exact(' · 1 alert') }))?.props.color).toBe('error')
    expect((await band.find({ key: 'band-open' }))?.props.label).toBe('Open')
    await band.press({ key: 'band-open' })
    await band.unmount()
  }

  const pane = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
  expect((await pane.find({ key: 'tab-queue' }))?.props.variant).toBe('primary')
  expect((await pane.find({ key: 'tab-status' }))?.props.label).toBe('Status ⚠')
  expect((await pane.find({ key: 'tab-bell' }))?.props.label).toBe('Bell · 3')
})

test('in a session: each problem reaches the status line, and the line comes back to well', async ($, on) => {
  const terylon = world(on)
  terylon.mode.server = 'unclassified'
  await $.session.start(SESSION)
  expect(terylon.statuses[0]).toBe('Agentic OS · connecting…')
  await terylon.clock.settle()
  expect(terylon.statuses[terylon.statuses.length - 1]).toBe('Agentic OS ⚠ not allowed · /terylon-pane')

  terylon.mode.server = 'down'
  await terylon.clock.advance(30000)
  expect(terylon.statuses[terylon.statuses.length - 1]).toMatch(/^Agentic OS ⚠ not answering since \d\d:\d\d$/)

  terylon.mode.server = 'up'
  terylon.answers.briefing = { ...BRIEFING, leader: { paused: { at: '2026-10-11T14:05:00Z', source: 'cockpit', reason: null } } }
  await terylon.clock.advance(60000)
  expect(terylon.statuses[terylon.statuses.length - 1]).toBe('Agentic OS ⚠ leader paused')

  terylon.answers.briefing = BRIEFING
  await terylon.clock.advance(30000)
  expect(terylon.statuses[terylon.statuses.length - 1]).toBe('Agentic OS ● ok · $5.50 of $20 today · 2/4 slots')
})
