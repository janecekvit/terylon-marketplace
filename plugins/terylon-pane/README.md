# terylon-pane

**The Terylon band and pane in Claude Desktop**: a mod, which is a hooks module (`hooks/register.tsx`) that the engine runs in a session. It draws one row above the prompt, the status line, and **one** pane beside the transcript.

- **It shows, asks, answers and posts, but never approves.**
- Its content and rules are the approved S15 canvas, page *v2*, the band and the pane (#331, #332 c9); its drawing is the approved S32 canvas (#25), [`docs/design/s32/`](../../docs/design/s32/S32-pane-redesign.html), on the mod API of 2.1.304 and later; it is built and tested on 2.1.308, the engine Claude Desktop 3.6556.2.0 runs.
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
                                                                        as of #360

  every 30 s ──▶ terylon /mcp: briefing · work_in_flight · stories_list · events_since
       │           through ONE allow-list (hooks/terylon.ts) that refuses every gate tool
       ├──▶ the band, what calls for you:  Terylon · Waiting 3 · Running 2 · Queue 2 · Bell 2        Open
       ├──▶ the status line, the machine:  Agentic OS ● ok · $5.50 of $20 today · 2/4 slots
       ├──▶ ONE pane, opened by the band or a command, NEVER by itself:
       │      Queue ─── Waiting for you ──▶ a question answered here (question_answer) · a story · a plan
       │       │        Running · Queued · Done today ──▶ a story ──▶ its goal ──▶ a story …  ‹ back
       │       │        a story: its phases and Now working FROM progress.stage, NEVER ITS TIMELINE
       │      Goals ─── goals_list · plans_list ──▶ a goal · a plan; a new goal is goal_add
       │      Bell ──── notices_list · leader_status · metrics; a notice marked handled is notice_handle
       │      Memory ── the rules the machine enforces, the leader's memory; an edit is memory_propose
       │                  ──▶ CONFIRMED in the console
       │      Status ── the machine in one word, slots, cost, every problem with How to fix, diagnostics
       └──▶ the done-signal: $.prompt.submit ONCE per story and verdict commit, and a toast
  session start, away > 2 h ──▶ ONE catch-up summary; the band says it until ✕
  Add ──▶ tasks_add ──▶ a plan that WAITS for the owner in the console
```

**The band and the status line split the work, and neither repeats the other** (the operator's round 3 on #332):

| Where | Says | Never says |
|---|---|---|
| the band above the prompt | what calls for the owner: waiting, running, queued, an alert or a problem, and *Open* | the spend or the slots |
| the status line | the health of Agentic OS: well with today's spend and the slots in use, or the one worst problem | what waits for the owner |

- The band is one row, cut at its end, so it survives a pane docked beside the transcript.
- A value is coloured only when it differs from calm: *Waiting* above 0 is `warning`, *Running* above 0 is `suggestion`, *Bell* above 0, a stuck story or an alert is `warning`.
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

**Every row is one line and one press** (S32): a plain `Button` whose children are its kind chip (*question*, *merge*, *plan*, *held* …: a dot in the kind's colour, then the word, on the theme's neutral chip grey), its title cut at its end, and its detail in tabular digits, keyed by the subject's id. On the terminal the kind is padded to a fixed column, so the titles start under one another. A press opens the whole text under the row, with the console link the row leads to. A card with nothing in it stays, saying so quietly (*Nothing running.*), so the state is always visible.

**How it is drawn** (S32, #25) — the content and the rules above do not change:

| Where | Desktop | Terminal, which has no `Svg` |
|---|---|---|
| a card | the surface's spacing steps; *Waiting for you*, a question and a problem **stroked** in their colour, never filled: on a tinted fill, the owner's walk of 1.2.0 could not read the hints, links and chips | whole cells, nothing painted behind text |
| contrast | every word and link on a card that waits or warns reads at 4.5:1 or more, and a chip's dot at 3:1, in the S32 canvas's light and dark palettes: no word there is amber (a problem's title is `error`, a waiting card's is `text`), and a chip's word is `inactive` | the same theme keys |
| type | headings semibold at the heading size, the run's and the bell's numbers at the title size, every number tabular, branches and hashes monospaced | one size; bold for semibold |
| a running story | 8 segments from `progress.stage`; the slots and today's spend as two gauges | `✓ ✓ ✓ ✓ ● ○ ○ ◇` and `▰▰▱▱` |
| one story | a stepper of 8 nodes with its labels under it in `Text`, a tooltip on each node; below 60 body columns (a dock of about 435 px) compact, its nodes at their size and only the phase now named. The run's numbers large, the spend against the story's budget as a bar | the phases as a list |
| a plan | its stories as a chain | `1 → 2 → 3` |
| *New task*, *New goal* | `Select`s over `tasks_add` (goal, after, size) and `goal_add` (priority, target) | the same `Select`s |
| the allow rules | `Code`, json | the same |
| the narrow dock, below 44 body columns | no row detail, the phases as dots, the gauges as numbers | — |

**An `Svg` reads no theme**, so its colours are fixed and medium, legible on light and dark alike, and it holds **no word**: every word sits in a `Text` beside it, and its `alt` says the whole picture. No stage reported, no node is drawn as now. The band is unchanged but for its tabular digits, and there is no 30-day cost chart: `metrics` reports no per-day series.

**The dashed slots in a story's card and beside the leader's links are S27's (#27)**, which draws the story's and the leader's actions there. Until it lands they hold 1.1.2's links, and the pane draws none of S27's buttons.

**Everything in the pane opens.** Every row is a press away from its whole subject, and ‹ walks back the way the owner came. A gate (merge, approve, return, unblock, pause, stop) is always a link to the console, never a button:

| Screen | What it shows | Reads |
|---|---|---|
| Queue | waiting for you (questions, merges, plans, blocked), running with step and cost, queued or held, done today | briefing, work_in_flight, stories_list |
| A story | the phases — admitted, then plan · develop · review · tests · pull request · verified · merge, from `progress.stage` — **Now working**: the agent at work and its stage, its step, the cost, tokens and time since start, the run's question, the environment, the verdict with its checks and overrun, criteria, what happened | story_get, work_in_flight |
| A question | the question whole, its own (a)/(b)/(c) choices to press, an answer to type, *Talk it over with Claude in the session* | question_answer |
| Goals | open goals by priority with their questions, the closed ones a press away, every plan with its stories, a new goal | goals_list, plans_list, goal_add |
| A goal, a plan | the goal's stories, questions and plans; a plan's stories in order | goal_get, plans_list |
| Bell | notices that need the owner (press for the body and *Mark handled*), what the machine did, whether the leader runs, the last 30 days of the owner's stories with the host proof's counted apart | notices_list, notice_handle, leader_status, metrics |
| Memory | the rules the machine enforces (each with who enforces it, pressed for its artefact), a card per memory file with *Edit* and *Remove* on each entry, the proposals waiting in the console | memory_get, memory_propose |
| Status | **Agentic OS** in one word (*ok*, *not allowed*, *not answering*, *paused*, *N alerts*), since when, the last answer, *Refresh*; **Slots**, the policy's and the runs in them; **Cost**, today against the daily limit and the last 30 days; **Problems**, each a card with *Reason: …* and *How to fix* in steps: the allow rules for a refused call, the tailnet and `TERYLON_URL` to check, *Resume in the console ↗* for a pause, the notice's own words for an alert; **Diagnostics**, the mod's version, `TERYLON_URL`, the server that answered, the debug log | everything above, metrics |
| New task | title, criteria, goal, after; sent, refused, no answer in 10 s, paused | tasks_add |

**A tab never sits on *Loading…* for good** (the operator's Desktop walk of 1.1.1, 2026-10-21): a tab's load starts from an empty value, so one an earlier version of the mod left behind is replaced, and whatever it throws or does not finish within 8 s — under Desktop's own 10 s bound on a press — ends as the tab's error with its reason, and in the debug log. **The pane's own prompts are posted once**: the same text is not posted again within a minute, and an answer is sent once however often *Send* is pressed.

**A story's stage, the agent at work and its tokens are Terylon's, never the pane's** (#360). `story_get` and `work_in_flight` report `progress.stage` — plan, develop, review and test measured from the run, then pr, verify and merge from the story's state — `progress.agent` and `progress.tokens`, and the pane draws exactly that. It works out no stage from the timeline, and a mutation that brings an inference back turns the tests red. A story Terylon reports no stage for draws no phase as now, and *Now working* only while a run goes.

**The done-signal** goes into the session once per story and verdict commit. It covers a story that is verified and waiting for its merge, merged, accepted, abandoned, blocked or stuck.

- Which signals were sent is kept in `$.store`, so a new commit is a new signal.
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

**Allow the pane's eighteen tools, or it reads nothing.** The pane calls Terylon on its own timer, outside any turn of the model's, and Claude Code puts that call through the same permission check as the model's:

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
    "mcp__plugin_terylon-os_terylon__notice_handle"
  ]
}
```

**Five of these tools write, and none of them is a gate:**

| Tool | What it does | Why it is not a gate |
|---|---|---|
| `tasks_add` | adds a task | the task becomes a plan that waits for the owner's approval |
| `goal_add` | adds a goal | the leader turns it into a plan that waits for approval |
| `question_answer` | answers the leader's question | it completes the brief and approves nothing |
| `memory_propose` | proposes a memory edit | the owner confirms the edit in the console |
| `notice_handle` | marks a notice handled | it decides nothing about work, and the same notice raised again opens again; the owner decided on 2026-10-12 (#360) that it is not a gate |

**`goal_drop` is a gate** (#360): it ends the owner's goal, so it is confirmed by the person in Terylon's form or in the console. It is in `GATE_TOOLS`, never in `PANE_TOOLS`, and the pane links to the console for it.

**Never allow the server as a whole** (`mcp__plugin_terylon-os_terylon`): that would let the model call the owner's gates without asking too. The list is the pane's own allow-list, `PANE_TOOLS` in `hooks/terylon.ts`. A test holds the block to that list and to no gate, and a planted gate in either turns the tests red.

### Three drawings Desktop had to prove

2.1.304 declares them; the owner walked them in Claude Desktop 3.6556.2.0, engine 2.1.308, on 2026-10-23, and **all three work**: they are on. `TERYLON_PANE_PROOFS`, in the `env` of your own `~/.claude/settings.json`, is the escape hatch: `no-` and a name turns that one off, and off draws what 1.1.2 drew.

| Name | On, the default | Off |
|---|---|---|
| `input-rows` | the answer in four rows; the criteria in three, one per line | one line each; criteria split by semicolons |
| `hover-reveal` | a waiting row lights under the pointer and lays its console link over its right edge; never over an open row, whose body holds the link | the link in the row's body, one press away |
| `svg-tooltips` | a stepper node says its stage, role and step under a pointer held still on it | the labels under the stepper |

```json
"env": { "TERYLON_PANE_PROOFS": "no-hover-reveal" }
```

The names are separated by commas or spaces; anything else changes nothing.

## Debugging

**Every failed call goes to the debug log**, in the engine's own words, with the tool and the server: start a session with `claude --debug` and look for `terylon-pane:`. The band names the state and the pane's card says why under *Reason:*, so a stale number is never the only clue.

| The band or the card says | It means | Do |
|---|---|---|
| Claude Code refused the pane's call | no allow rule names the tool; the call never left the PC | add the rules above, then *Try again* |
| not answering since HH:MM / TerylonLab does not answer | the call left and nothing answered | read *Reason:*, then `tailscale status` and `TERYLON_URL` |
| no terylon server | `terylon-os` is not installed, or its server is not connected | `claude mcp list` |
| refused: not the owner | Terylon answered, but not to its owner | sign this PC into the tailnet with your own account |
| a tab says *… did not load* · *Terylon did not answer within 8 s* | the tab's calls did not finish under Desktop's 10 s bound on a press | read the debug log's `terylon-pane: loading … failed:` line, then press the tab again |

## Tests

`claude plugin test plugins/terylon-pane` runs `tests/*.test.ts` and `tests/*.test.tsx` against the engine, with no session and no network:

- A Terylon answering from memory (`tests/fixtures.ts`) records every call.
- Every view is tested on the terminal and on the desktop, colours and labels included.
- The band is held to its states, to *Open* reopening the last tab on every one of them, and to yielding to a survey; the Status tab to each state with its fix in steps; the status line to each problem, their order, what is an alert and its 60 characters.
- The pane is held to opening only when asked and only once, to one-line rows that are one Button with their kind on a title over 200 characters, to quiet empty cards, to walking from row to subject and back, and to pressing every button without one gate call.
- The S32 drawing is held too: each Desktop proof at the default the owner's walk set and switchable, no card filled and the kinds and the state as chips, every word and link on a card that waits or warns at 4.5:1 in both themes (`tests/contrast.test.ts`, computed from the canvas's palette in `tests/contrast.ts`, since the kit gives theme keys and not painted colours), no word and no theme colour inside an `Svg` and each at its own height, the compact stepper in a dock of about 435 px, no node now without a stage, the narrow dock, the pickers sending what was picked, the dashed S27 slots with no S27 button, and the band's digits tabular.

**Run it with the engine the desktop app runs.** A `claude` on `PATH` older than the desktop's may not know `plugin test`, and may refuse the module in `plugin validate` for a rule the desktop's engine no longer holds.

Two more checks live at the repository root:

- `tests/terylon-pane/mutations.test.js` plants mutations, and each must turn the tests red. It covers the done-signal, the catch-up, a refusal of Claude Code's taken for the tailnet, the debug log silenced and the reason hidden. It also covers the band ignoring a survey, the band showing the spend again or a *Fix*, *Open* forgetting the tab, the Status tab missing the fix step for a refused call, the status line counting the briefing as an alert or no longer saying the health, the pane opening by itself, a repeated notice shown each time on the machine card, `/terylon-memory` opening a second pane, a waiting count drawn calm, a row's title no longer cut, an empty card saying nothing, a pressed choice that no longer fills the answer, a gate among the pane's tools or its allow rules, the guard opened to a gate, and a waiting item approving from the pane. Since #360 also: a tab's load no longer bounded (Goals, Bell), the pane's prompts posted twice, an answer sent twice, one story said as *stories*, the phases inferred from the timeline again, *Mark handled* sending nothing, the band dropping the bell's count or never reading it again, `goal_drop` among the pane's tools, and the copied gate list losing `goal_drop`. Since S32 (#25) also: a running row with no stage drawn with a phase now, a gate in the allow rules the Status tab draws, a Desktop proof's default flipped (each of the three), a word inside an `Svg`, the band's digits no longer tabular, the narrow dock drawn as the wide pane, a picked priority or size not sent, an S27 button in the story's slot, and a row's kind and detail outside its Button. Since the owner's walk of 1.2.0: a card that waits filled again or losing its stroke, a row's kind chip losing its grey or its word drawn in the kind's colour, the story's state chip filled in its own colour, a problem's title or the waiting count amber again, the hover reveal laid over an open row, an `Svg` left to size its own box, the stepper shrinking in a dock of about 435 px, and the answer field naming a second way to send.
- `tests/terylon-pane/commands.test.js` holds every command the mod registers to a name that no skill of the mod or of `terylon-os` takes.
- `tests/terylon-pane/version.test.js` holds the version the Status tab says to the one `plugin.json` ships.

To type-check against the engine's declarations: the engine lays them in `.claude-plugin/types/` when it loads the mod from a folder it watches, and `tsc -p plugins/terylon-pane` then reads them.
