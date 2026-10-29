#!/usr/bin/env node
// Warns about history written into code: an added comment line that names a pull request, an issue, a work
// item or a date. The rule is .claude/rules/comments.md; history belongs in the commit, the pull request
// and the issue, where it stays true. Each finding is a GitHub warning annotation, and the script exits 0
// whatever it finds: it fails only when it cannot read the diff.
//
// node tests/no-history-in-code/no-history-in-code.js --base <ref> --head <ref>
"use strict";

const childProcess = require("node:child_process");

// The comment syntaxes, keyed by file extension. A line comment marker, and whether /* */ blocks exist.
const COMMENT_SYNTAX = Object.freeze(
{
    ".js": { lineMarker: "//", blockComments: true },
    ".cjs": { lineMarker: "//", blockComments: true },
    ".mjs": { lineMarker: "//", blockComments: true },
    ".ts": { lineMarker: "//", blockComments: true },
    ".tsx": { lineMarker: "//", blockComments: true },
    ".yml": { lineMarker: "#", blockComments: false },
    ".yaml": { lineMarker: "#", blockComments: false },
    ".sh": { lineMarker: "#", blockComments: false },
    ".md": { lineMarker: null, blockComments: false, htmlComments: true },
});

// What history looks like inside a comment, each with the words the warning uses.
const HISTORY_PATTERNS = Object.freeze(
[
    { pattern: /(?<![\w&])#\d+\b/, names: "an issue or pull request number" },
    { pattern: /\bPR\s*#?\d+\b/i, names: "a pull request number" },
    { pattern: /\bpull\/\d+\b/, names: "a pull request link" },
    { pattern: /\bwork[ -]item\s*#?\d+\b/i, names: "a work item number" },
    { pattern: /\b\d{4}-\d{2}-\d{2}\b/, names: "a date" },
]);

// A hunk header of a zero-context diff: the first line number on the new side.
const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function extensionOf(filePath)
{
    const match = filePath.match(/\.[^./]+$/);

    return match ? match[0].toLowerCase() : "";
}

// The added lines of a unified diff, as { file, line, text }.
function addedLines(diffText)
{
    const lines = [];
    let file = null;
    let lineNumber = 0;

    for (const diffLine of diffText.split("\n"))
    {
        if (diffLine.startsWith("+++ "))
        {
            file = diffLine === "+++ /dev/null" ? null : diffLine.replace(/^\+\+\+ b\//, "");
            continue;
        }

        const hunk = diffLine.match(HUNK_HEADER);

        if (hunk)
        {
            lineNumber = Number(hunk[1]);
            continue;
        }

        if (file !== null && diffLine.startsWith("+"))
        {
            lines.push({ file, line: lineNumber, text: diffLine.slice(1) });
            lineNumber++;
        }
    }

    return lines;
}

// The comment text on one line, or null when the line holds none. Block comments are followed across the
// added lines of one file; a block that opened in an unchanged line is not seen, which only misses a warning.
function commentText(text, syntax, state)
{
    if (syntax.htmlComments)
    {
        return htmlCommentText(text, state);
    }

    if (syntax.blockComments && state.insideBlock)
    {
        const end = text.indexOf("*/");

        state.insideBlock = end === -1;

        return end === -1 ? text : text.slice(0, end);
    }

    const start = findCommentStart(text, syntax);

    if (start === null)
    {
        return null;
    }

    if (start.kind === "block")
    {
        const rest = text.slice(start.index + 2);
        const end = rest.indexOf("*/");

        state.insideBlock = end === -1;

        return end === -1 ? rest : rest.slice(0, end);
    }

    return text.slice(start.index + syntax.lineMarker.length);
}

// The text of an HTML comment on one line, followed across lines like a block comment. Found by position,
// not by a pattern, so a comment that spans lines is read whole.
function htmlCommentText(text, state)
{
    let rest = text;

    if (!state.insideBlock)
    {
        const start = text.indexOf("<!--");

        if (start === -1)
        {
            return null;
        }

        rest = text.slice(start + 4);
    }

    const end = rest.indexOf("-->");

    state.insideBlock = end === -1;

    return end === -1 ? rest : rest.slice(0, end);
}

// Where a comment starts on a line, outside any quoted string: { kind, index }, or null. A line marker counts
// only at the start of the line or after whitespace, so that a URL's // and a colour's # are not taken for one.
function findCommentStart(text, syntax)
{
    let quote = null;

    for (let index = 0; index < text.length; index++)
    {
        const character = text[index];

        if (quote !== null)
        {
            if (character === "\\")
            {
                index++;
            }
            else if (character === quote)
            {
                quote = null;
            }

            continue;
        }

        if (character === "\"" || character === "'" || character === "`")
        {
            quote = character;
            continue;
        }

        if (syntax.blockComments && text.startsWith("/*", index))
        {
            return { kind: "block", index };
        }

        if (syntax.lineMarker !== null && text.startsWith(syntax.lineMarker, index) && (index === 0 || /\s/.test(text[index - 1])))
        {
            return { kind: "line", index };
        }
    }

    return null;
}

// Every finding in a diff, as { file, line, names }.
function findHistory(diffText)
{
    const findings = [];
    const stateByFile = new Map();

    for (const added of addedLines(diffText))
    {
        const syntax = COMMENT_SYNTAX[extensionOf(added.file)];

        if (syntax === undefined)
        {
            continue;
        }

        const state = stateByFile.get(added.file) || { insideBlock: false };

        stateByFile.set(added.file, state);

        const comment = commentText(added.text, syntax, state);

        if (comment === null)
        {
            continue;
        }

        const matched = HISTORY_PATTERNS.filter((entry) => entry.pattern.test(comment));

        if (matched.length > 0)
        {
            findings.push({ file: added.file, line: added.line, names: matched.map((entry) => entry.names) });
        }
    }

    return findings;
}

// GitHub's escaping for an annotation's properties and message.
function escapeProperty(value)
{
    return String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/:/g, "%3A").replace(/,/g, "%2C");
}

function annotation(finding)
{
    const message = `A comment names ${finding.names.join(" and ")}. Code states what is true now; history goes in the commit, the pull request and the issue (.claude/rules/comments.md).`;

    return `::warning file=${escapeProperty(finding.file)},line=${finding.line}::${message.replace(/%/g, "%25")}`;
}

function parseArguments(argumentList)
{
    const options = { base: "origin/main", head: "HEAD" };

    for (let index = 0; index < argumentList.length; index++)
    {
        if (argumentList[index] === "--base" || argumentList[index] === "--head")
        {
            options[argumentList[index].slice(2)] = argumentList[index + 1];
            index++;
        }
        else
        {
            throw new Error(`unknown argument: ${argumentList[index]}`);
        }
    }

    return options;
}

// The diff of what the head adds since the merge base, as git prints it.
function readDiff(options, runGit)
{
    return runGit(["diff", "--unified=0", "--no-color", "--no-ext-diff", `${options.base}...${options.head}`]);
}

function defaultRunGit(gitArguments)
{
    const run = childProcess.spawnSync("git", gitArguments, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

    if (run.status !== 0)
    {
        throw new Error(`git ${gitArguments.join(" ")} failed: ${(run.stderr || "").trim()}`);
    }

    return run.stdout;
}

// The command line. Its collaborators are passed in, so the tests run it without a repository or a console.
function main(argumentList, { runGit = defaultRunGit, write = (text) => process.stdout.write(text) } = {})
{
    const options = parseArguments(argumentList);
    const findings = findHistory(readDiff(options, runGit));

    for (const finding of findings)
    {
        write(`${annotation(finding)}\n`);
    }

    write(`no-history-in-code: ${findings.length} comment line(s) with history, as warnings; this check never fails the build\n`);

    return findings;
}

if (require.main === module)
{
    try
    {
        main(process.argv.slice(2));
    }
    catch (error)
    {
        process.stderr.write(`no-history-in-code: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports =
{
    addedLines,
    annotation,
    findHistory,
    main,
};
