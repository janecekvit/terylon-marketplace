"use strict";

//
// scenarios — stages 2 and 3: the skills driven headless, the model following them, against
// stand-ins that record every write.
//
//   author        create-user-story and create-feature on an Azure DevOps fixture and on a GitHub
//                 fixture. Each is two turns, as a person runs it: the draft, then "push". The
//                 first turn must write nothing and must name every key the forge does not carry;
//                 the second must write the item, with its criteria as tickable boxes, under the
//                 requested parent.
//   github-only   only terylon-github loaded. develop, planner, create-feature and review-pr are
//                 each handed an Azure DevOps item, and must say they cannot reach it — naming
//                 terylon-ado — before any forge call. Then, with terylon-ado loaded but its server
//                 unreachable, create-user-story must stop with that reason and write nothing.
//
// The stand-ins: tests/e2e/stubs/ado-mcp-stub.js, reached through the npx shim the adapter's
// .mcp.json launches, and tests/forge-port/fake-gh.js as `gh`. Neither holds a credential.
//

const childProcess = require("child_process");
const fileSystem = require("fs");
const path = require("path");
const { runHeadless, operatorPluginDirectory } = require("./claude.js");

const ADO_PARENT_URL = "https://dev.azure.com/contoso/Fixture/_workitems/edit/100";
const ADO_OTHER_ITEM_URL = "https://dev.azure.com/contoso/Fixture/_workitems/edit/42";
const ADO_PULL_REQUEST_URL = "https://dev.azure.com/contoso/Fixture/_git/widgets/pullrequest/9";
const GITHUB_PARENT_URL = "https://github.com/contoso/widgets/issues/7";

const PARENT_AREA = "Fixture\\Team A";
const PARENT_ITERATION = "Fixture\\Sprint 7";

const STORY_BRIEF = "Let an administrator export the audit log as a CSV file from the settings page, covering the last 30 days, so auditors can filter it in a spreadsheet.";

const FEATURE_BRIEF = [
    "Draft a new Feature, everything you need is here, do not ask:",
    "Problem: auditors cannot take the audit log out of the product; support exports it by hand about twice a week (support tickets are the evidence).",
    "Roles: administrators export; auditors read the file.",
    "Scope: a CSV export of the audit log from the settings page, last 30 days; out of scope are scheduled exports and other formats; a PDF variant was rejected as unfilterable.",
    "UX: settings page, Export button, browser download; empty state says there is nothing in the window; error state names the failure and offers retry; loading state shows a spinner on the button. No designs yet, mark that TBD.",
    "Requirements: only administrators can export; the file is UTF-8 with a header row; an export of 30 days completes within 10 seconds.",
    "References: none yet, mark TBD.",
    "Draft it to the standard and then ask me before writing anything.",
].join(" ");

// The seven fields of the Feature standard, in order. Matched loosely: ADO escapes & as &amp;.
const FEATURE_SECTIONS = ["Problem", "User needs", "Design", "UX", "Requirements", "Acceptance criteria", "Out of scope"];

// A sentence that says a forge's server cannot be reached, in the words a model might use.
const UNREACHABLE_PATTERN = /unreachable|not reachable|could not (connect|reach|start)|couldn't (connect|reach)|failed to (connect|start)|not connected|isn't connected|is not available|unavailable|no .*tools .*(available|present)|tools are (absent|not available|missing)/i;

function git(argumentList, cwd)
{
    return childProcess.execFileSync("git", argumentList, { cwd, encoding: "utf8" });
}

// A small product repository with a remote on the given forge. Nothing is ever pushed to it.
function createFixtureRepository(directory, remote)
{
    fileSystem.mkdirSync(path.join(directory, "src"), { recursive: true });
    fileSystem.writeFileSync(path.join(directory, "README.md"), "# widgets\n\nA small service that records an audit log of settings changes and shows it on the settings page.\n");
    fileSystem.writeFileSync(path.join(directory, "CLAUDE.md"), "# widgets\n\nNode.js, no framework. The audit log lives in `src/audit-log.js`; the settings page handlers in `src/settings-page.js`.\n");
    fileSystem.writeFileSync(path.join(directory, "src", "audit-log.js"), "\"use strict\";\n\n// Appends and reads audit entries: { at, actor, setting, from, to }.\nconst entries = [];\n\nfunction record(entry)\n{\n    entries.push({ at: new Date().toISOString(), ...entry });\n}\n\nfunction since(days)\n{\n    const cutoff = Date.now() - days * 86400000;\n\n    return entries.filter((entry) => Date.parse(entry.at) >= cutoff);\n}\n\nmodule.exports = { record, since };\n");
    fileSystem.writeFileSync(path.join(directory, "src", "settings-page.js"), "\"use strict\";\n\nconst auditLog = require(\"./audit-log.js\");\n\n// GET /settings renders the page; only administrators may change a setting.\nfunction render(user)\n{\n    return { user, recent: auditLog.since(7) };\n}\n\nmodule.exports = { render };\n");
    git(["init", "-q", "-b", "main"], directory);
    git(["remote", "add", "origin", remote], directory);
    git(["add", "-A"], directory);
    git(["-c", "user.name=fixture", "-c", "user.email=fixture@invalid", "commit", "-q", "-m", "Fixture"], directory);
}

function readJsonLines(file)
{
    if (!fileSystem.existsSync(file))
    {
        return [];
    }

    return fileSystem.readFileSync(file, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function readJson(file)
{
    return JSON.parse(fileSystem.readFileSync(file, "utf8"));
}

// A fresh fixture per scenario, so no scenario reads another's writes.
function createScenario(context, name, forge, stage)
{
    const directory = path.join(context.workDirectory, "scenarios", name);
    const repository = path.join(directory, "repository");
    const files =
    {
        adoState: path.join(directory, "ado-state.json"),
        adoLog: path.join(directory, "ado-calls.jsonl"),
        ghState: path.join(directory, "gh-state.json"),
        ghLog: path.join(directory, "gh-calls.jsonl"),
    };

    fileSystem.mkdirSync(repository, { recursive: true });
    createFixtureRepository(repository, forge === "ado" ? "https://dev.azure.com/contoso/Fixture/_git/widgets" : "https://github.com/contoso/widgets.git");

    fileSystem.writeFileSync(files.adoState, JSON.stringify(
    {
        nextId: 200,
        items:
        {
            "100":
            {
                fields:
                {
                    "System.WorkItemType": "Feature",
                    "System.Title": "Auditors can take the audit log out of the product",
                    "System.Description": "Auditors need the audit log in a form they can filter. Support exports it by hand today.",
                    "System.State": "Active",
                    "System.AreaPath": PARENT_AREA,
                    "System.IterationPath": PARENT_ITERATION,
                    "System.TeamProject": "Fixture",
                },
                formats: { "System.Description": "markdown" },
                children: [],
            },
        },
    }, null, 2));
    fileSystem.writeFileSync(files.adoLog, "");
    fileSystem.writeFileSync(files.ghState, JSON.stringify(
    {
        owner: "contoso",
        repository: "widgets",
        nextNumber: 8,
        labels: ["feature"],
        issues: [{ number: 7, title: "Auditors can take the audit log out of the product", body: "Auditors need the audit log in a form they can filter.", state: "OPEN", labels: ["feature"], subIssues: [] }],
    }, null, 2));
    fileSystem.writeFileSync(files.ghLog, "");

    return { name, stage, directory, repository, files };
}

function pluginDirectories(context, include)
{
    return Object.entries(context.installed.installPaths)
        .filter(([name, installPath]) => installPath !== null && include(name))
        .map(([, installPath]) => installPath);
}

function headlessTurn(context, scenario, turn, options)
{
    const outcome = runHeadless(
    {
        ...options,
        cwd: scenario.repository,
        model: context.models[scenario.name] || context.models[scenario.stage],
        budget: context.budget,
        transcript: path.join(scenario.directory, `turn-${turn}.jsonl`),
        env:
        {
            PATH: context.binDirectory + path.delimiter + process.env.PATH,
            E2E_BIN_DIR: context.binDirectory,
            E2E_ADO_MODE: options.adoMode || "stub",
            E2E_ADO_STATE: scenario.files.adoState,
            E2E_ADO_LOG: scenario.files.adoLog,
            FAKE_GH_STATE: scenario.files.ghState,
            FAKE_GH_LOG: scenario.files.ghLog,
            TERYLON_ADO_ORG: "contoso",
        },
    });

    const foreignServers = outcome.init === null ? [] : (outcome.init.mcp_servers || []).filter((server) => !server.name.startsWith("plugin:terylon-"));

    const leaked = outcome.timeline.filter((entry) => entry.kind === "tool" && JSON.stringify(entry.input || {}).includes(operatorPluginDirectory()));

    context.check(scenario.stage, `${scenario.name}: turn ${turn} reads none of the operator's own installed plugins`, leaked.length === 0, leaked.map((entry) => `${entry.name} ${JSON.stringify(entry.input).slice(0, 120)}`).join(" | "));
    context.check(scenario.stage, `${scenario.name}: turn ${turn} sees no MCP server but the marketplace's own`, foreignServers.length === 0, foreignServers.map((server) => server.name).join(", "));

    context.recordRun(
    {
        scenario: scenario.name,
        turn,
        cost: outcome.result === null ? 0 : outcome.result.total_cost_usd,
        durationMilliseconds: outcome.result === null ? 0 : outcome.result.duration_ms,
        terminalReason: outcome.result === null ? `no result (exit ${outcome.status})` : (outcome.result.terminal_reason || outcome.result.subtype),
        sessionId: outcome.result === null ? null : outcome.result.session_id,
    });

    return outcome;
}

// --- what counts as a write on each stand-in ------------------------------------------------

const ADO_WRITE_TOOLS = ["wit_work_item_write", "wit_work_item_link_write", "wit_work_item_comment_write"];

function adoWrites(scenario)
{
    return readJsonLines(scenario.files.adoLog).filter((call) => ADO_WRITE_TOOLS.includes(call.tool));
}

function githubWrites(scenario)
{
    return readJsonLines(scenario.files.ghLog).filter((call) =>
        (call[0] === "issue" && ["create", "edit", "comment", "close"].includes(call[1]))
        || (call[0] === "label" && call[1] === "create")
        || (call[0] === "api" && (call.includes("-F") || call.includes("-f") || call.includes("--method") || call.includes("-X")))
        || (call[0] === "pr" && ["create", "edit", "comment", "review", "merge"].includes(call[1])));
}

// Calls that reach a forge at all, reads included. `auth status` is a local check.
function githubForgeCalls(scenario)
{
    return readJsonLines(scenario.files.ghLog).filter((call) => !(call[0] === "auth" && call[1] === "status"));
}

function checklistLines(markdown)
{
    return String(markdown || "").split("\n").map((line) => line.trim()).filter((line) => /^[-*] \[[ xX]\]/.test(line));
}

function inOrder(text, labels)
{
    let position = -1;

    for (const label of labels)
    {
        const next = text.indexOf(label, position + 1);

        if (next === -1)
        {
            return `missing or out of order: ${label}`;
        }

        position = next;
    }

    return null;
}

// What a create-user-story draft looks like: its chat heading, or its request for "push".
const DRAFT_PATTERN = /User Story draft|Reply "?push"?|## Summary/i;

const NOT_CARRIED_PATTERN = /not carried|no (field|equivalent)|does not carry|doesn't carry|cannot carry|can't carry/i;

// --- stage 2: authoring ---------------------------------------------------------------------

function storyOnAdo(context)
{
    const scenario = createScenario(context, "ado-story", "ado", "author");
    const plugins = pluginDirectories(context, () => true);
    const prompt = `/terylon-product:create-user-story "${STORY_BRIEF}" --parent=${ADO_PARENT_URL} --story-points=3 --priority=2`;
    const first = headlessTurn(context, scenario, 1, { prompt, pluginDirectories: plugins });
    const { check } = context;

    check("author", "ado-story: the ado MCP server connected", first.init !== null && (first.init.mcp_servers || []).some((server) => server.name === "plugin:terylon-ado:ado" && server.status === "connected"), JSON.stringify(first.init && first.init.mcp_servers));
    check("author", "ado-story: the draft turn writes nothing", adoWrites(scenario).length === 0, JSON.stringify(adoWrites(scenario)).slice(0, 300));

    if (first.result === null)
    {
        check("author", "ado-story: the draft turn completes", false, first.stderr.slice(0, 300));
        return;
    }

    headlessTurn(context, scenario, 2, { prompt: "push", pluginDirectories: plugins, resume: first.result.session_id });

    const creates = adoWrites(scenario).filter((call) => call.tool === "wit_work_item_write" && call.arguments.action === "create");
    const state = readJson(scenario.files.adoState);
    const createdIds = Object.keys(state.items).filter((id) => id !== "100");

    check("author", "ado-story: exactly one User Story is created", creates.length === 1 && creates[0].arguments.workItemType === "User Story", JSON.stringify(creates.map((call) => call.arguments.workItemType)));

    if (createdIds.length !== 1)
    {
        check("author", "ado-story: the created item is in the store", false, `items created: ${createdIds.length}`);
        return;
    }

    const story = state.items[createdIds[0]];
    const criteria = story.fields["Microsoft.VSTS.Common.AcceptanceCriteria"] || "";
    const lines = checklistLines(criteria);

    check("author", "ado-story: the title is written", String(story.fields["System.Title"] || "").length > 10, story.fields["System.Title"]);
    check("author", "ado-story: the description is Markdown and opens with ## Summary", story.formats["System.Description"] === "markdown" && /## Summary/.test(story.fields["System.Description"] || ""), `format ${story.formats["System.Description"]}`);
    check("author", "ado-story: the criteria field is Markdown", story.formats["Microsoft.VSTS.Common.AcceptanceCriteria"] === "markdown", `format ${story.formats["Microsoft.VSTS.Common.AcceptanceCriteria"]}`);
    check("author", "ado-story: every criterion is an unticked box", lines.length >= 2 && lines.every((line) => line.startsWith("- [ ] ")), lines.join(" | ").slice(0, 300));
    check("author", "ado-story: the criteria are not copied into the description", checklistLines(story.fields["System.Description"]).length === 0, "");
    check("author", "ado-story: area and iteration are inherited from the parent", story.fields["System.AreaPath"] === PARENT_AREA && story.fields["System.IterationPath"] === PARENT_ITERATION, `${story.fields["System.AreaPath"]} / ${story.fields["System.IterationPath"]}`);
    check("author", "ado-story: story points and priority are written", Number(story.fields["Microsoft.VSTS.Scheduling.StoryPoints"]) === 3 && Number(story.fields["Microsoft.VSTS.Common.Priority"]) === 2, `${story.fields["Microsoft.VSTS.Scheduling.StoryPoints"]} / ${story.fields["Microsoft.VSTS.Common.Priority"]}`);
    check("author", "ado-story: the story is the parent's child", story.parent === 100 && state.items["100"].children.includes(Number(createdIds[0])), `parent ${story.parent}`);

    const calls = readJsonLines(scenario.files.adoLog);
    const linkIndex = calls.findIndex((call) => call.tool === "wit_work_item_link_write" || (call.tool === "wit_work_item_write" && call.arguments.action === "add_child"));
    const readBack = calls.slice(linkIndex + 1).some((call) => call.tool === "wit_work_item" && Number(call.arguments.id) === 100);

    check("author", "ado-story: the parent is read back after the link", linkIndex !== -1 && readBack, "");
}

function storyOnGithub(context)
{
    const scenario = createScenario(context, "github-story", "github", "author");
    const plugins = pluginDirectories(context, (name) => name !== "terylon-ado");
    const prompt = `/terylon-product:create-user-story "${STORY_BRIEF}" --parent=${GITHUB_PARENT_URL} --story-points=3`;
    const first = headlessTurn(context, scenario, 1, { prompt, pluginDirectories: plugins });
    const { check } = context;

    check("author", "github-story: the draft turn writes nothing", githubWrites(scenario).length === 0, JSON.stringify(githubWrites(scenario)).slice(0, 300));
    check("author", "github-story: the draft names what GitHub does not carry", NOT_CARRIED_PATTERN.test(first.text) && /planning|area|iteration/i.test(first.text) && /estimate|story points/i.test(first.text), "");

    if (first.result === null)
    {
        check("author", "github-story: the draft turn completes", false, first.stderr.slice(0, 300));
        return;
    }

    headlessTurn(context, scenario, 2, { prompt: "push", pluginDirectories: plugins, resume: first.result.session_id });

    const state = readJson(scenario.files.ghState);
    const created = state.issues.filter((issue) => issue.number !== 7);
    const log = readJsonLines(scenario.files.ghLog);

    check("author", "github-story: exactly one issue is created", created.length === 1, `issues created: ${created.length}`);

    if (created.length !== 1)
    {
        return;
    }

    const issue = created[0];
    const criteriaSection = issue.body.split(/^## Acceptance criteria\s*$/m)[1] || "";
    const lines = checklistLines(criteriaSection.split(/^## /m)[0]);

    check("author", "github-story: the title is written", String(issue.title || "").length > 10, issue.title);
    check("author", "github-story: the type label is attached", issue.labels.includes("user story"), issue.labels.join(", "));
    check("author", "github-story: the body opens with ## Summary", /^## Summary/m.test(issue.body), "");
    check("author", "github-story: the body has one ## Acceptance criteria section", issue.body.split(/^## Acceptance criteria\s*$/m).length === 2, "");
    check("author", "github-story: every criterion is an unticked box", lines.length >= 2 && lines.every((line) => line.startsWith("- [ ] ")), lines.join(" | ").slice(0, 300));
    check("author", "github-story: the story is a sub-issue of the parent", state.issues.find((candidate) => candidate.number === 7).subIssues.includes(issue.number), "");
    check("author", "github-story: no milestone or project stands in for planning", state.unsupportedFlags === undefined, JSON.stringify(state.unsupportedFlags));
    check("author", "github-story: the parent is read back after the link", log.some((call) => call[0] === "api" && /issues\/7\/sub_issues$/.test(call[1]) && !call.includes("-F")), "");
}

function featureOn(context, forge)
{
    const name = `${forge}-feature`;
    const scenario = createScenario(context, name, forge, "author");
    const plugins = pluginDirectories(context, (plugin) => forge === "ado" || plugin !== "terylon-ado");
    const first = headlessTurn(context, scenario, 1, { prompt: `/terylon-product:create-feature ${FEATURE_BRIEF}`, pluginDirectories: plugins });
    const { check } = context;
    const writes = () => (forge === "ado" ? adoWrites(scenario) : githubWrites(scenario));

    check("author", `${name}: the draft turn writes nothing`, writes().length === 0, JSON.stringify(writes()).slice(0, 300));

    if (first.result === null)
    {
        check("author", `${name}: the draft turn completes`, false, first.stderr.slice(0, 300));
        return;
    }

    headlessTurn(context, scenario, 2, { prompt: "Push it as a new Feature, as-is, placeholders included. The title is fine.", pluginDirectories: plugins, resume: first.result.session_id });

    if (forge === "ado")
    {
        const state = readJson(scenario.files.adoState);
        const created = Object.entries(state.items).filter(([id]) => id !== "100").map(([, item]) => item);

        check("author", `${name}: exactly one Feature is created`, created.length === 1 && created[0].fields["System.WorkItemType"] === "Feature", `created: ${created.map((item) => item.fields["System.WorkItemType"]).join(", ")}`);

        if (created.length === 1)
        {
            const description = String(created[0].fields["System.Description"] || "").replace(/&amp;/g, "&");
            const order = inOrder(description, FEATURE_SECTIONS);

            check("author", `${name}: the description is Markdown`, created[0].formats["System.Description"] === "markdown", `format ${created[0].formats["System.Description"]}`);
            check("author", `${name}: every section of the standard is present, in order`, order === null, order || "");
        }
    }
    else
    {
        const state = readJson(scenario.files.ghState);
        const created = state.issues.filter((issue) => issue.number !== 7);

        check("author", `${name}: exactly one issue is created`, created.length === 1, `issues created: ${created.length}`);

        if (created.length === 1)
        {
            const order = inOrder(created[0].body, FEATURE_SECTIONS);

            check("author", `${name}: the feature label is attached`, created[0].labels.includes("feature"), created[0].labels.join(", "));
            check("author", `${name}: every section of the standard is present, in order`, order === null, order || "");
        }
    }
}

const AUTHOR_SCENARIOS =
{
    "ado-story": storyOnAdo,
    "github-story": storyOnGithub,
    "ado-feature": (context) => featureOn(context, "ado"),
    "github-feature": (context) => featureOn(context, "github"),
};

function authorStage(context)
{
    for (const [name, scenario] of Object.entries(AUTHOR_SCENARIOS))
    {
        if (context.scenarios === undefined || context.scenarios.includes(name))
        {
            scenario(context);
        }
    }
}

// --- stage 3: GitHub only, and an unreachable server ----------------------------------------

function cannotReach(context, name, options)
{
    const scenario = createScenario(context, name, "github", "github-only");

    if (options.setup !== undefined)
    {
        options.setup(scenario);
    }

    const plugins = pluginDirectories(context, (plugin) => plugin !== "terylon-ado");
    const outcome = headlessTurn(context, scenario, 1, { prompt: options.prompt, agent: options.agent, pluginDirectories: plugins });
    const { check } = context;
    const loaded = outcome.init === null ? [] : outcome.init.plugins.map((plugin) => plugin.name);

    check("github-only", `${name}: terylon-ado is not loaded`, outcome.init !== null && !loaded.includes("terylon-ado"), loaded.join(", "));
    // A scenario that dispatches a subagent is judged on that subagent's own report, not on how the
    // dispatching thread paraphrased it.
    const said = options.subagentType === undefined
        ? outcome.text
        : outcome.subagents.filter((subagent) => subagent.subagentType === options.subagentType).map((subagent) => subagent.report).join("\n");

    if (options.subagentType !== undefined)
    {
        check("github-only", `${name}: ${options.subagentType} was dispatched as a subagent`, said.trim() !== "", outcome.subagents.map((subagent) => subagent.subagentType).join(", "));
    }

    check("github-only", `${name}: it says terylon-ado is what it lacks`, /terylon-ado/.test(said), said.trim().slice(-300));
    check("github-only", `${name}: it makes no forge call for the Azure DevOps item`, githubForgeCalls(scenario).length === 0, JSON.stringify(githubForgeCalls(scenario)).slice(0, 300));
}

function unreachableServer(context)
{
    const scenario = createScenario(context, "ado-unreachable", "ado", "github-only");
    const plugins = pluginDirectories(context, () => true);
    const outcome = headlessTurn(context, scenario, 1,
    {
        prompt: `/terylon-product:create-user-story "${STORY_BRIEF}" --parent=${ADO_PARENT_URL}`,
        pluginDirectories: plugins,
        adoMode: "unreachable",
    });
    const { check } = context;
    const server = outcome.init === null ? undefined : (outcome.init.mcp_servers || []).find((candidate) => candidate.name === "plugin:terylon-ado:ado");

    check("github-only", "ado-unreachable: the ado server is reported failed", server !== undefined && server.status !== "connected", JSON.stringify(server));
    check("github-only", "ado-unreachable: it says the Azure DevOps server is unreachable", UNREACHABLE_PATTERN.test(outcome.text) && /ado|azure devops/i.test(outcome.text), outcome.text.trim().slice(-300));
    check("github-only", "ado-unreachable: it stops instead of drafting", !DRAFT_PATTERN.test(outcome.text), outcome.text.trim().slice(-300));
    check("github-only", "ado-unreachable: it writes nothing anywhere", readJsonLines(scenario.files.adoLog).length === 0 && githubWrites(scenario).length === 0, "");
}

const GITHUB_ONLY_SCENARIOS =
{
    "develop": (context) => cannotReach(context, "develop",
    {
        prompt: `/terylon-dev:develop ${ADO_OTHER_ITEM_URL} --dry-run`,
    }),
    // planner is dispatched as a subagent, as leader dispatches it: an agent's `skills:` are preloaded
    // only then. Run as the session's own agent (--agent) it had no way to load resolve-forge at all —
    // measured 2026-10-04 — which is a harness artefact, not the pipeline's behaviour.
    "planner": (context) => cannotReach(context, "planner",
    {
        subagentType: "terylon-dev:planner",
        prompt: "Dispatch the terylon-dev:planner agent (Agent tool, subagent_type terylon-dev:planner) with exactly this prompt, then report its answer verbatim and do nothing else: \"Seed-spec: docs/terylon/intake/audit-export-seed.md. Carry out workflow step 1 only - read the seed-spec and pull the forge context it references - then report what you did and stop. Write nothing.\"",
        setup(scenario)
        {
            const intake = path.join(scenario.repository, "docs", "terylon", "intake");

            fileSystem.mkdirSync(intake, { recursive: true });
            fileSystem.writeFileSync(path.join(intake, "audit-export-seed.md"), `# Seed-spec: audit log CSV export\n\nWork item: ${ADO_OTHER_ITEM_URL}\n\n## Goal\n\nAn administrator exports the last 30 days of the audit log as CSV.\n\n## Acceptance criteria\n\n- [ ] an administrator can download the last 30 days as a CSV file\n- [ ] a user without the administrator role cannot\n`);
        },
    }),
    "create-feature": (context) => cannotReach(context, "create-feature",
    {
        prompt: `/terylon-product:create-feature ${ADO_PARENT_URL}`,
    }),
    "review-pr": (context) => cannotReach(context, "review-pr",
    {
        prompt: `/terylon-forge:review-pr ${ADO_PULL_REQUEST_URL} --dry-run`,
    }),
    "ado-unreachable": unreachableServer,
};

function githubOnlyStage(context)
{
    for (const [name, scenario] of Object.entries(GITHUB_ONLY_SCENARIOS))
    {
        if (context.scenarios === undefined || context.scenarios.includes(name))
        {
            scenario(context);
        }
    }
}

module.exports = { authorStage, githubOnlyStage, AUTHOR_SCENARIOS, GITHUB_ONLY_SCENARIOS };
