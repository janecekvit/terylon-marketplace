---
name: create-pr
description: >-
  Use when the user wants to open a pull request for the current branch on either forge — creates the
  PR, associates the work items it belongs to, fills the description via write-pr-description, and
  can add reviewers and set auto-complete. Triggers on phrasings like "create a PR", "open a pull
  request", "raise a PR for this branch", "PR for this work item". Optional flags --auto and --dry-run.
allowed-tools: Bash(git *), Read, Grep, Glob, Write, Bash(gh *), mcp__plugin_terylon-ado_ado__*
---

# create-pr

Opens a pull request for the current branch and wires up what belongs around it: the work items, the description, optionally reviewers and auto-complete.

**This skill owns the PR *shell*; `write-pr-description` owns the PR *body*.** Never generate a description here — delegate it. The split keeps the length budget and the brevity rules in exactly one place.

## Usage

```
/create-pr [--base=<ref>] [--title=<text>] [--draft]
           [--work-items=<id>[,<id>…] | --no-work-items]
           [--reviewers=<email>[,<email>…]]
           [--auto-complete[=<strategy>]] [--delete-source-branch]
           [--auto | --dry-run]
```

| Flag | Behaviour |
|---|---|
| `--base=<ref>` | Target branch. Default: the detected integration branch (step 1). |
| `--title=<text>` | PR title verbatim. Default: derived from the commits (step 6). |
| `--draft` | Create as a draft. |
| `--work-items=<ids>` | Associate exactly these ids, skipping detection. `--no-work-items` associates none. Default: detect and propose. |
| `--reviewers=<emails>` | Add these people as **optional** reviewers. Required reviewers are not settable here — see step 9. |
| `--auto-complete[=<strategy>]` | Set auto-complete. `no-ff` (default), `squash`, `rebase`, `rebase-merge`. **Never applied without a typed confirmation.** |
| `--delete-source-branch` | Delete the source branch when auto-complete merges. Only meaningful with `--auto-complete`. |
| `--auto` | Apply the mechanical steps — create, link the items — without pausing. Does **not** cover push, reviewers, or auto-merge. |
| `--dry-run` | Never write. Print the plan and stop. |
| _(default)_ | Print the plan, wait for `push` / `apply` / `go`. |

## Prerequisites

- A local clone, checked out on the branch the PR opens from.
- **An adapter enabled** — `terylon-ado` or `terylon-github`. The port registers no server of its own: the adapter supplies `forge-ops`, and on Azure DevOps the `ado` MCP server with it. `resolve-forge` decides which one a run targets, and a missing adapter stops the run rather than being worked around.

## Required sub-skills

Both are hard dependencies. This skill is transport: it owns the *sequence* and the *gates*, nothing else.

- **`forge-ops`** (from the adapter `resolve-forge` names) — owns every platform mechanic used here: repository identity, PR metadata and creation, item detection and linking, identity resolution, reviewers, auto-merge, field encodings and enums. **Load it before the first platform call of the run.** Where this file and `forge-ops` disagree, **`forge-ops` wins**: it is what gets corrected when a pinned server version is bumped or a CLI changes, and both do change.
- **`write-pr-description`** (same plugin) — owns description generation, the length budget, the sentinel and the locate-or-append logic. This skill calls it and posts what it returns.

**This skill names operations, never tools.** The operation names below are the port's; what each resolves to is the adapter's business, and the two resolve differently — a namespaced MCP tool on Azure DevOps, a `gh` invocation on GitHub. That is also why both surfaces sit in `allowed-tools`: an absent one is inert.

## Shape of a run

```
create-pr
├── 1  preflight — branch, remote, repository id, base
├── 2  existing PR? ──▶ top-up mode (skip 8, run 8b/8c)
├── 3  is the branch pushed? ......... asks ✓ always
├── 4  detect the items it implements
├── 5  description ──▶ write-pr-description
├── 6  title
├── 7  confirm the plan ............. asks ✓ (--auto skips, for 8 and 8b only)
├── 8  create the PR      │ 8b link the items (top-up)
│                         │ 8c delegate the description (top-up)
├── 9  reviewers .................... asks ✓ always, even under --auto
├── 10 auto-merge .................. asks ✓ typed confirmation, never under --auto
└── 11 report
```

---

## Workflow

### 1. Preflight

Refuse and stop if any holds:

| Condition | Why |
|---|---|
| HEAD is the integration branch | Work happens on a feature branch. Offer to create one. |
| HEAD is detached | No source ref to open a PR from. |
| No commits ahead of the base | Nothing to review. Report "no commits ahead of `<base>`". |

This skill takes no URL, so **resolve the forge first**: invoke `resolve-forge`, which reads the git remote when nothing more specific was given, and report what it returned. If it resolves nothing, stop — there is no pull request to open here. If its adapter is not enabled, stop and name the plugin to enable.

The adapter checks its own preconditions at this point through the `check-preconditions` operation, and what they are differs: one forge has an organisation setting that must match the remote, or every call goes somewhere the remote does not describe; the other has no such setting and checks only that its authentication is live. `forge-ops` runs whichever applies and reports usable or not, with the reason.

Then run the `resolve-repo-id` operation once — its result is what every later operation identifies the repository by, whether that is a GUID or an `{owner}/{repo}` string:

Cache what it returns and pass it on unchanged. **Do not take it apart**: on one forge it is a pair of GUIDs, one of which is mandatory for item linking and rejected everywhere a name would do; on the other it is a single `{owner}/{repo}` string. A transport that reassembles either shape has taken on the adapter's job.

**Resolve the base by the same chain `write-pr-description` uses**, so the two never disagree about what the PR is diffed against:

1. `--base=<ref>` if given.
2. Otherwise the detected integration branch:

   ```bash
   BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
   ```

3. If `origin/HEAD` is unset, the first of `main`, `master`, `develop` that resolves.

**Report the chosen base** so a wrong guess is visible. Then:

```bash
git fetch origin <base>
BASE_SHA=$(git merge-base HEAD origin/<base>)
git log --oneline $BASE_SHA..HEAD
```

### 2. Is there already a PR?

Run the `list-pull-requests` operation, filtered to this branch as the source and to every status.

**Key the table below on the normalised `isOpen` it returns, never on a state name.** One forge words the state and the other numbers it, so a row written against *active* matches nothing on the numeric side, every pull request falls through to *None*, and the run opens a second pull request from a branch that already has one.

| Result | Mode |
|---|---|
| A PR with **`isOpen` true** | **Top-up mode.** Skip step 8; use 8b for linked items and 8c for the description. Apply only the steps whose inputs are missing and say which parts were already in place. **Re-derive `<base>` from the PR's own `targetBranch`** — the normalised key, already stripped of whatever prefix its forge uses — unless `--base` was given — the existing PR's target is the truth, not step 1's guess — and redo the `merge-base` against it. |
| Only PRs with **`isOpen` false** | Report them and ask before opening a new one from the same branch. |
| None | Normal creation. |

Top-up is the common case after a half-finished run: the branch is pushed and the shell exists, but the description or the item link never landed.

### 3. Is the branch pushed?

PR creation reads the source branch **from the server**, so an unpushed or stale branch produces a PR of the wrong code.

```bash
git fetch origin <branch>                            # may fail — the branch may not exist there yet
git merge-base --is-ancestor HEAD origin/<branch>    # exit 0 => the server has everything local has
```

Fetch first; comparing against a stale tracking ref proves nothing.

| Outcome | Meaning | Action |
|---|---|---|
| exits **0** | `origin/<branch>` contains `HEAD` | Proceed. |
| exits **1** | Local commits missing from the server, or diverged | **Stop and ask permission to push.** |
| `origin/<branch>` does not resolve | Never pushed | **Stop and ask permission to push.** |

**Note the direction:** `HEAD` must be the *ancestor*. Testing it the other way round passes exactly the case this step exists to catch.

Every individual push needs a green light, so `--auto` does **not** cover this. Never `--force`.

### 4. Detect the items this branch implements

An **item** is a work item on Azure DevOps and an issue on GitHub. The port calls it an item; only `forge-ops` knows which.

Skipped entirely under `--no-work-items`. With `--work-items=<ids>` the user has spoken — validate them, but do not run the ladder.

Read what is already linked with the **`list-linked-items`** operation rather than assuming the metadata carries it: on Azure DevOps the metadata fetch has been measured returning **no linked-item key at all** even on a pull request that demonstrably had one, so a transport reading it from there sees an empty set and re-links what is already linked. **Ids may come back as strings** — coerce before comparing. Already-linked items are reported as such and are never link targets.

| Rung | Source | Pattern | Confidence |
|---|---|---|---|
| A | Branch name | `^[a-z]+/(\d{4,7})-` | high |
| B | Commit subjects and bodies in `$BASE_SHA..HEAD` with a strong verb (`Implements`, `Fixes`, `Closes`, `Resolves`) | `(^\|[^A-Za-z0-9_/#-])#(\d{4,6})\b` | high |
| C | Same range, bare mention | same | medium — propose, never auto-select |

```bash
git log --format='%s%n%b' $BASE_SHA..HEAD | grep -vE '^Merged PR [0-9]+:'
```

The `[^A-Za-z0-9_/#-]` guard before `#` is load-bearing — it rejects `AB#123` and `github.com/org/repo#456`. Dropping the `Merged PR` lines matters on branches that merged the base back in.

**Plausibility gate — mandatory where the forge allows a collision.** An item existing proves nothing on a forge whose pull requests and items are numbered in **separate sequences**: a branch named `fix/review-23678` then resolves to a real but unrelated item from years earlier. `forge-ops` states whether its forge collides — Azure DevOps does, GitHub does not, because one sequence numbers both. Where it collides, demote a candidate to **low** — propose with a warning, never auto-select — when any holds:

- its creation date predates the repository's first commit (`git log --reverse --format=%aI origin/<base> | head -1`)
- its type is one that cannot be implemented by a branch
- the number appears in history as a merge subject naming a pull request rather than an item

**Validate one candidate at a time** unless `forge-ops` says a batch read is safe. On Azure DevOps it is not: one unknown id nulls the entire batch, so a batch of untrusted ids tells you nothing about the good ones. A missing item conflates not-found, deleted and no-permission — report "could not be resolved", never "does not exist".

Present survivors as `#<id> — <type>: <title> (<state>)` and let the user drop any.

### 5. The description — delegate, and let the mode decide who posts it

The description always comes from **`write-pr-description`**. The mode decides *who writes the field*:

| Mode | Here | Who writes it |
|---|---|---|
| **Creation** | Invoke `write-pr-description --dry-run --base=<base>` now and take its output **verbatim** — do not rewrite, re-wrap or append. | **This skill**, in step 8. |
| **Top-up** | Nothing yet; note in the plan that it is delegated. | **The sub-skill**, in step 8c, after the plan is confirmed. |

Why top-up waits: the PR already exists, so the sub-skill must do the write itself — it fetches the current description, measures the budget against what is already there, and runs its locate-or-append logic so a CI block or a hand-written note survives. Reproducing any of that here would duplicate the one thing the split exists to keep in one place. And because it writes, it runs its own confirmation, so invoking it before this skill's gate would post before the author agreed to the plan.

In creation mode there is no such hazard: `--dry-run` posts nothing and the region is the whole field.

**Skip the description entirely in top-up mode** when the PR already carries the sub-skill's start sentinel and the author did not ask for a refresh. Say which branch you took.

### 6. Generate the title

`--title=<text>` wins. Otherwise:

- **One commit ahead** — its subject verbatim.
- **Several** — one conventional-commit-style line for the dominant theme, at most 120 characters.

Do not put `#<id>` in the title. The work-item association already shows the link, and a duplicated id goes stale the moment the association changes.

### 7. Confirm the plan

Print it and stop. `--dry-run` stops here permanently; `--auto` proceeds past this gate **for creation and work items only**.

```markdown
### Create PR — <branch> → <base> (<N> commits, +X / -Y)

**Title:**  <title>
**Draft:**  <yes|no>
**Work items:**  #<id> — <type>: <title>   (or "none")
**Reviewers:**  <name> (optional)          (or "none")
**Auto-complete:**  <strategy>, delete source branch: <yes|no>   (or "not set")

<creation mode: the region from step 5, verbatim>
<top-up mode: "Description — delegated to write-pr-description (it will ask before posting)">
```

### 8. Create the PR — creation mode only

The `create-pull-request` operation, with what it takes from the steps above:

| Input | From |
|---|---|
| repository | `resolve-repo-id`, step 1 — its form is the adapter's, and it is not always a name |
| source and target branch | step 1. **Pass them in the shape `forge-ops` asks for**: one forge wants full `refs/heads/<branch>` refs, the other bare branch names, and the wrong shape is rejected rather than normalised |
| title | step 6 |
| description | the region from step 5, verbatim |
| draft | `--draft` |
| items | step 4, where the forge accepts them at creation |

Where the forge accepts item ids at creation, pass them and creation mode never needs step 8b. Where it does not, run 8b afterwards. `forge-ops` says which — and on GitHub the link is a closing keyword in the body rather than an argument, which **also closes the item on merge**, so say that before using it.

**A description over the forge's cap is rejected outright rather than truncated**, and the whole call fails, so the pull request is not created. `write-pr-description` measures against the cap `forge-ops` reports, which is the other reason not to hand-write the field here.

**The body may have to reach the forge as a file, and that is why this skill holds `Write`.** One adapter takes it as a string argument; the other passes every body through a file-valued flag, categorically, because a description carrying backticks, quotes and newlines does not survive shell quoting intact. `forge-ops` says which form it wants — and a transport with no way to produce a file cannot create a pull request at all on the side that demands one.

### 8b. Link the items — top-up mode only

The `link-work-item-to-pull-request` operation, once per item; assume no batch form.

**Take its identifiers from `resolve-repo-id`, never assemble them here.** They are not alike between forges — one wants GUIDs and rejects the names every neighbouring call accepts, the other wants `{owner}/{repo}` and a number — and that difference is the adapter's to know.

Never pass labels in a call that also changes something else: an update path that replaces the label set wholesale exists on both.

### 8c. Write the description — top-up mode only

Invoke `write-pr-description <PR-URL>` — no `--dry-run`, no `--auto`. It owns the fetch, the budget arithmetic, the locate-or-append decision and the update write, and it prompts for its own confirmation.

**Do not pass `--base` unless the user supplied it explicitly.** Given a PR URL the sub-skill reads the base from the PR's own `targetBranch`; forwarding step 1's guess would override the truth and generate the body against a base the PR does not target.

### 9. Reviewers — optional only

The `resolve-identity` operation turns what the user typed into whatever the forge identifies a person by, then `add-reviewers` adds them. **Zero or several matches: stop and ask.** Never guess which colleague was meant.

**Reviewers added here are optional, and this skill cannot make them required** on either forge. A required reviewer comes from a branch policy or a human ticking the box. Say so rather than implying otherwise.

Adding a reviewer **notifies them immediately and there is no unsend**, so this step waits for confirmation **including under `--auto`**.

Read the pull request back rather than trusting the write's response, and read the result the way `forge-ops` documents it: an optional reviewer may be marked by the **absence** of a required flag rather than by that flag being false. Testing for an explicit `false` then finds nothing and reports everyone as required.

### 10. Auto-complete — gated

Only when `--auto-complete` was passed, and only after a **typed confirmation in the same turn**. **Never under `--auto`.** On a PR that already satisfies its policies this merges the branch immediately — treat it as a merge, not as scheduling.

Refuse unless all hold, re-checked immediately before the write:

- the pull request is **active and not a draft** — a draft runs no policies, so auto-merge on a draft is a landmine that fires on publish
- it is **mergeable** — conflicts block it
- auto-merge is **not already set** by someone else

**Read those three the way `forge-ops` documents them, never from their English names.** One forge returns them as numbers and the other as words, so a gate written against `"active"` matches nothing on the numeric side and passes everything through. This is the likeliest way for this step to silently do nothing.

Then the `set-auto-merge` operation, with the strategy, whether to delete the source branch, and whether merging should transition the linked items.

- **Completion options may be sent whole.** Anything a human previously chose and you omit is reset. Read the current options first and echo them back.
- **Decide the item transition explicitly.** Where it defaults to on, merging advances every linked item on the board — a side effect outside git that the human must consent to.
- **Never send a policy-bypass reason.** It is the API equivalent of overriding branch policies, a permission-gated human decision. If asked, refuse and point at the forge's own interface.
- Pick a strategy the target branch's policy actually allows — a merge-commit strategy against a squash-only policy sits un-merged forever.

**The write's response cannot confirm this**, because it may strip the very fields it set. Read the pull request back and report what you observed. The same applies to *cancelling* auto-merge: if the setting survives the read-back, say the cancel did not take.

### 11. Report

Print the pull request's URL as the create operation returned it, and one line per action. Steps 8 to 10 are independent: **a failure in one does not roll back the others**, so report each honestly rather than summarising as one success.

**How to refer to a pull request in posted text is the forge's convention, not ours.** Where pull requests and items are numbered in separate sequences, `#<id>` means an item and a pull request needs its own sigil; where one sequence numbers both, `#<id>` is unambiguous. `forge-ops` states which, and getting it wrong links a real but unrelated object.

**A sigil is also scoped, and the scope is not the forge's whole account.** Numbers are per-repository on both sides, so a bare sigil is only unambiguous where the repository is implied by where the text sits — inside that pull request's own threads. **Anywhere else, and in a work-item or issue comment above all, write the full URL.** A bare sigil there was measured resolving to a same-numbered pull request in a different repository of the same project, which did not exist: a dead link, in a comment whose whole purpose was to point at evidence.

### 12. Do not commit

This skill reads the local history and may push (step 3, with permission). It never commits, amends, rebases or merges.

---

## Safety summary

| Action | Reversible | Outward-facing | Under `--auto` |
|---|---|---|---|
| Create the PR | Abandon | Notifies watchers | Yes |
| Link an item | Yes | Visible on the board | Yes, high-confidence candidates only |
| Push the branch | No | No | **No — always ask** |
| Add reviewers | Yes | **Emails them, no unsend** | **No — always ask** |
| Set auto-merge | **No — it merges** | **Merges, may delete the branch, transitions linked items** | **Never** |
| `bypassReason` | — | — | **Prohibited outright** |

## Common mistakes

- **Assuming a ref shape** — one forge wants full `refs/heads/<branch>` names and the other bare ones, so normalise to what `forge-ops` asks for rather than to what you remember. The stripping rule belongs to diff building, not here.
- **Assembling an identifier by hand** — the link operation wants what `resolve-repo-id` returned, and one forge rejects the names every neighbouring call accepts.
- **Validating candidate items in one batch** — where the forge nulls the whole batch on one unknown id, the good ones tell you nothing.
- **Trusting a number because it resolves** — PR ids and work-item ids collide. Run the plausibility gate.
- **Reporting auto-complete or a reviewer as set from the write response** — the response is trimmed. Read the PR back.
- **Creating the PR before the branch is pushed** — the server builds it from the remote ref.
- **Writing the description here** — it belongs to `write-pr-description`, along with the budget that keeps the forge's character cap from rejecting the call.
- **Issuing a platform call without loading `forge-ops` first** — every schema is `additionalProperties: false`, so a stale parameter name rejects the whole call.
- **Deriving the base from repo metadata instead of the detected integration branch** — the chain is `--base` → `origin/HEAD` → first of `main` / `master` / `develop`, matching `write-pr-description`. Any other rule makes the two disagree about what the PR is diffed against.

## Verification

1. `/create-pr --dry-run` on a branch named `feat/<id>-<slug>` with two or more commits. Expect the forge reported in one line, the item detected from the branch name at high confidence, a description from `write-pr-description`, and **no writes of any kind**.
2. Same on a branch whose name carries a *pull request* id. Expect the candidate demoted by the plausibility gate and **not** auto-selected, with the reason named.
3. `/create-pr` on an unpushed branch. Expect a stop at step 3 asking permission to push — no PR, and no push under `--auto`.
4. `/create-pr` on a branch that already has an active PR. Expect top-up mode: no second PR, only the missing pieces filled, each reported.
5. `/create-pr --reviewers=<colleague>`. Expect a confirmation before the add; afterwards the read-back shows `isRequired` **absent** and the chat says "optional".
6. `/create-pr --auto-complete=squash --auto`. Expect creation and association to proceed while auto-complete still stops for a typed confirmation.
7. `/create-pr --auto-complete` on a draft PR. Expect refusal naming `isDraft` as the reason.

> **See also:** `write-pr-description` for the body, `review-pr` for the review pass, `address-pr-comments` for the inbound direction.
