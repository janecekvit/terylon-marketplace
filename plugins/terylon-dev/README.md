# terylon-dev

Developer pipeline: from a user story (a link to an Azure DevOps work item or a plain description) to implemented and tested code through **plan → build (TDD) → finish**, with human approval at the plan and at the merge.

## Audience

Developers who want a complete gated loop: clarify the story, plan it against the real codebase, build it test-first task by task, and close the PR.

## Where it sits

```
terylon-core .................. delegate-to-repo-agents, measure-token-spend
    ▲   ▲
    │   └── terylon-git ....... create-workspace, code-review, finish-branch, code-reviewer
    │          ▲
    │          └── terylon-devops ....... ado-mcp, create-pr, write-pr-description, pr-reviewer
    │                 ▲
    └─────────────────┴── terylon-dev  ← you are here
```

All three are declared **directly** rather than relied on transitively: `leader` dispatches `code-reviewer` whether or not Azure DevOps is in play, and `develop` loads `measure-token-spend` at Gate 3 whether or not a pull request exists.

## Dispatch chain

```
develop (skill, main thread — the only place that can ask the user)
├── Gate 0  intake ....................... asks
├── create-workspace .................... from terylon-git (unless --here)
└── leader ─────────────────────────────▶ owns the loop, returns at each gate
    ├── planner ──▶ Explore              design + TDD plan
    │   └── AWAITING_APPROVAL ▶ Gate 1   plan approval (--dry-run stops here)
    ├── developer ──▶ debugger           per task, test-first (on a failing test)
    │   └── <repo-local specialist>      conditional — see below
    ├── security-reviewer     ┐
    ├── performance-reviewer  │ one round, parallel, read-only
    ├── architecture-reviewer │
    ├── edge-case-reviewer    ┘
    │   └── <repo-local specialist>      conditional; capability gate below
    ├── refactorer                       simplify while tests stay green
    └── whole-branch review:
        ├── code-reviewer                no PR yet — the usual case
        │   └── code defect ──▶ developer, then review again (max 3 rounds)
        └── pr-reviewer ──▶ code-reviewer  a PR exists; findings land on it
                                         ▲
                              Gate 3 ────┘  PR / finish ... asks
                                            └── /code-review ultra   offered, never launched
```

Two feedback edges are easy to miss. A **code defect** found by a review goes back to `developer` and the branch is reviewed again, bounded at three rounds so a fix that provokes the next finding cannot oscillate forever. A **design defect** — the wrong boundary, a responsibility in the wrong module — goes back to `planner` instead, and if the revised plan differs from the one the user approved it returns through Gate 1, because that is no longer the plan they saw.

At Gate 3 the skill may **offer** `/code-review ultra`, the harness's heavier multi-agent review, when the diff is large or security-sensitive. It cannot run it: that command is user-triggered and billed, and no skill or agent can invoke it.

With several items the whole chain runs **once per item, concurrently** — one seed-spec, worktree, branch and `leader` each. The shape does not change; it multiplies. Gates stay on the main thread and are hosted as each leader returns.

The `<repo-local specialist>` branches are **not part of this plugin**. A target repository may ship its own agents — a stack-specific implementer, a domain reviewer — and a persona dispatches one when it covers the technology more specifically than a generic persona can. Most repositories ship none and the branch never occurs. The convention is the `delegate-to-repo-agents` skill in `terylon-core`; its load-bearing rule is a **capability test**: may the candidate change the files under examination? `Edit`, `Write` and **unrestricted `Bash`** all mean yes, so `disallowedTools` alone settles nothing.

## What it contains

**Skills:**

- **`develop`** — the entry point on the main thread. It parses flags, runs the intake clarification, dispatches `leader` and hosts the gates. It is a skill and not an agent, because **only the main thread can ask the user**.
- **`write-plan`** — the implementation plan's format: header, global constraints, file map, task shape with interfaces, the no-placeholder rules and the self-review. Written for an implementer who sees only their own task. `planner` emits its artifacts in this format.
- **`run-build-loop`** — the controller's mechanics for executing a plan: the ledger that survives a compaction, the pre-flight scan before the first task, the bounded fix rounds with their model escalation, and how to pick a tier per role. `leader` runs it rather than hand-rolling a per-task loop.

The last two shipped in `terylon-core` until `1.4.x`. They moved here because nothing outside this plugin consumes them, and the root installs for everyone.

**Agents:**

- **`leader`** — owns the iteration loop: dispatches the other agents, reads their reports, decides on the next round, keeps the ledger. At a gate it returns control upwards. For the whole-branch review at the end it dispatches `terylon-git:code-reviewer`, or `terylon-devops:pr-reviewer` when a pull request already exists and the findings should land there.
- **`planner`** — turns an agreed brief into a design and a bite-sized TDD plan, grounded in the codebase via `Explore`. It never guesses — when something is unclear it returns `NEEDS_CLARIFICATION`.
- **`developer`** — implements a single task test-first: red → green → refactor → commit → self-review.
- **`debugger`** — on a test failure it proceeds systematically: hypothesis → reproduction → minimal fix.
- **`refactorer`** — once the tests are green it goes through the diff for simplification, reuse and consistency.
- **`edge-case-reviewer`**, **`security-reviewer`**, **`performance-reviewer`**, **`architecture-reviewer`** — read-only review lenses running in parallel, each with its own angle. They propose, they do not edit.

Every persona here is **generic by design** — that is what lets the same pipeline run over any repository. Where the target repo ships an agent that knows the stack better, the persona delegates to it rather than approximating it, under the `delegate-to-repo-agents` convention from `terylon-core`. The persona keeps ownership: it verifies what returns, its report names the delegation, and its own return values are unchanged.

## Reuse

The plugin is deliberately thin. Isolation goes through `create-workspace` and finishing through `finish-branch`, both from `terylon-git`; the pull request is opened by `create-pr` from `terylon-devops`, which fills its own description — this plugin issues no ADO recipe of its own at Gate 3. The built-in one-shot agents `Explore` and `Plan` do the grounding and the architecture draft. Only the orchestration, the personas, the plan format and the build loop are its own.

It used to reuse six skills from the `superpowers` plugin. Three were replaced by shorter equivalents here; the other three turned out to be carried in full by the personas themselves, so they were dropped rather than rewritten. `terylon-dev` no longer requires the `claude-plugins-official` marketplace.

## Dependencies

- **`terylon-devops`** — the `ado` MCP server, the `ado-mcp` engine, `create-pr` (which `develop` invokes at Gate 3), `review-pr`, `write-pr-description`. Installed automatically.
- **`terylon-git`** — `create-workspace`, `code-review`, `finish-branch`, and the `code-reviewer` agent that `leader` dispatches for the whole-branch review. Declared directly rather than relied on transitively, because `leader` uses it whether or not a pull request is in play.
- **`terylon-core`** — `delegate-to-repo-agents`, which every persona loads before dispatching a repo-local specialist, and `measure-token-spend`, which `develop` invokes at Gate 3. It also ships the `SubagentStop` hook that records the run's spend continuously. The marketplace's dependency-free root, declared directly so neither use depends on git being in play.

## Setup

```json
{
  "extraKnownMarketplaces": {
    "terylon": {
      "source": {
        "source": "git",
        "url": "https://dev.azure.com/janecekvit/Dev/_git/TerylonMarketplace",
        "ref": "main"
      },
      "autoUpdate": true
    }
  },
  "enabledPlugins": {
    "terylon-devops@terylon": true,
    "terylon-dev@terylon": true
  }
}
```

## Usage

```
/terylon-dev:develop <item> [<item> …] [--auto | --dry-run] [--here]
```

- `--dry-run` — stops after the plan is approved (a plan, no code)
- `--auto` — skips the pauses at the gates; `leader` runs the whole loop on its own. The git rules still apply.
- `--here` — stay in the current checkout instead of an isolated worktree

**Several items fan out.** An item is an ADO work item URL or a prose description; prose items are separated by `---` on its own line, and prose without a separator is one item however many bullets it contains. Up to ten, with a confirmation above five. Each gets its own seed-spec, worktree and `leader`, and the leaders run concurrently. Intake still happens one item at a time — it is interactive — but from there the builds proceed in parallel, and each leader's gate is hosted the moment it returns rather than at a barrier. Every question names the work item it belongs to, because with several builds live an unlabelled question gets answered against the wrong story. Worktrees stop being optional at that point, so `--here` is refused with more than one item.
