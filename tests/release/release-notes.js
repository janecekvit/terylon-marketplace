// Release notes for a marketplace tag: every plugin's version at the tag, what changed since the
// previous tag, and the pull requests merged in between. Run by .github/workflows/release.yml;
// the pure functions below are exported for release-notes.test.js.
//
//   node tests/release/release-notes.js --previous <tag|none> --current <tag> [--ref <git ref>]
//   node tests/release/release-notes.js --print-previous --current <tag>
"use strict";

const childProcess = require("node:child_process");
const path = require("node:path");

// A release tag is exactly vMAJOR.MINOR.PATCH: no leading zeros, no pre-release, no build suffix.
const RELEASE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// A plugin manifest inside the tree: plugins/<directory>/.claude-plugin/plugin.json.
const PLUGIN_MANIFEST_PATH = /^plugins\/([^/]+)\/\.claude-plugin\/plugin\.json$/;

// A squash merge's subject ends with the pull request number: "Add the release workflow (#12)".
const SQUASH_MERGE_SUBJECT = /^(.*\S)\s+\(#(\d+)\)$/;

// A merge commit's subject as GitHub writes it: "Merge pull request #12 from owner/branch".
const MERGE_COMMIT_SUBJECT = /^Merge pull request #(\d+) from (\S+)/;

// The separator between fields of one `git log` line; a unit separator never appears in a subject.
const LOG_FIELD_SEPARATOR = "\u001f";

// The word written for "no previous tag" on the command line.
const NO_PREVIOUS_TAG = "none";

// The repository the notes link into when GITHUB_REPOSITORY is not set.
const DEFAULT_REPOSITORY = "janecekvit/terylon-marketplace";

// How many characters of a commit id the notes show.
const SHORT_COMMIT_LENGTH = 7;

function isReleaseTag(tagName)
{
    return typeof tagName === "string" && RELEASE_TAG.test(tagName);
}

function parseReleaseTag(tagName)
{
    const match = RELEASE_TAG.exec(tagName);

    if (match === null)
    {
        throw new Error(`"${tagName}" is not a release tag: it must be exactly vMAJOR.MINOR.PATCH, such as v1.0.0`);
    }

    return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareReleaseTags(leftTag, rightTag)
{
    const leftParts = parseReleaseTag(leftTag);
    const rightParts = parseReleaseTag(rightTag);

    for (let partIndex = 0; partIndex < leftParts.length; partIndex++)
    {
        if (leftParts[partIndex] !== rightParts[partIndex])
        {
            return leftParts[partIndex] - rightParts[partIndex];
        }
    }

    return 0;
}

// The highest release tag below the current one, or null when the current tag is the first.
// Tags that are not release tags (a date tag, a pre-release) are ignored.
function selectPreviousTag(tagNames, currentTag)
{
    parseReleaseTag(currentTag);

    const earlierTags = tagNames
        .filter((tagName) => isReleaseTag(tagName))
        .filter((tagName) => compareReleaseTags(tagName, currentTag) < 0)
        .sort(compareReleaseTags);

    if (earlierTags.length === 0)
    {
        return null;
    }

    return earlierTags[earlierTags.length - 1];
}

// The manifest paths among the output of `git ls-tree -r --name-only <ref> -- plugins`.
function selectPluginManifestPaths(treeListing)
{
    return treeListing
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => PLUGIN_MANIFEST_PATH.test(line))
        .sort();
}

// A map of plugin name to version, from { manifestPath: manifestText }.
function readPluginVersions(manifestTextByPath)
{
    const versionByPlugin = new Map();

    for (const manifestPath of Object.keys(manifestTextByPath).sort())
    {
        const directoryName = PLUGIN_MANIFEST_PATH.exec(manifestPath)[1];
        let manifest;

        try
        {
            manifest = JSON.parse(manifestTextByPath[manifestPath]);
        }
        catch (parseError)
        {
            throw new Error(`${manifestPath} is not valid JSON: ${parseError.message}`);
        }

        const pluginName = typeof manifest.name === "string" && manifest.name !== "" ? manifest.name : directoryName;
        const pluginVersion = typeof manifest.version === "string" && manifest.version !== "" ? manifest.version : "unversioned";

        versionByPlugin.set(pluginName, pluginVersion);
    }

    return versionByPlugin;
}

// One row per plugin present at either tag, sorted by name. The status is "new" (absent at the
// previous tag, or no previous tag), "changed", "unchanged" or "removed" (absent at the current tag).
function comparePluginVersions(previousVersions, currentVersions)
{
    const pluginNames = new Set([...currentVersions.keys()]);

    if (previousVersions !== null)
    {
        for (const pluginName of previousVersions.keys())
        {
            pluginNames.add(pluginName);
        }
    }

    return [...pluginNames].sort().map((pluginName) =>
    {
        const previousVersion = previousVersions === null ? null : previousVersions.get(pluginName) ?? null;
        const currentVersion = currentVersions.get(pluginName) ?? null;
        let status;

        if (currentVersion === null)
        {
            status = "removed";
        }
        else if (previousVersion === null)
        {
            status = "new";
        }
        else if (previousVersion === currentVersion)
        {
            status = "unchanged";
        }
        else
        {
            status = "changed";
        }

        return { pluginName, previousVersion, currentVersion, status };
    });
}

// Splits `git log --format=%H<separator>%s` output into the pull requests it merged and the
// commits that name none, both in the order git printed them (newest first).
function parseCommitLog(logOutput)
{
    const pullRequests = [];
    const otherCommits = [];

    for (const line of logOutput.split(/\r?\n/))
    {
        if (line.trim() === "")
        {
            continue;
        }

        const separatorIndex = line.indexOf(LOG_FIELD_SEPARATOR);
        const commitId = separatorIndex === -1 ? line.trim() : line.slice(0, separatorIndex);
        const subject = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1).trim();
        const squashMatch = SQUASH_MERGE_SUBJECT.exec(subject);
        const mergeMatch = MERGE_COMMIT_SUBJECT.exec(subject);

        if (squashMatch !== null)
        {
            pullRequests.push({ number: Number(squashMatch[2]), title: squashMatch[1], commitId });
        }
        else if (mergeMatch !== null)
        {
            pullRequests.push({ number: Number(mergeMatch[1]), title: `Merge of ${mergeMatch[2]}`, commitId });
        }
        else
        {
            otherCommits.push({ commitId, subject });
        }
    }

    return { pullRequests, otherCommits };
}

// A table cell or list item must not break the Markdown around it.
function escapeMarkdownText(text)
{
    return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/</g, "&lt;").replace(/\r?\n/g, " ");
}

function describeChange(pluginRow, previousTag)
{
    switch (pluginRow.status)
    {
        case "new":
            return previousTag === null ? "first release" : "new";
        case "changed":
            return `${pluginRow.previousVersion} → ${pluginRow.currentVersion}`;
        case "removed":
            return `removed (was ${pluginRow.previousVersion})`;
        default:
            return "unchanged";
    }
}

function renderReleaseNotes({ repository, previousTag, currentTag, pluginRows, pullRequests, otherCommits })
{
    const repositoryUrl = `https://github.com/${repository}`;
    const sinceLabel = previousTag === null ? "Change" : `Since ${previousTag}`;
    const lines = [];

    lines.push("## Plugins");
    lines.push("");
    lines.push(`| Plugin | Version | ${sinceLabel} |`);
    lines.push("|---|---|---|");

    for (const pluginRow of pluginRows)
    {
        const versionCell = pluginRow.currentVersion === null ? "not shipped" : `\`${pluginRow.currentVersion}\``;
        const nameCell = pluginRow.status === "changed" || pluginRow.status === "new"
            ? `**${pluginRow.pluginName}**`
            : pluginRow.pluginName;

        lines.push(`| ${nameCell} | ${versionCell} | ${describeChange(pluginRow, previousTag)} |`);
    }

    lines.push("");
    lines.push("## Pull requests");
    lines.push("");

    if (pullRequests.length === 0)
    {
        lines.push(previousTag === null ? "No pull request is named in this history." : `No pull request was merged since ${previousTag}.`);
    }
    else
    {
        for (const pullRequest of pullRequests)
        {
            lines.push(`- ${escapeMarkdownText(pullRequest.title)} ([#${pullRequest.number}](${repositoryUrl}/pull/${pullRequest.number}))`);
        }
    }

    if (otherCommits.length > 0)
    {
        lines.push("");
        lines.push("## Other commits");
        lines.push("");

        for (const otherCommit of otherCommits)
        {
            const shortCommitId = otherCommit.commitId.slice(0, SHORT_COMMIT_LENGTH);

            lines.push(`- ${escapeMarkdownText(otherCommit.subject)} ([${shortCommitId}](${repositoryUrl}/commit/${otherCommit.commitId}))`);
        }
    }

    lines.push("");
    lines.push("## Verifying this release");
    lines.push("");
    lines.push(`The source archive carries a build provenance attestation and a Sigstore signature, and \`SHA256SUMS\` is signed too. With the GitHub CLI:`);
    lines.push("");
    lines.push("```bash");
    lines.push(`gh attestation verify terylon-marketplace-${currentTag}.tar.gz -R ${repository}`);
    lines.push("```");
    lines.push("");
    lines.push(`Every way to verify it is in [docs/runbooks/releasing.md](${repositoryUrl}/blob/${currentTag}/docs/runbooks/releasing.md).`);

    if (previousTag !== null)
    {
        lines.push("");
        lines.push(`**Full changelog**: ${repositoryUrl}/compare/${previousTag}...${currentTag}`);
    }

    lines.push("");

    return lines.join("\n");
}

function runGit(gitArguments, workingDirectory)
{
    return childProcess.execFileSync("git", gitArguments,
    {
        cwd: workingDirectory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 64 * 1024 * 1024,
    });
}

function readPluginVersionsAtRef(gitRef, workingDirectory)
{
    const treeListing = runGit(["ls-tree", "-r", "--name-only", gitRef, "--", "plugins"], workingDirectory);
    const manifestTextByPath = {};

    for (const manifestPath of selectPluginManifestPaths(treeListing))
    {
        manifestTextByPath[manifestPath] = runGit(["show", `${gitRef}:${manifestPath}`], workingDirectory);
    }

    return readPluginVersions(manifestTextByPath);
}

function readCommitLog(previousTag, currentRef, workingDirectory)
{
    const revisionRange = previousTag === null ? currentRef : `${previousTag}..${currentRef}`;

    return runGit(["log", "--first-parent", `--format=%H${LOG_FIELD_SEPARATOR}%s`, revisionRange], workingDirectory);
}

function buildReleaseNotes({ previousTag, currentTag, currentRef, repository, workingDirectory })
{
    parseReleaseTag(currentTag);

    if (previousTag !== null)
    {
        parseReleaseTag(previousTag);

        if (compareReleaseTags(previousTag, currentTag) >= 0)
        {
            throw new Error(`the previous tag ${previousTag} is not below the current tag ${currentTag}`);
        }
    }

    const previousVersions = previousTag === null ? null : readPluginVersionsAtRef(previousTag, workingDirectory);
    const currentVersions = readPluginVersionsAtRef(currentRef, workingDirectory);
    const commitLog = parseCommitLog(readCommitLog(previousTag, currentRef, workingDirectory));

    return renderReleaseNotes(
    {
        repository,
        previousTag,
        currentTag,
        pluginRows: comparePluginVersions(previousVersions, currentVersions),
        pullRequests: commitLog.pullRequests,
        otherCommits: commitLog.otherCommits,
    });
}

function parseCommandLine(commandLineArguments)
{
    const options = { previous: undefined, current: undefined, ref: undefined, printPrevious: false };

    for (let argumentIndex = 0; argumentIndex < commandLineArguments.length; argumentIndex++)
    {
        const argument = commandLineArguments[argumentIndex];

        if (argument === "--print-previous")
        {
            options.printPrevious = true;
            continue;
        }

        if (argument !== "--previous" && argument !== "--current" && argument !== "--ref")
        {
            throw new Error(`unknown argument ${argument}`);
        }

        const value = commandLineArguments[argumentIndex + 1];

        if (value === undefined || value.startsWith("--"))
        {
            throw new Error(`${argument} needs a value`);
        }

        options[argument.slice(2)] = value;
        argumentIndex++;
    }

    if (options.current === undefined)
    {
        throw new Error("--current <tag> is required");
    }

    if (!options.printPrevious && options.previous === undefined)
    {
        throw new Error(`--previous <tag|${NO_PREVIOUS_TAG}> is required`);
    }

    return options;
}

function main()
{
    const workingDirectory = path.join(__dirname, "..", "..");
    const options = parseCommandLine(process.argv.slice(2));

    if (options.printPrevious)
    {
        const tagNames = runGit(["tag", "--list", "v*"], workingDirectory).split(/\r?\n/).filter((tagName) => tagName !== "");
        const previousTag = selectPreviousTag(tagNames, options.current);

        process.stdout.write(`${previousTag === null ? NO_PREVIOUS_TAG : previousTag}\n`);
        return;
    }

    const releaseNotes = buildReleaseNotes(
    {
        previousTag: options.previous === NO_PREVIOUS_TAG ? null : options.previous,
        currentTag: options.current,
        currentRef: options.ref === undefined ? options.current : options.ref,
        repository: process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
        workingDirectory,
    });

    process.stdout.write(releaseNotes);
}

if (require.main === module)
{
    try
    {
        main();
    }
    catch (failure)
    {
        process.stderr.write(`release-notes: ${failure.message}\n`);
        process.exitCode = 1;
    }
}

module.exports =
{
    isReleaseTag,
    parseReleaseTag,
    compareReleaseTags,
    selectPreviousTag,
    selectPluginManifestPaths,
    readPluginVersions,
    comparePluginVersions,
    parseCommitLog,
    renderReleaseNotes,
    buildReleaseNotes,
    parseCommandLine,
    LOG_FIELD_SEPARATOR,
};
