// Side-effecting self-register entry for the console collector.
//
// Importing this module attaches `consoleCollector` onto
// `window.Faultsense.collectors.console`, which is where the agent's
// auto-install IIFE looks it up by name when the script tag declares
// `data-collector-url="console"`.
//
// The IIFE CDN bundle for `@faultsense/console-collector` is built from
// this file. The pure default entry (./index, built from
// src/collectors/console.ts) just exports the collector function.

import { consoleCollector } from "./console";

window.Faultsense = window.Faultsense || {};
window.Faultsense.collectors = window.Faultsense.collectors || {};
window.Faultsense.collectors.console = consoleCollector;
