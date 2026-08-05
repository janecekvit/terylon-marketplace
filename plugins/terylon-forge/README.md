# terylon-forge

The **forge port**. It carries the pull request workflow — review, description, comment handling, checklist write-back — written against an **operation catalog** rather than against one hosting platform, so the same transports run on Azure DevOps and on GitHub.

**It ships no adapter, and must not.** Declaring one would install an Azure DevOps MCP server in a GitHub repository, which is the whole reason this plugin exists. Enable `terylon-ado` or `terylon-github` beside it.

## Where it sits

```
terylon-core ............. the shared conventions, token-spend measurement
    ▲
    └── terylon-git ...... worktrees, the local review engine
           ▲
           └── terylon-forge  ← you are here
                  ▲
                  ├── terylon-ado ....... adapter: ADO mechanics + the ado MCP server
                  ├── terylon-github .... adapter: gh CLI mechanics, no server
                  ├── terylon-product ... user stories, Feature specs
                  ├── terylon-dev ....... the build pipeline
                  └── terylon-test ...... test plans, acceptance criteria
```

Everything here touches a forge and nothing below it does. That boundary is why the review pipeline is split: `code-review` and `code-reviewer` are local and live in `terylon-git`, while `review-pr` and `pr-reviewer` carry the findings outward and live here.

## The port, and the one edge that points up

Every transport here is written against a catalog of **operations**. Two plugins implement it, each shipping a skill named `forge-ops`:

```
terylon-forge/skills/*          resolve-forge ──▶ ado | github
        │
        └── loads `forge-ops` ──┬──▶ terylon-ado:forge-ops      the catalog, over the ADO MCP server
                                └──▶ terylon-github:forge-ops   the catalog, over the gh CLI
```

**That load points up the dependency chain, and `forge-ops` is the only component in the marketplace reached that way.** It is a port and adapter relationship rather than an oversight: this plugin declares the contract, an adapter fills it and declares the dependency, so the edge in `plugin.json` still points down. The rule and its rationale are in `plugins/CLAUDE.md`, under *Where a component belongs*.

**A transport that finds no `forge-ops` says so and stops.** It never falls back to the other adapter and never issues platform calls of its own — a second copy of the call shapes is a second place to fix, and the copy is the one that goes stale.

## Audience

Everyone working through pull requests, on either platform — directly for the PR workflow, indirectly as the foundation of the role plugins.

## What it contains

**Router:**

- **`resolve-forge`** — which platform a run targets, and therefore which adapter fills the port. An explicit URL first, then `TERYLON_FORGE`, then the git remote's host. No default: with nothing to go on it stops and asks.

**Transport skills** (they parse URLs, fetch, write back; the judgment is theirs, the mechanics are the adapter's):

- **`create-pr`** — open a pull request for the current branch: the work items it belongs to, the description (delegated to `write-pr-description`), optionally reviewers and auto-merge. It owns the PR *shell*; every gate that reaches outside git — pushing, notifying a reviewer, setting auto-merge — waits for consent even under `--auto`.
- **`review-pr`** — review a PR and post the findings as inline suggestion blocks or PR-wide threads.
- **`write-pr-description`** — a PR description from the branch diff, and the PR *body* whether `create-pr` calls it or you do.
- **`update-pr-checklist`** — reads a pull request's test plan out of the description and writes results back into it: the plan rewritten into labelled groups, plus one evidence thread. It checks nothing and holds no `Agent` — a caller supplies the outcome, normally the `tester` agent from `terylon-test`. The last gate before the write is its own: an item is ticked only if the outcome shows it executed, passed, and covered by something bearing on it.
- **`update-work-item-checklist`** — the sibling of `update-pr-checklist` for a work item's acceptance criteria. Reads the criteria out and writes a tester's results back: the earned ticks annotated **in place** — the author's structure is the contract, so it is not regrouped — and everything else with its reason in a comment. Like its sibling it checks nothing, holds no `Agent`, and ticks only what the outcome shows executed, passed, and covered.
- **`address-pr-comments`** — apply reviewer comments from your own PR locally.

**Agent:**

- **`pr-reviewer`** — audit of someone else's PR: isolated worktree, multi-lens adversarially verified pass, posting the confirmed findings in a single round.

## Dependencies

- **`terylon-git`** — the git-only foundation. It supplies `create-workspace` and `code-review` plus the `code-reviewer` agent, which this plugin's skills and agents load **by name**. Declared in `plugin.json#dependencies`, so it is installed automatically.

**No adapter is declared**, deliberately. One of `terylon-ado` or `terylon-github` must be enabled by the consumer; enabling both is supported, and `TERYLON_FORGE` then decides — unless a pasted URL names a forge itself, which outranks it.

## Setup

Enable an adapter — the port arrives with it:

```json
{
  "enabledPlugins": {
    "terylon-ado@terylon": true
  }
}
```

or

```json
{
  "enabledPlugins": {
    "terylon-github@terylon": true
  }
}
```

Per-adapter configuration lives in each adapter's README: `terylon-ado` needs `TERYLON_ADO_ORG` and has no default; `terylon-github` needs `gh auth login` and no configuration at all.

## Usage

```
/terylon-forge:create-pr [--base=<ref>] [--title=<text>] [--draft] [--work-items=<ids>]
                         [--reviewers=<who>] [--auto-complete[=<strategy>]] [--auto | --dry-run]
/terylon-forge:review-pr <PR-URL> [--auto | --dry-run]
/terylon-forge:write-pr-description [<PR-URL>] [--base=<ref>] [--auto | --dry-run]
/terylon-forge:address-pr-comments <PR-URL> [--auto | --dry-run]
/terylon-forge:update-pr-checklist <PR-URL> [--results=<path>] [--dry-run | --auto]
/terylon-forge:update-work-item-checklist <item-URL-or-id> [--results=<path>] [--dry-run | --auto]
```

The two `update-*-checklist` skills are the transport half of the verification pipeline in `terylon-test`; the `tester` agent normally drives them, but each carries its own slash command.

Worktree isolation and the local review engine come from `terylon-git`, installed automatically:

```
/terylon-git:create-workspace "<name>" [--branch=<branch>] [--from=<base-ref>] [--into=<dir>] [--setup]
/terylon-git:code-review
```

> **Migrating from `terylon-devops`.** That plugin no longer exists. It split in two: the transports and the agent came here, the Azure DevOps mechanics and the MCP server went to `terylon-ado`. Replace `"terylon-devops@terylon"` with `"terylon-ado@terylon"` — the port installs as its dependency. The transports kept their names; the engine skill `ado-mcp` is now `forge-ops`, and the MCP namespace `mcp__plugin_terylon-devops_ado__*` is now `mcp__plugin_terylon-ado_ado__*`.
