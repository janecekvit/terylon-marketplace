---
name: code-review
description: >-
  Use when the user wants to review code they wrote — uncommitted changes,
  staged changes, or the current branch's diff against its base. Typically
  run before pushing or opening a PR. Triggers on phrasings like "review my
  changes", "review my branch", "code review", "review the diff", "review
  before push".
allowed-tools: Bash(git *), Read, Grep, Glob
---

# Review Diff

Review the diff of a branch against its base — the set of changes that would appear in a pull request. Works in **local mode** (working-tree / staged / branch-vs-base) and **PR mode** (explicit scope supplied by a sub-skill caller like `review-pr`).

## Sub-skill invocation (called from another skill)

When another skill (e.g. `review-pr`) calls `code-review` programmatically, pass:

- `--scope=pr` — skip the local-mode priority chain; use `--base` and `--head` instead.
- `--scope=staged` — review only staged changes (used by `address-pr-comments` for advisory checks).
- `--base=<sha-or-ref>` — base commit to diff from.
- `--head=<sha-or-ref>` — head commit (defaults to `HEAD`).
- `--repo=<abs-path>` — absolute path to the local clone (defaults to cwd).

Return structured YAML findings (see "Output — sub-skill callers" below) when `--scope=pr` or `--scope=staged` is set.

## Scope detection (local mode, no explicit `--scope`)

Walk this priority chain. Stop at the first non-empty result:

1. **Unstaged working tree** — `git diff --stat` is non-empty.
   Diff: `git diff --no-prefix --unified=100000 --minimal`
2. **Staged** — `git diff --cached --stat` is non-empty.
   Diff: `git diff --cached --no-prefix --unified=100000 --minimal`
3. **Branch vs base** — current branch has commits ahead of `<base>`.
   Detect `<base>` from the repo instead of hard-coding a branch name. Override: `--base=<ref>`.

   ```bash
   BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
   # fallback: first of main / master / develop that resolves; else the current HEAD
   ```

   If `origin/HEAD` is unset, fall back to the first of `main`, `master`, `develop` that resolves
   (`git rev-parse --verify <ref>`); if none resolve, use the current `HEAD`. **Report the chosen base.**

   Diff: `git diff --no-prefix --unified=100000 --minimal <base>...HEAD`
4. **None** — no changes anywhere. Report "nothing to review" and stop.

**Triple-dot (`A...B`)** is the merge-base diff — same set of commits a PR shows. Never substitute `..`.

Resolve the repo root first: `git rev-parse --show-toplevel`. All subsequent paths are relative to that root, not to cwd.

## Dynamic rule discovery

This skill runs across many repos. It never hard-codes language rules. On each run:

1. **Repo root `CLAUDE.md`** — read it if present. This gives project-level naming conventions, module boundaries, anti-patterns.
2. **Per-folder `CLAUDE.md`** — for every directory that contains a changed file, walk up to the repo root reading any `CLAUDE.md` found along the way. De-dup; read each file once per review.
3. **Per-language rules:** follow the conventions of the surrounding code and the consuming repo's `CLAUDE.md`.

4. **Fallback** — where neither the surrounding code nor a `CLAUDE.md` settles a question, review that file with general principles only (see "Review focus" below). Do NOT warn about missing rules; just proceed.

## Review focus

Review `+` lines AND `-` lines together. **Cleanups and refactors delete more than they add** — a review that inspects only `+` misses regressions hidden in removed null-checks, dropped validation, or silently deleted tests.

Language-specific rules (naming, formatting, style) come from the surrounding code and the consuming repo's `CLAUDE.md`. Focus the review itself on what conventions and tooling cannot enforce automatically:

- **Ownership & lifetimes** — dangling references from lambdas or locals, iterator invalidation, smart-pointer choice, non-owning views stored as members, captures that outlive their callback target.
- **Concurrency** — data races, lock ordering, thread-affine assumptions, shared state touched from multiple threads without synchronization.
- **Error handling** — consistent error model within a layer (exceptions / expected / error codes / optionals); no silently swallowed errors; no result-discarding.
- **Architecture & DI** — constructor-injected interfaces; no globals or singletons for testable dependencies; module boundaries respected; no reaching into another module's internals.
- **Testability** — new public interfaces are pure-virtual / mockable; new behavior is covered; no tests quietly deleted alongside the code they covered.
- **Security & data** — no hardcoded secrets, no PII in logs, no raw credentials in error messages.
- **API surface stability** — public interface changes are intentional and backward-compatible unless explicitly breaking.

Large diffs (>10 000 lines): batch by file using paths from `--stat`; state which files each batch covers.

## Output — human readable

When invoked directly (no `--scope=pr`):

```markdown
# Code Review: <scope description (e.g. unstaged / staged / branch vs <detected base>)>
Scope: N files changed (+X / -Y lines). Languages: <detected>.

## Suggestions

### <finding summary>
- Priority: issue | suggestion | nitpick
- File: path/to/file.ext:line
- Details: 1–2 sentences; cite rule / guideline if relevant.
- Suggested Change: concrete snippet.

### <next finding>
...

## Summary
- Counts: issues N / suggestions M / nitpicks K
- Top 3 to address before push / merge
- At least one positive observation
```

**Priority rubric:**
- **issue** — correctness, security, data loss, thread safety, public-contract regression. Must address.
- **suggestion** — design, clarity, testability, non-trivial performance. Worth addressing but not blocking.
- **nitpick** — style beyond what automated tools enforce, minor naming, comment wording. Optional.

## Output — sub-skill callers

When `--scope=pr` or `--scope=staged`:

```yaml
findings:
  - file: <path-relative-to-repo>
    startLine: <int>
    endLine: <int>
    kind: line | conceptual
    severity: blocker | issue | nit
    why: <1-3 sentence rationale>
    suggestedReplacement: |   # omit for conceptual
      <exact replacement text>
```

`review-pr` maps these findings to ADO inline-suggestion threads or PR-wide threads.

## When to use

- Before pushing your branch — `/code-review` picks up unstaged or staged changes.
- After staging but before committing — stage your files, then `/code-review`.
- Before opening a PR — run on a clean working tree; the skill falls through to branch-vs-base against the detected base branch.
- Reviewing someone else's PR via `review-pr` — don't call `code-review` directly; let the devops skill drive it with `--scope=pr`.

**Not this skill:** Applying reviewer feedback from an existing PR → use `address-pr-comments`.

## Common Mistakes

- **Reviewing only `+` lines** — regressions hide in removed null-checks, dropped validation, deleted tests.
- **Flagging auto-generated files** — skip `*.Designer.cs`, `moc_*.cpp`, `.pb.cc`, EF migrations, scaffolded proxies, build outputs. State once that they are excluded.
- **Generating findings for pure renames / moves** — note that once and move on.
- **Substituting `A..B` for `A...B`** — two-dot shows the symmetric diff including base-branch commits; three-dot is what matches the PR diff.
- **Skipping `git fetch`** before diffing against a remote base — you'll diff stale refs.
- **Restating what conventions already enforce** — don't burn a finding on formatting or naming style that the surrounding code or `CLAUDE.md` already settles. Focus on what conventions cannot see.
- **All-positive review** — if everything is fine, say so explicitly and still name one thing worth polishing.
- **No positive observation** — every review should name at least one thing done well.
- **Nitpick list longer than issues + suggestions** — prune. Review noise drowns signal.
- **Large diff with no batching plan** — state the batches up front; don't silently truncate.

## When uncertain — echo

If the diff touches territory not covered by the surrounding conventions or CLAUDE.md (new driver hook, unfamiliar submodule, generated-file pattern not in the skip list), **stop and ask the user** rather than fabricate findings. Echo the uncertainty explicitly.
