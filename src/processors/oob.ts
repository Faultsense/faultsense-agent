import { domAssertions, oobAttr, oobFailAttr, assertionPrefix } from "../config";
import { Assertion, AssertionType, CompletedAssertion, fsAttr } from "../types";
import { parseTypeValue, resolveInlineModifiers } from "../parsers/shared";
import { resolveTargetsForScan } from "../parsers/json";
import { ensureSelector } from "../utils/elements";
import type { SpecRegistry } from "../assertions/spec-registry";

/**
 * Scan the DOM for OOB elements whose parent keys match the given assertions.
 * Creates assertions that enter the normal resolution pipeline.
 */
function findOobByAttr(
  attr: string,
  triggerName: string,
  parentAssertions: CompletedAssertion[]
): Assertion[] {
  if (parentAssertions.length === 0) return [];

  const parentKeys = new Set(parentAssertions.map((a) => a.assertionKey));
  const oobElements = document.querySelectorAll(`[${attr}]`);
  const assertions: Assertion[] = [];

  for (const el of Array.from(oobElements) as HTMLElement[]) {
    const assertionKey = el.getAttribute(`${assertionPrefix.details}assert`);
    if (!assertionKey) continue;

    const attrValue = el.getAttribute(attr);
    if (!attrValue) continue;

    const keys = attrValue.split(",").map((k) => k.trim());
    if (!keys.some((k) => parentKeys.has(k))) continue;

    // outerHTML is identical for every type-loop iteration below — snapshot once.
    const elementSnapshot = el.outerHTML;

    // Collect assertion types from standard fs-assert-{type} attributes
    for (const type of domAssertions) {
      const typeAttrName = `${assertionPrefix.types}${type}`;
      const typeAttrValue = el.getAttribute(typeAttrName);
      if (!typeAttrValue) continue;

      const { selector, modifiers } = parseTypeValue(typeAttrValue);
      const resolvedMods = resolveInlineModifiers(modifiers);

      // Self-targeting: if selector is empty, the element itself is the target.
      const targetSelector = selector || ensureSelector(el);

      assertions.push({
        assertionKey,
        elementSnapshot,
        mpa_mode: false,
        trigger: triggerName,
        timeout: Number(el.getAttribute(`${assertionPrefix.modifiers}timeout`)) || 0,
        startTime: Date.now(),
        type: type as AssertionType,
        typeValue: targetSelector,
        modifiers: resolvedMods,
        oob: true,
      });
    }
  }

  return assertions;
}

/**
 * JSON-spec counterpart to findOobByAttr. Asks the spec registry for entries
 * referencing any of the passed parent keys (O(passed-parents) lookup via
 * entriesByOobKey), then emits an assertion per matched element × declared
 * assertion type.
 */
function findOobBySpecEntries(
  attrName: "fs-assert-oob" | "fs-assert-oob-fail",
  triggerName: "oob" | "oob-fail",
  parentAssertions: CompletedAssertion[],
  specRegistry: SpecRegistry
): Assertion[] {
  if (parentAssertions.length === 0) return [];

  const parentKeys = new Set(parentAssertions.map((a) => a.assertionKey));
  const matchingEntries = specRegistry.findOobEntriesForParents(attrName, parentKeys);
  if (matchingEntries.length === 0) return [];

  const assertions: Assertion[] = [];
  for (const entry of matchingEntries) {
    const assertionKey = entry["fs-assert"];
    if (!assertionKey) continue;

    const targets = resolveTargetsForScan(entry, document.body);
    if (targets.length === 0) continue;

    // fsAttr() requires a literal `fs-${string}` template so TS can narrow
    // the lookup type. The runtime constants in `assertionPrefix` are typed
    // as `string` (broader than the template literal), so we inline the
    // "fs-assert-" prefix here. Cross-checked at compile time by the schema
    // drift test — if the prefix ever changes, that test fails first.
    const timeout = Number(entry[fsAttr(`fs-assert-timeout`)]) || 0;

    for (const target of targets) {
      // Snapshot once per target — every type-loop iteration would otherwise
      // re-serialize the same subtree (domAssertions has ~7 entries).
      const elementSnapshot = target.outerHTML;
      for (const type of domAssertions) {
        const typeAttrValue = entry[fsAttr(`fs-assert-${type}`)];
        if (!typeAttrValue) continue;

        const { selector, modifiers } = parseTypeValue(typeAttrValue);
        const resolvedMods = resolveInlineModifiers(modifiers);
        const targetSelector = selector || ensureSelector(target);

        assertions.push({
          assertionKey,
          elementSnapshot,
          mpa_mode: false,
          trigger: triggerName,
          timeout,
          startTime: Date.now(),
          type: type as AssertionType,
          typeValue: targetSelector,
          modifiers: resolvedMods,
          oob: true,
        });
      }
    }
  }

  return assertions;
}

/**
 * Find OOB assertions triggered by passed and/or failed parent assertions.
 * Walks BOTH the live DOM (for HTML-attribute-authored OOB elements) AND
 * the spec registry (for JSON-spec-authored OOB entries). Same downstream
 * pipeline either way.
 *
 * - fs-assert-oob="key1,key2" triggers when any listed parent passes
 * - fs-assert-oob-fail="key1,key2" triggers when any listed parent fails
 */
export function findAndCreateOobAssertions(
  passedAssertions: CompletedAssertion[],
  failedAssertions: CompletedAssertion[] = [],
  specRegistry?: SpecRegistry
): Assertion[] {
  const out: Assertion[] = [
    ...findOobByAttr(oobAttr, "oob", passedAssertions),
    ...findOobByAttr(oobFailAttr, "oob-fail", failedAssertions),
  ];
  if (specRegistry) {
    out.push(...findOobBySpecEntries("fs-assert-oob", "oob", passedAssertions, specRegistry));
    out.push(...findOobBySpecEntries("fs-assert-oob-fail", "oob-fail", failedAssertions, specRegistry));
  }
  return out;
}
