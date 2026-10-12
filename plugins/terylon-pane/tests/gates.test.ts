// The pane approves nothing. Every Button it can draw, on every screen, is pressed here, and Terylon's
// record of calls must hold no gate. The guard itself refuses each gate by name.

import { test, expect } from 'claude-code/testing'

import { GATE_TOOLS, PANE_TOOLS, assertPaneTool } from '../hooks/terylon'

import { GATES, PANE_PROPS, SESSION, events, storyMoved, world } from './fixtures'

test('the guard refuses every one of the owner\'s gates, and allows no gate in its own list', () => {
  for (const gate of GATES) {
    expect(() => assertPaneTool(gate)).toThrow(/never calls/)
    expect(PANE_TOOLS.has(gate)).toBe(false)
  }

  expect([...GATE_TOOLS].sort()).toEqual([...GATES].sort())
  expect(() => assertPaneTool('spec_revise')).toThrow(/never calls/)
  expect(() => assertPaneTool('work_in_flight')).not.toThrow()
})

test('pressing every Button on every screen and surface calls no gate tool', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 327, 'Events since the last look', 'verified')])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal', 'mobile'] as const) {
    const pane = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
    const screens: string[][] = [[], ['story-333'], ['story-329']]

    if (surface !== 'mobile') {
      screens.push(['quick-open'], ['quick-open', 'add-send'])
    }

    for (const path of screens) {
      for (const key of path) {
        await pane.press({ key })
      }

      for (const button of await pane.findAll({ type: 'Button' })) {
        if (button.key !== undefined && button.key !== 'open-memory') {
          await pane.press({ key: button.key }).catch(() => undefined)
        }
      }

      await pane.press({ key: 'back' }).catch(() => undefined)
    }

    await pane.press({ key: 'open-memory' })
    const memory = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'Pane', requestId: 'terylon-memory', props: PANE_PROPS })

    for (const button of await memory.findAll({ type: 'Button' })) {
      if (button.key !== undefined) {
        await memory.press({ key: button.key }).catch(() => undefined)
      }
    }

    await pane.unmount()
    await memory.unmount()
  }

  expect(terylon.calls.length).toBeGreaterThan(10)
  expect(terylon.calls.filter(call => GATES.includes(call.tool))).toEqual([])
  expect(terylon.calls.filter(call => !PANE_TOOLS.has(call.tool))).toEqual([])
})
