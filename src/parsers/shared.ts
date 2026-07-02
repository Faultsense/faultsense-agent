import {
  assertionPrefix,
  supportedAssertions,
  conditionKeySuffixPattern,
  reservedConditionKeys,
  inlineModifiers,
} from "../config";
import { parseTrigger } from "../utils/triggers";
import { parseKeyFilter, matchesKeyFilter } from "../utils/triggers/keyboard";
import { allAssertionTypes, type AssertionModiferValue } from "../types";

export interface AssertionTypeEntry {
  type: string;
  value: string;
  modifiers?: Record<string, string>;
  conditionKey?: string;
}

export interface ElementAssertionMetadata {
  details: Record<string, string>;
  types: AssertionTypeEntry[];
  modifiers: Record<string, AssertionModiferValue>;
}

/**
 * Strip matching outer single or double quotes from a modifier value.
 * CSS attribute selectors support `[attr='value']` and `[attr="value"]`
 * (per https://www.w3.org/TR/selectors-4/#attribute-selectors), and
 * frameworks that build selectors via template literals (Vue, React,
 * Svelte) naturally emit the quoted form. Without this step the parser
 * preserves the quotes and every downstream matcher compares against
 * `'value'` instead of `value`, producing a silent no-match.
 */
function stripOuterQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' || first === "'") && first === last) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Parse a type attribute value into a selector and inline modifiers.
 * Format: "selector[key=value][key=value]..."
 * Handles nested brackets in values (e.g., regex character classes like [a-z])
 */
export function parseTypeValue(raw: string): { selector: string; modifiers: Record<string, string> } {
  const firstBracket = raw.indexOf('[');
  if (firstBracket === -1) {
    return { selector: raw, modifiers: {} };
  }

  const selector = raw.slice(0, firstBracket);
  const modifiers: Record<string, string> = {};

  // Walk the string character by character to handle nested brackets
  let i = firstBracket;
  while (i < raw.length) {
    if (raw[i] !== '[') { i++; continue; }

    // Find the key (up to '=')
    const eqIndex = raw.indexOf('=', i + 1);
    if (eqIndex === -1) break;
    const key = raw.slice(i + 1, eqIndex);

    // Find the matching closing bracket, tracking nesting depth
    let depth = 1;
    let j = eqIndex + 1;
    while (j < raw.length && depth > 0) {
      if (raw[j] === '[') depth++;
      else if (raw[j] === ']') depth--;
      if (depth > 0) j++;
    }

    if (depth === 0) {
      modifiers[key] = stripOuterQuotes(raw.slice(eqIndex + 1, j));
      i = j + 1;
    } else {
      break;
    }
  }

  return { selector, modifiers };
}

/**
 * Resolve inline modifiers to the format resolvers expect.
 * Reserved keys (text-matches, classlist) pass through.
 * Unreserved keys become attrs-match entries.
 */
export function resolveInlineModifiers(
  inlineMods: Record<string, string>
): Record<string, string> {
  const resolved: Record<string, string> = {};
  const attrChecks: Record<string, string> = {};

  for (const [key, value] of Object.entries(inlineMods)) {
    if (inlineModifiers.includes(key)) {
      resolved[key] = value;
    } else {
      attrChecks[key] = value;
    }
  }

  // Convert classlist from "active:true,hidden:false" to JSON
  if (resolved["classlist"]) {
    const classMap: Record<string, boolean> = {};
    for (const pair of resolved["classlist"].split(",")) {
      const [cls, val] = pair.split(":");
      classMap[cls.trim()] = val.trim() === "true";
    }
    resolved["classlist"] = JSON.stringify(classMap);
  }

  // Convert attribute checks to attrs-match JSON
  if (Object.keys(attrChecks).length > 0) {
    resolved["attrs-match"] = JSON.stringify(attrChecks);
  }

  return resolved;
}

/**
 * Parse the fs-assert-mutex attribute value into mutex mode and optional key list.
 */
export function parseMutex(
  value: string | undefined,
  conditionKey: string | undefined
): { mutex?: "type" | "each" | "conditions"; mutexKeys?: string[] } {
  if (!conditionKey || value === undefined) return {};
  if (value === "") {
    console.warn('[Faultsense]: fs-assert-mutex requires a value ("type", "each", "conditions", or comma-separated condition keys).');
    return {};
  }
  if (value === "type") return { mutex: "type" };
  if (value === "each") return { mutex: "each" };
  if (value === "conditions") return { mutex: "conditions" };
  return {
    mutex: "conditions",
    mutexKeys: value.split(",").map(k => k.trim()),
  };
}

/**
 * Determine whether a raw fs-trigger value is processable given the active
 * trigger set and (optionally) the in-flight event. Source-agnostic: the
 * caller supplies the raw string, whether it came from an attribute or a
 * spec entry. Returns false for missing/empty triggers.
 *
 * For keydown triggers with key filters (e.g., "keydown:Escape"), the event
 * must match the filter. For custom event triggers (e.g., "event:cart-updated"),
 * the full raw value must appear in `triggers` since each custom event name
 * is unique.
 */
export function isProcessableTrigger(
  raw: string | null | undefined,
  triggers: string[],
  event?: Event
): boolean {
  if (!raw) return false;
  const { base, filter } = parseTrigger(raw);

  if (base === "event") {
    return triggers.includes(raw);
  }

  if (!triggers.includes(base)) return false;

  if (filter && event instanceof KeyboardEvent) {
    return matchesKeyFilter(event, parseKeyFilter(filter));
  }

  return true;
}

/**
 * Pure metadata extraction from an iterable of (key, value) pairs. Both the
 * HTML parser (walking element.attributes) and the JSON parser (walking
 * Object.entries(specEntry)) call this with the same shape. No console.warn
 * lives here — warnings that need element context fire later, in
 * createAssertions, where the resolved target is in hand.
 */
export function extractMetadata(entries: Iterable<[string, string]>): ElementAssertionMetadata {
  const map = new Map<string, string>();
  for (const [k, v] of entries) {
    map.set(k, v);
  }

  const metadata: ElementAssertionMetadata = {
    details: {},
    types: [],
    modifiers: {},
  };

  for (const key of supportedAssertions.details) {
    const v = map.get(`${assertionPrefix.details}${key}`);
    if (v !== undefined) metadata.details[key] = v;
  }

  for (const key of supportedAssertions.types) {
    const v = map.get(`${assertionPrefix.types}${key}`);
    if (v !== undefined) {
      const parsed = parseTypeValue(v);
      metadata.types.push({
        type: key,
        value: parsed.selector,
        modifiers: Object.keys(parsed.modifiers).length > 0 ? parsed.modifiers : undefined,
      });
    }
  }

  for (const key of supportedAssertions.modifiers) {
    const v = map.get(`${assertionPrefix.modifiers}${key}`);
    if (v !== undefined) metadata.modifiers[key] = v;
  }

  metadata.types.push(...extractDynamicTypes(map));

  return metadata;
}

/**
 * Walk the (key, value) map for dynamic conditional types: fs-assert-{type}-{conditionKey}.
 * Condition keys are freeform lowercase alphanumeric strings with hyphens.
 */
function extractDynamicTypes(map: Map<string, string>): AssertionTypeEntry[] {
  const prefix = assertionPrefix.types;
  const types: AssertionTypeEntry[] = [];

  for (const [key, value] of map) {
    if (!key.startsWith(prefix)) continue;
    const suffix = key.slice(prefix.length);

    for (const domType of allAssertionTypes) {
      if (suffix.startsWith(`${domType}-`)) {
        const remaining = suffix.slice(domType.length + 1);

        if (conditionKeySuffixPattern.test(remaining)) {
          const parsed = parseTypeValue(value);
          types.push({
            type: domType,
            value: parsed.selector,
            modifiers: parsed.modifiers,
            conditionKey: remaining,
          });
        }
        break;
      }
    }
  }

  return types;
}

/**
 * Exposed for createAssertions: which condition keys collide with reserved
 * names. The original parseDynamicTypes warned inline; we move the warning
 * to createAssertions so element context is available and extractMetadata
 * stays pure.
 */
export function reservedConditionKeyConflicts(types: AssertionTypeEntry[]): string[] {
  const conflicts: string[] = [];
  for (const t of types) {
    if (t.conditionKey && reservedConditionKeys.includes(t.conditionKey)) {
      conflicts.push(t.conditionKey);
    }
  }
  return conflicts;
}
