// THE OWNER'S WALK OF 1.2.0 (2026-10-23): on the waiting card's tint and the problem card's, in dark and worse in light,
// the hints, the links, the chips and an open question's body could not be read. No card is filled any more; these
// tests hold every word and link on a card that waits or warns, and every chip, to WCAG's 4.5:1 (3:1 for a dot) in both
// themes, on the desktop and the terminal. The kit gives the theme keys a drawing names, never the painted colours, so
// the ratio is computed from the S32 canvas's palette in tests/contrast.ts.

import { test, expect } from 'claude-code/testing'

import { CHIP_BACKGROUND, CHIP_WORD } from '../hooks/drawing'

import { MARK_RATIO, PALETTE, TEXT_RATIO, contrast, inks, strokedCards } from './contrast'
import type { Ink, Theme } from './contrast'
import { BRIEFING, GOAL_QUESTION, PANE_PROPS, SESSION, world } from './fixtures'

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
    expect(open.map(ink => ink.text)).toEqual(expect.arrayContaining(['Má mrtvý běh pokračovat od posledního commitu?', 'Answer in the console ↗', 'Merge in the console ↗', 'Unblock in the console ↗']))
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

    expect(seen.map(ink => ink.text)).toEqual(expect.arrayContaining(['the page is not well', 'Bell in the console ↗', 'Approve in the console ↗', 'Rethink ↗', 'notices_list', 'Question from the run', 'Answer in the console ↗']))
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
