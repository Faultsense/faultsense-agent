// @vitest-environment node

/**
 * Pure-import smoke tests for the collector default entries.
 *
 * The @faultsense/panel-collector and @faultsense/console-collector
 * npm packages expose src/collectors/{panel,console}.ts as their pure
 * default entries. Importing either one must NOT touch `window`,
 * `document`, or any other DOM global at module load — consumers who
 * import the collector in a Node / SSR context (smoke tests, server
 * bundles that reference the collector for its types, etc.) should be
 * able to do so without crashing.
 *
 * Each collector's side-effecting self-register lives in a sibling
 * `-auto.ts` file and is deliberately NOT imported here. This test
 * locks in the purity contract: any regression that adds top-level
 * window access to the default entry will fail this test under the
 * node environment.
 *
 * See tests/purity.test.ts for the equivalent agent-side smoke test
 * and docs/internal/plans/2026-04-15-003-feat-agent-distribution-cdn-npm-plan.md
 * for the full distribution-plan context.
 */

import { describe, it, expect } from "vitest";

describe("collector default entries — pure import smoke tests", () => {
  it("src/collectors/panel imports without touching window or document", async () => {
    const mod = await import("../../src/collectors/panel");
    expect(typeof mod.panelCollector).toBe("function");
    // panelCollector takes exactly one argument (an ApiPayload).
    expect(mod.panelCollector.length).toBe(1);
    // cleanupPanel is exposed for the IIFE auto-register path to wire
    // into the agent's registerCleanupHook lifecycle; it should be a
    // callable function even before the panel has been created.
    expect(typeof mod.cleanupPanel).toBe("function");
  });

  it("src/collectors/console imports without touching window or document", async () => {
    const mod = await import("../../src/collectors/console");
    expect(typeof mod.consoleCollector).toBe("function");
    expect(mod.consoleCollector.length).toBe(1);
  });
});
