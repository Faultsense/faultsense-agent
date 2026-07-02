import {
  assertionTriggerAttr,
  invertedResolutionTypes,
  reservedConditionKeys,
  supportedModifiersByType,
  domAssertions,
} from "../config";
import { parseRoutePattern, validateRoutePattern } from "../resolvers/route";
import { ensureSelector } from "../utils/elements";
import {
  type Assertion,
  type AssertionType,
  type ElementProcessor,
} from "../types";
import { isProcessableElement, parseElementAssertions } from "../parsers/html";
import {
  parseMutex,
  resolveInlineModifiers,
  type AssertionTypeEntry,
  type ElementAssertionMetadata,
} from "../parsers/shared";
import type { SpecRegistry } from "../assertions/spec-registry";

export class AssertionError extends Error {
  public details: Record<string, any>;

  constructor(message: string, details: Record<string, any>) {
    super(message);
    this.name = "AssertionError";
    this.details = details;
  }
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

export function createElementProcessor(opts: ProcessOptions): ElementProcessor {
  return function (targets: HTMLElement[]): Assertion[] {
    return processElements(targets, opts);
  };
}

export function processElements(
  targets: HTMLElement[],
  opts: ProcessOptions
): Assertion[] {
  const { triggers, eventMode = false, event, specRegistry, ignoreHtmlAttrs = false } = opts;
  const allAssertions: Assertion[] = [];

  for (const target of targets) {
    // HTML attribute discovery — gated by ignoreHtmlAttrs.
    if (!ignoreHtmlAttrs) {
      const elementsToProcess: HTMLElement[] = [];

      if (isProcessableElement(target, triggers, event)) {
        elementsToProcess.push(target);
      } else if (!eventMode) {
        // Only search descendants if NOT in event mode.
        // In event mode, only process the exact clicked element.
        const elementsWithTriggers = target.querySelectorAll(`[${assertionTriggerAttr}]`);

        for (const element of Array.from(elementsWithTriggers) as HTMLElement[]) {
          if (isProcessableElement(element, triggers, event)) {
            elementsToProcess.push(element);
          }
        }
      }

      for (const element of elementsToProcess) {
        const metadata = parseElementAssertions(element);
        allAssertions.push(...createAssertions(element, metadata));
      }
    }

    // JSON-spec discovery: scoped to the same target as the HTML side.
    // Event mode resolves entries via target.matches; non-event mode runs
    // the union-selector query against the target's subtree (inclusive).
    if (specRegistry) {
      const pairs = eventMode
        ? specRegistry.findCandidatesForEvent(triggers, target, event)
        : specRegistry.findCandidatesForScan(triggers, target);
      for (const [element, metadata] of pairs) {
        allAssertions.push(...createAssertions(element, metadata));
      }
    }
  }

  return allAssertions;
}

function isValidAssertionMetadata(
  assertionMetadata: ElementAssertionMetadata,
  element: HTMLElement
): boolean {
  const details = { element };

  if (!assertionMetadata.details["assert"]) {
    console.error(
      "[Faultsense]: Missing 'fs-assert' on assertion.",
      details
    );
    return false;
  }

  if (assertionMetadata.types.length === 0) {
    console.error("[Faultsense]: An assertion type must be provided.", details);
    return false;
  }

  return true;
}

export function createAssertions(
  element: HTMLElement,
  metadata: ElementAssertionMetadata
): Assertion[] {
  if (!isValidAssertionMetadata(metadata, element)) {
    return [];
  }

  for (const typeEntry of metadata.types) {
    if (
      typeEntry.conditionKey &&
      reservedConditionKeys.includes(typeEntry.conditionKey)
    ) {
      console.warn(
        `[Faultsense]: Condition key "${typeEntry.conditionKey}" conflicts with a reserved name. Avoid using assertion type names as condition keys.`,
        { element }
      );
    }
  }

  return metadata.types.filter((typeEntry) => {
    if (typeEntry.type === "route") {
      if (!typeEntry.value) {
        console.warn(
          `[Faultsense]: Route assertion on "${metadata.details["assert"]}" has no pattern. Skipping.`
        );
        return false;
      }
      const parsed = parseRoutePattern(typeEntry.value);
      const invalid = validateRoutePattern(parsed);
      if (invalid) {
        console.warn(
          `[Faultsense]: Invalid route pattern on "${metadata.details["assert"]}": ${invalid}. Skipping.`
        );
        return false;
      }
    }
    return true;
  }).map((typeEntry: AssertionTypeEntry) => {
    // Route assertions have no inline modifiers — everything is in the URL pattern.
    // DOM assertions use resolveInlineModifiers to handle text-matches, classlist, attrs-match.
    const resolvedMods = typeEntry.modifiers
      ? (typeEntry.type === "route" ? typeEntry.modifiers : resolveInlineModifiers(typeEntry.modifiers))
      : {};
    const mergedModifiers = { ...metadata.modifiers, ...resolvedMods };

    // Warn about unsupported modifiers for this assertion type.
    const allowedMods = supportedModifiersByType[typeEntry.type as keyof typeof supportedModifiersByType];
    if (allowedMods) {
      for (const mod of Object.keys(resolvedMods)) {
        if (!allowedMods.includes(mod)) {
          console.warn(
            `[Faultsense]: Modifier "${mod}" does not apply to "${typeEntry.type}" assertions. Found on "${metadata.details["assert"]}".`
          );
        }
      }
    }

    // Warn about count modifiers on self-referencing assertions (no selector)
    const hasCountMod = resolvedMods["count"] || resolvedMods["count-min"] || resolvedMods["count-max"];
    if (hasCountMod && !typeEntry.value) {
      console.warn(
        `[Faultsense]: Count modifier on self-referencing assertion "${metadata.details["assert"]}" is nonsensical (count is always 1).`
      );
    }

    // Self-targeting: if selector is empty, the element itself is the target.
    let typeValue = typeEntry.value as string;
    if (!typeValue && domAssertions.includes(typeEntry.type)) {
      typeValue = ensureSelector(element);
    }

    // Emitted assertions cannot persist across page navigation
    let mpaMode = Boolean(metadata.modifiers["mpa"]);
    if (typeEntry.type === "emitted" && mpaMode) {
      console.warn(
        `[Faultsense]: "emitted" assertions cannot persist across page navigation (MPA mode). ` +
        `Ignoring fs-assert-mpa on "${metadata.details["assert"]}".`
      );
      mpaMode = false;
    }

    return {
      assertionKey: metadata.details["assert"],
      endTime: undefined,
      elementSnapshot: element.outerHTML,
      trigger: metadata.details.trigger,
      mpa_mode: mpaMode,
      startTime: Date.now(),
      status: undefined,
      timeout: Number(metadata.modifiers["timeout"]) || 0,
      type: typeEntry.type as AssertionType,
      typeValue,
      modifiers: mergedModifiers,
      conditionKey: typeEntry.conditionKey,
      ...parseMutex(metadata.modifiers["mutex"] as string | undefined, typeEntry.conditionKey),
      invertResolution: invertedResolutionTypes.includes(typeEntry.type) || undefined,
    };
  });
}
