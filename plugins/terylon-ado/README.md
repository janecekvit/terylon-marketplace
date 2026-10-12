# terylon-ado

The **Azure DevOps adapter**. It fills the `terylon-forge` port with ADO mechanics and registers Microsoft's remote Azure DevOps MCP server, through its `connect` skill.

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

**The load edge points the other way.** The port's transports load `forge-ops` — this plugin's engine skill — while the dependency in `plugin.json` points from here up to the port. That inversion is deliberate and is the whole reason a GitHub repository can use the same transports without an Azure DevOps server: see *Where a component belongs* in `plugins/CLAUDE.md`.

## What it contains

**Skills:**

| Skill | What it does |
|---|---|
| **`forge-ops`** | the ADO body of the port. Every operation's exact tool name and argument shape, URL parsing, `repositoryId` resolution, PR and work-item metadata, diff recipes, thread and comment shapes, field encodings, eligibility flags and prior-run detection. Knowledge only: the caller issues its own calls and stamps its own footer |
| **`connect`** | registers the `ado` server at the **user scope** from the environment — `node "${CLAUDE_PLUGIN_ROOT}/skills/connect/scripts/connect.js" [--check]`. Idempotent: an unchanged registration is left alone and keeps its sign-in; a changed one is removed and added again, and needs a new sign-in |
| **`check-access`** | read-only: whether the four variables are set and well-formed, and whether the user-scope `ado` registration matches them. It makes no request and prints no id |

**MCP server:** none shipped in the plugin. The `ado` server is **Microsoft's remote Azure DevOps MCP server at `https://mcp.dev.azure.com`**, registered at the user scope by `connect` and signed in once as the owner, over OAuth (#332). Its tools are `mcp__ado__*`. It keeps the action-based tool surface of the local server's 2.9.0 release and adds `orgName` to every tool; it has no identity lookup, so reviewers are named by e-mail, and WIQL is offered only in its Insiders channel.

**`shared/ado-server.js`** is the one place the wanted registration is computed, shared by `connect` and `check-access`, and it records the measurement below.

## Configuration

Four variables, all set in your **own** `~/.claude/settings.json` under `env` — never in a repository, because they are configuration and this marketplace is published:

| Variable | What | Default |
|---|---|---|
| `ADO_ORGANIZATION` | the organisation's **bare name** — the first path segment of `https://dev.azure.com/`**`contoso`**`/…`, not the URL. Passed as `orgName` in every tool call, never in the server's URL | **none — required** |
| `ADO_PROJECT` | the project, passed as `project` where a call needs one. Set it only for the rare repository whose git remote is not its ADO project | the git remote, or the URL you pass |
| `ADO_MCP_CLIENT_ID` | the client id of the owner's own Entra app registration: a public client, redirect `http://localhost:3118/callback`, delegated permissions on the *Azure DevOps MCP* enterprise app, admin-consented | **none — required** |
| `ADO_MCP_TENANT_ID` | the tenant the app registration lives in | **none — required** |

**`ADO_ORGANIZATION` has no default, and must not get one.** There used to be a hard-coded default organisation, and it was removed: a consumer who forgot the variable did not fail, they silently targeted whichever organisation the marketplace author happened to use, and found out at the first call from an authorization error naming an organisation nobody had chosen. A missing required value must fail where it is missing.

Everything else derives at runtime:

| Value | Where it comes from |
|---|---|
| Organisation | `ADO_ORGANIZATION` — required |
| Project / repo | `ADO_PROJECT`, else the consuming repository's `git remote`, or any URL you paste |
| PR / work-item target | the URL you pass the skill |

## Authentication

**OAuth, as the owner, through the app registration the two ids name.** `connect` registers this, at the user scope:

| Field | Value |
|---|---|
| `type` | `http` |
| `url` | `https://mcp.dev.azure.com` — the root, with no organisation |
| `oauth.clientId` | `ADO_MCP_CLIENT_ID` |
| `oauth.callbackPort` | `3118` |
| `oauth.authServerMetadataUrl` | `https://login.microsoftonline.com/<ADO_MCP_TENANT_ID>/v2.0/.well-known/openid-configuration` |
| `oauth.scopes` | `https://mcp.dev.azure.com/.default offline_access` |

Two of those values are forced, and each was found by failing:

- **The root URL, never the organisation's.** `https://mcp.dev.azure.com/<org>` fails sign-in with `AADSTS9010010`: its RFC 8707 resource does not match the `.default` scope. The organisation travels as `orgName` in each call instead.
- **The metadata is pinned to the tenant.** The root's own metadata names the `organizations` authority, which a single-tenant app registration cannot use.

**Why it is not in a `.mcp.json`.** Measured on Claude Code 2.1.296 with a probe plugin: inside a plugin `.mcp.json`'s `oauth` block neither `${VAR}` nor `${user_config.KEY}` is substituted — the authorization URL carried `client_id=${user_config.clientId}` literally, while the same server's `url` was substituted. The client and tenant ids are configuration, not code, so they cannot be committed into the plugin either. `shared/ado-server.js` records the measurement; **repeat it on a newer Claude Code**, and when `oauth` is substituted the server can move back into the plugin.

**Sign in once, in an interactive session:** `/mcp` → `ado` → **Authenticate**, and finish the browser sign-in. `/mcp` shows the state — `ado` connected, or *Needs authentication*. On a remote box, forward the callback port first — `ssh -L 3118:localhost:3118 <box>` — and open the link in the PC's browser.

**A headless run cannot sign in in a browser.** Its token comes from Terylon's connector through its proxy (Terylon work item #337), not from this plugin.

**Writes need an interactive session, or a permission rule.** A write through `ado` from a headless `claude -p` was refused by the auto-mode classifier as a write to an external system; in an interactive session, or with an operator's permission rule allowing it, it goes through. The server cannot commit or push — `git push` is separate.

## Setup

In the consuming repository's `.claude/settings.json`:

```json
{
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

In your **own** `~/.claude/settings.json`:

```json
{
  "env": {
    "ADO_ORGANIZATION": "contoso",
    "ADO_MCP_CLIENT_ID": "00000000-0000-0000-0000-000000000000",
    "ADO_MCP_TENANT_ID": "00000000-0000-0000-0000-000000000000"
  }
}
```

Then run the `connect` skill once, start a new session, and sign in through `/mcp`. `check-access` says what is still missing.

`terylon-forge`, `terylon-git` and `terylon-core` install automatically as dependencies.

> **Migrating from the local server.** Until #332 this plugin launched the local Azure DevOps MCP server itself, from a `.mcp.json`, with a personal access token. The variables that configured it — the old organisation, project and authentication-type variables and the token — are now **ignored**: set `ADO_ORGANIZATION` (and `ADO_PROJECT` if you used the project override) and the two ids, run `connect`, and sign in. The tool namespace `mcp__plugin_terylon-ado_ado__*` is now `mcp__ado__*`. The full list of renamed names is in `docs/onboarding/migrating.md`.

> **Migrating from `terylon-devops`.** That plugin no longer exists; it split into the port and this adapter. Replace `"terylon-devops@terylon"` with **both** `"terylon-ado@terylon"` and whichever role plugins you already had. The transports kept their names, so nothing that loaded `create-pr` or `review-pr` changes. Two things do: the engine skill `ado-mcp` is now `forge-ops`, and the MCP namespace `mcp__plugin_terylon-devops_ado__*` is now `mcp__ado__*`.
