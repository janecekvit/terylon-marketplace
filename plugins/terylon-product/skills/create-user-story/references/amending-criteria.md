# create-user-story — amending criteria after the work has started

Criteria are the input contract, and sometimes the work teaches you the contract was wrong.
Editing the field in place destroys the record of what was agreed; leaving it stale makes the
story contradict its own implementation. Neither is acceptable, so amend **visibly**.

**Never edit or delete a criterion in place.** Move it to a trailing `**Superseded**` group,
struck through and **without a checkbox**, and put the replacement in whichever group states its
outcome:

```markdown
**Transport**

- [ ] the replacement criterion, stating the outcome

**Superseded**

- ~~the old criterion, verbatim~~ - replaced by the criterion above on 2026-07-23; reason in the comment
```

The checkbox is dropped on purpose: a withdrawn criterion is not *unsatisfied*, it is
**withdrawn**, and a box invites someone to tick it. Do not wrap the whole line as
`~~- [ ] …~~` either - that breaks checkbox rendering instead of striking the text.

**Post a comment saying what changed and why.** The field can show that a criterion was
withdrawn; only the comment can say what was learned that withdrew it and which criterion took
its place. A strikethrough with no explanation is a puzzle for the next reader.

**Amend, or open a follow-up story?** The two cases look alike and want opposite answers:

| What happened | Do |
|---|---|
| an outcome the story promised **changed or turned out wrong** | amend here: strike the old, state the new |
| **new outcomes were added** - the work grew past what the story described | leave the criteria alone and open a follow-up story |

Stretching a story's criteria to cover work it explicitly excluded is how a story stops
describing anything. A pull request whose plan items map to **no** criterion is the signal for
the second row, not an invitation to add rows to the first.

**Two mechanics from `forge-ops` bite here.** Criteria stored as HTML render `~~` literally, and on
Azure DevOps the `update-work-item` operation silently drops tag-shaped `<…>` content - so scan the
criteria you are round-tripping for a literal angle bracket before writing. Both are declared in
`forge-ops`; write the criteria so they survive either forge.

**This is the product owner's act, never the tester's.** The `tester` proposes rewrites for
criteria it finds defective and applies none of them; see the criteria/test-plan convention in
`plugins/CLAUDE.md`.

`<plugin-version>` is read at runtime from `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. `<model>` is the model the run executes under (e.g. `opus-4.8`) — the skill knows it from itself, as no environment variable exposes it. `<effort>` comes from the `CLAUDE_EFFORT` environment variable (e.g. `xhigh`); **when `CLAUDE_EFFORT` is unset, omit the entire ` · <model> / <effort>` segment.** The substring `Generated with [Claude Code]` is the sentinel for prior-run detection — everything variable sits after that stable prefix.

**Formatting rules** (the same markdown rules `forge-ops` documents — load
`forge-ops` by name for the full text):

- **Acceptance criteria use unchecked `- [ ]` only** — never `- [x]` and never static glyphs (`✓`,
  `✅`, `🟢`, "Done"). A pre-checked box claims something was verified; on Azure DevOps it renders as
  a static tick the reader cannot toggle, defeating the checklist. Even criteria you believe are already
  met stay `- [ ]`.
- **No hard-wrapping** — Azure DevOps renders every source line break verbatim, so wrapping a paragraph
  or bullet at 72 / 80 chars produces choppy short lines; GitHub would forgive it, and the rule binds on
  both anyway. Emit each paragraph and each bullet as one continuous line; insert a real line break only
  between distinct paragraphs / bullets / headings.
- **Footer** — resolve `<plugin-version>` from **this skill's own**
  `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` `version` field, combined with this skill's own
  name (`create-user-story`), the model, and `CLAUDE_EFFORT` as described above. Match only the
  version-less substring `Generated with [Claude Code]` when detecting prior runs — never the full
  footer, whose trailing `@<version> · <model> / <effort>` segment varies between runs. That substring
  is the prior-run sentinel the duplicate guard (step 6) scans for.
