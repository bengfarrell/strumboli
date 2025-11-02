"""
HID Device Reader Module

Handles reading data from HID devices (e.g., graphics tablets)
and processing the raw data according to configuration byte code mappings.
"""

import time
import struct
from typing import Dict, Any, Union, Callable, Optional, TYPE_CHECKING

from datahelpers import parse_code, parse_range_data, parse_bipolar_range_data, parse_multi_byte_range_data, parse_bit_flags

if TYPE_CHECKING:
    from config import Config


class HIDReader:
    """Manages HID device reading and data processing"""
    
    def __init__(self, device, config: 'Config', data_callback: Callable[[Dict[str, Union[str, int, float]]], None], 
                 warning_callback: Optional[Callable[[str], None]] = None):
        """
        Initialize HID reader
        
        Args:
            device: HID device object (from hid library)
            config: Configuration instance with device byte code mappings
            data_callback: Callback function to handle processed data
            warning_callback: Optional callback function to send warnings (e.g., via websocket)
        """
        self.device = device
        self.config = config
        self.data_callback = data_callback
        self.warning_callback = warning_callback
        self.is_running = False
        # Use reportId from config, default to 2 if not specified
        self.expected_report_id = getattr(config, 'report_id', 2)
        self.wrong_report_id_warned = False  # Only warn once
        
    def process_device_data(self, data: bytes) -> Dict[str, Union[str, int, float]]:
        """
        Process raw device data according to configuration byte code mappings
        
        Args:
            data: Raw bytes from HID device
            
        Returns:
            Dictionary with processed data values
        """
        # Convert bytes to list of integers
        data_list = list(data)

        result: Dict[str, Union[str, int, float]] = {}
        
        # Check Report ID - some interfaces (like button interface) don't use status codes
        report_id = data_list[0] if len(data_list) > 0 else 0
        is_button_interface = (report_id == 6)  # Report ID 6 is button-only interface on Linux
        
        # First, parse the status to determine device state (if using single-interface mode)
        device_state = None
        for key, mapping in self.config.mappings.items():
            if mapping.get('type') == 'code':
                byte_index = mapping.get('byteIndex', 0)
                if byte_index < len(data_list):
                    code_result = parse_code(data_list, byte_index, mapping.get('values', []))
                    if isinstance(code_result, dict):
                        result.update(code_result)
                        device_state = code_result.get('state')
                    else:
                        result[key] = code_result
                    break
        
        # Process remaining mappings based on device state
        for key, mapping in self.config.mappings.items():
            mapping_type = mapping.get('type')
            byte_index = mapping.get('byteIndex', 0)
            
            # Skip if already processed (status/code), unless it's tabletButtons with code type
            if mapping_type == 'code' and key != 'tabletButtons':
                continue
            
            # Handle tabletButtons with code type (custom value mapping)
            if key == 'tabletButtons' and mapping_type == 'code':
                # ONLY process button codes from the button interface (Report ID 6)
                # This prevents false button detections from stylus coordinate data
                if is_button_interface:
                    if byte_index < len(data_list):
                        byte_value = str(data_list[byte_index])
                        values_map = mapping.get('values', {})
                        if byte_value in values_map:
                            button_num = values_map[byte_value].get('button')
                            if button_num:
                                # Set only this button as pressed
                                button_count = mapping.get('buttonCount', 8)
                                for i in range(1, button_count + 1):
                                    result[f'button{i}'] = (i == button_num)
                continue
            
            # Skip keyboard-events type - these are handled by keyboard listener, not HID
            if key == 'tabletButtons' and mapping_type == 'keyboard-events':
                continue
            
            # Skip button parsing if not in button mode (unless we're on button-only interface)
            if mapping_type == 'bit-flags' and device_state != 'buttons' and not is_button_interface:
                continue
            
            # Skip coordinate/pressure/tilt parsing if on button-only interface or in button mode
            if (is_button_interface or device_state == 'buttons') and key in ['x', 'y', 'pressure', 'tiltX', 'tiltY']:
                continue
            
            # Skip validation for multi-byte-range as it uses byteIndices instead
            if mapping_type != 'multi-byte-range' and byte_index >= len(data_list):
                continue
                
            if mapping_type == 'range':
                result[key] = parse_range_data(
                    data_list, 
                    byte_index, 
                    mapping.get('min', 0), 
                    mapping.get('max', 0)
                )
            elif mapping_type == 'multi-byte-range':
                byte_indices = mapping.get('byteIndices', [])
                # Validate all indices are within bounds
                if all(idx < len(data_list) for idx in byte_indices):
                    result[key] = parse_multi_byte_range_data(
                        data_list,
                        byte_indices,
                        mapping.get('min', 0),
                        mapping.get('max', 0),
                        debug_name=key  # Pass the key name for debug logging
                    )
            elif mapping_type == 'bipolar-range':
                result[key] = parse_bipolar_range_data(
                    data_list,
                    byte_index,
                    mapping.get('positiveMin', 0),
                    mapping.get('positiveMax', 0),
                    mapping.get('negativeMin', 0),
                    mapping.get('negativeMax', 0)
                )
            elif mapping_type == 'bit-flags':
                button_states = parse_bit_flags(
                    data_list,
                    byte_index,
                    mapping.get('buttonCount', 8)
                )
                result.update(button_states)
        
        return result
    
    def start_reading(self, buffer_size: int = 64, sleep_interval: float = 0.001):
        """
        Start reading from the HID device in a loop
        
        Args:
            buffer_size: Size of read buffer in bytes
            sleep_interval: Sleep time between reads when no data (seconds)
        """
        if not self.device:
            raise ValueError("No device available for reading")
        
        self.is_running = True
        
        # Use non-blocking mode to allow signal handling
        self.device.set_nonblocking(True)
        read_count = 0
        empty_read_count = 0

        print("[HID] Starting device reading loop...")

        while self.is_running:
            try:
                # Read data from device (non-blocking)
                data = self.device.read(buffer_size)
                read_count += 1

                if data:
                    empty_read_count = 0  # Reset empty count
                    
                    # Log Report ID for debugging (different interfaces may use different IDs)
                    # On multi-interface devices, buttons and stylus may have different report IDs
                    report_id = data[0] if len(data) > 0 else 0
                    if len(data) > 0 and not self.wrong_report_id_warned:
                        if report_id != self.expected_report_id:
                            print(f"[HID] Note: Interface using Report ID {report_id} (config specifies {self.expected_report_id})")
                            self.wrong_report_id_warned = True
                    
                    # Process the data
                    processed_data = self.process_device_data(bytes(data))
                    
                    # Call the callback with processed data
                    if self.data_callback:
                        self.data_callback(processed_data)
                else:
                    empty_read_count += 1
                    # Small sleep to prevent CPU spinning
                    time.sleep(sleep_interval)

            except OSError as e:
                # Handle device disconnection
                if "read error" in str(e).lower() or "device" in str(e).lower():
                    print(f"[HID] Device disconnected or error: {e}")
                    self.is_running = False
                    break
                print(f"[HID] Error reading from device: {e}")
                time.sleep(0.1)
            except Exception as e:
                print(f"[HID] Unexpected error: {e}")
                time.sleep(0.1)
        
        print("[HID] Device reading loop stopped")
    
    def stop(self):
        """Stop the reading loop"""
        print("[HID] Stopping HID reader...")
        self.is_running = False
    
    def close(self):
        """Close the HID device"""
        if self.device:
            try:
                print("[HID] Closing HID device...")
                # Try to ensure the device is in a good state before closing
                try:
                    self.device.set_nonblocking(False)
                except:
                    pass  # Ignore if this fails
                
                self.device.close()
                print("[HID] HID device closed successfully")
                self.device = None
                
                # Give the OS more time to fully release the device handle
                # This is crucial for HID devices on macOS
                print("[HID] Waiting for OS to release device handle...")
                time.sleep(0.5)
                print("[HID] Device should be released now")
                
            except Exception as e:
                print(f"[HID] Error closing device: {e}")
                self.device = None  # Clear reference even if close failed

