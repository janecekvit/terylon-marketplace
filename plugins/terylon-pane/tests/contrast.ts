// What the pane's colours read as, in both themes: the theme keys it draws with, resolved through the approved S32
// canvas's own light and dark palette, and the WCAG contrast ratio between a colour and what it is drawn on. The
// test kit hands a test the theme keys a drawing names, never the colours a surface paints, so the ratio is computed
// here from the palette (the owner's walk of 1.2.0, 2026-10-23: on the tinted cards text could not be read).

export type Theme = 'dark' | 'light'

// The palette of the approved S32 canvas (attached to issue #25, :root and .pane.light), by the theme key each colour
// stands for; `background` is the pane's own, and `userMessageBackground` and `inverseText` the engine's own, read from
// the themes in Claude Code 2.1.309 (rgb(55, 55, 55) and black on dark, rgb(240, 240, 240) and white on light).
export const PALETTE: Record<Theme, Record<string, string>> = {
  dark: {
    background: '#1a1a19',
    userMessageBackground: '#373737',
    inverseText: '#000000',
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
    inverseText: '#ffffff',
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

const TRANSLUCENT = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/

// What a colour is on a theme: a theme key, a raw #rrggbb, or what it lies on and a translucent fill over it, as
// `background|rgba(...)`, composited as a browser does.
export function painted(name: string, theme: Theme): string | undefined {
  const layers = name.split('|')
  const under = layers[0] ?? ''
  const base = under.startsWith('#') ? under : PALETTE[theme][under]

  if (base === undefined) {
    return undefined
  }

  return layers.slice(1).reduce((below, layer) => {
    const [, red, green, blue, alpha] = TRANSLUCENT.exec(layer) ?? []

    if (alpha === undefined) {
      throw new Error(`not a translucent fill: ${layer}`)
    }

    return `#${[red, green, blue].map((channel, index) => {
      const lower = parseInt(below.slice(1 + index * 2, 3 + index * 2), 16)

      return Math.round(Number(channel) * Number(alpha) + lower * (1 - Number(alpha))).toString(16).padStart(2, '0')
    }).join('')}`
  }, base)
}

// What lies under what is drawn on a fill: an opaque one replaces the ground, a translucent one lies over it.
function onFill(on: string, fill: unknown): string {
  return typeof fill !== 'string' ? on : TRANSLUCENT.test(fill) ? `${on}|${fill}` : fill
}

export function contrast(foreground: string, background: string, theme: Theme): number {
  const front = painted(foreground, theme)
  const back = painted(background, theme)

  if (front === undefined || back === undefined) {
    throw new Error(`no ${theme} colour for ${front === undefined ? foreground : background}`)
  }

  const [lighter, darker] = [luminance(front), luminance(back)].sort((first, second) => second - first)

  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

// Every word and link a drawn tree shows, with the colour it is drawn in and what it is drawn on: a Text takes its
// own colour or the one of the Text around it, `text` when none; a Link is drawn in `suggestion`; a Text or a Box with a
// background is on that, composited when it is translucent, everything else on the pane's background. A Button's own
// label is the surface's.
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
  const ownOn = element.type === 'Text' || element.type === 'Box' ? onFill(on, props.backgroundColor) : on
  const words = element.type === 'Text' ? children.filter((child): child is string => typeof child === 'string').join('').trim() : ''
  const own = words === '' ? [] : [{ text: words, color: ownColor, on: ownOn, isMark: /^([●○◇✓⚠]|━+)$/u.test(words) }]

  return [...own, ...children.flatMap(child => inks(child, ownColor, ownOn))]
}

// The cards that once were tinted: a card stroked in `merged` (Waiting for you), `warning` (it waits for the owner) or
// `error` (a problem).
export function strokedCards(node: unknown): unknown[] {
  if (node === null || typeof node !== 'object') {
    return []
  }

  const element = node as { type?: string; props?: Record<string, unknown>; children?: unknown[] }
  const isStroked = element.type === 'Box' && element.props?.borderStyle === 'round' && (element.props?.borderColor === 'merged' || element.props?.borderColor === 'warning' || element.props?.borderColor === 'error')

  return isStroked ? [node] : (element.children ?? []).flatMap(strokedCards)
}
