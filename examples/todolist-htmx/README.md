# todolist-htmx

Faultsense todolist demo ported to **HTMX 2 + Express + EJS**. A line-for-line port of `examples/todolist-tanstack/` — same UI, same copy, same assertion coverage — built to prove Faultsense works identically against server-rendered HTML swaps as it does against React's virtual DOM.

## Why this exists

Faultsense is framework-agnostic in theory. This example is the proof: the same `fs-*` attributes, same assertion keys, same resolvers — but rendered by Express instead of React. If you can read the React version, you can read this one. If you're porting to another stack (Vue, Svelte, Alpine, Hotwire), start from the instrumentation mapping in this example.

## Run it

```bash
cd examples/todolist-htmx
npm install
npm run dev
# http://localhost:3099
```

Log in with `demo` / `demo`.

### Two authoring modes, same demo

The demo runs in either of two equivalent instrumentation modes — the same UI, same panel output, but two different code paths inside the agent:

| URL | Mode | What it shows |
|---|---|---|
| `http://localhost:3099/` | HTML attributes (default) | The canonical path — `fs-*` attributes on every interactive element drive the agent. |
| `http://localhost:3099/?mode=json` | JSON spec | The agent boots with `ignoreHtmlAttrs: true` and loads `public/todolist-htmx-spec.js` instead. The server also **strips every `fs-*` attribute** from rendered HTML — initial pages and HTMX swap fragments — so devtools shows a clean DOM and you can prove the JSON spec is doing the work. |

The `?mode=json` toggle is preserved across login/logout via a small middleware in `server.js` that rewrites `HX-Location` and the form actions. Refresh either page to confirm the panel still fires identical assertions.

Try this side by side to see the strip in action:

```bash
curl -s http://localhost:3099/todos | grep -oE 'fs-[a-z-]+' | wc -l         # ~90
curl -s "http://localhost:3099/todos?mode=json" | grep -oE 'fs-[a-z-]+' | wc -l  # ~3 (only EJS comment text)
```

The JSON spec at `public/todolist-htmx-spec.js` is hand-crafted — nothing auto-translates HTML→JSON. Each entry maps to one fs-instrumented element. Where the HTML version uses per-row dynamic IDs (`#todo-<id>`) or templated values (`[count=<%= todos.length + 1 %>]`), the JSON version uses a generic class selector and drops the templated modifier — same semantics, slightly less precision.

**Caveat:** connectivity triggers (`online`/`offline`) don't fire in `ignoreHtmlAttrs` mode (see `docs/public/agent/configuration.md`). The two `network/offline-banner-*` assertions stay pending in JSON mode; everything else fires.

## What you're looking at

Every interaction is monitored by a Faultsense assertion. Open the panel in the bottom-right to see them fire green as you interact. 17 assertion keys cover the whole flow — add, toggle, edit, cancel, delete, navigation, invariants, and the activity log.

Assertion keys are **identical** to the React example, so you can diff the two apps side by side and see how the same correctness contract expresses in two very different paradigms.

### Demos worth trying

| Action | What happens | Which assertion demonstrates it |
|---|---|---|
| Add a todo | New row appears, count updates, activity log updates | `todos/add-item`, `todos/count-updated`, `activity/log-updated` |
| Add `SLOW` | 2-second server delay trips the 500 ms SLA timeout | `todos/add-item` (timeout branch) |
| Add `FAIL`, then delete it | Server refuses the delete, inline error appears | `todos/remove-item` (error branch via `mutex="each"`) |
| Click "GC Demo" | Assertion targets a never-existing selector; GC sweeps it | `demo/gc-timeout` |
| Click the title | Hidden via inline JS → invariant violation in the panel | `layout/title-visible` (invariant) |
| Toggle offline in devtools | Offline banner appears and disappears | `network/offline-banner-shown` / `hidden` |
| Logout, then log back in | Virtual nav via hx-boost, route assertions fire | `auth/login`, `auth/logout` |

## How it's wired

- **`server.js`** — Express boot, layout helper, static assets.
- **`routes/auth.js`** — login/logout. Uses `HX-Location` (not `HX-Redirect`) so the agent session is preserved across virtual nav.
- **`routes/todos.js`** — CRUD. Every mutation response includes `partials/mutation-oob.ejs` — an OOB bundle that re-renders count displays and assertion attributes whose values depend on the current list length.
- **`views/layout.ejs`** — `<body hx-boost="true">` enables SPA-like nav. Script tags load `faultsense-panel.min.js`, `faultsense-agent.min.js`, and `htmx.min.js`.
- **`views/pages/`** — full-page templates (login, todos) that extend the layout.
- **`views/partials/`** — EJS fragments HTMX swaps in (todo-item, edit variant, error variants, OOB bundles, activity log, getting started).
- **`lib/store.js`** — in-memory todos with `SLOW` / `FAIL` demo behavior. Resets on server restart.
- **`lib/hx.js`** — `renderPage` (full page) and `renderFragment` (partial) helpers.

Faultsense and HTMX are symlinked from the repo-level `dist/`, so a rebuild of the agent immediately updates both examples without a copy step:

```bash
cd ../..
npm run build
# no copy needed — both examples now serve the new bundle
```

## HTMX gotchas surfaced by this port

Writing this port surfaced several HTMX-specific patterns worth knowing about. They're documented in full at `skills/faultsense-instrumentation/references/common-patterns.md` and `skills/faultsense-instrumentation/references/framework-syntax.md`. Short summary:

1. **Use `HX-Location`, not `HX-Redirect`.** HX-Redirect is a hard reload and drops pending assertions; HX-Location is client-side nav via fetch + pushState.
2. **Error responses don't swap by default.** Return 200 with an error fragment and route it via `HX-Retarget` / `HX-Reswap` for `fs-assert-*-error` to fire.
3. **`HX-Trigger` response header is the async dispatch path for `fs-assert-emitted`.** Avoids the synchronous-dispatch footgun.
4. **`fs-assert-oob` is not `hx-swap-oob`.** Same name, orthogonal concepts.
5. **Prefer `hx-swap-oob="innerHTML:#target"` over `outerHTML`** to preserve `fs-*` attributes on long-lived elements.
6. **Interpolate dynamic assertion values with `<%= expr %>` the same way you'd use JSX `{expr}`.** See the toggle checkbox in `views/partials/todo-item.ejs`.
7. **Stale attribute values on long-lived elements require an OOB re-render.** The Add button's `fs-assert-added-success=".todo-item[count=N]"` goes stale after every add/delete; the `mutation-oob.ejs` partial re-renders the button via `hx-swap-oob="outerHTML:#add-todo-button"` on every mutation response.

## What this port validated (and unvalidated)

The port started with an audit that flagged three risks under hx-boost: stale assertions leaking between virtual pages, invariants failing when their target element gets swapped away, and MPA assertions in `localStorage` never reloading. Working through the code turned all three into non-issues:

1. **Stale assertions** — cleaned up by the normal GC sweep (`config.gcInterval`). Assertion data is aggregated API-side across users; there's no real-time requirement that would justify an extra virtual-nav flush.
2. **Invariants across virtual nav** — `elementResolver` only consults `addedElements` and `updatedElements` for `visible`/`hidden` assertions (`src/resolvers/dom.ts:213-216`). Removing the watched element does NOT fail the invariant. It stays pending across the swap and resolves correctly on the real page unload — which is exactly the documented contract (`tests/assertions/invariant.test.ts:223` — "element removal leaves invariant pending — auto-passed on page unload").
3. **MPA + hx-boost** — `fs-assert-mpa="true"` is an explicit opt-in for hard nav. Under hx-boost you don't need it; the agent session is long-lived and regular DOM assertions work across virtual navs without any special handling. Documentation, not code.

Net result: no agent changes were needed. The port validated that the existing design already handles server-rendered-swap frameworks correctly, and the HTMX-specific gotchas above are all about *how you instrument* (server interpolation, HX-Trigger, hx-swap-oob=innerHTML) rather than *what the agent needs to do differently*.
