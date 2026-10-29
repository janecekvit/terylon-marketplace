# Plugins — author guide

This directory holds Terylon's distributed Claude Code plugins. Each subdirectory is one plugin published through `.claude-plugin/marketplace.json` at the repo root.

## Plugin directory shape

Every plugin folder must contain:

```
plugins/terylon-<role>/
├── .claude-plugin/
│   └── plugin.json          # required, schema: claude-code-plugin-manifest
├── skills/                  # required (may be empty); SKILL.md files go here
│   └── .gitkeep             # only while skills/ is empty, so git tracks the folder
└── README.md                # required; consumer-facing audience + install snippet
```

`plugin.json` minimum:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-plugin-manifest.json",
  "name": "terylon-<role>",
  "version": "0.1.0",
  "description": "<one sentence>",
  "author": { "name": "Vít Janeček" },
  "homepage": "https://github.com/janecekvit/terylon-marketplace/tree/main/plugins/terylon-<role>",
  "repository": "https://github.com/janecekvit/terylon-marketplace",
  "license": "Apache-2.0",
  "keywords": ["<topic>", "<topic>"]
}
```

## Naming

- Every plugin slug is `terylon-<role>` — lowercase, kebab-case, role is a short noun (no `-engineer` / `-developer` suffix).
- **`terylon-os` is the product's own plugin**: not a role on a team but Terylon itself, the agentic OS extension — its `/mcp` server and the skills that mirror the server's prompts — and its mod is `terylon-pane`. It is not named `terylon`, because `terylon@terylon` would collide with the marketplace's name.
- The `terylon-` prefix is intentionally redundant with the `@terylon` marketplace suffix. Reason: Claude Code's slash-command autocomplete filters by the per-plugin slug shown in the tag column. Putting `terylon` into every slug means a user can type `/terylon` and see every command from every Terylon-marketplace plugin in one filtered list, without having to remember per-role slugs.
- Slug must match the directory name AND the `name` field in `plugin.json` AND the `name` in the corresponding entry of `marketplace.json`.

### Skills are actions, agents are roles

**Name a skill for what it does** — a verb phrase: `create-workspace`, `code-review`, `write-pr-description`, `address-pr-comments`. The user invokes it, so it reads as an instruction.

**Name an agent for who it is** — an agent noun, ending in `-er` / `-or`: `developer`, `planner`, `debugger`, `refactorer`, `code-reviewer`, `pr-reviewer`. An agent is dispatched and reports back, so it reads as a role on a team.

The distinction is load-bearing, not decorative. `code-review` (the skill) and `code-reviewer` (the agent) act on the same material, and the shape of the name is what tells a reader which one they are looking at.

**The `*-reviewer` family is graded by scope, not by rigour.** Every reviewer reviews; they differ in how much they look at.

| Agent | Scope | Plugin |
|---|---|---|
| `security-reviewer`, `performance-reviewer`, `architecture-reviewer`, `edge-case-reviewer` | one dimension of a diff | `terylon-dev` |
| `code-reviewer` | a whole diff — dispatches the lenses, then adversarially verifies what they return | `terylon-git` |
| `pr-reviewer` | a whole pull request — fetches it, dispatches `code-reviewer`, writes the findings back | `terylon-forge` |

Read top to bottom it goes dimension → code → pull request. A new reviewer belongs somewhere on that ladder; if it does not, it is probably not a reviewer.

The single-dimension lenses are read-only and propose rather than edit. Keep that property when adding one.

### No redundant prefixes

Do not prefix a component with its plugin's topic. The plugin slug already namespaces it, so `terylon-ado:ado-fetch-work-item` says "ado" twice. The plugin boundary carries that information; the component name should carry only what is specific to it.

`forge-ops` is not an exception either: it is named for the **port** it implements, not for a platform, which is exactly why both adapters can ship a skill under that one name.

## Versioning

Bump `plugin.json#version` on every commit that touches the plugin. Which digit moves is decided by **the branch**, never by how large the change feels:

| Situation | Digit | Example |
|---|---|---|
| Another commit on the branch you are already on | **patch** | `0.4.2` → `0.4.3` |
| First commit on a plugin from a new branch | **minor**, patch back to `0` | `0.4.3` → `0.5.0` |
| Breaking change | **major** | only when the user says so: the major version is raised by the operator alone |

**Within one branch it is always patch — no exceptions.** A branch that renames half the plugin still moves the patch digit on every commit, however sweeping the change looks. The minor digit counts branches, not effort. This is the rule that gets broken most often, because a large change invites a large-looking bump; the size of the diff is not an input.

**Never bump major on your own: the major version is raised by the operator alone.** Breaking changes (a renamed slug, a removed skill, an incompatible flag) are the operator's call, and so is lifting a new plugin to the `1.x.x` line the others are on. Propose it and wait.

Consumers only re-fetch when this field changes, so pushing to `main` without a bump ships nothing. The branch-scoped convention exists so that one branch can iterate freely — review feedback, fixups, renames — without every iteration looking like a release.

**CI holds every pull request to this** (`.github/workflows/versions.yml`, running `tests/versions/check-plugin-versions.js`): a plugin with any changed file under `plugins/<slug>/` must carry a strictly higher `MAJOR.MINOR.PATCH` than the base branch has, and a raised major fails unless the pull request carries the label `major`, which only the maintainer sets. A new plugin passes from `1.0.0` up and a deleted one passes. The check cannot tell a patch from a minor — which of the two a branch moves stays the rule above. A version listed in `.claude-plugin/marketplace.json` must equal the plugin's own; it lists none today, so nothing is compared.

## Adding a new plugin (checklist)

1. Create `plugins/terylon-<role>/` with the structure above.
2. Add an entry to `.claude-plugin/marketplace.json#plugins[]` with `name`, `source: "./plugins/terylon-<role>"` (paths are resolved from the **repo root**, not from `plugins/`), `description`, `category`, `keywords`.
3. Validate both manifests against JSONSchemaStore.
4. Bump the version on every commit — see *Versioning* above.
5. Open a PR against `main`, following `.claude/rules/git-workflow.md`.

## Skill conventions

These conventions apply to every skill under `plugins/terylon-<role>/skills/<skill>/`. **Every skill follows the [Agent Skills specification](https://agentskills.io/specification)**, and `tests/skill-spec/skill-spec.test.js` holds each one to it in the *Unit suites* job.

### Frontmatter

**The frontmatter rules for skills and agents — the specification's keys, `description` starting with `Use when …`, `allowed-tools` space-separated, and never setting `disable-model-invocation` — are stated once, in `.claude/rules/markdown.md`, under *Frontmatter*.**

### Layout, size and file references

```
skills/<skill>/
├── SKILL.md          the instructions, loaded when the skill is
├── references/       detail read on demand: a standard, a recipe catalogue, a manual checklist
├── assets/           templates and data the skill fills or reads
└── scripts/          code the skill runs, with its tests beside it
```

| Rule | Limit | Why |
|---|---|---|
| Nothing beside `SKILL.md` but those three folders, each flat | no other file or folder | the specification's layout; a reader knows where to look |
| The body | under 500 lines **and** about 5000 tokens, counted as characters ÷ 4 | the whole body loads with the skill, on every run |
| A file reference | relative to the skill root, one level deep — `references/<file>.md`, `scripts/<file>.js` — and it exists | the specification's form, and a moved file fails the guard instead of the run |
| A command that runs a script | `node "${CLAUDE_SKILL_DIR}/scripts/<file>.js"` | the command runs in the consumer's repository; Claude Code substitutes `${CLAUDE_SKILL_DIR}` with the skill's own folder (read in its loader, 2.1.312) |
| `${CLAUDE_PLUGIN_ROOT}` in a skill | only `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`, the version a footer reads | anything else under it reaches outside the skill |
| Another plugin's file, or a `../` path | never | see *Cross-skill references* |

**What moves out of the body first:** the manual *Verification* checklist (`references/verification.md`), a section only one branch of a run needs (fan-out over several items, auto-complete, the reduction ladder), and long tables. The body keeps the steps, the gates and every safety constraint, inline: a skill whose reference is never opened must still refuse what it must refuse. Each moved section leaves its heading and a pointer saying **when** to read the file.

**`skills-ref validate`, the specification's own validator, checks the frontmatter and the name only**; the guard checks the same rules and the ones above it leaves out. It is a Python package installed from the specification's repository, so nothing here runs it.

### URL-input + `--auto` / `--dry-run` pattern

Skills that take a remote URL and optionally write back to that system (e.g. PR review,
PR comment-addressing) follow this contract:

| Flag | Behaviour |
|------|-----------|
| *(default)* | Summarise the plan in chat. Wait for explicit user confirmation (`push`, `do it`, `apply`, `post`, `go`) before any write. |
| `--auto` | Apply / post mechanical actions immediately. Items requiring judgment still pause for review. |
| `--dry-run` | Never write. Print the plan in chat and stop. |

A skill that writes to a remote system MUST run an **eligibility check** before reading
substantive data, and a **second eligibility re-check** immediately before writing — the
remote state may have changed during analysis.

### Heavy reference

If a skill needs more than ~60 lines of API tables, request shapes, or enum encodings, move them to `references/<file>.md` **inside the skill** and link it from `SKILL.md` with a relative Markdown link to `references/<file>.md` — or name it in a `Read` as `${CLAUDE_SKILL_DIR}/references/<file>.md` where the read must be deterministic.

**A reference two skills of one plugin both need is copied into each skill's `references/`**, because a skill reaches only its own files. The copy carries the line `<!-- An identical copy of this file sits in every skill that carries it; edit them together. -->`, and `tests/skill-spec` fails when the copies differ. `side-effects.md` in `terylon-test`'s three verifying skills is the worked example; an agent, which is not a skill, reads one of the copies through `${CLAUDE_PLUGIN_ROOT}`. A plugin's `shared/` holds code its scripts and hooks import — `oet.js`, `transcript.js`, `ado-server.js` — and no file a skill references.

### External MCP server prerequisites

When a skill calls tools from a third-party MCP server (e.g. `mcp__ado__*` from
Microsoft's remote Azure DevOps MCP server), the skill MUST:

- List the server in its `## Prerequisites` section with a one-line install hint.
- Include the relevant `mcp__<server>__*` wildcard in the frontmatter `allowed-tools`.
- Document the consumer-facing setup snippet in the plugin's `README.md` (not in
  every skill — one source of truth per plugin).

**Plugin-level `.mcp.json`:** for a fixed-config server, prefer dropping a `.mcp.json` at
the plugin root over per-skill `Prerequisites` snippets — consumers get the server
automatically when they enable the plugin. See `plugins/terylon-os/.mcp.json` for the canonical
example: one HTTP server, its URL from a variable, no `oauth` block.

**The exception: a server that needs per-person OAuth client configuration is registered at
the user scope by a script, not shipped in a `.mcp.json`.** Inside a plugin `.mcp.json`'s
`oauth` block neither `${VAR}` nor `${user_config.KEY}` is substituted (measured on Claude
Code 2.1.296), and a client or tenant id is configuration that a published marketplace must
not commit. `terylon-ado`'s `connect` skill is the worked example: it registers the `ado`
server with `claude mcp add-json --scope user` from the environment, idempotently, and
`plugins/terylon-ado/shared/ado-server.js` records the measurement — repeat it on a newer
Claude Code before keeping the exception.

**A server belongs to the plugin whose boundary it matches, not to the plugin whose skills call it.** The `ado` server's registration sits in `terylon-ado` rather than in the port that uses it, because a GitHub repository enabling the port must not start it. When a server would install for consumers who cannot authenticate to it, that server marks a plugin boundary.

### Footer for posted comments

When a skill posts to an external system on the user's behalf, end every comment with:

```
---
*🤖 Generated with [Claude Code](https://claude.ai/code) — <skill-name>@<plugin-version> · <model> / <effort>*
```

Resolve `<plugin-version>` at runtime by reading
`${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` — that variable is substituted to the
calling plugin's own root, so each skill picks up its own plugin's version regardless of
which other plugins are installed. `<skill-name>` is the slug of the skill posting the
comment (matches the `name` field in its own frontmatter).

`<model>` is the model the run executes under (e.g. `opus-4.8`); the skill knows it from
itself, as no environment variable exposes it. `<effort>` comes from the `CLAUDE_EFFORT`
environment variable (e.g. `xhigh`). **When `CLAUDE_EFFORT` is unset, omit the entire
` · <model> / <effort>` segment** rather than emitting a partial one.

This footer is also used to detect prior skill runs on re-invocation (grep for
`Generated with [Claude Code]` in existing threads — the substring survives everything
after it). **The order is binding:** everything variable — version, model, effort — sits
*after* that stable prefix, so detection never breaks when a model or effort tier changes.

### Output formatting for forge rendering

Markdown a skill writes to a forge is never hard-wrapped. **The rule, its reason and the skills it binds are stated once, in `.claude/rules/markdown.md`, under *Never hard-wrap ADO-bound markdown*.**

### Cross-skill references

**Skills are referenced by name, never by an `@` path or a `../` import — stated once, with the reason, in `.claude/rules/markdown.md`, under *Cross-references*.**

### Cross-skill composition (engine + transport)

When two skills share judgment logic but differ only in transport (local vs remote,
CLI vs API), prefer **delegation over duplication**:

- One skill is the **engine** — owns the rules, the heuristics, the output shape.
- Other skills are **transport** — handle URL parsing, fetching, posting, and invoke
  the engine via a documented sub-skill contract (flags + return shape).

Example: `code-review` is the engine; `review-pr` is transport (PR URL → diff →
call `code-review` → format findings → post through the `post-pr-thread` operation). The two now live in
**different plugins** — the engine in `terylon-git`, the transport in `terylon-forge` —
which changes nothing about how they compose: `review-pr` loads `code-review` **by name**,
and `terylon-forge` declares `dependencies: ["terylon-git"]` so the engine is always
present. A split like this is the normal outcome when an engine has no forge dependency:
put it in the lowest plugin that can host it, and let the transports depend upwards.

**A transport names operations, never tools.** The engine owns the tool surface; a transport that restates a call shape becomes a second place to fix when the surface moves — and it moves. `@azure-devops/mcp` 2.9.0 consolidated every tool into action-based forms, renaming all but one of them and turning `projectName` into `project`; because every schema is `additionalProperties: false`, each stale name fails the whole call rather than degrading. The marketplace had those names copied across nine files and would have failed on first contact. It moved again when the server became Microsoft's remote one, which kept that action-based surface but added `orgName` to every tool, dropped the identity lookup and moved the namespace to `mcp__ado__*` — and again only `forge-ops` changed.

So a transport writes ``the `update-pr-description` operation``, not the tool it resolves to. When the server changes, one file changes.

For platform mechanics, `forge-ops` is the canonical engine — and there are **two of it**, one per adapter, implementing the same catalog:

| Body | Plugin | Mechanism |
|---|---|---|
| Azure DevOps | `terylon-ado` | the `ado` MCP server, `mcp__ado__*` |
| GitHub | `terylon-github` | the `gh` CLI |

Every transport in `terylon-forge`, plus `create-user-story` and `create-feature` in `terylon-product` and `develop` and `planner` in `terylon-dev`, delegates to it. Inside the port, `resolve-forge` names the adapter; a caller outside the port that has not run it loads `forge-ops` **by name** — plugin-qualified when both adapters are enabled — and then issues its own calls following the recipes. `terylon-git` is deliberately absent from that list; it has no forge access at all. The footer and version are always resolved by the calling skill, never by `forge-ops`.

**Where the two bodies genuinely differ, the port declares the difference rather than hiding it** — description limits, where acceptance criteria live, how an item's type is expressed, how a thread is resolved. A transport reads the declared value; it never learns which platform produced it. The asymmetry tables are in each `forge-ops`, and they must agree: when they disagree, one of them is wrong, and the port's declaration decides which.

### Criteria state outcomes, test plans state procedures

Two checklists travel through this marketplace, and they are **different shapes of sentence** rather than two copies of one list. Writing them in the same shape is what makes them feel duplicated, and it is the author's fault rather than the reader's.

| | Acceptance criteria (work item) | Test plan (pull request) |
|---|---|---|
| Sentence shape | an **outcome** — "a ticked box means something" | a **procedure and its expected result** — "run X, expect Y" |
| Authored by | `create-user-story`, before the work | the build, rendered by `write-pr-description` |
| May name a component, path or command? | **never** — it goes stale the moment the implementation moves | yes, that is the point |
| Earns its tick | **derived** — a covering plan item executed and passed | **executed** — the run passed |
| Checked for coverage by | `planner` at design time, `tester` after the build | `tester` |

`planner` is the **only conversion point**: it turns each criterion into task test cases and emits a criterion-to-task coverage map, so a criterion nothing verifies is caught before any code exists. `tester` executes the plan and never tests a criterion directly — a criterion with no covering plan item comes back as a reported gap, never closed by an improvised check, because a tester that authors the test and then runs it has marked its own homework.

The two write-backs carry different content for the same reason: the pull request thread gets the procedure evidence, the work-item comment gets the coverage verdict and a pointer to the thread.

**When criteria change mid-flight, amend them visibly.** The contract is allowed to change; changing it silently is not. A withdrawn criterion moves to a trailing `**Superseded**` group — struck through, and with no checkbox, because withdrawn is not the same as unsatisfied — its replacement goes in the group whose outcome it states, and a comment records what was learned. The mechanics live in `create-user-story`; the discrimination that matters lives here:

| What happened | Do |
|---|---|
| an outcome the story promised changed or turned out wrong | amend the criteria |
| new outcomes were added — the work grew past the story | leave the criteria alone and open a follow-up story |

**Only the product owner amends criteria.** `tester` proposes and never applies; `planner` re-derives its coverage map against the live field rather than a cached copy; and a criterion sitting in `**Superseded**` is not a claim — neither verified, nor ticked, nor counted as a coverage gap.

---

## A mod

**A mod is a plugin whose hooks are a module, not commands**: `hooks/hooks.json` names one TypeScript file under `modules`, exporting `register(on, options)`, and the engine runs it inside the session — drawing a pane, posting a prompt, calling an MCP server. `terylon-pane` is the first here (#332). Its state contract is `types/index.d.ts`, named in `plugin.json` as `types`; it ships an empty `skills/` like every plugin.

**Writing the module** — what the engine and the validator hold it to:

- **`$` never crosses an import.** `claude plugin validate` refuses a module that hands `$` to a function in another file, so every function that calls `$` lives in `register.tsx` and the files it imports are pure (`terylon-pane/hooks/queue.ts`, `signals.ts`, `copy.ts`). That split is also what makes them readable without a session.
- **Every outward call goes through one allow-list.** A mod that can reach a server with gates names the tools it may call and refuses the rest by name, as `terylon-pane/hooks/terylon.ts` does; the gate list is copied from the server, not derived, so a renamed gate fails a test instead of slipping through.
- **A mod's background `$.mcp.call` goes through the permission check, and only allow rules let it through.** Symptom: the pane said the server *is not answering* while Claude Code had refused the call and it never left the machine. A call on the mod's own timer is outside any turn: the auto-mode classifier has no request to judge it by and gives no verdict, and the default mode has no one to ask. Allow each tool the mod calls by name, never the whole server, which would let the model call its gates unasked too. `terylon-pane/README.md`, under *Setup*, carries the rules for that mod, held by a test to `PANE_TOOLS` in `hooks/terylon.ts`.
- **A mod's state outlives a hot reload.** Symptom: the new version reads a field the value it is handed does not have. An `atom` keeps the value the previous version stored, in that version's shape. Read every state by merging it over its defaults, as `readSnapshot`, `readMemory`, `readGoals` and `readBell` in `terylon-pane/hooks/register.tsx` do, and check a stored list before using it, as `stackOf` does.
- **A timer drops what its callback rejects with, and `$.store` can reject.** Symptom: Terylon's server logged the pane's four queue reads every 30 s and no `events_since` in a day, and the pane said nothing. A `$.store.get` that rejects right after the reads leaves exactly that trace: the tick throws, `$.clock.every` swallows it, and the next tick does the same (measured 2026-10-29 under `plugin test` on 2.1.312, and in the owner's Desktop, where the store refused: see the next gotcha). Bound and catch every `$.store` call, keep its value in memory beside it, say a failure as the mod's own problem, and catch the rest of a tick, as `kept`, `keep` and `tick` in `terylon-pane/hooks/register.tsx` do.
- **A store file torn to NULs refuses every `$.store` call for good.** Symptom: the done-signal never fires, or the Status tab is blank in Desktop; with `terylon-pane` 1.9.7 or later, *Diagnostics* says `events: string store` and `store refusals:` above 0. The pane's store file under `~/.claude/plugins/store/` (`terylon-pane_terylon-<hash>.json`) was 52 bytes, all NUL, unchanged for 16 days, while the plugin's other store files beside it were valid JSON; the host neither parsed it nor wrote over it, so every `get` and `set` failed (Terylon Testing, Desktop on Windows, 2026-10-29). A write cut short, Desktop killed mid-write, is the likely cause. **Delete the file**: it holds only the pane's last look and the signals it told. Meanwhile the pane keeps both in memory for the session, and its store card names the file from the refusal and says to delete it, as `storeFileOf` in `terylon-pane/hooks/health.ts` reads it.
- **A state written whole drops a field another path keeps.** Symptom: the Status tab said *Nothing wrong* while the done-signal had stopped; each poll's read of the queue wrote the snapshot afresh and dropped the events problem a later step had set. Carry such a field over from the current value, as `refresh` does with `events`.
- **A screen whose render throws is blanked by Desktop.** Symptom: Desktop drew its own *Nothing to show yet — terylon-pane has not drawn in this pane* on the Status tab while every other tab drew (Terylon Testing's run of 1.9.1, 2026-10-29). Build each part of a screen under a guard that turns a throw into a problem card with its reason, and the screen as a whole under another, as `part` in the Status branch of `terylon-pane/hooks/register.tsx` does; read every field a newer version added by its type, as `snapshotOf` does, and key each card's buttons apart, so two cards never draw one key. What threw there is unconfirmed: the guard now says it on the tab and in `claude --debug`.
- **A drawing is not redrawn as time passes.** Symptom: a watchdog computed at draw time from `$.clock.now()` never showed its ⚠ while the tick was held, because a draw runs again only when a state it read changes, and nothing changed (measured 2026-10-29 under `plugin test` on 2.1.312). A check that depends on elapsed time runs on a timer of its own and writes its finding into state, as `watchEvents` in `terylon-pane/hooks/register.tsx` does.
- **Each `$.prompt.submit` is a turn of its own, queued behind the running one.** Symptom: in the owner's Desktop on `terylon-pane` 1.9.5, eight done-signals for goal 35's repeating runs came one per turn over several minutes, each asking about a state already over: an *Accept* for runs the leader had accepted, *blocked* for a run abandoned before the prompt arrived (Terylon Testing, 2026-10-29). The call resolves once the prompt is queued, not when its turn ends (the declarations of 2.1.312), so a tick that submits eight prompts queues eight turns. Post one prompt for what one read found, and read the subject again right before posting it, as `postSignals` in `terylon-pane/hooks/register.tsx` does with `coalesce`, `settleCandidate` and `signalsSummary`.
- **One pane id, with tabs.** Symptom: two Desktop panes, side by side. A second pane id that drew the same tabs is a second pane. Open every screen under the one id and switch tabs inside it, as `openPane` does with `PANE` in `terylon-pane/hooks/register.tsx`; a mutation (`/terylon-memory` opening a second pane) holds it.
- **Name a command literally in `$.command.register`.** Symptom: `plugin validate` reports `gating hook without .catch` for a mod's own command. With the name held in a constant, the validator no longer sees that the mod answers the command itself.
- **A user-tier mod's hook can be skipped on a managed machine.** Symptom: a hook that runs on one machine never runs on another. Anthropic's built-in guard `sec-default@builtin` is seated outermost wherever there are managed settings or a Team or Enterprise sign-in, and continues past the user tier — the tier a person's installed plugins sit in — on `classic.*`, `prompt.compose`, `prompt.section`, `prompt.context`, `prompt.attachment`, `session.append`, `session.compact` and a few more; `prompt.submit`, `turn.*`, `tool.call`, `command.*`, `mcp.call`, the other `session.*` and `ui.*` but `ui.log` pass. **Nothing that must run on a user's machine hooks `classic.*` or `prompt.compose`.** The full table is the [`sec-default` README](https://github.com/anthropics/claude-code/blob/main/mods/sec-default/README.md); since 2.1.299 `/plugin` and `plugin validate` name the hooks that would be skipped, and since 2.1.304 the transcript says when one was ([changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)). `terylon-pane` hooks only `session.start`, `command.run` and `ui.render`, so it is unaffected.
- **A plugin cannot declare the Claude Code version it needs.** Symptom: on an old engine, `invalid manifest … userConfig … Invalid input`, which names the field and not the version. A `userConfig` field with `options` does not load before 2.1.271, as the [plugins reference](https://code.claude.com/docs/en/plugins-reference) says. The only enforced floor is `requiredMinimumVersion` in managed settings; a plugin says what it needs in its README and uses nothing newer than that.

**Testing it** — what `plugin test` sees, and what it cannot:

- **Tests sit beside it, its teeth at the root.** `claude plugin test <mod>` runs `tests/*.test.ts` against the engine with no session and no network, the world beneath stubbed by the test's own `on`; `tests/<mod>/mutations.test.js` plants the mutations listed in `tests/<mod>/mutations.js` and requires each to turn them red. A test finds `Text` by its text: only `Box`, `Button`, `Input` and `Select` keep a `key`.
- **A plain string in a query matches by inclusion.** Symptom: a colour assertion read `undefined` on a value that was drawn in colour. The row's outer `Text`, whose text contains the value, answered first. Query with an anchored pattern instead, as `exact()` in `terylon-pane/tests/fixtures.ts` does. For the same reason, a card's title is not wrapped in a second `Text` around a coloured one.
- **A test hook that stands in for the engine's drawing takes no matcher.** Symptom: `$.ui.mount: no implementation for ui.render` when a mod yields with `next(e)`. A test hook written as `on('ui.render', { component: 'AbovePrompt' }, …)` did not answer; `on('ui.render', …)` did (measured 2026-10-12 on 2.1.295).
- **A test hook that throws is skipped, not passed on as a rejection.** Symptom: a store stand-in written to throw `EACCES` reached the mod as `no implementation for store.get`. To make a call on `$` reject with given words, answer `{ deny: words }` from the test's hook, as `tests/done-signal.test.ts` does for the store; the mod sees the words behind the engine's own prefix, `terylon-pane: $.mcp.call:` for an MCP call (measured 2026-10-29 on 2.1.312).
- **`plugin test` draws what the Desktop host may not.** Symptom: Desktop drew its own *Nothing to show yet — terylon-pane has not drawn in this pane* on the Status tab of `terylon-pane` 1.9.1 and 1.9.3, after a full restart, while every other tab drew; under `plugin test` on 2.1.309 and 2.1.312 the same tab drew with every problem card, and guards around each part changed nothing (Terylon Testing's runs of 2026-10-29). The owner's bisect on 1.9.5 narrowed it to the done-signal's card, drawn for the torn store above: Desktop 2.1.309 dropped the whole Status tab, without a word, when that card was in it, and drew the tab with `TERYLON_PANE_STATUS=no-machine,no-gauges,no-events`, while the same card drew under `plugin test` with nothing odd in its tree (measured 2026-10-29 by Terylon Testing, Desktop on Windows). The kit checks a tree under the surface's rules but is not the host, and which prop or value of that card the host refused is not yet known; 1.9.7 draws it only with props the same tab drew in Desktop (a plain card, no red stroke or title, no primary Button) and its reason as one clean line, and says its values as plain text under *Diagnostics*. The kit also draws two elements of one key without a word: a `Box` and a `Button` keyed `phone-add` on the mobile Queue drew in `plugin test` on 2.1.312. A screen the host might drop checks its own tree for what the kit lets through (a key used twice, a prop that is `undefined` or not a finite number, a control character), as `checkTree` in `terylon-pane/hooks/health.ts` does, says on every draw what it returns, and can be drawn in parts from an environment switch, as `TERYLON_PANE_STATUS` does in `terylon-pane/hooks/register.tsx`, so the owner can bisect it in a few restarts. **Desktop may write no log the owner can read**: on Windows, the MSIX package of Desktop wrote nothing to `%APPDATA%\Claude\logs` or to the package's `LocalCache` during a session (measured 2026-10-29 on the owner's PC, by the files' times). So the mod keeps its own last lines and draws them on a tab that does draw, as `note` and `TERYLON_PANE_STATUS=log` do.
- **A test seeds what an earlier version stored by answering `state.get` with `{ value: { value, version } }`.** Symptom: a test that answered `{ value, version }` passed while the pane never saw the stale value; the engine read the answer as no state and drew from the defaults (measured 2026-10-29 on 2.1.312). `seedSnapshot` in `terylon-pane/tests/done-signal.test.ts` and the stale goals and bell in `tests/walk.test.ts` answer the wrapped shape.
- **A mutation's anchor must occur once.** Symptom: a mutation stayed green after a second screen drew the same line; the plant had changed the first occurrence, on the screen no test looked at. `plant()` in `tests/terylon-pane/mutations.test.js` now refuses an anchor found twice.
- **Nothing type-checks the mod unless `tsc` runs, and `plugin test` does not.** Symptom: every *How to fix* step read `Step 1 of …: undefined`. A second `step` key in the `COPY` object literal silently replaced the first; TypeScript reports a duplicate key, the engine's loader does not.
- **Run `validate` and `test` with the engine the desktop app runs.** Symptom: `unknown command 'test'`, a validation error `$ itself is passed as an argument`, and a warning `types: Unknown field 'types'`. All three came from a `claude` 2.1.259 on `PATH`, while the desktop ran 2.1.295 from `%APPDATA%\Claude\claude-code\<version>\` and passed the same module. **Read the version there rather than assuming it**: S32 was built for 2.1.304, and the owner's walk found Desktop 3.6556.2.0 running 2.1.308. Put that directory first on `PATH`; in Git Bash on Windows convert it with `cygpath -u` first, or the Windows path is not found. `mutations.test.js` otherwise fails every case instead of skipping it, because a `claude` that cannot test still answers `--version`.
- **A test of "today" runs in the host's time zone.** Symptom: `the queue draws the four groups` failed on `HOTOVO DNES · 1` on a Prague host and passed on a UTC runner — the mocked clock at 22:00 UTC is already the next day from UTC+2; in #39 the bell's `07:26` read `11. 10.` and the *merged* chip went missing the same way. `TZ` set in the environment is ignored by `claude plugin test` on Windows (measured 2026-10-12 on 2.1.295), and in a Linux container the test child runs in UTC whatever `TZ` or the system's zone file says (measured 2026-10-27 on 2.1.308), so no zone can be set from outside. A test places its clock on the local day, as `lateOnTheLocalDayOf` in `terylon-pane/tests/fixtures.ts` does, or computes its expectation through `hostZoneOffset`, the offset the pane itself reads; `tests/terylon-pane/zones.test.js` plants Prague, New York and Tokyo in both and requires the suite green. The pane formats its times by hand, with no `Intl` or `toLocale*`, so the host's locale changes nothing.
- **A headless session runs the hooks and draws nothing.** Symptom: under `claude -p`, and in a cloud session, the band, the status line and the pane never appear, and `$.mcp.call` fails with `no session is bound in this process`. Neither the drawing nor a live call can be checked headless: the tests check the drawing, and Desktop checks the rest.
- **A dev copy hot-reloads from the session's mods folder.** Put the mod there and accept *Enable hot reloading for this session?*; each save then reloads it. Disable the installed plugin of the same name meanwhile, so that the copy being edited is the one that runs.
- **Never commit `.claude-plugin/types/` or a mod's `tsconfig.json`**: the engine writes both for the version it runs, and `.gitignore` keeps them out.
- **The engine refuses at draw time what the declarations' types let through.** Symptoms, measured on 2.1.304 with `plugin test` on 2026-10-22: `Box prop "width" must be a number or a percentage` for `"12.5%"`, and `Box hover is scoped to a keyed Box drawn display "none"` for a hover reveal that carried a `key`. Lay equal columns out with `flexGrow`, and key the visible row while the hidden reveal inside it stays unkeyed, as `row()` in `terylon-pane/hooks/register.tsx` does. The refusal draws nothing of the mod's, so a test that mounts the screen catches it.
- **A found element carries no `hover`.** Symptom: `find(...).props.hover` was `undefined` on a Box that had one. `hover` sits beside `props` on the drawn element; read it off `ui.drawn()`, as `hovers()` in `terylon-pane/tests/redesign.test.ts` does.
- **Validate as well as test**: `claude plugin validate plugins/<mod>` reports what the module hooks, calls, reads and writes — the list a reviewer checks against what the README claims.

**In Desktop** — what only the desktop app shows, since the kit checks the props, not the paint:

- **A native desktop Button drew its children in its own colour in 2.1.295, and a long label in a row pushed past the card.** Symptom, seen in Desktop 2.1.295 and not in the tests: a row's `subtle` kind was drawn like its title, and a long question ran over the card's right edge, taking its ↗ with it. `terylon-pane` 1.1.x kept the kind outside the Button for that reason. **S32 (#25) reverses it on purpose**: 2.1.295 gave `Button` children of `Text`, which 2.1.304 declares are drawn in its place, so a row is one plain Button holding its kind chip, its `truncate-end` title and its detail, as `row()` in `terylon-pane/hooks/register.tsx` does. **Seen in the owner's walk of 1.2.0** (Desktop 3.6556.2.0, engine 2.1.308, 2026-10-23): the row is one press, and its kind inside the Button read as plain text rather than a chip. 1.2.1 gives the kind the background of the theme key `userMessageBackground`, and 1.2.2 a dot in the kind's colour before a word in `inactive`, which the owner's walk of 1.2.2 (2026-10-25) saw drawn and readable as a chip in both themes.
- **A `Button` with chrome draws its children in its own grey; a `plain` one draws them in their colour.** Symptom, from the owner's walk of `terylon-pane` 1.5.0 (Desktop 3.6556.2.0, engine 2.1.308, 2026-10-26): *Abandon…*, a default Button holding a `Text` in `error`, was drawn grey, while each row's kind dot, a coloured `Text` inside a `plain` Button, kept its colour (the walk of 1.2.2). A word that must be red is a `plain` Button, as the danger acts in `terylon-pane/hooks/register.tsx` are; a mutation that gives one chrome again holds it.
- **Desktop and the terminal space rows differently.** Symptom: rows that breathe in Desktop stand a blank line apart in the terminal, where every gap is a whole line. Key the spacing on `e.surface`: the step names `xs` to `xl` on a graphic surface, whole cells on the terminal (a row gap of 0), as `card()` in `terylon-pane/hooks/register.tsx` does.
- **What the engine declares but Desktop has not shown goes behind a switch that defaults to the old drawing, until a walk in Desktop settles it.** `terylon-pane` reads `TERYLON_PANE_PROOFS` (`input-rows`, `hover-reveal`, `svg-tooltips`), and `PROOF_DEFAULTS` in `hooks/drawing.ts` holds what the owner's walk of 1.2.0 proved: `Input` `rows`, the `Box` hover reveal and `Svg` `isInteractive` tooltips all worked and are on; `no-<name>` is the escape hatch that turns one off. A mutation per default flipped holds it.
- **An interactive `Svg` in Desktop 2.1.308 shows its `<title>` only under a pointer held still, and its frame, left to size itself, draws an empty band above and below the picture.** Symptom, from the owner's walk of 1.2.0: a big empty band around the stepper's nodes, and a tooltip first reported missing that showed once the pointer rested on a node (*Admitted to a slot · done*). Give every `Svg` its own `height`, as `picture()` in `terylon-pane/hooks/register.tsx` does.
- **A picture sized to the pane shrinks as a whole in a narrow dock.** Symptom, from the same walk, a dock of about 435 px: the stepper's nodes grew tiny and its eight labels ran together (*Admit… Devel… Pull req. Verified*). Below `STEPPER_COLUMNS` body columns the stepper is drawn compact, its nodes 24 px apart at their own size, and only the phase now is named; the tooltips name the rest.
- **A picture of a fixed width does not stretch with the `Text` beside it.** Symptom, from the owner's walk of 1.2.2 (Desktop 3.6556.2.0, engine 2.1.308, 2026-10-25): at ~1060 px the stepper's nodes were a 456 px strip centred under eight labels that spread over the pane, so *Admitted* sat under empty space and *Verified* under the Merge diamond; at ~660 px it nearly lined up. `Svg` takes a `width` in pixels only, and a mod is told columns, never pixels. Draw the picture `width="100%"` with no `viewBox`, place each mark at a percentage that is its `Text` column's centre, and draw the mark in pixels about that point so it keeps its size and shape, as `stepper()` in `terylon-pane/hooks/drawing.ts` does; `tests/stepper.test.ts` lays the drawing out at both widths and holds each label within half a node gap of its node.
- **A card filled with a theme colour hides what is drawn on it.** Symptom, from the same walk: on a `Box` `backgroundColor` of `warning` or `error`, the secondary text, the links and the chips of the card could not be read, and a `Box` filled in the theme colour of its own `Text` drew as a blank block. Stroke a card in its colour instead (`borderColor`), and draw a chip on the neutral `userMessageBackground` — rgb(55, 55, 55) on dark, rgb(240, 240, 240) on light, read from the engine's themes — as `CHIP_BACKGROUND` in `terylon-pane/hooks/drawing.ts` does. **Its word is `inactive` and its colour a dot**: computed in the S32 canvas's palettes, no coloured key reads at 4.5:1 on the chip grey in both themes, and amber reads 4.08:1 even on white, so no word on a card that waits is amber. `terylon-pane/tests/contrast.test.ts` holds it: the kit gives a test theme keys, never painted colours, so `tests/contrast.ts` computes each ratio from the palette.
- **A mod controls whole rows and characters, not pixels.** Symptom: a design canvas's font, button look, rounding and pixel spacing cannot be reproduced. Desktop exposes none of them; since 2.1.299 a `Text` takes `size`, `weight`, `mono` and `tabular`, and a `Box` takes the spacing steps `xs` to `xl` ([changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)). Approximate the design with those; do not promise it.
- **Desktop declines an MCP elicitation form without showing it.** Symptom: a server's gate form came back `Refused: You declined…` and no form appeared. A mod or a skill must not rely on an elicitation being shown in Desktop; a decision it needs goes through a page of the server's own, as the pane's links to the console do.
- **A running session does not reconnect a plugin's MCP server after its network returns.** Symptom: the server stays unreachable after the tailnet is back, and `/reload-plugins` answers *Plugin MCP server changes take effect in your next session*. Restart Desktop.

---

## Plugin overview

```
terylon-core (root — no dependencies)
    ▲
    └── terylon-git  [terylon-core]
           ▲
           └── terylon-forge  [terylon-git]          the port; ships no adapter
                  ▲
                  ├── terylon-ado      [terylon-forge]   adapter: forge-ops; connect registers the ado server
                  ├── terylon-github   [terylon-forge]   adapter: forge-ops over the gh CLI
                  ├── terylon-product  [terylon-forge]
                  ├── terylon-dev      [terylon-git, terylon-forge, terylon-core]
                  └── terylon-test     [terylon-forge, terylon-core]

terylon-os (no dependencies)                       Terylon itself: /mcp + a skill per prompt
    ▲
    └── terylon-pane  [terylon-os]                 a mod: the Desktop pane over that server
```

| Slug | Audience | Dependencies |
|---|---|---|
| `terylon-core` | every repository — the shared conventions and run measurement | none |
| `terylon-git` | any git repository — no forge, no MCP server | `terylon-core` |
| `terylon-forge` | the forge port — everyone working through pull requests | `terylon-git` |
| `terylon-ado` | repositories on Azure DevOps | `terylon-forge` |
| `terylon-github` | repositories on GitHub | `terylon-forge` |
| `terylon-product` | product owner / PM | `terylon-forge` |
| `terylon-dev` | developers | `terylon-git`, `terylon-forge`, `terylon-core` |
| `terylon-test` | anyone holding a checklist that decides something | `terylon-forge`, `terylon-core` |
| `terylon-os` | the owner of a Terylon — its `/mcp` server and the skills mirroring its prompts | none |
| `terylon-pane` | the owner of a Terylon, in Desktop — a mod drawing the pane | `terylon-os` |

`terylon-product` reaches everything below it transitively. `terylon-dev` and `terylon-test` declare `terylon-core` **directly** as well: both load `measure-token-spend` whether or not git or a forge is in play, and `terylon-dev` additionally declares `terylon-git`, because `leader` dispatches `code-reviewer` whether or not a forge is.

**The two adapters are siblings of the role plugins, not layers under them.** Nothing declares an adapter: the consumer enables the one their repositories are hosted on, and the port arrives as its dependency. A consumer therefore enables **two** keys — a role plugin and an adapter.

`terylon-forge` **replaced `terylon-devops`**, which no longer exists. That plugin mixed two things: the transports, which were portable and are now the port, and the Azure DevOps mechanics, which were not and are now `terylon-ado`. The engine skill `ado-mcp` became `forge-ops`, and the MCP namespace moved with the server, from `mcp__plugin_terylon-devops_ado__*` to `mcp__plugin_terylon-ado_ado__*` — and, with Microsoft's remote server registered at the user scope, to `mcp__ado__*`.

`terylon-core` is the **root**, not a second leaf. It needs neither git nor a forge, only a shell and the local session transcripts, and every other plugin sits on it. It **replaced `terylon-metrics`**, which no longer exists, and its arrival removed the `superpowers` dependency: `write-plan` and `run-build-loop` replaced two of those skills, `finish-branch` in `terylon-git` a third, and the remaining three were dropped because `developer`, `refactorer` and `debugger` already carried them in their own prose. A skill that only restates what the persona says costs cache-write to load and buys nothing.

### Where a component belongs

**A component lives in the lowest plugin that all of its consumers can reach, and a plugin declares a dependency only on what it actually loads.** Count consumers by *plugin*, not by file, and count only real loads — a prose mention that is an example is not a consumer.

| Consumers span | It lives in |
|---|---|
| one plugin | that plugin |
| several plugins | their lowest common ancestor |

Two failure modes, and both have happened here:

| Symptom | What it means | Worked example |
|---|---|---|
| A component in the root that only one plugin loads | the root installs for everyone, so everyone pays for it | `write-plan` and `run-build-loop` sat in `terylon-core` and moved to `terylon-dev` |
| A component in a plugin whose dependency it never exercises | the plugin's own boundary claim becomes false | `delegate-to-repo-agents` sat in `terylon-git` and never called git; it moved to `terylon-core` |

**The test is what a component exercises, never who calls it.** `delegate-to-repo-agents` mentions `git checkout` and `git status` three times — as examples of what a write-capable agent can do, not as calls it makes. Its `allowed-tools` is `Read, Grep, Glob`. Reading the mentions rather than the tool list is what kept it in the wrong plugin.

#### The one exception: a port and its adapters

**`terylon-forge` loads `forge-ops`, which lives in a plugin above it. Every upward load in this marketplace is that one load, made from three different places, and it is deliberate.**

The rule above would put a component every transport loads into the lowest plugin that reaches it. Applied here it would put the Azure DevOps mechanics into the port, and every GitHub repository would install an Azure DevOps MCP server it has no account on. That is the outcome the split exists to prevent, so the placement rule yields to a **port and adapter** relationship:

| Side | Declares | Holds |
|---|---|---|
| `terylon-forge` — the port | the operation catalog, and a dependency on `terylon-git` only | the transports, `pr-reviewer`, `resolve-forge` |
| `terylon-ado`, `terylon-github` — the adapters | a dependency on `terylon-forge` | one skill each, both named `forge-ops` |

So the **dependency** edge still points down; only the **load** points up. Three rules keep that honest, and none of them is optional:

- **The port declares no adapter.** Ever. The moment it does, the platform it names installs for everyone.
- **Both adapters implement the same catalog under the same skill name.** A caller loads `forge-ops` and does not branch. `resolve-forge` picks which, and addresses it plugin-qualified when both are enabled.
- **A transport that finds no adapter says so and stops.** It does not fall back to the other one and does not issue platform calls of its own. A second copy of the call shapes is a second place to fix, and the copy goes stale.

**Do not read this as licence for a second upward load.** It is here because the alternative was worse for a specific, stated reason. A new one needs the same argument made out loud, and a row in the load table below saying which side of the port it sits on.

### What lives where

| Plugin | Skills | Agents |
|---|---|---|
| `terylon-core` | `delegate-to-repo-agents`, `measure-token-spend` | — |
| `terylon-git` | `create-workspace`, `code-review`, `finish-branch` | `code-reviewer` |
| `terylon-forge` | `resolve-forge`, `create-pr`, `review-pr`, `write-pr-description`, `address-pr-comments`, `update-pr-checklist`, `update-work-item-checklist` | `pr-reviewer` |
| `terylon-ado` | `forge-ops` (the ADO body) | — |
| `terylon-github` | `forge-ops` (the GitHub body) | — |
| `terylon-product` | `create-user-story`, `create-feature` | — |
| `terylon-dev` | `develop`, `brainstorm`, `write-plan`, `run-build-loop`, `background-run` | `leader`, `planner`, `developer`, `debugger`, `refactorer`, `security-reviewer`, `performance-reviewer`, `architecture-reviewer`, `edge-case-reviewer` |
| `terylon-test` | `test`, `verify-test-plan`, `run-build-and-tests`, `run-ui-flows` | `tester` |

`terylon-core` also ships the `SubagentStop` hook that records per-agent spend continuously, plus `shared/oet.js`, `shared/weights.json` and `shared/transcript.js`. The last is the one place that reads a transcript's usage: the hook and `measure-token-spend` both call it, so neither can drift on how a response's repeated records are collapsed.

`background-run` is the one component in `terylon-dev` that the pipeline never calls. It exercises git and the `claude --bg` CLI, so the *exercises* test alone would allow it in `terylon-git` — and that is exactly the failure mode the placement rule warns about, because `terylon-git` is a dependency of everything and would install it for every consumer. Its only audience is the operator driving this plugin, so it lives beside them. Being unreachable from `develop` is not evidence of a misplacement; it is a skill the operator invokes, not a persona the loop dispatches.

`terylon-ado` also ships `connect`, which registers the `ado` server at the user scope — not a `.mcp.json`, because the server's OAuth client configuration cannot be substituted there (see *External MCP server prerequisites*). `terylon-github` ships no server at all — the `gh` CLI needs none.

Two boundaries, and they are different in kind:

| Boundary | Between | The test |
|---|---|---|
| the forge | `terylon-git` and `terylon-forge` | does it reach outside the repository? Everything in `terylon-git` exercises git and nothing more; that is why the review pipeline is split, with `code-review` and `code-reviewer` local and `review-pr` and `pr-reviewer` carrying the findings outward |
| the platform | `terylon-forge` and the adapters | does it **depend** on a platform? A transport that issues a `gh` subcommand or an `mcp__` tool call has crossed it and belongs in an adapter |

The second is the one that erodes. A transport gains one platform-specific line at a time, each defensible on its own, until the port is a port in name only. **Grep before finishing a change to a transport** — and grep for the runtime forms, `mcp__ado__*` rather than `mcp__ado__`, or the check passes because it cannot fire.

**Two things are not crossings, and a grep that flags them is miscalibrated.** A transport's `allowed-tools` names both surfaces on purpose, since an absent one is inert and the grant cannot be resolved at runtime. And a transport **naming** a difference the port declares — that one forge numbers what the other words, that one wants a leading slash — is the port doing its job; hiding those is what makes a transport wrong. What must not appear is a transport *issuing* a platform call, or reading a raw platform field instead of the normalised value the operation returns.

### Every cross-plugin load, and what covers it

| Loader | Loads | From | Covered by |
|---|---|---|---|
| the seven `terylon-dev` personas | `delegate-to-repo-agents` | core | `terylon-dev` → core, direct |
| `code-reviewer` | `delegate-to-repo-agents` | core | `terylon-git` → core |
| `tester`, `run-ui-flows` | `delegate-to-repo-agents` | core | `terylon-test` → core, direct |
| `develop`, `leader` | `measure-token-spend` | core | `terylon-dev` → core, direct |
| `test`, `tester` | `measure-token-spend` | core | `terylon-test` → core, direct |
| `develop`, `code-reviewer`, `pr-reviewer` | `create-workspace` | git | dev → git direct; forge → git |
| `develop` | `finish-branch` | git | dev → git |
| `review-pr`, `address-pr-comments` | `code-review` | git | forge → git |
| `develop` | `create-pr` | forge | dev → forge |
| `tester` | `update-pr-checklist`, `update-work-item-checklist` | forge | test → forge |
| every transport, `pr-reviewer` | `resolve-forge` | forge | same plugin |
| `develop`, `planner` | `resolve-forge` | forge | dev → forge |
| `create-user-story`, `create-feature` | `resolve-forge` | forge | product → forge |
| every transport, `pr-reviewer` | `forge-ops` | **an adapter** | **the port exception** — the adapter declares forge, not the reverse |
| `develop`, `planner`, `developer` | `forge-ops` | **an adapter** | **the port exception** — enabled by the consumer, never declared |
| `create-user-story`, `create-feature` | `forge-ops` | **an adapter** | **the port exception** |

`terylon-core` loads nothing, and there is no cycle. **Exactly three rows point up**, all of them at `forge-ops`, all of them covered by the port exception above; every other edge points down its dependency chain. **When you add a load, add its row** — the table is how the next placement error gets caught before it ships, and a fourth upward row without an argument beside it is the error.

### Dispatch chain

```
develop (skill, main thread — holds the gates)
├── brainstorm (skill)   Gate 0's second mode; an item with no stated outcome
│                        └── design document + 1..N approved seed-specs
└── leader
    ├── planner
    ├── developer ──▶ debugger  (on a failing test)
    │   └── <repo-local specialist>    conditional; capability gate below
    ├── security-reviewer  ┐
    ├── performance-reviewer│ all four from one message, read-only
    ├── architecture-reviewer
    ├── edge-case-reviewer ┘
    │   └── <repo-local specialist>    conditional; capability gate below
    ├── refactorer
    └── whole-branch review:
        ├── code-reviewer   (no PR — the usual case)
        │   └── <repo-local specialist>    conditional; capability gate below
        └── pr-reviewer ──▶ code-reviewer  (a PR exists)
```

The `<repo-local specialist>` branches are **not ours**. A target repository may ship its own agents — a stack-specific implementer, a domain reviewer — and a persona dispatches one when it covers the technology more specifically than a generic persona can. Most repositories ship none, and the branch simply does not occur. The convention lives in the `delegate-to-repo-agents` skill in `terylon-core`, loaded by name, and **the gate is a capability test**: may the candidate change the files under examination? `Edit`, `Write` and **unrestricted `Bash`** all mean yes — `sed -i` rewrites a file as surely as `Edit` does — so `disallowedTools: [Edit, Write]` alone settles nothing. Every shorthand for this rule fails in the same direction, permissively; the skill states the test and the shorthands are not repeated here on purpose.

`develop` is a skill rather than an agent because only the main thread can prompt the user. Everything below it is dispatched and reports back. `brainstorm` is a skill for the same reason and sits at the same level: it is loaded, not dispatched, and it runs in `develop`'s own context because it does nothing but ask.

**`brainstorm` is Gate 0's second mode, not a step before it.** It ends where that gate ends — at an approved seed-spec — so making it a preceding step would put two intakes in a row. The seam against `planner` is what keeps them from overlapping: `brainstorm` settles *what and why* and may never name a file path, `planner` settles *how* and must.

### One measured limit on dispatched agents

Found by running this pipeline against itself rather than by reading the specification.

**A skill loaded by name carries instructions, not capability.** The `skills:` field lets an agent open a skill's prose; it does not hand over the tools that prose tells it to call. So **every agent must declare in its own `tools:` each tool the skills it loads will use** — the ADO namespace for an agent driving `update-pr-checklist`, `Bash(node *)` for one running `measure-token-spend`. The `tester` shipped a release documented as driving two ADO transports while declaring no ADO namespace at all, and its first real run returned `BLOCKED` for precisely that reason.

**When a capability an agent needs really is absent**, it says so, degrades to in-context work, and marks anything that needed the missing capability unverifiable. It does not quietly substitute the nearest available evidence — a unit fixture modelling N subagents is not a run of N subagents, and reporting it as one is the failure `terylon-test` exists to prevent.

#### Retired: nested dispatch, and the tester's ADO namespace

This section used to carry two further limits in the present tense. **Both were re-probed on 2026-08-14 against the installed plugins and neither holds.** They are recorded here as history so the next reader does not rediscover them from a stale claim.

| Retired claim | What the probe returned |
|---|---|
| `Agent` in an agent's `tools:` does not grant nested dispatch; only the main thread was observed to hold a dispatch tool | `Agent=HELD` on both `terylon-dev:leader` and `terylon-test:tester`; the leader then **invoked** it and its child returned `PONG`. Proven by invocation, not by introspection. |
| `tester` declares no ADO namespace and returns `BLOCKED` | `ADO_NAMESPACE: HELD` — fixed in a later release. |

**The fan-outs drawn throughout these files are therefore descriptive, not aspirational.** They were qualified for as long as the first claim stood; that qualification is gone.

One narrower finding from the same probe **does** still hold, and is not retired: `leader` reports `TODOWRITE: ABSENT`, so a controller cannot keep a visible task list of its own. The ledger is what it has instead, which is why `run-build-loop` specifies the ledger the way it does.

Given several work items, `develop` runs this chain once per item with the leaders **concurrent** — one seed-spec, worktree and branch each. The shape does not change; it multiplies. Gates stay on the main thread and are hosted as each leader returns, which is also why every question has to name its work item.

`terylon-test` runs after all of it, on the claims rather than the code:

```
test (skill, main thread — holds the write-back gate, reports token spend)
└── tester (terylon-test — drives the run)
    ├── update-pr-checklist (read) ......... terylon-forge; the test plan, and the work item it links
    ├── update-work-item-checklist (read) .. terylon-forge; the acceptance criteria of that work item
    ├── verify-test-plan ................... engine: triage, coverage, routing, evidence
    │   └── per-claim subagents            all from one message; claims are independent
    │       ├── run-build-and-tests        the project's build and suite — a shell is enough
    │       ├── run-ui-flows               the interface, through browser automation
    │       └── <repo-local specialist>    conditional; capability gate below
    ├── update-pr-checklist (write) ........ terylon-forge; the thread, then the rewritten plan
    └── update-work-item-checklist (write) . terylon-forge; the comment, then the annotated criteria
```

The forge appears only at the ends, in `terylon-forge`, and which forge is `resolve-forge`'s answer. The two `update-*-checklist` transports read the plan and the criteria and write the answers back; they hold no `Agent`, so the verification cannot happen in their context. Two things sit above them, mirroring the development pipeline: the `tester` agent drives the run, and the `test` skill hosts the one gate a subagent cannot — consent before the write — and reports the run's token spend, exactly as `develop` and `leader` do. `code-reviewer` sits below `pr-reviewer`, so there the transport dispatches; here the caller drives and the transports only read and write.

The two executors are the **execution layer**. They run the artifact and report facts — commands, exit statuses, case names, observed state — while the engine keeps the judgment about what a result means. `run-ui-flows` is separate purely because of its dependency class: a checklist walker that needs only a shell must not drag in a browser stack, so the plugin ships no `.mcp.json` for it and reports the capability as absent instead.

It exists because the review chain above verifies the *diff* while the test plan verifies the *claims about it*, and nothing was checking the second. A tick nobody exercised reads exactly like one that was earned.

A new plugin is added only when at least one real skill exists for it.

### Name collision check

Before adding a new skill or agent, verify that its name does not collide with anything installed:

```bash
find ~/.claude/plugins/cache -name "SKILL.md" -path "*/skills/*" \
  | sed -E 's|.*/skills/([^/]+)/SKILL.md|\1|' | sort -u | grep -x "<proposed-name>"
```

Empty output means no skill of that name is installed — but the glob only sees skills, so widen it before trusting it:

```bash
find ~/.claude/plugins/cache \
  \( -path "*/skills/<proposed-name>/SKILL.md" \
  -o -path "*/agents/<proposed-name>.md" \
  -o -path "*/commands/<proposed-name>.md" \) -not -path "*/terylon/*"
```

The `-not -path "*/terylon/*"` matters once this marketplace is installed locally, or the check matches its own cached copy and every name looks taken.

**Check what kind of thing collides before renaming around it.** The official `code-review` plugin ships a *command*; this repo's `code-review` is a *skill*. Different namespaces, and the reference repo ran the same pair for a year without trouble. The visible cost is that typing `/code-review` offers both — noise, not breakage. An earlier rename to `review-diff` was reverted once that was actually verified.
