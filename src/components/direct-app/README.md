# Direct App Component

A browser-only version of the Strumboli app that uses **WebHID** and **WebMIDI** directly, without requiring a WebSocket connection to a Python server.

## Overview

This component provides the exact same visualization dashboard and functionality as the standard app, but with a key difference:

- **Standard App** (`strummer-app`): Communicates with Python server via WebSocket
- **Direct App** (`strummer-direct-app`): Uses browser APIs directly - no server needed!

## Key Features

✅ **WebHID** for graphics tablet input  
✅ **WebMIDI** for MIDI I/O  
✅ Full strumming engine implementation  
✅ Pressure sensitivity and velocity calculation  
✅ Note repeater support  
✅ Transpose control  
✅ Stylus and tablet button actions  
✅ All visualization panels  
✅ Configuration dashboard  

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Direct App Component                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────┐ │
│  │   WebHID    │───▶│  Strummer   │───▶│  WebMIDI   │ │
│  │  (Tablet)   │    │   Engine    │    │  (Output)  │ │
│  └─────────────┘    └─────────────┘    └────────────┘ │
│         │                  │                   │       │
│         │                  │                   │       │
│         ▼                  ▼                   ▼       │
│  ┌─────────────────────────────────────────────────┐  │
│  │         Visualization Dashboard                 │  │
│  │  • Tablet viz  • Curve viz  • Piano viz        │  │
│  │  • Config panels  • Button configs             │  │
│  └─────────────────────────────────────────────────┘  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Data Flow

1. **Tablet Input** (WebHID)
   - User touches tablet with stylus
   - WebHID reports: position, pressure, tilt, buttons
   - HIDReader processes raw bytes → normalized data

2. **Strumming Processing**
   - Strummer receives position & pressure
   - Calculates velocity from pressure rate
   - Detects string crossing
   - Generates strum/release events

3. **Actions Handling**
   - Button presses trigger actions
   - Toggle features (repeater, transpose)
   - Change chords/progressions
   - Modify configuration

4. **MIDI Output** (WebMIDI)
   - Notes sent to MIDI device
   - Channel routing
   - Velocity and duration applied
   - Pitch bend messages

5. **Visualization Updates**
   - Tablet visualizer shows position/pressure
   - Piano highlights active notes
   - Curve visualizers show effect mappings
   - Button states update UI

## Usage

### Basic HTML Setup

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Strumboli - Direct Mode</title>
    <script type="module" src="/dist/direct-app.js"></script>
</head>
<body>
    <strummer-direct-app></strummer-direct-app>
</body>
</html>
```

### With Custom Configuration

```html
<script type="module">
    import './components/direct-app/index.js';
    
    // Wait for component to load
    customElements.whenDefined('strummer-direct-app').then(() => {
        const app = document.querySelector('strummer-direct-app');
        
        // Access the config directly if needed
        // (normally handled through UI)
    });
</script>

<strummer-direct-app></strummer-direct-app>
```

## Connection Flow

### 1. MIDI Connection (Automatic)
On component load, WebMIDI automatically initializes and connects to available MIDI devices.

**Status Display:**
- 🟢 MIDI Connected - Ready to send notes
- 🔴 MIDI Disconnected - No MIDI devices found

### 2. Tablet Connection (Manual)
User must explicitly grant permission to access the tablet.

**Steps:**
1. Click "Connect Tablet" button
2. Browser shows device picker
3. Select your tablet device
4. Permission granted → device opens
5. HIDReader starts reading data

**Status Display:**
- 🟢 [Device Name] - Tablet connected and reading
- 🔴 No Tablet - No device connected

## Browser Compatibility

### Required APIs

| API | Chrome | Edge | Firefox | Safari |
|-----|--------|------|---------|--------|
| **WebMIDI** | ✅ 43+ | ✅ 79+ | ⚠️ Flag | ❌ No |
| **WebHID** | ✅ 89+ | ✅ 89+ | ❌ No | ❌ No |

**Recommendation:** Use Chrome or Edge for full functionality.

### Enabling in Firefox

WebMIDI requires enabling a flag:
1. Go to `about:config`
2. Set `dom.webmidi.enabled` to `true`
3. Restart browser

*Note: WebHID is not available in Firefox yet.*

## Panel Overview

The direct app includes all the same panels as the standard app:

### System
- **Device Connection** - Connect tablet and view MIDI status

### Visualizations
- **Drawing Tablet** - Real-time tablet position and string visualization
- **Pen Tilt** - Tilt angle visualization
- **Keyboard** - Piano with active notes

### Inputs (Effect Controls)
- **Note Duration** - How long notes play
- **Pitch Bend** - Pitch modulation
- **Note Velocity** - How loud notes play

### Button Configuration
- **Stylus Buttons** - Primary/Secondary button actions
- **Tablet Buttons** - 8 tablet button actions

### Features
- **Strumming** - Core strumming configuration
- **Note Repeater** - Auto-repeat notes while holding
- **Transpose** - Shift notes up/down by semitones
- **Strum Release** - Send note on pen release

## Configuration Persistence

Settings are managed through:
1. **Default Configuration** - Built into the component
2. **Settings API** - Loads from `/api/settings` if available
3. **UI Changes** - Updates config in real-time
4. **Local Controllers** - Shared state across components

## Differences from Standard App

| Feature | Standard App | Direct App |
|---------|-------------|------------|
| **Connection** | WebSocket to server | Direct browser APIs |
| **Tablet Input** | Via WebSocket | WebHID |
| **MIDI I/O** | Server handles | WebMIDI |
| **Processing** | Python server | TypeScript utilities |
| **Setup** | Run Python server first | Open in browser |
| **Latency** | Network + Python | Native browser |
| **Permissions** | None (server has access) | Must grant HID/MIDI access |

## Advantages of Direct Mode

1. **No Server Required** - Pure browser app
2. **Lower Latency** - No network round-trip
3. **Simpler Setup** - Just open in browser
4. **Cross-Platform** - Works anywhere browsers work*
5. **Direct Control** - Full access to device APIs

*\*Subject to browser API support*

## Troubleshooting

### Tablet Not Detected

**Problem:** "Connect Tablet" shows no devices

**Solutions:**
1. Ensure tablet is plugged in via USB
2. Try a different USB port/cable
3. Check if device is recognized by OS
4. Refresh the page and try again
5. Use Chrome or Edge (not Firefox/Safari)

### MIDI Not Working

**Problem:** No sound when strumming

**Solutions:**
1. Check MIDI device is connected
2. Verify MIDI output device in system settings
3. Ensure synthesizer/DAW is listening
4. Try refreshing the page
5. Check browser console for errors

### High Latency

**Problem:** Notes delayed after stylus touch

**Solutions:**
1. Close other applications
2. Disable browser extensions
3. Check system CPU usage
4. Try a different browser
5. Reduce note duration in settings

### Buttons Not Working

**Problem:** Stylus/tablet buttons don't respond

**Solutions:**
1. Check button configuration in panels
2. Verify actions are assigned
3. Console should log button presses
4. Ensure device supports button events
5. Try re-connecting the tablet

## Advanced Usage

### Custom Actions

You can register custom actions programmatically:

```typescript
// Access the component
const app = document.querySelector('strummer-direct-app') as any;

// Register a custom action
app.actions?.registerAction('my-action', (params, context) => {
    console.log('Custom action triggered!', params, context);
    // Your custom logic here
});
```

### Accessing Internal State

```typescript
const app = document.querySelector('strummer-direct-app') as any;

// Get current notes
console.log('Current notes:', app.notes);

// Get tablet data
console.log('Tablet data:', app.tabletData);

// Get config
console.log('Config:', app.config.toDict());
```

### Event Listening

```typescript
const app = document.querySelector('strummer-direct-app') as any;

// Listen for note changes
app.midi?.on('note', (event) => {
    console.log('MIDI notes changed:', event.notes);
});

// Listen for strummer changes
strummer.on('notes_changed', () => {
    console.log('Strummer notes updated');
});
```

## Performance Considerations

- **HID Polling Rate:** ~125Hz typical for tablets
- **MIDI Output:** Low latency (<10ms typical)
- **Strummer Processing:** <1ms per update
- **UI Update Rate:** Throttled to 100ms for efficiency

## Development

To modify the direct app component:

1. Edit `direct-app.ts`
2. Rebuild: `npm run build`
3. Test in browser

The component is built with:
- **Lit** - Web component framework
- **TypeScript** - Type-safe code
- **Spectrum Web Components** - Adobe's design system

## See Also

- [Utils README](../../utils/README.md) - TypeScript utilities documentation
- [Panel Schemas](../../panel-schemas.ts) - Panel configuration
- [Controllers](../../controllers/) - Shared state management

## License

Same as parent project.

