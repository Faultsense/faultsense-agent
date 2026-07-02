import { assertionTriggerAttr } from "../config";
import {
  extractMetadata,
  isProcessableTrigger,
  type ElementAssertionMetadata,
} from "./shared";

/**
 * HTML eligibility check. Returns true when the element carries a processable
 * fs-trigger attribute for the active trigger set (and optionally the in-flight
 * event for key filters).
 */
export function isProcessableElement(
  element: HTMLElement,
  triggers: string[],
  event?: Event
): boolean {
  return isProcessableTrigger(
    element.getAttribute(assertionTriggerAttr),
    triggers,
    event
  );
}

/**
 * Build the source-agnostic ElementAssertionMetadata from an element's
 * attributes. Mirror of the JSON parser, which walks Object.entries instead.
 */
export function parseElementAssertions(element: HTMLElement): ElementAssertionMetadata {
  const entries: Array<[string, string]> = [];
  for (const attr of Array.from(element.attributes)) {
    entries.push([attr.name, attr.value]);
  }
  return extractMetadata(entries);
}
