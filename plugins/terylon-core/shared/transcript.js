#!/usr/bin/env node
"use strict";

// Reading a session transcript's token usage — the one place that does it.
//
// A single API response is written to a transcript as SEVERAL `assistant` records, one per content
// block (`thinking`, `text`, `tool_use`), and every one of them repeats that response's complete
// `usage`. Summing records therefore counts one response two or three times. Measured across one
// controller transcript: 199 assistant records for 77 responses, cache-read overstated 2.59x, and
// the overstatement scales with how many blocks a response carries — so it is uneven per agent and
// changes the ranking rather than merely inflating it.
//
// Records of one response share a `message.id`, so grouping on it and counting each group once is
// the whole fix. Per field, verified across 61 multi-record messages in a real transcript:
//
//     cache_read_input_tokens      identical across the group   take one
//     cache_creation_input_tokens  identical across the group   take one
//     output_tokens                grows (1, 1, 183)            take the maximum
//
// Why a carry rather than an offset rewind: the hook reads a byte range and a response's records can
// straddle two reads. Rewinding to the last complete response would hold that response back until
// more bytes arrive — and once an agent finishes, no more ever do, so its final response would never
// be counted. Carrying what was already counted for the trailing message makes a re-read idempotent
// instead, and loses nothing.

const ASSISTANT_RECORD_TYPE = "assistant";

const OUTPUT_FIELD = "output_tokens";
const CACHE_READ_FIELD = "cache_read_input_tokens";
const CACHE_WRITE_FIELD = "cache_creation_input_tokens";

// Records without a `message.id` predate the field or come from a different writer. Each becomes its
// own group under a synthetic key, so such a transcript degrades to the old per-record behaviour
// rather than collapsing into one group and reporting almost nothing.
const ANONYMOUS_KEY_PREFIX = "\u0000anonymous-";

function readGroup(group, field, usage)
{
    return Math.max(group[field], usage || 0);
}

function collectGroups(transcriptText)
{
    const groups = new Map();
    const order = [];

    let assistantRecords = 0;
    let anonymousCount = 0;
    let model = null;

    for (const line of String(transcriptText === null || transcriptText === undefined ? "" : transcriptText).split("\n"))
    {
        if (line.trim() === "") { continue; }

        let record;

        try
        {
            record = JSON.parse(line);
        }
        catch
        {
            // A truncated line from an agent that died mid-response is skipped, not fatal.
            continue;
        }

        if (!record || record.type !== ASSISTANT_RECORD_TYPE) { continue; }

        const usage = record.message && record.message.usage;

        if (!usage) { continue; }

        assistantRecords += 1;

        if (model === null && typeof record.message.model === "string")
        {
            model = record.message.model;
        }

        const hasIdentifier = typeof record.message.id === "string" && record.message.id !== "";

        anonymousCount += hasIdentifier ? 0 : 1;

        const identifier = hasIdentifier ? record.message.id : ANONYMOUS_KEY_PREFIX + anonymousCount;

        let group = groups.get(identifier);

        if (group === undefined)
        {
            group = { messageId: identifier, identified: hasIdentifier, output: 0, cacheRead: 0, cacheWrite: 0 };

            groups.set(identifier, group);
            order.push(group);
        }

        group.output = readGroup(group, "output", usage[OUTPUT_FIELD]);
        group.cacheRead = readGroup(group, "cacheRead", usage[CACHE_READ_FIELD]);
        group.cacheWrite = readGroup(group, "cacheWrite", usage[CACHE_WRITE_FIELD]);
    }

    return { order, assistantRecords, model };
}

function sumAssistantUsage(transcriptText, carryIn)
{
    const collected = collectGroups(transcriptText);

    const totals =
    {
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        assistantRecords: collected.assistantRecords,
        messages: collected.order.length,
        model: collected.model,
    };

    const carried = carryIn && typeof carryIn.messageId === "string" ? carryIn : null;

    for (const group of collected.order)
    {
        const alreadyCounted = carried !== null && group.identified && carried.messageId === group.messageId ? carried : null;

        totals.output += group.output - (alreadyCounted === null ? 0 : alreadyCounted.output || 0);
        totals.cacheRead += group.cacheRead - (alreadyCounted === null ? 0 : alreadyCounted.cacheRead || 0);
        totals.cacheWrite += group.cacheWrite - (alreadyCounted === null ? 0 : alreadyCounted.cacheWrite || 0);
    }

    // Only the trailing group can still grow, so it is the only one worth carrying. A slice that
    // held no assistant record at all leaves the incoming carry standing rather than dropping it.
    //
    // An unidentified group is never carried. Its key is positional and restarts at 1 on every read,
    // so a carry built from one would match whichever record happened to land first in the next slice
    // and subtract usage that record never had.
    const trailing = collected.order.length === 0 ? null : collected.order[collected.order.length - 1];

    const carry = trailing === null
        ? carried
        : trailing.identified
            ? { messageId: trailing.messageId, output: trailing.output, cacheRead: trailing.cacheRead, cacheWrite: trailing.cacheWrite }
            : null;

    return { totals, carry };
}

module.exports =
{
    ASSISTANT_RECORD_TYPE,
    OUTPUT_FIELD,
    CACHE_READ_FIELD,
    CACHE_WRITE_FIELD,
    sumAssistantUsage,
};
