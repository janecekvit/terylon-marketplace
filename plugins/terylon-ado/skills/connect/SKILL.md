---
name: connect
description: "Use when the Azure DevOps tools (mcp__ado__*) are missing, after setting or changing ADO_MCP_CLIENT_ID or ADO_MCP_TENANT_ID, or on a machine that has never reached Azure DevOps: registers Microsoft's remote Azure DevOps MCP server at the user scope from the environment, then the owner signs in once with OAuth. Idempotent — an unchanged registration is left alone and keeps its sign-in."
allowed-tools: Bash(node *), Read
---

# connect — register the remote Azure DevOps MCP server

Registers the user-scope server `ado` — Microsoft's remote server at `https://mcp.dev.azure.com`, over OAuth with the owner's own Entra app registration — from the environment. Its tools are `mcp__ado__*`, and `forge-ops` names them.

## Usage

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/connect/scripts/connect.js" [--check]
```

`--check` says where the registration stands and changes nothing. Without it, a missing registration is added, a changed one is removed and added again, and **an unchanged one is left alone, so its sign-in is kept**.

## What it needs

| Variable | What | Default |
|---|---|---|
| `ADO_MCP_CLIENT_ID` | the client id of the owner's app registration (a public client, redirect `http://localhost:3118/callback`, delegated permissions on *Azure DevOps MCP*, admin-consented) | none |
| `ADO_MCP_TENANT_ID` | the tenant the app lives in; the metadata URL is pinned to its v2.0 configuration | none |
| `ADO_ORGANIZATION` | the organisation's bare name, passed as `orgName` in every tool call | none |
| `ADO_PROJECT` | the project, passed as `project` where a call needs one | the git remote's |

Set them in your **own** `~/.claude/settings.json` under `env`, never in a repository: they are configuration, and this marketplace is published.

## Then sign in

Once, in an interactive session: `/mcp` → `ado` → **Authenticate**, and finish the browser sign-in. On a remote box, forward the callback port first — `ssh -L 3118:localhost:3118 <box>` — and open the link in the PC's browser.

**A headless run cannot sign in in a browser**: its token comes from Terylon's connector through its proxy (#337), not from this skill.

## Why it is not in the plugin's `.mcp.json`

Measured on Claude Code 2.1.296: a plugin's `.mcp.json` substitutes neither `${VAR}` nor `${user_config.KEY}` inside `oauth`, so the client id cannot come from configuration there. `shared/ado-server.js` records the measurement; repeat it on a newer Claude Code, and when `oauth` is substituted the server can move back into the plugin.
