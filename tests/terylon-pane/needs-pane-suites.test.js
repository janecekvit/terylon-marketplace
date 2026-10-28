// The script that decides whether CI runs the pane's mutation and zone suites (#42): both directions, the push, the
// empty diff, and the command line end to end. Free, milliseconds.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fileSystem = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { decide, parseChangedPaths, readArguments } = require("./needs-pane-suites.js");

const SCRIPT = path.join(__dirname, "needs-pane-suites.js");

function pullRequest(changedPaths)
{
    return decide({ event: "pull_request", changedPaths });
}

test("a pull request touching any pane path runs the suites", () =>
{
    const touching = [
        "plugins/terylon-pane/hooks/register.tsx",
        "plugins/terylon-pane/.claude-plugin/plugin.json",
        "tests/terylon-pane/mutations.js",
        "tests/terylon-pane/shard.js",
        "tests/terylon-pane/needs-pane-suites.js",
        ".github/claude-code/package-lock.json",
        ".github/workflows/ci.yml",
    ];

    for (const changedPath of touching)
    {
        const decision = pullRequest(["README.md", changedPath]);

        assert.equal(decision.run, true, changedPath);
        assert.match(decision.reason, new RegExp(changedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
});

test("a pull request touching nothing the suites see skips them", () =>
{
    const untouching = [
        "README.md",
        "CLAUDE.md",
        "docs/architecture/README.md",
        "plugins/terylon-os/README.md",
        "plugins/terylon-pane-other/file.ts",
        "tests/terylon-os/terylon-os-plugin.test.js",
        ".github/workflows/docs.yml",
        ".github/workflows/ci.yml.bak",
        ".github/claude-code-other/package.json",
    ];
    const decision = pullRequest(untouching);

    assert.equal(decision.run, false);
    assert.match(decision.reason, /none of the 9 changed files/);
});

test("the reason counts the other pane files", () =>
{
    const decision = pullRequest(["plugins/terylon-pane/a.ts", "plugins/terylon-pane/b.ts", "tests/terylon-pane/c.js"]);

    assert.match(decision.reason, /plugins\/terylon-pane\/a\.ts and 2 more/);
});

test("a pull request with an empty diff skips them", () =>
{
    const decision = pullRequest([]);

    assert.equal(decision.run, false);
    assert.match(decision.reason, /changes no file/);
});

test("a push to main always runs them, whatever changed", () =>
{
    assert.equal(decide({ event: "push", changedPaths: [] }).run, true);
    assert.equal(decide({ event: "push", changedPaths: ["README.md"] }).run, true);
    assert.equal(decide({ event: "workflow_dispatch", changedPaths: [] }).run, true);
});

test("changed paths are read one per line, blank lines and CRs dropped", () =>
{
    assert.deepEqual(parseChangedPaths("a/b.js\r\n\nc.md\n"), ["a/b.js", "c.md"]);
    assert.deepEqual(parseChangedPaths(""), []);
});

test("a pull request without its changed paths is refused, not judged empty", () =>
{
    assert.throws(() => readArguments(["--event", "pull_request"]), /needs --changed/);
    assert.throws(() => readArguments([]), /--event is required/);
    assert.throws(() => readArguments(["--event"]), /usage/);
    assert.throws(() => readArguments(["--base", "x"]), /usage/);
    assert.deepEqual(readArguments(["--event", "push"]), { event: "push" });
});

test("the command line prints one line and writes run= to GITHUB_OUTPUT", () =>
{
    const directory = fileSystem.mkdtempSync(path.join(os.tmpdir(), "needs-pane-suites-"));
    const changed = path.join(directory, "changed.txt");
    const output = path.join(directory, "output.txt");

    try
    {
        fileSystem.writeFileSync(changed, "README.md\ndocs/README.md\n");
        const skipped = spawnSync(process.execPath, [SCRIPT, "--event", "pull_request", "--changed", changed],
            { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: output } });

        assert.equal(skipped.status, 0, skipped.stderr);
        assert.equal(skipped.stdout, "skip the mutation and zone suites: none of the 2 changed files is one the suites can see\n");

        fileSystem.writeFileSync(changed, "plugins/terylon-pane/hooks/register.tsx\n");
        const ran = spawnSync(process.execPath, [SCRIPT, "--event", "pull_request", "--changed", changed],
            { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: output } });

        assert.equal(ran.status, 0, ran.stderr);
        assert.match(ran.stdout, /^run the mutation and zone suites: /);
        assert.equal(fileSystem.readFileSync(output, "utf8"), "run=false\nrun=true\n");

        const refused = spawnSync(process.execPath, [SCRIPT, "--event", "pull_request"], { encoding: "utf8" });

        assert.notEqual(refused.status, 0);
    }
    finally
    {
        fileSystem.rmSync(directory, { recursive: true, force: true });
    }
});
