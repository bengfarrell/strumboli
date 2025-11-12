import { css } from 'lit';

export const styles = css`
    :host {
        display: block;
        color: #e9ecef;
    }
    
    .connection-section {
        margin-bottom: 1rem;
    }
    
    .connection-section:last-child {
        margin-bottom: 0;
    }
    
    .connection-section h3 {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        font-weight: 600;
    }
    
    .status-indicator {
        padding: 0.5rem 1rem;
        border-radius: 4px;
        font-weight: 500;
        margin-bottom: 0.5rem;
    }
    
    .status-indicator.connected {
        background: rgba(81, 207, 102, 0.1);
        color: #51cf66;
        border: 1px solid rgba(81, 207, 102, 0.3);
    }
    
    .status-indicator.disconnected {
        background: rgba(250, 82, 82, 0.1);
        color: #fa5252;
        border: 1px solid rgba(250, 82, 82, 0.3);
    }
    
    .device-info {
        margin: 0.5rem 0;
        color: #adb5bd;
    }
    
    .connection-buttons {
        margin-top: 0.75rem;
    }
    
    .log-viewer {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 0.75rem;
        max-height: 300px;
        overflow-y: auto;
        font-family: 'Courier New', monospace;
        font-size: 0.75rem;
        line-height: 1.4;
    }
    
    .log-entry {
        margin-bottom: 0.25rem;
    }
    
    .log-time {
        color: #495057;
    }
    
    .log-category {
        color: #51cf66;
    }
    
    .log-message {
        color: #adb5bd;
    }
    
    .log-empty {
        color: #666;
        font-style: italic;
    }
    
    .log-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    
    .log-header h3 {
        margin: 0;
    }
    
    .button-group {
        display: flex;
        gap: 0.5rem;
    }
    
    /* Live HID Data Styles */
    .hid-section {
        margin-top: 1rem;
    }
    
    .hid-waiting {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 0.75rem;
        color: #6c757d;
        font-family: 'Courier New', monospace;
        font-size: 0.75rem;
    }
    
    .hid-data-container {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 0.75rem;
        margin-bottom: 0.75rem;
        font-family: 'Courier New', monospace;
        font-size: 0.75rem;
    }
    
    .hid-data-title {
        color: #51cf66;
        font-size: 0.7rem;
        margin-bottom: 0.5rem;
        font-weight: 600;
    }
    
    .hid-data-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
    }
    
    .hid-data-column {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.5rem 0.75rem;
    }
    
    .hid-data-label {
        color: #51cf66;
        text-align: right;
    }
    
    .hid-data-value {
        color: #adb5bd;
        font-variant-numeric: tabular-nums;
    }
    
    .hid-buttons-title {
        color: #ffd700;
        font-size: 0.65rem;
        margin-bottom: 0.25rem;
        font-weight: 600;
    }
    
    .hid-button-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.5rem 0.75rem;
    }
    
    .hid-button-label {
        color: #51cf66;
        text-align: right;
    }
    
    .hid-button-indicator {
        color: #6c757d;
    }
    
    .hid-button-indicator.pressed {
        color: #51cf66;
        font-weight: bold;
    }
    
    .hid-no-buttons {
        color: #6c757d;
        font-size: 0.65rem;
    }
    
    /* Raw Bytes Styles */
    .raw-bytes-container {
        background: #1a1a1a;
        border: 1px solid #333;
        border-radius: 4px;
        padding: 0.75rem;
        overflow-x: auto;
    }
    
    .raw-bytes-title {
        color: #51cf66;
        font-family: 'Courier New', monospace;
        font-size: 0.7rem;
        margin-bottom: 0.5rem;
        font-weight: 600;
    }
    
    .raw-bytes-grid {
        display: grid;
        grid-template-columns: repeat(16, 1fr);
        gap: 0.25rem;
        font-family: 'Courier New', monospace;
        font-size: 0.7rem;
    }
    
    .byte-cell {
        display: flex;
        flex-direction: column;
        align-items: center;
    }
    
    .byte-index {
        color: #6c757d;
        font-size: 0.65rem;
    }
    
    .byte-value {
        color: #adb5bd;
        padding: 0.15rem 0.25rem;
        border-radius: 2px;
        min-width: 2rem;
        text-align: center;
    }
    
    .byte-value.unmapped {
        background: #0d0d0d;
    }
    
    .byte-value.mapped {
        background: #1a2a1a;
        border: 1px solid #51cf66;
    }
    
    .byte-label {
        color: #51cf66;
        font-size: 0.55rem;
        margin-top: 0.1rem;
        max-width: 4rem;
        word-wrap: break-word;
        text-align: center;
    }
`;

