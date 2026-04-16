import { AssertionCollectionResolver } from "../types";
/**
 * This AssertionCollectionResolver is used to scan the DOM for elements whose
 * events may have already fired, but we missed the event. We'll check
 * properties of the elements to see if the assertion passed.
 *
 * Example of a "missed event":
 * - Images that already loaded before the agent was initialized.
 */
export declare const propertyResolver: AssertionCollectionResolver;
