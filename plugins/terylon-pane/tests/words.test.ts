// TERYLON'S GLOSSARY, PORTED (Terylon S68): every case of words-cases.json, vendored beside this file from the Terylon
// commit hooks/README.md names, runs against hooks/words.ts and returns its exact text. A case one twin fails is red.
//
// A case names its zone as an IANA name; the pane's words take its own Zone, an offset from UTC. The two names the
// table uses are turned into one here: UTC, and Europe/Prague by the EU's rule (summer time from the last Sunday of
// March to the last Sunday of October, each at 01:00 UTC), so no Intl and no host zone decides a case.

import { test, expect } from 'claude-code/testing'

import * as words from '../hooks/words'
import type { Zone } from '../hooks/queue'

import { WORDS_CASES as CASES } from './words-cases'

type Case = { fn: string; args: unknown[]; out: unknown }

// The functions whose last argument is a zone, at the place the table puts it.
const ZONE_ARGUMENT: Record<string, number> = { clock: 1, date: 1, moment: 2, until: 2, expires: 2, storyEnded: 2, machine: 1 }

// 01:00 UTC on the last Sunday of a month: where the EU changes its clocks.
function lastSundayAtOne(year: number, month: number): number {
  const last = new Date(Date.UTC(year, month + 1, 0, 1, 0, 0))

  return last.getTime() - last.getUTCDay() * 86400000
}

function zoneOf(name: unknown): Zone | undefined {
  if (name === undefined || name === null) {
    return undefined
  }

  if (name === 'UTC') {
    return 0
  }

  if (name === 'Europe/Prague') {
    return (moment: number) => {
      const year = new Date(moment).getUTCFullYear()

      return moment >= lastSundayAtOne(year, 2) && moment < lastSundayAtOne(year, 9) ? -120 : -60
    }
  }

  throw new Error(`the table names a zone this test cannot read: ${String(name)}`)
}

function run(item: Case): unknown {
  const call = (words as unknown as Record<string, (...args: unknown[]) => unknown>)[item.fn]

  if (typeof call !== 'function') {
    throw new Error(`words.ts has no ${item.fn}`)
  }

  const place = ZONE_ARGUMENT[item.fn]
  const args = place === undefined ? item.args : item.args.map((value, index) => (index === place ? zoneOf(value) : value))

  return call(...args)
}

const TABLE = CASES as unknown as { version: number; cases: Case[] }

test('the vendored table is version 1 and holds the cases the console holds', () => {
  expect(TABLE.version).toBe(1)
  expect(TABLE.cases.length).toBeGreaterThan(150)
})

test('every case of words-cases.json passes: the exact text, the exact state word and tone', () => {
  const failed = TABLE.cases
    .map(item => ({ item, got: run(item) }))
    .filter(({ item, got }) => JSON.stringify(got) !== JSON.stringify(item.out))
    .map(({ item, got }) => `${item.fn}(${JSON.stringify(item.args)}) = ${JSON.stringify(got)}, not ${JSON.stringify(item.out)}`)

  expect(failed).toEqual([])
})

test('every function of the table is in words.ts, and every case calls one', () => {
  const named = [...new Set(TABLE.cases.map(item => item.fn))]

  expect(named.filter(name => typeof (words as unknown as Record<string, unknown>)[name] !== 'function')).toEqual([])
  expect(named).toEqual(expect.arrayContaining(['tokens', 'cost', 'moment', 'duration', 'ref', 'storyState', 'machine']))
})

test('the formats the pane draws: "48 k tokens", "29 Oct 16:10", "1 h 9 min", and never a $ on the setup token', () => {
  const prague = zoneOf('Europe/Prague')

  expect(words.tokens(48033)).toBe('48 k tokens')
  expect(words.moment('2026-10-29T15:10:00Z', '2026-11-01T09:00:00Z', prague)).toBe('29 Oct 16:10')
  expect(words.duration(4140)).toBe('1 h 9 min')
  expect(words.cost({ costKnown: false, costUsd: 0, tokens: 48033 })).toBe('48 k tokens · cost not known on the setup token')
  expect(words.cost({ costKnown: false, costUsd: 0, tokens: 0 }, { tight: true })).toBe('cost not known')
  expect(words.cost({ costKnown: true, costUsd: 0 }, { basis: 'setup-token' })).not.toContain('$')
})

test("the pane's own: a ref where Terylon sends one, #id where it does not, and Czech tokens", () => {
  expect(words.refOr({ ref: 'S-TWK6D' }, 110)).toBe('S-TWK6D')
  expect(words.refOr({}, 110)).toBe('#110')
  expect(words.refOr({ ref: '' }, 110)).toBe('#110')
  expect(words.tokensCzech(66000)).toBe('66 k tokenů')
  expect(words.tokensCzech(1)).toBe('1 token')
  expect(words.tokensCzech(3)).toBe('3 tokeny')
  expect(words.tokensCzech(850)).toBe('850 tokenů')
})
