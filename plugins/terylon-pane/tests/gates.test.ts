// The pane approves nothing. Every Button it can draw, on every screen and surface, is pressed here, and
// Terylon's record of calls must hold no gate. The guard itself refuses each gate by name.

import { test, expect } from 'claude-code/testing'

import { GATE_TOOLS, PANE_TOOLS, assertPaneTool } from '../hooks/terylon'

import { BRIEFING, GATES, GOAL_QUESTION, PANE_PROPS, SESSION, bandProps, events, storyMoved, world } from './fixtures'

// The paths from the queue to every screen the pane has: each one is walked, then everything on it pressed.
const PATHS: string[][] = [
  [],
  ['story-333'],
  ['story-333', 'story-goal'],
  ['story-329'],
  ['merge-327', 'open-story-327'],
  ['question-9', 'answer-9'],
  ['question-606', 'answer-606'],
  ['plan-41', 'open-plan-41'],
  ['tab-goals'],
  ['tab-goals', 'goal-3'],
  ['tab-bell'],
  ['tab-memory'],
  ['tab-memory', 'mem-edit-0-0'],
]

test('the guard refuses every one of the owner\'s gates, and allows no gate in its own list', () => {
  for (const gate of GATES) {
    expect(() => assertPaneTool(gate)).toThrow(/never calls/)
    expect(PANE_TOOLS.has(gate)).toBe(false)
  }

  expect([...GATE_TOOLS].sort()).toEqual([...GATES].sort())
  expect(() => assertPaneTool('spec_revise')).toThrow(/never calls/)
  expect(() => assertPaneTool('work_in_flight')).not.toThrow()
  expect(() => assertPaneTool('question_answer')).not.toThrow()
  expect(() => assertPaneTool('goal_add')).not.toThrow()
})

test('pressing every Button on every screen and surface calls no gate tool', async ($, on) => {
  const terylon = world(on, { store: { lastSeq: 18100, lastSeenAt: Date.parse('2026-10-11T21:59:00Z') } })
  terylon.answers.briefing = { ...BRIEFING, questionsOpen: [...BRIEFING.questionsOpen, GOAL_QUESTION] }
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 327, 'Events since the last look', 'verified')])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal', 'mobile'] as const) {
    const pane = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'Pane', requestId: 'terylon', props: PANE_PROPS })
    const paths = surface === 'mobile' ? PATHS : [...PATHS, ['quick-open'], ['quick-open', 'add-send']]

    for (const path of paths) {
      await $.command.run({ command: 'terylon-pane', args: '' } as never)

      for (const [index, key] of path.entries()) {
        const nextKey = path[index + 1]

        // A row opened on an earlier surface stays open: pressing it again would close it.
        if (nextKey !== undefined && (await pane.find({ key: nextKey })) !== undefined) {
          continue
        }

        await pane.press({ key })
      }

      // What leaves the screen goes last, so everything on it is pressed while it is still drawn.
      const leaving = (key: string) => key === 'back' || key.startsWith('tab-')
      const keys = (await pane.findAll({ type: 'Button' }))
        .map(button => button.key)
        .filter((key): key is string => key !== undefined)
        .sort((first, second) => Number(leaving(first)) - Number(leaving(second)))

      for (const key of keys) {
        await pane.press({ key }).catch(() => undefined)
      }
    }

    await pane.unmount()

    if (surface !== 'mobile') {
      const band = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'AbovePrompt', props: bandProps() })

      for (const button of await band.findAll({ type: 'Button' })) {
        if (button.key !== undefined) {
          await band.press({ key: button.key }).catch(() => undefined)
        }
      }

      await band.unmount()
    }
  }

  const tools = terylon.calls.map(call => call.tool)
  expect(tools.length).toBeGreaterThan(30)
  expect(tools).toContain('question_answer')
  expect(tools).toContain('goal_get')
  expect(terylon.calls.filter(call => GATES.includes(call.tool))).toEqual([])
  expect(terylon.calls.filter(call => !PANE_TOOLS.has(call.tool))).toEqual([])
})
