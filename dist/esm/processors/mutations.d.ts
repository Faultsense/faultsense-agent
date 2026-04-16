import { Assertion, ElementProcessor, ElementResolver } from "../types";
export declare function mutationHandler<T>(mutationsList: MutationRecord[], handler: ElementProcessor | ElementResolver, assertions: Assertion[]): T[];
