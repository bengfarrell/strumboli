import json
import os
import glob
from typing import Dict, Any, Optional, Union, List, Tuple
from pathlib import Path


class Config:
    """
    Configuration manager for MIDI Strummer.
    Provides hard-coded defaults that can be overridden by JSON settings.
    """
    
    # Default configuration values
    DEFAULTS = {
        "startupConfiguration": {
            "midiOutputBackend": "rtmidi",  # Options: "rtmidi", "jack"
            "jackClientName": "strumboli",  # Name for Jack client (only used if backend is "jack")
            "midiOutputId": None,  # MIDI output port selection (rtmidi only) - can be index (0, 1, 2) or name. None = use port 0
            "drawingTablet": {
                "product": "Deco 640",
                "usage": 1,
                "interface": 2,
                "byteCodeMappings": {
                    "status": {
                        "byteIndex": 1,
                        "max": 63,
                        "type": "code",
                        "values": {
                            "192": {"state": "none"},
                            "160": {"state": "hover"},
                            "162": {"state": "hover", "secondaryButtonPressed": True},
                            "164": {"state": "hover", "primaryButtonPressed": True},
                            "161": {"state": "contact"},
                            "163": {"state": "contact", "secondaryButtonPressed": True},
                            "165": {"state": "contact", "primaryButtonPressed": True},
                            "240": {"state": "buttons"}
                        }
                    },
                    "x": {"byteIndex": 3, "max": 124, "type": "range"},
                    "y": {"byteIndex": 5, "max": 70, "type": "range"},
                    "pressure": {"byteIndex": 7, "max": 63, "type": "range"},
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
                    }
                }
            },
            "useSocketServer": True,
            "socketServerPort": 8080,
            "midiInputId": None
        },
        "noteDuration": {
            "min": 0.15,
            "max": 1.5,
            "multiplier": 1.0,
            "curve": 1.0,
            "spread": "inverse",
            "control": "tiltXY",
            "default": 1.0
        },
        "pitchBend": {
            "min": -1.0,
            "max": 1.0,
            "multiplier": 1.0,
            "curve": 4.0,
            "spread": "central",
            "control": "yaxis",
            "default": 0.0
        },
        "noteVelocity": {
            "min": 0,
            "max": 127,
            "multiplier": 1.0,
            "curve": 4.0,
            "spread": "direct",
            "control": "pressure",
            "default": 64
        },
        "strumming": {
            "pluckVelocityScale": 4.0,
            "pressureThreshold": 0.1,
            "midiChannel": None,
            "initialNotes": ["C4", "E4", "G4"],
            "upperNoteSpread": 3,
            "lowerNoteSpread": 3
        },
        "noteRepeater": {
            "active": False,
            "pressureMultiplier": 1.0,
            "frequencyMultiplier": 1.0
        },
        "transpose": {
            "active": False,
            "semitones": 12
        },
        "stylusButtons": {
            "active": True,
            "primaryButtonAction": "toggle-transpose",
            "secondaryButtonAction": "toggle-repeater"
        },
        "strumRelease": {
            "active": False,
            "midiNote": 38,
            "midiChannel": None,
            "maxDuration": 0.25,
            "velocityMultiplier": 1.0
        }
    }
    
    def __init__(self, config_dict: Optional[Dict[str, Any]] = None):
        """
        Initialize configuration with optional overrides.
        
        Args:
            config_dict: Optional dictionary to override defaults
        """
        # Process device driver profiles before merging
        processed_config = self._process_device_drivers(config_dict or {})
        # Expand chord progression presets for tabletButtons
        processed_config = self._expand_chord_progressions(processed_config)
        
        # Merge with defaults, but if a driver profile was loaded, don't merge drawingTablet
        merged = self._deep_merge(self.DEFAULTS.copy(), processed_config)
        
        # If we loaded a driver profile, ensure it completely replaces the default
        if (processed_config.get('startupConfiguration', {}).get('drawingTablet') and 
            processed_config['startupConfiguration']['drawingTablet'].get('_driverName')):
            # Driver profile loaded - use it as-is, don't merge with defaults
            merged['startupConfiguration']['drawingTablet'] = processed_config['startupConfiguration']['drawingTablet']
        
        self._config = merged
    
    @classmethod
    def from_file(cls, file_path: str) -> 'Config':
        """
        Load configuration from a JSON file.
        
        Args:
            file_path: Path to JSON configuration file
            
        Returns:
            Config instance with loaded settings
        """
        path = Path(file_path)
        if not path.exists():
            print(f"Warning: Config file '{file_path}' not found. Using defaults.")
            return cls()
        
        try:
            with open(path, 'r') as f:
                config_dict = json.load(f)
            print(f"Loaded configuration from '{file_path}'")
            return cls(config_dict)
        except json.JSONDecodeError as e:
            print(f"Error parsing config file '{file_path}': {e}")
            print("Using default configuration.")
            return cls()
        except Exception as e:
            print(f"Error loading config file '{file_path}': {e}")
            print("Using default configuration.")
            return cls()
    
    @staticmethod
    def _load_device_driver(driver_name: str) -> Optional[Dict[str, Any]]:
        """
        Load a device driver profile from the drivers directory.
        
        Args:
            driver_name: Name of the driver file (without .json extension)
            
        Returns:
            Driver configuration dictionary, or None if not found
        """
        # Get the directory where this config.py file is located
        current_dir = os.path.dirname(os.path.abspath(__file__))
        drivers_dir = os.path.join(current_dir, 'drivers')
        driver_path = os.path.join(drivers_dir, f'{driver_name}.json')
        
        try:
            with open(driver_path, 'r') as f:
                driver_config = json.load(f)
                print(f"[Config] Loaded device driver: {driver_config.get('name', driver_name)}")
                return driver_config
        except FileNotFoundError:
            print(f"[Config] Warning: Device driver '{driver_name}' not found at {driver_path}")
            return None
        except json.JSONDecodeError as e:
            print(f"[Config] Error parsing device driver '{driver_name}': {e}")
            return None
        except Exception as e:
            print(f"[Config] Error loading device driver '{driver_name}': {e}")
            return None
    
    def _get_available_drivers(self) -> List[Tuple[str, Dict[str, Any]]]:
        """
        Get a list of all available device driver profiles.
        
        Returns:
            List of tuples: (driver_name, driver_config)
        """
        current_dir = os.path.dirname(os.path.abspath(__file__))
        drivers_dir = os.path.join(current_dir, 'drivers')
        
        if not os.path.exists(drivers_dir):
            return []
        
        drivers = []
        driver_files = glob.glob(os.path.join(drivers_dir, '*.json'))
        
        for driver_path in driver_files:
            driver_name = os.path.splitext(os.path.basename(driver_path))[0]
            try:
                with open(driver_path, 'r') as f:
                    driver_config = json.load(f)
                    drivers.append((driver_name, driver_config))
            except Exception as e:
                print(f"[Config] Warning: Could not load driver '{driver_name}': {e}")
                continue
        
        return drivers
    
    def _auto_detect_driver(self) -> Optional[str]:
        """
        Auto-detect which driver profile matches a connected HID device.
        
        Returns:
            Driver name if a match is found, None otherwise
        """
        # Import here to avoid circular dependency
        try:
            from finddevice import auto_detect_device
        except ImportError:
            print("[Config] Error: Could not import finddevice module")
            return None
        
        # Get all available driver profiles
        available_drivers = self._get_available_drivers()
        
        if not available_drivers:
            print("[Config] No driver profiles found in drivers/ folder")
            return None
        
        # Delegate to finddevice module
        return auto_detect_device(available_drivers)
    
    def _process_device_drivers(self, config_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process device driver references in the configuration.
        
        If drawingTablet is a string, load the corresponding driver profile.
        Supports "auto-detect" to automatically find matching driver.
        Otherwise, use the inline configuration.
        
        Args:
            config_dict: Configuration dictionary to process
            
        Returns:
            Processed configuration with driver profiles loaded
        """
        # Create a copy to avoid modifying the original
        processed = config_dict.copy()
        
        # Check if startupConfiguration exists
        if 'startupConfiguration' in processed:
            startup = processed['startupConfiguration']
            
            # Check if drawingTablet is a string (driver reference)
            if 'drawingTablet' in startup and isinstance(startup['drawingTablet'], str):
                driver_name = startup['drawingTablet']
                
                # Handle auto-detection
                if driver_name == 'auto-detect':
                    detected_driver = self._auto_detect_driver()
                    if detected_driver:
                        driver_name = detected_driver
                    else:
                        print(f"[Config] Auto-detection failed, using defaults")
                        del processed['startupConfiguration']['drawingTablet']
                        return processed
                else:
                    print(f"[Config] Loading device driver profile: {driver_name}")
                
                # Load the driver
                driver_config = self._load_device_driver(driver_name)
                
                if driver_config:
                    # Extract the relevant parts from the driver
                    tablet_config = {}
                    
                    # Copy device identification info
                    if 'deviceInfo' in driver_config:
                        tablet_config.update(driver_config['deviceInfo'])
                    
                    # Copy byte code mappings
                    if 'byteCodeMappings' in driver_config:
                        tablet_config['byteCodeMappings'] = driver_config['byteCodeMappings']
                    
                    # Copy report ID (default to 2 if not specified)
                    if 'reportId' in driver_config:
                        tablet_config['reportId'] = driver_config['reportId']
                    
                    # Store driver metadata for reference
                    tablet_config['_driverName'] = driver_name
                    tablet_config['_driverInfo'] = {
                        'name': driver_config.get('name'),
                        'manufacturer': driver_config.get('manufacturer'),
                        'model': driver_config.get('model')
                    }
                    
                    # Replace the string reference with the loaded config
                    # Don't merge with defaults - use driver config as-is
                    processed['startupConfiguration']['drawingTablet'] = tablet_config
                else:
                    print(f"[Config] Failed to load driver '{driver_name}', using defaults")
                    # Remove the invalid reference so defaults are used
                    if 'startupConfiguration' in processed and 'drawingTablet' in processed['startupConfiguration']:
                        del processed['startupConfiguration']['drawingTablet']
        
        return processed
    
    def _expand_chord_progressions(self, config_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Expand chord progression preset references in tabletButtons configuration.
        
        If tabletButtons is a string (progression name), expand it to individual button actions.
        Otherwise, leave as-is to support custom button configurations.
        
        Args:
            config_dict: Configuration dictionary to process
            
        Returns:
            Processed configuration with progressions expanded
        """
        # Import here to avoid circular dependency
        from note import Note
        
        # Load chord progressions if not already loaded
        Note.load_chord_progressions()
        
        # Create a copy to avoid modifying the original
        processed = config_dict.copy()
        
        # Check if tabletButtons exists and is a string
        if 'tabletButtons' in processed and isinstance(processed['tabletButtons'], str):
            progression_name = processed['tabletButtons']
            
            # Look up the progression
            if progression_name in Note.chord_progressions:
                chords = Note.chord_progressions[progression_name]
                print(f"[Config] Loading chord progression preset: {progression_name}")
                
                # Expand to individual button actions (8 buttons)
                # Wrap around if there are fewer chords than buttons
                num_buttons = 8
                expanded = {}
                for i in range(1, num_buttons + 1):
                    # Use modulo to wrap around to the beginning of the chord list
                    chord_index = (i - 1) % len(chords)
                    expanded[str(i)] = ["set-strum-chord", chords[chord_index]]
                
                processed['tabletButtons'] = expanded
            else:
                print(f"[Config] Unknown chord progression '{progression_name}', ignoring")
                # Remove invalid reference
                del processed['tabletButtons']
        
        return processed
    
    def _deep_merge(self, base: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deep merge two dictionaries, with override taking precedence.
        
        Args:
            base: Base dictionary (defaults)
            override: Dictionary with override values
            
        Returns:
            Merged dictionary
        """
        result = base.copy()
        
        for key, value in override.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                # Recursively merge nested dictionaries
                result[key] = self._deep_merge(result[key], value)
            else:
                # Override the value
                result[key] = value
        
        return result
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        Get a configuration value by key.
        
        Args:
            key: Configuration key
            default: Default value if key not found
            
        Returns:
            Configuration value or default
        """
        return self._config.get(key, default)
    
    def __getitem__(self, key: str) -> Any:
        """Allow dictionary-style access."""
        return self._config[key]
    
    def __setitem__(self, key: str, value: Any) -> None:
        """Allow dictionary-style assignment."""
        self._config[key] = value
    
    def set(self, key: str, value: Any) -> None:
        """
        Set a configuration value using dot notation.
        
        Args:
            key: Configuration key, may use dot notation (e.g., 'transpose.active')
            value: Value to set
        """
        if '.' in key:
            keys = key.split('.')
            target = self._config
            # Navigate to the nested dictionary
            for k in keys[:-1]:
                if k not in target:
                    target[k] = {}
                target = target[k]
            # Set the final value
            target[keys[-1]] = value
        else:
            # Direct key update
            self._config[key] = value
    
    def __contains__(self, key: str) -> bool:
        """Support 'in' operator."""
        return key in self._config
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Get the full configuration as a dictionary.
        
        Returns:
            Complete configuration dictionary
        """
        return self._config.copy()
    
    def save(self, file_path: str) -> bool:
        """
        Save current configuration to a JSON file.
        
        Args:
            file_path: Path to save the configuration
            
        Returns:
            True if successful, False otherwise
        """
        try:
            path = Path(file_path)
            with open(path, 'w') as f:
                json.dump(self._config, f, indent=2)
            print(f"Configuration saved to '{file_path}'")
            return True
        except Exception as e:
            print(f"Error saving config to '{file_path}': {e}")
            return False
    
    # Convenience properties for common config values
    
    @property
    def device(self) -> Dict[str, Any]:
        """Get drawing tablet device configuration."""
        return self._config.get('startupConfiguration', {}).get('drawingTablet', {})
    
    @property
    def use_socket_server(self) -> bool:
        """Get whether to use socket server."""
        return self._config.get('startupConfiguration', {}).get('useSocketServer', True)
    
    @property
    def socket_server_port(self) -> int:
        """Get socket server port."""
        return self._config.get('startupConfiguration', {}).get('socketServerPort', 8080)
    
    @property
    def use_web_server(self) -> bool:
        """Get whether to use HTTP web server."""
        return self._config.get('startupConfiguration', {}).get('useWebServer', False)
    
    @property
    def web_server_port(self) -> int:
        """Get HTTP web server port."""
        return self._config.get('startupConfiguration', {}).get('webServerPort', 80)
    
    @property
    def midi_input_id(self) -> Optional[str]:
        """Get MIDI input ID."""
        return self._config.get('startupConfiguration', {}).get('midiInputId')
    
    @property
    def midi_output_id(self) -> Optional[str]:
        """Get MIDI output ID (rtmidi only)."""
        return self._config.get('startupConfiguration', {}).get('midiOutputId')
    
    @property
    def midi_output_backend(self) -> str:
        """Get MIDI output backend (rtmidi or jack)."""
        return self._config.get('startupConfiguration', {}).get('midiOutputBackend', 'rtmidi')
    
    @property
    def jack_client_name(self) -> str:
        """Get Jack client name."""
        return self._config.get('startupConfiguration', {}).get('jackClientName', 'midi_strummer')
    
    @property
    def jack_auto_connect(self) -> str:
        """Get Jack auto-connect mode."""
        return self._config.get('startupConfiguration', {}).get('jackAutoConnect', 'chain0')
    
    @property
    def midi_strum_channel(self) -> Optional[int]:
        """Get MIDI strum channel."""
        return self._config.get('strumming', {}).get('midiChannel')
    
    @property
    def initial_notes(self) -> list:
        """Get initial notes."""
        return self._config.get('strumming', {}).get('initialNotes', ["C4", "E4", "G4"])
    
    @property
    def upper_note_spread(self) -> int:
        """Get upper note spread."""
        return self._config.get('strumming', {}).get('upperNoteSpread', 3)
    
    @property
    def lower_note_spread(self) -> int:
        """Get lower note spread."""
        return self._config.get('strumming', {}).get('lowerNoteSpread', 3)
    
    @property
    def note_duration(self) -> Dict[str, Any]:
        """Get note duration configuration."""
        return self._config.get('noteDuration', {})
    
    @property
    def pitch_bend(self) -> Dict[str, Any]:
        """Get pitch bend configuration."""
        return self._config.get('pitchBend', {})
    
    @property
    def note_velocity(self) -> Dict[str, Any]:
        """Get note velocity configuration."""
        return self._config.get('noteVelocity', {})
    
    @property
    def mappings(self) -> Dict[str, Any]:
        """Get HID byte code mappings."""
        return self._config.get('startupConfiguration', {}).get('drawingTablet', {}).get('byteCodeMappings', {})
    
    @property
    def report_id(self) -> int:
        """Get HID Report ID (default to 2 if not specified)."""
        return self._config.get('startupConfiguration', {}).get('drawingTablet', {}).get('reportId', 2)

