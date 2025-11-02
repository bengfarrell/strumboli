#!/usr/bin/env python3
"""
Diagnostic script to test Jack MIDI port registration and visibility.
Run this on your Zynthian to verify port properties.
"""

import sys
import time

try:
    import jack
except ImportError:
    print("ERROR: JACK-Client library not installed")
    print("Install with: pip install JACK-Client")
    sys.exit(1)


def main():
    print("=" * 60)
    print("Jack MIDI Port Diagnostic Tool")
    print("=" * 60)
    print()
    
    try:
        # Create test client
        print("1. Creating Jack client...")
        client = jack.Client("strumboli_test")
        print(f"   ✓ Client created: {client.name}")
        print()
        
        # Register ports with is_physical=True
        print("2. Registering MIDI ports with is_physical=True...")
        midi_out = client.midi_outports.register('Strumboli', is_physical=True)
        midi_in = client.midi_inports.register('input', is_physical=True)
        print(f"   ✓ Output port: {midi_out.name}")
        print(f"   ✓ Input port: {midi_in.name}")
        print()
        
        # Activate client
        print("3. Activating client...")
        client.activate()
        print("   ✓ Client activated")
        print()
        
        # Check port properties
        print("4. Verifying port properties...")
        print()
        print("   Output Port Properties:")
        print(f"   - Full name: {client.name}:{midi_out.name}")
        print(f"   - Short name: {midi_out.shortname}")
        print(f"   - Is terminal: {midi_out.is_terminal}")
        print(f"   - Is physical: {midi_out.is_physical}")
        print()
        
        print("   Input Port Properties:")
        print(f"   - Full name: {client.name}:{midi_in.name}")
        print(f"   - Short name: {midi_in.shortname}")
        print(f"   - Is terminal: {midi_in.is_terminal}")
        print(f"   - Is physical: {midi_in.is_physical}")
        print()
        
        # List all MIDI ports
        print("5. All available Jack MIDI ports:")
        print()
        print("   MIDI INPUT ports (destinations):")
        all_midi_inputs = client.get_ports(is_midi=True, is_input=True)
        for port in all_midi_inputs:
            physical_marker = " [PHYSICAL]" if port.is_physical else ""
            print(f"   - {port.name}{physical_marker}")
        
        print()
        print("   MIDI OUTPUT ports (sources):")
        all_midi_outputs = client.get_ports(is_midi=True, is_output=True)
        for port in all_midi_outputs:
            physical_marker = " [PHYSICAL]" if port.is_physical else ""
            print(f"   - {port.name}{physical_marker}")
        print()
        
        # Check for Zynthian ports
        print("6. Looking for Zynthian components...")
        zyn_ports = [p for p in all_midi_inputs if 'Zyn' in p.name or 'zynthian' in p.name.lower()]
        if zyn_ports:
            print(f"   ✓ Found {len(zyn_ports)} Zynthian ports:")
            for port in zyn_ports:
                print(f"     - {port.name}")
        else:
            print("   ⚠ No Zynthian ports found")
            print("     (This is normal if Zynthian webconf is not running or no chains active)")
        print()
        
        # Command-line verification
        print("7. Command-line verification commands:")
        print()
        print("   Run these commands in another terminal to verify:")
        print()
        print("   # List all Jack ports")
        print("   jack_lsp")
        print()
        print("   # List ports with properties (look for 'physical' flag)")
        print("   jack_lsp -p")
        print()
        print("   # List MIDI ports only")
        print("   jack_lsp -t | grep -i midi")
        print()
        print("   # Show our specific ports")
        print(f"   jack_lsp | grep {client.name}")
        print()
        
        # Keep running
        print("8. Test client is now running...")
        print("   - Check Zynthian's MIDI menu to see if ports appear")
        print("   - Press Ctrl+C to exit")
        print()
        
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n\n✓ Stopping test client...")
        
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        try:
            client.deactivate()
            client.close()
            print("✓ Client closed")
        except:
            pass
    
    print()
    print("=" * 60)
    print("Test Complete")
    print("=" * 60)
    return 0


if __name__ == '__main__':
    sys.exit(main())

