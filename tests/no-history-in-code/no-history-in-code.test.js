// The no-history-in-code check: what it flags, what it leaves alone, and that it warns without failing.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fileSystem = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { addedLines, annotation, findHistory, main } = require("./no-history-in-code.js");

const SCRIPT = path.join(__dirname, "no-history-in-code.js");

// A zero-context diff that adds the given lines to one file, from line 10.
function diffAdding(file, lines)
{
    return [
        `diff --git a/${file} b/${file}`,
        `--- a/${file}`,
        `+++ b/${file}`,
        `@@ -9,0 +10,${lines.length} @@`,
        ...lines.map((line) => `+${line}`),
        "",
    ].join("\n");
}

function flaggedLines(file, lines)
{
    return findHistory(diffAdding(file, lines)).map((finding) => finding.line);
}

test("added lines carry their file and their new line numbers", () =>
{
    assert.deepEqual(addedLines(diffAdding("a.js", ["one", "two"])),
    [
        { file: "a.js", line: 10, text: "one" },
        { file: "a.js", line: 11, text: "two" },
    ]);
});

// Each row: the file, an added line, and whether it is flagged.
const CASES =
[
    ["hook.js", "    // Fixed in #42, keep it.", true],
    ["hook.js", "    const total = 1; // see PR 17", true],
    ["hook.js", "    // https://github.com/owner/repo/pull/9 explains it", true],
    ["hook.js", "    // From work item 1234.", true],
    ["hook.js", "    // Measured on 2026-10-04.", true],
    ["hook.js", "    /* changed 2026-01-02 */", true],
    ["pane.tsx", "    // the queue since #12", true],
    ["ci.yml", "      # pinned after PR 5", true],
    ["setup.sh", "# since 2025-12-31", true],
    ["README.md", "<!-- moved here in #7 -->", true],
    ["hook.js", "    // The branch the target directory is on.", false],
    ["hook.js", "    const url = \"https://example.com/pull/9\";", false],
    ["hook.js", "    const colour = \"#123456\";", false],
    ["hook.js", "    const fixture = \"    // since #42\";", false],
    ["hook.js", "    const fixture = '/* 2026-10-04 */'; // the fixture", false],
    ["hook.js", "    const day = \"2026-10-04\";", false],
    ["ci.yml", "      - uses: actions/checkout@3d3c42e5 # v7.0.1", false],
    ["ci.yml", "      run: echo \"#42 2026-10-04\"", false],
    ["notes.txt", "    // Fixed in #42.", false],
    ["README.md", "Fixed in #42, on 2026-10-04.", false],
];

for (const [file, line, flagged] of CASES)
{
    test(`${flagged ? "flags" : "leaves"}: ${file}: ${line.trim()}`, () =>
    {
        assert.deepEqual(flaggedLines(file, [line]), flagged ? [10] : []);
    });
}

test("a block comment is followed across added lines, and ends where it closes", () =>
{
    const lines = ["/*", " * Since #3.", " */", "const value = 1; // plain"];

    assert.deepEqual(flaggedLines("module.ts", lines), [11]);
});

test("an annotation names the file, the line and what was found", () =>
{
    const text = annotation({ file: "a,b.js", line: 3, names: ["a date"] });

    assert.match(text, /^::warning file=a%2Cb\.js,line=3::A comment names a date\./);
});

test("main reports each finding through the injected writer and returns them", () =>
{
    const written = [];
    const findings = main(["--base", "base", "--head", "head"],
    {
        runGit: (gitArguments) =>
        {
            assert.deepEqual(gitArguments.slice(-1), ["base...head"]);

            return diffAdding("x.js", ["// since #8"]);
        },
        write: (text) => written.push(text),
    });

    assert.equal(findings.length, 1);
    assert.match(written[0], /^::warning file=x\.js,line=10::/);
    assert.match(written[1], /never fails the build/);
});

test("end to end, in a throwaway repository: warnings on stdout, exit 0", () =>
{
    const repository = fileSystem.mkdtempSync(path.join(os.tmpdir(), "no-history-"));
    const git = (...gitArguments) => childProcess.execFileSync("git", gitArguments, { cwd: repository, encoding: "utf8" });

    git("init", "-q", "-b", "main");
    git("config", "user.email", "alice@example.com");
    git("config", "user.name", "alice");
    fileSystem.writeFileSync(path.join(repository, "hook.js"), "\"use strict\";\n");
    git("add", ".");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "feat/change");
    fileSystem.appendFileSync(path.join(repository, "hook.js"), ["// added for PR 31", "const answer = 42;", ""].join("\n"));
    git("commit", "-q", "-am", "change");

    const run = childProcess.spawnSync(process.execPath, [SCRIPT, "--base", "main", "--head", "HEAD"], { cwd: repository, encoding: "utf8" });

    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /^::warning file=hook\.js,line=2::A comment names a pull request number\./m);
});

test("its own error fails it: an unknown ref exits 1 and says why", () =>
{
    const run = childProcess.spawnSync(process.execPath, [SCRIPT, "--base", "no-such-ref-anywhere", "--head", "HEAD"], { cwd: __dirname, encoding: "utf8" });

    assert.equal(run.status, 1);
    assert.match(run.stderr, /^no-history-in-code: /);
});
