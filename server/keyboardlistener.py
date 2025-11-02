"""
Keyboard Event Listener Module

Handles keyboard event monitoring for tablet buttons in no-driver mode.
On macOS without the XP-Pen driver, tablet buttons send keyboard events
instead of HID reports.
"""

from typing import Dict, Any, Callable, Optional
from pynput import keyboard
import threading


class KeyboardListener:
    """Monitors keyboard events and maps them to tablet button presses"""
    
    def __init__(self, key_mappings: Dict[str, Any], button_callback: Callable[[int, bool], None]):
        """
        Initialize keyboard listener
        
        Args:
            key_mappings: Dictionary mapping button numbers to key configurations
                         Format: {"1": {"key": "b", "code": "KeyB"}, ...}
            button_callback: Callback function(button_num: int, pressed: bool)
        """
        self.key_mappings = key_mappings
        self.button_callback = button_callback
        self.listener: Optional[keyboard.Listener] = None
        self.button_states: Dict[int, bool] = {}
        self.lock = threading.Lock()
        
        # Initialize button states
        for button_num in key_mappings.keys():
            self.button_states[int(button_num)] = False
        
        print(f"[Keyboard] Initialized with {len(key_mappings)} button mappings")
    
    def _matches_mapping(self, key_obj, mapping: Dict[str, Any]) -> bool:
        """
        Check if a keyboard event matches a button mapping
        
        Args:
            key_obj: pynput Key object
            mapping: Button key mapping configuration
            
        Returns:
            True if the key matches the mapping
        """
        try:
            # Get key character or name
            key_char = None
            key_name = None
            
            if hasattr(key_obj, 'char') and key_obj.char:
                key_char = key_obj.char
            elif hasattr(key_obj, 'name'):
                key_name = key_obj.name
            
            # Check if key matches (by char or name)
            mapping_key = mapping.get('key', '')
            if key_char and key_char == mapping_key:
                return True
            if key_name and key_name == mapping_key.lower():
                return True
            
            # Alternative: match by key code name
            # Convert KeyCode names like 'KeyB' to just 'b' for comparison
            mapping_code = mapping.get('code', '')
            if mapping_code.startswith('Key') and len(mapping_code) > 3:
                code_char = mapping_code[3:].lower()
                if key_char and key_char.lower() == code_char:
                    return True
                if key_name and key_name.lower() == code_char:
                    return True
            
            # Handle bracket keys
            if mapping_code == 'BracketLeft' and key_char == '[':
                return True
            if mapping_code == 'BracketRight' and key_char == ']':
                return True
            
            # Handle numpad keys
            if 'Numpad' in mapping_code:
                if 'Add' in mapping_code and key_char == '+':
                    return True
                if 'Subtract' in mapping_code and key_char == '-':
                    return True
            
            return False
            
        except Exception as e:
            print(f"[Keyboard] Error matching key: {e}")
            return False
    
    def _check_modifiers(self, mapping: Dict[str, Any]) -> bool:
        """
        Check if current modifier keys match the mapping
        
        Args:
            mapping: Button key mapping configuration
            
        Returns:
            True if modifiers match (or no modifiers required)
        """
        # For now, we'll rely on the key combination matching
        # pynput doesn't easily expose current modifier state in callbacks
        # TODO: Track ctrl/shift/alt/meta state if needed
        return True
    
    def _on_press(self, key):
        """Handle key press event"""
        try:
            # Check each button mapping
            for button_num_str, mapping in self.key_mappings.items():
                button_num = int(button_num_str)
                
                if self._matches_mapping(key, mapping):
                    # Check modifiers (basic check - pynput has limitations here)
                    # For keys with modifiers like Ctrl+Z, pynput will see them together
                    
                    with self.lock:
                        # Only trigger if not already pressed (avoid key repeat)
                        if not self.button_states.get(button_num, False):
                            self.button_states[button_num] = True
                            print(f"[Keyboard] Button {button_num} pressed")
                            
                            # Call the callback
                            if self.button_callback:
                                self.button_callback(button_num, True)
                    
                    return  # Found the button, no need to check others
                    
        except Exception as e:
            print(f"[Keyboard] Error in on_press: {e}")
    
    def _on_release(self, key):
        """Handle key release event"""
        try:
            # Check each button mapping
            for button_num_str, mapping in self.key_mappings.items():
                button_num = int(button_num_str)
                
                if self._matches_mapping(key, mapping):
                    with self.lock:
                        if self.button_states.get(button_num, False):
                            self.button_states[button_num] = False
                            print(f"[Keyboard] Button {button_num} released")
                            
                            # Call the callback
                            if self.button_callback:
                                self.button_callback(button_num, False)
                    
                    return
                    
        except Exception as e:
            print(f"[Keyboard] Error in on_release: {e}")
    
    def start(self):
        """Start listening for keyboard events"""
        if self.listener is not None:
            print("[Keyboard] Listener already running")
            return
        
        print("[Keyboard] Starting keyboard event listener...")
        
        try:
            self.listener = keyboard.Listener(
                on_press=self._on_press,
                on_release=self._on_release
            )
            self.listener.start()
            print("[Keyboard] Keyboard listener started successfully")
            
        except Exception as e:
            print(f"[Keyboard] Error starting listener: {e}")
            self.listener = None
    
    def stop(self):
        """Stop listening for keyboard events"""
        if self.listener is not None:
            try:
                print("[Keyboard] Stopping keyboard listener...")
                self.listener.stop()
                self.listener = None
                print("[Keyboard] Keyboard listener stopped")
            except Exception as e:
                print(f"[Keyboard] Error stopping listener: {e}")
                self.listener = None
    
    def is_running(self) -> bool:
        """Check if listener is currently running"""
        return self.listener is not None and self.listener.running


def test_keyboard_listener():
    """Test the keyboard listener with sample mappings"""
    print("Testing keyboard listener...")
    print("Press buttons 1-8 (b, e, [, ], Ctrl+-, Ctrl++, Ctrl+Z, Ctrl+Shift+Z)")
    print("Press Esc to exit")
    
    # Sample key mappings (XP-Pen Deco 640 no-driver mode)
    key_mappings = {
        "1": {"key": "b", "code": "KeyB"},
        "2": {"key": "e", "code": "KeyE"},
        "3": {"key": "[", "code": "BracketLeft"},
        "4": {"key": "]", "code": "BracketRight"},
        "5": {"key": "-", "code": "NumpadSubtract", "ctrlKey": True},
        "6": {"key": "+", "code": "NumpadAdd", "ctrlKey": True},
        "7": {"key": "z", "code": "KeyZ", "ctrlKey": True},
        "8": {"key": "Z", "code": "KeyZ", "ctrlKey": True, "shiftKey": True}
    }
    
    def button_callback(button_num: int, pressed: bool):
        state = "PRESSED" if pressed else "RELEASED"
        print(f">>> Button {button_num} {state}")
    
    listener = KeyboardListener(key_mappings, button_callback)
    listener.start()
    
    try:
        # Keep running until Esc
        with keyboard.Events() as events:
            for event in events:
                if isinstance(event, keyboard.Events.Press):
                    if event.key == keyboard.Key.esc:
                        print("\nEsc pressed, exiting...")
                        break
    except KeyboardInterrupt:
        print("\nInterrupted")
    finally:
        listener.stop()
        print("Test completed")


if __name__ == '__main__':
    test_keyboard_listener()

