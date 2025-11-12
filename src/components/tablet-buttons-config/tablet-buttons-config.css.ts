import { css } from 'lit';

export const styles = css`
    :host {
        display: block;
        width: 100%;
    }

    .config-section {
        display: flex;
        flex-direction: column;
        gap: 24px;
    }

    .mode-toggle {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .chord-progression-config {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px;
        background: rgba(255, 255, 255, 0.02);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .helper-text {
        margin: 8px 0 0 0;
        font-size: 0.85em;
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.5;
    }

    .button-grid {
        display: grid;
        grid-template-columns: repeat(8, 1fr);
        gap: 16px;
    }

    .button-config {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.02);
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.08);
    }

    sp-picker {
        width: 100%;
    }

    .param-controls {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 8px;
        margin-top: 8px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.03);
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .param-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    sp-number-field,
    sp-textfield {
        width: 100%;
    }

    sp-field-label {
        color: rgba(255, 255, 255, 0.9);
    }

    /* Responsive: adjust columns on smaller screens */
    @media (max-width: 1800px) {
        .button-grid {
            grid-template-columns: repeat(4, 1fr);
        }
    }

    @media (max-width: 800px) {
        .button-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }

    @media (max-width: 500px) {
        .button-grid {
            grid-template-columns: 1fr;
        }
        
        .param-controls {
            grid-template-columns: 1fr;
        }
    }
`;

