# write-pr-description — the test plan

**Checklist items in `## Test plan` (or any other checklist-style section) MUST use
unchecked markdown checkboxes `- [ ]`.** Do NOT pre-check items with `- [x]` and do NOT
substitute static glyphs (`✓`, `✅`, `🟢`, "Done", etc.) for the checkbox. Reason: a
pre-checked box is a claim nobody verified, and on at least one forge it renders as a
static tick the reviewer cannot toggle at all, which
defeats the purpose of a checklist. Even items you have already verified locally stay as
`- [ ]` — the reviewer ticks them after re-verifying on the PR. If you need to record
"already done by author", write it in prose elsewhere, not as a checklist item.

**Every test-plan item is a procedure with an expected result, never a claim about the
outcome.** The `tester` executes this list; an item with nothing in it to perform comes back
as *untestable as written* and the pull request reads as unverified even when the work was
done and checked.

```markdown
Wrong:  - [ ] tester returns in two phases and writes nothing without approval
Right:  - [ ] Dispatch the tester with no approval; assert the PR's thread count and the
              work item's comment count are unchanged and the return is AWAITING_WRITE_APPROVAL
```

The wrong form is an **acceptance criterion that wandered into a test plan**. Criteria state
outcomes and live on the work item; a test plan states runs and lives here. Writing the same
sentence in both is what makes the two lists feel duplicated, and it is the generator's fault,
not the reader's.

**Render the build's plan when there is one; reverse-engineer only when there is not.** If the
run produced `docs/terylon/plans/<slug>.md`, its per-task test cases already say what was run
and what was expected — carry those into `## Test plan`. A diff shows what changed; only the
build knows what was executed against it, so inventing the plan from the diff produces
plausible items nobody ran.

**When no plan file exists, never invent one.** The trivial and documentation routes in
`develop` skip the planner, so there is nothing to render — and a diff cannot tell you what was
run. Emit only what you can actually attest (the commands the build reports having run), and
leave the remainder to the author with the `_TBD by author_` marker this skill already uses for
template sections it cannot fill. An empty-but-honest section costs the author a few minutes; a
section of invented procedures costs the reader their trust in every checklist this marketplace
writes, because the tester will return them as *untestable as written* and the pull request will
read as unverified.

This is the same rule the verification pipeline holds itself to: a missing capability is
reported, never quietly replaced by the nearest available substitute.

**Carry across any tick you find; never regenerate over one.** Something may have ticked
items since this description was last written — a reviewer by hand, or a skill that
executed the plan and holds the exemption `forge-ops` describes. Rewriting the region as
fresh `- [ ]` would erase that, and the forge that keeps no revision history for a
description is the one that decides here: the loss cannot be recovered, so the rule binds
on both.

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
