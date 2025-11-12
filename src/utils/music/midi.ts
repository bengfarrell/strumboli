/**
 * MIDI class - handles MIDI input/output using WebMIDI API
 */

import { EventEmitter } from '../event-emitter.js';
import { Note, NoteObject } from './note.js';
import { MidiConnectionEvent, MidiNoteEvent, NOTE_EVENT, CONNECTION_EVENT } from './midi-event.js';
import { createLogger } from '../logger.js';

const logger = createLogger('MIDI');

interface MidiEvents {
    [NOTE_EVENT]: MidiNoteEvent;
    [CONNECTION_EVENT]: MidiConnectionEvent;
}

export class Midi extends EventEmitter<MidiEvents> {
    private midiAccess: MIDIAccess | null = null;
    private midiOut: MIDIOutput | null = null;
    private midiIn: MIDIInput | null = null;
    private _notes: string[] = [];
    private midiStrumChannel: number | null;
    private activeNoteTimers: Map<string, number> = new Map();  // Track active note-off timers
    private noteStartTimes: Map<string, number> = new Map();   // Track when each note started

    constructor(midiStrumChannel: number | null = null) {
        super();
        this.midiStrumChannel = midiStrumChannel;
    }

    get currentInput(): MIDIInput | null {
        return this.midiIn;
    }

    get notes(): string[] {
        return this._notes;
    }

    /**
     * Initialize MIDI access and refresh connections
     */
    async refreshConnection(midiInputId?: string): Promise<void> {
        try {
            // Request MIDI access
            this.midiAccess = await navigator.requestMIDIAccess();
            
            // Get available outputs
            const outputs = Array.from(this.midiAccess.outputs.values());
            let outputPort: string | undefined;
            
            logger.log(' Available output ports:', outputs.map(o => o.name));
            
            if (outputs.length > 0) {
                this.midiOut = outputs[0];
                outputPort = outputs[0].name ?? undefined;
                logger.log(`Using output port: ${outputPort}`);
            } else {
                logger.log('WARNING: No MIDI output ports available');
            }
            
            // Get available inputs
            const inputs = Array.from(this.midiAccess.inputs.values());
            let inputPort: string | undefined;
            
            if (inputs.length > 0) {
                let portIndex = 0;
                if (midiInputId !== undefined && midiInputId !== null) {
                    portIndex = this.resolveInputId(midiInputId, inputs);
                }
                
                this.midiIn = inputs[portIndex];
                inputPort = inputs[portIndex].name ?? undefined;
                
                // Set up MIDI input callback
                this.midiIn.onmidimessage = this.midiCallback.bind(this) as any;
            } else {
                logger.log('WARNING: No MIDI input ports available');
            }
            
            // Emit connection event
            this.emit(CONNECTION_EVENT, {
                connected: true,
                inputPort,
                outputPort
            });
            
        } catch (error) {
            logger.log('✗ Failed to get MIDI access:', error);
            
            // Emit disconnection event
            this.emit(CONNECTION_EVENT, { connected: false });
        }
    }

    /**
     * Resolve input ID to port index
     */
    private resolveInputId(midiInputId: string, inputs: MIDIInput[]): number {
        // Try to parse as number
        const portIndex = parseInt(midiInputId);
        if (!isNaN(portIndex) && portIndex >= 0 && portIndex < inputs.length) {
            return portIndex;
        }
        
        // Try to find port by name
        for (let idx = 0; idx < inputs.length; idx++) {
            const portName = inputs[idx].name ?? '';
            if (portName === midiInputId || portName.includes(midiInputId)) {
                return idx;
            }
        }
        
        logger.log(`WARNING: MIDI input port '${midiInputId}' not found, using port 0`);
        return 0;
    }

    /**
     * Handle incoming MIDI messages
     */
    private midiCallback(event: MIDIMessageEvent): void {
        const message = event.data;
        
        if (message.length >= 3) {
            const command = message[0];
            const note = message[1];
            const velocity = message[2];
            
            const notationList = [...Note.sharpNotations, ...Note.sharpNotations];
            const notation = notationList[note % Note.sharpNotations.length];
            const octave = Math.floor(note / Note.sharpNotations.length) - 1;
            
            if (command === 144) {  // Note on message
                if (velocity > 0) {
                    this.onNoteDown(notation, octave);
                } else {
                    this.onNoteUp(notation, octave);
                }
            } else if (command === 128) {  // Note off message
                this.onNoteUp(notation, octave);
            }
        }
    }

    /**
     * Send a pitch bend message
     * @param bendValue Float between -1.0 (full down) and 1.0 (full up), 0 is center
     */
    sendPitchBend(bendValue: number): void {
        if (!this.midiOut) return;
        
        // Clamp bend_value to valid range
        bendValue = Math.max(-1.0, Math.min(1.0, bendValue));
        
        // Convert to 14-bit MIDI pitch bend value (0-16383, center is 8192)
        let midiBend = Math.floor((bendValue + 1.0) * 8192);
        midiBend = Math.max(0, Math.min(16383, midiBend));
        
        // Split into LSB and MSB (7 bits each)
        const lsb = midiBend & 0x7F;
        const msb = (midiBend >> 7) & 0x7F;
        
        // Determine which channels to send on
        const channels = this.midiStrumChannel !== null 
            ? [this.midiStrumChannel - 1]
            : Array.from({ length: 16 }, (_, i) => i);
        
        // Send pitch bend messages (0xE0 + channel)
        for (const channel of channels) {
            const pitchBendMessage = [0xE0 + channel, lsb, msb];
            logger.log(`Sending PITCH_BEND: channel=${channel + 1}, value=${bendValue.toFixed(3)}, midiBend=${midiBend}, msb=${msb}, lsb=${lsb}`);
            this.midiOut.send(pitchBendMessage);
        }
    }

    /**
     * Immediately release specific notes by canceling timers and sending note-offs
     */
    releaseNotes(notes: NoteObject[]): void {
        if (!this.midiOut || !notes || notes.length === 0) return;
        
        // Determine which channels to send on
        const channels = this.midiStrumChannel !== null
            ? [this.midiStrumChannel - 1]
            : Array.from({ length: 16 }, (_, i) => i);
        
        // Convert notes to MIDI note numbers and release them
        for (const note of notes) {
            const midiNote = Note.notationToMIDI(note.notation + String(note.octave));
            const noteKey = `${midiNote}-${channels.join(',')}`;
            
            // Cancel the timer if it exists
            const timer = this.activeNoteTimers.get(noteKey);
            if (timer !== undefined) {
                window.clearTimeout(timer);
                this.activeNoteTimers.delete(noteKey);
            }
            this.noteStartTimes.delete(noteKey);
            
            // Send note-off messages
            for (const channel of channels) {
                const noteOffMessage = [0x80 + channel, midiNote, 0x40];
                logger.log(`Sending NOTE_OFF: channel=${channel + 1}, note=${midiNote}`);
                this.midiOut.send(noteOffMessage);
            }
        }
    }

    /**
     * Send a MIDI note with non-blocking note-off
     */
    sendNote(note: NoteObject, velocity: number, duration: number = 1.5): void {
        if (!this.midiOut) return;
        
        const midiNote = Note.notationToMIDI(note.notation + String(note.octave));
        
        // Determine which channels to send on
        const channels = this.midiStrumChannel !== null
            ? [this.midiStrumChannel - 1]
            : Array.from({ length: 16 }, (_, i) => i);
        
        // Create unique key for this note+channels combination
        const noteKey = `${midiNote}-${channels.join(',')}`;
        
        // Cancel any existing timer for this note to prevent premature note-off
        const oldTimer = this.activeNoteTimers.get(noteKey);
        if (oldTimer !== undefined) {
            window.clearTimeout(oldTimer);
            this.activeNoteTimers.delete(noteKey);
        }
        
        // Send note-on messages
        for (const channel of channels) {
            const noteOnMessage = [0x90 + channel, midiNote, velocity];
            logger.log(`Sending NOTE_ON: channel=${channel + 1}, note=${midiNote}, velocity=${velocity}`);
            this.midiOut.send(noteOnMessage);
        }
        
        // Track when this note started
        this.noteStartTimes.set(noteKey, Date.now());
        
        // Schedule note-off with a timer that can be cancelled
        const timer = window.setTimeout(() => {
            if (this.midiOut) {
                for (const channel of channels) {
                    const noteOffMessage = [0x80 + channel, midiNote, 0x40];
                    logger.log(`Sending NOTE_OFF: channel=${channel + 1}, note=${midiNote} (auto-release after ${duration}s)`);
                    this.midiOut.send(noteOffMessage);
                }
            }
            
            // Remove this timer from active timers
            this.activeNoteTimers.delete(noteKey);
            this.noteStartTimes.delete(noteKey);
        }, duration * 1000);
        
        // Store the timer
        this.activeNoteTimers.set(noteKey, timer);
    }

    /**
     * Send a raw MIDI note number on a specific channel with non-blocking note-off
     */
    sendRawNote(midiNote: number, velocity: number, channel: number | null = null, duration: number = 1.5): void {
        if (!this.midiOut) return;
        
        // Determine which channel to send on
        let channels: number[];
        if (channel !== null) {
            channels = [channel - 1];  // Convert 1-16 to 0-15
        } else if (this.midiStrumChannel !== null) {
            channels = [this.midiStrumChannel - 1];
        } else {
            channels = Array.from({ length: 16 }, (_, i) => i);
        }
        
        // Create unique key for this note+channels combination
        const noteKey = `${midiNote}-${channels.join(',')}`;
        
        // Cancel any existing timer for this note to prevent premature note-off
        const oldTimer = this.activeNoteTimers.get(noteKey);
        if (oldTimer !== undefined) {
            window.clearTimeout(oldTimer);
            this.activeNoteTimers.delete(noteKey);
        }
        
        // Send note-on messages
        for (const ch of channels) {
            const noteOnMessage = [0x90 + ch, midiNote, velocity];
            this.midiOut.send(noteOnMessage);
        }
        
        // Track when this note started
        this.noteStartTimes.set(noteKey, Date.now());
        
        // Schedule note-off with a timer that can be cancelled
        const timer = window.setTimeout(() => {
            if (this.midiOut) {
                for (const ch of channels) {
                    const noteOffMessage = [0x80 + ch, midiNote, 0x40];
                    this.midiOut.send(noteOffMessage);
                }
            }
            
            // Remove this timer from active timers
            this.activeNoteTimers.delete(noteKey);
            this.noteStartTimes.delete(noteKey);
        }, duration * 1000);
        
        // Store the timer
        this.activeNoteTimers.set(noteKey, timer);
    }

    /**
     * Handle note down event
     */
    private onNoteDown(notation: string, octave: number): void {
        const noteStr = notation + String(octave);
        if (!this._notes.includes(noteStr)) {
            this._notes.push(noteStr);
            this._notes = Note.sort(this._notes);
            
            // Emit event
            this.emit(NOTE_EVENT, {
                notes: [...this._notes],
                added: noteStr
            });
        }
    }

    /**
     * Handle note up event
     */
    private onNoteUp(notation: string, octave: number): void {
        const noteStr = notation + String(octave);
        const index = this._notes.indexOf(noteStr);
        if (index !== -1) {
            this._notes.splice(index, 1);
            this._notes = Note.sort(this._notes);
            
            // Emit event
            this.emit(NOTE_EVENT, {
                notes: [...this._notes],
                removed: noteStr
            });
        }
    }

    /**
     * Choose MIDI input by ID (can be port index or port name)
     */
    async chooseInput(inputId: string): Promise<void> {
        if (!this.midiAccess) {
            logger.log('MIDI access not initialized');
            return;
        }
        
        try {
            // Close current input if any
            if (this.midiIn) {
                this.midiIn.onmidimessage = null;
            }
            
            const inputs = Array.from(this.midiAccess.inputs.values());
            const portIndex = this.resolveInputId(inputId, inputs);
            
            this.midiIn = inputs[portIndex];
            this.midiIn.onmidimessage = this.midiCallback.bind(this) as any;
            
            const inputPort = inputs[portIndex].name ?? undefined;
            
            // Emit connection event
            this.emit(CONNECTION_EVENT, {
                connected: true,
                inputPort
            });
        } catch (error) {
            logger.log('Error choosing MIDI input:', error);
            this.emit(CONNECTION_EVENT, { connected: false });
        }
    }

    /**
     * Close MIDI connections
     */
    close(): void {
        // Cancel all active note timers
        for (const timer of this.activeNoteTimers.values()) {
            window.clearTimeout(timer);
        }
        this.activeNoteTimers.clear();
        this.noteStartTimes.clear();
        
        if (this.midiIn) {
            this.midiIn.onmidimessage = null;
        }
        
        // Emit disconnection event
        this.emit(CONNECTION_EVENT, { connected: false });
    }
}

