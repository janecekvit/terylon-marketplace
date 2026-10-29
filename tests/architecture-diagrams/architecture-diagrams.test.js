// The architecture diagrams (#36): each is a Mermaid flowchart with the ELK layout, written in the Markdown that owns it,
// every flowchart follows the adaptive style of .claude/rules/markdown.md (no theme of its own, so GitHub's light and dark
// themes both draw it), and the plugin graph in the root README.md draws exactly the edges every plugin.json#dependencies declares.
// Whether a block parses is checked by hand with mermaid-cli; no job here starts a browser.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPOSITORY_ROOT = path.join(__dirname, "..", "..");
const ARCHITECTURE_DIRECTORY = path.join(REPOSITORY_ROOT, "docs", "architecture");
const DOCS_DIRECTORY = path.join(REPOSITORY_ROOT, "docs");
const PLUGINS_DIRECTORY = path.join(REPOSITORY_ROOT, "plugins");

// A fenced Mermaid block: its body, up to the closing fence.
const MERMAID_BLOCK = /^```mermaid\n([\s\S]*?)^```$/gm;

// The front matter every flowchart opens with, exactly: the ELK layout and the padding that keeps labels off the border.
const ELK_FRONT_MATTER = /^---\nconfig:\n  layout: elk\n  flowchart:\n    padding: 16\n---\n/;

// What a flowchart must never set: a theme of its own stops GitHub switching it between light and dark, and a font
// family is measured in one font and drawn in another, which clips the labels.
const FORBIDDEN_SETTINGS = /\b(theme|themeVariables|fontFamily)\b["']?\s*:/;

// A node definition whose label starts with a plugin slug: `id["`terylon-…` followed by its next line, or `id["terylon-…"]`,
// with or without a class.
const PLUGIN_NODE = /^\s*(\w+)\["`?(terylon-[a-z]+)[\n"`]/gm;

// HTML inside a block: a `<br/>` or any other tag. A line break in a label is a Markdown string with a real newline.
const HTML_IN_BLOCK = /<\/?[a-z][a-z0-9]*\b[^>]*>/i;

// An edge between two nodes: `from --> to` (declared) or `from -.-> to` / `from -.->|"…"| to` (dashed).
const EDGE = /^\s*(\w+)\s+(-->|-\.->)(?:\|"[^"]*"\|)?\s+(\w+)\s*$/gm;

// A boundary's style line: `style id fill:#RRGGBBAA,stroke:#RRGGBB,color:#RRGGBB…`. The title is drawn in its color, over its
// semi-transparent fill, over the page.
const SUBGRAPH_STYLE = /^\s*style (\w+) (.*)$/gm;

// GitHub's two page backgrounds, light and dark: a boundary's title is drawn on both, since no flowchart sets a theme.
const PAGE_BACKGROUNDS = ["#ffffff", "#0d1117"];

// The contrast a boundary's title must reach on its tinted fill over each page background. No single colour reaches 4.5:1 on
// both (the best against that pair is about 4.3:1); the palette's title colours reach about 3.9:1, the old ones 2.6–3.5:1.
const TITLE_CONTRAST_FLOOR = 3.75;

function channelsOf(hexColour)
{
    const digits = hexColour.replace("#", "");

    return [0, 2, 4].map((offset) => parseInt(digits.slice(offset, offset + 2), 16));
}

function relativeLuminance(channels)
{
    // WCAG 2's relative luminance of an sRGB colour.
    const [red, green, blue] = channels.map((channel) =>
    {
        const unit = channel / 255;

        return unit <= 0.03928 ? unit / 12.92 : Math.pow((unit + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(firstChannels, secondChannels)
{
    const first = relativeLuminance(firstChannels);
    const second = relativeLuminance(secondChannels);

    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function titleContrastViolations(block)
{
    // Every boundary whose title falls under the floor on either page background, with the ratio it reaches there.
    const violations = [];

    for (const match of block.matchAll(SUBGRAPH_STYLE))
    {
        const properties = Object.fromEntries(match[2].split(",").map((pair) => pair.split(":").map((part) => part.trim())));

        if (!properties.color)
        {
            continue;
        }

        const fill = (properties.fill || "#00000000").replace("#", "");
        const fillChannels = channelsOf(`#${fill.slice(0, 6)}`);
        const fillAlpha = fill.length === 8 ? parseInt(fill.slice(6, 8), 16) / 255 : 1;

        for (const background of PAGE_BACKGROUNDS)
        {
            const backgroundChannels = channelsOf(background);
            const tinted = fillChannels.map((channel, index) => channel * fillAlpha + backgroundChannels[index] * (1 - fillAlpha));
            const ratio = contrastRatio(channelsOf(properties.color), tinted);

            if (ratio < TITLE_CONTRAST_FLOOR)
            {
                violations.push(`${match[1]}: ${properties.color} reaches ${ratio.toFixed(2)}:1 over ${background}`);
            }
        }
    }

    return violations;
}

function mermaidBlocksOf(filePath)
{
    const content = fs.readFileSync(filePath, "utf8");

    return [...content.matchAll(MERMAID_BLOCK)].map((match) => match[1]);
}

function markdownFilesUnder(directory)
{
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    {
        const entryPath = path.join(directory, entry.name);

        if (entry.isDirectory())
        {
            return markdownFilesUnder(entryPath);
        }

        return entry.name.endsWith(".md") ? [entryPath] : [];
    });
}

function pluginGraphBlock()
{
    const readme = fs.readFileSync(path.join(REPOSITORY_ROOT, "README.md"), "utf8");
    const section = readme.slice(readme.indexOf("\n## Architecture\n"));
    const blocks = [...section.matchAll(MERMAID_BLOCK)];

    assert.ok(blocks.length > 0, "README.md's Architecture section draws no Mermaid block");

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

test("every Mermaid block in docs/architecture and the README's plugin graph is a flowchart", () =>
{
    const architectureFiles = fs.readdirSync(ARCHITECTURE_DIRECTORY)
        .filter((fileName) => fileName.endsWith(".md"))
        .map((fileName) => path.join(ARCHITECTURE_DIRECTORY, fileName));
    const blocks = architectureFiles.flatMap(mermaidBlocksOf).concat([pluginGraphBlock()]);

    assert.ok(blocks.length >= 3, `expected at least the three architecture diagrams, found ${blocks.length}`);

    for (const block of blocks)
    {
        assert.match(block, /^flowchart (TD|TB|BT|LR|RL)$/m, `a block is not a flowchart:\n${block.slice(0, 200)}`);
    }
});

test("every flowchart in README.md and docs/ opens with the ELK front matter, sets no theme, theme variables or font, and holds no HTML", () =>
{
    const files = [path.join(REPOSITORY_ROOT, "README.md")].concat(markdownFilesUnder(DOCS_DIRECTORY));
    const flowcharts = files
        .flatMap((filePath) => mermaidBlocksOf(filePath).map((block) => ({ filePath, block })))
        .filter((entry) => /^flowchart /m.test(entry.block));

    assert.ok(flowcharts.length >= 5, `expected at least the five flowcharts, found ${flowcharts.length}`);

    for (const { filePath, block } of flowcharts)
    {
        const where = path.relative(REPOSITORY_ROOT, filePath);

        assert.match(block, ELK_FRONT_MATTER, `${where}: a flowchart lacks the exact front matter:\n${block.slice(0, 200)}`);
        assert.doesNotMatch(block, FORBIDDEN_SETTINGS, `${where}: a flowchart sets a theme, theme variables or a font family`);
        assert.doesNotMatch(block, HTML_IN_BLOCK, `${where}: a flowchart holds HTML; break a label's line with a Markdown string`);
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

test("every boundary's title reads on its tinted fill over both GitHub backgrounds", () =>
{
    const files = [path.join(REPOSITORY_ROOT, "README.md")].concat(markdownFilesUnder(DOCS_DIRECTORY));
    const violations = files.flatMap((filePath) => mermaidBlocksOf(filePath)
        .flatMap(titleContrastViolations)
        .map((violation) => `${path.relative(REPOSITORY_ROOT, filePath)}: ${violation}`));

    assert.deepEqual(violations, []);
});

test("the title check catches the colours that were unreadable in dark mode", () =>
{
    // Each title in its layer's own colour, as the boundaries were drawn before the title colours.
    const before = [
        "    style adapters fill:#0478571A,stroke:#047857,color:#047857",
        "    style roles fill:#4F46E51A,stroke:#4F46E5,color:#4F46E5",
        "    style outside fill:#7E22CE1A,stroke:#7E22CE,color:#7E22CE,stroke-dasharray:3 3",
        "    style port fill:#B453091A,stroke:#B45309,color:#B45309",
        "    style session fill:#8B949E14,stroke:#8B949E,color:#8B949E",
        "    style terylon fill:#2563EB1A,stroke:#2563EB,color:#2563EB",
    ].join("\n");
    const violatedBoundaries = new Set(titleContrastViolations(before).map((violation) => violation.split(":")[0]));

    assert.deepEqual([...violatedBoundaries].sort(), ["adapters", "outside", "port", "roles", "session", "terylon"]);
});
