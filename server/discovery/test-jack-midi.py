#!/usr/bin/env python3
"""
Simple script to test Jack MIDI output from strumboli
"""

import jack
import time
import signal
import sys

print("🎵 Jack MIDI Monitor")
print("=" * 50)

try:
    # Connect to Jack as a client
    client = jack.Client('midi_monitor')
    
    # Create a MIDI input port to monitor strumboli's output
    midi_in = client.midi_inports.register('monitor_in')
    
    # Set up process callback to receive MIDI (MUST be done before activating!)
    @client.set_process_callback
    def process(frames):
        for offset, data in midi_in.incoming_midi_events():
            if len(data) >= 1:
                # Convert bytes to int if needed
                status = data[0] if isinstance(data[0], int) else ord(data[0])
                timestamp = time.strftime("%H:%M:%S")
                
                # Parse MIDI message
                if len(data) >= 3:
                    cmd = status & 0xF0
                    channel = (status & 0x0F) + 1
                    note = data[1] if isinstance(data[1], int) else ord(data[1])
                    velocity = data[2] if isinstance(data[2], int) else ord(data[2])
                    
                    if cmd == 0x90:  # Note On
                        note_name = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][note % 12]
                        octave = (note // 12) - 1
                        print(f"[{timestamp}] 🎵 Note ON:  Ch {channel:2d} | {note_name:2s}{octave} (MIDI {note:3d}) | Vel {velocity:3d}")
                    elif cmd == 0x80:  # Note Off
                        note_name = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][note % 12]
                        octave = (note // 12) - 1
                        print(f"[{timestamp}] 🔇 Note OFF: Ch {channel:2d} | {note_name:2s}{octave} (MIDI {note:3d})")
                    elif cmd == 0xE0:  # Pitch Bend
                        lsb = data[1]
                        msb = data[2]
                        bend_value = (msb << 7) | lsb
                        print(f"[{timestamp}] 🎚️  Pitch Bend: Ch {channel:2d} | Value {bend_value}")
    
    # Activate the client (AFTER setting callback)
    client.activate()
    
    print(f"✓ Connected to Jack server")
    print(f"  Sample rate: {client.samplerate} Hz")
    print(f"  Buffer size: {client.blocksize} frames")
    print()
    
    # List all MIDI ports
    print("Available Jack MIDI ports:")
    all_ports = client.get_ports(is_midi=True)
    for port in all_ports:
        print(f"  - {port.name}")
    print()
    
    # Find strumboli's output port
    strumboli_ports = [p for p in all_ports if 'strumboli' in p.name.lower() and p.is_output]
    
    if not strumboli_ports:
        print("❌ Could not find strumboli MIDI output port")
        print("   Make sure the MIDI Strummer server is running!")
        client.close()
        exit(1)
    
    strumboli_out = strumboli_ports[0]
    print(f"✓ Found: {strumboli_out.name}")
    print()
    
    # Connect strumboli's output to our monitor input
    client.connect(strumboli_out, midi_in)
    print(f"✓ Connected {strumboli_out.name} -> {midi_in.name}")
    print()
    print("🎸 Strum your tablet - MIDI events will appear below:")
    print("-" * 50)
    
    # Set up signal handlers for proper cleanup
    def cleanup_and_exit(signum=None, frame=None):
        signal_name = signal.Signals(signum).name if signum else "Unknown"
        print(f"\n\n✓ Received {signal_name}, cleaning up...")
        try:
            client.deactivate()
            client.close()
            print("✓ Jack client properly closed")
        except Exception as e:
            print(f"⚠ Cleanup warning: {e}")
        sys.exit(0)
    
    # Handle Ctrl+C (SIGINT)
    signal.signal(signal.SIGINT, cleanup_and_exit)
    
    # Handle Ctrl+Z (SIGTSTP) - clean up instead of suspending
    signal.signal(signal.SIGTSTP, cleanup_and_exit)
    
    # Handle kill command (SIGTERM)
    signal.signal(signal.SIGTERM, cleanup_and_exit)
    
    # Keep running
    print()
    try:
        while True:
            time.sleep(0.1)
    except KeyboardInterrupt:
        cleanup_and_exit()
    finally:
        # Always clean up properly
        try:
            client.deactivate()
            client.close()
        except:
            pass

except jack.JackError as e:
    print(f"❌ Jack Error: {e}")
    print("\nMake sure:")
    print("  1. Jack server is running: jackd -d coreaudio &")
    print("  2. MIDI Strummer is running with Jack backend")
    exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

