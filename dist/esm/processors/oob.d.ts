import { Assertion, CompletedAssertion } from "../types";
import type { SpecRegistry } from "../assertions/spec-registry";
/**
 * Find OOB assertions triggered by passed and/or failed parent assertions.
 * Walks BOTH the live DOM (for HTML-attribute-authored OOB elements) AND
 * the spec registry (for JSON-spec-authored OOB entries). Same downstream
 * pipeline either way.
 *
 * - fs-assert-oob="key1,key2" triggers when any listed parent passes
 * - fs-assert-oob-fail="key1,key2" triggers when any listed parent fails
 */
export declare function findAndCreateOobAssertions(passedAssertions: CompletedAssertion[], failedAssertions?: CompletedAssertion[], specRegistry?: SpecRegistry): Assertion[];
