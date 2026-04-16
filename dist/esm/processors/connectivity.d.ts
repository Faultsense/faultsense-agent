type ProcessElements = (elements: HTMLElement[], triggers: string[]) => void;
export declare function createConnectivityHandlers(processElements: ProcessElements): {
    handleOnline: () => void;
    handleOffline: () => void;
};
export {};
