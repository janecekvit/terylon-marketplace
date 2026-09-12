# background-run — what was measured, and what was not

Every claim `SKILL.md` makes about the tooling is in one of the tables below. **A claim not in the first table has not been measured**, and the skill's prose should not be quoted as evidence for it.

Measured on 2026-09-10 and 2026-09-11 in the `terylon-dev` session on TerylonLab, Claude Code `2.1.268`, uid `10004`.

**Everything below was measured while this skill was called `dispatch-unattended`.** It was renamed before it shipped, so no measurement is of a different thing — but the name in a transcript from those days is the old one, and a reader comparing the two should not have to wonder.

## Measured

| Claim | How | Result |
|---|---|---|
| `claude --bg` prints the short id and the label, and neither the worktree nor the branch | dispatched a two-commit probe run | printed `backgrounded · 71c916a3 · us156 probe` and four `claude <verb> 71c916a3` hints. No path, no branch |
| `--worktree <name>` is honoured; the branch is `worktree-<name>` | same probe, `--worktree us156-probe` | `worktreePath: <repo>/.claude/worktrees/us156-probe`, `worktreeBranch: worktree-us156-probe` |
| Without `--worktree`, the name is generated and does not match anything the operator typed | the 2026-08-25 runs | `nameSource: "auto"`; label *"database internals primer"* against worktree `db-internals-primer`, label *"compiler primer essays"* against worktree `compiler-construction-primer` |
| A run told to commit each item does | `worktree-db-internals-primer`, `worktree-distributed-systems-docs` | **30** and **12** commits, one per chapter and per document |
| An interrupted run that had not committed keeps nothing | `worktree-compiler-construction-primer` | **0** commits ahead of `master`; the worktree directory still holds only the three seed files |
| Nothing resumes an interrupted run | the same job record, read 16 days later | still `"state": "failed"`, `"detail": "process gone while supervisor was down"`, `reapedMidWorkAt` **35.3 s** after `createdAt` |
| `claude logs` on a finished session with the daemon gone | `claude logs 429dc125`, before any daemon was running | `Couldn't read logs for 429dc125 — connect ENOENT /tmp/cc-daemon-10004/d94ad8df/control.sock` |
| `claude logs` on a session that finished under an **earlier** daemon | the same command, after a daemon was running again | `Couldn't read logs for 429dc125 — job not found — it may have already exited` |
| `claude logs` on a session that finished under the **current** daemon | `claude logs 71c916a3`, seconds after it reported `done` | the replay is returned — as raw terminal escape sequences, not as readable text |
| `state.json` outlives the session and the daemon | read the 2026-08-25 records on 2026-09-10 | present, with `worktreePath`, `worktreeBranch`, `sessionId`, `intent`, `state`, `detail` |
| The session transcript outlives the run | `~/.claude/projects/<encoded-worktree-path>/<sessionId>.jsonl` | present for both the successful run (148 KB) and the failed one (48 KB) |
| `claude rm` refuses to delete a worktree holding unpushed commits | `claude rm 71c916a3` on the probe | refused, named the commits, and printed the `--discard-unpushed` form needed to override |
| `claude agents --json --all` reports each session's state without a TTY | ran it | a JSON array with `id`, `sessionId`, `cwd`, `name`, `state` |

The probe session and its worktree were discarded afterwards; the 2026-08-25 runs were only read.

## Measured: the skill itself

Run against this branch's own copy of the plugin, loaded with `claude --plugin-dir plugins/terylon-dev` — the same loader a marketplace install uses, with no step taken beyond making the plugin available.

| Claim | Prompt | Result |
|---|---|---|
| The plugin loads with the new skill and nothing else is needed | *"list the skill names you can see from the terylon-dev plugin"* | `brainstorm`, `develop`, **`background-run`**, `run-build-loop`, `write-plan` |
| The description matches an expressed intent to dispatch | *"Kick this refactor off in the background and tell me where it lands."* | `terylon-dev:background-run` |
| It does **not** match long work with no dispatch intent | *"Write me forty separate markdown essays forming a primer on compiler construction."* | `NONE` |
| It does **not** match short work | *"Rename the variable foo to bar in utils.js."* | `NONE` |

The third row is the one worth keeping: that prompt is, near enough, the task the 2026-08-25 run that lost everything was given. A length-based trigger would have matched it, and matching it is the failure the invocation decision was written to avoid.

**This measures what the description matches, not that the skill then behaves correctly end to end.** Each case asked which skill applied and forbade invoking it, so the body of the skill was never executed. Whether a dispatched run then loses one step and no more is the criterion in the section below, and it is not met.

## Taken from the tool's own documentation, not exercised

| Claim | Source |
|---|---|
| `claude respawn` restarts a background session so it picks up the current Claude Code binary, and is not a re-run of a failed task | `claude respawn --help`. Exercising it on the failed 2026-08-25 run would have started a forty-essay run, so it was not exercised |
| A background session finishing notifies nobody | the absence of any notification mechanism in `claude --help` and in the background-session subcommands. An absence is weaker evidence than a measurement and is marked as such here |

## Measured: the install, through the installer rather than beside it

The earlier table loaded this plugin with `claude --plugin-dir`, which points at a directory and is **not** what a marketplace install does. On 2026-09-11 the real path was exercised into a scratch `CLAUDE_CONFIG_DIR`:

| Step | Result |
|---|---|
| `claude plugin marketplace add /work/terylon-marketplace` | `Successfully added marketplace: terylon` |
| `claude plugin install terylon-dev@terylon` | `Successfully installed plugin: terylon-dev@terylon (scope: user) (+ 3 dependencies: terylon-git, terylon-forge, terylon-core)` |
| the installer's own cache | `brainstorm develop **background-run** run-build-loop write-plan` |

**No step was taken beyond the install.** The dependencies came with it.

**What this does not establish, precisely.** The source was a local path, not the git remote, because the marketplace's `ref` comes from `extraKnownMarketplaces` in settings and the committed declaration is `main` — `plugin marketplace add` takes no `--ref`, and an add whose source disagrees with the declaration is refused outright:

```
Cannot add marketplace "terylon": its network source differs from the one declared for it
in settings (kind, target, or a fetch-shaping field such as headers / ref / path / sparsePaths)
```

So installing this branch from the git remote is not possible until it is on `main`. **The untested hop is the clone, and only the clone**: what happens after it — resolving the plugin, pulling its dependencies, landing the skill in the cache — is the table above. Once this merges, the confirmation is one command in a scratch config directory: add the marketplace by its URL and install `terylon-dev@terylon`, then check that `background-run` is among the cached skills.

## Measured: the controlled interruption

**The story's last acceptance criterion — *a real long run dispatched through it, interrupted deliberately, loses one step and no more* — is met.** Measured on 2026-09-11 in the `terylon-dev` session on TerylonLab, against a scratch repository whose step boundary was one document.

A run was dispatched through the skill's own shape — `claude --bg --worktree us156-interrupt`, with the commit-each-step block in the prompt — and told to write documents `01.md` onward, one commit per document.

| What died | Committed steps at that moment | After | What was lost |
|---|---|---|---|
| the **session process** alone | 13 | **16, and climbing** | nothing. The daemon restarted it with `--resume` within seconds; this was not an interruption at all |
| the **daemon** alone | 6 | 10, then it stopped | nothing committed. The session ran on unsupervised, committing four more steps, before it was reaped |
| **both together**, the shape a reboot has | 18 | **18**, and nothing resumed it a minute later | the step in flight. `documents/19.md` does not exist and the worktree is clean |

**Every commit the run had made was on `worktree-us156-interrupt`, and the working tree held nothing uncommitted.** The loss is exactly the one step that was in progress, which is what the criterion asks.

### What this corrected in the skill

`SKILL.md` said *"Nothing restarts this run if it is interrupted"*, flat. The first row above shows that to be false whenever the supervisor survives: **killing a background session does not stop it.** The claim is now qualified where it appears, and the table above is why. `claude stop <id>` is the way to end a run; a reboot is the interruption the commit-each-step discipline actually protects against.

The second row is worth as much: a stopped daemon does not stop the work either, so "the daemon is gone" is not a safe way to read "the run is over" — the run's own `state` is.

### What this did not measure

The interruption was induced with `kill -9`, not by rebooting the host. A reboot also takes the filesystem cache and anything git had not flushed; nothing here shows that a commit made in the last instant before power loss survives. What it shows is that the supervisor's death, the session's death, and both together behave as described — which is the part an operator can act on.
