---
name: write-pr-description
description: >-
  Use when the user wants to generate a pull request description, PR summary,
  or release notes from the current branch's changes, optionally posting it to
  an Azure DevOps PR if a URL is given. Triggers on phrasings like "write PR
  description", "generate PR summary", "summarize my changes for PR". Optional
  flags --auto and --dry-run.
allowed-tools: Bash(git *), Read, Grep, Glob, mcp__ado__*, mcp__plugin_terylon-devops_ado__*
---

# Azure DevOps PR — Write Pull Request Description

You generate a pull request description from the current branch's diff against its base
(detected from the repo, never hard-coded). With no PR URL the description is printed to
chat. With a PR URL you read the target branch from the PR, generate the description, and
can post it back via `mcp__ado__repo_update_pull_request`.

## Usage

```
/write-pr-description [<PR-URL>] [--base=<ref>] [--auto | --dry-run]
```

- `<PR-URL>` — optional, of form `https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}`.
  When provided, the target branch is read from the PR and used as the base (unless
  overridden with `--base=`). The description can be posted to the PR after confirmation.
- `--base=<ref>` — override the base branch (e.g. `--base=master` or `--base=main`).
  Takes precedence over the target branch read from the PR.
- `--auto` — no PR URL: no effect. With PR URL: post immediately (subject to
  existing-description guard). Mechanical action; does NOT bypass the guard.
- `--dry-run` — never post; only print the generated description in chat.
- Default — print the description in chat, wait for `push` / `apply` before posting.

## Prerequisites

- Local clone of the repo checked out (the skill reads the diff locally via `git`).
  `git fetch` will run automatically as part of the workflow.
- `mcp__ado__*` tools are only used in PR-URL mode (auto-registered via `plugins/terylon-devops/.mcp.json`). At runtime the plugin-provided server is namespaced `mcp__plugin_terylon-devops_ado__*`; the bare `mcp__ado__*` names in this document are shorthand for that namespaced form.

## Azure DevOps mechanics — delegated to `ado-mcp`

The Azure DevOps tool recipes this skill relies on (PR-URL parsing, resolving the repository id, fetching PR metadata, and the `repo_update_pull_request` write shape) live in the **`ado-mcp`** engine skill. Before issuing any `mcp__ado__*` call, read its single source of truth:

```
${CLAUDE_PLUGIN_ROOT}/skills/ado-mcp/references/ado-mcp.md
```

Delegation centralizes the *recipes* only — this skill still issues its own `mcp__ado__*` tool calls following those recipes. `ado-mcp` never resolves or stamps this skill's footer — footer/version are resolved locally (see step 5).

## Workflow

### 1. Resolve base branch

Priority chain — stop at the first that applies:

1. **`--base=<ref>` supplied** — use it verbatim. It always wins, PR URL or not.
2. **PR URL given** — fetch the PR metadata per the `ado-mcp` reference (parse URL → resolve `repositoryId` → `repo_get_pull_request_by_id`) and read `targetRefName`. Strip `refs/heads/`. Use that value as `<base>`.
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

Fetch the PR metadata once (per the `ado-mcp` reference) and keep the result for later steps — `targetRefName` was already used in step 1, and `pullRequest.description` is read in step 7. Skip with a chat message if `status` is `completed` or `abandoned`. Draft PRs (`isDraft: true`) are allowed — authors update descriptions on drafts frequently.

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

**Checklist items in `## Test plan` (or any other checklist-style section) MUST use
unchecked markdown checkboxes `- [ ]`.** Do NOT pre-check items with `- [x]` and do NOT
substitute static glyphs (`✓`, `✅`, `🟢`, "Done", etc.) for the checkbox. Reason: ADO
renders pre-checked `[x]` as a static green tick that the reviewer cannot toggle, which
defeats the purpose of a checklist. Even items you have already verified locally stay as
`- [ ]` — the reviewer ticks them after re-verifying on the PR. If you need to record
"already done by author", write it in prose elsewhere, not as a checklist item.

**Carry across any tick you find; never regenerate over one.** Something may have ticked
items since this description was last written — a reviewer by hand, or a skill that
executed the plan and holds the exemption `ado-mcp` describes. Rewriting the region as
fresh `- [ ]` would erase that, and ADO keeps no revision history for a description, so it
cannot be recovered.

When the existing region carries `- [X]` items, or headings grouping items by how they
were checked, **preserve them**: match your regenerated items against the ones already
there, keep the state of every item that survives, and say in the chat summary which ticks
you carried and which items were new. When you cannot match an item confidently, keep the
old line rather than replacing it — a stale line the author can delete beats a verified
result silently reset.

You do not need to know what produced a tick, and should not try to tell. Anything already
in the region was put there by someone; your job is to regenerate the plan without
destroying it.

The prohibition above still binds *you*: you generate a plan, and generating is not
executing, however sure you feel about an item.

**Do NOT hard-wrap lines inside the generated description.** ADO's PR-description renderer
treats every source line break as a visible line break (not a markdown soft wrap as
GitHub does), so wrapping a paragraph at 72 / 80 chars produces choppy short lines in the
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
would be overwritten by a description computed before it existed. `repo_update_pull_request`
replaces the entire field, and ADO keeps no revision history for PR descriptions, so the
loss is unrecoverable. One extra `repo_get_pull_request_by_id` costs a second; the sibling
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

### 8. Check the length, then update

**ADO caps `description` at 4000 characters**, counted over the *whole* field — the Claude
region plus anything preserved around it. Over the limit the call fails validation before
reaching ADO (`too_big`) and writes nothing, so measure before calling:

```bash
wc -m <<'DESCRIPTION'
<the located-or-appended description from step 7>
DESCRIPTION
```

**`-m`, not `-c`.** The cap counts characters; `-c` counts bytes, and a description carrying arrows, dashes and emoji measures longer in bytes than it is. Trimming against the byte count cuts material that would have fitted.

Over 4000, cut from the generated body — never from content you did not write. Drop whole
sections rather than trimming every bullet; a reviewer gets more from four complete sections
than from eight truncated ones. Cut in this order:

1. Rationale and background prose — the "why we chose this" paragraphs
2. Reviewer notes and pointers
3. Detail inside **Changes** bullets, keeping every path and symbol name (see the caveman
   rule in step 5: compress the language, never the information)

Never cut the **Test plan** or the footer. Say in the chat summary which sections you
dropped, so the author can paste them into a comment if they matter.

Then write the description via `repo_update_pull_request` using the call shape in the
`ado-mcp` reference (pass `pullRequestId`, `repositoryId`, `projectName`, and the
located-or-appended description from step 7).

Print confirmation with a link to the PR.

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
- **Skipping the length check** — 4000 characters over the whole field, and a long branch
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
- **Pre-checking test-plan items with `- [x]` or `✓`** — ADO renders pre-checked boxes as a
  static green tick the reviewer cannot toggle. Always emit `- [ ]` and let the reviewer
  check off items as they verify them.
- **Hard-wrapping paragraphs / bullets in the generated description** — ADO renders source
  line breaks verbatim, so wrapping at 72–80 chars produces visible choppy lines in the
  rendered output. Emit one line per paragraph / bullet; let the renderer wrap.

## Verification

1. `/write-pr-description --dry-run` on a branch with 3+ commits ahead of the repo's
   integration branch. Expect: the base is detected from `origin/HEAD` (reported in the
   summary), chat output with a template-shaped description, no `mcp__ado__*` calls.
   Test-plan items are emitted as `- [ ]`, never `- [x]` or `✓`.
2. `/write-pr-description <my-PR-url> --dry-run`.
   Expect: same description, target branch read from PR metadata, no write.
3. `/write-pr-description <my-PR-url>`.
   Expect: confirmation prompt; on `push`, `mcp__ado__repo_update_pull_request` called;
   refreshing the PR shows the new description wrapped with the start sentinel
   `<!-- write-pr-description:start -->` and the Claude Code footer.
4. Re-run step 3.
   Expect: sentinel detected → only the marked region is rewritten on `push`. Any content
   before the sentinel or after the footer (e.g. CI preview links the deploy bot posted in
   the meantime) survives intact.
   **Then test the gap explicitly:** run again, and while the skill waits for `push`, edit
   the PR description in the browser to append a line after the footer. Say `push`. Expect
   the appended line to survive — it only does if step 7 re-fetched rather than reusing the
   step-2 snapshot.
   **And test the cap:** on a branch large enough that the generated description exceeds
   4000 characters, expect the skill to report which sections it dropped and to write
   successfully, rather than failing on `too_big`. The Test plan and the footer survive.
5. `/write-pr-description <my-PR-url> --auto` on a PR whose description contains a
   CI-posted block (preview links, connection strings) and no sentinel.
   Expect: the Claude region is **appended** to the existing content, preceded by a blank
   line. The CI block at the top is untouched. No `overwrite` prompt.
6. Legacy compatibility — re-run on a PR whose description carries only the older footer
   without a sentinel.
   Expect: whole description is replaced with the new sentinel-wrapped region (treated as
   legacy Claude-only content).
