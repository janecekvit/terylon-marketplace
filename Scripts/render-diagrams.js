#!/usr/bin/env node
// Formats, validates and renders every docs/**/*.d2 to the .svg beside it.
//
//   node Scripts/render-diagrams.js            format each source in place and render it
//   node Scripts/render-diagrams.js --check    fail on an unformatted or invalid source, or on a stale
//                                              or missing SVG - what the Diagrams workflow runs
//
// Install D2 the way CI does, so every SVG comes from the same build:
//   go install github.com/d2lang/d2@v0.9.0
"use strict";

const childProcess = require("node:child_process");
const path = require("node:path");

// The D2 release the committed SVGs are rendered with. CI installs exactly this one; a different
// release lays out and serialises differently, and every SVG would read as stale.
const D2_VERSION = "v0.9.0";

// Where the sources live, as a git pathspec: every .d2 under docs/, at any depth.
const SOURCE_PATHSPEC = "docs/*.d2";

// What --check holds against the committed tree: the sources (d2 fmt rewrites them) and the SVGs.
const RENDERED_PATHSPECS = ["docs/*.d2", "docs/*.svg"];

// The one flag the script takes.
const CHECK_FLAG = "--check";

const USAGE = "usage: node Scripts/render-diagrams.js [--check]";

/** Reads the arguments: { isCheck } for none or --check, { error } for anything else. */
function parseArguments(argumentList)
{
    if (argumentList.length === 0)
    {
        return { isCheck: false };
    }

    if (argumentList.length === 1 && argumentList[0] === CHECK_FLAG)
    {
        return { isCheck: true };
    }

    return { error: USAGE };
}

/** The SVG a source renders to: the same path with .svg in place of .d2. */
function renderedPathFor(sourcePath)
{
    const parsedPath = path.posix.parse(sourcePath);

    return path.posix.join(parsedPath.dir, `${parsedPath.name}.svg`);
}

/** Splits git's newline-separated path output into a sorted list without blanks or duplicates. */
function pathListFrom(gitOutput)
{
    const uniquePaths = new Set(gitOutput.split(/\r?\n/).map(line => line.trim()).filter(line => line !== ""));

    return [...uniquePaths].sort();
}

function run(command, commandArguments, repositoryRoot)
{
    const result = childProcess.spawnSync(command, commandArguments, { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

    if (result.error)
    {
        throw result.error;
    }

    return result;
}

function runOrExit(command, commandArguments, repositoryRoot)
{
    const result = run(command, commandArguments, repositoryRoot);

    if (result.stdout)
    {
        process.stdout.write(result.stdout);
    }

    if (result.stderr)
    {
        process.stderr.write(result.stderr);
    }

    if (result.status !== 0)
    {
        process.exit(result.status === null ? 1 : result.status);
    }

    return result;
}

function hasD2(repositoryRoot)
{
    try
    {
        return run("d2", ["--version"], repositoryRoot).status === 0;
    }
    catch
    {
        // spawnSync throws ENOENT when d2 is not on PATH; that is the answer, not a failure.
        return false;
    }
}

function main()
{
    const repositoryRoot = path.resolve(__dirname, "..");
    const parsedArguments = parseArguments(process.argv.slice(2));

    if (parsedArguments.error)
    {
        console.error(parsedArguments.error);
        process.exit(2);
    }

    if (!hasD2(repositoryRoot))
    {
        console.error(`d2 is not on PATH. Install it with: go install github.com/d2lang/d2@${D2_VERSION}`);
        process.exit(1);
    }

    // Tracked sources and new ones alike; a gitignored scratch tree under docs/ is never rendered.
    const listing = runOrExit("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", SOURCE_PATHSPEC], repositoryRoot);
    const sourceFiles = pathListFrom(listing.stdout);

    if (sourceFiles.length === 0)
    {
        console.log("no D2 sources under docs/");
        return;
    }

    for (const sourceFile of sourceFiles)
    {
        runOrExit("d2", parsedArguments.isCheck ? ["fmt", "--check", sourceFile] : ["fmt", sourceFile], repositoryRoot);
        runOrExit("d2", ["validate", sourceFile], repositoryRoot);
        runOrExit("d2", [sourceFile, renderedPathFor(sourceFile)], repositoryRoot);
    }

    if (!parsedArguments.isCheck)
    {
        return;
    }

    const changedFiles = run("git", ["diff", "--name-only", "--", ...RENDERED_PATHSPECS], repositoryRoot).stdout;
    const untrackedFiles = run("git", ["ls-files", "--others", "--exclude-standard", "--", ...RENDERED_PATHSPECS], repositoryRoot).stdout;
    const staleFiles = pathListFrom(`${changedFiles}\n${untrackedFiles}`);

    if (staleFiles.length > 0)
    {
        console.error(staleFiles.join("\n"));
        console.error("Diagram sources or rendered SVGs differ from what is committed.");
        console.error(`Run node Scripts/render-diagrams.js with D2 ${D2_VERSION} and commit the result.`);
        process.exit(1);
    }

    console.log(`${sourceFiles.length} diagram(s) formatted, valid and rendered as committed.`);
}

if (require.main === module)
{
    main();
}

module.exports = { parseArguments, renderedPathFor, pathListFrom, D2_VERSION };
