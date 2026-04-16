// @vitest-environment node

/**
 * Pure-import smoke test for the default entry.
 *
 * The @faultsense/agent npm package exposes src/index.ts as its pure
 * default entry: importing it must NOT touch `window`, `document`, or
 * any DOM API at module load. This test runs under the `node` vitest
 * environment — there is no jsdom — so any top-level side effect that
 * accesses a browser global will throw a ReferenceError on import.
 *
 * The sibling src/auto.ts (re-exposed at `@faultsense/agent/auto`) is
 * the side-effecting self-install entry. It IS expected to touch
 * `window` and `document` at module load, so it is deliberately not
 * imported here. Any regression that re-introduces auto-install side
 * effects into src/index.ts — directly or through a newly added
 * import — will fail this test.
 *
 * See docs/internal/plans/2026-04-15-003-feat-agent-distribution-cdn-npm-plan.md
 * for the full rationale on why the split exists.
 */

import { describe, it, expect } from "vitest";

describe("src/index.ts — pure import smoke test", () => {
  it("imports without touching window or document at module load", async () => {
    // If importing this module crashes on a missing browser global, the
    // await itself throws before we get to any assertion. The test body
    // is thus effectively "did the import resolve without throwing."
    const mod = await import("../src/index");

    expect(typeof mod.init).toBe("function");
    expect(typeof mod.registerCleanupHook).toBe("function");
    expect(typeof mod.version).toBe("string");
    expect(mod.version.length).toBeGreaterThan(0);
  });

  it("does NOT call init() at module load", async () => {
    // If init() were invoked at import time, the `document.addEventListener`
    // and `new MutationObserver(...)` calls inside it would throw here in
    // the Node environment — the import above would have failed. Reaching
    // this test at all proves init() was not auto-invoked.
    const mod = await import("../src/index");
    expect(mod.init.length).toBe(1); // takes exactly one argument
  });
});
