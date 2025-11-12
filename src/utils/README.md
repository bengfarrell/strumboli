# MIDI Strummer Utils - TypeScript Implementation

This directory contains TypeScript implementations of the Python server features, using browser APIs (WebHID and WebMIDI) for device access.

## Overview

These utilities provide a complete browser-based implementation of the MIDI Strummer functionality:

- **WebHID** for graphics tablet input (replaces Python's `hid` library)
- **WebMIDI** for MIDI I/O (replaces Python's `rtmidi`)
- Event-based architecture for clean state management
- Configuration system with sensible defaults
- Strumming logic with pressure sensitivity
- Action system for button/gesture handling

## Files Created

### Core Utilities

#### `event-emitter.ts`
Type-safe event emitter for handling callbacks. Provides `on()`, `off()`, `once()`, and `emit()` methods with TypeScript type safety.

```typescript
import { EventEmitter } from './event-emitter';

interface MyEvents {
    note: { pitch: number };
    strum: { velocity: number };
}

const emitter = new EventEmitter<MyEvents>();
emitter.on('note', (data) => {
    console.log('Note:', data.pitch);
});
emitter.emit('note', { pitch: 60 });
```

#### `note.ts` (Updated)
Note manipulation utilities including:
- `parseNotation()` - Parse note strings like "C4", "G#5"
- `parseChord()` - Parse chord notation like "Cmaj7", "Am"
- `transposeNote()` - Transpose notes by semitones
- `fillNoteSpread()` - Add upper/lower octaves
- `notationToMIDI()` - Convert to MIDI note numbers
- Key signature and frequency utilities

```typescript
import { Note, transposeNote } from './note';

const notes = Note.parseChord('Cmaj7', 4);
// Returns: [C4, E4, G4, B4]

const transposed = transposeNote({ notation: 'C', octave: 4 }, 12);
// Returns: { notation: 'C', octave: 5 }
```

### MIDI Functionality

#### `midi.ts`
WebMIDI-based MIDI I/O handler with:
- Automatic device discovery
- Note on/off with timed release
- Pitch bend messages
- Channel routing
- Event emission for note changes

```typescript
import { Midi } from './midi';

const midi = new Midi();
await midi.refreshConnection();

// Listen for note events
midi.on('note', (event) => {
    console.log('Notes:', event.notes);
});

// Send a note
const note = { notation: 'C', octave: 4 };
midi.sendNote(note, 100, 1.5); // velocity, duration
```

#### `midi-event.ts`
Type definitions for MIDI events:
- `MidiConnectionEvent` - Connection status
- `MidiNoteEvent` - Note changes (added/removed)

### HID/Tablet Functionality

#### `hid-reader.ts`
WebHID-based tablet input handler:
- Reads raw HID reports
- Processes data using byte mappings
- Handles multi-interface devices
- Supports button and stylus interfaces

```typescript
import { HIDReader } from './hid-reader';

const device = await navigator.hid.requestDevice({
    filters: [{ vendorId: 0x256c }]
});

const reader = new HIDReader(
    device,
    config,
    (data) => {
        console.log('Tablet data:', data);
    }
);

await reader.startReading();
```

#### `data-helpers.ts`
Data processing utilities for HID input:
- `parseRangeData()` - Normalize byte values
- `parseMultiByteRangeData()` - Multi-byte values (14-bit pressure, etc.)
- `parseBipolarRangeData()` - Tilt sensors with +/- ranges
- `parseBitFlags()` - Button states from bit flags
- `applyCurve()` - Exponential response curves
- `applyEffect()` - Effect calculations (velocity, duration, pitch bend)

```typescript
import { applyEffect } from './data-helpers';

const velocity = applyEffect(
    config.noteVelocity,
    { pressure: 0.8 },
    'velocity'
);
```

### Configuration

#### `config.ts`
Configuration management with defaults:
- Tablet byte mappings
- MIDI channels and routing
- Effect configurations (velocity, duration, pitch bend)
- Strumming parameters
- Button actions

```typescript
import { Config } from './config';

const config = new Config();
// Uses built-in defaults

// Or load custom config
const customConfig = new Config({
    strumming: {
        initialNotes: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
    }
});

// Get/set values
const channel = config.get('strumming.midiChannel');
config.set('noteRepeater.active', true);
```

### Strumming Logic

#### `strummer.ts`
Core strumming engine with:
- Pressure threshold detection
- Velocity calculation from pressure
- Cross-string strumming
- Strum/release events
- Note state management

```typescript
import { strummer } from './strummer';

// Set notes to strum
strummer.notes = [
    { notation: 'C', octave: 4 },
    { notation: 'E', octave: 4 },
    { notation: 'G', octave: 4 }
];

// Process tablet input
const result = strummer.strum(xPos, pressure);
if (result?.type === 'strum') {
    for (const { note, velocity } of result.notes) {
        midi.sendNote(note, velocity);
    }
}
```

### Actions

#### `actions.ts`
Action system for button/gesture handling:
- Toggle repeater
- Transpose control
- Chord selection
- Chord progression navigation
- Custom action registration

```typescript
import { Actions } from './actions';

const actions = new Actions(config);

// Execute actions
actions.execute('toggle-repeater', { button: 'Primary' });
actions.execute(['transpose', 12], { button: 'Secondary' });
actions.execute(['set-strum-chord', 'Dm7', 3]);

// Listen for config changes
actions.on('config_changed', () => {
    console.log('Config updated!');
});
```

#### `chord-progression-state.ts`
Chord progression state management:
- Load progressions by name
- Navigate by index
- Increment/decrement
- Wrap-around support

```typescript
import { ChordProgressionState } from './chord-progression-state';

const progression = new ChordProgressionState();
progression.loadProgression('c-major-pop');
progression.incrementIndex(1); // Next chord
const chord = progression.getCurrentChord(); // "Dm"
```

## Architecture Comparison

### Python (Server-based)
- Uses `hid` library for tablet input
- Uses `rtmidi` for MIDI I/O
- Runs as standalone server
- WebSocket for browser communication

### TypeScript (Browser-based)
- Uses **WebHID API** for tablet input
- Uses **WebMIDI API** for MIDI I/O
- Runs entirely in browser
- Direct access to devices (no server needed)

## Usage Example

Complete example integrating all utilities:

```typescript
import { Config, Midi, HIDReader, strummer, Actions } from './utils';

// Initialize
const config = new Config();
const midi = new Midi(config.midiStrumChannel);
const actions = new Actions(config);

// Setup MIDI
await midi.refreshConnection();

// Setup strummer
strummer.configure(
    config.get('strumming').pluckVelocityScale,
    config.get('strumming').pressureThreshold
);

// Request HID device
const devices = await navigator.hid.requestDevice({
    filters: [{ usagePage: 0x0d, usage: 0x01 }] // Digitizer
});

if (devices.length > 0) {
    const device = devices[0];
    await device.open();
    
    // Create HID reader
    const reader = new HIDReader(
        device,
        config,
        (data) => {
            // Process tablet data
            const result = strummer.strum(data.x, data.pressure);
            
            if (result?.type === 'strum') {
                for (const { note, velocity } of result.notes) {
                    midi.sendNote(note, velocity);
                }
            }
            
            // Handle button presses
            if (data.primaryButtonPressed) {
                actions.execute(
                    config.get('stylusButtons').primaryButtonAction
                );
            }
        }
    );
    
    await reader.startReading();
}
```

## Browser Compatibility

### WebMIDI API
- Chrome/Edge: ✅ Full support
- Firefox: ⚠️ Behind flag
- Safari: ❌ Not supported

### WebHID API
- Chrome/Edge: ✅ Full support (v89+)
- Firefox: ❌ Not supported yet
- Safari: ❌ Not supported

### Recommended
Use Chrome or Edge for full functionality.

## Key Differences from Python Implementation

1. **No Jack MIDI**: Browser APIs don't support Jack, only standard MIDI devices
2. **No WebSocket Server**: These utilities run entirely in-browser
3. **Async/await**: Browser APIs are promise-based rather than blocking
4. **Device Permissions**: Browser requires user interaction to grant device access
5. **Event Loop**: Uses browser event loop instead of Python's asyncio

## TypeScript Benefits

- **Type Safety**: Catch errors at compile time
- **IntelliSense**: Better IDE support with autocomplete
- **Refactoring**: Safer code changes with type checking
- **Documentation**: Types serve as inline documentation

## Next Steps

To use these utilities in your application:

1. Import the utilities you need
2. Request device permissions (HID/MIDI)
3. Set up event handlers
4. Process input and send MIDI output

See the `src/components/` directory for UI integration examples.

