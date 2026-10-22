// The diagram render script's pure parts: its arguments, where a source renders to, and how git's
// path listings are read. The D2 calls themselves are exercised by the Diagrams workflow.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { parseArguments, renderedPathFor, renderArgumentsFor, pathListFrom, D2_VERSION, LIGHT_THEME_ID, DARK_THEME_ID } = require(path.join(__dirname, "..", "..", "Scripts", "render-diagrams.js"));

test("no argument renders, --check checks", () =>
{
    assert.deepEqual(parseArguments([]), { isCheck: false });
    assert.deepEqual(parseArguments(["--check"]), { isCheck: true });
});

test("any other argument is refused with the usage line", () =>
{
    assert.match(parseArguments(["--fix"]).error, /^usage: node Scripts\/render-diagrams\.js \[--check\]$/);
    assert.ok(parseArguments(["--check", "--check"]).error);
    assert.ok(parseArguments(["docs/architecture/plugins.d2"]).error);
});

test("a source renders to the .svg beside it", () =>
{
    assert.equal(renderedPathFor("docs/architecture/plugins.d2"), "docs/architecture/plugins.svg");
    assert.equal(renderedPathFor("docs/flows/deep/forge-port.d2"), "docs/flows/deep/forge-port.svg");
});

test("a source renders in a light and a dark theme, to the .svg beside it", () =>
{
    assert.deepEqual(renderArgumentsFor("docs/architecture/plugins.d2"),
        ["--theme", LIGHT_THEME_ID, "--dark-theme", DARK_THEME_ID, "docs/architecture/plugins.d2", "docs/architecture/plugins.svg"]);
    assert.notEqual(LIGHT_THEME_ID, DARK_THEME_ID);
});

test("git's listing becomes a sorted list without blanks or duplicates, CRLF or LF", () =>
{
    assert.deepEqual(pathListFrom("docs/b.d2\r\ndocs/a.d2\n\ndocs/b.d2\n"), ["docs/a.d2", "docs/b.d2"]);
    assert.deepEqual(pathListFrom(""), []);
});

test("the pinned D2 release is the one the workflow installs", () =>
{
    const fs = require("node:fs");
    const workflow = fs.readFileSync(path.join(__dirname, "..", "..", ".github", "workflows", "diagrams.yml"), "utf8");

    // A plain substring, not a pattern: no character of the version needs escaping.
    assert.ok(workflow.includes(`D2_VERSION: ${D2_VERSION}`), `diagrams.yml does not pin D2 ${D2_VERSION}`);
});
