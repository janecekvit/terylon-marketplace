"use strict";

//
// install — stage 1. Installs the marketplace from a git ref into a scratch CLAUDE_CONFIG_DIR the
// way a consumer does, then asserts that everything it declares loads.
//
//   extraKnownMarketplaces.terylon = { source: git, url, ref }   the declaration a consumer commits
//   claude plugin marketplace add '<url>#<ref>'                 the ref travels as the fragment and
//                                                               must match the declared ref
//   claude plugin install <plugin>@terylon, for every plugin    what enabling a key does
//
// Then: every manifest validates under --strict; the init event lists every plugin, every skill
// and every agent the clone carries; every MCP server connects; every hook registers and its
// command runs and exits 0 on an empty payload.
//

const childProcess = require("child_process");
const fileSystem = require("fs");
const path = require("path");
const { readInventory, cleanEnvironment } = require("./claude.js");

const MARKETPLACE_NAME = "terylon";

function run(command, argumentList, options)
{
    const completed = childProcess.spawnSync(command, argumentList, { encoding: "utf8", timeout: 5 * 60 * 1000, ...options });

    return { status: completed.status, stdout: completed.stdout || "", stderr: completed.stderr || "" };
}

function frontmatterName(file)
{
    const match = fileSystem.readFileSync(file, "utf8").match(/^---\n[\s\S]*?^name:\s*(\S+)\s*$/m);

    return match === null ? null : match[1];
}

// What the installed clone declares — the expectation the loaded inventory is checked against.
function declaredInventory(marketplaceDirectory)
{
    const manifest = JSON.parse(fileSystem.readFileSync(path.join(marketplaceDirectory, ".claude-plugin", "marketplace.json"), "utf8"));
    const plugins = [];

    for (const entry of manifest.plugins)
    {
        const pluginDirectory = path.join(marketplaceDirectory, entry.source);
        const skillsDirectory = path.join(pluginDirectory, "skills");
        const agentsDirectory = path.join(pluginDirectory, "agents");
        const hooksFile = path.join(pluginDirectory, "hooks", "hooks.json");
        const mcpFile = path.join(pluginDirectory, ".mcp.json");

        const skills = fileSystem.existsSync(skillsDirectory)
            ? fileSystem.readdirSync(skillsDirectory).filter((name) => fileSystem.existsSync(path.join(skillsDirectory, name, "SKILL.md")))
            : [];
        const agents = fileSystem.existsSync(agentsDirectory)
            ? fileSystem.readdirSync(agentsDirectory).filter((name) => name.endsWith(".md")).map((name) => name.replace(/\.md$/, ""))
            : [];

        let hooks = [];

        if (fileSystem.existsSync(hooksFile))
        {
            const parsed = JSON.parse(fileSystem.readFileSync(hooksFile, "utf8"));

            for (const [event, matchers] of Object.entries(parsed.hooks || {}))
            {
                for (const matcher of matchers)
                {
                    for (const hook of matcher.hooks || [])
                    {
                        hooks.push({ event, command: hook.command });
                    }
                }
            }
        }

        const mcpServers = fileSystem.existsSync(mcpFile)
            ? Object.keys(JSON.parse(fileSystem.readFileSync(mcpFile, "utf8")).mcpServers || {})
            : [];

        plugins.push({ name: entry.name, skills, agents, hooks, mcpServers });
    }

    return plugins;
}

function installStage({ source, ref, workDirectory, binDirectory, check, log })
{
    const configDirectory = path.join(workDirectory, "consumer-config");
    const settingsFile = path.join(workDirectory, "consumer-settings.json");
    const projectDirectory = path.join(workDirectory, "consumer-project");

    fileSystem.mkdirSync(configDirectory, { recursive: true });
    fileSystem.mkdirSync(projectDirectory, { recursive: true });
    run("git", ["init", "-q"], { cwd: projectDirectory });

    fileSystem.writeFileSync(settingsFile, JSON.stringify(
    {
        extraKnownMarketplaces: { [MARKETPLACE_NAME]: { source: { source: "git", url: source, ref } } },
    }, null, 2));

    const environment = cleanEnvironment({ CLAUDE_CONFIG_DIR: configDirectory });

    log(`installing ${source}#${ref} into ${configDirectory}`);

    const added = run("claude", ["--settings", settingsFile, "plugin", "marketplace", "add", `${source}#${ref}`], { env: environment, cwd: projectDirectory });

    check("install", "the marketplace is added from the ref", added.status === 0, (added.stdout + added.stderr).trim().split("\n").slice(-2).join(" "));

    if (added.status !== 0)
    {
        return null;
    }

    const marketplaceDirectory = path.join(configDirectory, "plugins", "marketplaces", MARKETPLACE_NAME);
    const head = run("git", ["-C", marketplaceDirectory, "log", "--oneline", "-1"]).stdout.trim();

    check("install", "the clone landed on the ref", head !== "", head);

    const marketplaceValidation = run("claude", ["plugin", "validate", "--strict", "--json", marketplaceDirectory], { env: environment });

    check("install", "marketplace.json validates under --strict", marketplaceValidation.status === 0, marketplaceValidation.status === 0 ? "" : marketplaceValidation.stdout.slice(0, 600));

    const declared = declaredInventory(marketplaceDirectory);

    for (const plugin of declared)
    {
        const installed = run("claude", ["--settings", settingsFile, "plugin", "install", `${plugin.name}@${MARKETPLACE_NAME}`], { env: environment, cwd: projectDirectory });

        check("install", `${plugin.name} installs`, installed.status === 0, (installed.stdout + installed.stderr).trim().split("\n").pop());
    }

    let installedList = [];

    try
    {
        installedList = JSON.parse(run("claude", ["plugin", "list", "--json"], { env: environment }).stdout);
    }
    catch
    {
        // An unreadable list leaves every installPath unknown; the checks below then fail by name.
    }

    const installPaths = {};

    for (const plugin of declared)
    {
        const entry = installedList.find((candidate) => candidate.id === `${plugin.name}@${MARKETPLACE_NAME}`);

        installPaths[plugin.name] = entry === undefined ? null : entry.installPath;
        check("install", `${plugin.name} is installed and enabled`, entry !== undefined && entry.enabled === true, entry === undefined ? "absent from plugin list" : `version ${entry.version}`);

        if (entry !== undefined)
        {
            const validation = run("claude", ["plugin", "validate", "--strict", "--json", entry.installPath], { env: environment });

            check("install", `${plugin.name} plugin.json validates under --strict`, validation.status === 0, validation.status === 0 ? "" : validation.stdout.slice(0, 600));
        }
    }

    // The loaded inventory, with the stub Azure DevOps server on PATH so its declaration can connect.
    const debugFile = path.join(workDirectory, "inventory-debug.log");
    const adoState = path.join(workDirectory, "inventory-ado-state.json");

    fileSystem.writeFileSync(adoState, JSON.stringify({ nextId: 1, items: {} }));

    const inventory = readInventory(
    {
        configDirectory,
        cwd: projectDirectory,
        debugFile,
        transcript: path.join(workDirectory, "inventory-transcript.jsonl"),
        env:
        {
            PATH: binDirectory + path.delimiter + process.env.PATH,
            E2E_BIN_DIR: binDirectory,
            E2E_ADO_MODE: "stub",
            E2E_ADO_STATE: adoState,
            E2E_ADO_LOG: path.join(workDirectory, "inventory-ado-calls.jsonl"),
            TERYLON_ADO_ORG: "contoso",
        },
    });

    check("install", "the session reports its loaded inventory", inventory.init !== null, inventory.init === null ? inventory.stderr.slice(0, 300) : "");

    if (inventory.init === null)
    {
        return { configDirectory, marketplaceDirectory, installPaths, declared };
    }

    const loadedPlugins = inventory.init.plugins.map((plugin) => plugin.source);
    const loadedSkills = inventory.init.skills || [];
    const loadedAgents = inventory.init.agents || [];
    const loadedServers = inventory.init.mcp_servers || [];
    const debugLog = fileSystem.existsSync(debugFile) ? fileSystem.readFileSync(debugFile, "utf8") : "";

    for (const plugin of declared)
    {
        check("install", `${plugin.name} loads`, loadedPlugins.includes(`${plugin.name}@${MARKETPLACE_NAME}`), "");

        const missingSkills = plugin.skills.filter((skill) => !loadedSkills.includes(`${plugin.name}:${skill}`));
        const missingAgents = plugin.agents.filter((agent) => !loadedAgents.includes(`${plugin.name}:${agent}`));

        check("install", `${plugin.name}: every skill loads (${plugin.skills.length})`, missingSkills.length === 0, missingSkills.length === 0 ? "" : `missing: ${missingSkills.join(", ")}`);
        check("install", `${plugin.name}: every agent loads (${plugin.agents.length})`, missingAgents.length === 0, missingAgents.length === 0 ? "" : `missing: ${missingAgents.join(", ")}`);

        for (const skill of plugin.skills)
        {
            const file = path.join(marketplaceDirectory, "plugins", plugin.name, "skills", skill, "SKILL.md");

            check("install", `${plugin.name}:${skill} frontmatter name matches its directory`, frontmatterName(file) === skill, `name: ${frontmatterName(file)}`);
        }

        for (const server of plugin.mcpServers)
        {
            const loaded = loadedServers.find((candidate) => candidate.name === `plugin:${plugin.name}:${server}`);

            check("install", `${plugin.name}: MCP server ${server} connects`, loaded !== undefined && loaded.status === "connected", loaded === undefined ? "not declared at runtime" : `status ${loaded.status}`);
        }

        if (plugin.hooks.length > 0)
        {
            check("install", `${plugin.name}: hooks register`, debugLog.includes(`Loading hooks from plugin: ${plugin.name}`), "");
        }

        for (const hook of plugin.hooks)
        {
            const root = installPaths[plugin.name] || "";
            const command = hook.command.split("${CLAUDE_PLUGIN_ROOT}").join(root);
            const hookRun = run("sh", ["-c", command], { input: "{}", env: cleanEnvironment({ CLAUDE_PLUGIN_ROOT: root }), cwd: projectDirectory, timeout: 10000 });

            check("install", `${plugin.name}: ${hook.event} hook runs and exits 0 on an empty payload`, hookRun.status === 0, hookRun.status === 0 ? "" : `exit ${hookRun.status}: ${hookRun.stderr.trim().split("\n")[0]}`);
        }
    }

    const loadErrors = debugLog.split("\n").filter((line) => /\[ERROR\]/.test(line) && /plugin|skill|agent|hook|mcp|frontmatter/i.test(line));

    check("install", "the debug log carries no plugin load error", loadErrors.length === 0, loadErrors.slice(0, 3).join(" | ").slice(0, 600));

    return { configDirectory, marketplaceDirectory, installPaths, declared };
}

module.exports = { installStage, declaredInventory };
