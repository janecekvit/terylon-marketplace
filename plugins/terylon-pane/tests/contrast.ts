// What the pane's colours read as, in both themes: the theme keys it draws with, resolved through the approved S32
// canvas's own light and dark palette, and the WCAG contrast ratio between a colour and what it is drawn on. The
// test kit hands a test the theme keys a drawing names, never the colours a surface paints, so the ratio is computed
// here from the palette (the owner's walk of 1.2.0, 2026-10-23: on the tinted cards text could not be read).

export type Theme = 'dark' | 'light'

// The canvas's palette (docs/design/s32/S32-pane-redesign.html, :root and .pane.light), by the theme key each colour
// stands for; `background` is the pane's own, and `userMessageBackground` the engine's own neutral grey, read from the
// themes in Claude Code 2.1.308 (rgb(55, 55, 55) on dark, rgb(240, 240, 240) on light).
export const PALETTE: Record<Theme, Record<string, string>> = {
  dark: {
    background: '#1a1a19',
    userMessageBackground: '#373737',
    text: '#e8e6e3',
    inactive: '#b4b2ad',
    subtle: '#8f8d88',
    suggestion: '#7aa7ff',
    warning: '#e3a03f',
    success: '#4caf72',
    error: '#e5534b',
    merged: '#a98bf0',
  },
  light: {
    background: '#ffffff',
    userMessageBackground: '#f0f0f0',
    text: '#1f1e1d',
    inactive: '#4a4946',
    subtle: '#75736e',
    suggestion: '#2f6fe0',
    warning: '#b56d00',
    success: '#23824a',
    error: '#c4322b',
    merged: '#6b47d6',
  },
}

// WCAG 2.x: text needs 4.5:1 against what it is drawn on; a mark that carries no words (a dot) needs 3:1.
export const TEXT_RATIO = 4.5
export const MARK_RATIO = 3

function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255).map(value => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))

  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0)
}

export function contrast(foreground: string, background: string, theme: Theme): number {
  const front = PALETTE[theme][foreground]
  const back = PALETTE[theme][background]

  if (front === undefined || back === undefined) {
    throw new Error(`no ${theme} colour for ${front === undefined ? foreground : background}`)
  }

  const [lighter, darker] = [luminance(front), luminance(back)].sort((first, second) => second - first)

  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

// Every word and link a drawn tree shows, with the colour it is drawn in and what it is drawn on: a Text takes its
// own colour or the one of the Text around it, `text` when none; a Link is drawn in `suggestion`; a Text with a
// background is on that, everything else on the pane's background. A Button's own label is the surface's.
export type Ink = { text: string; color: string; on: string; isMark: boolean }

export function inks(node: unknown, color = 'text', on = 'background'): Ink[] {
  if (node === null || typeof node !== 'object') {
    return []
  }

  const element = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const props = element.props ?? {}
  const children = Array.isArray(element.children) ? element.children : []

  if (element.type === 'Link') {
    return [{ text: String(props.label ?? ''), color: 'suggestion', on, isMark: false }]
  }

  const ownColor = element.type === 'Text' && typeof props.color === 'string' ? props.color : color
  const ownOn = element.type === 'Text' && typeof props.backgroundColor === 'string' ? props.backgroundColor : on
  const words = element.type === 'Text' ? children.filter((child): child is string => typeof child === 'string').join('').trim() : ''
  const own = words === '' ? [] : [{ text: words, color: ownColor, on: ownOn, isMark: /^[●○◇✓⚠]$/u.test(words) }]

  return [...own, ...children.flatMap(child => inks(child, ownColor, ownOn))]
}

// The cards that once were tinted: a card stroked in `warning` (it waits for the owner) or `error` (a problem).
export function strokedCards(node: unknown): unknown[] {
  if (node === null || typeof node !== 'object') {
    return []
  }

  const element = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const isStroked = element.type === 'Box' && element.props?.borderStyle === 'round' && (element.props?.borderColor === 'warning' || element.props?.borderColor === 'error')

  return isStroked ? [node] : (element.children ?? []).flatMap(strokedCards)
}
