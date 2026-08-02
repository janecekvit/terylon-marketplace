# terylon-test

Checks a list of claims against the artifact instead of taking it on trust. A test plan nobody ran is a list of hopes; this plugin says which entries earned their tick — on a pull request's test plan, and on the acceptance criteria of the work item behind it.

## Audience

Anyone holding a checklist that decides something — a pull request's test plan, a story's acceptance criteria — who wants the ticks to mean what they appear to mean.

## Why it exists

A ticked box that nobody exercised is worse than an empty one. It reads as verified, it cannot be told apart from a real one, and in Azure DevOps a pre-checked box renders as a **static tick the reader cannot toggle** — so the false claim is also unfixable by the next person along.

The plugin came out of doing this by hand on a real pull request. Of thirteen items, seven could be executed, five turned out to be instructions read by a model with nothing to run, and one could not be checked from that session at all. Four had already been ticked without a run behind them. The three-way split below is what fell out of that, not what was designed before it.

## The `/test` command

Run a verification from the main thread:

```
/terylon-test:test <PR-URL> [--auto | --dry-run]
```

`test` is the entry point. It is a **skill, not an agent**, for the same reason `develop` is: only the main thread can ask the user, and someone has to host the one gate that matters — **consent before anything is written back to Azure DevOps**. It dispatches the `tester` agent to verify, shows what would be written, waits for a yes, and only then lets the tester write. At the end it reports the run's token spend, exactly the way `develop` does at its Gate 3.

`test` is to `tester` what `develop` is to `leader`. Several PRs or checklists fan out into concurrent testers, one gate hosted per PR as it returns.

## Dispatch chain

```
test (skill, main thread — holds the write-back gate, reports token spend)
└── tester (the role agent — drives the whole run)
    ├── update-pr-checklist (read) ......... terylon-devops: the test plan, and the work item it links
    ├── update-work-item-checklist (read) .. terylon-devops: the acceptance criteria of that work item
    ├── verify-test-plan ................... the engine: triage, coverage, routing, evidence
    │   └── per-claim subagents            one round, claims are independent
    │       ├── run-build-and-tests        the build and the suite — a shell is enough
    │       ├── run-ui-flows               the interface, through browser automation
    │       └── <repo-local specialist>    conditional; capability gate, not frontmatter
    ├── update-pr-checklist (write) ........ terylon-devops: the thread, then the rewritten plan
    └── update-work-item-checklist (write) . terylon-devops: the comment, then the annotated criteria
```

Azure DevOps appears only at the ends, and lives in another plugin. The `update-*-checklist` skills are in **`terylon-devops`** with the rest of the ADO skills — they read and write, hold no `Agent`, and check nothing. Everything between those calls is this plugin's, and none of it knows a pull request is involved, which is why the same run works on a checklist handed over directly. The tester can also be dispatched directly, without the skill; it then runs as the lower-level engine, without the write-back gate or the token-spend report — the same as dispatching `leader` outside `develop`.

## What it contains

**Skills:**

- **`test`** — the main-thread entry point. Hosts the write-back gate, dispatches the `tester`, fans out over several PRs, and reports the run's token spend through `measure-token-spend`.
- **`verify-test-plan`** — the engine. Triages every claim into executed / static-only / not-verifiable-here, exercises what it can against a throwaway fixture, reconciles a test plan against the acceptance criteria it should cover, and reports evidence per claim. Carries the judgment and writes nowhere. Loaded by name; not a user command.
- **`run-build-and-tests`** — the shell half of the execution layer. Detects the stack from the target repository's own files and its `CLAUDE.md`, runs its build and its tests, and reports the commands, exit codes and executed case names. Reports what ran; the engine decides what it means. Loaded by name; not a user command.
- **`run-ui-flows`** — the browser half of the execution layer. Probes for browser automation first, then drives the interface through Playwright and reports the steps taken and the state observed. Separate from `run-build-and-tests` **because of its dependency class**: a browser stack must not be dragged in by a checklist walker that only needs a shell. Loaded by name; not a user command.

**Agent:**

- **`tester`** — the role. Drives the run: reads the plan and the criteria, fans out one subagent per independent claim, keeps the fixture discipline, and refuses to tick what it did not run. No `Edit` and no writing to ADO before the gate; it holds `Bash`, so what actually binds it is the side-effect contract rather than a read-only label.

## The three classes

| Class | The claim is | Result |
|---|---|---|
| **Executed** | code, a command, a file state — something with an observable result | ticked, with case counts and the fixture named |
| **Static only** | an instruction read by a model — a `SKILL.md` rule, an agent's constraint | **unticked**; the text exists, the behaviour is unproven |
| **Not verifiable here** | needs a capability this session lacks — another project root, a credential, browser automation that is not installed | **unticked**, with what a run that could check it looks like |

Two checkbox states cannot carry three answers, so the groups are labelled headings rather than an overloaded tick.

A fourth outcome has no checkbox at all: a claim that **cannot be tested as written**. "The change is safe" is unfalsifiable; "a read-only lens does not dispatch a writing agent" needs a live pipeline. Those come back with a proposed rewrite, because a claim nobody can check gets ticked eventually by someone who wants the list finished.

## Test plan and acceptance criteria — the same or not?

When a pull request has a test plan **and** its linked work item has acceptance criteria, the tester maps one onto the other and reports the relationship rather than guessing they match:

| Relationship | Meaning | Handling |
|---|---|---|
| covered | a criterion has a plan item that bears on it | the criterion's state follows that item's result |
| **gap** | a criterion has no covering plan item | exercised directly if possible; otherwise reported as a coverage gap — never a tick nobody earned |
| extra | a plan item maps to no criterion | reported — an extra check, not a defect |

Results reach the pull request through `update-pr-checklist` (the plan, regrouped) and the work item through `update-work-item-checklist` (the criteria, **annotated in place** — the author's structure is the contract, so it is not regrouped; every downgrade is named in a work-item comment).

## Dependencies

- **`terylon-devops`** — the `ado` MCP server, the `ado-mcp` engine, and the two transports (`update-pr-checklist`, `update-work-item-checklist`). Installed automatically.
- **`terylon-core`** — `measure-token-spend`, which the `test` skill invokes at the end of a run to report the verification's own token spend, plus the `SubagentStop` hook that records per-agent spend as the run proceeds. Installed automatically.
- **`terylon-git`** — reached through `terylon-devops`; supplies `delegate-to-repo-agents`.
- **Playwright MCP server** — **optional**, and needed only by `run-ui-flows`. The plugin ships no `.mcp.json` for it on purpose: that would start a browser server for every consumer, including those who only walk a shell checklist. Without it, `run-ui-flows` reports the capability as absent and UI claims come back *not verifiable here* rather than silently unchecked.

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
    "terylon-test@terylon": true
  }
}
```

### Browser automation, for `run-ui-flows` only

Optional. Without it, UI claims come back *not verifiable here* — which is a reported fact, not a silent gap — and every other part of the plugin works unchanged.

Enable it yourself, per project or per session — the plugin ships no `.mcp.json` for it on purpose, as the Dependencies section explains:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@0.0.41"]
    }
  }
}
```

Pin the version rather than floating `@latest`: `shared/side-effects.md` requires the browser install to match the installed `@playwright/mcp`, and a floating package silently breaks that pairing.

`run-ui-flows` probes for it before doing anything and reports the answer either way.

## Usage

```
/terylon-test:test <PR-URL> [--auto | --dry-run]
```

It reads the plan and the linked work item's acceptance criteria, verifies what it can, shows what would be written and waits for consent, then writes the result through `update-pr-checklist` and `update-work-item-checklist` in `terylon-devops`, and finally reports the run's token spend. Given a checklist and no URL it verifies and returns, writing nothing. `--dry-run` verifies and shows the proposed writes without making them; `--auto` skips the pause.

## What it will not do

- **Tick anything it did not execute.** Including items it is confident about.
- **Write to Azure DevOps before the gate.** Nothing reaches a PR or a work item until the main-thread `test` skill has consent (or `--auto` is set).
- **Remove a tick quietly.** A downgrade is reported, with what was and was not behind the original.
- **Regroup a work item's acceptance criteria.** The author's structure is the contract; only checkbox states change, and the detail goes in a comment.
- **Fix what it finds.** The tester has no `Edit`; a tester that patches the thing under test can no longer report on it.
- **Modify the repository under test.** Tracked files are never touched, proven by `git status --porcelain` before and after; ignored build output is declared; fixtures and artifacts live outside the repository.
- **Invent a test plan or criteria.** No `## Test plan` section, or an empty acceptance-criteria field, means there is nothing to verify.
