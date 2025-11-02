#!/bin/bash

# Jack MIDI Testing Script for macOS
# Tests MIDI Strummer with Jack Audio Connection Kit

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🎵 Jack MIDI Testing Script for MIDI Strummer${NC}"
echo "================================================"
echo ""

# Store PIDs for cleanup
JACK_PID=""
STRUMMER_PID=""
FLUIDSYNTH_PID=""

# Cleanup function
cleanup() {
    echo ""
    echo -e "${YELLOW}Cleaning up...${NC}"
    
    if [ ! -z "$STRUMMER_PID" ]; then
        echo "Stopping MIDI Strummer (PID: $STRUMMER_PID)"
        kill $STRUMMER_PID 2>/dev/null || true
    fi
    
    if [ ! -z "$FLUIDSYNTH_PID" ]; then
        echo "Stopping FluidSynth (PID: $FLUIDSYNTH_PID)"
        kill $FLUIDSYNTH_PID 2>/dev/null || true
    fi
    
    if [ ! -z "$JACK_PID" ]; then
        echo "Stopping Jack server (PID: $JACK_PID)"
        kill $JACK_PID 2>/dev/null || true
        sleep 1
    fi
    
    echo -e "${GREEN}✓ Cleanup complete${NC}"
    exit 0
}

# Set up trap for cleanup on Ctrl+C or script exit
trap cleanup SIGINT SIGTERM EXIT

echo -e "${BLUE}Step 1: Checking dependencies${NC}"
echo "-----------------------------------"

# Check if Jack is installed
if ! command -v jackd &> /dev/null; then
    echo -e "${RED}✗ Jack not found${NC}"
    echo "  Install with: brew install jack"
    exit 1
fi
echo -e "${GREEN}✓ Jack installed:${NC} $(which jackd)"

# Check for jack_lsp (optional - we can work without it)
if ! command -v jack_lsp &> /dev/null; then
    echo -e "${YELLOW}⚠ Jack utilities (jack_lsp, jack_connect) not found${NC}"
    echo -e "  These are optional but helpful for debugging"
    echo -e "  Install with: ${BLUE}brew install jack-example-tools${NC}"
    HAS_JACK_UTILS=false
else
    echo -e "${GREEN}✓ Jack utilities installed${NC}"
    HAS_JACK_UTILS=true
fi

# Check if Python JACK-Client is installed
echo ""
echo "Checking Python JACK-Client..."
if python -c "import jack" 2>/dev/null; then
    echo -e "${GREEN}✓ JACK-Client Python package installed${NC}"
else
    echo -e "${RED}✗ JACK-Client not installed${NC}"
    echo "  Install with: pip install JACK-Client"
    echo "  (Make sure your virtual environment is activated)"
    exit 1
fi

# Check if settings.json has Jack enabled
echo ""
echo "Checking settings.json..."
if grep -q '"midiOutputBackend".*"jack"' settings.json 2>/dev/null; then
    echo -e "${GREEN}✓ Jack backend enabled in settings.json${NC}"
    # Extract client name
    CLIENT_NAME=$(grep -o '"jackClientName".*"[^"]*"' settings.json | sed 's/.*"\([^"]*\)"$/\1/')
    echo -e "  Client name: ${BLUE}$CLIENT_NAME${NC}"
else
    echo -e "${YELLOW}⚠ Jack backend not enabled in settings.json${NC}"
    echo "  Current backend: rtmidi (will fall back)"
    CLIENT_NAME="midi_strummer"
fi

echo ""
echo -e "${BLUE}Step 2: Starting Jack server${NC}"
echo "-----------------------------------"

# Check if Jack is already running (skip check if no utilities)
JACK_RUNNING=false
if [ "$HAS_JACK_UTILS" = true ]; then
    if jack_lsp &> /dev/null; then
        echo -e "${YELLOW}⚠ Jack server already running${NC}"
        echo "  Using existing Jack server"
        JACK_RUNNING=true
    fi
fi

if [ "$JACK_RUNNING" = false ]; then
    echo "Starting Jack server with CoreAudio..."
    jackd -d coreaudio -r 44100 -p 256 > /tmp/jack.log 2>&1 &
    JACK_PID=$!
    echo "  PID: $JACK_PID"
    
    # Wait for Jack to start
    echo -n "  Waiting for Jack to initialize"
    if [ "$HAS_JACK_UTILS" = true ]; then
        for i in {1..10}; do
            if jack_lsp &> /dev/null; then
                echo ""
                echo -e "${GREEN}✓ Jack server started${NC}"
                break
            fi
            echo -n "."
            sleep 0.5
        done
        
        if ! jack_lsp &> /dev/null; then
            echo ""
            echo -e "${RED}✗ Jack server failed to start${NC}"
            echo "  Check /tmp/jack.log for details"
            cat /tmp/jack.log
            exit 1
        fi
    else
        # Without jack_lsp, just wait a bit and hope for the best
        for i in {1..5}; do
            echo -n "."
            sleep 0.5
        done
        echo ""
        echo -e "${GREEN}✓ Jack server started (assumed)${NC}"
        echo -e "  ${YELLOW}Install jack-example-tools to verify: brew install jack-example-tools${NC}"
    fi
fi

echo ""
echo -e "${BLUE}Step 3: Starting MIDI Strummer${NC}"
echo "-----------------------------------"

cd server
echo "Running: python main.py"
python main.py > /tmp/strummer.log 2>&1 &
STRUMMER_PID=$!
cd ..
echo "  PID: $STRUMMER_PID"

# Wait for MIDI Strummer to initialize
echo -n "  Waiting for MIDI Strummer to initialize"

if [ "$HAS_JACK_UTILS" = true ]; then
    # Can verify with jack_lsp
    for i in {1..15}; do
        if jack_lsp | grep -q "$CLIENT_NAME:midi_out"; then
            echo ""
            echo -e "${GREEN}✓ MIDI Strummer started with Jack backend${NC}"
            break
        fi
        # Check if process is still running
        if ! kill -0 $STRUMMER_PID 2>/dev/null; then
            echo ""
            echo -e "${RED}✗ MIDI Strummer crashed during startup${NC}"
            echo "  Check /tmp/strummer.log for details:"
            tail -20 /tmp/strummer.log
            exit 1
        fi
        echo -n "."
        sleep 0.5
    done
    
    if ! jack_lsp | grep -q "$CLIENT_NAME:midi_out"; then
        echo ""
        echo -e "${YELLOW}⚠ $CLIENT_NAME:midi_out port not found${NC}"
        echo "  MIDI Strummer may have fallen back to rtmidi"
        echo "  Check /tmp/strummer.log for details:"
        tail -20 /tmp/strummer.log
        echo ""
        echo -e "${BLUE}Available Jack MIDI ports:${NC}"
        jack_lsp -t | grep -i midi || echo "  (none)"
    else
        echo ""
        echo -e "${BLUE}Step 4: Verifying Jack MIDI ports${NC}"
        echo "-----------------------------------"
        echo -e "${GREEN}✓ Jack MIDI ports created successfully:${NC}"
        jack_lsp -t | grep "$CLIENT_NAME"
    fi
else
    # Without jack_lsp, check if process is still alive and check logs
    for i in {1..10}; do
        if ! kill -0 $STRUMMER_PID 2>/dev/null; then
            echo ""
            echo -e "${RED}✗ MIDI Strummer crashed during startup${NC}"
            echo "  Check /tmp/strummer.log for details:"
            tail -20 /tmp/strummer.log
            exit 1
        fi
        echo -n "."
        sleep 0.5
    done
    
    echo ""
    echo -e "${GREEN}✓ MIDI Strummer started (check logs below)${NC}"
    echo ""
    echo -e "${YELLOW}Recent MIDI Strummer output:${NC}"
    tail -20 /tmp/strummer.log
fi

if [ "$HAS_JACK_UTILS" = true ]; then
    echo ""
    echo -e "${BLUE}Step 5: Available connections${NC}"
    echo "-----------------------------------"
    echo "All Jack MIDI ports:"
    jack_lsp -t | grep -i midi || echo "  (none found)"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Jack MIDI setup successful!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}What's next?${NC}"
echo ""
echo "1. ${BLUE}Test with a software synth:${NC}"
echo "   Install FluidSynth: brew install fluidsynth"
echo "   Get a soundfont: brew install fluid-synth --with-libsndfile"
echo "   Run: fluidsynth -a jack -m jack /usr/local/share/soundfonts/default.sf2"
echo "   Connect: jack_connect $CLIENT_NAME:midi_out fluidsynth:midi_in"
echo ""
echo "2. ${BLUE}Use QjackCtl GUI:${NC}"
echo "   Install: brew install qjackctl"
echo "   Run: qjackctl"
echo "   Use 'Connect' button to make MIDI connections"
echo ""
echo "3. ${BLUE}Monitor MIDI output:${NC}"
echo "   jack_midi_dump $CLIENT_NAME:midi_out"
echo ""
echo "4. ${BLUE}Test with your drawing tablet:${NC}"
echo "   - Connect your tablet"
echo "   - Use the stylus to strum"
echo "   - Watch for MIDI messages in the console"
echo ""
echo -e "${YELLOW}Logs:${NC}"
echo "  Jack:    /tmp/jack.log"
echo "  Strummer: /tmp/strummer.log"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Keep script running and show live logs
echo -e "${BLUE}Live MIDI Strummer output:${NC}"
echo "-----------------------------------"
tail -f /tmp/strummer.log

