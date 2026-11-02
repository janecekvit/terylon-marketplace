// THE TONES (Terylon S68; Design · Tokens, the table 3.1): which of the host's theme keys each tone of Terylon's
// glossary is drawn in. Claude Desktop gives a mod its theme's names, never colours, so Terylon Cockpit takes the roles:
//
//   tone   means                                          theme key    drawn as
//   ok     done: verified green, merged, accepted, well   success      dot, edge, word
//   wait   waits for you, stuck, a warning                warning      dot or edge ONLY; its word is ink, semibold
//   bad    blocked, failed, refused, an alert             error        dot, edge, word
//   run    running, verifying, a link                     suggestion   dot, word
//   gate   the owner's gate: ready to merge or accept,    merged       dot, edge, the ◇ step
//          a plan to approve
//   quiet  proposed, queued, held, abandoned, dropped      subtle       dot, word dim
//
// The host draws `warning` #b56d00 on its light theme, 4.08:1 on white: under text's 4.5:1, so no word is amber.
// Pure: no $, so a test reads it without a session.

import type { WordTone } from './words'

export type { WordTone }

// The host's theme keys a tone is drawn in, and `text` for ink.
export type ThemeKey = 'text' | 'inactive' | 'subtle' | 'suggestion' | 'success' | 'warning' | 'error' | 'merged'

// The light theme's amber as the host paints it: a mark or a stroke, never a word.
export const WARNING_LIGHT = '#b56d00'

export const TONE_KEYS: Readonly<Record<WordTone, ThemeKey>> = {
  ok: 'success',
  wait: 'warning',
  bad: 'error',
  run: 'suggestion',
  gate: 'merged',
  quiet: 'subtle',
}

// A mark's colour: a dot, a card's stroke, a ⚠, a stepper's node.
export function markOf(tone: WordTone): ThemeKey {
  return TONE_KEYS[tone]
}

// A word's colour and weight: a tone that waits is ink at semibold, never amber; every other tone its own key.
export function wordOf(tone: WordTone): { color: ThemeKey; weight: 'semibold' | undefined } {
  return tone === 'wait' ? { color: 'text', weight: 'semibold' } : { color: TONE_KEYS[tone], weight: undefined }
}

// WHAT EACH ROW'S KIND IS, by tone: purple what waits on the owner's merge or approval, green what is done.
export const KIND_TONES: Readonly<Record<string, WordTone>> = {
  question: 'wait',
  merge: 'gate',
  accept: 'gate',
  plan: 'gate',
  blocked: 'bad',
  merged: 'ok',
  accepted: 'ok',
  running: 'run',
  verifying: 'run',
  stuck: 'wait',
  queued: 'quiet',
  held: 'quiet',
  story: 'quiet',
}

export function kindTone(kind: string): WordTone {
  return KIND_TONES[kind] ?? 'quiet'
}

// A CARD'S STROKE, by what it holds: one that waits for the owner in `warning`, a problem in `error`, else quiet.
export const CARD_STROKES = { plain: 'subtle', wait: 'warning', bad: 'error' } as const
