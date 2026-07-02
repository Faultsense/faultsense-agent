// @vitest-environment jsdom
/**
 * ignoreHtmlAttrs config option — flag that disables HTML-attribute discovery
 * so the agent operates purely from the JSON spec. Useful for proving an app
 * end-to-end through the JSON path on a page that still has fs-* attributes
 * scattered through its templates (e.g., re-running the todolist demo in
 * JSON mode without stripping its existing instrumentation).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { setupAgent } from "../helpers/assertions";

let ctx: ReturnType<typeof setupAgent>;
afterEach(() => ctx?.cleanup());

describe("ignoreHtmlAttrs", () => {
  it("with HTML attrs in DOM + flag on + no spec → no assertions fire", async () => {
    ctx = setupAgent({ deferInit: true, config: { ignoreHtmlAttrs: true } });
    document.body.innerHTML = `
      <button id="btn" fs-trigger="click" fs-assert-added="#panel" fs-assert="html">click</button>
    `;
    ctx.init();
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      const p = document.createElement("div");
      p.id = "panel";
      document.body.appendChild(p);
    });
    btn.click();
    // Flush microtasks and any pending timers so the agent has had every
    // chance to fire. If anything was going to enqueue an assertion, it
    // would have by now.
    await Promise.resolve();
    vi.runAllTimers();
    expect(ctx.sendToCollectorSpy).not.toHaveBeenCalled();
  });

  it("with HTML attrs in DOM + flag on + JSON spec → only JSON assertions fire", async () => {
    ctx = setupAgent({
      deferInit: true,
      config: {
        ignoreHtmlAttrs: true,
        spec: [{
          "fs-target": "#btn",
          "fs-trigger": "click",
          "fs-assert": "json-only",
          "fs-assert-added": "#json-panel",
        }],
      },
    });
    // Both HTML and JSON setup target the same button, but with different
    // fs-assert keys so we can tell which path fired.
    document.body.innerHTML = `
      <button id="btn" fs-trigger="click" fs-assert-added="#html-panel" fs-assert="html-only">click</button>
    `;
    ctx.init();

    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      const h = document.createElement("div");
      h.id = "html-panel";
      document.body.appendChild(h);
      const j = document.createElement("div");
      j.id = "json-panel";
      document.body.appendChild(j);
    });
    btn.click();

    await vi.waitFor(() => {
      const keys = ctx.allPayloads().map((p: any) => p.assertionKey);
      expect(keys).toContain("json-only");
    });
    // Confirm HTML path stayed silent.
    expect(ctx.allPayloads().map((p: any) => p.assertionKey)).not.toContain("html-only");
  });

  it("with flag off → HTML attrs still fire (default behaviour preserved)", async () => {
    ctx = setupAgent({ deferInit: true /* ignoreHtmlAttrs defaults to false */ });
    document.body.innerHTML = `
      <button id="btn" fs-trigger="click" fs-assert-added="#panel" fs-assert="html-fires">click</button>
    `;
    ctx.init();
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      const p = document.createElement("div");
      p.id = "panel";
      document.body.appendChild(p);
    });
    btn.click();

    await vi.waitFor(() => {
      expect(ctx.allPayloads().map((p: any) => p.assertionKey)).toContain("html-fires");
    });
  });

  it("flag off with same DOM produces HTML assertions; flag on with same DOM produces only JSON", async () => {
    // Run 1: flag off — HTML fires, JSON also fires (coexistence).
    ctx = setupAgent({
      deferInit: true,
      config: {
        spec: [{
          "fs-target": "#btn",
          "fs-trigger": "click",
          "fs-assert": "json-side",
          "fs-assert-added": "#panel",
        }],
      },
    });
    document.body.innerHTML = `
      <button id="btn" fs-trigger="click" fs-assert-added="#panel" fs-assert="html-side">click</button>
    `;
    ctx.init();
    const btn = document.getElementById("btn") as HTMLButtonElement;
    btn.addEventListener("click", () => {
      const p = document.createElement("div");
      p.id = "panel";
      document.body.appendChild(p);
    });
    btn.click();
    await vi.waitFor(() => {
      const keys = ctx.allPayloads().map((p: any) => p.assertionKey);
      expect(keys).toContain("html-side");
      expect(keys).toContain("json-side");
    });
    ctx.cleanup();

    // Run 2: flag on, same DOM + spec — only JSON fires.
    ctx = setupAgent({
      deferInit: true,
      config: {
        ignoreHtmlAttrs: true,
        spec: [{
          "fs-target": "#btn",
          "fs-trigger": "click",
          "fs-assert": "json-side",
          "fs-assert-added": "#panel",
        }],
      },
    });
    document.body.innerHTML = `
      <button id="btn" fs-trigger="click" fs-assert-added="#panel" fs-assert="html-side">click</button>
    `;
    ctx.init();
    const btn2 = document.getElementById("btn") as HTMLButtonElement;
    btn2.addEventListener("click", () => {
      const p = document.createElement("div");
      p.id = "panel";
      document.body.appendChild(p);
    });
    btn2.click();
    await vi.waitFor(() => {
      expect(ctx.allPayloads().map((p: any) => p.assertionKey)).toContain("json-side");
    });
    expect(ctx.allPayloads().map((p: any) => p.assertionKey)).not.toContain("html-side");
  });

  it("mount trigger with flag on: HTML mount elements ignored, JSON mount entries fire", async () => {
    ctx = setupAgent({
      deferInit: true,
      config: {
        ignoreHtmlAttrs: true,
        spec: [{
          "fs-target": "#json-root",
          "fs-trigger": "mount",
          "fs-assert": "json-mount",
          "fs-assert-visible": "#json-root",
        }],
      },
    });
    document.body.innerHTML = `
      <div id="html-root" fs-trigger="mount" fs-assert-visible="#html-root" fs-assert="html-mount"></div>
      <div id="json-root"></div>
    `;
    ctx.init();
    await vi.waitFor(() => {
      expect(ctx.allPayloads().map((p: any) => p.assertionKey)).toContain("json-mount");
    });
    expect(ctx.allPayloads().map((p: any) => p.assertionKey)).not.toContain("html-mount");
  });

  it("HTML custom-event triggers are ignored when flag is on", async () => {
    ctx = setupAgent({
      deferInit: true,
      config: {
        ignoreHtmlAttrs: true,
        spec: [{
          "fs-target": "#json-watcher",
          "fs-trigger": "event:fired",
          "fs-assert": "json-event",
          "fs-assert-added": "#confirm",
        }],
      },
    });
    document.body.innerHTML = `
      <div id="html-watcher" fs-trigger="event:fired" fs-assert-added="#confirm" fs-assert="html-event"></div>
      <div id="json-watcher"></div>
    `;
    ctx.init();
    document.dispatchEvent(new CustomEvent("fired"));
    const c = document.createElement("div");
    c.id = "confirm";
    document.body.appendChild(c);
    await vi.waitFor(() => {
      expect(ctx.allPayloads().map((p: any) => p.assertionKey)).toContain("json-event");
    });
    expect(ctx.allPayloads().map((p: any) => p.assertionKey)).not.toContain("html-event");
  });
});
