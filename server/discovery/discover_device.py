#!/usr/bin/env python3
"""
Interactive HID Device Discovery Tool

Helps users create driver configuration files for new drawing tablets and HID devices.
"""

import sys
import os
import json
import time
from typing import Dict, Any, List, Tuple, Optional

# Add parent directory to path to import from server
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'server'))

try:
    import hid
except ImportError:
    print("Error: hidapi library not found.")
    print("Please install it: pip install hidapi")
    sys.exit(1)


class DeviceDiscovery:
    """Interactive device discovery wizard"""
    
    def __init__(self):
        self.selected_device = None
        self.device_info = None
        self.interfaces = []
        self.report_ids = {}
        self.driver_config = {}
        
    def run(self):
        """Run the interactive discovery process"""
        print("\n" + "="*70)
        print("   HID Device Discovery Tool - Strumboli")
        print("="*70)
        print("\nThis tool will help you create a driver configuration for your device.\n")
        
        # Step 1: List and select device
        if not self.select_device():
            return
        
        # Step 2: Discover interfaces
        if not self.discover_interfaces():
            return
        
        # Step 3: Analyze data from each interface
        if not self.analyze_interfaces():
            return
        
        # Step 4: Build driver config
        if not self.build_driver_config():
            return
        
        # Step 5: Save driver
        self.save_driver()
        
        print("\n" + "="*70)
        print("   Discovery Complete!")
        print("="*70)
        
    def select_device(self) -> bool:
        """List devices and let user select one"""
        print("\n[Step 1] Scanning for HID devices...")
        
        try:
            devices = hid.enumerate()
        except Exception as e:
            print(f"Error enumerating devices: {e}")
            return False
        
        if not devices:
            print("No HID devices found.")
            return False
        
        # Group by vendor/product
        device_groups = {}
        for device in devices:
            key = (device['vendor_id'], device['product_id'])
            if key not in device_groups:
                device_groups[key] = []
            device_groups[key].append(device)
        
        print(f"\nFound {len(device_groups)} unique device(s):\n")
        
        device_list = list(device_groups.items())
        for idx, ((vid, pid), group) in enumerate(device_list, 1):
            device = group[0]
            manufacturer = device.get('manufacturer_string', 'Unknown')
            product = device.get('product_string', 'Unknown Product')
            interface_count = len(group)
            
            print(f"  {idx}. {manufacturer} - {product}")
            print(f"     VID: 0x{vid:04x}, PID: 0x{pid:04x}")
            print(f"     Interfaces: {interface_count}")
            print()
        
        # Let user select
        while True:
            try:
                choice = input(f"Select device (1-{len(device_list)}) or 'q' to quit: ").strip()
                if choice.lower() == 'q':
                    return False
                
                idx = int(choice) - 1
                if 0 <= idx < len(device_list):
                    (vid, pid), group = device_list[idx]
                    self.selected_device = (vid, pid)
                    self.device_info = group[0]
                    self.interfaces = group
                    print(f"\n✓ Selected: {self.device_info.get('product_string', 'Device')}")
                    return True
                else:
                    print("Invalid selection. Try again.")
            except (ValueError, KeyboardInterrupt):
                print("\nCancelled.")
                return False
    
    def discover_interfaces(self) -> bool:
        """Discover which interfaces are usable and what they do"""
        print("\n[Step 2] Discovering interfaces...")
        print(f"\nFound {len(self.interfaces)} interface(s)")
        print("\nWill monitor ALL interfaces for 10 seconds to see what they do.")
        print("\nPlease perform these actions during monitoring:")
        print("  • Move stylus around the tablet")
        print("  • Touch and lift the stylus")
        print("  • Press a tablet button")
        
        input("\nPress ENTER to start monitoring all interfaces...")
        
        # Monitor all interfaces simultaneously
        print("\nMonitoring... perform actions now!\n")
        interface_data = self._monitor_all_interfaces()
        
        # Analyze and display results
        print("\n" + "="*70)
        print("INTERFACE ANALYSIS SUMMARY")
        print("="*70)
        
        usable_interfaces = []
        
        for device in self.interfaces:
            interface_num = device.get('interface_number', -1)
            usage = device.get('usage', 0)
            usage_page = device.get('usage_page', 0)
            
            data = interface_data.get(interface_num, {})
            sample_count = data.get('sample_count', 0)
            
            print(f"\nInterface {interface_num}:")
            print(f"  Usage Page: 0x{usage_page:04x}, Usage: 0x{usage:04x}")
            
            if sample_count == 0:
                print(f"  Status: ✗ No data received")
                continue
            
            report_ids = data.get('report_ids', [])
            print(f"  Status: ✓ {sample_count} packets")
            print(f"  Report ID(s): {report_ids}")
            
            # Analyze what this interface does
            characteristics = self._analyze_interface_characteristics(data.get('samples', []))
            
            print(f"  Characteristics:")
            if characteristics['has_coordinates']:
                print(f"    → STYLUS interface (coordinates/movement detected)")
            if characteristics['has_buttons']:
                print(f"    → BUTTON interface (bit patterns detected)")
            if characteristics['has_varying_pressure']:
                print(f"    → Pressure data detected")
            if characteristics['is_event_based']:
                print(f"    → Event-based (only sends when active)")
            if not any(characteristics.values()):
                print(f"    → Unknown/other interface")
            
            self.report_ids[interface_num] = report_ids
            usable_interfaces.append(interface_num)
        
        print("\n" + "="*70)
        
        if not usable_interfaces:
            print("\n✗ No usable interfaces found!")
            return False
        
        # Ask user which interfaces to analyze
        print(f"\n{len(usable_interfaces)} interface(s) detected with data.")
        print("\nWhich interface(s) should be analyzed in detail?")
        print("  (Enter comma-separated numbers, or press ENTER for all)")
        
        while True:
            try:
                choice = input(f"Select from {usable_interfaces} [all]: ").strip()
                if not choice:
                    # Default to all usable
                    self.interfaces = [d for d in self.interfaces 
                                     if d.get('interface_number', -1) in usable_interfaces]
                    print(f"Using all {len(usable_interfaces)} interfaces")
                    break
                
                selected = [int(x.strip()) for x in choice.split(',')]
                if all(x in usable_interfaces for x in selected):
                    self.interfaces = [d for d in self.interfaces 
                                     if d.get('interface_number', -1) in selected]
                    print(f"Selected {len(selected)} interface(s)")
                    break
                else:
                    print("Invalid interface numbers. Try again.")
            except (ValueError, KeyboardInterrupt):
                print("\nUsing all usable interfaces.")
                self.interfaces = [d for d in self.interfaces 
                                 if d.get('interface_number', -1) in usable_interfaces]
                break
        
        return True
    
    def _monitor_all_interfaces(self) -> Dict[int, Dict]:
        """Monitor all interfaces simultaneously for a brief period"""
        import threading
        
        results = {}
        threads = []
        
        def monitor_interface(device_info, results_dict):
            interface_num = device_info.get('interface_number', -1)
            try:
                test_device = hid.device()
                if 'path' in device_info and device_info['path']:
                    test_device.open_path(device_info['path'])
                else:
                    test_device.open(device_info['vendor_id'], device_info['product_id'])
                
                test_device.set_nonblocking(True)
                
                samples = []
                report_ids = set()
                start_time = time.time()
                
                while time.time() - start_time < 10.0:
                    data = test_device.read(64)
                    if data and len(data) > 0:
                        data_list = list(data)
                        samples.append(data_list)
                        if data[0] > 0:
                            report_ids.add(data[0])
                    time.sleep(0.01)
                
                test_device.close()
                
                results_dict[interface_num] = {
                    'sample_count': len(samples),
                    'report_ids': sorted(report_ids),
                    'samples': samples
                }
                
            except Exception as e:
                results_dict[interface_num] = {
                    'sample_count': 0,
                    'report_ids': [],
                    'samples': [],
                    'error': str(e)
                }
        
        # Start monitoring all interfaces in parallel
        for device_info in self.interfaces:
            thread = threading.Thread(
                target=monitor_interface,
                args=(device_info, results)
            )
            thread.start()
            threads.append(thread)
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        return results
    
    def _analyze_interface_characteristics(self, samples: List[List[int]]) -> Dict[str, bool]:
        """Analyze samples to determine what the interface does"""
        if not samples or len(samples) < 3:
            return {
                'has_coordinates': False,
                'has_buttons': False,
                'has_varying_pressure': False,
                'is_event_based': True
            }
        
        characteristics = {
            'has_coordinates': False,
            'has_buttons': False,
            'has_varying_pressure': False,
            'is_event_based': len(samples) < 50  # Few samples = event-based
        }
        
        # Check for coordinates (high variance in certain bytes = X/Y movement)
        if len(samples) >= 5:
            for byte_idx in range(2, min(8, len(samples[0]))):
                values = [s[byte_idx] for s in samples if len(s) > byte_idx]
                if values and (max(values) - min(values)) > 20:
                    characteristics['has_coordinates'] = True
                    break
        
        # Check for button patterns (bit flags)
        for byte_idx in range(1, min(4, len(samples[0]) if samples else 0)):
            values = [s[byte_idx] for s in samples if len(s) > byte_idx]
            unique_values = set(values)
            # Button byte often has powers of 2 or combinations
            if len(unique_values) >= 2:
                # Check if values look like bit flags (1, 2, 4, 8, 16, etc.)
                bit_like = sum(1 for v in unique_values if v in [1, 2, 4, 8, 16, 32, 64, 128])
                if bit_like >= 2:
                    characteristics['has_buttons'] = True
                    break
        
        # Check for varying pressure (16-bit values that increase/decrease)
        if len(samples) >= 5:
            for byte_idx in range(4, min(10, len(samples[0]) if samples else 0)):
                if byte_idx + 1 < len(samples[0] if samples else []):
                    values = [s[byte_idx] + (s[byte_idx+1] << 8) for s in samples 
                             if len(s) > byte_idx + 1]
                    if values:
                        val_range = max(values) - min(values)
                        # Pressure has significant range
                        if val_range > 100 and min(values) < max(values) * 0.5:
                            characteristics['has_varying_pressure'] = True
                            break
        
        return characteristics
    
    def analyze_interfaces(self) -> bool:
        """Analyze data from selected interfaces"""
        print("\n[Step 3] Analyzing interface data...")
        print("\nThis step will guide you through 12 actions to understand your device.")
        print("Follow the prompts carefully and take your time with each action.")
        print("The more deliberately you perform each test, the better the results!")
        
        input("\nPress ENTER when ready to continue...")
        
        # Analyze each interface
        self.byte_mappings = {}
        
        for device_info in self.interfaces:
            interface_num = device_info.get('interface_number', -1)
            print(f"\n--- Analyzing Interface {interface_num} ---")
            
            try:
                mappings = self._analyze_interface(device_info)
                if mappings:
                    self.byte_mappings[interface_num] = mappings
            except Exception as e:
                print(f"Error analyzing interface {interface_num}: {e}")
                continue
        
        if not self.byte_mappings:
            print("\n⚠ No mappings detected. You'll need to configure manually.")
            return True
        
        print("\n✓ Analysis complete!")
        return True
    
    def _analyze_interface(self, device_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Analyze a single interface"""
        interface_num = device_info.get('interface_number', -1)
        
        try:
            device = hid.device()
            if 'path' in device_info and device_info['path']:
                device.open_path(device_info['path'])
            else:
                device.open(device_info['vendor_id'], device_info['product_id'])
            
            device.set_nonblocking(True)
            
            mappings = {}
            
            # Test 1: Detect baseline (stylus away)
            print("\n1. Keep stylus AWAY from tablet")
            baseline = self._capture_samples(device, "Waiting", duration=2)
            
            # Test 2: Detect hover
            print("\n2. HOVER stylus above tablet (don't touch)")
            print("   Also try pressing stylus buttons while hovering")
            hover_data = self._capture_samples(device, "Hovering", duration=4)
            
            # Test 3: Detect contact
            print("\n3. TOUCH stylus to tablet lightly")
            print("   Also try pressing stylus buttons while touching")
            contact_data = self._capture_samples(device, "Touching", duration=4)
            
            # Test 4: Detect coordinates - General movement
            print("\n4. MOVE stylus around the tablet")
            print("   Move in a large circle or pattern")
            movement_data = self._capture_samples(device, "Moving", duration=4)
            
            # Test 5: Horizontal sweep (for accurate X max)
            print("\n5. HORIZONTAL SWEEP")
            print("   ⚠️  Slowly drag from FAR LEFT to FAR RIGHT edge")
            print("   Take your time - hit both edges!")
            horizontal_data = self._capture_samples(device, "Sweeping horizontally", duration=4)
            
            # Test 6: Vertical sweep (for accurate Y max)
            print("\n6. VERTICAL SWEEP")
            print("   ⚠️  Slowly drag from TOP to BOTTOM edge")
            print("   Take your time - hit both edges!")
            vertical_data = self._capture_samples(device, "Sweeping vertically", duration=4)
            
            # Combine all movement data for coordinate detection
            all_movement_data = movement_data + horizontal_data + vertical_data
            
            # Test 7: Detect pressure
            print("\n7. Press DOWN HARD with stylus")
            pressure_data = self._capture_samples(device, "Pressing hard", duration=3)
            
            # Test 8: Tilt LEFT
            print("\n8. TILT stylus to the LEFT")
            print("   Hold the stylus and lean it to the left side")
            tilt_left_data = self._capture_samples(device, "Tilting left", duration=3)
            
            # Test 9: Tilt RIGHT
            print("\n9. TILT stylus to the RIGHT")
            print("   Hold the stylus and lean it to the right side")
            tilt_right_data = self._capture_samples(device, "Tilting right", duration=3)
            
            # Test 10: Tilt FORWARD (toward top of tablet)
            print("\n10. TILT stylus FORWARD (toward top of tablet)")
            print("    Lean the stylus away from you")
            tilt_forward_data = self._capture_samples(device, "Tilting forward", duration=3)
            
            # Test 11: Tilt BACK (toward bottom of tablet)
            print("\n11. TILT stylus BACK (toward bottom of tablet)")
            print("    Lean the stylus toward you")
            tilt_back_data = self._capture_samples(device, "Tilting back", duration=3)
            
            # Combine tilt data
            tilt_x_data = tilt_left_data + tilt_right_data
            tilt_y_data = tilt_forward_data + tilt_back_data
            
            # Test 12: Detect buttons
            print("\n12. Press each TABLET BUTTON one at a time")
            print("    (Press, hold briefly, release, then next button)")
            button_data = self._capture_samples(device, "Pressing buttons", duration=10)
            
            device.close()
            
            # Analyze collected data
            print("\nAnalyzing data...")
            mappings = self._analyze_samples(
                baseline, hover_data, contact_data, all_movement_data,
                pressure_data, tilt_x_data, tilt_y_data, button_data
            )
            
            return mappings
            
        except Exception as e:
            print(f"Error during analysis: {e}")
            return None
    
    def _capture_samples(self, device, action: str, duration: int = 3) -> List[List[int]]:
        """Capture data samples during an action"""
        input(f"   Press ENTER and then {action}...")
        
        samples = []
        start_time = time.time()
        last_data = None
        
        print(f"   Recording for {duration} seconds... ", end='', flush=True)
        
        while time.time() - start_time < duration:
            data = device.read(64)
            if data and len(data) > 0:
                data_list = list(data)
                # Only keep unique samples
                if data_list != last_data:
                    samples.append(data_list)
                    last_data = data_list
            time.sleep(0.01)
        
        print(f"Got {len(samples)} samples")
        return samples
    
    def _analyze_samples(self, baseline, hover, contact, movement, pressure, tilt_x, tilt_y, buttons) -> Dict[str, Any]:
        """Analyze samples to determine byte mappings"""
        mappings = {}
        
        if not hover and not contact and not movement:
            print("  ⚠ No data captured - device might be event-based")
            return mappings
        
        # Determine status byte and codes
        status_info = self._find_status_byte(baseline, hover, contact, buttons)
        if status_info:
            mappings['status'] = status_info
            print(f"  ✓ Status byte: {status_info['byteIndex']}")
        
        # Find coordinate bytes
        coord_info = self._find_coordinates(movement)
        if coord_info:
            mappings.update(coord_info)
            print(f"  ✓ Coordinates: X bytes {coord_info['x']['byteIndex']}, Y bytes {coord_info['y']['byteIndex']}")
        
        # Find pressure bytes
        pressure_info = self._find_pressure(contact, pressure)
        if pressure_info:
            mappings['pressure'] = pressure_info
            print(f"  ✓ Pressure: bytes {pressure_info['byteIndex']}, max {pressure_info['max']}")
        
        # Find tilt bytes
        tilt_info = self._find_tilt(tilt_x, tilt_y)
        if tilt_info:
            mappings.update(tilt_info)
            print(f"  ✓ Tilt: X byte {tilt_info.get('tiltX', {}).get('byteIndex', '?')}, Y byte {tilt_info.get('tiltY', {}).get('byteIndex', '?')}")
        
        # Find button byte and mapping
        button_info = self._find_buttons(buttons)
        if button_info:
            mappings['tabletButtons'] = button_info
            print(f"  ✓ Buttons: byte {button_info['byteIndex']}")
        
        return mappings
    
    def _find_status_byte(self, baseline, hover, contact, buttons) -> Optional[Dict[str, Any]]:
        """Find the status byte and its codes"""
        if not hover and not contact:
            return None
        
        # Collect all unique values from each state for each byte position
        all_samples = {
            'baseline': baseline or [],
            'hover': hover or [],
            'contact': contact or [],
            'buttons': buttons or []
        }
        
        # Check bytes 1-3 (most common for status)
        max_len = max(len(s[0]) if s else 0 for s in all_samples.values())
        
        for byte_idx in range(1, min(4, max_len)):
            # Collect ALL unique values for this byte (not just most common)
            state_values = {}
            
            for state_name, samples in all_samples.items():
                values = set()
                for s in samples:
                    if len(s) > byte_idx:
                        values.add(s[byte_idx])
                if values:
                    state_values[state_name] = values
            
            # Check if this byte changes between states
            all_values = set()
            for vals in state_values.values():
                all_values.update(vals)
            
            # Status byte should have multiple distinct values across states
            if len(all_values) < 2:
                continue
            
            # This looks like a status byte! Map all observed values
            # Use common patterns to identify states correctly
            values_map = {}
            
            # Common status code patterns (used by most tablets):
            # 192 (0xC0) = none/away
            # 160 (0xA0) = hover
            # 161 (0xA1) = contact
            # 162 (0xA2) = hover + secondary button
            # 163 (0xA3) = contact + secondary button
            # 164 (0xA4) = hover + primary button
            # 165 (0xA5) = contact + primary button
            # 240 (0xF0) = tablet buttons
            
            # Collect all observed values
            all_observed = set()
            for vals in state_values.values():
                all_observed.update(vals)
            
            # Use pattern recognition for common codes
            for val in all_observed:
                val_str = str(val)
                
                # Recognize common patterns
                if val == 192:  # 0xC0
                    values_map[val_str] = {"state": "none"}
                elif val == 160:  # 0xA0
                    values_map[val_str] = {"state": "hover"}
                elif val == 162:  # 0xA2
                    values_map[val_str] = {"state": "hover", "secondaryButtonPressed": True}
                elif val == 164:  # 0xA4
                    values_map[val_str] = {"state": "hover", "primaryButtonPressed": True}
                elif val == 161:  # 0xA1
                    values_map[val_str] = {"state": "contact"}
                elif val == 163:  # 0xA3
                    values_map[val_str] = {"state": "contact", "secondaryButtonPressed": True}
                elif val == 165:  # 0xA5
                    values_map[val_str] = {"state": "contact", "primaryButtonPressed": True}
                elif val == 240:  # 0xF0
                    values_map[val_str] = {"state": "buttons"}
                else:
                    # Unknown value - try to infer from which test phase it appeared in
                    if 'baseline' in state_values and val in state_values['baseline']:
                        values_map[val_str] = {"state": "none"}
                    elif 'hover' in state_values and val in state_values['hover']:
                        values_map[val_str] = {"state": "hover"}
                    elif 'contact' in state_values and val in state_values['contact']:
                        values_map[val_str] = {"state": "contact"}
                    elif 'buttons' in state_values and val in state_values['buttons']:
                        values_map[val_str] = {"state": "buttons"}
            
            # If we found a good mapping, return it
            if len(values_map) >= 2:
                return {
                    "byteIndex": byte_idx,
                    "type": "code",
                    "values": values_map
                }
        
        return None
    
    def _find_common_byte_values(self, samples: List[List[int]]) -> Dict[int, int]:
        """Find the most common value for each byte position"""
        if not samples:
            return {}
        
        from collections import Counter
        byte_counts = {}
        
        for byte_idx in range(min(16, len(samples[0]))):
            values = [s[byte_idx] for s in samples if len(s) > byte_idx]
            if values:
                counter = Counter(values)
                byte_counts[byte_idx] = counter.most_common(1)[0][0]
        
        return byte_counts
    
    def _find_coordinates(self, movement: List[List[int]]) -> Optional[Dict[str, Any]]:
        """Find X and Y coordinate bytes"""
        if not movement or len(movement) < 5:
            return None
        
        # Find pairs of 16-bit coordinates (non-overlapping)
        # Typically X at bytes 2-3, Y at bytes 4-5
        candidates = []
        
        # Check byte pairs starting at even positions (to avoid overlap)
        # Start at byte 2 (after Report ID and Status)
        for byte_idx in range(2, min(8, len(movement[0])), 2):
            if byte_idx + 1 >= len(movement[0]):
                break
            
            # Reconstruct 16-bit values (little-endian)
            values_16bit = []
            for s in movement:
                if len(s) > byte_idx + 1:
                    val = s[byte_idx] + (s[byte_idx + 1] << 8)
                    values_16bit.append(val)
            
            if not values_16bit:
                continue
            
            # Check if this looks like a coordinate
            min_val = min(values_16bit)
            max_val = max(values_16bit)
            variance = max_val - min_val
            
            # Coordinates should:
            # 1. Have significant variance (movement)
            # 2. Have reasonable max values (not > 65000 which is likely noise)
            # 3. Start from a reasonable minimum
            if variance > 100 and max_val < 50000 and max_val > 1000:
                candidates.append((byte_idx, max_val, variance))
        
        # Also check odd-positioned pairs in case device uses different layout
        if len(candidates) < 2:
            for byte_idx in range(3, min(9, len(movement[0])), 2):
                if byte_idx + 1 >= len(movement[0]):
                    break
                
                # Skip if this would overlap with already found candidates
                if any(abs(byte_idx - c[0]) <= 1 for c in candidates):
                    continue
                
                values_16bit = []
                for s in movement:
                    if len(s) > byte_idx + 1:
                        val = s[byte_idx] + (s[byte_idx + 1] << 8)
                        values_16bit.append(val)
                
                if not values_16bit:
                    continue
                
                min_val = min(values_16bit)
                max_val = max(values_16bit)
                variance = max_val - min_val
                
                if variance > 100 and max_val < 50000 and max_val > 1000:
                    candidates.append((byte_idx, max_val, variance))
        
        # Need exactly 2 coordinate pairs
        if len(candidates) >= 2:
            # Sort by byte position
            candidates.sort(key=lambda x: x[0])
            
            # Take first two as X and Y
            x_byte, x_max, x_var = candidates[0]
            y_byte, y_max, y_var = candidates[1]
            
            # Sanity check: Y should be at least 2 bytes after X
            if y_byte < x_byte + 2:
                # Overlapping or too close, skip the overlapping one
                if len(candidates) >= 3:
                    y_byte, y_max, y_var = candidates[2]
                else:
                    return None
            
            return {
                'x': {
                    'byteIndex': [x_byte, x_byte + 1],
                    'max': x_max,
                    'type': 'multi-byte-range'
                },
                'y': {
                    'byteIndex': [y_byte, y_byte + 1],
                    'max': y_max,
                    'type': 'multi-byte-range'
                }
            }
        
        return None
    
    def _find_pressure(self, contact: List[List[int]], pressure: List[List[int]]) -> Optional[Dict[str, Any]]:
        """Find pressure bytes"""
        all_samples = contact + pressure
        if not all_samples:
            return None
        
        # Look for bytes that increase with pressure
        # Typically bytes 6-7 (after X at 2-3 and Y at 4-5)
        # Start at byte 6 to avoid coordinate bytes
        best_candidate = None
        best_score = 0
        
        for byte_idx in range(6, min(10, len(all_samples[0])), 2):
            if byte_idx + 1 >= len(all_samples[0]):
                continue
            
            # Try 16-bit value (little-endian)
            values = []
            for s in all_samples:
                if len(s) > byte_idx + 1:
                    val = s[byte_idx] + (s[byte_idx + 1] << 8)
                    values.append(val)
            
            if not values:
                continue
            
            max_val = max(values)
            min_val = min(values)
            variance = max_val - min_val
            
            # Pressure characteristics:
            # 1. Should have significant range (variance > 1000)
            # 2. Min should be low (often 0 or near 0)
            # 3. Max should be reasonable (8K, 16K, or 32K typical)
            # 4. Should not be > 65000 (likely noise/incorrect parsing)
            
            if variance < 1000:
                continue
            
            if max_val > 65000:
                continue
            
            # Score based on how "pressure-like" the values are
            score = 0
            
            # Prefer lower minimum (closer to 0)
            if min_val < 100:
                score += 3
            elif min_val < max_val * 0.2:
                score += 2
            elif min_val < max_val * 0.4:
                score += 1
            
            # Prefer typical pressure level counts
            if 8000 <= max_val <= 8500:  # 8192 levels (13-bit)
                score += 3
            elif 16000 <= max_val <= 17000:  # 16384 levels (14-bit)
                score += 3
            elif 32000 <= max_val <= 33000:  # 32768 levels (15-bit)
                score += 2
            elif 2000 <= max_val <= 50000:  # Reasonable range
                score += 1
            
            if score > best_score:
                best_score = score
                best_candidate = (byte_idx, max_val)
        
        if best_candidate is not None:
            byte_idx, max_val = best_candidate
            return {
                'byteIndex': [byte_idx, byte_idx + 1],
                'max': max_val,
                'type': 'multi-byte-range'
            }
        
        return None
    
    def _find_tilt(self, tilt_x: List[List[int]], tilt_y: List[List[int]]) -> Optional[Dict[str, Any]]:
        """Find tilt bytes"""
        if not tilt_x and not tilt_y:
            return None
        
        mappings = {}
        
        # Look for signed bytes (bytes 8-9 typically, AFTER pressure at 6-7)
        # Start at byte 8 to avoid detecting the pressure high byte (byte 7)
        for byte_idx in range(8, min(12, len((tilt_x or tilt_y)[0]))):
            if tilt_x:
                values_x = [s[byte_idx] for s in tilt_x if len(s) > byte_idx]
                
                # Tilt should have both small positive values and large values (200+)
                # This indicates bipolar range: 0-60 for positive, 196-255 for negative
                if not values_x:
                    continue
                
                has_low = any(v < 100 for v in values_x)
                has_high = any(v > 180 for v in values_x)
                
                # Must have BOTH low and high values to be tilt (bipolar)
                # Pressure would only have low values or be more uniform
                if has_low and has_high:
                    # Likely has tilt data
                    mappings['tiltX'] = {
                        'byteIndex': byte_idx,
                        'positiveMax': 60,
                        'negativeMin': 256,
                        'negativeMax': 196,
                        'type': 'bipolar-range'
                    }
                    
                    if tilt_y and byte_idx + 1 < len(tilt_y[0]):
                        mappings['tiltY'] = {
                            'byteIndex': byte_idx + 1,
                            'positiveMax': 60,
                            'negativeMin': 256,
                            'negativeMax': 196,
                            'type': 'bipolar-range'
                        }
                    break
        
        return mappings if mappings else None
    
    def _find_buttons(self, buttons: List[List[int]]) -> Optional[Dict[str, Any]]:
        """Find button byte"""
        if not buttons:
            return None
        
        # Look for a byte with various bit patterns
        # Typically byte 2 (after Report ID and Status byte)
        # Skip byte 1 as that's usually the status byte
        best_candidate = None
        best_score = 0
        
        for byte_idx in range(2, min(5, len(buttons[0]))):
            values = [s[byte_idx] for s in buttons if len(s) > byte_idx]
            unique_values = set(values)
            
            # Button byte should have multiple different values
            nonzero = [v for v in unique_values if v != 0]
            
            if len(nonzero) < 2:
                continue
            
            # Score based on how many values are powers of 2 (typical for bit flags)
            powers_of_2 = [1, 2, 4, 8, 16, 32, 64, 128]
            power_of_2_count = sum(1 for v in nonzero if v in powers_of_2)
            
            # Also check for combinations (multiple buttons pressed)
            combo_count = sum(1 for v in nonzero if v not in powers_of_2)
            
            # Score: prefer bytes with both single buttons and combinations
            score = power_of_2_count * 2 + combo_count
            
            if score > best_score:
                best_score = score
                best_candidate = byte_idx
        
        if best_candidate is not None:
            return {
                'byteIndex': best_candidate,
                'buttonCount': 8,
                'type': 'bit-flags'
            }
        
        return None
    
    def build_driver_config(self) -> bool:
        """Build the driver configuration"""
        print("\n[Step 4] Building driver configuration...")
        
        # Get basic info
        print("\nDevice Information:")
        name = input(f"  Device name [{self.device_info.get('product_string', 'Unknown')}]: ").strip()
        if not name:
            name = self.device_info.get('product_string', 'Unknown Device')
        
        manufacturer = input(f"  Manufacturer [{self.device_info.get('manufacturer_string', 'Unknown')}]: ").strip()
        if not manufacturer:
            manufacturer = self.device_info.get('manufacturer_string', 'Unknown')
        
        model = input(f"  Model [leave blank]: ").strip()
        
        # Get interface numbers
        interface_nums = [d.get('interface_number', -1) for d in self.interfaces]
        
        # Get most common report ID
        all_report_ids = []
        for ids in self.report_ids.values():
            all_report_ids.extend(ids)
        report_id = max(set(all_report_ids), key=all_report_ids.count) if all_report_ids else 2
        
        # Build config
        vid = self.device_info['vendor_id']
        pid = self.device_info['product_id']
        
        # Merge byte mappings from all interfaces
        merged_mappings = {}
        for interface_num, mappings in self.byte_mappings.items():
            merged_mappings.update(mappings)
        
        # If no mappings were detected, use template
        if not merged_mappings:
            print("\n⚠ Using template mappings - you'll need to configure manually")
            merged_mappings = {
                "_note": "TODO: These mappings need to be configured manually based on your device",
                "status": {
                    "byteIndex": 1,
                    "type": "code",
                    "values": {
                        "192": {"state": "none"},
                        "160": {"state": "hover"},
                        "161": {"state": "contact"},
                        "240": {"state": "buttons"}
                    }
                },
                "x": {
                    "byteIndex": [2, 3],
                    "max": 32000,
                    "type": "multi-byte-range"
                },
                "y": {
                    "byteIndex": [4, 5],
                    "max": 18000,
                    "type": "multi-byte-range"
                },
                "pressure": {
                    "byteIndex": [6, 7],
                    "max": 8191,
                    "type": "multi-byte-range"
                },
                "tiltX": {
                    "byteIndex": 8,
                    "positiveMax": 60,
                    "negativeMin": 256,
                    "negativeMax": 196,
                    "type": "bipolar-range"
                },
                "tiltY": {
                    "byteIndex": 9,
                    "positiveMax": 60,
                    "negativeMin": 256,
                    "negativeMax": 196,
                    "type": "bipolar-range"
                },
                "tabletButtons": {
                    "byteIndex": 2,
                    "buttonCount": 8,
                    "type": "bit-flags"
                }
            }
        else:
            print(f"\n✓ Using detected mappings ({len(merged_mappings)} found)")
        
        # Calculate capabilities from detected data
        capabilities = {
            "hasButtons": 'tabletButtons' in merged_mappings,
            "buttonCount": merged_mappings.get('tabletButtons', {}).get('buttonCount', 8),
            "hasPressure": 'pressure' in merged_mappings,
            "hasTilt": 'tiltX' in merged_mappings or 'tiltY' in merged_mappings,
        }
        
        # Add pressure levels if detected
        if 'pressure' in merged_mappings:
            capabilities["pressureLevels"] = merged_mappings['pressure'].get('max', 8192)
        
        # Add resolution if detected
        if 'x' in merged_mappings and 'y' in merged_mappings:
            capabilities["resolution"] = {
                "x": merged_mappings['x'].get('max', 32000),
                "y": merged_mappings['y'].get('max', 18000)
            }
        
        self.driver_config = {
            "name": name,
            "manufacturer": manufacturer,
            "vendorId": f"0x{vid:04x}",
            "productId": f"0x{pid:04x}",
            "deviceInfo": {
                "product_string": self.device_info.get('product_string', 'Unknown'),
                "usage": self.device_info.get('usage', 0),
                "interfaces": interface_nums if len(interface_nums) > 1 else interface_nums
            },
            "reportId": report_id,
            "capabilities": capabilities,
            "byteCodeMappings": merged_mappings
        }
        
        if model:
            self.driver_config["model"] = model
        
        # Add description about report IDs if multiple
        if len(self.report_ids) > 1:
            report_id_note = ", ".join([f"Interface {i}: Report ID {ids[0] if ids else 'unknown'}" 
                                       for i, ids in self.report_ids.items()])
            self.driver_config["reportIdNote"] = report_id_note
        
        print("\n✓ Driver configuration built")
        return True
    
    def save_driver(self):
        """Save the driver configuration"""
        print("\n[Step 5] Saving driver configuration...")
        
        # Suggest filename
        suggested = self.device_info.get('product_string', 'device').lower()
        suggested = suggested.replace(' ', '_').replace('-', '_')
        platform = input("\nPlatform suffix (e.g., 'osx', 'linux', 'zynthian') [leave blank]: ").strip()
        
        if platform:
            suggested = f"{suggested}_{platform}"
        
        filename = input(f"Filename [{suggested}.json]: ").strip()
        if not filename:
            filename = f"{suggested}.json"
        
        if not filename.endswith('.json'):
            filename += '.json'
        
        # Determine save location
        discovery_dir = os.path.dirname(os.path.abspath(__file__))
        default_path = os.path.join(discovery_dir, filename)
        
        save_path = input(f"Save to [{default_path}]: ").strip()
        if not save_path:
            save_path = default_path
        
        # Save
        try:
            with open(save_path, 'w') as f:
                json.dump(self.driver_config, f, indent=2)
            
            print(f"\n✓ Driver saved to: {save_path}")
            print("\nNext steps:")
            if self.byte_mappings:
                print("  1. Review the auto-detected mappings in the JSON file")
                print("  2. Test the driver with your tablet")
                print(f"  3. Copy to: ../drivers/{filename}")
                print("  4. Update settings.json to use the new driver")
                print("\nIf something doesn't work:")
                print("  - Use data_monitor.py to verify byte positions")
                print("  - Manually adjust the byteCodeMappings as needed")
            else:
                print("  1. Use data_monitor.py to determine byte layouts")
                print("  2. Edit the byteCodeMappings in the JSON file")
                print("  3. Test the driver with your tablet")
                print(f"  4. Copy to: ../drivers/{filename}")
            
        except Exception as e:
            print(f"\n✗ Error saving file: {e}")


def main():
    """Main entry point"""
    try:
        discovery = DeviceDiscovery()
        discovery.run()
    except KeyboardInterrupt:
        print("\n\nCancelled by user.")
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    main()

