# terylon-pane

**The Terylon pane in Claude Desktop** — a mod: a hooks module (`hooks/register.tsx`) the engine runs in a session, drawing one pane beside the transcript. It shows, asks and posts; **it never approves**. Built to the approved S15 canvas (#331), with its copy in Czech, the owner's language; story titles stay as filed.

## Audience

The owner of a Terylon, in a **local** session on the PC: the desktop app's Code tab, or a terminal. It requires the plugin `terylon-os`, which brings the `/mcp` server it reads — `dependencies` installs it. An SSH or Remote Control session needs no mod at all: the plugin's skills and tools do everything the pane does, asked in words.

## What it does

```text
                                                                        as of #332

  every 30 s ──▶ terylon /mcp: briefing · work_in_flight · stories_list · events_since
       │           through ONE allow-list (hooks/terylon.ts) that refuses every gate tool
       ├──▶ the pane: ČEKÁ NA TEBE · BĚŽÍ · VE FRONTĚ · HOTOVO DNES, each decision a Link
       ├──▶ the done-signal: $.prompt.submit ONCE per story and verdict commit, and a toast
       └──▶ the status line: "Terylon · 3 běží · 2 čekají"
  session start, away > 2 h ──▶ ONE catch-up summary and a band; > 2 000 events: a link instead
  Přidat ──▶ tasks_add ──▶ a plan that WAITS for the owner in the console
  Paměť  ──▶ memory_get; an edit is memory_propose ──▶ CONFIRMED in the console's memory gate
```

| Screen | From the canvas |
|---|---|
| The queue: waiting for you, running with step and cost, queued or held with the reason, done today | Main |
| One running story: step n of m, cost against budget, the run's question, *Shrň mi to v session* | Story |
| Adding a task: title, criteria, goal, after; sending, added, refused, no answer in 10 s, paused | Add (A–D) |
| No server, empty, unreachable and stale, refused, Terylon's error, too far behind | Empty-Error (E–H) |
| The done-signal and the catch-up summary posted into the session | DoneSignal, CatchUp |
| The phone (no `Input`): a read-only queue, and *Přidat úkol…* posts a request into the session | Phone-Remote-Pane, -Add |
| The leader's memory, an edit proposed and confirmed in the console | added by the owner on #331 |

**The done-signal** goes into the session once per story and verdict commit (kept in `$.store`; a new commit is a new signal), for a story verified and waiting for its merge, merged, accepted, abandoned, blocked or stuck. `$.prompt.submit` queues it as a turn of its own once the session is idle, so it never interrupts a running turn; the pane need not be open. A disabled mod posts nothing, and the catch-up summary covers the gap.

**The catch-up summary** is posted once on a return after more than two hours away: done, waiting for you, running, stuck, spend — transitions only, never a brief, a specification or a memory text. The signals of the gap are inside it, not posted on their own. More than 2 000 events behind, the pane posts nothing and the band links the console's history.

## Setup

`terylon-os` must reach your Terylon — set `TERYLON_URL` as its README says. Then, at a terminal prompt:

```text
/plugin install terylon-pane@terylon
```

A mod installed at the user scope from a terminal loads in the desktop app's local sessions too. Open the pane with `/terylon` and the memory with `/terylon-memory`.

## Tests

`claude plugin test plugins/terylon-pane` runs `tests/*.test.ts` against the engine with no session and no network: a Terylon answering from memory (`tests/fixtures.ts`) records every call. `tests/terylon-pane/mutations.test.js`, at the repository root, plants mutations — the done-signal removed, the catch-up removed, the guard opened to a gate, a waiting item approving from the pane — and each must turn those tests red.

Type-check against the engine's declarations: the engine lays them in `.claude-plugin/types/` when it loads the mod from a folder it watches, and `tsc -p plugins/terylon-pane` then reads them.
