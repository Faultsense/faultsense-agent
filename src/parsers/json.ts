import { type SpecEntry } from "../types";
import {
  extractMetadata,
  isProcessableTrigger,
  type ElementAssertionMetadata,
} from "./shared";

/**
 * JSON eligibility check. Returns true when the entry's fs-trigger value is
 * processable for the active trigger set (and optionally the in-flight event).
 */
export function isProcessableSpecEntry(
  entry: SpecEntry,
  triggers: string[],
  event?: Event
): boolean {
  return isProcessableTrigger(entry["fs-trigger"], triggers, event);
}

/**
 * Build ElementAssertionMetadata from a JSON spec entry by walking its
 * (key, value) pairs through the same shared extractor the HTML parser uses.
 * Skips non-string values defensively — SpecEntry's indexed signature is
 * optional so TypeScript widens Object.entries values to `string | undefined`.
 */
export function parseSpecAssertions(entry: SpecEntry): ElementAssertionMetadata {
  const pairs: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(entry)) {
    if (typeof v === "string") pairs.push([k, v]);
  }
  return extractMetadata(pairs);
}

/**
 * For event-mode discovery: does this entry's fs-target match the actual
 * event target? Returns the target element on match, or null. Wraps the
 * native matches() in try/catch — an invalid selector warns once and skips.
 */
export function resolveTargetForEvent(
  entry: SpecEntry,
  target: HTMLElement
): HTMLElement | null {
  const selector = entry["fs-target"];
  if (!selector) {
    console.warn("[Faultsense]: JSON spec entry missing 'fs-target'.", entry);
    return null;
  }
  try {
    return target.matches(selector) ? target : null;
  } catch {
    console.warn(
      `[Faultsense]: Invalid CSS selector in fs-target: "${selector}".`,
      entry
    );
    return null;
  }
}

/**
 * For scan-mode discovery: every element in scanRoot's subtree (including
 * scanRoot itself) that matches this entry's fs-target. Wraps the native
 * querySelectorAll + matches in try/catch.
 *
 * Note: callers passing a batched scanRoot typically already filtered the
 * relevant subtree from a MutationRecord, so this stays scoped — no global
 * document scans happen here.
 */
export function resolveTargetsForScan(
  entry: SpecEntry,
  scanRoot: Element
): HTMLElement[] {
  const selector = entry["fs-target"];
  if (!selector) {
    console.warn("[Faultsense]: JSON spec entry missing 'fs-target'.", entry);
    return [];
  }
  const matches: HTMLElement[] = [];
  try {
    if (scanRoot.matches(selector)) {
      matches.push(scanRoot as HTMLElement);
    }
    for (const el of Array.from(scanRoot.querySelectorAll(selector))) {
      matches.push(el as HTMLElement);
    }
  } catch {
    console.warn(
      `[Faultsense]: Invalid CSS selector in fs-target: "${selector}".`,
      entry
    );
    return [];
  }
  return matches;
}
