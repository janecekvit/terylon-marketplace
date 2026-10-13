// The version the pane says on its Status tab is the one its manifest ships (#332): a bump of plugin.json that
// forgets MOD_VERSION would have the owner read an old version while running the new one.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// The mod, from the repository root.
const MOD_ROOT = path.join(__dirname, "..", "..", "plugins", "terylon-pane");

// `export const MOD_VERSION = '1.0.1'` in the module.
const MOD_VERSION = /export const MOD_VERSION = '([^']+)'/;

test("the Status tab's version is plugin.json's version", () =>
{
    const manifest = JSON.parse(fs.readFileSync(path.join(MOD_ROOT, ".claude-plugin", "plugin.json"), "utf8"));
    const source = fs.readFileSync(path.join(MOD_ROOT, "hooks", "register.tsx"), "utf8");
    const match = MOD_VERSION.exec(source);

    assert.ok(match !== null, "register.tsx no longer declares MOD_VERSION");
    assert.equal(match[1], manifest.version);
});
