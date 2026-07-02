import { type SpecEntry } from "../types";
import type { ElementAssertionMetadata } from "../parsers/shared";
export type CandidatePair = readonly [HTMLElement, ElementAssertionMetadata];
export interface SpecDiff {
    /** Custom event names introduced by this update (need a document listener). */
    addedEvents: string[];
    /** Custom event names dropped by this update (listener can be torn down if no
     *  other source references them). */
    removedEvents: string[];
}
export interface SpecRegistry {
    setEntries(entries: readonly SpecEntry[]): SpecDiff;
    addEntries(entries: readonly SpecEntry[]): SpecDiff;
    getEntries(): readonly SpecEntry[];
    /**
     * Event-mode discovery. Walks entries indexed by trigger base name,
     * runs target.matches(fs-target) per candidate, returns (target, metadata)
     * pairs for entries that match.
     */
    findCandidatesForEvent(triggers: string[], target: HTMLElement, event?: Event): CandidatePair[];
    /**
     * Non-event-mode discovery (mount, invariant, online, offline, load).
     * Runs ONE native querySelectorAll per trigger using a precomputed union
     * selector, then small-N filters each match against per-entry fs-target.
     * scanRoot is inclusive — itself is checked alongside its subtree.
     */
    findCandidatesForScan(triggers: string[], scanRoot: Element): CandidatePair[];
    /**
     * Custom event discovery. Called from handleCustomEvent with the parsed
     * event name. Filters by detail matchers, then resolves each entry's
     * fs-target to actual elements (one assertion per matched element).
     */
    findCustomEventCandidates(eventName: string, event: CustomEvent): CandidatePair[];
    /**
     * OOB discovery. Walks entries indexed by parent assertion key in
     * fs-assert-oob (or fs-assert-oob-fail). O(passed-parents) lookup
     * instead of O(spec-size × parents) per settle.
     */
    findOobEntriesForParents(attr: "fs-assert-oob" | "fs-assert-oob-fail", parentKeys: ReadonlySet<string>): SpecEntry[];
    /** Reset registry state to empty. Used in cleanup paths. */
    clear(): void;
}
export declare function createSpecRegistry(): SpecRegistry;
