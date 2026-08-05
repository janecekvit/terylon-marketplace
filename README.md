# Terylon Marketplace

Internal Claude Code plugin marketplace for the development workflow, on Azure DevOps or on GitHub.

## Plugins

```
terylon-core (root — no dependencies)
    ▲
    └── terylon-git
           ▲
           └── terylon-forge          the forge port — ships no adapter
                  ▲
                  ├── terylon-ado        adapter: Azure DevOps
                  ├── terylon-github     adapter: GitHub
                  ├── terylon-product
                  ├── terylon-dev
                  └── terylon-test
```

| Plugin | Audience | Dependencies |
|---|---|---|
| `terylon-core` | every repository — the shared conventions and token-spend measurement | none |
| `terylon-git` | any git repository — worktree isolation, review engine, code reviewer | `terylon-core` |
| `terylon-forge` | everyone working through pull requests — the PR workflow, written against operations rather than a platform | `terylon-git` |
| `terylon-ado` | repositories on Azure DevOps — ADO mechanics and the ADO MCP server | `terylon-forge` |
| `terylon-github` | repositories on GitHub — the same mechanics over the `gh` CLI, no server | `terylon-forge` |
| `terylon-product` | product owner / PM — user stories, Feature specs | `terylon-forge` |
| `terylon-dev` | developers — brainstorm → plan → build (TDD) → finish | `terylon-git`, `terylon-forge`, `terylon-core` |
| `terylon-test` | anyone holding a checklist — verifies a test plan and acceptance criteria against the artifact | `terylon-forge`, `terylon-core` |

`terylon-core` is the **root**: no dependencies of its own, no git, no forge, no MCP server, and everything else sits on it. It carries only what every plugin above may need — the convention for dispatching agents the target repository ships, and the measurement of what a run cost. It is worth enabling alone for the measurement.

`terylon-git` is deliberately forge-agnostic: everything in it exercises git and nothing more, so a repository hosted anywhere can use the worktree and review machinery without pulling in a server it has no use for.

### The port and its two adapters

`terylon-forge` carries the pull request workflow — review, description, comment handling, checklist write-back — written against an **operation catalog** rather than against one platform. Two plugins implement those operations, each shipping a skill named `forge-ops`:

| Adapter | Mechanism | Configuration |
|---|---|---|
| `terylon-ado` | the `ado` MCP server | `TERYLON_ADO_ORG`, required |
| `terylon-github` | the `gh` CLI | `gh auth login`, and nothing else |

**The port declares no adapter, on purpose.** Declaring one would install an Azure DevOps MCP server in every GitHub repository. So a consumer enables **two keys** — a role plugin and the adapter their repositories are hosted on — and the port arrives as a dependency of both.

Which adapter a run uses is decided by `resolve-forge`: an explicit URL first, then `TERYLON_FORGE`, then the host of the git remote. There is no default; with nothing to go on it stops and asks. Enabling both adapters is supported, and `TERYLON_FORGE` then decides.

> **`terylon-forge` and `terylon-ado` replace `terylon-devops`.** That plugin no longer exists — it mixed portable transports with Azure DevOps mechanics, and the two separated along that seam. If `.claude/settings.json` enables `terylon-devops@terylon`, replace it with `terylon-ado@terylon`; the port installs as its dependency, and the transports kept their names. Two things did change: the engine skill `ado-mcp` is now `forge-ops`, and the MCP namespace `mcp__plugin_terylon-devops_ado__*` is now `mcp__plugin_terylon-ado_ado__*`.
>
> **`terylon-core` replaces `terylon-metrics`.** That plugin no longer exists either. Rename the key to `terylon-core@terylon` — nothing else changes, because skills are addressed by name. `terylon-dev` also no longer requires the `claude-plugins-official` marketplace.
>
> **`write-plan` and `run-build-loop` moved from `terylon-core` to `terylon-dev`** in `terylon-core@1.1.0`. Only `terylon-dev` ever consumed them, and the root installs for everyone. Callers are unaffected — skills are addressed by name — but a repository that enabled `terylon-core` alone to get the plan format now needs `terylon-dev`.

Every slug carries the `terylon-` prefix. The prefix is intentionally redundant with the `@terylon` marketplace suffix — thanks to it, typing `/terylon` makes autocomplete show commands from all plugins in one filtered list.

Plugins are **not inherited**. Sharing works through `dependencies` in `plugin.json`: both `terylon-product` and `terylon-dev` declare `terylon-forge`, which is therefore installed automatically.

## Setup in a consuming repo

Into `.claude/settings.json` of the product repo (commit it — it is shared with the team). Enable a role plugin **and** the adapter for wherever your repositories live:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
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
    "terylon-ado@terylon": true,
    "terylon-dev@terylon": true
  }
}
```

On GitHub, swap `terylon-ado@terylon` for `terylon-github@terylon`.

### Point it at your forge

**On GitHub there is nothing to configure.** Run `gh auth login` once per machine; the owner and repository come from the git remote, and the adapter registers no server.

**On Azure DevOps, one variable is required and has no default:**

```json
{
  "env": {
    "TERYLON_ADO_ORG": "your-organisation"
  }
}
```

`TERYLON_ADO_ORG` is the bare organisation **name** — the first path segment of your ADO URL, `https://dev.azure.com/`**`your-organisation`**`/…` — not the URL itself: the `ado` MCP server takes the name as a positional argument. It is the one value you must configure, because the server reads it at startup, before any git command can run.

**It used to fall back to a hard-coded organisation and no longer does.** A consumer who forgot the variable did not fail; they silently targeted whichever organisation the marketplace author happened to use, and found out at the first call, from an authorization error naming an organisation nobody had chosen. A missing required value fails where it is missing.

Everything else resolves on its own:

| Value | Where it comes from |
|---|---|
| Forge | an explicit URL, else `TERYLON_FORGE`, else the git remote's host |
| Organisation / owner | `TERYLON_ADO_ORG` on ADO — required; the git remote on GitHub |
| Project / repo | the consuming repository's `git remote`, or any URL you paste |
| Work-item / issue / PR target | the URL you pass the skill |

A `TERYLON_ADO_PROJECT` override exists for the rare repository whose git remote is not its ADO project; normally you never set it.

Note that the marketplace **source** and your **work** are independent: `extraKnownMarketplaces.terylon.source.url` above is where this repository lives (leave it, or fork it and point at your fork), and it stays on Azure DevOps even when your own repositories are on GitHub.

**Fork it and you inherit its committed settings**, which is why this repository's own `.claude/settings.json` carries **no `TERYLON_ADO_ORG`**. A committed value would travel into every fork and quietly point it at this owner's organisation — the same failure the removed `.mcp.json` fallback produced, arriving through a file nobody reads as code. Set the variable in your own `~/.claude/settings.json`, or in the settings of the repositories you work in; never in a marketplace you expect anyone to fork.

> **Why `"source": "git"`?** The client schema `extraKnownMarketplaces.<name>.source.source` accepts `"git"` for ordinary git remotes. `"git-subdir"` is a different schema, used in `marketplace.json#plugins[].source` to declare the sources of individual plugins — the client rejects it.
>
> `autoUpdate: true` is a sibling of `source` (not nested inside it) and tells Claude Code to refresh the marketplace in the background.

## Local marketplace development

When testing from a feature branch, override `ref` in your **local** `.claude/settings.local.json` (gitignored — never commit it):

```json
{
  "extraKnownMarketplaces": {
    "terylon": {
      "source": {
        "source": "git",
        "url": "https://dev.azure.com/janecekvit/Dev/_git/TerylonMarketplace",
        "ref": "feat/<your-branch>"
      },
      "autoUpdate": true
    }
  }
}
```

## Authentication

**The marketplace source** is an Azure DevOps repository, whichever forge your own work is on:

- **Manual install / update:** Claude Code uses the existing git credential helper — both `git-credential-manager` (Entra ID) and a PAT in `~/.git-credentials` work.
- **Automatic background update:** Azure DevOps has no documented equivalent of `GITHUB_TOKEN`. Use a git-level credential helper, or stay on `ref: main` and run `/plugin marketplace update` manually.

**Your own forge** authenticates separately: `terylon-ado` through the MCP server's own interactive Entra login, `terylon-github` through `gh auth login`.

## Versioning

Every `plugin.json` carries a `version`. A consumer receives an update **only** when that field changes — a push to `main` without a bump is a no-op for consumers.

---

> Plugin authors: directory conventions, versioning, the engine/transport pattern and the port/adapter exception are described in `plugins/CLAUDE.md`.
