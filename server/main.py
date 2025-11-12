import json
import sys
import os
import signal
import threading
import time
import atexit
import asyncio
import math
import argparse
from typing import Dict, Any, Union, Optional, Callable
from dataclasses import asdict

from finddevice import find_and_open_device, find_and_open_all_interfaces, HotplugMonitor
from strummer import strummer
from midi import Midi
from jackmidi import JackMidi
from midievent import MidiNoteEvent, NOTE_EVENT
from note import Note
from websocketserver import SocketServer
from webserver import WebServer
from hidreader import HIDReader
from datahelpers import apply_effect
from config import Config
from actions import Actions

# Conditionally import KeyboardListener (requires X display, not available on all systems)
try:
    from keyboardlistener import KeyboardListener
    KEYBOARD_LISTENER_AVAILABLE = True
except ImportError as e:
    print(f"[Keyboard] Warning: KeyboardListener not available ({e})")
    print("[Keyboard] Tablet button keyboard events will not be supported")
    KeyboardListener = None
    KEYBOARD_LISTENER_AVAILABLE = False

# Global references for cleanup
_hid_readers = []  # Multiple readers for multiple interfaces (stylus, buttons, etc.)
_keyboard_listener = None  # Keyboard listener for no-driver mode
_midi = None
_socket_server = None
_web_server = None
_event_loop = None
_loop_thread = None
_hotplug_monitor = None

# Global tablet connection state
_tablet_connected = False
_tablet_device_info = None


def cleanup_resources():
    """Clean up device and MIDI resources"""
    global _hid_readers, _keyboard_listener, _midi, _socket_server, _web_server, _event_loop, _loop_thread, _hotplug_monitor, _tablet_connected, _tablet_device_info
    
    print("\nCleaning up resources...")
    
    # Stop keyboard listener first
    if _keyboard_listener is not None:
        try:
            _keyboard_listener.stop()
            _keyboard_listener = None
        except Exception as e:
            print(f"Error stopping keyboard listener: {e}")
            _keyboard_listener = None
    
    # Stop hotplug monitor
    if _hotplug_monitor is not None:
        try:
            _hotplug_monitor.stop()
            _hotplug_monitor = None
        except Exception as e:
            print(f"Error stopping hotplug monitor: {e}")
            _hotplug_monitor = None
    
    # Notify device disconnection if tablet was connected
    if _tablet_connected and _socket_server is not None:
        try:
            print("[Device Status] Broadcasting: Connected = False")
            broadcast_to_socket(_socket_server, 'device_status', {
                'connected': False,
                'device': None
            })
            _tablet_connected = False
            _tablet_device_info = None
        except Exception as e:
            print(f"Error broadcasting device disconnection: {e}")
    
    # Close web server
    if _web_server is not None:
        try:
            _web_server.stop()
            _web_server = None
        except Exception as e:
            print(f"Error closing web server: {e}")
            _web_server = None
    
    # Close socket server
    if _socket_server is not None:
        try:
            print("Closing socket server...")
            _socket_server.stop()
            _socket_server = None
        except Exception as e:
            print(f"Error closing socket server: {e}")
            _socket_server = None
    
    # Stop event loop and cancel pending tasks
    if _event_loop is not None:
        try:
            if _event_loop.is_running():
                print("Cancelling pending tasks...")
                # Cancel all pending tasks in the event loop
                def cancel_all_tasks():
                    tasks = [task for task in asyncio.all_tasks(_event_loop) if not task.done()]
                    for task in tasks:
                        task.cancel()
                    return len(tasks)
                
                # Schedule task cancellation in the event loop
                future = asyncio.run_coroutine_threadsafe(
                    asyncio.sleep(0),  # Dummy coroutine to get into the loop
                    _event_loop
                )
                try:
                    future.result(timeout=0.5)
                except:
                    pass
                
                # Now cancel tasks from within the loop's thread
                _event_loop.call_soon_threadsafe(cancel_all_tasks)
                
                # Give tasks a moment to cancel
                time.sleep(0.2)
                
                print("Stopping event loop...")
                _event_loop.call_soon_threadsafe(_event_loop.stop)
                
                if _loop_thread is not None:
                    _loop_thread.join(timeout=3.0)
                    if _loop_thread.is_alive():
                        print("Warning: Event loop thread did not stop cleanly")
                
                print("Event loop stopped successfully")
        except Exception as e:
            print(f"Error stopping event loop: {e}")
    
    # Stop and close all HID readers
    for reader in _hid_readers:
        if reader is not None:
            try:
                reader.stop()
                reader.close()
            except Exception as e:
                print(f"Error closing HID reader: {e}")
    _hid_readers = []
    
    # Close MIDI
    if _midi is not None:
        try:
            print("Closing MIDI connections...")
            _midi.close()
            _midi = None
            print("MIDI connections closed successfully")
        except Exception as e:
            print(f"Error closing MIDI: {e}")
            _midi = None


def find_settings_file() -> str:
    """
    Find settings.json file in various locations.
    Checks (in order):
    1. Same directory as executable/script
    2. Parent directory (for bundled apps)
    3. Current working directory
    4. User's home directory
    """
    # Get the directory where the executable/script is located
    if getattr(sys, 'frozen', False):
        # Running as compiled executable
        app_dir = os.path.dirname(sys.executable)
        # For macOS .app bundles, also check parent directories
        if sys.platform == 'darwin' and '.app/Contents/MacOS' in app_dir:
            # Try the .app/Contents/Resources directory
            bundle_dir = os.path.join(app_dir, '..', 'Resources')
            if os.path.exists(os.path.join(bundle_dir, 'settings.json')):
                return os.path.join(bundle_dir, 'settings.json')
            # Try the directory containing the .app bundle
            parent_dir = os.path.dirname(os.path.dirname(os.path.dirname(app_dir)))
            if os.path.exists(os.path.join(parent_dir, 'settings.json')):
                return os.path.join(parent_dir, 'settings.json')
    else:
        # Running as script
        app_dir = os.path.dirname(os.path.abspath(__file__))
    
    # List of paths to check
    search_paths = [
        os.path.join(app_dir, 'settings.json'),
        os.path.join(os.path.dirname(app_dir), 'settings.json'),
        os.path.join(os.getcwd(), 'settings.json'),
        os.path.join(os.path.expanduser('~'), 'settings.json'),
    ]
    
    for path in search_paths:
        if os.path.exists(path):
            return path
    
    return None


def load_config(settings_file: Optional[str] = None) -> Config:
    """
    Load configuration from settings file with fallback to defaults
    
    Args:
        settings_file: Optional path to settings file. If None, searches default locations.
    """
    if settings_file is not None:
        # Use the explicitly provided settings file
        if not os.path.exists(settings_file):
            print(f"ERROR: Settings file not found: {settings_file}")
            sys.exit(1)
        print(f"Loading configuration from: {settings_file}")
        return Config.from_file(settings_file)
    
    # No explicit file provided, search default locations
    settings_path = find_settings_file()
    
    if settings_path is None:
        print("Warning: settings.json not found")
        print("\nSearched in:")
        print("  - Application directory")
        print("  - Parent directory")
        print("  - Current working directory")
        print("  - Home directory")
        print("\nUsing default configuration.")
        return Config()
    
    print(f"Loading configuration from: {settings_path}")
    return Config.from_file(settings_path)


def broadcast_to_socket(socket_server: Optional[SocketServer], message_type: str, data: Dict[str, Any]) -> None:
    """
    Broadcast a typed message to the WebSocket server.
    
    Args:
        socket_server: Socket server instance (or None)
        message_type: Message type (e.g., 'notes', 'warning', 'config')
        data: Message data payload
    """
    if socket_server is not None:
        try:
            message = json.dumps({
                'type': message_type,
                **data
            })
            socket_server.send_message_sync(message)
        except Exception as e:
            print(f"[SERVER] Error broadcasting to WebSocket: {e}")


def broadcast_strummer_notes(socket_server: Optional[SocketServer]) -> None:
    """
    Query the current strummer state and broadcast to WebSocket clients.
    
    Args:
        socket_server: Socket server instance (or None)
    """
    if socket_server is not None:
        try:
            notes_state = strummer.get_notes_state()
            message = json.dumps(notes_state)
            socket_server.send_message_sync(message)
        except Exception as e:
            print(f"[SERVER] Error broadcasting strummer notes: {e}")


def on_midi_note_event(event: MidiNoteEvent, cfg: Config, socket_server: Optional[SocketServer] = None):
    """Handle MIDI note events - defined at module level to avoid garbage collection"""
    # Use notes from the event object instead of accessing midi.notes directly
    midi_notes = [Note.parse_notation(n) for n in event.notes]
    
    strumming_cfg = cfg.get('strumming', {})
    strummer.notes = Note.fill_note_spread(
        midi_notes,
        strumming_cfg.get('lowerNoteSpread', 0),
        strumming_cfg.get('upperNoteSpread', 0)
    )
    # Note: broadcast happens automatically via strummer's notes_changed event


def setup_midi_and_strummer(cfg: Config, socket_server: Optional[SocketServer] = None) -> Midi:
    """Setup MIDI connection and strummer configuration"""
    # Configure strummer parameters
    strumming_cfg = cfg.get('strumming', {})
    strummer.configure(
        pluck_velocity_scale=strumming_cfg.get('pluckVelocityScale', 4.0),
        pressure_threshold=strumming_cfg.get('pressureThreshold', 0.1)
    )
    
    # Initialize strummer with initial notes if provided
    strumming_cfg = cfg.get('strumming', {})
    if 'initialNotes' in strumming_cfg and strumming_cfg['initialNotes']:
        initial_notes = [Note.parse_notation(n) for n in strumming_cfg['initialNotes']]
        
        strummer.notes = Note.fill_note_spread(
            initial_notes, 
            strumming_cfg.get('lowerNoteSpread', 0), 
            strumming_cfg.get('upperNoteSpread', 0)
        )
    
    # Setup MIDI - choose backend based on configuration
    midi_backend = cfg.midi_output_backend
    midi_channel = cfg.get('strumming', {}).get('midiChannel')
    
    print(f"[MIDI] Configuration: backend='{midi_backend}', jack_client_name='{cfg.jack_client_name}'")
    
    if midi_backend == 'jack':
        print(f"[MIDI] Using Jack MIDI backend (client: {cfg.jack_client_name})")
        try:
            midi = JackMidi(
                midi_strum_channel=midi_channel,
                client_name=cfg.jack_client_name
            )
            print(f"[MIDI] ✓ Jack MIDI backend initialized successfully")
            print(f"[MIDI] Backend type: {type(midi).__name__}")
        except ImportError as e:
            print(f"[MIDI] Error: {e}")
            print("[MIDI] Falling back to rtmidi backend")
            midi = Midi(midi_strum_channel=midi_channel)
            print(f"[MIDI] Backend type: {type(midi).__name__}")
        except Exception as e:
            print(f"[MIDI] Failed to initialize Jack MIDI: {e}")
            import traceback
            traceback.print_exc()
            print("[MIDI] Falling back to rtmidi backend")
            midi = Midi(midi_strum_channel=midi_channel)
            print(f"[MIDI] Backend type: {type(midi).__name__}")
    else:
        print("[MIDI] Using rtmidi backend")
        midi = Midi(midi_strum_channel=midi_channel)
        print(f"[MIDI] Backend type: {type(midi).__name__}")
    
    # Create a lambda that captures cfg and socket_server
    def handler(event):
        on_midi_note_event(event, cfg, socket_server)
    
    # Store handler reference to prevent garbage collection
    midi._note_handler = handler
    
    # Use Pythonic event handler registration
    midi.on(NOTE_EVENT, handler)
    midi.refresh_connection(cfg.midi_input_id, cfg.midi_output_id)
    
    return midi


def update_config(cfg: Config, updates: Dict[str, Any], socket_server: Optional[SocketServer] = None) -> None:
    """
    Update configuration with key-value pairs from incoming messages.
    Supports nested keys using dot notation (e.g., "device.product").
    """
    global _midi
    
    # Track if note spread changed
    note_spread_changed = False
    # Track if MIDI channel changed
    midi_channel_changed = False
    
    for key, value in updates.items():
        # Check if this is a note spread update
        if key in ['strumming.upperNoteSpread', 'strumming.lowerNoteSpread', 'upperNoteSpread', 'lowerNoteSpread']:
            note_spread_changed = True
        
        # Check if MIDI channel changed
        if key in ['strumming.midiChannel', 'midiChannel']:
            midi_channel_changed = True
        
        # Use Config.set() method which handles dot notation
        cfg.set(key, value)
        print(f'[CONFIG] Updated {key} = {value}')
    
    # If note spreads changed and we have strummer notes, recalculate with new spreads
    if note_spread_changed and strummer.notes:
        # Get base notes from strummer
        notes_state = strummer.get_notes_state()
        base_notes_dicts = notes_state.get('baseNotes', [])
        
        if base_notes_dicts:
            # Convert dictionaries back to NoteObject instances
            from note import NoteObject
            base_notes = [NoteObject(**note_dict) for note_dict in base_notes_dicts]
            
            strumming_cfg = cfg.get('strumming', {})
            strummer.notes = Note.fill_note_spread(
                base_notes,
                strumming_cfg.get('lowerNoteSpread', 0),
                strumming_cfg.get('upperNoteSpread', 0)
            )
            print(f'[CONFIG] Recalculated strummer notes with new spreads: {len(strummer.notes)} notes')
            # Note: broadcast happens automatically via strummer's notes_changed event
    
    # If MIDI channel changed, update the MIDI instance
    if midi_channel_changed and _midi is not None:
        new_channel = cfg.get('strumming', {}).get('midiChannel')
        _midi.set_midi_channel(new_channel)
    
    # Broadcast the updated config to all WebSocket clients
    if socket_server is not None:
        try:
            config_data = {
                'type': 'config',
                'config': cfg.to_dict()
            }
            message = json.dumps(config_data)
            socket_server.send_message_sync(message)
        except Exception as e:
            print(f"[CONFIG] Error broadcasting config: {e}")


def get_device_status() -> Dict[str, Any]:
    """Get current tablet device connection status"""
    global _tablet_connected, _tablet_device_info
    return {
        'type': 'device_status',
        'connected': _tablet_connected,
        'device': _tablet_device_info
    }


def start_socket_server(port: int, cfg: Config) -> tuple[SocketServer, asyncio.AbstractEventLoop, threading.Thread]:
    """Start socket server in a separate thread with its own event loop"""
    
    # Declare socket_server early so it can be referenced in handle_message
    socket_server: Optional[SocketServer] = None
    
    # Create message handler that updates config
    def handle_message(data: Dict[str, Any]):
        """Handle incoming WebSocket messages"""
        try:
            update_config(cfg, data, socket_server)
        except Exception as e:
            print(f'[SERVER] Error updating config: {e}')
    
    socket_server = SocketServer(
        on_message=handle_message, 
        config_callback=lambda: cfg.to_dict(),
        initial_notes_callback=lambda: strummer.get_notes_state(),
        device_status_callback=get_device_status
    )
    
    def run_event_loop(loop, server, port):
        """Run the event loop in a separate thread"""
        asyncio.set_event_loop(loop)
        loop.run_until_complete(server.start(port))
        loop.run_forever()
    
    # Create a new event loop for the socket server
    loop = asyncio.new_event_loop()
    
    # Start the event loop in a separate thread
    thread = threading.Thread(target=run_event_loop, args=(loop, socket_server, port), daemon=True)
    thread.start()
    
    # Give the server a moment to start
    time.sleep(0.5)
    
    return socket_server, loop, thread


def create_hid_data_handler(cfg: Config, midi: Union[Midi, JackMidi], socket_server: Optional[SocketServer] = None) -> Callable[[Dict[str, Union[str, int, float]]], None]:
    """
    Create a callback function to handle processed HID data
    
    Args:
        cfg: Configuration instance
        midi: MIDI instance
        socket_server: Optional socket server for broadcasting events
        
    Returns:
        Callback function that processes HID data and sends MIDI messages
    """
    # Create actions handler
    actions = Actions(cfg)
    
    # Listen for config changes from actions and broadcast to WebSocket clients
    def on_action_config_changed():
        """Broadcast config when actions change it"""
        if socket_server is not None:
            try:
                import json
                config_data = {
                    'type': 'config',
                    'config': cfg.to_dict()
                }
                message = json.dumps(config_data)
                socket_server.send_message_sync(message)
            except Exception as e:
                print(f"[ACTIONS] Error broadcasting config: {e}")
    
    actions.on('config_changed', on_action_config_changed)
    
    # Storage for note repeater feature
    repeater_state = {
        'notes': [],
        'last_repeat_time': 0,
        'is_holding': False
    }
    
    # Track button press states to detect button down events
    button_state = {
        'primaryButtonPressed': False,
        'secondaryButtonPressed': False
    }
    
    # Track tablet button states (buttons 1-8)
    tablet_button_state = {f'button{i}': False for i in range(1, 9)}
    
    # Throttle state for WebSocket broadcasts (100ms = 10 times per second)
    throttle_state = {
        'last_broadcast_time': 0,
        'throttle_interval': 0.1  # 100ms in seconds
    }
    
    def handle_hid_data(result: Dict[str, Union[str, int, float]]) -> None:
        """Handle processed HID data - send MIDI messages based on strumming"""
        
        # Extract raw data values
        x = result.get('x', 0.0)
        y = result.get('y', 0.0)
        pressure = result.get('pressure', 0.0)
        tilt_x = result.get('tiltX', 0.0)
        tilt_y = result.get('tiltY', 0.0)
        
        # Handle stylus button presses
        primary_pressed = result.get('primaryButtonPressed', False)
        secondary_pressed = result.get('secondaryButtonPressed', False)
        
        # Get stylus button configuration
        stylus_buttons_cfg = cfg.get('stylusButtons', {})
        
        # Detect button down events (transition from not pressed to pressed)
        if primary_pressed and not button_state['primaryButtonPressed']:
            # Primary button just pressed
            action = stylus_buttons_cfg.get('primaryButtonAction')
            actions.execute(action, context={'button': 'Primary'})
        
        if secondary_pressed and not button_state['secondaryButtonPressed']:
            # Secondary button just pressed
            action = stylus_buttons_cfg.get('secondaryButtonAction')
            actions.execute(action, context={'button': 'Secondary'})
        
        # Update button states
        button_state['primaryButtonPressed'] = primary_pressed
        button_state['secondaryButtonPressed'] = secondary_pressed
        
        # Handle tablet button presses (buttons 1-8)
        tablet_buttons_cfg = cfg.get('tabletButtons', {})
        for i in range(1, 9):
            button_key = f'button{i}'
            button_pressed = result.get(button_key, False)
            
            # Detect button down event (transition from not pressed to pressed)
            if button_pressed and not tablet_button_state[button_key]:
                # Button just pressed - execute configured action
                action = tablet_buttons_cfg.get(str(i))
                if action:
                    actions.execute(action, context={'button': f'Tablet{i}'})
                
                # Broadcast button press to WebSocket
                broadcast_to_socket(socket_server, 'tablet_button', {
                    'button': i - 1,  # 0-indexed for frontend
                    'pressed': True
                })
            elif not button_pressed and tablet_button_state[button_key]:
                # Button released
                broadcast_to_socket(socket_server, 'tablet_button', {
                    'button': i - 1,  # 0-indexed for frontend
                    'pressed': False
                })
            
            # Update tablet button state
            tablet_button_state[button_key] = button_pressed
        
        # Calculate all possible input values (normalized 0-1)
        y_val = float(y)
        pressure_val = float(pressure)
        tilt_x_val = float(tilt_x)
        tilt_y_val = float(tilt_y)
        # Calculate tiltXY magnitude with sign based on tiltX * tiltY
        magnitude = math.sqrt(tilt_x_val * tilt_x_val + tilt_y_val * tilt_y_val)
        sign = 1 if (tilt_x_val * tilt_y_val) >= 0 else -1
        # Clamp to [-1, 1] range (magnitude can exceed 1 at corners)
        tilt_xy_val = max(-1.0, min(1.0, magnitude * sign))
        
        # Throttled broadcast of tablet data to WebSocket
        current_time = time.time()
        if socket_server and (current_time - throttle_state['last_broadcast_time']) >= throttle_state['throttle_interval']:
            throttle_state['last_broadcast_time'] = current_time
            broadcast_to_socket(socket_server, 'tablet_data', {
                'x': float(x),
                'y': float(y),
                'pressure': float(pressure),
                'tiltX': tilt_x_val,
                'tiltY': tilt_y_val,
                'tiltXY': tilt_xy_val,
                'primaryButtonPressed': primary_pressed,
                'secondaryButtonPressed': secondary_pressed
            })
        
        # Create mapping of control names to input values
        # Note: tiltX, tiltY, tiltXY range from -1 to 1, need to normalize to 0-1 for apply_effect
        control_inputs = {
            'yaxis': y_val,
            'pressure': pressure_val,
            'tiltX': (tilt_x_val + 1.0) / 2.0,   # Normalize -1→1 to 0→1
            'tiltY': (tilt_y_val + 1.0) / 2.0,   # Normalize -1→1 to 0→1
            'tiltXY': (tilt_xy_val + 1.0) / 2.0  # Normalize -1→1 to 0→1
        }
        
        # Debug: Log pressure values when strumming (disabled for cleaner logs)
        # if pressure_val > 0.05:  # Only log when there's meaningful pressure
        #     print(f"[HID] Pressure: {pressure_val:.4f}, X: {x:.4f}")
        
        # Get effect configurations
        pitch_bend_cfg = cfg.get('pitchBend', {})
        note_duration_cfg = cfg.get('noteDuration', {})
        note_velocity_cfg = cfg.get('noteVelocity', {})
        
        # Apply pitch bend effect (TEMPORARILY DISABLED FOR DEBUGGING)
        # bend_value = apply_effect(pitch_bend_cfg, control_inputs, 'pitchBend')
        # midi.send_pitch_bend(bend_value)
        
        # Apply note duration and velocity effects
        duration = apply_effect(note_duration_cfg, control_inputs, 'noteDuration')
        velocity = apply_effect(note_velocity_cfg, control_inputs, 'noteVelocity')
        
        strum_result = strummer.strum(float(x), float(pressure))
        
        # Get note repeater configuration
        note_repeater_cfg = cfg.get('noteRepeater', {})
        note_repeater_enabled = note_repeater_cfg.get('active', False)
        pressure_multiplier = note_repeater_cfg.get('pressureMultiplier', 1.0)
        frequency_multiplier = note_repeater_cfg.get('frequencyMultiplier', 1.0)
        
        # Get transpose state from actions
        transpose_enabled = actions.is_transpose_active()
        transpose_semitones = actions.get_transpose_semitones()
        
        # Handle strum result based on type
        if strum_result:
            if strum_result.get('type') == 'strum':
                # Store notes for repeater and mark as holding
                repeater_state['notes'] = strum_result['notes']
                repeater_state['is_holding'] = True
                repeater_state['last_repeat_time'] = time.time()
                
                # Play notes from strum
                for note_data in strum_result['notes']:
                    # Skip notes with velocity 0 (these would act as note-off in MIDI)
                    if note_data['velocity'] > 0:
                        # Apply transpose if enabled
                        note_to_play = note_data['note']
                        if transpose_enabled:
                            note_to_play = note_to_play.transpose(transpose_semitones)
                        midi.send_note(note_to_play, note_data['velocity'], duration)
                        
                        # Broadcast string pluck to WebSocket
                        # Find which string index was plucked by matching the note
                        for string_idx, strummer_note in enumerate(strummer.notes):
                            if strummer_note == note_data['note']:
                                broadcast_to_socket(socket_server, 'string_pluck', {
                                    'string': string_idx,
                                    'velocity': note_data['velocity']
                                })
                                break
            
            elif strum_result.get('type') == 'release':
                # Stop holding - no more repeats
                repeater_state['is_holding'] = False
                repeater_state['notes'] = []
                
                # Handle strum release - send configured MIDI note
                strum_release_cfg = cfg.get('strumRelease', {})
                release_note = strum_release_cfg.get('midiNote')
                release_channel = strum_release_cfg.get('midiChannel')
                release_max_duration = strum_release_cfg.get('maxDuration', 0.25)
                release_velocity_multiplier = strum_release_cfg.get('velocityMultiplier', 1.0)
                
                # Only trigger release note if duration is within the max duration threshold
                if release_note is not None and duration <= release_max_duration:
                    # Use the velocity from the strum and apply multiplier
                    base_velocity = strum_result.get('velocity', 64)
                    release_velocity = int(base_velocity * release_velocity_multiplier)
                    # Clamp to MIDI range 1-127
                    release_velocity = max(1, min(127, release_velocity))
                    # Send the raw MIDI note on the specified channel
                    midi.send_raw_note(release_note, release_velocity, release_channel, duration)
        
        # Handle note repeater - fire repeatedly while holding
        if note_repeater_enabled and repeater_state['is_holding'] and repeater_state['notes']:
            current_time = time.time()
            time_since_last_repeat = current_time - repeater_state['last_repeat_time']
            
            # Apply frequency multiplier to duration (higher = faster repeats)
            repeat_interval = duration / frequency_multiplier if frequency_multiplier > 0 else duration
            
            # Check if it's time for another repeat
            if time_since_last_repeat >= repeat_interval:
                # Apply pressure multiplier to velocity
                repeat_velocity = int(velocity * pressure_multiplier)
                # Clamp to MIDI range 1-127
                repeat_velocity = max(1, min(127, repeat_velocity))
                
                for note_data in repeater_state['notes']:
                    if repeat_velocity > 0:
                        # Apply transpose if enabled
                        note_to_play = note_data['note']
                        if transpose_enabled:
                            note_to_play = note_to_play.transpose(transpose_semitones)
                        midi.send_note(note_to_play, repeat_velocity, duration)
                
                repeater_state['last_repeat_time'] = current_time
    
    return handle_hid_data


def create_keyboard_button_handler(cfg: Config, actions: Actions, socket_server: Optional[SocketServer] = None):
    """
    Create a callback for keyboard button events (no-driver mode)
    
    Args:
        cfg: Configuration instance
        actions: Actions instance for executing button actions
        socket_server: Optional socket server for broadcasting
        
    Returns:
        Callback function(button_num: int, pressed: bool)
    """
    # Track tablet button states
    tablet_button_state = {f'button{i}': False for i in range(1, 9)}
    
    def handle_button(button_num: int, pressed: bool):
        """Handle keyboard button press/release"""
        button_key = f'button{button_num}'
        
        # Get tablet buttons configuration
        tablet_buttons_cfg = cfg.get('tabletButtons', {})
        
        if pressed and not tablet_button_state.get(button_key, False):
            # Button just pressed - execute configured action
            action = tablet_buttons_cfg.get(str(button_num))
            if action:
                actions.execute(action, context={'button': f'Tablet{button_num}'})
            
            # Broadcast button press to WebSocket
            broadcast_to_socket(socket_server, 'tablet_button', {
                'button': button_num - 1,  # 0-indexed for frontend
                'pressed': True
            })
        elif not pressed and tablet_button_state.get(button_key, False):
            # Button released
            broadcast_to_socket(socket_server, 'tablet_button', {
                'button': button_num - 1,  # 0-indexed for frontend
                'pressed': False
            })
        
        # Update button state
        tablet_button_state[button_key] = pressed
    
    return handle_button


def main():
    """Main application entry point"""
    global _hid_readers, _keyboard_listener, _midi, _socket_server, _web_server, _event_loop, _loop_thread, _hotplug_monitor, _tablet_connected, _tablet_device_info
    
    # Parse command-line arguments
    parser = argparse.ArgumentParser(
        description='Strumboli - MIDI Strummer Server',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py                                    # Use default settings.json
  python main.py -s settings-zynthian-example.json  # Use specific settings file
  python main.py --settings ~/my-settings.json      # Use settings from home directory
        """
    )
    parser.add_argument(
        '-s', '--settings',
        type=str,
        default=None,
        metavar='FILE',
        help='Path to settings JSON file (default: search for settings.json in standard locations)'
    )
    args = parser.parse_args()
    
    # Register cleanup function to run on exit
    atexit.register(cleanup_resources)
    
    # Load configuration
    cfg = load_config(args.settings)
    
    # Optionally start web server
    if cfg.use_web_server:
        port = cfg.web_server_port
        print(f"[HTTP] Starting web server on port {port}...")
        try:
            # Get the directory where main.py is located
            server_dir = os.path.dirname(os.path.abspath(__file__))
            public_dir = os.path.join(server_dir, 'public')
            
            _web_server = WebServer(public_dir, port)
            _web_server.start()
        except Exception as e:
            print(f"[HTTP] Failed to start web server: {e}")
            _web_server = None
    else:
        print("[HTTP] Web server disabled in configuration")
    
    # Optionally start socket server
    if cfg.use_socket_server:
        port = cfg.socket_server_port
        print(f"[SERVER] Starting WebSocket server on port {port}...")
        try:
            _socket_server, _event_loop, _loop_thread = start_socket_server(port, cfg)
            print(f"[SERVER] WebSocket server started successfully")
        except Exception as e:
            print(f"[SERVER] Failed to start WebSocket server: {e}")
            _socket_server = None
    else:
        print("[SERVER] WebSocket server disabled in configuration")
    
    # Setup MIDI and strummer
    _midi = setup_midi_and_strummer(cfg, _socket_server)
    
    # Listen for strummer notes changes and broadcast to WebSocket clients
    def on_strummer_notes_changed():
        """Broadcast strummer notes when they change"""
        broadcast_strummer_notes(_socket_server)
    
    strummer.on('notes_changed', on_strummer_notes_changed)
    
    # Create callbacks for hotplug device connection/disconnection
    def on_device_disconnected():
        """Handle device disconnection from hotplug monitor"""
        global _hid_readers, _keyboard_listener, _tablet_connected, _tablet_device_info
        
        print("\n[Hotplug] Device disconnected")
        
        # Update global tablet connection state
        _tablet_connected = False
        _tablet_device_info = None
        
        # Notify via websocket
        broadcast_to_socket(_socket_server, 'device_status', {
            'connected': False,
            'device': None
        })
        
        # Stop keyboard listener if running
        if _keyboard_listener is not None:
            try:
                _keyboard_listener.stop()
                _keyboard_listener = None
            except Exception as e:
                print(f"[Hotplug] Error stopping keyboard listener: {e}")
        
        # Stop all HID readers if running
        if _hid_readers:
            for reader in _hid_readers:
                try:
                    reader.stop()
                    reader.close()
                except Exception as e:
                    print(f"[Hotplug] Error stopping HID reader: {e}")
            _hid_readers = []
    
    def on_device_plugged_in(driver_name: str, driver_config: Dict[str, Any], device):
        """Handle device connection from hotplug monitor"""
        global _hid_readers, _keyboard_listener, _tablet_connected, _tablet_device_info
        
        # Close the device opened by hotplug monitor - we'll reopen all interfaces properly
        try:
            device.close()
        except:
            pass
        
        device_name = driver_config.get('name', driver_name)
        print(f"\n[Hotplug] Device connected: {device_name}")
        
        # Update global tablet connection state
        _tablet_connected = True
        _tablet_device_info = {
            'name': device_name,
            'driver': driver_name,
            'manufacturer': driver_config.get('manufacturer'),
            'model': driver_config.get('model')
        }
        
        # Notify via websocket
        print(f"[Device Status] Broadcasting: Connected = True, Device = {device_name}")
        broadcast_to_socket(_socket_server, 'device_status', {
            'connected': True,
            'device': _tablet_device_info
        })
        
        # Stop existing HID readers if any
        if _hid_readers:
            for reader in _hid_readers:
                try:
                    reader.stop()
                    reader.close()
                except:
                    pass
            _hid_readers = []
        
        # Update config with new device configuration
        startup_cfg = cfg.get('startupConfiguration', {})
        
        # Merge device info and byte mappings into drawing tablet config
        tablet_config = {}
        if 'deviceInfo' in driver_config:
            tablet_config.update(driver_config['deviceInfo'])
        if 'byteCodeMappings' in driver_config:
            tablet_config['byteCodeMappings'] = driver_config['byteCodeMappings']
        if 'reportId' in driver_config:
            tablet_config['reportId'] = driver_config['reportId']
        tablet_config['_driverName'] = driver_name
        tablet_config['_driverInfo'] = {
            'name': driver_config.get('name'),
            'manufacturer': driver_config.get('manufacturer'),
            'model': driver_config.get('model')
        }
        
        startup_cfg['drawingTablet'] = tablet_config
        
        # Find and open all interfaces for this device
        devices = find_and_open_all_interfaces(tablet_config)
        
        if not devices:
            print(f"[Hotplug] Error: Could not reopen device interfaces")
            return
        
        print(f"[Hotplug] Opened {len(devices)} interface(s)")
        
        # Check if we need keyboard listener for tablet buttons (no-driver mode)
        tablet_buttons_mapping = tablet_config.get('byteCodeMappings', {}).get('tabletButtons', {})
        if tablet_buttons_mapping.get('type') == 'keyboard-events':
            print("[Hotplug/Keyboard] Device uses keyboard events for buttons - setting up keyboard listener")
            
            if not KEYBOARD_LISTENER_AVAILABLE:
                print("[Hotplug/Keyboard] ERROR: KeyboardListener not available on this system")
                print("[Hotplug/Keyboard] Tablet button events will not work")
            else:
                key_mappings = tablet_buttons_mapping.get('keyMappings', {})
                if key_mappings:
                    try:
                        # Stop existing keyboard listener if any
                        if _keyboard_listener is not None:
                            _keyboard_listener.stop()
                            _keyboard_listener = None
                        
                        # Create actions instance for button handling
                        from actions import Actions
                        actions = Actions(cfg)
                        
                        # Listen for config changes from actions
                        def on_action_config_changed():
                            if _socket_server is not None:
                                try:
                                    config_data = {
                                        'type': 'config',
                                        'config': cfg.to_dict()
                                    }
                                    message = json.dumps(config_data)
                                    _socket_server.send_message_sync(message)
                                except Exception as e:
                                    print(f"[ACTIONS] Error broadcasting config: {e}")
                        
                        actions.on('config_changed', on_action_config_changed)
                        
                        # Create keyboard button handler
                        button_handler = create_keyboard_button_handler(cfg, actions, _socket_server)
                        
                        # Create and start keyboard listener
                        _keyboard_listener = KeyboardListener(key_mappings, button_handler)
                        _keyboard_listener.start()
                        print("[Hotplug/Keyboard] Keyboard listener started successfully")
                    except Exception as e:
                        print(f"[Hotplug/Keyboard] Error setting up keyboard listener: {e}")
                        import traceback
                        traceback.print_exc()
                else:
                    print("[Hotplug/Keyboard] No key mappings found in device config")
        
        # Create HID readers for all interfaces
        data_handler = create_hid_data_handler(cfg, _midi, _socket_server)
        
        # devices is a list of tuples: [(interface_num, device), ...]
        for interface_num, device in devices:
            print(f"[Hotplug] Creating reader for interface {interface_num}")
            
            reader = HIDReader(
                device, 
                cfg, 
                data_handler, 
                warning_callback=lambda msg: broadcast_to_socket(_socket_server, 'warning', {'message': msg})
            )
            _hid_readers.append(reader)
            
            # Start reading in a background thread
            def start_reading(reader=reader, interface=interface_num):
                try:
                    reader.start_reading()
                except Exception as e:
                    print(f"[Hotplug] Error starting HID reader for interface {interface}: {e}")
            
            read_thread = threading.Thread(target=start_reading, daemon=True)
            read_thread.start()
        
        print(f"[Hotplug] All {len(_hid_readers)} reader(s) started")
        
        # Broadcast device status to WebSocket clients
        broadcast_to_socket(_socket_server, 'device_status', {
            'connected': True,
            'device': _tablet_device_info
        })
        
        print(f"[Hotplug] Now using {device_name} for input")
    
    # Get tablet device(s) - open ALL interfaces (stylus + buttons may be separate)
    startup_cfg = cfg.get('startupConfiguration', {})
    drawing_tablet_cfg = startup_cfg.get('drawingTablet', {})
    devices = find_and_open_all_interfaces(drawing_tablet_cfg)
    if not devices:
        print("HID device not available - continuing with MIDI-only mode")
        
        # Update global tablet connection state
        _tablet_connected = False
        _tablet_device_info = None
        
        # Start hotplug monitor to detect when device is connected
        try:
            # Get available driver profiles for monitoring
            from config import Config
            temp_cfg = Config()
            driver_profiles = temp_cfg._get_available_drivers()
            
            if driver_profiles:
                _hotplug_monitor = HotplugMonitor(
                    driver_profiles=driver_profiles,
                    on_device_connected=on_device_plugged_in,
                    on_device_disconnected=on_device_disconnected,
                    check_interval=2.0
                )
                _hotplug_monitor.start()
                print("Waiting for compatible device to be plugged in...")
            else:
                print("No driver profiles available for hotplug detection")
        except Exception as e:
            print(f"[Hotplug] Could not start hotplug monitor: {e}")
        
        print("Strumboli server started (MIDI-only mode). Press Ctrl+C to exit.")
    else:
        print(f"Strumboli server started with HID device ({len(devices)} interface(s)). Press Ctrl+C to exit.")
        
        # Update global tablet connection state
        _tablet_connected = True
        driver_info = drawing_tablet_cfg.get('_driverInfo', {})
        _tablet_device_info = {
            'name': driver_info.get('name', 'Unknown Device'),
            'driver': drawing_tablet_cfg.get('_driverName', 'unknown'),
            'manufacturer': driver_info.get('manufacturer'),
            'model': driver_info.get('model')
        }
        print(f"[Device Status] Initial state: Connected = True, Device = {_tablet_device_info['name']}")
        
        # Broadcast initial device status to any connected WebSocket clients
        broadcast_to_socket(_socket_server, 'device_status', {
            'connected': True,
            'device': _tablet_device_info
        })
        
        # Start hotplug monitor to detect disconnection and reconnection
        try:
            from config import Config
            temp_cfg = Config()
            driver_profiles = temp_cfg._get_available_drivers()
            
            if driver_profiles:
                _hotplug_monitor = HotplugMonitor(
                    driver_profiles=driver_profiles,
                    on_device_connected=on_device_plugged_in,
                    on_device_disconnected=on_device_disconnected,
                    check_interval=2.0
                )
                _hotplug_monitor.start()
                # Register the currently connected device so monitor knows to watch for its disconnection
                _hotplug_monitor.register_connected_device(drawing_tablet_cfg)
                print("[Hotplug] Monitor started to watch for disconnections")
        except Exception as e:
            print(f"[Hotplug] Could not start hotplug monitor: {e}")
        
        # Check if we need keyboard listener for tablet buttons (no-driver mode)
        tablet_buttons_mapping = cfg.mappings.get('tabletButtons', {})
        if tablet_buttons_mapping.get('type') == 'keyboard-events':
            print("[Keyboard] Device uses keyboard events for buttons - setting up keyboard listener")
            
            if not KEYBOARD_LISTENER_AVAILABLE:
                print("[Keyboard] ERROR: KeyboardListener not available on this system")
                print("[Keyboard] Tablet button events will not work")
            else:
                key_mappings = tablet_buttons_mapping.get('keyMappings', {})
                if key_mappings:
                    try:
                        # Create actions instance for button handling
                        from actions import Actions
                        actions = Actions(cfg)
                        
                        # Listen for config changes from actions
                        def on_action_config_changed():
                            if _socket_server is not None:
                                try:
                                    config_data = {
                                        'type': 'config',
                                        'config': cfg.to_dict()
                                    }
                                    message = json.dumps(config_data)
                                    _socket_server.send_message_sync(message)
                                except Exception as e:
                                    print(f"[ACTIONS] Error broadcasting config: {e}")
                        
                        actions.on('config_changed', on_action_config_changed)
                        
                        # Create keyboard button handler
                        button_handler = create_keyboard_button_handler(cfg, actions, _socket_server)
                        
                        # Create and start keyboard listener
                        _keyboard_listener = KeyboardListener(key_mappings, button_handler)
                        _keyboard_listener.start()
                        print("[Keyboard] Keyboard listener started successfully")
                    except Exception as e:
                        print(f"[Keyboard] Error setting up keyboard listener: {e}")
                        import traceback
                        traceback.print_exc()
                else:
                    print("[Keyboard] No key mappings found in device config")
        
        # Create HID readers for all interfaces (buttons may be on separate interface)
        data_handler = create_hid_data_handler(cfg, _midi, _socket_server)
        for interface_num, device in devices:
            print(f"[HID] Creating reader for interface {interface_num}")
            reader = HIDReader(
                device, 
                cfg, 
                data_handler, 
                warning_callback=lambda msg: broadcast_to_socket(_socket_server, 'warning', {'message': msg})
            )
            _hid_readers.append(reader)
            
            # Start each reader in its own thread
            def start_reading(r):
                try:
                    r.start_reading()
                except Exception as e:
                    print(f"[HID] Error in reader: {e}")
            
            read_thread = threading.Thread(target=start_reading, args=(reader,), daemon=True)
            read_thread.start()
        
    
    # Setup signal handler for graceful shutdown
    def signal_handler(sig, frame):
        signal_name = signal.Signals(sig).name
        print(f"\nReceived {signal_name} signal, shutting down gracefully...")
        cleanup_resources()
        sys.exit(0)
    
    # Handle various termination signals
    signal.signal(signal.SIGINT, signal_handler)   # Ctrl+C
    signal.signal(signal.SIGTERM, signal_handler)  # kill command
    signal.signal(signal.SIGTSTP, signal_handler)  # Ctrl+Z
    signal.signal(signal.SIGHUP, signal_handler)   # Terminal closed
    
    # Main loop - keep application running
    try:
        if _hid_readers:
            # Readers are already running in threads, just keep main thread alive
            while True:
                time.sleep(1.0)
        else:
            # No device available - just keep the application running for MIDI functionality
            while True:
                time.sleep(1.0)  # Keep the main thread alive
                
    except KeyboardInterrupt:
        print("\nReceived keyboard interrupt")
        cleanup_resources()
        sys.exit(0)
    except Exception as e:
        print(f"\nUnexpected error in main loop: {e}")
        cleanup_resources()
        sys.exit(1)


if __name__ == "__main__":
    main()

