# terylon-devops

The Azure DevOps layer of the `terylon` marketplace. It provides ADO mechanics and the PR workflow on top of `terylon-git`. Both `terylon-product` and `terylon-dev` declare it as a dependency, so it is installed automatically.

## Audience

Everyone working on top of Azure DevOps — directly for the PR workflow, indirectly as the foundation of the other Terylon plugins.

## What it contains

**Engine** (it carries the judgment, it never writes anywhere itself):

- **`ado-mcp`** — the canonical source of truth for ADO mechanics: call shapes, URL parsing, `repositoryId` resolution, diff recipes, thread operations. It is loaded by name from other skills; the user does not invoke it.

**Transport skills** (they parse URLs, fetch, write back):

- **`create-pr`** — open a pull request for the current branch: the work items it belongs to, the description (delegated to `write-pr-description`), optionally reviewers and auto-complete. It owns the PR *shell*; every gate that reaches outside git — pushing, emailing a reviewer, setting auto-complete — waits for consent even under `--auto`.
- **`review-pr`** — review a PR and post the findings as inline suggestion blocks or PR-wide threads
- **`write-pr-description`** — a PR description from the branch diff, and the PR *body* whether `create-pr` calls it or you do
- **`update-pr-checklist`** — reads a pull request's test plan out of the description and writes results back into it: the plan rewritten into labelled groups, plus one evidence thread. It checks nothing and holds no `Agent` — a caller supplies the outcome, normally the `tester` agent from `terylon-test`. The last gate before the write is its own: an item is ticked only if the outcome shows it executed, passed, and covered by something bearing on it.
- **`update-work-item-checklist`** — the sibling of `update-pr-checklist` for a work item's acceptance criteria. Reads the criteria out and writes a tester's results back: the earned ticks annotated **in place** — the author's structure is the contract, so it is not regrouped — and everything else with its reason in a work-item comment. Like its sibling it checks nothing, holds no `Agent`, and ticks only what the outcome shows executed, passed, and covered.
- **`address-pr-comments`** — apply reviewer comments from your own PR locally

**Agent:**

- **`pr-reviewer`** — audit of someone else's PR: isolated worktree, multi-lens adversarially verified pass, posting the confirmed findings in a single round

## Dependencies

- **`terylon-git`** — the git-only foundation. It supplies the `create-workspace` and `code-review` skills plus the `code-reviewer` agent, which this plugin's skills and agents load **by name**. Declared in `plugin.json#dependencies`, so it is installed automatically — you never enable it separately.

## MCP server

The plugin registers the `ado` server (`@azure-devops/mcp`) through its own `.mcp.json`. The consumer gets it automatically when enabling the plugin — no manual installation. At runtime the tools are namespaced as `mcp__plugin_terylon-devops_ado__*`.

**The version is pinned** — `@azure-devops/mcp@2.9.0`, not a floating `latest`. `npx -y <pkg>` without a version resolves to whatever is newest at the moment each consumer starts a session, so two people on the same marketplace commit can hold different tool sets, and a breaking release reaches everyone at once with nothing in this repository having changed. The recipes in `ado-mcp` are written against a known tool surface; a pin is what makes them a contract rather than a hope. Raise it deliberately, in its own commit, after checking the recipes still hold.

The organisation the server targets is **configurable**: the `.mcp.json` passes `${TERYLON_ADO_ORG:-janecekvit}` as the org argument, so a consuming organisation sets the `TERYLON_ADO_ORG` environment variable (its bare org name) in `.claude/settings.json` and everything else — project and repo — derives from the repository's git remote at runtime. The variable is the one irreducible config point, because the server reads the org at startup, before any git command can run. See *Point it at your Azure DevOps organization* in the root `README.md`.

Authentication is left at the package's own default — the `.mcp.json` passes no `-a` argument. Outside GitHub Codespaces that default is `interactive`, an MSAL loopback login against the consumer's own Entra identity, so no tenant or secret is baked into the repository and the server stays organisation-agnostic in the same way `TERYLON_ADO_ORG` keeps the org agnostic.

**If a session fails with `AADSTS70007: unsupported mode 'query'` before any Azure DevOps call is made**, that is [microsoft/azure-devops-mcp#1451](https://github.com/microsoft/azure-devops-mcp/issues/1451) — the interactive flow asked Entra for an authorization code with `response_mode=query` while Microsoft's app registration permitted only `fragment`/`form_post`. The issue is closed but names no fixed version, so whether the pinned `2.9.0` carries the fix is unverified here. The workaround is to add `"-a", "azcli"` back to the args, which takes the token from the consumer's own `az login` via `AzureCliCredential` instead.

Each consumer therefore needs the Azure CLI installed and logged in (`az login`) against a tenant with access to their organisation. `AzureCliCredential` uses the active `az` tenant; if a consumer's default `az` tenant is not the one backing their organisation, they append `-t <tenant-guid>` to the args to pin it — otherwise no tenant argument is needed.

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
/terylon-devops:create-pr [--base=<ref>] [--title=<text>] [--draft] [--work-items=<ids>]
                          [--reviewers=<emails>] [--auto-complete[=<strategy>]] [--auto | --dry-run]
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
