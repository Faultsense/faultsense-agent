// Side-effecting self-install entry point.
//
// Importing this module attaches `init`, `cleanup`, `version`, and
// `registerCleanupHook` to `window.Faultsense`, then registers a
// DOMContentLoaded listener that reads config from a `<script id="fs-agent">`
// tag and auto-invokes init(). This is the entry the IIFE CDN bundle is
// built from (dist/iife/faultsense-agent.min.js) and is also exposed to
// bundler users who want script-tag parity via `@faultsense/agent/auto`.
//
// The default npm entry (./dist/esm/index.js, built from src/core.ts)
// is pure and has no side effects. Never merge this file's behavior into
// the default entry — tree-shaking relies on `sideEffects` in package.json
// pointing at this file (and dist/iife/*) as the only side-effecting paths.

import { init, registerCleanupHook, version } from "./index";
import { CollectorFunction, Configuration } from "./types";
import { isURL } from "./utils/object";

(function () {
  function extractConfigFromScriptTag(): Partial<Configuration> | null {
    const script = document.querySelector("script#fs-agent");

    if (!script) {
      return null;
    }

    const collectorUrl = script.getAttribute("data-collector-url");
    let resolvedCollectorUrl: string | CollectorFunction | undefined = collectorUrl || undefined;

    // Look up registered collectors by name (e.g., "console", "panel")
    if (collectorUrl && !isURL(collectorUrl)) {
      const registered = window.Faultsense?.collectors?.[collectorUrl];
      if (registered) {
        resolvedCollectorUrl = registered;
      } else {
        console.warn(`[Faultsense]: No collector registered for '${collectorUrl}'. Did you forget to load the collector script?`);
      }
    }

    return {
      apiKey: script.getAttribute("data-api-key") || (typeof resolvedCollectorUrl === "function" ? "dev-collector" : undefined),
      releaseLabel: script.getAttribute("data-release-label") || undefined,
      collectorURL: resolvedCollectorUrl,
      gcInterval: Number(script.getAttribute("data-gc-interval")) || undefined,
      unloadGracePeriod: Number(script.getAttribute("data-unload-grace-period")) || undefined,
      debug: script.getAttribute("data-debug") === "true" || undefined,
      userContext: (() => {
        const attr = script.getAttribute("data-user-context");
        if (!attr) return undefined;
        try { return JSON.parse(attr); } catch { return undefined; }
      })(),
    };
  }

  // Merge into the existing global — collectors may have registered before this script loaded.
  // NOTE: Do not use esbuild's --global-name with this pattern, as it overwrites window.Faultsense
  // with the module exports after this IIFE runs, destroying any previously registered collectors.
  window.Faultsense = window.Faultsense || {};
  window.Faultsense.collectors = window.Faultsense.collectors || {};
  window.Faultsense.version = version;
  window.Faultsense.init = init;
  window.Faultsense.registerCleanupHook = registerCleanupHook;

  // Automatically initialize Faultsense if the fs-agent script tag exists.
  // Tear down any prior init first — in Vite dev mode (e.g. TanStack Start)
  // the classic script tag effectively runs twice and both inits would leak
  // their listeners/MutationObserver otherwise.
  document.addEventListener("DOMContentLoaded", function () {
    const config = extractConfigFromScriptTag();
    if (config) {
      window.Faultsense!.cleanup?.();
      window.Faultsense!.cleanup = init(config);

      if (config.debug) {
        console.log(
          "[Faultsense]: initialized and cleanup function is stored as window.Faultsense.cleanup()"
        );
      }
    }
  });

})();
