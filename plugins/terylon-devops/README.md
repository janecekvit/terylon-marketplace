# terylon-devops

The Azure DevOps layer of the `terylon` marketplace. It provides ADO mechanics and the PR workflow on top of `terylon-git`. Both `terylon-product` and `terylon-dev` declare it as a dependency, so it is installed automatically.

## Audience

Everyone working on top of Azure DevOps — directly for the PR workflow, indirectly as the foundation of the other Terylon plugins.

## What it contains

**Engine** (it carries the judgment, it never writes anywhere itself):

- **`ado-mcp`** — the canonical source of truth for ADO mechanics: call shapes, URL parsing, `repositoryId` resolution, diff recipes, thread operations. It is loaded by name from other skills; the user does not invoke it.

**Transport skills** (they parse URLs, fetch, write back):

- **`review-pr`** — review a PR and post the findings as inline suggestion blocks or PR-wide threads
- **`write-pr-description`** — a PR description from the branch diff
- **`update-pr-checklist`** — reads a pull request's test plan out of the description and writes results back into it: the plan rewritten into labelled groups, plus one evidence thread. It checks nothing and holds no `Agent` — a caller supplies the outcome, normally the `tester` agent from `terylon-test`. The last gate before the write is its own: an item is ticked only if the outcome shows it executed, passed, and covered by something bearing on it.
- **`update-work-item-checklist`** — the sibling of `update-pr-checklist` for a work item's acceptance criteria. Reads the criteria out and writes a tester's results back: the earned ticks annotated **in place** — the author's structure is the contract, so it is not regrouped — and everything else with its reason in a work-item comment. Like its sibling it checks nothing, holds no `Agent`, and ticks only what the outcome shows executed, passed, and covered.
- **`address-pr-comments`** — apply reviewer comments from your own PR locally

**Agent:**

- **`pr-reviewer`** — audit of someone else's PR: isolated worktree, multi-lens adversarially verified pass, posting the confirmed findings in a single round

## Dependencies

- **`terylon-git`** — the git-only foundation. It supplies the `create-workspace` and `code-review` skills plus the `code-reviewer` agent, which this plugin's skills and agents load **by name**. Declared in `plugin.json#dependencies`, so it is installed automatically — you never enable it separately.

## MCP server

The plugin registers the `ado` server (`@azure-devops/mcp`, hard-wired to the `janecekvit` organisation) through its own `.mcp.json`. The consumer gets it automatically when enabling the plugin — no manual installation. At runtime the tools are namespaced as `mcp__plugin_terylon-devops_ado__*`.

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
    "terylon-devops@terylon": true
  }
}
```

## Usage

```
/terylon-devops:review-pr <PR-URL> [--auto | --dry-run]
/terylon-devops:write-pr-description [<PR-URL>] [--base=<ref>] [--auto | --dry-run]
/terylon-devops:address-pr-comments <PR-URL> [--auto | --dry-run]
/terylon-devops:update-pr-checklist <PR-URL> [--results=<path>] [--dry-run | --auto]
/terylon-devops:update-work-item-checklist <WI-URL-or-id> [--results=<path>] [--dry-run | --auto]
```

The two `update-*-checklist` skills are the transport half of the verification pipeline in `terylon-test`; the `tester` agent normally drives them, but each carries its own slash command.

Worktree isolation and the local review engine come from `terylon-git`, installed automatically as a dependency:

```
/terylon-git:create-workspace "<name>" [--branch=<branch>] [--from=<base-ref>] [--into=<dir>] [--setup]
/terylon-git:code-review
```
