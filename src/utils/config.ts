/**
 * Configuration management for MIDI Strummer
 * Provides hard-coded defaults that can be overridden by JSON settings
 */

export interface ConfigData {
    startupConfiguration?: {
        drawingTablet?: any;
        useSocketServer?: boolean;
        socketServerPort?: number;
        midiInputId?: string | null;
    };
    noteDuration?: any;
    pitchBend?: any;
    noteVelocity?: any;
    strumming?: any;
    noteRepeater?: any;
    transpose?: any;
    stylusButtons?: any;
    strumRelease?: any;
    tabletButtons?: any;
    [key: string]: any;
}

export class Config {
    private _config: ConfigData;

    // Default configuration values
    static readonly DEFAULTS: ConfigData = {
        startupConfiguration: {
            drawingTablet: "auto-detect", // Should be loaded from driver JSON
            useSocketServer: true,
            socketServerPort: 8080,
            midiInputId: null
        },
        noteDuration: {
            min: 0.15,
            max: 1.5,
            multiplier: 1.0,
            curve: 1.0,
            spread: "inverse",
            control: "tiltXY",
            default: 1.0
        },
        pitchBend: {
            min: -1.0,
            max: 1.0,
            multiplier: 1.0,
            curve: 4.0,
            spread: "central",
            control: "yaxis",
            default: 0.0
        },
        noteVelocity: {
            min: 0,
            max: 127,
            multiplier: 1.0,
            curve: 4.0,
            spread: "direct",
            control: "pressure",
            default: 64
        },
        strumming: {
            pluckVelocityScale: 4.0,
            pressureThreshold: 0.1,
            midiChannel: null,
            initialNotes: ["C4", "E4", "G4"],
            upperNoteSpread: 3,
            lowerNoteSpread: 3
        },
        noteRepeater: {
            active: false,
            pressureMultiplier: 1.0,
            frequencyMultiplier: 1.0
        },
        transpose: {
            active: false,
            semitones: 12
        },
        stylusButtons: {
            active: true,
            primaryButtonAction: "toggle-transpose",
            secondaryButtonAction: "toggle-repeater"
        },
        strumRelease: {
            active: false,
            midiNote: 38,
            midiChannel: null,
            maxDuration: 0.25,
            velocityMultiplier: 1.0
        },
        logger: {
            enabled: true,
            alsoLogToConsole: false,
            categories: {
                MIDI: true,
                DeviceFinder: true,
                TabletController: true,
                HID: true
            }
        }
    };

    constructor(configDict?: ConfigData) {
        // Merge with defaults
        this._config = this.deepMerge(JSON.parse(JSON.stringify(Config.DEFAULTS)), configDict || {});
    }

    /**
     * Deep merge two objects, with override taking precedence
     */
    private deepMerge(base: any, override: any): any {
        const result = { ...base };

        for (const key in override) {
            if (key in result && typeof result[key] === 'object' && typeof override[key] === 'object' && 
                !Array.isArray(result[key]) && !Array.isArray(override[key])) {
                // Recursively merge nested objects
                result[key] = this.deepMerge(result[key], override[key]);
            } else {
                // Override the value
                result[key] = override[key];
            }
        }

        return result;
    }

    /**
     * Get a configuration value by key
     */
    get(key: string, defaultValue?: any): any {
        return this._config[key] ?? defaultValue;
    }

    /**
     * Set a configuration value using dot notation
     */
    set(key: string, value: any): void {
        if (key.includes('.')) {
            const keys = key.split('.');
            let target: any = this._config;
            
            // Navigate to the nested object
            for (let i = 0; i < keys.length - 1; i++) {
                const k = keys[i];
                if (!(k in target)) {
                    target[k] = {};
                }
                target = target[k];
            }
            
            // Set the final value
            target[keys[keys.length - 1]] = value;
        } else {
            // Direct key update
            this._config[key] = value;
        }
    }

    /**
     * Get the full configuration as an object
     */
    toDict(): ConfigData {
        return JSON.parse(JSON.stringify(this._config));
    }

    /**
     * Convenience properties for common config values
     */
    get device(): any {
        return this._config.startupConfiguration?.drawingTablet ?? {};
    }

    get useSocketServer(): boolean {
        return this._config.startupConfiguration?.useSocketServer ?? true;
    }

    get socketServerPort(): number {
        return this._config.startupConfiguration?.socketServerPort ?? 8080;
    }

    get midiInputId(): string | null {
        return this._config.startupConfiguration?.midiInputId ?? null;
    }

    get midiStrumChannel(): number | null {
        return this._config.strumming?.midiChannel ?? null;
    }

    get initialNotes(): string[] {
        return this._config.strumming?.initialNotes ?? ["C4", "E4", "G4"];
    }

    get upperNoteSpread(): number {
        return this._config.strumming?.upperNoteSpread ?? 3;
    }

    get lowerNoteSpread(): number {
        return this._config.strumming?.lowerNoteSpread ?? 3;
    }

    get noteDuration(): any {
        return this._config.noteDuration ?? {};
    }

    get pitchBend(): any {
        return this._config.pitchBend ?? {};
    }

    get noteVelocity(): any {
        return this._config.noteVelocity ?? {};
    }

    get mappings(): Record<string, any> {
        return this._config.startupConfiguration?.drawingTablet?.byteCodeMappings ?? {};
    }

    get capabilities(): any {
        return this._config.startupConfiguration?.drawingTablet?.capabilities ?? {};
    }

    get reportId(): number {
        return this._config.startupConfiguration?.drawingTablet?.reportId ?? 2;
    }

    get digitizerUsagePage(): number {
        return this._config.startupConfiguration?.drawingTablet?.digitizerUsagePage ?? 0x0D;
    }

    get buttonInterfaceReportId(): number {
        return this._config.startupConfiguration?.drawingTablet?.buttonInterfaceReportId ?? 6;
    }

    get stylusModeStatusByte(): number {
        return this._config.startupConfiguration?.drawingTablet?.stylusModeStatusByte ?? 0xa0;
    }

    get excludedUsagePages(): number[] {
        return this._config.startupConfiguration?.drawingTablet?.excludedUsagePages ?? [];
    }

    get vendorId(): number {
        return this._config.startupConfiguration?.drawingTablet?.vendorId ?? 0x28bd;
    }

    get productId(): number | undefined {
        return this._config.startupConfiguration?.drawingTablet?.productId;
    }
}

