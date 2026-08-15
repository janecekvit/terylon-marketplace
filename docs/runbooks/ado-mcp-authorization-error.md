# The Azure DevOps tools fail, or name an organisation nobody chose

An `mcp__plugin_terylon-ado_ado__*` call fails on authorization or "not found", and the organisation in the message is not one you work in — or the `ado` tools are not present at all. Both come from the same place: the server takes its organisation as a positional argument and reads it **at startup**, before any git command runs.

## Symptom

One of three:

```
1  an authorization / not-found error naming an organisation you did not configure

2  every ado tool call fails, and the organisation in the message is empty
   or literally "${TERYLON_ADO_ORG}"

3  no mcp__plugin_terylon-ado_ado__* tools exist in the session at all
```

Symptom 3 is not an authentication problem and the rest of this runbook mostly does not apply to it — jump to cause D.

## Diagnosis

```
  do mcp__plugin_terylon-ado_ado__* tools exist in this session?
        │ no  ──▶ cause D — the adapter is not enabled, or the server did not start
        ▼ yes
  is TERYLON_ADO_ORG set in this environment?
        │ no  ──▶ cause A — the required value is missing
        ▼ yes
  is its value the bare organisation NAME, not a URL?
        │ no  ──▶ cause B — a URL was passed where a name is expected
        ▼ yes
  does the named organisation match the repository you are targeting?
        │ no  ──▶ cause C — the variable is set to somebody else's organisation
        ▼ yes
  it is genuine authentication ──▶ cause E — the Entra login expired or was never done
```

| Check | Command | Reading it |
|---|---|---|
| Is the variable set, and to what? | `node -e "console.log(process.env.TERYLON_ADO_ORG)"` | empty means cause A. Anything containing `https://` or `/` means cause B |
| What is the repository's own organisation? | `git remote get-url origin` | the first path segment after `dev.azure.com/` is the organisation the variable should name |
| Did the server start? | check the session's MCP server list | absent means cause D |

## Fix

| Cause | Fix |
|---|---|
| **A** — unset | Set `TERYLON_ADO_ORG` in your **own** `~/.claude/settings.json`, or in the `.claude/settings.json` of the repository you work in. There is no default and there must not be one |
| **B** — a URL instead of a name | Use the bare name — the first path segment of `https://dev.azure.com/`**`your-organisation`**`/…`, not the URL. The server takes the name as a positional argument |
| **C** — the wrong organisation | Correct the variable for that repository. If a single machine works across organisations, set it per repository rather than globally |
| **D** — no tools | Enable `terylon-ado@terylon` in `enabledPlugins`. `terylon-forge` **declares no adapter on purpose**, so the port alone installs no server. If the plugin is enabled and the server still did not start, `npx` could not fetch `@azure-devops/mcp@2.9.0` — check network and the npm cache |
| **E** — authentication | Complete the server's interactive Entra login. This is separate from git credentials: fetching the marketplace and calling the Azure DevOps API authenticate independently |

Restart the session after changing the variable. The server reads it once, at startup.

## Why it happens

`plugins/terylon-ado/.mcp.json` passes the variable **bare**:

```json
{ "mcpServers": { "ado": { "command": "npx", "args": ["-y", "@azure-devops/mcp@2.9.0", "${TERYLON_ADO_ORG}"] } } }
```

**It used to carry a hard-coded fallback, and removing it is why cause A now fails loudly** instead of silently targeting the marketplace author's organisation. That silent targeting is symptom 1, and it was the *old* behaviour of cause A — which is worth knowing here, because it means an old checkout can produce symptom 1 from a cause this runbook no longer lists. The decision and its reasoning, along with why this repository commits no `env` block of its own, are in the root `CLAUDE.md` under *Azure DevOps*.

Everything else about an Azure DevOps target resolves on its own: project and repository come from the consuming repository's git remote at runtime, and the forge itself from [`flows/forge-resolution.md`](../flows/forge-resolution.md). The organisation is the exception because the server needs it before any of that can run.

## Gotchas

**`TERYLON_ADO_PROJECT` exists but is almost never the answer.** It overrides the project for the rare repository whose git remote is not its Azure DevOps project. Setting it to work around cause C hides a wrong organisation behind a right-looking project.

**A GitHub-hosted repository needs none of this.** `terylon-github` registers no server and reads the owner from the remote; authentication is whatever `gh auth login` established.

**Symptom 3 with both adapters enabled is a different problem.** Enabling both is supported; the run picks one via `TERYLON_FORGE`, and the engine must be addressed plugin-qualified. Tools missing there means the *other* adapter was selected, not that anything failed.

## Where it lives

| File | Role |
|---|---|
| `plugins/terylon-ado/.mcp.json` | registers the `ado` server; `${TERYLON_ADO_ORG}` passed bare as a positional argument, pinned to `@azure-devops/mcp@2.9.0` |
| `plugins/terylon-ado/README.md` | the consumer-facing setup for this adapter |
| `plugins/terylon-forge/.claude-plugin/plugin.json` | `dependencies` — no adapter, which is why the port alone starts no server |
| `plugins/terylon-forge/skills/resolve-forge/SKILL.md` | `resolve-forge` — what a run does when the forge resolves but the adapter is absent |
| `CLAUDE.md` | *Azure DevOps* — why there is no default organisation and no committed `env` block |
| `docs/flows/forge-resolution.md` | how the platform is chosen, and why the organisation is not part of that choice |
