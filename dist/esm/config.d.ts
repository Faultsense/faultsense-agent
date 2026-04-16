import { AssertionType, Configuration } from "./types";
export declare const defaultConfiguration: Partial<Configuration>;
export declare const assertionPrefix: {
    details: string;
    types: string;
    modifiers: string;
};
export declare const assertionTriggerAttr: string;
export declare const domAssertions: string[];
export declare const routeAssertions: string[];
export declare const sequenceAssertions: string[];
export declare const conditionKeySuffixPattern: RegExp;
export declare const reservedConditionKeys: string[];
export declare const supportedModifiersByType: Record<AssertionType, readonly string[]>;
export declare const invertedResolutionTypes: string[];
export declare const oobAttr: string;
export declare const oobFailAttr: string;
export declare const inlineModifiers: string[];
export declare const supportedAssertions: {
    details: string[];
    types: ("added" | "removed" | "updated" | "visible" | "hidden" | "loaded" | "stable" | "emitted" | "route" | "after")[];
    modifiers: string[];
};
export declare const supportedEvents: string[];
/** Maps developer-facing trigger names to actual DOM event names */
export declare const triggerEventMap: Record<string, string>;
export declare const eventTriggerAliases: Record<string, string[]>;
export declare const supportedTriggers: string[];
export declare const storageKey = "faultsense-active-assertions";
