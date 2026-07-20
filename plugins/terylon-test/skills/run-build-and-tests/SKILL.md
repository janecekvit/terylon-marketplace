---
name: run-build-and-tests
description: >-
  Use when a claim needs the project built or its tests run rather than read — "the build succeeds",
  "the suite passes", "this behaviour is covered". Detects the stack from the target repository's own
  files and its CLAUDE.md, runs its build and its tests, and reports the commands, exit codes and
  executed case names. Reports what ran; it never decides what that means. Loaded by name by
  verify-test-plan; not a user command.
allowed-tools: Read, Grep, Glob, Bash
---

# run-build-and-tests

This is the shell half of `terylon-test`'s execution layer, loaded by name by `verify-test-plan`. A user invoking it directly gets a stack report rather than a verdict — this skill has no judgment to offer on its own.

## What it owns vs. what it does not own

**Owns:** detection, invocation, and the report — deciding what "build" and "test" mean for the target repository, running those commands, and returning commands, exit codes, and executed case names.

**Does not own:** triage, routing, coverage judgment, ticking. Every one of those belongs to `verify-test-plan`.

## Detection — the target repository decides what build and test mean

```text
1. <repo>/CLAUDE.md          names a build or test command  ──▶ use it verbatim, source: CLAUDE.md
2. a marker file             matched in the table below     ──▶ use the table, source: <marker>
3. neither                   ──▶ report "none found". Do not guess.
```

| Marker in the target repository | Stack | Build | Test |
|---|---|---|---|
| `package.json` with `scripts.build` / `scripts.test` | node | the declared script, verbatim | the declared script, verbatim |
| `*.sln` / `*.csproj` | dotnet | `dotnet build` | `dotnet test` |
| `Cargo.toml` | cargo | `cargo build --locked` | `cargo test --locked` |
| `pyproject.toml` / `pytest.ini` / `tox.ini` | python | per the declared backend | `pytest` |
| `go.mod` | go | `go build ./...` | `go test ./...` |
| `pom.xml` | jvm/maven | `mvn -B package -DskipTests` | `mvn -B test` |
| `build.gradle` / `build.gradle.kts` | jvm/gradle | `gradle build -x test` | `gradle test` |
| `Makefile` with a `test` target | make | `make` | `make test` |
| none of the above | — | `none found` | `none found` |

Follow the table row for a marker only when `CLAUDE.md` is silent. A declared script always wins over a guessed one — `package.json` naming `scripts.test` as `vitest run --coverage` means that is the command, not `npm test` in the abstract.

**Several markers: build the shortest honest answer, do not pick a winner.** A repository with both `package.json` and a `.sln` has two stacks, and running one while ignoring the other reports a green build for half a project. Detect them all, list them in `detected`, and either run each in turn or say which you ran and which you did not. Never let marker order in the table stand in for a decision about the project.

### The command comes from the branch under test

This skill runs a command **the target repository declares**, from a branch that may be somebody else's work in review. That makes it the one component here that executes foreign input, and the honest framing is that this is the point of it — a test plan claiming the suite passes can only be checked by running the suite the branch ships.

What follows from that:

- **Show the command before running it.** It goes in the side-effect announcement and in `detected`, verbatim, so a reader sees what was executed rather than that something was.
- **Run it as declared. Never compose around it.** No extra flags, no shell chaining, no wrapping it in something that changes what it does. If it cannot be run as written, report `none found` and why.
- **A command is not a licence.** The side-effect contract still binds it: tracked files never, ignored build output declared, everything else outside the repository. A declared script that installs, publishes, deploys, or writes outside the build output is a **finding, not a step** — report it and do not run it.
- **When the branch is not one the user controls**, say so in the announcement. Running a stranger's build is a decision the caller should make knowingly, not one this skill makes for them by default.

## Sequencing — build then test

`runs[]` is a sequence, not a batch: a build entry and a test entry are ordered, and the second depends on the first.

```text
build exitCode == 0    ──▶ invoke the test command next
build exitCode != 0    ──▶ skip the test command; runs[] stops at the build entry
no build command found ──▶ invoke the test command directly, nothing to gate on
```

Skipping is the rule, not a shortcut: the test command's target commonly depends on what the build produced, and invoking it against a build with a nonzero `exitCode` wastes the run without telling the caller anything new. The report shape carries the distinction the caller needs — "tests ran and failed" is a `runs[]` entry for the test command with a nonzero `exitCode`; "tests never ran" is no such entry at all, next to a build entry whose own `exitCode` is nonzero.

## Side effects

Emit the block from `${CLAUDE_PLUGIN_ROOT}/shared/side-effects.md` before the first command, run `git status --porcelain` before and after, and set `repoUnchanged` from the comparison. Do not restate the contract's rules here.

## Report

```yaml
skill: run-build-and-tests
sideEffects:
  install: <what, or none>
  start: <what, or none>
  write:
    ignored: [<paths>]
    tracked: none
  leaves: <what is still running, or none>
detected:
  stack: <e.g. node/npm, dotnet, cargo, go, python/pytest>
  source: <the file, or the CLAUDE.md line, the command came from>
  buildCommand: <verbatim, or none found>
  testCommand: <verbatim, or none found>
runs:
  - command: <verbatim, as invoked>
    exitCode: <int>
    cases:
      total: <int>
      passed: <int>
      failed: <int>
      names: [<every executed case name the runner reported>]
    failures:
      - name: <case name>
        message: <first line of the failure>
repoUnchanged: <true|false — git status --porcelain identical before and after>
unavailable: <the capability or command that was missing, or absent>
```

**A build run omits `cases` entirely** — it has no case data to report, so the key is absent rather than written as `cases.total: 0`.

**`cases.names` is not optional.** A green suite proves the suite passed, not that it covered the claim, and the engine cannot tell those apart from counts alone. List every case name the runner reported. When the runner cannot be made to list them, say so in `unavailable` rather than returning counts as if they answered the question.

## This skill does not judge

Report what ran, never what it means. No tick, no "verified", no verdict about the claim. The runner's own `passed`/`failed` counts are quoted as the runner's output — that is reporting what came back, not judging the claim. `verify-test-plan` decides.

## Common mistakes

- **Guessing a command the repository does not use.** A green `npm test` in a repo whose real gate is `npm run verify` verifies nothing and reports success.
- **Invoking the test command after a build entry with a nonzero `exitCode`.** The test target commonly depends on build output; running it anyway wastes the run and returns a result the caller cannot use.
- **Returning counts without case names.** The engine cannot ask whether the claim was covered, so the claim gets ticked on the strength of an unrelated suite.
- **Letting an install rewrite a lockfile.** That is a tracked-file mutation of the repository under test, and it survives the run.
- **Reporting a verdict.** "The claim holds" is not this skill's sentence to write.
- **Leaving a watcher running.** A test command in watch mode never returns and the run hangs; use the single-shot form.

## Verification

1. **Declared script wins:** in a repo whose `CLAUDE.md` names a test command and whose `package.json` also declares one, the report's `detected.source` reads `CLAUDE.md` and the command is that one.
2. **No stack:** in a repo with no marker file and no `CLAUDE.md` command, `buildCommand` and `testCommand` both read `none found`, no command is invoked, and nothing is guessed.
3. **Build failure stops the sequence:** after a build entry whose `exitCode` is nonzero, `runs[]` carries no entry for the test command — that absence, next to the build entry's own nonzero `exitCode`, is what distinguishes "tests never ran" from "tests ran and failed".
4. **Case names:** after a suite run, `cases.names` is non-empty and its length is consistent with `cases.total`.
5. **Repository untouched:** `git status --porcelain` before and after are identical, and `repoUnchanged` reads `true`.
6. **Announcement:** the side-effect block appears before the first command, and again in the return with what actually happened.
7. **No verdict:** the report contains no tick, no "verified", and no statement about whether a claim holds.
