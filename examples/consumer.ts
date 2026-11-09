import {getRule, requireRules, ruleRows, readSchema} from "../implementation/server/rules.ts";

// A game reads its numbers from the checked rules file, and a rules page lists the same values.
export function gameNumbers(rulesFile: URL, schemaFile: URL) {
  const rules = requireRules(rulesFile, schemaFile, {strict: true});
  return {
    decisionMs: getRule<number>(rules, "timing.decision_seconds") * 1000,
    startingStack: getRule<number>(rules, "chips.starting_stack"),
    firstBlind: getRule<number>(rules, "blinds.levels[0].big_blind"),
    page: ruleRows(rules, readSchema(schemaFile)).slice(0, 5),
  };
}
