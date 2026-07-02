import { type AssertionModiferValue } from "../types";
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
 * Parse a type attribute value into a selector and inline modifiers.
 * Format: "selector[key=value][key=value]..."
 * Handles nested brackets in values (e.g., regex character classes like [a-z])
 */
export declare function parseTypeValue(raw: string): {
    selector: string;
    modifiers: Record<string, string>;
};
/**
 * Resolve inline modifiers to the format resolvers expect.
 * Reserved keys (text-matches, classlist) pass through.
 * Unreserved keys become attrs-match entries.
 */
export declare function resolveInlineModifiers(inlineMods: Record<string, string>): Record<string, string>;
/**
 * Parse the fs-assert-mutex attribute value into mutex mode and optional key list.
 */
export declare function parseMutex(value: string | undefined, conditionKey: string | undefined): {
    mutex?: "type" | "each" | "conditions";
    mutexKeys?: string[];
};
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
export declare function isProcessableTrigger(raw: string | null | undefined, triggers: string[], event?: Event): boolean;
/**
 * Pure metadata extraction from an iterable of (key, value) pairs. Both the
 * HTML parser (walking element.attributes) and the JSON parser (walking
 * Object.entries(specEntry)) call this with the same shape. No console.warn
 * lives here — warnings that need element context fire later, in
 * createAssertions, where the resolved target is in hand.
 */
export declare function extractMetadata(entries: Iterable<[string, string]>): ElementAssertionMetadata;
/**
 * Exposed for createAssertions: which condition keys collide with reserved
 * names. The original parseDynamicTypes warned inline; we move the warning
 * to createAssertions so element context is available and extractMetadata
 * stays pure.
 */
export declare function reservedConditionKeyConflicts(types: AssertionTypeEntry[]): string[];
