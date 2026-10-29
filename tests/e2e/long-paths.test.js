"use strict";

//
// Unit checks for the install stage's long-path handling on Windows. Run: node --test tests/e2e/long-paths.test.js
// Windows itself is not exercised here: these check the pure parts, and that the setting reaches a real git.
//

const { test } = require("node:test");
const assert = require("node:assert");
const childProcess = require("child_process");
const path = require("path");
const {
    WINDOWS_MAX_PATH,
    marketplaceCloneDirectory,
    longPathGitEnvironment,
    longestTrackedPath,
    projectedClonePathLength,
    explainCloneFailure,
} = require("./lib/long-paths.js");

// git's last words when a checkout on Windows stopped at MAX_PATH.
const PARTIAL_CHECKOUT_OUTPUT = "error: unable to create file plugins/x: Filename too long\nfatal: unable to checkout working tree\nwarning: Clone succeeded, but checkout failed.\nYou can inspect what was checked out with 'git status'\nand retry with 'git restore --source=HEAD :/'\n";

test("core.longpaths is added as the first GIT_CONFIG entry when none is set", () =>
{
    assert.deepStrictEqual(longPathGitEnvironment({}),
    {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "core.longpaths",
        GIT_CONFIG_VALUE_0: "true",
    });
});

test("core.longpaths is appended after the operator's own GIT_CONFIG entries, none overwritten", () =>
{
    assert.deepStrictEqual(longPathGitEnvironment({ GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "a.b", GIT_CONFIG_VALUE_0: "1" }),
    {
        GIT_CONFIG_COUNT: "3",
        GIT_CONFIG_KEY_2: "core.longpaths",
        GIT_CONFIG_VALUE_2: "true",
    });
});

test("a real git child process reads core.longpaths from the environment", () =>
{
    const environment = { ...process.env, ...longPathGitEnvironment(process.env) };
    const value = childProcess.execFileSync("git", ["config", "--get", "core.longpaths"], { env: environment, encoding: "utf8" }).trim();

    assert.strictEqual(value, "true");
});

test("the longest tracked path is chosen, and the projection adds it to the clone directory", () =>
{
    const trackedPath = longestTrackedPath(["a.md", "plugins/terylon-core/skills/x/scripts/long-name.test.js", "b", ""]);
    const cloneDirectory = marketplaceCloneDirectory(path.resolve("out", "clean", "consumer-config"));

    assert.strictEqual(trackedPath, "plugins/terylon-core/skills/x/scripts/long-name.test.js");
    assert.match(path.basename(cloneDirectory), /^temp_git_\d{13}_\w{6}\.\.clone$/, "the temporary clone, longer than its final name");
    assert.strictEqual(projectedClonePathLength(cloneDirectory, trackedPath), cloneDirectory.length + 1 + trackedPath.length);
});

test("on Windows, git's partial-checkout message is replaced by the cause and the fix in one line", () =>
{
    const cloneDirectory = "C:/Users/alice/" + "x".repeat(150) + "/clean/consumer-config/plugins/marketplaces/terylon";
    const trackedPath = "plugins/terylon-core/skills/measure-token-spend/scripts/measure-token-spend.test.js";
    const line = explainCloneFailure({ output: PARTIAL_CHECKOUT_OUTPUT, platform: "win32", cloneDirectory, trackedPath });

    assert.ok(line !== null);
    assert.ok(!line.includes("\n"), "the explanation is one line");
    assert.match(line, /^path too long: /);
    assert.ok(line.includes(trackedPath));
    assert.ok(line.includes(`MAX_PATH of ${WINDOWS_MAX_PATH}`));
    assert.match(line, /--out C:\/t\/e2e/);
    assert.match(line, /core\.longpaths true/);
});

// Claude Code's words when git got through with core.longpaths but the move of its temporary clone was refused.
const RENAME_REFUSED_OUTPUT = "Error: Failed to add marketplace. Technical details: EPERM: operation not permitted, rename 'C:\\t\\x\\plugins\\marketplaces\\temp_git_1793261153958_42id5y' -> 'C:\\t\\x\\plugins\\marketplaces\\terylon'\n";

test("on Windows past MAX_PATH, Claude Code's refused rename of the clone is said as the path too long, with a shorter --out as the fix", () =>
{
    const cloneDirectory = "C:/Users/alice/" + "x".repeat(150) + "/clean/consumer-config/plugins/marketplaces/temp_git_0000000000000_000000..clone";
    const trackedPath = "plugins/terylon-core/skills/measure-token-spend/scripts/measure-token-spend.test.js";
    const line = explainCloneFailure({ output: RENAME_REFUSED_OUTPUT, platform: "win32", cloneDirectory, trackedPath });

    assert.ok(line !== null);
    assert.ok(!line.includes("\n"), "the explanation is one line");
    assert.match(line, /^path too long: /);
    assert.match(line, /EPERM/);
    assert.match(line, /--out C:\/t\/e2e/);
    assert.doesNotMatch(line, /core\.longpaths/, "long paths for git are already set and do not reach the rename");
});

test("a refused rename within MAX_PATH is not called a path too long", () =>
{
    const line = explainCloneFailure({ output: RENAME_REFUSED_OUTPUT, platform: "win32", cloneDirectory: "C:/t/e2e/clean/consumer-config/plugins/marketplaces/temp_git_0000000000000_000000..clone", trackedPath: "a.md" });

    assert.strictEqual(line, null);
});

test("any other failure, or any other platform, keeps git's own message", () =>
{
    const cloneDirectory = "C:/t/e2e/clean/consumer-config/plugins/marketplaces/terylon";

    assert.strictEqual(explainCloneFailure({ output: "fatal: repository not found", platform: "win32", cloneDirectory, trackedPath: "a" }), null);
    assert.strictEqual(explainCloneFailure({ output: PARTIAL_CHECKOUT_OUTPUT, platform: "linux", cloneDirectory, trackedPath: "a" }), null);
});
