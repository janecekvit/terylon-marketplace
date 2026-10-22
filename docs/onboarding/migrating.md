# Migrating from the plugins that no longer exist

Two plugins were removed and their contents redistributed, and one skill moved between plugins. If a repository still enables `terylon-devops@terylon` or `terylon-metrics@terylon`, this is what to change and what changes underneath. The Azure DevOps server under `terylon-ado` changed as well (#332), and has a section of its own below.

## The three moves at a glance

```
  terylon-devops                 terylon-metrics              terylon-core 1.0
  ├── the transports             └── measure-token-spend      ├── write-plan
  └── the ADO mechanics                                       └── run-build-loop
        │                              │                            │
        ▼                              ▼                            ▼
  terylon-forge  (the port)      terylon-core                 terylon-dev
  terylon-ado    (the adapter)   (same skill, new home)       (same skills, lower cost)
```

## `terylon-devops` became `terylon-forge` + `terylon-ado`

| What you had | What to do |
|---|---|
| `"terylon-devops@terylon": true` | replace with `"terylon-ado@terylon": true` — or `"terylon-github@terylon": true` if those repositories are on GitHub |

The port installs as the adapter's dependency, and the transports kept their names. Two things did change and they are not cosmetic:

| Was | Is |
|---|---|
| the engine skill `ado-mcp` | `forge-ops` |
| the MCP namespace `mcp__plugin_terylon-devops_ado__*`, then `mcp__plugin_terylon-ado_ado__*` | `mcp__ado__*` (since #332: the remote server, registered by `terylon-ado`'s `connect`) |

**Grep for the old namespace in anything you wrote yourself.** A check written against `mcp__ado__` or the old plugin prefix passes because it cannot fire — it matches nothing and reports success.

The plugin was split because it mixed two kinds of thing: transports, which are portable and became the port, and Azure DevOps mechanics, which are not and became the adapter. The full reasoning, including why the port declares no adapter, is in [`architecture/port-and-adapter-split.md`](../architecture/port-and-adapter-split.md).

## `terylon-metrics` became `terylon-core`

| What you had | What to do |
|---|---|
| `"terylon-metrics@terylon": true` | rename the key to `"terylon-core@terylon": true` |

**Nothing else changes.** Skills are addressed by name, so anything that loaded `measure-token-spend` keeps working. `terylon-core` is the root — no dependencies, no git, no forge, no MCP server — and every other plugin sits on it. It is still worth enabling alone, for the measurement.

`terylon-dev` also no longer requires the `claude-plugins-official` marketplace: [`architecture/superpowers-left-the-dependency-set.md`](../architecture/superpowers-left-the-dependency-set.md).

## `write-plan` and `run-build-loop` moved to `terylon-dev`

They sat in `terylon-core` and moved in `terylon-core@1.1.0`.

| Situation | Effect |
|---|---|
| You enable `terylon-dev` | nothing to do — callers address skills by name |
| You enabled `terylon-core` **alone** to get the plan format | enable `terylon-dev` as well |

Only `terylon-dev` ever consumed them, and the root installs for everyone: a component in the root that one plugin loads is a cost every consumer of every plugin pays.

## `terylon-ado` moved to the remote server, over OAuth

Until #332 `terylon-ado` launched the local `@azure-devops/mcp` server from its own `.mcp.json`, authenticated with a personal access token. It now uses Microsoft's remote server at `https://mcp.dev.azure.com`, signed in as you with OAuth, and registered at the user scope by its `connect` skill.

| Was | Is |
|---|---|
| `TERYLON_ADO_ORG` | `ADO_ORGANIZATION` — the same bare name, still required, still no default; passed as `orgName` in every call |
| `TERYLON_ADO_PROJECT` | `ADO_PROJECT` — optional, as before |
| `PERSONAL_ACCESS_TOKEN`, `TERYLON_ADO_AUTHENTICATION`, an `az login` | nothing — OAuth replaces them: set `ADO_MCP_CLIENT_ID` and `ADO_MCP_TENANT_ID` to your own Entra app registration and its tenant |
| the server started by the plugin | run `connect` once, then `/mcp` → `ado` → **Authenticate** |
| `mcp__plugin_terylon-ado_ado__*` | `mcp__ado__*` |

**The old variables are ignored, not read as a fallback.** A machine that still sets only `TERYLON_ADO_ORG` has no organisation, and its first call fails. Remove them from your settings once the new ones are in place, so nobody mistakes them for live configuration. Setting the new ones in full: [consumer-setup](./consumer-setup.md).

## After changing the keys

| Step | Why |
|---|---|
| Run `/plugin marketplace update` | the rename is in your settings; the new plugin still has to be fetched |
| On Azure DevOps, run `connect` and start a fresh session | `connect` registers the `ado` server at the user scope, and a registered server starts at session start; sign in once in `/mcp` |
| Confirm the tools exist | on Azure DevOps, `mcp__ado__*` should be present. Absent means the adapter is not enabled or `connect` has not registered the server — see [`runbooks/ado-mcp-authorization-error.md`](../runbooks/ado-mcp-authorization-error.md), cause D |

## Gotchas

**Enabling only `terylon-forge` gets you no forge access at all.** The port ships no adapter by design. This is the intended behaviour, not an installation failure.

**`terylon-ado` requires `ADO_ORGANIZATION`, which `terylon-devops` did not.** A repository that migrates without setting it fails at the first call, and that failure is deliberate — the reasoning is in the root [`CLAUDE.md`](../../CLAUDE.md) under *Azure DevOps, as a consumer's forge*. Setting it: [consumer-setup](./consumer-setup.md).

**Both adapters may be enabled at once.** `TERYLON_FORGE` then decides which a run uses, and the engine is addressed plugin-qualified.

## Where it lives

| File | Role |
|---|---|
| `.claude-plugin/marketplace.json` | `plugins[]` — the published set; `terylon-devops` and `terylon-metrics` are absent from it |
| `plugins/terylon-forge/README.md` | the *Migrating* note from the port's side |
| `plugins/terylon-core/.claude-plugin/plugin.json` | the root manifest — successor to `terylon-metrics`, no `dependencies` key |
| `plugins/terylon-ado/skills/connect/SKILL.md` | `connect` — registers the `ado` server the adapter's skills call, and the variables it needs |
| `plugins/terylon-ado/README.md` | the *Migrating from the local server* note, and the measurement that keeps the server out of a `.mcp.json` |
| `plugins/terylon-dev/skills/write-plan/SKILL.md` | `write-plan` — in its current home |
| `plugins/terylon-dev/skills/run-build-loop/SKILL.md` | `run-build-loop` — in its current home |
| `README.md` | the migration callouts a first-time reader meets |
