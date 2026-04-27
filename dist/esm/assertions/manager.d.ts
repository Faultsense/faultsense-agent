import type { GlobalErrorHandler, Configuration } from "../types";
export declare function createAssertionManager(config: Configuration): {
    handleEvent: (event: Event) => void;
    handleCustomEvent: (event: Event) => void;
    handleMutations: (mutationsList: MutationRecord[]) => void;
    handleGlobalError: GlobalErrorHandler;
    handleNavigation: () => void;
    checkAssertions: () => void;
    processElements: (elements: HTMLElement[], triggers: string[]) => void;
    registerCustomEventElement: (element: HTMLElement) => void;
    customEventRegistry: import("../listeners/custom-events").CustomEventRegistry;
    saveActiveAssertions: () => void;
    clearActiveAssertions: () => void;
    handlePageUnload: () => void;
    setAssertionCountCallback: (callback: (count: number) => void) => void;
    getPendingAssertionCount: () => number;
    setUserContext: (context: Record<string, any> | undefined) => void;
    setUserCohorts: (cohorts: Record<string, string> | undefined) => void;
};
