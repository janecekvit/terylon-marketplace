"use strict";

//
// Unit checks for the harness's ref resolution. Run: node --test tests/e2e/ref.test.js
//

const { test } = require("node:test");
const assert = require("node:assert");
const { resolveRef } = require("./lib/ref.js");

// A stand-in for git: maps the argument list to what git would print.
function fakeGit(outputs)
{
    return (argumentList) =>
    {
        const key = argumentList.join(" ");

        if (!(key in outputs))
        {
            throw new Error(`unexpected git call: ${key}`);
        }

        return outputs[key];
    };
}

const DETACHED_GIT =
{
    "rev-parse --abbrev-ref HEAD": "HEAD",
    "rev-parse --short HEAD": "868a764",
};

test("an explicit --ref wins, and git is not consulted", () =>
{
    assert.deepStrictEqual(resolveRef({ explicitRef: "feat/x", git: fakeGit({}) }), { ref: "feat/x" });
});

test("on a branch, the branch is the ref", () =>
{
    assert.deepStrictEqual(resolveRef({ git: fakeGit({ "rev-parse --abbrev-ref HEAD": "feat/271-product-on-the-port" }) }), { ref: "feat/271-product-on-the-port" });
});

test("a detached HEAD is refused, never passed on as the ref 'HEAD'", () =>
{
    const result = resolveRef(
    {
        git: fakeGit({ ...DETACHED_GIT, "branch --all --points-at HEAD --format=%(refname:short)": "" }),
    });

    assert.strictEqual(result.ref, undefined);
    assert.match(result.error, /^detached HEAD at 868a764: pass --ref/);
    assert.strictEqual(result.error.split("\n").length, 1, "one line");
});

test("a detached HEAD names the branches that point at it, local and remote, once each", () =>
{
    const result = resolveRef(
    {
        git: fakeGit({ ...DETACHED_GIT, "branch --all --points-at HEAD --format=%(refname:short)": "(no branch)\nfeat/a\norigin/HEAD\norigin/feat/a\norigin/feat/b\n" }),
    });

    assert.match(result.error, /\(--ref feat\/a or --ref feat\/b points here\)$/);
});

test("an empty --ref is treated as absent", () =>
{
    assert.deepStrictEqual(resolveRef({ explicitRef: "", git: fakeGit({ "rev-parse --abbrev-ref HEAD": "main" }) }), { ref: "main" });
});
