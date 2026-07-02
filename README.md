<div align="center">
  <img src="https://raw.githubusercontent.com/Faultsense/faultsense-agent/main/assets/logo.svg" alt="Faultsense" width="400">
  <h3>Faultsense: The assertion layer for end-to-end testing.</h3>

  <p>
    <a href="https://www.npmjs.com/package/@faultsense/agent"><img src="https://img.shields.io/npm/v/@faultsense/agent?color=111827&label=npm" alt="npm"></a>
    <img src="https://img.shields.io/badge/dependencies-0-111827" alt="zero dependencies">
    <img src="https://img.shields.io/badge/gzipped-17.7%20KB-111827" alt="17.7 KB gzipped">
    <img src="https://img.shields.io/badge/license-FSL--1.1--ALv2-111827" alt="license">
  </p>
</div>

---

Faultsense is a lightweight, zero-dependency browser agent. It evaluates end-to-end
assertions against **real user sessions in production**. You write the assertions as annotations on the UI they check, and
Faultsense decides pass or fail in a real browser on the user's own device.

It's the `expect()` without the `page`: the assertion lives next to the markup it checks
and runs wherever your app runs.

```html
<button
  fs-assert="checkout/submit-order"
  fs-trigger="click"
  fs-assert-added-success=".order-confirmation"
  fs-assert-added-error=".error-message[text-matches=try again]">
  Place Order
</button>
```

When a user clicks **Place Order**: if the order confirmation appears, the `success`
condition passes. If an error message appears instead, the `error` condition passes. If
neither happens before the timeout, Faultsense reports a failure and tells you which
assertion broke, on which release, and what should have happened instead.

**You don't need a second codebase to test the first one.** Your assertions stop being
trapped in a script suite that only runs in CI, against a simulated browser, on a
network that never drops. They move onto the UI itself and run in the field.

## Contents

- [Why Faultsense](#why-faultsense)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Instrumentation reference](#instrumentation-reference)
- [JSON-spec instrumentation](#json-spec-instrumentation)
- [Framework usage](#framework-usage)
- [Works with](#works-with)
- [Conformance](#conformance)
- [Configuration](#configuration)
- [JavaScript API](#javascript-api)
- [Event payload — bring your own sink](#event-payload--bring-your-own-sink)
- [Performance](#performance)
- [Worked examples](#worked-examples)
- [Package info](#package-info)
- [License & links](#license--links)

## Why Faultsense

The end-to-end test is splitting in two. AI is taking over the driving half: clicking
through flows and filling in forms. What's left is the half that was always the point, the
*assertion* half, where you say what "correct" actually means. That's Faultsense.

You already do this when you write a Playwright or Cypress test. Faultsense lets you lift
those checks out of the script and onto the element itself, then run them against real user
sessions instead of seeded fixtures in CI. It's the same reasoning you already use, minus
the fixtures.

## How it works

1. **Annotate** — add `fs-*` attributes to the flows that matter, right on the elements
   they check.
2. **Drive** — an AI agent walks your flows in staging. Your real users walk them in
   production.
3. **Assert** — Faultsense evaluates every annotation as the flow runs and records pass or
   fail. The UI is the signal, so there's no server-side integration to wire up.
4. **Report** — results stream to the stack you already run: your warehouse, your metrics
   pipeline, wherever you point them.

Every assertion needs three things:

1. **A key** — `fs-assert="checkout/submit-order"` identifies this assertion (stable across
   releases).
2. **A trigger** — `fs-trigger="click"` defines when the assertion activates.
3. **An expected outcome** — `fs-assert-added=".success"` defines what should happen.

## Quick start

You `init` the agent with a **collector function**: a plain callback that receives every
resolved assertion, so you decide where it goes. Send it to your warehouse, an internal
endpoint, or three sinks at once. There's no API key to manage and no backend you're forced
to run.

**Via CDN** — load the bundle, then `init`:

```html
<script defer src="https://cdn.faultsense.com/v0.6.0/faultsense-agent.min.js"></script>
<script>
  window.addEventListener('DOMContentLoaded', () => {
    Faultsense.init({
      releaseLabel: '2.4.1',
      collectorURL: (result) => {
        // send it anywhere — this is your sink
        navigator.sendBeacon('/faultsense', JSON.stringify(result));
      },
    });
  });
</script>
```

`/v0.6.0/` is served immutable (`Cache-Control: public, max-age=31536000, immutable`). Use
`/v0/` to float to the latest `0.x` in development.

**Via npm** — the same `init` call:

```bash
npm install @faultsense/agent
```

```js
import { init } from '@faultsense/agent';

const cleanup = init({
  releaseLabel: '2.4.1',
  collectorURL: (result) => {
    // send it anywhere — this is your sink
    navigator.sendBeacon('/faultsense', JSON.stringify(result));
  },
});
// call cleanup() on unmount / HMR dispose
```

The default entry is side-effect-free and SSR-safe: importing it never touches `window`
or `document`. `collectorURL` also accepts a URL string (with `apiKey`) or one of the
built-in `'console'` / `'panel'` collectors. See
[Event payload](#event-payload--bring-your-own-sink).

## Instrumentation reference

The `fs-*` attributes work in any framework that renders to the DOM. An instrumented
element carries an assertion **key**, a **trigger**, and one or more **expectations**.

### Triggers

Exactly one `fs-trigger` per element defines when the assertion activates.

| Trigger | When it fires |
|---|---|
| `click` | Element is clicked |
| `dblclick` | Element is double-clicked |
| `change` | Input value changes |
| `input` | Input receives input |
| `blur` / `focus` | Element loses / gains focus |
| `hover` | Pointer enters the element |
| `keydown` / `keydown:<key>` | Key press (optionally a specific key) |
| `submit` | Form is submitted |
| `mount` | Element is added to the DOM |
| `unmount` | Element is removed from the DOM |
| `load` / `error` | Media resource loads or fails |
| `online` / `offline` | Connectivity changes |
| `invariant` | Continuous monitoring — reports violations and recoveries only |
| `event:<name>` | A `CustomEvent` fires on `document` |

Attributes go on the interacted element; clicks on descendants resolve up via `closest()`.
For forms, put `submit` on the `<form>` or `click` on the submit button.

### Assertion types

The value is a CSS selector, optionally followed by inline modifiers in brackets.

| Attribute | Resolves when |
|---|---|
| `fs-assert-added="<selector>"` | A matching element appears in the DOM |
| `fs-assert-removed="<selector>"` | A matching element is removed from the DOM |
| `fs-assert-updated="<selector>"` | A matched element or subtree is mutated |
| `fs-assert-visible="<selector>"` | Element exists and has layout dimensions |
| `fs-assert-hidden="<selector>"` | Element exists but has no layout dimensions |
| `fs-assert-loaded="<selector>"` | A media element (`img`/`video`/`iframe`) finishes loading |
| `fs-assert-stable="<selector>"` | Element is **not** mutated during the timeout window |
| `fs-assert-emitted="<event>"` | A matching `CustomEvent` fires on `document` |
| `fs-assert-after="<key>"` | The referenced parent assertion(s) have already passed |

> **`added` vs. `updated` is the #1 gotcha.** `added`/`removed`/`updated` resolve *only*
> from mutation records; a pre-existing match doesn't count as a pass. Use `added` when the element
> doesn't exist yet; use `updated` when it exists and its content changes (a class toggle
> is `updated`). `visible`/`hidden` are point-in-time layout checks and pass immediately if
> already satisfied.

### Conditional assertions

Handle multiple outcomes from a single action with condition keys:

```html
<button fs-assert="auth/login" fs-trigger="click"
  fs-assert-added-success=".dashboard"
  fs-assert-added-error=".error-msg">
  Login
</button>
```

The first matching condition wins and the rest are dismissed (never sent). The UI is the
signal, so nothing changes server-side. For cross-type conditionals (e.g.
`removed-success` + `added-error`), group them with `fs-assert-mutex="each"`.

### Inline modifiers

Chained onto the selector with CSS-like bracket syntax:

```html
fs-assert-updated='#count[text-matches=\d+]'
fs-assert-updated='#logo[src=/img/new.png][alt=New Logo]'
fs-assert-updated='.panel[classlist=active:true,hidden:false]'
fs-assert-added='.success[text-matches=Order #\d+]'
```

| Modifier | Checks |
|---|---|
| `[text-matches=pattern]` | Text content — regex, **partial** match |
| `[value-matches=pattern]` | Form control `.value` — regex, **partial** match |
| `[checked=true\|false]` | Checkbox / radio checked state |
| `[disabled=true\|false]` | Disabled state |
| `[focused=true\|false]` / `[focused-within=…]` | Focus state |
| `[count=N]` / `[count-min=N]` / `[count-max=N]` | Element count |
| `[classlist=class:true,class:false]` | Class presence |
| `[detail-matches=key:pattern]` | `CustomEvent.detail` field (with `emitted`) |
| `[attr=value]` | Any other bracket key is an **attribute** check — **full** match |

> **Anchoring rule:** `text-matches` / `value-matches` are partial (unanchored; use
> `^exact$` to pin them). Attribute checks are full match (auto-anchored). Omit the
> selector and provide only modifiers to check the triggering element itself:
> `fs-assert-updated="[text-matches=\d+ remaining]"`.

### Assertion keys

Use `/` to group related assertions hierarchically. Keys must be **stable across releases**.
Human-readable labels live on the collector side, not here.

```
fs-assert="checkout/add-to-cart"
fs-assert="checkout/submit-order"
fs-assert="profile/media/upload-photo"
```

### Element-level attributes

| Attribute | Purpose |
|---|---|
| `fs-assert-timeout="<ms>"` | SLA timeout — fail if not resolved in time |
| `fs-assert-mpa="true"` | Persist across full page navigation (MPA) |
| `fs-assert-mutex="<mode>"` | Group conditionals across types (`type` / `each` / `conditions`) |
| `fs-assert-oob="<keys>"` | Fire a side-effect check when a parent assertion **passes** |
| `fs-assert-oob-fail="<keys>"` | Fire a side-effect check when a parent assertion **fails** |

## JSON-spec instrumentation

Sometimes you can't edit the HTML: a third-party widget, generated markup, a SaaS template
you don't control. Or a tool is generating the instrumentation for you, like a recorder or
an importer. For those cases, declare the same assertions as a **JSON spec**. Both paths run
through the same pipeline and behave identically; the only difference is *where* the `fs-*`
pairs live. HTML and JSON can coexist on the same page.

Each entry mirrors the `fs-*` attribute names and adds one JSON-only key, `fs-target`: the
CSS selector the trigger binds to. (In HTML that target is implicitly the element itself.)

```js
import { init } from '@faultsense/agent';

init({
  releaseLabel: '2.4.1',
  collectorURL: (result) => navigator.sendBeacon('/faultsense', JSON.stringify(result)),
  spec: [
    {
      'fs-target': '#submit-btn',        // JSON-only: required CSS selector
      'fs-trigger': 'click',
      'fs-assert': 'checkout/submit-order',
      'fs-assert-added': '.confirmation[text-matches=Order #\\d+]',
    },
  ],
});
```

Every trigger, assertion type, and modifier documented above applies verbatim. Three keys
are required per entry: `fs-target`, a trigger (`fs-trigger`, or `fs-assert-oob` /
`fs-assert-oob-fail` for OOB children), and `fs-assert`.

- **`fs-target` is re-resolved on every event**, so elements added after init (SPAs,
  late-rendered content) get picked up on their own; you never re-register them.
- **Escape backslashes.** JSON string rules apply: a regex modifier is
  `"fs-assert-updated": "#counter[text-matches=\\d+]"` (double backslash). A single
  backslash silently compiles to the wrong regex. Emit specs with `JSON.stringify`.
- **Validate against the schema.** The published [`spec.schema.json`](spec.schema.json)
  (also at `https://faultsense.com/spec.schema.json`) is the only place typos in `fs-*` keys
  surface loudly; the agent itself ignores unknown keys, same as on the HTML side.

Update the spec at runtime, or run purely from JSON:

```js
Faultsense.setSpec(entries);        // replace the active spec (installs/tears down as needed)
Faultsense.addSpec(entries);        // append — never removes
const entries = Faultsense.getSpec(); // frozen snapshot

// Drive an existing HTML-instrumented page entirely from JSON without stripping attributes:
init({ /* … */, ignoreHtmlAttrs: true, spec: [/* … */] });
```

See [`docs/public/agent/json-spec.md`](https://faultsense.com/agent/json-spec) for the full
authoring guide, including selector-stability tips and the HTML↔JSON co-existence rules.

## Framework usage

Faultsense observes the DOM, not framework internals, so `fs-*` attributes work anywhere
that renders HTML.

**React (JSX)**
```jsx
<button onClick={handleAdd}
  fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated="#cart-count">
  Add to Cart
</button>
```

**Vue (SFC)**
```vue
<template>
  <button @click="handleAdd"
    fs-assert="cart/add-item" fs-trigger="click"
    fs-assert-updated="#cart-count">
    Add to Cart
  </button>
</template>
```

**Svelte**
```svelte
<button on:click={handleAdd}
  fs-assert="cart/add-item" fs-trigger="click"
  fs-assert-updated="#cart-count">
  Add to Cart
</button>
```

> **Framework traps:** React drops bare boolean attributes, so always use explicit string
> values (`fs-assert-mutex="each"`, not `fs-assert-mutex`). Custom components must forward
> `fs-*` props to the root DOM element. Server-swap frameworks force the `added` vs.
> `updated` choice: morphdom-style patching preserves element identity (use `updated`);
> `outerHTML` replacement creates a new node (use `added`).

## Works with

Faultsense is framework-agnostic. The matrix below is verified end-to-end against real
framework dev servers via Playwright on **every release**.

| Framework | Runtime | Coverage |
|---|---|---|
| React 19 + Vite | `conformance/react/` | 10/10 scenarios |
| Vue 3 + Vite | `conformance/vue3/` | 10/10 scenarios |
| Svelte 5 (runes) + Vite | `conformance/svelte/` | 10/10 scenarios |
| Solid 1.9 + Vite | `conformance/solid/` | 10/10 scenarios |
| Alpine.js 3 | `conformance/alpine/` | 10/10 scenarios |
| Astro 6 (SSR + React island) | `conformance/astro/` | 11/11 scenarios |
| Hotwire (Rails 8 + Turbo 8) | `conformance/hotwire/` (Docker) | 8/8 scenarios |
| HTMX 2 + Express | `conformance/htmx/` | 7/7 scenarios |
| Livewire 3 (Laravel 11) | `conformance/livewire/` (Docker) | 8/8 scenarios |
| Phoenix LiveView 1.0 | `conformance/liveview/` (Docker) | 8/8 scenarios |

Docker is required only for the Hotwire, Livewire, and LiveView harnesses (each boots its
own Rails / Laravel / Phoenix runtime in a container). The other seven run directly in
Node. See [`conformance/README.md`](conformance/README.md) for setup.

## Conformance

Support is enforced through two layers:

- **Layer 1 — DOM mutation-pattern suite.** An exhaustive jsdom suite
  ([`tests/conformance/`](tests/conformance/)) that locks in every raw DOM mutation shape
  the agent handles. This is the source of truth: any framework that produces a locked-in
  shape is supported by transitivity.
- **Layer 2 — Per-framework harnesses.** Minimal real apps under
  [`conformance/`](conformance/) run in real browsers as empirical confirmation, and feed
  newly-discovered patterns back into Layer 1.

The mutation-pattern catalog:

| ID | Pattern | Status | Seen in |
|---|---|---|---|
| PAT-01 | Pre-existing target | ✅ supported | SSR React/Vue, Turbo/HTMX server lists |
| PAT-02 | Delayed-commit mutation | ✅ supported | HTMX mid-swap classes, React Suspense, transitions |
| PAT-03 | `outerHTML` replacement | ✅ supported | HTMX `hx-swap="outerHTML"`, Turbo Stream replace |
| PAT-04 | morphdom preserved-identity | ✅ supported | Livewire, Turbo 8 morphing, Alpine `x-html.morph` |
| PAT-05 | Detach-reattach | ✅ supported | React keyed reorder / StrictMode, Vue Teleport |
| PAT-06 | Text-only mutation | ✅ supported | Solid, Svelte, Vue 3 reactive text, Lit |
| PAT-07 | Microtask batching | ✅ supported | React 18 auto-batching, Vue `nextTick`, Preact signals |
| PAT-08 | Cascading mutations | ✅ supported | Redux/Zustand, Turbo Stream broadcasts, `hx-swap-oob` |
| PAT-09 | Hydration upgrade | ✅ supported | Next.js App Router, Remix, Astro, SvelteKit, Nuxt |
| PAT-10 | Shadow-DOM traversal | ⚠️ **gap** | Lit, Stencil, Salesforce LWC |

> **Known limitation — Shadow DOM (PAT-10).** The `MutationObserver` is rooted at
> `document.body` and does not cross shadow-root boundaries, so mutations inside shadow
> trees are invisible to the agent today. Tracked as a future feature.

## Configuration

Passed to `Faultsense.init(config)` (or as `data-*` attributes on the script tag).

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `releaseLabel` | string | Yes | — | App version or commit hash |
| `collectorURL` | string \| function \| `'console'` \| `'panel'` | Yes | — | Where results go — see [below](#event-payload--bring-your-own-sink) |
| `apiKey` | string | If URL | — | API key (required when `collectorURL` is a URL) |
| `debug` | boolean | No | `false` | Enable console logging |
| `userContext` | `Record<string, any>` | No | — | Arbitrary context attached to every payload (e.g. `userId`, plan tier) |
| `userCohorts` | `Record<string, string>` | No | — | Low-cardinality cohort dimensions for per-cohort assertion health |
| `gcInterval` | number (ms) | No | `5000` | Background sweep interval for stale assertions |
| `unloadGracePeriod` | number (ms) | No | `2000` | On page unload, assertions older than this fail; fresher ones are dropped |
| `spec` | `SpecEntry[]` | No | — | [JSON-spec instrumentation](#json-spec-instrumentation) — peer of `fs-*` attributes |
| `ignoreHtmlAttrs` | boolean | No | `false` | Ignore all `fs-*` HTML attributes and run purely from `spec` |

Assertions have **no default per-assertion timer**; they resolve naturally when the DOM
changes. Add a per-element SLA with `fs-assert-timeout` when you want one.

Script-tag `data-*` attributes map one-to-one: `data-release-label`, `data-collector-url`,
`data-api-key`, `data-debug`, `data-gc-interval`, `data-unload-grace-period`,
`data-user-context` (JSON), `data-user-cohorts` (JSON).

**CSP:** `script-src 'self' https://cdn.faultsense.com;` and
`connect-src 'self' https://collector.example.com;`. No inline scripts, no `eval`.

## JavaScript API

| Method | Description |
|---|---|
| `Faultsense.init(config)` | Initialize the agent. Returns a `cleanup` function. |
| `Faultsense.cleanup()` | Tear down the agent — remove all listeners and observers. |
| `Faultsense.registerCleanupHook(fn)` | Register a function to run during cleanup. |
| `Faultsense.setUserContext(context)` | Replace the current user context (does not merge). |
| `Faultsense.setUserCohorts(cohorts)` | Replace the current user cohorts (low-cardinality strings). |
| `Faultsense.setSpec(entries)` | Replace the active [JSON spec](#json-spec-instrumentation). |
| `Faultsense.addSpec(entries)` | Append entries to the active JSON spec (never removes). |
| `Faultsense.getSpec()` | Return a frozen snapshot of the active JSON spec. |
| `Faultsense.version` | The agent's semver string. |

```js
// At init
Faultsense.init({
  releaseLabel: '2.4.1',
  collectorURL: (result) => navigator.sendBeacon('/faultsense', JSON.stringify(result)),
  userContext: { plan: 'pro' },
  userCohorts: { plan: 'pro', region: 'us-east' },
});

// After login — pass the complete context each time (no merge)
Faultsense.setUserContext({ userId: 'u_123', plan: 'pro' });
Faultsense.setUserCohorts({ plan: 'pro', region: 'us-east' });
```

## Event payload — bring your own sink

Faultsense sends results wherever you point `collectorURL`. It never mandates a backend;
**bring your own sink.** `collectorURL` accepts four shapes:

1. **A URL string** — one `POST` per resolved assertion via `navigator.sendBeacon`
   (with a `fetch` fallback), `Content-Type: application/json`, fire-and-forget.
   Requires `apiKey`. This is the contract below.
2. **A function** `(payload) => void` — an in-process sink (proxy, queue, logger, tests).
   No `apiKey` needed; one call per event.
3. **`'console'`** — logs each payload with `console.log` (via `@faultsense/console-collector`).
4. **`'panel'`** — renders results in a Shadow-DOM overlay (via `@faultsense/panel-collector`),
   handy in staging.

Only `passed` and `failed` are sent (internal `dismissed` results are dropped), and only on
a status **change**. Each event has this shape:

```ts
interface EventPayload {
  api_key: string;
  assertion_key: string;
  assertion_trigger: string;
  assertion_type:
    | "added" | "removed" | "updated" | "visible"
    | "hidden" | "loaded" | "stable" | "emitted" | "after";
  assertion_type_value: string;
  assertion_type_modifiers: Record<string, string>;
  attempts: number[];          // re-trigger timestamps (rage-click signal)
  condition_key: string;
  element_snapshot: string;    // outerHTML of the instrumented element
  release_label: string;
  status: "passed" | "failed";
  timestamp: string;           // trigger (creation) time, ISO 8601
  user_context?: Record<string, any>;
  user_cohorts?: Record<string, string>;
  agent_version: string;
  error_context?: {            // first uncaught error during the session, if any
    message: string;
    stack?: string;
    source?: string;
    lineno?: number;
    colno?: number;
  };
}
```

Example body:

```json
{
  "api_key": "your-api-key",
  "assertion_key": "checkout/submit-order",
  "assertion_trigger": "click",
  "assertion_type": "added",
  "assertion_type_value": ".success-message",
  "assertion_type_modifiers": { "text-matches": "Order confirmed" },
  "attempts": [],
  "condition_key": "success",
  "element_snapshot": "<button fs-assert=\"checkout/submit-order\" …>Submit</button>",
  "release_label": "2.4.1",
  "status": "passed",
  "timestamp": "2026-03-24T14:30:00.000Z",
  "user_context": { "userId": "u_123", "plan": "pro" },
  "user_cohorts": { "plan": "pro", "region": "us-east" },
  "agent_version": "0.6.0"
}
```

A cross-origin URL sink must answer CORS preflight with `Access-Control-Allow-Origin`,
`Access-Control-Allow-Headers: Content-Type`, and `Access-Control-Allow-Methods: POST, OPTIONS`.
Keep `user_cohorts` low-cardinality; they're for dimensions like plan tier or region, not
user IDs.

## Performance

Faultsense is built to stay off the critical path. The numbers below come from a React 19
stress harness running 50–1000 assertions with background DOM churn and CPU throttling,
measured with paired A/B runs (Wilcoxon signed-rank test, Hodges–Lehmann 95% CI) on an
Apple M4 Pro.

| Metric | Result |
|---|---|
| INP impact | **0 ms** across every configuration, including 1000 assertions under 4× CPU throttle |
| New long tasks | **Zero** — the agent never creates one in steady state |
| Idle heap footprint | **+1.7 KB** (measurable; 95% CI [+1.5, +1.7 KB]) |
| Heap @ 1000 assertions | **~140 KB** — sub-linear scaling (20× the assertions → ~1.8× the heap) |
| `MutationObserver` callback P99 (worst case) | **2.2 ms** at 1000 assertions under 4× CPU — 4% of the 50 ms long-task threshold |
| LCP impact (<200 assertions) | Undetectable (deltas fall within noise) |
| Bundle | **17.7 KB gzipped**, zero dependencies |

Demo benchmark (HTMX todolist, 30 pairs, 60 s soak):

| Scenario | LCP Δ | INP Δ | Heap Δ | Long tasks |
|---|---|---|---|---|
| Unthrottled, idle | −4 ms | n/a | +1.7 KB | 0 |
| Slow 4G, idle | −4 ms | n/a | +1.7 KB | 0 |
| Unthrottled, active | −4 ms (noise) | +0 ms | −6.9 KB (noise) | 0 |

A typical instrumented page carries 10–50 assertions; 1000 is a deliberate stress case. The
numbers above were measured on agent `v0.4.0` (Chromium-only; INP is a lab estimate in
headless Chromium). Reproduce them yourself:

```bash
npm run benchmark:stress   # scaling curve across assertion counts
npm run benchmark:demo     # against examples/todolist-htmx
```

See [`tools/benchmark/README.md`](tools/benchmark/README.md) for full methodology and
caveats.

## Worked examples

The [`examples/`](examples/) directory contains reference ports you can run locally. Both
use the same assertion keys, so you can diff them side-by-side and see how the
instrumentation pattern maps across rendering paradigms.

- **[todolist-tanstack](examples/todolist-tanstack/)** — React + TanStack Router + TanStack
  Start (virtual DOM, JSX interpolation for dynamic assertion values).
- **[todolist-htmx](examples/todolist-htmx/)** — HTMX 2 + Express + EJS (server-rendered
  fragments, `hx-boost` SPA nav, server-side interpolation).

## Package info

- **Dependencies:** none
- **Bundle:** 17.7 KB gzipped, single file
- **Browser support:** modern browsers (ES2020+)
- **Framework:** anything that renders HTML
- **License:** [FSL-1.1-ALv2](LICENSE)

## License & links

Licensed under [FSL-1.1-ALv2](LICENSE), the Functional Source License. It converts to
Apache 2.0 two years after each release.

- [Issues](https://github.com/Faultsense/faultsense-agent/issues)
- [Discussions](https://github.com/Faultsense/faultsense-agent/discussions)

<div align="center">
  <sub>A feature isn't shipped when it's deployed. It's shipped when it works.</sub>
</div>
