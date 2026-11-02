// The glossary's table is vendored once (Terylon S68): tests/words-cases.json is Terylon's words-cases.json byte for byte,
// and tests/words-cases.ts, the module the mod's test imports, holds that same text after its one export line.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The mod's tests, from the repository root.
const TESTS_ROOT = path.join(__dirname, "..", "..", "plugins", "terylon-pane", "tests");

// The line the module's table starts on.
const EXPORT_LINE = "export const WORDS_CASES = ";

test("words-cases.ts holds words-cases.json whole, after its export line", () =>
{
    const table = fs.readFileSync(path.join(TESTS_ROOT, "words-cases.json"), "utf8");
    const module = fs.readFileSync(path.join(TESTS_ROOT, "words-cases.ts"), "utf8");
    const start = module.indexOf(EXPORT_LINE);

    assert.ok(start >= 0, "words-cases.ts no longer exports WORDS_CASES");
    assert.equal(module.slice(start + EXPORT_LINE.length), table);
});

test("the vendored table parses and names its cases", () =>
{
    const table = JSON.parse(fs.readFileSync(path.join(TESTS_ROOT, "words-cases.json"), "utf8"));

    assert.equal(table.version, 1);
    assert.ok(Array.isArray(table.cases) && table.cases.length > 150);
});
