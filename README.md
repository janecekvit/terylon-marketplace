# Terylon Marketplace

Internal Claude Code plugin marketplace for the development workflow on top of Azure DevOps.

## Plugins

```
terylon-core (root — no dependencies)
    ▲
    └── terylon-git
           ▲
           └── terylon-devops
                  ▲
                  ├── terylon-product
                  ├── terylon-dev
                  └── terylon-test
```

| Plugin | Audience | Dependencies |
|---|---|---|
| `terylon-core` | every repository — the shared conventions and token-spend measurement | none |
| `terylon-git` | any git repository — worktree isolation, review engine, code reviewer | `terylon-core` |
| `terylon-devops` | Azure DevOps — ADO mechanics, PR review and description | `terylon-git` |
| `terylon-product` | product owner / PM — user stories, Feature specs | `terylon-devops` |
| `terylon-dev` | developers — plan → build (TDD) → finish | `terylon-git`, `terylon-devops`, `terylon-core` |
| `terylon-test` | anyone holding a checklist — verifies a test plan and acceptance criteria against the artifact | `terylon-devops`, `terylon-core` |

`terylon-core` is the **root**: no dependencies of its own, no git, no forge, no MCP server, and everything else sits on it. It carries only what every plugin above may need — the convention for dispatching agents the target repository ships, and the measurement of what a run cost. It is worth enabling alone for the measurement.

`terylon-git` is deliberately forge-agnostic: everything in it exercises git and nothing more, so a repository hosted anywhere can use the worktree and review machinery without pulling in an ADO MCP server it has no use for. `terylon-devops` adds that layer on top.

> **`terylon-core` replaces `terylon-metrics`.** That plugin no longer exists. If `.claude/settings.json` enables `terylon-metrics@terylon`, rename the key to `terylon-core@terylon` — nothing else changes, because skills are addressed by name. `terylon-dev` also no longer requires the `claude-plugins-official` marketplace.
>
> **`write-plan` and `run-build-loop` moved from `terylon-core` to `terylon-dev`** in `terylon-core@1.1.0`. Only `terylon-dev` ever consumed them, and the root installs for everyone. Callers are unaffected — skills are addressed by name — but a repository that enabled `terylon-core` alone to get the plan format now needs `terylon-dev`.

Every slug carries the `terylon-` prefix. The prefix is intentionally redundant with the `@terylon` marketplace suffix — thanks to it, typing `/terylon` makes autocomplete show commands from all plugins in one filtered list.

Plugins are **not inherited**. Sharing works through `dependencies` in `plugin.json`: both `terylon-product` and `terylon-dev` declare `terylon-devops`, which is therefore installed automatically.

## Setup in a consuming repo

Into `.claude/settings.json` of the product repo (commit it — it is shared with the team):

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
    "terylon-devops@terylon": true,
    "terylon-dev@terylon": true
  }
}
```

### Point it at your Azure DevOps organization

The marketplace defaults to the `janecekvit` organisation, but it runs against **any** Azure DevOps organisation. Set one environment variable — your organisation name — in the same `.claude/settings.json`:

```json
{
  "env": {
    "TERYLON_ADO_ORG": "your-organisation"
  }
}
```

`TERYLON_ADO_ORG` is the bare organisation **name** — the first path segment of your ADO URL, `https://dev.azure.com/`**`your-organisation`**`/…` — not the URL itself: the `ado` MCP server takes the name as a positional argument. It is the one value you must configure, because the server reads it at startup, before any git command can run. Everything else resolves on its own:

| Value | Where it comes from |
|---|---|
| Organisation | `TERYLON_ADO_ORG`, else `janecekvit` |
| Project / repo | the consuming repository's `git remote`, or any URL you paste |
| Work-item / PR target | the URL you pass the skill |

A `TERYLON_ADO_PROJECT` override exists for the rare repository whose git remote is not its ADO project; normally you never set it.

Note the two are independent: `extraKnownMarketplaces.terylon.source.url` above is where the marketplace **source** lives (this repository — leave it, or fork it and point at your fork), while `TERYLON_ADO_ORG` is where **your work** lives.

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

## Authentication (Azure DevOps)

- **Manual install / update:** Claude Code uses the existing git credential helper — both `git-credential-manager` (Entra ID) and a PAT in `~/.git-credentials` work.
- **Automatic background update:** Azure DevOps has no documented equivalent of `GITHUB_TOKEN`. Use a git-level credential helper, or stay on `ref: main` and run `/plugin marketplace update` manually.

## Versioning

Every `plugin.json` carries a `version`. A consumer receives an update **only** when that field changes — a push to `main` without a bump is a no-op for consumers.

---

> Plugin authors: directory conventions, versioning and the engine/transport pattern are described in `plugins/CLAUDE.md`.
