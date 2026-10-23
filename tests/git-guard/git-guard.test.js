"use strict";

//
// The PreToolUse guard of .claude/hooks/git-guard.js, in both directions: it refuses what lands on main
// and passes everything else. Run: node --test tests/git-guard/git-guard.test.js
//
// Every case runs the hook as Claude Code does — a JSON payload on stdin, a separate process — against
// real throwaway repositories: a checkout on main, a linked worktree on a feature branch, and two clones
// on feature branches, one of them in a directory whose name has a space.
//

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const HOOK_PATH = path.join(__dirname, "..", "..", ".claude", "hooks", "git-guard.js");

// A throwaway repository's commits need an author; passed per command, so no git config is touched.
const FIXTURE_AUTHOR = ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "-c", "commit.gpgsign=false"];

// The branch name pushed to in the refusal cases; spelled once so the intent is greppable.
const MAIN_BRANCH = "main";

const fixture = {};

function runGit(directory, ...gitArguments)
{
    childProcess.execFileSync("git", [...FIXTURE_AUTHOR, ...gitArguments], { cwd: directory, stdio: "ignore" });
}

/**
 * Run the hook on one payload. Returns the refusal reason, or null when the call is allowed.
 * `environment` is laid over a copy of the test's own, so a variable the case needs is set and
 * nothing else changes.
 */
function runHook(payloadText, environment = {})
{
    const result = childProcess.spawnSync(process.execPath, [HOOK_PATH],
    {
        input: payloadText,
        env: { ...process.env, ...environment },
        encoding: "utf8",
    });

    assert.equal(result.status, 0, `the hook must always exit 0, stderr: ${result.stderr}`);

    if (result.stdout === "")
    {
        return null;
    }

    const response = JSON.parse(result.stdout);

    assert.equal(response.hookSpecificOutput.permissionDecision, "deny");

    return response.hookSpecificOutput.permissionDecisionReason;
}

function judgeBash(command, workingDirectory, environment = {})
{
    return runHook(JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd: workingDirectory }), environment);
}

before(() =>
{
    fixture.root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "git-guard-")));
    fixture.main = path.join(fixture.root, "main");
    fixture.worktree = path.join(fixture.root, "worktree");
    fixture.scratch = path.join(fixture.root, "scratch");
    fixture.spaced = path.join(fixture.root, "scratch clone");

    fs.mkdirSync(fixture.main);
    runGit(fixture.main, "init", "--quiet", "--initial-branch", MAIN_BRANCH);
    runGit(fixture.main, "commit", "--quiet", "--allow-empty", "--message", "initial");
    runGit(fixture.main, "worktree", "add", "--quiet", "-b", "feat/linked", fixture.worktree);

    runGit(fixture.root, "clone", "--quiet", fixture.main, fixture.scratch);
    runGit(fixture.scratch, "switch", "--quiet", "--create", "ci/harden-and-scan");

    runGit(fixture.root, "clone", "--quiet", fixture.main, fixture.spaced);
    runGit(fixture.spaced, "switch", "--quiet", "--create", "fix/domain-main-fix");
});

after(() =>
{
    fs.rmSync(fixture.root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// It refuses what lands on main.
// ---------------------------------------------------------------------------

test("a commit in the checkout on main is refused", () =>
{
    assert.match(judgeBash("git commit -m change", fixture.main), /Refuse to commit on main/);
});

test("Edit and Write in the checkout on main are refused", () =>
{
    for (const toolName of ["Edit", "Write"])
    {
        const payload = JSON.stringify({ tool_name: toolName, tool_input: { file_path: path.join(fixture.main, "file.txt") } });

        assert.match(runHook(payload), /Refuse to modify files while on main/);
    }
});

test("a cd into the checkout on main moves the commit there", () =>
{
    assert.match(judgeBash(`cd "${fixture.main}" && git commit -m change`, fixture.worktree), /Refuse to commit on main/);
    assert.match(judgeBash(`git -C "${fixture.main}" commit -m change`, fixture.worktree), /Refuse to commit on main/);
});

test("a variable that expands to the checkout on main is followed there too", () =>
{
    const environment = { MAIN_CHECKOUT: fixture.main };

    assert.match(judgeBash("git -C \"$MAIN_CHECKOUT\" commit -m change", fixture.worktree, environment), /Refuse to commit on main/);
    assert.match(judgeBash("cd \"${MAIN_CHECKOUT}\" && git commit -m change", fixture.worktree, environment), /Refuse to commit on main/);
    assert.match(judgeBash("git -C \"%MAIN_CHECKOUT%\" commit -m change", fixture.worktree, environment), /Refuse to commit on main/);
    assert.match(judgeBash(`P="${fixture.main}" && git -C "$P" commit -m change`, fixture.worktree), /Refuse to commit on main/);
    assert.match(judgeBash(`export P="${fixture.main}"; cd "$P"; git commit -m change`, fixture.worktree), /Refuse to commit on main/);
});

test("a push naming main is refused from any branch and any directory", () =>
{
    for (const refspec of [MAIN_BRANCH, `HEAD:${MAIN_BRANCH}`, `"${MAIN_BRANCH}"`, `refs/heads/${MAIN_BRANCH}`])
    {
        assert.match(judgeBash(`git push origin ${refspec}`, fixture.worktree), /Refuse to push to main/, refspec);
    }

    assert.match(judgeBash(`cd "$UNSET_DIRECTORY" && git push origin ${MAIN_BRANCH}`, fixture.worktree), /Refuse to push to main/);
    assert.match(judgeBash(`git push origin HEAD:"${MAIN_BRANCH}"`, fixture.worktree), /Refuse to push to main/);
    assert.match(judgeBash("git push origin ma'in'", fixture.worktree), /Refuse to push to main/);
    assert.match(judgeBash(`true & git push origin ${MAIN_BRANCH}`, fixture.worktree), /Refuse to push to main/);
    assert.match(judgeBash("git push --all origin", fixture.worktree), /Refuse to push to main/);
});

test("a push of HEAD, or with no refspec, from the checkout on main is refused", () =>
{
    assert.match(judgeBash("git push origin HEAD", fixture.main), /Refuse to push to main/);
    assert.match(judgeBash("git push", fixture.main), /Refuse to push to main/);
});

test("a force push is refused without consent", () =>
{
    assert.match(judgeBash("git push --force origin feat/linked", fixture.worktree), /Refuse to force-push/);
    assert.match(judgeBash("git push origin +feat/linked", fixture.worktree), /Refuse to force-push/);
});

test("an unresolvable target from a session on main is refused, and the refusal names the target", () =>
{
    const unsetReason = judgeBash("git -C \"$UNSET_DIRECTORY\" commit -m change", fixture.main);

    assert.match(unsetReason, /Refuse to commit on main/);
    assert.match(unsetReason, /could not be resolved: \$UNSET_DIRECTORY/);
    assert.match(unsetReason, /literal path/);

    const substitutionReason = judgeBash("cd \"$(git rev-parse --show-toplevel)\" && git push origin HEAD", fixture.main);

    assert.match(substitutionReason, /Refuse to push to main/);
    assert.match(substitutionReason, /could not be resolved: \$\(git rev-parse --show-toplevel\)/);

    const missingReason = judgeBash("cd no-such-directory && git commit -m change", fixture.main);

    assert.match(missingReason, /could not be resolved: no-such-directory/);
    assert.match(missingReason, /does not exist/);
});

test("a refusal judged by the operation's own directory carries no unresolved-target note", () =>
{
    assert.doesNotMatch(judgeBash("git commit -m change", fixture.main), /could not be resolved/);
});

// ---------------------------------------------------------------------------
// It passes everything else.
// ---------------------------------------------------------------------------

test("a commit in a scratch clone named by a variable passes from a session on main", () =>
{
    const environment = { SCRATCH: fixture.scratch, TEMP: fixture.root };

    assert.equal(judgeBash("cd \"$TEMP/scratch\" && git commit -m change", fixture.main, environment), null);
    assert.equal(judgeBash("git -C \"$SCRATCH\" commit -m change", fixture.main, environment), null);
    assert.equal(judgeBash("git -C \"${SCRATCH}\" commit -m change", fixture.main, environment), null);
    assert.equal(judgeBash("git -C %SCRATCH% commit -m change", fixture.main, environment), null);
    assert.equal(judgeBash("git --git-dir=\"$SCRATCH/.git\" commit -m change", fixture.main, environment), null);
});

test("a variable assigned earlier in the same command is expanded", () =>
{
    assert.equal(judgeBash(`P="${fixture.scratch}" && git -C "$P" commit -m change`, fixture.main), null);
    assert.equal(judgeBash(`export P="${fixture.scratch}" && cd "$P" && git commit -m change`, fixture.main), null);
    assert.equal(judgeBash(`ROOT="${fixture.root}"; P="$ROOT/scratch"; git -C "$P" commit -m change`, fixture.main), null);
});

test("a leading ~ is the home directory", () =>
{
    const environment = { HOME: fixture.root, USERPROFILE: fixture.root };

    assert.equal(judgeBash("cd ~/scratch && git commit -m change", fixture.main, environment), null);
    assert.equal(judgeBash("git -C ~/scratch commit -m change", fixture.main, environment), null);
});

test("a quoted path with a space names one directory", () =>
{
    assert.equal(judgeBash(`cd "${fixture.spaced}" && git commit -m "a message with spaces"`, fixture.main), null);
    assert.equal(judgeBash(`git -C '${fixture.spaced}' push origin HEAD`, fixture.main), null);
});

test("a push of HEAD from a linked worktree on a feature branch passes from a session in the main checkout", () =>
{
    assert.equal(judgeBash(`cd "${fixture.worktree}" && git push origin HEAD`, fixture.main), null);
    assert.equal(judgeBash("cd ../worktree && git push origin HEAD", fixture.main), null);
    assert.equal(judgeBash("git push -u origin HEAD", fixture.worktree), null);
});

test("a redirection is not mistaken for a separator", () =>
{
    assert.equal(judgeBash("git push origin HEAD 2>&1", fixture.worktree), null);
    assert.equal(judgeBash("git commit -m change >&2", fixture.worktree), null);
    assert.equal(judgeBash("git commit -m change &> /dev/null", fixture.worktree), null);
});

test("an unresolvable target passes when the session's directory is on a feature branch", () =>
{
    assert.equal(judgeBash("git -C \"$UNSET_DIRECTORY\" commit -m change", fixture.worktree), null);
    assert.equal(judgeBash("cd \"$(pwd)\" && git push origin HEAD", fixture.worktree), null);
});

test("a branch whose name merely contains main is pushable", () =>
{
    assert.equal(judgeBash("git push origin fix/domain-main-fix", fixture.spaced), null);
});

test("commands that are not commits or pushes pass, even on main", () =>
{
    assert.equal(judgeBash("git status && git log --oneline -3", fixture.main), null);
    assert.equal(judgeBash("cd \"$UNSET_DIRECTORY\" && ls", fixture.main), null);
});

test("Edit and Write in a linked worktree on a feature branch pass", () =>
{
    const payload = JSON.stringify({ tool_name: "Write", tool_input: { file_path: path.join(fixture.worktree, "new", "file.txt") } });

    assert.equal(runHook(payload), null);
});

test("malformed or empty input fails open", () =>
{
    assert.equal(runHook(""), null);
    assert.equal(runHook("{ not json"), null);
    assert.equal(runHook(JSON.stringify({ tool_name: "Bash" })), null);
});
