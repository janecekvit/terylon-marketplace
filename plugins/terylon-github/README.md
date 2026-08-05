# terylon-github

The **GitHub adapter**. It fills the `terylon-forge` port with `gh` CLI mechanics.

## Audience

Anyone whose repositories are hosted on GitHub. Enable it beside a role plugin — `terylon-dev`, `terylon-product` or `terylon-test` — and every transport in the port targets GitHub.

## Where it sits

```
terylon-core .................. delegate-to-repo-agents, measure-token-spend
    ▲
    └── terylon-git ........... create-workspace, code-review, finish-branch, code-reviewer
           ▲
           └── terylon-forge ... the port: transports, pr-reviewer, resolve-forge
                  ▲
                  ├── terylon-github  ← you are here
                  ├── terylon-ado
                  ├── terylon-product
                  ├── terylon-dev
                  └── terylon-test
```

`terylon-forge` is the only declared dependency; everything below it arrives with it.

**The load edge points the other way.** The port's transports load `forge-ops` — this plugin's one skill — while the dependency in `plugin.json` points from here up to the port. That inversion is what lets one set of transports serve two platforms: see *Where a component belongs* in `plugins/CLAUDE.md`.

## What it contains

**Skill:**

- **`forge-ops`** — the GitHub body of the port. The same operations its Azure DevOps sibling implements, written as `gh` invocations: URL parsing, repository identity, pull request and issue metadata, diff recipes, review-thread reconstruction, inline-comment anchoring, label and sub-issue mechanics, eligibility flags and prior-run detection. Knowledge only: the caller issues its own commands and stamps its own footer.

**No MCP server.** This plugin ships no `.mcp.json`, so a repository that enables it pays no tool schemas and configures no token.

## Prerequisites

**`gh`, authenticated.** One command, once per machine:

```bash
gh auth login
```

That is the entire configuration. There is **no organisation environment variable** and nothing to set in `settings.json`: GitHub carries the owner in every URL and in the git remote, so the adapter derives it at runtime. The asymmetry with `terylon-ado`, which needs `TERYLON_ADO_ORG` before its server can start, is real and belongs to the platform rather than to the port.

## Why the CLI rather than an MCP server

| | `gh` CLI | GitHub MCP server |
|---|---|---|
| Install | already present on Windows and Debian alike | a Docker image, or a hosted endpoint |
| Credentials | whatever `gh auth login` established | a personal access token in configuration |
| Context cost | none until a command runs | every tool schema, every session |
| Coverage | `gh api` reaches all of REST and GraphQL | the tools the server chose to expose |

`gh api` is the reach-through for what the first-class commands do not cover — review-comment threads, sub-issues, and resolving a thread through GraphQL.

## Which forge a run targets

`resolve-forge`, in `terylon-forge`, decides: an explicit URL first, then `TERYLON_FORGE`, then the git remote's host, and it stops rather than guessing. Set `TERYLON_FORGE=github` only when the remote does not say so on its own.

With both adapters enabled the engine is addressed plugin-qualified — `terylon-github:forge-ops` — because both ship a skill of that name.

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
    "terylon-github@terylon": true,
    "terylon-dev@terylon": true
  }
}
```

`terylon-forge`, `terylon-git` and `terylon-core` install automatically as dependencies.

Note that the marketplace **source** stays on Azure DevOps — that is where this repository lives — while your work is on GitHub. The two are independent.
