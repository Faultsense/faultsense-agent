// @vitest-environment jsdom
/**
 * JSON-mode smoke coverage for assertion types and modifiers not exercised
 * in tests/spec/dual-mode-canonical.test.ts. Each test is intentionally
 * minimal — one canonical pass-or-fail scenario per feature, JSON-only.
 *
 * Rationale: the existing HTML test files under tests/assertions/ lock in
 * HTML semantics. What we're insuring against here is JSON-path divergence
 * for the long tail (less-common types, modifiers, and the localStorage
 * round-trip in MPA mode). One smoke per feature is enough because the
 * pipeline below extractMetadata is source-agnostic — any per-type quirk
 * surfaces identically across sources.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";
import type { SpecEntry } from "../../src/types";

let ctx: ReturnType<typeof setupAgent>;
afterEach(() => ctx?.cleanup());

function initJson(spec: SpecEntry[], html: string) {
  ctx = setupAgent({ deferInit: true, config: { spec } });
  document.body.innerHTML = html;
  expect(document.querySelectorAll("[fs-trigger],[fs-assert]")).toHaveLength(0);
  ctx.init();
}

const expectPassed = async (assertionKey: string) =>
  vi.waitFor(() => {
    const matching = ctx.allPayloads().filter((p: any) => p.assertionKey === assertionKey);
    expect(matching.some((p: any) => p.status === "passed")).toBe(true);
  });

const expectFailed = async (assertionKey: string) =>
  vi.waitFor(() => {
    const matching = ctx.allPayloads().filter((p: any) => p.assertionKey === assertionKey);
    expect(matching.some((p: any) => p.status === "failed")).toBe(true);
  });

describe("fs-assert-loaded (JSON)", () => {
  it("passes when an image fires its load event", async () => {
    initJson(
      [{ "fs-target": "#hero", "fs-trigger": "mount", "fs-assert": "img-load", "fs-assert-loaded": "#hero" }],
      `<img id="hero" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" />`
    );
    const img = document.getElementById("hero") as HTMLImageElement;
    img.dispatchEvent(new Event("load"));
    await expectPassed("img-load");
  });
});

describe("fs-assert-stable (JSON)", () => {
  it("passes when target is NOT mutated within timeout (inverted)", async () => {
    initJson(
      [{
        "fs-target": "#root",
        "fs-trigger": "mount",
        "fs-assert": "no-mutate",
        "fs-assert-stable": "#panel",
        "fs-assert-timeout": "500",
      }],
      `<div id="root"><div id="panel">stable</div></div>`
    );
    // Don't mutate anything; let the timeout fire.
    ctx.advanceTime(600);
    await expectPassed("no-mutate");
  });
});

describe("fs-assert-emitted (JSON)", () => {
  it("passes when a matching CustomEvent fires", async () => {
    initJson(
      [{
        "fs-target": "#watch",
        "fs-trigger": "mount",
        "fs-assert": "checkout-complete",
        "fs-assert-emitted": "payment:complete",
      }],
      `<div id="watch"></div>`
    );
    document.dispatchEvent(new CustomEvent("payment:complete"));
    await expectPassed("checkout-complete");
  });
});

describe("fs-assert-after (sequence, JSON)", () => {
  it("passes when parent assertion has already passed", async () => {
    initJson(
      [
        {
          "fs-target": "#btn",
          "fs-trigger": "click",
          "fs-assert": "parent-step",
          "fs-assert-added": "#child",
        },
        {
          "fs-target": "#after-watch",
          "fs-trigger": "mount",
          "fs-assert": "after-step",
          "fs-assert-after": "parent-step",
        },
      ],
      `<button id="btn">x</button><div id="after-watch"></div>`
    );
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      const c = document.createElement("div");
      c.id = "child";
      document.body.appendChild(c);
    });
    btn.click();
    await expectPassed("parent-step");
    await expectPassed("after-step");
  });
});

describe("fs-assert-mpa (page persist, JSON)", () => {
  it("round-trips through localStorage across an init cycle", async () => {
    // First init: register the spec and click the button.
    initJson(
      [{
        "fs-target": "#btn",
        "fs-trigger": "click",
        "fs-assert": "mpa-json",
        "fs-assert-added": "#panel",
        "fs-assert-mpa": "true",
      }],
      `<button id="btn">x</button>`
    );
    (document.getElementById("btn") as HTMLButtonElement).click();

    // Simulate page navigation
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    window.dispatchEvent(new Event("beforeunload"));

    // Confirm storage was written
    await vi.waitFor(() => expect(localStorage.getItem("faultsense-active-assertions")).not.toBeNull());

    // New page: tear down, mount the panel, re-init with the same spec.
    ctx.cleanup();
    document.body.innerHTML = `<div id="panel">on next page</div>`;
    ctx = setupAgent({
      deferInit: true,
      config: {
        spec: [{
          "fs-target": "#btn",
          "fs-trigger": "click",
          "fs-assert": "mpa-json",
          "fs-assert-added": "#panel",
          "fs-assert-mpa": "true",
        }],
      },
    });
    ctx.init();

    await expectPassed("mpa-json");
    localStorage.clear();
  });
});

describe("fs-assert-timeout (SLA, JSON)", () => {
  it("fails when target doesn't appear within the timeout window", async () => {
    initJson(
      [{
        "fs-target": "#btn",
        "fs-trigger": "click",
        "fs-assert": "sla",
        "fs-assert-added": "#never-appears",
        "fs-assert-timeout": "1000",
      }],
      `<button id="btn">x</button>`
    );
    (document.getElementById("btn") as HTMLButtonElement).click();
    ctx.advanceTime(1100);
    await expectFailed("sla");
  });
});

describe("fs-assert-mutex (conditional, JSON)", () => {
  it("passes the success branch and never emits the error sibling (dismissed is internal-only)", async () => {
    initJson(
      [{
        "fs-target": "#btn",
        "fs-trigger": "click",
        "fs-assert": "mutex-branch",
        "fs-assert-added-success": "#good",
        "fs-assert-added-error": "#bad",
        "fs-assert-mutex": "each",
      }],
      `<button id="btn">x</button>`
    );
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      const s = document.createElement("div");
      s.id = "good";
      document.body.appendChild(s);
    });
    btn.click();

    await expectPassed("mutex-branch");

    // Verify mutex dismissed the error branch — it should never be sent as
    // passed or failed (dismissed is internal state, not surfaced in payloads).
    const payloads = ctx.allPayloads().filter((p: any) => p.assertionKey === "mutex-branch");
    const errorEmitted = payloads.find(
      (p: any) => p.conditionKey === "error" && (p.status === "passed" || p.status === "failed")
    );
    expect(errorEmitted).toBeUndefined();
  });
});

describe("fs-assert-oob-fail (JSON)", () => {
  it("fires the OOB-fail child when the parent assertion fails", async () => {
    initJson(
      [
        {
          "fs-target": "#btn",
          "fs-trigger": "click",
          "fs-assert": "fail-parent",
          "fs-assert-added": "#never",
          "fs-assert-timeout": "500",
        },
        {
          "fs-target": "#oob-target",
          "fs-trigger": "mount",
          "fs-assert": "oob-on-fail",
          "fs-assert-oob-fail": "fail-parent",
          "fs-assert-visible": "#oob-target",
        },
      ],
      `<button id="btn">x</button><div id="oob-target"></div>`
    );
    (document.getElementById("btn") as HTMLButtonElement).click();
    ctx.advanceTime(600);
    await expectFailed("fail-parent");
    await expectPassed("oob-on-fail");
  });
});

// ── Modifier smokes ──────────────────────────────────────────────────────────

describe("classlist modifier (JSON)", () => {
  it("passes when target gains the expected class after a click", async () => {
    initJson(
      [{
        "fs-target": "#btn",
        "fs-trigger": "click",
        "fs-assert": "classlist-mod",
        "fs-assert-updated": "#card[classlist=active:true]",
      }],
      `<button id="btn">x</button><div id="card">x</div>`
    );
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      document.getElementById("card")!.classList.add("active");
    });
    btn.click();
    await expectPassed("classlist-mod");
  });
});

describe("attrs-match modifier (JSON)", () => {
  it("passes when target's attribute matches after a click", async () => {
    initJson(
      [{
        "fs-target": "#btn",
        "fs-trigger": "click",
        "fs-assert": "attrs-mod",
        "fs-assert-updated": "#input[type=password]",
      }],
      `<button id="btn">x</button><input id="input" type="text" />`
    );
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      (document.getElementById("input") as HTMLInputElement).type = "password";
    });
    btn.click();
    await expectPassed("attrs-mod");
  });
});

describe("value-matches modifier (JSON)", () => {
  it("passes when input value matches the regex after a click", async () => {
    initJson(
      [{
        "fs-target": "#btn",
        "fs-trigger": "click",
        "fs-assert": "value-mod",
        "fs-assert-updated": "#field[value-matches=^abc]",
      }],
      `<button id="btn">x</button><input id="field" value="" />`
    );
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      const f = document.getElementById("field") as HTMLInputElement;
      f.value = "abc-123";
      // Programmatic .value assignment doesn't trigger a DOM mutation in jsdom;
      // the legacy value-matches test sets an attribute to force the observer.
      f.setAttribute("data-changed", "true");
    });
    btn.click();
    await expectPassed("value-mod");
  });
});

describe("disabled modifier (JSON)", () => {
  it("passes when target becomes disabled after a click", async () => {
    initJson(
      [{
        "fs-target": "#btn",
        "fs-trigger": "click",
        "fs-assert": "disabled-mod",
        "fs-assert-updated": "#submit[disabled=true]",
      }],
      `<button id="btn">x</button><button id="submit">submit</button>`
    );
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      (document.getElementById("submit") as HTMLButtonElement).disabled = true;
    });
    btn.click();
    await expectPassed("disabled-mod");
  });
});
