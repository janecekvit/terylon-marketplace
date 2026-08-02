---
name: finish-branch
description: Use when a feature branch's work is complete and the tests are green, and the branch has to be integrated — merged locally, pushed for a pull request, or left alone. Verifies the suite, detects whether the work sits in a worktree, presents the integration choice, and cleans up only what this marketplace created.
allowed-tools: Bash(git *), Read, Grep, Glob, AskUserQuestion
---

# finish-branch

Verify green, detect the environment, present the choice, execute it, clean up. Pure git — no forge, no MCP server. The transport that opens a pull request on a specific forge is somebody else's job; this skill gets the branch to the point where opening one is possible and hands over.

## Step 1 — verify the suite on the tree you are about to integrate

Run the project's full test suite. If it fails, report the failures and **stop**. There is no menu after a red suite.

> "Tests passed earlier this session" does not substitute. A green run only proves the tree it ran on, and that is not this one.

## Step 2 — detect the environment

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

Capture `WORKTREE_PATH` **now**, while still inside the workspace — step 5 changes directory before cleanup needs the value.

| State | Menu | Cleanup |
|---|---|---|
| `GIT_DIR == GIT_COMMON` — an ordinary checkout | the three options | nothing to clean up |
| `GIT_DIR != GIT_COMMON`, named branch | the three options | by provenance, see step 5 |
| `GIT_DIR != GIT_COMMON`, detached HEAD | two options, no local merge | externally managed — leave it alone |

## Step 3 — establish the base branch

The base is whatever this work forked from — named in the plan, in the branch's upstream, or in the conversation. **If it is not already known, ask.** Merging into the wrong base is expensive to undo, and "it is obviously the default branch" is how that happens.

## Step 4 — present the choice, exactly as written

```
Implementation complete. What would you like to do?

1. Merge back to <base> locally
2. Push and open a pull request
3. Keep the branch as-is
```

On a detached HEAD, drop option 1 and renumber.

**The integration decision belongs to the user.** Present the menu and wait; do not read intent from how finished the work looks. **Discarding is not on the menu** — it happens only when the user asks for it in so many words, and then only after they type `discard` against an explicit list of what will be destroyed.

## Step 5 — execute

### Option 1 — merge locally

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git checkout <base>
git pull
git merge <feature-branch>
```

Re-run the suite **on the merged result**. If it fails: stop, leave branch and worktree in place, investigate. Nothing has been pushed, so it is recoverable. A failure here is never "probably flaky".

Green, and only then: clean up the worktree (below), then `git branch -d <feature-branch>`.

### Option 2 — push for a pull request

```bash
git push -u origin <feature-branch>
# from a detached HEAD:
# git push origin HEAD:refs/heads/<new-branch>
```

**Keep the worktree** — review feedback gets fixed in it, and the branch has not landed yet. Opening the pull request itself belongs to the forge transport, not here.

A rejected push means the remote moved. Investigate. Never force-push without the user asking for it explicitly.

### Option 3 — keep as-is

Report the branch name and the worktree path. Nothing else happens.

### Worktree cleanup

Runs for option 1 and for a confirmed discard, never for options 2 and 3. Run it from the main repo root, using the values captured in step 2.

| `WORKTREE_PATH` | Do |
|---|---|
| `GIT_DIR == GIT_COMMON` | nothing — ordinary checkout |
| under `.claude/worktrees/`, `.worktrees/` or `worktrees/` | `git worktree remove "$WORKTREE_PATH"` then `git worktree prune` |
| anywhere else | leave it — the host environment owns it |

`create-workspace` puts Terylon worktrees under `.claude/worktrees/`, which is why that path is ours to remove and no other is.

## The git rules still hold

Every commit, push, merge, rebase and branch deletion in this skill needs **explicit user consent at the moment it happens**. Choosing an option from the menu is consent for that option, not for the next one. `main` is never merged into or pushed to directly.

## Rationalizations, and what is actually true

| Excuse | Reality |
|---|---|
| "Tests passed earlier" | run the suite on the tree being integrated |
| "They obviously want it merged" | the menu exists because the decision is theirs |
| "They seem done — I will offer to discard" | discard is not on the menu; only an explicit request puts it there |
| "'Yeah, get rid of it' is confirmation enough" | only the typed word `discard` authorizes deletion |
| "The PR is up, the worktree is clutter" | feedback gets fixed there; it stays until the work lands |
| "This other worktree looks stale" | clean up only the path this marketplace created |
| "The merged result is probably flaky" | a red merged result stops everything |
| "The base is obviously the default branch" | confirm the fork point or ask |
| "The push was rejected, force it" | the remote moved; investigate |
