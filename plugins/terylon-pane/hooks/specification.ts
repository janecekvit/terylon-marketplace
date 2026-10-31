// A goal's specification (Terylon S53), shaped for drawing and checked before it is sent: the .md files a folder
// holds, the caps Terylon holds a specification to, and goal_get's `specification` and `decisions` as the goal's
// card draws them. Pure: no $, so a test reads it without a session.
//
//   $.fs.list ──▶ markdownFilesOf ──▶ + name · size ──press──▶ attached ──Add goal / Save──▶ $.fs.read each, whole
//                                                                              │ specificationProblem: 1–10, names, 200,000
//                                                                              ▼
//                                                          goal_add / tasks_add `specification`, spec_revise {basedOn}

import type { PaneSpecFile, PaneSpecification } from '../types'

import { COPY } from './copy'
import { list, number, offsetAt, runDay, text } from './queue'
import type { Zone } from './queue'

type Json = Record<string, unknown>

// A FILE NAME TERYLON TAKES (SPECIFICATION_SCHEMA): a letter or a digit first, at most 80 characters, ending in .md.
export const SPEC_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,76}\.md$/

// A FILE THE FOLDER LIST OFFERS: any name that ends in .md, whatever its case; a name Terylon refuses is said on send.
const MARKDOWN_FILE = /\.md$/i

// HOW MANY FILES, AND HOW MANY CHARACTERS IN ALL, a specification carries at most.
export const SPEC_FILES_MOST = 10
export const SPEC_CHARACTERS_MOST = 200000

// The path a file of `folder` is read from: the folder as the owner typed it, relative to the session or absolute.
export function pathIn(folder: string, name: string): string {
  const trimmed = folder.trim().replace(/[\\/]+$/, '')

  return trimmed === '' || trimmed === '.' ? name : `${trimmed}/${name}`
}

// The .md files $.fs.list answered for `folder`, by name: a file alone, never a directory or a link.
export function markdownFilesOf(entries: unknown, folder: string): PaneSpecFile[] {
  return list(entries)
    .filter(entry => entry.kind === 'file' && entry.isLink !== true && typeof entry.name === 'string' && MARKDOWN_FILE.test(entry.name))
    .map(entry => ({ name: String(entry.name), path: pathIn(folder, String(entry.name)), bytes: Math.max(0, number(entry.size) ?? 0) }))
    .sort((first, second) => (first.name < second.name ? -1 : first.name > second.name ? 1 : 0))
}

// ONE FILE OF A NAME: a file attached again, or one of the same name from another folder, takes the place of the first.
export function attach(attached: readonly PaneSpecFile[], file: PaneSpecFile): PaneSpecFile[] {
  return [...attached.filter(item => item.name !== file.name), file]
}

// "1,204": a whole number with its thousands apart, by hand, so the host's locale changes nothing.
function grouped(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// A file's size on disk, as $.fs.list counts it: "812 B", "4.2 KB", "1.3 MB".
export function bytesText(bytes: number): string {
  if (bytes < 1024) {
    return `${grouped(bytes)} B`
  }

  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// A stored file's size, as Terylon counts it: in characters.
export function charactersText(characters: number): string {
  return COPY.specCharacters(grouped(characters))
}

// WHAT IS WRONG WITH A SPECIFICATION BEFORE IT IS SENT, in the pane's one sentence, or null: the count first, then each
// name, then — once the texts are read — the characters in all. Terylon checks it again, and its refusal is said whole.
export function specificationProblem(names: readonly string[], texts: readonly string[] | null = null): string | null {
  if (names.length > SPEC_FILES_MOST) {
    return COPY.specTooMany(names.length)
  }

  const badName = names.find(name => !SPEC_NAME.test(name))

  if (badName !== undefined) {
    return COPY.specBadName(badName)
  }

  const characters = texts === null ? 0 : texts.reduce((sum, item) => sum + item.length, 0)

  return characters > SPEC_CHARACTERS_MOST ? COPY.specTooLong(characters) : null
}

// "Today", "27 Oct": the day of a moment in its own offset, as runDay draws it, without the time.
function dayOf(iso: unknown, now: number, zone: Zone): string {
  const at = Date.parse(String(iso ?? ''))

  if (!Number.isFinite(at) || !Number.isFinite(now)) {
    return '?'
  }

  const local = new Date(at - offsetAt(zone, at) * 60000)
  const today = new Date(now - offsetAt(zone, now) * 60000)

  return local.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)
    ? COPY.runToday('').trim()
    : `${local.getUTCDate()} ${COPY.months[local.getUTCMonth()] ?? '?'}`
}

// A GOAL'S SPECIFICATION FROM goal_get, or null where it has none or the answer is not one. Every field is read by its
// type: a missing or odd-typed one draws less, never throws.
export function specificationOf(goal: Json, now: number, zone: Zone = 0): PaneSpecification | null {
  const value = goal.specification

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const document = value as Json
  const version = number(document.version)

  if (version === null || version < 1) {
    return null
  }

  const replan = document.replan !== null && typeof document.replan === 'object' && !Array.isArray(document.replan) ? (document.replan as Json) : null
  const from = replan === null ? null : number(replan.from)
  const to = replan === null ? null : number(replan.to)
  const older = list(document.versions)
    .map(item => number(item.version))
    .filter((item): item is number => item !== null && item >= 1 && item !== version)

  return {
    version,
    revised: runDay(document.at, now, zone),
    files: list(document.files)
      .map(file => ({ name: text(file.name), characters: number(file.characters) }))
      .filter((file): file is { name: string; characters: number | null } => file.name !== null)
      .map(file => ({ name: file.name, size: file.characters === null ? '?' : charactersText(file.characters) })),
    older: [...new Set(older)].sort((first, second) => second - first),
    replan: from === null || to === null ? null : { from, to },
    decisions: list(goal.decisions).map(decision => COPY.specDecision(number(decision.plan) ?? 0, dayOf(decision.at, now, zone), text(decision.comment))),
  }
}

// THE FILES spec_get ANSWERED, each whole, in its order: a file with no name or no text is left out.
export function specFilesOf(answer: Json): { name: string; text: string }[] {
  return list(answer.files)
    .map(file => ({ name: text(file.name), text: typeof file.text === 'string' ? file.text : null }))
    .filter((file): file is { name: string; text: string } => file.name !== null && file.text !== null)
}
