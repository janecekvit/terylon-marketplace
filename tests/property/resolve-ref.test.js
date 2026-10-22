"use strict";

//
// Properties of the harness's ref resolution, tests/e2e/lib/ref.js, over generated git answers:
//
//   1  an explicit, non-empty --ref is the ref, whatever it is, and git is never consulted;
//   2  on a branch, the branch git names is the ref, after one question to git;
//   3  a detached HEAD is never passed on as a ref: the answer is one line of error naming each
//      branch that points at HEAD exactly once, without its origin/ prefix, and never git's own
//      "(no branch)" or a remote's HEAD.
//
// Run: npm ci && npm test, in tests/property/.
//

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { loadFastCheck } = require("./load-fast-check.js");
const { resolveRef } = require("../e2e/lib/ref.js");

const { fastCheck, skipReason } = loadFastCheck();

// Pure functions: thousands of cases cost well under a second.
const RUNS_PER_PROPERTY = 2000;

// What `git rev-parse --abbrev-ref HEAD` prints on a detached HEAD.
const DETACHED = "HEAD";

// A stand-in for git that answers from a table and records every question.
function recordingGit(answers)
{
    const questions = [];
    const git = (argumentList) =>
    {
        questions.push(argumentList.join(" "));

        return answers[argumentList[0] === "branch" ? "branch" : argumentList[1]] ?? "";
    };

    return { git, questions };
}

function arbitraries()
{
    // A branch name as git prints it: no whitespace, no newline, never starting with "(".
    const branchName = fastCheck.stringMatching(/^[A-Za-z0-9._-]{1,12}(\/[A-Za-z0-9._-]{1,12}){0,2}$/);
    const commitId = fastCheck.stringMatching(/^[0-9a-f]{7,12}$/);

    // A line of `git branch --all --points-at HEAD`: a branch, its remote copy, a remote HEAD, or git
    // naming the detached state itself; padded the way git pads it.
    const branchLine = fastCheck.tuple(
        fastCheck.oneof(
            branchName,
            branchName.map((name) => `origin/${name}`),
            fastCheck.constantFrom("origin/HEAD", "(no branch)"),
            commitId.map((commit) => `(HEAD detached at ${commit})`)),
        fastCheck.constantFrom("", " ", "  "))
        .map(([line, padding]) => `${padding}${line}`);

    return { branchName, commitId, branchLine };
}

test("an explicit --ref is the ref, and git is never consulted", { skip: skipReason }, () =>
{
    fastCheck.assert(
        fastCheck.property(fastCheck.string({ minLength: 1 }), (explicitRef) =>
        {
            const { git, questions } = recordingGit({});

            assert.deepEqual(resolveRef({ explicitRef, git }), { ref: explicitRef });
            assert.deepEqual(questions, []);
        }),
        { numRuns: RUNS_PER_PROPERTY });
});

test("on a branch, that branch is the ref, after one question to git", { skip: skipReason }, () =>
{
    const { branchName } = arbitraries();

    fastCheck.assert(
        fastCheck.property(branchName.filter((name) => name !== DETACHED), fastCheck.constantFrom(undefined, ""), (current, explicitRef) =>
        {
            const { git, questions } = recordingGit({ "--abbrev-ref": current });

            assert.deepEqual(resolveRef({ explicitRef, git }), { ref: current });
            assert.equal(questions.length, 1);
        }),
        { numRuns: RUNS_PER_PROPERTY });
});

test("a detached HEAD is refused in one line that names each branch pointing at it once", { skip: skipReason }, () =>
{
    const { commitId, branchLine } = arbitraries();

    fastCheck.assert(
        fastCheck.property(commitId, fastCheck.array(branchLine, { maxLength: 8 }), fastCheck.constantFrom(DETACHED, ""), (commit, lines, current) =>
        {
            const { git } = recordingGit({ "--abbrev-ref": current, "--short": commit, branch: `${lines.join("\n")}\n` });
            const result = resolveRef({ git });

            assert.equal(result.ref, undefined, "a detached HEAD is never a ref");
            assert.equal(result.error.split("\n").length, 1, "one line");
            assert.ok(result.error.startsWith(`detached HEAD at ${commit}: pass --ref`), result.error);

            const expectedNames = [...new Set(lines
                .map((line) => line.trim())
                .filter((line) => !line.startsWith("(") && !line.endsWith("/HEAD"))
                .map((line) => line.replace(/^origin\//, "")))];
            const namedRefs = [...result.error.matchAll(/--ref (\S+)/g)].map((match) => match[1]).filter((name) => name !== "<branch-or-tag>;");

            assert.deepEqual(namedRefs, expectedNames);
        }),
        { numRuns: RUNS_PER_PROPERTY });
});
