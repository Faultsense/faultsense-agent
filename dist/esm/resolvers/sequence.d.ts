import type { Assertion, CompletedAssertion, Configuration } from "../types";
/**
 * Resolves "after" assertions by checking whether referenced parent
 * assertion keys have already passed in activeAssertions.
 *
 * Must receive the FULL activeAssertions array (including completed)
 * because it needs to find parent assertions with status === "passed".
 */
export declare function sequenceResolver(activeAssertions: Assertion[], _config: Configuration): CompletedAssertion[];
