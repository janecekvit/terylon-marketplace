// Nothing published names the owner's host, tailnet or forge organisation: every tracked file under plugins/
// and docs/ is checked (#32). The repository is public, so a name here is a name on the internet.
//
// The terylon-os plugin has its own copy of this check in tests/terylon-os/terylon-os-plugin.test.js; this one
// covers the rest of what is published, which is where the names were found.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// The repository root, from this file.
const REPOSITORY_ROOT = path.join(__dirname, "..", "..");

// The trees that are published as the product and its documentation.
const PUBLISHED_TREES = ["plugins", "docs"];

// A tailnet's DNS name (tail + five hex digits), the owner's machine name, and the private forge organisation.
// Examples use alice-host and example.ts.net instead.
const PRIVATE_NAME = /tail[0-9a-f]{5}\.ts\.net|terylonlab|janecekvit\/Dev|dev\.azure\.com\/janecekvit/i;

// Every tracked file of the published trees, as git lists it.
function trackedFiles()
{
    const listing = childProcess.execFileSync("git", ["ls-files", "-z", "--", ...PUBLISHED_TREES],
    {
        cwd: REPOSITORY_ROOT,
        encoding: "utf8",
    });

    return listing.split("\0").filter(Boolean);
}

test("no published file names the owner's host, tailnet or forge organisation", () =>
{
    const files = trackedFiles();
    const offenders = [];

    assert.ok(files.length > 0, "git listed no files under plugins/ and docs/");

    for (const file of files)
    {
        const text = fs.readFileSync(path.join(REPOSITORY_ROOT, file), "utf8");
        const lines = text.split("\n");

        lines.forEach((line, index) =>
        {
            if (PRIVATE_NAME.test(line))
            {
                offenders.push(`${file}:${index + 1}`);
            }
        });
    }

    assert.deepEqual(offenders, []);
});

test("the check has teeth: a planted tailnet name or machine name is caught", () =>
{
    assert.match("https://alice-host.tail12abc.ts.net/mcp", PRIVATE_NAME);
    assert.match("TerylonLab does not answer", PRIVATE_NAME);
    assert.doesNotMatch("https://alice-host.example.ts.net/mcp", PRIVATE_NAME);
});
