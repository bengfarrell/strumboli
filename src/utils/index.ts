/**
 * MIDI Strummer Utilities - TypeScript/WebHID/WebMIDI Implementation
 * 
 * This module provides browser-based equivalents of the Python server functionality:
 * - WebHID for tablet input (replaces python-hid)
 * - WebMIDI for MIDI I/O (replaces rtmidi/python-rtmidi)
 * - Event-based architecture for clean state management
 * - Configuration system with sensible defaults
 * - Strumming logic with pressure sensitivity
 * - Action system for button/gesture handling
 */

// Core utilities
export * from './event-emitter.js';
export * from './logger.js';

// Configuration
export * from './config.js';

// Data helpers
export * from './data-helpers.js';

// Actions
export * from './actions.js';

// Music functionality (MIDI, notes, strumming, chords)
export * from './music/note.js';
export { transposeNote } from './music/note.js';
export * from './music/midi.js';
export * from './music/midi-event.js';
export * from './music/strummer.js';
export * from './music/chord-progression-state.js';

// Tablet functionality (HID, device finding)
export * from './tablet/index.js';

