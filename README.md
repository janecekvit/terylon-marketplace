# Terylon Marketplace

Internal Claude Code plugin marketplace for the development workflow on top of Azure DevOps.

## Plugins

| Plugin | Audience | Dependencies |
|---|---|---|
| `terylon-git` | any git repository — worktree isolation, review engine, code reviewer | none |
| `terylon-devops` | Azure DevOps — ADO mechanics, PR review and description | `terylon-git` |
| `terylon-product` | product owner / PM — user stories, Feature specs | `terylon-devops` |
| `terylon-dev` | developers — plan → build (TDD) → finish | `terylon-git`, `terylon-devops`, `superpowers` |

`terylon-git` is deliberately forge-agnostic: it needs git and nothing else, so a repository hosted anywhere can use the worktree and review machinery without pulling in an ADO MCP server it has no use for. `terylon-devops` adds that layer on top.

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

> **Why `"source": "git"`?** The client schema `extraKnownMarketplaces.<name>.source.source` accepts `"git"` for ordinary git remotes. `"git-subdir"` is a different schema, used in `marketplace.json#plugins[].source` to declare the sources of individual plugins — the client rejects it.
>
> `autoUpdate: true` is a sibling of `source` (not nested inside it) and tells Claude Code to refresh the marketplace in the background.

`terylon-dev` additionally requires the `claude-plugins-official` marketplace to be enabled, because of the `superpowers` plugin.

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
