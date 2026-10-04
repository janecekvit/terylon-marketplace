#!/usr/bin/env node
//
// ado-mcp-stub — a stand-in for `@azure-devops/mcp@2.9.0`, for the end-to-end harness.
//
// It speaks MCP over stdio (newline-delimited JSON-RPC), exposes the work-item tools of the
// pinned 2.9.0 surface under the same names, keeps a small item store, and appends every
// tools/call to E2E_ADO_LOG so the harness can assert what was written. It holds no credential
// and talks to nothing.
//
// It refuses to start without an organisation argument, as the real server does, so a
// `.mcp.json` that stops passing `${TERYLON_ADO_ORG}` turns the harness red instead of loading.
//
// State: E2E_ADO_STATE, a JSON file { nextId, items: { "<id>": { fields, formats, parent, children } } }.
//
"use strict";

const fileSystem = require("fs");
const readline = require("readline");

// The fields every created item gets unless the create names them.
const DEFAULT_STATE = "New";

// A multiline field that may carry a per-field format.
const MULTILINE_FIELDS = ["System.Description", "Microsoft.VSTS.Common.AcceptanceCriteria", "Microsoft.VSTS.TCM.ReproSteps"];

const organisation = process.argv[2];

if (organisation === undefined || organisation === "" || organisation.startsWith("-"))
{
    process.stderr.write("Fatal error in main(): no organisation was passed to the Azure DevOps MCP server\n");
    process.exit(1);
}

function readState()
{
    return JSON.parse(fileSystem.readFileSync(process.env.E2E_ADO_STATE, "utf8"));
}

function writeState(state)
{
    fileSystem.writeFileSync(process.env.E2E_ADO_STATE, JSON.stringify(state, null, 2));
}

function record(name, argumentsObject)
{
    fileSystem.appendFileSync(process.env.E2E_ADO_LOG, JSON.stringify({ tool: name, arguments: argumentsObject }) + "\n");
}

function itemUrl(project, id)
{
    return `https://dev.azure.com/${organisation}/${project}/_workitems/edit/${id}`;
}

// The response shape of wit_work_item(action="get"): fields, multilineFieldsFormat, relations.
function present(state, id, withRelations)
{
    const item = state.items[String(id)];

    if (item === undefined)
    {
        return null;
    }

    const project = (item.fields["System.TeamProject"] || "Fixture");
    const result =
    {
        id: Number(id),
        rev: item.rev || 1,
        fields: { ...item.fields },
        multilineFieldsFormat: { ...item.formats },
        _links: { html: { href: itemUrl(project, id) } },
        url: itemUrl(project, id),
    };

    if (item.parent !== undefined && item.parent !== null)
    {
        result.fields["System.Parent"] = item.parent;
    }

    if (withRelations)
    {
        result.relations = [];

        if (item.parent !== undefined && item.parent !== null)
        {
            result.relations.push({ rel: "System.LinkTypes.Hierarchy-Reverse", url: `https://dev.azure.com/${organisation}/_apis/wit/workItems/${item.parent}`, attributes: { name: "Parent" } });
        }

        for (const child of item.children || [])
        {
            result.relations.push({ rel: "System.LinkTypes.Hierarchy-Forward", url: `https://dev.azure.com/${organisation}/_apis/wit/workItems/${child}`, attributes: { name: "Child" } });
        }
    }

    return result;
}

function link(state, childId, parentId)
{
    const child = state.items[String(childId)];
    const parent = state.items[String(parentId)];

    if (child === undefined || parent === undefined)
    {
        throw new Error(`TF401232: Work item ${child === undefined ? childId : parentId} does not exist, or you do not have permissions to read it.`);
    }

    child.parent = Number(parentId);
    parent.children = parent.children || [];

    if (!parent.children.includes(Number(childId)))
    {
        parent.children.push(Number(childId));
    }
}

function create(state, workItemType, fields, project)
{
    const id = state.nextId++;
    const item = { fields: { "System.WorkItemType": workItemType, "System.State": DEFAULT_STATE, "System.TeamProject": project || "Fixture" }, formats: {}, children: [] };

    for (const field of fields || [])
    {
        item.fields[field.name] = field.value;

        if (MULTILINE_FIELDS.includes(field.name))
        {
            item.formats[field.name] = String(field.format || "html").toLowerCase();
        }
    }

    state.items[String(id)] = item;
    return id;
}

function applyPatch(state, id, operations)
{
    const item = state.items[String(id)];

    if (item === undefined)
    {
        throw new Error(`TF401232: Work item ${id} does not exist, or you do not have permissions to read it.`);
    }

    for (const operation of operations || [])
    {
        const fieldMatch = String(operation.path || "").match(/^\/fields\/(.+)$/);
        const formatMatch = String(operation.path || "").match(/^\/multilineFieldsFormat\/(.+)$/);

        if (fieldMatch !== null)
        {
            item.fields[fieldMatch[1]] = operation.value;

            if (operation.format !== undefined && MULTILINE_FIELDS.includes(fieldMatch[1]))
            {
                item.formats[fieldMatch[1]] = String(operation.format).toLowerCase();
            }
        }
        else if (formatMatch !== null)
        {
            item.formats[formatMatch[1]] = String(operation.value).toLowerCase();
        }
    }

    item.rev = (item.rev || 1) + 1;
}

// The typed parameters of the 2.9.0 surface, as far as the marketplace's recipes use them. A model
// reads these schemas; untyped, it passes arrays as JSON strings, which the real server's validation
// would refuse. So they are typed, and a value of the wrong type is refused here the same way.
const FIELD = { type: "object", properties: { name: { type: "string" }, value: {}, format: { type: "string" } }, required: ["name", "value"] };
const PATCH = { type: "object", properties: { op: { type: "string" }, path: { type: "string" }, value: {}, id: { type: "number" }, format: { type: "string" } }, required: ["path"] };
const LINK = { type: "object", properties: { id: { type: "number" }, linkToId: { type: "number" }, type: { type: "string" }, comment: { type: "string" } }, required: ["id", "linkToId", "type"] };
const CHILD = { type: "object", properties: { title: { type: "string" }, description: { type: "string" }, format: { type: "string" }, areaPath: { type: "string" }, iterationPath: { type: "string" } }, required: ["title"] };

const PARAMETERS =
{
    wit_work_item: { id: { type: "number" }, ids: { type: "array", items: { type: "number" } }, workItemId: { type: "number" }, project: { type: "string" }, expand: { type: "string" }, fields: { type: "array", items: { type: "string" } }, top: { type: "number" }, skip: { type: "number" } },
    wit_work_item_write: { project: { type: "string" }, workItemType: { type: "string" }, fields: { type: "array", items: FIELD }, id: { type: "number" }, updates: { type: "array", items: PATCH }, batchUpdates: { type: "array", items: PATCH }, parentId: { type: "number" }, items: { type: "array", items: CHILD } },
    wit_work_item_link_write: { project: { type: "string" }, projectId: { type: "string" }, repositoryId: { type: "string" }, pullRequestId: { type: "number" }, workItemId: { type: "number" }, updates: { type: "array", items: LINK } },
    wit_work_item_comment_write: { project: { type: "string" }, workItemId: { type: "number" }, commentId: { type: "number" }, text: { type: "string" }, format: { type: "string" } },
    repo_repository: { project: { type: "string" }, repositoryNameOrId: { type: "string" } },
};

// Refuses what typed validation refuses: an array passed as a string, a number passed as text.
// A numeric string is accepted for a number, as the real server's coercion does.
function validate(name, input)
{
    for (const [key, schema] of Object.entries(PARAMETERS[name] || {}))
    {
        const value = input[key];

        if (value === undefined)
        {
            continue;
        }

        if (schema.type === "array" && !Array.isArray(value))
        {
            return `MCP error -32602: Invalid arguments for tool ${name}: ${key}: Expected array, received ${typeof value}`;
        }

        if (schema.type === "number" && Number.isNaN(Number(value)))
        {
            return `MCP error -32602: Invalid arguments for tool ${name}: ${key}: Expected number, received ${typeof value}`;
        }
    }

    return null;
}

// Every tool takes an `action`; the per-action parameters follow the 2.9.0 surface.
const TOOLS =
{
    wit_work_item:
    {
        description: "Read work items. Actions: get (id, expand?, fields?), get_batch (ids, fields), list_comments (workItemId).",
        actions: ["get", "get_batch", "list_comments", "list_revisions"],
        handle(state, input)
        {
            if (input.action === "get")
            {
                const item = present(state, input.id, true);

                if (item === null)
                {
                    throw new Error(`TF401232: Work item ${input.id} does not exist, or you do not have permissions to read it.`);
                }

                return item;
            }

            if (input.action === "get_batch")
            {
                const items = (input.ids || []).map((id) => present(state, id, false));

                return items.includes(null) ? null : items;
            }

            if (input.action === "list_comments")
            {
                return { totalCount: 0, comments: [] };
            }

            return { revisions: [] };
        },
    },
    wit_work_item_write:
    {
        description: "Write work items. Actions: create (workItemType, fields: [{name, value, format?}], project), update (id, updates: [{op, path, value}]), update_batch (batchUpdates: [{id, op, path, value, format?}]), add_child (parentId, workItemType, items: [{title, description, format, areaPath?, iterationPath?}]).",
        actions: ["create", "update", "update_batch", "add_child"],
        handle(state, input)
        {
            if (input.action === "create")
            {
                const id = create(state, input.workItemType, input.fields, input.project);

                return present(state, id, false);
            }

            if (input.action === "update")
            {
                applyPatch(state, input.id, input.updates);

                return present(state, input.id, false);
            }

            if (input.action === "update_batch")
            {
                for (const update of input.batchUpdates || [])
                {
                    applyPatch(state, update.id, [update]);
                }

                return { count: (input.batchUpdates || []).length };
            }

            const created = (input.items || []).map((child) =>
            {
                const fields =
                [
                    { name: "System.Title", value: child.title },
                    { name: "System.Description", value: child.description, format: child.format },
                ];

                if (child.areaPath !== undefined)
                {
                    fields.push({ name: "System.AreaPath", value: child.areaPath });
                }

                if (child.iterationPath !== undefined)
                {
                    fields.push({ name: "System.IterationPath", value: child.iterationPath });
                }

                const id = create(state, input.workItemType, fields, input.project);

                link(state, id, input.parentId);
                return present(state, id, false);
            });

            return created;
        },
    },
    wit_work_item_link_write:
    {
        description: "Link work items. Actions: link (updates: [{id, linkToId, type}]), unlink, link_to_pull_request, add_artifact_link.",
        actions: ["link", "unlink", "link_to_pull_request", "add_artifact_link"],
        handle(state, input)
        {
            if (input.action !== "link")
            {
                throw new Error(`the stub implements link only, not ${input.action}`);
            }

            for (const update of input.updates || [])
            {
                if (update.type !== "parent")
                {
                    throw new Error(`the stub links type "parent" only, not "${update.type}"`);
                }

                link(state, update.id, update.linkToId);
            }

            return (input.updates || []).map((update) => present(state, update.id, true));
        },
    },
    wit_work_item_comment_write:
    {
        description: "Write work-item comments. Actions: add (workItemId, text, format?), update (workItemId, commentId, text).",
        actions: ["add", "update"],
        handle(state, input)
        {
            return { id: 1, workItemId: input.workItemId, text: input.text };
        },
    },
    repo_repository:
    {
        description: "Read repositories. Actions: get (repositoryNameOrId, project), list (project).",
        actions: ["get", "list"],
        handle(state, input)
        {
            return { id: "00000000-0000-0000-0000-000000000001", name: input.repositoryNameOrId || "widgets", project: { name: input.project || "Fixture" } };
        },
    },
};

function listTools()
{
    return Object.entries(TOOLS).map(([name, tool]) => (
    {
        name,
        description: tool.description,
        inputSchema:
        {
            type: "object",
            properties: { action: { type: "string", enum: tool.actions }, ...(PARAMETERS[name] || {}) },
            required: ["action"],
            additionalProperties: true,
        },
    }));
}

function callTool(name, input)
{
    record(name, input);

    const tool = TOOLS[name];

    if (tool === undefined)
    {
        return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
    }

    const invalid = validate(name, input || {});

    if (invalid !== null)
    {
        return { isError: true, content: [{ type: "text", text: invalid }] };
    }

    const state = readState();

    try
    {
        const result = tool.handle(state, input || {});

        writeState(state);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    catch (error)
    {
        return { isError: true, content: [{ type: "text", text: error.message }] };
    }
}

function respond(id, result)
{
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function respondError(id, code, message)
{
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n");
}

const input = readline.createInterface({ input: process.stdin });

input.on("line", (line) =>
{
    let message;

    try
    {
        message = JSON.parse(line);
    }
    catch
    {
        // Not a JSON-RPC line; the protocol has nothing to answer.
        return;
    }

    if (message.id === undefined)
    {
        return;
    }

    if (message.method === "initialize")
    {
        respond(message.id,
        {
            protocolVersion: (message.params && message.params.protocolVersion) || "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "Azure DevOps MCP Server (e2e stub)", version: "2.9.0" },
        });
    }
    else if (message.method === "tools/list")
    {
        respond(message.id, { tools: listTools() });
    }
    else if (message.method === "tools/call")
    {
        respond(message.id, callTool(message.params.name, message.params.arguments));
    }
    else if (message.method === "ping")
    {
        respond(message.id, {});
    }
    else
    {
        respondError(message.id, -32601, `Method not found: ${message.method}`);
    }
});
