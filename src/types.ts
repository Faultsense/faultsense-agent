// Custom collector function type
export type CollectorFunction = (payload: ApiPayload) => void;

/**
 * fs-* attribute key — every JSON-spec key follows this prefix, mirroring
 * the HTML attribute namespace 1:1.
 */
export type FsAttr = `fs-${string}`;

/**
 * Brand a template-literal `fs-...` string at the call site so spec-entry
 * lookups stay strictly-typed without `as keyof typeof entry` escapes at
 * the read site. Pure identity at runtime.
 */
export const fsAttr = <S extends string>(s: `fs-${S}`): FsAttr => s;

/**
 * A single JSON-spec entry. Mirrors the fs-* attribute model: required
 * target / assert plus any other fs-* keys that would otherwise live on
 * the element. `fs-target` is the JSON-only key naming the CSS selector
 * the trigger binds to.
 *
 * `fs-trigger` is required UNLESS `fs-assert-oob` or `fs-assert-oob-fail`
 * is present — OOB entries are driven by a parent assertion's status
 * change and never fire on a user-action trigger. (HTML mirrors this by
 * omitting `fs-trigger` on OOB elements.) The TypeScript signature keeps
 * fs-trigger optional; spec.schema.json enforces the conditional via
 * anyOf for tooling/AI agent validation.
 */
export type SpecEntry =
  & {
      "fs-target": string;
      "fs-assert": string;
    }
  & { [K in FsAttr]?: string };

export interface Configuration {
  apiKey: string;
  releaseLabel: string;
  gcInterval: number;
  unloadGracePeriod: number;
  collectorURL: string | CollectorFunction;
  debug: boolean;
  userContext?: Record<string, any>;
  userCohorts?: Record<string, string>;
  spec?: readonly SpecEntry[];
  /**
   * When true, the agent ignores any `fs-*` HTML attributes already in the
   * DOM and operates purely from the JSON spec. Useful for proving an app
   * works end-to-end through the JSON path (e.g., re-running an existing
   * conformance demo in JSON mode) without removing the attributes.
   *
   * Default: false. When false (the default), HTML and JSON sources coexist
   * — the canonical behaviour.
   *
   * Caveat: connectivity triggers (`online` / `offline`) discover targets
   * via `document.querySelectorAll('[fs-trigger=online/offline]')`. When
   * `ignoreHtmlAttrs` is true, that scan finds nothing and the per-target
   * JSON discovery path doesn't fire. If you need JSON-only connectivity
   * triggers, file an issue — the fix is plumbing, not architecture.
   */
  ignoreHtmlAttrs?: boolean;
}

// Converts HTMLElement into an Assertion;
export type ElementProcessor = (elements: HTMLElement[]) => Assertion[];
export type ElementResolver = (
  addedOrUpdatedElements: HTMLElement[],
  removedElements: HTMLElement[],
  updatedElements: HTMLElement[],
  assertions: Assertion[]
) => CompletedAssertion[];

export type EventProcessor = (
  event: Event,
  processor: ElementProcessor
) => Assertion[];
export type EventResolver = (
  event: Event,
  assertions: Assertion[]
) => CompletedAssertion[];
export type MutationProcessor = (
  mutationsList: MutationRecord[],
  processor: ElementProcessor
) => Assertion[];
export type MutationHandler<T> = (
  mutationsList: MutationRecord[],
  handler: ElementProcessor | ElementResolver
) => T[];

export interface ErrorInfo {
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
}
export type GlobalErrorHandler = (errorInfo: ErrorInfo) => void;

// Handlers to scan active assertions and mark as completed
export type AssertionCollectionResolver = (
  activeAssertions: Assertion[],
  config: Configuration
) => CompletedAssertion[];
export type GlobalErrorResolver = (
  errorInfo: ErrorInfo,
  activeAssertions: Assertion[]
) => CompletedAssertion[];

export type AssertionStatus = "passed" | "failed" | "dismissed";

export const domAssertionTypes = ["added", "removed", "updated", "visible", "hidden", "loaded", "stable"] as const;
export const eventAssertionTypes = ["emitted"] as const;
export const routeAssertionTypes = ["route"] as const;
export const sequenceAssertionTypes = ["after"] as const;
export const allAssertionTypes = [...domAssertionTypes, ...eventAssertionTypes, ...routeAssertionTypes, ...sequenceAssertionTypes] as const;
export type AssertionType = (typeof allAssertionTypes)[number];

export type AssertionModiferValue = string;

export const domModifiers = ["text-matches", "classlist", "attrs-match", "value-matches", "checked", "disabled", "count", "count-min", "count-max", "focused", "focused-within"] as const;
export type DomModifier = (typeof domModifiers)[number];
export type AssertionModifiers =
  | "mpa"
  | "timeout"
  | "detail-matches"
  | DomModifier;

export interface Assertion {
  assertionKey: string;
  elementSnapshot: string;
  mpa_mode: boolean;
  trigger: string;
  timeout: number;
  startTime: number;
  type: AssertionType;
  typeValue: string;
  conditionKey?: string;
  mutex?: "type" | "each" | "conditions";
  mutexKeys?: string[];
  oob?: boolean;
  endTime?: number;
  status?: AssertionStatus;
  errorContext?: ErrorInfo;
  modifiers: Partial<Record<AssertionModifiers, AssertionModiferValue>>;
  attempts?: number[];
  previousStartTime?: number;
  previousEndTime?: number;
  previousStatus?: AssertionStatus;
  timeoutId?: ReturnType<typeof setTimeout>;
  invertResolution?: boolean;
}

export interface CompletedAssertion
  extends Omit<Assertion, "endTime" | "status"> {
  endTime: number;
  status: AssertionStatus;
}

export interface ApiPayload {
  api_key: string;
  assertion_key: string;
  assertion_trigger: string;
  assertion_type_value: string;
  assertion_type: AssertionType;
  assertion_type_modifiers: Partial<Record<AssertionModifiers, AssertionModiferValue>>;
  attempts: number[];
  condition_key: string;
  element_snapshot: string;
  release_label: string;
  status: AssertionStatus;
  error_context?: {
    message: string;
    stack?: string;
    source?: string;
    lineno?: number;
    colno?: number;
  };
  user_context?: Record<string, any>;
  user_cohorts?: Record<string, string>;
  agent_version: string;
  timestamp: string; // ISO String using start timestamp
}

// Global Faultsense object interface
declare global {
  interface Window {
    Faultsense?: {
      version?: string;
      init?: (config: Partial<Configuration>) => () => void;
      cleanup?: () => void;
      collectors?: Record<string, CollectorFunction>;
      registerCleanupHook?: (fn: () => void) => void;
      setUserContext?: (context: Record<string, any> | undefined) => void;
      setUserCohorts?: (cohorts: Record<string, string> | undefined) => void;
      setSpec?: (entries: readonly SpecEntry[]) => void;
      addSpec?: (entries: readonly SpecEntry[]) => void;
      getSpec?: () => readonly SpecEntry[];
    };
  }

  // Replaced at build time by scripts/build.mjs (production) and
  // vitest.config.ts (tests). Both read packages/agent/package.json
  // so the value is always in sync with the source of truth.
  const __FS_VERSION__: string;
}