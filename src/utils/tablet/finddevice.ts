/**
 * HID Device Finder Module
 * Handles detection, enumeration, and connection of HID devices
 * Specifically designed for graphics tablets with multiple interfaces
 */

export interface DeviceInfo {
    name: string;
    vendor: number;
    product: number;
}

export interface DeviceConnectionResult {
    primaryDevice: HIDDevice;
    allDevices: HIDDevice[];
    deviceInfo: DeviceInfo;
}

export type DeviceConnectCallback = (result: DeviceConnectionResult) => void;
export type DeviceDisconnectCallback = () => void;

export interface DeviceFinderConfig {
    digitizerUsagePage?: number;
    excludedUsagePages?: number[];
    autoConnect?: boolean; // Enable auto-connect to previously authorized devices
}

export class DeviceFinder {
    private activeDevice: HIDDevice | null = null;
    private allConnectedDevices: HIDDevice[] = [];
    private onConnectCallback?: DeviceConnectCallback;
    private onDisconnectCallback?: DeviceDisconnectCallback;
    private digitizerUsagePage: number;
    private excludedUsagePages: number[];
    private autoConnect: boolean;
    
    constructor(
        onConnect?: DeviceConnectCallback,
        onDisconnect?: DeviceDisconnectCallback,
        config?: DeviceFinderConfig
    ) {
        this.onConnectCallback = onConnect;
        this.onDisconnectCallback = onDisconnect;
        this.digitizerUsagePage = config?.digitizerUsagePage ?? 0x0D;
        this.excludedUsagePages = config?.excludedUsagePages ?? [];
        this.autoConnect = config?.autoConnect ?? true; // Default to true for backward compatibility
        this.setupEventListeners();
    }

    /**
     * Set up global HID event listeners for device connection/disconnection
     */
    private setupEventListeners(): void {
        if (!navigator.hid) {
            console.warn('[DeviceFinder] WebHID not supported');
            return;
        }

        navigator.hid.addEventListener('connect', (event) => {
            console.log('[DeviceFinder] Device connected:', event.device);
        });

        navigator.hid.addEventListener('disconnect', (event) => {
            console.log('[DeviceFinder] Device disconnected:', event.device);
            if (event.device === this.activeDevice) {
                console.log('[DeviceFinder] Active device was disconnected');
                this.activeDevice = null;
                this.allConnectedDevices = [];
                if (this.onDisconnectCallback) {
                    this.onDisconnectCallback();
                }
            }
        });
    }

    /**
     * Check if a device should be excluded based on its usage pages
     */
    private isDeviceExcluded(device: HIDDevice): boolean {
        if (this.excludedUsagePages.length === 0) {
            return false;
        }
        
        // Check if any of the device's collections have an excluded usage page
        return device.collections.some(collection => 
            this.excludedUsagePages.includes(collection.usagePage)
        );
    }

    /**
     * Check for previously authorized HID devices and auto-connect
     * @returns true if a device was found and connected, false otherwise
     */
    async checkForExistingDevices(): Promise<boolean> {
        try {
            if (!navigator.hid) {
                console.error('[DeviceFinder] WebHID not supported');
                return false;
            }

            const devices = await navigator.hid.getDevices();
            if (devices.length === 0) {
                console.log('[DeviceFinder] No previously authorized devices');
                return false;
            }
            
            // Only auto-connect if enabled in config
            if (!this.autoConnect) {
                console.log('[DeviceFinder] Auto-connect disabled - user must click Connect button');
                return false;
            }

            console.log(`[DeviceFinder] Found ${devices.length} previously authorized device interface(s)`);
            
            // Find the digitizer interface
            const digitizerDevice = devices.find(device => {
                return device.collections.some(collection => 
                    collection.usagePage === this.digitizerUsagePage
                );
            });

            const selectedDevice = digitizerDevice || devices[0];
            
            // Find all interfaces from the same tablet (same vendor/product ID)
            const sameTabletDevices = devices.filter(d => 
                d.vendorId === selectedDevice.vendorId && 
                d.productId === selectedDevice.productId
            );
            
            console.log(`[DeviceFinder] Auto-connecting to ${selectedDevice.productName}`);
            
            // Open all interfaces from this tablet
            const result = await this.openDeviceGroup(sameTabletDevices, selectedDevice);
            
            if (result && this.onConnectCallback) {
                this.onConnectCallback(result);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('[DeviceFinder] Error checking for existing devices:', error);
            return false;
        }
    }

    /**
     * Request user to select a HID device and connect to it
     * @param filters Filters for device selection (e.g., vendor ID). If not provided, shows all devices.
     * @returns DeviceConnectionResult if successful, null otherwise
     */
    async requestDevice(filters?: HIDDeviceFilter[]): Promise<DeviceConnectionResult | null> {
        try {
            if (!navigator.hid) {
                throw new Error('WebHID not supported in this browser');
            }

            // Request HID device
            const devices = await navigator.hid.requestDevice({
                filters: filters || []
            });
            
            if (devices.length === 0) {
                return null;
            }

            // Close any previously opened devices first
            await this.disconnectAll();

            // Find the digitizer interface
            const digitizerDevice = devices.find(device => {
                return device.collections.some(collection => 
                    collection.usagePage === this.digitizerUsagePage
                );
            });

            const selectedDevice = digitizerDevice || devices[0];

            // Get all authorized devices (after user selected one)
            if (!navigator.hid) {
                throw new Error('WebHID not supported');
            }
            const allDevices = await navigator.hid.getDevices();
            
            // Find all interfaces from the same tablet (same vendor/product ID)
            const sameTabletDevices = allDevices.filter(d => 
                d.vendorId === selectedDevice.vendorId && 
                d.productId === selectedDevice.productId
            );
            
            // CLAIM ALL INTERFACES from this tablet for exclusive access
            const result = await this.openDeviceGroup(sameTabletDevices, selectedDevice);
            
            if (result && this.onConnectCallback) {
                this.onConnectCallback(result);
            }
            
            return result;

        } catch (error) {
            console.error('[DeviceFinder] Failed to connect HID device:', error);
            return null;
        }
    }

    /**
     * Open all devices in a group for exclusive access
     * @param deviceGroup Array of HID devices to open
     * @param primaryDevice The primary device (digitizer interface)
     * @returns DeviceConnectionResult if successful, null otherwise
     */
    private async openDeviceGroup(
        deviceGroup: HIDDevice[], 
        primaryDevice: HIDDevice
    ): Promise<DeviceConnectionResult | null> {
        try {
            let openCount = 0;
            const openedDevices: HIDDevice[] = [];
            
            for (const device of deviceGroup) {
                // Skip excluded devices
                if (this.isDeviceExcluded(device)) {
                    continue;
                }
                
                // IMPORTANT: Do NOT open the primary device here
                // The HIDReader needs to attach its event listener BEFORE opening
                // to ensure it receives input reports
                if (device === primaryDevice) {
                    openedDevices.push(device);
                    continue;
                }
                
                try {
                    if (!device.opened) {
                        await device.open();
                        openCount++;
                    }
                    openedDevices.push(device);
                } catch (error) {
                    console.error(`[DeviceFinder] Failed to open interface:`, error);
                }
            }

            // Store the connected devices
            this.activeDevice = primaryDevice;
            this.allConnectedDevices = openedDevices;

            // Create device info
            const deviceInfo: DeviceInfo = {
                name: primaryDevice.productName || 'Unknown Device',
                vendor: primaryDevice.vendorId,
                product: primaryDevice.productId
            };

            return {
                primaryDevice,
                allDevices: openedDevices,
                deviceInfo
            };
        } catch (error) {
            console.error('[DeviceFinder] Error opening device group:', error);
            return null;
        }
    }

    /**
     * Disconnect from the currently connected device
     */
    async disconnect(): Promise<void> {
        await this.disconnectAll();
        if (this.onDisconnectCallback) {
            this.onDisconnectCallback();
        }
    }

    /**
     * Close all connected HID devices to release exclusive access
     */
    private async disconnectAll(): Promise<void> {
        for (const device of this.allConnectedDevices) {
            if (device.opened) {
                try {
                    await device.close();
                    console.log(`[DeviceFinder] Closed device interface`);
                } catch (error) {
                    console.error('[DeviceFinder] Error closing device:', error);
                }
            }
        }
        this.allConnectedDevices = [];
        this.activeDevice = null;
    }

    /**
     * Get the currently active device
     */
    getActiveDevice(): HIDDevice | null {
        return this.activeDevice;
    }

    /**
     * Get all connected devices (all interfaces)
     */
    getAllDevices(): HIDDevice[] {
        return this.allConnectedDevices;
    }

    /**
     * Check if a device is currently connected
     */
    isConnected(): boolean {
        return this.activeDevice !== null && this.activeDevice.opened;
    }
}

