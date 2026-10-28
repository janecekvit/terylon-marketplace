// Which of the mutations one shard runs (#42). CI splits the mutation suite into parallel jobs, each on a runner of
// its own, by setting MUTATION_SHARD to "<index>/<count>", 1-based. Within a shard the runs stay one after another:
// acts.test.ts sometimes fails under full CPU load (#39). Unset or empty, a shard is the whole list, as before.
"use strict";

// "<index>/<count>": two positive integers, no sign, no spaces.
const SHARD_PATTERN = /^([1-9][0-9]*)\/([1-9][0-9]*)$/;

// Returns { index, count }, or null when no shard is asked for. A malformed value throws: a shard that silently
// ran everything, or nothing, would let a mutation go unrun while every job reported green.
function parseShard(value)
{
    if (value === undefined || value === "")
    {
        return null;
    }

    const match = SHARD_PATTERN.exec(value);

    if (match === null)
    {
        throw new Error(`MUTATION_SHARD must be "<index>/<count>", 1-based, e.g. "2/4"; got ${JSON.stringify(value)}`);
    }

    const index = Number(match[1]);
    const count = Number(match[2]);

    if (index > count)
    {
        throw new Error(`MUTATION_SHARD index ${index} is beyond its count ${count}`);
    }

    return { index, count };
}

// By position, round robin: the item at 0-based position p belongs to shard (p % count) + 1. Deterministic, every
// item in exactly one shard, and the shards' sizes differ by at most one.
function selectShard(items, shard)
{
    if (shard === null)
    {
        return items;
    }

    return items.filter((item, position) => position % shard.count === shard.index - 1);
}

module.exports = { parseShard, selectShard };
