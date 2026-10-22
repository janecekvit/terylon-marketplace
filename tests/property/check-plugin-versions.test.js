"use strict";

//
// Properties of the version rules in tests/versions/check-plugin-versions.js, over generated versions:
//
//   1  every well-formed MAJOR.MINOR.PATCH parses to its three numbers, and anything parseVersion
//      accepts prints back to exactly the text it was given — no second spelling of a version;
//   2  malformed versions are rejected: a prefix, a suffix, a leading zero, a missing or extra part,
//      whitespace, and anything that is not a string;
//   3  compareVersions is a total order, and the one numeric MAJOR.MINOR.PATCH ordering gives;
//   4  judgePlugin passes a changed plugin exactly when its version rose, and a raised major only
//      with the label `major`.
//
// Numbers stay within Number.MAX_SAFE_INTEGER; beyond it parseVersion's Number() rounds, which the
// pull request that added these tests reports. Run: npm ci && npm test, in tests/property/.
//

const { test } = require("node:test");
const assert = require("node:assert/strict");

const { loadFastCheck } = require("./load-fast-check.js");
const { VERDICT_PASS, VERDICT_FAIL, parseVersion, compareVersions, judgePlugin } = require("../versions/check-plugin-versions.js");

const { fastCheck, skipReason } = loadFastCheck();

// Pure functions: thousands of cases cost well under a second.
const RUNS_PER_PROPERTY = 2000;

function versionText(version)
{
    return `${version.major}.${version.minor}.${version.patch}`;
}

function manifestText(version)
{
    return JSON.stringify({ name: "terylon-example", version: versionText(version) });
}

// The numeric ordering, written independently of compareVersions: the first digit that differs decides.
function expectedOrder(leftVersion, rightVersion)
{
    const left = [leftVersion.major, leftVersion.minor, leftVersion.patch];
    const right = [rightVersion.major, rightVersion.minor, rightVersion.patch];
    const firstDifference = left.findIndex((number, index) => number !== right[index]);

    if (firstDifference === -1)
    {
        return 0;
    }

    return left[firstDifference] < right[firstDifference] ? -1 : 1;
}

function arbitraries()
{
    // Small numbers collide often, so equal and adjacent versions are exercised as much as distant ones.
    const component = fastCheck.oneof(fastCheck.integer({ min: 0, max: 12 }), fastCheck.maxSafeNat());
    const version = fastCheck.record({ major: component, minor: component, patch: component });

    const malformedText = fastCheck.oneof(
        version.map((value) => `v${versionText(value)}`),
        fastCheck.tuple(version, fastCheck.constantFrom("-beta", "-rc.1", "+build", ".0", " ", "\n", "x"))
            .map(([value, suffix]) => `${versionText(value)}${suffix}`),
        fastCheck.tuple(version, fastCheck.constantFrom(" ", "\t", "=", "^", "~"))
            .map(([value, prefix]) => `${prefix}${versionText(value)}`),
        fastCheck.tuple(version, fastCheck.integer({ min: 0, max: 2 }))
            .map(([value, position]) =>
            {
                const parts = versionText(value).split(".");
                parts[position] = `0${parts[position]}`;

                return parts.join(".");
            }),
        fastCheck.tuple(component, component).map(([major, minor]) => `${major}.${minor}`),
        fastCheck.tuple(version, component).map(([value, extra]) => `${versionText(value)}.${extra}`),
        fastCheck.constantFrom("", ".", "..", "1..2", "1.2.", ".1.2"));

    const notAString = fastCheck.anything().filter((value) => typeof value !== "string");

    return { version, malformedText, notAString };
}

test("a well-formed version parses to its numbers, and an accepted text is the one spelling of its version", { skip: skipReason }, () =>
{
    const { version } = arbitraries();

    fastCheck.assert(
        fastCheck.property(version, (value) =>
        {
            // fast-check builds records without a prototype; compare the plain object.
            assert.deepEqual(parseVersion(versionText(value)), { ...value });
        }),
        { numRuns: RUNS_PER_PROPERTY });

    fastCheck.assert(
        fastCheck.property(fastCheck.oneof(fastCheck.string(), fastCheck.stringMatching(/^[0-9.]{1,12}$/)), (text) =>
        {
            const parsed = parseVersion(text);

            assert.ok(parsed === null || versionText(parsed) === text, `${JSON.stringify(text)} parsed to ${JSON.stringify(parsed)}`);
        }),
        { numRuns: RUNS_PER_PROPERTY });
});

test("a malformed version, or one that is not a string, is rejected", { skip: skipReason }, () =>
{
    const { malformedText, notAString } = arbitraries();

    fastCheck.assert(
        fastCheck.property(fastCheck.oneof(malformedText, notAString), (value) =>
        {
            assert.equal(parseVersion(value), null, JSON.stringify(value));
        }),
        { numRuns: RUNS_PER_PROPERTY });
});

test("compareVersions is a total order, and the numeric MAJOR.MINOR.PATCH one", { skip: skipReason }, () =>
{
    const { version } = arbitraries();

    fastCheck.assert(
        fastCheck.property(version, version, version, (first, second, third) =>
        {
            const order = compareVersions(first, second);

            assert.ok([-1, 0, 1].includes(order), `returned ${order}`);
            assert.equal(order, expectedOrder(first, second));
            assert.equal(compareVersions(second, first), -order || 0, "antisymmetric");
            assert.equal(compareVersions(first, first), 0, "reflexive");
            assert.equal(order === 0, versionText(first) === versionText(second), "equal exactly when the texts are");

            if (order <= 0 && compareVersions(second, third) <= 0)
            {
                assert.ok(compareVersions(first, third) <= 0, "transitive");
            }
        }),
        { numRuns: RUNS_PER_PROPERTY });
});

test("a changed plugin passes exactly when its version rose, and a raised major only with the label `major`", { skip: skipReason }, () =>
{
    const { version } = arbitraries();

    fastCheck.assert(
        fastCheck.property(version, version, fastCheck.boolean(), (baseVersion, headVersion, majorAllowed) =>
        {
            const judgement = judgePlugin(
            {
                pluginName: "terylon-example",
                changed: true,
                baseManifestText: manifestText(baseVersion),
                headManifestText: manifestText(headVersion),
                headDirectoryPresent: true,
                majorAllowed,
            });

            const rose = expectedOrder(headVersion, baseVersion) > 0;
            const majorRaised = headVersion.major !== baseVersion.major;
            const expectedVerdict = rose && (!majorRaised || majorAllowed) ? VERDICT_PASS : VERDICT_FAIL;

            assert.equal(judgement.verdict, expectedVerdict, `${versionText(baseVersion)} → ${versionText(headVersion)}, major allowed: ${majorAllowed}: ${judgement.reason}`);
        }),
        { numRuns: RUNS_PER_PROPERTY });
});
