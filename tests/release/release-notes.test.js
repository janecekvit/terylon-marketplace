// The release notes a tag's release carries: every plugin with its version, what changed since the
// previous tag, and the pull requests merged in between. Pure functions against fixtures, then the
// whole build against a throwaway git repository with real tags.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fileSystem = require("node:fs");
const operatingSystem = require("node:os");
const path = require("node:path");

const releaseNotes = require("./release-notes.js");

// The repository the rendered links point into, in every fixture.
const FIXTURE_REPOSITORY = "contoso/marketplace";

// A commit id long enough to look like git's.
const FIXTURE_COMMIT_ID = "0123456789abcdef0123456789abcdef01234567";

function logLine(commitId, subject)
{
    return `${commitId}${releaseNotes.LOG_FIELD_SEPARATOR}${subject}`;
}

test("a release tag is exactly vMAJOR.MINOR.PATCH", () =>
{
    for (const acceptedTag of ["v1.0.0", "v0.0.1", "v10.20.30"])
    {
        assert.equal(releaseNotes.isReleaseTag(acceptedTag), true, acceptedTag);
    }

    for (const refusedTag of ["1.0.0", "v1.0", "v1.0.0-rc.1", "v01.0.0", "v1.0.0+build", "v2026-10-22", "V1.0.0", " v1.0.0", "v1.0.0\n"])
    {
        assert.equal(releaseNotes.isReleaseTag(refusedTag), false, JSON.stringify(refusedTag));
    }

    assert.throws(() => releaseNotes.parseReleaseTag("v1.0"), /not a release tag/);
});

test("tags compare by number, not by text", () =>
{
    assert.ok(releaseNotes.compareReleaseTags("v1.10.0", "v1.9.0") > 0);
    assert.ok(releaseNotes.compareReleaseTags("v2.0.0", "v1.99.99") > 0);
    assert.equal(releaseNotes.compareReleaseTags("v1.2.3", "v1.2.3"), 0);
});

test("the previous tag is the highest release tag below the current one", () =>
{
    const tagNames = ["v1.0.0", "v1.9.0", "v1.10.0", "v2.0.0", "v1.10.1-rc.1", "v2026-10-22", "latest"];

    assert.equal(releaseNotes.selectPreviousTag(tagNames, "v1.10.1"), "v1.10.0");
    assert.equal(releaseNotes.selectPreviousTag(tagNames, "v2.0.0"), "v1.10.0");
    assert.equal(releaseNotes.selectPreviousTag(tagNames, "v1.0.0"), null);
    assert.equal(releaseNotes.selectPreviousTag([], "v1.0.0"), null);
    assert.throws(() => releaseNotes.selectPreviousTag(tagNames, "v2026-10-22"), /not a release tag/);
});

test("only plugin manifests are read from the tree listing", () =>
{
    const treeListing = [
        "plugins/CLAUDE.md",
        "plugins/terylon-git/.claude-plugin/plugin.json",
        "plugins/terylon-core/.claude-plugin/plugin.json",
        "plugins/terylon-core/skills/measure/SKILL.md",
        "plugins/terylon-core/nested/.claude-plugin/plugin.json",
        "",
    ].join("\r\n");

    assert.deepEqual(releaseNotes.selectPluginManifestPaths(treeListing),
    [
        "plugins/terylon-core/.claude-plugin/plugin.json",
        "plugins/terylon-git/.claude-plugin/plugin.json",
    ]);
});

test("a plugin is named by its manifest, or by its directory when the manifest names none", () =>
{
    const versions = releaseNotes.readPluginVersions(
    {
        "plugins/alpha/.claude-plugin/plugin.json": JSON.stringify({ name: "alpha-renamed", version: "1.2.3" }),
        "plugins/beta/.claude-plugin/plugin.json": JSON.stringify({ version: "0.1.0" }),
        "plugins/gamma/.claude-plugin/plugin.json": JSON.stringify({ name: "gamma" }),
    });

    assert.deepEqual([...versions], [["alpha-renamed", "1.2.3"], ["beta", "0.1.0"], ["gamma", "unversioned"]]);
    assert.throws(() => releaseNotes.readPluginVersions({ "plugins/broken/.claude-plugin/plugin.json": "{" }), /plugins\/broken.*not valid JSON/);
});

test("every plugin gets a row, marked new, changed, unchanged or removed", () =>
{
    const previousVersions = new Map([["terylon-ado", "1.5.1"], ["terylon-core", "1.5.0"], ["terylon-metrics", "0.3.0"]]);
    const currentVersions = new Map([["terylon-ado", "1.5.2"], ["terylon-core", "1.5.0"], ["terylon-os", "1.0.0"]]);

    assert.deepEqual(releaseNotes.comparePluginVersions(previousVersions, currentVersions),
    [
        { pluginName: "terylon-ado", previousVersion: "1.5.1", currentVersion: "1.5.2", status: "changed" },
        { pluginName: "terylon-core", previousVersion: "1.5.0", currentVersion: "1.5.0", status: "unchanged" },
        { pluginName: "terylon-metrics", previousVersion: "0.3.0", currentVersion: null, status: "removed" },
        { pluginName: "terylon-os", previousVersion: null, currentVersion: "1.0.0", status: "new" },
    ]);
});

test("with no previous tag every plugin is new", () =>
{
    const rows = releaseNotes.comparePluginVersions(null, new Map([["beta", "1.0.0"], ["alpha", "2.0.0"]]));

    assert.deepEqual(rows.map((row) => [row.pluginName, row.status]), [["alpha", "new"], ["beta", "new"]]);
});

test("pull requests come from squash and merge subjects; every other commit is kept apart", () =>
{
    const logOutput = [
        logLine("c3", "Sign every release and attest its provenance (#14)"),
        logLine("c2", "Merge pull request #12 from contoso/feat/pane"),
        logLine("c1", "Mention issue #9 in the middle, not at the end"),
        logLine("c0", "Ends with a number but no hash (12)"),
        "",
    ].join("\n");

    assert.deepEqual(releaseNotes.parseCommitLog(logOutput),
    {
        pullRequests:
        [
            { number: 14, title: "Sign every release and attest its provenance", commitId: "c3" },
            { number: 12, title: "Merge of contoso/feat/pane", commitId: "c2" },
        ],
        otherCommits:
        [
            { commitId: "c1", subject: "Mention issue #9 in the middle, not at the end" },
            { commitId: "c0", subject: "Ends with a number but no hash (12)" },
        ],
    });
});

test("the notes list every plugin, the changes since the previous tag and the pull requests", () =>
{
    const markdown = releaseNotes.renderReleaseNotes(
    {
        repository: FIXTURE_REPOSITORY,
        previousTag: "v1.0.0",
        currentTag: "v1.1.0",
        pluginRows:
        [
            { pluginName: "alpha", previousVersion: "1.0.0", currentVersion: "1.1.0", status: "changed" },
            { pluginName: "beta", previousVersion: "2.0.0", currentVersion: "2.0.0", status: "unchanged" },
            { pluginName: "gamma", previousVersion: null, currentVersion: "0.1.0", status: "new" },
            { pluginName: "delta", previousVersion: "0.9.0", currentVersion: null, status: "removed" },
        ],
        pullRequests: [{ number: 14, title: "Pipes | and <tags> stay text", commitId: FIXTURE_COMMIT_ID }],
        otherCommits: [{ commitId: FIXTURE_COMMIT_ID, subject: "A direct commit" }],
    });

    assert.match(markdown, /^## Plugins$/m);
    assert.match(markdown, /^\| Plugin \| Version \| Since v1\.0\.0 \|$/m);
    assert.match(markdown, /^\| \*\*alpha\*\* \| `1\.1\.0` \| 1\.0\.0 → 1\.1\.0 \|$/m);
    assert.match(markdown, /^\| beta \| `2\.0\.0` \| unchanged \|$/m);
    assert.match(markdown, /^\| \*\*gamma\*\* \| `0\.1\.0` \| new \|$/m);
    assert.match(markdown, /^\| delta \| not shipped \| removed \(was 0\.9\.0\) \|$/m);
    assert.match(markdown, /^- Pipes \\\| and &lt;tags> stay text \(\[#14\]\(https:\/\/github\.com\/contoso\/marketplace\/pull\/14\)\)$/m);
    assert.match(markdown, /^## Other commits$/m);
    assert.match(markdown, /^- A direct commit \(\[0123456\]\(https:\/\/github\.com\/contoso\/marketplace\/commit\/0123456789abcdef0123456789abcdef01234567\)\)$/m);
    assert.match(markdown, /gh attestation verify terylon-marketplace-v1\.1\.0\.tar\.gz -R contoso\/marketplace/);
    assert.match(markdown, /compare\/v1\.0\.0\.\.\.v1\.1\.0$/m);
});

test("the first release says so, and has no changelog link", () =>
{
    const markdown = releaseNotes.renderReleaseNotes(
    {
        repository: FIXTURE_REPOSITORY,
        previousTag: null,
        currentTag: "v1.0.0",
        pluginRows: [{ pluginName: "alpha", previousVersion: null, currentVersion: "1.0.0", status: "new" }],
        pullRequests: [],
        otherCommits: [],
    });

    assert.match(markdown, /^\| \*\*alpha\*\* \| `1\.0\.0` \| first release \|$/m);
    assert.match(markdown, /No pull request is named in this history\./);
    assert.doesNotMatch(markdown, /Other commits/);
    assert.doesNotMatch(markdown, /compare\//);
});

test("the notes carry no attribution and no session link", () =>
{
    const markdown = releaseNotes.renderReleaseNotes(
    {
        repository: FIXTURE_REPOSITORY,
        previousTag: "v1.0.0",
        currentTag: "v1.0.1",
        pluginRows: [],
        pullRequests: [],
        otherCommits: [],
    });

    assert.doesNotMatch(markdown, /Co-Authored-By|Generated with|claude\.ai/i);
    assert.doesNotMatch(markdown, /—/, "no em dash in generated content");
});

test("the command line needs --current, and --previous unless only the previous tag is asked for", () =>
{
    assert.deepEqual(releaseNotes.parseCommandLine(["--previous", "none", "--current", "v1.0.0"]),
        { previous: "none", current: "v1.0.0", ref: undefined, printPrevious: false });
    assert.deepEqual(releaseNotes.parseCommandLine(["--print-previous", "--current", "v1.0.0"]),
        { previous: undefined, current: "v1.0.0", ref: undefined, printPrevious: true });
    assert.throws(() => releaseNotes.parseCommandLine(["--current", "v1.0.0"]), /--previous/);
    assert.throws(() => releaseNotes.parseCommandLine(["--previous", "none"]), /--current/);
    assert.throws(() => releaseNotes.parseCommandLine(["--previous", "--current", "v1.0.0"]), /needs a value/);
    assert.throws(() => releaseNotes.parseCommandLine(["--current", "v1.0.0", "--verbose"]), /unknown argument/);
});

function createFixtureRepository()
{
    const repositoryDirectory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), "release-notes-"));
    const gitEnvironment =
    {
        ...process.env,
        GIT_AUTHOR_NAME: "alice",
        GIT_AUTHOR_EMAIL: "alice@contoso.example",
        GIT_COMMITTER_NAME: "alice",
        GIT_COMMITTER_EMAIL: "alice@contoso.example",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: path.join(repositoryDirectory, ".no-global-config"),
    };

    function git(...gitArguments)
    {
        return childProcess.execFileSync("git", gitArguments, { cwd: repositoryDirectory, env: gitEnvironment, encoding: "utf8" });
    }

    function writeManifest(pluginDirectory, version)
    {
        const manifestDirectory = path.join(repositoryDirectory, "plugins", pluginDirectory, ".claude-plugin");

        fileSystem.mkdirSync(manifestDirectory, { recursive: true });
        fileSystem.writeFileSync(path.join(manifestDirectory, "plugin.json"), JSON.stringify({ name: pluginDirectory, version }));
    }

    git("init", "--quiet", "--initial-branch=main");
    git("config", "commit.gpgsign", "false");
    git("config", "tag.gpgsign", "false");

    return { repositoryDirectory, git, writeManifest };
}

test("built against a real repository: versions at each tag and the pull requests between them", (testContext) =>
{
    const fixture = createFixtureRepository();

    testContext.after(() => fileSystem.rmSync(fixture.repositoryDirectory, { recursive: true, force: true }));

    fixture.writeManifest("alpha", "1.0.0");
    fixture.writeManifest("beta", "1.0.0");
    fixture.git("add", ".");
    fixture.git("commit", "--quiet", "--message", "The first two plugins");
    fixture.git("tag", "v1.0.0");

    fixture.writeManifest("alpha", "1.1.0");
    fixture.git("add", ".");
    fixture.git("commit", "--quiet", "--message", "alpha learns a trick (#3)");

    fixture.writeManifest("gamma", "0.1.0");
    fixture.git("add", ".");
    fixture.git("commit", "--quiet", "--message", "gamma joins the marketplace (#4)");
    fixture.git("tag", "v1.1.0");

    const firstNotes = releaseNotes.buildReleaseNotes(
    {
        previousTag: null,
        currentTag: "v1.0.0",
        currentRef: "v1.0.0",
        repository: FIXTURE_REPOSITORY,
        workingDirectory: fixture.repositoryDirectory,
    });

    assert.match(firstNotes, /^\| \*\*alpha\*\* \| `1\.0\.0` \| first release \|$/m);
    assert.match(firstNotes, /^- The first two plugins /m);

    const secondNotes = releaseNotes.buildReleaseNotes(
    {
        previousTag: "v1.0.0",
        currentTag: "v1.1.0",
        currentRef: "v1.1.0",
        repository: FIXTURE_REPOSITORY,
        workingDirectory: fixture.repositoryDirectory,
    });

    assert.match(secondNotes, /^\| \*\*alpha\*\* \| `1\.1\.0` \| 1\.0\.0 → 1\.1\.0 \|$/m);
    assert.match(secondNotes, /^\| beta \| `1\.0\.0` \| unchanged \|$/m);
    assert.match(secondNotes, /^\| \*\*gamma\*\* \| `0\.1\.0` \| new \|$/m);
    assert.match(secondNotes, /^- gamma joins the marketplace \(\[#4\]/m);
    assert.match(secondNotes, /^- alpha learns a trick \(\[#3\]/m);
    assert.doesNotMatch(secondNotes, /The first two plugins/, "a commit before the previous tag is not listed");
    assert.doesNotMatch(secondNotes, /Other commits/);

    assert.throws(() => releaseNotes.buildReleaseNotes(
    {
        previousTag: "v1.1.0",
        currentTag: "v1.0.0",
        currentRef: "v1.0.0",
        repository: FIXTURE_REPOSITORY,
        workingDirectory: fixture.repositoryDirectory,
    }), /not below/);
});
