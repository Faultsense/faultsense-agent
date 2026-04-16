export interface KeyFilter {
    key: string;
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
}
export declare function parseKeyFilter(filter: string): KeyFilter;
export declare function matchesKeyFilter(event: KeyboardEvent, filter: KeyFilter): boolean;
