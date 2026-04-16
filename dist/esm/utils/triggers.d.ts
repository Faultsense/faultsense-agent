export interface ParsedTrigger {
    base: string;
    filter?: string;
}
export declare function parseTrigger(raw: string): ParsedTrigger;
