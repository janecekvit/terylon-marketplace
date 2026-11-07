// THE OWNER'S WALK OF 1.2.0 (2026-10-23): on the waiting card's tint and the problem card's, in dark and worse in light,
// the hints, the links, the chips and an open question's body could not be read. So no card takes a tint of what it holds,
// and every card on a graphic surface lies on one faint neutral fill, the waiting tile on a translucent purple; these
// tests hold every word and link on a card that waits or warns, and every chip, to WCAG's 4.5:1 (3:1 for a dot) in both
// themes, on the desktop and the terminal. The kit gives the theme keys a drawing names, never the painted colours, so
// the ratio is computed from the S32 canvas's palette in tests/contrast.ts.

import { test, expect } from 'claude-code/testing'

import { CARD_FILL, CHIP_BACKGROUND, CHIP_WORD, WAITING_TILE_FILL } from '../hooks/drawing'
import { KIND_TONES, TONE_KEYS, WARNING_LIGHT, markOf, wordOf } from '../hooks/tones'
import type { WordTone } from '../hooks/tones'

import { MARK_RATIO, PALETTE, TEXT_RATIO, contrast, inks, strokedCards } from './contrast'
import type { Ink, Theme } from './contrast'
import { BRIEFING, FLIGHT, GOAL_QUESTION, MEMORY, NARROW_PANE_PROPS, PANE_PROPS, SESSION, bandProps, refusal, world, pill, toOverview, toRoot } from './fixtures'
import { SETUP_BRIEFING, SETUP_FLIGHT, SETUP_STORIES } from './shapes'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

const THEMES: Theme[] = ['dark', 'light']

const GATUS = { id: 117, source: 'gatus', title: 'the page is not well', body: 'gatus says it stopped answering; check the container.', key: 'gatus:answering/the-page', link: '/?view=waiting&notices=open', raisedAt: '2026-10-11T07:26:21Z', handledAt: null }

// What reads below its threshold, in which theme: empty when every word and mark on these cards reads.
function unreadable(found: readonly Ink[]): string[] {
  return THEMES.flatMap(theme =>
    found
      .filter(ink => contrast(ink.color, ink.on, theme) < (ink.isMark ? MARK_RATIO : TEXT_RATIO))
      .map(ink => `${theme}: "${ink.text}" in ${ink.color} on ${ink.on}, ${contrast(ink.color, ink.on, theme).toFixed(2)}:1`))
}

test('the palette: a chip\'s word reads on the chip grey in both themes; amber text does not reach 4.5:1 on light', () => {
  for (const theme of THEMES) {
    expect(contrast(CHIP_WORD, CHIP_BACKGROUND, theme)).toBeGreaterThanOrEqual(TEXT_RATIO)
    expect(contrast('text', 'background', theme)).toBeGreaterThanOrEqual(TEXT_RATIO)
    expect(contrast('suggestion', 'background', theme)).toBeGreaterThanOrEqual(TEXT_RATIO)
    expect(contrast('error', 'background', theme)).toBeGreaterThanOrEqual(TEXT_RATIO)

    // Every colour a dot may take still marks the chip at 3:1.
    for (const tone of ['warning', 'merged', 'error', 'inactive', 'subtle', 'success', 'suggestion']) {
      expect(contrast(tone, CHIP_BACKGROUND, theme)).toBeGreaterThanOrEqual(MARK_RATIO)
    }
  }

  // Why no word on a card that waits is amber: the canvas's own light amber reads 4.08:1 on white.
  expect(contrast('warning', 'background', 'light')).toBeLessThan(TEXT_RATIO)
  expect(Object.keys(PALETTE.dark).sort()).toEqual(Object.keys(PALETTE.light).sort())
})

// THE TONES (Terylon S68; Design · Tokens, 3.1): each tone of Terylon's glossary is one theme key of the host's. Purple is
// the gate, green is done; amber is only ever a mark or a stroke, its word ink at semibold. Every tone's mark reads at
// 3:1 on the pane and on a chip, every tone's word at 4.5:1, in both themes.
const TONES: WordTone[] = ['ok', 'wait', 'bad', 'run', 'gate', 'quiet']

test('the tones: the gate purple, done green, a warning a mark alone at #b56d00, every word and mark readable', () => {
  expect(TONE_KEYS).toEqual({ ok: 'success', wait: 'warning', bad: 'error', run: 'suggestion', gate: 'merged', quiet: 'subtle' })
  expect(WARNING_LIGHT).toBe('#b56d00')
  expect(PALETTE.light.warning).toBe(WARNING_LIGHT)
  expect(wordOf('wait')).toEqual({ color: 'text', weight: 'semibold' })
  expect(TONES.map(tone => wordOf(tone).color)).not.toContain('warning')

  // WHAT WAITS ON THE OWNER'S MERGE, ACCEPTANCE OR APPROVAL IS THE GATE; WHAT ENDED WELL IS DONE.
  expect([KIND_TONES.merge, KIND_TONES.accept, KIND_TONES.plan]).toEqual(['gate', 'gate', 'gate'])
  expect([KIND_TONES.merged, KIND_TONES.accepted]).toEqual(['ok', 'ok'])
  expect(KIND_TONES.question).toBe('wait')

  for (const theme of THEMES) {
    for (const tone of TONES) {
      expect(contrast(markOf(tone), 'background', theme)).toBeGreaterThanOrEqual(MARK_RATIO)
      expect(contrast(markOf(tone), CHIP_BACKGROUND, theme)).toBeGreaterThanOrEqual(MARK_RATIO)
      expect(contrast(wordOf(tone).color, 'background', theme)).toBeGreaterThanOrEqual(TEXT_RATIO)
    }
  }
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: every word and link on the queue's waiting card reads in both themes, closed and open, with its chips`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.briefing = { ...BRIEFING, questionsOpen: [...BRIEFING.questionsOpen, GOAL_QUESTION], storiesBlocked: [{ id: 87, title: 'Plan the export', blockedReason: 'needs your choice' }] }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, surface })
    const closed = strokedCards(await ui.drawn()).flatMap(card => inks(card))
    expect(closed.map(ink => ink.text)).toEqual(expect.arrayContaining(['Waiting for you', 'question', 'merge', 'plan', 'blocked', '●', 'Merge ↗']))
    expect(unreadable(closed)).toEqual([])

    for (const key of ['merge-327', 'plan-41', 'blocked-87']) {
      await ui.press({ key })
    }

    const open = strokedCards(await ui.drawn()).flatMap(card => inks(card))
    // ONLY MERGE AND AN ANSWER LINK OUT (S27): a plan's and a blocked story's acts are on their own cards.
    expect(open.map(ink => ink.text)).toEqual(expect.arrayContaining(['Merge in the console ↗']))
    expect(open.map(ink => ink.text)).not.toContain('Unblock in the console ↗')
    expect(unreadable(open)).toEqual([])
    await ui.unmount()
  })

  test(`${surface}: every word and link on a problem card, a waiting plan, the bell and a story's question reads in both themes`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.notices_list = { unhandled: 1, notices: [GATUS] }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, surface })
    const seen: Ink[] = []
    const look = async () => {
      seen.push(...strokedCards(await ui.drawn()).flatMap(card => inks(card)))
    }

    await pill(ui, 'tab-status')
    await look()
    await pill(ui, 'tab-bell')
    await look()
    await toOverview(ui)
    await ui.press({ key: 'goal-3' })
    await look()
    await toOverview(ui)
    await ui.press({ key: 'story-333' })
    await look()

    expect(seen.map(ink => ink.text)).toEqual(expect.arrayContaining(['1 notice needs you: the page is not well', 'the page is not well', 'Notices in the console ↗', 'Approve starts both stories as the plan orders them.', 'Edit criteria or pick stories in the console ↗', 'Question from the run', 'Answer in the console ↗']))
    // The alert's title on its notice's card alone, in `text`: Health holds a line of it.
    expect(seen.filter(ink => ink.text === 'the page is not well').map(ink => ink.color)).toEqual(['text'])
    expect(unreadable(seen)).toEqual([])
    await ui.unmount()

    // A CALL CLAUDE CODE REFUSED: the red problem card with its title, its reason and its steps.
    terylon.mode.server = 'unclassified'
    await terylon.clock.advance(30000)
    const refused = await $.ui.mount({ ...PANE, surface })
    await toOverview(refused)
    const problem = strokedCards(await refused.drawn()).flatMap(card => inks(card))
    expect(problem.map(ink => ink.text)).toEqual(expect.arrayContaining(["Claude Code refused the pane's call", 'How to fix']))
    expect(unreadable(problem)).toEqual([])
  })
}

test('no card is filled, on any screen: the stroke carries the warning, the pane\'s own background is behind every word', async ($, on) => {
  const terylon = world(on)
  terylon.answers.notices_list = { unhandled: 1, notices: [GATUS] }
  await $.session.start(SESSION)
  await terylon.clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  const noneFilled = async () => {
    const fills = (await ui.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'round').map(box => box.props.backgroundColor)

    expect(fills.length).toBeGreaterThan(0)

    expect(fills.filter(fill => fill !== undefined && ![CARD_FILL, WAITING_TILE_FILL].includes(String(fill)))).toEqual([])
  }

  await noneFilled()
  await ui.press({ key: 'plan-41' })
  await noneFilled()
  await toOverview(ui)
  await noneFilled()
  await ui.press({ key: 'goal-3' })
  await noneFilled()
  await pill(ui, 'tab-status')
  await noneFilled()
})

// THE OWNER'S ACTS (S27) on the cards that wait or warn: a blocked story's, a refusal's, Claude Code's refusal, the
// memory's proposals. The danger word, the struck old text and the new one, the ⚠ mark: each reads in both themes.
for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: every word on the acts' cards reads in both themes, the danger word, the diff and the ⚠ mark included`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.story_get = (args: Record<string, unknown>) => ({ id: args.story, goal: 3, title: 'Memory proposals', state: 'blocked', attempt: 2, pullRequest: null, timeline: [] })
    terylon.answers.work_in_flight = { ...FLIGHT, stories: [FLIGHT.stories[0], { ...FLIGHT.stories[1], state: 'blocked' }] }
    terylon.answers.story_unblock = refusal('Story 329 is running; only a blocked story is unblocked.', 409)
    terylon.answers.memory_get = { ...MEMORY, proposals: [{ id: 5, file: 'owner', action: 'replace', oldText: 'Old text.', text: 'New text.', why: 'Because.', by: 'web:alice@contoso', at: '2026-10-11T19:14:00Z' }] }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, surface })
    const seen: Ink[] = []
    const look = async () => {
      seen.push(...strokedCards(await ui.drawn()).flatMap(card => inks(card)))
    }

    await ui.press({ key: 'story-329' })
    await look()
    await ui.press({ key: 'act-story-329-unblock' })
    await look()
    terylon.mode.server = 'prompted'
    await ui.press({ key: 'act-story-329-unblock' })
    terylon.mode.server = 'up'
    await look()
    await ui.press({ key: 'back' })
    await pill(ui, 'tab-status')
    await look()

    expect(seen.map(ink => ink.text)).toEqual(expect.arrayContaining(['Blocked', 'Abandon…', '✗ Refused (409)', 'Story 329 is running; only a blocked story is unblocked.', '⚠', "Claude Code refused the pane's call to story_unblock", 'Old text.', 'New text.']))
    expect(seen.find(ink => ink.text === 'Abandon…')?.color).toBe('error')
    expect(seen.find(ink => ink.text === '⚠')?.isMark).toBe(true)
    expect(unreadable(seen)).toEqual([])
    await ui.unmount()
  })
}

// NO WORD IS AMBER, ON ANY SURFACE: the host draws `warning` #b56d00 in the light theme, 4.08:1 on white. Every state
// that once drew a word in it is walked here on the desktop, the narrow dock and the terminal, the band and every tab
// with the screens they open, and every word and link drawn anywhere is held to 4.5:1 (3:1 for a mark such as ⚠ or a
// chip's dot) in both themes. Amber stays a stroke or a mark. The status line is one plain string, with no colour.
const PAUSED = { at: '2026-10-11T14:05:00Z', source: 'cockpit', reason: null }

const REPEATING_GOAL = {
  id: 12,
  title: 'Daily forex statistics',
  priority: 2,
  state: 'active',
  storyList: [{ id: 88, title: 'Run 15', state: 'accepted', source: 'routine' }],
  repeating: {
    approved: { version: 1, title: 'Daily forex statistics', runBudgetUsd: 0.5, autoAccept: true },
    waiting: null,
    paused: null,
    runs: [
      { story: 86, run: 'r13', state: 'blocked', startedAt: '2026-10-11T05:00:00Z', costUsd: 0.5, files: [] },
      { story: 85, run: 'r12', state: 'verified', startedAt: '2026-10-10T05:00:00Z', costUsd: 0.2, files: [] },
      { story: 84, run: 'r11', state: 'blocked', startedAt: '2026-10-09T05:00:00Z', costUsd: 0.5, files: [] },
    ],
  },
}

type Walked = {
  name: string
  set: (terylon: ReturnType<typeof world>) => void
  after?: (terylon: ReturnType<typeof world>) => Promise<void>
  paths: string[][]
  typed?: { key: string; text: string }
  words: RegExp[]
  // Words a row's detail carries, which the narrow dock drops.
  details?: RegExp[]
}

const WALKS: Walked[] = [
  {
    name: 'something waits: a stuck story, a held one, questions, a proposed plan, a verified story with its overrun',
    set: terylon => {
      terylon.answers.briefing = { ...BRIEFING, questionsOpen: [...BRIEFING.questionsOpen, GOAL_QUESTION], unhandledNotices: 2 }
      terylon.answers.work_in_flight = { ...FLIGHT, stories: FLIGHT.stories.map(story => (story.id === 333 ? { ...story, stuck: { since: '2026-10-11T15:20:00Z', reason: 'no progress' } } : story)) }
    },
    paths: [['question-9'], ['story-333'], ['merge-327', 'open-story-327'], ['question-606'], ['refresh', 'goal-3'], ['refresh', 'goal-new-open'], ['tab-bell'], ['tab-status', 'fold-memory-owner', 'fold-policy', 'fold-diagnostics']],
    words: [/^\(1 stuck\)$/, /^question 2 of 2$/, /^! files outside the declaration$/],
  },
  {
    name: 'the leader paused',
    set: terylon => {
      terylon.answers.briefing = { ...BRIEFING, leader: { paused: PAUSED } }
      terylon.answers.leader_status = { paused: PAUSED }
    },
    paths: [['tab-status'], ['tab-bell']],
    words: [/^paused since \d\d:\d\d$/, /^paused$/],
  },
  {
    name: 'an alert',
    set: terylon => {
      terylon.answers.notices_list = { unhandled: 1, notices: [GATUS] }
      terylon.answers.briefing = { ...BRIEFING, unhandledNotices: 1 }
    },
    paths: [['tab-status']],
    words: [/^· 1 alert$/, /^1 alert$/],
  },
  {
    name: 'not allowed',
    set: terylon => {
      terylon.mode.server = 'unclassified'
    },
    paths: [['tab-status']],
    words: [/^Claude Code refused the pane's call$/, /^not allowed$/],
  },
  {
    name: 'no server',
    set: terylon => {
      terylon.mode.server = 'missing'
    },
    paths: [['tab-status']],
    words: [/^no terylon server$/, /^no server$/],
  },
  {
    name: 'not answering',
    set: () => undefined,
    after: async terylon => {
      terylon.mode.server = 'down'
      await terylon.clock.advance(30000)
    },
    paths: [['tab-status']],
    words: [/^not answering since \d\d:\d\d$/, /^not answering$/],
  },
  {
    name: "a repeating task's runs that wait for the owner",
    set: terylon => {
      terylon.answers.goals_list = { goals: [{ id: 12, title: 'Daily forex statistics', priority: 2, state: 'active', stories: { accepted: 1 } }], closedCount: 0 }
      terylon.answers.goal_get = (args: Record<string, unknown>) => (args.goal === 12 ? REPEATING_GOAL : { id: args.goal, title: 'Other', priority: 2, state: 'open', storyList: [] })
    },
    paths: [['refresh', 'goal-12']],
    words: [/^(· )?red · waits for you$/, /^(· )?green · waits for you$/],
  },
  {
    name: 'the setup token: its tokens and the phrase, on Waiting, a story and Health',
    set: terylon => {
      terylon.answers.briefing = SETUP_BRIEFING
      terylon.answers.work_in_flight = SETUP_FLIGHT
      terylon.answers.stories_list = SETUP_STORIES
    },
    paths: [['story-333'], ['tab-status']],
    words: [/cost not known/],
  },
  {
    name: 'a new task under a goal, and no open goal at all',
    set: terylon => {
      terylon.answers.goals_list = (args: Record<string, unknown>) => (args.closed === true ? { goals: [] } : { goals: [{ id: 3, title: 'P1 · Agentic OS', priority: 1, state: 'open', stories: {} }], closedCount: 0 })
    },
    paths: [['refresh', 'goal-3', 'fold-add-task']],
    typed: { key: 'quick-add', text: 'Konzole: tlačítko Check now u Health' },
    words: [/^New task$/],
  },
]

for (const [surface, props] of [['desktop', PANE_PROPS], ['narrow dock', NARROW_PANE_PROPS], ['terminal', PANE_PROPS]] as const) {
  for (const walk of WALKS) {
    test(`${surface}: no word is amber, and every word reads in both themes: ${walk.name}`, async ($, on) => {
      const terylon = world(on)
      walk.set(terylon)
      await $.session.start(SESSION)
      await terylon.clock.settle()
      await walk.after?.(terylon)

      const drawnOn = surface === 'terminal' ? 'terminal' : 'desktop'
      const band = await $.ui.mount({ plugin: 'terylon-pane', surface: drawnOn, component: 'AbovePrompt', props: bandProps() })
      const seen: Ink[] = inks(await band.drawn())
      await band.unmount()

      const ui = await $.ui.mount({ ...PANE, props, surface: drawnOn })
      seen.push(...inks(await ui.drawn()))
      await toOverview(ui)
      seen.push(...inks(await ui.drawn()))

      for (const path of walk.paths) {
        // A subject's screen draws ‹ back in place of the pills: walk back to the overview before the next path.
        await toRoot(ui)

        for (const key of path) {
          await ui.press({ key })
          seen.push(...inks(await ui.drawn()))
        }
      }

      if (walk.typed !== undefined) {
        await ui.input(walk.typed)
        seen.push(...inks(await ui.drawn()))
      }

      await ui.unmount()

      // Each state drew what it is walked for, so the check below saw it.
      expect([...walk.words, ...(surface === 'narrow dock' ? [] : walk.details ?? [])].filter(word => !seen.some(ink => word.test(ink.text))).map(String)).toEqual([])

      expect(seen.filter(ink => ink.color === 'warning' && !ink.isMark).map(ink => ink.text)).toEqual([])
      expect(unreadable(seen)).toEqual([])
      expect(terylon.statuses.every(status => typeof status === 'string')).toBe(true)
    })
  }
}
