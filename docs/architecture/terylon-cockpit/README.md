# Terylon Cockpit boards

**How the pane looks, as the owner approved it**: one board per screen of `plugins/terylon-pane`, and one for its test mode. They hold the look and the order on a screen. What the pane does and which tool each act calls are in [the pane's README](../../../plugins/terylon-pane/README.md).

**A pull request that changes a screen of the pane changes its board in the same pull request.** A new screen is a new board, placed in `canvas.json`.

| Board | Draws |
|---|---|
| `Main.dc.html` | the overview: the head with *Notices* and *Health & memory*, each framed in amber while something waits, and *Refresh*; three tiles, *Waiting for you*, a card and a road per goal, the folds, the 30-day line |
| `Notices.dc.html` | Notices, a screen of its own with *‹ Overview* and *Refresh* at its head: what needs you, each with *Mark handled*, and what the machine did |
| `Goal.dc.html` | a goal: its road and what next, a plan at the gate, stories, the specification |
| `Story.dc.html` | a story: its phases as a road, what is working now, the question, criteria, what happened |
| `More.dc.html` | Health and Memory, where a notice is one line that leads to Notices |
| `Terminal.dc.html` | the terminal's lesser form, left half; the right half is the option that was turned down |
| `TestMode.dc.html` | what `/terylon-cockpit test` shows, does and does not do |

## Test mode, in short

`/terylon-cockpit test` answers every call the pane makes from made-up data and `/terylon-cockpit test off` returns to live data. It sends nothing to Terylon, posts nothing into the chat, and leaves the store the sessions share as it was, so other sessions go on. **It covers the pane alone: Claude's own Terylon tools in that chat still reach the real Terylon.**

**`TERYLON_PANE_TEST_MODE=on`**, in the `env` of `~/.claude/settings.json`, starts every session in test mode without the command, and `/terylon-cockpit test off` still ends it for that session; any other value, or none, changes nothing. **While it is set, every session's pane is in test mode and posts no real done-signal**, so unset it once the review is done.

## Where the code differs from a board

A board is drawn in HTML, the pane in what the surface offers, so these are the code's and stand:

- A head button draws its plain word: *Notices*, where the board draws *Notices 1*. Claude Desktop draws a `Button` natively from its label and none of its children, so no count can sit inside one; the frame round it says that something waits.
- The card fills are fainter than drawn, so every word passes 4.5:1 in both themes: `tests/contrast.ts` holds them.
- The sample data on the boards is made up.

## Format

Each `.dc.html` is one self-contained artboard of a claude.ai Design canvas, placed by `canvas.json`. Its head keeps `<script src="./support.js"></script>`, the canvas's runtime, which claude.ai serves beside the boards: it is not in this repository, so a browser opening a board from disk draws it unstyled.
