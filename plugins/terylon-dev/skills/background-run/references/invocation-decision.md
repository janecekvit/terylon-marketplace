# How `background-run` is invoked, and why

This document was written **before** `SKILL.md` existed, and the commit order in this branch is the evidence. The `description` field is the whole of a skill's triggering behaviour, so what it must match is a decision to make deliberately rather than a shape to arrive at after the prose is already written.

## The decision

**Both, and the model-triggered half fires on an expressed intent to dispatch — never on an estimate of how long the work will take.**

```
the operator types /background-run ..............▶ always reaches the skill
the operator says "run this in the background",
  "dispatch this while I sleep", "kick this off
  unattended", "start this as a background agent" ....▶ the skill triggers
the operator says "write me forty essays" ............▶ the skill does NOT trigger
                                                        the session does the work itself
```

The line is drawn between **who does the work**, not between **how much work there is**.

## Why not slash-command only

A slash command is something the operator has to remember to type. The story this skill comes from says the discipline is *"an instruction the operator has to remember to give"* — and a skill reachable only by name has moved the remembering rather than removed it. The operator who forgets to say *commit as you go* is the same operator who forgets to type `/background-run`.

There is also a house rule in the way. `plugins/CLAUDE.md` and `.claude/rules/markdown.md` both forbid `disable-model-invocation`, and that flag is the only way to make a skill *exclusively* a slash command. Slash-command-only was not on the table without breaking a marketplace-wide convention, and it should not have been.

## Why not model-triggered only

Dispatching a background agent is **irreversible, spends budget, and runs with nobody watching**. A skill that can fire on its own must not be able to fire on a misreading. Keeping the explicit `/background-run` form costs nothing — every skill has it — and it is what the operator reaches for when the phrasing was ambiguous and the model guessed wrong in the other direction.

## The second half of making model-triggering safe

The trigger decides *whether the skill is reached*. It does not decide *whether a run starts*, and those must not be the same event.

`background-run` therefore takes the marketplace's established flag contract: **the default composes the prompt, shows the repository, the worktree name and the branch, and waits for the operator to confirm.** `--auto` dispatches at once, `--dry-run` never dispatches.

That gate is what lets the description be written to trigger at all. The one case a trigger cannot be made safe against is the case where it matched something the operator did not mean — and with the gate in place, that case costs a confirmation prompt instead of an unsupervised run against a budget.

## Why the trigger is intent, not length

This is the load-bearing half of the decision.

| Candidate trigger | What it is | Verdict |
|---|---|---|
| "the task looks long" | a **judgment** the model makes from the prompt, before any of the work is done | **rejected** — it is an estimate, it is wrong often, and being wrong means an unattended run the operator never asked for |
| "the operator asked for it to be dispatched / backgrounded / run unattended / run while they are away" | a **linguistic condition** present or absent in what the operator actually said | **chosen** — it is checkable, and it cannot fire on a request to do the work here and now |

A length trigger fails in the dangerous direction. "Write me a thorough primer on compiler construction" is long work, and the right answer to it is for the session to write the primer — not to silently hand it to an unsupervised agent in a worktree the operator has not been told about yet. Length is a property of the *work*; dispatching is a property of the *request*.

The story's fourth acceptance criterion asks that the description *"triggers on the cases the invocation decision named, and not on short work"*. The line drawn here is stricter than that: it does not trigger on **long** work either, unless the operator asked for the work to leave the session. Short work is the easy half; long work done in the session is the half that a length-based trigger would have got wrong.

## What the description must therefore contain

1. The **positive triggers**, as phrasings rather than as topics — background, unattended, dispatch, overnight, while I am away, detached, `claude --bg`.
2. An explicit **negative**: not for work this session should do itself, however long that work is.
3. The **fact that it commits as it goes**, because that is the property that makes it worth reaching for rather than dispatching by hand.

Everything else — the mechanics, the report shape, the three things that will not happen — belongs in the body, which is only read once the description has already matched.

## Why the discipline is a prompt and not a hook

There is a second mechanism available and it is genuinely stronger, so the choice against it needs stating rather than assuming.

`homelab/services/claude-agent/hooks/commit-as-you-go.js` in the Terylon repository is a `PostToolUse` hook that commits after every `Edit` / `Write` / `NotebookEdit` inside a **dispatched worker container**. It runs outside the permission system, so the agent cannot decline it. A `claude --bg` dispatch could carry the same thing: `--settings` accepts a JSON string, and a hook path resolved from `${CLAUDE_PLUGIN_ROOT}` would land in the dispatched session.

It is still the wrong instrument here, for three reasons:

| | A prompt instruction (chosen) | An injected `PostToolUse` hook |
|---|---|---|
| Unit of loss | **one step**, as the prompt defines a step | one file write — a step can be committed half-finished |
| Survives the run | yes — the prompt is kept verbatim in `~/.claude/jobs/<id>/state.json` as `intent`, so what was asked is readable years later | no — a hook leaves commits, but nothing recording that the discipline was in force |
| Who it is for | the operator's own session, where `git commit` is already permitted | a worker whose allow list carries no `git commit` at all, so the model **cannot** commit and something else must |

The third row is why the hook exists in the worker and does not need to exist here: the worker's `claude-settings.json` deliberately allows `Bash(git add *)` and no commit, and a hook is the only way to commit without widening that. The operator's session has no such restriction, so the weaker mechanism is sufficient and the stronger one buys a smaller unit of loss at the cost of an unreadable record.

**The hook remains the escalation if the prompt turns out to be ignored**, and whether it is ignored is measurable: count the commits on the run's branch against the steps the prompt named. A run that produced one commit for twelve steps is the signal to switch mechanisms, not a reason to reword the prompt again.
