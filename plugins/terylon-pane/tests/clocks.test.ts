// A MOMENT IS DRAWN IN ITS OWN OFFSET. Prague moves from UTC+2 to UTC+1 at 01:00 UTC on 25 October 2026: a run, a
// notice or a merge from before the change keeps the hour it had, and "today" is read in today's offset. The runner
// is UTC and `plugin test` ignores TZ, so the zone is handed to the pure functions as the pane hands them its own.

import { test, expect } from 'claude-code/testing'

import { clock, doneTodayItems, repeatingOf, runDay, when } from '../hooks/queue'

import { BASE } from './fixtures'

// Europe/Prague in 2026, as getTimezoneOffset gives it: -120 in summer time, -60 outside it.
function prague(moment: number): number {
  return moment >= Date.parse('2026-03-29T01:00:00Z') && moment < Date.parse('2026-10-25T01:00:00Z') ? -120 : -60
}

// After the change, in winter time: 22:00 in Prague on 28 October.
const NOW = Date.parse('2026-10-28T21:00:00Z')

test('runDay draws a run from before the change of clocks at the hour it had, and one after at its own', () => {
  expect(runDay('2026-10-24T05:00:00Z', NOW, prague)).toBe('24 Oct 07:00')
  expect(runDay('2026-10-26T05:00:00Z', NOW, prague)).toBe('26 Oct 06:00')
  expect(runDay('2026-10-28T05:00:00Z', NOW, prague)).toBe('Today 06:00')
  // The night of the change: 00:30 UTC is 02:30 summer time, 01:30 UTC is 02:30 winter time, both on the 25th.
  expect(runDay('2026-10-25T00:30:00Z', NOW, prague)).toBe('25 Oct 02:30')
  expect(runDay('2026-10-25T01:30:00Z', NOW, prague)).toBe('25 Oct 02:30')
})

test('"today" is read in each moment\'s own offset on the day of the change', () => {
  const evening = Date.parse('2026-10-25T20:00:00Z')

  // 23:30 UTC on the 24th is 01:30 on the 25th in summer time: today, seen from the evening of the 25th.
  expect(runDay('2026-10-24T23:30:00Z', evening, prague)).toBe('Today 01:30')
  expect(when('2026-10-24T23:30:00Z', evening, prague)).toBe('01:30')
})

test('repeatingOf gives every run its own offset', () => {
  const repeating = repeatingOf({ id: 12, repeating: { approved: { version: 1 }, runs: [
    { story: 2, state: 'accepted', startedAt: '2026-10-28T05:00:00Z' },
    { story: 1, state: 'accepted', startedAt: '2026-10-24T05:00:00Z' },
  ] } }, BASE, NOW, prague)

  expect(repeating?.runs.map(run => run.day)).toEqual(['Today 06:00', '24 Oct 07:00'])
})

test('clock, when and done today draw a moment from before the change of clocks at the hour it had', () => {
  expect(clock('2026-10-24T05:00:00Z', prague)).toBe('07:00')
  expect(clock('2026-10-26T05:00:00Z', prague)).toBe('06:00')
  expect(when('2026-10-24T05:00:00Z', NOW, prague)).toBe('24. 10.')

  const sunday = Date.parse('2026-10-25T21:00:00Z')
  const done = doneTodayItems([{ id: 7, title: 'Merged before the change', state: 'merged', updatedAt: '2026-10-25T00:30:00Z', costUsd: 1 }], sunday, prague)
  expect(done.map(item => item.detail)).toEqual([expect.stringContaining('02:30')])
})

test('a fixed offset still works as it did', () => {
  expect(clock('2026-10-24T05:00:00Z', -120)).toBe('07:00')
  expect(runDay('2026-10-24T05:00:00Z', NOW, -60)).toBe('24 Oct 06:00')
})
