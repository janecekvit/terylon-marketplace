// The architecture diagrams (#36): each is a Mermaid flowchart with the ELK layout, written in the Markdown that owns it,
// and the plugin graph in the root README.md draws exactly the edges every plugin.json#dependencies declares.
// Whether a block parses is checked by hand with mermaid-cli; no job here starts a browser.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY_ROOT = path.join(__dirname, "..", "..");
const ARCHITECTURE_DIRECTORY = path.join(REPOSITORY_ROOT, "docs", "architecture");
const PLUGINS_DIRECTORY = path.join(REPOSITORY_ROOT, "plugins");

// A fenced Mermaid block: its body, up to the closing fence.
const MERMAID_BLOCK = /^```mermaid\n([\s\S]*?)^```$/gm;

// The front matter that selects the ELK layout, as the first lines of a block.
const ELK_FRONT_MATTER = /^---\nconfig:\n  layout: elk\n---\n/;

// A node definition whose label starts with a plugin slug: `id["terylon-…<br/>…"]`, with or without a class.
const PLUGIN_NODE = /^\s*(\w+)\["(terylon-[a-z]+)[<"]/gm;

// An edge between two nodes: `from --> to` (declared) or `from -.-> to` / `from -.->|"…"| to` (dashed).
const EDGE = /^\s*(\w+)\s+(-->|-\.->)(?:\|"[^"]*"\|)?\s+(\w+)\s*$/gm;

function mermaidBlocksOf(filePath)
{
    const content = fs.readFileSync(filePath, "utf8");

    return [...content.matchAll(MERMAID_BLOCK)].map((match) => match[1]);
}

function pluginGraphBlock()
{
    const readme = fs.readFileSync(path.join(REPOSITORY_ROOT, "README.md"), "utf8");
    const section = readme.slice(readme.indexOf("\n## Plugins\n"));
    const blocks = [...section.matchAll(MERMAID_BLOCK)];

    assert.ok(blocks.length > 0, "README.md's Plugins section draws no Mermaid block");

    return blocks[0][1];
}

function declaredDependencies()
{
    const dependencies = new Map();

    for (const slug of fs.readdirSync(PLUGINS_DIRECTORY))
    {
        const manifestPath = path.join(PLUGINS_DIRECTORY, slug, ".claude-plugin", "plugin.json");

        if (fs.existsSync(manifestPath))
        {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

            dependencies.set(slug, manifest.dependencies || []);
        }
    }

    return dependencies;
}

function isReachableWithout(dependencies, fromSlug, toSlug)
{
    // Whether toSlug is reached from fromSlug through some other declared dependency than the direct one.
    const pending = (dependencies.get(fromSlug) || []).filter((slug) => slug !== toSlug);
    const visited = new Set();

    while (pending.length > 0)
    {
        const current = pending.pop();

        if (current === toSlug)
        {
            return true;
        }

        if (!visited.has(current))
        {
            visited.add(current);
            pending.push(...(dependencies.get(current) || []));
        }
    }

    return false;
}

test("every Mermaid block in docs/architecture and the README's plugin graph takes the ELK layout and is a flowchart", () =>
{
    const architectureFiles = fs.readdirSync(ARCHITECTURE_DIRECTORY)
        .filter((fileName) => fileName.endsWith(".md"))
        .map((fileName) => path.join(ARCHITECTURE_DIRECTORY, fileName));
    const blocks = architectureFiles.flatMap(mermaidBlocksOf).concat([pluginGraphBlock()]);

    assert.ok(blocks.length >= 3, `expected at least the three architecture diagrams, found ${blocks.length}`);

    for (const block of blocks)
    {
        assert.match(block, ELK_FRONT_MATTER, `a block lacks the ELK front matter:\n${block.slice(0, 200)}`);
        assert.match(block, /^flowchart (TD|TB|BT|LR|RL)$/m, `a block is not a flowchart:\n${block.slice(0, 200)}`);
    }
});

test("no D2 source or generated SVG is left in docs/architecture", () =>
{
    const leftovers = fs.readdirSync(ARCHITECTURE_DIRECTORY).filter((fileName) => /\.(d2|svg)$/.test(fileName));

    assert.deepEqual(leftovers, []);
});

test("the README's plugin graph draws every declared dependency once, dashed exactly where the chain already reaches it", () =>
{
    const block = pluginGraphBlock();
    const slugById = new Map([...block.matchAll(PLUGIN_NODE)].map((match) => [match[1], match[2]]));
    const dependencies = declaredDependencies();

    assert.deepEqual([...slugById.values()].sort(), [...dependencies.keys()].sort(), "the graph's plugins are not the plugins/ directory's");

    const drawnEdges = [...block.matchAll(EDGE)]
        .filter((match) => slugById.has(match[1]) && slugById.has(match[3]))
        .map((match) => `${slugById.get(match[1])} ${match[2] === "-.->" ? "-.->" : "-->"} ${slugById.get(match[3])}`)
        .sort();
    const expectedEdges = [...dependencies.entries()]
        .flatMap(([slug, declared]) => declared.map((dependency) =>
            `${slug} ${isReachableWithout(dependencies, slug, dependency) ? "-.->" : "-->"} ${dependency}`))
        .sort();

    assert.deepEqual(drawnEdges, expectedEdges);
});
