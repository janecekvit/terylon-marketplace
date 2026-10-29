# write-pr-description — the reduction ladder

Over budget? Apply these **in order**, re-measuring after each rung, and stop at the first that fits. The order is fixed so two runs on the same diff produce the same output.

1. Drop any diff-stat, commit list, or file enumeration.
2. Collapse file-scoped bullets into their theme, naming at most the 2 load-bearing paths.
3. Drop the third sub-header, merging at most one of its bullets into the nearest survivor.
4. Rewrite over-long bullets down to 150 characters, longest first — cut the justification clause, keep verb, object and location.
5. Drop the lowest-value bullets, last-in-section first, until **Changes** has 5. Never below 2.
6. Cut **Test plan** to 3 — keep what a reviewer cannot infer: the risky path, the regression, the manual step. Never below 1.
7. Cut the summary to one sentence, 200 characters.
8. Drop whole sections the repo template did not ask for, heading included.
9. Reduce each remaining group to a single one-line bullet, 3 lines total.
10. Floor shape: sentinel, summary, one sentence, footer.
11. Still over — do not post; fall back to the `B_eff < FLOOR` behaviour in 8a.

**Invariants no rung may break:**

- **Never drop the sentinel or the footer.** The next run needs both to find the region; losing either makes it append a duplicate instead of replacing.
- **Never truncate mid-anything.** Reduction means rewriting a unit or removing a whole unit, never slicing a string. No half sentences, no dangling `[link](`, no unclosed backtick, no trailing ellipsis.
- **Never leave a dangling heading** — removing a section's last bullet removes its heading too, unless the repo template mandates the section, which then keeps `_TBD by author_`.
- **Never cut foreign content.** It is not ours; the budget bends around it.

Then write the description via the `forge-ops` update recipe, and print confirmation with a link to the PR **and the region's measured length against `B_eff`**.
