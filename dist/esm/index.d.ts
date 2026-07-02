import { Configuration } from "./types";
export type { ApiPayload, Configuration, CollectorFunction, SpecEntry, FsAttr } from "./types";
export declare function registerCleanupHook(fn: () => void): void;
export declare const version: string;
export declare function init(initialConfig: Partial<Configuration>): () => void;
