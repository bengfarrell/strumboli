import time
import threading
from typing import List, Optional
import rtmidi
from note import Note, NoteObject
from midievent import MidiConnectionEvent, MidiNoteEvent, NOTE_EVENT, CONNECTION_EVENT
from eventlistener import EventEmitter


class Midi(EventEmitter):
    def __init__(self, midi_strum_channel: Optional[int] = None):
        super().__init__()
        self.midi_out: Optional[rtmidi.MidiOut] = None
        self.midi_in: Optional[rtmidi.MidiIn] = None
        self.outs: List[rtmidi.MidiOut] = []
        self.inputs: List[rtmidi.MidiIn] = []
        self._current_input_id: Optional[str] = None
        self._notes: List[str] = []
        self._midi_strum_channel: Optional[int] = midi_strum_channel
        self._active_note_timers: dict = {}  # Track active note-off timers by (midi_note, channels_tuple)
        self._timer_lock = threading.Lock()  # Thread-safe access to timers
        self._note_start_times: dict = {}  # Track when each note started by (midi_note, channels_tuple)

    @property
    def current_input(self) -> Optional[rtmidi.MidiIn]:
        """Get current MIDI input"""
        return self.midi_in

    @property
    def notes(self) -> List[str]:
        """Get current notes"""
        return self._notes

    def refresh_connection(self, midi_input_id: Optional[str] = None) -> None:
        """Refresh MIDI connections"""
        try:
            # Initialize MIDI output
            self.midi_out = rtmidi.MidiOut()
            available_outputs = self.midi_out.get_ports()
            
            print(f"[MIDI] Available output ports: {available_outputs}")
            
            output_port = None
            if available_outputs:
                # TODO: This opens the first available port (port 0) which may not be
                # appropriate for all systems. Consider using Jack MIDI
                # backend for more control over port connections.
                self.midi_out.open_port(0)
                output_port = available_outputs[0]
                print(f"[MIDI] Using output port 0: {output_port}")
            else:
                print("WARNING: No MIDI output ports available")
            
            # Initialize MIDI input
            self.midi_in = rtmidi.MidiIn()
            available_inputs = self.midi_in.get_ports()
            
            input_port = None
            if available_inputs:
                port_index = 0
                if midi_input_id is not None:
                    port_index = self._resolve_input_id(midi_input_id, available_inputs)
                else:
                    self._current_input_id = "0"
                
                self.midi_in.open_port(port_index)
                input_port = available_inputs[port_index]
                
                # Set up MIDI input callback
                self.midi_in.set_callback(self._midi_callback)
            else:
                print("WARNING: No MIDI input ports available")
            
            # Emit connection event with proper event object
            self.emit(
                CONNECTION_EVENT,
                MidiConnectionEvent(
                    connected=True,
                    input_port=input_port,
                    output_port=output_port
                )
            )
            
        except Exception as e:
            print(f'✗ Failed to get MIDI access - {e}')
            import traceback
            traceback.print_exc()
            
            # Emit disconnection event
            self.emit(
                CONNECTION_EVENT,
                MidiConnectionEvent(connected=False)
            )
    
    def _resolve_input_id(self, midi_input_id: str, available_inputs: List[str]) -> int:
        """Resolve input ID to port index."""
        try:
            port_index = int(midi_input_id)
            if 0 <= port_index < len(available_inputs):
                self._current_input_id = midi_input_id
                return port_index
            else:
                print(f"WARNING: Invalid MIDI input index {midi_input_id}, using port 0")
                self._current_input_id = "0"
                return 0
        except ValueError:
            # Try to find port by name
            for idx, port_name in enumerate(available_inputs):
                if port_name == midi_input_id or midi_input_id in port_name:
                    self._current_input_id = str(idx)
                    return idx
            
            print(f"WARNING: MIDI input port '{midi_input_id}' not found, using port 0")
            self._current_input_id = "0"
            return 0

    def _midi_callback(self, event, data=None) -> None:
        """Handle incoming MIDI messages"""
        message, deltatime = event
        
        if len(message) >= 3:
            command, note, velocity = message[0], message[1], message[2]
            notation_list = [*Note.sharp_notations, *Note.sharp_notations]
            notation = notation_list[note % len(Note.sharp_notations)]
            octave = note // len(Note.sharp_notations) - 1
            
            if command == 144:  # Note on message
                if velocity > 0:
                    self.on_note_down(notation, octave)
                else:
                    self.on_note_up(notation, octave)
            elif command == 128:  # Note off message
                self.on_note_up(notation, octave)

    def send_pitch_bend(self, bend_value: float) -> None:
        """
        Send a pitch bend message.
        
        Args:
            bend_value: Float between -1.0 (full down) and 1.0 (full up), 0 is center
        """
        if self.midi_out:
            # Clamp bend_value to valid range
            bend_value = max(-1.0, min(1.0, bend_value))
            
            # Convert to 14-bit MIDI pitch bend value (0-16383, center is 8192)
            midi_bend = int((bend_value + 1.0) * 8192)
            midi_bend = max(0, min(16383, midi_bend))
            
            # Split into LSB and MSB (7 bits each)
            lsb = midi_bend & 0x7F
            msb = (midi_bend >> 7) & 0x7F
            
            # Determine which channels to send on
            if self._midi_strum_channel is not None:
                channels = [self._midi_strum_channel - 1]
            else:
                channels = list(range(16))
            
            # Send pitch bend messages (0xE0 + channel)
            for channel in channels:
                pitch_bend_message = [0xE0 + channel, lsb, msb]
                self.midi_out.send_message(pitch_bend_message)

    def release_notes(self, notes: List[NoteObject]) -> None:
        """Immediately release specific notes by canceling timers and sending note-offs"""
        if not self.midi_out or not notes:
            return
        
        # Determine which channels to send on
        if self._midi_strum_channel is not None:
            channels = [self._midi_strum_channel - 1]
        else:
            channels = list(range(16))
        
        # Convert notes to MIDI note numbers and release them
        for note in notes:
            midi_note = Note.notation_to_midi(note.notation + str(note.octave))
            note_key = (midi_note, tuple(channels))
            
            # Cancel the timer if it exists
            with self._timer_lock:
                if note_key in self._active_note_timers:
                    timer = self._active_note_timers[note_key]
                    timer.cancel()
                    del self._active_note_timers[note_key]
                if note_key in self._note_start_times:
                    del self._note_start_times[note_key]
            
            # Send note-off messages
            for channel in channels:
                note_off_message = [0x80 + channel, midi_note, 0x40]
                print(f"[MIDI] Sending NOTE_OFF: channel={channel+1}, note={midi_note}")
                self.midi_out.send_message(note_off_message)

    def send_note(self, note: NoteObject, velocity: int, duration: float = 1.5) -> None:
        """Send a MIDI note with non-blocking note-off"""
        if self.midi_out:
            midi_note = Note.notation_to_midi(note.notation + str(note.octave))
            
            # Determine which channels to send on
            if self._midi_strum_channel is not None:
                # Send on specific channel (channels are 1-16, but MIDI uses 0-15)
                channels = [self._midi_strum_channel - 1]
            else:
                # Send on all channels (0-15)
                channels = list(range(16))
            
            # Create unique key for this note+channels combination
            note_key = (midi_note, tuple(channels))
            
            # Cancel any existing timer for this note to prevent premature note-off
            with self._timer_lock:
                if note_key in self._active_note_timers:
                    old_timer = self._active_note_timers[note_key]
                    old_timer.cancel()
                    del self._active_note_timers[note_key]
            
            # Send note-on messages
            for channel in channels:
                note_on_message = [0x90 + channel, midi_note, velocity]
                print(f"[MIDI] Sending NOTE_ON: channel={channel+1}, note={midi_note}, velocity={velocity}")
                self.midi_out.send_message(note_on_message)
            
            # Track when this note started
            with self._timer_lock:
                self._note_start_times[note_key] = time.time()
            
            # Schedule note-off with a timer that can be cancelled
            def send_note_off():
                if self.midi_out:
                    for channel in channels:
                        note_off_message = [0x80 + channel, midi_note, 0x40]
                        self.midi_out.send_message(note_off_message)
                
                # Remove this timer from active timers
                with self._timer_lock:
                    if note_key in self._active_note_timers:
                        del self._active_note_timers[note_key]
                    if note_key in self._note_start_times:
                        del self._note_start_times[note_key]
            
            # Create and store the timer
            timer = threading.Timer(duration, send_note_off)
            timer.daemon = True  # Allow process to exit even if timer is running
            with self._timer_lock:
                self._active_note_timers[note_key] = timer
            timer.start()
    
    def send_raw_note(self, midi_note: int, velocity: int, channel: Optional[int] = None, duration: float = 1.5) -> None:
        """
        Send a raw MIDI note number on a specific channel with non-blocking note-off
        
        Args:
            midi_note: MIDI note number (0-127)
            velocity: MIDI velocity (0-127)
            channel: MIDI channel (1-16), or None to use strum channel or all channels
            duration: Duration in seconds before note-off
        """
        if self.midi_out:
            # Determine which channel to send on
            if channel is not None:
                # Use provided channel (convert 1-16 to 0-15)
                channels = [channel - 1]
            elif self._midi_strum_channel is not None:
                # Use configured strum channel (convert 1-16 to 0-15)
                channels = [self._midi_strum_channel - 1]
            else:
                # Send on all channels (0-15)
                channels = list(range(16))
            
            # Create unique key for this note+channels combination
            note_key = (midi_note, tuple(channels))
            
            # Cancel any existing timer for this note to prevent premature note-off
            with self._timer_lock:
                if note_key in self._active_note_timers:
                    old_timer = self._active_note_timers[note_key]
                    old_timer.cancel()
                    del self._active_note_timers[note_key]
            
            # Send note-on messages
            for ch in channels:
                note_on_message = [0x90 + ch, midi_note, velocity]
                self.midi_out.send_message(note_on_message)
            
            # Track when this note started
            with self._timer_lock:
                self._note_start_times[note_key] = time.time()
            
            # Schedule note-off with a timer that can be cancelled
            def send_note_off():
                if self.midi_out:
                    for ch in channels:
                        note_off_message = [0x80 + ch, midi_note, 0x40]
                        self.midi_out.send_message(note_off_message)
                
                # Remove this timer from active timers
                with self._timer_lock:
                    if note_key in self._active_note_timers:
                        del self._active_note_timers[note_key]
                    if note_key in self._note_start_times:
                        del self._note_start_times[note_key]
            
            timer = threading.Timer(duration, send_note_off)
            timer.daemon = True
            
            # Store timer to allow cancellation
            with self._timer_lock:
                self._active_note_timers[note_key] = timer
            
            timer.start()

    def on_note_down(self, notation: str, octave: int) -> None:
        """Handle note down event"""
        note_str = notation + str(octave)
        if note_str not in self._notes:
            self._notes.append(note_str)
            self._notes = Note.sort(self._notes)
            
            # Emit event with proper event object
            self.emit(
                NOTE_EVENT,
                MidiNoteEvent(
                    notes=self._notes.copy(),
                    added=note_str
                )
            )

    def on_note_up(self, notation: str, octave: int) -> None:
        """Handle note up event"""
        note_str = notation + str(octave)
        if note_str in self._notes:
            self._notes.remove(note_str)
            self._notes = Note.sort(self._notes)
            
            # Emit event with proper event object
            self.emit(
                NOTE_EVENT,
                MidiNoteEvent(
                    notes=self._notes.copy(),
                    removed=note_str
                )
            )

    def choose_input(self, input_id: str) -> None:
        """Choose MIDI input by ID (can be port index or port name)"""
        try:
            if self.midi_in:
                self.midi_in.close_port()
            
            self.midi_in = rtmidi.MidiIn()
            available_inputs = self.midi_in.get_ports()
            
            port_index = self._resolve_input_id(input_id, available_inputs)
            
            self.midi_in.open_port(port_index)
            self.midi_in.set_callback(self._midi_callback)
            
            input_port = available_inputs[port_index]
            
            # Emit connection event
            self.emit(
                CONNECTION_EVENT,
                MidiConnectionEvent(
                    connected=True,
                    input_port=input_port
                )
            )
        except Exception as e:
            print(f"Error choosing MIDI input: {e}")
            self.emit(
                CONNECTION_EVENT,
                MidiConnectionEvent(connected=False)
            )

    def close(self) -> None:
        """Close MIDI connections"""
        # Cancel all active note timers
        with self._timer_lock:
            for timer in self._active_note_timers.values():
                timer.cancel()
            self._active_note_timers.clear()
            self._note_start_times.clear()
        
        if self.midi_out:
            self.midi_out.close_port()
        if self.midi_in:
            self.midi_in.close_port()
        
        # Emit disconnection event
        self.emit(
            CONNECTION_EVENT,
            MidiConnectionEvent(connected=False)
        )

