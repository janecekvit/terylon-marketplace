---
name: run-ui-flows
description: >-
  Use when a claim is about something a user sees or does — a screen, a click path, a rendered state,
  a flow no existing test covers — and it has to be driven rather than read. Probes for browser
  automation first, drives the interface through Playwright, and reports the steps taken and the state
  observed. Reports what happened; it never decides what that means. Loaded by name by
  verify-test-plan; not a user command.
allowed-tools: Read, Grep, Glob, Bash, mcp__playwright__*
---

# run-ui-flows

This is the browser half of `terylon-test`'s execution layer, loaded by name by `verify-test-plan`. It is separate from `run-build-and-tests` **because of its dependency class**: a browser stack must not be dragged in by a checklist walker that only needs a shell.

## Usage

```
run-ui-flows --claim=<the claim to check> --app=<how to reach it> [--probe] [--fixtures=<dir>]
```

- `--claim` — what is being checked, in the caller's words. One flow per claim.
- `--app` — the URL if something is already serving, or the command that starts it. Starting it is a side effect and is announced.
- `--probe` — answer the capability question and stop. No flow, no install, no server start.
- `--fixtures` — where screenshots and traces go. Never inside the repository under test.

Loaded by name by `verify-test-plan`; not a user command.

## Prerequisites

- **Playwright MCP server** (`@playwright/mcp`) — enabled per-session or per-project; this skill does not install or configure the server itself.

> This plugin ships **no** plugin-level `.mcp.json` for Playwright, deliberately. One would start a browser server for every `terylon-test` consumer, including the ones that only ever walk a shell checklist — which is the cost this skill was split out to avoid. The wildcard in `allowed-tools` is a declaration, not an installation: with no server present it matches nothing and costs nothing.

## The probe comes first

```text
run-ui-flows
├── 1  probe ........ is browser automation available in THIS session?
│   ├── no  ──▶ return capability.available: false + missing + wouldNeed
│   │            drive nothing, install nothing, start nothing, return now
│   └── yes ──▶ continue
├── 2  announce ..... the side-effect block, before the first side effect
├── 3  drive ........ one flow per claim; record every step and what was observed
└── 4  stop ......... whatever this run started, this run stops
```

The probe checks, in order: whether the browser tool namespace (`mcp__playwright__*`) is available in this session, and whether the target repository exposes an entry point to drive — a dev-server command, a base URL. Both must hold for `capability.available` to be `true`; either one missing sets it `false`, with `missing` naming which capability was absent and `wouldNeed` describing the session that would have it.

`--probe` runs step 1 and stops there, returning only the `capability` block — no flow, no install, no server start — so a caller can ask what is possible **before** committing to a run.

## Absence is the finding

| Absent thing | Consequence | Report it? |
|---|---|---|
| a repo-local specialist agent (`delegate-to-repo-agents`) | you do the work yourself; the claim still gets checked | no — finding none is not a problem |
| browser automation (this skill) | the claim goes **unchecked** | **yes — it is the whole finding** |

Do not copy the `delegate-to-repo-agents` posture here. Silence about a missing capability is how a UI claim quietly becomes unverified while the report still looks complete. `verify-test-plan` turns `available: false` into `notVerifiableHere`; this skill supplies the fact and does not assign the class.

## What this skill does not run

It does not run an existing Playwright spec. A claim covered by a spec is a test-suite claim: `verify-test-plan` routes it to `run-build-and-tests`, which runs the repository's **declared** test command as written. Selecting a single spec would mean composing a command the repository did not declare, which that skill refuses on purpose — so the suite runs whole and `covering` names the spec among the executed cases.

This skill drives the interface live, for flows no spec covers. **It never delegates** — all routing belongs to the engine.

## Side effects

Starting the application under test is a side effect: announce it, name the port, and stop it on return. Artifacts go to the fixtures directory, never inside the repository under test. The rules are in `${CLAUDE_PLUGIN_ROOT}/shared/side-effects.md`; this skill does not restate them.

## Report

```yaml
skill: run-ui-flows
capability:
  available: <true|false>
  probe: <what was checked — the browser tool namespace, and the repo's app entry point>
  missing: <the named capability, when available is false>
  wouldNeed: <what a session that could run this looks like>
sideEffects:
  install: <what, or none>
  start: <what, on which port, or none>
  write:
    ignored: [<paths>]
    tracked: none
  leaves: <what is still running, or none>
flows:
  - claim: <verbatim>
    steps: [<each navigation and interaction actually performed>]
    observed: <what was on screen — the state the claim is about>
    artifacts: [<screenshot or trace paths, in the fixtures directory>]
    outcome: <matched | diverged | blocked>
    divergence: <what differed, when diverged>
repoUnchanged: <true|false>
```

> **`outcome` is `matched` / `diverged` / `blocked`, never pass or fail.** What was on screen is an observation; whether that satisfies the claim is a judgment, and the judgment is `verify-test-plan`'s. `observed` carries what was actually there, so the engine can disagree with the reading.

## Common mistakes

- **Driving before probing.** A failed run and an unavailable capability are different findings; starting first destroys the distinction.
- **Treating a missing browser as nothing to report.** The claim goes unchecked, and an unreported gap reads as a pass.
- **Leaving the browser or the dev server running.** The next run inherits a dirty machine and the results stop being reproducible.
- **Returning pass/fail.** The observation is this skill's; the verdict is not.
- **Re-implementing a flow an existing spec already covers.** Running the spec is stronger evidence and cheaper; that routing belongs to the engine.
- **Writing screenshots into the repository under test.** Artifacts belong in the fixtures directory.

## Verification

1. **No capability:** in a session with no Playwright server, the skill returns `available: false` with `missing` and `wouldNeed` filled in, and no browser, install, or server start occurs.
2. **Probe mode:** `--probe` returns the capability answer and performs no flow.
3. **Announcement:** when a dev server is started, the side-effect block names it and its port before it starts.
4. **Nothing left running:** after a run, `leaves:` reads `none`, and no browser or server from this run survives.
5. **Vocabulary:** every `flows[].outcome` is `matched`, `diverged`, or `blocked` — no pass, fail, or tick appears in the report.
6. **Repository untouched:** `git status --porcelain` before and after are identical; artifacts are under the fixtures directory.
