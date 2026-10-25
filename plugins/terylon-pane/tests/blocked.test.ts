// THE OWNER'S WALK OF 1.2.2 (2026-10-25): #87's header said "running 75 h 46 min" beside its blocked chip. A blocked
// story is not running: its header names the time by its state, how long it has been blocked, from blockedFrom, else
// from its last update.

import { test, expect } from 'claude-code/testing'

import { FLIGHT, PANE_PROPS, SESSION, STORY_333, exact, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

function blockedFlight(fields: Record<string, unknown>): typeof FLIGHT {
  return { ...FLIGHT, stories: FLIGHT.stories.map(story => (story.id === 333 ? { ...story, state: 'blocked', ...fields } : story)) }
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: a blocked story's header says how long it has been blocked, never that it is running`, async ($, on) => {
    const terylon = world(on)
    // The world's clock is at 22:00; the run started at 10:00 and was blocked at 20:00.
    terylon.answers.work_in_flight = blockedFlight({ blockedFrom: '2026-10-11T20:00:00Z' })
    terylon.answers.story_get = { ...STORY_333, state: 'blocked' }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'story-333' })

    expect((await ui.find({ type: 'Text', text: exact('blocked for 2 h 0 min') }))?.props.tabular).toBe(true)
    expect(await ui.find({ type: 'Text', text: /running \d+ h/ })).toBeUndefined()
    await ui.unmount()
  })
}

test('a blocked story with no blockedFrom is timed from its last update', async ($, on) => {
  const terylon = world(on)
  terylon.answers.work_in_flight = blockedFlight({ updatedAt: '2026-10-11T21:30:00Z' })
  terylon.answers.story_get = { ...STORY_333, state: 'blocked' }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'story-333' })

  expect(await ui.find({ type: 'Text', text: exact('blocked for 0 h 30 min') })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /running \d+ h/ })).toBeUndefined()
})
