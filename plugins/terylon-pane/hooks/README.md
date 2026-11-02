# The vendored glossary

`words.ts` is a TypeScript port of Terylon's glossary, the console's `design/words.js` (Design · Glossary on the Terylon Architecture canvas): one word for every figure and state, one short ref for every subject. Terylon Cockpit formats every token count, time, duration and dollar figure through it.

| What | Where it came from | Held by |
|---|---|---|
| `words.ts` | Terylon `src/Terylon.Web.Host/wwwroot/design/words.js` at commit `91d49df`, on `feature/480-design-unification` | `tests/words.test.ts` |
| `../tests/words-cases.json` | Terylon `src/Terylon.Web.Host/wwwroot/design/words-cases.json` at the same commit, byte for byte | `tests/terylon-pane/words-cases.test.js` |
| `../tests/words-cases.ts` | the same table as a module, since a mod's test imports code alone, never a `.json` | `tests/terylon-pane/words-cases.test.js` |

```
                                                                        as of Terylon S68

  Terylon 91d49df  design/words.js ────── PORTED ──────▶ hooks/words.ts
                   design/words-cases.json ── COPIED ──▶ tests/words-cases.json ──▶ tests/words-cases.ts
                                                                        │
                                          tests/words.test.ts ◀─────────┘  EVERY CASE, ITS EXACT TEXT
```

**The port differs from `words.js` in one thing, the zone.** `words.js` takes an IANA zone name and reads it with `Intl`; the pane formats its times by hand, with no `Intl`, so its local time never depends on the host's locale, and `tests/terylon-pane/zones.test.js` can plant a zone in it. `words.ts` therefore takes the pane's own `Zone`, an offset from UTC in minutes or the offset at each moment (`hooks/queue.ts`), and `tests/words.test.ts` turns the two names the table uses, `UTC` and `Europe/Prague`, into that, Prague by the EU's own rule. A function's name, its arguments' order and every case's text are the same.

**When Terylon changes the glossary**, it changes `words-cases.json` first and hands the diff on: copy the new table here whole, write `words-cases.ts` from it again (its one export line, then the table), port what changed in `words.js`, run the cases, and name the new commit in the table above. A case that fails is a word the pane says differently from the console, and is fixed here, never in the table.

The pane's own uses sit at the end of `words.ts`, apart from the port: `refOr`, a subject's ref or `#352` from a Terylon older than refs, and `tokensCzech`, the tokens as the catch-up says them in Czech.
