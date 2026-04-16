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
export const consoleCollector = (payload: ApiPayload) => {
  console.groupCollapsed(
    `🔍 FaultSense [${payload.status.toUpperCase()}] ${payload.assertion_key}`
  );
  console.log("Status:", payload.status);
  console.log("Trigger:", payload.assertion_trigger);
  console.log("Type:", payload.assertion_type);
  console.log("Type Value:", payload.assertion_type_value);
  console.log("Modifiers:", payload.assertion_type_modifiers);
  console.log("Assertion:", payload.assertion_key);
  console.log("Timestamp:", payload.timestamp);
  console.log("Release:", payload.release_label);
  console.log("Element Snapshot:", payload.element_snapshot);
  if (payload.error_context) {
    console.log("Error Context:", payload.error_context);
  }
  console.log("Full Payload:", payload);
  console.groupEnd();
};

