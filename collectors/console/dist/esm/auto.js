/*! Faultsense console collector (esm/auto) v0.5.5 | FSL-1.1-ALv2 | https://faultsense.com */

// src/collectors/console.ts
var consoleCollector = (payload) => {
  console.groupCollapsed(
    `\u{1F50D} FaultSense [${payload.status.toUpperCase()}] ${payload.assertion_key}`
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

// src/collectors/console-auto.ts
window.Faultsense = window.Faultsense || {};
window.Faultsense.collectors = window.Faultsense.collectors || {};
window.Faultsense.collectors.console = consoleCollector;
