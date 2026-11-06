// TERYLON COCKPIT (Terylon S68): the pane renamed and put on Terylon's tones, words and refs, as the owner approved its
// boards. Its one command, the overview with its pills Notices · Memory · Health, the band's Notices, Terylon all well on
// the status line; every subject by its ref and the console's ?view= addresses; the setup token's tokens and its
// phrase, never a $ figure; and a host proof's subjects told nowhere. Each on the desktop, the narrow dock and the
// terminal where it is drawn.

import { test, expect } from 'claude-code/testing'

import { goalItems, planItems, storyView } from '../hooks/queue'
import * as words from '../hooks/words'

import { BASE, BRIEFING, FLIGHT, HOUR, NARROW_PANE_PROPS, PANE_PROPS, SESSION, STORIES, STORY_327, WORLD_NOW, bandProps, chipOf, events, exact, lateOnTheLocalDayOf, storyMoved, world, pill, toOverview, unfold } from './fixtures'
import { LIVE_GOAL, LIVE_PLAN, LIVE_STORY, REF_BRIEFING, REF_FLIGHT, REF_GOAL_3, REF_PLANS, REF_STORIES, REF_STORY_327, REF_STORY_333, SETUP_BRIEFING, SETUP_FLIGHT, SETUP_STORIES } from './shapes'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon' } as const

const SURFACES = [['desktop', PANE_PROPS, 'desktop'], ['narrow dock', NARROW_PANE_PROPS, 'desktop'], ['terminal', PANE_PROPS, 'terminal']] as const

type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown[] }

// Every word a drawn tree shows, a Link's label among them.
function wordsOf(node: unknown): string[] {
  if (node === null || typeof node !== 'object') {
    return typeof node === 'string' ? [node] : []
  }

  const element = node as Drawn
  const own = element.type === 'Link' ? [String(element.props?.label ?? '')] : element.type === 'Button' && typeof element.props?.label === 'string' ? [element.props.label] : []

  return [...own, ...(Array.isArray(element.children) ? element.children : []).flatMap(wordsOf)]
}

// A world with refs, its now on the local day the fixtures' story was merged on, so it is done today.
function refWorld(on: Parameters<typeof world>[0], options: Parameters<typeof world>[1] = {}) {
  const terylon = world(on, { now: lateOnTheLocalDayOf('2026-10-11T12:20:00Z'), ...options })
  terylon.answers.briefing = REF_BRIEFING
  terylon.answers.work_in_flight = REF_FLIGHT
  terylon.answers.stories_list = REF_STORIES
  terylon.answers.plans_list = REF_PLANS
  terylon.answers.goal_get = (args: Record<string, unknown>) => (args.goal === 3 ? REF_GOAL_3 : { id: args.goal, title: 'Other', priority: 2, state: 'open', storyList: [] })
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 327 ? REF_STORY_327 : args.story === 333 ? REF_STORY_333 : { id: args.story, goal: 3, title: 'Other', state: 'running', timeline: [] })

  return terylon
}

// ---------------------------------------------------------------------------------------------------- the name

for (const [surface, props, drawnOn] of SURFACES) {
  test(`${surface}: Terylon Cockpit in full; the overview's head reads Notices · Memory · Health; no footer names the command`, async ($, on) => {
    const terylon = world(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    const labels = []

    for (const key of ['tab-bell', 'tab-memory', 'tab-status']) {
      labels.push(String((await ui.find({ key }))?.props.label ?? ''))
    }

    expect(labels).toEqual(['Notices 2', 'Memory', 'Health'])
    // NO SCREEN NAMES THE COMMAND.
    expect(await ui.find({ type: 'Text', text: exact('/terylon-cockpit') })).toBeUndefined()

    // NO OLD NAME ANYWHERE, AND NO COMMAND BUT ONE: walked through the overview and More.
    const seen: string[] = wordsOf(await ui.drawn())

    await toOverview(ui)
    seen.push(...wordsOf(await ui.drawn()))
    await pill(ui, 'tab-status')
    seen.push(...wordsOf(await ui.drawn()))
    expect(await ui.find({ type: 'Text', text: exact('/terylon-cockpit') })).toBeUndefined()

    // The fixtures' goal is titled "Agentic OS": a title Terylon sent is drawn as it came, so only the pane's words count.
    expect(seen.filter(word => /\b(Queue|Bell|Status)\b|(^|\s)\/terylon(-pane|-memory)?(\s|$)/.test(word))).toEqual([])
    expect(seen.filter(word => /Agentic OS/.test(word) && !/Agentic OS(?! ●| ⚠|:)/.test(word))).toEqual([])
    expect(seen).toEqual(expect.arrayContaining(['Health ↗']))
    await ui.unmount()
  })
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: the band says Terylon Cockpit and Notices, and the status line says Terylon, all well`, async ($, on) => {
    const terylon = world(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const band = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'AbovePrompt', props: bandProps() })
    expect(await band.find({ type: 'Text', text: exact('Terylon Cockpit · Waiting 3 · Running 2 · Queued 2 · Notices 2') })).toBeDefined()
    expect((await band.find({ type: 'Text', text: exact(' · Notices ') }))?.props.color).toBe('subtle')
    expect(await band.find({ type: 'Text', text: /Bell|Queue\b/ })).toBeUndefined()
    await band.unmount()

    expect(terylon.statuses[terylon.statuses.length - 1]).toBe('Terylon ● all well · $5.50 of $20 today · 2/4 slots')
    expect(terylon.statuses.every(status => !String(status).includes('Agentic OS'))).toBe(true)

    // WHAT IS WRONG WITH THE WAY TO THE MACHINE is said under its name, Terylon, as the board draws it.
    terylon.mode.server = 'unclassified'
    await terylon.clock.advance(30000)
    const refused = await $.ui.mount({ plugin: 'terylon-pane', surface, component: 'AbovePrompt', props: bandProps() })
    expect((await refused.find({ type: 'Text', text: exact('Terylon') }))?.props.color).toBe('inactive')
    expect(terylon.statuses[terylon.statuses.length - 1]).toBe('Terylon ⚠ not allowed · /terylon-cockpit')
  })
}

test('Health says the machine Terylon, all well, in its colour, and names no tool', async ($, on) => {
  const terylon = world(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  await pill(ui, 'tab-status')
  expect(await ui.find({ type: 'Text', text: exact('Terylon') })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: exact('all well') }))?.props.color).toBe('success')

  expect((await ui.find({ type: 'Link', text: 'Health ↗' }))?.props.href).toBe(`${BASE}/?view=health`)
  expect(await ui.find({ type: 'Text', text: /notice_handle/ })).toBeUndefined()
})

// ------------------------------------------------------------------------------------------------------- refs

for (const [surface, props, drawnOn] of SURFACES) {
  test(`${surface}: every row names its subject by its ref, and its console link opens ?view= with that ref`, async ($, on) => {
    const terylon = refWorld(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    expect((await ui.find({ key: 'merge-327' }))?.text).toMatch(/^\s*(?:●\s+)?merge\s+S-C7Y32 Events since the last look · verified in pr-196 · waiting for merge$/)
    expect((await ui.find({ key: 'plan-41' }))?.text).toMatch(/^\s*(?:●\s+)?plan\s+P-Y46G7 Agentic OS · 3 stories$/)
    expect((await ui.find({ key: 'story-333' }))?.text).toMatch(/^S-BD6XS Direct dispatch/)
    await unfold(ui, 'fold-queued')
    await unfold(ui, 'fold-done')
    expect((await ui.find({ key: 'queued-328' }))?.text).toMatch(/S-01234 Owner's spec and plan/)
    expect((await ui.find({ key: 'done-341' }))?.text).toMatch(/S-HTMX6 S10a cleanup/)
    expect(wordsOf(await ui.drawn()).filter(word => /#(327|333|328|341)\b/.test(word))).toEqual([])

    await ui.press({ key: 'merge-327' })
    expect((await ui.find({ type: 'Link', text: 'Merge in the console ↗' }))?.props.href).toBe(`${BASE}/?view=merge&story=S-C7Y32`)
    await ui.press({ key: 'plan-41' })
    expect(await ui.find({ key: 'open-plan-41' })).toBeDefined()
    await ui.unmount()
  })

  test(`${surface}: a story's card by its ref: its goal's ref, its work item only as ADO #n ↗, the console's ?view=story`, async ($, on) => {
    const terylon = refWorld(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    await ui.press({ key: 'merge-327' })
    await ui.press({ key: 'open-story-327' })

    expect(await ui.find({ type: 'Text', text: exact('STORY · GOAL G-GQGTA') })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: exact('S-C7Y32 Events since the last look') })).toBeDefined()
    expect((await ui.find({ type: 'Link', text: 'ADO #481 ↗' }))?.props.href).toBe('https://dev.example/wi/481')
    expect(await ui.find({ type: 'Text', text: /#481|Work item 481/ })).toBeUndefined()
    expect((await ui.find({ type: 'Link', text: 'Merge in the console ↗' }))?.props.href).toBe(`${BASE}/?view=merge&story=S-C7Y32`)
    expect((await ui.find({ type: 'Link', text: 'Story in the console ↗' }))?.props.href).toBe(`${BASE}/?view=story&story=S-C7Y32`)
    expect((await ui.find({ key: 'story-goal' }))?.props.label).toBe('Goal G-GQGTA')

    // ITS GOAL BY ITS REF, and ‹ back to the story by the story's.
    await ui.press({ key: 'story-goal' })
    expect(await ui.find({ type: 'Text', text: exact('GOAL G-GQGTA') })).toBeDefined()
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ S-C7Y32')
    expect((await ui.find({ key: 'goal-story-333' }))?.text).toMatch(/S-BD6XS Direct dispatch/)
    expect((await ui.find({ type: 'Link', text: 'Goal in the console ↗' }))?.props.href).toBe(`${BASE}/?view=goal&goal=G-GQGTA`)
    await ui.press({ key: 'goal-story-333' })
    expect((await ui.find({ key: 'back' }))?.props.label).toBe('‹ G-GQGTA')

    // THE PROMPT A STORY POSTS NAMES IT BY ITS REF.
    await ui.press({ key: 'summarise' })
    expect(terylon.prompts).toEqual(['Shrň mi story S-BD6XS z Terylonu: kde je, co stojí a co potřebuje (story_get, work_in_flight).'])
    await ui.unmount()
  })
}

test('the done-signal names the story by its ref, in the prompt and the toast, as story_get reads it before the post', async ($, on) => {
  const terylon = refWorld(on, { store: { lastSeq: 18100, lastSeenAt: lateOnTheLocalDayOf('2026-10-11T12:20:00Z') - 60000 } })
  terylon.answers.events_since = (args: Record<string, unknown>) => events(Number(args.since), Number(args.since) >= 18101 ? [] : [storyMoved(18101, 327, 'Events since the last look', 'verified')])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts).toEqual(['Story S-C7Y32 „Events since the last look“ je ověřená v pr-196 a čeká na merge (PR 196, commit 4be21c0). Shrň mi důkazy a co mám proklikat.'])
  expect(terylon.toasts).toEqual(['Terylon: S-C7Y32 verified, waiting for merge'])
})

test('the catch-up names every subject by its ref', async ($, on) => {
  const now = Date.parse('2026-10-12T09:40:00Z')
  const terylon = refWorld(on, { now, store: { lastSeq: 18100, lastSeenAt: now - 14 * HOUR } })
  terylon.answers.events_since = (args: Record<string, unknown>) =>
    events(Number(args.since), Number(args.since) >= 18101 ? [] : [{ ...storyMoved(18101, 341, 'S10a cleanup', 'merged', 'merged'), ref: 'S-HTMX6' }])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const summary = terylon.prompts[0] ?? ''
  expect(summary).toContain('**Hotovo:** S-HTMX6 mergnutá')
  expect(summary).toContain('**Čeká na tebe:** S-C7Y32 čeká na merge · plán P-Y46G7 ke schválení (3 story) · otázka 9')
  expect(summary).toContain('**Běží:** S-BD6XS krok 5/9 · S-73PBR ověřuje se')
  expect(summary).not.toMatch(/#(327|333|329|341|41)\b/)
})

test('the live shapes of a Terylon with refs: a story, its plan and its goal, each read by the ref it carries', () => {
  // THE PORTED REF IS TERYLON'S OWN: the GUID's last 25 bits give the very ref the answer carries.
  expect(words.ref('story', LIVE_STORY.guid)).toBe(LIVE_STORY.ref)
  expect(words.ref('plan', LIVE_PLAN.guid)).toBe(LIVE_PLAN.ref)
  expect(words.ref('goal', LIVE_GOAL.guid)).toBe(LIVE_GOAL.ref)

  const card = storyView(120, LIVE_STORY, {}, null, Date.parse('2026-11-02T04:00:00Z'), 0, null)
  expect(card.title).toBe('S-761RY one word')
  expect(card.goalRef).toBe('G-TA1AQ')
  expect(card.workItem).toBeNull()
  expect(card.cost).toBe('22 k tokens · cost not known on the setup token')
  expect(card.stateTone).toBe('success')

  expect(planItems({ plans: [LIVE_PLAN] }, BASE)[0]).toMatchObject({ ref: 'P-RDJVS', goalRef: 'G-TA1AQ', console: `${BASE}/?view=plan&plan=P-RDJVS` })
  expect(goalItems({ goals: [LIVE_GOAL] }, []).closed[0]).toMatchObject({ ref: 'G-TA1AQ', title: 'mcp-proof accept 1793590281779' })

  // AN OLDER TERYLON, with no ref: the story is named by #id as it was.
  expect(storyView(333, { id: 333, title: 'Direct dispatch', state: 'running' }, {}, null, WORLD_NOW).title).toBe('#333 Direct dispatch')
})

// ------------------------------------------------------------------------------------------------ the setup token

function setupWorld(on: Parameters<typeof world>[0], options: Parameters<typeof world>[1] = {}) {
  const terylon = refWorld(on, options)
  terylon.answers.briefing = SETUP_BRIEFING
  terylon.answers.work_in_flight = SETUP_FLIGHT
  terylon.answers.stories_list = SETUP_STORIES
  terylon.answers.story_get = (args: Record<string, unknown>) => (args.story === 333 ? { ...REF_STORY_333, costUsd: 0, costKnown: false, tokens: 48033 } : { ...REF_STORY_327, costKnown: false })

  return terylon
}

// No figure that says a cost where none is known: a $0.00, a ~$0, or a dollar sum spent.
const NO_COST_FIGURE = /\$0\.00|~\$0\b|\$\d+\.\d\d/

test('the status line on the setup token: the tokens and "cost not known on the setup token", never a $ figure', async ($, on) => {
  const terylon = setupWorld(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.statuses[terylon.statuses.length - 1]).toBe('Terylon ● all well · 66 k tokens today · cost not known on the setup token · 2/4 slots')
  expect(terylon.statuses.filter(status => NO_COST_FIGURE.test(String(status)))).toEqual([])
})

for (const [surface, props, drawnOn] of SURFACES) {
  test(`${surface}: on the setup token Waiting, a story's card and Health say the tokens and the phrase, never a $ figure`, async ($, on) => {
    const terylon = setupWorld(on)
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
    await unfold(ui, 'fold-done')
    const seen = wordsOf(await ui.drawn())
    // THE OVERVIEW'S HEAD: today's tokens, never a $.
    expect(await ui.find({ type: 'Text', text: exact('all well · connected · 2/4 slots · 66 k tokens today') })).toBeDefined()
    // A ROW, A TIGHT PLACE: its tokens and the phrase's short form; the narrow dock drops a row's detail.
    if (surface !== 'narrow dock') {
      expect((await ui.find({ key: 'done-341' }))?.text).toMatch(/66 k tokens · cost not known$/)
      expect((await ui.find({ key: 'story-333' }))?.text).toMatch(/5\/8 · 48 k tokens · cost not known$/)
    }

    await ui.press({ key: 'story-333' })
    seen.push(...wordsOf(await ui.drawn()))

    if (drawnOn === 'terminal') {
      expect(await ui.find({ type: 'Text', text: /^48 k tokens · cost not known on the setup token · \d+ h( \d+ min)? since start$/ })).toBeDefined()
    } else {
      expect(await ui.find({ type: 'Text', text: exact('48 k tokens') })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: exact('cost not known on the setup token') })).toBeDefined()
      // NO BAR AGAINST A DOLLAR BUDGET where nothing is known in dollars.
      expect((await ui.findAll({ type: 'Svg' })).filter(node => /story's/.test(String(node.props.alt)))).toEqual([])
    }

    await ui.press({ key: 'back' })
    await pill(ui, 'tab-status')
    seen.push(...wordsOf(await ui.drawn()))
    expect(await ui.find({ type: 'Text', text: exact('66 k tokens today · cost not known on the setup token') })).toBeDefined()

    expect(seen.filter(word => NO_COST_FIGURE.test(word))).toEqual([])
    await ui.unmount()
  })
}

test('the catch-up on the setup token says the tokens and that its cost on the setup token is not known, in Czech', async ($, on) => {
  const now = Date.parse('2026-10-12T09:40:00Z')
  const terylon = setupWorld(on, { now, store: { lastSeq: 18100, lastSeenAt: now - 14 * HOUR } })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const summary = terylon.prompts[0] ?? ''
  expect(summary).toContain('**Náklady:** 66 k tokenů · náklady na setup tokenu nejsou známé.')
  expect(summary).toContain('náklady na setup tokenu nejsou známé')
  expect(summary).not.toMatch(/\$/)
})

test('with a cost known the catch-up still says it in dollars, and an estimate of $0 is never "~$0"', async ($, on) => {
  const now = Date.parse('2026-10-12T09:40:00Z')
  const terylon = world(on, { now, store: { lastSeq: 18100, lastSeenAt: now - 14 * HOUR } })
  terylon.answers.briefing = { ...BRIEFING, plansWaiting: [{ ...BRIEFING.plansWaiting[0], estimateUsd: 0 }] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  expect(terylon.prompts[0]).toContain('**Náklady:** $5.50 v běžících story z denního rozpočtu $20.')

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  await ui.press({ key: 'plan-41' })
  expect(wordsOf(await ui.drawn()).filter(word => /~\$0\b/.test(word))).toEqual([])
  expect(await ui.find({ type: 'Text', text: exact('to approve') })).toBeDefined()
})

// ------------------------------------------------------------------------------------------------- the host proof

const HOST_PROOF_STORY = { id: 900, title: 'host proof: a list story', state: 'verified', target: 'list', source: 'host-proof', updatedAt: '2026-10-11T21:00:00Z' }

function hostProofWorld(on: Parameters<typeof world>[0], options: Parameters<typeof world>[1] = {}) {
  const terylon = world(on, options)
  terylon.answers.briefing = { ...BRIEFING, storiesVerified: [...BRIEFING.storiesVerified, HOST_PROOF_STORY], storiesBlocked: [{ id: 903, title: 'host proof: blocked', blockedReason: 'proving', source: 'host-proof' }] }
  terylon.answers.work_in_flight = { ...FLIGHT, stories: [...FLIGHT.stories, { id: 901, title: 'host proof: running', state: 'running', source: 'host-proof', costUsd: 0, stuck: { since: '2026-10-11T21:00:00Z', reason: 'proving' } }, { id: 902, title: 'mcp proof: an owner fixture', state: 'running', source: 'owner', costUsd: 0, stuck: null }] }
  terylon.answers.stories_list = { stories: [...STORIES.stories, { ...HOST_PROOF_STORY }] }
  terylon.answers.story_get = (args: Record<string, unknown>) =>
    args.story === 327 ? STORY_327 : args.story === 905 ? { id: 905, goal: 3, title: 'host proof: merged', state: 'merged', source: 'host-proof', timeline: [] } : { id: args.story, goal: 3, title: 'x', state: 'verified', source: args.story === 900 ? 'host-proof' : 'owner', timeline: [] }

  return terylon
}

test('A HOST PROOF\'S STORIES REACH NO PROMPT AND NO TOAST: by their source, or by what story_get says before the post', async ($, on) => {
  const terylon = hostProofWorld(on, { store: { lastSeq: 18100, lastSeenAt: WORLD_NOW - 60000 } })
  terylon.answers.events_since = (args: Record<string, unknown>) =>
    events(Number(args.since), Number(args.since) >= 18103 ? [] : [
      storyMoved(18101, 900, 'host proof: a list story', 'verified'),
      storyMoved(18102, 905, 'host proof: merged', 'merged', 'merged'),
      storyMoved(18103, 327, 'Events since the last look', 'verified'),
    ])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  // The owner's story is told; the host proof's, verified, merged or stuck, never are.
  expect(terylon.prompts).toHaveLength(1)
  expect(terylon.prompts[0]).toStartWith('Story #327')
  expect(terylon.prompts.join('\n')).not.toMatch(/#90[0-5]|host proof/)
  expect(terylon.toasts).toEqual(['Terylon: #327 verified, waiting for merge'])
})

test('a host proof\'s stories are counted on no band and drawn on no row, while an mcp proof\'s owner fixture is', async ($, on) => {
  const terylon = hostProofWorld(on)
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const band = await $.ui.mount({ plugin: 'terylon-pane', surface: 'desktop', component: 'AbovePrompt', props: bandProps() })
  // Waiting: the question, story 327's merge and plan 41, not the host proof's acceptance or block; Running: 333, 329
  // and the mcp proof's 902, not the host proof's stuck 901.
  expect(await band.find({ type: 'Text', text: exact('Terylon Cockpit · Waiting 3 · Running 3 · Queued 2 · Notices 2') })).toBeDefined()
  expect(await band.find({ type: 'Text', text: exact(' (1 stuck)') })).toBeUndefined()
  await band.unmount()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  expect(await ui.find({ key: 'accept-900' })).toBeUndefined()
  expect(await ui.find({ key: 'blocked-903' })).toBeUndefined()
  expect(await ui.find({ key: 'story-901' })).toBeUndefined()
  expect(await ui.find({ key: 'story-902' })).toBeDefined()
})

test('a host proof\'s subjects are left out of the catch-up', async ($, on) => {
  const now = Date.parse('2026-10-12T09:40:00Z')
  const terylon = hostProofWorld(on, { now, store: { lastSeq: 18100, lastSeenAt: now - 14 * HOUR } })
  terylon.answers.events_since = (args: Record<string, unknown>) =>
    events(Number(args.since), Number(args.since) >= 18102 ? [] : [storyMoved(18101, 900, 'host proof: a list story', 'merged', 'merged'), storyMoved(18102, 341, 'S10a cleanup', 'merged', 'merged')])
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const summary = terylon.prompts[0] ?? ''
  expect(summary).toContain('**Hotovo:** #341 mergnutá')
  expect(summary).toContain('**Běží:** #333 krok 5/9 · #329 ověřuje se · #902 running')
  expect(summary).not.toMatch(/#90[0135]\b/)
})

// ----------------------------------------------------------------------------------------------------- the tones

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: purple is the gate, green is done: a merge, an acceptance and a plan to approve purple, done today green`, async ($, on) => {
    const terylon = refWorld(on)
    terylon.answers.briefing = { ...REF_BRIEFING, storiesVerified: [...REF_BRIEFING.storiesVerified, { id: 352, title: 'Weekly cost summary', target: 'list' }], storiesBlocked: [{ id: 87, title: 'Plan the export', blockedReason: 'needs your choice' }] }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface })
    expect((await chipOf(ui, 'merge-327'))?.dot).toBe('merged')
    expect((await chipOf(ui, 'accept-352'))?.dot).toBe('merged')
    expect((await chipOf(ui, 'plan-41'))?.dot).toBe('merged')
    expect((await chipOf(ui, 'question-9'))?.dot).toBe('warning')
    expect((await chipOf(ui, 'blocked-87'))?.dot).toBe('error')
    await unfold(ui, 'fold-done')
    expect((await chipOf(ui, 'done-341'))?.dot).toBe('success')

    await ui.press({ key: 'merge-327' })
    await ui.press({ key: 'open-story-327' })
    expect((await chipOf(ui, 'story-state'))?.dot).toBe('merged')
    await ui.unmount()
  })
}

test('a plan the briefing names by number alone is drawn on Waiting by the ref plans_list gave it', async ($, on) => {
  const terylon = refWorld(on)
  terylon.answers.briefing = { ...REF_BRIEFING, plansWaiting: REF_BRIEFING.plansWaiting.map(plan => ({ ...plan, ref: undefined, goalRef: undefined })) }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  await toOverview(ui)
  await terylon.clock.advance(30_000)
  await terylon.clock.settle()

  const row = await ui.find({ key: 'plan-41' })
  expect(String(row?.props.label)).toContain('P-Y46G7')
  expect(String(row?.props.label)).not.toContain('Plan 41')
})

test('a list story merged is told accepted on its goal\'s stories, as the glossary says', async ($, on) => {
  const terylon = refWorld(on)
  terylon.answers.goal_get = () => ({ ...REF_GOAL_3, target: 'list', storyList: [{ id: 401, title: 'Reply BETA', state: 'merged', target: 'list', ref: 'S-346D1' }] })
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface: 'desktop' })
  await toOverview(ui)
  await ui.press({ key: 'goal-3' })

  const row = await ui.find({ key: 'goal-story-401' })
  expect(String(row?.props.label)).toContain('accepted')
  expect(String(row?.props.label)).not.toContain('merged')
})

test('a plan whose stories wait for none draws no chain: its order is its rows', async ($, on) => {
  const terylon = refWorld(on)
  terylon.answers.plans_list = { plans: REF_PLANS.plans.map(plan => ({ ...plan, stories: (plan as { stories?: unknown[] }).stories?.map(story => ({ ...(story as object), runsAfter: [], after: [] })) })) }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, props: PANE_PROPS, surface })
    await toOverview(ui)
    await ui.press({ key: 'goal-3' })
    expect(await ui.find({ key: 'plan-41' })).toBeDefined()
    expect(await ui.find({ key: 'plan-41-chain' })).toBeUndefined()
    await ui.unmount()
  }
})
