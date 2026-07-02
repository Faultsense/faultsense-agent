import { type SpecEntry, type FsAttr } from "../types";
import {
  isProcessableSpecEntry,
  parseSpecAssertions,
  resolveTargetForEvent,
  resolveTargetsForScan,
} from "../parsers/json";
import {
  parseCustomEventTrigger,
  matchesDetail,
  isCustomEventTrigger,
  CUSTOM_EVENT_PREFIX,
} from "../utils/triggers/custom-events";
import { parseTrigger } from "../utils/triggers";
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
  findCandidatesForEvent(
    triggers: string[],
    target: HTMLElement,
    event?: Event
  ): CandidatePair[];

  /**
   * Non-event-mode discovery (mount, invariant, online, offline, load).
   * Runs ONE native querySelectorAll per trigger using a precomputed union
   * selector, then small-N filters each match against per-entry fs-target.
   * scanRoot is inclusive — itself is checked alongside its subtree.
   */
  findCandidatesForScan(
    triggers: string[],
    scanRoot: Element
  ): CandidatePair[];

  /**
   * Custom event discovery. Called from handleCustomEvent with the parsed
   * event name. Filters by detail matchers, then resolves each entry's
   * fs-target to actual elements (one assertion per matched element).
   */
  findCustomEventCandidates(
    eventName: string,
    event: CustomEvent
  ): CandidatePair[];

  /**
   * OOB discovery. Walks entries indexed by parent assertion key in
   * fs-assert-oob (or fs-assert-oob-fail). O(passed-parents) lookup
   * instead of O(spec-size × parents) per settle.
   */
  findOobEntriesForParents(
    attr: "fs-assert-oob" | "fs-assert-oob-fail",
    parentKeys: ReadonlySet<string>
  ): SpecEntry[];

  /** Reset registry state to empty. Used in cleanup paths. */
  clear(): void;
}

/**
 * Compute the base trigger key used to index a spec entry.
 * - "click", "submit", etc. → base name as-is
 * - "keydown:Escape" → "keydown" (filter participates in entry-level eligibility,
 *   not in indexing — multiple keydown filters share one bucket)
 * - "event:cart-updated[type=add]" → "event" (custom events get a SEPARATE
 *   index keyed by parsed eventName; this returns "event" only to satisfy
 *   the union-selector pathway, which custom events don't use)
 */
function triggerIndexKey(raw: string): string {
  return parseTrigger(raw).base;
}

export function createSpecRegistry(): SpecRegistry {
  let entries: SpecEntry[] = [];
  // Indexed by base trigger name (e.g., "click", "mount"). Event triggers also
  // appear here under "event" but the union-selector cache for "event" is
  // unused — custom events take the entriesByEventName path instead.
  const entriesByTrigger = new Map<string, SpecEntry[]>();
  // Union of fs-target selectors per trigger base, for scan-mode discovery.
  // Rebuilt atomically with entriesByTrigger.
  const unionSelectorByTrigger = new Map<string, string>();
  // Indexed by parsed custom-event name (e.g., "cart-updated"). Also the
  // source of truth for which event names are currently referenced — diff
  // before/after by snapshotting keys() rather than re-walking entries.
  const entriesByEventName = new Map<string, SpecEntry[]>();
  // Indexed by parent assertion key referenced in fs-assert-oob /
  // fs-assert-oob-fail. Lets findOobEntriesForParents() do O(passed) lookups
  // on every settle() instead of O(spec-size × passed).
  const entriesByOobKey = new Map<string, SpecEntry[]>();
  const entriesByOobFailKey = new Map<string, SpecEntry[]>();

  function pushIndexed(map: Map<string, SpecEntry[]>, key: string, entry: SpecEntry): void {
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }

  function indexOobAttr(
    map: Map<string, SpecEntry[]>,
    attr: FsAttr,
    entry: SpecEntry
  ): void {
    const value = entry[attr];
    if (!value) return;
    for (const key of value.split(",")) {
      const trimmed = key.trim();
      if (trimmed) pushIndexed(map, trimmed, entry);
    }
  }

  function indexEntry(entry: SpecEntry): void {
    const raw = entry["fs-trigger"];
    if (raw) {
      pushIndexed(entriesByTrigger, triggerIndexKey(raw), entry);
      if (isCustomEventTrigger(raw)) {
        const parsed = parseCustomEventTrigger(raw);
        pushIndexed(entriesByEventName, parsed.eventName, entry);
      }
    }
    indexOobAttr(entriesByOobKey, "fs-assert-oob", entry);
    indexOobAttr(entriesByOobFailKey, "fs-assert-oob-fail", entry);
  }

  function rebuildUnionSelectors(): void {
    unionSelectorByTrigger.clear();
    for (const [trigger, bucket] of entriesByTrigger) {
      // Custom events don't use the union-selector path; skip to keep the cache lean.
      if (trigger === "event") continue;
      const selectors = new Set<string>();
      for (const entry of bucket) {
        const sel = entry["fs-target"];
        if (sel) selectors.add(sel);
      }
      if (selectors.size > 0) {
        unionSelectorByTrigger.set(trigger, Array.from(selectors).join(", "));
      }
    }
  }

  /** Diff two key-snapshots; returns names in `next` but not in `prev`. */
  function diffAdded(prev: ReadonlySet<string>, next: Iterable<string>): string[] {
    const out: string[] = [];
    for (const n of next) if (!prev.has(n)) out.push(n);
    return out;
  }

  /** Diff two key-snapshots; returns names in `prev` but not in `next`. */
  function diffRemoved(prev: Iterable<string>, next: ReadonlySet<string>): string[] {
    const out: string[] = [];
    for (const n of prev) if (!next.has(n)) out.push(n);
    return out;
  }

  function setEntries(next: readonly SpecEntry[]): SpecDiff {
    // Snapshot keys, NOT entries — the map is the source of truth for which
    // event names are referenced, so we don't re-walk the entries array.
    const before = new Set(entriesByEventName.keys());

    entries = [...next];
    entriesByTrigger.clear();
    entriesByEventName.clear();
    entriesByOobKey.clear();
    entriesByOobFailKey.clear();
    for (const entry of entries) indexEntry(entry);
    rebuildUnionSelectors();

    return {
      addedEvents: diffAdded(before, entriesByEventName.keys()),
      removedEvents: diffRemoved(before, new Set(entriesByEventName.keys())),
    };
  }

  function addEntries(next: readonly SpecEntry[]): SpecDiff {
    const before = new Set(entriesByEventName.keys());
    for (const entry of next) {
      entries.push(entry);
      indexEntry(entry);
    }
    rebuildUnionSelectors();
    return {
      addedEvents: diffAdded(before, entriesByEventName.keys()),
      // Append never removes.
      removedEvents: [],
    };
  }

  function getEntries(): readonly SpecEntry[] {
    return entries;
  }

  function findCandidatesForEvent(
    triggers: string[],
    target: HTMLElement,
    event?: Event
  ): CandidatePair[] {
    const pairs: CandidatePair[] = [];
    // Identity-based dedupe: an entry can't fire twice for the same
    // (target, event) within one call (e.g., when triggers contains
    // duplicates). WeakSet on entry identity is collision-proof —
    // a previous string-join key could collide if any field contained `|`.
    const seen = new WeakSet<SpecEntry>();

    for (const trigger of triggers) {
      // For non-event triggers, lookup by base name. For event triggers,
      // events arrive through handleCustomEvent → findCustomEventCandidates
      // — they never come through this path. Still, look them up under
      // their base "event" bucket for completeness.
      const bucket = entriesByTrigger.get(triggerIndexKey(trigger));
      if (!bucket) continue;
      for (const entry of bucket) {
        if (seen.has(entry)) continue;
        if (!isProcessableSpecEntry(entry, triggers, event)) continue;
        const matched = resolveTargetForEvent(entry, target);
        if (!matched) continue;
        seen.add(entry);
        pairs.push([matched, parseSpecAssertions(entry)]);
      }
    }

    return pairs;
  }

  function findCandidatesForScan(
    triggers: string[],
    scanRoot: Element
  ): CandidatePair[] {
    const pairs: CandidatePair[] = [];

    for (const trigger of triggers) {
      const base = triggerIndexKey(trigger);
      if (base === "event") continue; // custom events have their own path
      const bucket = entriesByTrigger.get(base);
      if (!bucket || bucket.length === 0) continue;

      const unionSelector = unionSelectorByTrigger.get(base);
      if (!unionSelector) continue;

      let candidateElements: HTMLElement[];
      try {
        candidateElements = Array.from(
          scanRoot.querySelectorAll(unionSelector)
        ) as HTMLElement[];
        if (scanRoot.matches(unionSelector)) {
          candidateElements.unshift(scanRoot as HTMLElement);
        }
      } catch {
        // One entry has a bad selector and broke the union. Fall back to
        // per-entry resolution so the bad entry warns individually instead
        // of poisoning the entire trigger group.
        candidateElements = [];
        for (const entry of bucket) {
          candidateElements.push(...resolveTargetsForScan(entry, scanRoot));
        }
      }

      // Fast path: bucket has a single entry. The union-select already
      // proved every candidateElement matches; no per-entry filter needed.
      // This is the common case for hand-authored specs.
      if (bucket.length === 1) {
        const onlyEntry = bucket[0];
        if (onlyEntry["fs-target"]) {
          for (const el of candidateElements) {
            pairs.push([el, parseSpecAssertions(onlyEntry)]);
          }
        }
        continue;
      }

      // Multi-entry bucket: assign each match to its source entry. An element
      // matching multiple entries (e.g., both `.btn` and `.btn-primary`)
      // produces one pair per matching entry, mirroring HTML's behavior
      // when an element has multiple fs-assert-* attrs.
      for (const el of candidateElements) {
        for (const entry of bucket) {
          const sel = entry["fs-target"];
          if (!sel) continue;
          try {
            if (el.matches(sel)) {
              pairs.push([el, parseSpecAssertions(entry)]);
            }
          } catch {
            // Bad selector on this individual entry; warned already.
          }
        }
      }
    }

    return pairs;
  }

  function findCustomEventCandidates(
    eventName: string,
    event: CustomEvent
  ): CandidatePair[] {
    const pairs: CandidatePair[] = [];
    const bucket = entriesByEventName.get(eventName);
    if (!bucket) return pairs;

    for (const entry of bucket) {
      const raw = entry["fs-trigger"];
      // Defensive: the bucket should only hold entries with event triggers,
      // but a malformed entry could slip in.
      if (!raw || !raw.startsWith(CUSTOM_EVENT_PREFIX)) continue;
      const parsed = parseCustomEventTrigger(raw);
      if (parsed.eventName !== eventName) continue;
      if (parsed.detailMatches && !matchesDetail(event, parsed.detailMatches)) continue;

      const targets = resolveTargetsForScan(entry, document.body);
      const metadata = parseSpecAssertions(entry);
      for (const target of targets) {
        pairs.push([target, metadata]);
      }
    }

    return pairs;
  }

  function findOobEntriesForParents(
    attr: "fs-assert-oob" | "fs-assert-oob-fail",
    parentKeys: ReadonlySet<string>
  ): SpecEntry[] {
    if (parentKeys.size === 0) return [];
    const map = attr === "fs-assert-oob" ? entriesByOobKey : entriesByOobFailKey;
    const out: SpecEntry[] = [];
    const seen = new WeakSet<SpecEntry>();
    for (const key of parentKeys) {
      const bucket = map.get(key);
      if (!bucket) continue;
      for (const entry of bucket) {
        if (seen.has(entry)) continue;
        seen.add(entry);
        out.push(entry);
      }
    }
    return out;
  }

  function clear(): void {
    entries = [];
    entriesByTrigger.clear();
    unionSelectorByTrigger.clear();
    entriesByEventName.clear();
    entriesByOobKey.clear();
    entriesByOobFailKey.clear();
  }

  return {
    setEntries,
    addEntries,
    getEntries,
    findCandidatesForEvent,
    findCandidatesForScan,
    findCustomEventCandidates,
    findOobEntriesForParents,
    clear,
  };
}
