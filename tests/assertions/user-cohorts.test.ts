// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { init } from "../../src/index";
import type { ApiPayload } from "../../src/types";

describe("Faultsense Agent - User Cohorts", () => {
  let consoleErrorMock: ReturnType<typeof vi.spyOn>;
  let cleanupFn: ReturnType<typeof init>;
  let fixedDateNow = 1230000000000;
  let collectedPayloads: ApiPayload[];

  beforeEach(() => {
    if (typeof HTMLElement === "undefined") {
      (global as any).HTMLElement = class { };
    }

    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockImplementation(() => fixedDateNow);
    consoleErrorMock = vi.spyOn(console, "error").mockImplementation(() => { });
    collectedPayloads = [];

    vi.mock("../../src/utils/elements", async () => ({ ...await vi.importActual("../../src/utils/elements") as any,
      isVisible: vi.fn().mockImplementation((element: HTMLElement) => {
        return (
          element.style.display !== "none" &&
          element.style.visibility !== "hidden"
        );
      }),
    }));
  });

  afterEach(() => {
    cleanupFn?.();
    vi.clearAllTimers();
    vi.useRealTimers();
    consoleErrorMock.mockRestore();
    vi.spyOn(Date, "now").mockRestore();
  });

  function makeConfig(overrides: Record<string, any> = {}) {
    return {
      apiKey: "TEST",
      releaseLabel: "0.0.0",
      gcInterval: 30000,
      unloadGracePeriod: 2000,
      collectorURL: (payload: ApiPayload) => { collectedPayloads.push(payload); },
      ...overrides,
    };
  }

  it("includes userCohorts in assertion payload when set at init", async () => {
    document.body.innerHTML = `
      <div id="el" fs-trigger="click" fs-assert="test/cohorts" fs-assert-visible="#el">Test</div>
    `;

    cleanupFn = init(makeConfig({ userCohorts: { plan: "pro", region: "us-east" } }));

    document.getElementById("el")!.click();

    await vi.waitFor(() => {
      expect(collectedPayloads.length).toBeGreaterThan(0);
      expect(collectedPayloads[0].user_cohorts).toEqual({ plan: "pro", region: "us-east" });
    });
  });

  it("omits user_cohorts when not set", async () => {
    document.body.innerHTML = `
      <div id="el" fs-trigger="click" fs-assert="test/no-cohorts" fs-assert-visible="#el">Test</div>
    `;

    cleanupFn = init(makeConfig());

    document.getElementById("el")!.click();

    await vi.waitFor(() => {
      expect(collectedPayloads.length).toBeGreaterThan(0);
      expect(collectedPayloads[0].user_cohorts).toBeUndefined();
    });
  });

  it("setUserCohorts updates cohorts for subsequent assertions", async () => {
    document.body.innerHTML = `
      <button id="btn1" fs-trigger="click" fs-assert="test/cohort-update-1" fs-assert-visible="#btn1">Test 1</button>
      <button id="btn2" fs-trigger="click" fs-assert="test/cohort-update-2" fs-assert-visible="#btn2">Test 2</button>
    `;

    cleanupFn = init(makeConfig());

    // First click — no cohorts
    document.getElementById("btn1")!.click();
    await vi.waitFor(() => expect(collectedPayloads.length).toBe(1));
    expect(collectedPayloads[0].user_cohorts).toBeUndefined();

    // Set user cohorts
    window.Faultsense!.setUserCohorts!({ plan: "enterprise" });

    // Second click (different assertion) — has cohorts
    document.getElementById("btn2")!.click();
    await vi.waitFor(() => expect(collectedPayloads.length).toBe(2));
    expect(collectedPayloads[1].user_cohorts).toEqual({ plan: "enterprise" });
  });

  it("setUserCohorts replaces cohorts (does not merge)", async () => {
    document.body.innerHTML = `
      <button id="btn" fs-trigger="click" fs-assert="test/cohort-replace" fs-assert-visible="#btn">Test</button>
    `;

    cleanupFn = init(makeConfig({ userCohorts: { plan: "pro", region: "us-east" } }));

    window.Faultsense!.setUserCohorts!({ plan: "free" });

    document.getElementById("btn")!.click();
    await vi.waitFor(() => {
      expect(collectedPayloads.length).toBeGreaterThan(0);
      expect(collectedPayloads[0].user_cohorts).toEqual({ plan: "free" });
    });
  });

  it("includes both userContext and userCohorts when both are set", async () => {
    document.body.innerHTML = `
      <div id="el" fs-trigger="click" fs-assert="test/both" fs-assert-visible="#el">Test</div>
    `;

    cleanupFn = init(makeConfig({
      userContext: { userId: "u_123" },
      userCohorts: { plan: "pro" },
    }));

    document.getElementById("el")!.click();

    await vi.waitFor(() => {
      expect(collectedPayloads.length).toBeGreaterThan(0);
      expect(collectedPayloads[0].user_context).toEqual({ userId: "u_123" });
      expect(collectedPayloads[0].user_cohorts).toEqual({ plan: "pro" });
    });
  });
});
