import { type ElementAssertionMetadata } from "./shared";
/**
 * HTML eligibility check. Returns true when the element carries a processable
 * fs-trigger attribute for the active trigger set (and optionally the in-flight
 * event for key filters).
 */
export declare function isProcessableElement(element: HTMLElement, triggers: string[], event?: Event): boolean;
/**
 * Build the source-agnostic ElementAssertionMetadata from an element's
 * attributes. Mirror of the JSON parser, which walks Object.entries instead.
 */
export declare function parseElementAssertions(element: HTMLElement): ElementAssertionMetadata;
