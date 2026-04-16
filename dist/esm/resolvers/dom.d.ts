import { Assertion, ElementResolver, AssertionCollectionResolver } from "../types";
import { Logger } from "../utils/logger";
export declare function setResolverDebugLogger(logger: Logger | null): void;
/**
 * Return all the modifier functions for an assertion
 */
export declare function getAssertionModifierFns(assertion: Assertion): Array<(el: HTMLElement) => boolean>;
export declare const elementResolver: ElementResolver;
export declare const immediateResolver: AssertionCollectionResolver;
export declare const documentResolver: AssertionCollectionResolver;
