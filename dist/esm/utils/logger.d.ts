import { Configuration } from "../types";
/**
 * Logger utility that respects the debug configuration flag
 */
export declare class Logger {
    private config;
    constructor(config: Configuration);
    /**
     * Log a message to console if debug is enabled
     */
    log(...args: any[]): void;
    /**
     * Log an error to console if debug is enabled
     */
    error(...args: any[]): void;
    /**
     * Log a warning to console if debug is enabled
     */
    warn(...args: any[]): void;
    /**
     * Log info to console if debug is enabled
     */
    info(...args: any[]): void;
    /**
     * Always log errors regardless of debug flag (for critical errors)
     */
    forceError(...args: any[]): void;
    /**
     * Always log messages regardless of debug flag (for critical messages)
     */
    forceLog(...args: any[]): void;
}
/**
 * Create a logger instance
 */
export declare function createLogger(config: Configuration): Logger;
