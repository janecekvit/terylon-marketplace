---
name: update-work-item-checklist
description: >-
  Use when a work item's acceptance criteria need reading, or a tester's results writing back —
  "read this story's acceptance criteria", "record which criteria were actually verified",
  "publish the acceptance-criteria verification". Reads the criteria out and writes results in:
  the earned ticks in place, everything else with its reason in a work-item comment. Does no
  checking of its own; the caller supplies the outcome.
allowed-tools: Read, Grep, Glob, Write, mcp__ado__*, mcp__plugin_terylon-devops_ado__*
---

# update-work-item-checklist

Reads a work item's acceptance criteria out of Azure DevOps and writes a tester's results back into them.

**It checks nothing itself.** A caller that has done the checking hands over the outcome, and this skill puts it where the reader will see it. That separation is the point: a skill that both ran the check and wrote the tick would be marking its own homework.

It is the sibling of `update-pr-checklist`. That one carries a pull request's test plan; this one carries a work item's acceptance criteria. They split on the object, not the discipline — the tick gate, the downgrade rule and the "generating is not executing" line are the same, stated once in `ado-mcp` §17 and obeyed by both.

## Usage

```
/terylon-devops:update-work-item-checklist <WI-URL-or-id> [--results=<path>] [--dry-run | --auto]
```

- `<WI-URL-or-id>` — `https://dev.azure.com/{org}/{project}/_workitems/edit/{id}`, or a bare id.
- No `--results` — read the acceptance criteria and return the items. Writes nothing.
- `--results=<path>` — a file holding the outcome per item; write it back.
- `--dry-run` — print what would be written; write nothing.
- `--auto` — write without pausing. It skips the *pause*, not the rules: the reconciliation and the tick gate still run. A downgrade — an item losing a tick it did not earn — is reported and applied; here that is survivable without a pause because the work item keeps revision history (a bad write is revertable), which the pull-request field does not.

Reading and writing are separate invocations because whatever happens between them can take a long time, and the criteria must be re-read before the write rather than assumed from the first call.

## What the caller hands over

Per item: what was **checked**, what came of it, and what that leaves unproven. `verify-test-plan` in `terylon-test` produces exactly this shape — `executed`, `staticOnly`, `notVerifiableHere`, `untestableAsWritten` — and the tester is the usual caller, but any caller with an outcome per item may use this.

**The classification is not yours to revisit**; the caller decided it. One check is yours, because you are the last thing before the write: an item may be ticked only when the outcome says it was executed, that it passed, and names something that bears on that item. A result asking for a tick without all three is a caller bug — refuse the tick, say why, and write the rest.

## Prerequisites

- The `ado` MCP server from this plugin; at runtime `mcp__plugin_terylon-devops_ado__*`.
- Call shapes come from the **`ado-mcp`** engine skill — load it by reading `${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md` before any `mcp__ado__*` call. This skill leans on `fetch-work-item`, `update-work-item`, `wi-comments-read`, `wi-comment-post` and the WI half of `detect-prior-run`.

## Shape of a run

```
read
├── 1  fetch the work item ......... parse URL/id, fetch fields + relations
└── 2  locate the criteria ......... the AcceptanceCriteria field; confirm it is Markdown

   … the caller checks the items …

write
├── 4  compare ................... which ticks are earned, which are not
├── 5  re-fetch + reconcile ...... the field may have moved during the wait
├── 6  guard ..................... refuse a field rewrite that would corrupt it
└── 7  write ................... the comment first, then the annotated field
```

There is no step 3, and that is deliberate: this skill has **no `Agent` tool** and dispatches nothing. The checking happens in the caller's context, under whatever discipline the caller carries — none of which would hold here.

## Workflow

### 1-2. Fetch the work item, and find the criteria

Parse the URL or bare id (`parse-wi-url`), fetch the work item with `expand="relations"` (`fetch-work-item`). The acceptance criteria live in `Microsoft.VSTS.Common.AcceptanceCriteria`.

**Read the field's encoding, do not assume it** — `multilineFieldsFormat["Microsoft.VSTS.Common.AcceptanceCriteria"]` says `markdown` or `html`.

| What you find | What you may do |
|---|---|
| Markdown, with `- [ ]` items | annotate the checkbox states in place (step 7) |
| Markdown, prose with no checkboxes | there is no checklist to tick; report the criteria as unstructured and stop, inventing none |
| **HTML** | the `- [ ]` are dead in HTML — a tick would not render. Report it, tick nothing, and do **not** auto-convert the field. Converting the encoding is a larger change to the author's field than annotate-in-place is meant to make; recommend it and leave it to the author |
| field empty or absent | nothing to read. Say so and stop |

**Never invent criteria.** An empty field means there is nothing to read. Proposing criteria belongs to whoever owns the story.

Unlike a pull request, there is **no completed/abandoned gate** to fail — annotating the acceptance criteria of a story in any state is a meaningful record. Note the work item's `System.State` in the comment so the reader has it, but do not refuse the write on it.

### 3. The checking happens elsewhere

Reading returns here: give the caller the items and stop. The caller comes back with an outcome per item, and the write picks up at step 4.

### 4. Compare against what the criteria already claim

Every difference between the current ticks and the outcome the caller supplied is worth reporting:

| Current | Verified | What it means |
|---|---|---|
| `- [ ]` | executed, passed, `covering` bears on the item | earned — tick it |
| `- [ ]` | executed, passed, `covering` bears on **nothing relevant** | leave it. The run proves the suite passed, not the claim |
| `- [ ]` | static / not verifiable / a coverage gap | leave it, and say which in the comment |
| `- [ ]` | **untestable as written** | leave it, and carry the engine's proposed rewrite into the comment |
| `- [X]` | executed, passed, `covering` bears on the item | confirmed |
| `- [X]` | executed, passed, `covering` bears on **nothing relevant** | not confirmed — downgrade and say so |
| **`- [X]`** | **not executed** | **a tick with nothing behind it** — downgrade |
| `- [X]` | executed, **failed** | the claim is false — a finding, not a formatting issue |

**Match a tick case-insensitively.** `- [x]` and `- [X]` are the same state to every renderer; read both, emit `- [X]`.

**Never silently remove a tick.** Somebody put it there. Keep the item where it is, keep the author's wording, flip only its state, and state in the comment what was and was not behind the original tick. That the work item keeps revision history makes a wrong downgrade recoverable — it does not make an unexplained one acceptable.

### 5. Re-fetch, then reconcile

**Fetch the work item again immediately before the write.** In default mode the wait for consent is unbounded, and the author may have edited the criteria meanwhile.

Reconcile the fresh field against the one you verified against, item by item:

| Changed during the wait | What to do |
|---|---|
| An item you verified was **ticked by the author** | your result governs — it was executed or it was not. Keep your state and say in the comment that the author's tick was superseded and on what evidence |
| An item you verified was **edited** | it is no longer the claim you checked. Return it to `- [ ]`, keep the author's wording, and list it in the comment as unverified-because-changed |
| An item was **added** | you never saw it. Carry it through unticked and name it in the comment as not covered by this run |
| An item was **removed** | it is gone. Do not resurrect it; note it in the comment |

An addition dropped on the floor is the failure mode that matters: the author would see criteria that verified cleanly with their new item missing from the picture.

### 6. Guard the field rewrite

`wit_update_work_item` **silently drops tag-shaped `<…>` content** (`ado-mcp` §`update-work-item`). Round-tripping acceptance criteria that contain a literal `<…>` would corrupt the author's wording without any error.

**Before rewriting the field, scan the fetched criteria for a literal `<…>` tag shape.** If any item contains one, do **not** rewrite the field. Put every result in the comment instead, and say in the comment that the field was left untouched to avoid corrupting it. Content already stored escaped (`&lt;…&gt;`) is not tag-shaped and is safe.

This guard is why the detail lives in the comment regardless: the comment is always written; the field rewrite is the part that can be withheld.

### 7. Write

**Post the comment first, then rewrite the field** — the same order as `update-pr-checklist`, and for the same reason: the field is the terse record, the comment is the evidence it points at.

#### The comment — the whole picture

One work-item comment carries everything a checkbox cannot:

- the fixture, per-item case counts, and the near-miss cases proving legitimate work still passes;
- each item's class — executed / static only / not verifiable here / untestable-as-written (with the engine's rewrite) / coverage gap;
- the coverage map against the pull request's test plan when the caller supplied one — which criteria a plan item covers, which are gaps, which plan items map to no criterion;
- an explicit paragraph on every tick moved, with what was and was not behind the original.

**Idempotence via the sentinel.** Detect a prior run by the version-less substring `Generated with [Claude Code]` in the work item's comments (`detect-prior-run`, WI path). On a re-run, **update that comment** rather than posting another (`wit_update_work_item_comment`) — a work item's discussion should not fill with one run's repetitions. End the comment with the footer, exactly as `ado-mcp` §16 requires:

```
---
*🤖 Generated with [Claude Code](https://claude.ai/code) — update-work-item-checklist@<plugin-version> · <model> / <effort>*
```

`<plugin-version>` comes from **this** plugin's own `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.

#### The field — annotate in place

Rewrite the `AcceptanceCriteria` field **only** to change checkbox states. Keep the author's headings, ordering and item wording **verbatim**. Do not add group headings, do not reorder, do not reword — the three-group rewrite is `update-pr-checklist`'s answer to a flat test plan; acceptance criteria are the author's structured contract and stay theirs.

Write with `wit_update_work_item` (`update-work-item` recipe). The field is already Markdown (step 2 refused otherwise), so no format patch is needed; a Markdown body sent to a Markdown field renders correctly.

Every `- [X]` left in the field must satisfy the tick gate — executed, passed, covering bears on it. Everything else is `- [ ]`, and the comment says why.

### Why this skill may write `- [X]` when a generator may not

`ado-mcp` §17 states the house rule and its one carve-out: a checklist uses `- [ ]` unless the skill **executed** the item, it **passed**, the run **bears on that item**, the evidence is **posted where the reader can check it**, and anything not executed stays `- [ ]`. This skill holds that carve-out for the `executed` group and nowhere else. The rule still binds every skill that *generates* acceptance criteria — `create-user-story`, `create-feature` — because generating is not executing, however sure the author feels.

### Do not commit

This skill reads the repository only as a caller needs and writes only to the work item — its field and one comment. No commit, no staging, no branch change.

## Common mistakes

- **Checking anything yourself.** You write a result; you do not produce one.
- **Writing a tick the result does not support.** The tick gate is yours: executed, passed, and a `covering` bearing on the item.
- **Regrouping the criteria.** Annotate in place. The author's structure is the contract; only the checkbox states are yours.
- **Rewriting a field that contains `<…>`.** The update drops it silently. Comment-only, and say why (step 6).
- **Ticking in an HTML field.** The box is dead there. Report it; do not auto-convert the author's field.
- **Silently unticking.** Report the downgrade; revision history makes it recoverable, not invisible.
- **Writing from a stale read.** Re-fetch at step 5, always, and reconcile.
- **Posting a fresh comment every run.** Match the sentinel and update the prior comment instead.
- **Putting the evidence in the field.** It belongs in the comment; the field carries only the tick states.
- **Inventing criteria.** An empty field means nothing to read.

## Verification

1. **Read:** given a work item id, the acceptance criteria come back with their encoding reported. No write tool is called and nothing is dispatched; this skill has no `Agent` and must not acquire one.
2. **Read, no criteria:** a work item with an empty `AcceptanceCriteria` reports nothing to read, and invents none.
3. **HTML field:** an HTML `AcceptanceCriteria` is reported as such, nothing is ticked, and the field is not auto-converted.
4. **`--dry-run`:** the annotated field and the comment are printed, nothing is written, no `wit_update_work_item` or `wit_add_work_item_comment` call is made.
5. **Write order:** the comment appears **first**, then the field is annotated; the author's headings and wording survive verbatim, only checkbox states change.
6. **Ticking discipline:** every `- [X]` corresponds to an item the result marks executed and passed, with a `covering` bearing on it.
7. **A tick with nothing behind it** is downgraded to `- [ ]`, kept in place, and named in the comment — never removed silently.
8. **Angle-bracket guard:** given an item containing a literal `<…>`, the field is left untouched and the comment says so; a field of `&lt;…&gt;`-escaped items writes normally.
9. **Reconciliation:** with one item added, one edited and one ticked by the author during the wait, the added item survives unticked, the edited one returns to `- [ ]`, a browser tick is superseded only where the result has evidence, and all three are named in the comment.
10. **Idempotence:** a second run over an unchanged branch updates the prior sentinel comment rather than posting another, and produces the same field.
11. **Nothing else is written:** no PR, no commit, no tracked-file change in the repository.
