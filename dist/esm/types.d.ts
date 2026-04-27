export type CollectorFunction = (payload: ApiPayload) => void;
export interface Configuration {
    apiKey: string;
    releaseLabel: string;
    gcInterval: number;
    unloadGracePeriod: number;
    collectorURL: string | CollectorFunction;
    debug: boolean;
    userContext?: Record<string, any>;
    userCohorts?: Record<string, string>;
}
export type ElementProcessor = (elements: HTMLElement[]) => Assertion[];
export type ElementResolver = (addedOrUpdatedElements: HTMLElement[], removedElements: HTMLElement[], updatedElements: HTMLElement[], assertions: Assertion[]) => CompletedAssertion[];
export type EventProcessor = (event: Event, processor: ElementProcessor) => Assertion[];
export type EventResolver = (event: Event, assertions: Assertion[]) => CompletedAssertion[];
export type MutationProcessor = (mutationsList: MutationRecord[], processor: ElementProcessor) => Assertion[];
export type MutationHandler<T> = (mutationsList: MutationRecord[], handler: ElementProcessor | ElementResolver) => T[];
export interface ErrorInfo {
    message: string;
    stack?: string;
    source?: string;
    lineno?: number;
    colno?: number;
}
export type GlobalErrorHandler = (errorInfo: ErrorInfo) => void;
export type AssertionCollectionResolver = (activeAssertions: Assertion[], config: Configuration) => CompletedAssertion[];
export type GlobalErrorResolver = (errorInfo: ErrorInfo, activeAssertions: Assertion[]) => CompletedAssertion[];
export type AssertionStatus = "passed" | "failed" | "dismissed";
export declare const domAssertionTypes: readonly ["added", "removed", "updated", "visible", "hidden", "loaded", "stable"];
export declare const eventAssertionTypes: readonly ["emitted"];
export declare const routeAssertionTypes: readonly ["route"];
export declare const sequenceAssertionTypes: readonly ["after"];
export declare const allAssertionTypes: readonly ["added", "removed", "updated", "visible", "hidden", "loaded", "stable", "emitted", "route", "after"];
export type AssertionType = (typeof allAssertionTypes)[number];
export type AssertionModiferValue = string;
export declare const domModifiers: readonly ["text-matches", "classlist", "attrs-match", "value-matches", "checked", "disabled", "count", "count-min", "count-max", "focused", "focused-within"];
export type DomModifier = (typeof domModifiers)[number];
export type AssertionModifiers = "mpa" | "timeout" | "detail-matches" | DomModifier;
export interface Assertion {
    assertionKey: string;
    elementSnapshot: string;
    mpa_mode: boolean;
    trigger: string;
    timeout: number;
    startTime: number;
    type: AssertionType;
    typeValue: string;
    conditionKey?: string;
    mutex?: "type" | "each" | "conditions";
    mutexKeys?: string[];
    oob?: boolean;
    endTime?: number;
    status?: AssertionStatus;
    errorContext?: ErrorInfo;
    modifiers: Partial<Record<AssertionModifiers, AssertionModiferValue>>;
    attempts?: number[];
    previousStartTime?: number;
    previousEndTime?: number;
    previousStatus?: AssertionStatus;
    timeoutId?: ReturnType<typeof setTimeout>;
    invertResolution?: boolean;
}
export interface CompletedAssertion extends Omit<Assertion, "endTime" | "status"> {
    endTime: number;
    status: AssertionStatus;
}
export interface ApiPayload {
    api_key: string;
    assertion_key: string;
    assertion_trigger: string;
    assertion_type_value: string;
    assertion_type: AssertionType;
    assertion_type_modifiers: Partial<Record<AssertionModifiers, AssertionModiferValue>>;
    attempts: number[];
    condition_key: string;
    element_snapshot: string;
    release_label: string;
    status: AssertionStatus;
    error_context?: {
        message: string;
        stack?: string;
        source?: string;
        lineno?: number;
        colno?: number;
    };
    user_context?: Record<string, any>;
    user_cohorts?: Record<string, string>;
    agent_version: string;
    timestamp: string;
}
declare global {
    interface Window {
        Faultsense?: {
            version?: string;
            init?: (config: Partial<Configuration>) => () => void;
            cleanup?: () => void;
            collectors?: Record<string, CollectorFunction>;
            registerCleanupHook?: (fn: () => void) => void;
            setUserContext?: (context: Record<string, any> | undefined) => void;
            setUserCohorts?: (cohorts: Record<string, string> | undefined) => void;
        };
    }
    const __FS_VERSION__: string;
}
