# write-pr-description — verification

1. `/write-pr-description --dry-run` on a branch with 3+ commits ahead of the repo's
   integration branch. Expect: the base is detected from `origin/HEAD` (reported in the
   summary), chat output with a template-shaped description, no platform calls.
   Test-plan items are emitted as `- [ ]`, never `- [x]` or `✓`.
2. `/write-pr-description <my-PR-url> --dry-run`.
   Expect: same description, target branch read from PR metadata, no write.
3. `/write-pr-description <my-PR-url>`.
   Expect: confirmation prompt; on `push`, the `update-pr-description` operation runs;
   refreshing the PR shows the new description wrapped with the start sentinel
   `<!-- write-pr-description:start -->` and the Claude Code footer.
4. Re-run step 3.
   Expect: sentinel detected → only the marked region is rewritten on `push`. Any content
   before the sentinel or after the footer (e.g. CI preview links the deploy bot posted in
   the meantime) survives intact.
   **Then test the gap explicitly:** run again, and while the skill waits for `push`, edit
   the PR description in the browser to append a line after the footer. Say `push`. Expect
   the appended line to survive — it only does if step 7 re-fetched rather than reusing the
   step-2 snapshot.
   **And test the cap:** on a branch large enough that the generated description exceeds
   the forge's cap, expect the skill to report which sections it dropped and to write
   successfully, rather than failing on `too_big`. The Test plan and the footer survive.
5. `/write-pr-description <my-PR-url> --auto` on a PR whose description contains a
   CI-posted block (preview links, connection strings) and no sentinel.
   Expect: the Claude region is **appended** to the existing content, preceded by a blank
   line. The CI block at the top is untouched. No `overwrite` prompt.
6. Legacy compatibility — re-run on a PR whose description carries only the older footer
   without a sentinel.
   Expect: whole description is replaced with the new sentinel-wrapped region (treated as
   legacy Claude-only content).
7. **Test-plan shape.** Every generated `## Test plan` item names a run and its expected result.
   No item is an outcome claim ("the tester writes nothing without approval") — that shape is an
   acceptance criterion and belongs on the work item, and the `tester` returns it as *untestable
   as written*.
8. **No invented procedures.** On a branch whose run produced no `docs/terylon/plans/<slug>.md`
   (the trivial or documentation route), the section carries only what the build reports having
   run, and the remainder is marked `_TBD by author_`. Expect **no** plausible-looking procedure
   reverse-engineered from the diff. On a branch that *did* produce a plan file, expect its
   per-task test cases to appear rather than a fresh set derived from the diff.

> **See also:** `create-pr` for opening the pull request this description goes into, `review-pr` for the review pass, `address-pr-comments` for the inbound direction.
