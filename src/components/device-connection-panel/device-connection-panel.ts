import { html, LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { LogEntry, Logger } from '../../utils/logger.js';
import { styles } from './device-connection-panel.css.js';

import '@spectrum-web-components/button/sp-button.js';
import '@spectrum-web-components/checkbox/sp-checkbox.js';
import '@spectrum-web-components/field-label/sp-field-label.js';

/**
 * Device Connection Panel Component
 * 
 * Displays MIDI and Tablet connection status, and optionally shows device logs
 */
@customElement('device-connection-panel')
export class DeviceConnectionPanel extends LitElement {
    static styles = styles;
    @property({ type: Boolean })
    midiConnected = false;

    @property({ type: Boolean })
    deviceConnected = false;

    @property({ type: Object })
    deviceInfo: any = null;

    @property({ type: Array })
    logEntries: LogEntry[] = [];

    @property({ type: Boolean })
    showLogs = false;

    @property({ type: Object })
    loggerConfig: any = {};

    @property({ type: Object })
    rawHIDData: any = {};

    @property({ type: Object })
    capabilities: any = null;

    @property({ type: Object })
    mappings: any = null;

    private rawDataUnsubscribe?: () => void;

    connectedCallback() {
        super.connectedCallback();
        
        // Subscribe to HID_RAW logs for live display (values only, capabilities/mappings come from props)
        this.rawDataUnsubscribe = Logger.onLog((entry) => {
            if (entry.category === 'HID_RAW') {
                try {
                    const newData = JSON.parse(entry.message);
                    this.rawHIDData = newData;
                } catch (e) {
                    // If parsing fails, just ignore
                }
            }
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        
        // Unsubscribe from raw data logs
        if (this.rawDataUnsubscribe) {
            this.rawDataUnsubscribe();
        }
    }

    private handleConnect() {
        this.dispatchEvent(new CustomEvent('connect-tablet', {
            bubbles: true,
            composed: true
        }));
    }

    private handleDisconnect() {
        this.dispatchEvent(new CustomEvent('disconnect-tablet', {
            bubbles: true,
            composed: true
        }));
    }

    private handleClearLogs() {
        this.dispatchEvent(new CustomEvent('clear-logs', {
            bubbles: true,
            composed: true
        }));
    }
    
    private handleLoggerConfigChange(updates: Record<string, any>) {
        this.dispatchEvent(new CustomEvent('logger-config-change', {
            detail: updates,
            bubbles: true,
            composed: true
        }));
    }

    render() {
        return html`
            <div class="connection-section">
                <h3>🎹 MIDI Status</h3>
                <div class="status-indicator ${this.midiConnected ? 'connected' : 'disconnected'}">
                    ${this.midiConnected ? '🟢 Connected' : '🔴 Disconnected'}
                </div>
            </div>

            <div class="connection-section">
                <h3>🖊️ Tablet Status</h3>
                <div class="status-indicator ${this.deviceConnected ? 'connected' : 'disconnected'}">
                    ${this.deviceConnected ? '🟢 Connected' : '🔴 Disconnected'}
                </div>
                ${this.deviceInfo ? html`
                    <div class="device-info">
                        <strong>${this.deviceInfo.name}</strong>
                    </div>
                ` : ''}
                
                <div class="connection-buttons">
                    ${!this.deviceConnected ? html`
                        <sp-button 
                            variant="accent" 
                            @click=${this.handleConnect}>
                            Connect Tablet
                        </sp-button>
                    ` : html`
                        <sp-button 
                            variant="secondary" 
                            @click=${this.handleDisconnect}>
                            Disconnect
                        </sp-button>
                    `}
                </div>
            </div>
            
            ${this.deviceConnected ? html`
                <div class="connection-section hid-section">
                    <h3>🔬 Live HID Data</h3>
                    
                    ${!this.capabilities ? html`
                        <div class="hid-waiting">
                            No data yet... (waiting for HID events)
                        </div>
                    ` : html`
                        <!-- Parsed Data with Byte Mapping -->
                        <div class="hid-data-container">
                            <div class="hid-data-title">PARSED DATA</div>
                            <div class="hid-data-grid">
                                <!-- Column 1: Coordinates & Pressure -->
                                <div>
                                    <div class="hid-data-column">
                                        ${(() => {
                                            // Define fixed properties to always show based on capabilities
                                            const properties = ['state', 'x', 'y'];
                                            
                                            if (this.capabilities?.hasPressure) {
                                                properties.push('pressure');
                                            }
                                            if (this.capabilities?.hasTilt) {
                                                properties.push('tiltX', 'tiltY');
                                            }
                                            
                                            return properties.map(key => {
                                                const value = this.rawHIDData.parsed?.[key];
                                                return html`
                                                    <div class="hid-data-label">${key}:</div>
                                                    <div class="hid-data-value">${
                                                        value !== undefined ? (typeof value === 'number' ? value.toFixed(4) : String(value)) : '-'
                                                    }</div>
                                                `;
                                            });
                                        })()}
                                    </div>
                                </div>
                                
                                <!-- Column 2: Button States -->
                                <div>
                                    ${(() => {
                                        const hasButtons = this.capabilities?.hasButtons;
                                        const buttonCount = this.capabilities?.buttonCount || 0;
                                        const hasStylusButtons = this.mappings?.status?.values;
                                        
                                        // Build fixed button list based on capabilities
                                        const buttons: string[] = [];
                                        
                                        // Add stylus buttons if they exist in mappings
                                        if (hasStylusButtons) {
                                            buttons.push('primaryButtonPressed', 'secondaryButtonPressed');
                                        }
                                        
                                        // Add tablet buttons based on buttonCount
                                        if (hasButtons && buttonCount > 0) {
                                            for (let i = 1; i <= buttonCount; i++) {
                                                buttons.push(`button${i}`);
                                            }
                                        }
                                        
                                        return buttons.length > 0 ? html`
                                            <div class="hid-buttons-title">BUTTONS</div>
                                            <div class="hid-button-grid">
                                                ${buttons.map(key => {
                                                    const value = this.rawHIDData.parsed?.[key];
                                                    const isPressed = value === true || value === 'true';
                                                    return html`
                                                        <div class="hid-button-label">${key}:</div>
                                                        <div class="hid-button-indicator ${isPressed ? 'pressed' : ''}">
                                                            ${isPressed ? '●' : '○'}
                                                        </div>
                                                    `;
                                                })}
                                            </div>
                                        ` : html`
                                            <div class="hid-no-buttons">No buttons</div>
                                        `;
                                    })()}
                                </div>
                            </div>
                        </div>
                        
                        <!-- Raw Bytes Table -->
                        <div class="raw-bytes-container">
                            <div class="raw-bytes-title">RAW BYTES</div>
                            <div class="raw-bytes-grid">
                                ${(() => {
                                    // Determine byte count from mappings or use actual data
                                    let maxByteIndex = 8; // Default minimum
                                    if (this.mappings) {
                                        for (const mapping of Object.values(this.mappings)) {
                                            const m = mapping as any;
                                            const byteIndex = Array.isArray(m.byteIndex) ? m.byteIndex : [m.byteIndex];
                                            const max = Math.max(...byteIndex);
                                            if (max > maxByteIndex) maxByteIndex = max;
                                        }
                                    }
                                    const byteCount = Math.max(maxByteIndex + 1, this.rawHIDData.raw?.length || 0);
                                    const bytes = this.rawHIDData.raw || new Array(byteCount).fill(0);
                                    
                                    return bytes.map((byte: number, idx: number) => {
                                    // Find ALL properties that use this byte (a byte can be used by multiple mappings)
                                    // byteIndex is now always an array
                                    const propNames: string[] = [];
                                    if (this.mappings) {
                                        for (const [key, mapping] of Object.entries(this.mappings)) {
                                            const m = mapping as any;
                                            const byteIndex = Array.isArray(m.byteIndex) ? m.byteIndex : [m.byteIndex];
                                            if (byteIndex.includes(idx)) {
                                                propNames.push(key);
                                            }
                                        }
                                    }
                                    
                                        return html`
                                            <div class="byte-cell">
                                                <div class="byte-index">${idx}</div>
                                                <div class="byte-value ${propNames.length > 0 ? 'mapped' : 'unmapped'}">
                                                    ${byte.toString(16).padStart(2, '0').toUpperCase()}
                                                </div>
                                                ${propNames.length > 0 ? html`<div class="byte-label">${propNames.join(', ')}</div>` : ''}
                                            </div>
                                        `;
                                    });
                                })()}
                            </div>
                        </div>
                    `}
                </div>
            ` : ''}
            
            ${this.showLogs ? html`
                <div class="connection-section" style="margin-top: 1rem;">
                    <div class="log-header">
                        <h3>📋 Device Logs</h3>
                        <div class="button-group">
                            <sp-button 
                                size="s"
                                variant="secondary"
                                @click=${this.handleClearLogs}>
                                Clear
                            </sp-button>
                        </div>
                    </div>
                    <div class="log-viewer">
                        ${this.logEntries.length === 0 ? html`
                            <div class="log-empty">No logs yet...</div>
                        ` : this.logEntries.map(entry => {
                            const time = new Date(entry.timestamp).toLocaleTimeString();
                            
                            return html`
                                <div class="log-entry">
                                    <span class="log-time">[${time}]</span>
                                    <span class="log-category">[${entry.category}]</span>
                                    <span class="log-message">${entry.message}</span>
                                </div>
                            `;
                        })}
                    </div>
                    
                    <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #333;">
                        <sp-field-label>Logger Categories</sp-field-label>
                        <div style="display: flex; gap: 1rem; margin-top: 0.5rem; flex-wrap: wrap;">
                            ${Object.entries(this.loggerConfig.categories || {})
                                .filter(([category]) => category !== 'HID_RAW') // HID_RAW is always on, don't show checkbox
                                .map(([category, enabled]) => html`
                                <sp-checkbox 
                                    ?checked=${enabled}
                                    @change=${(e: any) => {
                                        const checked = e.target.checked;
                                        this.handleLoggerConfigChange({ [`logger.categories.${category}`]: checked });
                                        if (checked) {
                                            Logger.enableCategory(category);
                                        } else {
                                            Logger.disableCategory(category);
                                        }
                                    }}>
                                    ${category}
                                </sp-checkbox>
                            `)}
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        'device-connection-panel': DeviceConnectionPanel;
    }
}

