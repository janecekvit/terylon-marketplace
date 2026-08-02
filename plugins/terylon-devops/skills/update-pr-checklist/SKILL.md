---
name: update-pr-checklist
description: >-
  Use when a pull request's test plan needs reading, or its results writing back — "read this PR's
  test plan", "tick off what was actually verified", "publish the verification". Reads the items out
  and writes results in: which were checked, which were not, and why. Does no checking of its own;
  the caller supplies the outcome.
allowed-tools: Read, Grep, Glob, Write, mcp__plugin_terylon-devops_ado__*
---

# update-pr-checklist

Reads a pull request's test plan out of Azure DevOps and writes results back into it.

**It checks nothing itself.** A caller that has done the checking hands over the outcome, and this skill puts it where the reader will see it. That separation is the point: a skill that both ran the check and wrote the tick would be marking its own homework.

## Usage

```
/terylon-devops:update-pr-checklist <PR-URL> [--results=<path>] [--dry-run | --auto]
```

- `<PR-URL>` — `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`.
- No `--results` — read the test plan and return the items with where they sit. Writes nothing.
- `--results=<path>` — a file holding the outcome per item; write it back.
- `--dry-run` — print what would be written; write nothing.
- `--auto` — write without pausing. It skips the *pause*, not the rules: the eligibility re-check, the reconciliation and the tick conditions all still run, and a judgment the skill cannot make on its own still stops and asks. A downgrade — an item losing a tick it did not earn — is such a judgment, because it reverses somebody's stated position.

Reading and writing are separate invocations because whatever happens between them can take a long time, and the description must be re-read before the write rather than assumed from the first call.

## What the caller hands over

Per item: what was **checked**, what came of it, and what that leaves unproven. `verify-test-plan` in `terylon-test` produces exactly this shape — `executed`, `staticOnly`, `notVerifiableHere`, `untestableAsWritten` — and the tester is the usual caller, but any caller with an outcome per item may use this.

**The classification is not yours to revisit**; the caller decided it. One check is yours, because you are the last thing before the write: an item may be ticked only when the outcome says it was executed, that it passed, and names something that bears on that item. A result asking for a tick without all three is a caller bug — refuse the tick, say why, and write the rest.

## Prerequisites

- The `ado` MCP server from this plugin; at runtime `mcp__plugin_terylon-devops_ado__*`.
- Call shapes come from the **`ado-mcp`** engine skill — **load it by name** before any `mcp__ado__*` call.

## Shape of a run

```
read
├── 1  fetch the PR .............. parse URL, resolve repo id, get PR
└── 2  locate the test plan ...... sentinel region, or a hand-written section

   … the caller checks the items …

write
├── 4  compare .................. which ticks are earned, which are not
├── 5  re-fetch + reconcile ..... eligibility re-check; the description may have moved
└── 6  write ................... the thread first, then the rewritten plan
```

There is no step 3, and that is deliberate: this skill has **no `Agent` tool** and dispatches nothing. The checking happens in the caller's context, under whatever discipline the caller carries — none of which would hold here.

**Acceptance criteria on a work item are handled by the sibling skill `update-work-item-checklist`, not here.** They are the same kind of list with the same problem, but they live on a different object in a different field — so they get their own transport rather than blurring this one into a thing that half-handles both.

## Workflow

### 1-2. Fetch the PR, and find the plan

Parse the URL, resolve `repositoryId`, fetch the PR (recipes in `ado-mcp`). Stop with a message if the PR is `completed` or `abandoned`; a draft is fine.

The test plan usually sits inside the region `write-pr-description` owns, bounded by `<!-- write-pr-description:start -->` and the footer. Where it sits decides what you may rewrite:

| What you find | What you may rewrite |
|---|---|
| Sentinel present, `## Test plan` inside it | that region only; everything before the sentinel and after the footer stays verbatim |
| **No sentinel, but a hand-written `## Test plan`** | **that section only.** Do not add a sentinel and do not reformat anything around it — somebody wrote this by hand and owns the rest of the field |
| Sentinel present, `## Test plan` outside it | as above: the section, not the region |
| No `## Test plan` anywhere | nothing. Say there is nothing to read and stop |

A hand-written plan is the main case, not the awkward one: it is precisely the list somebody wrote and nobody exercised. Refusing to touch it would refuse the reason this exists; rewriting the whole field to "adopt" it would take ownership of prose you did not write. Rewrite the section, leave the rest.

**Never invent a plan.** No `## Test plan` means nothing to read. Proposing items belongs to whoever owns the plan.

### 3. The checking happens elsewhere

Reading returns here: give the caller the items and where they sit, and stop.

The caller comes back with an outcome per item, and the write picks up at step 4. Between the two the description may have changed, which is why step 5 re-reads rather than trusting what step 1 saw.

### 4. Compare against what the plan already claims

Every difference between the current ticks and the outcome the caller supplied is worth reporting:

| Current | Verified | What it means |
|---|---|---|
| `- [ ]` | executed, passed, `covering` bears on the item | earned — tick it |
| `- [ ]` | executed, passed, `covering` bears on **nothing relevant** | leave it. The run proves the suite passed, not the claim |
| `- [ ]` | static / not verifiable | leave it, and say which |
| `- [ ]` | **untestable as written** | leave it, and carry the engine's proposed rewrite into the thread |
| `- [X]` | executed, passed, `covering` bears on the item | confirmed |
| `- [X]` | executed, passed, `covering` bears on **nothing relevant** | not confirmed — the run proves the suite passed, not the claim. Downgrade and say so |
| **`- [X]`** | **not executed** | **a tick with nothing behind it** |
| `- [X]` | executed, **failed** | the claim is false — a finding, not a formatting issue |

The last two rows are the reason this skill exists.

**Match a tick case-insensitively.** `- [x]` and `- [X]` are the same state to every renderer, and a human ticking a box in the browser produces whichever the editor felt like. Reading only one spelling turns somebody's tick into an untouched item and the reconciliation reports a change that never happened. Match both; emit `- [X]`.

`untestableAsWritten` is the engine's fourth outcome and it has no group of its own, because it is not a verification state — it is a defect in the plan. The item stays where it is, unticked, and the thread carries the rewrite. Proposing it in the description would edit somebody's plan on their behalf.

**Never silently remove a tick.** Somebody put it there, and quietly reversing it hides both the original mistake and yours if you are wrong. Move the item into the right group, keep it visible, and state in the evidence thread what was and was not behind the original tick.

### 5. Re-fetch, then reconcile

**Fetch the PR again immediately before the write** — the whole object, not only the description. In default mode the wait for `push` is unbounded, and `repo_update_pull_request` replaces the whole field with no revision history to recover from.

**Re-run the eligibility check on what comes back**, as `ado-mcp` prescribes and `review-pr` does at its own step 6. A PR that was completed or abandoned during the wait must not be written to; a verification thread arriving after a merge is noise on something nobody will read again. Fetching the description alone answers what the plan says and not whether writing to it is still allowed.

This is not theoretical. A run of this workflow by hand found that the author had ticked eight boxes in the browser while the verification was running; writing from the earlier snapshot would have erased all eight.

Fetching is half the job. **Reconcile the fresh description against the one you verified against**, item by item:

| Changed during the wait | What to do |
|---|---|
| An item you verified was **ticked by the author** | your result governs — it was executed or it was not. Keep your state and say in the thread that the author's tick was superseded and on what evidence |
| An item you verified was **edited** | it is no longer the claim you checked. Return it to `- [ ]`, keep the author's wording, and list it in the thread as unverified-because-changed |
| An item was **added** | you never saw it. Carry it through unticked and name it in the thread as not covered by this run |
| An item was **removed** | it is gone. Do not resurrect it; note it in the thread |
| Anything outside `## Test plan` | untouched, always |

An addition dropped on the floor is the failure mode that matters here: the author would see a plan that verified cleanly with their new item missing from it.

### 6. Write

Rewrite **only the scope step 2 selected** — the shared sentinel region, or the hand-written section alone — as three labelled groups, preserving everything outside that scope verbatim. Where step 2 chose a section, no sentinel is added:

```markdown
## Test plan

**Verified by execution** - <N> cases against <fixture>, evidence in the thread below.

- [X] <item> (<cases>)

**Verified statically only** - the instruction exists and nothing contradicts it. That is not the same as the model following it, so these stay unticked.

- [ ] <item>

**Not verifiable here** - <the capability that is missing>

- [ ] <item> - <what a run that could check it looks like>
```

The group headings carry what a checkbox cannot. Do not try to encode three states in two.

**Use the engine's names for the classes.** *Not verifiable here* is the engine's, and it means any absent capability — another project root, a credential, browser automation that is not installed. An earlier draft of this skill headed that group "Not verifiable from outside the target project", which names one cause as though it were the class and quietly tells a reader that a missing browser belongs somewhere else.

### Order of writes

**Post the thread first, then write the description.** The plan says "evidence in the thread below"; writing that sentence before the thread exists leaves a dangling reference for as long as the two calls are apart, and if the thread call fails the description is left pointing at nothing.

The thread has no length limit, which is why the detail belongs there and not in the plan.

### Running it twice

**The write must be idempotent.** A second run over an unchanged branch produces the same description, not the same description with the annotations appended again. Rewrite the whole scope from the current result rather than editing the previous rendering, and post one thread reply per run — a run that found nothing new says so briefly rather than repeating the last one's evidence.

### The 4000-character cap

The description is capped at **4000 characters**, counted over the whole field.

**Count code points, and do not trust `wc -m` to do it.** A checklist carrying arrows, dashes and emoji measures longer in bytes than it is, so trimming against a byte count cuts material that would have fitted.

`wc -c` counts bytes by definition. **`wc -m` counts bytes too whenever `LANG` and `LC_ALL` are unset**, which is the common case in a tool-driven shell: it falls back to a byte count, where a run of this skill measured a four-byte emoji as 4 and returned 3246 for a string of 3243 code points. The error is in the safe direction, so it will not produce an over-cap write; it will silently trim content that fitted, which is the failure this paragraph exists to prevent.

Measure with something locale-independent:

```bash
node -e "process.stdout.write(String([...require('fs').readFileSync(0,'utf8')].length))" < description.md
```

**Do not reach for `locale charmap` to decide whether `wc -m` is safe.** Measured in this repo's own environment it reported `UTF-8` while `LANG` and `LC_ALL` were both empty and `wc -m` still returned bytes — 3769 against 3765 code points for a real description. `charmap` reports a default, not the active locale, so the check that looks like it settles the question does not settle anything. Measure code points directly or not at all.

The rewrite is usually **longer** than what it replaces, since group headings and per-item reasons are added. When it does not fit, cut in this order:

1. The per-item reason on `notVerifiableHere` items — the thread carries it in full
2. The case counts beside executed items — likewise
3. The group heading prose, down to the bare heading

**Never cut a group heading, and never drop the `- [X]`/`- [ ]` state.** Losing a heading collapses three states back into two, which is the thing this skill exists to prevent.

**An item is cut only after all three cuts above are exhausted, and never silently.** It is the last resort, not a forbidden one — a plan can simply be longer than the field. When it comes to that: drop from the largest group first, name every dropped item in the thread with its state, and say in the description itself that items were omitted and where to find them. An author who cannot see that something is missing has been given a checklist that lies by omission, which is worse than a truncated one that admits it.

### Why this skill may write `- [X]` when nothing else may

`ado-mcp` states the house rule: checklists use `- [ ]` only, never `- [x]`. It exists because ADO renders a pre-checked box as a static tick the reader cannot untick, so a box checked on the author's say-so is a claim nobody verified and nobody can withdraw.

**This skill holds the only carve-out, and only while it earns it:**

| Condition | Why it is the condition |
|---|---|
| The item was **executed**, not read about | the rule forbids asserting verification, not recording it |
| The run's `outcome` is **`passed`** | an executed-and-failed item is a finding, not a tick |
| The `covering` **bears on that item** | a green run that never touched the behaviour satisfies "it ran" and proves nothing. This is the one that gets skipped |
| The evidence is **posted in the thread** | a tick the reader cannot check is the thing the rule guards against |
| Anything not executed stays `- [ ]` | the carve-out covers what ran, never what merely seemed fine |

Fail any one of these and the exemption does not apply — write `- [ ]`.

The rule still binds every skill that **generates** a plan, including `write-pr-description`, because generating is not executing however sure the author feels. And it binds this skill too for every item outside the `executed` group.

Post **one thread**, before the description write, carrying: the fixture, per-item case counts, the near-miss cases proving legitimate work still passes, every rewrite the engine proposed for an untestable item, everything the reconciliation turned up, and an explicit paragraph on any tick that was moved. A tick whose evidence is not shown is unfalsifiable, and this skill exists to stop unfalsifiable ticks.

End the thread with the footer, exactly as `ado-mcp` requires of every posted comment:

```
---
*🤖 Generated with [Claude Code](https://claude.ai/code) — update-pr-checklist@<plugin-version> · <model> / <effort>*
```

`<plugin-version>` comes from **this** plugin's own `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. The version-less substring `Generated with [Claude Code]` is also the prior-run sentinel: **scan existing threads for it before posting**, and when one is found, reply in that thread rather than opening another. Without it every run leaves a new thread and the PR fills with the same conversation.

### 7. Do not commit

This skill reads the repository to verify it and writes only to the PR. No commit, no staging, no branch change.

## Common mistakes

- **Checking anything yourself.** You write a result; you do not produce one. A skill that both ran the check and wrote the tick is marking its own homework, and the separation is what stops that.
- **Writing a tick the result does not support.** The caller decided the classification, but the tick gate is yours: executed, passed, and a `covering` bearing on the item. A result asking for more is a caller bug — refuse it and say so.
- **Silently unticking.** Report the downgrade; hiding it repeats the original fault in the other direction.
- **Writing from a stale read.** Re-fetch at step 5, always — and re-check eligibility with it, not just the description.
- **Re-fetching and then not reconciling.** The fetch is half of step 5; an item added during the wait is dropped without the other half.
- **Fighting `write-pr-description` over the region.** Same sentinel — but **not** the same rules about ticks. Rewrite in place and leave the rest.
- **Putting the evidence in the description.** It belongs in the thread, which has no length limit and does not push the plan over one.
- **Writing the description before the thread.** The plan says "evidence in the thread below"; write it first and it points at nothing.
- **Opening a new thread on every run.** Match the prior-run sentinel and reply instead.
- **Trimming by byte count.** The cap is code points; multi-byte punctuation makes bytes overstate the length. `wc -m` is not a way out — outside a UTF-8 locale it returns bytes as well.
- **Losing `format: "Markdown"` on the write.** The field defaults to HTML, in which `- [ ]` stops being a checkbox — the whole point of writing there.
- **Renaming a class in a heading.** *Not verifiable here* covers any missing capability; naming one cause in the heading tells the reader the others belong elsewhere.
- **Reaching for a work item.** Acceptance criteria live in the sibling `update-work-item-checklist`. Point at it rather than half-handling them here.

## Verification

1. **Read:** given a PR URL, the items come back from the test plan with the scope named — the sentinel region, or the section standing alone. No write tool is called and nothing is dispatched; this skill has no `Agent` and must not acquire one.
2. **Read, no plan:** a PR with no `## Test plan` reports that there is nothing to read, and invents none.
3. **`--dry-run`:** the three groups are printed, nothing is written, and no `repo_update_pull_request` call is made.
4. **Write:** the evidence thread appears **first**, then the plan is rewritten inside the selected scope, and content before the sentinel and after the footer survives.
5. **Hand-written plan, no sentinel:** the section is rewritten and nothing else in the field is touched — no sentinel is added.
6. **Ticking discipline:** every `- [X]` left behind corresponds to an item the result marks executed and passed, with a `covering` bearing on it. A green run with an empty or unrelated `covering` produces no tick.
7. **A tick with nothing behind it** moves to the right group, shows unticked, and is named explicitly in the thread — never removed silently.
8. **A tick over a failing item** is reported as a finding, not quietly reorganized.
9. **Reconciliation:** with one item added, one edited and one ticked in the browser during the wait, the added item survives unticked, the edited one returns to `- [ ]`, a browser tick is superseded only where the result has evidence, and all three are named.
10. **Idempotence:** a second run over an unchanged branch produces an identical description and one further thread reply, not re-appended annotations.
11. **Prior-run detection:** the second run replies in the first run's thread rather than opening another.
12. **Cap:** on a plan that does not fit, reasons and counts are cut first and every group heading survives; if items must go, they are named in the thread **and** the description says items were omitted.
13. **Untestable items** stay unticked and in place, with the proposed rewrite in the thread and not in the description.
14. **Eligibility:** a PR completed or abandoned between the first fetch and the write is not written to.
