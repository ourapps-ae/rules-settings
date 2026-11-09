# Source mapping

Reference revision: `19905b75dbea89fbfd424d67fe26c81aaed0e018`. Extraction source: `OurPoker/recipe/` (read-only).

- `implementation/server/rules.ts` <- `server/src/rules.ts:1-12` (the engine reads the agreed settings file so the engine and the document cannot drift: `import house from "../../rules/texas-holdem-house-rules.json"` followed by one constant per rule, `MIN_PLAYERS`, `STARTING_STACK`, `LEVEL_MS`, `DECISION_MS`, `REBUY_*`).
  - Kept: the idea of one rules file read by the game and shown to players.
  - Generalised: the compile-time JSON import and the fixed list of constants become `loadRulesFile`, `requireRules` and `getRule(rules, path)`, so any rules file and any rule can be read; the file path and strictness are the `rulesFile` and `strict` settings.
  - Added, not in the recipe: the validator (`web/schema.ts`: the recipe's only check was TypeScript's type inference from the JSON import), the schema files, `ruleRows`, `deepFreeze`.
  - Left behind: each derived constant and what it is used for (`LEVEL_MS` and `blindsFor`, `rules.ts:14-29`, are in level-schedule; `DECISION_MS` is in game-clock; rebuy constants belong to tournament), and the human-readable rules document `rules/texas-holdem-house-rules.md` and coding handoff note (recipe page material).
- `createRulesSettings`, `value`, `has`, `rulesLocation`, `loadRulesSettings`, `DEFAULT_RULES_FILE` (`generated-adapter`, in `schema.ts` and `rules.ts`): written to `components/turn-engine/interfaces/required/rules-settings.json` (`value(path)`; the engine reads `timing.decision_seconds`, the recipe's `rules.ts:8` constant). `rulesFile` becomes a slug name with the convention `<folder>/<name>.json` plus `<name>.schema.json` because no aepm setting grammar admits a file path.
- `implementation/web/schema.ts`: new (validator, path lookup, rule rows, freezing). It is under `web` so a client can show the rules page without server code; the server file imports it from `../web/schema.ts`.
- `implementation/server/rules-settings.schema.json`: new; the minimum envelope every rules file needs (`schema_version`, `ruleset_id`, `game`, the same three fields that open `rules/texas-holdem-house-rules.json:2-4`).
- `tests/fixtures/texas-holdem-house-rules.json`: whole `rules/texas-holdem-house-rules.json` (226 lines), copied as test data only. `tests/fixtures/texas-holdem-house-rules.schema.json`: written for this component by inferring types from that file and then adding ranges, enums and descriptions (test data only; the recipe's own schema is the recipe's business). `tests/fixtures/bad-rules.json`: the same file with `chips.starting_stack` as a string.
- `examples/consumer.ts`: new; reads game numbers and rule rows from the checked file.
