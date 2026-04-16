/**
 * Custom event listener registry.
 * Manages document-level listeners and a Map-based element registry
 * for O(1) lookup at event-fire time (avoids querySelectorAll per fire).
 */
export interface CustomEventRegistry {
    registerElement(eventName: string, element: HTMLElement, handler: (event: Event) => void): void;
    ensureListener(eventName: string, handler: (event: Event) => void): void;
    deregisterElement(eventName: string, element: HTMLElement): void;
    getElements(eventName: string): Set<HTMLElement> | undefined;
    isRegistered(eventName: string): boolean;
    deregisterAll(): void;
}
export declare function createCustomEventRegistry(): CustomEventRegistry;
