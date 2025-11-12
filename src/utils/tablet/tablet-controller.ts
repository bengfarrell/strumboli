/**
 * Tablet Controller
 * High-level controller for managing tablet connections and processing tablet events.
 * Emits clean, typed events for coordinates, pressure, tilt, and buttons.
 */

import { EventEmitter } from '../event-emitter.js';
import { DeviceFinder, DeviceConnectionResult, DeviceInfo } from './finddevice.js';
import { HIDReader } from './hid-reader.js';

/**
 * Tablet event data structures
 */
export interface TabletCoordinateEvent {
    x: number;
    y: number;
}

export interface TabletPressureEvent {
    pressure: number;
}

export interface TabletTiltEvent {
    tiltX: number;
    tiltY: number;
    tiltXY: number;  // Combined tilt magnitude
}

export interface TabletStylusButtonEvent {
    primaryButton: boolean;
    secondaryButton: boolean;
}

export interface TabletButtonEvent {
    buttonNumber: number;  // 1-indexed button number
    pressed: boolean;
}

export interface TabletConnectionEvent {
    connected: boolean;
    deviceInfo?: DeviceInfo;
}

export interface TabletData {
    x: number;
    y: number;
    pressure: number;
    tiltX: number;
    tiltY: number;
    tiltXY: number;
    primaryButtonPressed: boolean;
    secondaryButtonPressed: boolean;
}

/**
 * Events emitted by TabletController
 */
export interface TabletControllerEvents {
    'connection': TabletConnectionEvent;
    'coordinate': TabletCoordinateEvent;
    'pressure': TabletPressureEvent;
    'tilt': TabletTiltEvent;
    'stylus-button': TabletStylusButtonEvent;
    'tablet-button': TabletButtonEvent;
    'data': TabletData;  // Combined data event
}

export interface TabletControllerConfig {
    mappings: Record<string, any>;
    reportId?: number;
    digitizerUsagePage?: number;
    buttonInterfaceReportId?: number;
    stylusModeStatusByte?: number;
    excludedUsagePages?: number[];
    autoConnect?: boolean; // Enable auto-connect to previously authorized devices
}

/**
 * TabletController - Manages tablet device connection and data processing
 */
export class TabletController extends EventEmitter<TabletControllerEvents> {
    private deviceFinder: DeviceFinder;
    private hidReader: HIDReader | null = null;
    private config: TabletControllerConfig;
    
    private hidDevice: HIDDevice | null = null;
    private allHidDevices: HIDDevice[] = [];
    
    private connected: boolean = false;
    private deviceInfo: DeviceInfo | null = null;
    
    // Device configuration values (with defaults)
    private buttonInterfaceReportId: number;
    private stylusModeStatusByte: number;
    
    // Track button states for detecting changes
    private tabletButtonState: Record<string, boolean> = {};
    private stylusButtonState = {
        primaryButton: false,
        secondaryButton: false
    };
    
    // Keyboard event handler for button events
    private keyboardEventHandler?: (e: KeyboardEvent) => void;

    constructor(config: TabletControllerConfig) {
        super();
        
        this.config = config;
        
        // Store device configuration values
        this.buttonInterfaceReportId = config.buttonInterfaceReportId ?? 6;
        this.stylusModeStatusByte = config.stylusModeStatusByte ?? 0xa0;
        
        // Initialize tablet button state (buttons 1-8)
        for (let i = 1; i <= 8; i++) {
            this.tabletButtonState[`button${i}`] = false;
        }
        
        // Initialize device finder with callbacks and config
        this.deviceFinder = new DeviceFinder(
            (result: DeviceConnectionResult) => this.handleDeviceConnect(result),
            () => this.handleDeviceDisconnect(),
            { 
                digitizerUsagePage: config.digitizerUsagePage,
                excludedUsagePages: config.excludedUsagePages,
                autoConnect: config.autoConnect
            }
        );
    }

    /**
     * Initialize and check for existing devices
     */
    async initialize(): Promise<void> {
        await this.deviceFinder.checkForExistingDevices();
    }

    /**
     * Request user to select and connect a device
     */
    async requestDevice(filters?: HIDDeviceFilter[]): Promise<boolean> {
        const result = await this.deviceFinder.requestDevice(filters);
        return result !== null;
    }

    /**
     * Disconnect from the current device
     */
    async disconnect(): Promise<void> {
        if (this.hidReader) {
            this.hidReader.stop();
            await this.hidReader.close();
            this.hidReader = null;
        }
        
        // Remove keyboard event listener if it exists
        if (this.keyboardEventHandler) {
            window.removeEventListener('keydown', this.keyboardEventHandler);
            this.keyboardEventHandler = undefined;
        }
        
        await this.deviceFinder.disconnect();
    }

    /**
     * Check if a device is currently connected
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * Get current device info
     */
    getDeviceInfo(): DeviceInfo | null {
        return this.deviceInfo;
    }

    /**
     * Handle device disconnect event
     */
    private handleDeviceDisconnect(): void {
        this.connected = false;
        this.deviceInfo = null;
        this.hidReader?.stop();
        this.hidReader = null;
        this.hidDevice = null;
        this.allHidDevices = [];
        
        this.emit('connection', { connected: false });
    }

    /**
     * Handle device connect event
     */
    private async handleDeviceConnect(result: DeviceConnectionResult): Promise<void> {
        this.hidDevice = result.primaryDevice;
        this.allHidDevices = result.allDevices;
        this.deviceInfo = result.deviceInfo;
        
        await this.setupDevice(result.primaryDevice);
    }

    /**
     * Set up the device for reading
     */
    private async setupDevice(_device: HIDDevice): Promise<void> {
        try {
            // Clean up old reader
            if (this.hidReader) {
                this.hidReader.stop();
                await this.hidReader.close();
                this.hidReader = null;
            }
            
            // Ensure we have a valid device
            if (!this.hidDevice) {
                throw new Error('No HID device available');
            }

            // Create HID reader for the primary device
            this.hidReader = new HIDReader(
                this.hidDevice,
                {
                    mappings: this.config.mappings,
                    reportId: this.config.reportId
                },
                (data) => this.handleHIDData(data)
            );

            await this.hidReader.startReading();
            
            // Set up button listeners (HID or keyboard events)
            this.setupButtonListeners();
            
            this.connected = true;
            this.emit('connection', { 
                connected: true, 
                deviceInfo: this.deviceInfo || undefined 
            });

        } catch (error) {
            console.error('[TabletController] Failed to set up device:', error);
            this.connected = false;
            this.deviceInfo = null;
            this.emit('connection', { connected: false });
        }
    }

    /**
     * Set up button listeners (HID or keyboard events based on config)
     */
    private setupButtonListeners(): void {
        // Get button configuration from settings
        const buttonConfig = this.config.mappings.tabletButtons as any;
        const statusConfig = this.config.mappings.status as any;
        
        if (!buttonConfig) {
            console.warn('[TabletController] No tabletButtons configuration found');
            return;
        }
        
        // Check if buttons use keyboard events instead of HID
        if (buttonConfig.type === 'keyboard-events') {
            this.setupKeyboardButtonListeners(buttonConfig);
            return;
        }
        
        // Find the status byte value that indicates "buttons" state
        let buttonModeValue: number | null = null;
        if (statusConfig && statusConfig.values) {
            for (const [byteValue, stateObj] of Object.entries(statusConfig.values)) {
                if ((stateObj as any).state === 'buttons') {
                    buttonModeValue = parseInt(byteValue);
                    break;
                }
            }
        }
        
        for (const dev of this.allHidDevices) {
            if (dev !== this.hidDevice && dev.opened) {

                dev.addEventListener('inputreport', (event: HIDInputReportEvent) => {
                    const data = new Uint8Array(event.data.buffer);
                    
                    // Check if this is the dedicated button interface
                    if (event.reportId === this.buttonInterfaceReportId && buttonConfig.type === 'code') {
                        // Handle code-based button mapping
                        const byteValue = String(data[buttonConfig.byteIndex]);
                        const valuesMap = buttonConfig.values ?? {};
                        
                        if (byteValue in valuesMap) {
                            const buttonNum = valuesMap[byteValue].button;
                            if (buttonNum) {
                                this.handleTabletButtonPress(buttonNum);
                            }
                        }
                        return;
                    }
                    
                    // Check if this reportId contains tablet button data (bit-flags mode)
                    const mainReportId = this.config.reportId ?? 2;
                    if (event.reportId === mainReportId) {
                        // Check if we're in button mode
                        const statusByte = data[statusConfig?.byteIndex || 0];
                        let isButtonMode = buttonModeValue !== null && statusByte === buttonModeValue;
                        
                        // If requiresCleanData is set, also check that position bytes are zero
                        if (isButtonMode && buttonConfig.requiresCleanData && buttonConfig.cleanDataBytes) {
                            for (const byteIndex of buttonConfig.cleanDataBytes) {
                                if (data[byteIndex] !== 0) {
                                    isButtonMode = false;
                                    break;
                                }
                            }
                        }
                        
                        if (isButtonMode) {
                            // Button press detected
                            const buttonBits = data[buttonConfig.byteIndex];
                            
                            // Check each bit for buttons
                            for (let i = 0; i < buttonConfig.buttonCount; i++) {
                                const buttonNum = i + 1;
                                const buttonPressed = (buttonBits & (1 << i)) !== 0;
                                const buttonKey = `button${buttonNum}`;
                                const wasPressed = this.tabletButtonState[buttonKey];
                                
                                if (buttonPressed !== wasPressed) {
                                    this.tabletButtonState[buttonKey] = buttonPressed;
                                    this.emit('tablet-button', { buttonNumber: buttonNum, pressed: buttonPressed });
                                }
                            }
                        } else if (statusByte === this.stylusModeStatusByte) {
                            // Normal stylus mode - clear any pressed buttons
                            for (let i = 1; i <= buttonConfig.buttonCount; i++) {
                                const buttonKey = `button${i}`;
                                if (this.tabletButtonState[buttonKey]) {
                                    this.tabletButtonState[buttonKey] = false;
                                    this.emit('tablet-button', { buttonNumber: i, pressed: false });
                                }
                            }
                        }
                    }
                });
            }
        }
    }

    /**
     * Set up keyboard event listeners for tablet buttons
     */
    private setupKeyboardButtonListeners(buttonConfig: any): void {
        const keyMappings = buttonConfig.keyMappings || {};
        
        // Create keyboard event handler
        this.keyboardEventHandler = (e: KeyboardEvent) => {
            // Check each button mapping
            for (const [buttonNumStr, mapping] of Object.entries(keyMappings)) {
                const buttonNum = parseInt(buttonNumStr);
                const keyMapping = mapping as any;
                
                // Check if this key event matches the mapping
                const keyMatches = e.key === keyMapping.key || e.code === keyMapping.code;
                const ctrlMatches = keyMapping.ctrlKey ? e.ctrlKey : !e.ctrlKey;
                const shiftMatches = keyMapping.shiftKey ? e.shiftKey : !e.shiftKey;
                const altMatches = keyMapping.altKey ? e.altKey : !e.altKey;
                const metaMatches = keyMapping.metaKey ? e.metaKey : !e.metaKey;
                
                if (keyMatches && ctrlMatches && shiftMatches && altMatches && metaMatches) {
                    // Prevent default behavior
                    e.preventDefault();
                    
                    // Mark button as pressed
                    const buttonKey = `button${buttonNum}`;
                    if (!this.tabletButtonState[buttonKey]) {
                        this.tabletButtonState[buttonKey] = true;
                        this.emit('tablet-button', { buttonNumber: buttonNum, pressed: true });
                    }
                    
                    break;
                }
            }
        };
        
        // Add keydown listener
        window.addEventListener('keydown', this.keyboardEventHandler);
        
        // Also handle keyup to release buttons
        window.addEventListener('keyup', (e: KeyboardEvent) => {
            // Check each button mapping
            for (const [buttonNumStr, mapping] of Object.entries(keyMappings)) {
                const buttonNum = parseInt(buttonNumStr);
                const keyMapping = mapping as any;
                
                // Check if this key event matches the mapping
                const keyMatches = e.key === keyMapping.key || e.code === keyMapping.code;
                
                if (keyMatches) {
                    // Mark button as released
                    const buttonKey = `button${buttonNum}`;
                    if (this.tabletButtonState[buttonKey]) {
                        this.tabletButtonState[buttonKey] = false;
                        this.emit('tablet-button', { buttonNumber: buttonNum, pressed: false });
                    }
                    
                    break;
                }
            }
        });
    }

    /**
     * Handle tablet button press (1-indexed button number)
     */
    private handleTabletButtonPress(buttonNum: number): void {
        const buttonKey = `button${buttonNum}`;
        if (!this.tabletButtonState[buttonKey]) {
            this.tabletButtonState[buttonKey] = true;
            this.emit('tablet-button', { buttonNumber: buttonNum, pressed: true });
        }
    }

    /**
     * Process HID data and emit appropriate events
     */
    private handleHIDData(result: Record<string, string | number | boolean>): void {
        // Extract coordinate data
        const x = Number(result.x ?? 0);
        const y = Number(result.y ?? 0);
        
        // Extract pressure
        const pressure = Number(result.pressure ?? 0);
        
        // Extract tilt data
        const tiltX = Number(result.tiltX ?? 0);
        const tiltY = Number(result.tiltY ?? 0);
        
        // Calculate combined tilt magnitude
        const magnitude = Math.sqrt(tiltX * tiltX + tiltY * tiltY);
        const sign = (tiltX * tiltY) >= 0 ? 1 : -1;
        const tiltXY = Math.max(-1.0, Math.min(1.0, magnitude * sign));
        
        // Extract stylus button states
        const primaryPressed = Boolean(result.primaryButtonPressed);
        const secondaryPressed = Boolean(result.secondaryButtonPressed);
        
        // Emit coordinate event
        this.emit('coordinate', { x, y });
        
        // Emit pressure event
        this.emit('pressure', { pressure });
        
        // Emit tilt event
        this.emit('tilt', { tiltX, tiltY, tiltXY });
        
        // Emit stylus button events if changed
        if (primaryPressed !== this.stylusButtonState.primaryButton || 
            secondaryPressed !== this.stylusButtonState.secondaryButton) {
            this.stylusButtonState.primaryButton = primaryPressed;
            this.stylusButtonState.secondaryButton = secondaryPressed;
            this.emit('stylus-button', { 
                primaryButton: primaryPressed, 
                secondaryButton: secondaryPressed 
            });
        }
        
        // Handle tablet buttons from main interface
        for (let i = 1; i <= 8; i++) {
            const buttonKey = `button${i}`;
            const buttonPressed = Boolean(result[buttonKey]);
            const wasPressed = this.tabletButtonState[buttonKey];
            
            if (buttonPressed !== wasPressed) {
                console.log(`[TabletController] Tablet button ${i} ${buttonPressed ? 'pressed' : 'released'} (from main interface)`);
                this.tabletButtonState[buttonKey] = buttonPressed;
                this.emit('tablet-button', { buttonNumber: i, pressed: buttonPressed });
            }
        }
        
        // Emit combined data event
        this.emit('data', {
            x, y, pressure, tiltX, tiltY, tiltXY,
            primaryButtonPressed: primaryPressed,
            secondaryButtonPressed: secondaryPressed
        });
    }

    /**
     * Clean up resources
     */
    async cleanup(): Promise<void> {
        await this.disconnect();
        this.clear(); // Clear all event listeners
    }
}

