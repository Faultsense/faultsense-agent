// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inlineModifiers, supportedTriggers } from "../src/config";
import { allAssertionTypes } from "../src/types";
import { CUSTOM_EVENT_PREFIX } from "../src/utils/triggers/custom-events";

/**
 * Docs-drift check.
 *
 * Treats `docs/public/agent/{triggers,assertions,modifiers}/*.md` as the
 * canonical registry of the fs-* authoring surface and asserts bijection
 * with the agent's runtime constants:
 *
 *   - `supportedTriggers` (with internal DOM event aliases filtered out)
 *     plus `CUSTOM_EVENT_PREFIX` (the pure-prefix `event:<name>` trigger)
 *   - `allAssertionTypes`
 *   - `inlineModifiers`
 *
 * If the agent ships a new trigger / assertion type / modifier without a
 * matching doc file, this test fails at the PR that introduces it — there
 * is no "later" where docs can catch up.
 *
 * The test is monorepo-only. When this file is projected to the public
 * agent repo, `docs/public/agent/` doesn't exist (the public repo is
 * code-only), so the suite skips cleanly instead of failing.
 */

const DOCS_ROOT = join(__dirname, "..", "..", "..", "docs", "public", "agent");
const DOCS_AVAILABLE = existsSync(DOCS_ROOT);

/**
 * Internal DOM event names that `supportedTriggers` listens for but that
 * users do NOT type as `fs-trigger` values — users type the aliases
 * (`hover`, `focus`) from `triggerEventMap` in config.ts. Filter these out
 * before comparing against the user-facing doc surface.
 */
const INTERNAL_DOM_EVENT_ALIASES = new Set(["mouseenter", "focusin"]);

/**
 * Docs at `docs/public/agent/assertions/` that cover authoring FEATURES
 * (conditional suffixes, mutex groupings, OOB routing, MPA persistence,
 * the timeout attribute, self-referencing selectors) rather than assertion
 * TYPES that appear in `allAssertionTypes`. These have their own doc pages
 * but don't correspond to a runtime type name — maintain the list here so
 * the bijection check ignores them.
 */
const ASSERTION_FEATURE_DOCS = new Set([
  "conditional",
  "mpa",
  "mutex",
  "oob",
  "self-referencing",
  "timeout",
]);

/**
 * `docs/public/agent/modifiers/attribute-check.md` documents the fallback
 * path for unreserved bracket keys (any key not in `inlineModifiers` is
 * treated as a regex attribute check). It's not a runtime modifier name.
 */
const MODIFIER_FEATURE_DOCS = new Set(["attribute-check"]);

interface DocFrontmatter {
  name: string;
  aliases: string[];
}

function stripQuotes(value: string): string {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * Minimal YAML front-matter parser. Extracts the `name` and optional
 * `aliases: [a, b, c]` fields from each doc file. Purpose-built to avoid
 * pulling in a YAML dependency for this single test. Normalizes CRLF to LF
 * so Windows-checkout doc files don't throw on the opening `---` sentinel.
 */
function parseFrontmatter(raw: string, filePath: string): DocFrontmatter {
  const content = raw.replace(/\r\n/g, "\n");
  if (!content.startsWith("---\n")) {
    throw new Error(`${filePath}: no YAML frontmatter`);
  }
  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    throw new Error(`${filePath}: unterminated YAML frontmatter`);
  }
  const yaml = content.slice(4, end);

  let name: string | undefined;
  const aliases: string[] = [];

  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "name") {
      name = stripQuotes(value);
    } else if (key === "aliases" && value.startsWith("[") && value.endsWith("]")) {
      for (const entry of value.slice(1, -1).split(",")) {
        const trimmed = stripQuotes(entry.trim());
        if (trimmed) aliases.push(trimmed);
      }
    }
  }

  if (!name) {
    throw new Error(`${filePath}: frontmatter missing 'name' field`);
  }
  return { name, aliases };
}

interface CollectedDocs {
  /** Primary `name` field of each doc. Used for orphan checks — one file = one primary name. */
  primary: Set<string>;
  /** Primary name PLUS every alias. Used for coverage checks — "is this runtime entry documented anywhere?" */
  all: Set<string>;
}

/**
 * Collect `name` + `aliases[]` entries from the `.md` files in the given
 * subdirectory.
 *
 * Aliases serve two purposes in the frontmatter:
 *
 *   1. Group multiple runtime names under one doc page (count.md lists
 *      `aliases: [count-min, count-max]` because all three are runtime
 *      modifiers sharing the same explanation).
 *
 *   2. Document the INTERNAL name a user might see but should NOT type
 *      (hover.md lists `aliases: [mouseenter]` to say "the DOM event is
 *      called mouseenter, but you write `hover`").
 *
 * Both purposes want the alias counted as "covered" for the missing check,
 * but only case (1) aliases are legitimate runtime names. We don't try to
 * distinguish here — the orphan check uses `primary` (one per file) and
 * the missing check uses `all` (primary + aliases). That leaves case (2)
 * aliases in `all` but not in `primary`, which is correct for both checks.
 */
function collectDocs(subdir: string): CollectedDocs {
  const dir = join(DOCS_ROOT, subdir);
  const primary = new Set<string>();
  const all = new Set<string>();
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".md")) continue;
    const filePath = join(dir, entry);
    const { name, aliases } = parseFrontmatter(readFileSync(filePath, "utf8"), filePath);
    primary.add(name);
    all.add(name);
    for (const alias of aliases) all.add(alias);
  }
  return { primary, all };
}

/** Pretty-print a set as a sorted comma list for diff-friendly test output. */
function sortedList(set: Iterable<string>): string {
  return [...set].sort().join(", ");
}

// CUSTOM_EVENT_PREFIX is "event:" — the doc file lives at triggers/event.md
// (no colon). If the prefix ever moves to a different shape, update the
// derivation below; the assertion here catches a silent regression.
if (!CUSTOM_EVENT_PREFIX.endsWith(":")) {
  throw new Error(
    `docs-drift assumes CUSTOM_EVENT_PREFIX ends with ":", got ${JSON.stringify(CUSTOM_EVENT_PREFIX)}`,
  );
}
const CUSTOM_EVENT_DOC_NAME = CUSTOM_EVENT_PREFIX.slice(0, -1);

describe.skipIf(!DOCS_AVAILABLE)("docs drift — docs/public/agent/ vs agent runtime", () => {
  // `describe.skipIf` only suppresses `it` registration — the describe body
  // still runs at suite load. Any filesystem reads MUST stay inside `it`
  // blocks so they're skipped with the rest of the suite when docs are
  // absent (e.g., the public-repo projection).

  describe("triggers", () => {
    // User-facing trigger surface: supportedTriggers minus raw DOM event aliases,
    // plus the `event` prefix trigger (which never appears bare in supportedTriggers
    // because it always requires a `:<name>` suffix).
    const runtimeTriggers = new Set<string>([
      ...supportedTriggers.filter((t) => !INTERNAL_DOM_EVENT_ALIASES.has(t)),
      CUSTOM_EVENT_DOC_NAME,
    ]);

    it("every runtime trigger has a doc or is covered by aliases", () => {
      const { all } = collectDocs("triggers");
      const missing = [...runtimeTriggers].filter((t) => !all.has(t));
      expect(
        missing,
        `triggers missing from ${DOCS_ROOT}/triggers/ — add a .md file or list as an alias`,
      ).toEqual([]);
    });

    it("every trigger doc's primary name matches a runtime trigger", () => {
      const { primary } = collectDocs("triggers");
      const orphaned = [...primary].filter((t) => !runtimeTriggers.has(t));
      expect(
        orphaned,
        `trigger docs whose primary name is not a user-facing runtime trigger — rename, delete, or move the name into an alias (current runtime: ${sortedList(runtimeTriggers)})`,
      ).toEqual([]);
    });

    it("every trigger alias points at a runtime name or an internal DOM event", () => {
      const { primary, all } = collectDocs("triggers");
      const aliasesOnly = [...all].filter((t) => !primary.has(t));
      const unknown = aliasesOnly.filter(
        (t) => !runtimeTriggers.has(t) && !INTERNAL_DOM_EVENT_ALIASES.has(t),
      );
      expect(
        unknown,
        `trigger aliases that aren't runtime triggers and aren't in INTERNAL_DOM_EVENT_ALIASES — the alias may be stale or the runtime name was removed`,
      ).toEqual([]);
    });
  });

  describe("assertion types", () => {
    const runtimeAssertionTypes = new Set<string>(allAssertionTypes);

    it("every runtime assertion type has a doc", () => {
      const { all } = collectDocs("assertions");
      const missing = [...runtimeAssertionTypes].filter((t) => !all.has(t));
      expect(
        missing,
        `assertion types missing from ${DOCS_ROOT}/assertions/`,
      ).toEqual([]);
    });

    it("every assertion doc's primary name is a runtime type or a feature page", () => {
      const { primary } = collectDocs("assertions");
      const orphaned = [...primary].filter(
        (n) => !runtimeAssertionTypes.has(n) && !ASSERTION_FEATURE_DOCS.has(n),
      );
      expect(
        orphaned,
        `assertion docs not in runtime and not in ASSERTION_FEATURE_DOCS — rename, delete, or add to the feature list`,
      ).toEqual([]);
    });

    it("every assertion alias points at a runtime type or a feature page", () => {
      const { primary, all } = collectDocs("assertions");
      const aliasesOnly = [...all].filter((n) => !primary.has(n));
      const unknown = aliasesOnly.filter(
        (n) => !runtimeAssertionTypes.has(n) && !ASSERTION_FEATURE_DOCS.has(n),
      );
      expect(
        unknown,
        `assertion aliases that aren't runtime types and aren't feature pages — the alias may be stale or the runtime name was removed`,
      ).toEqual([]);
    });
  });

  describe("modifiers", () => {
    const runtimeModifiers = new Set<string>(inlineModifiers);

    it("every runtime modifier has a doc or is covered by aliases", () => {
      const { all } = collectDocs("modifiers");
      const missing = [...runtimeModifiers].filter((m) => !all.has(m));
      expect(
        missing,
        `modifiers missing from ${DOCS_ROOT}/modifiers/`,
      ).toEqual([]);
    });

    it("every modifier doc's primary name is a runtime modifier or a feature page", () => {
      const { primary } = collectDocs("modifiers");
      const orphaned = [...primary].filter(
        (m) => !runtimeModifiers.has(m) && !MODIFIER_FEATURE_DOCS.has(m),
      );
      expect(
        orphaned,
        `modifier docs not in runtime and not in MODIFIER_FEATURE_DOCS — rename, delete, or add to the feature list`,
      ).toEqual([]);
    });

    it("every modifier alias points at a runtime modifier or a feature page", () => {
      const { primary, all } = collectDocs("modifiers");
      const aliasesOnly = [...all].filter((m) => !primary.has(m));
      const unknown = aliasesOnly.filter(
        (m) => !runtimeModifiers.has(m) && !MODIFIER_FEATURE_DOCS.has(m),
      );
      expect(
        unknown,
        `modifier aliases that aren't runtime modifiers and aren't feature pages — the alias may be stale or the runtime name was removed`,
      ).toEqual([]);
    });
  });
});
