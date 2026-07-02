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
    hasElementsFor(eventName: string): boolean;
    /**
     * Remove the document-level listener for an event name. Caller is
     * responsible for ensuring no other source still references this event —
     * the JSON spec registry tracks its own references and the manager
     * cross-checks before calling this. Idempotent.
     */
    deregisterEventName(eventName: string): void;
    deregisterAll(): void;
}
export declare function createCustomEventRegistry(): CustomEventRegistry;
