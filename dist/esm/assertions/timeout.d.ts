import { Assertion, CompletedAssertion, Configuration } from "../types";
/**
 * Creates a timeout timer for an assertion
 * The timer will fire when the assertion timeout duration elapses
 */
export declare function createAssertionTimeout(assertion: Assertion, config: Configuration, onTimeout: (completedAssertion: CompletedAssertion) => void, allAssertions?: Assertion[]): void;
/**
 * Clears the timeout timer for a specific assertion
 */
export declare function clearAssertionTimeout(assertion: Assertion): void;
/**
 * Clears all active timeout timers from a collection of assertions
 * Used during system shutdown or cleanup
 */
export declare function clearAllTimeouts(assertions: Assertion[]): void;
/**
 * Schedule a GC sweep if one isn't already scheduled.
 * When it fires, calls the provided callback with stale assertions.
 */
export declare function scheduleGc(config: Configuration, getStaleAssertions: () => Assertion[], onStale: (stale: CompletedAssertion[]) => void): void;
/**
 * Clear the GC timer. Called on page unload and cleanup.
 */
export declare function clearGcTimeout(): void;
