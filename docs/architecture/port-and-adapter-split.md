# ADR — the pull request workflow is a port with two adapters

**Status:** accepted
**Date:** 2026-08-14
**Decided in:** PR 68

`terylon-devops` no longer exists. The pull request workflow became `terylon-forge`, a **port** written against an operation catalog, and the Azure DevOps mechanics became `terylon-ado`, one of two **adapters** that fill it. The other is `terylon-github`. The port ships no adapter at all, so a consumer enables two plugin keys instead of one.

## Context

`terylon-devops` held two kinds of thing in one plugin, and only one of them was portable:

```
terylon-devops
├── review-pr, write-pr-description, address-pr-comments,      portable — a pull request
│   update-pr-checklist, update-work-item-checklist            is a pull request everywhere
└── ado-mcp + .mcp.json                                        Azure DevOps only
        └── registers the ado MCP server for every consumer
```

The transports were about pull requests. The engine underneath them was about Azure DevOps. Nothing in the plugin's shape said which was which, so the boundary eroded one line at a time: a transport would grow a `projectName`, then a raw ADO field read, each defensible on its own.

The forcing failure is the `.mcp.json`. A plugin that registers a server registers it for **everyone who enables the plugin**. A GitHub-hosted repository that wanted `review-pr` got an Azure DevOps MCP server it has no account on — starting at every session, failing at the first call, configured through a variable its owner has no value for.

## The alternatives

| Option | What it would have meant | Why it lost |
|---|---|---|
| A port with adapters, port declares none | one plugin owns the workflow, two own the mechanics, the consumer picks | **chosen** |
| Keep one plugin, branch inside each transport | every transport carries `if ado … else gh …` | the platform detail returns to the place the split removed it from, in seven files instead of one, and the `.mcp.json` still installs everywhere |
| A port that declares the Azure DevOps adapter as a default | one key for the common case | reintroduces the forcing failure exactly: the ADO server installs in every GitHub repository, and the default is invisible until it fails |
| Two complete parallel plugins, one per platform | no port, no indirection | the transports are duplicated, and the copy is the one that goes stale |

## Decision

**The port carries the workflow and declares the operations. The adapters carry the mechanics and implement them. `terylon-forge` declares no adapter, ever.**

```
                terylon-git
                    ▲
                terylon-forge          the port — transports, pr-reviewer, resolve-forge
                    ▲                  declares: terylon-git.  Ships: no adapter.
       ┌────────────┴────────────┐
   terylon-ado              terylon-github        the adapters — one skill each,
   forge-ops (ADO body)     forge-ops (gh body)   both named forge-ops
   + .mcp.json (ado server) no server

   dependency edge points DOWN  ──▶  adapter declares the port
   load edge points UP          ──▶  a transport loads forge-ops from an adapter
```

Three rules keep that honest, and none is optional:

| Rule | What breaks without it |
|---|---|
| **The port declares no adapter** | the platform it names installs for everyone — the failure the split exists to remove |
| **Both adapters implement the same catalog under the same skill name** | callers start branching on platform, and the port stops being one |
| **A transport that finds no adapter says so and stops** | it falls back or hand-rolls calls, putting the call shapes in a second place |

Which adapter a run uses is decided by `resolve-forge`, first hit wins, no default:

```
1  an explicit URL the user passed
        │ dev.azure.com | visualstudio.com  ──▶  ado
        │ github.com                        ──▶  github
        ▼ none given
2  TERYLON_FORGE                            ado | github
        ▼ unset
3  host of `git remote get-url origin`      same mapping as step 1
        ▼ no remote, or an unrecognised host
4  stop and ask                             never assume one
```

A pasted URL outranks the environment variable on purpose: reviewing a GitHub pull request from an Azure DevOps checkout is an ordinary thing to do, and the URL is the more specific statement of intent.

### Differences are declared, not hidden

The two platforms genuinely differ — description length limits, where acceptance criteria live, how an item's type is expressed, how a thread is resolved. **The port declares the difference and the transport reads the declared value**; it never learns which platform produced it. Each `forge-ops` carries an asymmetry table, and the two must agree: when they disagree, one is wrong, and the port's declaration decides which.

This is why two things that *look* like leaks are not:

| Looks like a crossing | Is not, because |
|---|---|
| A transport's `allowed-tools` naming both the `gh` and `mcp__` surfaces | an absent grant cannot be resolved at runtime; naming both is what makes the transport work under either adapter |
| A transport naming a difference the port declares | that is the port doing its job. Hiding it is what makes a transport wrong |

What must never appear in a transport is an **issued** platform call — a `gh` subcommand, an `mcp__` tool call — or a read of a raw platform field instead of the normalised value the operation returned.

## Consequences

| Consequence | Kind |
|---|---|
| A GitHub repository installs no Azure DevOps server, and configures nothing beyond `gh auth login` | good |
| One transport change fixes both platforms; the call shapes live in exactly one file per platform | good |
| **A consumer enables two keys** — a role plugin and the adapter their repositories are hosted on | cost |
| `forge-ops` is loaded *upward*, from a plugin above the one loading it — the only upward load in the marketplace, made from three places | cost |
| **The port must never declare an adapter.** The moment it does, this decision is undone and the platform it names installs for everyone | **constraint** |
| **A transport must never issue a platform call.** One defensible line at a time is how the previous boundary eroded | **constraint** |

The upward load is the price and it is paid knowingly. The general placement rule — a component lives in the lowest plugin all its consumers reach — would put the Azure DevOps mechanics into the port, which is precisely the outcome being avoided. A fourth upward load needs the same argument made out loud and a row in the cross-plugin load table in `plugins/CLAUDE.md`.

## Gotchas

**A skill named `forge-ops` resolves ambiguously when both adapters are enabled.** Enabling both is supported, and `TERYLON_FORGE` then decides. Address the engine plugin-qualified — `terylon-ado:forge-ops` — whenever `resolve-forge` returned a value; the qualified form is correct in either case.

**A resolved forge does not mean an installed adapter.** A transport can resolve `github` in a repository where only `terylon-ado` is enabled. The answer is to name the forge, name the missing plugin, say what to enable, and issue nothing.

**Resolving once does not settle a run.** Several items in one run may name different forges. Resolve per item.

**The old namespace is gone.** `mcp__plugin_terylon-devops_ado__*` became `mcp__plugin_terylon-ado_ado__*` when the server moved with the adapter, and `ado-mcp` became `forge-ops`. A grep written against the old prefix passes because it cannot fire — see `onboarding/migrating.md`.

## Where it lives

| File | Role |
|---|---|
| `plugins/terylon-forge/skills/resolve-forge/SKILL.md` | `resolve-forge` — the four-step precedence, the adapter table, and the stop conditions |
| `plugins/terylon-ado/skills/forge-ops/SKILL.md` | the Azure DevOps body of the catalog, over `mcp__plugin_terylon-ado_ado__*` |
| `plugins/terylon-github/skills/forge-ops/SKILL.md` | the GitHub body of the same catalog, over the `gh` CLI |
| `plugins/terylon-ado/.mcp.json` | registers the `ado` server; passes `${TERYLON_ADO_ORG}` bare, with no default |
| `plugins/terylon-forge/.claude-plugin/plugin.json` | `dependencies` — declares `terylon-git` and **no adapter**; the constraint above is enforced here or nowhere |
| `plugins/CLAUDE.md` | *The one exception: a port and its adapters*, and the cross-plugin load table with its three upward rows |
| `docs/flows/forge-resolution.md` | the resolution walked step by step, including what a run does when it finds no adapter |
