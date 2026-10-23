# S32 — what the 2.1.304 mod API allows the pane

The inventory behind the approved canvas, [`S32-pane-redesign.html`](./S32-pane-redesign.html), and what `terylon-pane` 1.2.0 builds with it (#25). The pane was built for Claude Code **2.1.304**, taken to be Claude Desktop's engine; **the owner's walk of 1.2.0 on 2026-10-23 found Claude Desktop 3.6556.2.0 running 2.1.308**, so 1.2.1 on is built and tested on 2.1.308. The 2.1.308 declarations of every prop below are the same as 2.1.304's.

## Sources

| Source | What it settles |
|---|---|
| `claude-code.d.ts` of `@anthropic-ai/claude-code@2.1.304` — the declarations the engine lays at `.claude-plugin/types/claude-code/` beside a mod it loads | every prop below: `TextProps`, `BoxProps`, `BoxHoverProps`, `ButtonProps`, `SvgProps`, `SelectProps`, `InputProps`, `CodeProps`, the `Elements` table per surface, `Space`, `UiScrollArgs` |
| `claude plugin test` and `claude plugin validate` on 2.1.304, run on the 1.2.0 module | what the engine refuses at draw time, recorded under *Measured* |
| the canvas's inventory board | the version each capability arrived in, from the 2.1.295–2.1.308 [changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) |

## What the pane uses

| Area | Capability | Since | In 1.2.0 | Where |
|---|---|---|---|---|
| Layout | spacing steps `xs`–`xl` on `gap`, `padding`, `margin` | 2.1.299 | yes | every card: `padding` `md`, `gap` `sm`, rows `xs`; the terminal keeps whole cells |
| Layout | `Pane` `bodyColumns` | ≤ 2.1.296 | yes | below 44 columns the narrow dock: no row detail, phases as dots, gauges as numbers |
| Layout | `Box` `hover` with `position: "absolute"` | ≤ 2.1.296 | yes, **proven** in Desktop | a waiting row's console link laid over its right edge, never over an open row |
| Layout | `$.ui.open({ rows, columns })` | 2.1.296 / 2.1.305 | no | the terminal only |
| Components | `Button` with children: strings and `Text` | 2.1.295 | yes | every row: kind chip, title cut at its end, tabular detail, one press |
| Components | `Svg` with `alt` (Desktop, the phone, VS Code; not the terminal) | ≤ 2.1.296 | yes | the 8-phase stepper, a running row's segments, the slots gauge, the spend bar, a plan's chain |
| Components | `Svg` `isInteractive`: `<title>` tooltips in a sandboxed frame | ≤ 2.1.296 | yes, **proven** in Desktop: the tooltip shows under a pointer held still | a stepper node says its stage, role and step |
| Components | `Select` | ≤ 2.1.296 | yes | *New task*: goal, after, size; *New goal*: priority, target |
| Components | `Input` `rows` — a multi-line field | 2.1.301 | yes, **proven** in Desktop | the answer (4 rows), the criteria (3 rows, one per line) |
| Components | `Code` with a `language` | ≤ 2.1.296 | yes | the allow rules on the Status tab, as `json` |
| Components | `Client` (a module of its own, a frame clock) | ≤ 2.1.296 | later | nothing needs it; it draws no `Svg` |
| Components | `Raster`, `Image` | ≤ 2.1.296 | no | the terminal only |
| Theme | `Text` `size`, `weight`, `tabular`, `mono` | 2.1.299 | yes | headings, numbers, branches and hashes |
| Theme | theme keys `success`, `merged` | ≤ 2.1.296 | yes | done, merged, the Merge label |
| Theme | colours inside an `Svg` do not read the theme | — | a limit | fixed, medium colours; no word inside an `Svg` |
| Actions | `$.ui.scroll`, `autoFocus` | ≤ 2.1.296 | yes | a running story opens on *Now working*; the answer field takes the focus |
| Actions | `$.ui.notify`, `$.ui.copy` | 2.1.295 | no | Desktop has no surface for them; the allow rules are copied by hand |
| Actions | `$.ui.ask`, `$.ui.view`, audio, `prompt.change` | ≤ 2.1.300 | no | — |

## The three proofs

Each is declared in 2.1.304 and was unproven in Desktop; 1.2.0 drew each behind a switch, off. The owner walked them in Desktop 3.6556.2.0 (engine 2.1.308) on 2026-10-23, and **all three work**: from 1.2.2 they are on. `TERYLON_PANE_PROOFS` is the escape hatch: `no-` and a name turns one off, and off draws what 1.1.2 drew.

| Name | The walk | On, the default | Off — 1.1.2 |
|---|---|---|---|
| `input-rows` | proven | the answer in 4 rows, the criteria in 3, one criterion per line | one line each; criteria split by semicolons |
| `hover-reveal` | proven; laid over an expanded row it covered the question | a waiting row lights under the pointer and lays *Merge in the console ↗* (or *Approve*, *Answer*, *Unblock*) over its right edge, never over an open row | the link sits in the row's body, one press away |
| `svg-tooltips` | proven: *Admitted to a slot · done* under a pointer held still; first reported missing | each stepper node says *Tests · tester · now · Step 5 of 9* | the labels under the stepper alone |

```json
"env": { "TERYLON_PANE_PROOFS": "no-hover-reveal" }
```

## Measured

What the owner's walk of 1.2.0 in Desktop 3.6556.2.0 (engine 2.1.308) found, on 2026-10-23:

| Seen | 1.2.1 |
|---|---|
| on a card tinted with `Box` `backgroundColor` `warning` or `error`, the hints, links and chips could not be read | no card is filled; a card that waits, or a problem, is stroked in its colour |
| a state chip filled in the theme colour of its own text drew as a blank block, in both themes | a dot in the state's colour, the word in `inactive`, on `userMessageBackground`, the theme's neutral grey |
| a row's kind inside its Button read as plain text | the same chip: a dot in the kind's colour, the word in `inactive` |
| an empty band above and below the stepper | every `Svg` given its own `height` |
| in a dock of about 435 px the stepper shrank, its labels running together | below 60 body columns a compact stepper, its nodes at their size, only the phase now named |
| in the light theme the waiting tint drew dark brown, an open question's body and its link unreadable on it | no fill; every word and link on a card that waits or warns at 4.5:1 in both themes, computed from the canvas's palette (`tests/contrast.ts`) |
| an `answer` submit beside the field and an *Answer* button under it | on Desktop the field names no submit; the button sends |

What the 2.1.304 engine refused while the pane was built, on 2026-10-22, by `claude plugin test`:

| The engine said | Why | Do instead |
|---|---|---|
| `Box prop "width" must be a number or a percentage` for `"12.5%"` | a fractional percentage is not taken | eight equal columns as `flexGrow={1}` with `width={0}` |
| `Box hover is scoped to a keyed Box drawn display "none", which the pointer can never be over` | a `key` makes a Box its own hover scope | key the visible row; leave the hidden reveal inside it unkeyed |
| a found element has no `hover` among its props | `hover` sits on the drawn element, beside `props` | read it off `ui.drawn()` |
