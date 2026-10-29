"use strict";

//
// long-paths — the install stage's clone on Windows, where a path past MAX_PATH breaks the checkout and git says only
// "You can inspect what was checked out with 'git status' …".
//
//   longPathGitEnvironment    core.longpaths=true for every git the harness's children start, through
//                             GIT_CONFIG_COUNT/KEY/VALUE, which the clone `marketplace add` makes inherits
//   explainCloneFailure       when the clone still fails, one line naming the cause and the fix instead of git's
//
// How the clone was measured to inherit the setting, and where it checks out: CLAUDE.md, under Testing.
//

const path = require("path");

// Windows' MAX_PATH: a full path of 260 characters, the terminating NUL included, so 259 usable.
const WINDOWS_MAX_PATH = 260;

// What git prints when a checkout wrote only part of the tree, and what it prints when a name is too long.
const PARTIAL_CHECKOUT_MESSAGE = /You can inspect what was checked out|Filename too long|unable to create file .*(too long|No such file)/i;

// The temporary directory `marketplace add` clones into before renaming it: a millisecond timestamp and a six-character
// id, longer than the final name, so the checkout reaches its deepest path there.
const TEMPORARY_CLONE_NAME = "temp_git_0000000000000_000000..clone";

// Where `marketplace add` checks the marketplace out, under the scratch config directory.
function marketplaceCloneDirectory(configDirectory)
{
    return path.join(configDirectory, "plugins", "marketplaces", TEMPORARY_CLONE_NAME);
}

// The environment additions that set core.longpaths=true for every git process that inherits them, appended
// after any GIT_CONFIG_COUNT entries already present so none of the operator's is lost.
function longPathGitEnvironment(environment)
{
    const existingCount = Number.parseInt(environment.GIT_CONFIG_COUNT || "0", 10);
    const count = Number.isInteger(existingCount) && existingCount > 0 ? existingCount : 0;

    return {
        GIT_CONFIG_COUNT: String(count + 1),
        [`GIT_CONFIG_KEY_${count}`]: "core.longpaths",
        [`GIT_CONFIG_VALUE_${count}`]: "true",
    };
}

// The longest of the tracked paths, as git lists them (forward slashes).
function longestTrackedPath(trackedPaths)
{
    return trackedPaths.reduce((longest, candidate) => (candidate.length > longest.length ? candidate : longest), "");
}

// The full length the deepest file of the clone reaches.
function projectedClonePathLength(cloneDirectory, trackedPath)
{
    return path.resolve(cloneDirectory).length + 1 + trackedPath.length;
}

// One line naming the cause and the fix when a clone fails on a path that is too long; null for any other failure.
function explainCloneFailure({ output, platform, cloneDirectory, trackedPath })
{
    if (platform !== "win32" || !PARTIAL_CHECKOUT_MESSAGE.test(output))
    {
        return null;
    }

    const projectedLength = projectedClonePathLength(cloneDirectory, trackedPath);

    return `path too long: the clone's deepest file, ${trackedPath}, lands at ${projectedLength} characters `
        + `under ${cloneDirectory}, past Windows' MAX_PATH of ${WINDOWS_MAX_PATH}; `
        + `pass a shorter --out (such as --out C:/t/e2e), or enable long paths for git (git config --global core.longpaths true)`;
}

module.exports =
{
    WINDOWS_MAX_PATH,
    marketplaceCloneDirectory,
    longPathGitEnvironment,
    longestTrackedPath,
    projectedClonePathLength,
    explainCloneFailure,
};
