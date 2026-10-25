# The pane takes the owner's acts; merge stays in the console

**Status:** accepted, 2026-10-21, by the operator; built in S27 (#27) on Terylon PR 228. **Supersedes in part** [one source of truth, reached from two places](./one-source-of-truth-reached-from-two-places.md): its rule that *a surface may write only what decides nothing* and that *a decision is a link to the console*. **The owner approves a plan, returns, unblocks, abandons, stops or accepts a story, pauses or resumes the leader, drops a goal, confirms or drops a memory proposal and saves the policy from the pane, each on its subject's card. Merge is the one gate, confirmed by the owner's passkey in the console, and the pane can never reach it.**

## Context

Until S27 every decision in the pane was a link to Terylon's console, because every one of them was a gate there: a tool marked destructive, confirmed by the person in a form Terylon showed. Desktop declines an MCP elicitation form without showing it (`plugins/CLAUDE.md`, *A mod*, *In Desktop*), so a gate called from a mod would be refused before the person saw it. The pane linked out.

```
                                                         before Terylon PR 228
  pane ── a plan, a blocked story, a pause, a goal ──▶ Link ──▶ console ──▶ form ──▶ the person confirms
       └── merge ─────────────────────────────────────▶ Link ──▶ console ──▶ passkey
```

On 2026-10-21 the operator decided that merge alone carries enough risk to need the passkey: it changes `main` at an exact commit. The others decide work inside Terylon and can be taken back by the next decision. Terylon PR 228 made each of them an owner write, which `/mcp` takes from the owner's tailnet identity without a form, added `memory_confirm`, `memory_drop` and `policy_save` as owner writes, and left `story_merge` and passkey removal as the only gates.

## The alternatives

| Option | What it costs | Chosen |
|---|---|---|
| Keep every decision a link to the console | the owner leaves Desktop for every plan and every blocked story; the pane shows a decision it cannot take | no |
| Let the pane call merge too, behind a confirmation of its own | a second passkey path, in a mod whose drawing Desktop decides; and the one decision that changes `main` loses its passkey | no |
| **The owner writes on their subject's card, on a press; merge a link to the console** | thirteen more allow rules, which Claude in a session may use too once they are allowed | **yes** |

## Decision

| Act | Tool | On the card of |
|---|---|---|
| Approve · Rethink… | `plan_approve` · `plan_rethink` | a plan that waits |
| Return… · Unblock · Abandon… · Stop · Accept | `story_return` · `story_unblock` · `story_abandon` · `story_stop` · `story_accept` | a story, by its state |
| Pause… · Resume | `leader_pause` · `leader_resume` | the queue, the Status tab |
| Drop goal… | `goal_drop` | an open goal |
| Confirm · Drop | `memory_confirm` · `memory_drop` | a memory proposal |
| Edit · Save | `policy_save` | the policy, on the Status tab |
| **Merge in the console ↗** | **never**: `story_merge` | a story verified in a repository |

- An act calls its tool only when the owner presses it, never when a card is drawn.
- A row in *Waiting for you* opens its subject; the act is on the subject's card.
- Every outcome is said on the card: Terylon's answer, Terylon's refusal word for word with the console as the way round, or Claude Code's refusal with the rules to add.

## Consequences

| | |
|---|---|
| good | the owner decides in Desktop what Desktop shows them, and the phone keeps the same acts through the `terylon-os` tools |
| good | the one decision that changes `main` keeps its passkey, and no surface but the console can take it |
| cost | the allow rules grow from eighteen to thirty-one, and an allowed act can be called by Claude in a session as well as by the pane |
| cost | Terylon checks no act's arguments against a schema (Terylon main `aaf07e8`), so the pane validates them itself: the subject's id, a return's note and a rethink's comment, the policy's fields within `policy_get`'s `limits` |
| cost | `policy_save` has no version and no concurrency check: the last write wins, from the pane, the console or a session alike |
| cost | some arguments are inferred from the pane's own calls rather than read from Terylon; `actArguments` in `hooks/terylon.ts` holds them all in one place, and says which |
| **constraint** | **`story_merge` in `PANE_TOOLS`, `OWNER_ACTS` or the README's allow rules undoes this**: the copy of Terylon's tool table, `tests/terylon-pane/tool-table.test.js` and a mutation each turn red on it |
| **constraint** | **an act fired when its card is drawn undoes this**: `tests/acts.test.ts` draws every card and requires no act call, and a mutation that fires one turns it red |

## Where it lives

| File | Role |
|---|---|
| `plugins/terylon-pane/hooks/terylon.ts` | `OWNER_ACTS`, `PANE_TOOLS`, `GATE_TOOLS`, `NEEDS_TEXT`, `actArguments` |
| `plugins/terylon-pane/hooks/register.tsx` | `takeAct`, `outcomeOf`, `afterAct`, and the acts drawn on each card |
| `plugins/terylon-pane/README.md` | the acts and the allow rules a person adds |
| `plugins/terylon-pane/tests/acts.test.ts` | every act on its press, never on render, its three outcomes, merge a link only |
| `tests/terylon-pane/mcp-tool-table.json` | the copy of Terylon's tool table after PR 228 |
| `tests/terylon-pane/tool-table.test.js` | `OWNER_ACTS` and `GATE_TOOLS` held to the copy, the README's rules to `PANE_TOOLS` |
| `tests/terylon-pane/mutations.test.js` | merge among the acts, an act on render, a return without a note, merge drawn as a button |
