/**
 * MIDI event type definitions
 */

export interface MidiConnectionEvent {
    connected: boolean;
    inputPort?: string;
    outputPort?: string;
}

export interface MidiNoteEvent {
    notes: string[];  // List of active note strings like ['C4', 'E4', 'G4']
    added?: string;   // Note that was just added (if any)
    removed?: string; // Note that was just removed (if any)
}

// Event type constants
export const NOTE_EVENT = 'note';
export const CONNECTION_EVENT = 'connection';

