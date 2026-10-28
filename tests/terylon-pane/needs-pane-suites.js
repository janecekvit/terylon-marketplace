// Whether CI must run the terylon-pane mod's mutation and zone suites (#42). Together they are about a hundred runs of
// `claude plugin test`, and most pull requests touch nothing they can see: such a pull request skips them, while
// `plugin validate` and `plugin test` still run on every one. A push to main, or a run started by hand, always runs.
//
//   git diff --name-only <base>...<head> > changed.txt
//   node tests/terylon-pane/needs-pane-suites.js --event pull_request --changed changed.txt
//
// Prints one line, the answer and why. Under GitHub Actions it also writes run=true or run=false to GITHUB_OUTPUT.
"use strict";

const fileSystem = require("node:fs");

// What the two suites can see: the mod; their own files, helpers and this script among them; the Claude Code that
// runs them; and the workflow that runs them. The suites import nothing else (node:* modules and their siblings).
// A path ending in "/" is a directory and covers everything under it; any other is one file.
const PANE_PATHS = [
    "plugins/terylon-pane/",
    "tests/terylon-pane/",
    ".github/claude-code/",
    ".github/workflows/ci.yml",
];

// The one event judged by its changed paths. Every other — a push to main, workflow_dispatch — runs the suites.
const PULL_REQUEST_EVENT = "pull_request";

function touchesPane(changedPath)
{
    return PANE_PATHS.some(panePath => (panePath.endsWith("/") ? changedPath.startsWith(panePath) : changedPath === panePath));
}

// Returns { run, reason }: whether the suites must run, and why, in one line.
function decide({ event, changedPaths })
{
    if (event !== PULL_REQUEST_EVENT)
    {
        return { run: true, reason: `a ${event} event always runs the suites in full` };
    }

    const touching = changedPaths.filter(touchesPane);

    if (touching.length > 0)
    {
        const more = touching.length > 1 ? ` and ${touching.length - 1} more` : "";

        return { run: true, reason: `the pull request changes ${touching[0]}${more}, which the suites can see` };
    }

    if (changedPaths.length === 0)
    {
        return { run: false, reason: "the pull request changes no file, so nothing the suites see" };
    }

    return { run: false, reason: `none of the ${changedPaths.length} changed files is one the suites can see` };
}

// One path per line, as git diff --name-only writes them; blank lines and a trailing CR are dropped.
function parseChangedPaths(text)
{
    return text.split("\n").map(line => line.replace(/\r$/, "")).filter(line => line !== "");
}

function readArguments(argumentList)
{
    const parsed = {};

    for (let position = 0; position < argumentList.length; position += 2)
    {
        const name = argumentList[position];
        const value = argumentList[position + 1];

        if ((name !== "--event" && name !== "--changed") || value === undefined)
        {
            throw new Error(`usage: needs-pane-suites.js --event <name> [--changed <file of paths>]; got ${JSON.stringify(name)}`);
        }

        parsed[name.slice(2)] = value;
    }

    if (parsed.event === undefined)
    {
        throw new Error("usage: needs-pane-suites.js --event <name> [--changed <file of paths>]; --event is required");
    }

    if (parsed.event === PULL_REQUEST_EVENT && parsed.changed === undefined)
    {
        throw new Error("a pull_request event needs --changed: without its paths there is nothing to judge");
    }

    return parsed;
}

function main()
{
    const parsed = readArguments(process.argv.slice(2));
    const changedPaths = parsed.changed === undefined ? [] : parseChangedPaths(fileSystem.readFileSync(parsed.changed, "utf8"));
    const decision = decide({ event: parsed.event, changedPaths });

    console.log(`${decision.run ? "run" : "skip"} the mutation and zone suites: ${decision.reason}`);

    if (process.env.GITHUB_OUTPUT)
    {
        fileSystem.appendFileSync(process.env.GITHUB_OUTPUT, `run=${decision.run}\n`);
    }
}

if (require.main === module)
{
    main();
}

module.exports = { PANE_PATHS, decide, parseChangedPaths, readArguments };
