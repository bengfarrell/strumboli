# Jack MIDI Setup Guide

This guide explains how to configure MIDI Strummer to output MIDI through Jack Audio Connection Kit, which is required for integration with Zynthian and other Jack-based systems.

## Overview

MIDI Strummer supports two MIDI output backends:

1. **rtmidi** (default) - Direct ALSA MIDI output for general Linux systems
2. **jack** - Jack MIDI output for integration with Jack-based audio systems like Zynthian

## Prerequisites

### Installing Jack on Raspberry Pi / Zynthian

If you're running Zynthian, Jack is likely already installed. Otherwise:

```bash
sudo apt-get update
sudo apt-get install jackd2 qjackctl
```

### Installing Python Jack Client

```bash
pip install JACK-Client
```

Or install all requirements:

```bash
pip install -r requirements.txt
```

## Configuration

### Option 1: Using settings.json

Create or edit your `settings.json` file:

```json
{
  "startupConfiguration": {
    "midiOutputBackend": "jack",
    "jackClientName": "midi_strummer"
  }
}
```

### Option 2: Editing config.py Defaults

For permanent changes, edit `server/config.py` and change the default:

```python
DEFAULTS = {
    "startupConfiguration": {
        "midiOutputBackend": "jack",  # Changed from "rtmidi"
        "jackClientName": "midi_strummer",
        # ... other settings
    }
}
```

## Configuration Options

| Option | Values | Description |
|--------|--------|-------------|
| `midiOutputBackend` | `"rtmidi"` or `"jack"` | Choose MIDI output backend |
| `jackClientName` | any string | Name for the Jack client (default: "midi_strummer") |

## Running with Jack MIDI

1. **Start Jack** (if not already running):
   ```bash
   jackd -d alsa
   ```

2. **Start MIDI Strummer**:
   ```bash
   cd server
   python main.py
   ```

3. You should see output like:
   ```
   [MIDI] Using Jack MIDI backend (client: midi_strummer)
   [Jack MIDI] Client 'midi_strummer' activated
   [Jack MIDI] Output port: midi_strummer:midi_out
   [Jack MIDI] Input port: midi_strummer:midi_in
   [Jack MIDI] Connect ports using qjackctl, jack_connect, or Zynthian's audio mixer
   ```

## Connecting Jack MIDI Ports

### Method 1: Using qjackctl (GUI)

1. Open qjackctl: `qjackctl &`
2. Click the "Connect" button
3. Go to the "MIDI" tab
4. Connect `midi_strummer:midi_out` to your desired instrument input (e.g., `a2j:ZynAddSubFX [20] (capture): ZynAddSubFX`)

### Method 2: Using jack_connect (Command Line)

```bash
# List available MIDI ports
jack_lsp -t

# Connect midi_strummer output to an instrument
jack_connect midi_strummer:midi_out <instrument_name>:midi_in
```

### Method 3: Using Zynthian Web Interface

1. Open Zynthian's web interface
2. Navigate to Audio Mixer / Connections
3. Connect `midi_strummer:midi_out` to your instrument's MIDI input

### Method 4: Auto-connect with jack_connect

Create a startup script that auto-connects after starting:

```bash
#!/bin/bash
cd /path/to/midi-strummer/server
python main.py &

# Wait for Jack client to initialize
sleep 2

# Auto-connect to ZynAddSubFX (example)
jack_connect midi_strummer:midi_out "ZynAddSubFX:midi_in"
```

## Troubleshooting

### "JACK-Client library not installed"

Install the library:
```bash
pip install JACK-Client
```

### "Jack server not running"

Start the Jack server:
```bash
jackd -d alsa
```

Or on Zynthian, ensure the audio system is running.

### No sound after connecting

1. Check that your instrument is loaded and active
2. Verify the MIDI channel matches (default: all channels 1-16)
3. Use `jack_midi_dump` to verify MIDI is being sent:
   ```bash
   jack_midi_dump midi_strummer:midi_out
   ```

### Fallback to rtmidi

If Jack initialization fails, MIDI Strummer automatically falls back to rtmidi:
```
[MIDI] Failed to initialize Jack MIDI: ...
[MIDI] Falling back to rtmidi backend
```

Check Jack server status and configuration.

## Comparison: Jack vs rtmidi

| Feature | rtmidi | Jack |
|---------|--------|------|
| Setup | Simple | Requires Jack server |
| Zynthian Integration | Limited | Full integration |
| Routing Flexibility | Basic | Advanced via Jack |
| Latency | Low | Very low |
| Multi-client | Limited | Excellent |

## Integration with Zynthian

For Zynthian integration, Jack is the **recommended** backend because:

1. ✅ Seamless integration with Zynthian's audio engine
2. ✅ Flexible routing to any synth engine (ZynAddSubFX, FluidSynth, etc.)
3. ✅ Full control via Zynthian's web interface
4. ✅ Lower latency for real-time performance
5. ✅ Better multi-instrument support

### Zynthian Example Configuration

```json
{
  "startupConfiguration": {
    "midiOutputBackend": "jack",
    "jackClientName": "midi_strummer",
    "drawingTablet": "auto-detect"
  },
  "strumming": {
    "midiChannel": null,
    "initialNotes": ["C4", "E4", "G4"]
  }
}
```

## Advanced: Custom Jack Client Name

If running multiple instances or integrating with complex setups:

```json
{
  "startupConfiguration": {
    "midiOutputBackend": "jack",
    "jackClientName": "strummer_lead"
  }
}
```

This creates a Jack client named "strummer_lead" with ports:
- `strummer_lead:midi_out`
- `strummer_lead:midi_in`

## Further Reading

- [Jack Audio Connection Kit](https://jackaudio.org/)
- [Zynthian Documentation](https://wiki.zynthian.org/)
- [JACK-Client Python Library](https://pypi.org/project/JACK-Client/)
- [jackmidiola C++ Reference](https://github.com/riban-bw/jackmidiola) (inspiration for this implementation)

## Support

If you encounter issues:
1. Check that Jack server is running
2. Verify JACK-Client is installed
3. Test with `jack_lsp` to see available ports
4. Check system logs for error messages

