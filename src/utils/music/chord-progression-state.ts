/**
 * Chord progression state management
 * Tracks current position in a chord progression and provides navigation
 */

import { createLogger } from '../logger.js';

const logger = createLogger('ChordProgression');

// Chord progressions loaded at runtime
export let CHORD_PROGRESSIONS: Record<string, string[]> = {};
let progressionsLoaded = false;
let loadPromise: Promise<void> | null = null;

/**
 * Fetch and load chord progressions from the root chord_progressions.json file
 */
export async function loadChordProgressions(): Promise<void> {
    // Return existing promise if already loading
    if (loadPromise) {
        return loadPromise;
    }
    
    // Return immediately if already loaded
    if (progressionsLoaded) {
        return Promise.resolve();
    }
    
    loadPromise = (async () => {
        try {
            const response = await fetch('/chord_progressions.json');
            if (!response.ok) {
                throw new Error(`Failed to load chord progressions: ${response.statusText}`);
            }
            const data = await response.json();
            
            // Flatten nested structure
            CHORD_PROGRESSIONS = {};
            for (const category of Object.values(data)) {
                Object.assign(CHORD_PROGRESSIONS, category);
            }
            
            progressionsLoaded = true;
            logger.log(`Loaded ${Object.keys(CHORD_PROGRESSIONS).length} chord progressions`);
        } catch (error) {
            logger.log(`Error loading chord progressions: ${error}`);
            // Provide a default progression to avoid breaking the app
            CHORD_PROGRESSIONS = {
                'c-major-pop': ['C', 'G', 'Am', 'F']
            };
        }
    })();
    
    return loadPromise;
}

export class ChordProgressionState {
    progressionName: string | null = null;
    chords: string[] = [];
    currentIndex: number = 0;

    /**
     * Load a chord progression by name
     */
    loadProgression(progressionName: string): boolean {
        if (!(progressionName in CHORD_PROGRESSIONS)) {
            logger.log(`Unknown progression: ${progressionName}`);
            return false;
        }

        this.progressionName = progressionName;
        this.chords = CHORD_PROGRESSIONS[progressionName];
        this.currentIndex = 0;

        logger.log(`Loaded progression '${progressionName}' with ${this.chords.length} chords`);
        return true;
    }

    /**
     * Set the current index to a specific position (with wrapping)
     */
    setIndex(index: number): number {
        if (this.chords.length === 0) {
            logger.log('No progression loaded');
            return 0;
        }

        // Wrap the index using modulo
        this.currentIndex = ((index % this.chords.length) + this.chords.length) % this.chords.length;
        return this.currentIndex;
    }

    /**
     * Increment the current index by a given amount (with wrapping)
     */
    incrementIndex(amount: number = 1): number {
        if (this.chords.length === 0) {
            logger.log('No progression loaded');
            return 0;
        }

        // Add amount and wrap using modulo
        this.currentIndex = ((this.currentIndex + amount) % this.chords.length + this.chords.length) % this.chords.length;
        return this.currentIndex;
    }

    /**
     * Get the chord at the current index
     */
    getCurrentChord(): string | null {
        if (this.chords.length === 0) {
            return null;
        }

        return this.chords[this.currentIndex];
    }

    /**
     * Get the chord at a specific index (with wrapping)
     */
    getChordAtIndex(index: number): string | null {
        if (this.chords.length === 0) {
            return null;
        }

        const wrappedIndex = ((index % this.chords.length) + this.chords.length) % this.chords.length;
        return this.chords[wrappedIndex];
    }

    /**
     * Get information about the current progression state
     */
    getInfo(): {
        progressionName: string | null;
        totalChords: number;
        currentIndex: number;
        currentChord: string | null;
        chords: string[];
    } {
        return {
            progressionName: this.progressionName,
            totalChords: this.chords.length,
            currentIndex: this.currentIndex,
            currentChord: this.getCurrentChord(),
            chords: this.chords
        };
    }

    /**
     * Reset to the beginning of the progression
     */
    reset(): void {
        this.currentIndex = 0;
    }
}

