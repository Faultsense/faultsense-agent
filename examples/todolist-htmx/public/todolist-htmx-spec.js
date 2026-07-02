/**
 * JSON-spec mirror of the fs-* HTML attributes in views/.
 *
 * Loaded only when the harness is rendered in JSON mode (server detects
 * `?mode=json` and sets `useJsonMode: true`). The HTML fs-* attrs stay
 * in the rendered DOM but are ignored by the agent — see `ignoreHtmlAttrs`
 * in the manual init block below.
 *
 * The spec is hand-crafted; nothing auto-translates HTML → JSON. Each
 * entry below maps to one fs-instrumented element in views/. Where the
 * HTML uses dynamic per-row IDs (e.g. `#todo-<%= todo.id %>`) or
 * server-computed values (e.g. `[count=<%= todos.length + 1 %>]`), the
 * JSON version uses a generic class selector and drops the templated
 * modifier — same semantics, less precision. That's an acceptable trade
 * for end-to-end validation; the HTML path retains the full per-row check.
 *
 * Caveat: connectivity triggers (`online`/`offline`) don't fire in
 * ignoreHtmlAttrs mode (see docs/public/agent/configuration.md). The
 * two `network/offline-banner-*` entries below are included for parity
 * but will stay pending in JSON mode.
 */
window.TODOLIST_HTMX_SPEC = [
  // ─── Auth ──────────────────────────────────────────────────────────────
  // auth/login — click on submit. Route assertion on success, DOM-added on
  // error. mutex=each links the cross-type conditionals.
  {
    "fs-target": ".login-button",
    "fs-trigger": "click",
    "fs-assert": "auth/login",
    "fs-assert-mutex": "each",
    "fs-assert-route-success": "/todos",
    "fs-assert-added-error": ".login-error",
  },
  // auth/logout — click on logout button, fires route assertion.
  {
    "fs-target": ".logout-btn",
    "fs-trigger": "click",
    "fs-assert": "auth/logout",
    "fs-assert-route": "/login",
  },

  // ─── Layout ────────────────────────────────────────────────────────────
  // layout/title-visible — invariant. Reports failure if the title is
  // hidden; auto-passes on page unload.
  {
    "fs-target": "#app-title",
    "fs-trigger": "invariant",
    "fs-assert": "layout/title-visible",
    "fs-assert-visible": "#app-title",
  },

  // ─── Network (currently inert in JSON-only mode — connectivity caveat) ─
  // network/offline-banner-shown — offline trigger, banner appears.
  {
    "fs-target": "body",
    "fs-trigger": "offline",
    "fs-assert": "network/offline-banner-shown",
    "fs-assert-added": "#offline-banner",
  },
  // network/offline-banner-hidden — online trigger, banner removed.
  {
    "fs-target": "body",
    "fs-trigger": "online",
    "fs-assert": "network/offline-banner-hidden",
    "fs-assert-removed": "#offline-banner",
  },

  // ─── Demos ─────────────────────────────────────────────────────────────
  // demo/gc-timeout — selector never matches; GC sweeps the assertion.
  {
    "fs-target": ".demo-btn",
    "fs-trigger": "click",
    "fs-assert": "demo/gc-timeout",
    "fs-assert-added": ".never-exists",
  },

  // ─── Count OOB sentinels (no fs-trigger; OOB IS the trigger) ───────────
  // todos/count-updated — fires when any CRUD parent passes; checks the
  // count text matches "N/M remaining".
  {
    "fs-target": "#todo-count",
    "fs-assert": "todos/count-updated",
    "fs-assert-oob": "todos/toggle-complete,todos/add-item,todos/remove-item",
    "fs-assert-visible": "#todo-count[text-matches=\\d+/\\d+ remaining]",
  },
  // todos/item-count-correct — fires on add/remove; verifies a .todo-item
  // exists in the DOM. (Drops the templated `[count=N]` from the HTML
  // version since JSON can't template per-render.)
  {
    "fs-target": "#item-count-sentinel",
    "fs-assert": "todos/item-count-correct",
    "fs-assert-oob": "todos/add-item,todos/remove-item",
    "fs-assert-visible": ".todo-item",
  },
  // todos/count-stable-after-toggle — fires on toggle; #todo-count must
  // NOT mutate during the 500ms stability window.
  {
    "fs-target": "#count-stable-sentinel",
    "fs-assert": "todos/count-stable-after-toggle",
    "fs-assert-oob": "todos/toggle-complete",
    "fs-assert-stable": "#todo-count",
    "fs-assert-timeout": "500",
  },

  // ─── Add-todo form ─────────────────────────────────────────────────────
  // todos/char-count-updated — input event on the text input.
  {
    "fs-target": "#add-todo-input",
    "fs-trigger": "input",
    "fs-assert": "todos/char-count-updated",
    "fs-assert-visible": "#char-count[text-matches=\\d+/100]",
  },
  // todos/add-item — click on submit. mutex=conditions splits the
  // success branch (DOM added + custom event emitted) from the error
  // branch (.add-error appears).
  {
    "fs-target": "#add-todo-button",
    "fs-trigger": "click",
    "fs-assert": "todos/add-item",
    "fs-assert-mutex": "conditions",
    "fs-assert-added-success": ".todo-item",
    "fs-assert-emitted-success": "todo:added",
    "fs-assert-added-error": ".add-error",
    "fs-assert-timeout": "500",
  },

  // ─── Getting-started guide ─────────────────────────────────────────────
  // guide/step-1 — mount; the first step is visible on page load.
  {
    "fs-target": ".getting-started-step",
    "fs-trigger": "mount",
    "fs-assert": "guide/step-1",
    "fs-assert-visible": ".getting-started-step",
  },
  // guide/step-2 — click; requires step-1 to have passed.
  {
    "fs-target": ".done-btn[data-gs-done='2']",
    "fs-trigger": "click",
    "fs-assert": "guide/step-2",
    "fs-assert-after": "guide/step-1",
    "fs-assert-updated": ".getting-started-step.complete",
  },
  // guide/step-3 — click; requires step-2 to have passed.
  {
    "fs-target": ".done-btn[data-gs-done='3']",
    "fs-trigger": "click",
    "fs-assert": "guide/step-3",
    "fs-assert-after": "guide/step-2",
    "fs-assert-updated": ".getting-started-step.complete",
  },

  // ─── Todo items ────────────────────────────────────────────────────────
  // todos/toggle-complete — change on the checkbox. HTML asserts per-row
  // ID + classlist; JSON drops per-row precision and just asserts the
  // .todo-item subtree updated.
  {
    "fs-target": ".checkbox[hx-patch]",
    "fs-trigger": "change",
    "fs-assert": "todos/toggle-complete",
    "fs-assert-updated": ".todo-item",
  },
  // todos/edit-item — click on the edit button (uses :not to disambiguate
  // from the delete button which shares `.action-btn`).
  {
    "fs-target": ".action-btn:not(.delete-btn)[hx-get]",
    "fs-trigger": "click",
    "fs-assert": "todos/edit-item",
    "fs-assert-added": ".todo-edit-input[focused=true]",
  },
  // todos/remove-item — click on the delete button. mutex=each splits
  // success (row removed) from error (.error-msg appears).
  {
    "fs-target": ".delete-btn",
    "fs-trigger": "click",
    "fs-assert": "todos/remove-item",
    "fs-assert-mutex": "each",
    "fs-assert-removed-success": ".todo-item",
    "fs-assert-added-error": ".error-msg",
    "fs-assert-timeout": "5000",
  },

  // ─── Edit mode ─────────────────────────────────────────────────────────
  // todos/save-edit — fires on a `todo:save-edit` custom event dispatched
  // from the input's blur handler. Sentinel pattern: avoids a click-vs-
  // blur race that would otherwise miss the save action.
  {
    "fs-target": "body",
    "fs-trigger": "event:todo:save-edit",
    "fs-assert": "todos/save-edit",
    "fs-assert-removed": ".todo-edit-input",
  },
  // todos/cancel-edit — Escape keydown filter on the edit input.
  {
    "fs-target": ".todo-edit-input",
    "fs-trigger": "keydown:Escape",
    "fs-assert": "todos/cancel-edit",
    "fs-assert-removed": ".todo-edit-input",
  },

  // ─── Activity log ──────────────────────────────────────────────────────
  // activity/log-updated — custom event todo:added; verify a log entry
  // appeared.
  {
    "fs-target": "body",
    "fs-trigger": "event:todo:added",
    "fs-assert": "activity/log-updated",
    "fs-assert-visible": ".log-entry",
  },

  // ─── Empty state ───────────────────────────────────────────────────────
  // todos/empty-state — mount; fires when the empty-state element is in
  // the DOM (page load with zero todos, or after the last delete).
  {
    "fs-target": ".empty-state-message",
    "fs-trigger": "mount",
    "fs-assert": "todos/empty-state",
    "fs-assert-visible": ".empty-state-message",
  },
];
