// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isProcessableSpecEntry,
  parseSpecAssertions,
  resolveTargetForEvent,
  resolveTargetsForScan,
} from "../../src/parsers/json";
import type { SpecEntry } from "../../src/types";

describe("parsers/json", () => {
  describe("isProcessableSpecEntry", () => {
    it("returns true when fs-trigger base matches the active trigger set", () => {
      const entry: SpecEntry = {
        "fs-trigger": "click",
        "fs-target": ".btn",
        "fs-assert": "x",
      };
      expect(isProcessableSpecEntry(entry, ["click"])).toBe(true);
    });

    it("returns false when fs-trigger doesn't match", () => {
      const entry: SpecEntry = {
        "fs-trigger": "submit",
        "fs-target": ".btn",
        "fs-assert": "x",
      };
      expect(isProcessableSpecEntry(entry, ["click"])).toBe(false);
    });

    it("returns false for missing fs-trigger", () => {
      const entry = {
        "fs-target": ".btn",
        "fs-assert": "x",
      } as SpecEntry;
      expect(isProcessableSpecEntry(entry, ["click"])).toBe(false);
    });

    it("requires the full raw value for custom events (event:foo)", () => {
      const entry: SpecEntry = {
        "fs-trigger": "event:cart-updated",
        "fs-target": "body",
        "fs-assert": "x",
      };
      expect(isProcessableSpecEntry(entry, ["event:cart-updated"])).toBe(true);
      expect(isProcessableSpecEntry(entry, ["event"])).toBe(false);
    });

    it("respects keyboard filter on keydown triggers", () => {
      const entry: SpecEntry = {
        "fs-trigger": "keydown:Escape",
        "fs-target": "body",
        "fs-assert": "x",
      };
      const escEvent = new KeyboardEvent("keydown", { key: "Escape" });
      const enterEvent = new KeyboardEvent("keydown", { key: "Enter" });
      expect(isProcessableSpecEntry(entry, ["keydown"], escEvent)).toBe(true);
      expect(isProcessableSpecEntry(entry, ["keydown"], enterEvent)).toBe(false);
    });
  });

  describe("parseSpecAssertions", () => {
    it("extracts details, types, and modifiers from spec entry keys", () => {
      const entry: SpecEntry = {
        "fs-trigger": "click",
        "fs-target": ".btn",
        "fs-assert": "checkout/submit",
        "fs-assert-added": "#confirmation",
        "fs-assert-timeout": "2000",
      };
      const metadata = parseSpecAssertions(entry);

      expect(metadata.details).toEqual({
        assert: "checkout/submit",
        trigger: "click",
      });
      expect(metadata.types).toEqual([
        { type: "added", value: "#confirmation", modifiers: undefined },
      ]);
      expect(metadata.modifiers).toEqual({ timeout: "2000" });
    });

    it("extracts conditional dynamic types (fs-assert-{type}-{conditionKey})", () => {
      const entry: SpecEntry = {
        "fs-trigger": "click",
        "fs-target": ".btn",
        "fs-assert": "ok",
        "fs-assert-added-success": ".success-msg",
        "fs-assert-added-error": ".error-msg",
      };
      const metadata = parseSpecAssertions(entry);

      // Sort to remove order dependency
      const sorted = [...metadata.types].sort((a, b) =>
        (a.conditionKey ?? "").localeCompare(b.conditionKey ?? "")
      );
      expect(sorted).toEqual([
        { type: "added", value: ".error-msg", modifiers: {}, conditionKey: "error" },
        { type: "added", value: ".success-msg", modifiers: {}, conditionKey: "success" },
      ]);
    });

    it("parses inline modifiers in type values", () => {
      const entry: SpecEntry = {
        "fs-trigger": "click",
        "fs-target": ".btn",
        "fs-assert": "x",
        "fs-assert-updated": "#counter[text-matches=\\d+]",
      };
      const metadata = parseSpecAssertions(entry);

      expect(metadata.types).toEqual([
        {
          type: "updated",
          value: "#counter",
          modifiers: { "text-matches": "\\d+" },
        },
      ]);
    });
  });

  describe("resolveTargetForEvent", () => {
    beforeEach(() => {
      document.body.innerHTML = `<button class="btn" id="ok">x</button>`;
    });

    it("returns the target when it matches fs-target", () => {
      const target = document.getElementById("ok") as HTMLElement;
      const entry: SpecEntry = {
        "fs-trigger": "click",
        "fs-target": ".btn",
        "fs-assert": "x",
      };
      expect(resolveTargetForEvent(entry, target)).toBe(target);
    });

    it("returns null when the target doesn't match", () => {
      const target = document.getElementById("ok") as HTMLElement;
      const entry: SpecEntry = {
        "fs-trigger": "click",
        "fs-target": ".missing",
        "fs-assert": "x",
      };
      expect(resolveTargetForEvent(entry, target)).toBeNull();
    });

    it("warns and returns null on missing fs-target", () => {
      const target = document.getElementById("ok") as HTMLElement;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const entry = {
        "fs-trigger": "click",
        "fs-assert": "x",
      } as SpecEntry;
      expect(resolveTargetForEvent(entry, target)).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("missing 'fs-target'"),
        entry
      );
      warn.mockRestore();
    });

    it("warns and returns null on invalid CSS selector", () => {
      const target = document.getElementById("ok") as HTMLElement;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const entry: SpecEntry = {
        "fs-trigger": "click",
        "fs-target": "::::not-valid",
        "fs-assert": "x",
      };
      expect(resolveTargetForEvent(entry, target)).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Invalid CSS selector"),
        entry
      );
      warn.mockRestore();
    });
  });

  describe("resolveTargetsForScan", () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="root">
          <button class="btn" id="a">a</button>
          <button class="btn" id="b">b</button>
          <span class="other">x</span>
        </div>
      `;
    });

    it("returns every match in scanRoot subtree", () => {
      const root = document.getElementById("root") as HTMLElement;
      const entry: SpecEntry = {
        "fs-trigger": "mount",
        "fs-target": ".btn",
        "fs-assert": "x",
      };
      const targets = resolveTargetsForScan(entry, root);
      expect(targets.map((el) => el.id)).toEqual(["a", "b"]);
    });

    it("includes scanRoot itself when it matches", () => {
      const root = document.getElementById("root") as HTMLElement;
      const entry: SpecEntry = {
        "fs-trigger": "mount",
        "fs-target": "#root",
        "fs-assert": "x",
      };
      const targets = resolveTargetsForScan(entry, root);
      expect(targets.map((el) => el.id)).toEqual(["root"]);
    });

    it("returns empty on invalid selector with a warning", () => {
      const root = document.getElementById("root") as HTMLElement;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const entry: SpecEntry = {
        "fs-trigger": "mount",
        "fs-target": "::::bad",
        "fs-assert": "x",
      };
      expect(resolveTargetsForScan(entry, root)).toEqual([]);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });
});
