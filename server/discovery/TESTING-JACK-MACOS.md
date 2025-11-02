# Testing Jack MIDI on macOS

## Quick Start

### Option 1: Automated Test Script (Recommended)

Simply run:
```bash
./test-jack-macos.sh
```

This script will:
- ✅ Check all dependencies
- ✅ Start Jack server
- ✅ Start MIDI Strummer with Jack backend
- ✅ Verify ports are created
- ✅ Show live logs
- ✅ Clean up everything on Ctrl+C

### Option 2: Manual Step-by-Step

If you prefer to do it manually or the script doesn't work:

#### 1. Install Jack (first time only)
```bash
brew install jack
```

#### 2. Install Python Jack Client (first time only)
```bash
source venv/bin/activate
pip install JACK-Client
```

#### 3. Start Jack Server
```bash
jackd -d coreaudio -r 44100 -p 256 &
```

#### 4. Start MIDI Strummer
```bash
cd server
python main.py
```

You should see:
```
[MIDI] Using Jack MIDI backend (client: strumboli)
[Jack MIDI] Client 'strumboli' activated
[Jack MIDI] Output port: strumboli:midi_out
[Jack MIDI] Input port: strumboli:midi_in
```

#### 5. Verify Ports
```bash
jack_lsp -t | grep strumboli
```

Expected output:
```
strumboli:midi_in
strumboli:midi_out
```

## Testing with Sound

### Install a Software Synth

**Option A: FluidSynth (Recommended)**
```bash
# Install FluidSynth
brew install fluidsynth

# Download a soundfont (if you don't have one)
curl -L https://keymusician01.s3.amazonaws.com/FluidR3_GM.sf2 -o ~/FluidR3_GM.sf2

# Start FluidSynth with Jack
fluidsynth -a jack -m jack ~/FluidR3_GM.sf2 &
```

**Option B: Use a DAW**
- Open Logic Pro, GarageBand, or any Jack-compatible DAW
- Create a software instrument track
- The MIDI input should appear in Jack connections

### Connect MIDI Strummer to Synth

**Using jack_connect:**
```bash
# Connect strumboli output to FluidSynth input
jack_connect strumboli:midi_out fluidsynth:midi_in
```

**Using QjackCtl GUI:**
```bash
# Install QjackCtl
brew install qjackctl

# Launch it
qjackctl &

# Click "Connect" button, go to MIDI tab
# Drag from strumboli:midi_out to your synth's midi_in
```

### Test It!

1. Connect your drawing tablet
2. Use your stylus to strum across the tablet
3. You should hear notes! 🎵

## Monitoring & Debugging

### Watch MIDI Messages
```bash
jack_midi_dump strumboli:midi_out
```

### Check Jack Status
```bash
# List all Jack clients
jack_lsp

# List all MIDI ports
jack_lsp -t | grep -i midi

# Show connections
jack_lsp -c
```

### View Logs
```bash
# If using the test script
tail -f /tmp/strummer.log
tail -f /tmp/jack.log

# Or just run MIDI Strummer in foreground
cd server
python main.py
```

### Common Issues

**"JACK server not running"**
```bash
# Start Jack server
jackd -d coreaudio &

# Wait a moment, then check
jack_lsp
```

**"JACK-Client library not installed"**
```bash
# Activate venv first
source venv/bin/activate

# Then install
pip install JACK-Client
```

**"strumboli:midi_out not found"**
- Check if MIDI Strummer started successfully
- Look for error messages in the console
- Verify settings.json has `"midiOutputBackend": "jack"`
- It may have fallen back to rtmidi backend

**"No sound"**
- Verify connection: `jack_lsp -c | grep strumboli`
- Check synth is receiving: `jack_midi_dump fluidsynth:midi_in`
- Verify synth audio output is connected to system speakers in Jack

## Cleanup

### Stop Everything
```bash
# If using test script, just press Ctrl+C

# Manual cleanup:
killall python       # Stop MIDI Strummer
killall fluidsynth   # Stop FluidSynth (if running)
killall jackd        # Stop Jack server
```

### Reset Jack
```bash
# Remove Jack's temporary files
rm -rf /tmp/jack*
```

## Next Steps

Once you've confirmed it works on macOS:

1. ✅ Your Jack MIDI implementation is working!
2. 🚀 Deploy to your Raspberry Pi / Zynthian
3. 🎵 Enjoy low-latency MIDI through Jack

## Performance Tips

### Reduce Latency
```bash
# Smaller buffer size = lower latency (but higher CPU)
jackd -d coreaudio -r 44100 -p 128

# Or even lower (may cause audio glitches)
jackd -d coreaudio -r 44100 -p 64
```

### Increase Stability
```bash
# Larger buffer size = more stable (but higher latency)
jackd -d coreaudio -r 44100 -p 512
```

### Monitor Performance
```bash
# Check for xruns (buffer underruns)
# In QjackCtl, watch the "Xruns" counter

# Or check Jack's messages
tail -f /tmp/jack.log | grep -i xrun
```

## Questions?

- Review [JACK-MIDI-SETUP.md](JACK-MIDI-SETUP.md) for detailed documentation
- Check [JACK-MIDI-IMPLEMENTATION.md](JACK-MIDI-IMPLEMENTATION.md) for technical details
- Jack documentation: https://jackaudio.org/

