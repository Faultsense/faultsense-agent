// Pure entry point for @faultsense/agent.
//
// This file contains the init() function and everything bundler users
// (Vite / webpack / esbuild / Rollup) import through the npm package's
// default entry. It deliberately has NO top-level statements that touch
// window, document, DOMContentLoaded, or anything else that requires a
// DOM — importing this module in a Node-only context (SSR, tests) must
// not throw.
//
// The side-effecting self-install logic (read <script id="fs-agent">,
// attach to window.Faultsense, wire DOMContentLoaded, auto-init) lives
// in src/auto.ts. The IIFE CDN bundle's entry point is auto.ts; the
// ESM and CJS bundler entries point here.

import { assertionTriggerAttr, supportedEvents } from "./config";
import { createConnectivityHandlers } from "./processors/connectivity";
import { createAssertionManager } from "./assertions/manager";
import { interceptErrors } from "./interceptors/error";
import { interceptNavigation } from "./interceptors/navigation";
import { setResolverDebugLogger } from "./resolvers/dom";
import { Configuration } from "./types";
import {
  isValidConfiguration,
  setConfiguration,
} from "./assertions/configuration";
import { createLogger } from "./utils/logger";

// Public type re-exports for collector packages and advanced consumers.
// `ApiPayload` is the assertion-result shape that collectors receive —
// the @faultsense/panel-collector and @faultsense/console-collector
// packages import it via `import type { ApiPayload } from "@faultsense/agent"`.
// Keeping the re-export here is what makes that import path valid.
export type { ApiPayload, Configuration, CollectorFunction } from "./types";

// Cleanup hooks registered by external collectors (e.g., panel collector).
// Shared module state: collectors call registerCleanupHook() before init(),
// init()'s returned cleanup function drains the array.
const cleanupHooks: (() => void)[] = [];

export function registerCleanupHook(fn: () => void): void {
  cleanupHooks.push(fn);
}

export const version: string = __FS_VERSION__;

export function init(initialConfig: Partial<Configuration>): () => void {
  let observer: MutationObserver | null = null;
  const config: Configuration = setConfiguration(initialConfig);
  const logger = createLogger(config);

  logger.log("[Faultsense]: Initializing agent...");

  if (!isValidConfiguration(config)) {
    logger.forceError(
      "[Faultsense]: Invalid configuration. Agent not initialized.",
      config
    );
    return () => { };
  }

  const assertionManager = createAssertionManager(config);

  // Wire up the dom resolver's debug logger so wait-for-pass no-match warnings
  // fire in debug mode. Cleared in the cleanup closure below.
  setResolverDebugLogger(logger);

  interceptErrors(assertionManager.handleGlobalError);
  interceptNavigation(assertionManager.handleNavigation);

  // Add event listeners
  const capturePhase = true;
  supportedEvents.forEach((eventType) => {
    document.addEventListener(
      eventType,
      assertionManager.handleEvent,
      capturePhase
    );
  });

  // Lifecycle event listeners
  window.addEventListener(
    "pagehide",
    assertionManager.handlePageUnload,
    capturePhase
  );
  window.addEventListener(
    "beforeunload",
    assertionManager.handlePageUnload,
    capturePhase
  );

  // Network state change listeners
  const { handleOnline, handleOffline } = createConnectivityHandlers(
    assertionManager.processElements
  );
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Set up a MutationObserver to handle DOM changes
  observer = new MutationObserver((mutations) => {
    assertionManager.handleMutations(mutations);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });

  // process all mount, load, or invariant triggered nodes already in the DOM
  const elements = document.querySelectorAll(
    `[${assertionTriggerAttr}="mount"], [${assertionTriggerAttr}="load"], [${assertionTriggerAttr}="invariant"]`
  );
  assertionManager.processElements(Array.from(elements) as HTMLElement[], [
    "mount",
    "load",
    "invariant",
  ]);

  // If the page loaded while offline, immediately process offline-triggered elements
  if (!navigator.onLine) {
    handleOffline();
  }

  // Register elements with custom event triggers (event:eventName)
  const customEventElements = document.querySelectorAll(
    `[${assertionTriggerAttr}^="event:"]`
  );
  for (const el of Array.from(customEventElements) as HTMLElement[]) {
    assertionManager.registerCustomEventElement(el);
  }

  // Ensure window.Faultsense exists and expose setUserContext on it.
  // init() is a function call — it's allowed to touch globals, even
  // though the module import is pure. Bundler users who call init()
  // get window.Faultsense.setUserContext as a usable API after this
  // point, matching the auto-install script-tag flow.
  window.Faultsense = window.Faultsense || {};
  window.Faultsense.setUserContext = assertionManager.setUserContext;

  // Run initial check
  assertionManager.checkAssertions();

  // cleanup function
  return () => {
    assertionManager.clearActiveAssertions();
    supportedEvents.forEach((eventType) => {
      document.removeEventListener(
        eventType,
        assertionManager.handleEvent,
        capturePhase
      );
    });
    window.removeEventListener(
      "pagehide",
      assertionManager.handlePageUnload,
      capturePhase
    );
    window.removeEventListener(
      "beforeunload",
      assertionManager.handlePageUnload,
      capturePhase
    );
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
    assertionManager.customEventRegistry.deregisterAll();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    setResolverDebugLogger(null);
    // Invoke cleanup hooks registered by external collectors
    cleanupHooks.forEach(fn => fn());
    cleanupHooks.length = 0;
  };
}
