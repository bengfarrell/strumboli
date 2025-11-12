/**
 * Type-safe event emitter for handling callbacks
 * Similar to Python's EventEmitter but with TypeScript type safety
 */
export type EventCallback<T = any> = (data: T) => void;

export class EventEmitter<EventMap extends Record<string, any> = Record<string, any>> {
    private callbacks: Map<keyof EventMap, Set<EventCallback<any>>> = new Map();

    /**
     * Register an event callback
     * @param eventType The type of event to listen for
     * @param callback The callback function
     */
    on<K extends keyof EventMap>(eventType: K, callback: EventCallback<EventMap[K]>): void {
        if (!this.callbacks.has(eventType)) {
            this.callbacks.set(eventType, new Set());
        }
        this.callbacks.get(eventType)!.add(callback);
    }

    /**
     * Register a callback that only fires once
     * @param eventType The type of event to listen for
     * @param callback The callback function
     */
    once<K extends keyof EventMap>(eventType: K, callback: EventCallback<EventMap[K]>): void {
        const wrapper: EventCallback<EventMap[K]> = (data) => {
            this.off(eventType, wrapper);
            callback(data);
        };
        this.on(eventType, wrapper);
    }

    /**
     * Unregister an event callback
     * @param eventType The type of event
     * @param callback The callback function to remove
     */
    off<K extends keyof EventMap>(eventType: K, callback: EventCallback<EventMap[K]>): void {
        const callbacks = this.callbacks.get(eventType);
        if (callbacks) {
            callbacks.delete(callback);
        }
    }

    /**
     * Emit an event, calling all registered callbacks
     * @param eventType The type of event to emit
     * @param data Data to pass to callbacks
     */
    emit<K extends keyof EventMap>(eventType: K, data: EventMap[K]): void {
        const callbacks = this.callbacks.get(eventType);
        if (callbacks) {
            // Create a copy to avoid issues if callbacks modify the set
            const callbackArray = Array.from(callbacks);
            for (const callback of callbackArray) {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in event callback for '${String(eventType)}':`, error);
                }
            }
        }
    }

    /**
     * Clear all callbacks for an event type, or all callbacks if no type specified
     * @param eventType Optional event type to clear. If undefined, clears all.
     */
    clear<K extends keyof EventMap>(eventType?: K): void {
        if (eventType !== undefined) {
            this.callbacks.delete(eventType);
        } else {
            this.callbacks.clear();
        }
    }

    /**
     * Get the number of listeners for an event type
     * @param eventType The event type to check
     * @returns Number of registered listeners
     */
    listenerCount<K extends keyof EventMap>(eventType: K): number {
        const callbacks = this.callbacks.get(eventType);
        return callbacks ? callbacks.size : 0;
    }
}

