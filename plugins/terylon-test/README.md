# terylon-test

Checks a list of claims against the artifact instead of taking it on trust. A test plan nobody ran is a list of hopes; this plugin says which entries earned their tick.

## Audience

Anyone holding a checklist that decides something — a pull request's test plan, a story's acceptance criteria — who wants the ticks to mean what they appear to mean.

## Why it exists

A ticked box that nobody exercised is worse than an empty one. It reads as verified, it cannot be told apart from a real one, and in Azure DevOps a pre-checked box renders as a **static tick the reader cannot toggle** — so the false claim is also unfixable by the next person along.

The plugin came out of doing this by hand on a real pull request. Of thirteen items, seven could be executed, five turned out to be instructions read by a model with nothing to run, and one could not be checked from that session at all. Four had already been ticked without a run behind them. The three-way split below is what fell out of that, not what was designed before it.

## Dispatch chain

```
tester (the role agent — drives the whole run)
├── update-pr-checklist (read) ....... terylon-devops: the test plan out of the PR
├── verify-test-plan ................. the engine: triage, routing, evidence
│   └── per-claim subagents          one round, claims are independent
│       ├── run-build-and-tests      the build and the suite — a shell is enough
│       ├── run-ui-flows             the interface, through browser automation
│       └── <repo-local specialist>  conditional; capability gate, not frontmatter
└── update-pr-checklist (write) ...... terylon-devops: the thread, then the rewritten plan
```

Azure DevOps appears only at the ends, and lives in another plugin. **`update-pr-checklist` is in `terylon-devops`** with the rest of the ADO skills — it reads the test plan and writes the answer, holds no `Agent`, and checks nothing. Everything between those two calls is this plugin's, and none of it knows a pull request is involved, which is why the same run works on a checklist handed over directly.

## What it contains

**Skills:**

- **`verify-test-plan`** — the engine. Triages every claim into executed / static-only / not-verifiable-here, exercises what it can against a throwaway fixture, and reports evidence per claim. Carries the judgment and writes nowhere.
- **`run-build-and-tests`** — the shell half of the execution layer. Detects the stack from the target repository's own files and its `CLAUDE.md`, runs its build and its tests, and reports the commands, exit codes and executed case names. Reports what ran; the engine decides what it means. Loaded by name by `verify-test-plan`; not a user command.
- **`run-ui-flows`** — the browser half of the execution layer. Probes for browser automation first, then drives the interface through Playwright and reports the steps taken and the state observed. Separate from `run-build-and-tests` **because of its dependency class**: a browser stack must not be dragged in by a checklist walker that only needs a shell. Loaded by name by `verify-test-plan`; not a user command.

**Agent:**

- **`tester`** — the role. Fans out one subagent per independent claim, keeps the fixture discipline, and refuses to tick what it did not run. No `Edit` and no posting; it holds `Bash`, so what actually binds it is the side-effect contract rather than a read-only label.

## The three classes

| Class | The claim is | Result |
|---|---|---|
| **Executed** | code, a command, a file state — something with an observable result | ticked, with case counts and the fixture named |
| **Static only** | an instruction read by a model — a `SKILL.md` rule, an agent's constraint | **unticked**; the text exists, the behaviour is unproven |
| **Not verifiable here** | needs a capability this session lacks — another project root, a credential, browser automation that is not installed | **unticked**, with what a run that could check it looks like |

Two checkbox states cannot carry three answers, so the groups are labelled headings rather than an overloaded tick.

A fourth outcome has no checkbox at all: a claim that **cannot be tested as written**. "The change is safe" is unfalsifiable; "a read-only lens does not dispatch a writing agent" needs a live pipeline. Those come back with a proposed rewrite, because a claim nobody can check gets ticked eventually by someone who wants the list finished.

## Dependencies

- **`terylon-devops`** — the `ado` MCP server and the `ado-mcp` engine, for the transport half. Installed automatically.
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

Dispatch the **`tester`** agent with a pull request URL, or with a checklist and no URL:

```
"verify the test plan on <PR-URL>"
```

It reads the plan, verifies what it can, and writes the result through `update-pr-checklist` in `terylon-devops`. Given a checklist and no URL it verifies and returns, writing nothing.

## What it will not do

- **Tick anything it did not execute.** Including items it is confident about.
- **Remove a tick quietly.** A downgrade is reported, with what was and was not behind the original.
- **Fix what it finds.** The tester has no `Edit`; a tester that patches the thing under test can no longer report on it.
- **Modify the repository under test.** Tracked files are never touched, proven by `git status --porcelain` before and after; ignored build output is declared; fixtures and artifacts live outside the repository. Checking that a project builds means building it, so the contract in `shared/side-effects.md` makes that survivable rather than pretending it never happens.
- **Invent a test plan.** No `## Test plan` section means there is nothing to verify.
