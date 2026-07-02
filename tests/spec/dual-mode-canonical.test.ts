// @vitest-environment jsdom
/**
 * Side-by-side dual-coverage of the canonical fs-* surface.
 *
 * Convention (also documented in packages/agent/CLAUDE.md): every
 * fs-*-related test scenario gets two `it()` blocks within the same
 * describe — one `html:` (decorate the DOM with attributes), one `json:`
 * (bare DOM + spec config). The `json:` test always begins with the
 * leak guardrail one-liner so a stale fs-* attribute can't silently
 * activate the HTML path.
 *
 * Coverage targets one canonical scenario per assertion type, trigger,
 * key modifier, conditional dynamic type, and OOB chain. The HTML-only
 * test suites under tests/assertions/ remain the deep coverage for HTML
 * semantics; this file proves that for every load-bearing fs-* feature,
 * the JSON path produces the same assertion shape.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { setupAgent } from "../helpers/assertions";

let ctx: ReturnType<typeof setupAgent>;
afterEach(() => ctx?.cleanup());

/** Boot the agent with a JSON spec on a bare DOM. Asserts no fs-* leak. */
function initJson(spec: any, html: string) {
  ctx = setupAgent({ deferInit: true, config: { spec } });
  document.body.innerHTML = html;
  expect(document.querySelectorAll("[fs-trigger],[fs-assert]")).toHaveLength(0);
  ctx.init();
}

/** Boot the agent in HTML-attribute mode. */
function initHtml(html: string) {
  ctx = setupAgent({ deferInit: true });
  document.body.innerHTML = html;
  ctx.init();
}

const expectPassed = async (assertionKey: string) =>
  vi.waitFor(() => {
    const keys = ctx.allPayloads().map((p: any) => p.assertionKey);
    expect(keys).toContain(assertionKey);
    const matching = ctx.allPayloads().filter((p: any) => p.assertionKey === assertionKey);
    expect(matching.some((p: any) => p.status === "passed")).toBe(true);
  });

// ── DOM type assertions ──────────────────────────────────────────────────────

describe("fs-assert-removed", () => {
  const wire = () => {
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => document.getElementById("panel")?.remove());
    btn.click();
  };

  it("html: passes when target element is removed on click", async () => {
    initHtml(`
      <button id="btn" fs-trigger="click" fs-assert-removed="#panel" fs-assert="rm">x</button>
      <div id="panel"></div>
    `);
    wire();
    await expectPassed("rm");
  });

  it("json: passes when target element is removed on click", async () => {
    initJson(
      [{ "fs-target": "#btn", "fs-trigger": "click", "fs-assert": "rm", "fs-assert-removed": "#panel" }],
      `<button id="btn">x</button><div id="panel"></div>`
    );
    wire();
    await expectPassed("rm");
  });
});

describe("fs-assert-updated", () => {
  const wire = () => {
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      (document.getElementById("counter") as HTMLElement).textContent = "42";
    });
    btn.click();
  };

  it("html: passes when target's subtree mutates", async () => {
    initHtml(`
      <button id="btn" fs-trigger="click" fs-assert-updated="#counter" fs-assert="upd">x</button>
      <div id="counter">0</div>
    `);
    wire();
    await expectPassed("upd");
  });

  it("json: passes when target's subtree mutates", async () => {
    initJson(
      [{ "fs-target": "#btn", "fs-trigger": "click", "fs-assert": "upd", "fs-assert-updated": "#counter" }],
      `<button id="btn">x</button><div id="counter">0</div>`
    );
    wire();
    await expectPassed("upd");
  });
});

describe("fs-assert-visible", () => {
  it("html: passes when target is visible on click", async () => {
    initHtml(`
      <button id="btn" fs-trigger="click" fs-assert-visible=".vis" fs-assert="vis">x</button>
      <div class="vis">hi</div>
    `);
    (document.getElementById("btn") as HTMLButtonElement).click();
    await expectPassed("vis");
  });

  it("json: passes when target is visible on click", async () => {
    initJson(
      [{ "fs-target": "#btn", "fs-trigger": "click", "fs-assert": "vis", "fs-assert-visible": ".vis" }],
      `<button id="btn">x</button><div class="vis">hi</div>`
    );
    (document.getElementById("btn") as HTMLButtonElement).click();
    await expectPassed("vis");
  });
});

describe("fs-assert-hidden", () => {
  it("html: passes when target is hidden on click", async () => {
    initHtml(`
      <button id="btn" fs-trigger="click" fs-assert-hidden=".gone" fs-assert="hid">x</button>
      <div class="gone" style="display:none">x</div>
    `);
    (document.getElementById("btn") as HTMLButtonElement).click();
    await expectPassed("hid");
  });

  it("json: passes when target is hidden on click", async () => {
    initJson(
      [{ "fs-target": "#btn", "fs-trigger": "click", "fs-assert": "hid", "fs-assert-hidden": ".gone" }],
      `<button id="btn">x</button><div class="gone" style="display:none">x</div>`
    );
    (document.getElementById("btn") as HTMLButtonElement).click();
    await expectPassed("hid");
  });
});

// ── Mount + invariant triggers ───────────────────────────────────────────────

describe("mount trigger", () => {
  it("html: fires on pre-existing element at init", async () => {
    initHtml(`<div id="root" fs-trigger="mount" fs-assert-visible="#root" fs-assert="m"></div>`);
    await expectPassed("m");
  });

  it("json: fires on pre-existing element at init", async () => {
    initJson(
      [{ "fs-target": "#root", "fs-trigger": "mount", "fs-assert": "m", "fs-assert-visible": "#root" }],
      `<div id="root"></div>`
    );
    await expectPassed("m");
  });
});

describe("invariant trigger", () => {
  it("html: passes on page unload when never violated", async () => {
    initHtml(`<div id="watch" fs-trigger="invariant" fs-assert-visible="#watch" fs-assert="inv"></div>`);
    // Simulate page hide: visibility hidden + pagehide event
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    window.dispatchEvent(new Event("pagehide"));
    await expectPassed("inv");
  });

  it("json: passes on page unload when never violated", async () => {
    initJson(
      [{ "fs-target": "#watch", "fs-trigger": "invariant", "fs-assert": "inv", "fs-assert-visible": "#watch" }],
      `<div id="watch"></div>`
    );
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    window.dispatchEvent(new Event("pagehide"));
    await expectPassed("inv");
  });
});

// ── Custom event trigger (event:foo) ─────────────────────────────────────────

describe("event: custom event trigger with detail-matches", () => {
  it("html: matches only when event detail matches", async () => {
    initHtml(`
      <div id="watch" fs-trigger="event:cart-updated[detail-matches=type:add]"
        fs-assert-added="#confirm" fs-assert="cart-add"></div>
    `);
    // Fire matching event, then create the confirmation element.
    document.dispatchEvent(new CustomEvent("cart-updated", { detail: { type: "add" } }));
    const c = document.createElement("div");
    c.id = "confirm";
    document.body.appendChild(c);
    await expectPassed("cart-add");
  });

  it("json: matches only when event detail matches", async () => {
    initJson(
      [
        {
          "fs-target": "#watch",
          "fs-trigger": "event:cart-updated[detail-matches=type:add]",
          "fs-assert": "cart-add",
          "fs-assert-added": "#confirm",
        },
      ],
      `<div id="watch"></div>`
    );
    document.dispatchEvent(new CustomEvent("cart-updated", { detail: { type: "add" } }));
    const c = document.createElement("div");
    c.id = "confirm";
    document.body.appendChild(c);
    await expectPassed("cart-add");
  });
});

// ── Modifiers ────────────────────────────────────────────────────────────────

describe("text-matches modifier", () => {
  const wire = () => {
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      (document.getElementById("counter") as HTMLElement).textContent = "42";
    });
    btn.click();
  };

  it("html: passes when text matches the regex after update", async () => {
    initHtml(`
      <button id="btn" fs-trigger="click"
        fs-assert-updated="#counter[text-matches=\\d+]" fs-assert="tm">x</button>
      <div id="counter">no digits</div>
    `);
    wire();
    await expectPassed("tm");
  });

  it("json: passes when text matches the regex after update", async () => {
    initJson(
      [
        {
          "fs-target": "#btn",
          "fs-trigger": "click",
          "fs-assert": "tm",
          "fs-assert-updated": "#counter[text-matches=\\d+]",
        },
      ],
      `<button id="btn">x</button><div id="counter">no digits</div>`
    );
    wire();
    await expectPassed("tm");
  });
});

describe("count modifier", () => {
  const wire = () => {
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      for (let i = 0; i < 3; i++) {
        const li = document.createElement("li");
        li.className = "row";
        (document.getElementById("list") as HTMLElement).appendChild(li);
      }
    });
    btn.click();
  };

  it("html: passes when count-min is satisfied after click", async () => {
    initHtml(`
      <button id="btn" fs-trigger="click" fs-assert-added=".row[count-min=3]" fs-assert="cnt">x</button>
      <ul id="list"></ul>
    `);
    wire();
    await expectPassed("cnt");
  });

  it("json: passes when count-min is satisfied after click", async () => {
    initJson(
      [
        {
          "fs-target": "#btn",
          "fs-trigger": "click",
          "fs-assert": "cnt",
          "fs-assert-added": ".row[count-min=3]",
        },
      ],
      `<button id="btn">x</button><ul id="list"></ul>`
    );
    wire();
    await expectPassed("cnt");
  });
});

// ── Conditional dynamic types (fs-assert-{type}-{conditionKey}) ──────────────

describe("conditional dynamic types", () => {
  const wire = () => {
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      const s = document.createElement("div");
      s.id = "success-msg";
      document.body.appendChild(s);
    });
    btn.click();
  };

  it("html: success branch passes when success element appears", async () => {
    initHtml(`
      <button id="btn" fs-trigger="click"
        fs-assert-added-success="#success-msg"
        fs-assert-added-error="#error-msg"
        fs-assert="branched">x</button>
    `);
    wire();
    await expectPassed("branched");
    const payloads = ctx.allPayloads().filter((p: any) => p.assertionKey === "branched");
    const passing = payloads.find((p: any) => p.status === "passed");
    expect(passing?.conditionKey).toBe("success");
  });

  it("json: success branch passes when success element appears", async () => {
    initJson(
      [
        {
          "fs-target": "#btn",
          "fs-trigger": "click",
          "fs-assert": "branched",
          "fs-assert-added-success": "#success-msg",
          "fs-assert-added-error": "#error-msg",
        },
      ],
      `<button id="btn">x</button>`
    );
    wire();
    await expectPassed("branched");
    const payloads = ctx.allPayloads().filter((p: any) => p.assertionKey === "branched");
    const passing = payloads.find((p: any) => p.status === "passed");
    expect(passing?.conditionKey).toBe("success");
  });
});

// ── OOB (out-of-band) chain ──────────────────────────────────────────────────

describe("fs-assert-oob (chain)", () => {
  const wire = () => {
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      const p = document.createElement("div");
      p.id = "primary";
      document.body.appendChild(p);
    });
    btn.click();
  };

  it("html: OOB child fires when parent assertion passes", async () => {
    initHtml(`
      <button id="btn" fs-trigger="click" fs-assert-added="#primary" fs-assert="parent">x</button>
      <div id="oob-watcher" fs-assert-oob="parent" fs-assert-visible="#oob-watcher" fs-assert="child"></div>
    `);
    wire();
    await expectPassed("parent");
    await expectPassed("child");
  });

  it("json: OOB child fires when parent assertion passes", async () => {
    initJson(
      [
        {
          "fs-target": "#btn",
          "fs-trigger": "click",
          "fs-assert": "parent",
          "fs-assert-added": "#primary",
        },
        {
          "fs-target": "#oob-watcher",
          "fs-trigger": "mount",
          "fs-assert": "child",
          "fs-assert-oob": "parent",
          "fs-assert-visible": "#oob-watcher",
        },
      ],
      `<button id="btn">x</button><div id="oob-watcher"></div>`
    );
    wire();
    await expectPassed("parent");
    await expectPassed("child");
  });
});
