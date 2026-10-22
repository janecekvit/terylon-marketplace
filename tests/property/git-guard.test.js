"use strict";

//
// Properties of .claude/hooks/git-guard.js, each over generated inputs rather than a list of examples:
//
//   1  no input of any shape crashes it: it exits 0 and answers allow or a well-formed deny (fail open);
//   2  a push to main is refused however the refspec is quoted, whatever precedes it on the git
//      command line, and wherever it sits in a chain of commands;
//   3  a push of a branch that merely contains `main` is allowed, alone or in a chain;
//   4  a chain judges every segment: harmless segments alone are allowed.
//
// Each run spawns the hook, so the run counts stay modest. Run: npm ci && npm test, in tests/property/.
//

const { test, after } = require("node:test");
const assert = require("node:assert/strict");

const { loadFastCheck } = require("./load-fast-check.js");
const { runHookOnInput, runHookOnCommand, readDecision, removeScratchDirectory, scratchDirectory } = require("./run-hook.js");

const { fastCheck, skipReason } = loadFastCheck();

// How many generated cases each property runs; every case is one node process.
const RUNS_PER_PROPERTY = 150;

// The reason the hook gives when it refuses a push to main.
const PUSH_TO_MAIN_REASON = /^Refuse to push to main/;

// Every way the shell separates one command from the next, `&` (run in the background) included.
const CHAIN_SEPARATORS = ["&&", "||", ";", "|", "&", "\n"];

// Commands the guard has no reason to refuse from a directory outside any repository.
const HARMLESS_COMMANDS = ["git status", "git fetch origin", "git log --oneline -5", "echo hello", "true", "ls -la", "npm test", "git diff --stat"];

after(removeScratchDirectory);

function arbitraries()
{
    const quote = fastCheck.constantFrom("", "\"", "'");
    const quoted = (textArbitrary) => fastCheck.tuple(quote, textArbitrary).map(([mark, text]) => `${mark}${text}${mark}`);

    // A refspec whose destination is main, each part quoted on its own or the whole token at once:
    // the shell reads HEAD:"main", "HEAD:main" and HEAD:main as the same word.
    const mainRefspec = fastCheck.record(
    {
        force: fastCheck.constantFrom("", "+"),
        source: fastCheck.constantFrom("", "HEAD", "feature", "refs/heads/feature", "main"),
        destination: fastCheck.constantFrom("main", "refs/heads/main"),
        sourceQuote: quote,
        destinationQuote: quote,
        wholeQuote: quote,
    }).map((parts) =>
    {
        const source = parts.source === "" ? "" : `${parts.sourceQuote}${parts.source}${parts.sourceQuote}:`;
        const word = `${parts.force}${source}${parts.destinationQuote}${parts.destination}${parts.destinationQuote}`;

        return parts.sourceQuote === "" && parts.destinationQuote === "" ? `${parts.wholeQuote}${word}${parts.wholeQuote}` : word;
    });

    const environmentAssignments = fastCheck.array(fastCheck.constantFrom("GIT_TRACE=1", "LANG=C", "GIT_TERMINAL_PROMPT=0"), { maxLength: 2 });
    const globalOptions = fastCheck.subarray(["-C .", "-c push.default=current", "--no-pager"]);
    const pushFlags = fastCheck.subarray(["-u", "--set-upstream", "--verbose", "--dry-run", "--no-verify"]);
    const remote = quoted(fastCheck.constantFrom("origin", "upstream"));

    // A redirection's `&` joins a stream to another; it must not split the command in two.
    const redirection = fastCheck.constantFrom("", " 2>&1", " >&2", " &>/dev/null", " 2>/dev/null");

    const pushOf = (refspecArbitrary) => fastCheck.tuple(environmentAssignments, quote, globalOptions, pushFlags, remote, refspecArbitrary, redirection)
        .map(([assignments, gitQuote, options, flags, remoteName, refspec, redirect]) =>
            [...assignments, `${gitQuote}git${gitQuote}`, ...options, "push", ...flags, remoteName, refspec].join(" ") + redirect);

    // A branch name that contains `main` without being it: fix/domain-main-fix, mainline, feature/main.
    const branchContainingMain = fastCheck.tuple(
        fastCheck.stringMatching(/^[a-z][a-z0-9-]{0,8}$/),
        fastCheck.constantFrom("-main", "main-", "/main", "main/", "mainline", "-main-", "domain"),
        fastCheck.stringMatching(/^[a-z0-9-]{0,8}$/))
        .map(([prefix, middle, suffix]) => `${prefix}${middle}${suffix}`)
        .filter((branch) => !/(^|:)(refs\/heads\/)?main$/.test(branch) && branch !== "HEAD");

    const harmless = fastCheck.constantFrom(...HARMLESS_COMMANDS);
    const separator = fastCheck.constantFrom(...CHAIN_SEPARATORS);

    // Joins commands with generated separators, padded the way people type them, or not at all.
    const chainOf = (commands, separators, paddings) => commands
        .map((command, index) => index === 0 ? command : `${paddings[index - 1]}${separators[index - 1]}${paddings[index - 1]}${command}`)
        .join("");

    const chain = (segmentArbitrary) => fastCheck.array(segmentArbitrary, { minLength: 1, maxLength: 4 })
        .chain((segments) => fastCheck.tuple(
            fastCheck.constant(segments),
            fastCheck.array(separator, { minLength: segments.length, maxLength: segments.length }),
            fastCheck.array(fastCheck.constantFrom("", " ", "  "), { minLength: segments.length, maxLength: segments.length })))
        .map(([segments, separators, paddings]) => chainOf(segments, separators, paddings));

    // A push to main hidden among harmless segments, at a generated position.
    const chainWithPushToMain = fastCheck.tuple(
        fastCheck.array(harmless, { maxLength: 3 }),
        pushOf(mainRefspec),
        fastCheck.array(harmless, { maxLength: 3 }),
        fastCheck.array(separator, { minLength: 6, maxLength: 6 }),
        fastCheck.array(fastCheck.constantFrom("", " "), { minLength: 6, maxLength: 6 }))
        .map(([before, push, behind, separators, paddings]) => chainOf([...before, push, ...behind], separators, paddings));

    return {
        mainRefspec,
        pushToMain: pushOf(mainRefspec),
        pushOfBranchContainingMain: pushOf(quoted(branchContainingMain)),
        chainWithPushToMain,
        harmlessChain: chain(harmless),
        chainOfAllowedPushes: chain(fastCheck.oneof(harmless, pushOf(quoted(branchContainingMain)))),
    };
}

function assertNeutralOrDeny(result)
{
    assert.equal(result.status, 0, `exit ${result.status}, stderr: ${result.stderr}`);
    assert.notEqual(readDecision(result), "malformed", `stdout is neither empty nor a deny: ${result.stdout}`);
}

test("any stdin, of any shape, is answered with exit 0 and allow or a well-formed deny", { skip: skipReason }, () =>
{
    fastCheck.assert(
        fastCheck.property(
            fastCheck.oneof(fastCheck.string(), fastCheck.json(), fastCheck.string({ unit: "binary" })),
            (standardInput) =>
            {
                assertNeutralOrDeny(runHookOnInput(standardInput));
            }),
        { numRuns: RUNS_PER_PROPERTY });
});

test("any tool call, with any command or file path, is answered with exit 0 and allow or a well-formed deny", { skip: skipReason }, () =>
{
    const toolCall = fastCheck.record(
    {
        tool_name: fastCheck.oneof(fastCheck.constantFrom("Bash", "Edit", "Write", "Read"), fastCheck.string()),
        tool_input: fastCheck.oneof(
            fastCheck.record({ command: fastCheck.string({ unit: "grapheme" }) }),
            fastCheck.record({ file_path: fastCheck.string() }, { requiredKeys: [] }),
            fastCheck.jsonValue()),
        cwd: fastCheck.oneof(fastCheck.constant(scratchDirectory), fastCheck.string(), fastCheck.jsonValue()),
    }, { requiredKeys: [] });

    fastCheck.assert(
        fastCheck.property(toolCall, (payload) =>
        {
            assertNeutralOrDeny(runHookOnInput(JSON.stringify(payload)));
        }),
        { numRuns: RUNS_PER_PROPERTY });
});

test("a push to main is refused however its refspec is quoted and whatever precedes it", { skip: skipReason }, () =>
{
    fastCheck.assert(
        fastCheck.property(arbitraries().pushToMain, (command) =>
        {
            const decision = readDecision(runHookOnCommand(command));

            assert.ok(decision.deny && PUSH_TO_MAIN_REASON.test(decision.deny), `not refused: ${JSON.stringify(command)} → ${JSON.stringify(decision)}`);
        }),
        { numRuns: RUNS_PER_PROPERTY });
});

test("a push to main is refused wherever it sits in a chain, behind any separator", { skip: skipReason }, () =>
{
    fastCheck.assert(
        fastCheck.property(arbitraries().chainWithPushToMain, (command) =>
        {
            const decision = readDecision(runHookOnCommand(command));

            assert.ok(decision.deny && PUSH_TO_MAIN_REASON.test(decision.deny), `not refused: ${JSON.stringify(command)} → ${JSON.stringify(decision)}`);
        }),
        { numRuns: RUNS_PER_PROPERTY });
});

test("a push of a branch that merely contains `main` is allowed", { skip: skipReason }, () =>
{
    fastCheck.assert(
        fastCheck.property(arbitraries().pushOfBranchContainingMain, (command) =>
        {
            assert.equal(readDecision(runHookOnCommand(command)), "allow", JSON.stringify(command));
        }),
        { numRuns: RUNS_PER_PROPERTY });
});

test("a chain of harmless commands and allowed pushes is allowed as a whole", { skip: skipReason }, () =>
{
    fastCheck.assert(
        fastCheck.property(fastCheck.oneof(arbitraries().harmlessChain, arbitraries().chainOfAllowedPushes), (command) =>
        {
            assert.equal(readDecision(runHookOnCommand(command)), "allow", JSON.stringify(command));
        }),
        { numRuns: RUNS_PER_PROPERTY });
});
