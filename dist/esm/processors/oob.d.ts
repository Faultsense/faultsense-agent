import { Assertion, CompletedAssertion } from "../types";
/**
 * Find OOB assertions triggered by passed and/or failed parent assertions.
 *
 * - fs-assert-oob="key1,key2" triggers when any listed parent passes
 * - fs-assert-oob-fail="key1,key2" triggers when any listed parent fails
 */
export declare function findAndCreateOobAssertions(passedAssertions: CompletedAssertion[], failedAssertions?: CompletedAssertion[]): Assertion[];
