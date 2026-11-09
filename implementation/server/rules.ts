// Read a house rules file from disk and check it against a schema file, so the game and the rules page
// cannot drift from the agreed document.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRulesSettings, deepFreeze, getRule, parseRules, validate, type Options, type Parsed, type Problem, type RulesReader, type Schema } from "../web/schema.ts";

export { createRulesSettings, deepFreeze, getRule, parseRules, validate };
export type { Options, Parsed, Problem, RulesReader, Schema };
export { hasRule, ruleRows } from "../web/schema.ts";

// The installer's settings. `rulesFile` is a name (grammar slug), not a path: the rules are `<name>.json` and the
// schema `<name>.schema.json` in the application's rules folder (see `rulesLocation`).
export type RulesSettings = { rulesFile: string; strict: boolean };
export const DEFAULT_RULES_FILE = "house-rules";

// The envelope schema shipped with the component (schema_version, ruleset_id, game).
export const ENVELOPE_SCHEMA_FILE = new URL("./rules-settings.schema.json", import.meta.url);

export function readSchema(file: string | URL = ENVELOPE_SCHEMA_FILE): Schema {
  const schema = JSON.parse(readFileSync(file, "utf8")) as Schema;
  if (typeof schema !== "object" || schema === null) throw new Error(`${String(file)} is not a schema`);
  return schema;
}

// Load, check and freeze a rules file. Returns the problems instead of throwing when the rules are wrong.
export function loadRulesFile(rulesFile: string | URL, schemaFile: string | URL = ENVELOPE_SCHEMA_FILE, options: Options = {}): Parsed {
  let text: string;
  try { text = readFileSync(rulesFile, "utf8"); } catch (e) { return { ok: false, problems: [{ path: "(whole file)", message: `cannot read ${String(rulesFile)}: ${(e as Error).message}` }] }; }
  return parseRules(text, readSchema(schemaFile), options);
}

// For startup: the checked rules, or an error listing every problem so the game refuses to start on bad rules.
export function requireRules(rulesFile: string | URL, schemaFile: string | URL = ENVELOPE_SCHEMA_FILE, options: Options = {}): unknown {
  const result = loadRulesFile(rulesFile, schemaFile, options);
  if (result.ok) return result.rules;
  throw new Error(`rules file ${String(rulesFile)} is not valid:\n` + result.problems.map((p) => `  ${p.path}: ${p.message}`).join("\n"));
}

// Where a rules file and its schema are: `<folder>/<name>.json` and `<folder>/<name>.schema.json`. `name` is the
// `rulesFile` setting: a lower-case slug, so it can never name a place outside the folder. A URL folder gives URLs.
export function rulesLocation(name: string = DEFAULT_RULES_FILE, folder: string | URL = "rules"): { rulesFile: string | URL; schemaFile: string | URL } {
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(name)) throw new RangeError("a rules file name is a lower-case slug such as house-rules");
  if (folder instanceof URL) {
    const base = new URL(folder.href.endsWith("/") ? folder.href : folder.href + "/");
    return { rulesFile: new URL(`${name}.json`, base), schemaFile: new URL(`${name}.schema.json`, base) };
  }
  return { rulesFile: join(folder, `${name}.json`), schemaFile: join(folder, `${name}.schema.json`) };
}

// Startup for an engine: load and check the named rules file against its own schema and hand back `value(path)`.
// Throws with every problem listed when the rules are wrong.
export function loadRulesSettings(settings: Partial<RulesSettings> = {}, folder: string | URL = "rules"): RulesReader {
  const { rulesFile, schemaFile } = rulesLocation(settings.rulesFile ?? DEFAULT_RULES_FILE, folder);
  return createRulesSettings(requireRules(rulesFile, schemaFile, { strict: settings.strict ?? true }));
}
