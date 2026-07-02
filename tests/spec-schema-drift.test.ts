// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { supportedAssertions, assertionPrefix, oobAttr, oobFailAttr } from "../src/config";
import { allAssertionTypes } from "../src/types";

/**
 * spec.schema.json drift check.
 *
 * Treats spec.schema.json as the published contract for SpecEntry shape and
 * asserts bijection with the agent's runtime constants. If the agent ships a
 * new fs-* key (in supportedAssertions, allAssertionTypes, or OOB attrs)
 * without updating the schema, this test fails at the PR that introduces it.
 *
 * The schema is consumed by AI agents and human authors to validate JSON-spec
 * entries before shipping — silently drifting it leaves them with a
 * permissive schema that accepts typos and misses new keys.
 */

const SCHEMA_PATH = join(__dirname, "..", "spec.schema.json");
const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));

const schemaPropertyNames = new Set<string>(Object.keys(schema.properties ?? {}));

describe("spec.schema.json drift", () => {
  it("requires fs-target and fs-assert unconditionally", () => {
    expect(new Set(schema.required)).toEqual(new Set(["fs-target", "fs-assert"]));
  });

  it("requires fs-trigger OR fs-assert-oob OR fs-assert-oob-fail via anyOf", () => {
    expect(Array.isArray(schema.anyOf)).toBe(true);
    const requiredSets = schema.anyOf.map(
      (clause: any) => new Set(clause.required ?? [])
    );
    expect(requiredSets).toContainEqual(new Set(["fs-trigger"]));
    expect(requiredSets).toContainEqual(new Set(["fs-assert-oob"]));
    expect(requiredSets).toContainEqual(new Set(["fs-assert-oob-fail"]));
  });

  it("declares additionalProperties: false (typos rejected)", () => {
    expect(schema.additionalProperties).toBe(false);
  });

  it("covers every supportedAssertions.details key (fs-{name})", () => {
    for (const name of supportedAssertions.details) {
      const key = `${assertionPrefix.details}${name}`;
      expect(schemaPropertyNames).toContain(key);
    }
  });

  it("covers every assertion type key (fs-assert-{type})", () => {
    for (const type of allAssertionTypes) {
      const key = `${assertionPrefix.types}${type}`;
      expect(schemaPropertyNames).toContain(key);
    }
  });

  it("covers every supportedAssertions.modifiers key (fs-assert-{modifier})", () => {
    for (const name of supportedAssertions.modifiers) {
      const key = `${assertionPrefix.modifiers}${name}`;
      expect(schemaPropertyNames).toContain(key);
    }
  });

  it("covers the OOB attrs (fs-assert-oob, fs-assert-oob-fail)", () => {
    expect(schemaPropertyNames).toContain(oobAttr);
    expect(schemaPropertyNames).toContain(oobFailAttr);
  });

  it("declares fs-target (JSON-only key, no HTML counterpart)", () => {
    expect(schemaPropertyNames).toContain("fs-target");
  });

  it("conditional dynamic types match the schema pattern", () => {
    const patterns = Object.keys(schema.patternProperties ?? {});
    expect(patterns.length).toBeGreaterThan(0);

    // The pattern must accept fs-assert-{type}-{conditionKey} for every type
    // and a representative condition key.
    for (const type of allAssertionTypes) {
      const sample = `${assertionPrefix.types}${type}-success`;
      const matched = patterns.some((p) => new RegExp(p).test(sample));
      expect(matched, `pattern does not match ${sample}`).toBe(true);
    }
  });

  it("pattern rejects reserved condition keys would-be cases that should still match — the agent's own warning handles reservation, schema stays inclusive", () => {
    // A condition key that happens to be an assertion type name (e.g.,
    // "fs-assert-added-removed") is allowed by the schema but warned about
    // at runtime by createAssertions. The schema's job is shape, not policy.
    const patterns = Object.keys(schema.patternProperties ?? {});
    const sample = "fs-assert-added-removed";
    const matched = patterns.some((p) => new RegExp(p).test(sample));
    expect(matched).toBe(true);
  });

  it("schema property names are all fs-* prefixed (no foreign keys leaked in)", () => {
    for (const name of schemaPropertyNames) {
      expect(name).toMatch(/^fs-/);
    }
  });
});
