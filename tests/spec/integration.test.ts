// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setupAgent } from "../helpers/assertions";
import type { SpecEntry } from "../../src/types";

describe("JSON-spec integration", () => {
  let ctx: ReturnType<typeof setupAgent>;
  afterEach(() => {
    ctx?.cleanup();
  });

  describe("init({ spec })", () => {
    it("registers entries provided at init time", () => {
      ctx = setupAgent({
        deferInit: true,
        config: {
          spec: [
            {
              "fs-target": ".btn",
              "fs-trigger": "click",
              "fs-assert": "x",
            },
          ],
        },
      });
      ctx.init();
      expect(window.Faultsense?.getSpec?.()).toHaveLength(1);
    });

    it("attaches setSpec / addSpec / getSpec on window.Faultsense", () => {
      ctx = setupAgent();
      expect(typeof window.Faultsense?.setSpec).toBe("function");
      expect(typeof window.Faultsense?.addSpec).toBe("function");
      expect(typeof window.Faultsense?.getSpec).toBe("function");
    });
  });

  describe("dual-source same page", () => {
    it("HTML element and JSON entry both fire independently on the same click", async () => {
      document.body.innerHTML = `
        <button id="html-btn" fs-trigger="click" fs-assert-added="#html-panel" fs-assert="html-fire">HTML</button>
        <button id="json-btn">JSON</button>
      `;
      ctx = setupAgent({
        deferInit: true,
        config: {
          spec: [
            {
              "fs-target": "#json-btn",
              "fs-trigger": "click",
              "fs-assert": "json-fire",
              "fs-assert-added": "#json-panel",
            },
          ],
        },
      });
      ctx.init();

      const htmlBtn = document.getElementById("html-btn") as HTMLButtonElement;
      const jsonBtn = document.getElementById("json-btn") as HTMLButtonElement;
      htmlBtn.addEventListener("click", () => {
        const p = document.createElement("div");
        p.id = "html-panel";
        document.body.appendChild(p);
      });
      jsonBtn.addEventListener("click", () => {
        const p = document.createElement("div");
        p.id = "json-panel";
        document.body.appendChild(p);
      });

      htmlBtn.click();
      jsonBtn.click();

      await vi.waitFor(() => {
        const keys = ctx.allPayloads().map((p: any) => p.assertionKey);
        expect(keys).toContain("html-fire");
        expect(keys).toContain("json-fire");
      });
    });
  });

  describe("dynamic DOM target (re-resolve every event)", () => {
    it("matches a JSON fs-target selector against elements added after init", async () => {
      document.body.innerHTML = `<div id="root"></div>`;
      ctx = setupAgent({
        deferInit: true,
        config: {
          spec: [
            {
              "fs-target": ".lazy-btn",
              "fs-trigger": "click",
              "fs-assert": "lazy",
              "fs-assert-added": "#lazy-result",
            },
          ],
        },
      });
      ctx.init();

      // Inject the button after init
      const root = document.getElementById("root")!;
      const btn = document.createElement("button");
      btn.className = "lazy-btn";
      btn.addEventListener("click", () => {
        const r = document.createElement("div");
        r.id = "lazy-result";
        document.body.appendChild(r);
      });
      root.appendChild(btn);

      btn.click();

      await vi.waitFor(() => {
        const keys = ctx.allPayloads().map((p: any) => p.assertionKey);
        expect(keys).toContain("lazy");
      });
    });
  });

  describe("self-targeting in JSON", () => {
    it("resolves empty/modifier-only fs-assert-* against the fs-target element", async () => {
      document.body.innerHTML = `<button id="self-btn">click</button>`;
      ctx = setupAgent({
        deferInit: true,
        config: {
          spec: [
            {
              "fs-target": "#self-btn",
              "fs-trigger": "click",
              "fs-assert": "self-target",
              // empty value with modifier — should match #self-btn itself
              "fs-assert-updated": "[text-matches=Done]",
            },
          ],
        },
      });
      ctx.init();

      const btn = document.getElementById("self-btn") as HTMLButtonElement;
      btn.addEventListener("click", () => {
        btn.textContent = "Done";
      });
      btn.click();

      await vi.waitFor(() => {
        const keys = ctx.allPayloads().map((p: any) => p.assertionKey);
        expect(keys).toContain("self-target");
      });
    });
  });

  describe("setSpec hot-swap", () => {
    it("replaces the active spec; subsequent events use the new spec only", async () => {
      document.body.innerHTML = `
        <button id="a">a</button>
        <button id="b">b</button>
      `;
      ctx = setupAgent({
        deferInit: true,
        config: {
          spec: [
            {
              "fs-target": "#a",
              "fs-trigger": "click",
              "fs-assert": "spec-A",
              "fs-assert-added": "#panel-a",
            },
          ],
        },
      });
      ctx.init();

      // Hot-swap
      window.Faultsense!.setSpec!([
        {
          "fs-target": "#b",
          "fs-trigger": "click",
          "fs-assert": "spec-B",
          "fs-assert-added": "#panel-b",
        },
      ]);

      const a = document.getElementById("a") as HTMLButtonElement;
      const b = document.getElementById("b") as HTMLButtonElement;
      a.addEventListener("click", () => {
        const p = document.createElement("div");
        p.id = "panel-a";
        document.body.appendChild(p);
      });
      b.addEventListener("click", () => {
        const p = document.createElement("div");
        p.id = "panel-b";
        document.body.appendChild(p);
      });

      // Click A — spec-A was replaced, should NOT produce that assertion.
      a.click();
      // Click B — spec-B is active, should produce spec-B.
      b.click();

      await vi.waitFor(() => {
        const keys = ctx.allPayloads().map((p: any) => p.assertionKey);
        expect(keys).toContain("spec-B");
      });
      expect(ctx.allPayloads().map((p: any) => p.assertionKey)).not.toContain("spec-A");
    });
  });

  describe("addSpec append semantics", () => {
    it("preserves existing entries when appending", () => {
      ctx = setupAgent({
        deferInit: true,
        config: {
          spec: [
            { "fs-target": "#a", "fs-trigger": "click", "fs-assert": "a" },
          ],
        },
      });
      ctx.init();
      window.Faultsense!.addSpec!([
        { "fs-target": "#b", "fs-trigger": "click", "fs-assert": "b" },
      ]);
      const keys = window.Faultsense!.getSpec!().map((e) => e["fs-assert"]);
      expect(keys).toEqual(["a", "b"]);
    });
  });

  describe("getSpec returns a snapshot", () => {
    it("returns the live entries; subsequent setSpec doesn't retroactively mutate the prior return", () => {
      ctx = setupAgent({
        deferInit: true,
        config: {
          spec: [{ "fs-target": "#a", "fs-trigger": "click", "fs-assert": "a" }],
        },
      });
      ctx.init();
      const snapshot = window.Faultsense!.getSpec!();
      window.Faultsense!.setSpec!([
        { "fs-target": "#b", "fs-trigger": "click", "fs-assert": "b" },
      ]);
      // The original snapshot still reflects what was there
      expect(snapshot.map((e) => e["fs-assert"])).toEqual(["a"]);
      // The new getSpec() reflects the latest
      expect(window.Faultsense!.getSpec!().map((e) => e["fs-assert"])).toEqual(["b"]);
    });
  });

  describe("cross-source custom-event listener teardown", () => {
    it("does not remove the document listener for an event still referenced by HTML when JSON drops its reference", () => {
      const addSpy = vi.spyOn(document, "addEventListener");
      const removeSpy = vi.spyOn(document, "removeEventListener");

      document.body.innerHTML = `
        <div id="html-watch" fs-trigger="event:foo" fs-assert="html-foo" fs-assert-added=".x"></div>
      `;
      ctx = setupAgent({
        deferInit: true,
        config: {
          spec: [
            { "fs-target": ".json-watch", "fs-trigger": "event:foo", "fs-assert": "json-foo" },
          ],
        },
      });
      ctx.init();

      // Confirm exactly one foo listener was installed.
      const fooAdds = addSpy.mock.calls.filter(([name]) => name === "foo");
      expect(fooAdds).toHaveLength(1);

      // Clear JSON reference; HTML still references "foo" so listener must stay.
      window.Faultsense!.setSpec!([]);

      const fooRemoves = removeSpy.mock.calls.filter(([name]) => name === "foo");
      expect(fooRemoves).toHaveLength(0);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it("removes the document listener only when neither source references the event", () => {
      const addSpy = vi.spyOn(document, "addEventListener");
      const removeSpy = vi.spyOn(document, "removeEventListener");

      // JSON-only reference
      ctx = setupAgent({
        deferInit: true,
        config: {
          spec: [
            { "fs-target": ".watch", "fs-trigger": "event:bar", "fs-assert": "json-bar" },
          ],
        },
      });
      ctx.init();

      const barAdds = addSpy.mock.calls.filter(([name]) => name === "bar");
      expect(barAdds).toHaveLength(1);

      window.Faultsense!.setSpec!([]);

      const barRemoves = removeSpy.mock.calls.filter(([name]) => name === "bar");
      expect(barRemoves).toHaveLength(1);

      addSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe("cleanup removes JSON-installed listeners", () => {
    it("tears down document-level listeners for JSON-only custom events on cleanup", () => {
      // Side accumulator outlives vi.restoreAllMocks (which ctx.cleanup invokes
      // after running the agent's own cleanup). A vi.spyOn snapshot would be
      // wiped before this assertion runs.
      const removedNames: string[] = [];
      const original = document.removeEventListener.bind(document);
      vi.spyOn(document, "removeEventListener").mockImplementation(
        (name: any, handler: any, opts: any) => {
          if (typeof name === "string") removedNames.push(name);
          return original(name, handler, opts);
        }
      );

      ctx = setupAgent({
        deferInit: true,
        config: {
          spec: [
            { "fs-target": ".w", "fs-trigger": "event:cleanup-me", "fs-assert": "x" },
          ],
        },
      });
      ctx.init();

      ctx.cleanup();
      ctx = null as any; // prevent double cleanup in afterEach

      expect(removedNames).toContain("cleanup-me");
    });
  });

  describe("missing fs-target", () => {
    it("warns and skips entries without fs-target", () => {
      ctx = setupAgent({ deferInit: true, fakeTimers: false });
      // Re-mock console.warn to capture (setupAgent silences it).
      const warn = vi.fn();
      vi.spyOn(console, "warn").mockImplementation(warn);
      ctx.init({
        spec: [{ "fs-trigger": "click", "fs-assert": "no-target" } as SpecEntry],
      });
      document.body.innerHTML = `<button id="x">x</button>`;
      (document.getElementById("x") as HTMLButtonElement).click();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("missing 'fs-target'"),
        expect.any(Object)
      );
    });
  });
});
