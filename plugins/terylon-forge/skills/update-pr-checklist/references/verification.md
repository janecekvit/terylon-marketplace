# update-pr-checklist — verification

1. **Read:** given a PR URL, the items come back from the test plan with the scope named — the sentinel region, or the section standing alone. No write tool is called and nothing is dispatched; this skill has no `Agent` and must not acquire one.
2. **Read, no plan:** a PR with no `## Test plan` reports that there is nothing to read, and invents none.
3. **`--dry-run`:** the three groups are printed, nothing is written, and no `update-pr-description` write is made.
4. **Write:** the evidence thread appears **first**, then the plan is rewritten inside the selected scope, and content before the sentinel and after the footer survives.
5. **Hand-written plan, no sentinel:** the section is rewritten and nothing else in the field is touched — no sentinel is added.
6. **Ticking discipline:** every `- [X]` left behind corresponds to an item the result marks executed and passed, with a `covering` bearing on it. A green run with an empty or unrelated `covering` produces no tick.
7. **A tick with nothing behind it** moves to the right group, shows unticked, and is named explicitly in the thread — never removed silently.
8. **A tick over a failing item** is reported as a finding, not quietly reorganized.
9. **Reconciliation:** with one item added, one edited and one ticked in the browser during the wait, the added item survives unticked, the edited one returns to `- [ ]`, a browser tick is superseded only where the result has evidence, and all three are named.
10. **Idempotence:** a second run over an unchanged branch produces an identical description and one further thread reply, not re-appended annotations.
11. **Prior-run detection:** the second run replies in the first run's thread rather than opening another.
12. **Cap:** on a plan that does not fit, reasons and counts are cut first and every group heading survives; if items must go, they are named in the thread **and** the description says items were omitted.
13. **Untestable items** stay unticked and in place, with the proposed rewrite in the thread and not in the description.
14. **Eligibility:** a PR completed or abandoned between the first fetch and the write is not written to.
