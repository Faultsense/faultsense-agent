export declare function isVisible(element: HTMLElement): boolean;
export declare function isHidden(element: HTMLElement): boolean;
export declare function containsText(element: HTMLElement, text: string): boolean;
/**
 * Return a valid CSS selector for the given element.
 * Prefers the element's native id. Falls back to a stable
 * `data-fs-id` attribute that is created once and reused.
 */
export declare function ensureSelector(el: HTMLElement): string;
