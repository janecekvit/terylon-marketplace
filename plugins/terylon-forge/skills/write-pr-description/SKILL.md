---
name: write-pr-description
description: >-
  Use when the user wants to generate a pull request description, PR summary,
  or release notes from the current branch's changes, optionally posting it to
  the PR if a URL is given, on either forge. Triggers on phrasings like "write PR
  description", "generate PR summary", "summarize my changes for PR". Optional
  flags --auto and --dry-run.
allowed-tools: Bash(git *) Bash(gh *) Bash(wc *) Read Grep Glob Write mcp__ado__*
---

# Pull Request — Write the Description

You generate a pull request description from the current branch's diff against its base
(detected from the repo, never hard-coded). With no PR URL the description is printed to
chat. With a PR URL you read the target branch from the PR, generate the description, and
can post it back via the `update-pr-description` operation.

## Usage

```
/write-pr-description [<PR-URL>] [--base=<ref>] [--auto | --dry-run]
```

- `<PR-URL>` — optional, in either forge's PR URL — `dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}` or `github.com/{owner}/{repo}/pull/{n}`.
  When provided, the target branch is read from the PR and used as the base (unless
  overridden with `--base=`). The description can be posted to the PR after confirmation.
- `--base=<ref>` — override the base branch (e.g. `--base=master` or `--base=main`).
  Takes precedence over the target branch read from the PR.
- `--auto` — no PR URL: no effect. With PR URL: post immediately (subject to
  existing-description guard). Mechanical action; does NOT bypass the guard.
- `--dry-run` — never post; only print the generated description in chat.
- Default — print the description in chat, wait for `push` / `apply` before posting.

**This skill owns the PR *body*; `create-pr` owns the PR *shell*.** When a pull request has to be opened as well, `create-pr` is the caller — it handles the branch, the work items, the reviewers and auto-complete, and delegates the description here. Run this one directly when the PR already exists and only its description needs writing.

## Prerequisites

- Local clone of the repo checked out (the skill reads the diff locally via `git`).
  `git fetch` will run automatically as part of the workflow.
- Forge access is used only in PR-URL mode, and comes from whichever adapter is enabled: `terylon-ado` registers the `ado` MCP server, namespaced `mcp__ado__*` at runtime, while `terylon-github` needs only an authenticated `gh`. This skill holds both surfaces and uses the one `resolve-forge` names.

## Platform mechanics — delegated to `forge-ops`

The recipes this skill relies on (PR-URL parsing, resolving the repository id, fetching PR metadata, and the `update-pr-description` write shape) live in the **`forge-ops`** engine skill of whichever adapter `resolve-forge` names. Load it by name before the first platform call, and read its single source of truth:

Load the skill `forge-ops` by name, plugin-qualified when both adapters are enabled.

Delegation centralizes the *recipes* only — this skill still issues its own platform calls following those recipes. `forge-ops` never resolves or stamps this skill's footer — footer/version are resolved locally (see step 5).

## Workflow

### 1. Resolve base branch

Priority chain — stop at the first that applies:

1. **`--base=<ref>` supplied** — use it verbatim. It always wins, PR URL or not.
2. **PR URL given** — fetch the PR metadata per the `forge-ops` reference (the `parse-pr-url`, `resolve-repo-id` and `fetch-pr-metadata` operations, in that order) and read **`targetBranch`**, the normalised key. It arrives stripped of whatever ref prefix its forge uses; do not strip anything yourself. Use that value as `<base>`.
3. **Neither** — detect the repo's integration branch instead of hard-coding a branch name:

   ```bash
   BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
   # fallback: first of main / master / develop that resolves; else the current HEAD
   ```

   If `origin/HEAD` is unset, fall back to the first of `main`, `master`, `develop` that
   resolves (`git rev-parse --verify origin/<ref>`); if none resolve, use the current `HEAD`.
   **Report the chosen base** in the chat summary so the author can spot a wrong guess.

Run `git fetch origin <base>` before computing the diff.

### 2. Fetch PR metadata (PR mode only)

Fetch the PR metadata once (per the `forge-ops` reference) and keep the result for later steps — `targetBranch` was already used in step 1, and the current description is read in step 7. Skip with a chat message if `eligibility-check` reports `isOpen` false. Draft PRs (`isDraft: true`) are allowed — authors update descriptions on drafts frequently.

### 3. Build the diff

```bash
BASE_SHA=$(git merge-base HEAD origin/<base>)
git diff --no-prefix --unified=100000 --minimal $BASE_SHA..HEAD
git log --oneline $BASE_SHA..HEAD
git diff --stat $BASE_SHA..HEAD
```

**Two-dot (`A..B`)** is correct here — we want commits ahead of the base on this branch
(author view). This differs intentionally from the triple-dot (`A...B`) used by the
`code-review` engine in `terylon-git`, which shows the symmetric difference a reviewer sees.

If the diff is empty: report "no commits ahead of `<base>`" and stop.

### 4. Detect PR template

Read the first file that exists:

1. `.azuredevops/pull_request_template.md`
2. `.github/PULL_REQUEST_TEMPLATE.md`
3. `pull_request_template.md` or `PULL_REQUEST_TEMPLATE.md` at repo root
4. Built-in fallback:

   ```markdown
   ## Summary

   ## Changes

   ## Test plan
   ```

When a template is found, fill its labelled sections using the diff and commit messages.
Preserve any sections you cannot fill with `_TBD by author_` so the author sees what
remains. Do not delete or reorder template sections.

### 5. Generate description

Fill the template from the diff and commit log. **Caveman style — terse, high-signal, low-fluff** (short declarative fragments, not literal grunts):

- **Verb-first, one fact per bullet**, present tense: "Adds `ActivityContext` (GUID + family) to the log XML", not "This change introduces a new structure that is responsible for…". Cut filler, hedging, justification prose, and adjectives.
- **Compress the language, never the information.** Keep EVERY technical detail — exact file / module paths, symbol and type names, field / flag / enum names, counts, data shapes. Caveman means short sentences, *not* dropped specifics; a reviewer must still learn *what* changed *where* from the bullets alone.
- **Group** changes by logical theme (or by file) under short bold sub-headers; bullets, not paragraphs.
- The **Summary** stays one dense sentence — what the PR does plus the load-bearing "why", no preamble.

**Before writing `## Test plan` or any checklist section, read [`references/test-plan.md`](references/test-plan.md).** In short: every item is an unchecked `- [ ]`, never pre-ticked; every item is a procedure with an expected result, never an outcome; render the build's plan when there is one and never invent one; carry every existing tick across a regeneration.

**Do NOT hard-wrap lines inside the generated description.** One forge's renderer treats
every source line break as a visible line break rather than as a markdown soft wrap, so
wrapping a paragraph at 72 / 80 chars produces choppy short lines in the
rendered output even though horizontal space is generous. Emit each paragraph as one
continuous line and each bullet as one continuous line; let the renderer wrap naturally.
Only insert a real `\n` between distinct paragraphs / bullets / headings.

The Claude-managed region of the PR description is bounded by two markers:

- **Start sentinel** — `<!-- write-pr-description:start -->` (HTML comment,
  invisible when rendered).
- **End** — the mandatory footer line (below).

Wrap the generated description between these markers so that re-runs replace only this
region. Content posted by other actors (CI preview links, deploy bots, manual notes
outside the markers) is preserved verbatim across re-runs.

Final shape:

```markdown
<!-- write-pr-description:start -->
<generated description body>

---
*🤖 Generated with [Claude Code](https://claude.ai/code) — write-pr-description@<plugin-version> · <model> / <effort>*
```

`<plugin-version>` is read at runtime from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. `<model>` is the model the run executes under (e.g. `opus-4.8`) — the skill knows it from itself, as no environment variable exposes it. `<effort>` comes from the `CLAUDE_EFFORT` environment variable (e.g. `xhigh`); **when `CLAUDE_EFFORT` is unset, omit the entire ` · <model> / <effort>` segment.** The substring `Generated with [Claude Code]` is the sentinel for prior-run detection — everything variable sits after that stable prefix.

### 6. Branch on flags + mode

| Condition | Action |
|-----------|--------|
| No PR URL | Print description to chat. Stop. |
| PR URL + `--dry-run` | Print description to chat, labelled "(dry-run — nothing will be posted)". Stop. |
| PR URL + `--auto` | Run existing-description guard (step 7). If guard trips, surface and stop. Else post immediately. |
| PR URL + default | Print chat summary (see format below). Wait for `push` / `apply`. On confirmation, run step 7 then post. |

### 7. Locate-or-append the Claude region

**Re-fetch the PR metadata first.** Do not reuse the snapshot from step 2 — in default mode
the wait for `push` is unbounded, and a CI bot appending a preview link during that gap
would be overwritten by a description computed before it existed. the `update-pr-description` operation
replaces the entire field, and where the forge keeps no revision history for descriptions
the loss is unrecoverable. One extra `fetch-pr-metadata` costs a second; the sibling
`review-pr` re-checks at its own step 6 for the same reason.

Use the freshly-read `pullRequest.description`. The skill writes **only** its own marked
region; everything else is preserved.

| Existing description state | Action |
|---|---|
| Empty | Write the Claude region alone (sentinel + body + footer). |
| Contains the **start sentinel** `<!-- write-pr-description:start -->` | Replace from the sentinel through the end of the footer line with the new Claude region. Anything before the sentinel OR after the footer (CI preview links, deploy bot output, manual notes) is preserved verbatim. |
| Contains the footer substring `Generated with [Claude Code]` but no sentinel | Legacy Claude-only description from an older skill version. Treat the whole description as the Claude region and replace it with the new (sentinel-wrapped) region. Match the version-less substring, not the full footer — the trailing `@<version> · <model> / <effort>` segment varies per run. |
| Non-empty, neither sentinel nor footer | Mixed / non-Claude content (a CI block, a hand-written draft, a deploy bot post). **Append** the Claude region to the end of the existing description, preceded by a blank line. Do NOT overwrite. |

The skill never destroys content it did not write. `--auto` is safe under this design —
there is no longer an `overwrite` prompt because the design makes silent overwrites
impossible. If the user genuinely wants to nuke a hand-written description, they edit the
PR to remove the existing text first, then re-run.

### 8. Budget the region, measure it, then update

The description is read by a human in under a minute and **shares one small field with whatever CI appends afterwards**, so it is length-budgeted first and complete second.

#### 8a. The constants

**The unit of measure is the region — sentinel through footer, inclusive — not the body.** The two markers cost roughly 150 characters the forge counts like any other text, so a body written to a 2500-character budget posts at over 2650.

| Constant | Value | What it is |
|---|---|---|
| `CAP` | the forge's limit, from `forge-ops` | 4000 on Azure DevOps, roughly 65 536 on GitHub. The write is **rejected** over the limit; it does not truncate, and nothing is posted. |
| `FIELD_CEILING` | `CAP` − 100 | The 100 covers CRLF normalisation and a longer `<plugin-version>`. **Derive it; do not pin it.** Pinned at 3900 it silently imposes the Azure DevOps limit on a forge with sixteen times the room, and a pull request carrying a few thousand characters of CI output then refuses to post with the field almost empty. |
| `CI_RESERVE` | 700 | Held back for what CI appends to the same field **after** we post. |
| `BUDGET` | 2500 | Nominal budget for the region. |
| `FLOOR` | 400 | The smallest region that still says something: sentinel, a summary, one sentence, footer. |

Let `FOREIGN` be everything in the current description **outside** the Claude region — the whole description on a first run, everything before the sentinel plus everything after the footer on a re-run. Read it from the metadata already fetched in step 2; no extra call.

```
JOIN  = 2 if FOREIGN > 0 else 0          # the blank line between regions
B_eff = min(BUDGET, FIELD_CEILING - FOREIGN - JOIN - CI_RESERVE)
```

Drop `CI_RESERVE` to 0 **only when CI's block is already visible in `FOREIGN`** — a preview link, an environment table, deploy output. At that point it is counted once already, and reserving for it twice shrinks the budget on every re-run. When in doubt, keep the reserve.

**If `B_eff < FLOOR`, do not post.** Print the description to chat with the arithmetic — `FOREIGN`, `CI_RESERVE`, `B_eff` — and give the author the choice: trim the foreign content and re-run, or take the description as chat output. **Never truncate to fit, and never delete foreign content to make room.**

#### 8b. Structural caps

These keep the output short by construction, so the ladder below rarely runs.

| Element | Cap |
|---|---|
| Summary | 2 sentences, 300 characters |
| Sub-headers under **Changes** | 3 |
| Bullets under **Changes** | 7 total, 3 per sub-header |
| Characters per bullet | 150 |
| **Test plan** items | 5, at 110 characters each |
| Bullets in the whole body | 12 |

**Do not enumerate files.** Both forges already list every changed file with its line counts in their own files view. Forty files at roughly 60 characters each is the entire budget spent on what the reviewer is one click from. Name a path only where a bullet is meaningless without it.

#### 8c. Measure before posting

Assemble the full region and **count it — do not estimate.** A bullet judged at 140 characters is routinely 190.

**A character may be a UTF-16 code unit rather than a byte** — what .NET's `String.Length` counts — wherever the gate downstream is .NET (`nvarchar` server-side). So the footer's robot emoji costs **2**, while `é`, `—` and `→` cost 1 each.

| Method | When | Why |
|---|---|---|
| **`wc -c`** — the default | always | counts UTF-8 bytes, which are never fewer than UTF-16 code units. A quoted heredoc (`<<'EOF'`) adds exactly one newline, so compare `count - 1` against `B_eff`. Passing this guarantees you are under the real limit. |
| UTF-16 code units | only when the byte count is the **only** thing over | `wc -c` over-charges every non-ASCII character (an em dash costs 3 bytes, 1 unit). If the byte count exceeds `B_eff` by less than the number of non-ASCII characters, the region probably fits and cutting would be wrong. Needs its own tool grant — ask rather than assume. |
| **`wc -m`** | **never** | locale-dependent: bytes under the C locale Git for Windows ships, code points under a UTF-8 locale. The code-point reading **under-counts the footer emoji**, which is the one way to pass the check while being over the real limit. |

```bash
wc -c <<'DESCRIPTION'
<the assembled region from step 7>
DESCRIPTION
```

**Write the measured region to a file, and hand the operation that file.** This is why the skill holds `Write`: one adapter takes the description as a string argument, the other passes every body through a file-valued flag and forbids inlining, because a description carrying backticks, quotes and newlines does not survive shell quoting intact. `forge-ops` says which form its side wants; producing the file either way costs nothing and is the only form that works on both.

#### 8d. Reduction ladder

Over budget? Apply the ladder in [`references/reduction-ladder.md`](references/reduction-ladder.md), **in order**, re-measuring after each rung, and stop at the first that fits. Its invariants bind every rung: never drop the sentinel or the footer, never truncate mid-anything, never leave a dangling heading, never cut foreign content.

Then write the description via the `forge-ops` update recipe, and print confirmation with a link to the PR **and the region's measured length against `B_eff`**.

### 9. Do not commit

Do NOT create a commit, stage anything, or otherwise mutate git state. The skill reads the
local diff read-only and makes no git changes; committing is always the user's explicit
decision, never a side effect of generating a description. Stop after posting (or printing).

## Chat summary format

```markdown
### PR description — <branch> vs <base> (<N> commits, +X / -Y lines)

<generated description verbatim>
```

Then, for PR-URL default mode: `Reply "push" to update PR #<id>.`
For no-URL mode: `(Local-only — paste into your PR when you open it.)`

## Common mistakes

- **`A...B` instead of `A..B`** — three-dot is the reviewer diff (symmetric difference from
  merge-base). For "what's new on my branch" use two-dot.
- **Skipping `git fetch origin <base>`** — stale base ref produces a stale diff. Always fetch
  before calling `merge-base`.
- **Writing from a stale snapshot** — the description read in step 2 can be minutes or hours
  old by the time the user says `push`. Re-fetch at step 7. Anything a CI bot appended in
  between is gone otherwise, with no revision history to recover it from.
- **Using `wc -m`** — locale-dependent, and under the UTF-8 reading it under-counts the footer emoji, so it can pass while the region is over. `wc -c` is the safe default.
- **Budgeting the body instead of the region** — the sentinel and footer cost about 150 characters the forge counts too.
- **Spending the budget on a file list** — the Files tab already has it.
- **Deleting foreign content to make room** — it is not ours. When `B_eff` drops below the floor, print to chat and let the author decide.
- **Skipping the length check** — the cap is counted over the whole field, and a long branch
  easily exceeds it. The call fails cleanly, but only after the description was generated;
  measure at step 8 and cut whole sections rather than discovering the limit on the write.
- **Overwriting content outside the Claude region** — CI bots post preview links,
  connection strings, and deploy timestamps to PR descriptions. Anything outside the
  sentinel + footer pair belongs to someone else; preserve it verbatim.
- **Stripping the sentinel or footer on re-run** — both markers are required for the
  next re-run to locate the Claude region. Always emit both: sentinel at the start of
  the region, footer at the end.
- **Ignoring the repo's PR template** — if the repo has `.azuredevops/pull_request_template.md`,
  the team expects that structure. Fill it; don't replace it with the built-in fallback.
- **Using `HEAD` as the base ref** — `git merge-base HEAD origin/<base>` is the correct way
  to find where this branch diverged from `<base>`. `HEAD` alone gives you nothing useful.
- **Hard-coding the base branch** — repos disagree on whether the integration branch is
  `main`, `master`, or `develop`. Detect it from `origin/HEAD` and fall back down the list;
  never assume one name.
- **Pre-checking test-plan items with `- [x]` or `✓`** — a tick nobody earned, and on one
  forge one the reviewer cannot even clear. Always emit `- [ ]` and let the reviewer check
  items off as they verify them.
- **Hard-wrapping paragraphs / bullets in the generated description** — one forge renders
  source line breaks verbatim, so wrapping at 72–80 chars produces visible choppy lines.
  Emit one line per paragraph / bullet; let the renderer wrap. Harmless on the other forge,
  so the stricter rule is the one to follow.

## Verification

The manual checks a maintainer runs after changing this skill are in [`references/verification.md`](references/verification.md). They are not needed to run it.
