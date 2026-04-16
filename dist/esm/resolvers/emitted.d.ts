import type { Assertion, CompletedAssertion } from "../types";
/**
 * Resolves "emitted" assertions by checking if the fired CustomEvent
 * matches the expected event name and optional detail-matches modifier.
 *
 * detail-matches supports regex matching on values (consistent with text-matches).
 */
export declare function emittedResolver(event: CustomEvent, pendingEmitted: Assertion[]): CompletedAssertion[];
