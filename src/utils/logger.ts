/**
 * Centralized logging utility with category filtering and timestamps
 * 
 * Usage:
 *   const logger = createLogger('MIDI');
 *   logger.log('Connection established');
 *   // Output: [2025-11-04T12:34:56.789Z] [MIDI] Connection established
 * 
 * Configuration:
 *   Logger.enableCategory('MIDI');        // Enable specific category
 *   Logger.disableCategory('TabletController'); // Disable specific category
 *   Logger.enableAll();                   // Enable all categories
 *   Logger.disableAll();                  // Disable all categories
 *   Logger.setOutputToConsole(true);      // Enable/disable console output
 */

interface LoggerConfig {
    enabledCategories: Set<string>;
    disabledCategories: Set<string>;
    allEnabled: boolean;
    alsoLogToConsole: boolean;
}

// Log entry for panel display
export interface LogEntry {
    timestamp: string;
    category: string;
    message: string;
    args: any[];
}

// Callback for log entries (used by UI to capture logs)
type LogCallback = (entry: LogEntry) => void;

class LoggerManager {
    private config: LoggerConfig = {
        enabledCategories: new Set(),
        disabledCategories: new Set(),
        allEnabled: true,
        alsoLogToConsole: false
    };
    
    private logCallbacks: Set<LogCallback> = new Set();
    
    // Device-related categories that should show in the panel
    private deviceCategories = new Set(['MIDI', 'TabletController', 'DeviceFinder', 'HID', 'HID_RAW']);

    /**
     * Enable a specific category
     */
    enableCategory(category: string): void {
        this.config.enabledCategories.add(category);
        this.config.disabledCategories.delete(category);
    }

    /**
     * Disable a specific category
     */
    disableCategory(category: string): void {
        this.config.disabledCategories.add(category);
        this.config.enabledCategories.delete(category);
    }

    /**
     * Enable all categories
     */
    enableAll(): void {
        this.config.allEnabled = true;
        this.config.enabledCategories.clear();
        this.config.disabledCategories.clear();
    }

    /**
     * Disable all categories
     */
    disableAll(): void {
        this.config.allEnabled = false;
        this.config.enabledCategories.clear();
        this.config.disabledCategories.clear();
    }
    
    /**
     * Enable/disable also logging to console (panel logging is always on)
     */
    setOutputToConsole(enabled: boolean): void {
        this.config.alsoLogToConsole = enabled;
    }
    
    /**
     * Register a callback to receive log entries
     */
    onLog(callback: LogCallback): () => void {
        this.logCallbacks.add(callback);
        // Return unsubscribe function
        return () => {
            this.logCallbacks.delete(callback);
        };
    }
    
    /**
     * Emit a log entry to all registered callbacks
     */
    emitLog(entry: LogEntry): void {
        this.logCallbacks.forEach(callback => callback(entry));
    }


    /**
     * Check if a category should log
     */
    shouldLog(category: string): boolean {
        // HID_RAW is always on and not configurable
        if (category === 'HID_RAW') {
            return true;
        }
        
        // Only show device-related categories in the panel
        if (!this.deviceCategories.has(category)) {
            return false;
        }

        // Check if category is explicitly disabled
        if (this.config.disabledCategories.has(category)) {
            return false;
        }

        // Check if category is explicitly enabled
        if (this.config.enabledCategories.has(category)) {
            return true;
        }

        // Fall back to allEnabled setting
        return this.config.allEnabled;
    }

    /**
     * Get current configuration
     */
    getConfig(): Readonly<LoggerConfig> {
        return { ...this.config };
    }
}

// Global logger manager instance
const manager = new LoggerManager();

/**
 * Logger instance for a specific category
 */
export class Logger {
    constructor(private category: string) {}

    private formatMessage(args: any[]): any[] {
        const prefix = `[${this.category}]`;
        const timestamp = `[${new Date().toISOString()}]`;
        return [timestamp, prefix, ...args];
    }

    log(...args: any[]): void {
        if (manager.shouldLog(this.category)) {
            const config = manager.getConfig();
            
            // Always emit to panel
            manager.emitLog({
                timestamp: new Date().toISOString(),
                category: this.category,
                message: args.map(arg => 
                    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
                ).join(' '),
                args
            });
            
            // Optionally also log to console
            if (config.alsoLogToConsole) {
                const formatted = this.formatMessage(args);
                console.log(...formatted);
            }
        }
    }

    /**
     * Create a child logger with a sub-category
     */
    child(subCategory: string): Logger {
        return new Logger(`${this.category}:${subCategory}`);
    }

    // Expose the global manager through Logger class
    static enableCategory = manager.enableCategory.bind(manager);
    static disableCategory = manager.disableCategory.bind(manager);
    static enableAll = manager.enableAll.bind(manager);
    static disableAll = manager.disableAll.bind(manager);
    static setOutputToConsole = manager.setOutputToConsole.bind(manager);
    static onLog = manager.onLog.bind(manager);
    static getConfig = manager.getConfig.bind(manager);
}

/**
 * Create a logger for a specific category
 */
export function createLogger(category: string): Logger {
    return new Logger(category);
}

/**
 * Expose global logger configuration
 */
export const LoggerConfig = {
    enableCategory: Logger.enableCategory,
    disableCategory: Logger.disableCategory,
    enableAll: Logger.enableAll,
    disableAll: Logger.disableAll,
    setOutputToConsole: Logger.setOutputToConsole,
    onLog: Logger.onLog,
    getConfig: Logger.getConfig
};

/**
 * Configure logger from application config
 * @param loggerConfig Logger configuration from settings
 */
export function configureLoggerFromSettings(loggerConfig: any): void {
    if (!loggerConfig) return;
    
    // Check if logger is enabled
    if (loggerConfig.enabled === false) {
        Logger.disableAll();
        return;
    }
    
    // Set console output
    if (typeof loggerConfig.alsoLogToConsole === 'boolean') {
        Logger.setOutputToConsole(loggerConfig.alsoLogToConsole);
    }
    
    // Set enabled categories
    if (loggerConfig.categories) {
        // First disable all, then enable specific categories
        Logger.disableAll();
        
        for (const [category, enabled] of Object.entries(loggerConfig.categories)) {
            if (enabled) {
                Logger.enableCategory(category);
            }
        }
    } else {
        Logger.enableAll();
    }
}

