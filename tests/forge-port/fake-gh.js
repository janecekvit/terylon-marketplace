#!/usr/bin/env node
//
// fake-gh — a stand-in for the `gh` CLI, for the forge-port fixture.
//
// It implements only the subcommands the GitHub body of forge-ops issues for work-item
// authoring, and it refuses the same mistakes the real CLI and API refuse, because a stand-in
// that accepts everything proves nothing:
//
//   - `gh issue create --label X` fails when label X does not exist in the repository
//   - `gh api .../sub_issues -f sub_issue_id=N` sends a string; the API rejects it (422)
//   - `sub_issue_id` must be an issue's database id; an issue number is not one (404)
//
// State lives in the JSON file named by FAKE_GH_STATE, and every invocation is appended to the
// file named by FAKE_GH_LOG, one JSON array of arguments per line, so a test can read back what
// was called as well as what was stored.
//
"use strict";

const fileSystem = require("fs");
const childProcess = require("child_process");

// A database id is the issue number offset by this, so the two can never be confused in a
// test: a number passed where an id belongs matches no issue.
const DATABASE_ID_OFFSET = 900000000;

const ISSUE_ENDPOINT_PATTERN = /^repos\/([^/]+)\/([^/]+)\/issues\/([0-9]+)$/;
const SUB_ISSUES_ENDPOINT_PATTERN = /^repos\/([^/]+)\/([^/]+)\/issues\/([0-9]+)\/sub_issues$/;
const PARENT_ENDPOINT_PATTERN = /^repos\/([^/]+)\/([^/]+)\/issues\/([0-9]+)\/parent$/;

function fail(message, exitCode)
{
    process.stderr.write(message + "\n");
    process.exit(exitCode ?? 1);
}

function readState()
{
    return JSON.parse(fileSystem.readFileSync(process.env.FAKE_GH_STATE, "utf8"));
}

function writeState(state)
{
    fileSystem.writeFileSync(process.env.FAKE_GH_STATE, JSON.stringify(state, null, 2));
}

// Returns { positional: [], options: { name: [values] } }. Every option here takes a value.
function parseOptions(argumentList)
{
    const positional = [];
    const options = {};

    for (let index = 0; index < argumentList.length; index++)
    {
        const argument = argumentList[index];

        if (argument.startsWith("--") || /^-[a-zA-Z]$/.test(argument))
        {
            const name = argument.replace(/^-+/, "");
            options[name] = options[name] || [];
            options[name].push(argumentList[++index]);
        }
        else
        {
            positional.push(argument);
        }
    }

    return { positional, options };
}

function last(options, name)
{
    const values = options[name];

    return values === undefined ? undefined : values[values.length - 1];
}

// --jq is evaluated by the real jq, raw output, as gh does.
function emit(value, options)
{
    const filter = last(options, "jq");

    if (filter === undefined)
    {
        process.stdout.write(JSON.stringify(value) + "\n");
        return;
    }

    const result = childProcess.spawnSync("jq", ["-r", "-c", filter],
    {
        input: JSON.stringify(value),
        encoding: "utf8",
    });

    if (result.status !== 0)
    {
        fail("jq: " + result.stderr, result.status);
    }

    process.stdout.write(result.stdout);
}

function findIssueByNumber(state, number)
{
    const issue = state.issues.find((candidate) => candidate.number === Number(number));

    if (issue === undefined)
    {
        fail(`GraphQL: Could not resolve to an issue or pull request with the number of ${number}.`);
    }

    return issue;
}

function asIssueJson(state, issue)
{
    return {
        number: issue.number,
        id: issue.number + DATABASE_ID_OFFSET,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels.map((name) => ({ name })),
        url: `https://github.com/${state.owner}/${state.repository}/issues/${issue.number}`,
        comments: [],
        assignees: [],
    };
}

function commandLabel(subcommand, rest)
{
    const { positional, options } = parseOptions(rest);
    const state = readState();

    if (subcommand === "list")
    {
        const search = last(options, "search") || "";
        const matches = state.labels
            .filter((name) => name.toLowerCase().includes(search.toLowerCase()))
            .map((name) => ({ name }));

        emit(matches, options);
        return;
    }

    if (subcommand === "create")
    {
        const name = positional[0];

        if (state.labels.includes(name))
        {
            fail(`label with name "${name}" already exists; use \`--force\` to update its color and description`);
        }

        state.labels.push(name);
        writeState(state);
        return;
    }

    fail(`fake-gh: label ${subcommand} is not implemented`, 2);
}

function commandIssue(subcommand, rest)
{
    const { positional, options } = parseOptions(rest);
    const state = readState();

    if (subcommand === "create")
    {
        const labels = (options.label || []).flatMap((value) => value.split(","));

        for (const label of labels)
        {
            if (!state.labels.includes(label))
            {
                fail(`could not add label: '${label}' not found`);
            }
        }

        for (const unsupported of ["milestone", "project"])
        {
            if (options[unsupported] !== undefined)
            {
                state.unsupportedFlags = (state.unsupportedFlags || []).concat(unsupported);
            }
        }

        const number = state.nextNumber++;
        const issue =
        {
            number,
            title: last(options, "title"),
            body: fileSystem.readFileSync(last(options, "body-file"), "utf8"),
            state: "OPEN",
            labels,
            subIssues: [],
        };

        state.issues.push(issue);
        writeState(state);
        process.stdout.write(`https://github.com/${state.owner}/${state.repository}/issues/${number}\n`);
        return;
    }

    if (subcommand === "view")
    {
        emit(asIssueJson(state, findIssueByNumber(state, positional[0])), options);
        return;
    }

    if (subcommand === "edit")
    {
        const issue = findIssueByNumber(state, positional[0]);

        if (last(options, "body-file") !== undefined)
        {
            issue.body = fileSystem.readFileSync(last(options, "body-file"), "utf8");
        }

        if (last(options, "title") !== undefined)
        {
            issue.title = last(options, "title");
        }

        writeState(state);
        return;
    }

    fail(`fake-gh: issue ${subcommand} is not implemented`, 2);
}

function commandApi(rest)
{
    const { positional, options } = parseOptions(rest);
    const state = readState();
    const endpoint = positional[0];
    const typedFields = options.F || [];
    const stringFields = options.f || [];
    const isWrite = typedFields.length + stringFields.length > 0;

    let match = endpoint.match(SUB_ISSUES_ENDPOINT_PATTERN);

    if (match !== null)
    {
        const parent = findIssueByNumber(state, match[3]);

        if (!isWrite)
        {
            emit(parent.subIssues.map((number) => asIssueJson(state, findIssueByNumber(state, number))), options);
            return;
        }

        if (stringFields.some((field) => field.startsWith("sub_issue_id=")))
        {
            fail("gh: Invalid property /sub_issue_id: is not of type `integer`. (HTTP 422)");
        }

        const field = typedFields.find((candidate) => candidate.startsWith("sub_issue_id="));
        const databaseId = Number(field.split("=")[1]);
        const child = state.issues.find((candidate) => candidate.number + DATABASE_ID_OFFSET === databaseId);

        if (child === undefined)
        {
            fail("gh: Not Found (HTTP 404)");
        }

        parent.subIssues.push(child.number);
        writeState(state);
        emit(asIssueJson(state, parent), options);
        return;
    }

    match = endpoint.match(PARENT_ENDPOINT_PATTERN);

    if (match !== null)
    {
        const childNumber = Number(match[3]);
        const parent = state.issues.find((candidate) => candidate.subIssues.includes(childNumber));

        if (parent === undefined)
        {
            fail("gh: Not Found (HTTP 404)");
        }

        emit(asIssueJson(state, parent), options);
        return;
    }

    match = endpoint.match(ISSUE_ENDPOINT_PATTERN);

    if (match !== null && !isWrite)
    {
        emit(asIssueJson(state, findIssueByNumber(state, match[3])), options);
        return;
    }

    fail(`fake-gh: api ${endpoint} is not implemented`, 2);
}

function main()
{
    const argumentList = process.argv.slice(2);

    fileSystem.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(argumentList) + "\n");

    const [command, subcommand, ...rest] = argumentList;

    if (command === "auth" && subcommand === "status")
    {
        // A stand-in identity: the harness holds no GitHub credential.
        process.stdout.write("github.com\n  ✓ Logged in to github.com account e2e-stub (stand-in)\n");
        return;
    }

    if (command === "repo" && subcommand === "view")
    {
        const state = readState();

        emit({ nameWithOwner: `${state.owner}/${state.repository}`, name: state.repository, owner: { login: state.owner } }, parseOptions(rest).options);
        return;
    }

    if (command === "label")
    {
        commandLabel(subcommand, rest);
    }
    else if (command === "issue")
    {
        commandIssue(subcommand, rest);
    }
    else if (command === "api")
    {
        commandApi([subcommand, ...rest]);
    }
    else
    {
        fail(`fake-gh: ${command} is not implemented`, 2);
    }
}

main();
