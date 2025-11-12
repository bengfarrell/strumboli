import { html, LitElement } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { styles } from '../app/app.css';

import '@spectrum-web-components/action-button/sp-action-button.js';
import '@spectrum-web-components/number-field/sp-number-field.js';
import '@spectrum-web-components/field-label/sp-field-label.js';
import '@spectrum-web-components/checkbox/sp-checkbox.js';
import '@spectrum-web-components/button/sp-button.js';
import '@spectrum-web-components/picker/sp-picker.js';
import '@spectrum-web-components/menu/sp-menu-item.js';
import '@spectrum-web-components/theme/sp-theme.js';
import '@spectrum-web-components/theme/scale-medium.js';
import '@spectrum-web-components/theme/theme-dark.js';

import '../piano/piano.js';
import { PianoElement } from '../piano/piano.js';
import { NoteObject } from '../../utils/music/note.js';
import '../dashboard-panel/dashboard-panel.js';
import '../tablet-visualizer/tablet-visualizer.js';
import '../curve-visualizer/curve-visualizer.js';
import '../config-panel/config-panel.js';
import '../stylus-buttons-config/stylus-buttons-config.js';
import '../tablet-buttons-config/tablet-buttons-config.js';
import '../device-connection-panel/device-connection-panel.js';
import { sharedSettings, sharedTabletInteraction } from '../../controllers/index.js';
import { panelManager } from '../../utils/panels/panel-manager.js';
import { PanelFactoryContext } from '../../utils/panels/panel-factory.js';

// Import our TypeScript utilities
import { Config } from '../../utils/config.js';
import { Midi } from '../../utils/music/midi.js';
import { TabletController, TabletData } from '../../utils/tablet/index.js';
import { strummer } from '../../utils/music/strummer.js';
import { Actions } from '../../utils/actions.js';
import { applyEffect } from '../../utils/data-helpers.js';
import { transposeNote } from '../../utils/music/note.js';
import { Note } from '../../utils/music/note.js';
import { configureLoggerFromSettings, Logger, LogEntry } from '../../utils/logger.js';
import { CHORD_PROGRESSIONS, loadChordProgressions } from '../../utils/music/chord-progression-state.js';

@customElement('strumboli-direct-app')
export class StrumboliDirectApp extends LitElement {
    static styles = styles;

    @query('piano-keys')
    protected piano?: PianoElement;

    @state()
    protected notes: NoteObject[] = [];

    // Direct API instances
    private config: Config;
    private midi: Midi | null = null;
    private tabletController: TabletController | null = null;
    private actions: Actions | null = null;

    // Settings are now managed by the shared controller
    protected settings = sharedSettings;

    @state()
    protected deviceConnected: boolean = false;

    @state()
    protected midiConnected: boolean = false;

    @state()
    protected deviceInfo: any = null;

    @state()
    protected stringCount: number = 6;

    @state()
    protected lastPluckedString: number | null = null;

    @state()
    protected pressedButtons: Set<number> = new Set();

    @state()
    protected tabletData: {
        x: number;
        y: number;
        pressure: number;
        tiltX: number;
        tiltY: number;
        tiltXY: number;
        primaryButtonPressed: boolean;
        secondaryButtonPressed: boolean;
    } = {
        x: 0,
        y: 0,
        pressure: 0,
        tiltX: 0,
        tiltY: 0,
        tiltXY: 0,
        primaryButtonPressed: false,
        secondaryButtonPressed: false
    };

    // Storage for note repeater feature
    private repeaterState = {
        notes: [] as Array<{ note: NoteObject; velocity: number }>,
        lastRepeatTime: 0,
        isHolding: false,
        intervalId: null as number | null
    };

    // Track button press states to detect button down events
    private buttonState = {
        primaryButtonPressed: false,
        secondaryButtonPressed: false
    };

    // Track tablet button states (buttons 1-8) for UI display
    private tabletButtonState: Record<string, boolean> = {};
    
    // Log entries for panel display
    @state()
    protected logEntries: LogEntry[] = [];
    
    private logUnsubscribe?: () => void;
    private panelManagerUnsubscribe?: () => void;

    constructor() {
        super();
        // Register this component with the settings controller
        sharedSettings.addHost(this);

        // Initialize config
        this.config = new Config();

        // Initialize tablet button state
        for (let i = 1; i <= 8; i++) {
            this.tabletButtonState[`button${i}`] = false;
        }
        
        // Subscribe to panel manager state changes
        this.panelManagerUnsubscribe = panelManager.subscribe(() => {
            this.requestUpdate();
        });
    }

    async connectedCallback() {
        super.connectedCallback();
        
        console.log('🚀 Direct App connected to DOM');
        
        try {
            // Load chord progressions first
            await loadChordProgressions();
            
            // Load settings
            await this.loadSettings('/settings-web.json');
            
            // Subscribe to log events BEFORE initializing devices
            // This ensures we capture all device initialization logs
            this.logUnsubscribe = Logger.onLog((entry) => {
                // Filter out HID_RAW - it's only for live display, not accumulated logs
                if (entry.category === 'HID_RAW') {
                    return;
                }
                
                this.logEntries = [...this.logEntries, entry];
                // Keep only last 100 entries
                if (this.logEntries.length > 100) {
                    this.logEntries = this.logEntries.slice(-100);
                }
                this.requestUpdate();
            });
            
            // Now initialize devices (logs will be captured)
            await this.initializeMIDI();
            await this.initializeTabletController();
            
            console.log('✅ Direct App initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Direct App:', error);
            // Still continue - some features may work
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        
        // Clean up resources
        this.cleanup();
    }

    private cleanup() {
        // Stop note repeater
        if (this.repeaterState.intervalId !== null) {
            window.clearInterval(this.repeaterState.intervalId);
            this.repeaterState.intervalId = null;
        }

        // Clean up tablet controller
        if (this.tabletController) {
            this.tabletController.cleanup();
            this.tabletController = null;
        }

        // Close MIDI
        if (this.midi) {
            this.midi.close();
            this.midi = null;
        }
        
        // Unsubscribe from log events
        if (this.logUnsubscribe) {
            this.logUnsubscribe();
        }
        
        // Unsubscribe from panel manager
        if (this.panelManagerUnsubscribe) {
            this.panelManagerUnsubscribe();
        }
    }

    async loadSettings(url: string) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const settings = await response.json();
                console.log('📋 Loaded settings from', url, settings);
                
                // Check if drawingTablet is a string path to a config file
                const drawingTablet = settings.startupConfiguration?.drawingTablet;
                const drawingTabletConfig = settings.startupConfiguration?.drawingTabletConfig;
                
                // Determine which path to use (prefer drawingTabletConfig, fallback to drawingTablet if it's a string)
                let tabletConfigPath = drawingTabletConfig;
                if (!tabletConfigPath && typeof drawingTablet === 'string' && drawingTablet.includes('.json')) {
                    tabletConfigPath = drawingTablet;
                }
                
                if (tabletConfigPath) {
                    try {
                        console.log(`📋 Loading tablet config from ${tabletConfigPath}...`);
                        const tabletResponse = await fetch(`/${tabletConfigPath}`);
                        if (tabletResponse.ok) {
                            const tabletConfig = await tabletResponse.json();
                            console.log(`✅ Loaded tablet config:`, tabletConfig);
                            
                            // Replace the path string with the actual config object
                            settings.startupConfiguration.drawingTablet = tabletConfig;
                        } else {
                            console.error(`❌ Failed to load tablet config from ${tabletConfigPath}:`, tabletResponse.status);
                        }
                    } catch (error) {
                        console.error('❌ Could not load tablet config:', error);
                    }
                }
                
                // If drawingTablet is still a string (like "auto-detect"), use defaults
                if (typeof settings.startupConfiguration?.drawingTablet === 'string') {
                    console.warn('⚠️  drawingTablet is still a string, using default tablet config');
                    settings.startupConfiguration.drawingTablet = Config.DEFAULTS.startupConfiguration?.drawingTablet;
                }
                
                // Merge with config
                this.config = new Config(settings);
                
                // Configure logger from settings
                const loggerConfig = settings.logger;
                if (loggerConfig) {
                    configureLoggerFromSettings(loggerConfig);
                }
                
                // Load settings into the shared controller
                sharedSettings.loadSettings(settings);
            }
        } catch (error) {
            console.log('Using default configuration');
            // Use default config - convert to settings format
            const configData = this.config.toDict();
            sharedSettings.loadSettings({
                startupConfiguration: {
                    drawingTablet: configData.startupConfiguration?.drawingTablet ?? {},
                    useSocketServer: configData.startupConfiguration?.useSocketServer ?? true,
                    socketServerPort: configData.startupConfiguration?.socketServerPort ?? 8080,
                    midiInputId: configData.startupConfiguration?.midiInputId ?? ''
                },
                noteDuration: configData.noteDuration,
                pitchBend: configData.pitchBend,
                noteVelocity: configData.noteVelocity,
                strumming: configData.strumming,
                noteRepeater: configData.noteRepeater,
                transpose: configData.transpose,
                stylusButtons: configData.stylusButtons,
                tabletButtons: configData.tabletButtons,
                strumRelease: configData.strumRelease
            });
        }
    }

    /**
     * Initialize tablet controller and set up event listeners
     */
    private async initializeTabletController(): Promise<void> {
        try {
            // Create tablet controller with current config
            this.tabletController = new TabletController({
                mappings: this.config.mappings,
                reportId: this.config.reportId,
                digitizerUsagePage: this.config.digitizerUsagePage,
                buttonInterfaceReportId: this.config.buttonInterfaceReportId,
                stylusModeStatusByte: this.config.stylusModeStatusByte,
                excludedUsagePages: this.config.excludedUsagePages,
                autoConnect: true // Enable auto-connect
            });

            // Set up connection event listener
            this.tabletController.on('connection', (event) => {
                this.deviceConnected = event.connected;
                this.deviceInfo = event.deviceInfo || null;
                
                // Update panel minimization via panel manager
                panelManager.setMinimized('device-connection', event.connected);
                
                this.requestUpdate();
            });

            // Set up data event listener - receives processed tablet data
            this.tabletController.on('data', (data: TabletData) => {
                // Update tablet data for visualizers
                this.tabletData = data;
                
                // Update shared tablet interaction controller
                const isPressed = data.pressure > 0;
                sharedTabletInteraction.setTabletPosition(data.x, data.y, isPressed);
                sharedTabletInteraction.setTiltPosition(data.tiltX, data.tiltY, data.pressure, isPressed, data.tiltXY);
                sharedTabletInteraction.setPrimaryButton(data.primaryButtonPressed);
                sharedTabletInteraction.setSecondaryButton(data.secondaryButtonPressed);
                
                // Process the tablet data for strumming and effects
                this.processTabletData(data);
                
                this.requestUpdate();
            });

            // Set up stylus button event listener
            this.tabletController.on('stylus-button', (event) => {
                const stylusButtonsCfg = this.config.get('stylusButtons', {});
                
                // Detect button down events (transition from not pressed to pressed)
                if (event.primaryButton && !this.buttonState.primaryButtonPressed) {
                    const action = stylusButtonsCfg.primaryButtonAction;
                    this.actions?.execute(action, { button: 'Primary' });
                }
                
                if (event.secondaryButton && !this.buttonState.secondaryButtonPressed) {
                    const action = stylusButtonsCfg.secondaryButtonAction;
                    this.actions?.execute(action, { button: 'Secondary' });
                }
                
                // Update button states
                this.buttonState.primaryButtonPressed = event.primaryButton;
                this.buttonState.secondaryButtonPressed = event.secondaryButton;
            });

            // Set up tablet button event listener
            this.tabletController.on('tablet-button', (event) => {
                const buttonIndex = event.buttonNumber - 1; // Convert to 0-indexed
                const buttonKey = `button${event.buttonNumber}`;
                
                // Update button state
                this.tabletButtonState[buttonKey] = event.pressed;
                
                // Update pressed buttons set for UI
                if (event.pressed) {
                    this.pressedButtons = new Set([...this.pressedButtons, buttonIndex]);
                    
                    // Execute action on button press
                    const tabletButtonsCfg = this.config.get('tabletButtons', {});
                    
                    // Check if tabletButtons is a chord progression string
                    if (typeof tabletButtonsCfg === 'string') {
                        // Runtime interpretation: map button number to chord in progression
                        const progressionName = tabletButtonsCfg;
                        
                        if (progressionName in CHORD_PROGRESSIONS) {
                            const chords = CHORD_PROGRESSIONS[progressionName];
                            // Use modulo to wrap around chord list
                            const chordIndex = (event.buttonNumber - 1) % chords.length;
                            const chord = chords[chordIndex];
                            const action: [string, string] = ['set-strum-chord', chord];
                            this.actions?.execute(action, { button: `Tablet${event.buttonNumber}` });
                        }
                    } else {
                        // Individual button configuration
                        const action = tabletButtonsCfg[String(event.buttonNumber)];
                        if (action) {
                            this.actions?.execute(action, { button: `Tablet${event.buttonNumber}` });
                        }
                    }
                } else {
                    // Update UI on button release
                    const newSet = new Set(this.pressedButtons);
                    newSet.delete(buttonIndex);
                    this.pressedButtons = newSet;
                }
                
                this.requestUpdate();
            });

            // Initialize and check for existing devices
            await this.tabletController.initialize();
        } catch (error) {
            // Don't throw - allow app to continue without tablet
            // User can still manually connect
            this.tabletController = null;
        }
    }

    async initializeMIDI() {
        try {
            this.midi = new Midi(this.config.midiStrumChannel);
            
            // Listen for MIDI note events
            this.midi.on('note', (event) => {
                this.updateNotes(event.notes.map(n => Note.parseNotation(n)));
            });

            // Listen for MIDI connection events
            this.midi.on('connection', (event) => {
                this.midiConnected = event.connected;
            });

            // Initialize connection
            await this.midi.refreshConnection(this.config.midiInputId ?? undefined);
            
            // Initialize actions handler
            this.actions = new Actions(this.config);
            
            // Listen for config changes from actions
            this.actions.on('config_changed', () => {
                // Update shared settings - convert to settings format
                const configData = this.config.toDict();
                sharedSettings.loadSettings({
                    startupConfiguration: {
                        drawingTablet: configData.startupConfiguration?.drawingTablet ?? {},
                        useSocketServer: configData.startupConfiguration?.useSocketServer ?? true,
                        socketServerPort: configData.startupConfiguration?.socketServerPort ?? 8080,
                        midiInputId: configData.startupConfiguration?.midiInputId ?? ''
                    },
                    noteDuration: configData.noteDuration,
                    pitchBend: configData.pitchBend,
                    noteVelocity: configData.noteVelocity,
                    strumming: configData.strumming,
                    noteRepeater: configData.noteRepeater,
                    transpose: configData.transpose,
                    stylusButtons: configData.stylusButtons,
                    tabletButtons: configData.tabletButtons,
                    strumRelease: configData.strumRelease
                });
            });
            
            // Configure strummer
            const strummingCfg = this.config.get('strumming', {});
            strummer.configure(
                strummingCfg.pluckVelocityScale ?? 4.0,
                strummingCfg.pressureThreshold ?? 0.1
            );
            
            // Set initial notes
            if (strummingCfg.initialNotes) {
                const initialNotes = strummingCfg.initialNotes.map((n: string) => Note.parseNotation(n));
                strummer.notes = Note.fillNoteSpread(
                    initialNotes,
                    strummingCfg.lowerNoteSpread ?? 0,
                    strummingCfg.upperNoteSpread ?? 0
                );
                this.updateNotesFromStrummer();
            }
            
            // Listen for strummer notes changes
            strummer.on('notes_changed', () => {
                this.updateNotesFromStrummer();
            });
            
        } catch (error) {
            console.error('Failed to initialize MIDI:', error);
        }
    }

    async connectHIDDevice() {
        if (!this.tabletController) {
            // Try to initialize the tablet controller now
            try {
                await this.initializeTabletController();
                
                if (!this.tabletController) {
                    alert('Failed to initialize tablet controller.');
                    return;
                }
            } catch (error) {
                alert('Failed to initialize tablet controller.');
                return;
            }
        }

        try {
            // Build device filters from config
            const filters: HIDDeviceFilter[] = [];
            const filter: HIDDeviceFilter = { vendorId: this.config.vendorId };
            
            // Add product ID if specified in config
            if (this.config.productId) {
                filter.productId = this.config.productId;
            }
            
            filters.push(filter);
            
            await this.tabletController.requestDevice(filters);
        } catch (error) {
            if (error instanceof Error) {
                alert(`Failed to connect tablet: ${error.message}`);
            }
        }
    }

    async disconnectHIDDevice() {
        if (!this.tabletController) {
            return;
        }

        await this.tabletController.disconnect();
    }

    /**
     * Process tablet data for strumming and effects
     * Called by TabletController's data event listener
     */
    private processTabletData(data: TabletData): void {
        const { x, y, pressure, tiltX, tiltY, tiltXY } = data;

        // Create control inputs for effects
        // Normalize tilt values from -1→1 range to 0→1 range for effects
        const controlInputs = {
            yaxis: y,
            pressure: pressure,
            tiltX: (tiltX + 1.0) / 2.0,  // Normalize -1→1 to 0→1
            tiltY: (tiltY + 1.0) / 2.0,  // Normalize -1→1 to 0→1
            tiltXY: (tiltXY + 1.0) / 2.0 // Normalize -1→1 to 0→1
        };

        // Get effect configurations
        const noteDurationCfg = this.config.get('noteDuration', {});
        const noteVelocityCfg = this.config.get('noteVelocity', {});
        const pitchBendCfg = this.config.get('pitchBend', {});

        // Apply effects
        const duration = applyEffect(noteDurationCfg, controlInputs, 'noteDuration');
        const velocity = applyEffect(noteVelocityCfg, controlInputs, 'noteVelocity');
        const bendValue = applyEffect(pitchBendCfg, controlInputs, 'pitchBend');
        
        // Send pitch bend
        if (this.midi) {
            this.midi.sendPitchBend(bendValue);
        }

        // Process strumming
        const strumResult = strummer.strum(x, pressure);

        // Get note repeater configuration
        const noteRepeaterCfg = this.config.get('noteRepeater', {});
        const noteRepeaterEnabled = noteRepeaterCfg.active ?? false;
        const pressureMultiplier = noteRepeaterCfg.pressureMultiplier ?? 1.0;
        const frequencyMultiplier = noteRepeaterCfg.frequencyMultiplier ?? 1.0;

        // Get transpose state
        const transposeEnabled = this.actions?.isTransposeActive() ?? false;
        const transposeSemitones = this.actions?.getTransposeSemitones() ?? 0;

        // Handle strum result
        if (strumResult) {
            if (strumResult.type === 'strum' && strumResult.notes) {
                // Store notes for repeater
                this.repeaterState.notes = strumResult.notes;
                this.repeaterState.isHolding = true;
                this.repeaterState.lastRepeatTime = Date.now();

                // Play notes from strum
                for (const noteData of strumResult.notes) {
                    if (noteData.velocity > 0) {
                        let noteToPlay = noteData.note;
                        if (transposeEnabled) {
                            noteToPlay = transposeNote(noteToPlay, transposeSemitones);
                        }
                        this.midi?.sendNote(noteToPlay, noteData.velocity, duration);

                        // Update last plucked string
                        for (let stringIdx = 0; stringIdx < strummer.notes.length; stringIdx++) {
                            const strummerNote = strummer.notes[stringIdx];
                            if (strummerNote.notation === noteData.note.notation &&
                                strummerNote.octave === noteData.note.octave) {
                                this.lastPluckedString = stringIdx;
                                sharedTabletInteraction.setLastHoveredString(stringIdx);
                                setTimeout(() => {
                                    if (this.lastPluckedString === stringIdx) {
                                        this.lastPluckedString = null;
                                        sharedTabletInteraction.setLastHoveredString(null);
                                    }
                                }, 500);
                                break;
                            }
                        }
                    }
                }
            } else if (strumResult.type === 'release') {
                // Stop holding - no more repeats
                this.repeaterState.isHolding = false;
                this.repeaterState.notes = [];

                // Handle strum release
                const strumReleaseCfg = this.config.get('strumRelease', {});
                const releaseNote = strumReleaseCfg.midiNote;
                const releaseChannel = strumReleaseCfg.midiChannel;
                const releaseMaxDuration = strumReleaseCfg.maxDuration ?? 0.25;
                const releaseVelocityMultiplier = strumReleaseCfg.velocityMultiplier ?? 1.0;

                if (releaseNote !== undefined && duration <= releaseMaxDuration) {
                    const baseVelocity = strumResult.velocity ?? 64;
                    let releaseVelocity = Math.floor(baseVelocity * releaseVelocityMultiplier);
                    releaseVelocity = Math.max(1, Math.min(127, releaseVelocity));
                    this.midi?.sendRawNote(releaseNote, releaseVelocity, releaseChannel, duration);
                }
            }
        }

        // Handle note repeater
        if (noteRepeaterEnabled && this.repeaterState.isHolding && this.repeaterState.notes.length > 0) {
            const currentTime = Date.now();
            const timeSinceLastRepeat = (currentTime - this.repeaterState.lastRepeatTime) / 1000;

            const repeatInterval = frequencyMultiplier > 0 ? duration / frequencyMultiplier : duration;

            if (timeSinceLastRepeat >= repeatInterval) {
                let repeatVelocity = Math.floor(velocity * pressureMultiplier);
                repeatVelocity = Math.max(1, Math.min(127, repeatVelocity));

                for (const noteData of this.repeaterState.notes) {
                    if (repeatVelocity > 0) {
                        let noteToPlay = noteData.note;
                        if (transposeEnabled) {
                            noteToPlay = transposeNote(noteToPlay, transposeSemitones);
                        }
                        this.midi?.sendNote(noteToPlay, repeatVelocity, duration);
                    }
                }

                this.repeaterState.lastRepeatTime = currentTime;
            }
        }
    }

    updateNotesFromStrummer() {
        const notesState = strummer.getNotesState();
        this.updateNotes(notesState.notes);
        this.stringCount = notesState.stringCount;
    }

    handleConfigChange(event: CustomEvent) {
        const detail = event.detail;
        
        console.log('Config change received:', detail);
        
        for (const key in detail) {
            const value = detail[key];
            // Update config
            this.config.set(key, value);
            // Update shared settings
            sharedSettings.updateSettingByPath(key, value);
        }
    }

    private noteToMidiNumber(notation: string, octave: number): number {
        const noteMap: { [key: string]: number } = {
            'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
            'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
            'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
        };
        const noteValue = noteMap[notation] ?? 0;
        return (octave + 1) * 12 + noteValue;
    }

    updateNotes(notes: NoteObject[]) {
        // Clear previous notes on piano
        this.notes.forEach(note => {
            this.piano?.setNoteUp(note.notation, note.octave);
        });

        // Sort notes and update
        this.notes = [...notes].sort((a, b) => {
            const midiA = this.noteToMidiNumber(a.notation, a.octave);
            const midiB = this.noteToMidiNumber(b.notation, b.octave);
            return midiA - midiB;
        });
        
        // Set new notes on piano
        this.notes.forEach(note => {
            this.piano?.setNoteDown(note.notation, note.octave, note.secondary);
        });
        
        this.requestUpdate();
    }

    /**
     * Build context for panel rendering
     */
    private buildPanelContext(): PanelFactoryContext {
        return {
            config: this.config,
            settings: sharedSettings.state,
            midiConnected: this.midiConnected,
            deviceConnected: this.deviceConnected,
            deviceInfo: this.deviceInfo,
            stringCount: this.stringCount,
            notes: this.notes,
            lastPluckedString: this.lastPluckedString,
            pressedButtons: this.pressedButtons,
            tabletData: this.tabletData,
            logEntries: this.logEntries,
            noteDuration: sharedSettings.state.noteDuration,
            pitchBend: sharedSettings.state.pitchBend,
            noteVelocity: sharedSettings.state.noteVelocity,
            panelVisibility: panelManager.getVisibility(),
            panelCategories: panelManager.categories,
            handleConfigChange: (e: CustomEvent) => this.handleConfigChange(e),
            togglePanelVisibility: (id: string) => panelManager.toggleVisibility(id),
            connectHIDDevice: () => this.connectHIDDevice(),
            disconnectHIDDevice: () => this.disconnectHIDDevice(),
            clearLogs: () => { this.logEntries = []; }
        };
    }

    private renderHeader() {
        return html`
            <div class="app-header">
                <img src="/assets/logo.svg">
                <h1>Strumboli <span class="mode-badge">Direct Mode</span></h1>
            </div>
        `;
    }

    render() {
        const context = this.buildPanelContext();
        
        return html`<sp-theme system="spectrum" color="dark" scale="medium">
            ${this.renderHeader()}
            <div class="dashboard-grid">
                ${panelManager.renderPanels(context)}
            </div>
        </sp-theme>`
    }
}

