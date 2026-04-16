// Side-effecting self-register entry for the panel collector.
//
// Importing this module attaches `panelCollector` onto
// `window.Faultsense.collectors.panel`, which is where the agent's
// auto-install IIFE (src/auto.ts) looks it up by name when the script
// tag declares `data-collector-url="panel"`.
//
// The IIFE CDN bundle for `@faultsense/panel-collector` is built from
// this file. Bundler users who want script-tag parity can also
// `import '@faultsense/panel-collector/auto'` in their entry point.
//
// The pure default entry (./index, built from src/collectors/panel.ts)
// just exports the collector function — no top-level window access.

import { panelCollector } from "./panel";

window.Faultsense = window.Faultsense || {};
window.Faultsense.collectors = window.Faultsense.collectors || {};
window.Faultsense.collectors.panel = panelCollector;
