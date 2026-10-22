"use strict";

//
// The marketplace's version rules, checked on a pull request. Claude Code updates a plugin for its
// users only when plugin.json's version changes, so:
//
//   a  a pull request that changes any file under plugins/<name>/ raises that plugin's version,
//      strictly, as MAJOR.MINOR.PATCH;
//   b  a raised MAJOR fails unless the pull request carries the label `major` (--major-allowed),
//      because the major version is raised by the maintainer alone;
//   c  a version that .claude-plugin/marketplace.json lists for a plugin equals that plugin's
//      plugin.json — and an entry that lists none is not compared.
//
// A new plugin (no plugin.json on the base) passes with any version from 1.0.0 up; a deleted plugin
// passes. Which files changed is `git diff --name-only base...head`, from the merge base; the version
// a plugin had is read at the base itself, so a branch that fell behind a bump on main is told so.
//
// Run: node tests/versions/check-plugin-versions.js --base <ref> --head <ref> [--major-allowed]
// Exit 0 when every rule holds, 1 on any violation, 2 when the arguments or git are unusable.
//

const childProcess = require("node:child_process");

// MAJOR.MINOR.PATCH, digits only, no leading zero — no pre-release or build suffix, which the
// marketplace never uses and which Claude Code would compare as a plain string.
const SEMANTIC_VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

// A path inside one plugin's directory: plugins/<name>/<anything>. plugins/CLAUDE.md is not one.
const PLUGIN_FILE_PATH = /^plugins\/([^/]+)\/.+$/;

// Where a plugin's manifest sits inside its directory.
const PLUGIN_MANIFEST_RELATIVE_PATH = ".claude-plugin/plugin.json";

// The marketplace's root manifest.
const MARKETPLACE_MANIFEST_PATH = ".claude-plugin/marketplace.json";

// The lowest version a new plugin may arrive with: every plugin is on the 1.x.x line or above.
const MINIMUM_NEW_PLUGIN_VERSION = { major: 1, minor: 0, patch: 0 };

// The verdicts a plugin can receive.
const VERDICT_PASS = "ok";
const VERDICT_FAIL = "FAIL";

// Exit codes of the command line.
const EXIT_SUCCESS = 0;
const EXIT_VIOLATION = 1;
const EXIT_USAGE = 2;

function parseVersion(versionText)
{
    if (typeof versionText !== "string")
    {
        return null;
    }

    const match = SEMANTIC_VERSION.exec(versionText);

    if (match === null)
    {
        return null;
    }

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
}

function compareVersions(leftVersion, rightVersion)
{
    for (const digit of ["major", "minor", "patch"])
    {
        if (leftVersion[digit] !== rightVersion[digit])
        {
            return leftVersion[digit] < rightVersion[digit] ? -1 : 1;
        }
    }

    return 0;
}

// Which digit a raise moved: the highest one that changed.
function raisedDigit(baseVersion, headVersion)
{
    if (headVersion.major !== baseVersion.major)
    {
        return "major";
    }

    if (headVersion.minor !== baseVersion.minor)
    {
        return "minor";
    }

    return "patch";
}

function changedPluginNames(changedPaths)
{
    const pluginNames = new Set();

    for (const changedPath of changedPaths)
    {
        const match = PLUGIN_FILE_PATH.exec(changedPath);

        if (match !== null)
        {
            pluginNames.add(match[1]);
        }
    }

    return [...pluginNames].sort();
}

function pluginManifestPath(pluginName)
{
    return `plugins/${pluginName}/${PLUGIN_MANIFEST_RELATIVE_PATH}`;
}

// The version a manifest declares: { versionText, version } on success, { problem } otherwise.
function readManifestVersion(manifestText)
{
    let manifest;

    try
    {
        manifest = JSON.parse(manifestText);
    }
    catch (parseError)
    {
        return { problem: `plugin.json is not valid JSON (${parseError.message})` };
    }

    if (manifest === null || typeof manifest !== "object" || !("version" in manifest))
    {
        return { problem: "plugin.json declares no version" };
    }

    const version = parseVersion(manifest.version);

    if (version === null)
    {
        return { problem: `version ${JSON.stringify(manifest.version)} is not MAJOR.MINOR.PATCH` };
    }

    return { versionText: manifest.version, version };
}

//
// One plugin's verdict.
//
//   pluginName              the directory under plugins/
//   changed                 whether the pull request changed any file in that directory
//   baseManifestText        plugin.json at the base, or null when the base has none
//   headManifestText        plugin.json at the head, or null when the head has none
//   headDirectoryPresent    whether the head has any file in the plugin's directory
//   majorAllowed            whether the pull request carries the label `major`
//
function judgePlugin({ pluginName, changed, baseManifestText, headManifestText, headDirectoryPresent, majorAllowed })
{
    const judgement =
    {
        pluginName,
        changed,
        baseVersionText: null,
        headVersionText: null,
        verdict: VERDICT_PASS,
        reason: "",
    };

    const baseRead = baseManifestText === null ? null : readManifestVersion(baseManifestText);
    const headRead = headManifestText === null ? null : readManifestVersion(headManifestText);

    judgement.baseVersionText = baseRead !== null && baseRead.version ? baseRead.versionText : null;
    judgement.headVersionText = headRead !== null && headRead.version ? headRead.versionText : null;

    if (!changed)
    {
        judgement.reason = "unchanged";

        return judgement;
    }

    if (headManifestText === null)
    {
        if (!headDirectoryPresent)
        {
            judgement.reason = "deleted";

            return judgement;
        }

        judgement.verdict = VERDICT_FAIL;
        judgement.reason = `files remain under plugins/${pluginName}/ but ${PLUGIN_MANIFEST_RELATIVE_PATH} is gone`;

        return judgement;
    }

    if (headRead.problem)
    {
        judgement.verdict = VERDICT_FAIL;
        judgement.reason = headRead.problem;

        return judgement;
    }

    if (baseManifestText === null)
    {
        if (compareVersions(headRead.version, MINIMUM_NEW_PLUGIN_VERSION) < 0)
        {
            judgement.verdict = VERDICT_FAIL;
            judgement.reason = "a new plugin starts at 1.0.0 or above";

            return judgement;
        }

        judgement.reason = "new plugin";

        return judgement;
    }

    if (baseRead.problem)
    {
        // The base itself breaks the rule; the head's version is valid, and comparing against an
        // unreadable number would block the very pull request that repairs it.
        judgement.reason = `the base's ${baseRead.problem}; the head's version is accepted`;

        return judgement;
    }

    if (compareVersions(headRead.version, baseRead.version) <= 0)
    {
        judgement.verdict = VERDICT_FAIL;
        judgement.reason = `files changed but the version was not raised — Claude Code updates a plugin only when ${PLUGIN_MANIFEST_RELATIVE_PATH}'s version changes`;

        return judgement;
    }

    const digit = raisedDigit(baseRead.version, headRead.version);

    if (digit === "major" && !majorAllowed)
    {
        judgement.verdict = VERDICT_FAIL;
        judgement.reason = "the major version was raised, and the pull request does not carry the label `major` — the maintainer alone raises a major";

        return judgement;
    }

    judgement.reason = `${digit} raised`;

    return judgement;
}

//
// Rule c: every version marketplace.json lists for a plugin equals that plugin's plugin.json.
//
//   marketplaceText            marketplace.json at the head, or null when absent
//   manifestVersionsByName     { pluginName: versionText } from each plugin.json at the head
//
// Returns { listedCount, violations: [string] }.
//
function judgeMarketplace({ marketplaceText, manifestVersionsByName })
{
    const result = { listedCount: 0, violations: [] };

    if (marketplaceText === null)
    {
        return result;
    }

    let marketplace;

    try
    {
        marketplace = JSON.parse(marketplaceText);
    }
    catch (parseError)
    {
        result.violations.push(`${MARKETPLACE_MANIFEST_PATH} is not valid JSON (${parseError.message})`);

        return result;
    }

    const entries = Array.isArray(marketplace.plugins) ? marketplace.plugins : [];

    for (const entry of entries)
    {
        if (entry === null || typeof entry !== "object" || !("version" in entry))
        {
            continue;
        }

        result.listedCount += 1;

        const manifestVersionText = manifestVersionsByName[entry.name];

        if (manifestVersionText === undefined)
        {
            result.violations.push(`${MARKETPLACE_MANIFEST_PATH} lists ${entry.name} at ${entry.version}, and no plugin.json version was found for it`);
        }
        else if (entry.version !== manifestVersionText)
        {
            result.violations.push(`${MARKETPLACE_MANIFEST_PATH} lists ${entry.name} at ${entry.version}, and its plugin.json says ${manifestVersionText}`);
        }
    }

    return result;
}

function formatJudgement(judgement, pluginNameWidth)
{
    const state = judgement.changed ? "changed  " : "unchanged";
    const baseText = judgement.baseVersionText === null ? "-" : judgement.baseVersionText;
    const headText = judgement.headVersionText === null ? "-" : judgement.headVersionText;
    const versions = judgement.changed ? `${baseText} → ${headText}` : headText;

    return `${judgement.pluginName.padEnd(pluginNameWidth)}  ${state}  ${versions.padEnd(18)}  ${judgement.verdict}  ${judgement.reason}`;
}

function parseArguments(argumentList)
{
    const parsed = { base: null, head: null, majorAllowed: false };

    for (let index = 0; index < argumentList.length; index += 1)
    {
        const argument = argumentList[index];

        if (argument === "--base" || argument === "--head")
        {
            const value = argumentList[index + 1];

            if (value === undefined || value.startsWith("--"))
            {
                return { problem: `${argument} needs a ref` };
            }

            parsed[argument.slice(2)] = value;
            index += 1;
        }
        else if (argument === "--major-allowed")
        {
            parsed.majorAllowed = true;
        }
        else
        {
            return { problem: `unknown argument ${argument}` };
        }
    }

    if (parsed.base === null || parsed.head === null)
    {
        return { problem: "both --base and --head are required" };
    }

    return parsed;
}

// git, without a shell: the refs come from the workflow's environment and are passed as arguments.
function runGit(argumentList, workingDirectory)
{
    return childProcess.execFileSync("git", argumentList,
    {
        cwd: workingDirectory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
    });
}

function fileExistsAtRef(ref, filePath, workingDirectory)
{
    try
    {
        runGit(["cat-file", "-e", `${ref}:${filePath}`], workingDirectory);

        return true;
    }
    catch
    {
        // cat-file -e exits non-zero for a path the ref does not hold, which is an answer, not a failure.
        return false;
    }
}

function readFileAtRef(ref, filePath, workingDirectory)
{
    if (!fileExistsAtRef(ref, filePath, workingDirectory))
    {
        return null;
    }

    return runGit(["show", `${ref}:${filePath}`], workingDirectory);
}

function splitLines(gitOutput)
{
    return gitOutput.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
}

function pluginDirectoriesAtRef(ref, workingDirectory)
{
    if (!fileExistsAtRef(ref, "plugins", workingDirectory))
    {
        return [];
    }

    return splitLines(runGit(["ls-tree", "-d", "--name-only", ref, "plugins/"], workingDirectory))
        .map((directoryPath) => directoryPath.replace(/^plugins\//, ""));
}

function checkRepository({ base, head, majorAllowed, workingDirectory })
{
    const changedPaths = splitLines(runGit(["diff", "--name-only", `${base}...${head}`], workingDirectory));
    const changedNames = changedPluginNames(changedPaths);
    const allNames = [...new Set([...pluginDirectoriesAtRef(head, workingDirectory), ...changedNames])].sort();

    const judgements = allNames.map((pluginName) =>
    {
        const manifestPath = pluginManifestPath(pluginName);

        return judgePlugin(
        {
            pluginName,
            changed: changedNames.includes(pluginName),
            baseManifestText: readFileAtRef(base, manifestPath, workingDirectory),
            headManifestText: readFileAtRef(head, manifestPath, workingDirectory),
            headDirectoryPresent: fileExistsAtRef(head, `plugins/${pluginName}`, workingDirectory),
            majorAllowed,
        });
    });

    const manifestVersionsByName = {};

    for (const judgement of judgements)
    {
        if (judgement.headVersionText !== null)
        {
            manifestVersionsByName[judgement.pluginName] = judgement.headVersionText;
        }
    }

    const marketplace = judgeMarketplace(
    {
        marketplaceText: readFileAtRef(head, MARKETPLACE_MANIFEST_PATH, workingDirectory),
        manifestVersionsByName,
    });

    return { judgements, marketplace };
}

function main()
{
    const parsed = parseArguments(process.argv.slice(2));

    if (parsed.problem)
    {
        console.error(`check-plugin-versions: ${parsed.problem}`);
        console.error("usage: node tests/versions/check-plugin-versions.js --base <ref> --head <ref> [--major-allowed]");

        return EXIT_USAGE;
    }

    let outcome;

    try
    {
        outcome = checkRepository({ base: parsed.base, head: parsed.head, majorAllowed: parsed.majorAllowed, workingDirectory: process.cwd() });
    }
    catch (gitError)
    {
        const detail = gitError.stderr ? String(gitError.stderr).trim() : gitError.message;

        console.error(`check-plugin-versions: git could not compare ${parsed.base}...${parsed.head}: ${detail}`);

        return EXIT_USAGE;
    }

    const pluginNameWidth = Math.max(0, ...outcome.judgements.map((judgement) => judgement.pluginName.length));

    console.log(`Plugin versions, ${parsed.base}...${parsed.head}${parsed.majorAllowed ? ", label `major` present" : ""}`);

    for (const judgement of outcome.judgements)
    {
        console.log(formatJudgement(judgement, pluginNameWidth));
    }

    if (outcome.marketplace.listedCount === 0 && outcome.marketplace.violations.length === 0)
    {
        console.log(`${MARKETPLACE_MANIFEST_PATH} lists no plugin versions; nothing to compare`);
    }
    else if (outcome.marketplace.violations.length === 0)
    {
        console.log(`${MARKETPLACE_MANIFEST_PATH}: ${outcome.marketplace.listedCount} listed versions, each equal to its plugin.json`);
    }

    for (const violation of outcome.marketplace.violations)
    {
        console.log(`${VERDICT_FAIL}  ${violation}`);
    }

    const failedPlugins = outcome.judgements.filter((judgement) => judgement.verdict === VERDICT_FAIL);
    const violationCount = failedPlugins.length + outcome.marketplace.violations.length;

    if (violationCount > 0)
    {
        console.log(`${violationCount} violation(s). The rules: plugins/CLAUDE.md, under Versioning.`);

        return EXIT_VIOLATION;
    }

    console.log("Every version rule holds.");

    return EXIT_SUCCESS;
}

if (require.main === module)
{
    process.exitCode = main();
}

module.exports =
{
    SEMANTIC_VERSION,
    VERDICT_PASS,
    VERDICT_FAIL,
    parseVersion,
    compareVersions,
    changedPluginNames,
    judgePlugin,
    judgeMarketplace,
    parseArguments,
};
