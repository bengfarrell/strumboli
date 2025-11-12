/**
 * Direct App styles - reuses the same styles as the main app
 */
import { styles as appStyles } from '../app/app.css.js';
import { css } from 'lit';

export const styles = [
    appStyles,
    css`
        /* Additional styles specific to direct mode */
        .mode-badge {
            font-size: 0.5em;
            background: var(--spectrum-global-color-blue-600);
            padding: 0.2em 0.6em;
            border-radius: 4px;
            margin-left: 0.5em;
            vertical-align: middle;
        }

        .device-connection-content {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            padding: 1rem;
        }

        .connection-section {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }

        .connection-section h3 {
            margin: 0;
            font-size: 1.1rem;
            color: var(--spectrum-global-color-gray-200);
        }

        .status-indicator {
            padding: 0.5rem 1rem;
            border-radius: 4px;
            font-weight: 500;
            text-align: center;
        }

        .status-indicator.connected {
            background: var(--spectrum-global-color-green-700);
            color: var(--spectrum-global-color-gray-50);
        }

        .status-indicator.disconnected {
            background: var(--spectrum-global-color-gray-700);
            color: var(--spectrum-global-color-gray-300);
        }

        .device-info {
            padding: 0.5rem;
            background: var(--spectrum-global-color-gray-800);
            border-radius: 4px;
            text-align: center;
        }

        .connection-buttons {
            display: flex;
            gap: 0.5rem;
            justify-content: center;
        }
    `
];

