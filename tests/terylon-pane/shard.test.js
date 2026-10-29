// The mutation suite's shards (#42): every mutation runs in exactly one shard, so six parallel jobs green means
// every mutation was planted and caught, none twice and none skipped. Free, milliseconds; no claude needed.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MUTATIONS } = require("./mutations.js");
const { parseShard, selectShard } = require("./shard.js");

// The shard count CI's matrix runs; ci.yml's pane-mutations job names the same six.
const CI_SHARD_COUNT = 6;

function shardsOf(items, count)
{
    const shards = [];

    for (let index = 1; index <= count; index++)
    {
        shards.push(selectShard(items, { index, count }));
    }

    return shards;
}

test("6 shards cover every mutation exactly once", () =>
{
    const shards = shardsOf(MUTATIONS, CI_SHARD_COUNT);
    const seen = new Map();

    shards.forEach((shard, position) =>
    {
        for (const mutation of shard)
        {
            assert.ok(!seen.has(mutation), `"${mutation.name}" lands in shard ${seen.get(mutation)} and in shard ${position + 1}`);
            seen.set(mutation, position + 1);
        }
    });

    assert.equal(seen.size, MUTATIONS.length);

    for (const mutation of MUTATIONS)
    {
        assert.ok(seen.has(mutation), `"${mutation.name}" lands in no shard`);
    }
});

test("every mutation has a name of its own, so a shard's log names what it ran", () =>
{
    const names = MUTATIONS.map(mutation => mutation.name);

    assert.equal(new Set(names).size, names.length);
});

test("the shards are balanced: their sizes differ by at most one", () =>
{
    const sizes = shardsOf(MUTATIONS, CI_SHARD_COUNT).map(shard => shard.length);

    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `sizes ${sizes.join(", ")}`);
});

test("any count partitions any list: each position in exactly one shard, in its order", () =>
{
    for (let length = 0; length <= 12; length++)
    {
        const items = Array.from({ length }, (unused, position) => position);

        for (let count = 1; count <= 6; count++)
        {
            const joined = shardsOf(items, count).flat().sort((left, right) => left - right);

            assert.deepEqual(joined, items, `length ${length}, count ${count}`);
        }
    }
});

test("the partition is by position: the same shard is the same mutations on every run", () =>
{
    assert.deepEqual(selectShard(["a", "b", "c", "d", "e"], { index: 2, count: 2 }), ["b", "d"]);
    assert.deepEqual(selectShard(["a", "b", "c", "d", "e"], { index: 1, count: 2 }), ["a", "c", "e"]);
});

test("with no shard asked for, every mutation runs, as before", () =>
{
    assert.equal(parseShard(undefined), null);
    assert.equal(parseShard(""), null);
    assert.equal(selectShard(MUTATIONS, null), MUTATIONS);
});

test("a well-formed shard is read", () =>
{
    assert.deepEqual(parseShard("1/4"), { index: 1, count: 4 });
    assert.deepEqual(parseShard("4/4"), { index: 4, count: 4 });
    assert.deepEqual(parseShard("12/30"), { index: 12, count: 30 });
});

test("a malformed shard throws rather than running all or nothing", () =>
{
    for (const value of ["0/4", "5/4", "1/0", "1", "1/4/2", " 1/4", "-1/4", "a/b", "1 / 4", "01/4"])
    {
        assert.throws(() => parseShard(value), /MUTATION_SHARD/, JSON.stringify(value));
    }
});
