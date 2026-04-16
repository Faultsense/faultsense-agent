/*! Faultsense console collector (cjs/index) v0.5.3 | FSL-1.1-ALv2 | https://faultsense.com */
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/collectors/console.ts
var console_exports = {};
__export(console_exports, {
  consoleCollector: () => consoleCollector
});
module.exports = __toCommonJS(console_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  consoleCollector
});
