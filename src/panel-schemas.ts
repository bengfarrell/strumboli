/**
 * Schema-driven configuration panel system
 * Defines how to render controls for different data types
 */

export type ControlType = 
    | 'number'
    | 'picker'
    | 'checkbox'
    | 'text';

export interface NumberControlSchema {
    type: 'number';
    label: string;
    key: string;
    min?: number;
    max?: number;
    step?: number;
}

export interface PickerControlSchema {
    type: 'picker';
    label: string;
    key: string;
    options: Array<{
        value: string | number;
        label: string;
    }>;
}

export interface CheckboxControlSchema {
    type: 'checkbox';
    label: string;
    key: string;
}

export interface TextControlSchema {
    type: 'text';
    label: string;
    key: string;
}

export type ControlSchema = 
    | NumberControlSchema 
    | PickerControlSchema 
    | CheckboxControlSchema
    | TextControlSchema;

export type CustomComponentType = 
    | 'tablet-visualizer'
    | 'curve-visualizer'
    | 'piano-keys'
    | 'stylus-buttons-config'
    | 'tablet-buttons-config'
    | 'websocket-connection'
    | 'device-connection'
    | 'panel-controls';

export interface CustomComponentConfig {
    type: CustomComponentType;
    props: Record<string, any>;
}

export interface PanelSchema {
    /** Panel ID for tracking */
    id: string;
    /** Display title */
    title: string;
    /** Whether this panel has an active toggle */
    hasActiveControl: boolean;
    /** Panel size in grid */
    size: 'small' | 'medium' | 'large' | 'wide' | 'tall' | 'full';
    /** Controls to render (omit for custom panels) */
    controls?: ControlSchema[];
    /** Whether this is a custom-rendered panel */
    isCustom?: boolean;
    /** Custom component configuration (for custom panels) */
    customComponent?: CustomComponentConfig;
    /** Config key for data binding (for both types) */
    configKey?: string;
}

/**
 * Schema definitions for each configuration panel
 */
export const PANEL_SCHEMAS: Record<string, PanelSchema> = {
    // Panel controls
    'panel-controls': {
        id: 'panel-controls',
        title: 'Panel Controls',
        hasActiveControl: false,
        size: 'full',
        isCustom: true,
        customComponent: {
            type: 'panel-controls',
            props: {}
        }
    },
    
    // WebSocket connection panel
    'websocket-connection': {
        id: 'websocket-connection',
        title: 'Strummer Service',
        hasActiveControl: false,
        size: 'full',
        isCustom: true,
        customComponent: {
            type: 'websocket-connection',
            props: {}
        }
    },
    
    // Device connection panel (for direct mode)
    'device-connection': {
        id: 'device-connection',
        title: 'Device Connection',
        hasActiveControl: false,
        size: 'full',
        isCustom: true,
        customComponent: {
            type: 'device-connection',
            props: {}
        }
    },
    
    // Custom rendered panels
    'drawing-tablet': {
        id: 'drawing-tablet',
        title: 'Drawing Tablet',
        hasActiveControl: false,
        size: 'small',
        isCustom: true,
        customComponent: {
            type: 'tablet-visualizer',
            props: { mode: 'tablet' }
        }
    },
    'pen-tilt': {
        id: 'pen-tilt',
        title: 'Pen Tilt & Pressure',
        hasActiveControl: false,
        size: 'small',
        isCustom: true,
        customComponent: {
            type: 'tablet-visualizer',
            props: { mode: 'tilt' }
        }
    },
    'keyboard': {
        id: 'keyboard',
        title: 'Keyboard',
        hasActiveControl: false,
        size: 'full',
        isCustom: true,
        customComponent: {
            type: 'piano-keys',
            props: { layout: 'C', keys: 20 }
        }
    },
    'note-duration': {
        id: 'note-duration',
        title: 'Note Duration',
        hasActiveControl: false,
        size: 'small',
        isCustom: true,
        configKey: 'noteDuration',
        customComponent: {
            type: 'curve-visualizer',
            props: {
                label: 'Note Duration',
                parameterKey: 'noteDuration',
                outputLabel: 'Value',
                color: '#51cf66'
            }
        }
    },
    'pitch-bend': {
        id: 'pitch-bend',
        title: 'Pitch Bend',
        hasActiveControl: false,
        size: 'small',
        isCustom: true,
        configKey: 'pitchBend',
        customComponent: {
            type: 'curve-visualizer',
            props: {
                label: 'Pitch Bend',
                parameterKey: 'pitchBend',
                outputLabel: 'Value',
                color: '#339af0'
            }
        }
    },
    'note-velocity': {
        id: 'note-velocity',
        title: 'Note Velocity',
        hasActiveControl: false,
        size: 'small',
        isCustom: true,
        configKey: 'noteVelocity',
        customComponent: {
            type: 'curve-visualizer',
            props: {
                label: 'Note Velocity',
                parameterKey: 'noteVelocity',
                outputLabel: 'Value',
                color: '#ff6b6b'
            }
        }
    },
    
    // Schema-driven panels (rendered by config-panel factory)
    'strumming': {
        id: 'strumming',
        title: 'Strumming',
        hasActiveControl: false,
        size: 'small',
        configKey: 'strumming',
        controls: [
            {
                type: 'number',
                label: 'Pluck Velocity Scale',
                key: 'pluckVelocityScale',
                step: 0.1,
                min: 0
            },
            {
                type: 'number',
                label: 'Pressure Threshold',
                key: 'pressureThreshold',
                step: 0.01,
                min: 0,
                max: 1
            },
            {
                type: 'number',
                label: 'MIDI Channel',
                key: 'midiChannel',
                step: 1,
                min: 1,
                max: 16
            },
            {
                type: 'number',
                label: 'Upper Note Spread',
                key: 'upperNoteSpread',
                step: 1,
                min: 0
            },
            {
                type: 'number',
                label: 'Lower Note Spread',
                key: 'lowerNoteSpread',
                step: 1,
                min: 0
            }
        ]
    },
    'note-repeater': {
        id: 'note-repeater',
        title: 'Note Repeater',
        hasActiveControl: true,
        size: 'small',
        configKey: 'noteRepeater',
        controls: [
            {
                type: 'number',
                label: 'Pressure Multiplier',
                key: 'pressureMultiplier',
                step: 0.1,
                min: 0
            },
            {
                type: 'number',
                label: 'Frequency Multiplier',
                key: 'frequencyMultiplier',
                step: 0.1,
                min: 0
            }
        ]
    },
    'transpose': {
        id: 'transpose',
        title: 'Transpose',
        hasActiveControl: true,
        size: 'small',
        configKey: 'transpose',
        controls: [
            {
                type: 'number',
                label: 'Semitones',
                key: 'semitones',
                step: 1,
                min: -24,
                max: 24
            }
        ]
    },
    'stylus-buttons': {
        id: 'stylus-buttons',
        title: 'Stylus Buttons',
        hasActiveControl: true,
        size: 'small',
        configKey: 'stylusButtons',
        isCustom: true,
        customComponent: {
            type: 'stylus-buttons-config',
            props: {}
        }
    },
    'tablet-buttons': {
        id: 'tablet-buttons',
        title: 'Tablet Buttons',
        hasActiveControl: false,
        size: 'full',
        configKey: 'tabletButtons',
        isCustom: true,
        customComponent: {
            type: 'tablet-buttons-config',
            props: {}
        }
    },
    'strum-release': {
        id: 'strum-release',
        title: 'Strum Release',
        hasActiveControl: true,
        size: 'small',
        configKey: 'strumRelease',
        controls: [
            {
                type: 'number',
                label: 'Max Duration',
                key: 'maxDuration',
                step: 0.01,
                min: 0.01,
                max: 5
            },
            {
                type: 'number',
                label: 'Velocity Multiplier',
                key: 'velocityMultiplier',
                step: 0.1,
                min: 0.1,
                max: 10
            },
            {
                type: 'number',
                label: 'MIDI Note',
                key: 'midiNote',
                step: 1,
                min: 0,
                max: 127
            },
            {
                type: 'number',
                label: 'MIDI Channel',
                key: 'midiChannel',
                step: 1,
                min: 1,
                max: 16
            }
        ]
    }
};

