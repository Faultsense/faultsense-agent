/**
 * Assertion Manager ** Mutation Warning **
 * The manager is designed to mutate the activeAssertions array
 * This may change.
 */
import { loadAssertions, storeAssertions } from "./storage";
import type {
  GlobalErrorHandler,
  Configuration,
  CompletedAssertion,
  Assertion,
  SpecEntry,
} from "../types";
import { sendToCollector } from "./server";
import { eventProcessor } from "../processors/events";
import { createElementProcessor, createAssertions } from "../processors/elements";
import { mutationHandler } from "../processors/mutations";
import { documentResolver, elementResolver, immediateResolver } from "../resolvers/dom";
import { globalErrorResolver } from "../resolvers/error";


import { eventTriggerAliases, domAssertions, assertionTriggerAttr } from "../config";
import {
  findAssertion,
  getAssertionsForMpaMode,
  getAssertionsToSettle,
  getPendingAssertions,
  getPendingDomAssertions,
  getSiblingGroup,
  dismissSiblings,
  isAssertionCompleted,
  isAssertionPending,
  retryCompletedAssertion,
} from "./assertion";
import { createAssertionTimeout, clearAssertionTimeout, clearAllTimeouts, scheduleGc, clearGcTimeout } from "./timeout";
import { eventResolver } from "../resolvers/event";
import { propertyResolver } from "../resolvers/property";
import { createLogger } from "../utils/logger";
import { findAndCreateOobAssertions } from "../processors/oob";
import { routeResolver } from "../resolvers/route";
import { sequenceResolver } from "../resolvers/sequence";
import { parseCustomEventTrigger, matchesDetail, isCustomEventTrigger } from "../utils/triggers/custom-events";
import { createCustomEventRegistry } from "../listeners/custom-events";
import { createSpecRegistry } from "./spec-registry";
import { emittedResolver } from "../resolvers/emitted";

// Assertion Manager with pluggable Processors
export function createAssertionManager(config: Configuration) {
  let activeAssertions: Assertion[] = loadAssertions(); // Initially load assertions
  let assertionCountCallback: ((count: number) => void) | null = null;
  const logger = createLogger(config);
  const customEventRegistry = createCustomEventRegistry();
  // Spec registry is created lazily — HTML-only customers (no config.spec,
  // no ignoreHtmlAttrs, no setSpec call) never pay the Map-allocation cost
  // or pull live references through the JSON discovery code paths.
  let specRegistry: ReturnType<typeof createSpecRegistry> | undefined;
  const ensureSpecRegistry = () => (specRegistry ??= createSpecRegistry());

  /**
   * Build a configured ElementProcessor closed over the registry + config
   * flag. All four caller sites (handleEvent, handleCustomEvent,
   * handleMutations, processElements) get the same shape — no positional
   * undefineds, no need to remember which slot ignoreHtmlAttrs lives in.
   */
  const makeProcessor = (
    triggers: string[],
    eventMode: boolean = false,
    event?: Event
  ) =>
    createElementProcessor({
      triggers,
      eventMode,
      event,
      specRegistry,
      ignoreHtmlAttrs: config.ignoreHtmlAttrs,
    });

  /**
   * Apply a spec diff to the document-level custom-event listener pool.
   * Added events get an ensureListener install. Removed events get torn
   * down only when no HTML element still references the same name —
   * cross-source reference counting keeps coexisting HTML + JSON safe.
   */
  const applySpecDiff = (diff: { addedEvents: string[]; removedEvents: string[] }): void => {
    for (const name of diff.addedEvents) {
      customEventRegistry.ensureListener(name, handleCustomEvent);
    }
    for (const name of diff.removedEvents) {
      if (!customEventRegistry.hasElementsFor(name)) {
        customEventRegistry.deregisterEventName(name);
      }
    }
  };

  const setSpec = (entries: readonly SpecEntry[] | undefined): void => {
    const diff = ensureSpecRegistry().setEntries(entries ?? []);
    applySpecDiff(diff);
  };

  const addSpec = (entries: readonly SpecEntry[]): void => {
    const diff = ensureSpecRegistry().addEntries(entries);
    applySpecDiff(diff);
  };

  const getSpec = (): readonly SpecEntry[] =>
    specRegistry ? specRegistry.getEntries() : [];

  /**
   * Check if an assertion condition is already met after current event processing
   * Uses a microtask to defer the check until after the current event processing is complete
   */
  const checkImmediateResolved = (assertion: Assertion): void => {
    Promise.resolve().then(() => {
      // Only check if the assertion is still pending (hasn't been completed by other means)
      if (isAssertionPending(assertion)) {
        let deferredResult: CompletedAssertion | null = null;

        // Check state-based DOM assertion types via immediateResolver.
        // Exclude types whose semantics require observing an actual DOM event
        // or mutation — a pre-existing match at trigger time is a false pass:
        // - loaded: must witness load/error event
        // - stable: inverted updated, must NOT witness mutations within timeout
        // - updated: must witness a DOM mutation, not just element existence
        // - added: pre-existing elements aren't "added" by this trigger
        // - removed: pre-missing elements weren't "removed" by this trigger
        // visible/hidden legitimately check current layout state.
        // OOB assertions still resolve against current state via a direct
        // immediateResolver call in settle(), so this exclusion is trigger-only.
        const eventBasedTypes = ["loaded", "stable", "updated", "added", "removed"];
        if (domAssertions.includes(assertion.type) && !eventBasedTypes.includes(assertion.type)) {
          const documentResults = immediateResolver([assertion], config);
          if (documentResults.length > 0) {
            deferredResult = documentResults[0];
          }
        }

        // Check if a route assertion already matches the current URL
        if (assertion.type === "route") {
          const routeResults = routeResolver([assertion], config);
          if (routeResults.length > 0) {
            deferredResult = routeResults[0];
          }
        }

        // Check if a sequence assertion's parent(s) have already passed
        if (assertion.type === "after") {
          const sequenceResults = sequenceResolver(activeAssertions, config)
            .filter(r => r.assertionKey === assertion.assertionKey && r.type === "after");
          if (sequenceResults.length > 0) {
            deferredResult = sequenceResults[0];
          }
        }

        if (deferredResult) {
          // Assertion is already satisfied, settle it immediately
          settle([deferredResult]);
        }
      }
    });
  };
  const enqueueAssertions = (newAssertions: Assertion[]): void => {
    // any assertsions marked for processing on the next page load should
    // skip the queue and be saved in storage
    storeAssertions(newAssertions.filter((a) => a.mpa_mode));

    newAssertions.filter((a) => !a.mpa_mode).forEach((newAssertion) => {
      // Check if an existing assertion matches by `assertionKey` and `type`
      const existingAssertion = findAssertion(newAssertion, activeAssertions);
      if (existingAssertion && isAssertionCompleted(existingAssertion)) {
        retryCompletedAssertion(existingAssertion, newAssertion);

        // Retry all siblings so the full conditional group is restored
        for (const sibling of getSiblingGroup(existingAssertion, activeAssertions)) {
          retryCompletedAssertion(sibling, sibling as Assertion);
        }

        // Reset SLA timeout if the assertion has an explicit timeout
        if (existingAssertion.timeout > 0) {
          createAssertionTimeout(existingAssertion, config, (completedAssertion) => {
            settle([completedAssertion]);
          });
        }

        // Also run immediate check for retried assertions
        checkImmediateResolved(existingAssertion);

      } else if (existingAssertion && isAssertionPending(existingAssertion)) {
        // Re-trigger on a pending assertion — track the attempt timestamp
        if (!existingAssertion.attempts) existingAssertion.attempts = [];
        existingAssertion.attempts.push(Date.now());
        checkImmediateResolved(existingAssertion);
      } else if (!existingAssertion) {
        activeAssertions.push(newAssertion);

        // Register a document listener for emitted assertions so the custom event can resolve them
        if (newAssertion.type === "emitted") {
          customEventRegistry.ensureListener(newAssertion.typeValue, handleCustomEvent);
        }

        // Invariants have no timeout and no immediate check — they stay pending
        // until the resolver detects a violation. Everything else gets both.
        if (newAssertion.trigger !== "invariant") {
          // SLA timeout: only for assertions with explicit fs-assert-timeout.
          // Assertions without it resolve naturally or are cleaned up by GC.
          if (newAssertion.timeout > 0) {
            // For conditional assertions, only the first sibling in a group gets a timeout.
            const shouldCreateTimeout = !newAssertion.conditionKey || !activeAssertions.some(
              (a) =>
                a !== newAssertion &&
                a.assertionKey === newAssertion.assertionKey &&
                (newAssertion.mutex || a.type === newAssertion.type) &&
                a.conditionKey !== undefined &&
                a.timeoutId !== undefined
            );

            if (shouldCreateTimeout) {
              createAssertionTimeout(newAssertion, config, (completedAssertion) => {
                settle([completedAssertion]);
              }, newAssertion.conditionKey ? activeAssertions : undefined);
            }
          }

          checkImmediateResolved(newAssertion);
        }
      }
    });

    // Schedule GC if there are pending assertions without SLA timeouts
    scheduleGc(config, () => {
      const now = Date.now();
      return activeAssertions.filter(
        (a) => !a.endTime && a.trigger !== "invariant" && !a.timeout && (now - a.startTime) > config.gcInterval
      );
    }, (completed) => settle(completed));

    // Notify about assertion count change
    if (assertionCountCallback) {
      assertionCountCallback(getPendingAssertions(activeAssertions).length);
    }
  };

  const handleEvent = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const triggers = eventTriggerAliases[event.type] || [event.type];
    const elementProcessor = makeProcessor(triggers, true, event);
    const created = eventProcessor(event, elementProcessor);
    enqueueAssertions(created);

    const completed = eventResolver(
      event,
      getPendingDomAssertions(activeAssertions)
    );
    settle(completed);
  };

  const handleCustomEvent = (event: Event): void => {
    const eventName = event.type;

    // Phase 1: Process trigger elements (creates new assertions)
    const registered = customEventRegistry.getElements(eventName);
    if (registered && registered.size > 0) {
      const matching: HTMLElement[] = [];
      for (const el of registered) {
        if (!el.isConnected) continue;
        const triggerValue = el.getAttribute(assertionTriggerAttr)!;
        const parsed = parseCustomEventTrigger(triggerValue);
        if (parsed.detailMatches && !matchesDetail(event as CustomEvent, parsed.detailMatches)) {
          continue;
        }
        matching.push(el);
      }

      if (matching.length > 0) {
        const triggers = [...new Set(matching.map(el => el.getAttribute(assertionTriggerAttr)!))];
        // JSON discovery for custom events runs SEPARATELY in Phase 1b via
        // findCustomEventCandidates — so this processor walks HTML only.
        // Bypass makeProcessor here to keep that intent explicit (no
        // specRegistry threading) rather than relying on a comment.
        const elementProcessor = createElementProcessor({
          triggers,
          ignoreHtmlAttrs: config.ignoreHtmlAttrs,
        });
        enqueueAssertions(elementProcessor(matching));
      }
    }

    // Phase 1b: Process JSON-spec entries waiting on this custom event.
    // findCustomEventCandidates returns pre-resolved (element, metadata)
    // pairs — drive each directly through createAssertions.
    if (specRegistry) {
      const specPairs = specRegistry.findCustomEventCandidates(eventName, event as CustomEvent);
      if (specPairs.length > 0) {
        const specAssertions: Assertion[] = [];
        for (const [element, metadata] of specPairs) {
          specAssertions.push(...createAssertions(element, metadata));
        }
        if (specAssertions.length > 0) enqueueAssertions(specAssertions);
      }
    }

    // Phase 2: Resolve pending emitted assertions
    const pendingEmitted = activeAssertions.filter(
      a => a.type === "emitted" && !a.endTime
    );
    if (pendingEmitted.length > 0) {
      const emittedResults = emittedResolver(event as CustomEvent, pendingEmitted);
      settle(emittedResults);
    }
  };

  /**
   * Register an element with a custom event trigger in the registry.
   * Creates a document-level listener for the event name if not already registered.
   */
  const registerCustomEventElement = (element: HTMLElement): void => {
    const triggerValue = element.getAttribute(assertionTriggerAttr);
    if (!triggerValue || !isCustomEventTrigger(triggerValue)) return;
    const { eventName } = parseCustomEventTrigger(triggerValue);
    customEventRegistry.registerElement(eventName, element, handleCustomEvent);
  };

  // Processor for DOM mutations (calls all registered mutation Processors)
  const handleMutations = (mutationsList: MutationRecord[]): void => {
    const elementProcessor = makeProcessor(["mount", "invariant"]);
    const created = mutationHandler<Assertion>(
      mutationsList,
      elementProcessor,
      getPendingDomAssertions(activeAssertions)
    );

    enqueueAssertions(created);

    // Check assertions immediately after enqueueing to handle already-loaded elements
    if (created.some(assertion => assertion.type === "loaded")) {
      checkAssertions();
    }

    const completed = mutationHandler<CompletedAssertion>(
      mutationsList,
      elementResolver,
      getPendingDomAssertions(activeAssertions)
    );
    settle(completed);

    // Register any newly added elements with custom event triggers. Gated by
    // ignoreHtmlAttrs — when the agent treats HTML attrs as non-authoritative,
    // it shouldn't pick up newly-rendered fs-trigger="event:*" elements either.
    if (!config.ignoreHtmlAttrs) {
      for (const mutation of mutationsList) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement) {
            registerCustomEventElement(node);
            const descendants = node.querySelectorAll(`[${assertionTriggerAttr}]`);
            for (const desc of Array.from(descendants) as HTMLElement[]) {
              registerCustomEventElement(desc);
            }
          }
        }
      }
    }
  };

  const handleGlobalError: GlobalErrorHandler = (errorInfo): void => {
    settle(
      globalErrorResolver(errorInfo, getPendingAssertions(activeAssertions))
    );
  };

  const handleNavigation = (): void => {
    const pending = getPendingAssertions(activeAssertions);
    settle(routeResolver(pending, config));
  };

  const checkAssertions = (): void => {
    const pendingAssertions = getPendingDomAssertions(activeAssertions);

    if (pendingAssertions.length) {
      // TODO - should we only run the documentResolver on assertions pulled from storage?
      settle(
        documentResolver(getAssertionsForMpaMode(pendingAssertions), config)
      );
      settle(propertyResolver(pendingAssertions, config));
    }

    // Route assertions (including MPA-loaded from storage)
    const allPending = getPendingAssertions(activeAssertions);
    settle(routeResolver(allPending, config));
  };

  const settle = (completeAssertions: CompletedAssertion[]): void => {
    // Dismiss siblings for any resolved conditional assertions
    for (const completed of completeAssertions) {
      if (completed.conditionKey && completed.status !== "dismissed") {
        const dismissed = dismissSiblings(completed, activeAssertions);
        completeAssertions.push(...dismissed);
      }
    }

    const toSettle = getAssertionsToSettle(completeAssertions);

    // Clear timeout timers for all completed assertions to ensure proper cleanup
    // This handles cases where assertions complete via resolvers other than timeout
    completeAssertions.forEach(assertion => {
      clearAssertionTimeout(assertion);
    });

    if (toSettle.length) {
      sendToCollector(toSettle, config);
    }

    // Auto-retry settled invariants so they re-enter the pending pool
    for (const a of toSettle) {
      if (a.trigger === "invariant") {
        retryCompletedAssertion(a, a as Assertion);
      }
    }

    // Trigger OOB assertions for any non-OOB assertions that passed or failed.
    // OOB assertions are created after the DOM change has already happened,
    // so we immediately try to resolve them via immediateResolver rather than
    // waiting for a future mutation.
    const passed = toSettle.filter(a => a.status === "passed" && !a.oob);
    const failed = toSettle.filter(a => a.status === "failed" && !a.oob);
    if (passed.length > 0 || failed.length > 0) {
      const oobAssertions = findAndCreateOobAssertions(passed, failed, specRegistry);
      if (oobAssertions.length > 0) {
        enqueueAssertions(oobAssertions);
        // Try to resolve immediately since the DOM state is already current.
        // Use the actual pending assertions from activeAssertions, not the raw
        // oobAssertions — enqueueAssertions may have matched them to existing
        // assertions via retryCompletedAssertion, discarding the new objects.
        const oobKeys = new Set(oobAssertions.map(a => a.assertionKey));
        const pendingOob = getPendingDomAssertions(activeAssertions).filter(
          a => a.oob && oobKeys.has(a.assertionKey)
        );
        const immediateResults = immediateResolver(pendingOob, config);
        if (immediateResults.length > 0) {
          settle(immediateResults);
        }
      }
    }

    // Notify about assertion count change after settling
    if (assertionCountCallback) {
      assertionCountCallback(getPendingAssertions(activeAssertions).length);
    }
  };

  // Set up SLA timeout timers for assertions loaded from storage that have explicit timeouts
  activeAssertions.forEach(assertion => {
    if (assertion.timeout > 0) {
      createAssertionTimeout(assertion, config, (completedAssertion) => {
        settle([completedAssertion]);
      });
    }
  });

  const processElements = (
    elements: HTMLElement[],
    triggers: string[]
  ): void => {
    const updatedAssertions = makeProcessor(triggers)(elements);
    enqueueAssertions(updatedAssertions);

    // Check assertions immediately after enqueueing to handle already-loaded elements
    if (updatedAssertions.some(assertion => assertion.type === "loaded")) {
      checkAssertions();
    }
  };

  /**
   * Run JSON-only discovery for the given triggers against scanRoot. The HTML
   * initial mount scan in init() seeds processElements with elements found via
   * `document.querySelectorAll([fs-trigger=...])`, which can't find JSON-only
   * candidates (those elements have no fs-trigger attribute). This method
   * complements that scan by walking the spec registry directly.
   */
  const scanSpecForTriggers = (triggers: string[], scanRoot: Element): void => {
    if (!specRegistry) return;
    const pairs = specRegistry.findCandidatesForScan(triggers, scanRoot);
    if (pairs.length === 0) return;
    const assertions: Assertion[] = [];
    for (const [element, metadata] of pairs) {
      assertions.push(...createAssertions(element, metadata));
    }
    if (assertions.length > 0) {
      enqueueAssertions(assertions);
      if (assertions.some(a => a.type === "loaded")) checkAssertions();
    }
  };

  // Save the active assertions to storage
  const saveActiveAssertions = (): void => {
    const openAssertions = getPendingAssertions(activeAssertions);
    storeAssertions(getAssertionsForMpaMode(openAssertions));
  };

  const clearActiveAssertions = (): void => {
    // Clear all timers before clearing assertions to prevent orphaned timers
    clearGcTimeout();
    clearAllTimeouts(activeAssertions);

    activeAssertions.length = 0;

    // Notify about assertion count change
    if (assertionCountCallback) {
      assertionCountCallback(0);
    }
  };

  const handlePageUnload = (): void => {
    // Only run unload logic when actually unloading (visibilityState=hidden),
    // not during SSR hydration which can fire pagehide without a real navigation.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      const now = Date.now();

      // Auto-pass pending invariants that were never violated
      const pendingInvariants = activeAssertions.filter(
        (a) => a.trigger === "invariant" && !a.endTime && a.previousStatus !== "failed"
      );
      if (pendingInvariants.length > 0) {
        const completed = pendingInvariants.map((inv) =>
          Object.assign(inv, {
            status: "passed" as const,
            endTime: now,
          })
        ) as CompletedAssertion[];
        sendToCollector(completed, config);
      }

      // Fail non-invariant assertions older than unloadGracePeriod.
      // Assertions younger than the grace period are silently dropped —
      // the user clicked and immediately navigated, not a failure.
      const staleOnUnload = activeAssertions.filter(
        (a) => !a.endTime && a.trigger !== "invariant" && (now - a.startTime) > config.unloadGracePeriod
      );
      if (staleOnUnload.length > 0) {
        const completed: CompletedAssertion[] = [];
        for (const a of staleOnUnload) {
          // Inverted resolution types (e.g., stable) pass on unload — no mutation occurred
          const status = a.invertResolution ? "passed" as const : "failed" as const;
          const result = Object.assign(a, {
            status,
            endTime: now,
          }) as unknown as CompletedAssertion;
          completed.push(result);
        }
        sendToCollector(completed, config);
      }
    }

    // Clear all timers during page navigation or refresh
    clearGcTimeout();
    clearAllTimeouts(activeAssertions);

    // Save active assertions for MPA mode
    saveActiveAssertions();
  };

  const setAssertionCountCallback = (callback: (count: number) => void): void => {
    assertionCountCallback = callback;
  };

  const getPendingAssertionCount = (): number => {
    return getPendingAssertions(activeAssertions).length;
  };

  const setUserContext = (context: Record<string, any> | undefined): void => {
    config.userContext = context;
  };

  const setUserCohorts = (cohorts: Record<string, string> | undefined): void => {
    config.userCohorts = cohorts;
  };

  // Expose the API for managing Processors, Resolvers and interacting with the manager
  return {
    handleEvent,
    handleCustomEvent,
    handleMutations,
    handleGlobalError,
    handleNavigation,
    checkAssertions,
    processElements,
    registerCustomEventElement,
    customEventRegistry,
    specRegistry,
    saveActiveAssertions,
    clearActiveAssertions,
    handlePageUnload,
    setAssertionCountCallback,
    getPendingAssertionCount,
    setUserContext,
    setUserCohorts,
    setSpec,
    addSpec,
    getSpec,
    scanSpecForTriggers,
  };
}
