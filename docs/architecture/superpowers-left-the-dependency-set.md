# ADR — the marketplace depends on no other marketplace

**Status:** accepted
**Date:** 2026-08-14
**Decided in:** PR 64

`terylon-dev` used six skills from the `superpowers` plugin, which meant every consumer of the developer pipeline also had to install the `claude-plugins-official` marketplace. That dependency is gone. Three of the six were replaced by shorter equivalents inside this marketplace; the other three were deleted outright, because the personas that loaded them already said the same thing.

## Context

A plugin dependency on another marketplace is not the same kind of edge as a dependency on a sibling plugin:

```
consumer repo
    │ enables
    ▼
terylon-dev  ──depends──▶  terylon-git, terylon-forge, terylon-core   one marketplace, one source
    │
    └──loads──▶  superpowers  ──requires──▶  claude-plugins-official   a SECOND marketplace,
                                                                       versioned by someone else
```

Every consumer had to register a marketplace nobody here controls, for six skills. Two of the six were *format* definitions — how a plan is written, how a build loop proceeds — which is exactly the kind of thing a pipeline must be able to change on its own schedule.

The other four were worse than a cost. When each was compared against the persona that loaded it, three turned out to restate what the persona's own prose already required. `developer`, `refactorer` and `debugger` each carry their method in full — a loaded skill repeating it changed no behaviour and cost cache-write on every dispatch to say so.

## The alternatives

| Option | What it would have meant | Why it lost |
|---|---|---|
| Replace what is load-bearing, delete what is redundant | three short skills written here, three deletions | **chosen** |
| Keep the dependency | nothing to write | every consumer registers a second marketplace, and the plan format is versioned by someone else |
| Vendor copies of all six into this marketplace | no external marketplace, no rewriting | copies six skills, three of which are dead weight, and freezes them at the version copied |

## Decision

**Nothing in this marketplace depends on another marketplace.** A capability the pipeline needs is either written here, short, or it is not needed.

| The six skills | Outcome | Where it went |
|---|---|---|
| the plan format | replaced | `write-plan`, in `terylon-dev` |
| the build loop | replaced | `run-build-loop`, in `terylon-dev` |
| finishing a branch | replaced | `finish-branch`, in `terylon-git` |
| three method skills | **deleted** | nowhere — `developer`, `refactorer` and `debugger` already carried them in their own prose |

**A skill that only restates what the persona already says buys nothing and costs cache-write to load.** That is the test applied to the three deletions, and it is the test to apply before adding a skill that a persona could simply state.

### The replacements landed in the right plugin, on the second attempt

`write-plan` and `run-build-loop` were first placed in `terylon-core` and moved to `terylon-dev` in `terylon-core@1.1.0`. Only `terylon-dev` ever consumed them, and **the root installs for everyone** — a component in the root that one plugin loads is a cost paid by every consumer of every plugin.

That is the general placement rule at work: a component lives in the lowest plugin that all of its consumers can reach, where consumers are counted by plugin and the test is what a component *exercises*. `finish-branch` exercises git and is loaded only by the dev pipeline, so it sits in `terylon-git`, not in the root and not in `terylon-dev`.

## Consequences

| Consequence | Kind |
|---|---|
| A consumer registers one marketplace and enables two keys — nothing external | good |
| The plan format and the build loop are versioned here, so the pipeline can change them | good |
| Three dispatch-time skill loads disappeared from every persona run | good |
| A capability that genuinely needs a foreign skill has to be written here instead | cost |
| **A repository that enabled `terylon-core` alone to get the plan format now needs `terylon-dev`.** Callers are unaffected, because skills are addressed by name | cost |
| **Do not add a skill that restates a persona's own prose.** It is the failure this ADR removed, and it is easy to reintroduce as "documentation" | **constraint** |

## Gotchas

**`terylon-core` also replaced `terylon-metrics`, in the same release.** A consumer renames the key to `terylon-core@terylon` and nothing else changes — skills are addressed by name, so anything that loaded `measure-token-spend` keeps working. See `onboarding/migrating.md`.

**A skill loaded by name carries instructions, not capability.** Deleting a skill therefore never removes a tool grant, and adding one never adds one: an agent must declare in its own `tools:` every tool the skills it loads will call. The `tester` shipped a release documented as driving two forge transports while declaring no forge namespace at all, and its first real run returned `BLOCKED` for exactly that reason.

## Where it lives

| File | Role |
|---|---|
| `plugins/terylon-dev/skills/write-plan/SKILL.md` | `write-plan` — the plan format, owned here rather than externally |
| `plugins/terylon-dev/skills/run-build-loop/SKILL.md` | `run-build-loop` — the build loop the `leader` drives |
| `plugins/terylon-git/skills/finish-branch/SKILL.md` | `finish-branch` — the end-of-branch sequence |
| `plugins/terylon-dev/.claude-plugin/plugin.json` | `dependencies` — three sibling plugins, no foreign marketplace |
| `plugins/terylon-core/.claude-plugin/plugin.json` | the root manifest: **no `dependencies` key at all** |
| `plugins/CLAUDE.md` | *Where a component belongs*, with `write-plan` and `run-build-loop` as the worked example |
