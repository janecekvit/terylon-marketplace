---
name: verify-test-plan
description: >-
  Use when a list of claims needs to be checked against the artifact rather than re-read — a pull
  request's test plan, a story's acceptance criteria, a checklist someone wrote and nobody exercised.
  Triages each item into executed / static-only / not verifiable here, exercises what it can, and
  reports evidence per item. Forge-agnostic engine: it verifies and writes nowhere.
allowed-tools: Read, Grep, Glob, Bash, Agent, Write
---

# verify-test-plan

A checklist is a list of **claims**. Left alone it stays a list of claims, and a ticked box that nobody exercised is worse than an empty one — it launders an unverified claim into a verified-looking one.

This skill turns claims into one of three states, honestly. It **carries the judgment and writes nowhere**: no PR update, no work item, no commit. Writing the result into a pull request is `update-pr-checklist`'s job, in `terylon-devops`.

## Usage

```
verify-test-plan --items=<path> [--repo=<path>] [--fixtures=<dir>] [--report=<path>]
```

- `--items` — path to a file holding the checklist, one item per line, or the identifier of a list a caller has already parsed.
- `--repo` — the repository under test. Default: the current one.
- `--fixtures` — where throwaway fixtures may be created. Default: a temporary directory. **Never the repository under test.**
- `--report` — where to write the full evidence. The return stays a summary.

## The rule everything else serves

**A tick is an assertion of fact.** Emit one only for an item you **executed** and whose result you can show. Everything else stays unticked with a reason.

This is not fussiness. Azure DevOps renders a pre-checked box as a static tick the reader cannot toggle, so a wrong tick is both false and unfixable by the next reader. And a checklist that has ever lied stops being read — which costs more than the item it lied about.

## Triage — three classes, not two

Two states cannot express what verification actually produces. Classify every item first:

| Class | The item is | What you do |
|---|---|---|
| **Executed** | code, a command, a file state — something with an observable result | run it, capture the evidence, **tick** |
| **Static only** | an instruction read by a model: a `SKILL.md` rule, an agent's constraint, a convention | confirm the text exists and nothing contradicts it, **do not tick** |
| **Not verifiable here** | needs a capability this session lacks — another project root, a credential, browser automation that is not installed | say so precisely, **do not tick** |

The boundary between the first two is the question **"is there something to run?"** A guard hook is code: feed it a payload, read the exit. A `SKILL.md` paragraph telling an agent to announce its route has nothing to execute — the artifact is prose read by a model, and only a run of that model can show whether it complied.

**Ask a second question before settling on static: does the behaviour leave a trace outside the model?** Many claims about what a component does are decidable by their consequence even though the instruction itself is prose. "The tester writes nothing before approval" is not a grep — it is a **count**: the pull request's thread count and the work item's comment count, before and after the verify phase. That is an external oracle rather than a self-report, and a claim that has one is **executed**.

| The claim is about behaviour, and … | Class |
|---|---|
| it leaves an observable trace — a count, a file, an exit status, a provable absence | **executed** — assert the trace |
| its only witness is the acting process reporting that it complied | static only |

**Over-classifying as static is the failure mode that survives review**, because it looks like rigour and only shows up as a plan nobody could tick. A run of this skill classed "writes nothing without approval" as static-only while already holding the two counts that settled it.

**Static confirmation is worth doing and worth labelling.** It catches a deleted instruction, a contradiction introduced elsewhere, a constraint missing from a persona that needs it. It cannot catch a model that reads the instruction and does something else. Reporting it as verification is the lie this skill exists to prevent.

### Routing an executed claim

*Executed* is one class, not three, but its members need different machinery. Decide which **after** the triage, never instead of it:

| The claim is about | Route to | Needs |
|---|---|---|
| a script, a hook, a file's state, a single command | run it here | a shell |
| the project building, or its test suite | **`run-build-and-tests`** | a shell |
| what a user sees or can do in the interface | **`run-ui-flows`** | browser automation |

Both are loaded **by name** and both report facts rather than verdicts — the command, the exit status, the case names, the state observed. **You** decide what that means for the claim; an executor that returned a pass/fail would be making your judgment for you with less context than you have.

**A missing capability is a report, not a fallback.** When `run-ui-flows` answers that browser automation is absent, the claim becomes *not verifiable here* — it does **not** quietly degrade to a static reading of the UI code. That degradation is exactly how a plugin built to prevent unverified ticks would start producing them.

**A green suite is not coverage.** `run-build-and-tests` returns the case **names** alongside whatever counts the runner printed, and it is the names that matter here: a count can never show whether the claim's case was among them. A suite that passes without touching the behaviour under test leaves the claim unproven, and saying otherwise is the same lie in a more respectable suit.

## Coverage across two lists

A pull request carries a **test plan**; the work item it implements carries **acceptance criteria**. They are two lists of claims about one change, and a caller holding both — the `tester` — asks whether the plan covers the criteria. This skill owns the classification; the caller owns the mapping, because only it holds both lists.

| Relationship | The criterion | What the caller does |
|---|---|---|
| covered | has a plan item whose `covering` bears on it | its state follows that item's result — a passed, covering plan item earns the criterion its tick |
| **gap** | has no covering plan item | exercise it directly if it is executable; otherwise report it as a coverage gap. **Never invent a tick** for a criterion nothing exercised |
| extra | a plan item maps to no criterion | report it — an extra check, not a defect |

"Are the plan and the criteria the same?" is answered as **covered / gap / extra**, never as a yes or no. The gap is the finding that matters: a criterion the story required with nothing verifying it reads, uncorrected, as satisfied.

## Workflow

### 1. Parse and triage

Read the items. For each, decide its class and say why in one clause. Report the triage **before** running anything — a caller who disagrees with a classification should hear it now, not after the work.

### 2. Push back on items that cannot be tested as written

Some items are untestable because of how they are phrased, not because of what they claim.

### An item's shape decides whether a run can ever tick it

A testable item names **a run and its expected result**. An item that names an **outcome** cannot be executed however true it is, because there is nothing in it to perform.

| Shape | Example | Can a run tick it? |
|---|---|---|
| **procedure + expected result** | "Dispatch the tester with no approval; assert the pull request's thread count and the work item's comment count are unchanged and the return is `AWAITING_WRITE_APPROVAL`" | yes |
| **outcome** | "tester returns in two phases and writes nothing without approval" | no — nothing in it to perform |

Both sentences are about the same fact. The first is a test; the second is an **acceptance criterion that wandered into a test plan**.

**Return an outcome-shaped item as `untestableAsWritten` with a procedural rewrite** — never as static-only. Static-only says "we read it and it is there"; the defect here is that the item was never a test, and calling it static hides an authoring mistake behind a verification class.

| As written | Testable? | Rewritten |
|---|---|---|
| "tester returns in two phases and writes nothing without approval" | no — an outcome, not a run | "Dispatch the tester with no approval; assert the thread and comment counts are unchanged and the return is `AWAITING_WRITE_APPROVAL`" |
| "A read-only lens does not dispatch a writing agent" | no — needs a live pipeline | "Every persona with `disallowedTools: [Edit, Write]` carries the constraint inline and declares the skill" |
| "The change is safe" | no — unfalsifiable | name the specific failure it must not have |
| "Tests pass" | yes, but empty | which tests, and what did they cover that they did not before |

**Say so and propose the rewrite.** An item nobody can check is a decoration on the plan, and it will be ticked eventually by someone who wants the list finished. Reporting it is more useful than silently classifying it as static.

### 3. Build a fixture, never test in place

Exercise the artifact against a **throwaway fixture**, never against the user's real checkouts.

The fixture must **reproduce the condition that produced the defect**, not merely a convenient state. A guard that failed because an environment variable pointed at a different checkout has to be tested with that variable pointing there; a fixture that avoids the awkward condition proves nothing about it.

Record what the fixture was. A result that cannot be reproduced is an anecdote.

**"Never touch the repository under test" is the intent; the enforceable rule is narrower.** A build writes its output, and a claim about the project building can only be checked by building it. The line that can actually be held is in `${CLAUDE_PLUGIN_ROOT}/shared/side-effects.md` and it binds every execution — the ones the executors perform *and* the ones this skill runs itself under *route: here*:

- **tracked files: never**, and `git status --porcelain` before and after is the proof
- ignored build output: allowed, and **declared**
- everything else — artifacts, fixtures, scratch — outside the repository entirely

Read that contract rather than restating it. A rule stated absolutely in one place and narrowed in another does not make the absolute version true; it makes both unreliable.

### 4. Test both directions

**A guard is only correct if it blocks what it must and passes everything else.** Half a test suite that only proves the blocking half will happily certify something that blocks all legitimate work as well — and that gets switched off, which is worse than never having it.

For every item asserting something is prevented, add cases asserting the near-miss is still allowed. When the plan does not list them, add them anyway and say you did:

- the same operation aimed somewhere legitimate
- a name that merely contains the forbidden one as a fragment
- the ordinary daily commands the rule sits next to
- malformed and empty input, which must fail open rather than block

### 5. Fan out when the items are independent

Items rarely depend on each other. Dispatch them concurrently via the `Agent` tool when there are enough to be worth it, one brief per item, each returning its own evidence. Items sharing a fixture run together in one agent, since a fixture built twice is a fixture built wrong.

### 6. Report

Return a summary; write the evidence to `--report`. Per item: its class, what was run, what came back, and the verdict. Counts, not adjectives.

## Output

```yaml
executed:
  - item: <the claim, verbatim>
    via: here | run-build-and-tests | run-ui-flows
    covering: <what was run that bears on THIS claim — case names, or the flow and its steps>
    outcome: passed | failed
    detail: <counts when the executor reported them; the observed state when it did not>
    fixture: <one line describing it>
    evidence: <path or inline command + result>
staticOnly:
  - item: <verbatim>
    checked: <what was confirmed to exist and what was searched for contradiction>
    unproven: <the behaviour this does not establish>
notVerifiableHere:
  - item: <verbatim>
    missing: <the capability that is absent>
    wouldNeed: <what a run that could verify it looks like>
untestableAsWritten:
  - item: <verbatim>
    why: <one clause>
    suggested: <a rewrite that can be checked>
```

Tick **only** an `executed` item whose `outcome` is `passed` **and** whose `covering` names something that bears on that claim.

Both halves are load-bearing, and the second is the one that gets skipped. `outcome: passed` says a run succeeded; `covering` says the run had anything to do with the claim. A suite that goes green without touching the behaviour under test satisfies the first and fails the second, and ticking on the first alone is how a plugin built against unverified ticks starts issuing them from a genuinely green build.

`covering` is a **sentence a reader can check**, not a number. Counts belong in `detail`; a count can never show whether the claim's case was among them.

## Known limits

- **Repo-local agents register from the session's own project.** A fixture repository created elsewhere never has its `.claude/agents/` loaded, so any claim about which agents get dispatched cannot be verified from a session rooted somewhere else. It needs a session whose project *is* the fixture. Classify such items as *not verifiable here* rather than approximating them.
- **Model behaviour is not reproducible by grep — but its consequences often are.** A claim of the form "the agent will …" is static-only **only when it leaves no trace outside the model**. When it leaves a count, a file, an exit status or a provable absence, assert that trace and class the item *executed*. Reaching for static-only because the subject is an agent is the most common way this skill under-reports.
- **The plan and the tester may share an author.** When the same run generated the checklist and now verifies it, nothing independent has happened. Exercise the artifact, never re-read the claim — and treat an item you cannot exercise as unverified no matter how confident the wording is.

## Common mistakes

- **Ticking on a static check.** The single failure this skill exists to prevent.
- **Ticking without evidence.** An unshown result is unfalsifiable, which makes the tick worthless even when it happens to be true.
- **Testing only the blocking direction.** A guard that blocks everything passes that half perfectly.
- **Building a fixture inside the repository under test.** Fixtures are throwaway and elsewhere, never the user's real checkout. Running a build *against* that repository is a different act and is governed by the side-effect contract, not forbidden.
- **A fixture that avoids the awkward condition.** Reproduce the state the defect needed, or the pass means nothing.
- **Silently downgrading an item.** Moving something from ticked to unticked is a finding — report it, with what was and was not behind the original tick.
- **Accepting an untestable item quietly.** Propose the rewrite; a claim nobody can check will be ticked by someone eventually.
- **Reporting adjectives.** "Thoroughly verified" is not a count. Cases, passes, failures, fixture.

## Verification

1. Given a checklist mixing code claims and instruction claims, the triage separates them **before** any case runs, and the report keeps them separate.
2. A code claim is executed against a throwaway fixture, and the report names the fixture and what was run.
3. An instruction claim comes back as `staticOnly` with `unproven` filled in — never ticked.
4. An item that needs another project root comes back as `notVerifiableHere` with `wouldNeed` describing the session that could check it.
5. An unfalsifiable item ("the change is safe") comes back under `untestableAsWritten` with a concrete rewrite.
6. For a claim that something is prevented, the report shows near-miss cases proving legitimate work still passes.
7. **Routing:** a claim about the build or the suite goes to `run-build-and-tests`, a claim about the interface to `run-ui-flows`, a claim about a single script or file state to neither — and `via` records which, per claim.
8. **A missing capability is a report, not a fallback.** With browser automation unavailable, a UI claim comes back `notVerifiableHere` naming the absent capability. It does **not** come back `staticOnly` from having read the UI code instead, and it does not come back ticked. This is the plugin's own thesis; leaving it untested was the gap this item closes.
9. **A green suite is not coverage.** Given a claim whose behaviour no test touches, and a suite that passes, the item does **not** earn a tick: `outcome` is `passed` but `covering` names nothing bearing on the claim, and the tick gate needs both.
10. **The side-effect contract binds this skill too.** After a *route: here* execution, `git status --porcelain` on the repository under test is unchanged for tracked files, and any ignored build output was declared before it appeared.
11. Nothing is written: no PR update, no work item, no commit, no tracked-file change in the repository under test.
12. **Shape is triaged, not only content.** An outcome-shaped item — "tester returns in two phases and writes nothing without approval" — comes back under `untestableAsWritten` with a **procedural** rewrite. It does **not** come back `staticOnly`, which would file an authoring defect under a verification class and leave the plan looking merely unproven rather than mis-written.
13. **A behavioural claim with an external trace is executed.** Given "the tester writes nothing before approval", and the pull request's thread count and the work item's comment count taken before and after the verify phase, the item is classed `executed` with those counts as its `covering` — not `staticOnly` on the grounds that its subject is an agent.
