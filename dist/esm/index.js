/*! Faultsense agent (esm/index) v0.5.4 | FSL-1.1-ALv2 | https://faultsense.com */

// src/types.ts
var domAssertionTypes = ["added", "removed", "updated", "visible", "hidden", "loaded", "stable"];
var eventAssertionTypes = ["emitted"];
var routeAssertionTypes = ["route"];
var sequenceAssertionTypes = ["after"];
var allAssertionTypes = [...domAssertionTypes, ...eventAssertionTypes, ...routeAssertionTypes, ...sequenceAssertionTypes];
var domModifiers = ["text-matches", "classlist", "attrs-match", "value-matches", "checked", "disabled", "count", "count-min", "count-max", "focused", "focused-within"];

// src/config.ts
var defaultConfiguration = {
  gcInterval: 5e3,
  unloadGracePeriod: 2e3,
  collectorURL: "//faultsense.com/collector/",
  debug: false
};
var assertionPrefix = {
  details: "fs-",
  types: "fs-assert-",
  modifiers: "fs-assert-"
};
var assertionTriggerAttr = `${assertionPrefix.details}trigger`;
var domAssertions = [...domAssertionTypes];
var routeAssertions = [...routeAssertionTypes];
var sequenceAssertions = [...sequenceAssertionTypes];
var conditionKeySuffixPattern = /^[a-z][a-z0-9-]*$/;
var reservedConditionKeys = [...allAssertionTypes, "oob", "oob-fail"];
var supportedModifiersByType = {
  added: domModifiers,
  removed: domModifiers,
  updated: domModifiers,
  visible: domModifiers,
  hidden: domModifiers,
  stable: domModifiers,
  loaded: [],
  route: [],
  after: [],
  emitted: ["detail-matches"]
};
var invertedResolutionTypes = ["stable"];
var oobAttr = `${assertionPrefix.types}oob`;
var oobFailAttr = `${assertionPrefix.types}oob-fail`;
var inlineModifiers = ["text-matches", "classlist", "value-matches", "checked", "disabled", "count", "count-min", "count-max", "focused", "focused-within", "detail-matches"];
var supportedAssertions = {
  details: [
    "assert",
    "trigger"
  ],
  types: [...allAssertionTypes],
  modifiers: [
    "mpa",
    "timeout",
    "mutex"
  ]
};
var supportedEvents = [
  "click",
  "dblclick",
  "change",
  "blur",
  "submit",
  "load",
  "error",
  "mouseenter",
  "focusin",
  "input",
  "keydown"
];
var triggerEventMap = {
  hover: "mouseenter",
  focus: "focusin"
};
var eventTriggerAliases = {
  // error DOM event on media elements should also process load-triggered assertions
  error: ["error", "load"]
};
for (const [trigger, event] of Object.entries(triggerEventMap)) {
  if (!eventTriggerAliases[event]) eventTriggerAliases[event] = [event];
  eventTriggerAliases[event].push(trigger);
}
var supportedTriggers = ["mount", "unmount", "invariant", "online", "offline", "hover", "focus", ...supportedEvents];
var storageKey = "faultsense-active-assertions";

// src/processors/connectivity.ts
function processTrigger(trigger, processElements2) {
  const elements = document.querySelectorAll(
    `[${assertionTriggerAttr}="${trigger}"]`
  );
  processElements2(Array.from(elements), [trigger]);
}
function createConnectivityHandlers(processElements2) {
  const handleOnline = () => processTrigger("online", processElements2);
  const handleOffline = () => processTrigger("offline", processElements2);
  return { handleOnline, handleOffline };
}

// src/assertions/storage.ts
function loadAssertions() {
  const data = localStorage.getItem(storageKey);
  if (data) {
    localStorage.removeItem(storageKey);
    return JSON.parse(data);
  }
  return [];
}
function storeAssertions(activeAssertions) {
  if (activeAssertions.length) {
    const data = localStorage.getItem(storageKey);
    if (data) {
      let existing = JSON.parse(data);
      activeAssertions = [...existing, ...activeAssertions];
    }
    localStorage.setItem(storageKey, JSON.stringify(activeAssertions));
  }
}

// src/utils/logger.ts
var Logger = class {
  config;
  constructor(config) {
    this.config = config;
  }
  /**
   * Log a message to console if debug is enabled
   */
  log(...args) {
    if (this.config.debug) {
      console.log(...args);
    }
  }
  /**
   * Log an error to console if debug is enabled
   */
  error(...args) {
    if (this.config.debug) {
      console.error(...args);
    }
  }
  /**
   * Log a warning to console if debug is enabled
   */
  warn(...args) {
    if (this.config.debug) {
      console.warn(...args);
    }
  }
  /**
   * Log info to console if debug is enabled
   */
  info(...args) {
    if (this.config.debug) {
      console.info(...args);
    }
  }
  /**
   * Always log errors regardless of debug flag (for critical errors)
   */
  forceError(...args) {
    console.error(...args);
  }
  /**
   * Always log messages regardless of debug flag (for critical messages)
   */
  forceLog(...args) {
    console.log(...args);
  }
};
function createLogger(config) {
  return new Logger(config);
}

// src/utils/object.ts
function isURL(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// src/assertions/server.ts
function toPayload(assertion, config) {
  const payload = {
    api_key: config.apiKey || "",
    status: assertion.status,
    timestamp: new Date(assertion.startTime).toISOString(),
    assertion_type: assertion.type,
    assertion_type_value: assertion.typeValue,
    assertion_key: assertion.assertionKey,
    assertion_trigger: assertion.trigger,
    assertion_type_modifiers: Object.fromEntries(
      Object.entries(assertion.modifiers).filter(([k]) => k !== "mutex")
    ),
    attempts: assertion.attempts || [],
    condition_key: assertion.conditionKey || "",
    release_label: config.releaseLabel,
    element_snapshot: assertion.elementSnapshot
  };
  if (assertion.errorContext) {
    payload.error_context = assertion.errorContext;
  }
  if (config.userContext) {
    payload.user_context = config.userContext;
  }
  return payload;
}
function sendToFunction(assertions, config) {
  const logger = createLogger(config);
  if (!config.releaseLabel) {
    logger.forceError("Missing releaseLabel configuration for custom collector function.");
    return;
  }
  for (const assertion of assertions) {
    try {
      const payload = toPayload(assertion, config);
      config.collectorURL(payload);
    } catch (error) {
      logger.forceError("Custom collector function failed:", error);
    }
  }
}
function sendToServer(assertions, config) {
  const logger = createLogger(config);
  if (!config.collectorURL || !config.apiKey || !config.releaseLabel) {
    logger.forceError("Missing configuration for sending assertions to server.");
    return;
  }
  for (const assertion of assertions) {
    const payload = JSON.stringify(toPayload(assertion, config));
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        config.collectorURL,
        new Blob([payload], { type: "application/json" })
      );
    } else {
      fetch(config.collectorURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload
      }).catch((error) => logger.forceError(error));
    }
  }
}
function resolveCollector(config) {
  const url = config.collectorURL;
  if (typeof url === "function") return url;
  if (typeof url === "string" && !isURL(url)) {
    const registered = window.Faultsense?.collectors?.[url];
    if (registered) {
      config.collectorURL = registered;
      return registered;
    }
  }
  return url;
}
function sendToCollector(assertions, config) {
  const collector = resolveCollector(config);
  if (typeof collector === "function") {
    sendToFunction(assertions, { ...config, collectorURL: collector });
  } else {
    sendToServer(assertions, config);
  }
}

// src/processors/events.ts
function eventProcessor(event, processor) {
  const rawTarget = event.target;
  if (!rawTarget) return [];
  const host = rawTarget.closest?.(`[${assertionTriggerAttr}]`);
  return processor([host ?? rawTarget]);
}

// src/assertions/timeout.ts
function createAssertionTimeout(assertion, config, onTimeout, allAssertions) {
  clearAssertionTimeout(assertion);
  const timeoutDuration = assertion.timeout;
  const timerId = setTimeout(() => {
    delete assertion.timeoutId;
    const completed = completeAssertion(assertion, false);
    if (completed) {
      onTimeout(completed);
    }
  }, timeoutDuration);
  assertion.timeoutId = timerId;
}
function clearAssertionTimeout(assertion) {
  if (assertion.timeoutId) {
    clearTimeout(assertion.timeoutId);
    delete assertion.timeoutId;
  }
}
function clearAllTimeouts(assertions) {
  assertions.forEach((assertion) => {
    clearAssertionTimeout(assertion);
  });
}
var gcTimerId = null;
function scheduleGc(config, getStaleAssertions, onStale) {
  if (gcTimerId) return;
  gcTimerId = setTimeout(() => {
    gcTimerId = null;
    const stale = getStaleAssertions();
    if (stale.length > 0) {
      const completed = [];
      for (const assertion of stale) {
        const result = completeAssertion(assertion, false);
        if (result) completed.push(result);
      }
      if (completed.length > 0) {
        onStale(completed);
      }
    }
  }, config.gcInterval);
}
function clearGcTimeout() {
  if (gcTimerId) {
    clearTimeout(gcTimerId);
    gcTimerId = null;
  }
}

// src/assertions/assertion.ts
function findAssertion(assertion, allAssertions) {
  return allAssertions.find(
    (existing) => existing.assertionKey === assertion.assertionKey && existing.type === assertion.type && existing.conditionKey === assertion.conditionKey
  );
}
var getPendingAssertions = (assertions) => {
  return assertions.filter((a) => !a.endTime);
};
var getPendingDomAssertions = (assertions) => {
  return assertions.filter((a) => !a.endTime);
};
var getAssertionsForMpaMode = (assertions) => {
  return assertions.filter((a) => a.mpa_mode);
};
function isAssertionPending(assertion) {
  return !assertion.endTime && !assertion.status;
}
function isAssertionCompleted(assertion) {
  return !!assertion.endTime && !!assertion.status;
}
function retryCompletedAssertion(assertion, newAssertion) {
  assertion.modifiers = newAssertion.modifiers;
  assertion.typeValue = newAssertion.typeValue;
  assertion.elementSnapshot = newAssertion.elementSnapshot;
  if (assertion.status !== "dismissed") {
    assertion.previousStatus = assertion.status;
  }
  assertion.previousStartTime = assertion.startTime;
  assertion.previousEndTime = assertion.endTime;
  assertion.status = void 0;
  assertion.errorContext = void 0;
  assertion.endTime = void 0;
  assertion.startTime = Date.now();
  assertion.attempts = void 0;
}
function getAssertionsToSettle(completedAssertions) {
  return completedAssertions.filter(
    (assertion) => assertion.endTime && assertion.status !== "dismissed" && assertion.previousStatus !== assertion.status
  );
}
function getSiblingGroup(assertion, allAssertions) {
  if (!assertion.conditionKey) return [];
  return allAssertions.filter(
    (a) => a.assertionKey === assertion.assertionKey && a.conditionKey !== void 0 && a !== assertion && isMutexSibling(assertion, a)
  );
}
function isMutexSibling(resolved, candidate) {
  const mode = resolved.mutex || "type";
  if (mode === "type") {
    return candidate.type === resolved.type;
  }
  if (mode === "each") {
    return true;
  }
  if (resolved.mutexKeys) {
    if (!resolved.mutexKeys.includes(resolved.conditionKey)) return false;
    if (!candidate.conditionKey || !resolved.mutexKeys.includes(candidate.conditionKey)) return false;
  }
  return candidate.conditionKey !== resolved.conditionKey;
}
function dismissSiblings(assertion, allAssertions) {
  const siblings = getSiblingGroup(assertion, allAssertions);
  const dismissed = [];
  for (const sibling of siblings) {
    const result = dismissAssertion(sibling);
    if (result) dismissed.push(result);
  }
  return dismissed;
}
function dismissAssertion(assertion) {
  if (assertion.status !== "dismissed") {
    clearAssertionTimeout(assertion);
    return Object.assign(assertion, {
      status: "dismissed",
      endTime: Date.now()
    });
  }
  return null;
}
function completeAssertion(assertion, success) {
  if (assertion.invertResolution) {
    success = !success;
  }
  if (assertion.trigger === "invariant" && success && assertion.previousStatus !== "failed") {
    return null;
  }
  const newStatus = success ? "passed" : "failed";
  if (assertion.status !== newStatus) {
    clearAssertionTimeout(assertion);
    return Object.assign(assertion, {
      status: newStatus,
      endTime: Date.now()
    });
  }
  return null;
}

// src/resolvers/route.ts
function parseRoutePattern(pattern) {
  let remaining = pattern;
  let hash = null;
  const hashIdx = remaining.indexOf("#");
  if (hashIdx !== -1) {
    hash = remaining.slice(hashIdx + 1);
    remaining = remaining.slice(0, hashIdx);
  }
  let pathname = remaining;
  const params = [];
  const queryIdx = remaining.indexOf("?");
  if (queryIdx !== -1) {
    pathname = remaining.slice(0, queryIdx);
    const search = remaining.slice(queryIdx + 1);
    if (search) {
      for (const pair of search.split("&")) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx !== -1) {
          params.push([pair.slice(0, eqIdx), pair.slice(eqIdx + 1)]);
        } else if (pair) {
          params.push([pair, ""]);
        }
      }
    }
  }
  return { pathname, params, hash };
}
function validateRoutePattern(pattern) {
  try {
    new RegExp(`^${pattern.pathname}$`);
  } catch {
    return `pathname "${pattern.pathname}"`;
  }
  for (const [key, value] of pattern.params) {
    if (value) {
      try {
        new RegExp(`^${value}$`);
      } catch {
        return `query param "${key}" pattern "${value}"`;
      }
    }
  }
  if (pattern.hash !== null) {
    try {
      new RegExp(`^${pattern.hash}$`);
    } catch {
      return `hash pattern "${pattern.hash}"`;
    }
  }
  return null;
}
function routeResolver(activeAssertions, config) {
  const completed = [];
  for (const assertion of activeAssertions) {
    if (assertion.type !== "route") continue;
    if (assertion.endTime) continue;
    const pattern = parseRoutePattern(assertion.typeValue);
    const pathRegex = new RegExp(`^${pattern.pathname}$`);
    if (!pathRegex.test(window.location.pathname)) continue;
    if (pattern.params.length > 0) {
      const actualParams = new URLSearchParams(window.location.search);
      let paramsMatch = true;
      for (const [key, valuePattern] of pattern.params) {
        const actualValue = actualParams.get(key);
        if (actualValue === null) {
          paramsMatch = false;
          break;
        }
        if (valuePattern) {
          const valRegex = new RegExp(`^${valuePattern}$`);
          if (!valRegex.test(actualValue)) {
            paramsMatch = false;
            break;
          }
        }
      }
      if (!paramsMatch) continue;
    }
    if (pattern.hash !== null) {
      const actualHash = window.location.hash.slice(1);
      const hashRegex = new RegExp(`^${pattern.hash}$`);
      if (!hashRegex.test(actualHash)) continue;
    }
    const result = completeAssertion(assertion, true);
    if (result) completed.push(result);
  }
  return completed;
}

// src/utils/elements.ts
function isVisible(element) {
  return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}
function ensureSelector(el) {
  if (el.id) return `#${el.id}`;
  const existing = el.getAttribute("data-fs-id");
  if (existing) return `[data-fs-id="${existing}"]`;
  const id = `fs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  el.setAttribute("data-fs-id", id);
  return `[data-fs-id="${id}"]`;
}

// src/utils/triggers.ts
function parseTrigger(raw) {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return { base: raw };
  return {
    base: raw.substring(0, colonIdx),
    filter: raw.substring(colonIdx + 1)
  };
}

// src/utils/triggers/keyboard.ts
function parseKeyFilter(filter) {
  const parts = filter.split("+");
  const key = parts.pop();
  return {
    key,
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    meta: parts.includes("meta")
  };
}
function matchesKeyFilter(event, filter) {
  const keyMatch = event.key.toLowerCase() === filter.key.toLowerCase();
  return keyMatch && event.ctrlKey === filter.ctrl && event.shiftKey === filter.shift && event.altKey === filter.alt && event.metaKey === filter.meta;
}

// src/processors/elements.ts
function stripOuterQuotes(value) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' || first === "'") && first === last) {
    return value.slice(1, -1);
  }
  return value;
}
function parseTypeValue(raw) {
  const firstBracket = raw.indexOf("[");
  if (firstBracket === -1) {
    return { selector: raw, modifiers: {} };
  }
  const selector = raw.slice(0, firstBracket);
  const modifiers = {};
  let i = firstBracket;
  while (i < raw.length) {
    if (raw[i] !== "[") {
      i++;
      continue;
    }
    const eqIndex = raw.indexOf("=", i + 1);
    if (eqIndex === -1) break;
    const key = raw.slice(i + 1, eqIndex);
    let depth = 1;
    let j = eqIndex + 1;
    while (j < raw.length && depth > 0) {
      if (raw[j] === "[") depth++;
      else if (raw[j] === "]") depth--;
      if (depth > 0) j++;
    }
    if (depth === 0) {
      modifiers[key] = stripOuterQuotes(raw.slice(eqIndex + 1, j));
      i = j + 1;
    } else {
      break;
    }
  }
  return { selector, modifiers };
}
function resolveInlineModifiers(inlineMods) {
  const resolved = {};
  const attrChecks = {};
  for (const [key, value] of Object.entries(inlineMods)) {
    if (inlineModifiers.includes(key)) {
      resolved[key] = value;
    } else {
      attrChecks[key] = value;
    }
  }
  if (resolved["classlist"]) {
    const classMap = {};
    for (const pair of resolved["classlist"].split(",")) {
      const [cls, val] = pair.split(":");
      classMap[cls.trim()] = val.trim() === "true";
    }
    resolved["classlist"] = JSON.stringify(classMap);
  }
  if (Object.keys(attrChecks).length > 0) {
    resolved["attrs-match"] = JSON.stringify(attrChecks);
  }
  return resolved;
}
function parseMutex(value, conditionKey) {
  if (!conditionKey || value === void 0) return {};
  if (value === "") {
    console.warn('[Faultsense]: fs-assert-mutex requires a value ("type", "each", "conditions", or comma-separated condition keys).');
    return {};
  }
  if (value === "type") return { mutex: "type" };
  if (value === "each") return { mutex: "each" };
  if (value === "conditions") return { mutex: "conditions" };
  return {
    mutex: "conditions",
    mutexKeys: value.split(",").map((k) => k.trim())
  };
}
function parseDynamicTypes(element) {
  const prefix = assertionPrefix.types;
  const types = [];
  for (const attr of Array.from(element.attributes)) {
    if (!attr.name.startsWith(prefix)) continue;
    const suffix = attr.name.slice(prefix.length);
    for (const domType of allAssertionTypes) {
      if (suffix.startsWith(`${domType}-`)) {
        const remaining = suffix.slice(domType.length + 1);
        if (conditionKeySuffixPattern.test(remaining)) {
          if (reservedConditionKeys.includes(remaining)) {
            console.warn(
              `[Faultsense]: Condition key "${remaining}" conflicts with a reserved name. Avoid using assertion type names as condition keys.`,
              { element }
            );
          }
          const { selector, modifiers } = parseTypeValue(attr.value);
          types.push({
            type: domType,
            value: selector,
            modifiers,
            conditionKey: remaining
          });
        }
        break;
      }
    }
  }
  return types;
}
function createElementProcessor(triggers, eventMode = false, event) {
  return function(targets) {
    return processElements(targets, triggers, eventMode, event);
  };
}
function processElements(targets, triggers, eventMode = false, event) {
  const allAssertions = [];
  for (const target of targets) {
    const elementsToProcess = [];
    if (isProcessableElement(target, triggers, event)) {
      elementsToProcess.push(target);
    } else if (!eventMode) {
      const elementsWithTriggers = target.querySelectorAll(`[${assertionTriggerAttr}]`);
      for (const element of Array.from(elementsWithTriggers)) {
        if (isProcessableElement(element, triggers, event)) {
          elementsToProcess.push(element);
        }
      }
    }
    for (const element of elementsToProcess) {
      const assertionMetadata = parseAssertions(element);
      const newAssertions = createAssertions(element, assertionMetadata);
      allAssertions.push(...newAssertions);
    }
  }
  return allAssertions;
}
function isProcessableElement(element, triggers, event) {
  const raw = element.getAttribute(assertionTriggerAttr);
  if (!raw) return false;
  const { base, filter } = parseTrigger(raw);
  if (base === "event") {
    return triggers.includes(raw);
  }
  if (!triggers.includes(base)) return false;
  if (filter && event instanceof KeyboardEvent) {
    return matchesKeyFilter(event, parseKeyFilter(filter));
  }
  return true;
}
function parseAssertions(element) {
  let assertionMetaData = {
    details: {},
    types: [],
    modifiers: {}
  };
  const processDetails = (keys) => {
    for (const key of keys) {
      const value = element.getAttribute(`${assertionPrefix.details}${key}`);
      if (value !== null) {
        assertionMetaData.details[key] = value;
      }
    }
  };
  const processTypes = (keys) => {
    for (const key of keys) {
      const value = element.getAttribute(`${assertionPrefix.types}${key}`);
      if (value !== null) {
        const parsed = parseTypeValue(value);
        assertionMetaData.types.push({
          type: key,
          value: parsed.selector,
          modifiers: Object.keys(parsed.modifiers).length > 0 ? parsed.modifiers : void 0
        });
      }
    }
  };
  const processModifiers = (keys) => {
    for (const key of keys) {
      const value = element.getAttribute(`${assertionPrefix.modifiers}${key}`);
      if (value !== null) {
        assertionMetaData.modifiers[key] = value;
      }
    }
  };
  processDetails(supportedAssertions.details);
  processTypes(supportedAssertions.types);
  processModifiers(supportedAssertions.modifiers);
  assertionMetaData.types.push(...parseDynamicTypes(element));
  return assertionMetaData;
}
function isValidAssertionMetadata(assertionMetadata, element) {
  const details = { element };
  if (!assertionMetadata.details["assert"]) {
    console.error(
      "[Faultsense]: Missing 'fs-assert' on assertion.",
      details
    );
    return false;
  }
  if (assertionMetadata.types.length === 0) {
    console.error("[Faultsense]: An assertion type must be provided.", details);
    return false;
  }
  return true;
}
function createAssertions(element, metadata) {
  if (!isValidAssertionMetadata(metadata, element)) {
    return [];
  }
  return metadata.types.filter((typeEntry) => {
    if (typeEntry.type === "route") {
      if (!typeEntry.value) {
        console.warn(
          `[Faultsense]: Route assertion on "${metadata.details["assert"]}" has no pattern. Skipping.`
        );
        return false;
      }
      const parsed = parseRoutePattern(typeEntry.value);
      const invalid = validateRoutePattern(parsed);
      if (invalid) {
        console.warn(
          `[Faultsense]: Invalid route pattern on "${metadata.details["assert"]}": ${invalid}. Skipping.`
        );
        return false;
      }
    }
    return true;
  }).map((typeEntry) => {
    const resolvedMods = typeEntry.modifiers ? typeEntry.type === "route" ? typeEntry.modifiers : resolveInlineModifiers(typeEntry.modifiers) : {};
    const mergedModifiers = { ...metadata.modifiers, ...resolvedMods };
    const allowedMods = supportedModifiersByType[typeEntry.type];
    if (allowedMods) {
      for (const mod of Object.keys(resolvedMods)) {
        if (!allowedMods.includes(mod)) {
          console.warn(
            `[Faultsense]: Modifier "${mod}" does not apply to "${typeEntry.type}" assertions. Found on "${metadata.details["assert"]}".`
          );
        }
      }
    }
    const hasCountMod = resolvedMods["count"] || resolvedMods["count-min"] || resolvedMods["count-max"];
    if (hasCountMod && !typeEntry.value) {
      console.warn(
        `[Faultsense]: Count modifier on self-referencing assertion "${metadata.details["assert"]}" is nonsensical (count is always 1).`
      );
    }
    let typeValue = typeEntry.value;
    if (!typeValue && domAssertions.includes(typeEntry.type)) {
      typeValue = ensureSelector(element);
    }
    let mpaMode = Boolean(metadata.modifiers["mpa"]);
    if (typeEntry.type === "emitted" && mpaMode) {
      console.warn(
        `[Faultsense]: "emitted" assertions cannot persist across page navigation (MPA mode). Ignoring fs-assert-mpa on "${metadata.details["assert"]}".`
      );
      mpaMode = false;
    }
    return {
      assertionKey: metadata.details["assert"],
      endTime: void 0,
      elementSnapshot: element.outerHTML,
      trigger: metadata.details.trigger,
      mpa_mode: mpaMode,
      startTime: Date.now(),
      status: void 0,
      timeout: Number(metadata.modifiers["timeout"]) || 0,
      type: typeEntry.type,
      typeValue,
      modifiers: mergedModifiers,
      conditionKey: typeEntry.conditionKey,
      ...parseMutex(metadata.modifiers["mutex"], typeEntry.conditionKey),
      invertResolution: invertedResolutionTypes.includes(typeEntry.type) || void 0
    };
  });
}

// src/processors/mutations.ts
function mutationHandler(mutationsList, handler, assertions) {
  const addedElements = [];
  const updatedElements = [];
  const removedElements = [];
  for (const mutation of mutationsList) {
    if (mutation.type === "childList") {
      mutation.addedNodes.forEach((node) => {
        if (node.getAttribute) {
          addedElements.push(node);
          const descendants = node.querySelectorAll?.("*");
          if (descendants) {
            addedElements.push(...Array.from(descendants));
          }
        }
      });
      mutation.removedNodes.forEach((node) => {
        if (node.getAttribute) {
          removedElements.push(node);
          const descendants = node.querySelectorAll?.("*");
          if (descendants) {
            removedElements.push(...Array.from(descendants));
          }
        }
      });
      updatedElements.push(mutation.target);
    }
    if (mutation.type === "attributes") {
      updatedElements.push(mutation.target);
    }
    if (mutation.type === "characterData" && mutation.target.parentElement) {
      updatedElements.push(mutation.target.parentElement);
    }
  }
  return handler(
    addedElements,
    removedElements,
    updatedElements,
    assertions
  );
}

// src/resolvers/dom.ts
var debugLogger = null;
function setResolverDebugLogger(logger) {
  debugLogger = logger;
}
var assertionTypeMatchers = {
  _default: (assertion) => (el) => el.matches(assertion.typeValue),
  updated: (assertion) => {
    if (!assertion.typeValue) return (el) => !!el;
    const targetElement = document.querySelector(assertion.typeValue);
    return (el) => el.matches(assertion.typeValue) || targetElement?.contains(el) || false;
  },
  // stable uses the same subtree matcher as updated
  stable: (assertion) => {
    if (!assertion.typeValue) return (el) => !!el;
    const targetElement = document.querySelector(assertion.typeValue);
    return (el) => el.matches(assertion.typeValue) || targetElement?.contains(el) || false;
  }
};
var modifiersMap = {
  "text-matches": (el, modValue) => el.textContent ? new RegExp(modValue).test(el.textContent) : false,
  "attrs-match": (el, modValue) => {
    let attrs;
    try {
      attrs = JSON.parse(modValue);
    } catch (e) {
      return false;
    }
    return Object.entries(attrs).every(([key, value]) => {
      try {
        return new RegExp("^(?:" + value + ")$").test(el.getAttribute(key) || "");
      } catch {
        return el.getAttribute(key) === value;
      }
    });
  },
  classlist: (el, modValue) => {
    let classMap;
    try {
      classMap = JSON.parse(modValue);
    } catch (e) {
      return false;
    }
    return Object.entries(classMap).every(
      ([className, shouldExist]) => shouldExist ? el.classList.contains(className) : !el.classList.contains(className)
    );
  },
  "value-matches": (el, modValue) => "value" in el ? new RegExp(modValue).test(el.value) : false,
  checked: (el, modValue) => "checked" in el ? el.checked === (modValue === "true") : false,
  disabled: (el, modValue) => {
    const isDisabled = "disabled" in el && el.disabled || el.getAttribute("aria-disabled") === "true";
    return modValue === "true" ? isDisabled : !isDisabled;
  },
  focused: (el, modValue) => document.activeElement === el === (modValue === "true"),
  "focused-within": (el, modValue) => el.matches(":focus-within") === (modValue === "true")
};
var baseAssertionFns = {
  visible: (el) => isVisible(el),
  hidden: (el) => !isVisible(el)
};
var selectorLevelModifiers = /* @__PURE__ */ new Set(["count", "count-min", "count-max"]);
function getAssertionModifierFns(assertion) {
  const mods = [];
  if (baseAssertionFns[assertion.type]) {
    mods.push(baseAssertionFns[assertion.type]);
  }
  for (const [modName, modValue] of Object.entries(assertion.modifiers)) {
    if (modifiersMap[modName] && !selectorLevelModifiers.has(modName)) {
      mods.push((el) => modifiersMap[modName](el, modValue));
    }
  }
  return mods;
}
function passesAllModifiers(el, modifierFns) {
  for (const fn of modifierFns) {
    if (!fn(el)) return false;
  }
  return true;
}
function checkCountModifiers(assertion) {
  const mods = assertion.modifiers;
  if (!mods) return null;
  const count = mods["count"];
  const countMin = mods["count-min"];
  const countMax = mods["count-max"];
  if (!count && !countMin && !countMax) return null;
  if (!assertion.typeValue) return null;
  const actual = document.querySelectorAll(assertion.typeValue).length;
  if (count && actual !== Number(count)) return false;
  if (countMin && actual < Number(countMin)) return false;
  if (countMax && actual > Number(countMax)) return false;
  return null;
}
function handleAssertion(elements, assertion, matchFn) {
  const matchingElements = elements.filter(matchFn);
  if (assertion.invertResolution) {
    if (matchingElements.length === 0) return null;
    return completeAssertion(assertion, true);
  }
  if (matchingElements.length === 0) return null;
  if (checkCountModifiers(assertion) === false) {
    return assertion.trigger === "invariant" ? completeAssertion(assertion, false) : null;
  }
  const modifierFns = getAssertionModifierFns(assertion);
  if (modifierFns.length === 0) {
    return completeAssertion(assertion, true);
  }
  for (const el of matchingElements) {
    if (passesAllModifiers(el, modifierFns)) {
      return completeAssertion(assertion, true);
    }
  }
  debugLogger?.warn(
    `[Faultsense]: Assertion "${assertion.assertionKey}" (${assertion.type}=${JSON.stringify(
      assertion.typeValue
    )}) matched ${matchingElements.length} element(s) but no element satisfied all modifiers. Still pending.`
  );
  return assertion.trigger === "invariant" ? completeAssertion(assertion, false) : null;
}
var elementResolver = (addedElements, removedElements, updatedElements, assertions) => {
  return assertions.reduce((acc, assertion) => {
    if (!domAssertions.includes(assertion.type)) {
      return acc;
    }
    let elements = [];
    switch (assertion.type) {
      case "added":
        elements = addedElements;
        break;
      case "removed":
        elements = removedElements;
        break;
      case "updated":
        elements = updatedElements;
        break;
      case "stable":
        elements = updatedElements;
        break;
      case "visible":
      case "hidden":
        elements = [...addedElements, ...updatedElements];
        break;
    }
    const matcher = (assertionTypeMatchers[assertion.type] || assertionTypeMatchers._default)(assertion);
    const completed = handleAssertion(elements, assertion, matcher);
    if (completed) {
      acc.push(completed);
    }
    return acc;
  }, []);
};
function resolveFromDocument(assertions) {
  return assertions.reduce((acc, assertion) => {
    if (!domAssertions.includes(assertion.type)) return acc;
    const matchingElement = document.querySelector(
      assertion.typeValue
    );
    if (assertion.type === "removed") {
      if (matchingElement) return acc;
      const completed = completeAssertion(assertion, true);
      if (completed) acc.push(completed);
      return acc;
    }
    if (!matchingElement) return acc;
    if (checkCountModifiers(assertion) === false) return acc;
    if (passesAllModifiers(matchingElement, getAssertionModifierFns(assertion))) {
      const completed = completeAssertion(assertion, true);
      if (completed) acc.push(completed);
    }
    return acc;
  }, []);
}
var immediateResolver = (assertions, _config) => resolveFromDocument(assertions);
var documentResolver = (assertions, _config) => resolveFromDocument(assertions);

// src/resolvers/error.ts
var globalErrorResolver = (errorInfo, assertions) => {
  for (const assertion of assertions) {
    if (!assertion.endTime) {
      if (!assertion.errorContext) {
        assertion.errorContext = errorInfo;
      }
    }
  }
  return [];
};

// src/resolvers/event.ts
function eventResolver(event, assertions) {
  return assertions.reduce((acc, assertion) => {
    const selector = assertion.typeValue;
    const el = event.target;
    if (assertion.type === "loaded") {
      if (!el || !el.matches(selector)) {
        return acc;
      }
      if (event.type === "load") {
        const completed = completeAssertion(assertion, true);
        if (completed) {
          acc.push(completed);
        }
      }
      if (event.type === "error") {
        const completed = completeAssertion(assertion, false);
        if (completed) {
          acc.push(completed);
        }
      }
    }
    return acc;
  }, []);
}

// src/resolvers/property.ts
var propertyResolver = (assertions, _config) => {
  return assertions.reduce((acc, assertion) => {
    const selector = assertion.typeValue;
    if (assertion.type === "loaded") {
      const el = document.querySelector(selector);
      if (el instanceof HTMLImageElement && el.complete) {
        const completed = completeAssertion(assertion, el.naturalWidth > 0);
        if (completed) {
          acc.push(completed);
        }
      }
      if (el instanceof HTMLVideoElement && el.readyState >= 3) {
        const completed = completeAssertion(assertion, true);
        if (completed) {
          acc.push(completed);
        }
      }
    }
    return acc;
  }, []);
};

// src/processors/oob.ts
function findOobByAttr(attr, triggerName, parentAssertions) {
  if (parentAssertions.length === 0) return [];
  const parentKeys = new Set(parentAssertions.map((a) => a.assertionKey));
  const oobElements = document.querySelectorAll(`[${attr}]`);
  const assertions = [];
  for (const el of Array.from(oobElements)) {
    const assertionKey = el.getAttribute(`${assertionPrefix.details}assert`);
    if (!assertionKey) continue;
    const attrValue = el.getAttribute(attr);
    if (!attrValue) continue;
    const keys = attrValue.split(",").map((k) => k.trim());
    if (!keys.some((k) => parentKeys.has(k))) continue;
    for (const type of domAssertions) {
      const typeAttrName = `${assertionPrefix.types}${type}`;
      const typeAttrValue = el.getAttribute(typeAttrName);
      if (!typeAttrValue) continue;
      const { selector, modifiers } = parseTypeValue(typeAttrValue);
      const resolvedMods = resolveInlineModifiers(modifiers);
      const targetSelector = selector || ensureSelector(el);
      assertions.push({
        assertionKey,
        elementSnapshot: el.outerHTML,
        mpa_mode: false,
        trigger: triggerName,
        timeout: Number(el.getAttribute(`${assertionPrefix.modifiers}timeout`)) || 0,
        startTime: Date.now(),
        type,
        typeValue: targetSelector,
        modifiers: resolvedMods,
        oob: true
      });
    }
  }
  return assertions;
}
function findAndCreateOobAssertions(passedAssertions, failedAssertions = []) {
  return [
    ...findOobByAttr(oobAttr, "oob", passedAssertions),
    ...findOobByAttr(oobFailAttr, "oob-fail", failedAssertions)
  ];
}

// src/resolvers/sequence.ts
function sequenceResolver(activeAssertions, _config) {
  const completed = [];
  for (const assertion of activeAssertions) {
    if (assertion.type !== "after") continue;
    if (assertion.endTime) continue;
    const requiredKeys = assertion.typeValue.split(",").map((k) => k.trim());
    const firstUnmet = requiredKeys.find(
      (key) => !activeAssertions.some((a) => a.assertionKey === key && a.status === "passed")
    );
    const result = completeAssertion(
      assertion,
      !firstUnmet
    );
    if (result) completed.push(result);
  }
  return completed;
}

// src/utils/triggers/custom-events.ts
var CUSTOM_EVENT_PREFIX = "event:";
function parseCustomEventTrigger(raw) {
  const withoutPrefix = raw.slice(CUSTOM_EVENT_PREFIX.length);
  const { selector, modifiers } = parseTypeValue(withoutPrefix);
  const result = { eventName: selector };
  if (modifiers["detail-matches"]) {
    result.detailMatches = parseDetailMatches(modifiers["detail-matches"]);
  }
  return result;
}
function parseDetailMatches(raw) {
  const result = {};
  for (const pair of raw.split(",")) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;
    const key = pair.slice(0, colonIdx).trim();
    const value = pair.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}
function matchesDetail(event, matchers) {
  const detail = event.detail;
  if (detail === null || detail === void 0) return false;
  if (typeof detail !== "object") {
    const entries = Object.entries(matchers);
    return entries.length === 1 && String(detail) === entries[0][1];
  }
  for (const [key, expected] of Object.entries(matchers)) {
    if (String(detail[key]) !== expected) return false;
  }
  return true;
}
function isCustomEventTrigger(triggerValue) {
  return triggerValue.startsWith(CUSTOM_EVENT_PREFIX);
}

// src/listeners/custom-events.ts
function createCustomEventRegistry() {
  const listeners = /* @__PURE__ */ new Map();
  const elements = /* @__PURE__ */ new Map();
  function registerElement(eventName, element, handler) {
    if (!elements.has(eventName)) {
      elements.set(eventName, /* @__PURE__ */ new Set());
    }
    elements.get(eventName).add(element);
    ensureListener(eventName, handler);
  }
  function ensureListener(eventName, handler) {
    if (!listeners.has(eventName)) {
      listeners.set(eventName, handler);
      document.addEventListener(eventName, handler);
    }
  }
  function deregisterElement(eventName, element) {
    const set = elements.get(eventName);
    if (set) {
      set.delete(element);
    }
  }
  function getElements(eventName) {
    return elements.get(eventName);
  }
  function isRegistered(eventName) {
    return listeners.has(eventName);
  }
  function deregisterAll() {
    for (const [eventName, handler] of listeners) {
      document.removeEventListener(eventName, handler);
    }
    listeners.clear();
    elements.clear();
  }
  return {
    registerElement,
    ensureListener,
    deregisterElement,
    getElements,
    isRegistered,
    deregisterAll
  };
}

// src/resolvers/emitted.ts
function emittedResolver(event, pendingEmitted) {
  const completed = [];
  for (const assertion of pendingEmitted) {
    if (assertion.type !== "emitted") continue;
    if (assertion.endTime) continue;
    if (assertion.typeValue !== event.type) continue;
    if (assertion.modifiers?.["detail-matches"]) {
      const detail = event.detail;
      if (detail === null || detail === void 0) continue;
      const raw = assertion.modifiers["detail-matches"];
      const matchers = parseDetailMatchesRegex(raw);
      if (typeof detail !== "object") {
        const entries = Object.entries(matchers);
        if (entries.length !== 1 || !new RegExp(entries[0][1]).test(String(detail))) {
          continue;
        }
      } else {
        let allMatch = true;
        for (const [key, pattern] of Object.entries(matchers)) {
          if (!(key in detail) || !new RegExp(pattern).test(String(detail[key]))) {
            allMatch = false;
            break;
          }
        }
        if (!allMatch) continue;
      }
    }
    const result = completeAssertion(assertion, true);
    if (result) completed.push(result);
  }
  return completed;
}
function parseDetailMatchesRegex(raw) {
  const result = {};
  for (const pair of raw.split(",")) {
    const colonIdx = pair.indexOf(":");
    if (colonIdx === -1) continue;
    const key = pair.slice(0, colonIdx).trim();
    const value = pair.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

// src/assertions/manager.ts
function createAssertionManager(config) {
  let activeAssertions = loadAssertions();
  let assertionCountCallback = null;
  const logger = createLogger(config);
  const customEventRegistry = createCustomEventRegistry();
  const checkImmediateResolved = (assertion) => {
    Promise.resolve().then(() => {
      if (isAssertionPending(assertion)) {
        let deferredResult = null;
        const eventBasedTypes = ["loaded", "stable", "updated", "added", "removed"];
        if (domAssertions.includes(assertion.type) && !eventBasedTypes.includes(assertion.type)) {
          const documentResults = immediateResolver([assertion], config);
          if (documentResults.length > 0) {
            deferredResult = documentResults[0];
          }
        }
        if (assertion.type === "route") {
          const routeResults = routeResolver([assertion], config);
          if (routeResults.length > 0) {
            deferredResult = routeResults[0];
          }
        }
        if (assertion.type === "after") {
          const sequenceResults = sequenceResolver(activeAssertions, config).filter((r) => r.assertionKey === assertion.assertionKey && r.type === "after");
          if (sequenceResults.length > 0) {
            deferredResult = sequenceResults[0];
          }
        }
        if (deferredResult) {
          settle([deferredResult]);
        }
      }
    });
  };
  const enqueueAssertions = (newAssertions) => {
    storeAssertions(newAssertions.filter((a) => a.mpa_mode));
    newAssertions.filter((a) => !a.mpa_mode).forEach((newAssertion) => {
      const existingAssertion = findAssertion(newAssertion, activeAssertions);
      if (existingAssertion && isAssertionCompleted(existingAssertion)) {
        retryCompletedAssertion(existingAssertion, newAssertion);
        for (const sibling of getSiblingGroup(existingAssertion, activeAssertions)) {
          retryCompletedAssertion(sibling, sibling);
        }
        if (existingAssertion.timeout > 0) {
          createAssertionTimeout(existingAssertion, config, (completedAssertion) => {
            settle([completedAssertion]);
          });
        }
        checkImmediateResolved(existingAssertion);
      } else if (existingAssertion && isAssertionPending(existingAssertion)) {
        if (!existingAssertion.attempts) existingAssertion.attempts = [];
        existingAssertion.attempts.push(Date.now());
        checkImmediateResolved(existingAssertion);
      } else if (!existingAssertion) {
        activeAssertions.push(newAssertion);
        if (newAssertion.type === "emitted") {
          customEventRegistry.ensureListener(newAssertion.typeValue, handleCustomEvent);
        }
        if (newAssertion.trigger !== "invariant") {
          if (newAssertion.timeout > 0) {
            const shouldCreateTimeout = !newAssertion.conditionKey || !activeAssertions.some(
              (a) => a !== newAssertion && a.assertionKey === newAssertion.assertionKey && (newAssertion.mutex || a.type === newAssertion.type) && a.conditionKey !== void 0 && a.timeoutId !== void 0
            );
            if (shouldCreateTimeout) {
              createAssertionTimeout(newAssertion, config, (completedAssertion) => {
                settle([completedAssertion]);
              }, newAssertion.conditionKey ? activeAssertions : void 0);
            }
          }
          checkImmediateResolved(newAssertion);
        }
      }
    });
    scheduleGc(config, () => {
      const now = Date.now();
      return activeAssertions.filter(
        (a) => !a.endTime && a.trigger !== "invariant" && !a.timeout && now - a.startTime > config.gcInterval
      );
    }, (completed) => settle(completed));
    if (assertionCountCallback) {
      assertionCountCallback(getPendingAssertions(activeAssertions).length);
    }
  };
  const handleEvent = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const triggers = eventTriggerAliases[event.type] || [event.type];
    const elementProcessor = createElementProcessor(triggers, true, event);
    const created = eventProcessor(event, elementProcessor);
    enqueueAssertions(created);
    const completed = eventResolver(
      event,
      getPendingDomAssertions(activeAssertions)
    );
    settle(completed);
  };
  const handleCustomEvent = (event) => {
    const eventName = event.type;
    const registered = customEventRegistry.getElements(eventName);
    if (registered && registered.size > 0) {
      const matching = [];
      for (const el of registered) {
        if (!el.isConnected) continue;
        const triggerValue = el.getAttribute(assertionTriggerAttr);
        const parsed = parseCustomEventTrigger(triggerValue);
        if (parsed.detailMatches && !matchesDetail(event, parsed.detailMatches)) {
          continue;
        }
        matching.push(el);
      }
      if (matching.length > 0) {
        const triggers = [...new Set(matching.map((el) => el.getAttribute(assertionTriggerAttr)))];
        const elementProcessor = createElementProcessor(triggers);
        enqueueAssertions(elementProcessor(matching));
      }
    }
    const pendingEmitted = activeAssertions.filter(
      (a) => a.type === "emitted" && !a.endTime
    );
    if (pendingEmitted.length > 0) {
      const emittedResults = emittedResolver(event, pendingEmitted);
      settle(emittedResults);
    }
  };
  const registerCustomEventElement = (element) => {
    const triggerValue = element.getAttribute(assertionTriggerAttr);
    if (!triggerValue || !isCustomEventTrigger(triggerValue)) return;
    const { eventName } = parseCustomEventTrigger(triggerValue);
    customEventRegistry.registerElement(eventName, element, handleCustomEvent);
  };
  const handleMutations = (mutationsList) => {
    const elementProcessor = createElementProcessor(["mount", "invariant"]);
    const created = mutationHandler(
      mutationsList,
      elementProcessor,
      getPendingDomAssertions(activeAssertions)
    );
    enqueueAssertions(created);
    if (created.some((assertion) => assertion.type === "loaded")) {
      checkAssertions();
    }
    const completed = mutationHandler(
      mutationsList,
      elementResolver,
      getPendingDomAssertions(activeAssertions)
    );
    settle(completed);
    for (const mutation of mutationsList) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof HTMLElement) {
          registerCustomEventElement(node);
          const descendants = node.querySelectorAll(`[${assertionTriggerAttr}]`);
          for (const desc of Array.from(descendants)) {
            registerCustomEventElement(desc);
          }
        }
      }
    }
  };
  const handleGlobalError = (errorInfo) => {
    settle(
      globalErrorResolver(errorInfo, getPendingAssertions(activeAssertions))
    );
  };
  const handleNavigation = () => {
    const pending = getPendingAssertions(activeAssertions);
    settle(routeResolver(pending, config));
  };
  const checkAssertions = () => {
    const pendingAssertions = getPendingDomAssertions(activeAssertions);
    if (pendingAssertions.length) {
      settle(
        documentResolver(getAssertionsForMpaMode(pendingAssertions), config)
      );
      settle(propertyResolver(pendingAssertions, config));
    }
    const allPending = getPendingAssertions(activeAssertions);
    settle(routeResolver(allPending, config));
  };
  const settle = (completeAssertions) => {
    for (const completed of completeAssertions) {
      if (completed.conditionKey && completed.status !== "dismissed") {
        const dismissed = dismissSiblings(completed, activeAssertions);
        completeAssertions.push(...dismissed);
      }
    }
    const toSettle = getAssertionsToSettle(completeAssertions);
    completeAssertions.forEach((assertion) => {
      clearAssertionTimeout(assertion);
    });
    if (toSettle.length) {
      sendToCollector(toSettle, config);
    }
    for (const a of toSettle) {
      if (a.trigger === "invariant") {
        retryCompletedAssertion(a, a);
      }
    }
    const passed = toSettle.filter((a) => a.status === "passed" && !a.oob);
    const failed = toSettle.filter((a) => a.status === "failed" && !a.oob);
    if (passed.length > 0 || failed.length > 0) {
      const oobAssertions = findAndCreateOobAssertions(passed, failed);
      if (oobAssertions.length > 0) {
        enqueueAssertions(oobAssertions);
        const oobKeys = new Set(oobAssertions.map((a) => a.assertionKey));
        const pendingOob = getPendingDomAssertions(activeAssertions).filter(
          (a) => a.oob && oobKeys.has(a.assertionKey)
        );
        const immediateResults = immediateResolver(pendingOob, config);
        if (immediateResults.length > 0) {
          settle(immediateResults);
        }
      }
    }
    if (assertionCountCallback) {
      assertionCountCallback(getPendingAssertions(activeAssertions).length);
    }
  };
  activeAssertions.forEach((assertion) => {
    if (assertion.timeout > 0) {
      createAssertionTimeout(assertion, config, (completedAssertion) => {
        settle([completedAssertion]);
      });
    }
  });
  const processElements2 = (elements, triggers) => {
    const updatedAssertions = createElementProcessor(triggers)(elements);
    enqueueAssertions(updatedAssertions);
    if (updatedAssertions.some((assertion) => assertion.type === "loaded")) {
      checkAssertions();
    }
  };
  const saveActiveAssertions = () => {
    const openAssertions = getPendingAssertions(activeAssertions);
    storeAssertions(getAssertionsForMpaMode(openAssertions));
  };
  const clearActiveAssertions = () => {
    clearGcTimeout();
    clearAllTimeouts(activeAssertions);
    activeAssertions.length = 0;
    if (assertionCountCallback) {
      assertionCountCallback(0);
    }
  };
  const handlePageUnload = () => {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      const now = Date.now();
      const pendingInvariants = activeAssertions.filter(
        (a) => a.trigger === "invariant" && !a.endTime && a.previousStatus !== "failed"
      );
      if (pendingInvariants.length > 0) {
        const completed = pendingInvariants.map(
          (inv) => Object.assign(inv, {
            status: "passed",
            endTime: now
          })
        );
        sendToCollector(completed, config);
      }
      const staleOnUnload = activeAssertions.filter(
        (a) => !a.endTime && a.trigger !== "invariant" && now - a.startTime > config.unloadGracePeriod
      );
      if (staleOnUnload.length > 0) {
        const completed = [];
        for (const a of staleOnUnload) {
          const status = a.invertResolution ? "passed" : "failed";
          const result = Object.assign(a, {
            status,
            endTime: now
          });
          completed.push(result);
        }
        sendToCollector(completed, config);
      }
    }
    clearGcTimeout();
    clearAllTimeouts(activeAssertions);
    saveActiveAssertions();
  };
  const setAssertionCountCallback = (callback) => {
    assertionCountCallback = callback;
  };
  const getPendingAssertionCount = () => {
    return getPendingAssertions(activeAssertions).length;
  };
  const setUserContext = (context) => {
    config.userContext = context;
  };
  return {
    handleEvent,
    handleCustomEvent,
    handleMutations,
    handleGlobalError,
    handleNavigation,
    checkAssertions,
    processElements: processElements2,
    registerCustomEventElement,
    customEventRegistry,
    saveActiveAssertions,
    clearActiveAssertions,
    handlePageUnload,
    setAssertionCountCallback,
    getPendingAssertionCount,
    setUserContext
  };
}

// src/interceptors/error.ts
function interceptErrors(handler) {
  const originalOnError = window.onerror;
  window.onerror = function(eventOrMessage, source, lineno, colno, error) {
    const message = (eventOrMessage instanceof Event ? error?.message : eventOrMessage) || "unknown error";
    const errorInfo = {
      message,
      stack: error?.stack,
      // Capture the stack trace if available
      source: source || void 0,
      // Source file (URL)
      lineno: lineno || void 0,
      // Line number where the error occurred
      colno: colno || void 0
      // Column number where the error occurred
    };
    handler(errorInfo);
    if (originalOnError) {
      return originalOnError.call(window, eventOrMessage, source, lineno, colno, error);
    }
    return false;
  };
  const originalUnhandledRejection = window.onunhandledrejection;
  window.addEventListener("unhandledrejection", (event) => {
    const message = event.reason ? event.reason.message || "Unhandled rejection" : "Unhandled rejection";
    const stack = event.reason?.stack || void 0;
    const errorInfo = {
      message,
      stack,
      // Stack trace from the rejected promise
      source: void 0,
      lineno: void 0,
      colno: void 0
    };
    handler(errorInfo);
    if (originalUnhandledRejection) {
      originalUnhandledRejection.call(window, event);
    }
  });
}

// src/interceptors/navigation.ts
function interceptNavigation(handler) {
  const originalPushState = history.pushState.bind(history);
  history.pushState = function(...args) {
    originalPushState(...args);
    handler();
  };
  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function(...args) {
    originalReplaceState(...args);
    handler();
  };
  window.addEventListener("popstate", () => handler());
}

// src/assertions/configuration.ts
var configValueRequired = (v) => v !== void 0 && v !== null;
var isValidConfigString = (v) => typeof v === "string" && v.length > 0;
var isValidCopnfigNumber = (v) => typeof v === "number" && v > 0;
var isValidConfigBoolean = (v) => typeof v === "boolean";
var isValidCollectorURL = (v) => typeof v === "string" && v.length > 0 || typeof v === "function";
var configValidator = {
  apiKey: [configValueRequired, isValidConfigString],
  releaseLabel: [configValueRequired, isValidConfigString],
  gcInterval: [isValidCopnfigNumber],
  unloadGracePeriod: [isValidCopnfigNumber],
  collectorURL: [configValueRequired, isValidCollectorURL],
  debug: [isValidConfigBoolean]
};
function setConfiguration(config) {
  return Object.keys(defaultConfiguration).reduce((acc, key) => {
    const typedKey = key;
    if (acc[typedKey] === void 0) {
      acc[typedKey] = defaultConfiguration[typedKey];
    }
    return acc;
  }, config);
}
function isValidConfiguration(config) {
  const keys = Object.keys(configValidator);
  return keys.every((key) => {
    if (key === "apiKey") {
      if (typeof config.collectorURL === "function") return true;
      if (typeof config.collectorURL === "string" && !isURL(config.collectorURL)) return true;
    }
    const validators = configValidator[key];
    const isValid = validators.every((validator) => validator(config[key]));
    if (!isValid) {
      console.error(
        `[Faultsense]: Invalid configuration value for '${key}'`,
        config
      );
    }
    return isValid;
  });
}

// src/index.ts
var cleanupHooks = [];
function registerCleanupHook(fn) {
  cleanupHooks.push(fn);
}
var version = "0.5.4";
function init(initialConfig) {
  let observer = null;
  const config = setConfiguration(initialConfig);
  const logger = createLogger(config);
  logger.log("[Faultsense]: Initializing agent...");
  if (!isValidConfiguration(config)) {
    logger.forceError(
      "[Faultsense]: Invalid configuration. Agent not initialized.",
      config
    );
    return () => {
    };
  }
  const assertionManager = createAssertionManager(config);
  setResolverDebugLogger(logger);
  interceptErrors(assertionManager.handleGlobalError);
  interceptNavigation(assertionManager.handleNavigation);
  const capturePhase = true;
  supportedEvents.forEach((eventType) => {
    document.addEventListener(
      eventType,
      assertionManager.handleEvent,
      capturePhase
    );
  });
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
  const { handleOnline, handleOffline } = createConnectivityHandlers(
    assertionManager.processElements
  );
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  observer = new MutationObserver((mutations) => {
    assertionManager.handleMutations(mutations);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true
  });
  const elements = document.querySelectorAll(
    `[${assertionTriggerAttr}="mount"], [${assertionTriggerAttr}="load"], [${assertionTriggerAttr}="invariant"]`
  );
  assertionManager.processElements(Array.from(elements), [
    "mount",
    "load",
    "invariant"
  ]);
  if (!navigator.onLine) {
    handleOffline();
  }
  const customEventElements = document.querySelectorAll(
    `[${assertionTriggerAttr}^="event:"]`
  );
  for (const el of Array.from(customEventElements)) {
    assertionManager.registerCustomEventElement(el);
  }
  window.Faultsense = window.Faultsense || {};
  window.Faultsense.setUserContext = assertionManager.setUserContext;
  assertionManager.checkAssertions();
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
    cleanupHooks.forEach((fn) => fn());
    cleanupHooks.length = 0;
  };
}
export {
  init,
  registerCleanupHook,
  version
};
