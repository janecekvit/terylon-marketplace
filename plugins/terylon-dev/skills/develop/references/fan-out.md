# develop — fan-out over several work items

More than one work item runs the whole chain once per item, with the leaders concurrent. Nothing above changes; what follows is what only applies when N > 1.

## State is per item, all the way down

Every item carries its own `<slug>`, and every path derives from it — `docs/terylon/intake/<slug>-seed.md`, its ledger at `docs/terylon/ledgers/<slug>-ledger.md`, its worktree, its branch. Two runs must never share a seed-spec or a ledger; that is how an answer meant for one story ends up steering another.

## Sequential intakes, concurrent builds

Run **Gate 0 for every item first**, one at a time — in either mode, since both are interactive and neither can be parallelized. It is also where you learn whether two of the items collide (see below), worth knowing before any of them start building. An item that took the brainstorm mode may leave the gate as several items; those join the set and are routed with the rest.

Then create the workspaces and dispatch **every leader from one assistant message** — all the `Agent` calls together, not one message per item. That is what makes them run concurrently; separate messages run them one after another however the prose describes it.

## Handle returns as they arrive

Do **not** wait for all leaders before responding to any of them. A leader that returns `AWAITING_APPROVAL` while two others are still planning gets its gate hosted immediately, is re-dispatched, and carries on. Barriering here would spend the parallelism on waiting.

Recall the mechanic: a leader that needs something **ends its run** — it is not sitting blocked on a question. State lives in files, so folding the answer into that item's seed-spec and re-dispatching resumes it where it stopped.

## Every question names its work item

**Prefix each question with the work item it belongs to** — `#116: …`, never a bare question. With several builds live, questions arrive interleaved from different stories, and an unlabelled one gets answered in the context of whichever story the user last thought about. That is not a risk at N > 1, it is the default outcome.

The same goes for every status line, plan, and finding you surface: say which item it came from.

## Constraints that only bite here

| Constraint | Why |
|---|---|
| **Worktrees are mandatory** — `--here` is incompatible with N > 1 | Concurrent builds in one checkout overwrite each other's files. Refuse the combination rather than running it. |
| **Ten items is the hard ceiling; above five, confirm** | Each leader dispatches a developer plus four review lenses, so five items already means roughly 25 concurrent agents and ten means fifty. Past the harness's concurrency limit they queue rather than run, so the extra items buy latency, not throughput. Above five, say so and ask whether to proceed or split into batches. Above ten, refuse and propose batches — do not start a run you cannot keep legible. |
| **Items touching the same files should run sequentially** | Concurrency does not prevent the conflict, it defers it to merge time. If Gate 0 reveals an overlap, say so and offer to serialize those two. |

`--dry-run` still stops at Gate 1 — for every item, so you get N plans and no code. `--auto` skips the *pauses* only; the git rules hold per item, and consent for one item's commit is not consent for another's.
