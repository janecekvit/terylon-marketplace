# create-user-story — verification

1. `/create-user-story "<brief>" --parent=<known Feature> --dry-run` inside a product repo.
   Expect: a draft matching the Output template printed to chat with **real file anchors** in `## Implementation`,
   `- [ ]` acceptance criteria, an `## Out of scope` section, and the footer. No work item created
   (the parent Feature's child count is unchanged); no `create-work-item` / `link-work-item-parent` call.
2. `/create-user-story "<brief>" --parent=<known Feature>` (default) → confirm prompt.
   On `push`: a User Story is created with a Markdown description, the parent's `planning` where the
   forge carries it, and **linked as a child of the parent Feature** (verify the story's parent is the
   Feature, not the reverse). The new id + URL is printed.
3. Footer identity — the created story's footer reads `create-user-story@<terylon-product version>`,
   resolved in this plugin's own `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`.
4. Duplicate guard — re-run step 2 against the same Feature with the same title. Expect: the existing
   AI-drafted child (footer sentinel) is detected and the skill asks before creating a duplicate.
5. Checkbox rendering — open the created story: the acceptance criteria appear as **interactive
   checkboxes**, not plain bullets, on either forge. Re-fetch via `forge-ops` `fetch-work-item` and
   confirm `acceptanceCriteria` comes back as the checklist that was sent, in markdown. If they render as
   plain bullets, the item was written outside the recipe (see Common mistakes).
6. **A forge that does not carry a key** — on GitHub, pass `--story-points=5`. Expect the draft to name
   `planning` and `estimate` as not carried before the confirmation prompt, and the created issue to
   carry no invented label or milestone for either.
7. **Criteria state outcomes, not implementations.** Read every generated criterion back: none
   names a component, a file path, a command or a flag. A criterion saying "the tester invokes
   `measure-token-spend` and writes `docs/…/<session>-tokens.md`" is a defect even when it is
   true on the day it is written, because the next refactor moves the call and the criterion
   then contradicts working code. The equivalent outcome — "the run's token spend is reported
   per tier and written to the session's monitoring file" — survives the move.
