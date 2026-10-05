#!/usr/bin/env node
//
// The end-to-end harness for the marketplace — one command.
//
//   node tests/e2e/run.js                       every stage, against this branch on origin
//   node tests/e2e/run.js --stages install      stage 1 only — free, no model call
//   node tests/e2e/run.js --teeth               plant each defect and require the harness to go red
//
// Stages:
//   install      the marketplace from a git ref into a scratch CLAUDE_CONFIG_DIR, as a consumer
//                does, and every plugin, skill, agent, hook and MCP declaration checked to load
//   author       create-user-story and create-feature driven headless on a fixture repository
//                per forge, against a stub Azure DevOps MCP server and a stub gh that record
//                every write
//   github-only  with only terylon-github enabled, develop, planner, create-feature and review-pr
//                must say what they cannot do before any forge call; with the Azure DevOps server
//                unreachable, a skill must stop with that reason
//
// Options:
//   --source <url|path>  the marketplace's git URL (default: this repository's origin);
//                        a local path is cloned bare and served over http on 127.0.0.1
//   --ref <ref>          the branch or tag to install (default: the current branch)
//   --stages <list>      comma-separated subset of install,author,github-only (default: all)
//   --scenarios <list>   only these scenarios within the stages run (names in tests/e2e/lib/scenarios.js)
//   --model <model>      one model for every headless run (default: per stage, see DEFAULT_MODELS)
//   --budget <usd>       ceiling per headless run (default: 3)
//   --plant <defect>     install with one planted defect; see tests/e2e/lib/defects.js
//   --teeth              plant every defect in turn; green only if every one turns the harness red
//   --out <directory>    where transcripts and report.json go (default: a fresh temp directory)
//
// Exit: 0 every check passed (or, with --teeth, every defect was caught); 1 otherwise; 2 usage.
//
// No credential appears anywhere in the harness. The install clones with whatever git access the
// operator has; the headless runs use the operator's own Claude Code login; every forge call goes
// to a stand-in. See tests/e2e/lib/claude.js for how the two modes authenticate.
//
"use strict";

const childProcess = require("child_process");
const fileSystem = require("fs");
const os = require("os");
const path = require("path");

const { installStage } = require("./lib/install.js");
const { authorStage, githubOnlyStage } = require("./lib/scenarios.js");
const { DEFECTS, plantDefect } = require("./lib/defects.js");
const { resolveRef } = require("./lib/ref.js");

const REPOSITORY_ROOT = path.join(__dirname, "..", "..");
const ALL_STAGES = ["install", "author", "github-only"];

// The model each headless stage runs on, chosen by measurement on 2026-10-04, cheapest first:
//   haiku   cannot carry these skills. Authoring: it never loaded forge-ops — invented a skill name,
//           skipped the label and the sub-issue link, "linked" the parent with a comment (4 of 15
//           red). GitHub-only: across two identical runs, develop and the unreachable-server run
//           passed once and failed once — once develop resolved Azure DevOps with no adapter, then
//           invented a seed-spec and went on to plan it.
//   sonnet  every scenario green, two runs.
// Stage 1 reaches no model at all and costs nothing.
const DEFAULT_MODELS = { author: "sonnet", "github-only": "sonnet" };

function parseArguments(argumentList)
{
    const options = { stages: ALL_STAGES, budget: 3, teeth: false };
    const valueOptions = { "--source": "source", "--ref": "ref", "--stages": "stages", "--scenarios": "scenarios", "--model": "model", "--budget": "budget", "--plant": "plant", "--out": "out" };

    for (let index = 0; index < argumentList.length; index++)
    {
        const name = argumentList[index];

        if (name === "--teeth")
        {
            options.teeth = true;
            continue;
        }

        const key = valueOptions[name];

        if (key === undefined || index + 1 >= argumentList.length)
        {
            return null;
        }

        options[key] = argumentList[++index];
    }

    if (typeof options.stages === "string")
    {
        options.stages = options.stages.split(",").map((stage) => stage.trim());
    }

    if (typeof options.scenarios === "string")
    {
        options.scenarios = options.scenarios.split(",").map((scenario) => scenario.trim());
    }

    if (options.stages.some((stage) => !ALL_STAGES.includes(stage)))
    {
        return null;
    }

    if (options.plant !== undefined && DEFECTS[options.plant] === undefined)
    {
        return null;
    }

    options.budget = Number(options.budget);
    return options;
}

function git(argumentList, cwd)
{
    return childProcess.execFileSync("git", argumentList, { cwd: cwd || REPOSITORY_ROOT, encoding: "utf8" }).trim();
}

const servers = [];

// Claude Code installs a git marketplace from an http(s) URL and refuses file://. A local
// repository — an unpushed branch, a planted defect — is therefore cloned bare and served over
// plain HTTP on the loopback interface for the length of the run.
function serveLocal(localPath, ref, workDirectory)
{
    const servedRoot = path.join(workDirectory, "served");
    const bare = path.join(servedRoot, "marketplace.git");
    const portFile = path.join(workDirectory, "served.port");

    fileSystem.mkdirSync(servedRoot, { recursive: true });
    childProcess.execFileSync("git", ["clone", "--quiet", "--bare", "--branch", ref, localPath, bare], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    childProcess.execFileSync("git", ["update-server-info"], { cwd: bare, encoding: "utf8" });

    const server = childProcess.spawn(process.execPath, [path.join(__dirname, "stubs", "git-http-server.js"), servedRoot, portFile], { stdio: "ignore" });

    servers.push(server);

    const deadline = Date.now() + 10000;

    while (!fileSystem.existsSync(portFile) && Date.now() < deadline)
    {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }

    return `http://127.0.0.1:${fileSystem.readFileSync(portFile, "utf8").trim()}/marketplace.git`;
}

function stopServers()
{
    for (const server of servers)
    {
        server.kill();
    }
}

function isUrl(source)
{
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(source);
}

// A github.com repository URL without the .git suffix.
const GITHUB_URL_WITHOUT_SUFFIX = /^https:\/\/github\.com\/[^/]+\/[^/]+?(?<!\.git)\/?$/i;

// `marketplace add` records a github.com URL with `.git` appended, then refuses the add because the
// recorded source no longer matches the extraKnownMarketplaces entry the install stage declared
// with the URL as typed. Measured on 2026-10-05 (2.1.289). Declare the form it records.
function withGitSuffix(source)
{
    return GITHUB_URL_WITHOUT_SUFFIX.test(source) ? source.replace(/\/?$/, ".git") : source;
}

// The two command wrappers the stand-ins are reached through, first on the PATH of every run.
function createBinDirectory(workDirectory)
{
    const binDirectory = path.join(workDirectory, "bin");

    fileSystem.mkdirSync(binDirectory, { recursive: true });
    fileSystem.writeFileSync(path.join(binDirectory, "npx"), `#!/bin/sh\nexec node "${path.join(__dirname, "stubs", "npx-shim.js")}" "$@"\n`, { mode: 0o755 });
    fileSystem.writeFileSync(path.join(binDirectory, "gh"), `#!/bin/sh\nexec node "${path.join(REPOSITORY_ROOT, "tests", "forge-port", "fake-gh.js")}" "$@"\n`, { mode: 0o755 });

    return binDirectory;
}

// One full pass of the selected stages. Returns the checks and the headless runs' cost.
function runOnce({ source, ref, stages, scenarios, model, budget, workDirectory, label })
{
    const checks = [];
    const runs = [];

    const check = (stage, name, ok, detail) =>
    {
        checks.push({ stage, name, ok: Boolean(ok), detail: detail || "" });
        process.stdout.write(`${ok ? "  ok  " : "  FAIL"} [${label}/${stage}] ${name}${!ok && detail ? ` — ${detail}` : ""}\n`);
    };
    const log = (line) => process.stdout.write(`       [${label}] ${line}\n`);
    const recordRun = (entry) =>
    {
        runs.push(entry);
        log(`${entry.scenario}${entry.turn ? ` (turn ${entry.turn})` : ""}: $${(entry.cost || 0).toFixed(4)}, ${Math.round((entry.durationMilliseconds || 0) / 1000)} s, ${entry.terminalReason}`);
    };

    fileSystem.mkdirSync(workDirectory, { recursive: true });

    const binDirectory = createBinDirectory(workDirectory);
    const installed = installStage({ source, ref, workDirectory, binDirectory, check, log });

    if (installed === null || installed.installPaths === undefined)
    {
        return { checks, runs };
    }

    const context = { installed, binDirectory, workDirectory, model, models: Object.fromEntries(Object.entries(DEFAULT_MODELS).map(([key, value]) => [key, model || value])), budget, scenarios, check, log, recordRun };

    if (stages.includes("author"))
    {
        authorStage(context);
    }

    if (stages.includes("github-only"))
    {
        githubOnlyStage(context);
    }

    return { checks, runs };
}

function summarise(result)
{
    const failed = result.checks.filter((entry) => !entry.ok);
    const cost = result.runs.reduce((sum, entry) => sum + (entry.cost || 0), 0);

    return { passed: result.checks.length - failed.length, failed: failed.length, cost };
}

function main()
{
    const options = parseArguments(process.argv.slice(2));

    if (options === null)
    {
        process.stderr.write(`usage: node tests/e2e/run.js [--source <url|path>] [--ref <ref>] [--stages ${ALL_STAGES.join(",")}] [--scenarios <names>] [--model <model>] [--budget <usd>] [--plant <${Object.keys(DEFECTS).join("|")}>] [--teeth] [--out <directory>]\n`);
        process.exit(2);
    }

    const resolved = resolveRef({ explicitRef: options.ref, git });

    if (resolved.error !== undefined)
    {
        process.stderr.write(`terylon e2e: ${resolved.error}\n`);
        process.exit(2);
    }

    const ref = resolved.ref;
    const outDirectory = options.out || fileSystem.mkdtempSync(path.join(os.tmpdir(), "terylon-e2e-"));
    const requestedSource = options.source || git(["remote", "get-url", "origin"]);
    const source = isUrl(requestedSource) ? withGitSuffix(requestedSource) : path.resolve(requestedSource);
    const report = { startedAt: new Date().toISOString(), source, ref, models: options.model || DEFAULT_MODELS, passes: [] };

    process.stdout.write(`terylon e2e — ${source}#${ref}, stages ${options.stages.join(",")}, model ${options.model || JSON.stringify(DEFAULT_MODELS)}, out ${outDirectory}\n`);

    let exitCode = 0;

    if (options.teeth || options.plant !== undefined)
    {
        const names = options.teeth ? Object.keys(DEFECTS) : [options.plant];

        for (const name of names)
        {
            const defect = DEFECTS[name];
            const workDirectory = path.join(outDirectory, `planted-${name}`);
            let planted;
            let plantedSource;

            try
            {
                planted = plantDefect({ name, source, ref, workDirectory });
                plantedSource = serveLocal(planted.path, planted.ref, workDirectory);
            }
            catch (error)
            {
                // A defect that could not be planted proves nothing either way: a verdict, not a crash.
                const reason = describeFailure(error);

                process.stdout.write(`SETUP FAILED planted defect ${name} (${defect.description}): ${reason}\n`);
                report.passes.push({ label: name, planted: true, description: defect.description, caught: false, setupFailed: reason, passed: 0, failed: 0, cost: 0, checks: [], runs: [] });
                exitCode = 1;
                continue;
            }

            const stages = options.teeth ? defect.stages : options.stages;
            const scenarios = options.teeth ? defect.authorScenarios : options.scenarios;
            const result = runOnce({ source: plantedSource, ref: planted.ref, stages, scenarios, model: options.model, budget: options.budget, workDirectory, label: name });
            const summary = summarise(result);
            const caught = summary.failed > 0;

            process.stdout.write(`${caught ? "CAUGHT" : "MISSED"} planted defect ${name} (${defect.description}): ${summary.failed} failing checks, $${summary.cost.toFixed(4)}\n`);
            report.passes.push({ label: name, planted: true, description: defect.description, caught, ...summary, checks: result.checks, runs: result.runs });

            if (options.teeth && !caught)
            {
                exitCode = 1;
            }
            else if (!options.teeth && summary.failed > 0)
            {
                exitCode = 1;
            }
        }
    }
    else
    {
        const workDirectory = path.join(outDirectory, "clean");

        fileSystem.mkdirSync(workDirectory, { recursive: true });

        let cleanSource;

        try
        {
            cleanSource = isUrl(source) ? source : serveLocal(source, ref, workDirectory);
        }
        catch (error)
        {
            const reason = describeFailure(error);

            process.stdout.write(`SETUP FAILED clean run: ${reason}\n`);
            report.passes.push({ label: "clean", planted: false, setupFailed: reason, passed: 0, failed: 0, cost: 0, checks: [], runs: [] });
            finish(report, outDirectory, 1);
        }

        const result = runOnce({ source: cleanSource, ref, stages: options.stages, scenarios: options.scenarios, model: options.model, budget: options.budget, workDirectory, label: "clean" });
        const summary = summarise(result);

        report.passes.push({ label: "clean", planted: false, ...summary, checks: result.checks, runs: result.runs });
        exitCode = summary.failed > 0 ? 1 : 0;
    }

    finish(report, outDirectory, exitCode);
}

// The one line of a failure worth reading: git's own `fatal:` when a git command failed.
function describeFailure(error)
{
    const stderr = error.stderr === undefined ? "" : String(error.stderr).trim();
    const fatal = stderr.split("\n").find((line) => /^fatal:|^error:/.test(line));

    return fatal || stderr.split("\n")[0] || String(error.message).split("\n")[0];
}

function finish(report, outDirectory, exitCode)
{
    stopServers();
    report.finishedAt = new Date().toISOString();
    report.totalCost = report.passes.reduce((sum, pass) => sum + pass.cost, 0);
    fileSystem.writeFileSync(path.join(outDirectory, "report.json"), JSON.stringify(report, null, 2));

    for (const pass of report.passes)
    {
        const verdict = pass.setupFailed !== undefined ? " — SETUP FAILED" : (pass.planted ? (pass.caught ? " — defect caught" : " — DEFECT MISSED") : "");

        process.stdout.write(`${pass.label}: ${pass.passed} passed, ${pass.failed} failed, $${pass.cost.toFixed(4)}${verdict}\n`);
    }

    process.stdout.write(`total cost $${report.totalCost.toFixed(4)}; report ${path.join(outDirectory, "report.json")}\n`);
    process.exit(exitCode);
}

main();
