import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {deepFreeze, getRule, hasRule, parseRules, ruleRows, schemaProblems, validate} from "../implementation/web/schema.ts";
import {DEFAULT_RULES_FILE, ENVELOPE_SCHEMA_FILE, createRulesSettings, loadRulesFile, loadRulesSettings, readSchema, requireRules, rulesLocation} from "../implementation/server/rules.ts";
import {gameNumbers} from "../examples/consumer.ts";

const dir = new URL("fixtures/", import.meta.url);
const rulesText = readFileSync(new URL("texas-holdem-house-rules.json", dir), "utf8");
const pokerSchema = JSON.parse(readFileSync(new URL("texas-holdem-house-rules.schema.json", dir), "utf8"));
const envelope = readSchema();
const clone = () => JSON.parse(rulesText);

test("the poker house rules (test data) pass the poker schema, strictly", () => {
  assert.deepEqual(validate(clone(), pokerSchema, {strict: true}), []);
  const parsed = parseRules(rulesText, pokerSchema, {strict: true});
  assert.equal(parsed.ok, true);
});

test("the envelope schema accepts the poker rules; strict mode rejects every section it does not list", () => {
  assert.deepEqual(validate(clone(), envelope), []);
  assert.deepEqual(validate(clone(), envelope, {strict: true}).map((p) => p.path).sort(), Object.keys(clone()).filter((k) => !["schema_version", "ruleset_id", "game"].includes(k)).sort());
});

test("wrong type, range, enum and missing fields are all reported with their path", () => {
  const rules = clone();
  rules.chips.starting_stack = "5000";
  rules.players.maximum = 12;
  rules.timing.timeout = "fold";
  delete rules.blinds.level_duration_seconds;
  rules.blinds.levels[2].big_blind = 0;
  rules.ruleset_id = "Bad Id";
  const problems = validate(rules, pokerSchema);
  const byPath = Object.fromEntries(problems.map((p) => [p.path, p.message]));
  assert.match(byPath["chips.starting_stack"], /expected integer, found string/);
  assert.match(byPath["players.maximum"], /at most 9/);
  assert.match(byPath["timing.timeout"], /must be one of/);
  assert.match(byPath["blinds.level_duration_seconds"], /is required/);
  assert.match(byPath["blinds.levels[2].big_blind"], /at least 1/);
  assert.match(byPath["ruleset_id"], /must match/);
  assert.equal(problems.length, 6);
});

test("unknown fields are errors only in strict mode", () => {
  const rules = clone();
  rules.timing.extra_rule = 5;
  assert.equal(validate(rules, pokerSchema).length, 1);
  assert.deepEqual(validate(rules, pokerSchema, {strict: true}).map((p) => p.path), ["timing.extra_rule"]);
  const open = {type: "object", properties: {a: {type: "integer"}}};
  assert.deepEqual(validate({a: 1, b: 2}, open), []);
  assert.equal(validate({a: 1, b: 2}, open, {strict: true}).length, 1);
  assert.equal(validate({a: 1, b: "x"}, {type: "object", additionalProperties: {type: "integer"}}).length, 1);
});

test("null is allowed only where the schema says so", () => {
  const rules = clone();
  assert.equal(rules.betting.raise_count_cap, null);
  rules.betting.raise_count_cap = 3;
  assert.deepEqual(validate(rules, pokerSchema), []);
  rules.betting.raise_count_cap = 0;
  assert.equal(validate(rules, pokerSchema).length, 1);
  rules.players.minimum = null;
  assert.match(validate(rules, pokerSchema).find((p) => p.path === "players.minimum")!.message, /found null/);
});

test("other keywords: oneOf, anyOf, $ref, const, lengths, item counts", () => {
  const schema = {definitions: {n: {type: "integer", minimum: 1}}, type: "object", properties: {a: {$ref: "#/definitions/n"}, b: {oneOf: [{type: "integer"}, {type: "string"}]}, c: {anyOf: [{const: "x"}, {type: "integer", minimum: 5}]}, d: {type: "string", minLength: 2, maxLength: 3}, e: {type: "array", minItems: 1, maxItems: 2, items: {type: "integer"}}}};
  assert.deepEqual(validate({a: 1, b: 2, c: "x", d: "ab", e: [1]}, schema), []);
  const bad = validate({a: 0, b: 1.5, c: 3, d: "abcd", e: [1, 2, 3, "z"]}, schema).map((p) => p.path);
  for (const path of ["a", "b", "c", "d", "e", "e[3]"]) assert.ok(bad.includes(path), path);
  assert.deepEqual(validate({b: [] }, {properties: {b: {oneOf: [{type: "array"}, {type: "array", maxItems: 3}]}}}).map((p) => p.message), ["matches more than one allowed form"]);
});

test("a schema with an unknown keyword or bad reference is refused, never silently ignored", () => {
  assert.deepEqual(schemaProblems(pokerSchema), []);
  assert.deepEqual(schemaProblems({type: "object", properties: {a: {format: "uri"}}}), ["#/properties/a: unsupported keyword format"]);
  assert.match(schemaProblems({$ref: "#/definitions/missing"})[0], /cannot resolve/);
  assert.match(schemaProblems({type: "colour"})[0], /unknown type/);
  assert.match(schemaProblems({pattern: "("})[0], /not a valid expression/);
  assert.throws(() => validate({}, {minItems: "two"}), /unusable schema/);
});

test("parseRules reports bad JSON and bad rules without throwing, and freezes good rules", () => {
  const broken = parseRules("{", envelope);
  assert.equal(broken.ok, false);
  const bad = parseRules('{"schema_version": 1}', envelope);
  assert.deepEqual(bad.ok === false && bad.problems.map((p) => p.path), ["ruleset_id", "game"]);
  const good = parseRules(rulesText, pokerSchema);
  assert.ok(good.ok);
  const rules = good.ok ? (good.rules as ReturnType<typeof clone>) : null!;
  assert.throws(() => { "use strict"; (rules.chips as {starting_stack: number}).starting_stack = 1; }, TypeError);
  assert.ok(Object.isFrozen(rules.blinds.levels[0]));
  assert.equal(deepFreeze(5), 5);
});

test("getRule reads by path with indexes, fallbacks and a clear error", () => {
  const rules = clone();
  assert.equal(getRule(rules, "timing.decision_seconds"), 30);
  assert.equal(getRule(rules, "blinds.levels[15].big_blind"), 12000);
  assert.equal(getRule(rules, "betting.raise_count_cap"), null);
  assert.equal(getRule(rules, "blinds.nothing", 7), 7);
  assert.equal(getRule(rules, "blinds.levels[99].big_blind", "none"), "none");
  assert.throws(() => getRule(rules, "blinds.nothing"), /no rule at blinds.nothing/);
  assert.equal(hasRule(rules, "chips.integer_only"), true);
  assert.equal(hasRule(rules, "chips.nothing"), false);
});

test("ruleRows flattens the rules with schema descriptions for a rules page", () => {
  const rows = ruleRows(clone(), pokerSchema);
  const byPath = new Map(rows.map((r) => [r.path, r]));
  assert.equal(byPath.get("chips.starting_stack")!.value, 5000);
  assert.equal(byPath.get("chips.starting_stack")!.description, "Chips each player starts with");
  assert.equal(byPath.get("blinds.levels[0].small_blind")!.value, 25);
  assert.equal(byPath.get("hosting_and_pauses.manual_pause_freezes")!.value instanceof Array, true);
  assert.equal(byPath.get("betting.side_pots")!.description, null);
  assert.ok(rows.length > 100);
});

test("files on disk: load, require, and a readable error for bad rules", () => {
  const rulesFile = new URL("texas-holdem-house-rules.json", dir);
  const schemaFile = new URL("texas-holdem-house-rules.schema.json", dir);
  assert.equal(loadRulesFile(rulesFile, schemaFile, {strict: true}).ok, true);
  assert.equal(loadRulesFile(rulesFile).ok, true);
  assert.ok(ENVELOPE_SCHEMA_FILE.pathname.endsWith("rules-settings.schema.json"));
  const missing = loadRulesFile(new URL("nothing.json", dir));
  assert.equal(missing.ok === false && /cannot read/.test(missing.problems[0].message), true);
  assert.throws(() => requireRules(new URL("nothing.json", dir)), /is not valid/);
  assert.throws(() => requireRules(new URL("bad-rules.json", dir), schemaFile), /chips.starting_stack: expected integer/);
});

test("the consumer example reads numbers from the checked file", () => {
  const out = gameNumbers(new URL("texas-holdem-house-rules.json", dir), new URL("texas-holdem-house-rules.schema.json", dir));
  assert.equal(out.decisionMs, 30000);
  assert.equal(out.startingStack, 5000);
  assert.equal(out.firstBlind, 50);
  assert.equal(out.page.length, 5);
});

test("value(path) reads one rule, and is undefined when the rules have none", () => {
  const rules = createRulesSettings(parseRules(rulesText, pokerSchema, {strict: true}).ok ? clone() : null);
  assert.equal(rules.value("timing.decision_seconds"), 30);
  assert.equal(rules.value<number>("blinds.levels[2].big_blind"), 150);
  assert.deepEqual(rules.value("players.maximum"), 9);
  assert.equal(rules.value("timing.nothing"), undefined);
  assert.equal(rules.value("nothing.at.all"), undefined);
  assert.equal(rules.value("blinds.levels[99].big_blind"), undefined);
  assert.equal(rules.value("timing.decision_seconds.deeper"), undefined, "a number has no children");
  assert.equal(rules.has("chips.starting_stack"), true);
  assert.equal(rules.has("chips.nope"), false);
  assert.equal(createRulesSettings(null).value("a"), undefined);
});

test("the rules file setting is a name: its location is <folder>/<name>.json beside <name>.schema.json", () => {
  assert.equal(DEFAULT_RULES_FILE, "house-rules");
  assert.deepEqual(rulesLocation(), {rulesFile: "rules/house-rules.json", schemaFile: "rules/house-rules.schema.json"});
  assert.deepEqual(rulesLocation("texas-holdem-house-rules", "/app/rules"), {rulesFile: "/app/rules/texas-holdem-house-rules.json", schemaFile: "/app/rules/texas-holdem-house-rules.schema.json"});
  const url = rulesLocation("x1", new URL("file:///a/b"));
  assert.equal(String(url.rulesFile), "file:///a/b/x1.json");
  assert.equal(String(url.schemaFile), "file:///a/b/x1.schema.json");
  for (const bad of ["", "../etc", "a/b", "A", "rules.json", "1a", "a b"]) assert.throws(() => rulesLocation(bad), RangeError, bad);
});

test("loadRulesSettings: startup by name, checked against its own schema, value(path) for the engine", () => {
  const rules = loadRulesSettings({rulesFile: "texas-holdem-house-rules"}, dir);
  assert.equal(rules.value("timing.decision_seconds"), 30);
  assert.equal(rules.value("timing.nothing"), undefined);
  assert.throws(() => loadRulesSettings({rulesFile: "nothing"}, dir), /is not valid/);
  assert.throws(() => loadRulesSettings({rulesFile: "bad-rules"}, dir), /ENOENT|no such file/, "a rules file with no schema beside it cannot be checked");
  assert.throws(() => loadRulesSettings({rulesFile: "../x"}, dir), RangeError);
});

test("the default rules file name is a slug, the grammar aepm checks every setting value against", () => {
  assert.match(DEFAULT_RULES_FILE, /^[a-z][a-z0-9-]{0,63}$/);
});
