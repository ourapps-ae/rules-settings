// A small JSON-schema-style checker for house rules, usable in the server and in a browser (a rules page).
// Supported keywords: type, enum, const, minimum, maximum, minLength, maxLength, pattern, items, minItems,
// maxItems, properties, required, additionalProperties, oneOf, anyOf, $ref (local "#/definitions/..." or
// "#/$defs/..."). Annotation keywords (title, description, default, examples, $schema, $id, definitions, $defs)
// are allowed and ignored. Any other keyword makes the schema unusable, so a rule is never silently unchecked.

export type Schema = { [keyword: string]: unknown };

export type Problem = { path: string; message: string };

export type Options = {
  // Treat every object schema without an explicit `additionalProperties` as closed: unknown fields are errors.
  strict?: boolean;
};

export type Row = { path: string; value: unknown; description: string | null };

const VALIDATING = new Set(["type", "enum", "const", "minimum", "maximum", "minLength", "maxLength", "pattern", "items", "minItems", "maxItems", "properties", "required", "additionalProperties", "oneOf", "anyOf", "$ref"]);
const ANNOTATION = new Set(["$schema", "$id", "title", "description", "default", "examples", "definitions", "$defs"]);
const TYPES = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeOf(value) === type;
}

function resolve(root: Schema, ref: string): Schema {
  const match = /^#\/(definitions|\$defs)\/([^/]+)$/.exec(ref);
  const target = match && isObject(root[match[1]]) ? (root[match[1]] as Record<string, unknown>)[match[2]] : undefined;
  if (!isObject(target)) throw new Error(`cannot resolve ${ref}`);
  return target;
}

// Problems that make the schema itself unusable (unknown keyword, wrong shape, unresolved reference). Empty when fine.
export function schemaProblems(schema: Schema, root: Schema = schema, path = "#"): string[] {
  if (!isObject(schema)) return [`${path}: a schema must be an object`];
  const problems: string[] = [];
  for (const [key, value] of Object.entries(schema)) {
    if (ANNOTATION.has(key)) continue;
    if (!VALIDATING.has(key)) { problems.push(`${path}: unsupported keyword ${key}`); continue; }
    if (key === "type") {
      const list = Array.isArray(value) ? value : [value];
      if (list.length === 0 || list.some((t) => typeof t !== "string" || !TYPES.has(t))) problems.push(`${path}/type: unknown type`);
    } else if (key === "enum" && !Array.isArray(value)) problems.push(`${path}/enum: must be an array`);
    else if (["minimum", "maximum", "minLength", "maxLength", "minItems", "maxItems"].includes(key) && typeof value !== "number") problems.push(`${path}/${key}: must be a number`);
    else if (key === "pattern") { try { new RegExp(String(value)); } catch { problems.push(`${path}/pattern: not a valid expression`); } }
    else if (key === "required" && (!Array.isArray(value) || value.some((x) => typeof x !== "string"))) problems.push(`${path}/required: must be an array of names`);
    else if (key === "properties") {
      if (!isObject(value)) problems.push(`${path}/properties: must be an object`);
      else for (const [name, sub] of Object.entries(value)) problems.push(...schemaProblems(sub as Schema, root, `${path}/properties/${name}`));
    } else if (key === "items") problems.push(...schemaProblems(value as Schema, root, `${path}/items`));
    else if (key === "additionalProperties" && typeof value !== "boolean") problems.push(...schemaProblems(value as Schema, root, `${path}/additionalProperties`));
    else if (key === "oneOf" || key === "anyOf") {
      if (!Array.isArray(value) || value.length === 0) problems.push(`${path}/${key}: must be a non-empty array`);
      else value.forEach((sub, i) => problems.push(...schemaProblems(sub as Schema, root, `${path}/${key}/${i}`)));
    } else if (key === "$ref") {
      try { resolve(root, String(value)); } catch (e) { problems.push(`${path}/$ref: ${(e as Error).message}`); }
    }
  }
  for (const section of ["definitions", "$defs"]) {
    const defs = schema[section];
    if (isObject(defs)) for (const [name, sub] of Object.entries(defs)) problems.push(...schemaProblems(sub as Schema, root, `${path}/${section}/${name}`));
  }
  return problems;
}

function check(value: unknown, schema: Schema, root: Schema, path: string, options: Options, out: Problem[]): void {
  if (typeof schema.$ref === "string") return check(value, resolve(root, schema.$ref), root, path, options, out);
  const label = path === "" ? "(whole file)" : path;
  if (schema.type !== undefined) {
    const types = (Array.isArray(schema.type) ? schema.type : [schema.type]) as string[];
    if (!types.some((t) => matchesType(value, t))) { out.push({ path: label, message: `expected ${types.join(" or ")}, found ${typeOf(value)}` }); return; }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) out.push({ path: label, message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}` });
  if ("const" in schema && JSON.stringify(schema.const) !== JSON.stringify(value)) out.push({ path: label, message: `must be ${JSON.stringify(schema.const)}` });
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) out.push({ path: label, message: `must be at least ${schema.minimum}` });
    if (typeof schema.maximum === "number" && value > schema.maximum) out.push({ path: label, message: `must be at most ${schema.maximum}` });
  }
  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) out.push({ path: label, message: `must have at least ${schema.minLength} characters` });
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) out.push({ path: label, message: `must have at most ${schema.maxLength} characters` });
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value)) out.push({ path: label, message: `must match ${schema.pattern}` });
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) out.push({ path: label, message: `must have at least ${schema.minItems} items` });
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) out.push({ path: label, message: `must have at most ${schema.maxItems} items` });
    if (isObject(schema.items)) value.forEach((item, i) => check(item, schema.items as Schema, root, `${path}[${i}]`, options, out));
  }
  if (isObject(value)) {
    const properties = isObject(schema.properties) ? (schema.properties as Record<string, Schema>) : {};
    if (Array.isArray(schema.required)) for (const name of schema.required as string[]) if (!(name in value)) out.push({ path: path === "" ? name : `${path}.${name}`, message: "is required" });
    const extra = schema.additionalProperties;
    for (const [name, item] of Object.entries(value)) {
      const where = path === "" ? name : `${path}.${name}`;
      if (name in properties) check(item, properties[name], root, where, options, out);
      else if (extra === false || (extra === undefined && options.strict && (schema.properties !== undefined || schema.type === "object"))) out.push({ path: where, message: "is not a known rule" });
      else if (isObject(extra)) check(item, extra as Schema, root, where, options, out);
    }
  }
  if (Array.isArray(schema.anyOf) && !(schema.anyOf as Schema[]).some((s) => { const sub: Problem[] = []; check(value, s, root, path, options, sub); return sub.length === 0; })) out.push({ path: label, message: "matches none of the allowed forms" });
  if (Array.isArray(schema.oneOf)) {
    const matching = (schema.oneOf as Schema[]).filter((s) => { const sub: Problem[] = []; check(value, s, root, path, options, sub); return sub.length === 0; }).length;
    if (matching !== 1) out.push({ path: label, message: matching === 0 ? "matches none of the allowed forms" : "matches more than one allowed form" });
  }
}

// Every way `value` breaks `schema`; empty when it is valid. Throws when the schema itself is unusable.
export function validate(value: unknown, schema: Schema, options: Options = {}): Problem[] {
  const bad = schemaProblems(schema);
  if (bad.length) throw new Error(`unusable schema: ${bad.join("; ")}`);
  const out: Problem[] = [];
  check(value, schema, schema, "", options, out);
  return out;
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export type Parsed = { ok: true; rules: unknown } | { ok: false; problems: Problem[] };

// Parse JSON text, check it and freeze it. Never throws on bad rules, only on an unusable schema.
export function parseRules(text: string, schema: Schema, options: Options = {}): Parsed {
  let value: unknown;
  try { value = JSON.parse(text); } catch (e) { return { ok: false, problems: [{ path: "(whole file)", message: `not valid JSON: ${(e as Error).message}` }] }; }
  const problems = validate(value, schema, options);
  return problems.length ? { ok: false, problems } : { ok: true, rules: deepFreeze(value) };
}

const STEP = /([^.[\]]+)|\[(\d+)\]/g;

function steps(path: string): (string | number)[] {
  const out: (string | number)[] = [];
  for (const m of path.matchAll(STEP)) out.push(m[1] !== undefined ? m[1] : Number(m[2]));
  return out;
}

// Read one rule by path, such as "blinds.level_duration_seconds" or "blinds.levels[2].big_blind".
// Throws when the path is not in the rules, unless a fallback is given.
export function getRule<T = unknown>(rules: unknown, path: string, fallback?: T): T {
  let at: unknown = rules;
  for (const step of steps(path)) {
    if (at !== null && typeof at === "object" && step in (at as object)) at = (at as Record<string | number, unknown>)[step];
    else if (arguments.length > 2) return fallback as T;
    else throw new Error(`no rule at ${path}`);
  }
  return at as T;
}

export function hasRule(rules: unknown, path: string): boolean {
  const missing = Symbol("missing");
  return getRule<unknown>(rules, path, missing) !== missing;
}

// The engine's view of checked rules: read one value by path, `undefined` when the rules have none.
export type RulesReader = { rules: unknown; value<T = unknown>(path: string): T | undefined; has(path: string): boolean };

export function createRulesSettings(rules: unknown): RulesReader {
  return {
    rules,
    value: <T = unknown>(path: string) => getRule<T | undefined>(rules, path, undefined),
    has: (path: string) => hasRule(rules, path),
  };
}

function descriptionAt(root: Schema, schema: Schema | undefined, step: string | number): Schema | undefined {
  if (!schema) return undefined;
  const s = typeof schema.$ref === "string" ? resolve(root, schema.$ref) : schema;
  if (typeof step === "number") return isObject(s.items) ? (s.items as Schema) : undefined;
  const sub = isObject(s.properties) ? (s.properties as Record<string, Schema>)[step] : undefined;
  return sub;
}

// Flatten rules to rows for a rules page: one row per value, with the schema's description for it when there is one.
// Arrays of plain values stay on one row; arrays of objects get a row per field with an index in the path.
export function ruleRows(rules: unknown, schema: Schema): Row[] {
  const rows: Row[] = [];
  const walk = (value: unknown, path: string, sub: Schema | undefined) => {
    const resolved = sub && typeof sub.$ref === "string" ? resolve(schema, sub.$ref) : sub;
    const description = resolved && typeof resolved.description === "string" ? resolved.description : null;
    if (isObject(value)) for (const [name, item] of Object.entries(value)) walk(item, path === "" ? name : `${path}.${name}`, descriptionAt(schema, resolved, name));
    else if (Array.isArray(value) && value.some((x) => typeof x === "object" && x !== null)) value.forEach((item, i) => walk(item, `${path}[${i}]`, descriptionAt(schema, resolved, i)));
    else rows.push({ path, value, description });
  };
  walk(rules, "", schema);
  return rows;
}
