// Terylon's glossary (Terylon S66; Design · Glossary), ported from the console's design/words.js: one word for every
// figure and state, one short id for every subject. Vendored: hooks/README.md names the Terylon commit it came from,
// and tests/words.test.ts runs every case of tests/words-cases.json, the table the console and the server run too.
//
// Pure: no $, no clock of its own, no Intl. 'now' and the zone are passed; the zone is the pane's own Zone (a fixed
// offset from UTC in minutes, or the offset at each moment), where words.js takes an IANA name. A zone left out is UTC.

import type { Zone } from './queue'

const MILLISECONDS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const SECONDS_PER_DAY = 86400
const MILLISECONDS_PER_DAY = SECONDS_PER_DAY * MILLISECONDS_PER_SECOND

// Under this many seconds, a moment that has passed is "just now".
const JUST_NOW_SECONDS = 10

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

// THE SETUP TOKEN HAS NO PRICE: the tokens are said, and this beside them, never a $.
export const COST_NOT_KNOWN = 'cost not known on the setup token'
export const COST_NOT_KNOWN_TIGHT = 'cost not known'
export const SETUP_TOKEN = 'setup-token'

// THE SHORT REF: a kind letter, a hyphen and five Crockford base-32 characters, the GUID's last 25 bits.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const REF_CHARACTERS = 5
const REF_BITS_PER_CHARACTER = 5
const KIND_LETTERS: Record<string, string> = { story: 'S', goal: 'G', plan: 'P', run: 'R' }
const REF_PATTERN = /^([SGPR])-([0-9A-Z]{5})$/

// A typed ref is read the way Crockford says: I and L are 1, O is 0, and U is no character at all.
const CROCKFORD_READS: Record<string, string> = { I: '1', L: '1', O: '0' }

export type WordTone = 'ok' | 'wait' | 'bad' | 'run' | 'gate' | 'quiet'

export type StateWord = { word: string; tone: WordTone }

const STORY_WORDS: Record<string, [string, WordTone]> = {
  proposed: ['Proposed', 'quiet'],
  approved: ['Not started', 'quiet'],
  dispatched: ['Given a slot', 'run'],
  'pr-open': ['PR open', 'run'],
  blocked: ['Blocked', 'bad'],
  abandoned: ['Abandoned', 'quiet'],
}

const PLAN_WORDS: Record<string, [string, WordTone]> = {
  proposed: ['To approve', 'gate'],
  rethink: ['To rethink', 'wait'],
  approved: ['Approved', 'ok'],
  withdrawn: ['Withdrawn', 'quiet'],
}

const GOAL_WORDS: Record<string, [string, WordTone]> = {
  open: ['Open', 'run'],
  active: ['Open', 'run'],
  done: ['Done', 'ok'],
  dropped: ['Dropped', 'quiet'],
}

type Json = Record<string, unknown>

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many
}

// "7 674": thousands set apart by one space.
export function count(value: unknown): string {
  const whole = isNumber(value) ? Math.round(value) : 0

  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

// "5 100 / 6 000".
export function share(part: unknown, whole: unknown): string {
  return `${count(part)} / ${count(whole)}`
}

// "850 tokens", "48 k tokens", "1.4 M tokens": k rounded, M to one decimal, in whole numbers so no twin rounds apart.
export function tokens(value: unknown): string {
  const whole = isNumber(value) && value > 0 ? Math.round(value) : 0

  if (whole < 1000) {
    return `${whole} ${plural(whole, 'token', 'tokens')}`
  }

  const thousands = Math.floor((whole + 500) / 1000)

  if (thousands < 1000) {
    return `${thousands} k tokens`
  }

  const tenths = Math.floor((whole + 50000) / 100000)

  return `${Math.floor(tenths / 10)}.${tenths % 10} M tokens`
}

// "48 033 tokens": the exact figure, for a tooltip.
export function tokensExact(value: unknown): string {
  const whole = isNumber(value) && value > 0 ? Math.round(value) : 0

  return `${count(whole)} ${plural(whole, 'token', 'tokens')}`
}

function cents(value: unknown): number {
  return Math.round((isNumber(value) ? value : 0) * 100)
}

function centsWords(amount: number): string {
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`
}

// "$0.38": two decimals under $100, whole dollars from there.
export function money(value: unknown): string {
  const amount = cents(value)

  return amount >= 10000 ? `$${count(Math.round(amount / 100))}` : `$${centsWords(amount)}`
}

// "$100", "$2", "$2.50": a budget is whole when it is whole.
export function budget(value: unknown): string {
  const amount = cents(value)

  return amount % 100 === 0 || amount >= 10000 ? `$${count(Math.round(amount / 100))}` : `$${centsWords(amount)}`
}

// "~$0.30", "~$11", "under $0.01", or "no estimate": never "~$0".
export function estimate(value: unknown): string {
  if (!isNumber(value) || value <= 0) {
    return 'no estimate'
  }

  const amount = cents(value)

  if (amount < 1) {
    return 'under $0.01'
  }

  return amount < 100 ? `~$${centsWords(amount)}` : `~$${count(Math.round(amount / 100))}`
}

export type CostItem = { costKnown?: unknown; costUsd?: unknown; tokens?: unknown } | null | undefined

export type CostOptions = { basis?: string | null; budget?: number | null; tight?: boolean }

// WHAT SOMETHING COST: "$1.25 of $25", or its tokens and that the cost is not known, on the setup token or where the
// item says it is not known. The basis wins: a sum on the setup token is not known whatever it summed.
export function cost(item: CostItem, options: CostOptions = {}): string {
  const known = item !== null && item !== undefined && item.costKnown !== false && options.basis !== SETUP_TOKEN

  if (!known) {
    const phrase = options.tight === true ? COST_NOT_KNOWN_TIGHT : COST_NOT_KNOWN
    const spent = item !== null && item !== undefined && isNumber(item.tokens) && item.tokens > 0 ? `${tokens(item.tokens)} · ` : ''

    return `${spent}${phrase}`
  }

  return `${money(item?.costUsd)}${isNumber(options.budget) && options.budget > 0 ? ` of ${budget(options.budget)}` : ''}`
}

// "$100 a day", and on the setup token that it is not applied.
export function dailyBudget(value: unknown, basis: string | null): string {
  return `${budget(value)} a day${basis === SETUP_TOKEN ? ' · not applied on the setup token' : ''}`
}

// "6 h a story": the leader's limit on the setup token is its hours.
export function storyHours(hours: unknown): string {
  return `${count(hours)} h a story`
}

// "0 of 2 slots": what can run now.
export function slots(free: number, capacity: number): string {
  return `${count(free)} of ${count(capacity)} ${plural(capacity, 'slot', 'slots')}`
}

// "4 stories at once", and the host's own number beside it when it holds fewer.
export function storiesAtOnce(policy: number, capacity: number | null): string {
  const said = `${count(policy)} ${plural(policy, 'story', 'stories')} at once`

  return isNumber(capacity) && capacity < policy ? `${said} · ${count(capacity)} ${plural(capacity, 'slot', 'slots')} on this host` : said
}

// ---------------------------------------------------------------------------------------------------------- time

type Fields = { year: number; month: number; day: number; hour: number; minute: number }

function instant(at: unknown): number | null {
  const moment = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(String(at ?? ''))

  return Number.isFinite(moment) ? moment : null
}

function offsetAt(zone: Zone | undefined, moment: number): number {
  const offset = zone === undefined ? 0 : typeof zone === 'function' ? zone(moment) : zone

  return Number.isFinite(offset) ? offset : 0
}

// The calendar fields of an instant in a zone, as getTimezoneOffset counts it: minutes behind UTC, east negative.
function fields(moment: number, zone: Zone | undefined): Fields {
  const local = new Date(moment - offsetAt(zone, moment) * 60000)

  return { year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate(), hour: local.getUTCHours(), minute: local.getUTCMinutes() }
}

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

function dayNumber(parts: Fields): number {
  return Math.round(Date.UTC(parts.year, parts.month - 1, parts.day) / MILLISECONDS_PER_DAY)
}

function monthOf(parts: Fields): string {
  return MONTHS[parts.month - 1] ?? '?'
}

// "08:23", 24 h.
export function clock(at: unknown, zone?: Zone): string {
  const moment = instant(at)

  if (moment === null) {
    return ''
  }

  const parts = fields(moment, zone)

  return `${twoDigits(parts.hour)}:${twoDigits(parts.minute)}`
}

// "1 Nov 2027".
export function date(at: unknown, zone?: Zone): string {
  const moment = instant(at)

  if (moment === null) {
    return ''
  }

  const parts = fields(moment, zone)

  return `${parts.day} ${monthOf(parts)} ${parts.year}`
}

// How many days `at` lies before `now` in the zone: 0 today, 1 yesterday, negative ahead.
export function daysBefore(at: unknown, now: unknown, zone?: Zone): number | null {
  const moment = instant(at)
  const reference = instant(now)

  return moment === null || reference === null ? null : dayNumber(fields(reference, zone)) - dayNumber(fields(moment, zone))
}

// "today 08:23", "yesterday 22:02", "29 Oct 16:10", "29 Oct 2025".
export function moment(at: unknown, now: unknown, zone?: Zone): string {
  const when = instant(at)
  const reference = instant(now)

  if (when === null || reference === null) {
    return ''
  }

  const parts = fields(when, zone)
  const today = fields(reference, zone)
  const days = dayNumber(today) - dayNumber(parts)
  const time = `${twoDigits(parts.hour)}:${twoDigits(parts.minute)}`

  if (days === 0) {
    return `today ${time}`
  }

  if (days === 1) {
    return `yesterday ${time}`
  }

  return parts.year === today.year ? `${parts.day} ${monthOf(parts)} ${time}` : `${parts.day} ${monthOf(parts)} ${parts.year}`
}

function secondsBetween(at: unknown, now: unknown): number | null {
  const when = instant(at)
  const reference = instant(now)

  return when === null || reference === null ? null : Math.floor((reference - when) / MILLISECONDS_PER_SECOND)
}

// The largest unit alone: "40 min", "9 h", "2 d".
function largestUnit(seconds: number): string {
  if (seconds < SECONDS_PER_HOUR) {
    return `${Math.floor(seconds / SECONDS_PER_MINUTE)} min`
  }

  return seconds < SECONDS_PER_DAY ? `${Math.floor(seconds / SECONDS_PER_HOUR)} h` : `${Math.floor(seconds / SECONDS_PER_DAY)} d`
}

// "just now", "12 s ago", "40 min ago", "9 h ago", "2 d ago".
export function ago(at: unknown, now: unknown): string {
  const seconds = secondsBetween(at, now)

  if (seconds === null) {
    return ''
  }

  if (seconds < JUST_NOW_SECONDS) {
    return 'just now'
  }

  return seconds < SECONDS_PER_MINUTE ? `${seconds} s ago` : `${largestUnit(seconds)} ago`
}

// How long something has waited: "40 min", "9 h", "2 d".
export function waited(at: unknown, now: unknown): string {
  const seconds = secondsBetween(at, now)

  return seconds === null ? '' : largestUnit(Math.max(0, seconds))
}

// "14 s", "42 min", "1 h 9 min", "3 d 4 h": two units at most, never a zero second one.
export function duration(totalSeconds: unknown): string {
  const seconds = isNumber(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0

  if (seconds < SECONDS_PER_MINUTE) {
    return `${seconds} s`
  }

  if (seconds < SECONDS_PER_HOUR) {
    return `${Math.floor(seconds / SECONDS_PER_MINUTE)} min`
  }

  if (seconds < SECONDS_PER_DAY) {
    const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE)

    return `${Math.floor(seconds / SECONDS_PER_HOUR)} h${minutes > 0 ? ` ${minutes} min` : ''}`
  }

  const hours = Math.floor((seconds % SECONDS_PER_DAY) / SECONDS_PER_HOUR)

  return `${Math.floor(seconds / SECONDS_PER_DAY)} d${hours > 0 ? ` ${hours} h` : ''}`
}

// "until today 09:36".
export function until(at: unknown, now: unknown, zone?: Zone): string {
  return `until ${moment(at, now, zone)}`
}

// "expires in 364 days · 1 Nov 2027", "expires today 16:00", "expired yesterday 16:00".
export function expires(at: unknown, now: unknown, zone?: Zone): string {
  const seconds = secondsBetween(now, at)

  if (seconds === null) {
    return ''
  }

  if (seconds < 0) {
    return `expired ${moment(at, now, zone)}`
  }

  const days = Math.floor(seconds / SECONDS_PER_DAY)

  return days < 1 ? `expires ${moment(at, now, zone)}` : `expires in ${days} ${plural(days, 'day', 'days')} · ${date(at, zone)}`
}

// ----------------------------------------------------------------------------------------------------------- ids

// "S-BD6XS" from a subject's kind and GUID.
export function ref(kind: string, guid: unknown): string | null {
  const letter = KIND_LETTERS[kind]
  const hex = String(guid ?? '').replace(/-/g, '')

  if (letter === undefined || !/^[0-9a-fA-F]{32}$/.test(hex)) {
    return null
  }

  let value = parseInt(hex.slice(-8), 16) & ((1 << (REF_CHARACTERS * REF_BITS_PER_CHARACTER)) - 1)
  let characters = ''

  for (let index = 0; index < REF_CHARACTERS; index += 1) {
    characters = `${CROCKFORD[value & 31] ?? '0'}${characters}`
    value >>>= REF_BITS_PER_CHARACTER
  }

  return `${letter}-${characters}`
}

// A ref as someone typed it, in any case, read the Crockford way; null when it is not one.
export function parseRef(typed: unknown): string | null {
  const read = String(typed ?? '').trim().toUpperCase().replace(/[ILO]/g, character => CROCKFORD_READS[character] ?? character)
  const match = REF_PATTERN.exec(read)

  return match !== null && [...(match[2] ?? '')].every(character => CROCKFORD.includes(character)) ? read : null
}

// One function names a subject: its ref, or, from an answer older than refs, its kind and number.
export function subject(item: Json | null | undefined, kind = 'story'): string {
  if (item !== null && item !== undefined && typeof item.ref === 'string' && item.ref !== '') {
    return item.ref
  }

  return `${kind} ${item !== null && item !== undefined && item.id !== undefined ? String(item.id) : ''}`
}

// "ADO #n ↗": a work item is only ever a labelled link, never a story's name.
export function workItem(value: unknown): string {
  return `ADO #${String(value)} ↗`
}

export function pullRequest(value: unknown): string {
  return `PR ${String(value)}`
}

export function pullRequestLink(value: unknown): string {
  return `PR ${String(value)} ↗`
}

// -------------------------------------------------------------------------------------------------------- states

function capitalised(code: unknown): string {
  const words = String(code ?? '').replace(/-/g, ' ')

  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

function pullRequestId(story: Json): unknown {
  const pull = story.pullRequest

  return pull !== null && typeof pull === 'object' && (pull as Json).id ? (pull as Json).id : null
}

// Whether its end is accepted rather than merged: a list story, nothing to change, or no pull request at all.
function acceptedLike(story: Json): boolean {
  return story.target === 'list' || story.nothingToChange === true || pullRequestId(story) === null
}

// THE ONE WORD FOR A STORY'S STATE, and its tone (Design · States). The chip and the heading both call this: a merged
// story with no pull request is Accepted on every surface, and Merged is said only beside its PR.
export function storyState(story: Json | null | undefined): StateWord {
  const item = story ?? {}
  const code = String(item.state ?? '')
  const fixed = STORY_WORDS[code]

  if (fixed !== undefined) {
    return { word: fixed[0], tone: fixed[1] }
  }

  switch (code) {
    case 'running':
      return { word: isNumber(item.run) ? `Running · run ${item.run}` : 'Running', tone: 'run' }
    case 'verifying':
      return { word: `Verifying in ${typeof item.environment === 'string' && item.environment !== '' ? item.environment : `pr-${String(pullRequestId(item))}`}`, tone: 'run' }
    case 'verified': {
      const verdict = item.verdict

      if (verdict !== null && typeof verdict === 'object' && (verdict as Json).green === false) {
        return { word: 'Red · waits for you', tone: 'wait' }
      }

      return { word: acceptedLike(item) ? 'Ready to accept' : 'Ready to merge', tone: 'gate' }
    }
    case 'merged':
      return { word: acceptedLike(item) ? 'Accepted' : 'Merged', tone: 'ok' }
    case 'accepted':
      return { word: 'Accepted', tone: 'ok' }
    default:
      return { word: capitalised(code), tone: 'quiet' }
  }
}

// THE ENDED LINE, the heading on an ended story's screen: "Merged by you · PR n ↗ · today 20:17", built on the same
// word as its chip; null while it has not ended.
export function storyEnded(story: Json | null | undefined, now: unknown, zone?: Zone): string | null {
  const item = story ?? {}

  if (!['merged', 'accepted', 'abandoned'].includes(String(item.state ?? ''))) {
    return null
  }

  const word = storyState(item).word
  const parts = [`${word}${item.endedByOwner === true ? ' by you' : ''}`]

  if (word === 'Merged') {
    parts.push(pullRequestLink(pullRequestId(item)))
  }

  if (item.endedAt !== undefined && item.endedAt !== null && item.endedAt !== '') {
    parts.push(moment(item.endedAt, now, zone))
  }

  return parts.join(' · ')
}

function fromTable(table: Record<string, [string, WordTone]>, code: unknown): StateWord {
  const fixed = table[String(code ?? '')]

  return fixed !== undefined ? { word: fixed[0], tone: fixed[1] } : { word: capitalised(code), tone: 'quiet' }
}

export function planState(code: unknown): StateWord {
  return fromTable(PLAN_WORDS, code)
}

export function goalState(code: unknown): StateWord {
  return fromTable(GOAL_WORDS, code)
}

export type MachineFacts = { warnings?: number; failing?: number; pausedSince?: unknown; silentSince?: unknown }

// The machine in one phrase: "all well", "1 warning", "2 failing", "leader paused since 16:40", "not answering since 16:52".
export function machine(state: MachineFacts | null | undefined, zone?: Zone): string {
  const facts = state ?? {}

  if (facts.silentSince !== undefined && facts.silentSince !== null && facts.silentSince !== '') {
    return `not answering since ${clock(facts.silentSince, zone)}`
  }

  if (facts.pausedSince !== undefined && facts.pausedSince !== null && facts.pausedSince !== '') {
    return `leader paused since ${clock(facts.pausedSince, zone)}`
  }

  if ((facts.failing ?? 0) > 0) {
    return `${count(facts.failing)} failing`
  }

  return (facts.warnings ?? 0) > 0 ? `${count(facts.warnings)} ${plural(facts.warnings ?? 0, 'warning', 'warnings')}` : 'all well'
}

// --------------------------------------------------------------------------------------------- the pane's own uses

// A SUBJECT'S NAME WHERE THE PANE SHOWS ITS NUMBER TODAY: its ref, or a hash and its number from a Terylon older than refs.
export function refOr(item: Json | null | undefined, id: unknown): string {
  return item !== null && item !== undefined && typeof item.ref === 'string' && item.ref.trim() !== '' ? item.ref : `#${String(id ?? '')}`
}

// A Czech prompt's tokens: "66 k tokenů", "1 token", "3 tokeny".
export function tokensCzech(value: unknown): string {
  const said = tokens(value)
  const whole = isNumber(value) && value > 0 ? Math.round(value) : 0

  if (whole >= 1000) {
    return said.replace(/ tokens$/, ' tokenů')
  }

  return said.replace(/ tokens?$/, whole === 1 ? ' token' : whole >= 2 && whole <= 4 ? ' tokeny' : ' tokenů')
}
