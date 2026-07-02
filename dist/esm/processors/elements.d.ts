import { type Assertion, type ElementProcessor } from "../types";
import { type ElementAssertionMetadata } from "../parsers/shared";
import type { SpecRegistry } from "../assertions/spec-registry";
export declare class AssertionError extends Error {
    details: Record<string, any>;
    constructor(message: string, details: Record<string, any>);
}
/**
 * Per-invocation context for processElements. Bundled as an options object
 * so the call site stays readable as the agent grows new cross-cutting
 * concerns (currently: specRegistry, ignoreHtmlAttrs).
 */
export interface ProcessOptions {
    triggers: string[];
    eventMode?: boolean;
    event?: Event;
    /** JSON spec source, when configured. Undefined for HTML-only agents. */
    specRegistry?: SpecRegistry;
    /** When true, HTML-attribute discovery is skipped — JSON-only mode. */
    ignoreHtmlAttrs?: boolean;
}
export declare function createElementProcessor(opts: ProcessOptions): ElementProcessor;
export declare function processElements(targets: HTMLElement[], opts: ProcessOptions): Assertion[];
export declare function createAssertions(element: HTMLElement, metadata: ElementAssertionMetadata): Assertion[];
