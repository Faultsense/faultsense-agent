import { type Assertion, type ElementProcessor } from "../types";
export declare class AssertionError extends Error {
    details: Record<string, any>;
    constructor(message: string, details: Record<string, any>);
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
export declare function createElementProcessor(triggers: string[], eventMode?: boolean, event?: Event): ElementProcessor;
export declare function processElements(targets: HTMLElement[], triggers: string[], eventMode?: boolean, event?: Event): Assertion[];
