/**
 * Hand-crafted JSON spec mirroring the fs-* HTML attribute instrumentation
 * in views/. Loaded only when the harness is rendered in JSON mode
 * (server detects `?mode=json` and renders index.ejs accordingly).
 *
 * Authoring rules (per docs/public/agent/json-spec.md):
 * - Use stable selectors. The htmx demo uses ids + semantic classes
 *   (.toggle-btn, .remove-btn, .todo-item, #app-title, #todo-count).
 * - Double-escape regex backslashes — JSON strings, not HTML attrs.
 *   `text-matches=\\d+/100` not `text-matches=\d+/100`.
 * - When a feature relies on a per-row dynamic id (e.g. #todo-<N>), the
 *   JSON version uses the class-based equivalent. We sacrifice some
 *   per-row specificity (the assertion fires when ANY .todo-item updates
 *   after clicking a .toggle-btn) in exchange for generic selectors.
 *   That's an acceptable trade for end-to-end validation; the HTML path
 *   in the legacy harness retains the precise per-row semantics.
 */
window.TODOLIST_HTMX_SPEC = [
  // Scenario 1: add-item — conditional mutex success/error
  {
    "fs-target": "form button[type=submit]",
    "fs-trigger": "click",
    "fs-assert": "todos/add-item",
    "fs-assert-mutex": "conditions",
    "fs-assert-added-success": ".todo-item",
    "fs-assert-added-error": ".add-error",
    "fs-assert-timeout": "1500",
  },
  // Scenario 2: toggle-complete. HTML version targets #todo-<N>[classlist=...]
  // per row; JSON uses a generic .todo-item updated check. Less precise,
  // adequate for path validation.
  {
    "fs-target": ".toggle-btn",
    "fs-trigger": "click",
    "fs-assert": "todos/toggle-complete",
    "fs-assert-updated": ".todo-item",
    "fs-assert-timeout": "1500",
  },
  // Scenario 3: remove-item
  {
    "fs-target": ".remove-btn",
    "fs-trigger": "click",
    "fs-assert": "todos/remove-item",
    "fs-assert-removed": ".todo-item",
    "fs-assert-timeout": "1500",
  },
  // Scenario 4: char-count-updated on input
  {
    "fs-target": "#add-todo-input",
    "fs-trigger": "input",
    "fs-assert": "todos/char-count-updated",
    "fs-assert-visible": "#char-count[text-matches=\\d+/100]",
  },
  // Scenario 5: empty-state-shown on mount
  {
    "fs-target": ".empty-state",
    "fs-trigger": "mount",
    "fs-assert": "layout/empty-state-shown",
    "fs-assert-visible": ".empty-state",
  },
  // Scenario 6: count-updated OOB on every CRUD assertion.
  // No fs-trigger — OOB is the trigger. The agent fires this assertion
  // when any of the listed parents pass (mirrors the HTML version which
  // also omits fs-trigger on OOB elements).
  {
    "fs-target": "#todo-count",
    "fs-assert": "todos/count-updated",
    "fs-assert-oob": "todos/add-item,todos/remove-item,todos/toggle-complete",
    "fs-assert-visible": "#todo-count[text-matches=\\d+ / \\d+ remaining]",
  },
  // Scenario 7: title-visible invariant
  {
    "fs-target": "#app-title",
    "fs-trigger": "invariant",
    "fs-assert": "layout/title-visible",
    "fs-assert-visible": "#app-title",
  },
];
