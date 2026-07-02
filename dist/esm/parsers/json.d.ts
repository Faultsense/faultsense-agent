import { type SpecEntry } from "../types";
import { type ElementAssertionMetadata } from "./shared";
/**
 * JSON eligibility check. Returns true when the entry's fs-trigger value is
 * processable for the active trigger set (and optionally the in-flight event).
 */
export declare function isProcessableSpecEntry(entry: SpecEntry, triggers: string[], event?: Event): boolean;
/**
 * Build ElementAssertionMetadata from a JSON spec entry by walking its
 * (key, value) pairs through the same shared extractor the HTML parser uses.
 * Skips non-string values defensively — SpecEntry's indexed signature is
 * optional so TypeScript widens Object.entries values to `string | undefined`.
 */
export declare function parseSpecAssertions(entry: SpecEntry): ElementAssertionMetadata;
/**
 * For event-mode discovery: does this entry's fs-target match the actual
 * event target? Returns the target element on match, or null. Wraps the
 * native matches() in try/catch — an invalid selector warns once and skips.
 */
export declare function resolveTargetForEvent(entry: SpecEntry, target: HTMLElement): HTMLElement | null;
/**
 * For scan-mode discovery: every element in scanRoot's subtree (including
 * scanRoot itself) that matches this entry's fs-target. Wraps the native
 * querySelectorAll + matches in try/catch.
 *
 * Note: callers passing a batched scanRoot typically already filtered the
 * relevant subtree from a MutationRecord, so this stays scoped — no global
 * document scans happen here.
 */
export declare function resolveTargetsForScan(entry: SpecEntry, scanRoot: Element): HTMLElement[];
