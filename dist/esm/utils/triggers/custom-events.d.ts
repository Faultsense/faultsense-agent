export declare const CUSTOM_EVENT_PREFIX = "event:";
export interface ParsedCustomEventTrigger {
    eventName: string;
    detailMatches?: Record<string, string>;
}
/**
 * Parse a custom event trigger value like "event:cart-updated[detail-matches=action:increment]".
 * Strips the "event:" prefix, delegates bracket parsing to parseTypeValue,
 * and converts detail-matches to key:value pairs.
 */
export declare function parseCustomEventTrigger(raw: string): ParsedCustomEventTrigger;
/**
 * Check if a CustomEvent's detail matches the expected key:value pairs.
 * Primitive detail: matches against String(event.detail).
 * Object detail: shallow string equality on each key.
 */
export declare function matchesDetail(event: CustomEvent, matchers: Record<string, string>): boolean;
/**
 * Check if a trigger value is a custom event trigger (starts with "event:").
 */
export declare function isCustomEventTrigger(triggerValue: string): boolean;
