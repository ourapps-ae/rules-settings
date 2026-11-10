# Rules settings component

## Purpose and facilities
The game and the rules page must never disagree. The recipe solves this by keeping the house rules in one JSON file that the engine reads (`rules.ts`) and a human-readable document derived from it. This component generalises that: a loader reads the rules file, a small JSON-schema-style validator checks it against a schema file and reports every problem with its path, `getRule` reads a rule by path (`blinds.levels[2].big_blind`), and `ruleRows` lists every rule with the schema's description for a rules page. Checked rules are deeply frozen. A shipped envelope schema requires `schema_version`, `ruleset_id` and `game`; the recipe supplies a fuller schema for its own sections. The validator supports type, enum, const, minimum, maximum, minLength, maxLength, pattern, items, minItems, maxItems, properties, required, additionalProperties, oneOf, anyOf and local `$ref`; a schema using any other validating keyword is refused rather than silently ignored.

Facilities: `rules-settings` (Load and validate a rules file, read rules by path, list rules for a page).

## User inputs
The installer collects two settings. `rulesFile` is the name of the rules file the game reads (a lower-case slug; default `house-rules`): the rules are `<name>.json` and their schema `<name>.schema.json` in the application's rules folder (`rulesLocation`). It is a name, not a path, because aepm checks every setting against a grammar and none of the grammars admits a file path. `strict`, when true (default), makes every object in the schema reject fields the schema does not list, so a misspelt rule name is an error instead of being ignored.

- `rulesFile` (string, slug; optional; default `house-rules`)
- `strict` (boolean; optional; default `True`)

## Artefacts and dependencies
`component.json` maps every `implementation/` source into `components/rules-settings/`:

- `implementation/server/rules-settings.schema.json` -> `components/rules-settings/server/rules-settings.schema.json`
- `implementation/server/rules.ts` -> `components/rules-settings/server/rules.ts`
- `implementation/web/schema.ts` -> `components/rules-settings/web/schema.ts`

Dependencies: none.
`tools.lock.json` pins verification tools: node 26.5.0. Licence: `Apache-2.0` (`LICENCE`, `NOTICE`).

## Provided interfaces
- `interfaces/rules-settings.json` defines `rules-settings` (ae/rules-settings) version 1.0.0: an OpenRPC 1.3.2 document, one method per function (a member of a created object is `<Type>.<member>`), with parameter, result and data types as JSON Schema 2020-12 (`components.schemas`) and thrown errors under `errors`.

## Required interfaces
None.

## Integration
At startup the server calls `loadRulesSettings({rulesFile, strict}, folder)` (or `requireRules(rulesFile, schemaFile, {strict})` with explicit paths), which returns an object with `value(path)` and `has(path)`; on bad rules it throws with every problem listed and the game does not start. Other components then read numbers with `getRule(rules, "timing.decision_seconds")` instead of constants (for example the clock, level, chip and hold'em rule components can take their settings from here). The web client can import `implementation/web/schema.ts` and show `ruleRows(rules, schema)` as the rules page. Server code is `rules.ts` (reads files with `node:fs`); `web/schema.ts` has no file access and is imported by the server file, both installed under `components/rules-settings/`. `value(path)` is what the turn engine calls (it reads only `timing.decision_seconds`): the value at the dotted path, or `undefined` when the rules have none.

## Visual definition and connected examples
`visual/definition.json` maps its ports to the provided and required interfaces. `visual/examples/connected.json` connects the component to an illustrative application consumer. Both image formats and a text description are retained under `visual/output/`.

## Infrastructure
No deployed service and no accounts. The rules file and schema ship with the application; reading them needs the host's file system (server) or a fetched copy (browser).

## Verification
`tests/web.test.ts` loads the OurPoker house rules from `tests/fixtures/texas-holdem-house-rules.json` (test data only) and checks them against `tests/fixtures/texas-holdem-house-rules.schema.json`, then mutates them: wrong type, out-of-range number, bad enum, missing field, bad pattern, unknown field in strict mode and null only where allowed. It also tests the other keywords, refusal of unusable schemas, frozen results, path lookups, rule rows with descriptions, loading from disk and the startup error message, `value(path)` (present, missing, deep, indexed), the file-name convention and its refusal of names that could leave the folder, and loading by name.

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5.0)

## Scenarios and presentation
A hold'em game whose engine and rules page read the same file. A second game with its own rules file and schema using the same loader. An agent edits the rules file; the next start rejects a typo with the exact path. A client shows the rules table without a copy of the numbers.

## Updates and removal
Patch updates replace the files only. The component keeps no data; the rules file itself is application content owned by the recipe. A rules file layout change is a `schema_version` bump decided by the recipe.
