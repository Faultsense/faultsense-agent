import type { ApiPayload } from "@faultsense/agent";
/**
 * Console Collector — logs Faultsense assertions to the browser console.
 *
 * Each assertion result renders as a collapsible group with full payload detail.
 *
 * Usage (npm):
 *
 * ```js
 * import { init } from '@faultsense/agent';
 * import { consoleCollector } from '@faultsense/console-collector';
 *
 * init({
 *   releaseLabel: 'dev',
 *   collectorURL: consoleCollector,
 * });
 * ```
 *
 * Usage (script tag):
 *
 * ```html
 * <script src="faultsense-console.min.js" defer></script>
 * <script
 *   id="fs-agent"
 *   src="faultsense-agent.min.js"
 *   data-collector-url="console"
 *   data-release-label="dev"
 *   defer></script>
 * ```
 *
 * Self-registration onto window.Faultsense.collectors.console lives in
 * src/collectors/console-auto.ts. Importing this file is side-effect-free.
 */
export declare const consoleCollector: (payload: ApiPayload) => void;
