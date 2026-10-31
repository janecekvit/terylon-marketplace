# terylon-pane

**The Terylon band and pane in Claude Desktop**: a mod, which is a hooks module (`hooks/register.tsx`) that the engine runs in a session. It draws one row above the prompt, the status line, and **one** pane beside the transcript.

- **It shows, asks, answers and posts, and takes the owner's acts on their own cards (S27, #27), but it never merges.** Merge is the one gate, confirmed by your passkey in the console.
- Its content and rules are the approved S15 canvas, page *v2*, the band and the pane (#331, #332 c9); its drawing follows the approved S32 canvas, attached to issue #25, on the mod API of 2.1.304 and later; the owner's acts are the approved S27 canvas, redrawn in S32's styles and kept on #27; it is built and tested on 2.1.308, the engine Claude Desktop 3.6556.2.0 runs.
- **The interface is English**: the band, the tabs, card titles, buttons, hints, empty states, errors and *Reason: …* (the operator's choice of 2026-10-12, on #332, replacing the Czech of S15).
- **The content is in the language Terylon sent it in**, untranslated: story titles, the leader's questions, memory entries, rules.
- The prompts the pane posts into the session are the owner's own words to Claude, in Czech.

```
terylon-os          Terylon's /mcp server and the skills mirroring its prompts; no dependencies
    ▲
    └── terylon-pane   ← you are here
```

Where it stands beside the rest of Terylon: [One source of truth, reached from two places](../../docs/architecture/one-source-of-truth-reached-from-two-places.md).

## Audience

This is for the owner of a Terylon, working in a **local** session on the PC: the desktop app's Code tab, or a terminal.

- It requires the plugin `terylon-os`, which brings the `/mcp` server the pane reads. `dependencies` installs it.
- An SSH or Remote Control session needs no mod at all: the plugin's skills and tools do everything the pane does, asked in words.

## What it does

```
                                                                        as of S27 (#27)

  every 30 s ──▶ terylon /mcp: briefing · work_in_flight · stories_list · events_since
       │           through ONE allow-list (hooks/terylon.ts) that refuses the one gate, story_merge
       ├──▶ the band, what calls for you:  Terylon · Waiting 3 · Running 2 · Queue 2 · Bell 2        Open
       ├──▶ the status line, the machine:  Agentic OS ● ok · $5.50 of $20 today · 2/4 slots
       ├──▶ ONE pane, opened by the band or a command, NEVER by itself:
       │      Queue ─── Waiting for you ──▶ a question answered here (question_answer) · a story · a plan
       │       │        Pause… in its header, Resume on the paused card (leader_pause, leader_resume)
       │       │        Running · Queued · Done today ──▶ a story ──▶ its goal ──▶ a story …  ‹ back
       │       │        a story: its phases and Now working FROM progress.stage, NEVER ITS TIMELINE;
       │       │          by its state Return… · Unblock · Abandon… · Stop · Accept; merge a LINK ONLY
       │      Goals ─── goals_list · plans_list ──▶ a goal (Drop goal…) · a plan (Approve · Rethink…)
       │                  a repeating task's goal: its card in place of the stories, each run opening its story
       │                  a goal's specification: each file read-only, Revise…, Re-plan ONLY ON ITS PRESS
       │      Bell ──── notices_list · leader_status · metrics; a notice marked handled is notice_handle
       │      Memory ── the rules the machine enforces, the leader's memory; an edit is memory_propose,
       │                  a proposal confirmed or dropped HERE (memory_confirm, memory_drop)
       │      Status ── the machine in one word, slots, cost, every problem with How to fix, Resume,
       │                  the policy edited and saved (policy_save), diagnostics
       └──▶ the done-signal: $.prompt.submit ONCE per story and verdict commit, and a toast
  session start, away > 2 h ──▶ ONE catch-up summary; the band says it until ✕
  Add ──▶ tasks_add ──▶ a plan that WAITS for the owner under Waiting for you
```

**The band and the status line split the work, and neither repeats the other** (the operator's round 3 on #332):

| Where | Says | Never says |
|---|---|---|
| the band above the prompt | what calls for the owner: waiting, running, queued, an alert or a problem, and *Open* | the spend or the slots |
| the status line | the health of Agentic OS: well with today's spend and the slots in use, or the one worst problem | what waits for the owner |

- The band is one row, cut at its end, so it survives a pane docked beside the transcript.
- A value is coloured only when it differs from calm: *Waiting* and *Bell* above 0 and the leader paused are semibold `text`, *Running* above 0 is `suggestion`, a stuck story, an alert and a connection that fails are `error`. No word is amber: the host's light `warning` reads 4.08:1 on white, so amber is only a card's stroke, a chip's dot or a ⚠.
- **The bell's count is the unhandled notices `notices_list` reports** (#360), read on every poll: a notice handled in the pane drops it at once, and one handled anywhere else drops it within one poll.
- **Its button is always *Open*, and does the same thing every time**: it opens the pane on the tab the owner last used, the queue the first time. A problem is said in the band and in the status line; how to fix it is on the Status tab, a press away, never chosen for the owner.

| State | The band says | Its button | The status line says |
|---|---|---|---|
| calm, or something waits | `Terylon · Waiting N · Running N · Queue N · Bell N` | Open | `Agentic OS ● ok · $x of $y today · a/b slots` |
| an alert | the counts, then `· N alerts` | Open | `Agentic OS ⚠ N alerts` |
| the leader paused | `Leader paused since HH:MM · Waiting N · Queue N · Bell N` | Open | `Agentic OS ⚠ leader paused` |
| Terylon does not answer | `not answering since HH:MM` with the last numbers, `retrying every minute` | Open | `Agentic OS ⚠ not answering since HH:MM` |
| a call Claude Code did not allow | `Claude Code refused the pane's call · allow rules missing` | Open | `Agentic OS ⚠ not allowed · /terylon-pane` |
| no server, refused, Terylon's error | the cause, said plainly | Open | the cause, said plainly |
| a survey holds the band | nothing: the mod yields | — | unchanged |

**The status line says only the worst problem**, in this order: a call Claude Code refused, the connection (no server, refused, an error, not answering), the leader paused, the alerts. It is cut at 60 characters, so it fits beside the model's name.

**An alert is a fault of the machine:** an unhandled notice from `gatus`, `unit` or `host`, any `incident:` key, or a `production` or `backup` notice that says it failed. The briefing, the leader's questions and news, and a newer image published are not alerts; they wait for the owner in the bell. The list is `ALERT_SOURCES` in `hooks/health.ts`, and a test holds it.

**The pane opens only from the band's button or a command:** `/terylon-pane`, its alias `/terylon`, or `/terylon-memory`, which opens the same pane on its Memory tab. There is one pane: the memory is a tab of it, not a second pane. The button always opens the pane on its queue. In a broken state, that queue starts with a card saying what happened, *Reason: …*, and the step that fixes it.

**Every row is one line and one press** (S32): a plain `Button` whose children are its kind chip (*question*, *merge*, *accept*, *plan*, *held* …: a dot in the kind's colour, then the word, on the theme's neutral chip grey), its title cut at its end, and its detail in tabular digits, keyed by the subject's id. On the terminal the kind is padded to a fixed column, so the titles start under one another. A press opens the whole text under the row, with the console link the row leads to. A card with nothing in it stays, saying so quietly (*Nothing running.*), so the state is always visible.

**How it is drawn** (S32, #25) — the content and the rules above do not change:

| Where | Desktop | Terminal, which has no `Svg` |
|---|---|---|
| a card | the surface's spacing steps; *Waiting for you*, a question and a problem **stroked** in their colour, never filled: on a tinted fill, the owner's walk of 1.2.0 could not read the hints, links and chips | whole cells, nothing painted behind text |
| contrast | every word and link reads at 4.5:1 or more, and a mark (a chip's dot, a ⚠) at 3:1, in the S32 canvas's light and dark palettes, on every tab, the band and the narrow dock, in every state that waits or fails: no word is amber. A word that waits for the owner is semibold `text`, a problem `error`, and a chip's word is `inactive` | the same theme keys |
| type | headings semibold at the heading size, the run's and the bell's numbers at the title size, every number tabular, branches and hashes monospaced | one size; bold for semibold |
| a running story | 8 segments from `progress.stage`; the slots and today's spend as two gauges | `✓ ✓ ✓ ✓ ● ○ ○ ◇` and `▰▰▱▱` |
| one story | a stepper of 8 nodes with its labels under it in `Text`, each node at its label's column centre so the two line up at any width, a tooltip on each node; below 60 body columns (a dock of about 435 px) compact, its nodes at their size and only the phase now named. The run's numbers large, the spend against the story's budget as a bar | the phases as a list |
| a plan | its stories in its order, an arrow only where one runs after another, from their `after` | `1 → 3 · 2` |
| *New task*, *New goal* | `Select`s over `tasks_add` (goal, after, size) and `goal_add` (priority, target); the new goal's *Title* one line and *What should it do?* in four rows, each with its helper line under it; its *Specification (optional)*: a folder's .md files as `+ name · size` buttons, each attached file a row with *Remove*, *Another folder* one line, and *Attach .md files in the session ↗*, a stack in the narrow dock | the same `Select`s, fields and buttons |
| the allow rules | `Code`, json | the same |
| the narrow dock, below 44 body columns | no row detail, the phases as dots, the gauges as numbers | — |

**An `Svg` reads no theme**, so its colours are fixed and medium, legible on light and dark alike, and it holds **no word**: every word sits in a `Text` beside it, and its `alt` says the whole picture. No stage reported, no node is drawn as now, and the phases' count says *no stage reported*. A story a plan runs after is named by its title, never by its number. The band is unchanged but for its tabular digits, and there is no 30-day cost chart: `metrics` reports no per-day series.

**The owner's acts sit where S32 left dashed slots for them (S27, #27)**, now plain rows on their subject's card:

| Act | Tool | On the card of |
|---|---|---|
| Approve · Rethink… | `plan_approve` · `plan_rethink` | a plan that waits |
| Return… · Unblock · Abandon… | `story_return` · `story_unblock` · `story_abandon` | a verified or a blocked story; Abandon… alone on an approved story that has not started |
| Stop | `story_stop` | a dispatched or running story |
| Accept | `story_accept` | a story verified in Terylon's own list, which has no merge |
| Pause… · Resume | `leader_pause` · `leader_resume` | the queue's header, the paused card on the queue and the Status tab |
| Drop goal… | `goal_drop` | an open or active goal |
| Confirm · Drop | `memory_confirm` · `memory_drop` | a memory proposal, on the Memory tab |
| Edit · Save | `policy_save` | the policy, on the Status tab |
| **Merge in the console ↗** | **never**: `story_merge` stays behind your passkey | a story verified in a repository |

- **Each act calls its tool only when it is pressed**, never when a card is drawn. A row in *Waiting for you* still only opens its subject; the acts are on the subject's card.
- **One press, or a field.** Approve, Accept, Stop, Resume, Confirm and Drop are one press. Rethink and Return need text, and their button stays dim and sends nothing until it says something; Unblock, Abandon and Pause offer a field and send without it. Abandon and Drop goal ask once more, and are drawn red: a plain `Button` with its word in `error`, since one with chrome drew its word grey in Desktop (the owner's walk of 1.5.0, #35). Drop goal… names, from the goal's own data, the waiting plans it withdraws and, by title, every story of it that has not ended, which the drop abandons, a run stopped first (Terylon S35, #388), and says so when either is none.
- **While Terylon answers, the act reads *…ing*** (*Approving…*) and the card's other buttons wait, dim, and do nothing; one act is in flight per card, however often it is pressed.
- **✓ is drawn with what it changed** (the owner's walk of 1.5.0, #35): an approved or rethought plan, a dropped goal and a saved policy read so at once, and leave *Waiting for you* and the open goals, though the leader takes an act before its reads catch up. The pane keeps that state until Terylon's answer shows the subject moved, at most five minutes, and then draws Terylon's.
- **Three outcomes**: *✓* and Terylon's answer; *✗ Refused (409)* with Terylon's sentence unchanged, *Refresh* and the subject in the console as the way round; or *⚠ Claude Code refused the pane's call to …* when an allow rule is missing, whose *How to fix* opens the Status tab with every rule the pane needs.
- **Every act is sent as Terylon main `aaf07e8` declares it**, in one place, `actArguments` in `hooks/terylon.ts`: the subject's id (`{plan}`, `{story}`, `{goal}`, `{proposal}`) and the owner's words as `comment`, `note` or `reason`. `plan_approve` also takes `stories?` and `edits?`, and `memory_confirm` a `text?`; the pane sends neither, so picking stories, editing criteria and editing a proposal stay the console's.
- **Every act answers `{accepted, sentence, commandId, subjectId}`**: true is ✓ and Terylon's sentence whole, false the leader's refusal in its own sentence, null no answer within 10 s. A refusal before the leader is `{refused, status?}`.
- **`policy_save` sends only what changed**, the memory's bounds as a partial `memory` object, with no version and no concurrency check: the last write wins. The form's ranges are `policy_get`'s `limits`; its `version` and `changedAt` are said on the card.
- **The pane validates what it sends**, because Terylon checks no act's arguments against a schema: the subject's id present, the note a return and the comment a rethink carry, a comment at most 2000 characters and a note at most 4000, and each policy field a number of its kind within its limit, said in the form before anything is sent.
- **A memory proposal names who proposed it as *you* or *the leader***: `by` is `web:<login>` or `brain`, and the login is never drawn.

**Everything in the pane opens.** Every row is a press away from its whole subject, and ‹ walks back the way the owner came. Merge is always a link to the console, never a button:

| Screen | What it shows | Reads |
|---|---|---|
| Queue | waiting for you (questions, merges, acceptances, plans, blocked): a verified story in Terylon's own list waits for *accept* on its card, one in a repository for its merge in the console; running with step and cost, queued or held, done today; *Pause…* in its header, *Resume* when the leader is paused | briefing, work_in_flight, stories_list, leader_pause, leader_resume |
| A story | the phases — admitted, then plan · develop · review · tests · pull request · verified · merge, from `progress.stage`; a story in Terylon's own list has no pull request, so its phases go from verified to a last *Accept* — **Now working**: the agent at work and its stage, its step, the cost, tokens and time since start, the run's question, the environment, the verdict with its checks and overrun, criteria, what happened; its acts by its state | story_get, work_in_flight, story_return, story_unblock, story_abandon, story_stop, story_accept |
| A question | the question whole, its own (a)/(b)/(c) choices to press, an answer to type, *Talk it over with Claude in the session* | question_answer |
| Goals | two buttons, **Open · N** and **History · M**, like Claude Desktop's Active and Archived sessions, *Open* selected: the open goals by priority with their questions, or History, the done and dropped ones, each row opening its goal and each History row ending with **Delete… ↗**, a link to that goal's row in the console's History with its Delete… sheet open (`?cockpit=goals&tab=history&goal=N&sheet=delete`, Terylon S49; a console before S49 lands on Goals), where the owner types the number and deletes it for good (Terylon S47); the pane calls no delete. *History is empty.* when it is. Below them, under Open the open goals' plans; under History only a closed goal's plan that still waits for the owner, a settled one staying on its goal's own screen. With Terylon S44 `goals_list` answers the open goals and `closedCount`, and the closed ones are read with `goals_list {closed: true}` on a press of *History* alone, never on the poll, and kept until the next press or a changed `closedCount`; a Terylon without S44 answers the full list, and the pane counts and filters the closed goals itself, decided per answer. Every plan of an open goal with its stories but a withdrawn one and a repeating task's settled version plan, which wait on nothing and stay on their goal's screen while a version that waits stays here as an act, a new goal — its *Title*, a short name of up to 200 characters, and *What should it do?*, the request in the owner's own words, sent as `goal_add`'s `ask` (Terylon S52) and left out where it is blank, a refused length said in Terylon's own sentence; and its *Specification (optional)* (Terylon S53): the .md files of the session's working directory, `$.fs.list` on the tab's load, or of *Another folder*, relative to it or absolute, each a button that attaches it, every file read whole with `$.fs.read` on *Add goal* and sent as `specification`, `{name, text}` each, while more than 10 files, more than 200,000 characters in all or a name Terylon refuses is the pane's own sentence with nothing sent, and Terylon's refusal, a file holding a secret among them, said word for word with the files kept; or *Attach .md files in the session ↗*, a request in the chat, in Czech, for Claude to add the goal with the typed title and ask and the .md files the owner names or Claude wrote; steered toward a general direction, a concrete ask (a file, a document, one change) going under a goal as a task, and confirmed with the leader's answer and how it reads it | goals_list, plans_list, goal_add |
| A goal, a plan | the goal's stories, questions and plans, and *Drop goal…*; a plan's stories in order, *Approve* and *Rethink…*. A repeating task's version plan (a `repeating` object and no stories) waits as *Plan N · version V of* the task's title with its terms, and its card says *Approve: each later task_run uses version V.* On the task's goal, its settled versions are one line in the card (*Versions: 1 (plan 2536), 2 (plan 2573)*) rather than plans below it; a version that waits stays below. A repeating task's goal (Terylon S43, `goal_get`'s `repeating`) draws its card in place of the stories: the approved version, the budget per run, whether green runs accept themselves or wait for you, and whether it is paused; the newest run in a box with its day, state, files, cost and *Open the run ↗*; the older runs as rows; *Started by your routine; Terylon keeps no clock.*; and the task in the console. A goal with a specification (Terylon S53, `goal_get`'s `specification`) draws its card under the goal's header and above the stories: *Specification · version N*, *revised* and its day, a button per file, *name · size ›*, opening it; when `replan` is set, a card stroked amber, *Plan was made from version F.*, and **Re-plan from version T**, which calls `goal_replan` on its press alone and says Terylon's sentence; *Revise…*, a form that starts from the version shown, its files read whole with `spec_get {goal, version}` and kept, a file of the same name from the folder list taking one's place, more added and one removed, and **Save as version N+1**, `spec_revise` with `basedOn` the version shown, a newer version saved meanwhile refused in Terylon's words; *Version k ›* for each older one; *In the console ↗*; and *YOUR DECISIONS ON EARLIER PLANS*, `Plan n · day · “comment”` for each of `decisions`. A goal with none draws nothing of it | goal_get, plans_list, goal_drop, plan_approve, plan_rethink, spec_get, spec_revise, goal_replan |
| A specification | one version of a goal's specification, read-only: each file as Markdown under its name and size, or the one file pressed; the latest from `spec_get {goal}`, an older one from `spec_get {goal, version}`; ‹ back to the goal | spec_get |
| Bell | notices that need the owner (press for the body and *Mark handled*), what the machine did, whether the leader runs, the last 30 days of the owner's stories with the host proof's counted apart | notices_list, notice_handle, leader_status, metrics |
| Memory | the rules the machine enforces (each with who enforces it, pressed for its artefact), a card per memory file with *Edit* and *Remove* on each entry, the proposals waiting, each with its old text struck, its new text, *Confirm* and *Drop* | memory_get, memory_propose, memory_confirm, memory_drop |
| Status | **Agentic OS** in one word (*ok*, *not allowed*, *not answering*, *paused*, *N alerts*), since when, the last answer, *Refresh*; **Slots**, the policy's and the runs in them; **Cost**, today against the daily limit and the last 30 days; **Problems**, each a card with *Reason: …* and *How to fix* in steps: the allow rules for a refused call, the tailnet and `TERYLON_URL` to check, *Resume* for a pause, the notice's own words for an alert; **Policy**, read as `policy_get` answers it, *Edit* in place within its `limits` and *Save*, a refused save keeping what was typed; **Diagnostics**, the mod's version, `TERYLON_URL`, the server that answered, the debug log | everything above, metrics, policy_get, policy_save |
| New task | title (three rows, sent as one line), criteria, goal, after, and for a goal over a repository its *Files*, one path per line, 1 to 30, checked before anything is sent (a goal in Terylon's own list sends `files: []` and draws no field); sent, with the title and criteria handed over said word for word, refused, no answer in 10 s, paused | tasks_add |

**A tab never sits on *Loading…* for good** (the operator's Desktop walk of 1.1.1, 2026-10-21): a tab's load starts from an empty value, so one an earlier version of the mod left behind is replaced, and whatever it throws or does not finish within 8 s — under Desktop's own 10 s bound on a press — ends as the tab's error with its reason, and in the debug log. **The pane's own prompts are posted once**: the same text is not posted again within a minute, and an answer is sent once however often *Send* is pressed. **Every answered question is confirmed** (the operator's walk of 1.1.2): an answer sent by Enter is the field's own value, so the second answer of a walk is handed over and confirmed as the first was; a refused one keeps its text and says why.

**A story's stage, the agent at work and its tokens are Terylon's, never the pane's** (#360). `story_get` and `work_in_flight` report `progress.stage` — plan, develop, review and test measured from the run, then pr, verify and merge from the story's state — `progress.agent` and `progress.tokens`, and the pane draws exactly that. It works out no stage from the timeline, and a mutation that brings an inference back turns the tests red. A story Terylon reports no stage for draws no phase as now.

- **One answer for the row and the card** (the owner's walk of 1.5.0, #35): a story opened reads `work_in_flight` again with `story_get`, and the queue's running rows are drawn from that same answer. Its progress is taken field by field, `work_in_flight`'s where it names a value and `story_get`'s where it does not, so a stopped story's empty stage does not hide the one `story_get` reports.
- ***Now working* is drawn for every story whose run goes**, dispatched or running, and says *no agent reported* or *no stage reported* where `progress` names none.
- **A story's running time leaves out the time it stood blocked**, from the moves its timeline records: an unblocked story is not said to have run through its stop.
- **An approved story held by Terylon says why**, on its row and its card: `story_get` carries the reason as `blockedReason` while the state stays approved ("after #12; #12 was abandoned, so order it again"), and the poll reads it there for an approved story `stories_list` gives no reason or order for. One with no reason anywhere, not started while a slot is free, says so, never *waits for a slot*.
- **Two waiting plans of one goal** are both drawn, each with its own acts: since Terylon S35 (#388) a second `tasks_add` under a goal waits beside the first instead of replacing it.

**The done-signal** goes into the session once per story and verdict commit. It covers a story that is verified and waiting for its merge, or, in Terylon's own list, for your *Accept*; merged, accepted, abandoned, blocked or stuck.

- **It tells what is true at the post.** Of one read, each story's latest move alone is told: verified then accepted is *accepted*, blocked twice then abandoned is *abandoned*. Right before the post the pane reads each story again with `story_get`, and a verified story merged or accepted since asks for no *Accept*, a blocked one no longer blocked is not called blocked, and nothing under a dropped goal asks anything: a verified, blocked or stuck story there posts nothing, while its abandoned line, which asks nothing, is still told. An *Accept* pressed in the pane counts too, while `story_get` still lags or does not answer.
- **A signal found while a turn runs waits for its end.** Claude Code holds a submitted prompt until the running turn ends, so the pane holds it instead: the toast goes at once, and when the turn ends the pane reads the story again and posts only what is still true. A story verified and then abandoned during one turn asks for no *Accept*, and its abandoned line is posted at the turn's end. Only the main loop's turn holds it, never a subagent's. **What is held is kept in the store** before the position moves past its events, so a restart before the turn ends loses nothing: each session that takes the lease reads it back and, unless a turn runs there, posts it once at that tick. A turn whose end is never heard counts as ended after 30 min.
- **One session per machine posts it.** Every open session runs the pane, and they share one store, so a lease there names the one that reads the events, posts and toasts; every other session only draws. A machine with no live lease always gets a signaller: the first session that ticks takes it, writes it and reads it back, and only the one whose write stuck holds it. The session the owner types in takes it, at the prompt or through Remote Control, and so does one whose band or pane is drawn where the holder's never was. Its holder renews it every tick, and a lease not renewed for three ticks lapses to the next session that ticks. A session no person is at, `claude -p` or the SDK (no `isInteractive` and no surface), never takes it. Where the store refuses, only a session the owner sees or types in posts. Each session's lease id is the engine's `session.id`, or, where the engine gives none, its start, its directory and a nonce made once per load, since sessions Desktop restores together start in one second, often in one folder. *Diagnostics* says `signaller: this session (<id>, session.id|fallback)`, `another (<id>) since HH:MM` or `none`, and when no session has signalled for longer than a lease the Status tab says *No session is posting the done-signal*, with its fix in steps.
- **A pane updated in place keeps its own poll going.** A module the engine reloads in a running session may hear no `session.start`, and a poll timer the host refuses once never fires again. Every hook the pane has, `session.start`, the band, the pane, a prompt, a turn's start and end, starts the poll when it has not started, and starts it again, ticking at once, when it has not ticked for two polls (60 s); one poll per load. A lease naming this session is renewed at its first tick, even where the session was taken for one nobody is at.
- **A signal is recorded as told only once its prompt entered the session.** A prompt a hook drops, or the engine refuses, is held and told on the next read.
- **Several signals of one read are one prompt**, a line each and one toast, *Terylon: N stories moved*. Each prompt is a turn of its own, queued behind the running one, so one prompt per signal made the last of them arrive many turns late.
- Which signals were sent, and the last event read, are kept in `$.store`, so a new commit is a new signal and a return after Desktop was closed is caught up.
- **When Terylon is reset to factory defaults, the pane starts over.** Its event log gets a new `epoch` and its sequence begins again from 1, so the pane keeps the epoch beside its last sequence and sends it once known. It writes none until an answer names one, and a blank or non-string epoch in the store reads as none known and is deleted, so an unknown epoch is an absent key: the first real epoch is then adopted silently, never a reset. It starts over when `events_since` answers `reset: true`, when both epochs are known and differ (a rollback to an earlier epoch included), or, from a server that names no epoch, when the `head` is a number below the `since` asked. It goes on from the new epoch and head, posts nothing for the old history, neither a catch-up nor a signal, even where the answer carries a gap too, and forgets the signals it told and what it remembered of each story. It says so once, on the band, *Terylon started over*, and in the debug log. A gap within one epoch, its `head` at or above the `since`, still says the history is too long, and a `head` that is no number changes nothing. **An epoch Terylon refuses**, a 400 that says *'epoch' is the log's identity as an earlier answer gave it.*, would be refused on every tick it is sent: the pane forgets it and its position, starts over as on a reset, and its next tick asks for the head with no epoch, as a first look does, and keeps the epoch that answer names. Any other refusal keeps the epoch and is said on the Status tab.
- **A store that refuses, or does not answer within 2 s, stops nothing**: the pane keeps its place in memory for the session and says so on the Status tab, *The pane cannot keep its place*. Only the catch-up after Desktop was closed is lost.
- **When `events_since` fails**, the Status tab says so as a problem of its own, while the queue may read well: *Claude Code refused the done-signal's call* with the allow rules, or *The done-signal stopped* with Terylon's reason. A good read of the queue does not clear it; the next whole read of the events does.
- **A watchdog catches what no failure says**: when `events_since` has not answered for more than three ticks (90 s) while the queue reads, the Status tab says *The done-signal hears nothing*, whether the call failed, was held or was never made. It looks every 10 s on a timer of its own, so a tick held for good cannot silence it, and the next answer clears it.
- `$.prompt.submit` queues it as a turn of its own once the session is idle, so it never interrupts a running turn. The pane need not be open.
- A disabled mod posts nothing, and the catch-up summary covers the gap.

**The catch-up summary** is posted once, on a return after more than two hours away: done, waiting for you, running, stuck, spend.

- It carries transitions only, never a brief, a specification or a memory text.
- The signals of the gap are inside it, not posted on their own.
- More than 2 000 events behind, the pane posts nothing and the band links the console's history instead.

## Setup

**It needs Claude Code 2.1.304 or later**: an older one does not know `Text` `size`, `weight` and `tabular`. A plugin cannot declare that floor, so it is said here. It is built and tested on **2.1.308**, the engine Claude Desktop 3.6556.2.0 runs (seen in the owner's walk of 2026-10-23).

`terylon-os` must reach your Terylon: set `TERYLON_URL` as its README says. Then, at a terminal prompt:

```text
/plugin install terylon-pane@terylon
```

A mod installed at the user scope from a terminal loads in the desktop app's local sessions too.

**Allow the pane's thirty-four tools, or it reads nothing and acts on nothing.** The pane calls Terylon on its own timer, outside any turn of the model's, and Claude Code puts that call through the same permission check as the model's:

- In auto mode, the classifier has no request to judge the call by, and gives no verdict.
- In the default mode, there is no one to ask.

Either way the call is refused, and only an allow rule lets it through. Add these to `~/.claude/settings.json`; the pane shows the same block when it is refused:

```json
"permissions": {
  "allow": [
    "mcp__plugin_terylon-os_terylon__briefing",
    "mcp__plugin_terylon-os_terylon__work_in_flight",
    "mcp__plugin_terylon-os_terylon__stories_list",
    "mcp__plugin_terylon-os_terylon__events_since",
    "mcp__plugin_terylon-os_terylon__story_get",
    "mcp__plugin_terylon-os_terylon__policy_get",
    "mcp__plugin_terylon-os_terylon__goals_list",
    "mcp__plugin_terylon-os_terylon__goal_get",
    "mcp__plugin_terylon-os_terylon__plans_list",
    "mcp__plugin_terylon-os_terylon__notices_list",
    "mcp__plugin_terylon-os_terylon__leader_status",
    "mcp__plugin_terylon-os_terylon__metrics",
    "mcp__plugin_terylon-os_terylon__memory_get",
    "mcp__plugin_terylon-os_terylon__tasks_add",
    "mcp__plugin_terylon-os_terylon__goal_add",
    "mcp__plugin_terylon-os_terylon__question_answer",
    "mcp__plugin_terylon-os_terylon__memory_propose",
    "mcp__plugin_terylon-os_terylon__notice_handle",
    "mcp__plugin_terylon-os_terylon__spec_get",
    "mcp__plugin_terylon-os_terylon__spec_revise",
    "mcp__plugin_terylon-os_terylon__goal_replan",
    "mcp__plugin_terylon-os_terylon__plan_approve",
    "mcp__plugin_terylon-os_terylon__plan_rethink",
    "mcp__plugin_terylon-os_terylon__story_return",
    "mcp__plugin_terylon-os_terylon__story_unblock",
    "mcp__plugin_terylon-os_terylon__story_abandon",
    "mcp__plugin_terylon-os_terylon__story_stop",
    "mcp__plugin_terylon-os_terylon__story_accept",
    "mcp__plugin_terylon-os_terylon__leader_pause",
    "mcp__plugin_terylon-os_terylon__leader_resume",
    "mcp__plugin_terylon-os_terylon__goal_drop",
    "mcp__plugin_terylon-os_terylon__memory_confirm",
    "mcp__plugin_terylon-os_terylon__memory_drop",
    "mcp__plugin_terylon-os_terylon__policy_save"
  ]
}
```

A rule names a tool, never its arguments: `goals_list {closed: true}`, which reads the closed goals after Terylon S44 (#41), is allowed by the `goals_list` rule above.

**Seven of these tools write and decide nothing:**

| Tool | What it does | Why it is not a gate |
|---|---|---|
| `tasks_add` | adds a task | the task becomes a plan that waits for the owner's approval |
| `goal_add` | adds a goal | the leader turns it into a plan that waits for approval |
| `question_answer` | answers the leader's question | it completes the brief and approves nothing |
| `memory_propose` | proposes a memory edit | the owner confirms or drops the proposal on the Memory tab |
| `notice_handle` | marks a notice handled | it decides nothing about work, and the same notice raised again opens again; the owner decided on 2026-10-12 (#360) that it is not a gate |
| `spec_revise` | stores a goal's specification as its next version (Terylon S53) | nothing running changes; the goal's next plan reads it, and a re-plan waits for the owner |
| `goal_replan` | asks the leader to plan a goal again from its latest version (Terylon S53) | the new plan waits for the owner's approval; the pane calls it on the owner's press alone, never on a draw |

**Thirteen of them are the owner's acts**, `OWNER_ACTS` in `hooks/terylon.ts`, each taken on its subject's card in one press and with no passkey (the table above). They were gates until Terylon PR 228 made each of them an owner write and left merge the only gate a tool can reach. Allowing them lets Claude in a session call them too, as it can any tool an allow rule names.

**Merge is the one gate, and it is never allowed.** `story_merge` is confirmed by your passkey in the console; the pane shows *Merge in the console ↗*. It is in `GATE_TOOLS`, never in `PANE_TOOLS`, and the guard refuses it by name.

**Never allow the server as a whole** (`mcp__plugin_terylon-os_terylon`), nor a wildcard: that would allow `story_merge` too. The list is the pane's own allow-list, `PANE_TOOLS` in `hooks/terylon.ts`. `tests/terylon-pane/tool-table.test.js` holds this block to that list and both to the copy of Terylon's tool table in `tests/terylon-pane/mcp-tool-table.json`, and a planted `story_merge` in either turns the tests red.

### Three drawings Desktop had to prove

2.1.304 declares them; the owner walked them in Claude Desktop 3.6556.2.0, engine 2.1.308, on 2026-10-23, and **all three work**: they are on. `TERYLON_PANE_PROOFS`, in the `env` of your own `~/.claude/settings.json`, is the escape hatch: `no-` and a name turns that one off, and off draws what 1.1.2 drew.

| Name | On, the default | Off |
|---|---|---|
| `input-rows` | the answer in four rows; the criteria in three, one per line | one line each; criteria split by semicolons |
| `hover-reveal` | a waiting row lights under the pointer and shows its console link beside its press, never over its text; never over an open row, whose body holds the link | the link in the row's body, one press away |
| `svg-tooltips` | a stepper node says its stage, role and step under a pointer held still on it | the labels under the stepper |

```json
"env": { "TERYLON_PANE_PROOFS": "no-hover-reveal" }
```

The names are separated by commas or spaces; anything else changes nothing.

**`TERYLON_PANE_STATUS` draws the Status tab in parts**, to find the one Desktop does not draw. In the same `env`, `minimal` draws it as three plain lines under the tabs, and `no-` and a part's name leaves that part out: `machine`, `gauges`, `problems` (with `events` and `alerts` inside it), `outcomes`, `policy`, `diagnostics`. Restart Claude Desktop after each change. Unset, the whole tab is drawn.

```json
"env": { "TERYLON_PANE_STATUS": "no-gauges, no-policy" }
```

**`log` among them draws the pane's own log on the Queue tab**, for a Desktop that writes no log the owner can read: the last 40 lines the pane wrote to the debug log, numbered, newest last. Open the Status tab, then come back to the Queue to read them. Each draw of the Status tab writes two lines there: `the Status tab begins on <surface> at <N> columns`, and `the Status tab draws <parts>; problems N; <E> elements, <C> characters, nothing odd; <T> ms`. In place of *nothing odd*, the second names what in the tree a host may refuse while `plugin test` draws it: `keys used twice: <key>×<n>`, or `odd props: <element>.<prop>=NaN`. A *begins* line with no *draws* line after it is a draw that never returned. A fault the host reports to the mod is a `ui.fault:` line.

```json
"env": { "TERYLON_PANE_STATUS": "log" }
```

## Debugging

**Every failed call goes to the debug log**, in the engine's own words, with the tool and the server: start a session with `claude --debug` and look for `terylon-pane:`. The band names the state and the pane's card says why under *Reason:*, so a stale number is never the only clue.

| The band or the card says | It means | Do |
|---|---|---|
| Claude Code refused the pane's call | no allow rule names the tool; the call never left the PC | add the rules above, then *Try again* |
| not answering since HH:MM / Terylon does not answer | the call left and nothing answered | read *Reason:*, then `tailscale status` and `TERYLON_URL`; after a network outage, `/mcp` → `terylon` → **Reconnect**, or restart Claude Desktop (until Terylon S42 makes `/mcp` stateless) |
| no terylon server | `terylon-os` is not installed, or its server is not connected | `claude mcp list` |
| refused: not the owner | Terylon answered, but not to its owner | sign this PC into the tailnet with your own account |
| a tab says *… did not load* · *Terylon did not answer within 8 s* | the tab's calls did not finish under Desktop's 10 s bound on a press | read the debug log's `terylon-pane: loading … failed:` line, then press the tab again |
| Status: *⚠ Claude Code refused the done-signal's call* | the queue reads, but no allow rule lets `events_since` through, so nothing is told | add `mcp__plugin_terylon-os_terylon__events_since` as the card spells it; if it is there, restart Claude Desktop |
| Status: *⚠ The done-signal stopped* | `events_since` reached Terylon and did not answer as the owner's | read *Reason:* and Health in the console |
| Status: *⚠ The pane cannot keep its place* | Claude Code's store for the mod refused or did not answer; a store file cut short, such as 52 bytes of NUL, is refused for good | delete the file the card names (`~/.claude/plugins/store/terylon-pane_terylon-*.json`): it holds only where the pane last looked and the signals it told. Then restart Claude Desktop |
| Status › Diagnostics: `events: …`, `since: …`, `reason: …`, `answeredAt: …`, `watchedSince: …`, `silentSince: …`, `store refusals: N` | the done-signal's state as the pane keeps it, each value with its type, in plain text: what the done-signal's card draws from | read the lines from a screenshot when the card itself does not draw; `events: none` and `silentSince: none` mean nothing is wrong with it |
| Desktop's own *Nothing to show yet — terylon-pane has not drawn in this pane* on a tab | the host did not draw what the tab returned, though `plugin test` draws it | set `TERYLON_PANE_STATUS` to `log` and read the Status tab's lines on the Queue tab (or `terylon-pane: the Status tab draws …` under `claude --debug`): they say the render ran, what it returned and anything in it a host may refuse; then find the part with `TERYLON_PANE_STATUS`, starting from `log, minimal` |
| Status: *The Status tab's … did not draw* | one part of the tab threw while drawing; the rest is drawn around it | read *Reason:* and the debug log's `terylon-pane: the Status tab's … did not draw:` line; press *Refresh* |
| Status: *⚠ The done-signal hears nothing* | `events_since` has not answered for more than 90 s while the queue reads, and nothing failed that the pane saw: the call is held, or the events path stopped before it | read the debug log's `terylon-pane: events:` lines: the last look read, each `events_since` called and what it answered, each signal posted, and where it stopped |

## Tests

`claude plugin test plugins/terylon-pane` runs `tests/*.test.ts` and `tests/*.test.tsx` against the engine, with no session and no network:

- A Terylon answering from memory (`tests/fixtures.ts`) records every call.
- Every view is tested on the terminal and on the desktop, colours and labels included.
- The band is held to its states, to *Open* reopening the last tab on every one of them, and to yielding to a survey; the Status tab to each state with its fix in steps; the status line to each problem, their order, what is an alert and its 60 characters.
- The pane is held to opening only when asked and only once, to one-line rows that are one Button with their kind on a title over 200 characters, to quiet empty cards, to walking from row to subject and back, and to pressing every button without one gate call.
- The S32 drawing is held too: each Desktop proof at the default the owner's walk set and switchable, no card filled and the kinds and the state as chips, every word and link at 4.5:1 in both themes and none amber, on every tab, the band and the narrow dock, in every state that waits or fails (`tests/contrast.test.ts`, computed from the canvas's palette in `tests/contrast.ts`, since the kit gives theme keys and not painted colours), no word and no theme colour inside an `Svg` and each at its own height, the compact stepper in a dock of about 435 px, each label of the wide stepper within half a node gap of its node at ~660 and ~1060 px (`tests/stepper.test.ts`), a blocked story timed as blocked and never as running, no node now without a stage, the narrow dock, the pickers sending what was picked, and the band's digits tabular.
- The owner's acts (S27, `tests/acts.test.ts`) are held to calling nothing on render, each act's tool and arguments on its press, a needed text before Rethink or Return sends, *…ing* with the card's other buttons waiting and a second press sending nothing, the three outcomes each with its card, merge only ever a link, and no dashed slot left.
- The owner's walk of 1.5.0 (#35, `tests/findings.test.ts`) is held there finding by finding: a new task typed key by key handed over whole, with no criterion when Criteria is empty, and the card saying what was handed over; ✓ drawn with what it changed after Approve, a policy save and Drop goal, while Terylon's reads lag; the danger acts red; How to fix naming no button it lacks; Drop goal… saying what it withdraws and abandons; an approved story's held reason, one not started while a slot is free, and its Abandon…; two waiting plans of one goal; a closed goal's plans off the Goals tab; a plan's order from `after`, said by titles; the row and the card on one answer; *Now working* for every running story; a stopped story's stage; the running time without the time blocked; and *What to do* in three rows.
- The done-signal is held to reaching `events_since` where the store refuses or never answers, and to saying on the Status tab, with its fix in steps, an `events_since` that Claude Code or Terylon refused, and to the watchdog saying one unanswered for more than three ticks, quiet while the queue itself does not read, cleared by an answer (`tests/done-signal.test.ts`). The Status tab draws from a snapshot 1.8.3 kept and from done-signal fields of another shape, a part of it that throws is one problem card with its reason while the rest draws, and the connection's problem and the done-signal's keep a *Try again* each. An accepted list story, which Terylon calls merged, reads *accepted* on its card's chip and its phases while a repository story stays *merged*, and a story `work_in_flight` still lists once it is verified or ended is never drawn under *Running* beside its *Waiting for you* row. `tests/settled.test.ts` holds the done-signal to what is true at the post: goal 35 as it happened, three runs auto-accepted and one blocked twice then abandoned under a dropped goal, is one summary with no *Accept* asked and nothing called blocked; a story verified in one read and accepted before the post asks nothing, and the next read tells it accepted once; under a dropped goal a blocked or verified story posts nothing. `tests/held.test.ts` holds stories 146 and 148: verified while a turn runs and abandoned before it ends asks for no *Accept* and posts the abandoned line, with the store recording exactly what was posted; a signal still true is posted at the turn's end with one toast; a prompt that does not enter the session records nothing and is posted on the next read; a turn that ends while a tick runs loses nothing; and a subagent's turn holds nothing. `tests/lease.test.ts` holds the lease: a store of the old shape and a session that names no `isInteractive`, as Desktop's 2.1.309 starts it, takes it at the first tick and reads the events; a lost compare-and-set signals nothing; a busy session still takes it and holds its signal for the turn; another session's lease keeps this one from the events, a lapsed one is taken over and what moved posted once, the holder renews it, a session no person is at never posts, the owner's typing moves it, a session drawn where the holder never was takes it, with a refusing store a session nobody sees posts nothing and the Status tab says so until the owner looks, and a session started at the same moment in the same directory as the holder, with no `session.id`, is not taken for it. `tests/reset.test.ts` holds the start over after a reset, answered by today's server and by S48 with a gap, with `reset` and with both, the next event at seq 6 told although its key was told before the reset; a changed epoch with the head above the since, and a rollback to the earlier epoch, each a reset; no catch-up of the old history; an ordinary gap still too long, with no epoch or in the same one; the epoch sent once known; a blank or non-string stored epoch adopting the first real one without a reset, and no blank epoch written; and a `head` that is no number changing nothing. `tests/done-signal.test.ts` adds story 129: verified then accepted by the owner in one read is the accepted line alone, and after *Accept* pressed in the pane its verified move asks nothing. The same file holds the list-story findings of the owner's walk of 1.7.2: the done-signal and the catch-up waiting for *Accept* while a repository story keeps its merge, the card drawn accepted right after *Accept*, *Done today* saying *accepted*, an ended story's phases saying how it ended, and the row's console link beside its text, never over it (`tests/redesign.test.ts`).
- The production retest of 1.6.0 (#39, `tests/retest.test.ts`) is held there too: a repository goal's task sending its *Files* and said under ✓ Handed over, no files, a blank line or more than 30 sending nothing and saying why, a list goal's task drawing no field and sending `files: []`; a verified list story's row, kind and hint saying *accept* and leading to its card's *Accept*, its stepper ending in *Accept*, while a repository story keeps its merge; and a plan's chain drawn only for an order, with each size on its story's row and none beside the chain, on the desktop and the terminal.
- Open and Closed goals as two buttons (#41, `tests/closed.test.ts`): **Open · N** and **Closed · M** in place of the fold on the desktop, the terminal and the narrow dock, *Open* selected, a closed goal's title dim by the engine's own dimming; both shapes of `goals_list`, with `closedCount` (Terylon S44) and without it; the closed goals read only on a press of *Closed*, kept through the poll, a refresh and ‹ back, and dropped by a changed `closedCount`; a plan kept only under an open goal, and under *Closed* only the closed goals' plans (Terylon Testing's round, #48); and the closed list empty, loading, and failed with Terylon's sentence and *Try again*.
- History and Delete… (Terylon S47, `tests/history.test.ts`): **History · M** in place of *Closed* on the desktop, the terminal and the narrow dock; each History row ending with *Delete… ↗* to its goal's Delete… sheet in the console's History, a link only, and no tool deleting; *History is empty.*; a deleted goal's `goal_get` and a `story_get` under it each said quietly with ‹ back, never as a failure, the goal leaving History and staying gone from a list that still names it; the feed's `GoalDeleted` (its `title: null`) dropping the goal and its plans and keeping its stories' signals from posting while another goal's story still signals; a pending signal of a story `story_get` says was deleted with its goal never posting; size *S* in the New-task picker, *M* still the default, sent as `S` by `tasks_add`; after a reset of Terylon's history, a goal deleted in the old one hiding nothing in the new; and under History no settled plan of a closed goal, only one that still waits. `tests/held.test.ts` holds story 172, verified then abandoned under a dropped goal during a turn, told as abandoned at its end; a held signal kept in the store before the position passes it, and posted once by the next session; a turn whose end is never heard taken as ended after 30 min; and a module that heard no `session.start` starting its poll from the band, renewing its own lease and reading the events.
- A goal's specification (Terylon S53, `tests/spec.test.ts`): on the desktop, the narrow dock and the terminal, *New goal* draws *Specification (optional)* with the session folder's .md files and no other file, *Another folder*, its helper line and *Attach .md files in the session ↗* with its own, the form's other fields unchanged; an attached file a row with *Remove*, read only on *Add goal* and sent whole as `specification`; a goal's card under its header and above its stories, its files, older versions, console link and decisions; the re-plan notice stroked amber with no amber word, `goal_replan` uncalled through a minute of draws and called once on its press; and *Revise…* reading the version shown, replacing a kept file with one of its name from another folder, adding one, removing one, and `spec_revise` sent with `basedOn` that version. Once each: a file opened read-only as Markdown through `spec_get {goal}` and an older version through `spec_get {goal, version}`, no input on either; a goal with no specification drawing and reading nothing of it; 11 files, a name Terylon refuses, 200,001 characters and a file the engine cannot read each the pane's one sentence and no `goal_add`; a folder that cannot be listed said in the engine's words; the request B puts in the chat; and Terylon's refusals, a secret in `goal_add`, a newer version in `spec_revise` and a re-plan, said word for word.
- A goal carries its ask (Terylon S52, `tests/ask.test.ts`): *New goal* on the desktop, the narrow dock and the terminal draws *Title* and *What should it do?* in four rows, each with its helper line, beside the pickers and *Add goal*; `goal_add` carries the ask as typed and the form is cleared once the goal is set; a blank ask is left out, never sent empty; and Terylon's refusal of a long ask is said word for word, with what was typed kept. `tests/reset.test.ts` holds an epoch `events_since` refuses: forgotten, the pane started over with nothing told, the next tick asking for the head with no epoch, the epoch it names sent after, and the done-signal posting again; and any other refusal keeping the epoch and saying the done-signal stopped.
- A repeating task's goal (Terylon S43, `tests/repeating.test.ts`): its card in place of the stories card on the desktop, the terminal and the narrow dock; each run state in words, an unknown one as *running*; a run's day as *Today 05:00* or *27 Oct 05:00* in the host's time zone; the summary with and without auto-accept, paused and a version waiting; each run opening its story; a version plan on the Queue and its card with no story count, from the plan `plans_list` answered in production; an older run's state a Text of its own beside its day; the settled versions one line in the card; each run's day in its own offset, so a run from before a change of clocks keeps its hour (`tests/clocks.test.ts` holds the same for every time the pane draws); and an answer with missing or odd-typed fields drawing with no NaN, undefined or Date on the card and `?` for a time it cannot read.

**Run it with the engine the desktop app runs.** A `claude` on `PATH` older than the desktop's may not know `plugin test`, and may refuse the module in `plugin validate` for a rule the desktop's engine no longer holds.

More checks live at the repository root:

- `tests/terylon-pane/mutations.test.js` plants mutations, and each must turn the tests red. It covers the done-signal, the catch-up, a refusal of Claude Code's taken for the tailnet, the debug log silenced and the reason hidden. It also covers the band ignoring a survey, the band showing the spend again or a *Fix*, *Open* forgetting the tab, the Status tab missing the fix step for a refused call, the status line counting the briefing as an alert or no longer saying the health, the pane opening by itself, a repeated notice shown each time on the machine card, `/terylon-memory` opening a second pane, a waiting count drawn calm, a row's title no longer cut, an empty card saying nothing, a pressed choice that no longer fills the answer, a gate among the pane's tools or its allow rules, the guard opened to a gate, and a waiting item merging from the pane. Since #360 also: a tab's load no longer bounded (Goals, Bell), the pane's prompts posted twice, an answer sent twice, one story said as *stories*, the phases inferred from the timeline again, *Mark handled* sending nothing, and the band dropping the bell's count or never reading it again. Since S32 (#25) also: a running row with no stage drawn with a phase now, a gate in the allow rules the Status tab draws, a Desktop proof's default flipped (each of the three), a word inside an `Svg`, the band's digits no longer tabular, the narrow dock drawn as the wide pane, a picked priority or size not sent, and a row's kind and detail outside its Button. Since the owner's walk of 1.2.0: a card that waits filled again or losing its stroke, a row's kind chip losing its grey or its word drawn in the kind's colour, the story's state chip filled in its own colour, a problem's title or the waiting count amber again, the hover reveal laid over an open row, an `Svg` left to size its own box, the stepper shrinking in a dock of about 435 px, and the answer field naming a second way to send. Since the owner's walk of 1.2.2: the wide stepper's nodes a strip of fixed width again, apart from its labels, and a blocked story's header saying it is running. Since the owner's walk of 1.5.0 (#35): a new task's title losing its first character, an empty Criteria sent as the goal picker's label, a card acted on drawn from the read that has not caught up, a saved policy no longer laid over a lagging `policy_get`, a danger act with chrome again, the rules an act needs asking for a Try again, Drop goal… silent when it withdraws nothing or naming none of the stories it abandons, an approved story's held reason not read, an approved story waiting for a slot while one is free or offering no act, a closed goal's plans on the Goals tab, a plan drawn as one chain or its `after` said as a number, a story opened on the last poll's stage, *Now working* only with an agent and a stage, a stage-less progress hiding `story_get`'s stage, the stopped hour counted as running, and *What to do* in one line. Since #26 also: an answer sent by Enter read from before its last keystroke, and an added goal no longer saying how the leader reads it. Since S27 (#27): merge among the owner's acts, the copied gate list losing merge, an owner act leaving the pane's tools, an act taken when its button is drawn, a story returned without a note, a verified story's merge drawn as a button, a second press sent while Terylon answers, a refusal losing Terylon's words, Claude Code's refusal said as Terylon's, and the story's acts in a dashed slot again. Since the retest of 1.6.0 (#39): a repository goal's task sent without its files, the Files field drawn for a list goal, a blank line or more than 30 files sent, a verified list story waiting for a merge again or its target not read from `story_get`, a list story's last phase Merge again, a plan of one story drawing its chain, the sizes standing beside the chain again, and the unreachable state's fix losing its reconnect step. Since #41: the closed goals read on every poll of the goals, `closedCount` ignored, the count and filter before S44 removed, a plan kept on the Goals tab under a goal S44 does not list as open, and, since #48, the open goals' plans listed under *Closed*, the unreachable state saying the state of ? before the first answer, a list story's phases naming the pull request again, and a withdrawn plan staying on the Goals tab. For the owner's walk of 1.7.2: a failed `events_since` hidden from the Status tab, the watchdog on `events_since` removed, a good read of the queue dropping that problem, a store that refuses stopping the done-signal, the events path silent in the debug log, a verified list story's done-signal waiting for a merge, the card right after *Accept* drawn verified, an accepted story called *merged* in *Done today*, a row's console link laid over its text, an ended story's phases saying *no stage reported*, a closed goal's title drawn as bright as an open one's, a done-signal field of another shape read as it is, a part of the Status tab that throws taking the whole tab down, the done-signal's *Try again* sharing the connection's key, an accepted list story's card saying *merged*, a verified or ended story drawn under *Running* again, by its own state or by the briefing's list, a story's moves of one read told one by one again, a signal posted without reading the story again, a story under a dropped goal asking again, several signals of one read posted one prompt each again, and an *Accept* pressed in the pane no longer standing over a lagging `story_get`, an empty *Problems* card drawn above the problems, and Diagnostics saying `undefined` where nothing is. For a repeating task's goal (Terylon S43): the stories card drawn beside its card, the summary ignoring `autoAccept` or `paused`, a run's unknown state drawn as it came, and the newest run's link opening nothing, a version plan said as 0 stories on its row or its card, an older run's state folded back into its day's Button, and the settled version plans listed below the card again. For Terylon's reset: a `head` below the `since` no longer starting the events over, another epoch than the pane's no longer a reset, the epoch never stored, a blank stored epoch taken for an epoch or left in the store, Terylon's `reset` ignored, the signals told before a reset kept after it, a done-signal found during a turn posted at once again, a held one never posted at the turn's end or left for the next tick when the turn ends during one, a key recorded though its prompt did not enter the session, every session posting again, a session no person is at posting, the lease never renewed, the owner's typing no longer moving it, an empty lease taken only after typing or not at all, no signaller hidden from the Status tab, the lease taken without reading it back, and a session that names no `isInteractive` taken for one nobody is at, and the fallback id without its nonce. For History and Delete… (Terylon S47): *Closed* or its empty line back, a History row without *Delete…* or linking elsewhere, a deleted goal or story drawn as a failure or its screen throwing, a deleted goal or its plans staying listed, `GoalDeleted` ignored, a story deleted with its goal still signalling, size *S* missing, a goal deleted before a reset still hidden after it, a closed goal's settled plan drawn under History again, the held signals not kept in the store or not read back, a turn that never ends holding them for good, and a module updated in place never starting its poll. For an in-place update: the poll started only from `session.start`, a stopped poll never started again by a hook, a session taken for unattended no longer renewing a lease that names it, and a session that takes the lease no longer reading back what the last holder held. And a repeating task's settled version plan listed on the Goals tab again. And a word drawn amber again, under 4.5:1 in the light theme. For a goal's ask (Terylon S52): the ask not sent with `goal_add`, and its helper line lost. And an epoch `events_since` refused no longer starting the pane over. For a goal's specification (Terylon S53): the specification not sent with `goal_add`, a goal re-planned when its notice is drawn rather than on the press, a revision sent based on another version than the one shown, and *Attach .md files in the session ↗* putting no request in the chat.
- `tests/terylon-pane/zones.test.js` plants a time zone in a copy of the mod — Prague, New York, Tokyo, and Prague's own 2026 changes of clocks — in the offset the pane reads the host's time by and the one the tests compute their expectations by, and the copy's tests must stay green (#39). `claude plugin test` runs in UTC in a Linux container whatever `TZ` says, and reads the host's zone on Windows, so a zone cannot be set from outside.
- `tests/terylon-pane/tool-table.test.js` holds `OWNER_ACTS` and `GATE_TOOLS` to the copy of Terylon's tool table in `mcp-tool-table.json`, and the allow rules above to `PANE_TOOLS`, merge in neither; with `TERYLON_SOURCE` set to a Terylon checkout it also holds the copy to Terylon's C#.
- `tests/terylon-pane/commands.test.js` holds every command the mod registers to a name that no skill of the mod or of `terylon-os` takes.
- `tests/terylon-pane/version.test.js` holds the version the Status tab says to the one `plugin.json` ships.

To type-check against the engine's declarations: the engine lays them in `.claude-plugin/types/` when it loads the mod from a folder it watches, and `tsc -p plugins/terylon-pane` then reads them.
