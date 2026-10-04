"use strict";

//
// claude — drives the Claude Code CLI for the harness and reads its stream-json output.
//
// Two modes, and they authenticate differently on purpose:
//
//   inventory  runs in the scratch CLAUDE_CONFIG_DIR the consumer install produced. It never
//              reaches the model: the init event that lists every loaded plugin, skill, agent and
//              MCP server is emitted before the first API call, and the call that follows fails
//              for want of a login. Nothing is spent and no credential exists in that directory.
//
//   headless   runs as the operator, under whatever login their own Claude Code already holds —
//              the harness never reads, copies or passes a credential. It loads the plugins the
//              consumer install produced, by --plugin-dir, and isolates them from the operator's
//              own plugins with --setting-sources project, and from the account's claude.ai
//              connectors with ENABLE_CLAUDEAI_MCP_SERVERS=false. --strict-mcp-config is not used:
//              measured on 2026-10-04 (2.1.289), it drops a --plugin-dir plugin's own .mcp.json too,
//              so the ado server never started and every Azure DevOps scenario ran without it.
//

const childProcess = require("child_process");
const fileSystem = require("fs");

// A headless run that has not finished by now is stuck, not slow.
const HEADLESS_TIMEOUT_MILLISECONDS = 15 * 60 * 1000;

// The tools a headless run may use without a prompt. Everything else is denied (dontAsk).
// Bash is broad because the GitHub recipes compose bodies with shell; every forge command it can
// reach on this PATH is a stand-in.
const HEADLESS_ALLOWED_TOOLS = ["Bash", "Read", "Grep", "Glob", "Write", "Edit", "Skill", "Agent", "mcp__plugin_terylon-ado_ado__*"];

// Environment variables that could carry a real forge credential. Stripped from every run, so a
// stand-in is the only thing a run can talk to.
const CREDENTIAL_VARIABLES = ["PERSONAL_ACCESS_TOKEN", "AZURE_DEVOPS_EXT_PAT", "GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "TERYLON_FORGE", "TERYLON_ADO_PROJECT"];

function operatorPluginDirectory()
{
    const path = require("path");
    const os = require("os");

    return path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "plugins");
}

function cleanEnvironment(extra)
{
    const environment = { ...process.env };

    for (const name of CREDENTIAL_VARIABLES)
    {
        delete environment[name];
    }

    return { ...environment, ...extra };
}

// Parses stream-json output into the parts the assertions read.
function parseStream(output)
{
    const events = [];

    for (const line of output.split("\n"))
    {
        if (!line.startsWith("{"))
        {
            continue;
        }

        try
        {
            events.push(JSON.parse(line));
        }
        catch
        {
            // A partial line at a timeout; the events before it still count.
        }
    }

    const init = events.find((event) => event.type === "system" && event.subtype === "init") || null;
    const result = events.find((event) => event.type === "result") || null;

    // Every assistant text and tool call, in the order the run produced them.
    const timeline = [];

    for (const event of events)
    {
        if (event.type !== "assistant" || event.message === undefined)
        {
            continue;
        }

        for (const block of event.message.content || [])
        {
            if (block.type === "text")
            {
                timeline.push({ kind: "text", text: block.text });
            }
            else if (block.type === "tool_use")
            {
                timeline.push({ kind: "tool", name: block.name, input: block.input });
            }
        }
    }

    const text = timeline.filter((entry) => entry.kind === "text").map((entry) => entry.text).join("\n");

    // What each dispatched subagent reported back, keyed by the Agent call that dispatched it.
    const agentCalls = {};

    for (const event of events)
    {
        if (event.type === "assistant" && event.message !== undefined)
        {
            for (const block of event.message.content || [])
            {
                if (block.type === "tool_use" && block.name === "Agent")
                {
                    agentCalls[block.id] = { subagentType: (block.input || {}).subagent_type, report: "" };
                }
            }
        }
        else if (event.type === "user" && event.message !== undefined && Array.isArray(event.message.content))
        {
            for (const block of event.message.content)
            {
                if (block.type === "tool_result" && agentCalls[block.tool_use_id] !== undefined)
                {
                    const content = Array.isArray(block.content) ? block.content.map((part) => part.text || "").join("\n") : String(block.content || "");

                    agentCalls[block.tool_use_id].report += content;
                }
            }
        }
    }

    return { events, init, result, timeline, subagents: Object.values(agentCalls), text: text + "\n" + ((result && result.result) || "") };
}

function runClaude(argumentList, options)
{
    const completed = childProcess.spawnSync("claude", argumentList,
    {
        cwd: options.cwd,
        env: options.env,
        encoding: "utf8",
        timeout: options.timeout || HEADLESS_TIMEOUT_MILLISECONDS,
        maxBuffer: 256 * 1024 * 1024,
    });

    if (options.transcript !== undefined)
    {
        fileSystem.writeFileSync(options.transcript, (completed.stdout || "") + "\n--- stderr ---\n" + (completed.stderr || ""));
    }

    return { status: completed.status, stderr: completed.stderr || "", ...parseStream(completed.stdout || "") };
}

// The consumer's loaded inventory, read from the scratch config without reaching the model.
function readInventory({ configDirectory, cwd, env, debugFile, transcript })
{
    return runClaude(["-p", "inventory", "--output-format", "stream-json", "--verbose", "--debug-file", debugFile],
    {
        cwd,
        env: cleanEnvironment({ ...env, CLAUDE_CONFIG_DIR: configDirectory }),
        timeout: 3 * 60 * 1000,
        transcript,
    });
}

// One headless turn. `resume` continues an earlier session, which is how a run answers "push".
function runHeadless({ prompt, cwd, env, pluginDirectories, model, budget, resume, agent, transcript })
{
    const argumentList = ["-p", prompt, "--output-format", "stream-json", "--verbose",
        "--model", model,
        "--setting-sources", "project",
        "--permission-mode", "dontAsk",
        "--allowedTools", ...HEADLESS_ALLOWED_TOOLS,
        "--max-budget-usd", String(budget)];

    // The operator's own installed plugins are not under test and may be older versions. A run that
    // goes looking for a skill on disk must not find them; the scenarios also fail any run that tried.
    const operatorPlugins = operatorPluginDirectory();

    argumentList.push("--disallowedTools", `Read(/${operatorPlugins}/**)`, `Grep(/${operatorPlugins}/**)`, `Glob(/${operatorPlugins}/**)`);

    for (const directory of pluginDirectories)
    {
        argumentList.push("--plugin-dir", directory);
    }

    if (resume !== undefined)
    {
        argumentList.push("--resume", resume);
    }

    if (agent !== undefined)
    {
        argumentList.push("--agent", agent);
    }

    // The operator's own config directory, untouched: the harness passes no CLAUDE_CONFIG_DIR here.
    return runClaude(argumentList, { cwd, env: cleanEnvironment({ ...env, ENABLE_CLAUDEAI_MCP_SERVERS: "false" }), transcript });
}

module.exports = { runHeadless, readInventory, cleanEnvironment, parseStream, operatorPluginDirectory };
