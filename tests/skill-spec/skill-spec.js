// Holds a skill directory to the Agent Skills specification (agentskills.io/specification) and to this
// repository's own skill conventions. Each check returns problems as strings; an empty list is a pass.
//
// The official validator, skills-ref, checks the frontmatter and the name only. This guard checks those
// the same way, plus what the specification recommends and skills-ref leaves out: the body's size, the
// layout of the supporting files, and that every file reference resolves inside the skill.
"use strict";

const fileSystem = require("node:fs");
const path = require("node:path");

// The frontmatter keys the specification defines. Any other key is refused, as skills-ref refuses it.
const SPECIFICATION_KEYS = Object.freeze(["name", "description", "license", "compatibility", "metadata", "allowed-tools"]);

// Lowercase letters, digits and single hyphens, neither leading nor trailing.
const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_COMPATIBILITY_LENGTH = 500;

// The specification: keep SKILL.md under 500 lines, and its body under about 5000 tokens.
const MAX_BODY_LINES = 499;
const MAX_BODY_TOKENS = 5000;

// A token estimate of four characters per token, the usual figure for English prose.
const CHARACTERS_PER_TOKEN = 4;

// The specification's three supporting folders. Nothing else sits beside SKILL.md.
const SUPPORTING_FOLDERS = Object.freeze(["references", "assets", "scripts"]);

// This repository's convention: a description opens with its trigger.
const DESCRIPTION_OPENING = /^Use when /;

// A path into one of the supporting folders, as prose, a link or a command names it.
const SUPPORTING_PATH = /(?<![\w./}-])((?:references|assets|scripts)\/[\w./-]*[\w-])/g;

// A path that Claude Code anchors at the skill root, for a command run from the consumer's repository.
const SKILL_DIRECTORY_PATH = /\$\{CLAUDE_SKILL_DIR\}\/([\w./-]*[\w-])/g;

// A path anchored at the plugin root. The one allowed is the manifest a footer reads its version from.
const PLUGIN_ROOT_PATH = /\$\{CLAUDE_PLUGIN_ROOT\}(\/[\w./-]*[\w-])?/g;
const ALLOWED_PLUGIN_ROOT_PATHS = Object.freeze(["/.claude-plugin/plugin.json"]);

// The target of a Markdown link.
const LINK_TARGET = /\]\(([^)\s]+)\)/g;

// A link that leaves the file system: a web address, a mail address or an anchor in the same file.
const EXTERNAL_TARGET = /^(?:[a-z]+:|#)/i;

// An @-import, which Claude Code would force-load into context.
const AT_IMPORT = /(?:^|\s)@[\w./-]+\.md\b/m;

// The line that marks a reference as one of several identical copies, one per skill that needs it.
const COPY_MARKER = "<!-- An identical copy of this file sits in every skill that carries it; edit them together. -->";

// The YAML frontmatter at the top of SKILL.md.
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

// Reads the subset of YAML the skills use: scalars, quoted scalars, folded and literal blocks, and one
// level of nested mapping (metadata). Returns null when the block is not a mapping it can read.
function parseFrontmatter(text)
{
    const fields = {};
    const lines = text.split("\n");
    let index = 0;

    while (index < lines.length)
    {
        const line = lines[index];

        if (line.trim() === "" || line.trimStart().startsWith("#"))
        {
            index++;
            continue;
        }

        const keyMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s+(.*))?$/);

        if (!keyMatch)
        {
            return null;
        }

        const key = keyMatch[1];
        const rest = (keyMatch[2] || "").trim();
        const continuation = [];

        index++;

        while (index < lines.length && (lines[index].startsWith(" ") || lines[index].trim() === ""))
        {
            continuation.push(lines[index]);
            index++;
        }

        fields[key] = readValue(rest, continuation);
    }

    return fields;
}

function readValue(rest, continuation)
{
    const indented = continuation.filter((line) => line.trim() !== "");

    if (rest === "" && indented.length > 0 && indented.every((line) => /^\s+[A-Za-z0-9_.-]+:/.test(line)))
    {
        const mapping = {};

        for (const line of indented)
        {
            const entry = line.trim().match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);

            mapping[entry[1]] = unquote(entry[2]);
        }

        return mapping;
    }

    if (/^[>|][-+]?$/.test(rest))
    {
        const joiner = rest.startsWith(">") ? " " : "\n";

        return indented.map((line) => line.trim()).join(joiner);
    }

    return unquote([rest, ...indented.map((line) => line.trim())].join(" ").trim());
}

function unquote(value)
{
    if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\""))
    {
        return JSON.parse(value);
    }

    if (value.length >= 2 && value.startsWith("'") && value.endsWith("'"))
    {
        return value.slice(1, -1).replace(/''/g, "'");
    }

    return value;
}

// Claude Code splits allowed-tools on spaces and on commas outside parentheses; the specification writes spaces.
function hasCommaOutsideParentheses(value)
{
    let depth = 0;

    for (const character of value)
    {
        if (character === "(")
        {
            depth++;
        }
        else if (character === ")")
        {
            depth--;
        }
        else if (character === "," && depth === 0)
        {
            return true;
        }
    }

    return false;
}

function checkFrontmatter(fields, directoryName)
{
    const problems = [];

    for (const key of Object.keys(fields))
    {
        if (!SPECIFICATION_KEYS.includes(key))
        {
            problems.push(`frontmatter key '${key}' is not in the specification`);
        }
    }

    const name = fields.name;

    if (typeof name !== "string" || name === "")
    {
        problems.push("name is missing");
    }
    else
    {
        if (name.length > MAX_NAME_LENGTH)
        {
            problems.push(`name is ${name.length} characters, over ${MAX_NAME_LENGTH}`);
        }

        if (!NAME_PATTERN.test(name))
        {
            problems.push(`name '${name}' is not lowercase letters, digits and single inner hyphens`);
        }

        if (name !== directoryName)
        {
            problems.push(`name '${name}' does not match its directory '${directoryName}'`);
        }
    }

    const description = fields.description;

    if (typeof description !== "string" || description === "")
    {
        problems.push("description is missing");
    }
    else
    {
        if (description.length > MAX_DESCRIPTION_LENGTH)
        {
            problems.push(`description is ${description.length} characters, over ${MAX_DESCRIPTION_LENGTH}`);
        }

        if (!DESCRIPTION_OPENING.test(description))
        {
            problems.push("description does not open with 'Use when '");
        }
    }

    if ("compatibility" in fields)
    {
        const compatibility = fields.compatibility;

        if (typeof compatibility !== "string" || compatibility === "" || compatibility.length > MAX_COMPATIBILITY_LENGTH)
        {
            problems.push(`compatibility must be 1-${MAX_COMPATIBILITY_LENGTH} characters`);
        }
    }

    if ("metadata" in fields)
    {
        const metadata = fields.metadata;

        if (metadata === null || typeof metadata !== "object" || Object.values(metadata).some((value) => typeof value !== "string"))
        {
            problems.push("metadata must map string keys to string values");
        }
    }

    if ("allowed-tools" in fields)
    {
        const allowedTools = fields["allowed-tools"];

        if (typeof allowedTools !== "string" || allowedTools === "")
        {
            problems.push("allowed-tools must be a non-empty string");
        }
        else if (hasCommaOutsideParentheses(allowedTools))
        {
            problems.push("allowed-tools must be space-separated, as the specification writes it");
        }
    }

    return problems;
}

function checkBody(body)
{
    const problems = [];
    const lineCount = body.split("\n").length;
    const tokenEstimate = Math.ceil(body.length / CHARACTERS_PER_TOKEN);

    if (lineCount > MAX_BODY_LINES)
    {
        problems.push(`body is ${lineCount} lines, over ${MAX_BODY_LINES}`);
    }

    if (tokenEstimate > MAX_BODY_TOKENS)
    {
        problems.push(`body is about ${tokenEstimate} tokens, over ${MAX_BODY_TOKENS}`);
    }

    return problems;
}

// A reference must name a file one level inside a supporting folder, and that file must exist.
function checkReference(skillDirectory, reference, problems)
{
    const segments = reference.split("/");

    if (segments.includes(".."))
    {
        problems.push(`reference '${reference}' leaves the skill`);
        return;
    }

    if (segments.length !== 2 || !SUPPORTING_FOLDERS.includes(segments[0]))
    {
        problems.push(`reference '${reference}' is not one level inside references/, assets/ or scripts/`);
        return;
    }

    if (!fileSystem.existsSync(path.join(skillDirectory, reference)))
    {
        problems.push(`reference '${reference}' does not exist`);
    }
}

function checkReferences(skillDirectory, text)
{
    const problems = [];
    const references = new Set();

    for (const match of text.matchAll(SKILL_DIRECTORY_PATH))
    {
        references.add(match[1]);
    }

    for (const match of text.matchAll(SUPPORTING_PATH))
    {
        references.add(match[1]);
    }

    for (const match of text.matchAll(LINK_TARGET))
    {
        const target = match[1].split("#")[0];

        if (target !== "" && !EXTERNAL_TARGET.test(match[1]))
        {
            references.add(target);
        }
    }

    for (const match of text.matchAll(PLUGIN_ROOT_PATH))
    {
        // The variable named alone is prose about it, not a reference.
        if (match[1] !== undefined && !ALLOWED_PLUGIN_ROOT_PATHS.includes(match[1]))
        {
            problems.push(`reference '${match[0]}' reaches outside the skill`);
        }
    }

    if (/(?:^|[\s(`'"])\.\.\//m.test(text))
    {
        problems.push("a '../' path reaches outside the skill");
    }

    if (AT_IMPORT.test(text))
    {
        problems.push("an @-import force-loads a file; refer to it by relative path instead");
    }

    for (const reference of references)
    {
        checkReference(skillDirectory, reference, problems);
    }

    return problems;
}

// Only SKILL.md and the three supporting folders, each holding files and no folders.
function checkLayout(skillDirectory)
{
    const problems = [];

    for (const entry of fileSystem.readdirSync(skillDirectory, { withFileTypes: true }))
    {
        if (entry.isFile() && entry.name === "SKILL.md")
        {
            continue;
        }

        if (!entry.isDirectory() || !SUPPORTING_FOLDERS.includes(entry.name))
        {
            problems.push(`'${entry.name}' sits beside SKILL.md; supporting files go in references/, assets/ or scripts/`);
            continue;
        }

        for (const inner of fileSystem.readdirSync(path.join(skillDirectory, entry.name), { withFileTypes: true }))
        {
            if (inner.isDirectory())
            {
                problems.push(`'${entry.name}/${inner.name}/' nests a folder; keep supporting files one level deep`);
            }
        }
    }

    return problems;
}

// Every problem of one skill directory.
function checkSkill(skillDirectory)
{
    const skillFile = path.join(skillDirectory, "SKILL.md");

    if (!fileSystem.existsSync(skillFile))
    {
        return ["SKILL.md is missing"];
    }

    const text = fileSystem.readFileSync(skillFile, "utf8").replace(/\r\n/g, "\n");
    const frontmatterMatch = text.match(FRONTMATTER);

    if (!frontmatterMatch)
    {
        return ["SKILL.md does not open with a closed YAML frontmatter block"];
    }

    const fields = parseFrontmatter(frontmatterMatch[1]);

    if (fields === null)
    {
        return ["the frontmatter is not a mapping this guard can read"];
    }

    const body = text.slice(frontmatterMatch[0].length);

    return [
        ...checkFrontmatter(fields, path.basename(skillDirectory)),
        ...checkBody(body),
        ...checkReferences(skillDirectory, body),
        ...checkLayout(skillDirectory),
    ];
}

// A reference marked as a copy must be identical in every skill of the plugin that carries a file of its name.
function checkSharedReferences(skillDirectories)
{
    const problems = [];
    const textsByName = new Map();

    for (const skillDirectory of skillDirectories)
    {
        const referencesDirectory = path.join(skillDirectory, "references");

        if (!fileSystem.existsSync(referencesDirectory))
        {
            continue;
        }

        for (const name of fileSystem.readdirSync(referencesDirectory))
        {
            const text = fileSystem.readFileSync(path.join(referencesDirectory, name), "utf8");
            const holders = textsByName.get(name) || [];

            holders.push({ skillDirectory, text });
            textsByName.set(name, holders);
        }
    }

    for (const [name, holders] of textsByName)
    {
        const marked = holders.some((holder) => holder.text.includes(COPY_MARKER));

        if (marked && holders.some((holder) => holder.text !== holders[0].text))
        {
            const skills = holders.map((holder) => path.basename(holder.skillDirectory)).join(", ");

            problems.push(`references/${name} differs between ${skills}; the copies must be identical`);
        }
    }

    return problems;
}

module.exports =
{
    checkSkill,
    checkSharedReferences,
    parseFrontmatter,
    COPY_MARKER,
};
