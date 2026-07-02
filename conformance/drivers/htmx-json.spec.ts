/**
 * Layer 2 driver — HTMX harness in JSON-spec mode.
 *
 * Reuses the same Express + EJS harness as `htmx.spec.ts` but loads each
 * page at `?mode=json`, which the server detects and renders to load the
 * agent with `ignoreHtmlAttrs: true` + the hand-crafted JSON spec at
 * conformance/htmx/public/todolist-htmx-spec.js. The HTML fs-* attrs in
 * the template stay on the rendered DOM but are inert.
 *
 * This proves the JSON path produces parity assertions to the HTML path
 * across every conformance scenario the htmx harness exercises — the
 * strongest end-to-end signal short of writing a brand-new app from
 * scratch in JSON-only mode.
 */

import { test } from "@playwright/test";
import {
  runners,
  standardBeforeEach,
  type HarnessConfig,
} from "../shared/runners";

const config: HarnessConfig = {
  name: "htmx-json",
  toggleSelector: ".toggle-btn",
  toggleAction: "click",
  toggleExpectedType: "updated",
  addItemAllowedTypes: ["added"],
  resetBackend: async (_page, request) => {
    await request.post("/todos/reset");
  },
  // ↓ the only line that differs from the HTML driver.
  urlPath: "/?mode=json",
};

test.describe("htmx harness (JSON-spec mode)", () => {
  test.beforeEach(async ({ page, request }) => {
    await standardBeforeEach(page, request, config);
  });

  test("todos/add-item — HTMX post + swap-oob produces a passing success variant", ({
    page,
  }) => runners["todos/add-item"](page, config));

  test("todos/toggle-complete — hx-patch + outerHTML swap resolves via updated+ID", ({
    page,
  }) => runners["todos/toggle-complete"](page, config));

  test("todos/remove-item — hx-delete pulls the li out of the list", ({
    page,
  }) => runners["todos/remove-item"](page, config));

  test("todos/char-count-updated — input trigger + text-matches on the counter span", ({
    page,
  }) => runners["todos/char-count-updated"](page, config));

  test("layout/empty-state-shown — mount trigger on server-rendered empty state", ({
    page,
  }) => runners["layout/empty-state-shown"](page, config));

  test("todos/count-updated — OOB triggered by hx-swap-oob on add", ({
    page,
  }) => runners["todos/count-updated"](page, config));

  test("layout/title-visible — invariant reports failure if the title is hidden", ({
    page,
  }) => runners["layout/title-visible"](page, config));
});
