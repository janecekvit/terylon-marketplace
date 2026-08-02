---
name: write-plan
description: Use when turning an approved spec or seed-spec into an implementation plan that a per-task implementer will execute without the context that produced it. Defines the plan document's structure — header, global constraints, file map, task shape, interfaces — and the self-review that runs before the plan is handed on.
allowed-tools: Read, Grep, Glob, Write
---

# write-plan

The **format** of an implementation plan. `planner` produces the plan and `leader` reads it back when re-planning, so the shape belongs in one place rather than in either persona's prose.

Write for an implementer who is a capable engineer, knows this codebase not at all, and sees **only their own task**. Every name, path, signature and command they need is in the task or it does not reach them.

## Where a plan lives

```text
docs/terylon/plans/<slug>.md
```

`<slug>` is the work item's slug, consistent with its seed-spec, grounding map and design.

## Document header

Every plan opens with exactly this:

```markdown
# <Feature> — implementation plan

**Goal:** <one sentence: what this builds>
**Architecture:** <2-3 sentences: the approach>
**Grounding map:** `docs/terylon/specs/<slug>-grounding.md`
**Design:** `docs/terylon/specs/<slug>-design.md`

## Global constraints

<the spec's project-wide requirements — version floors, dependency limits, platform support,
naming rules — one line each, values copied verbatim. Every task inherits this section.>

---
```

The two artifact paths are load-bearing: they are how a task's implementer reaches the codebase reading that was done **once** for the whole work item, instead of grounding from cold.

## File map before tasks

Before the first task, list every file the plan creates or modifies and what each is responsible for. Decomposition decisions get locked in here, where they are still cheap to change.

- One clear responsibility per file. Files that change together live together.
- Split by responsibility, not by technical layer.
- In an existing codebase, follow the established pattern. Do not restructure unilaterally — but a file you are already modifying that has grown unwieldy may carry a split.

## Task shape

A task is **the smallest unit that carries its own test cycle and is worth a reviewer's gate.** Fold setup, configuration and documentation into the task whose deliverable needs them. Split only where a reviewer could reject one task while approving its neighbour.

````markdown
### Task N: <name>

**Files:**
- Create: `exact/path/to/file.js`
- Modify: `exact/path/to/existing.js:123-145`
- Test: `exact/path/to/file.test.js`

**Interfaces:**
- Consumes: <exact signatures this task uses from earlier tasks>
- Produces: <exact names, parameters and return types later tasks rely on>

**Acceptance criteria as test cases:**
- <procedure and expected result — "run X, expect Y", never a restatement of an outcome>

- [ ] **Step 1: write the failing test**

```js
test("...", () => { /* the actual test */ });
```

- [ ] **Step 2: run it and confirm it fails for the right reason**

Run: `<exact command>`
Expected: FAIL — `<the actual message>`

- [ ] **Step 3: minimal implementation**

- [ ] **Step 4: run the tests and confirm green**

- [ ] **Step 5: commit**
````

**The Interfaces block is not optional.** An implementer sees one task. It is the only way they learn the names and types their neighbours use, and a mismatch between what Task 3 produces and what Task 7 consumes is a defect that surfaces at integration, long after it was free to fix.

## No placeholders

Each of these is a **plan defect**, not a style preference:

| Written | Why it fails |
|---|---|
| `TBD`, `TODO`, "implement later" | the implementer cannot act on it and will invent something |
| "add appropriate error handling", "handle edge cases" | names no case, so nothing is verifiable |
| "write tests for the above" with no test code | the test is the specification; prose is not |
| "similar to Task N" | tasks are read out of order and in isolation — repeat the code |
| a type, function or method no task defines | resolves to nothing at the moment it is needed |

## Self-review before handing the plan on

Run this yourself; it is a checklist, not a dispatch.

1. **Spec coverage** — walk each requirement in the spec and name the task that implements it. A requirement with no task is a gap; add the task or return `NEEDS_CLARIFICATION`.
2. **Placeholder scan** — every row of the table above.
3. **Interface consistency** — a function called `clearLayers()` in Task 3 and `clearFullLayers()` in Task 7 is a bug that will be found at the worst moment.
4. **Task sizing** — any task a reviewer could not reject independently is two tasks or none.

Fix what you find inline and move on. No second pass.

## What this skill does not decide

The **coverage map** from acceptance criteria to tasks, and the judgment about which criteria are convertible at all, belong to `planner`. This skill says what a plan looks like; it does not say what belongs in one.
