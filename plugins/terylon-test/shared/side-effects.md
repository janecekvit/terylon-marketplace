# Side effects — the announcement contract

Shared by `run-build-and-tests` and `run-ui-flows`. Both emit the same block in the same shape, so a reader who has seen one has seen both. Neither skill restates these rules; they reference this file.

**Never mutate the machine silently.** Installing a dependency, starting a service, writing a file, leaving a browser running — each is a side effect, and each is announced before it happens.

## The block

Emit this **before the first side effect**, and repeat it in the return with what actually happened:

```text
SIDE EFFECTS — <skill-name>
  install:  <what, with which frozen-lockfile command>       | none
  start:    <what, on which port, how it gets stopped>       | none
  write:    ignored: <build-output paths>                    | none
            tracked: none                                    (always none)
  leaves:   <anything still running on return>               | none
```

Every key appears every time. `none` is an answer and must be written out — a missing key reads as an oversight, and the reader cannot tell an omission from a nothing-happened.

## What may be written, and where

"Never touch the repository under test" taken literally is unfollowable: `dotnet build` cannot run without writing `bin/` and `obj/`. An unfollowable rule gets ignored, so the rule is split by what the write actually costs:

| Write | Allowed | Check |
|---|---|---|
| tracked files — source, lockfiles, anything committed | **never** | `git status --porcelain` is identical before and after the run |
| ignored build output — `node_modules/`, `bin/`, `obj/`, `target/`, `dist/` | yes, **declared** under `write.ignored` | it appears in the block |
| screenshots, traces, reports, logs | into the `--fixtures` directory only | never a path inside the repository under test |

**Run `git status --porcelain` before the first command and again after the last.** Identical output is the evidence that the repository under test was read and not edited. Different output is a finding, reported as one — not cleaned up quietly.

## Installing

Use the non-mutating form, always:

| Ecosystem | Use | Never |
|---|---|---|
| npm | `npm ci` | `npm install` |
| pnpm / yarn | `--frozen-lockfile` | the bare command |
| cargo | `--locked` | the bare command |
| .NET | `dotnet restore --locked-mode` | `dotnet restore` |
| browser (Playwright) | `npx playwright install <browser>`, pinned to the installed `@playwright/mcp` package version | a floating install outside that pin, or every browser channel when only one is exercised |

A lockfile rewritten during verification is a tracked-file mutation, which the table above forbids outright.

## Starting and stopping

**Whatever this run started, this run stops.** `leaves:` reads `none` unless stopping failed, in which case it names the process and the port so somebody can finish the job.

## No channel, no side effect

A run with nowhere to emit the block installs nothing and starts nothing. Report the claim as unverified with the announcement channel named as what was missing. An unannounced side effect is the failure this contract exists to prevent, and doing it quietly because reporting was inconvenient is the worst version of it.
