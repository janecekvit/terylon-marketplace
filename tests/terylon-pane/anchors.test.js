// Every planted mutation's anchor occurs exactly once in the file it edits. plant() refuses any other anchor, but only
// in the mutation shards, after a run of the baseline; this check says it in the unit suites, in milliseconds.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { MUTATIONS } = require("./mutations.js");

const MOD_ROOT = path.join(__dirname, "..", "..", "plugins", "terylon-pane");

for (const mutation of MUTATIONS)
{
    test(`the anchor of "${mutation.name}" occurs once`, () =>
    {
        for (const edit of mutation.edits ?? [mutation])
        {
            const text = fs.readFileSync(path.join(MOD_ROOT, edit.file), "utf8");
            const count = text.split(edit.find).length - 1;

            assert.equal(count, 1, `${edit.file} contains ${JSON.stringify(edit.find.trim())} ${count} times`);
        }
    });
}
