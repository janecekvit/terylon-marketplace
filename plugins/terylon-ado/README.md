# terylon-ado

The **Azure DevOps adapter**. It fills the `terylon-forge` port with ADO mechanics and registers the Azure DevOps MCP server.

## Audience

Anyone whose repositories are hosted on Azure DevOps. Enable it beside a role plugin — `terylon-dev`, `terylon-product` or `terylon-test` — and every transport in the port targets ADO.

## Where it sits

```
terylon-core .................. delegate-to-repo-agents, measure-token-spend
    ▲
    └── terylon-git ........... create-workspace, code-review, finish-branch, code-reviewer
           ▲
           └── terylon-forge ... the port: transports, pr-reviewer, resolve-forge
                  ▲
                  ├── terylon-ado  ← you are here
                  ├── terylon-github
                  ├── terylon-product
                  ├── terylon-dev
                  └── terylon-test
```

`terylon-forge` is the only declared dependency; everything below it arrives with it.

**The load edge points the other way.** The port's transports load `forge-ops` — this plugin's one skill — while the dependency in `plugin.json` points from here up to the port. That inversion is deliberate and is the whole reason a GitHub repository can use the same transports without an Azure DevOps server: see *Where a component belongs* in `plugins/CLAUDE.md`.

## What it contains

**Skill:**

- **`forge-ops`** — the ADO body of the port. Every operation's exact tool name and argument shape, URL parsing, `repositoryId` resolution, PR and work-item metadata, diff recipes, thread and comment shapes, field encodings, eligibility flags and prior-run detection. Knowledge only: the caller issues its own calls and stamps its own footer.

**MCP server:** the `ado` server, declared in `.mcp.json` and pinned to `@azure-devops/mcp@2.9.0`. At runtime its tools are namespaced `mcp__plugin_terylon-ado_ado__*`.

## Configuration

**`TERYLON_ADO_ORG` is required and has no default.** Set it in the consuming repository's `.claude/settings.json`:

```json
{
  "env": {
    "TERYLON_ADO_ORG": "your-organisation"
  }
}
```

It is the bare organisation **name** — the first path segment of `https://dev.azure.com/`**`your-organisation`**`/…` — not the URL. The MCP server takes it as a positional argument and reads it at startup, before any git command can run, which is why it is the one value that cannot be derived.

**There used to be a hard-coded default, and it was removed.** A consumer who forgot the variable did not fail: the server silently targeted whichever organisation the marketplace author happened to use, and failed later, at the first call, with an authorization error naming an organisation nobody had chosen. A missing required value must fail where it is missing.

Everything else derives at runtime:

| Value | Where it comes from |
|---|---|
| Organisation | `TERYLON_ADO_ORG` — required |
| Project / repo | the consuming repository's `git remote`, or any URL you paste |
| PR / work-item target | the URL you pass the skill |

`TERYLON_ADO_PROJECT` overrides the project for the rare repository whose git remote is not its ADO project. Normally you never set it.

## Authentication

Left at the package's own default — `.mcp.json` passes no `-a` argument. Outside GitHub Codespaces that default is `interactive`, an MSAL loopback login against the consumer's own Entra identity, so no tenant or secret is baked into the repository.

**If a session fails with `AADSTS70007: unsupported mode 'query'` before any Azure DevOps call is made**, that is [microsoft/azure-devops-mcp#1451](https://github.com/microsoft/azure-devops-mcp/issues/1451) — the interactive flow asked Entra for an authorization code with `response_mode=query` while Microsoft's app registration permitted only `fragment` / `form_post`. The issue is closed but names no fixed version, so whether the pinned `2.9.0` carries the fix is **unverified here**. The workaround is to add `"-a", "azcli"` back to the args, which takes the token from the consumer's own `az login` via `AzureCliCredential` instead.

Going that route, each consumer needs the Azure CLI installed and logged in (`az login`) against a tenant with access to their organisation. `AzureCliCredential` uses the active `az` tenant; if that is not the one backing the organisation, append `-t <tenant-guid>` to the args to pin it.

**The server version is pinned** — `@azure-devops/mcp@2.9.0`, not a floating `latest`. `npx -y <pkg>` without a version resolves to whatever is newest when each consumer starts a session, so two people on the same marketplace commit can hold different tool sets, and a breaking release reaches everyone at once with nothing in this repository having changed. The recipes in `forge-ops` are written against a known tool surface; the pin is what makes them a contract rather than a hope. Raise it deliberately, in its own commit, after checking the recipes still hold.

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
    "terylon-ado@terylon": true,
    "terylon-dev@terylon": true
  },
  "env": {
    "TERYLON_ADO_ORG": "your-organisation"
  }
}
```

`terylon-forge`, `terylon-git` and `terylon-core` install automatically as dependencies.

> **Migrating from `terylon-devops`.** That plugin no longer exists; it split into the port and this adapter. Replace `"terylon-devops@terylon"` with **both** `"terylon-ado@terylon"` and whichever role plugins you already had. The transports kept their names, so nothing that loaded `create-pr` or `review-pr` changes. Two things do: the engine skill `ado-mcp` is now `forge-ops`, and the MCP namespace `mcp__plugin_terylon-devops_ado__*` is now `mcp__plugin_terylon-ado_ado__*`.
