// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { createSpecRegistry } from "../../src/assertions/spec-registry";
import type { SpecEntry } from "../../src/types";

const entry = (overrides: Partial<SpecEntry> = {}): SpecEntry => ({
  "fs-trigger": "click",
  "fs-target": ".btn",
  "fs-assert": "x",
  ...overrides,
});

describe("spec-registry", () => {
  describe("setEntries + getEntries", () => {
    it("replaces all entries", () => {
      const r = createSpecRegistry();
      r.setEntries([entry({ "fs-assert": "a" }), entry({ "fs-assert": "b" })]);
      r.setEntries([entry({ "fs-assert": "c" })]);
      expect(r.getEntries().map((e) => e["fs-assert"])).toEqual(["c"]);
    });

    it("returns a snapshot that doesn't reflect later mutations", () => {
      const r = createSpecRegistry();
      r.setEntries([entry({ "fs-assert": "a" })]);
      const snap = r.getEntries();
      r.setEntries([entry({ "fs-assert": "b" })]);
      expect(snap.map((e) => e["fs-assert"])).toEqual(["a"]);
      expect(r.getEntries().map((e) => e["fs-assert"])).toEqual(["b"]);
    });
  });

  describe("addEntries", () => {
    it("appends to existing entries", () => {
      const r = createSpecRegistry();
      r.setEntries([entry({ "fs-assert": "a" })]);
      r.addEntries([entry({ "fs-assert": "b" }), entry({ "fs-assert": "c" })]);
      expect(r.getEntries().map((e) => e["fs-assert"])).toEqual(["a", "b", "c"]);
    });
  });

  describe("diff (custom event names)", () => {
    it("reports added events on setEntries", () => {
      const r = createSpecRegistry();
      const diff = r.setEntries([
        entry({ "fs-trigger": "event:foo", "fs-target": "body" }),
        entry({ "fs-trigger": "event:bar", "fs-target": "body" }),
      ]);
      expect(new Set(diff.addedEvents)).toEqual(new Set(["foo", "bar"]));
      expect(diff.removedEvents).toEqual([]);
    });

    it("reports removed events when replaced", () => {
      const r = createSpecRegistry();
      r.setEntries([
        entry({ "fs-trigger": "event:foo", "fs-target": "body" }),
        entry({ "fs-trigger": "event:bar", "fs-target": "body" }),
      ]);
      const diff = r.setEntries([
        entry({ "fs-trigger": "event:bar", "fs-target": "body" }),
        entry({ "fs-trigger": "event:baz", "fs-target": "body" }),
      ]);
      expect(diff.addedEvents).toEqual(["baz"]);
      expect(diff.removedEvents).toEqual(["foo"]);
    });

    it("addEntries reports only added, never removed", () => {
      const r = createSpecRegistry();
      r.setEntries([entry({ "fs-trigger": "event:foo", "fs-target": "body" })]);
      const diff = r.addEntries([
        entry({ "fs-trigger": "event:bar", "fs-target": "body" }),
      ]);
      expect(diff.addedEvents).toEqual(["bar"]);
      expect(diff.removedEvents).toEqual([]);
    });

    it("dedupes added events when the same custom event appears in multiple entries", () => {
      const r = createSpecRegistry();
      const diff = r.setEntries([
        entry({ "fs-trigger": "event:foo", "fs-target": ".a" }),
        entry({ "fs-trigger": "event:foo", "fs-target": ".b" }),
      ]);
      expect(diff.addedEvents).toEqual(["foo"]);
    });
  });

  describe("findCandidatesForEvent", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <button class="btn" id="ok">x</button>
        <button class="other" id="no">y</button>
      `;
    });

    it("returns (target, metadata) pairs for matching entries on the active trigger", () => {
      const r = createSpecRegistry();
      r.setEntries([
        entry({ "fs-trigger": "click", "fs-target": ".btn", "fs-assert": "ok" }),
        entry({ "fs-trigger": "submit", "fs-target": ".btn", "fs-assert": "no" }),
      ]);
      const target = document.getElementById("ok") as HTMLElement;
      const pairs = r.findCandidatesForEvent(["click"], target);
      expect(pairs).toHaveLength(1);
      expect(pairs[0][0]).toBe(target);
      expect(pairs[0][1].details["assert"]).toBe("ok");
    });

    it("returns empty when no entry's fs-target matches", () => {
      const r = createSpecRegistry();
      r.setEntries([entry({ "fs-target": ".missing" })]);
      const target = document.getElementById("ok") as HTMLElement;
      expect(r.findCandidatesForEvent(["click"], target)).toEqual([]);
    });

    it("returns empty when no entry uses the active trigger", () => {
      const r = createSpecRegistry();
      r.setEntries([entry({ "fs-trigger": "submit" })]);
      const target = document.getElementById("ok") as HTMLElement;
      expect(r.findCandidatesForEvent(["click"], target)).toEqual([]);
    });

    it("dedupes when the triggers array contains duplicates", () => {
      const r = createSpecRegistry();
      r.setEntries([entry()]);
      const target = document.getElementById("ok") as HTMLElement;
      const pairs = r.findCandidatesForEvent(["click", "click"], target);
      expect(pairs).toHaveLength(1);
    });
  });

  describe("findCandidatesForScan", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="root">
          <button class="btn" id="a">a</button>
          <button class="btn" id="b">b</button>
          <span class="card" id="c">c</span>
        </div>
        <div class="card" id="outside">outside</div>
      `;
    });

    it("yields one pair per (matched element × matching entry) within scanRoot subtree", () => {
      const r = createSpecRegistry();
      r.setEntries([
        entry({ "fs-trigger": "mount", "fs-target": ".btn", "fs-assert": "btn-mount" }),
        entry({ "fs-trigger": "mount", "fs-target": ".card", "fs-assert": "card-mount" }),
      ]);
      const root = document.getElementById("root") as HTMLElement;
      const pairs = r.findCandidatesForScan(["mount"], root);
      const summary = pairs.map(([el, meta]) => [el.id, meta.details["assert"]]);
      expect(summary).toEqual(
        expect.arrayContaining([
          ["a", "btn-mount"],
          ["b", "btn-mount"],
          ["c", "card-mount"],
        ])
      );
      // outside-root should not appear
      expect(summary.find(([id]) => id === "outside")).toBeUndefined();
    });

    it("uses a single union-selector query under the hood (correctness check via results)", () => {
      const r = createSpecRegistry();
      r.setEntries([
        entry({ "fs-trigger": "mount", "fs-target": ".btn", "fs-assert": "x" }),
        entry({ "fs-trigger": "mount", "fs-target": ".card", "fs-assert": "y" }),
      ]);
      const root = document.getElementById("root") as HTMLElement;
      const pairs = r.findCandidatesForScan(["mount"], root);
      // Three subtree matches (a, b, c). Pair count equals matches × distinct
      // entries matching each. Each element matches exactly one entry's
      // selector, so total pairs = 3.
      expect(pairs).toHaveLength(3);
    });

    it("emits one pair per matching entry when an element matches multiple entries", () => {
      // Make a button that matches both .btn and .primary
      document.body.innerHTML = `
        <div id="root">
          <button class="btn primary" id="both">x</button>
        </div>
      `;
      const r = createSpecRegistry();
      r.setEntries([
        entry({ "fs-trigger": "mount", "fs-target": ".btn", "fs-assert": "a" }),
        entry({ "fs-trigger": "mount", "fs-target": ".primary", "fs-assert": "b" }),
      ]);
      const root = document.getElementById("root") as HTMLElement;
      const pairs = r.findCandidatesForScan(["mount"], root);
      const summary = pairs.map(([el, meta]) => [el.id, meta.details["assert"]]);
      expect(summary).toEqual(
        expect.arrayContaining([
          ["both", "a"],
          ["both", "b"],
        ])
      );
      expect(pairs).toHaveLength(2);
    });

    it("ignores entries whose trigger isn't in the active set", () => {
      const r = createSpecRegistry();
      r.setEntries([
        entry({ "fs-trigger": "click", "fs-target": ".btn", "fs-assert": "click-only" }),
      ]);
      const root = document.getElementById("root") as HTMLElement;
      expect(r.findCandidatesForScan(["mount"], root)).toEqual([]);
    });

    it("never runs for custom-event triggers (they take a different path)", () => {
      const r = createSpecRegistry();
      r.setEntries([
        entry({ "fs-trigger": "event:foo", "fs-target": ".btn", "fs-assert": "x" }),
      ]);
      const root = document.getElementById("root") as HTMLElement;
      expect(r.findCandidatesForScan(["event"], root)).toEqual([]);
      expect(r.findCandidatesForScan(["event:foo"], root)).toEqual([]);
    });
  });

  describe("findCustomEventCandidates", () => {
    beforeEach(() => {
      document.body.innerHTML = `<div class="watcher" id="w">x</div>`;
    });

    it("matches entries by parsed event name", () => {
      const r = createSpecRegistry();
      r.setEntries([
        entry({ "fs-trigger": "event:cart-updated", "fs-target": ".watcher", "fs-assert": "cart" }),
        entry({ "fs-trigger": "event:order-placed", "fs-target": ".watcher", "fs-assert": "order" }),
      ]);
      const ev = new CustomEvent("cart-updated", { detail: {} });
      const pairs = r.findCustomEventCandidates("cart-updated", ev);
      expect(pairs).toHaveLength(1);
      expect(pairs[0][1].details["assert"]).toBe("cart");
    });

    it("respects detail-matches filter", () => {
      const r = createSpecRegistry();
      r.setEntries([
        entry({
          "fs-trigger": "event:foo[detail-matches=type:add]",
          "fs-target": ".watcher",
          "fs-assert": "add-only",
        }),
      ]);
      const addEvent = new CustomEvent("foo", { detail: { type: "add" } });
      const removeEvent = new CustomEvent("foo", { detail: { type: "remove" } });
      expect(r.findCustomEventCandidates("foo", addEvent)).toHaveLength(1);
      expect(r.findCustomEventCandidates("foo", removeEvent)).toHaveLength(0);
    });

    it("emits one pair per matched DOM element when multiple match", () => {
      document.body.innerHTML = `
        <div class="w" id="a"></div>
        <div class="w" id="b"></div>
      `;
      const r = createSpecRegistry();
      r.setEntries([
        entry({ "fs-trigger": "event:foo", "fs-target": ".w", "fs-assert": "x" }),
      ]);
      const ev = new CustomEvent("foo", { detail: {} });
      const pairs = r.findCustomEventCandidates("foo", ev);
      expect(pairs.map(([el]) => el.id)).toEqual(["a", "b"]);
    });
  });

  describe("clear", () => {
    it("resets all internal state", () => {
      const r = createSpecRegistry();
      r.setEntries([
        entry({ "fs-trigger": "event:foo", "fs-target": "body" }),
        entry({ "fs-trigger": "mount", "fs-target": ".btn" }),
      ]);
      r.clear();
      expect(r.getEntries()).toEqual([]);
      document.body.innerHTML = `<button class="btn"></button>`;
      expect(
        r.findCandidatesForScan(["mount"], document.body)
      ).toEqual([]);
      expect(
        r.findCustomEventCandidates("foo", new CustomEvent("foo", { detail: {} }))
      ).toEqual([]);
    });
  });
});
