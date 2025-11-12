/**
 * HID Device Reader Module
 * Handles reading data from HID devices (e.g., graphics tablets) using WebHID API
 * and processing the raw data according to configuration byte code mappings
 */

import { 
    parseCode, 
    parseRangeData, 
    parseBipolarRangeData, 
    parseMultiByteRangeData, 
    parseBitFlags 
} from '../data-helpers.js';

export interface HIDConfig {
    mappings: Record<string, any>;
    reportId?: number;
}

export type HIDDataCallback = (data: Record<string, string | number | boolean>) => void;
export type WarningCallback = (message: string) => void;

export class HIDReader {
    private device: HIDDevice;
    private config: HIDConfig;
    private dataCallback: HIDDataCallback;
    private isRunning: boolean = false;

    constructor(
        device: HIDDevice,
        config: HIDConfig,
        dataCallback: HIDDataCallback,
        _warningCallback?: WarningCallback
    ) {
        this.device = device;
        this.config = config;
        this.dataCallback = dataCallback;
    }

    /**
     * Process raw device data according to configuration byte code mappings
     */
    processDeviceData(data: Uint8Array): Record<string, string | number | boolean> {
        // Convert Uint8Array to number array
        const dataList = Array.from(data);
        const result: Record<string, string | number | boolean> = {};

        // Check Report ID
        const reportId = dataList.length > 0 ? dataList[0] : 0;
        const isButtonInterface = reportId === 6;  // Report ID 6 is button-only interface

        // Parse the status to determine device state
        let deviceState: string | null = null;
        for (const [key, mapping] of Object.entries(this.config.mappings)) {
            if (mapping.type === 'code') {
                const byteIndex = mapping.byteIndex ?? 0;
                if (byteIndex < dataList.length) {
                    const codeResult = parseCode(dataList, byteIndex, mapping.values ?? []);
                    if (typeof codeResult === 'object' && codeResult !== null) {
                        Object.assign(result, codeResult);
                        deviceState = codeResult.state ?? null;
                    } else {
                        result[key] = codeResult;
                    }
                    break;
                }
            }
        }

        // Process remaining mappings based on device state
        for (const [key, mapping] of Object.entries(this.config.mappings)) {
            const mappingType = mapping.type;
            const byteIndex = mapping.byteIndex ?? 0;

            // Skip if already processed (status/code), unless it's tabletButtons with code type
            if (mappingType === 'code' && key !== 'tabletButtons') {
                continue;
            }

            // Handle tabletButtons with code type (custom value mapping)
            if (key === 'tabletButtons' && mappingType === 'code') {
                // ONLY process button codes from the button interface (Report ID 6)
                if (isButtonInterface) {
                    if (byteIndex < dataList.length) {
                        const byteValue = String(dataList[byteIndex]);
                        const valuesMap = mapping.values ?? {};
                        if (byteValue in valuesMap) {
                            const buttonNum = valuesMap[byteValue].button;
                            if (buttonNum) {
                                // Set only this button as pressed
                                const buttonCount = mapping.buttonCount ?? 8;
                                for (let i = 1; i <= buttonCount; i++) {
                                    result[`button${i}`] = i === buttonNum;
                                }
                            }
                        }
                    }
                }
                continue;
            }

            // Skip button parsing if not in button mode (unless we're on button-only interface)
            if (mappingType === 'bit-flags' && deviceState !== 'buttons' && !isButtonInterface) {
                continue;
            }

            // Skip coordinate/pressure/tilt parsing if on button-only interface or in button mode
            if ((isButtonInterface || deviceState === 'buttons') && 
                ['x', 'y', 'pressure', 'tiltX', 'tiltY'].includes(key)) {
                continue;
            }

            // Skip validation for multi-byte-range as it uses byteIndices instead
            if (mappingType !== 'multi-byte-range' && byteIndex >= dataList.length) {
                continue;
            }

            if (mappingType === 'range') {
                result[key] = parseRangeData(
                    dataList,
                    byteIndex,
                    mapping.min ?? 0,
                    mapping.max ?? 0
                );
            } else if (mappingType === 'multi-byte-range') {
                // Use byteIndex (standardized to always be an array)
                const byteIndices = Array.isArray(byteIndex) ? byteIndex : [byteIndex];
                // Validate all indices are within bounds
                if (byteIndices.every((idx: number) => idx < dataList.length)) {
                    result[key] = parseMultiByteRangeData(
                        dataList,
                        byteIndices,
                        mapping.min ?? 0,
                        mapping.max ?? 0,
                        key  // Pass the key name for debug logging
                    );
                }
            } else if (mappingType === 'bipolar-range') {
                result[key] = parseBipolarRangeData(
                    dataList,
                    byteIndex,
                    mapping.positiveMin ?? 0,
                    mapping.positiveMax ?? 0,
                    mapping.negativeMin ?? 0,
                    mapping.negativeMax ?? 0
                );
            } else if (mappingType === 'bit-flags') {
                const buttonStates = parseBitFlags(
                    dataList,
                    byteIndex,
                    mapping.buttonCount ?? 8
                );
                Object.assign(result, buttonStates);
            }
        }

        return result;
    }

    /**
     * Start reading from the HID device in a loop
     */
    async startReading(): Promise<void> {
        if (!this.device) {
            throw new Error('No device available for reading');
        }

        this.isRunning = true;

        // IMPORTANT: Set up input report listener BEFORE opening
        // This ensures we don't miss any reports
        const inputReportHandler = (event: HIDInputReportEvent) => {
            if (!this.isRunning) return;

            // Only process reports matching our configured reportId
            const expectedReportId = this.config.reportId;
            if (expectedReportId !== undefined && event.reportId !== expectedReportId) {
                return; // Skip reports that don't match
            }

            const { data } = event;
            const dataArray = new Uint8Array(data.buffer);

            // Process the data
            const processedData = this.processDeviceData(dataArray);

            // Call the callback with processed data
            if (this.dataCallback) {
                this.dataCallback(processedData);
            }
        };
        
        this.device.addEventListener('inputreport', inputReportHandler);
        
        // Wait a microtask to ensure listener is registered
        await new Promise(resolve => setTimeout(resolve, 0));

        // NOW open the device (after listener is attached)
        if (!this.device.opened) {
            await this.device.open();
        }
    }

    /**
     * Stop the reading loop
     */
    stop(): void {
        console.log('[HID] Stopping HID reader...');
        this.isRunning = false;
    }

    /**
     * Close the HID device
     */
    async close(): Promise<void> {
        if (this.device && this.device.opened) {
            try {
                console.log('[HID] Closing HID device...');
                await this.device.close();
                console.log('[HID] HID device closed successfully');
            } catch (error) {
                console.error('[HID] Error closing device:', error);
            }
        }
    }
}

