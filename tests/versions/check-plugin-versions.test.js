"use strict";

//
// The version rules the pull-request check enforces. Run: node --test tests/versions/check-plugin-versions.test.js
//

const { test } = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
    VERDICT_PASS,
    VERDICT_FAIL,
    parseVersion,
    compareVersions,
    changedPluginNames,
    judgePlugin,
    judgeMarketplace,
    parseArguments,
} = require("./check-plugin-versions.js");

// The checker's command line, for the end-to-end case.
const CHECKER_PATH = path.join(__dirname, "check-plugin-versions.js");

// A throwaway repository's commits need an author; passed per command, so no git config is touched.
const FIXTURE_AUTHOR = ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "-c", "commit.gpgsign=false"];

function manifestText(version)
{
    return JSON.stringify({ name: "terylon-example", version }, null, 2);
}

function judge(overrides)
{
    return judgePlugin(
    {
        pluginName: "terylon-example",
        changed: true,
        baseManifestText: manifestText("1.4.2"),
        headManifestText: manifestText("1.4.2"),
        headDirectoryPresent: true,
        majorAllowed: false,
        ...overrides,
    });
}

test("a version is MAJOR.MINOR.PATCH and nothing else", () =>
{
    assert.deepEqual(parseVersion("1.13.0"), { major: 1, minor: 13, patch: 0 });

    for (const malformed of ["1.2", "1.2.3.4", "v1.2.3", "1.2.3-beta", "1.2.3+build", "01.2.3", "1.2.x", " 1.2.3", "", null, 123])
    {
        assert.equal(parseVersion(malformed), null, `${JSON.stringify(malformed)} must be rejected`);
    }
});

test("versions compare by number, not as text", () =>
{
    assert.equal(compareVersions(parseVersion("1.10.0"), parseVersion("1.9.9")), 1);
    assert.equal(compareVersions(parseVersion("1.9.9"), parseVersion("2.0.0")), -1);
    assert.equal(compareVersions(parseVersion("1.2.3"), parseVersion("1.2.3")), 0);
});

test("only files inside a plugin's directory name that plugin", () =>
{
    const names = changedPluginNames([
        "plugins/CLAUDE.md",
        "README.md",
        "plugins/terylon-dev/skills/develop/SKILL.md",
        "plugins/terylon-dev/.claude-plugin/plugin.json",
        "plugins/terylon-ado/shared/ado-server.js",
        "tests/versions/check-plugin-versions.js",
    ]);

    assert.deepEqual(names, ["terylon-ado", "terylon-dev"]);
});

test("an unchanged plugin passes, whatever its version", () =>
{
    const judgement = judge({ changed: false });

    assert.equal(judgement.verdict, VERDICT_PASS);
    assert.equal(judgement.reason, "unchanged");
});

test("changed files without a raised version fail", () =>
{
    const judgement = judge({});

    assert.equal(judgement.verdict, VERDICT_FAIL);
    assert.match(judgement.reason, /not raised/);
});

test("a lowered version fails", () =>
{
    const judgement = judge({ headManifestText: manifestText("1.4.1") });

    assert.equal(judgement.verdict, VERDICT_FAIL);
    assert.match(judgement.reason, /not raised/);
});

test("a raised patch passes", () =>
{
    const judgement = judge({ headManifestText: manifestText("1.4.3") });

    assert.equal(judgement.verdict, VERDICT_PASS);
    assert.equal(judgement.reason, "patch raised");
    assert.equal(judgement.baseVersionText, "1.4.2");
    assert.equal(judgement.headVersionText, "1.4.3");
});

test("a raised minor passes", () =>
{
    const judgement = judge({ headManifestText: manifestText("1.5.0") });

    assert.equal(judgement.verdict, VERDICT_PASS);
    assert.equal(judgement.reason, "minor raised");
});

test("a raised major fails without the label `major`", () =>
{
    const judgement = judge({ headManifestText: manifestText("2.0.0") });

    assert.equal(judgement.verdict, VERDICT_FAIL);
    assert.match(judgement.reason, /label `major`/);
});

test("a raised major passes with the label `major`", () =>
{
    const judgement = judge({ headManifestText: manifestText("2.0.0"), majorAllowed: true });

    assert.equal(judgement.verdict, VERDICT_PASS);
    assert.equal(judgement.reason, "major raised");
});

test("a new plugin passes from 1.0.0 up, and fails below it", () =>
{
    for (const version of ["1.0.0", "1.3.7", "3.0.0"])
    {
        const judgement = judge({ baseManifestText: null, headManifestText: manifestText(version) });

        assert.equal(judgement.verdict, VERDICT_PASS, version);
        assert.equal(judgement.reason, "new plugin");
    }

    const tooLow = judge({ baseManifestText: null, headManifestText: manifestText("0.9.0") });

    assert.equal(tooLow.verdict, VERDICT_FAIL);
    assert.match(tooLow.reason, /1\.0\.0/);
});

test("a deleted plugin passes; a plugin that lost only its plugin.json fails", () =>
{
    const deleted = judge({ headManifestText: null, headDirectoryPresent: false });

    assert.equal(deleted.verdict, VERDICT_PASS);
    assert.equal(deleted.reason, "deleted");

    const manifestGone = judge({ headManifestText: null, headDirectoryPresent: true });

    assert.equal(manifestGone.verdict, VERDICT_FAIL);
    assert.match(manifestGone.reason, /plugin\.json is gone/);
});

test("a malformed version fails, and so do a missing version and broken JSON", () =>
{
    const malformed = judge({ headManifestText: manifestText("1.5") });

    assert.equal(malformed.verdict, VERDICT_FAIL);
    assert.match(malformed.reason, /not MAJOR\.MINOR\.PATCH/);

    const missing = judge({ headManifestText: JSON.stringify({ name: "terylon-example" }) });

    assert.equal(missing.verdict, VERDICT_FAIL);
    assert.match(missing.reason, /declares no version/);

    const broken = judge({ headManifestText: "{ \"version\": " });

    assert.equal(broken.verdict, VERDICT_FAIL);
    assert.match(broken.reason, /not valid JSON/);
});

test("a malformed base version does not block the pull request that repairs it", () =>
{
    const judgement = judge({ baseManifestText: manifestText("1.4"), headManifestText: manifestText("1.4.0") });

    assert.equal(judgement.verdict, VERDICT_PASS);
});

test("marketplace.json without versions has nothing to compare", () =>
{
    const result = judgeMarketplace(
    {
        marketplaceText: JSON.stringify({ plugins: [{ name: "terylon-example", source: "./plugins/terylon-example" }] }),
        manifestVersionsByName: { "terylon-example": "1.4.2" },
    });

    assert.deepEqual(result, { listedCount: 0, violations: [] });
});

test("a version marketplace.json lists must equal plugin.json's", () =>
{
    const marketplaceText = JSON.stringify(
    {
        plugins:
        [
            { name: "terylon-example", version: "1.4.2" },
            { name: "terylon-other", version: "2.0.0" },
            { name: "terylon-orphan", version: "1.0.0" },
        ],
    });

    const result = judgeMarketplace(
    {
        marketplaceText,
        manifestVersionsByName: { "terylon-example": "1.4.2", "terylon-other": "2.0.1" },
    });

    assert.equal(result.listedCount, 3);
    assert.equal(result.violations.length, 2);
    assert.match(result.violations[0], /terylon-other at 2\.0\.0, and its plugin\.json says 2\.0\.1/);
    assert.match(result.violations[1], /terylon-orphan/);
});

test("the command line needs both refs and knows only its own flags", () =>
{
    assert.deepEqual(parseArguments(["--base", "a1", "--head", "b2"]), { base: "a1", head: "b2", majorAllowed: false });
    assert.deepEqual(parseArguments(["--major-allowed", "--head", "b2", "--base", "a1"]), { base: "a1", head: "b2", majorAllowed: true });
    assert.ok(parseArguments(["--base", "a1"]).problem);
    assert.ok(parseArguments(["--base", "--head", "b2"]).problem);
    assert.ok(parseArguments(["--base", "a1", "--head", "b2", "--force"]).problem);
});

//
// End to end, against a throwaway repository: a base commit with two plugins, then one head commit
// per case, each run through the command line exactly as the workflow runs it.
//

function git(repositoryDirectory, argumentList)
{
    return childProcess.execFileSync("git", [...FIXTURE_AUTHOR, ...argumentList],
    {
        cwd: repositoryDirectory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    }).trim();
}

function writeFile(repositoryDirectory, relativePath, content)
{
    const filePath = path.join(repositoryDirectory, ...relativePath.split("/"));

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}

function commitAll(repositoryDirectory, message)
{
    git(repositoryDirectory, ["add", "--all"]);
    git(repositoryDirectory, ["commit", "--quiet", "--message", message]);

    return git(repositoryDirectory, ["rev-parse", "HEAD"]);
}

function runChecker(repositoryDirectory, argumentList)
{
    const result = childProcess.spawnSync(process.execPath, [CHECKER_PATH, ...argumentList],
    {
        cwd: repositoryDirectory,
        encoding: "utf8",
    });

    return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

test("the command line, end to end in a throwaway repository", () =>
{
    const repositoryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-versions-"));

    try
    {
        git(repositoryDirectory, ["init", "--quiet"]);
        writeFile(repositoryDirectory, ".claude-plugin/marketplace.json", JSON.stringify({ plugins: [{ name: "terylon-alpha" }, { name: "terylon-beta" }] }));
        writeFile(repositoryDirectory, "plugins/CLAUDE.md", "conventions\n");
        writeFile(repositoryDirectory, "plugins/terylon-alpha/.claude-plugin/plugin.json", manifestText("1.2.3"));
        writeFile(repositoryDirectory, "plugins/terylon-alpha/skills/one/SKILL.md", "one\n");
        writeFile(repositoryDirectory, "plugins/terylon-beta/.claude-plugin/plugin.json", manifestText("1.0.0"));
        writeFile(repositoryDirectory, "plugins/terylon-beta/README.md", "beta\n");

        const base = commitAll(repositoryDirectory, "base");

        // Each case branches from the base and makes one head commit.
        function headFor(caseName, changes)
        {
            git(repositoryDirectory, ["checkout", "--quiet", "--detach", base]);
            changes();

            return commitAll(repositoryDirectory, caseName);
        }

        const docsOnly = headFor("docs only", () => writeFile(repositoryDirectory, "plugins/CLAUDE.md", "conventions, revised\n"));
        const noBump = headFor("no bump", () => writeFile(repositoryDirectory, "plugins/terylon-alpha/skills/one/SKILL.md", "one, revised\n"));
        const patchBump = headFor("patch bump", () =>
        {
            writeFile(repositoryDirectory, "plugins/terylon-alpha/skills/one/SKILL.md", "one, revised\n");
            writeFile(repositoryDirectory, "plugins/terylon-alpha/.claude-plugin/plugin.json", manifestText("1.2.4"));
        });
        const majorBump = headFor("major bump", () => writeFile(repositoryDirectory, "plugins/terylon-beta/.claude-plugin/plugin.json", manifestText("2.0.0")));
        const newAndDeleted = headFor("new and deleted", () =>
        {
            writeFile(repositoryDirectory, "plugins/terylon-gamma/.claude-plugin/plugin.json", manifestText("1.0.0"));
            fs.rmSync(path.join(repositoryDirectory, "plugins", "terylon-beta"), { recursive: true });
        });
        const marketplaceMismatch = headFor("marketplace mismatch", () =>
            writeFile(repositoryDirectory, ".claude-plugin/marketplace.json", JSON.stringify({ plugins: [{ name: "terylon-alpha", version: "1.2.2" }] })));

        const docsOnlyRun = runChecker(repositoryDirectory, ["--base", base, "--head", docsOnly]);

        assert.equal(docsOnlyRun.status, 0, docsOnlyRun.output);
        assert.match(docsOnlyRun.output, /lists no plugin versions/);
        assert.match(docsOnlyRun.output, /terylon-alpha\s+unchanged/);

        const noBumpRun = runChecker(repositoryDirectory, ["--base", base, "--head", noBump]);

        assert.equal(noBumpRun.status, 1, noBumpRun.output);
        assert.match(noBumpRun.output, /terylon-alpha\s+changed\s+1\.2\.3 → 1\.2\.3\s+FAIL/);

        const patchBumpRun = runChecker(repositoryDirectory, ["--base", base, "--head", patchBump]);

        assert.equal(patchBumpRun.status, 0, patchBumpRun.output);
        assert.match(patchBumpRun.output, /1\.2\.3 → 1\.2\.4\s+ok\s+patch raised/);

        const majorRun = runChecker(repositoryDirectory, ["--base", base, "--head", majorBump]);

        assert.equal(majorRun.status, 1, majorRun.output);
        assert.match(majorRun.output, /label `major`/);

        const majorAllowedRun = runChecker(repositoryDirectory, ["--base", base, "--head", majorBump, "--major-allowed"]);

        assert.equal(majorAllowedRun.status, 0, majorAllowedRun.output);

        const newAndDeletedRun = runChecker(repositoryDirectory, ["--base", base, "--head", newAndDeleted]);

        assert.equal(newAndDeletedRun.status, 0, newAndDeletedRun.output);
        assert.match(newAndDeletedRun.output, /terylon-gamma\s+changed\s+- → 1\.0\.0\s+ok\s+new plugin/);
        assert.match(newAndDeletedRun.output, /terylon-beta\s+changed\s+1\.0\.0 → -\s+ok\s+deleted/);

        const marketplaceRun = runChecker(repositoryDirectory, ["--base", base, "--head", marketplaceMismatch]);

        assert.equal(marketplaceRun.status, 1, marketplaceRun.output);
        assert.match(marketplaceRun.output, /lists terylon-alpha at 1\.2\.2, and its plugin\.json says 1\.2\.3/);

        const unknownRefRun = runChecker(repositoryDirectory, ["--base", base, "--head", "no-such-ref"]);

        assert.equal(unknownRefRun.status, 2, unknownRefRun.output);
    }
    finally
    {
        fs.rmSync(repositoryDirectory, { recursive: true, force: true });
    }
});
