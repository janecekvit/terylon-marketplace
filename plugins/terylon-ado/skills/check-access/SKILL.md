---
name: check-access
description: "Use when the Azure DevOps tools (mcp__ado__*) are missing or answer with an authorization error, or before trusting a fresh install: reports whether the organisation, project, client and tenant variables are set and whether the remote server is registered as they say, and names exactly what is missing. Read-only — it writes nothing, calls nothing, and prints no id."
allowed-tools: Bash(node *), Read
---

# check-access — can this environment reach Azure DevOps?

Reports what the remote Azure DevOps MCP server needs, says which is missing, and whether the user-scope server `ado` is registered exactly as the variables say.

**It writes nothing and calls nothing.** `AGENTS.md` states the rule this follows: a driver names what is missing and refuses. Registering is the `connect` skill's, and whether the owner has signed in is what `/mcp` shows — `ado` connected, or *Needs authentication*. An OAuth token is nothing a script should read.

## Usage

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/check-access/scripts/check-access.js"
```

Exit code is `0` when everything needed is present and the registration matches, `1` otherwise.

## What it checks

| | |
|---|---|
| `ADO_ORGANIZATION` | required, no default; the **bare** name — it goes into every tool call as `orgName`, never into the server's URL |
| `ADO_PROJECT` | optional; when unset each call takes the project from the git remote or the URL it was given |
| `ADO_MCP_CLIENT_ID`, `ADO_MCP_TENANT_ID` | required, GUIDs: the owner's app registration and its tenant |
| the user-scope server `ado` | registered at `https://mcp.dev.azure.com` with that client id and the tenant's pinned metadata — what `connect` writes |

**The organisation is a call argument, not part of the URL**, and the check refuses one given as a URL: `https://mcp.dev.azure.com/<org>` fails sign-in with AADSTS9010010, because its resource does not match the `.default` scope.

## What it deliberately does not do

- **It sets nothing** — not a variable, not the registration.
- **It prints no id**, in any state; its report says *set*, never the value.
- **It makes no request.** The old `--live` call proved a personal access token; there is none any more, and a sign-in is the person's, in `/mcp`.

## Verification

`node --test "plugins/terylon-ado/skills/check-access/scripts/check-access.test.js"` — pass the test **file**, not the directory. It covers each missing variable, an organisation given as a URL, an id that is not a GUID, a missing and a differing registration, the registration `connect` makes, and that no id reaches the report.
