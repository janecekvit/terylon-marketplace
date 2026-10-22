"use strict";

//
// fast-check is the repository's one npm dependency, installed only here by `npm ci`. The root run,
// `node --test "**/*.test.js"`, reaches these files too, from a checkout where nobody ran `npm ci`;
// there every property test is skipped with this reason instead of failing on a missing module.
//

const SKIP_REASON = "fast-check is not installed: run `npm ci` in tests/property/ (see CONTRIBUTING.md)";

function loadFastCheck()
{
    try
    {
        return { fastCheck: require("fast-check"), skipReason: false };
    }
    catch (loadError)
    {
        if (loadError.code !== "MODULE_NOT_FOUND")
        {
            throw loadError;
        }

        // Expected outside tests/property/ after `npm ci`: the suites skip, they do not fail.
        return { fastCheck: null, skipReason: SKIP_REASON };
    }
}

module.exports = { loadFastCheck, SKIP_REASON };
