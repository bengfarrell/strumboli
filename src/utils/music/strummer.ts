/**
 * Strummer class - handles strumming logic with pressure and position detection
 */

import { EventEmitter } from '../event-emitter.js';
import { NoteObject } from './note.js';

interface StrumResult {
    type: 'strum' | 'release';
    notes?: Array<{ note: NoteObject; velocity: number }>;
    velocity?: number;
}

interface StrummerEvents {
    notes_changed: void;
}

export class Strummer extends EventEmitter<StrummerEvents> {
    private _width: number = 1.0;
    private _height: number = 1.0;
    private _notes: NoteObject[] = [];
    private lastStrummedIndex: number = -1;
    private lastPressure: number = 0.0;
    private lastTimestamp: number = 0.0;
    private pressureThreshold: number = 0.1;
    private lastStrumVelocity: number = 0;
    
    // Pressure buffering for accurate velocity sensing on quick taps
    private pressureBuffer: Array<[number, number]> = [];  // [pressure, timestamp] tuples
    private bufferMaxSamples: number = 3;
    private pendingTapIndex: number = -1;

    get notes(): NoteObject[] {
        return this._notes;
    }

    set notes(notes: NoteObject[]) {
        this._notes = notes;
        this.updateBounds(this._width, this._height);
        // Emit event when notes change
        this.emit('notes_changed', undefined);
    }

    /**
     * Get the current notes state as an object for broadcasting
     */
    getNotesState(): any {
        // Get base notes (non-secondary) for recalculation
        const baseNotes = this._notes.filter(note => !note.secondary);
        
        return {
            type: 'notes',
            notes: this._notes,
            stringCount: this._notes.length,
            baseNotes: baseNotes,
            timestamp: Date.now()
        };
    }

    /**
     * Process strumming input and return strum result if triggered
     */
    strum(x: number, pressure: number): StrumResult | null {
        if (this._notes.length === 0) {
            return null;
        }

        const stringWidth = this._width / this._notes.length;
        const index = Math.min(Math.floor(x / stringWidth), this._notes.length - 1);
        
        // Calculate time delta and pressure velocity
        const currentTime = Date.now() / 1000;  // Convert to seconds
        
        // Calculate pressure velocity (rate of change)
        // (Not currently used, but available for future enhancements)
        
        // Check if we have sufficient pressure
        const hasSufficientPressure = pressure >= this.pressureThreshold;
        
        // Detect pressure transitions (pen down/up)
        const pressureDown = this.lastPressure < this.pressureThreshold && pressure >= this.pressureThreshold;
        const pressureUp = this.lastPressure >= this.pressureThreshold && pressure < this.pressureThreshold;
        
        // Handle pressure release - return release event with last velocity
        if (pressureUp) {
            const releaseVelocity = this.lastStrumVelocity;
            
            // Reset strummed index and buffer when pressure is released
            this.lastStrummedIndex = -1;
            this.lastPressure = pressure;
            this.lastTimestamp = currentTime;
            this.pressureBuffer = [];
            this.pendingTapIndex = -1;
            this.lastStrumVelocity = 0;
            
            // Return release event if we had a previous strum
            if (releaseVelocity > 0) {
                return { type: 'release', velocity: releaseVelocity };
            }
            
            return null;
        }
        
        // Handle new tap - start buffering
        if (pressureDown && (this.lastStrummedIndex === -1 || this.lastStrummedIndex !== index)) {
            // Store the initial low pressure to measure from the beginning
            this.pressureBuffer = [[this.lastPressure, this.lastTimestamp], [pressure, currentTime]];
            this.pendingTapIndex = index;
            this.lastPressure = pressure;
            this.lastTimestamp = currentTime;
            return null;  // Don't trigger yet, need to buffer
        }
        
        // Handle case where pressure is already high on first sample
        if (hasSufficientPressure && this.lastStrummedIndex === -1 && this.pendingTapIndex === -1) {
                // Start buffering with current sample
                this.pressureBuffer = [[pressure, currentTime]];
                this.pendingTapIndex = index;
                this.lastPressure = pressure;
                this.lastTimestamp = currentTime;
            return null;  // Start buffering
        }
        
        // Continue buffering if we have a pending tap
        if (this.pendingTapIndex !== -1 && this.pressureBuffer.length < this.bufferMaxSamples) {
            this.pressureBuffer.push([pressure, currentTime]);
            this.lastPressure = pressure;
            this.lastTimestamp = currentTime;
            
            // Once buffer is full, trigger the note with calculated velocity
            if (this.pressureBuffer.length >= this.bufferMaxSamples) {
                // Use current pressure as the main velocity indicator
                const currentPressure = pressure;
                
                // Apply velocity scaling and map to MIDI range
                const normalizedPressure = (currentPressure - this.pressureThreshold) / (1.0 - this.pressureThreshold);
                const clampedPressure = Math.max(0.0, Math.min(1.0, normalizedPressure));
                
                // Scale to velocity range (20-127)
                let midiVelocity = Math.floor(20 + clampedPressure * 107);
                midiVelocity = Math.max(20, Math.min(127, midiVelocity));
                
                // Store velocity for potential release event
                this.lastStrumVelocity = midiVelocity;
                
                const note = this._notes[this.pendingTapIndex];
                this.lastStrummedIndex = this.pendingTapIndex;
                this.pendingTapIndex = -1;
                this.pressureBuffer = [];
                
                return { type: 'strum', notes: [{ note, velocity: midiVelocity }] };
            }
            
            return null;  // Still buffering
        }
        
        this.lastPressure = pressure;
        this.lastTimestamp = currentTime;
        
        // Handle strumming across strings (index changed while pressure maintained)
        if (hasSufficientPressure && this.lastStrummedIndex !== -1 && this.lastStrummedIndex !== index) {
            // Minimum velocity of 20 for audibility
            const midiVelocity = Math.max(20, Math.floor(pressure * 127));
            const notesToPlay: Array<{ note: NoteObject; velocity: number }> = [];

            // Determine direction for proper ordering
            let indices: number[];
            if (this.lastStrummedIndex < index) {
                // Moving right/forward
                indices = [];
                for (let i = this.lastStrummedIndex + 1; i <= index; i++) {
                    indices.push(i);
                }
            } else {
                // Moving left/backward
                indices = [];
                for (let i = this.lastStrummedIndex - 1; i >= index; i--) {
                    indices.push(i);
                }
            }
            
            for (const i of indices) {
                const note = this._notes[i];
                notesToPlay.push({ note, velocity: midiVelocity });
            }
            
            // Store velocity for potential release event
            this.lastStrumVelocity = midiVelocity;
            
            this.lastStrummedIndex = index;
            return notesToPlay.length > 0 ? { type: 'strum', notes: notesToPlay } : null;
        }
        
        return null;
    }

    /**
     * Clear the last strummed index and pressure
     */
    clearStrum(): void {
        this.lastStrummedIndex = -1;
        this.lastPressure = 0.0;
        this.lastTimestamp = 0.0;
        this.lastStrumVelocity = 0;
        this.pressureBuffer = [];
        this.pendingTapIndex = -1;
    }

    /**
     * Configure strummer parameters
     */
    configure(_pluckVelocityScale: number = 4.0, pressureThreshold: number = 0.1): void {
        // pluckVelocityScale available for future use
        this.pressureThreshold = pressureThreshold;
    }

    /**
     * Update the bounds of the strummer
     */
    updateBounds(width: number, height: number): void {
        this._width = width;
        this._height = height;
    }
}

// Global strummer instance
export const strummer = new Strummer();

