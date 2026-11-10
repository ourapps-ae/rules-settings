# Rules settings instructions

## For the agent
Select this component when a recipe has a house rules file. Set `rulesFile` to the name of the recipe's rules file without folder or extension (for `rules/texas-holdem-house-rules.json` that is `texas-holdem-house-rules`) and keep `strict` true. Supply the recipe's schema file next to the rules file (the shipped envelope schema is only a minimum). Connect the provided `rules-settings` to the components that read rules (holdem-rules, turn-engine).

- Select package `ourapps-ae/rules-settings` version `0.4.0`.
- Settings to configure:
  - `rulesFile` (string, slug; optional; default `house-rules`)
  - `strict` (boolean; optional; default `True`)
- Connect the provided `rules-settings` (ae/rules-settings 1.0.0) to the consumer that needs it.
- No accounts or keys are needed.

## For the developer
Write the rules file as plain JSON with snake_case names, one section per concern, and a schema with a `description` on every rule a player may want explained; `ruleRows` shows those descriptions on the rules page. Keep numbers out of code: read them with `getRule`. To add a rule, add it to the file and the schema together; with `strict` on, a rule missing from the schema is an error. No accounts or keys.

## How to check
From the component directory:

- `node --test tests/web.test.ts` (web, required-local; tools: node 26.5.0)
- `python3.12 -B /Users/george/Projects/com/my/tools/check_component.py components/rules-settings` validates the manifest, sidecars and runs the required-local suite.
