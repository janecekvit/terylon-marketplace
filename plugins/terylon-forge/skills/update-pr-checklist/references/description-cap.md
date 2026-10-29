# update-pr-checklist — the description cap

The description is capped, and **the number is the forge's** — `forge-ops` reports it, 4000 on Azure DevOps and far more on GitHub. It is counted over the whole field, not over the part you are writing.

**The forge's cap is not the only budget on this field, and it is the looser one.** `write-pr-description` writes the same field to a smaller working budget, holding a reserve for whatever continuous integration appends afterwards. A rewrite here is normally **longer** than what it replaces, so a plan that fitted that budget when it was generated can leave it once this skill has added group headings and per-item reasons. Measured on a real run: a plan generated at 2468 UTF-16 units came back at 2662 after the rewrite — inside the forge's cap, past the budget the other skill had just kept.

**Measure against both, and say which one you are over.** Under the working budget, write and move on. Over it but inside the forge's cap, write anyway and **say so in the chat summary**, naming the two numbers — the reserve exists for a real reason and eating it silently is how a later CI append gets rejected for length. Over the forge's cap, do not write: cut by the order below and measure again.

**Count UTF-16 code units — the same unit `write-pr-description` measures against — and do not trust `wc -m` to count anything.** The cap on the side that has a small one is a .NET `nvarchar`, so the unit is what `String.Length` counts: the footer's robot emoji costs **2**, while `é`, `—` and `→` cost 1 each. A checklist carrying arrows, dashes and emoji measures longer in bytes than it is, so trimming against a byte count cuts material that would have fitted.

`wc -c` counts bytes by definition. **`wc -m` counts bytes too whenever `LANG` and `LC_ALL` are unset**, which is the common case in a tool-driven shell: it falls back to a byte count, where a run of this skill measured a four-byte emoji as 4 and returned 3246 for a string of 3243 code points. The error is in the safe direction, so it will not produce an over-cap write; it will silently trim content that fitted, which is the failure this paragraph exists to prevent.

Measure with something locale-independent:

```bash
node -e "process.stdout.write(String(require('fs').readFileSync(0,'utf8').length))" < description.md
```

JavaScript's `String.length` is UTF-16 code units, which is why the snippet reads the string rather than spreading it — spreading yields **code points**, which under-count every emoji and are the one way to pass this check while being over the real limit.

**Do not reach for `locale charmap` to decide whether `wc -m` is safe.** Measured in this repo's own environment it reported `UTF-8` while `LANG` and `LC_ALL` were both empty and `wc -m` still returned bytes — 3769 against 3765 code points for a real description. `charmap` reports a default, not the active locale, so the check that looks like it settles the question does not settle anything. Measure with the snippet above or not at all.

Both of those measurements were taken against code points, which is what this skill used to count. **The measured facts stand — `wc -m` returned bytes in both — and only the unit they were compared against changed.** Code points sit between the two: never above the byte count, never below the UTF-16 count, so the old snippet stayed safe on plain text and under-counted exactly where a description carries an emoji.

The rewrite is usually **longer** than what it replaces, since group headings and per-item reasons are added. When it does not fit, cut in this order:

1. The per-item reason on `notVerifiableHere` items — the thread carries it in full
2. The case counts beside executed items — likewise
3. The group heading prose, down to the bare heading

**Never cut a group heading, and never drop the `- [X]`/`- [ ]` state.** Losing a heading collapses three states back into two, which is the thing this skill exists to prevent.

**An item is cut only after all three cuts above are exhausted, and never silently.** It is the last resort, not a forbidden one — a plan can simply be longer than the field. When it comes to that: drop from the largest group first, name every dropped item in the thread with its state, and say in the description itself that items were omitted and where to find them. An author who cannot see that something is missing has been given a checklist that lies by omission, which is worse than a truncated one that admits it.
