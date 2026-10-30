// THE OWNER'S WALK OF 1.2.0 (2026-10-23): on the waiting card's tint and the problem card's, in dark and worse in light,
// the hints, the links, the chips and an open question's body could not be read. No card is filled any more; these
// tests hold every word and link on a card that waits or warns, and every chip, to WCAG's 4.5:1 (3:1 for a dot) in both
// themes, on the desktop and the terminal. The kit gives the theme keys a drawing names, never the painted colours, so
// the ratio is computed from the S32 canvas's palette in tests/contrast.ts.

import { test, expect } from 'claude-code/testing'

import { CHIP_BACKGROUND, CHIP_WORD } from '../hooks/drawing'

import { MARK_RATIO, PALETTE, TEXT_RATIO, contrast, inks, strokedCards } from './contrast'
import type { Ink, Theme } from './contrast'
import { BRIEFING, FLIGHT, GOAL_QUESTION, MEMORY, NARROW_PANE_PROPS, PANE_PROPS, SESSION, bandProps, refusal, world } from './fixtures'

const PANE = { plugin: 'terylon-pane', component: 'Pane', requestId: 'terylon', props: PANE_PROPS } as const

const THEMES: Theme[] = ['dark', 'light']

const GATUS = { id: 117, source: 'gatus', title: 'the page is not well', body: 'gatus says it stopped answering; check the container.', key: 'gatus:answering/the-page', link: '/?cockpit=bell', raisedAt: '2026-10-11T07:26:21Z', handledAt: null }

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

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: every word and link on the queue's waiting card reads in both themes, closed and open, with its chips`, async ($, on) => {
    const terylon = world(on)
    terylon.answers.briefing = { ...BRIEFING, questionsOpen: [...BRIEFING.questionsOpen, GOAL_QUESTION], storiesBlocked: [{ id: 87, title: 'Plan the export', blockedReason: 'needs your choice' }] }
    await $.session.start(SESSION)
    await terylon.clock.settle()

    const ui = await $.ui.mount({ ...PANE, surface })
    const closed = strokedCards(await ui.drawn()).flatMap(card => inks(card))
    expect(closed.map(ink => ink.text)).toEqual(expect.arrayContaining(['Waiting for you', 'question', 'merge', 'plan', 'blocked', '●']))
    expect(unreadable(closed)).toEqual([])

    for (const key of ['question-9', 'merge-327', 'plan-41', 'blocked-87']) {
      await ui.press({ key })
    }

    const open = strokedCards(await ui.drawn()).flatMap(card => inks(card))
    // ONLY MERGE AND AN ANSWER LINK OUT (S27): a plan's and a blocked story's acts are on their own cards.
    expect(open.map(ink => ink.text)).toEqual(expect.arrayContaining(['Má mrtvý běh pokračovat od posledního commitu?', 'Answer in the console ↗', 'Merge in the console ↗']))
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

    await ui.press({ key: 'tab-status' })
    await look()
    await ui.press({ key: 'tab-goals' })
    await look()
    await ui.press({ key: 'tab-bell' })
    await ui.press({ key: 'notice-117' })
    await look()
    await ui.press({ key: 'tab-queue' })
    await ui.press({ key: 'story-333' })
    await look()

    expect(seen.map(ink => ink.text)).toEqual(expect.arrayContaining(['the page is not well', 'Bell in the console ↗', 'Approve starts both stories as the plan orders them.', 'Edit criteria or pick stories in the console ↗', 'notices_list', 'Question from the run', 'Answer in the console ↗']))
    // The alert's title on its problem card in `error`; as a row on the Bell, a title in `text`.
    expect(seen.filter(ink => ink.text === 'the page is not well').map(ink => ink.color)).toEqual(['error', 'text'])
    expect(unreadable(seen)).toEqual([])
    await ui.unmount()

    // A CALL CLAUDE CODE REFUSED: the red problem card with its title, its reason and its steps.
    terylon.mode.server = 'unclassified'
    await terylon.clock.advance(30000)
    const refused = await $.ui.mount({ ...PANE, surface })
    await refused.press({ key: 'tab-queue' })
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

  for (const key of ['tab-queue', 'question-9', 'tab-goals', 'tab-bell', 'tab-memory', 'tab-status']) {
    await ui.press({ key })
    expect((await ui.findAll({ type: 'Box' })).filter(box => box.props.borderStyle === 'round' && box.props.backgroundColor !== undefined)).toEqual([])
  }
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
    await $.command.run({ command: 'terylon-memory', args: '' } as never)
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
    paths: [['tab-queue', 'question-9'], ['tab-queue', 'story-333'], ['tab-queue', 'merge-327', 'open-story-327'], ['tab-queue', 'question-606', 'answer-606'], ['tab-goals', 'goal-3'], ['tab-bell'], ['tab-memory'], ['tab-status']],
    words: [/^\(1 stuck\)$/, /^question 2 of 2$/, /^! files outside the declaration$/],
    details: [/^tvoje volba$/, /^1 question$/],
  },
  {
    name: 'the leader paused',
    set: terylon => {
      terylon.answers.briefing = { ...BRIEFING, leader: { paused: PAUSED } }
      terylon.answers.leader_status = { paused: PAUSED }
    },
    paths: [['tab-queue'], ['tab-bell'], ['tab-status']],
    words: [/^paused since \d\d:\d\d$/, /^paused$/],
  },
  {
    name: 'an alert',
    set: terylon => {
      terylon.answers.notices_list = { unhandled: 1, notices: [GATUS] }
      terylon.answers.briefing = { ...BRIEFING, unhandledNotices: 1 }
    },
    paths: [['tab-bell'], ['tab-status']],
    words: [/^· 1 alert$/, /^1 alert$/],
  },
  {
    name: 'not allowed',
    set: terylon => {
      terylon.mode.server = 'unclassified'
    },
    paths: [['tab-queue'], ['tab-status']],
    words: [/^Claude Code refused the pane's call$/, /^not allowed$/],
  },
  {
    name: 'no server',
    set: terylon => {
      terylon.mode.server = 'missing'
    },
    paths: [['tab-queue'], ['tab-status']],
    words: [/^no terylon server$/, /^no server$/],
  },
  {
    name: 'not answering',
    set: () => undefined,
    after: async terylon => {
      terylon.mode.server = 'down'
      await terylon.clock.advance(30000)
    },
    paths: [['tab-queue'], ['tab-status']],
    words: [/^not answering since \d\d:\d\d$/, /^not answering$/],
  },
  {
    name: "a repeating task's runs that wait for the owner",
    set: terylon => {
      terylon.answers.goals_list = { goals: [{ id: 12, title: 'Daily forex statistics', priority: 2, state: 'active', stories: { accepted: 1 } }], closedCount: 0 }
      terylon.answers.goal_get = (args: Record<string, unknown>) => (args.goal === 12 ? REPEATING_GOAL : { id: args.goal, title: 'Other', priority: 2, state: 'open', storyList: [] })
    },
    paths: [['tab-goals', 'goal-12']],
    words: [/^(· )?red · waits for you$/, /^(· )?green · waits for you$/],
  },
  {
    name: 'a new task with no open goal to add it to',
    set: terylon => {
      terylon.answers.goals_list = { goals: [], closedCount: 0 }
    },
    paths: [['tab-queue']],
    typed: { key: 'quick-add', text: 'Konzole: tlačítko Check now u Health' },
    words: [/^No open goal: add a goal on the Goals tab, then the task\.$/],
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

      for (const path of walk.paths) {
        // A subject's screen draws ‹ back in place of the tabs: walk back to them before the next path.
        while ((await ui.find({ key: 'tab-queue' })) === undefined && (await ui.find({ key: 'back' })) !== undefined) {
          await ui.press({ key: 'back' })
        }

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
