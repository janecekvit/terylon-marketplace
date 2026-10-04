"use strict";

//
// defects — the planted defects the harness must catch, and how one is planted.
//
// A defect is planted in a throwaway clone of the source at the ref, committed on a branch of its
// own, and installed from there over http on 127.0.0.1 — the same consumer path as a clean run, so the
// harness under test is exactly the harness that runs clean. Nothing planted ever touches the
// working tree it was started from.
//
// `stages` is the cheapest set of stages expected to catch it, which is what --teeth runs.
//
// A defect a capable model can see through does not belong here. Stripping the acceptance-criteria
// section from the GitHub create recipe was tried and missed: sonnet wrote the section anyway, from
// the skill's own template. A planted defect has to change something only the adapter knows — the
// label a type is stored under, the organisation the server is started with.
//

const childProcess = require("child_process");
const fileSystem = require("fs");
const path = require("path");

function replaceIn(file, from, to)
{
    const text = fileSystem.readFileSync(file, "utf8");

    if (!text.includes(from))
    {
        throw new Error(`cannot plant: ${path.basename(file)} no longer contains ${JSON.stringify(from.slice(0, 60))}`);
    }

    fileSystem.writeFileSync(file, text.replace(from, to));
}

const DEFECTS =
{
    "skill-frontmatter":
    {
        description: "a skill's frontmatter no longer parses (create-user-story)",
        stages: ["install"],
        plant(root)
        {
            replaceIn(path.join(root, "plugins", "terylon-product", "skills", "create-user-story", "SKILL.md"), "description: >-\n", "description: [unclosed\n");
        },
    },
    "mcp-organisation":
    {
        description: "the Azure DevOps adapter stops passing the organisation to its server (terylon-ado .mcp.json)",
        stages: ["install"],
        plant(root)
        {
            replaceIn(path.join(root, "plugins", "terylon-ado", ".mcp.json"), "\"${TERYLON_ADO_ORG}\",\n", "");
        },
    },
    "hook-path":
    {
        description: "a hook command names a script that does not exist (terylon-core SubagentStop)",
        stages: ["install"],
        plant(root)
        {
            replaceIn(path.join(root, "plugins", "terylon-core", "hooks", "hooks.json"), "record-agent-spend.js", "record-agent-spends.js");
        },
    },
    "type-label":
    {
        description: "the GitHub adapter names the wrong type label for a story (terylon-github forge-ops)",
        stages: ["install", "author"],
        authorScenarios: ["github-story"],
        plant(root)
        {
            const reference = path.join(root, "plugins", "terylon-github", "skills", "forge-ops", "references", "forge-ops.md");
            const text = fileSystem.readFileSync(reference, "utf8");

            if (!text.includes("`user story`"))
            {
                throw new Error("cannot plant: the GitHub reference no longer names the `user story` label");
            }

            fileSystem.writeFileSync(reference, text.split("`user story`").join("`story`").split("--label \"user story\"").join("--label \"story\""));
        },
    },
};

function plantDefect({ name, source, ref, workDirectory })
{
    const cloneDirectory = path.join(workDirectory, "planted-source");
    const branch = `e2e-planted-${name}`;
    const git = (argumentList) => childProcess.execFileSync("git", argumentList, { cwd: cloneDirectory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

    fileSystem.mkdirSync(workDirectory, { recursive: true });
    // stderr is captured, so a failure reaches the verdict as git's own line instead of leaking past it.
    childProcess.execFileSync("git", ["clone", "--quiet", "--branch", ref, source, cloneDirectory], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    git(["checkout", "--quiet", "-b", branch]);
    DEFECTS[name].plant(cloneDirectory);
    git(["-c", "user.name=terylon-e2e", "-c", "user.email=e2e@invalid", "commit", "--quiet", "-am", `Plant defect: ${name}`]);

    return { path: cloneDirectory, ref: branch };
}

module.exports = { DEFECTS, plantDefect };
