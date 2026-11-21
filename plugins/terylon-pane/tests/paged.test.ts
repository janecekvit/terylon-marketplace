// THE PAGED LISTS: Terylon answers stories_list, goals_list, notices_list and plans_list a page of compact items at a
// time, with `more` and `next`; the pane asks for every item whole, the largest page, and follows `next` as `cursor`
// while `more` is true. A server that pages nothing answers no `more` and is read once. goal_get is asked whole, and
// memory_get for the files and proposals the pane draws.

import { test, expect } from 'claude-code/testing'

import { GOALS, NOTICES, PANE_PROPS, SESSION, pill, refusal, toOverview, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

type Call = { tool: string; args: Record<string, unknown> }

function argsOf(calls: readonly Call[], tool: string): Record<string, unknown>[] {
  return calls.filter(call => call.tool === tool).map(call => call.args)
}

// A list answered one item a page, as a paged Terylon answers a list over its limit: `next` is the item's ref or id.
function paged(field: string, items: readonly Record<string, unknown>[], rest: Record<string, unknown> = {}) {
  return (args: Record<string, unknown>) => {
    const after = args.cursor === undefined ? 0 : items.findIndex(item => String(item.id) === String(args.cursor)) + 1
    const shown = items.slice(after, after + 1)
    const more = after + 1 < items.length

    return { ...rest, [field]: shown, more, next: more ? String(shown[0]?.id) : null }
  }
}

test('a list over its page is read whole: every page, each asked whole, next sent as cursor', async ($, on) => {
  const terylon = world(on)
  terylon.answers.goals_list = paged('goals', GOALS.goals)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await toOverview(ui)

  // THE GOAL ON THE SECOND PAGE IS DRAWN, as it was when one answer held every goal.
  expect(await ui.find({ key: 'goal-3' })).toBeDefined()
  expect(await ui.find({ key: 'goal-11' })).toBeDefined()

  const reads = argsOf(terylon.calls, 'goals_list')
  expect(reads.slice(0, 3)).toEqual([{ whole: true, limit: 500 }, { whole: true, limit: 500, cursor: '3' }, { whole: true, limit: 500, cursor: '11' }])
})

test('the poll reads the stories and the notices whole, and a server that answers no more is read once', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(argsOf(terylon.calls, 'stories_list')[0]).toEqual({ whole: true, limit: 500 })
  expect(argsOf(terylon.calls, 'notices_list')[0]).toEqual({ whole: true, limit: 500 })
  expect(argsOf(terylon.calls, 'stories_list').some(args => 'cursor' in args)).toBe(false)
})

test('the notices on a later page are counted on the bell, and a later page that fails fails the read', async ($, on) => {
  const terylon = world(on)
  const pages = paged('notices', NOTICES.notices, { unhandled: NOTICES.unhandled })
  terylon.answers.notices_list = pages
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await toOverview(ui)
  await pill(ui, 'tab-bell')
  await terylon.clock.settle()

  // EVERY NOTICE OF THE THREE PAGES, on the bell.
  expect(argsOf(terylon.calls, 'notices_list').some(args => args.cursor === '168')).toBe(true)
  expect(await ui.find({ type: 'Text', text: /The leader asks about Test z telefonu/ })).toBeDefined()

  // A LATER PAGE REFUSED: the bell says it did not load, never a list cut short.
  terylon.answers.notices_list = (args: Record<string, unknown>) => (args.cursor === undefined ? pages(args) : refusal('The cursor names no item this list holds any more: read it again from the start, without cursor.', 400))
  await pill(ui, 'tab-bell')
  await terylon.clock.settle()
  expect(await ui.find({ type: 'Text', text: /^Notices did not load/ })).toBeDefined()
})

test('a goal is read whole, and the memory for its files and proposals', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await toOverview(ui)
  await ui.press({ key: 'goal-3' })
  await terylon.clock.settle()

  expect(argsOf(terylon.calls, 'goal_get')).toEqual([{ goal: 3, whole: true }])
  expect(argsOf(terylon.calls, 'memory_get').every(args => JSON.stringify(args) === JSON.stringify({ sections: ['files', 'proposals'] }))).toBe(true)
  expect(argsOf(terylon.calls, 'memory_get').length).toBeGreaterThan(0)
})
