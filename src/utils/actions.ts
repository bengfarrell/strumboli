/**
 * Action handlers for stylus button and other input actions
 * Provides a centralized way to handle user actions like toggling features
 */

import { EventEmitter } from './event-emitter.js';
import { Config } from './config.js';
import { strummer } from './music/strummer.js';
import { Note } from './music/note.js';
import { ChordProgressionState } from './music/chord-progression-state.js';
import { createLogger } from './logger.js';

const logger = createLogger('Actions');

interface ActionsEvents {
    config_changed: void;
}

type ActionDefinition = string | [string, ...any[]] | null;
type ActionHandler = (params: any[], context: Record<string, any>) => void;

export class Actions extends EventEmitter<ActionsEvents> {
    private config: Config;
    private actionHandlers: Map<string, ActionHandler> = new Map();
    private progressionState: ChordProgressionState;

    constructor(config: Config) {
        super();
        this.config = config;
        this.progressionState = new ChordProgressionState();

        // Register action handlers
        this.actionHandlers.set('toggle-repeater', this.toggleRepeater.bind(this));
        this.actionHandlers.set('transpose', this.transpose.bind(this));
        this.actionHandlers.set('set-strum-notes', this.setStrumNotes.bind(this));
        this.actionHandlers.set('set-strum-chord', this.setStrumChord.bind(this));
        this.actionHandlers.set('set-chord-in-progression', this.setChordInProgression.bind(this));
        this.actionHandlers.set('increment-chord-in-progression', this.incrementChordInProgression.bind(this));
    }

    /**
     * Execute an action by definition
     */
    execute(actionDef: ActionDefinition, context: Record<string, any> = {}): boolean {
        if (actionDef === null || actionDef === 'none' || actionDef === '') {
            return false;
        }

        // Parse action definition
        let actionName: string;
        let params: any[];

        if (typeof actionDef === 'string') {
            actionName = actionDef;
            params = [];
        } else if (Array.isArray(actionDef) && actionDef.length > 0) {
            actionName = actionDef[0];
            params = actionDef.slice(1);
        } else {
            logger.log(`Invalid action definition:`, actionDef);
            return false;
        }

        // Execute the action
        const handler = this.actionHandlers.get(actionName);
        if (handler) {
            handler(params, context);
            return true;
        } else {
            logger.log(`Unknown action '${actionName}'`);
            return false;
        }
    }

    /**
     * Toggle the note repeater feature on/off
     */
    private toggleRepeater(_params: any[], context: Record<string, any>): void {
        const noteRepeaterCfg = this.config.get('noteRepeater', {});
        const currentActive = noteRepeaterCfg.active ?? false;
        const newState = !currentActive;
        this.config.set('noteRepeater.active', newState);

        const button = context.button ?? 'Unknown';
        logger.log(`${button} button toggled repeater: ${newState ? 'ON' : 'OFF'}`);

        // Emit config changed event
        this.emit('config_changed', undefined);
    }

    /**
     * Toggle transpose on/off with specified semitones
     */
    private transpose(params: any[], context: Record<string, any>): void {
        if (params.length === 0 || typeof params[0] !== 'number') {
            logger.log('transpose action requires semitones parameter');
            return;
        }

        const semitones = Math.floor(params[0]);
        const transposeCfg = this.config.get('transpose', {});
        const button = context.button ?? 'Unknown';

        // Toggle: if currently active with same semitones, turn off; otherwise turn on with new semitones
        if (transposeCfg.active && transposeCfg.semitones === semitones) {
            // Turn off
            this.config.set('transpose.active', false);
            this.config.set('transpose.semitones', 0);
            logger.log(`${button} button disabled transpose`);
        } else {
            // Turn on with specified semitones
            this.config.set('transpose.active', true);
            this.config.set('transpose.semitones', semitones);
            logger.log(`${button} button enabled transpose: ${semitones >= 0 ? '+' : ''}${semitones} semitones`);
        }

        // Emit config changed event
        this.emit('config_changed', undefined);
    }

    /**
     * Get the current transpose semitones
     */
    getTransposeSemitones(): number {
        const transposeCfg = this.config.get('transpose', {});
        if (transposeCfg.active) {
            return transposeCfg.semitones ?? 0;
        }
        return 0;
    }

    /**
     * Check if transpose is currently active
     */
    isTransposeActive(): boolean {
        const transposeCfg = this.config.get('transpose', {});
        return transposeCfg.active ?? false;
    }

    /**
     * Set the strumming notes to a specific set of notes
     */
    private setStrumNotes(params: any[], context: Record<string, any>): void {
        if (params.length === 0 || !Array.isArray(params[0])) {
            logger.log('set-strum-notes action requires an array of note strings');
            return;
        }

        const noteStrings = params[0];

        // Validate that all items are strings
        if (!noteStrings.every((n: any) => typeof n === 'string')) {
            logger.log('set-strum-notes requires all notes to be strings');
            return;
        }

        if (noteStrings.length === 0) {
            logger.log('set-strum-notes requires at least one note');
            return;
        }

        try {
            // Parse note strings into Note objects
            const notes = noteStrings.map((n: string) => Note.parseNotation(n));

            // Get note spread configuration
            const strummingCfg = this.config.get('strumming', {});
            const lowerSpread = strummingCfg.lowerNoteSpread ?? 0;
            const upperSpread = strummingCfg.upperNoteSpread ?? 0;

            // Apply note spread and set strummer notes
            strummer.notes = Note.fillNoteSpread(notes, lowerSpread, upperSpread);

            // Log the action
            const button = context.button ?? 'Unknown';
            const noteNames = noteStrings.join(', ');
            logger.log(`${button} button set strum notes: [${noteNames}]`);

        } catch (error) {
            logger.log('Error parsing notes:', error);
        }
    }

    /**
     * Set the strumming notes using chord notation
     */
    private setStrumChord(params: any[], context: Record<string, any>): void {
        if (params.length === 0 || typeof params[0] !== 'string') {
            logger.log('set-strum-chord action requires chord notation string');
            return;
        }

        const chordNotation = params[0];
        let octave = 4;  // Default octave

        // Check for optional octave parameter
        if (params.length > 1 && typeof params[1] === 'number') {
            octave = Math.floor(params[1]);
        }

        try {
            // Parse chord into notes
            const notes = Note.parseChord(chordNotation, octave);

            if (!notes || notes.length === 0) {
                logger.log(`Failed to parse chord '${chordNotation}'`);
                return;
            }

            // Get note spread configuration
            const strummingCfg = this.config.get('strumming', {});
            const lowerSpread = strummingCfg.lowerNoteSpread ?? 0;
            const upperSpread = strummingCfg.upperNoteSpread ?? 0;

            // Apply note spread and set strummer notes
            strummer.notes = Note.fillNoteSpread(notes, lowerSpread, upperSpread);

            // Log the action
            const button = context.button ?? 'Unknown';
            const noteNames = notes.map(n => `${n.notation}${n.octave}`).join(', ');
            logger.log(`${button} button set strum chord: ${chordNotation} [${noteNames}]`);

        } catch (error) {
            logger.log('Error parsing chord:', error);
        }
    }

    /**
     * Set the chord progression to a specific index and apply that chord
     */
    private setChordInProgression(params: any[], context: Record<string, any>): void {
        if (params.length < 2) {
            logger.log('set-chord-in-progression requires progression name and index');
            return;
        }

        if (typeof params[0] !== 'string') {
            logger.log('First parameter must be progression name (string)');
            return;
        }

        if (typeof params[1] !== 'number') {
            logger.log('Second parameter must be index (number)');
            return;
        }

        const progressionName = params[0];
        const index = Math.floor(params[1]);
        let octave = 4;  // Default octave

        // Check for optional octave parameter
        if (params.length > 2 && typeof params[2] === 'number') {
            octave = Math.floor(params[2]);
        }

        // Load progression if different from current
        if (this.progressionState.progressionName !== progressionName) {
            if (!this.progressionState.loadProgression(progressionName)) {
                return;
            }
        }

        // Set the index
        const actualIndex = this.progressionState.setIndex(index);
        const chordNotation = this.progressionState.getCurrentChord();

        if (!chordNotation) {
            logger.log('Could not get chord from progression');
            return;
        }

        try {
            // Parse chord into notes
            const notes = Note.parseChord(chordNotation, octave);

            if (!notes || notes.length === 0) {
                logger.log(`Failed to parse chord '${chordNotation}'`);
                return;
            }

            // Get note spread configuration
            const strummingCfg = this.config.get('strumming', {});
            const lowerSpread = strummingCfg.lowerNoteSpread ?? 0;
            const upperSpread = strummingCfg.upperNoteSpread ?? 0;

            // Apply note spread and set strummer notes
            strummer.notes = Note.fillNoteSpread(notes, lowerSpread, upperSpread);

            // Log the action
            const button = context.button ?? 'Unknown';
            logger.log(`${button} button set progression '${progressionName}' to index ${actualIndex}: ${chordNotation}`);

        } catch (error) {
            logger.log('Error setting chord in progression:', error);
        }
    }

    /**
     * Increment the current chord progression index and apply that chord
     */
    private incrementChordInProgression(params: any[], context: Record<string, any>): void {
        if (params.length < 1) {
            logger.log('increment-chord-in-progression requires progression name');
            return;
        }

        if (typeof params[0] !== 'string') {
            logger.log('First parameter must be progression name (string)');
            return;
        }

        const progressionName = params[0];
        let incrementAmount = 1;  // Default increment
        let octave = 4;  // Default octave

        // Check for optional increment amount parameter
        if (params.length > 1 && typeof params[1] === 'number') {
            incrementAmount = Math.floor(params[1]);
        }

        // Check for optional octave parameter
        if (params.length > 2 && typeof params[2] === 'number') {
            octave = Math.floor(params[2]);
        }

        // Load progression if different from current
        if (this.progressionState.progressionName !== progressionName) {
            if (!this.progressionState.loadProgression(progressionName)) {
                return;
            }
        }

        // Increment the index
        const actualIndex = this.progressionState.incrementIndex(incrementAmount);
        const chordNotation = this.progressionState.getCurrentChord();

        if (!chordNotation) {
            logger.log('Could not get chord from progression');
            return;
        }

        try {
            // Parse chord into notes
            const notes = Note.parseChord(chordNotation, octave);

            if (!notes || notes.length === 0) {
                logger.log(`Failed to parse chord '${chordNotation}'`);
                return;
            }

            // Get note spread configuration
            const strummingCfg = this.config.get('strumming', {});
            const lowerSpread = strummingCfg.lowerNoteSpread ?? 0;
            const upperSpread = strummingCfg.upperNoteSpread ?? 0;

            // Apply note spread and set strummer notes
            strummer.notes = Note.fillNoteSpread(notes, lowerSpread, upperSpread);

            // Log the action
            const button = context.button ?? 'Unknown';
            const direction = incrementAmount > 0 ? 'forward' : 'backward';
            logger.log(`${button} button incremented progression '${progressionName}' ${direction} by ${Math.abs(incrementAmount)} to index ${actualIndex}: ${chordNotation}`);

        } catch (error) {
            logger.log('Error incrementing chord in progression:', error);
        }
    }

    /**
     * Register a custom action handler
     */
    registerAction(actionName: string, handlerFunc: ActionHandler): void {
        this.actionHandlers.set(actionName, handlerFunc);
        logger.log(`Registered custom action: ${actionName}`);
    }

    /**
     * Get list of all available action names
     */
    getAvailableActions(): string[] {
        return Array.from(this.actionHandlers.keys());
    }
}

