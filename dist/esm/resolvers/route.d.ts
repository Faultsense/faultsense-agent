import { Assertion, CompletedAssertion, Configuration } from "../types";
interface RoutePattern {
    pathname: string;
    params: [string, string][];
    hash: string | null;
}
/**
 * Parse a route pattern string as a URL-like structure.
 * The pattern is treated as a URL: pathname, query params, and hash fragment.
 * Each part (pathname, param values, hash) is treated as a regex pattern.
 *
 * Manual string splitting is used instead of URL()/URLSearchParams because
 * those APIs mangle regex metacharacters:
 *   - URL() converts \ to / in pathnames (per URL spec)
 *   - URLSearchParams converts + to space (per form encoding spec)
 *
 * The actual URL being matched against uses URLSearchParams for order-independent
 * param matching (see routeResolver).
 *
 * Examples:
 *   "/dashboard"                     → pathname only
 *   "/dashboard?id=\d+"              → pathname + query param regex
 *   "/callback?code=.*&state=\w+"    → pathname + multiple params (order-independent)
 *   "/docs#section-\d+"              → pathname + hash regex
 *   "/page?tab=settings#panel"       → all three
 */
export declare function parseRoutePattern(pattern: string): RoutePattern;
/**
 * Validate that all regex parts of a route pattern are valid.
 * Returns null if valid, or an error message describing what's invalid.
 */
export declare function validateRoutePattern(pattern: RoutePattern): string | null;
export declare function routeResolver(activeAssertions: Assertion[], config: Configuration): CompletedAssertion[];
export {};
