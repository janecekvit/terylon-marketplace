# Setting up a consumer repository

What a product repository configures to use this marketplace, in full: the settings file, which two plugins to enable, how the forge is pointed at, and how each side authenticates. The root [`README.md`](../../README.md) carries the short version; this is the one to open when the short version is not enough.

## The settings file

Into `.claude/settings.json` of the product repository. **Commit it** — it is shared with the team.

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "extraKnownMarketplaces": {
    "terylon": {
      "source": {
        "source": "git",
        "url": "https://github.com/janecekvit/terylon-marketplace.git",
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

| Key | Decides |
|---|---|
| `source.source` | `"git"` — an ordinary git remote. `"git-subdir"` is a **different schema**, used inside `marketplace.json#plugins[].source` to declare where each plugin lives in this repository; the client rejects it here |
| `source.ref` | the branch tracked. `main` for everyone; a feature branch only in a local override, see [marketplace-development](./marketplace-development.md) |
| `autoUpdate` | a **sibling** of `source`, not a field inside it. `true` refreshes the marketplace in the background; without it, `/plugin marketplace update` is manual |
| `enabledPlugins` | **two keys** — a role plugin, and the adapter for wherever your repositories are hosted |

## Why two keys

`terylon-forge` carries the pull request workflow written against an operation catalog, and **declares no adapter on purpose**. Declaring one would install an Azure DevOps MCP server in every GitHub repository. So the consumer names the adapter, and the port arrives as its dependency.

```
enable: terylon-dev@terylon        ──▶ pulls terylon-forge, terylon-git, terylon-core
enable: terylon-ado@terylon        ──▶ pulls terylon-forge; adds forge-ops (ADO) + connect, which registers the ado server
        or terylon-github@terylon  ──▶ pulls terylon-forge; adds forge-ops (gh). No server.
```

Dependencies are **declared, not inherited**: a plugin arrives because something enabled declares it. Enabling both adapters is supported — `TERYLON_FORGE` then decides which a run uses. The reasoning is in [`architecture/port-and-adapter-split.md`](../architecture/port-and-adapter-split.md).

| Role plugin | Audience |
|---|---|
| `terylon-dev` | developers — brainstorm, plan, build (TDD), finish |
| `terylon-product` | product owner / PM — user stories, Feature specs |
| `terylon-test` | anyone holding a checklist that decides something |
| `terylon-core` | worth enabling alone, for the token-spend measurement |

## Point it at your forge

**On GitHub there is nothing to configure.** Run `gh auth login` once per machine. The owner comes from the git remote and the adapter registers no server.

**On Azure DevOps, three variables are required and have no default**, and they go into your **own** `~/.claude/settings.json` — not the repository's:

```json
{
  "env": {
    "ADO_ORGANIZATION": "contoso",
    "ADO_MCP_CLIENT_ID": "00000000-0000-0000-0000-000000000000",
    "ADO_MCP_TENANT_ID": "00000000-0000-0000-0000-000000000000"
  }
}
```

| Variable | What |
|---|---|
| `ADO_ORGANIZATION` | the bare organisation **name** — the first path segment of `https://dev.azure.com/`**`contoso`**`/…`, not the URL. Every `mcp__ado__*` call passes it as `orgName`; it is never part of the server's URL |
| `ADO_MCP_CLIENT_ID` | the client id of your own Entra app registration: a public client, redirect `http://localhost:3118/callback`, delegated permissions on the *Azure DevOps MCP* enterprise app, admin-consented |
| `ADO_MCP_TENANT_ID` | the tenant that app registration lives in |
| `ADO_PROJECT` | optional — see below |

Then, once per machine:

1. Run `terylon-ado`'s **`connect`** skill — `node "${CLAUDE_PLUGIN_ROOT}/skills/connect/scripts/connect.js"`. It registers Microsoft's remote Azure DevOps MCP server, `https://mcp.dev.azure.com`, at the **user scope** as `ado`. Re-running it with nothing changed touches nothing.
2. Start a new session and sign in: `/mcp` → `ado` → **Authenticate**. On a remote box, forward the callback port first — `ssh -L 3118:localhost:3118 <box>` — and open the link in your PC's browser.
3. `check-access` says what is still missing, if anything.

The plugin ships no `.mcp.json` for the server because a plugin `.mcp.json` does not substitute variables inside `oauth`, and the ids are configuration, not code; [`plugins/terylon-ado/README.md`](../../plugins/terylon-ado/README.md) has the measurement and the registered fields.

**It used to fall back to a hard-coded organisation and no longer does**, so forgetting it now fails immediately instead of silently targeting somebody else's organisation. The decision and the failure it prevents are stated in the root [`CLAUDE.md`](../../CLAUDE.md), under *Azure DevOps, as a consumer's forge*; when the failure lands, [`runbooks/ado-mcp-authorization-error.md`](../runbooks/ado-mcp-authorization-error.md) is the way out.

Everything else resolves on its own:

| Value | Where it comes from |
|---|---|
| Forge | an explicit URL, else `TERYLON_FORGE`, else the git remote's host, else it stops and asks |
| Organisation / owner | `ADO_ORGANIZATION` on Azure DevOps — required; the git remote on GitHub |
| Project / repository | `ADO_PROJECT` if set, else the consuming repository's `git remote`, or any URL you paste |
| Work item / issue / pull request target | the URL you pass the skill |

An `ADO_PROJECT` override exists for the rare repository whose git remote is not its Azure DevOps project. Normally you never set it, and setting it to work around a wrong organisation hides the real problem.

**The marketplace source and your work are independent.** `extraKnownMarketplaces.terylon.source.url` is where this repository lives — the public GitHub repository, whichever forge your own repositories are on. Leave it, or fork it and point at your fork.

## Authentication — two separate things

```
   the MARKETPLACE SOURCE                    YOUR OWN FORGE
   (this repository, public on GitHub)       (wherever your work lives)
            │                                        │
   no credential — an anonymous clone       ADO   ──▶ OAuth as you, signed in once in /mcp
                                            GitHub ──▶ gh auth login
```

| Path | How |
|---|---|
| Install, manual update and **automatic background update** of the marketplace | an anonymous `git clone` of a public repository — nothing to configure |
| Azure DevOps API calls | OAuth through your own app registration, signed in once in `/mcp` in an interactive session. A headless run cannot open a browser; Terylon supplies its token through its connector's proxy (Terylon work item #337) |
| GitHub API calls | `gh auth login` |

A background update can still fail quietly when the machine cannot reach `github.com`, and the result looks exactly like a forgotten version bump. [`runbooks/consumer-did-not-get-the-update.md`](../runbooks/consumer-did-not-get-the-update.md) separates the two.

## Never commit `ADO_ORGANIZATION` or the two ids

Set them in your **own** `~/.claude/settings.json` — never in a repository, and least of all in a marketplace you expect anyone to fork, because **a fork inherits committed settings**. The organisation would silently target yours; the client and tenant ids name your own app registration, which is configuration, not code. Why this repository's own `.claude/settings.json` therefore carries no `env` block is in the root [`CLAUDE.md`](../../CLAUDE.md).

## Where it lives

| File | Role |
|---|---|
| `README.md` | the quickstart this article expands |
| `.claude-plugin/marketplace.json` | `plugins[]` — the published plugins, their sources and descriptions |
| `plugins/terylon-ado/skills/connect/SKILL.md` | `connect` — registers the remote `ado` server at the user scope from `ADO_MCP_CLIENT_ID` and `ADO_MCP_TENANT_ID` |
| `plugins/terylon-ado/skills/check-access/SKILL.md` | `check-access` — which of the four variables is missing, and whether the registration matches them |
| `plugins/terylon-forge/.claude-plugin/plugin.json` | `dependencies` — `terylon-git` only, which is why an adapter must be enabled by hand |
| `plugins/terylon-forge/skills/resolve-forge/SKILL.md` | `resolve-forge` — the precedence that resolves the forge at runtime |
| `CLAUDE.md` | *Azure DevOps, as a consumer's forge* — why no organisation is committed and no `env` block exists here |
